import { materialize } from "./model.mjs";
import { createLongStore } from "./long-store.mjs";
import { createAppearanceStore } from './appearance-store.mjs';
const bridge = window.native;
export const bridgeMetrics = { calls: 0, readBytes: 0, httpBytes: 0 };
export const call = async (method, ...args) => {
  bridgeMetrics.calls++;
  try {
    const result = await bridge.invoke(method, args);
    if (method === 'read') bridgeMetrics.readBytes += Math.floor((result?.length || 0) * 3 / 4);
    if (method === 'readBatch') bridgeMetrics.readBytes += Object.values(result).reduce((n,s)=>n+Math.floor(s.length*3/4),0);
    if (method === 'http') bridgeMetrics.httpBytes += Math.floor(((result?.body?.length || 0) + (args[0]?.body?.length || 0))*3/4);
    return result;
  } catch (e) {
    if (e.message.includes("ENOENT")) e.code = "ENOENT";
    throw e;
  }
};
export const bytesTo64 = (b) => {
  let s = "";
  for (let i = 0; i < b.length; i += 8192)
    s += String.fromCharCode(...b.subarray(i, i + 8192));
  return btoa(s);
};
export const from64 = (s) => Uint8Array.from(atob(s), (x) => x.charCodeAt(0));
export const fs = {
  promises: {
    readFile: async (p, opts) => {
      const b = from64(await call("read", p));
      return typeof opts === "string" || opts?.encoding
        ? new TextDecoder().decode(b)
        : b;
    },
    writeFile: async (p, data) =>
      call(
        "write",
        p,
        bytesTo64(
          typeof data === "string" ? new TextEncoder().encode(data) : data,
        ),
      ),
    mkdir: async (p) => call("mkdir", p),
    readdir: async (p) => call("list", p),
    unlink: async (p) => call("unlink", p),
    rmdir: async (p) => call("rmdir", p),
    stat: async (p) => stat(p),
    lstat: async (p) => stat(p),
    readlink: async () => {
      throw Error("Symlinks unsupported");
    },
    symlink: async () => {
      throw Error("Symlinks unsupported");
    },
    chmod: async () => {},
  },
};
async function stat(p) {
  const s = await call("stat", p);
  return {
    ...s,
    isFile: () => !s.directory,
    isDirectory: () => s.directory,
    isSymbolicLink: () => false,
  };
}
export let operations = [];
let frozen = false;
let writes = 0;
export const hasActiveWrites = () => writes > 0;
export const freeze = (value) => {
  frozen = value;
};
const appearanceStore=createAppearanceStore({
  read:p=>fs.promises.readFile(p,'utf8'), write:(p,v)=>fs.promises.writeFile(p,v),
  list:p=>fs.promises.readdir(p), mkdir:p=>fs.promises.mkdir(p),
});
export const cloudPersona=()=>appearanceStore.read();
export async function saveCloudPersona(value) {
  if(frozen) throw Error('同步中，请完成后再保存');
  writes++;
  try { await appearanceStore.save(value); } finally { writes--; }
}
const longStore = createLongStore({
  readJson: async (path) =>
    JSON.parse(new TextDecoder().decode(from64(await call("read", path)))),
  writeJson: async (path, data) =>
    call(
      "write",
      path,
      bytesTo64(new TextEncoder().encode(JSON.stringify(data))),
    ),
  list: (path) => call("list", path),
  mkdir: (path) => call("mkdir", path),
});
export const records = () => [
  ...materialize(operations),
  ...longStore.records(),
];
export const longRecords = () => longStore.records();
export const loadLongTrash = () => longStore.loadTrash();
export async function exportBackup() {
  return {
    format: "j-schedule-v2",
    operations,
    longTodoHeads: await longStore.exportHeads(),
  };
}
function validate(o) {
  if (
    !o ||
    !/^[a-zA-Z0-9-]+$/.test(o.id) ||
    typeof o.itemId !== "string" ||
    !Array.isArray(o.parents) ||
    !o.parents.every((x) => typeof x === "string") ||
    typeof o.at !== "string" ||
    !o.item ||
    typeof o.item.title !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(o.item.date)
  )
    throw Error("事项数据格式不正确");
  if (
    o.item.start &&
    (!/^([01]\d|2[0-3]):[0-5]\d$/.test(o.item.start) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(o.item.end) ||
      o.item.end <= o.item.start)
  )
    throw Error("日程时间格式不正确");
}
export async function load() {
  await call('mkdir','/repo/preferences');
  await call("mkdir", "/repo/ops");
  const next = [];
  const names = (await call('list','/repo/ops')).filter(f=>f.endsWith('.json'));
  // Bound each bridge response; old hosts/tests retain the single-read fallback.
  let batchSupported = false;
  try { batchSupported = !!(await call('capabilities'))?.readBatch; } catch {}
  for (let offset=0; offset<names.length; offset+=32) {
    const group=names.slice(offset,offset+32);
    const batch=batchSupported ? await call('readBatch',group.map(f=>'/repo/ops/'+f)) : null;
    for (const f of group) {
      try {
        const o = JSON.parse(
          new TextDecoder().decode(
            from64(batch ? batch['/repo/ops/'+f] : await call("read", "/repo/ops/" + f)),
          ),
        );
        validate(o);
        next.push(o);
      } catch (e) {
        throw Error("数据文件损坏：" + f + " " + e.message);
      }
    }
  }
  operations = next;
  await longStore.load();
}
export async function save(item, previous, deleted = false) {
  const result=await persistItem(item,previous,deleted);
  const effect=deleted?null:item.done&&!previous?.item.done?'celebrate':!previous&&!item.done&&['todo','longtodo'].includes(item.kind)?'added':null;
  if(typeof window.dispatchEvent==='function'&&typeof CustomEvent==='function')window.dispatchEvent(new CustomEvent('item-saved',{detail:{effect}}));
  return result;
}
async function persistItem(item, previous, deleted = false) {
  if (frozen) throw Error("同步中，请完成后再保存");
  writes++;
  try {
    if (item.kind === "longtodo")
      return await longStore.save(item, previous, deleted);
    const id = crypto.randomUUID();
    const op = {
      id,
      itemId: previous?.id || crypto.randomUUID(),
      parents: previous?.versions.map((x) => x.id) || [],
      at: new Date().toISOString(),
      item: deleted ? {title:'已删除',kind:item.kind||'todo',date:'1970-01-01',start:'',end:''} : item,
      deleted,
    };
    await call(
      "write",
      "/repo/ops/" + id + ".json",
      bytesTo64(new TextEncoder().encode(JSON.stringify(op))),
    );
    operations.push(op);
    return op;
  } finally {
    writes--;
  }
}
export async function importLongHeads(list) {
  if (frozen) throw Error("同步中，请完成后再导入");
  writes++;
  try {
    await longStore.importHeads(list);
  } finally {
    writes--;
  }
}
export async function importOps(list) {
  if (frozen) throw Error("同步中，请完成后再导入");
  writes++;
  try {
    for (const o of list) validate(o);
    for (const o of list) {
      if (!operations.some((x) => x.id === o.id)) {
        await call(
          "write",
          "/repo/ops/" + o.id + ".json",
          bytesTo64(new TextEncoder().encode(JSON.stringify(o))),
        );
        operations.push(o);
      }
    }
  } finally {
    writes--;
  }
}
