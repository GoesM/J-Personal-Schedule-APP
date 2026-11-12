const {
  app,
  BrowserWindow,
  ipcMain,
  safeStorage,
  dialog,
  shell,
} = require("electron");
const fs = require("fs/promises"),
  path = require("path");
let win, root, profile,petHost;
// Native Wayland restricts global positioning. Prefer XWayland when available.
if(process.platform==='linux'&&process.env.WAYLAND_DISPLAY&&process.env.DISPLAY&&!app.commandLine.hasSwitch('ozone-platform'))app.commandLine.appendSwitch('ozone-platform','x11');
// Public product name can change; the established profile location must not.
app.setPath('userData', path.join(app.getPath('appData'),'j-personal-schedule'));
let appearanceManager;
let allowExit = false,
  rendererReady = false,
  fallbackClosing = false;
const exitSmoke = process.argv.includes("--exit-smoke-test");
const petSmoke=process.argv.includes('--pet-smoke-test')||process.argv.includes('--pet-self-test');
const smoke = process.argv.includes("--smoke-test") || exitSmoke || petSmoke;
if(smoke)app.setPath('userData',require('node:fs').mkdtempSync(path.join(require('node:os').tmpdir(),'jcalendar-runtime-')));
if(petSmoke)app.disableHardwareAcceleration();
let testCloseRequested = false,
  testPromptReceived = false;
async function requestFullExit(){
  if(rendererReady&&win&&!win.webContents.isDestroyed()&&!win.webContents.isCrashed()){
    if(!smoke){win.show();win.focus();}win.webContents.send('request-exit');return;
  }
  if(fallbackClosing)return;fallbackClosing=true;
  try{const {response}=await dialog.showMessageBox(win,{type:'warning',title:'退出程序',message:'暂时无法检查同步状态。是否直接退出？本地已保存的数据会保留。',buttons:['取消退出','直接退出'],defaultId:0,cancelId:0});
    if(response===1){allowExit=true;if(petHost){await petHost.dispose();petHost=null;}win.close();}
  }finally{fallbackClosing=false;}
}
if (!smoke) {
  if (!app.requestSingleInstanceLock()) app.quit();
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });
}
const { createHash, randomUUID } = require("crypto");
function profileFor(settings) {
  return path.join(
    root,
    "profiles",
    settings.url
      ? createHash("sha256")
          .update(settings.url + "\n" + (settings.branch || "main"))
          .digest("hex")
          .slice(0, 24)
      : "offline",
  );
}
function scoped(p) {
  const result = path.resolve(profile, "." + p);
  if (!result.startsWith(profile + path.sep)) throw Error("非法路径");
  return result;
}
ipcMain.handle("native", async (event, method, args) => {
  if (event.sender !== win.webContents) throw Error("非法来源");
  const [p, v] = args;
  switch (method) {
    case 'petToggle': return petHost?.toggle();
    case 'petSnapshot': petHost?.publish(p); return;
    case 'petReply': petHost?.reply(p); return;
    case 'petEffect': petHost?.effect(p); return;
    case 'capabilities': return {readBatch:true};
    case 'readBatch': {
      if (!Array.isArray(p) || p.length > 32) throw Error('批量读取上限32个文件');
      return Object.fromEntries(await Promise.all(p.map(async name => [name,(await fs.readFile(scoped(name))).toString('base64')])));
    }
    case 'appearance': return appearanceManager.refresh();
    case 'saveAppearance': return appearanceManager.save(p);
    case 'personaShortcut': return appearanceManager.shortcut(true);
    case "ready":
      rendererReady = true;
      if (smoke) {
        console.log("SMOKE_REPORT " + JSON.stringify(p));
        if (exitSmoke)
          setTimeout(() => {
            testCloseRequested = true;
            win.close();
          }, 100);
        else if(!petSmoke)app.quit();
      }
      return;
    case "exit":
      if (exitSmoke) {
        if (!testCloseRequested || !testPromptReceived)
          throw Error("EXIT_SMOKE_FAIL: 缺少窗口关闭事件或同步确认");
        console.log(
          "EXIT_SMOKE_REPORT " +
            JSON.stringify({
              windowClose: true,
              pendingPrompt: true,
              directExit: true,
            }),
        );
      }
      allowExit = true;
      if(petHost){await petHost.dispose();petHost=null;}
      win.close();
      return;
    case "exitTestPrompt":
      if (!exitSmoke || !String(p).includes("尚未上传"))
        throw Error("EXIT_SMOKE_FAIL: 不支持的测试确认");
      testPromptReceived = true;
      return;
    case "read":
      return (await fs.readFile(scoped(p))).toString("base64");
    case "write": {
      await fs.mkdir(path.dirname(scoped(p)), { recursive: true });
      const temporary = scoped(p) + ".tmp-" + randomUUID();
      await fs.writeFile(temporary, Buffer.from(v, "base64"));
      await fs.rename(temporary, scoped(p));
      return;
    }
    case "mkdir":
      return fs.mkdir(scoped(p), { recursive: true });
    case "list":
      return fs.readdir(scoped(p));
    case "unlink":
      return fs.unlink(scoped(p));
    case "rmdir":
      return fs.rmdir(scoped(p));
    case "stat": {
      const s = await fs.stat(scoped(p));
      return {
        directory: s.isDirectory(),
        size: s.size,
        mode: s.mode,
        mtimeMs: s.mtimeMs,
        ctimeMs: s.ctimeMs,
        ino: s.ino,
        uid: 0,
        gid: 0,
      };
    }
    case "settings":
      try {
        return JSON.parse(
          safeStorage.decryptString(
            await fs.readFile(path.join(root, "settings.enc")),
          ),
        );
      } catch {
        return {};
      }
    case "saveSettings": {
      if (!safeStorage.isEncryptionAvailable())
        throw Error("系统凭据加密不可用");
      const next = profileFor(p);
      await fs.mkdir(path.join(next, "repo", "ops"), { recursive: true });
      if (next !== profile) {
        const source = path.join(profile, "repo", "ops");
        try {
          for (const name of await fs.readdir(source)) {
            if (!name.endsWith(".json")) continue;
            await fs
              .copyFile(
                path.join(source, name),
                path.join(next, "repo", "ops", name),
                require("fs").constants.COPYFILE_EXCL,
              )
              .catch((e) => {
                if (e.code !== "EEXIST") throw e;
              });
          }
        } catch (e) {
          if (e.code !== "ENOENT") throw e;
        }
      }
      await fs.writeFile(
        path.join(root, "settings.enc"),
        safeStorage.encryptString(JSON.stringify(p)),
      );
      profile = next;
      await petHost?.setBinding(path.basename(profile));
      return;
    }
    case "http": {
      const settings = JSON.parse(
        safeStorage.decryptString(
          await fs.readFile(path.join(root, "settings.enc")),
        ),
      );
      const u = new URL(p.url);
      if (u.protocol !== "https:" || u.origin !== new URL(settings.url).origin)
        throw Error("禁止非仓库地址请求");
      const r = await fetch(u, {
        method: p.method,
        headers: p.headers,
        body: p.method === "POST" ? Buffer.from(p.body, "base64") : undefined,
        redirect: "error",
        signal: AbortSignal.timeout(60000),
      });
      return {
        url: p.url,
        method: p.method,
        statusCode: r.status,
        statusMessage: r.statusText,
        headers: Object.fromEntries(r.headers),
        body: Buffer.from(await r.arrayBuffer()).toString("base64"),
      };
    }
    case "export": {
      const r = await dialog.showSaveDialog(win, {
        defaultPath: "J人日程备份.json",
      });
      if (!r.canceled) await fs.writeFile(r.filePath, p);
      return !r.canceled;
    }
    default:
      throw Error("未知操作");
  }
});
app.whenReady().then(async () => {
  root = smoke
    ? await fs.mkdtemp(path.join(require("os").tmpdir(), "jcalendar-smoke-"))
    : path.join(app.getPath("userData"), "data");
  await fs.mkdir(root, { recursive: true });
  app.setAppUserModelId('cn.goesm.jcalendar');
  appearanceManager = require('./personas.cjs').createPersonas({root, app, shell, getWindow: () => win, syncLinks: !smoke&&process.platform==='win32'});
  const appearance = await appearanceManager.read();
  let configuration = {};
  try {
    configuration = JSON.parse(
      safeStorage.decryptString(
        await fs.readFile(path.join(root, "settings.enc")),
      ),
    );
  } catch {}
  profile = profileFor(configuration);
  await fs.mkdir(profile, { recursive: true });
  win = new BrowserWindow({
    width: 1280,
    height: 900,
    title: "J人日程APP",
    icon: appearanceManager.icon(appearance.persona),
    show: !smoke,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      offscreen:petSmoke,
      additionalArguments: smoke
        ? ["--smoke-test", ...(exitSmoke ? ["--exit-smoke-test"] : []),...(petSmoke?['--pet-smoke-test']:[])]
        : [],
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.on("close", (e) => {
    if ((smoke && !exitSmoke && !petSmoke) || allowExit) return;
    e.preventDefault();
    if(petHost?.enabled&&rendererReady&&!win.webContents.isCrashed()){win.hide();return;}
    requestFullExit();
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith("file:")) e.preventDefault();
  });
  await win.loadFile(path.join(__dirname, "../dist/index.html"));
  if(!smoke||petSmoke){
    petHost=await require('./pet/host.cjs').createPetHost({root,getMain:()=>win,requestExit:requestFullExit,icon:appearanceManager.icon(appearance.persona),testing:petSmoke});
    await petHost.setBinding(path.basename(profile));
    win.webContents.send('pet-command',{requestId:'initial',command:{type:'refresh'}});
    if(process.argv.includes('--pet-self-test')){
      try{const report=await require('./pet/self-test.cjs')({win,petHost,root});console.log('PET_SELF_TEST '+JSON.stringify(report));await petHost.dispose();app.exit(0);}catch(e){console.error(e.stack);app.exit(1);}
    }
  }
});
app.on("window-all-closed", () => app.quit());
app.on('before-quit',event=>{if(petHost&&!allowExit&&!smoke){event.preventDefault();requestFullExit();}});
if(petSmoke)module.exports.inspect=()=>({win,petHost,root});
