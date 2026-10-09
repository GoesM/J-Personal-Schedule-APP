/** Chromium layout QA for this app only, using the disposable localhost preview. */
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
app.setPath(
  "userData",
  fs.mkdtempSync(path.join(require("node:os").tmpdir(), "j-ui-test-")),
);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const out = path.resolve("env/ui-" + require("../package.json").version);
  fs.mkdirSync(out, { recursive: true });
  const win = new BrowserWindow({
    show: false,
    width: 1320,
    height: 900,
    useContentSize: true,
    webPreferences: {
      offscreen: true,
      backgroundThrottling: false,
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  try {
    for (const [name, width, height, view] of [
      ["desktop", 1320, 900, "week"],
      ["compact-desktop", 1000, 800, "week"],
      ["mobile", 390, 844, "agenda"],
      ["small-mobile", 360, 740, "agenda"],
    ]) {
      win.setContentSize(width, height);
      await win.loadURL("http://127.0.0.1:4173");
      for (let n = 0; n < 100; n++) {
        if (
          await win.webContents.executeJavaScript(
            'document.querySelectorAll(".long-card").length===5',
          )
        )
          break;
        await pause(30);
      }
      await pause(180);
      const layout = await win.webContents.executeJavaScript(
        `(() => { const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right};};return {view:document.body.dataset.view,width:innerWidth,height:innerHeight,bodyWidth:document.body.scrollWidth,calendar:rect('#calendar'),toolbar:rect('.planner-toolbar'),events:[...document.querySelectorAll('.event')].map(e=>({width:e.clientWidth,scrollWidth:e.scrollWidth,title:e.querySelector('strong').textContent})),dates:document.querySelectorAll('.date-choice').length}; })()`,
      );
      assert.equal(layout.view, view);
      assert.equal(
        await win.webContents.executeJavaScript("document.body.dataset.demo"),
        "true",
      );
      assert.equal(
        await win.webContents.executeJavaScript(
          'new Date().getFullYear()+"-"+(new Date().getMonth()+1)',
        ),
        "2026-5",
      );
      for (const event of layout.events)
        assert.ok(event.title.startsWith("Demo · "));
      console.log(name + " " + JSON.stringify(layout));
      console.log(
        "pane " +
          (await win.webContents.executeJavaScript(
            `JSON.stringify({pane:document.querySelector('.daily-pane').clientHeight,axis:document.querySelector('.time-axis')?.clientHeight,todos:document.querySelector('.grid .todos')?.clientHeight,grid:document.querySelector('.grid')?.clientHeight})`,
          )),
      );
      assert.equal(layout.dates, view === "week" ? 7 : 15);
      assert.equal(
        await win.webContents.executeJavaScript(
          'document.getElementById("view-range")',
        ),
        null,
      );
      assert.equal(
        await win.webContents.executeJavaScript(
          'document.querySelectorAll(".course").length',
        ),
        0,
      );
      assert.equal(
        await win.webContents.executeJavaScript(
          'document.querySelectorAll(".add-schedule").length',
        ),
        view === "week" ? 7 : 1,
      );
      assert.ok(
        layout.bodyWidth <= layout.width,
        `${name}: page horizontally overflows`,
      );
      if (view === "agenda") {
        assert.ok(
          layout.calendar.y < 340,
          "Mobile header consumes too much height",
        );
        for (const event of layout.events)
          assert.ok(
            event.width >= 210 && event.scrollWidth <= event.width,
            "Mobile event is too narrow or overflows",
          );
      }
      if (view === "week") {
        const aligned = await win.webContents.executeJavaScript(`(() => {
          const rects = s => [...document.querySelectorAll(s)].map(e=>{const r=e.getBoundingClientRect();return {x:r.x,width:r.width};});
          return {nav:rects('.date-choice'),days:rects('.day'),todos:rects('.grid .todos')};
        })()`);
        for (let n = 0; n < 7; n++)
          for (const key of ["days", "todos"]) {
            assert.ok(
              Math.abs(aligned.nav[n].x - aligned[key][n].x) < 1,
              key + " date column is not aligned",
            );
            assert.ok(
              Math.abs(aligned.nav[n].width - aligned[key][n].width) < 1,
              key + " width is not aligned",
            );
          }
        await win.webContents.executeJavaScript(
          'document.querySelector(".timed-scroll").scrollTop=180;document.querySelector(".daily-pane").scrollLeft=100',
        );
        const afterScroll = await win.webContents.executeJavaScript(
          `(() => {const a=[...document.querySelectorAll('.date-choice')],b=[...document.querySelectorAll('.day')],c=[...document.querySelectorAll('.grid .todos')];return a.map((e,n)=>({a:e.getBoundingClientRect().x,b:b[n].getBoundingClientRect().x,c:c[n].getBoundingClientRect().x}));})()`,
        );
        for (const r of afterScroll) {
          assert.ok(Math.abs(r.a - r.b) < 1);
          assert.ok(Math.abs(r.a - r.c) < 1);
        }
        await win.webContents.executeJavaScript(
          'document.querySelector(".timed-scroll").scrollTop=0;document.querySelector(".daily-pane").scrollLeft=0',
        );
      }
      await fs.promises.writeFile(
        path.join(out, name + ".png"),
        (await win.webContents.capturePage()).toPNG(),
      );
      const syncOverlay = await win.webContents.executeJavaScript(
        `(() => { const overlay=document.querySelector('#sync-overlay');overlay.hidden=false;const r=overlay.getBoundingClientRect();const card=overlay.querySelector('.sync-progress').getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height,cardRight:card.right,cardBottom:card.bottom}; })()`,
      );
      assert.equal(syncOverlay.left, 0);
      assert.equal(syncOverlay.top, 0);
      assert.equal(syncOverlay.width, layout.width);
      assert.equal(syncOverlay.height, layout.height);
      assert.ok(
        syncOverlay.cardRight <= layout.width &&
          syncOverlay.cardBottom <= layout.height,
      );
      await fs.promises.writeFile(
        path.join(out, name + "-sync.png"),
        (await win.webContents.capturePage()).toPNG(),
      );
      await win.webContents.executeJavaScript(
        'document.querySelector("#sync-overlay").hidden=true',
      );
      if (name === "mobile") {
        await win.webContents.executeJavaScript(
          'document.getElementById("page-long").click()',
        );
        const longPage = await win.webContents.executeJavaScript(
          `({page:document.body.dataset.page,daily:getComputedStyle(document.querySelector('.daily-pane')).display,long:getComputedStyle(document.querySelector('#long-pane')).display,scrollWidth:document.body.scrollWidth})`,
        );
        assert.equal(longPage.page, "long");
        assert.equal(longPage.daily, "none");
        assert.equal(longPage.long, "block");
        assert.ok(longPage.scrollWidth <= width);
        await fs.promises.writeFile(
          path.join(out, "mobile-long.png"),
          (await win.webContents.capturePage()).toPNG(),
        );
        await win.webContents.executeJavaScript(
          'document.querySelector(".long-completed").open=true',
        );
        await pause(80);
        await fs.promises.writeFile(
          path.join(out, "mobile-long-completed.png"),
          (await win.webContents.capturePage()).toPNG(),
        );
        await win.webContents.executeJavaScript(
          'document.querySelector(".add-long").click()',
        );
        await pause(80);
        const longForm = await win.webContents.executeJavaScript(
          `({kind:document.querySelector('[name="entryType"]').value,dateHidden:document.querySelector('[name="date"]').disabled,ddlRequired:document.querySelector('[name="ddl"]').required})`,
        );
        assert.equal(longForm.kind, "longtodo");
        assert.equal(longForm.dateHidden, true);
        assert.equal(longForm.ddlRequired, false);
        await fs.promises.writeFile(
          path.join(out, "mobile-long-editor.png"),
          (await win.webContents.capturePage()).toPNG(),
        );
        await win.webContents.executeJavaScript(
          'document.getElementById("cancel").click();document.getElementById("page-daily").click()',
        );
        await win.webContents.executeJavaScript(
          'document.querySelector(".event .check-toggle").click()',
        );
        for (let n = 0; n < 100; n++) {
          if (
            await win.webContents.executeJavaScript(
              'document.querySelector(".event").classList.contains("done")',
            )
          )
            break;
          await pause(20);
        }
        assert.equal(
          await win.webContents.executeJavaScript(
            'document.querySelector(".event").classList.contains("done")',
          ),
          true,
        );
        assert.equal(
          await win.webContents.executeJavaScript(
            'document.querySelector("#dialog").open',
          ),
          false,
        );
        await fs.promises.writeFile(
          path.join(out, "mobile-completed.png"),
          (await win.webContents.capturePage()).toPNG(),
        );
        await win.webContents.executeJavaScript(
          'document.querySelector(".event .check-toggle").click()',
        );
        await pause(80);
        await win.webContents.executeJavaScript(
          'document.querySelector("#add").click()',
        );
        await pause(80);
        const form = await win.webContents.executeJavaScript(
          `(() => {const r=document.querySelector('#dialog').getBoundingClientRect();return {width:r.width,right:r.right,bottom:r.bottom,height:innerHeight};})()`,
        );
        assert.ok(form.right <= width + 1 && form.bottom <= height + 1);
        await fs.promises.writeFile(
          path.join(out, "mobile-editor.png"),
          (await win.webContents.capturePage()).toPNG(),
        );
        await win.webContents.executeJavaScript(
          'document.querySelector("#cancel").click();document.querySelector("#menu").click()',
        );
        await pause(80);
        assert.equal(
          await win.webContents.executeJavaScript(
            'getComputedStyle(document.querySelector(".sidebar")).display',
          ),
          "flex",
        );
        await fs.promises.writeFile(
          path.join(out, "mobile-menu.png"),
          (await win.webContents.capturePage()).toPNG(),
        );
      }
    }
    console.log("UI_LAYOUT_PASS");
    app.exit(0);
  } catch (e) {
    console.error(e);
    app.exit(1);
  }
});
