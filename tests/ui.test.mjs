/** Headless DOM simulation of the shipped bundle; never touches user app/data. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildSync } from "esbuild";
import { JSDOM } from "jsdom";
const tick = () => new Promise((r) => setTimeout(r, 5));
async function until(predicate) {
  for (let n = 0; n < 400; n++) {
    if (predicate()) return;
    await tick();
  }
  throw Error("界面操作未完成");
}
test("真实表单入口：新建→日程，TODO加号→无时间TODO，类型切换正确分区", async () => {
  const files = new Map(),
    dirs = new Set(["/repo", "/repo/ops"]);
  let markReady;
  let exitCount = 0;
  const ready = new Promise((r) => (markReady = r));
  const html = fs
    .readFileSync("src/index.html", "utf8")
    .replace(
      '<link rel="stylesheet" href="style.css" />',
      "<style>" + fs.readFileSync("src/style.css", "utf8") + "</style>",
    );
  const dom = new JSDOM(html, {
    url: "https://app.test/",
    runScripts: "outside-only",
  });
  const w = dom.window;
  w.TextEncoder = TextEncoder;
  w.TextDecoder = TextDecoder;
  w.confirm = () => true;
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  w.native = {
    invoke: async (method, args) => {
      const [p, v] = args;
      switch (method) {
        case "settings":
          return {};
        case "mkdir":
          dirs.add(p);
          return;
        case "list":
          return [...files.keys(), ...dirs]
            .filter(
              (x) =>
                x.startsWith(p + "/") && !x.slice(p.length + 1).includes("/"),
            )
            .map((x) => x.slice(p.length + 1));
        case "read":
          if (!files.has(p)) throw Error("ENOENT");
          return files.get(p);
        case "stat":
          if (!dirs.has(p)) throw Error("ENOENT");
          return { directory: true };
        case "exit":
          exitCount++;
          return;
        case "write":
          files.set(p, v);
          for (
            let dir = p.slice(0, p.lastIndexOf("/"));
            dir;
            dir = dir.slice(0, dir.lastIndexOf("/"))
          )
            dirs.add(dir);
          return;
        case "ready":
          markReady();
          return;
        default:
          throw Error(method);
      }
    },
  };
  assert.equal(typeof w.Buffer, "undefined");
  const bundle = buildSync({
    entryPoints: ["src/app.mjs"],
    bundle: true,
    write: false,
    platform: "browser",
    target: "chrome120",
    inject: ["src/browser-globals.mjs"],
  }).outputFiles[0].text;
  w.eval(bundle);
  await ready;
  const $ = (s) => w.document.querySelector(s),
    input = (name) => $('[name="' + name + '"]');
  async function submit(title) {
    input("title").value = title;
    $("#form").dispatchEvent(
      new w.Event("submit", { cancelable: true, bubbles: true }),
    );
    await until(() => !$("#dialog").open);
  }
  try {
    assert.equal($("#sync-overlay").hidden, true);
    $("#sync").click();
    assert.equal($("#sync-overlay").hidden, false);
    assert.equal(w.document.body.getAttribute("aria-busy"), "true");
    await until(() => $("#sync-overlay").hidden);
    assert.equal(w.document.body.hasAttribute("aria-busy"), false);
    assert.equal(w.document.querySelectorAll(".add-schedule").length, 7);
    const targetDate = $("#center").value;
    $(
      '.schedule-add-cell[data-date="' + targetDate + '"] .add-schedule',
    ).click();
    assert.equal(input("date").value, targetDate);
    assert.equal(input("course"), null);
    assert.equal(input("entryType").value, "schedule");
    assert.equal(input("start").disabled, false);
    input("start").value = "13:20";
    input("end").value = "14:10";
    await submit("可新建的日程");
    assert.equal(w.document.querySelectorAll(".event").length, 1);
    assert.match($(".event").textContent, /13:20 – 14:10/);
    $(".event .check-toggle").click();
    await until(() => $(".event").classList.contains("done"));
    assert.equal($("#dialog").open, false);
    $(".event .check-toggle").click();
    await until(() => !$(".event").classList.contains("done"));
    $('.todos[data-date="' + $("#center").value + '"] .add-todo').click();
    assert.equal(input("entryType").value, "todo");
    assert.equal(input("start").disabled, true);
    assert.equal(input("start").value, "");
    assert.equal(
      w.getComputedStyle(input("start").parentElement).display,
      "none",
    );
    await submit("无时间TODO");
    assert.equal(w.document.querySelectorAll(".todo").length, 1);
    assert.equal(w.document.querySelectorAll(".event").length, 1);
    $(".todo-body").click();
    input("entryType").value = "schedule";
    input("entryType").dispatchEvent(new w.Event("change"));
    input("start").value = "16:00";
    input("end").value = "17:00";
    await submit("TODO转日程");
    assert.equal(w.document.querySelectorAll(".todo").length, 0);
    assert.equal(w.document.querySelectorAll(".event").length, 2);
    const first = w.document.querySelectorAll(".event")[0];
    first.querySelector(".event-body").click();
    input("entryType").value = "todo";
    input("entryType").dispatchEvent(new w.Event("change"));
    await submit("日程转TODO");
    assert.equal(w.document.querySelectorAll(".todo").length, 1);
    assert.equal(w.document.querySelectorAll(".event").length, 1);
    assert.equal($(".grid").dataset.columns, "7");
    assert.equal(w.document.querySelectorAll(".date-choice").length, 7);
    // Auto layout swaps to a genuinely single-day mobile agenda, not a scaled grid.
    w.innerWidth = 390;
    w.dispatchEvent(new w.Event("resize"));
    await until(() => w.document.body.dataset.view === "agenda");
    assert.ok($(".agenda"));
    assert.equal($(".grid"), null);
    $("#search-toggle").click();
    assert.equal($("#search-toggle").getAttribute("aria-expanded"), "true");
    assert.equal(w.document.activeElement.id, "search");
    $("#search-toggle").click();
    assert.equal(w.document.body.classList.contains("search-open"), false);
    assert.equal(w.document.querySelectorAll(".event").length, 1);
    $(".todo .check-toggle").click();
    await until(
      () => $(".todo .check-toggle").getAttribute("aria-pressed") === "true",
    );
    assert.ok($(".todo").classList.contains("done"));
    $(".event .check-toggle").click();
    await until(() => $(".event").classList.contains("done"));
    assert.equal($("#dialog").open, false);
    $("#menu").click();
    assert.equal($("#menu").getAttribute("aria-expanded"), "true");
    $("#settings").click();
    assert.equal(w.document.body.classList.contains("menu-open"), false);
    $("#cancel").click();
    $("#next").click();
    assert.equal(w.document.querySelectorAll(".event").length, 0);
    $("#prev").click();
    assert.equal(w.document.querySelectorAll(".event").length, 1);
    w.innerWidth = 1440;
    w.dispatchEvent(new w.Event("resize"));
    await until(() => w.document.body.dataset.view === "week");
    assert.equal($(".grid").dataset.columns, "7");
    assert.equal($("#view-range"), null);
    $("#view-agenda").click();
    assert.ok($(".agenda"));
    // Third category: optional DDL, separate list, quick completion and mobile page.
    $(".add-long").click();
    assert.equal(input("entryType").value, "longtodo");
    assert.equal(input("date").disabled, true);
    assert.equal(input("ddl").required, false);
    input("notes").value = "长期备注";
    await submit("长期目标");
    assert.equal(w.document.querySelectorAll(".long-card").length, 1);
    assert.equal($("#long-badge").textContent, "1");
    assert.match($(".long-group:nth-of-type(2)").textContent, /长期目标/);
    $(".long-card .check-toggle").click();
    await until(() => $(".long-completed .long-card"));
    assert.equal($(".long-completed").open, false);
    assert.equal($("#long-badge").textContent, "0");
    $(".long-completed .check-toggle").click();
    await until(() => $("#long-badge").textContent === "1");
    w.innerWidth = 390;
    w.dispatchEvent(new w.Event("resize"));
    await until(() => w.document.body.dataset.view === "agenda");
    $("#page-long").click();
    assert.equal(w.document.body.dataset.page, "long");
    assert.equal($("#page-long").getAttribute("aria-pressed"), "true");
    $("#add").click();
    assert.equal(input("entryType").value, "longtodo");
    $("#cancel").click();
    $("#page-daily").click();
    assert.equal(w.document.body.dataset.page, "daily");
    // Advancing the local day expires the seven-day completion window without
    // destroying a draft in the editor (focus/visibility hooks run on resume).
    $(".long-card .check-toggle").click();
    await until(() => $("#long-badge").textContent === "0");
    $(".add-long").click();
    input("title").value = "保留跨日草稿";
    const RealDate = w.Date;
    w.Date = class extends RealDate {
      constructor(...args) {
        super(...(args.length ? args : [RealDate.now() + 7 * 86400000]));
      }
      static now() {
        return RealDate.now() + 7 * 86400000;
      }
    };
    w.dispatchEvent(new w.Event("focus"));
    assert.equal($(".long-completed .long-card"), null);
    assert.equal(input("title").value, "保留跨日草稿");
    assert.equal($("#dialog").open, true);
    w.Date = RealDate;
    w.dispatchEvent(new w.Event("focus"));
    $("#cancel").click();
    const ops = [...files.entries()]
      .filter(([p]) => p.startsWith("/repo/ops/"))
      .map(([, s]) => JSON.parse(Buffer.from(s, "base64").toString()));
    assert.ok(
      ops.some((o) => o.item.kind === "schedule" && o.item.start === "13:20"),
    );
    // No repo yet: saved operations still count as pending; declining sync exits.
    let exitQuestion = "";
    w.confirm = (message) => {
      exitQuestion = message;
      return false;
    };
    w.dispatchEvent(new w.Event("native-exit-request"));
    await until(() => exitCount === 1);
    assert.match(exitQuestion, /尚未上传/);
    assert.ok(
      ops.some(
        (o) => o.item.title === "无时间TODO" && !o.item.start && !o.item.end,
      ),
    );
  } finally {
    dom.window.close();
  }
});
