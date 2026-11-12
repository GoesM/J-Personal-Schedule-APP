import git from "isomorphic-git";
import { fs, call, bytesTo64, from64, load, freeze, bridgeMetrics } from "./store.mjs";
let busy = false;
const dir = "/repo";
/** Read-only/offline exit check: dirty worktree/index OR commits absent on origin.
 * Push updates origin tracking refs; pull-only never counts as an upload.
 */
export async function hasPendingChanges(settings) {
  if (busy) throw Error("正在同步，请稍候");
  let initialized;
  try {
    initialized = (await fs.promises.stat(dir + "/.git")).isDirectory();
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    initialized = false;
  }
  if (!initialized)
    return (
      (await fs.promises.readdir(dir + "/preferences")).some(n=>n.endsWith('.json')) ||
      (await fs.promises.readdir(dir + "/longtodo")).length > 0 ||
      (await fs.promises.readdir(dir + "/ops")).some((n) => n.endsWith(".json"))
    );
  const matrix = await git.statusMatrix({ fs, dir });
  if (matrix.some(([, h, w, s]) => h !== w || h !== s)) return true;
  let head;
  try {
    head = await git.resolveRef({ fs, dir, ref: "HEAD" });
  } catch (e) {
    if (e.code === "NotFoundError") return false;
    throw e;
  }
  let remote;
  try {
    remote = await git.resolveRef({
      fs,
      dir,
      ref: "refs/remotes/origin/" + (settings.branch || "main"),
    });
  } catch (e) {
    if (e.code === "NotFoundError") return true;
    throw e;
  }
  if (head === remote) return false;
  return !(await git.isDescendent({ fs, dir, oid: remote, ancestor: head }));
}
const http = {
  request: async ({ url, method, headers, body }) => {
    const chunks = [];
    if (body) for await (const c of body) chunks.push(c);
    const length = chunks.reduce((a, b) => a + b.length, 0),
      data = new Uint8Array(length);
    let offset = 0;
    for (const c of chunks) {
      data.set(c, offset);
      offset += c.length;
    }
    const r = await call("http", {
      url,
      method,
      headers,
      body: bytesTo64(data),
    });
    return { ...r, body: [from64(r.body)] };
  },
};
export async function synchronize(settings, push = true) {
  if (busy) throw Error("正在同步，请稍候");
  if (!settings.url) throw Error("请先在设置中填写仓库地址");
  if (!/^https:\/\/[^\s/@]+\//.test(settings.url))
    throw Error("仅支持不含凭据的 HTTPS 仓库地址");
  busy = true;
  freeze(true);
  const started=performance.now(), baseline={...bridgeMetrics};
  const report={stages:{}, ok:false, unchanged:false};
  let stage='检查本地更改', stageAt=started;
  function progress(next) {
    report.stages[stage]=(report.stages[stage]||0)+Math.round(performance.now()-stageAt);
    stage=next; stageAt=performance.now();
    if(typeof CustomEvent !== 'undefined') window.dispatchEvent?.(new CustomEvent('sync-progress',{detail:next}));
  }
  // Per-operation cache is discarded after each sync and never crosses profiles.
  const cache={};
  const cached = Object.fromEntries(Object.entries(git).map(([name,fn])=>[name,typeof fn==='function' ? (args)=>fn({...args,cache}) : fn]));
  try {
    const auth = () => ({
      username: settings.user || "GoesM",
      password: settings.token || "",
    });
    const common = { fs, http, dir, url: settings.url, onAuth: auth };
    // Complete an interrupted checkout before considering an unchanged fast path.
    let recovery=false;
    try { recovery=(await fs.promises.readFile('/sync-checkout','utf8'))==='pending'; }
    catch(e) { if(e.code!=='ENOENT') throw e; }
    if(recovery) {
      // Never force: edits made after a failure must not be overwritten.
      await cached.checkout({fs,dir,ref:settings.branch||'main'});
      await load();
      await fs.promises.writeFile('/sync-checkout','done');
    }
    let exists = true;
    try {
      await fs.promises.stat("/repo/.git");
    } catch {
      exists = false;
    }
    if (!exists) {
      await git.init({ fs, dir, defaultBranch: settings.branch || "main" });
      await git.addRemote({ fs, dir, remote: "origin", url: settings.url });
    }
    if (!(await fs.promises.readdir("/repo/ops")).length) {
      await fs.promises.writeFile("/repo/FORMAT", "j-schedule-v1\n");
      await git.add({ fs, dir, filepath: "FORMAT" });
    }
    const oldUrl = await git.getConfig({ fs, dir, path: "remote.origin.url" });
    if (oldUrl !== settings.url)
      throw Error(
        "本地数据已绑定另一仓库。请导出备份，在新设备配置新仓库，避免混合历史。",
      );
    const branch = await git.currentBranch({ fs, dir });
    if (branch !== (settings.branch || "main"))
      throw Error("此数据目录的分支为 " + branch + "，请恢复设置中的分支");
    const matrix = await cached.statusMatrix({ fs, dir });
    const dirty = matrix.some(([, h, w, s]) => h !== w || h !== s);
    const author = {
      name: settings.user || "J用户",
      email: "schedule@local.invalid",
    };
    if (dirty) {
      await cached.add({fs,dir,filepath:'ops'});
      await cached.add({fs,dir,filepath:'longtodo'});
      await cached.add({fs,dir,filepath:'preferences'});
      await cached.commit({
        fs,
        dir,
        message: "保存日程 " + new Date().toISOString(),
        author,
      });
    }
    progress('查询云端版本');
    const refs = await git.listServerRefs({ ...common, prefix: "refs/heads/" });
    let before;
    try { before=await cached.resolveRef({fs,dir,ref:'HEAD'}); } catch(e) { if(e.code!=='NotFoundError') throw e; }
    const advertised=refs.find(x=>x.ref==='refs/heads/'+branch)?.oid;
    // Still scan local state on every sync, including cold start/crash recovery.
    // Only skip network transfer/checkout/reload when the server confirms HEAD.
    if (before && advertised===before) {
      await cached.writeRef({fs,dir,ref:'refs/remotes/origin/'+branch,value:before,force:true});
      report.unchanged=true; report.ok=true;
      return '已是最新，无需传输';
    }
    let checkedOut=false;
    if (refs.some((x) => x.ref === "refs/heads/" + branch)) {
      progress('下载远端更改');
      await cached.fetch({ ...common, ref: branch, singleBranch: true });
      let head;
      try {
        head = await git.resolveRef({ fs, dir, ref: "HEAD" });
      } catch {}
      if (head) {
        progress('合并远端更改');
        await fs.promises.writeFile('/sync-checkout','pending');
        await cached.merge({
          fs,
          dir,
          ours: branch,
          theirs: "origin/" + branch,
          author,
          allowUnrelatedHistories: true,
        });
      } else {
        await fs.promises.writeFile('/sync-checkout','pending');
        await git.writeRef({
          fs,
          dir,
          ref: "refs/heads/" + branch,
          value: await git.resolveRef({ fs, dir, ref: "origin/" + branch }),
        });
      }
      const after=await cached.resolveRef({fs,dir,ref:'HEAD'});
      if(after!==before) {
        progress('应用更新');
        await cached.checkout({ fs, dir, ref: branch });
        checkedOut=true;
      }
    } else if (refs.length)
      throw Error("远端不存在目标分支，请在设置中填写已有分支");
    if(checkedOut) { progress('加载更新的日程'); await load(); }
    await fs.promises.writeFile('/sync-checkout','done');
    if (push) { progress('上传本地更改'); await cached.push({ ...common, remote: "origin", ref: branch }); }
    report.ok=true;
    return push ? "同步完成" : "已拉取远端数据";
  } catch (e) {
    throw Error("同步未完成，本地数据保留。" + e.message);
  } finally {
    progress('完成');
    report.totalMs=Math.round(performance.now()-started);
    report.bridge=Object.fromEntries(Object.keys(baseline).map(k=>[k,bridgeMetrics[k]-baseline[k]]));
    // Numbers and stage names only: no URLs, credentials or item contents.
    try { localStorage.setItem('last-sync-performance',JSON.stringify(report)); } catch {}
    if(typeof CustomEvent !== 'undefined') window.dispatchEvent?.(new CustomEvent('sync-report',{detail:report}));
    busy = false;
    freeze(false);
  }
}
