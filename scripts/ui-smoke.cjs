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
      ["mobile", 390, 844, "agenda"],
      ["small-mobile", 360, 740, "agenda"],
    ]) {
      win.setContentSize(width, height);
      await win.loadURL("http://127.0.0.1:4173");
      for (let n = 0; n < 100; n++) {
        if (
          await win.webContents.executeJavaScript(
            'document.querySelectorAll(".date-choice").length===15',
          )
        )
          break;
        await pause(30);
      }
      await pause(180);
      const layout = await win.webContents.executeJavaScript(
        `(() => { const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right};};return {view:document.body.dataset.view,width:innerWidth,bodyWidth:document.body.scrollWidth,calendar:rect('#calendar'),toolbar:rect('.planner-toolbar'),events:[...document.querySelectorAll('.event')].map(e=>({width:e.clientWidth,scrollWidth:e.scrollWidth,title:e.querySelector('strong').textContent})),dates:document.querySelectorAll('.date-choice').length}; })()`,
      );
      assert.equal(layout.view, view);
      console.log(name + " " + JSON.stringify(layout));
      assert.equal(layout.dates, 15);
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
          layout.calendar.y < 260,
          "Mobile header consumes too much height",
        );
        for (const event of layout.events)
          assert.ok(
            event.width >= 210 && event.scrollWidth <= event.width,
            "Mobile event is too narrow or overflows",
          );
      }
      await fs.promises.writeFile(
        path.join(out, name + ".png"),
        (await win.webContents.capturePage()).toPNG(),
      );
      if (name === "mobile") {
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
