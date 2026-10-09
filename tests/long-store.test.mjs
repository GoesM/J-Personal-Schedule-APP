import { test } from "node:test";
import assert from "node:assert/strict";
import { createLongStore } from "../src/long-store.mjs";
import { color } from "../src/model.mjs";

function device(name, files = new Map()) {
  let clock = new Date("2026-10-09T12:00:00+08:00"),
    seq = 0;
  const reads = [];
  const path = (p) => (p === "/longtodo-device.json" ? "/local/" + name : p);
  const io = {
    now: () => clock,
    uuid: () => name + "-" + ++seq,
    readJson: async (p) => {
      reads.push(p);
      if (!files.has(path(p))) {
        const e = Error("ENOENT");
        e.code = "ENOENT";
        throw e;
      }
      return structuredClone(files.get(path(p)));
    },
    writeJson: async (p, value) => {
      files.set(path(p), structuredClone(value));
    },
    mkdir: async () => {},
    list: async (p) => [
      ...new Set(
        [...files.keys()]
          .filter((n) => n.startsWith(p + "/"))
          .map((n) => n.slice(p.length + 1).split("/")[0]),
      ),
    ],
  };
  return {
    files,
    reads,
    io,
    store: createLongStore(io),
    time: (v) => {
      clock = new Date(v);
    },
  };
}
const todo = (title, ddl = "") => ({
  kind: "longtodo",
  title,
  ddl,
  notes: "备注",
  done: false,
});
test("长期TODO工作集、按完成月份归档、七日窗口和完整备份", async () => {
  const d = device("a");
  await d.store.load();
  await d.store.save(todo("没有DDL"));
  d.time("2026-07-02T09:00:00+08:00");
  await d.store.save(todo("七月完成", "2026-12-31"));
  let r = d.store.records().find((r) => r.item.title === "七月完成");
  await d.store.save({ ...r.item, done: true }, r);
  d.time("2026-10-03T09:00:00+08:00");
  await d.store.save(todo("七日窗口第一天"));
  r = d.store.records().find((r) => r.item.title === "七日窗口第一天");
  await d.store.save({ ...r.item, done: true }, r);
  d.time("2026-10-09T12:00:00+08:00");
  d.reads.length = 0;
  await d.store.load();
  assert.deepEqual(
    d.store
      .records()
      .map((r) => r.item.title)
      .sort(),
    ["七日窗口第一天", "没有DDL"],
  );
  assert.ok(
    !d.reads.some((p) => p.includes("completed/2026-07")),
    "启动不能读取旧月份内容",
  );
  const active = d.files.get("/repo/longtodo/a-3/active.json");
  assert.equal(
    Object.keys(active.operations).length,
    1,
    "active文件只保留未完成当前版本",
  );
  const all = await d.store.exportHeads();
  assert.equal(all.length, 3, "完整备份按需包含更早已完成事项");
  const b = device("b");
  await b.store.load();
  await b.store.importHeads(all);
  assert.equal((await b.store.exportHeads()).length, 3);
  assert.equal(b.store.records().length, 2);
});
test("跨设备旧完成记录抑制、并发编辑、合并与恢复不会复活旧版本", async () => {
  const a = device("a"),
    b = device("b");
  const sync = (from, to) => {
    const writer = [...from.files].find(([p]) => p.startsWith("/local/"))?.[1]
      .id;
    for (const [p, v] of from.files)
      if (p.startsWith("/repo/longtodo/" + writer + "/"))
        to.files.set(p, structuredClone(v));
  };
  a.time("2026-08-01T10:00:00+08:00");
  await a.store.load();
  await a.store.save(todo("共同任务"));
  sync(a, b);
  await b.store.load();
  const base = b.store.records()[0];
  b.time("2026-08-02T10:00:00+08:00");
  await b.store.save({ ...base.item, done: true }, base);
  sync(b, a);
  a.time("2026-10-09T12:00:00+08:00");
  a.reads.length = 0;
  await a.store.load();
  assert.equal(a.store.records().length, 0, "旧设备未完成版本已被完成版本抑制");
  assert.ok(!a.reads.some((p) => p.includes("completed/2026-08")));
  // Restore from an explicitly loaded historical backup, then edit on both devices.
  const old = (await a.store.exportHeads())[0];
  await a.store.save(
    { ...old.item, done: false },
    { id: old.itemId, item: old.item, versions: [old] },
  );
  sync(a, b);
  b.time("2026-10-09T12:00:00+08:00");
  await b.store.load();
  const restored = b.store.records()[0];
  assert.equal(restored.item.completedAt, "");
  await a.store.save({ ...restored.item, title: "A编辑" }, restored);
  await b.store.save(
    { ...restored.item, title: "B编辑", done: true },
    restored,
  );
  sync(a, b);
  sync(b, a);
  await a.store.load();
  assert.equal(a.store.records()[0].conflict, true);
  const conflict = a.store.records()[0];
  await a.store.save(
    { ...conflict.item, title: "合并完成", done: true },
    conflict,
  );
  sync(a, b);
  await b.store.load();
  assert.equal(b.store.records()[0].conflict, false);
  assert.equal(b.store.records()[0].item.title, "合并完成");
});
test("完成时间不随备注修改刷新、删除归档与恢复、工作集不会积累已完成内容", async () => {
  const d = device("d");
  await d.store.load();
  await d.store.save(todo("测试"));
  let r = d.store.records()[0];
  await d.store.save({ ...r.item, done: true }, r);
  r = d.store.records()[0];
  const completed = r.item.completedAt;
  d.time("2026-10-10T12:00:00+08:00");
  await d.store.save({ ...r.item, notes: "修改备注" }, r);
  assert.equal(d.store.records()[0].item.completedAt, completed);
  r = d.store.records()[0];
  await d.store.save(r.item, r, true);
  await d.store.load();
  assert.equal(d.store.records().length, 0);
  await d.store.loadTrash();
  r = d.store.records()[0];
  assert.equal(r.deleted, true);
  await d.store.save({ ...r.item, done: false }, r, false);
  await d.store.load();
  assert.equal(d.store.records()[0].deleted, false);
  assert.equal(d.store.records()[0].item.done, false);
  assert.equal(color(todo("无DDL"), new Date()), "future");
});
test("大量旧归档不会产生逐条文件读取，启动成本按设备和相关月份增长", async () => {
  const d = device("a");
  await d.store.load();
  const ops = Array.from({ length: 2000 }, (_, n) => ({
    id: "old-" + n,
    itemId: "item-" + n,
    parents: [],
    ancestors: [],
    at: "2024-01-01T10:00:00Z",
    deleted: false,
    item: {
      ...todo("旧完成" + n),
      done: true,
      completedAt: "2024-01-01T10:00:00Z",
    },
  }));
  await d.store.importHeads(ops);
  await d.store.save(todo("唯一待办"));
  d.reads.length = 0;
  await d.store.load();
  assert.equal(d.store.records().length, 1);
  assert.equal(
    d.reads.filter((p) => p.endsWith(".json")).length,
    2,
    "一个设备只读索引+active，不读旧月",
  );
});
test("索引提交点之前失败保留旧版本；提交后清理失败不丢已保存修改", async () => {
  const d = device("x");
  await d.store.load();
  await d.store.save(todo("原任务"));
  const write = d.io.writeJson;
  let fail = true;
  d.io.writeJson = async (p, v) => {
    if (fail && p.endsWith("/index.json")) {
      fail = false;
      throw Error("模拟断电");
    }
    return write(p, v);
  };
  await assert.rejects(
    () =>
      d.store.save(
        { ...d.store.records()[0].item, title: "未提交修改" },
        d.store.records()[0],
      ),
    /断电/,
  );
  await d.store.load();
  assert.equal(d.store.records()[0].item.title, "原任务");
  let activeWrites = 0;
  d.io.writeJson = async (p, v) => {
    if (p.endsWith("/active.json") && ++activeWrites === 2)
      throw Error("清理失败");
    return write(p, v);
  };
  await d.store.save(
    { ...d.store.records()[0].item, title: "已提交修改" },
    d.store.records()[0],
  );
  await d.store.load();
  assert.equal(d.store.records()[0].item.title, "已提交修改");
});
