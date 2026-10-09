/** Independent long TODO list for the desktop right pane / mobile second page. */
import { element } from "./planner-view.mjs";
import { color, localDate } from "./model.mjs";
import { recentCutoff } from "./long-store.mjs";

function card(r, onEdit, onToggle) {
  const item = r.item,
    row = element(
      "div",
      "",
      "long-card " + color(item) + (item.done ? " completed" : ""),
    );
  row.dataset.itemId = r.id;
  const check = element("button", item.done ? "✓" : "", "check-toggle");
  check.type = "button";
  check.setAttribute(
    "aria-label",
    (item.done ? "标记未完成：" : "完成：") + item.title,
  );
  check.setAttribute("aria-pressed", String(!!item.done));
  check.onclick = () => onToggle(r);
  const body = element("button", "", "long-card-body");
  body.type = "button";
  body.onclick = () => onEdit(item, r);
  body.append(element("strong", item.title));
  if (item.notes) body.append(element("span", item.notes, "card-note"));
  const meta = element("div", "", "long-meta");
  if (item.done)
    meta.append(
      element("span", "完成于 " + localDate(new Date(item.completedAt))),
    );
  else if (item.ddl) {
    const today = localDate();
    const remaining = Math.round(
      (new Date(item.ddl + "T12:00:00") - new Date(today + "T12:00:00")) /
        86400000,
    );
    meta.append(element("span", "DDL " + item.ddl.slice(5).replace("-", "/")));
    meta.append(
      element(
        "span",
        remaining < 0
          ? "逾期 " + -remaining + " 天"
          : remaining === 0
            ? "今天截止"
            : "还有 " + remaining + " 天",
        remaining <= 2 ? "due-soon" : "",
      ),
    );
  } else meta.append(element("span", "暂不设截止日期"));
  if (r.conflict) meta.append(element("span", "版本冲突", "due-soon"));
  body.append(meta);
  row.append(check, body);
  return row;
}
export function longTodoList({
  items,
  onEdit,
  onToggle,
  onNew,
  completedOpen,
  onCompletedToggle,
  query = "",
}) {
  const pane = element("div", "", "long-list");
  const visible = items.filter(
    (r) =>
      !r.deleted &&
      (!query ||
        (r.item.title + " " + (r.item.notes || ""))
          .toLowerCase()
          .includes(query)),
  );
  const active = visible.filter((r) => !r.item.done);
  const header = element("div", "", "long-heading");
  const title = element("div");
  title.append(
    element("span", "让重要的事慢慢落地", "eyebrow"),
    element("h2", "长期 TODO"),
  );
  header.append(title, element("span", String(active.length), "long-count"));
  pane.append(header);
  const add = element("button", "＋ 添加长期 TODO", "add-long primary");
  add.type = "button";
  add.onclick = onNew;
  pane.append(add);
  const sections = [
    [
      "按截止日期",
      active
        .filter((r) => r.item.ddl)
        .sort(
          (a, b) =>
            a.item.ddl.localeCompare(b.item.ddl) ||
            a.item.title.localeCompare(b.item.title),
        ),
      "给目标一个日期，按先后顺序推进。",
    ],
    [
      "暂无 DDL",
      active
        .filter((r) => !r.item.ddl)
        .sort((a, b) => b.versions[0].at.localeCompare(a.versions[0].at)),
      "还没有截止日期的想法，先放在这里。",
    ],
  ];
  for (const [label, rows, hint] of sections) {
    const group = element("section", "", "long-group");
    group.append(element("h3", label + " · " + rows.length));
    for (const r of rows) group.append(card(r, onEdit, onToggle));
    if (!rows.length)
      group.append(element("p", query ? "没有匹配的事项" : hint, "long-empty"));
    pane.append(group);
  }
  const done = visible
    .filter(
      (r) =>
        r.item.done &&
        r.item.completedAt &&
        localDate(new Date(r.item.completedAt)) >= recentCutoff(),
    )
    .sort((a, b) => b.item.completedAt.localeCompare(a.item.completedAt));
  const completed = element("details", "", "long-completed");
  completed.open = completedOpen;
  completed.ontoggle = () => onCompletedToggle(completed.open);
  const summary = element("summary", "近 7 天已完成 · " + done.length);
  completed.append(summary);
  for (const r of done) completed.append(card(r, onEdit, onToggle));
  if (!done.length)
    completed.append(
      element("p", "完成一件，就少一件挂心的事。", "long-empty"),
    );
  pane.append(
    completed,
    element(
      "p",
      "已完成事项按完成月份归档，此处仅展示近 7 天。",
      "long-footnote",
    ),
  );
  return pane;
}
