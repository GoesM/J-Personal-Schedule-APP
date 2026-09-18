/** Explicit form semantics: TODO has only a date; schedules have a time range. */
export function itemFromForm(form) {
  const type = form.get("entryType");
  if (!["schedule", "todo"].includes(type)) throw Error("请选择日程或TODO");
  const scheduled = type === "schedule";
  const value = (name) => String(form.get(name) ?? "").trim();
  const item = {
    title: value("title"),
    date: value("date"),
    start: scheduled ? value("start") : "",
    end: scheduled ? value("end") : "",
    location: value("location"),
    notes: value("notes"),
    kind: scheduled ? "schedule" : "todo",
    important: form.has("important"),
    done: form.has("done"),
  };
  if (!item.title || !item.date) throw Error("请填写标题和日期");
  if (
    scheduled &&
    (!/^([01]\d|2[0-3]):[0-5]\d$/.test(item.start) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(item.end) ||
      item.end <= item.start)
  )
    throw Error(
      "日程必须填写有效的开始、结束时间，且结束晚于开始；跨夜日程请拆分",
    );
  return item;
}
