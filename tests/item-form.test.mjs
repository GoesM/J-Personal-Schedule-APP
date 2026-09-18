import { test } from "node:test";
import assert from "node:assert/strict";
import { itemFromForm } from "../src/item-form.mjs";
function form(type, start = "09:00", end = "10:00") {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    entryType: type,
    title: "测试事项",
    date: "2026-09-17",
    start,
    end,
  }))
    f.set(k, v);
  return f;
}
test("日程有时间范围，TODO强制没有时间", () => {
  const s = itemFromForm(form("schedule"));
  assert.equal(s.kind, "schedule");
  assert.equal(s.start, "09:00");
  assert.equal(s.end, "10:00");
  const legacy = form("schedule");
  legacy.set("course", "on");
  assert.equal(itemFromForm(legacy).kind, "schedule");
  const f = form("todo");
  f.set("course", "on");
  const t = itemFromForm(f);
  assert.equal(t.kind, "todo");
  assert.equal(t.start, "");
  assert.equal(t.end, "");
});
test("日程拒绝空时间、倒置时间和无类型表单", () => {
  assert.throws(() => itemFromForm(form("schedule", "", "")), /日程必须/);
  assert.throws(
    () => itemFromForm(form("schedule", "10:00", "09:00")),
    /日程必须/,
  );
  assert.throws(() => itemFromForm(form("unknown")), /请选择/);
});
