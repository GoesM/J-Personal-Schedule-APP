/** Chromium layout QA for this app only, using the disposable localhost preview. */
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
// Use a deterministic software surface for offscreen screenshots on hosts whose
// GPU driver cannot provide a hidden-window capture surface.
app.disableHardwareAcceleration();
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
  win.webContents.on('console-message', event => { if (event.level === 'error') console.error(event.message); });
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
      await win.webContents.executeJavaScript(`document.getElementById('appearance').click()`);
      await pause(180);
      const iconCheck = await win.webContents.executeJavaScript(`(() => {
        const grid=document.querySelector('.persona-picker');
        return {count:grid.querySelectorAll('input').length, loaded:[...grid.querySelectorAll('img')].every(i=>i.complete&&i.naturalWidth>0), overflow:grid.scrollWidth>grid.clientWidth+1};
      })()`);
      assert.equal(iconCheck.count,8); assert.equal(iconCheck.loaded,true); assert.equal(iconCheck.overflow,false);
      fs.writeFileSync(path.join(out, name + '-personas.png'), (await win.webContents.capturePage()).toPNG());
      await win.webContents.executeJavaScript(`document.getElementById('cancel').click()`);
      await win.webContents.executeJavaScript(`document.getElementById('appearance').click();document.querySelector('input[name=persona][value=INTJ]').click();document.getElementById('form').requestSubmit();`);
      await pause(120);
      assert.equal(await win.webContents.executeJavaScript(`!document.getElementById('dialog').open && document.querySelector('.brand-icon img').src.includes('/INTJ/')`),true);
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
        const tools = await win.webContents.executeJavaScript(`(() => {
          const items=[...document.querySelectorAll('.tools button,.tools .button')].map(e=>{
            const text=[...e.childNodes].find(n=>n.nodeType===Node.TEXT_NODE && n.textContent.trim());
            const range=document.createRange();range.selectNodeContents(text);
            const r=range.getBoundingClientRect();
            return {label:text.textContent.trim(),font:parseFloat(getComputedStyle(e).fontSize),width:r.width,height:r.height,overflow:e.scrollWidth>e.clientWidth};
          });
          return {items,legend:[...document.querySelectorAll('.legend span')].map(e=>({font:parseFloat(getComputedStyle(e).fontSize),height:e.getBoundingClientRect().height}))};
        })()`);
        for (const tool of tools.items) {
          assert.ok(
            tool.font >= 12 && tool.width > 30 && tool.height >= 12,
            tool.label + " text is not visible",
          );
          assert.equal(tool.overflow, false, tool.label + " label is clipped");
        }
        for (const swatch of tools.legend)
          assert.ok(
            swatch.font >= 11 && swatch.height >= 24,
            "Color rule text must remain visible",
          );
        console.log(
          "SIDEBAR_LABELS_PASS " + tools.items.map((t) => t.label).join(" / "),
        );
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
    // Exercise actual Chromium keyboard events after deleting and cancelling.
    for (const width of [1320,390]) {
      win.setContentSize(width,900);
      await win.loadURL('http://127.0.0.1:4173');
      await pause(350);
      const grip=await win.webContents.executeJavaScript(`(() => {const e=document.querySelector('.pane-splitter');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),ratio:Number(e.getAttribute('aria-valuenow'))};})()`);
      win.webContents.sendInputEvent({type:'mouseMove',x:grip.x,y:grip.y});
      await pause(60);
      win.webContents.sendInputEvent({type:'mouseDown',x:grip.x,y:grip.y,button:'left',clickCount:1});
      await pause(60);
      win.webContents.sendInputEvent({type:'mouseMove',x:grip.x,y:grip.y-40,button:'left'});
      await pause(60);
      win.webContents.sendInputEvent({type:'mouseUp',x:grip.x,y:grip.y-40,button:'left',clickCount:1});
      await pause(80);
      console.log('DRAG',width,grip,await win.webContents.executeJavaScript(`({ratio:document.querySelector('.pane-splitter').getAttribute('aria-valuenow'),hit:document.elementFromPoint(${grip.x},${grip.y})?.className})`));
      assert.ok(await win.webContents.executeJavaScript(`Number(document.querySelector('.pane-splitter').getAttribute('aria-valuenow'))<${grip.ratio}`),'Dragging changes the pane ratio');
      const handle=await win.webContents.executeJavaScript(`(() => {const e=document.querySelector('.event-resize');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),id:e.closest('.event').dataset.itemId,height:parseFloat(e.closest('.event').style.height)};})()`);
      win.webContents.sendInputEvent({type:'mouseMove',x:handle.x,y:handle.y});await pause(60);
      win.webContents.sendInputEvent({type:'mouseDown',x:handle.x,y:handle.y,button:'left',clickCount:1});await pause(60);
      win.webContents.sendInputEvent({type:'mouseMove',x:handle.x,y:handle.y+35,button:'left'});await pause(60);
      win.webContents.sendInputEvent({type:'mouseUp',x:handle.x,y:handle.y+35,button:'left',clickCount:1});await pause(60);
      const resized=await win.webContents.executeJavaScript(`parseFloat(document.querySelector('[data-item-id="${handle.id}"]').style.height)`);
      assert.ok(Math.abs(resized-handle.height-35)<1,'Real pointer changes schedule height');
      console.log('EVENT_RESIZE_PASS',width,handle.height,resized);

      await win.webContents.executeJavaScript(`window.confirm=()=>{throw Error('删除不得调用原生 confirm')};void 0;`);
      for (const selector of ['.event-body','.todo-body']) {
        await win.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(selector)}).click();[...document.querySelectorAll('#fields button')].find(b=>b.textContent==='删除').click();document.querySelector('.delete-confirm button').click();`);
        await win.webContents.executeJavaScript(`(() => {const t=document.querySelector('[name=title]');t.value='';t.focus();})()`);
        win.webContents.sendInputEvent({type:'char',keyCode:'C'});
        await pause(80);
        assert.equal(await win.webContents.executeJavaScript(`document.querySelector('[name=title]').value`),'C');
        await win.webContents.executeJavaScript(`[...document.querySelectorAll('#fields button')].find(b=>b.textContent==='删除').click();[...document.querySelectorAll('.delete-confirm button')].find(b=>b.textContent==='确认删除').click();`);
        await pause(150);
        assert.equal(await win.webContents.executeJavaScript(`document.getElementById('dialog').open`),false);
        await win.webContents.executeJavaScript(`document.getElementById('add').click();document.querySelector('[name=title]').focus()`);
        win.webContents.sendInputEvent({type:'char',keyCode:'K'});
        await pause(80);
        assert.equal(await win.webContents.executeJavaScript(`document.querySelector('[name=title]').value`),'K');
        await win.webContents.executeJavaScript(`document.getElementById('cancel').click()`);
      }
    }
    console.log("DELETE_KEYBOARD_PASS / UI_LAYOUT_PASS");
    app.exit(0);
  } catch (e) {
    console.error(e);
    app.exit(1);
  }
});
