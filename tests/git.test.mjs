/** Real smart-HTTP integration test: two isolated device stores, concurrent edits. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { spawn, execFileSync } from "node:child_process";
import vm from "node:vm";
import { buildSync } from "esbuild";
import { webcrypto } from "node:crypto";
test("无Node全局的浏览器Git产物：提交/拉取/推送与多端冲突", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "jcalendar-test-"));
  const remote = path.join(tmp, "remote.git");
  execFileSync("git", ["init", "--bare", "--initial-branch=main", remote]);
  execFileSync("git", ["-C", remote, "config", "http.receivepack", "true"]);
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://localhost");
    const p = spawn("git", ["http-backend"], {
      env: {
        ...process.env,
        GIT_PROJECT_ROOT: tmp,
        GIT_HTTP_EXPORT_ALL: "1",
        PATH_INFO: u.pathname,
        QUERY_STRING: u.search.slice(1),
        REQUEST_METHOD: req.method,
        CONTENT_TYPE: req.headers["content-type"] || "",
        REMOTE_USER: "test",
      },
    });
    const chunks = [];
    p.stdout.on("data", (b) => chunks.push(b));
    p.on("close", () => {
      const out = Buffer.concat(chunks),
        split = out.indexOf("\r\n\r\n");
      if (split < 0) {
        res.writeHead(500);
        return res.end(out);
      }
      for (const line of out.subarray(0, split).toString().split("\r\n")) {
        const at = line.indexOf(":");
        if (at < 0) continue;
        const k = line.slice(0, at),
          v = line.slice(at + 1).trim();
        if (k === "Status") res.statusCode = Number(v.slice(0, 3));
        else res.setHeader(k, v);
      }
      res.end(out.subarray(split + 4));
    });
    req.pipe(p.stdin);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  let device = "a";
  let rejectPush = false;
  global.window = {
    native: {
      invoke: async (method, args) => {
        const [p, v] = args;
        const file = typeof p === "string" ? path.join(tmp, device, p) : null;
        switch (method) {
          case "mkdir":
            return fs.mkdir(file, { recursive: true });
          case "list":
            return fs.readdir(file);
          case "read":
            return (await fs.readFile(file)).toString("base64");
          case "write":
            await fs.mkdir(path.dirname(file), { recursive: true });
            return fs.writeFile(file, Buffer.from(v, "base64"));
          case "stat": {
            const s = await fs.stat(file);
            return {
              directory: s.isDirectory(),
              size: s.size,
              mode: s.mode,
              mtimeMs: s.mtimeMs,
              ctimeMs: s.ctimeMs,
            };
          }
          case "unlink":
            return fs.unlink(file);
          case "rmdir":
            return fs.rmdir(file);
          case "http": {
            if (
              rejectPush &&
              p.url.includes("git-receive-pack") &&
              p.method === "POST"
            )
              throw Error("模拟断网：推送失败");
            const u = new URL(p.url);
            u.protocol = "http:";
            u.host = "127.0.0.1:" + server.address().port;
            const r = await fetch(u, {
              method: p.method,
              headers: p.headers,
              body:
                p.method === "POST" ? Buffer.from(p.body, "base64") : undefined,
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
          default:
            throw Error(method);
        }
      },
    },
  };
  const bundle = buildSync({
    entryPoints: ["tests/browser-entry.mjs"],
    bundle: true,
    write: false,
    format: "iife",
    globalName: "BrowserRegression",
    platform: "browser",
    target: "chrome120",
    inject: ["src/browser-globals.mjs"],
  }).outputFiles[0].text;
  const context = vm.createContext({
    window: global.window,
    console,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    ArrayBuffer,
    DataView,
    URL,
    crypto: webcrypto,
    atob,
    btoa,
    setTimeout,
    clearTimeout,
    performance,
  });
  assert.equal(vm.runInContext("typeof Buffer", context), "undefined");
  vm.runInContext(bundle, context);
  const store = context.BrowserRegression;
  const { synchronize } = store;
  const config = {
    url: "https://test.invalid/remote.git",
    user: "test",
    branch: "main",
  };
  try {
    // Reproduce the user's exact old-browser failure, then recover in-place.
    execFileSync("git", [
      "init",
      "--bare",
      "--initial-branch=main",
      path.join(tmp, "failed.git"),
    ]);
    execFileSync("git", [
      "-C",
      path.join(tmp, "failed.git"),
      "config",
      "http.receivepack",
      "true",
    ]);
    const brokenBundle = buildSync({
      entryPoints: ["tests/browser-entry.mjs"],
      bundle: true,
      write: false,
      format: "iife",
      globalName: "BrowserRegression",
      platform: "browser",
      target: "chrome120",
    }).outputFiles[0].text;
    const brokenContext = vm.createContext({
      window: global.window,
      console,
      TextEncoder,
      TextDecoder,
      Uint8Array,
      ArrayBuffer,
      DataView,
      URL,
      crypto: webcrypto,
      atob,
      btoa,
      setTimeout,
      clearTimeout,
      performance,
    });
    vm.runInContext(brokenBundle, brokenContext);
    device = "failed-device";
    const repairConfig = { ...config, url: "https://test.invalid/failed.git" };
    await brokenContext.BrowserRegression.load();
    await brokenContext.BrowserRegression.save({
      title: "失败同步前的本地事项",
      date: "2026-09-17",
    });
    await assert.rejects(
      () => brokenContext.BrowserRegression.synchronize(repairConfig),
      /Buffer is not defined/,
    );
    await store.load();
    await synchronize(repairConfig);
    assert.equal(store.records()[0].item.title, "失败同步前的本地事项");
    device = "a";
    await store.load();
    assert.equal(await store.hasPendingChanges(config), false);
    await synchronize(config);
    assert.equal(await store.hasPendingChanges(config), false);
    assert.equal(store.records().length, 0);
    await store.save({ title: "初始", date: "2026-09-25" });
    assert.equal(await store.hasPendingChanges(config), true);
    // Startup commits/pulls but does not upload: a clean worktree can still be pending.
    await synchronize(config, false);
    assert.equal(await store.hasPendingChanges(config), true);
    await store.load();
    assert.equal(await store.hasPendingChanges(config), true);
    rejectPush = true;
    await assert.rejects(() => synchronize(config), /推送失败/);
    assert.equal(await store.hasPendingChanges(config), true);
    rejectPush = false;
    await synchronize(config);
    assert.equal(await store.hasPendingChanges(config), false);
    const initial = store.records()[0];
    device = "b";
    await store.load();
    await store.save({ title: "B离线新事项", date: "2026-09-26" });
    assert.equal(await store.hasPendingChanges(config), true);
    await synchronize(config);
    assert.equal(await store.hasPendingChanges(config), false);
    assert.equal(store.records().length, 2);
    const b = store.records().find((r) => r.id === initial.id);
    await store.save({ ...b.item, title: "B版本" }, b);
    device = "a";
    await store.load();
    await store.save({ ...initial.item, title: "A版本" }, initial);
    await synchronize(config);
    device = "b";
    await store.load();
    await synchronize(config);
    assert.equal(
      store.records().find((r) => r.id === initial.id).conflict,
      true,
    );
    const conflict = store.records().find((r) => r.id === initial.id);
    await store.save({ ...conflict.item, title: "已解决" }, conflict);
    await synchronize(config);
    device = "a";
    await store.load();
    await synchronize(config, false);
    assert.equal(await store.hasPendingChanges(config), false);
    assert.equal(
      store.records().find((r) => r.id === initial.id).conflict,
      false,
    );
    assert.equal(
      store.records().find((r) => r.id === initial.id).item.title,
      "已解决",
    );
  } finally {
    await new Promise((r) => server.close(r));
  }
});
