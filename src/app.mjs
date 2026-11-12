import { localDate, shift, color } from "./model.mjs";
import {
  call,
  load,
  records,
  save,
  importOps,
  importLongHeads,
  exportBackup,
  loadLongTrash,
  hasActiveWrites,
  freeze,
} from "./store.mjs";
import { synchronize, hasPendingChanges } from "./sync.mjs";
import { createExitController } from "./exit.mjs";
import { itemFromForm } from "./item-form.mjs";
import { longTodoList } from "./long-view.mjs";
import { applyPersona, personaPicker, normalizePersona } from "./personas.mjs";
import { cloudPersona, saveCloudPersona } from './store.mjs';
import { connectPet } from './pet-integration.mjs';
async function refreshCloudPersona(reset=false) {
  const chosen=await cloudPersona();
  const id=chosen || (reset?'ISTJ':appearance.persona);
  if(id!==appearance.persona) appearance=await call('saveAppearance',id);
  applyPersona(id);
}
let appearance = { persona: 'ISTJ' };
import {
  dateStrip,
  agenda,
  overview,
  sidebarSummary,
} from "./planner-view.mjs";
const $ = (id) => document.getElementById(id);
function focusToday() {
  const day = document.querySelector(".date-choice.selected");
  if (day)
    day.parentElement.scrollLeft = Math.max(
      0,
      day.offsetLeft -
        day.parentElement.offsetLeft -
        day.parentElement.clientWidth / 2 +
        day.clientWidth / 2,
    );
}
let settings = {},
  center = localDate(),
  selected = center,
  viewPreference = "auto",
  editing = null,
  mode = "item",
  locked = false,
  page = "daily",
  completedOpen = false;
let initialized = false,
  pendingActions = 0,
  renderedDay = localDate();
const text = (tag, value, cls) => {
  const e = document.createElement(tag);
  e.textContent = value;
  if (cls) e.className = cls;
  return e;
};
const status = (s) => ($("status").textContent = s);
let petDraft=false;
window.native.onPetDraft?.(value=>{petDraft=value;});
const petConnection=connectPet({bridge:window.native,getRows:records,save,
  isBusy:()=>!initialized||locked||pendingActions>0||hasActiveWrites()||document.body.inert,
  getPersona:()=>appearance.persona,render,begin:()=>pendingActions++,end:()=>pendingActions--,
  openItem:id=>{const row=records().find(r=>r.id===id&&!r.deleted);if(row)editor(row.item,row);},
});
if(window.native.onPetCommand){
  const petButton=document.createElement('button');petButton.textContent='桌宠 · 显示 / 隐藏';petButton.id='desktop-pet';
  petButton.onclick=()=>call('petToggle').catch(e=>status(e.message));
  document.querySelector('.tools').prepend(petButton);
}
function dialog(title, type) {
  closeMenu();
  mode = type;
  $("formTitle").textContent = title;
  $("fields").replaceChildren();
  $("dialog").showModal();
  $("form").querySelector("button[type=submit]").hidden = false;
}
function field(name, label, value, type = "text") {
  const l = text("label", label, "field");
  const i = document.createElement(type === "textarea" ? "textarea" : "input");
  if (type !== "textarea") i.type = type;
  i.name = name;
  if (type === "checkbox") i.checked = !!value;
  else i.value = value ?? "";
  l.append(i);
  $("fields").append(l);
  return i;
}
function editor(
  item = {
    date: selected,
    kind: "schedule",
    title: "",
    start: "09:00",
    end: "10:00",
    notes: "",
    location: "",
  },
  r = null,
) {
  editing = r;
  dialog(r ? "编辑事项" : "新建事项", "item");
  field("title", "标题", item.title).required = true;
  const date = field("date", "日期", item.date || selected, "date");
  const typeLabel = text("label", "事项类型", "field");
  const entryType = document.createElement("select");
  entryType.name = "entryType";
  for (const [value, label] of [
    ["schedule", "日程"],
    ["todo", "单日 TODO"],
    ["longtodo", "长期 TODO"],
  ]) {
    const option = text("option", label);
    option.value = value;
    // The two stores preserve different causal histories. A copy can choose any
    // category; existing items stay in their original store.
    if (r && (item.kind === "longtodo") !== (value === "longtodo"))
      option.disabled = true;
    entryType.append(option);
  }
  entryType.value =
    item.kind === "longtodo" ? "longtodo" : item.start ? "schedule" : "todo";
  typeLabel.append(entryType);
  $("fields").append(typeLabel);
  const start = field("start", "开始时间", item.start || "09:00", "time");
  const end = field("end", "结束时间", item.end || "10:00", "time");
  const ddl = field("ddl", "DDL / 截止日期（可不填）", item.ddl, "date");
  const location = field("location", "地点", item.location);
  field("notes", "备注", item.notes, "textarea");
  const updateType = () => {
    const scheduled = entryType.value === "schedule";
    const long = entryType.value === "longtodo";
    $("formTitle").textContent =
      (r ? "编辑" : "新建") +
      (long ? "长期 TODO" : scheduled ? "日程" : "单日 TODO");
    $("fields").querySelector(
      '[name="title"]',
    ).parentElement.firstChild.nodeValue = long ? "待办内容" : "标题";
    date.disabled = long;
    date.required = !long;
    date.parentElement.hidden = long;
    ddl.disabled = !long;
    ddl.parentElement.hidden = !long;
    location.disabled = long;
    location.parentElement.hidden = long;
    const repeat = $("fields").querySelector('[name="repeat"]');
    if (repeat) {
      repeat.disabled = long;
      repeat.parentElement.hidden = long;
    }
    for (const input of [start, end]) {
      input.disabled = !scheduled;
      input.parentElement.hidden = !scheduled;
    }
    start.required = end.required = scheduled;
    if (scheduled) {
      start.value ||= "09:00";
      end.value ||= "10:00";
    } else {
      start.value = end.value = "";
    }
  };
  entryType.onchange = updateType;
  updateType();
  field("important", "重要", item.important, "checkbox");
  field("done", "已完成", item.done, "checkbox");
  if (!r) {
    const repeat = field("repeat", "每周重复次数（1–52）", 1, "number");
    repeat.min = 1;
    repeat.max = 52;
  } else {
    const actions = text("div", "", "actions");
    for (const [label, fn] of [
      [
        "删除",
        () => {
          if (actions.querySelector('.delete-confirm')) return;
          // Keep confirmation inside the editor: native confirm + closing a
          // modal can leave the Windows WebContents without keyboard focus.
          const panel = text('div', '', 'delete-confirm');
          panel.setAttribute('role', 'group');
          panel.setAttribute('aria-label', '确认删除');
          panel.append(text('p', '确认删除此事项？删除后无法在应用内恢复。'));
          const accept = text('button', '确认删除');
          const cancel = text('button', '保留事项');
          accept.type = cancel.type = 'button';
          cancel.onclick = () => { panel.remove(); actions.querySelector('button').focus(); };
          accept.onclick = async () => {
            if (locked || pendingActions) return;
            pendingActions++;
            accept.disabled = cancel.disabled = true;
            try {
              await save(item, r, true);
              $("dialog").close();
              render();
              $("add").focus({preventScroll:true});
              status('已删除');
            } catch (error) {
              status('删除失败：' + error.message);
              accept.disabled = cancel.disabled = false;
              cancel.focus();
            } finally { pendingActions--; }
          };
          panel.append(cancel, accept);
          actions.append(panel);
          cancel.focus();
        },
      ],
      [
        "复制",
        () => {
          $("dialog").close();
          editor({ ...item, title: item.title + "（副本）" });
        },
      ],
    ]) {
      const b = text("button", label);
      b.type = "button";
      b.onclick = fn;
      actions.append(b);
    }
    $("fields").append(actions);
    if (r.conflict)
      $("fields").append(
        text(
          "p",
          "存在多端版本冲突：保存当前表单将合并所有版本。请先在“冲突”中查看所有版本。",
        ),
      );
  }
  updateType();
}
const currentView = () =>
  viewPreference === "auto"
    ? window.innerWidth < 760
      ? "agenda"
      : "week"
    : viewPreference;
function closeMenu() {
  document.body.classList.remove("menu-open");
  $("menu").setAttribute("aria-expanded", "false");
}
function render() {
  petConnection.publish();
  renderedDay = localDate();
  const all = records(),
    visible = all.filter((r) => !r.deleted && r.item.kind !== "longtodo"),
    view = currentView();
  document.body.dataset.view = view;
  document.body.dataset.page = page;
  $("center").value = selected;
  $("period-title").textContent =
    window.innerWidth < 760 && page === "long"
      ? "长期 TODO"
      : Number(selected.slice(0, 4)) +
        "年 " +
        Number(selected.slice(5, 7)) +
        "月";
  $("conflicts").textContent =
    "版本冲突 (" + all.filter((r) => r.conflict).length + ")";
  for (const v of ["week", "agenda"])
    $("view-" + v).setAttribute("aria-pressed", String(view === v));
  $("prev").setAttribute("aria-label", view === "agenda" ? "前一天" : "上一周");
  $("next").setAttribute("aria-label", view === "agenda" ? "后一天" : "下一周");
  const query = $("search").value.toLowerCase();
  const items = visible.filter((r) =>
    JSON.stringify(r.item).toLowerCase().includes(query),
  );
  const onSelect = (d) => {
    selected = d;
    if (d < shift(center, -7) || d > shift(center, 7)) center = d;
    render();
    focusToday();
  };
  $("date-nav").replaceChildren(
    dateStrip(
      view === "week" ? selected : center,
      selected,
      onSelect,
      visible,
      view,
    ),
  );
  $("summary").replaceChildren(sidebarSummary(selected, visible));
  const options = {
    selected,
    view,
    items,
    onSelect,
    onEdit: editor,
    timelineHeight: Math.max(
      280,
      (document.querySelector(".daily-pane").clientHeight ||
        window.innerHeight - 100) - 480,
    ),
    onNew: (date, timed) =>
      editor({
        date,
        title: "",
        kind: timed ? "schedule" : "todo",
        start: timed ? "09:00" : "",
        end: timed ? "10:00" : "",
      }),
    onToggle: async (r) => {
      if (locked || pendingActions) return;
      pendingActions++;
      try {
        await save({ ...r.item, done: !r.item.done }, r);
        render();
        status("完成状态已保存");
      } catch (e) {
        status(e.message);
      } finally {
        pendingActions--;
      }
    },
  };
  $("calendar").replaceChildren(
    view === "agenda" ? agenda(options) : overview(options),
  );
  const longItems = all.filter((r) => r.item.kind === "longtodo");
  $("long-badge").textContent = String(
    longItems.filter((r) => !r.deleted && !r.item.done).length,
  );
  for (const p of ["daily", "long"])
    $("page-" + p).setAttribute("aria-pressed", String(page === p));
  $("long-pane").replaceChildren(
    longTodoList({
      items: longItems,
      query,
      onEdit: editor,
      onToggle: options.onToggle,
      onNew: () => editor({ title: "", kind: "longtodo", ddl: "", notes: "" }),
      completedOpen,
      onCompletedToggle: (open) => {
        completedOpen = open;
      },
    }),
  );
  if (query) {
    const results = visible
      .filter((r) => JSON.stringify(r.item).toLowerCase().includes(query))
      .sort((a, b) => a.item.date.localeCompare(b.item.date));
    const panel = text("section", "", "search-panel");
    panel.append(text("h3", "全部日期搜索结果 (" + results.length + ")"));
    for (const r of results.slice(0, 100)) {
      const b = text("button", r.item.date + " · " + r.item.title);
      b.onclick = () => {
        center = r.item.date;
        selected = center;
        render();
        editor(r.item, r);
      };
      panel.append(b);
    }
    if (results.length > 100)
      panel.append(text("p", "仅显示前100条，请缩小搜索范围"));
    $("calendar").prepend(panel);
  }
  focusToday();
}
$("form").onsubmit = async (e) => {
  e.preventDefault();
  if (locked || pendingActions) return;
  pendingActions++;
  try {
    const f = new FormData(e.target);
    if (mode === "appearance") {
      const next = normalizePersona(f.get('persona'));
      await saveCloudPersona(next);
      appearance = await call('saveAppearance', next);
      applyPersona(appearance.persona);
    } else if (mode === "settings") {
      const oldBinding =
        (settings.url || "") + "\n" + (settings.branch || "main");
      const longHeads = (await exportBackup()).longTodoHeads;
      settings = {
        url: String(f.get("url")).trim(),
        user: String(f.get("user")).trim(),
        token: String(f.get("token")),
        branch: String(f.get("branch")).trim() || "main",
      };
      await call("saveSettings", settings);
      await load();
      await refreshCloudPersona(true);
      if (oldBinding !== (settings.url || "") + "\n" + settings.branch)
        await importLongHeads(longHeads);
    } else if (mode === "item") {
      const i = itemFromForm(f);
      const repeat =
        editing || i.kind === "longtodo" ? 1 : Number(f.get("repeat") || 1);
      if (!Number.isInteger(repeat) || repeat < 1 || repeat > 52)
        throw Error("重复次数为1–52");
      for (let n = 0; n < repeat; n++)
        await save(
          i.kind === "longtodo" ? i : { ...i, date: shift(i.date, n * 7) },
          editing,
        );
    }
    $("dialog").close();
    render();
    status(mode === 'appearance' && appearance.shortcutWarning
      ? '图标已保存；快捷方式更新失败：' + appearance.shortcutWarning : "已保存到本机");
  } catch (e) {
    status(e.message);
  } finally {
    pendingActions--;
  }
};
$("cancel").onclick = () => $("dialog").close();
$("add").onclick = () =>
  page === "long" && window.innerWidth < 760
    ? editor({ title: "", kind: "longtodo", ddl: "", notes: "" })
    : editor();
$("today").onclick = () => {
  center = selected = localDate();
  render();
  focusToday();
};
$("prev").onclick = () => {
  const step = currentView() === "agenda" ? 1 : 7;
  selected = shift(selected, -step);
  center = selected;
  render();
  focusToday();
};
$("next").onclick = () => {
  const step = currentView() === "agenda" ? 1 : 7;
  selected = shift(selected, step);
  center = selected;
  render();
  focusToday();
};
$("center").onchange = (e) => {
  if (e.target.value) {
    center = selected = e.target.value;
    render();
    focusToday();
  }
};
$("search").oninput = render;
$("search-toggle").onclick = () => {
  const open = document.body.classList.toggle("search-open");
  $("search-toggle").setAttribute("aria-expanded", String(open));
  if (open) $("search").focus();
  else {
    $("search").value = "";
    render();
  }
};
for (const view of ["week", "agenda"])
  $("view-" + view).onclick = () => {
    viewPreference = view;
    render();
    focusToday();
  };
for (const p of ["daily", "long"])
  $("page-" + p).onclick = () => {
    page = p;
    render();
  };
for (const button of document.querySelectorAll(".tools button,.tools label")) {
  button.title = button.textContent.trim();
  button.setAttribute("aria-label", button.textContent.trim());
}
for (const swatch of document.querySelectorAll(".legend span"))
  swatch.title = swatch.textContent;
$("menu").onclick = () => {
  document.body.classList.toggle("menu-open");
  $("menu").setAttribute(
    "aria-expanded",
    String(document.body.classList.contains("menu-open")),
  );
};
$("menu-close").onclick = $("menu-backdrop").onclick = closeMenu;
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeMenu();
});
let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    render();
    focusToday();
  }, 100);
});
$("settings").onclick = () => {
  dialog("仓库设置（凭据只保存在本机）", "settings");
  field(
    "url",
    "HTTPS 私有仓库地址",
    settings.url || "https://gitee.com/GoesM/j-personal-schedule.git",
  );
  field("user", "Git 用户名", settings.user || "GoesM");
  field("token", "访问令牌（仓库读写权限）", settings.token || "", "password");
  field("branch", "分支", settings.branch || "main");
  $("fields").append(
    text(
      "p",
      "修改仓库或分支会切换到独立数据目录，并复制现有事项（不复制Git历史），旧数据保留。令牌不会进入备份，不要把令牌写进URL。",
    ),
  );
};
$("appearance").onclick = () => {
  dialog('个性化图标', 'appearance');
  $("fields").append(personaPicker(appearance.persona));
  $("fields").append(text('p', appearance.platform === 'android'
    ? '保存后更新应用内与桌面启动图标；桌面可能需要几秒刷新。形象随“与云端同步”上传；使用同一仓库和分支的设备会自动应用。'
    : '保存后更新应用内与窗口图标。EXE 文件图标固定为默认形象；桌面可使用个性化快捷方式。形象随“与云端同步”上传；使用同一仓库和分支的设备会自动应用。'));
  if (appearance.platform === 'windows') {
    const button = text('button', '创建备用桌面快捷方式');
    button.type = 'button'; button.className = 'persona-shortcut';
    button.onclick = async () => {
      button.disabled = true;
      try {
        // A shortcut always uses the saved choice, never an unsaved radio draft.
        const result = await call('personaShortcut');
        button.textContent = result;
      } catch (error) { button.textContent = error.message; }
      finally { button.disabled = false; }
    };
    $("fields").append(button, text('p', '保存或同步形象后，release 入口及桌面上指向本程序的快捷方式自动换图标，无需重新创建。启动时也会检查补齐。此按钮仅用于额外创建一个快捷方式；移动整个 release 目录后需修复入口。'));
  }
  $("fields").append(text('p', '人物素材：16Personalities / NERIS Analytics Limited；日程组合图标来自本地 J 人形象设计包。'));
};
async function sync(push = true, throwOnFailure = false) {
  if (locked) throw Error("正在同步，请稍候");
  locked = true;
  petConnection.publish();
  $("sync").disabled = true;
  $("sync-overlay").hidden = false;
  $("sync-progress-title").textContent = push
    ? "正在与云端同步"
    : "正在更新日程";
  $("sync-progress-detail").textContent = push
    ? "正在保存、拉取并上传，请稍候"
    : "正在拉取云端最新内容，请稍候";
  document.body.setAttribute("aria-busy", "true");
  status(push ? "正在保存、拉取、推送…" : "启动时拉取远端…");
  try {
    let result=await synchronize(settings, push);
    // Migrate an existing local choice only after a successful pull proves there
    // is no cloud preference. Never let a fresh device overwrite a remote choice.
    if(!(await cloudPersona())) {
      await saveCloudPersona(appearance.persona);
      if(push) result=await synchronize(settings,true);
    }
    await refreshCloudPersona();
    status(result);
    render();
  } catch (e) {
    status(e.message);
    if (throwOnFailure) throw e;
  } finally {
    locked = false;
    petConnection.publish();
    $("sync").disabled = false;
    $("sync-overlay").hidden = true;
    document.body.removeAttribute("aria-busy");
  }
}
$("sync").onclick = () => sync();
window.addEventListener('sync-progress', e => {
  $("sync-progress-detail").textContent=e.detail;
});
const requestExit = createExitController({
  waitForIdle: async () => {
    while (!initialized || locked || pendingActions || hasActiveWrites()) {
      status("正在等待本地保存或同步完成，再检查退出…");
      await new Promise((r) => setTimeout(r, 50));
    }
    freeze(true);
  },
  hasPending: () => hasPendingChanges(settings),
  synchronize: () => sync(true, true),
  confirm: (message) => window.confirm(message),
  finish: () => call("exit"),
  notify: status,
  hasDraft: () => petDraft || ($("dialog").open && ["item", "settings", "appearance"].includes(mode)),
  suspend: (value) => {
    document.body.inert = value;
    if (!value) freeze(false);
  },
});
window.addEventListener("native-exit-request", requestExit);
window.native.onExitRequest?.(requestExit);
window.jExitReady = true;
if (window.native.exitTesting)
  window.confirm = (message) => {
    window.native
      .invoke("exitTestPrompt", [message])
      .catch((e) => status(e.message));
    return false;
  };
$("quit").onclick = requestExit;
// Refresh fills without rebuilding the view or losing an open editor/scroll position.
function refreshColors() {
  // Crossing midnight also advances the seven-day completed window and today
  // markers. The editor is outside the view containers and keeps its draft.
  if (renderedDay !== localDate()) {
    render();
    return;
  }
  const map = new Map(records().map((r) => [r.id, r.item]));
  for (const card of document.querySelectorAll(".event,.todo,.long-card")) {
    const item = map.get(card.dataset.itemId);
    if (!item) continue;
    card.classList.remove("course", "future", "important", "past", "done");
    card.classList.add(color(item));
  }
}
setInterval(refreshColors, 60000);
window.addEventListener("focus", refreshColors);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshColors();
});
$("backup").onclick = async () => {
  try {
    const exported = await call(
      "export",
      JSON.stringify(await exportBackup(), null, 2),
    );
    status(exported ? "备份已导出" : "已取消导出");
  } catch (e) {
    status(e.message);
  }
};
$("import").onchange = async (e) => {
  try {
    const data = JSON.parse(await e.target.files[0].text());
    if (
      !["j-schedule-v1", "j-schedule-v2"].includes(data.format) ||
      !Array.isArray(data.operations)
    )
      throw Error("不支持的备份格式");
    if (
      confirm("导入 " + data.operations.length + " 条历史记录？同ID不会重复。")
    ) {
      await importOps(data.operations);
      if (data.format === "j-schedule-v2") {
        if (!Array.isArray(data.longTodoHeads))
          throw Error("长期TODO备份格式不正确");
        await importLongHeads(data.longTodoHeads);
      }
      render();
    }
  } catch (err) {
    status(err.message);
  }
  e.target.value = "";
};
async function list(type) {
  dialog("多端修改冲突", type);
  $("form").querySelector("button[type=submit]").hidden = true;
  for (const r of records().filter((r) =>
    r.conflict && !r.deleted,
  )) {
    const row = text("div", "", "listrow");
    row.append(
      text(
        "strong",
        (r.item.kind === "longtodo" ? "长期TODO · " : r.item.date + " ") +
          r.item.title,
      ),
    );
    for (const v of r.versions) {
      row.append(
        text(
          "p",
          JSON.stringify(v.item) +
            "\n修改时间 " +
            v.at +
            (v.deleted ? "（已删除）" : ""),
        ),
      );
      const b = text("button", "采用此版本");
      b.type = "button";
      b.onclick = async () => {
        await save(v.item, r, v.deleted);
        $("dialog").close();
        render();
      };
      row.append(b);
    }
    $("fields").append(row);
  }
}
$("conflicts").onclick = () => list("conflicts");
$("help").onclick = () => {
  dialog("操作指南", "help");
  try {
    const report=JSON.parse(localStorage.getItem('last-sync-performance')||'null');
    if(report) $("fields").append(text('p', '最近同步：'+(report.ok?'成功':'失败')+'，总耗时 '+(report.totalMs/1000).toFixed(2)+' 秒；原生调用 '+report.bridge.calls+' 次。'+Object.entries(report.stages).map(([k,v])=>k+' '+v+'ms').join('；')));
  } catch {}
  $("form").querySelector("button[type=submit]").hidden = true;
  for (const p of [
    "桌面左侧展示每日安排，右侧为长期TODO。手机在“每日安排”和“长期TODO”两个页面间切换。日期视图仅保留七日与单日，箭头分别移动一周或一天。七日日期导航与时间表使用相同的列宽和滚动区域。",
    "长期TODO包含内容、可选DDL和备注。有DDL的未完成事项按截止日期排序，无DDL的独立显示。已完成默认折叠，仅显示按完成时间计算的近7天；更早记录按月份保留在仓库中，并包含在完整备份里。点击正文编辑，点击方框完成或恢复。",
    "上方为有时间范围的日程，下方为只有日期的TODO。每个日期的“＋日程”和“＋TODO”分别创建对应类型；表单内也可切换。日程必须填写开始与结束时间；TODO没有时间输入框。双击日程空白区域也可新增日程。",
    "已完成的日程和TODO一律浅绿（包括当天及提前完成）。未完成日程按本地日期与结束时间判断，结束时间已到则浅灰；无时间TODO在日期过去后浅灰。其余普通浅黄、重要浅红。不再单独给课程染色。启动、每分钟及切回应用时刷新颜色；日程和TODO前的方框都可直接勾选。",
    "重复次数按每周一次展开，后续每个实例独立编辑。删除后不提供逐项恢复；同步保留最小删除标记，防止其他设备重新带回已删事项。",
    "在设置输入同一个私有Git仓库、分支、用户名和访问令牌。每台设备的凭据本地加密，不上传；请只给令牌必要的仓库权限。",
    "启动时先保存本机尚未提交的数据，再拉取；点击“与云端同步”提交→拉取/合并→推送。离线失败不会清除本地数据。",
    "桌宠开启时，关闭桌面主窗口仅收起界面；通过托盘或工具中的“退出程序”完全退出。完全退出或按安卓返回键时，会检查未提交和已提交但未上传的更改。可选择同步后退出，或直接退出。同步失败会再次确认，不会默默丢失数据。安卓系统强制结束/划掉后台任务时无法弹窗，请先主动同步。",
    "多端同时编辑同一事项会产生冲突，点击冲突查看各版本并选择。同步失败请检查网络、令牌权限和分支。不会强制推送或重置数据。",
    "请定期导出备份。日程仓库不是加密仓库，仓库管理员和服务商可能读取日程；不要存储密码等秘密。",
    "Windows数据在用户应用数据目录，安卓数据在应用内部存储。卸载前导出备份；安卓安装新版本需相同签名。桌面版桌宠运行期间提供无声提醒；安卓未增加系统闹钟。",
  ])
    $("fields").append(text("p", p));
};
(async () => {
  try {
    settings = await call("settings");
    // Older preview/test bridges can omit appearance without blocking calendar data.
    try { appearance = (await call('appearance')) || appearance; } catch {}
    applyPersona(appearance.persona);
    await load();
    await refreshCloudPersona();
    let verification = {};
    if (window.native.testing && !window.native.petTesting) {
      const { verifyNative } = await import("./smoke.mjs");
      verification = await verifyNative();
    }
    render();
    focusToday();
    await call("ready", {
      ...verification,
      days: document.querySelectorAll(".date-choice").length,
      items: records().length,
    });
    if (settings.url) await sync(false);
    else status("本地模式 · 先在设置配置私有仓库，再同步");
  } catch (e) {
    status(e.message);
  } finally {
    initialized = true;
    petConnection.publish();
  }
})();
