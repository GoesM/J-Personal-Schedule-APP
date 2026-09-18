/** Controlled release self-test. Runs only in a temporary profile with --smoke-test. */
import {
  call,
  load,
  records,
  save,
  operations,
  importOps,
  fs,
} from "./store.mjs";
import git from "isomorphic-git";
import { localDate } from "./model.mjs";
const check = (value, message) => {
  if (!value) throw Error("SMOKE_FAIL: " + message);
};
export async function verifyNative() {
  const date = localDate();
  await save({ title: "测试TODO", date, kind: "todo" });
  await save({
    title: "测试课程",
    date,
    kind: "course",
    start: "09:50",
    end: "12:15",
    location: "学院路校区，(三)310",
  });
  let todo = records().find((r) => !r.item.start);
  await save({ ...todo.item, done: true }, todo);
  todo = records().find((r) => r.id === todo.id);
  check(todo.item.done, "编辑完成状态");
  await save(todo.item, todo, true);
  todo = records().find((r) => r.id === todo.id);
  check(todo.deleted, "软删除");
  await save(todo.item, todo, false);
  await load();
  check(records().filter((r) => !r.deleted).length === 2, "恢复与重读");
  await importOps([...operations]);
  check(records().length === 2, "重复导入不增项");
  await git.init({ fs, dir: "/repo", defaultBranch: "main" });
  await git.add({ fs, dir: "/repo", filepath: "ops" });
  const oid = await git.commit({
    fs,
    dir: "/repo",
    message: "Isolated browser Git smoke test",
    author: { name: "Smoke", email: "test@local.invalid" },
  });
  check(/^[0-9a-f]{40}$/.test(oid), "浏览器Git实际索引和提交");
  await call("saveSettings", {
    url: "https://example.invalid/test.git",
    branch: "main",
    user: "test",
    token: "unit-test-placeholder",
  });
  check(
    (await call("settings")).token === "unit-test-placeholder",
    "原生凭据加解密",
  );
  await load();
  check(records().length === 2, "仓库切换保留事项");
  await call("saveSettings", {});
  await load();
  return {
    crud: true,
    reload: true,
    backupDedup: true,
    encryptedSettings: true,
    profileSwitch: true,
    browserGitCommit: true,
  };
}
