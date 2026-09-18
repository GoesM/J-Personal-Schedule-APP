const {
  app,
  BrowserWindow,
  ipcMain,
  safeStorage,
  dialog,
} = require("electron");
const fs = require("fs/promises"),
  path = require("path");
let win, root, profile;
let allowExit = false,
  rendererReady = false,
  fallbackClosing = false;
const exitSmoke = process.argv.includes("--exit-smoke-test");
const smoke = process.argv.includes("--smoke-test") || exitSmoke;
let testCloseRequested = false,
  testPromptReceived = false;
if (!smoke) {
  if (!app.requestSingleInstanceLock()) app.quit();
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
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
    case "ready":
      rendererReady = true;
      if (smoke) {
        console.log("SMOKE_REPORT " + JSON.stringify(p));
        if (exitSmoke)
          setTimeout(() => {
            testCloseRequested = true;
            win.close();
          }, 100);
        else app.quit();
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
    title: "J人小程序",
    show: !smoke,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: smoke
        ? ["--smoke-test", ...(exitSmoke ? ["--exit-smoke-test"] : [])]
        : [],
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.on("close", (e) => {
    if ((smoke && !exitSmoke) || allowExit) return;
    e.preventDefault();
    if (
      rendererReady &&
      !win.webContents.isDestroyed() &&
      !win.webContents.isCrashed()
    ) {
      win.webContents.send("request-exit");
    } else if (!fallbackClosing) {
      fallbackClosing = true;
      dialog
        .showMessageBox(win, {
          type: "warning",
          title: "退出程序",
          message:
            "暂时无法检查同步状态。是否直接退出？本地已保存的数据会保留。",
          buttons: ["取消退出", "直接退出"],
          defaultId: 0,
          cancelId: 0,
        })
        .then(({ response }) => {
          if (response === 1) {
            allowExit = true;
            win.close();
          }
        })
        .finally(() => {
          fallbackClosing = false;
        });
    }
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith("file:")) e.preventDefault();
  });
  await win.loadFile(path.join(__dirname, "../dist/index.html"));
});
app.on("window-all-closed", () => app.quit());
