import { test } from "node:test";
import assert from "node:assert/strict";
import { createExitController } from "../src/exit.mjs";
function fixture({
  pending = true,
  answers = [],
  failure = false,
  draft = false,
  wait = async () => {},
} = {}) {
  const calls = [];
  const exit = createExitController({
    waitForIdle: wait,
    hasPending: async () => {
      calls.push("check");
      return pending;
    },
    synchronize: async () => {
      calls.push("sync");
      if (failure) throw Error("模拟断网");
    },
    confirm: async () => {
      calls.push("confirm");
      return answers.shift() ?? false;
    },
    finish: async () => {
      calls.push("exit");
    },
    notify: () => calls.push("notify"),
    suspend: (v) => calls.push(v ? "suspend" : "resume"),
    hasDraft: () => draft,
  });
  return { exit, calls };
}
test("退出：无改动不提示，拒绝同步直接退出，同意后等待同步完成", async () => {
  const clean = fixture({ pending: false });
  assert.equal(await clean.exit(), true);
  assert.deepEqual(clean.calls, ["suspend", "check", "exit", "resume"]);
  const no = fixture({ answers: [false] });
  await no.exit();
  assert.ok(!no.calls.includes("sync"));
  assert.ok(no.calls.includes("exit"));
  const yes = fixture({ answers: [true] });
  await yes.exit();
  assert.ok(yes.calls.indexOf("sync") < yes.calls.indexOf("exit"));
});
test("退出同步失败：取消则留在程序，明确同意后才直接退出", async () => {
  const keep = fixture({ answers: [true, false], failure: true });
  assert.equal(await keep.exit(), false);
  assert.ok(!keep.calls.includes("exit"));
  assert.equal(keep.calls.at(-1), "resume");
  const leave = fixture({ answers: [true, true], failure: true });
  assert.equal(await leave.exit(), true);
  assert.ok(leave.calls.includes("exit"));
});
test("退出等待保存；重复关闭不会重复同步，未保存表单可以取消退出", async () => {
  let release;
  const waiting = fixture({
    wait: () => new Promise((r) => (release = r)),
    answers: [false],
  });
  const first = waiting.exit();
  assert.equal(await waiting.exit(), false);
  assert.deepEqual(waiting.calls, ["suspend"]);
  release();
  await first;
  assert.equal(waiting.calls.filter((x) => x === "exit").length, 1);
  const draft = fixture({ draft: true, answers: [false] });
  assert.equal(await draft.exit(), false);
  assert.ok(!draft.calls.includes("check"));
});
test("退出无法读取同步状态：提示并留在程序，除非明确确认直接退出", async () => {
  for (const answer of [false, true]) {
    let ended = false;
    const exit = createExitController({
      waitForIdle: async () => {},
      hasPending: async () => {
        throw Error("IO");
      },
      confirm: async () => answer,
      finish: async () => {
        ended = true;
      },
      notify: () => {},
      suspend: () => {},
    });
    await exit();
    assert.equal(ended, answer);
  }
});
