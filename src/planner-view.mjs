import { localDate, shift, color, boundaries, lanes } from "./model.mjs";
export const element = (tag, value = "", cls = "") => {
  const e = document.createElement(tag);
  e.textContent = value;
  if (cls) e.className = cls;
  return e;
};
const weekday = (d) =>
  ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][
    new Date(d + "T12:00:00").getDay()
  ];
const minute = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const action = (label, fn, cls = "") => {
  const b = element("button", label, cls);
  b.type = "button";
  b.onclick = fn;
  return b;
};
const empty = (title, note) => {
  const e = element("div", "", "empty-state");
  e.append(
    element("span", "○", "empty-symbol"),
    element("strong", title),
    element("p", note),
  );
  return e;
};
export function dateStrip(anchor, selected, onSelect, items) {
  const strip = element("div", "", "date-strip");
  strip.setAttribute("aria-label", "前后十五天");
  for (let n = -7; n <= 7; n++) {
    const d = shift(anchor, n),
      isToday = d === localDate();
    const b = action(
      "",
      () => onSelect(d),
      "date-choice" +
        (d === selected ? " selected" : "") +
        (isToday ? " is-today" : ""),
    );
    b.dataset.date = d;
    b.setAttribute("aria-label", d + " " + weekday(d));
    b.setAttribute("aria-pressed", String(d === selected));
    b.append(
      element("span", isToday ? "今天" : weekday(d)),
      element("strong", String(Number(d.slice(8)))),
      element(
        "i",
        items.some((r) => r.item.date === d) ? "•" : "",
        "activity-dot",
      ),
    );
    strip.append(b);
  }
  return strip;
}
function todoCard(r, onEdit, onToggle) {
  const i = r.item,
    card = element(
      "div",
      "",
      "todo " + color(i) + (i.done ? " completed" : ""),
    );
  card.dataset.itemId = r.id;
  const check = action(
    i.done ? "✓" : "",
    (e) => {
      e.stopPropagation();
      onToggle(r);
    },
    "check-toggle",
  );
  check.setAttribute("aria-label", i.done ? "标记未完成" : "标记完成");
  check.setAttribute("aria-pressed", String(!!i.done));
  const body = action("", () => onEdit(i, r), "todo-body");
  body.append(element("strong", i.title));
  if (i.notes) body.append(element("span", i.notes, "card-note"));
  card.append(check, body);
  if (i.important) card.append(element("span", "!", "priority-mark"));
  return card;
}
function eventCard(r, onEdit, onToggle) {
  const i = r.item,
    card = element(
      "div",
      "",
      "event " + color(i) + (i.done ? " completed" : ""),
    );
  card.dataset.itemId = r.id;
  const check = action(
    i.done ? "✓" : "",
    (e) => {
      e.stopPropagation();
      onToggle(r);
    },
    "check-toggle",
  );
  check.setAttribute("aria-label", i.done ? "标记日程未完成" : "标记日程完成");
  check.setAttribute("aria-pressed", String(!!i.done));
  const body = action("", () => onEdit(i, r), "event-body");
  body.append(
    element("span", i.start + " – " + i.end, "event-time"),
    element("strong", i.title),
  );
  if (i.location) body.append(element("span", i.location, "event-location"));
  if (i.notes) body.append(element("span", i.notes, "card-note"));
  card.append(check, body);
  card.title = [i.title, i.start + "–" + i.end, i.location, i.notes]
    .filter(Boolean)
    .join("\n");
  return card;
}
function heading(title, note, onAdd) {
  const h = element("div", "", "section-heading");
  const t = element("div");
  t.append(element("h3", title), element("p", note));
  h.append(t, action("＋", onAdd, "section-add"));
  return h;
}
export function agenda({ selected, items, onEdit, onNew, onToggle }) {
  const page = element("div", "", "agenda");
  page.append(
    element(
      "div",
      Number(selected.slice(5, 7)) +
        "月" +
        Number(selected.slice(8)) +
        "日 · " +
        weekday(selected),
      "agenda-date",
    ),
  );
  const events = items
    .filter((r) => r.item.date === selected && r.item.start)
    .sort((a, b) => a.item.start.localeCompare(b.item.start));
  const todos = items.filter((r) => r.item.date === selected && !r.item.start);
  const timed = element("section", "", "agenda-section");
  timed.append(
    heading("当日行程", events.length + " 个安排 · 有明确时间", () =>
      onNew(selected, true),
    ),
  );
  const timeline = element("div", "", "agenda-timeline");
  for (const r of events) {
    const row = element("div", "", "agenda-row");
    row.append(
      element("time", r.item.start, "agenda-time"),
      eventCard(r, onEdit, onToggle),
    );
    timeline.append(row);
  }
  if (!events.length)
    timeline.append(
      empty("今天留一些自由时间", "还没有日程，点右上角 ＋ 安排一下。"),
    );
  timed.append(timeline);
  timed.append(action("＋ 日程", () => onNew(selected, true), "add-schedule"));
  const task = element("section", "", "agenda-section");
  task.append(
    heading(
      "TODO & 提醒",
      todos.filter((r) => !r.item.done).length + " 项待完成 · 不限定时间",
      () => onNew(selected, false),
    ),
  );
  const col = element("div", "", "todos");
  col.dataset.date = selected;
  for (const r of todos) col.append(todoCard(r, onEdit, onToggle));
  if (!todos.length)
    col.append(empty("没有待办，轻装上阵", "想到一件事，就把它记在这里。"));
  col.append(action("＋ 添加 TODO", () => onNew(selected, false), "add-todo"));
  task.append(col);
  page.append(timed, task);
  return page;
}
export function overview({
  anchor,
  selected,
  view,
  items,
  onSelect,
  onEdit,
  onNew,
  onToggle,
  timelineHeight,
}) {
  const days = Array.from({ length: view === "range" ? 15 : 7 }, (_, n) =>
    shift(view === "range" ? anchor : selected, n - (view === "range" ? 7 : 3)),
  );
  const page = element("div", "", "overview");
  const summary = element("div", "", "section-heading overview-heading");
  summary.append(
    element("h3", "时间日程"),
    element(
      "span",
      days[0].slice(5).replace("-", " / ") +
        " — " +
        days.at(-1).slice(5).replace("-", " / "),
      "subtle",
    ),
  );
  page.append(summary);
  const grid = element("div", "", "grid");
  grid.style.setProperty("--days", days.length);
  grid.dataset.columns = days.length;
  grid.append(element("div", "时间", "date axis"));
  for (const d of days) {
    const head = action(
      "",
      () => onSelect(d),
      "date" +
        (d === localDate() ? " today" : "") +
        (d === selected ? " chosen" : ""),
    );
    head.dataset.date = d;
    head.append(
      element("span", weekday(d)),
      element("strong", d.slice(5).replace("-", " / ")),
    );
    grid.append(head);
  }
  // A labelled add action immediately under each date, never covering an event.
  grid.append(element("div", "新增", "axis schedule-add-axis"));
  for (const d of days) {
    const row = element("div", "", "schedule-add-cell");
    row.dataset.date = d;
    const add = action("＋ 日程", () => onNew(d, true), "add-schedule");
    add.setAttribute("aria-label", d + " 新建日程");
    row.append(add);
    grid.append(row);
  }
  const visible = items.filter((r) => days.includes(r.item.date));
  const times = boundaries(visible.map((r) => r.item));
  const base = times
    .slice(1)
    .map((t, n) =>
      Math.max(52, Math.min(130, (minute(t) - minute(times[n])) * 0.85)),
    );
  const natural = base.reduce((a, b) => a + b, 0),
    target = timelineHeight || Math.max(280, (window.innerHeight || 900) - 500),
    scale = target / natural,
    heights = base.map((h) => h * scale);
  // Fill the available area, but keep short events readable. Expand shared segments
  // rather than artificially growing individual cards into neighbouring events.
  const minimumFor = (r) =>
    r.item.location
      ? r.item.title.length > 10
        ? 112
        : 96
      : r.item.title.length > 10
        ? 94
        : 76;
  for (const r of visible.filter((r) => r.item.start)) {
    const a = times.indexOf(r.item.start),
      b = times.indexOf(r.item.end);
    const span = heights.slice(a, b).reduce((sum, h) => sum + h, 0);
    const minimum = minimumFor(r);
    if (a >= 0 && b > a && span < minimum)
      for (let n = a; n < b; n++) heights[n] *= minimum / span;
  }
  // Reclaim surplus from blank spans first, then from spans with safe event slack.
  // Dense weeks may still scroll; readability wins over forcibly squeezing cards.
  const intervals = visible
    .filter((r) => r.item.start)
    .map((r) => ({
      a: times.indexOf(r.item.start),
      b: times.indexOf(r.item.end),
      min: minimumFor(r),
    }));
  let excess = heights.reduce((a, b) => a + b, 0) - target;
  const order = heights
    .map((h, n) => n)
    .sort((a, b) => {
      const occupied = (n) =>
        intervals.filter((i) => i.a <= n && i.b > n).length;
      return occupied(a) - occupied(b) || heights[b] - heights[a];
    });
  for (const n of order) {
    if (excess <= 0) break;
    let slack = Math.max(0, heights[n] - (n === heights.length - 1 ? 26 : 18));
    for (const i of intervals.filter((i) => i.a <= n && i.b > n))
      slack = Math.min(
        slack,
        Math.max(0, heights.slice(i.a, i.b).reduce((a, b) => a + b, 0) - i.min),
      );
    const reduce = Math.min(excess, slack);
    heights[n] -= reduce;
    excess -= reduce;
  }
  const total = heights.reduce((a, b) => a + b, 0);
  const y = (t) => {
    let v = 0;
    for (let n = 0; n < heights.length; n++) {
      if (t >= times[n + 1]) v += heights[n];
      else if (t >= times[n]) {
        v +=
          (heights[n] * (minute(t) - minute(times[n]))) /
          (minute(times[n + 1]) - minute(times[n]));
        break;
      }
    }
    return v;
  };
  const axis = element("div", "", "axis time-axis");
  axis.style.height = total + "px";
  times.forEach((t) => {
    const label = element("span", t);
    label.style.top =
      (t === times.at(-1) ? total - 13 : Math.min(total - 29, y(t))) + "px";
    axis.append(label);
  });
  grid.append(axis);
  for (const d of days) {
    const col = element("div", "", "day");
    col.style.height = total + "px";
    for (let n = 1; n < times.length - 1; n++) {
      const line = element("i", "", "time-line");
      line.style.top = y(times[n]) + "px";
      col.append(line);
    }
    col.ondblclick = (e) => {
      if (e.target === col || e.target.classList.contains("time-line"))
        onNew(d, true);
    };
    const events = visible.filter((r) => r.item.date === d && r.item.start),
      tracks = lanes(events);
    for (const r of events) {
      const card = eventCard(r, onEdit, onToggle),
        { lane, count } = tracks.get(r.id);
      card.style.top = y(r.item.start) + "px";
      card.style.height =
        Math.max(1, y(r.item.end) - y(r.item.start) - 4) + "px";
      card.style.left = `calc(${(lane / count) * 100}% + 4px)`;
      card.style.width = `calc(${100 / count}% - 8px)`;
      col.append(card);
    }
    grid.append(col);
  }
  grid.append(element("div", "TODO & 提醒 · 只有日期，不限定时间", "section"));
  grid.append(element("div", "TODO", "axis todo-axis"));
  for (const d of days) {
    const col = element("div", "", "todos");
    col.dataset.date = d;
    for (const r of visible.filter((r) => r.item.date === d && !r.item.start))
      col.append(todoCard(r, onEdit, onToggle));
    col.append(action("＋ TODO", () => onNew(d, false), "add-todo"));
    grid.append(col);
  }
  page.append(grid);
  return page;
}
export function sidebarSummary(selected, items) {
  const list = items.filter((r) => r.item.date === selected),
    done = list.filter((r) => r.item.done).length;
  const box = element("div", "", "summary-card");
  box.append(
    element(
      "p",
      selected === localDate() ? "今天的节奏" : "所选日期",
      "eyebrow",
    ),
    element(
      "strong",
      Number(selected.slice(5, 7)) + "月" + Number(selected.slice(8)) + "日",
      "summary-date",
    ),
  );
  const counts = element("div", "", "summary-counts");
  for (const [count, label] of [
    [list.filter((r) => r.item.start).length, "日程"],
    [list.filter((r) => !r.item.start && !r.item.done).length, "待办"],
  ]) {
    const c = element("div");
    c.append(element("b", String(count)), element("span", label));
    counts.append(c);
  }
  box.append(counts);
  const progress = element("progress");
  progress.max = Math.max(list.length, 1);
  progress.value = done;
  progress.setAttribute("aria-label", "完成进度");
  box.append(
    progress,
    element(
      "small",
      list.length
        ? done + " / " + list.length + " 项已完成"
        : "慢慢安排，不必填满每一刻。",
    ),
  );
  return box;
}
