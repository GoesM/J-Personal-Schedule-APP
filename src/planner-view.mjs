import { localDate, shift, color, lanes } from "./model.mjs";
import { splitter } from './splitter.mjs';
import { timeScale, clock, resizeRange } from './time-scale.mjs';
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
export function dateStrip(anchor, selected, onSelect, items, view = "agenda") {
  const strip = element("div", "", "date-strip");
  strip.setAttribute(
    "aria-label",
    view === "week" ? "七日日期导航" : "前后七天日期导航",
  );
  if (view === "week") strip.append(element("span", "日期", "strip-axis"));
  for (let n = view === "week" ? -1 : -7; n <= (view === "week" ? 5 : 7); n++) {
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
// Controls redraw this timeline only, preserving the user's pane split and scroll.
function adaptiveTimeline(container, header, days, records, onEdit, onToggle, onNew) {
  let weights=[];
  try { const value=JSON.parse(localStorage.getItem('timeline-minute-heights')); if(Array.isArray(value) && value.length===1440 && value.every(n=>Number.isFinite(n)&&n>0)) weights=value; } catch {}
  const persist=()=>localStorage.setItem('timeline-minute-heights',JSON.stringify(weights));
  header.append(action('重置高度',()=>{weights=[];localStorage.removeItem('timeline-minute-heights');draw();},'time-height-reset'));
  function draw() {
    const events=records.filter(r=>r.item.start);
    if(!events.length) {
      container.replaceChildren(empty('这段时间没有日程', '点击 ＋ 日程，安排新的事项。'));
      return;
    }
    const scale=timeScale(events.map(r=>r.item), weights);
    const grid=element('div','','timeline-grid adaptive-grid');
    grid.style.gridTemplateColumns=`var(--axis-width, 50px) repeat(${days.length}, minmax(0, 1fr))`;
    const axis=element('div','','axis time-axis');
    axis.style.height=scale.total+'px';
    const eventTimes=new Set(events.flatMap(r=>[r.item.start,r.item.end]));
    for(const point of scale.points) {
      // Keep both edges of a compressed gap: the preceding event's end above
      // the break, and the next event's start below. Never suppress event ends.
      if(!eventTimes.has(clock(point))) continue;
      const above=scale.segments.some(s=>s.folded && s.start===point);
      const top=Math.max(0,Math.min(scale.total-13,scale.y(point)-(above?13:0)));
      const label=element('span',clock(point));label.style.top=top+'px';axis.append(label);
    }
    grid.append(axis);
    for(const date of days) {
      const col=element('div','','day');col.style.height=scale.total+'px';
      for(const point of scale.points.slice(1,-1)) {
        const line=element('i','','time-line');line.style.top=scale.y(point)+'px';col.append(line);
      }
      col.ondblclick=e=>{if(e.target===col || e.target.classList.contains('time-line')) onNew(date,true);};
      const daily=events.filter(r=>r.item.date===date), tracks=lanes(daily);
      for(const r of daily) {
        const card=eventCard(r,onEdit,onToggle), {lane,count}=tracks.get(r.id);
        card.style.top=scale.y(r.item.start)+'px';
        card.style.height=(scale.y(r.item.end)-scale.y(r.item.start))+'px';
        card.style.left=`calc(${lane/count*100}% + 4px)`;
        card.style.width=`calc(${100/count}% - 8px)`;
        const grip=action('⋯',e=>e.stopPropagation(),'event-resize');
        grip.title='拖动调整显示高度；同时间段各天一起调整，不改变日程时间';
        grip.setAttribute('aria-label','调整 '+r.item.title+' 显示高度（上下方向键）');
        grip.onpointerdown=e=>{
          if(e.button!==0) return;
          e.preventDefault();e.stopPropagation();
          const origin=e.clientY, base=[...weights], pointer=e.pointerId;
          const move=ev=>{if(ev.pointerId!==pointer) return;weights=resizeRange(base,events.map(x=>x.item),r.item.start,r.item.end,ev.clientY-origin);draw();};
          const stop=()=>{persist();window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',stop);window.removeEventListener('pointercancel',stop);window.removeEventListener('blur',stop);};
          window.addEventListener('pointermove',move);window.addEventListener('pointerup',stop);window.addEventListener('pointercancel',stop);window.addEventListener('blur',stop);
        };
        grip.onkeydown=e=>{
          if(!['ArrowUp','ArrowDown'].includes(e.key)) return;
          e.preventDefault();weights=resizeRange(weights,events.map(x=>x.item),r.item.start,r.item.end,e.key==='ArrowUp'?-24:24);persist();draw();
          [...container.querySelectorAll('.event')].find(c=>c.dataset.itemId===r.id)?.querySelector('.event-resize')?.focus({preventScroll:true});
        };
        card.append(grip);
        col.append(card);
      }
      grid.append(col);
    }
    for(const s of scale.segments.filter(s=>s.folded)) {
      const gap=element('div','','idle-gap');
      gap.title=`${clock(s.start)}–${clock(s.end)}`;
      gap.setAttribute('aria-label',`已压缩时段 ${clock(s.start)}–${clock(s.end)}`);
      gap.style.top=s.top+'px';
      grid.append(gap);
    }
    container.replaceChildren(grid);
  }
  draw();
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
    heading("当日日程", events.length + " 个安排 · 有明确时间", () =>
      onNew(selected, true),
    ),
  );
  const timeline = element("div", "", "agenda-timeline");
  adaptiveTimeline(timeline, timed.querySelector('.section-heading'), [selected], events, onEdit, onToggle, onNew);
  timed.append(timeline);
  timed.append(action("＋ 日程", () => onNew(selected, true), "add-schedule"));
  const task = element("section", "", "agenda-section");
  task.append(
    heading(
      "当日TODO",
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
  page.append(timed, splitter(timeline,[col],Math.max(400,window.innerHeight-320)), task);
  return page;
}
export function overview({
  selected,
  items,
  onSelect,
  onEdit,
  onNew,
  onToggle,
  timelineHeight,
}) {
  const days = Array.from({ length: 7 }, (_, n) => shift(selected, n - 1));
  const page = element("div", "", "overview");
  const summary = element("div", "", "section-heading overview-heading");
  summary.append(
    element("h3", "当日日程"),
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
  // A labelled add action immediately under each date, never covering an event.
  grid.append(element("div", "时间", "axis schedule-add-axis"));
  for (const d of days) {
    const row = element("div", "", "schedule-add-cell");
    row.dataset.date = d;
    const add = action("＋ 日程", () => onNew(d, true), "add-schedule");
    add.setAttribute("aria-label", d + " 新建日程");
    row.append(add);
    grid.append(row);
  }
  const visible = items.filter((r) => days.includes(r.item.date));
  const target = timelineHeight || 480;
  const timedScroll = element("div", "", "timed-scroll");
  timedScroll.style.maxHeight = target + "px";
  timedScroll.setAttribute("aria-label", "当日日程时间轴，可滚动查看更多时段");
  timedScroll.tabIndex = 0;
  adaptiveTimeline(timedScroll, summary, days, visible, onEdit, onToggle, onNew);
  grid.append(timedScroll);
  const todoHeading=element('div','','section-heading todo-heading');
  todoHeading.append(element('h3','当日TODO'),element('span','只有日期，不限定时间','subtle'));
  grid.append(todoHeading);
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
  grid.insertBefore(splitter(timedScroll,grid.querySelectorAll('.todos'),Math.max(360,target+210)),todoHeading);
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
