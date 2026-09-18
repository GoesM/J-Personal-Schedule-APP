/** Shared Windows/Android exit flow. Never exit silently after a failed upload. */
export function createExitController({
  waitForIdle,
  hasPending,
  synchronize,
  confirm,
  finish,
  notify,
  suspend,
  hasDraft = () => false,
}) {
  let running = false;
  return async function requestExit() {
    if (running) return false;
    running = true;
    suspend(true);
    try {
      await waitForIdle();
      if (
        hasDraft() &&
        !(await confirm(
          "编辑窗口尚未保存，退出会丢弃表单中未保存的内容。仍要退出吗？",
        ))
      )
        return false;
      let pending;
      try {
        pending = await hasPending();
      } catch (e) {
        notify("无法检查同步状态：" + e.message);
        if (
          !(await confirm(
            "暂时无法检查云端同步状态。是否直接退出？本地已保存的数据会保留。",
          ))
        )
          return false;
        await finish();
        return true;
      }
      if (
        pending &&
        (await confirm(
          "本地有尚未上传到云端的更改。是否先与云端同步，再退出？\n确定：同步成功后退出；取消：不再同步，直接退出。",
        ))
      ) {
        try {
          await synchronize();
        } catch (e) {
          notify("退出前同步失败，本地数据保留。" + e.message);
          if (
            !(await confirm(
              "同步失败，本地数据已保留。是否不再同步、直接退出？\n确定：直接退出；取消：留在程序内，稍后重试。",
            ))
          )
            return false;
        }
      }
      await finish();
      return true;
    } catch (e) {
      notify(e.message);
      return false;
    } finally {
      suspend(false);
      running = false;
    }
  };
}
