import { test } from "node:test";
import assert from "node:assert/strict";
import { materialize, color, shift, boundaries, lanes } from "../src/model.mjs";
test("并发修改保留两个版本并可解决", () => {
  const a = {
    id: "a",
    itemId: "x",
    parents: [],
    at: "1",
    item: { title: "a" },
  };
  const b = { ...a, id: "b", parents: ["a"], at: "2" };
  const c = { ...b, id: "c" };
  assert.equal(materialize([a, b, c])[0].conflict, true);
  const d = { ...b, id: "d", parents: ["b", "c"], at: "3" };
  assert.equal(materialize([a, b, c, d])[0].conflict, false);
});
test("颜色与日期", () => {
  assert.equal(color({ date: "2026-09-18" }, "2026-09-17"), "future");
  assert.equal(color({ date: "2026-09-17" }, "2026-09-17"), "future");
  assert.equal(color({ date: "2026-09-16" }, "2026-09-17"), "past");
  assert.equal(color({ date: "2026-09-16", done: true }, "2026-09-17"), "done");
  assert.equal(
    color({ kind: "course", date: "2026-09-17" }, "2026-09-17"),
    "future",
  );
  assert.equal(
    color({ date: "2026-09-18", important: true }, "2026-09-17"),
    "important",
  );
  assert.equal(shift("2026-12-31", 1), "2027-01-01");
  assert.deepEqual(boundaries([{ start: "09:50", end: "12:15" }]), [
    "08:00",
    "09:50",
    "12:15",
    "22:00",
  ]);
});
test("完成状态优先染绿；当天日程按结束时刻过期，TODO按日期过期", () => {
  const now = new Date("2026-09-18T12:00:00");
  const todo = { date: "2026-09-18" };
  const event = { ...todo, start: "10:00", end: "11:59" };
  assert.equal(color(todo, now), "future");
  assert.equal(color({ ...todo, done: true, important: true }, now), "done");
  assert.equal(color(event, now), "past");
  assert.equal(color({ ...event, end: "12:00" }, now), "past");
  assert.equal(color({ ...event, end: "12:01" }, now), "future");
  assert.equal(color({ ...event, done: true, kind: "course" }, now), "done");
  assert.equal(color({ ...todo, date: "2026-09-19", done: true }, now), "done");
  assert.equal(
    color({ ...todo, date: "2026-09-17", important: true }, now),
    "past",
  );
  assert.equal(color(todo, new Date("2026-09-19T00:00:00")), "past");
});
test("链式重叠分栏不覆盖相邻日程", () => {
  const input = [
    ["a", "09:00", "10:00"],
    ["b", "09:30", "10:30"],
    ["c", "10:00", "11:00"],
  ].map(([id, start, end]) => ({ id, item: { start, end } }));
  const tracks = lanes(input);
  assert.equal(tracks.get("a").count, 2);
  assert.equal(tracks.get("b").lane, 1);
  assert.equal(tracks.get("c").lane, 0);
});
