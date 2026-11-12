import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {overview,agenda,dateStrip} from '../src/planner-view.mjs';
test('linear duration scale, sibling headings, and persisted pane sizing',()=>{
  const dom=new JSDOM('<body></body>',{url:'https://layout.test'});
  globalThis.document=dom.window.document; globalThis.window=dom.window; globalThis.localStorage=dom.window.localStorage;
  const noop=()=>{};
  const items=[['09:00','13:00'],['14:00','15:00']].map(([start,end],n)=>({id:String(n),item:{title:'日程'+n,date:'2026-10-29',start,end}}));
  const options={selected:'2026-10-29',items,onEdit:noop,onNew:noop,onToggle:noop,onSelect:noop,timelineHeight:500};
  try {
    const strip=dateStrip(options.selected,options.selected,noop,items,'week');
    assert.deepEqual([...strip.querySelectorAll('[data-date]')].map(x=>x.dataset.date),['2026-10-28','2026-10-29','2026-10-30','2026-10-31','2026-11-01','2026-11-02','2026-11-03']);
    localStorage.setItem('compress-idle','false'); // Legacy opt-out must no longer disable compression.
    for(const factory of [overview,agenda]) {
      const page=factory(options);document.body.replaceChildren(page);
      const cards=page.querySelectorAll('.event');
      assert.equal(parseFloat(cards[0].style.height)/parseFloat(cards[1].style.height),4);
      const gap=page.querySelector('.idle-gap');
      assert.ok(gap);
      assert.equal(gap.tagName,'DIV');
      assert.equal(gap.textContent,'');
      const ticks=[...page.querySelectorAll('.time-axis span')];
      assert.deepEqual(ticks.map(t=>t.textContent),['09:00','13:00','14:00','15:00']);
      assert.ok(parseFloat(ticks[2].style.top)-parseFloat(ticks[1].style.top)>=19);
      assert.ok(!ticks.some(t=>t.textContent==='22:00'));
      assert.equal(page.querySelector('.time-scale-toggle'),null);
      assert.equal(gap.hasAttribute('aria-expanded'),false);
      assert.deepEqual([...page.querySelectorAll('h3')].map(h=>h.textContent),['当日日程','当日TODO']);
      const grip=page.querySelector('[role=separator]');
      const old=Number(grip.getAttribute('aria-valuenow'));
      grip.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowUp',cancelable:true}));
      assert.ok(Number(grip.getAttribute('aria-valuenow'))<old);
      const saved=localStorage.getItem('daily-pane-ratio');
      const next=factory(options);
      assert.equal(next.querySelector('[role=separator]').getAttribute('aria-valuenow'),String(Math.round(Number(saved)*100)));
    }
    const opts={...options,items:[...items,{id:'same-time',item:{...items[0].item,date:'2026-10-30'}}]};
    const page=overview(opts);document.body.replaceChildren(page);
    const before=parseFloat(page.querySelector('.event').style.height);
    page.querySelector('.event-resize').dispatchEvent(new dom.window.MouseEvent('pointerdown',{button:0,clientY:100,bubbles:true,cancelable:true}));
    window.dispatchEvent(new dom.window.MouseEvent('pointermove',{clientY:180}));
    window.dispatchEvent(new dom.window.MouseEvent('pointerup'));
    const after=parseFloat(page.querySelector('.event').style.height);
    assert.ok(Math.abs(after-before-80)<0.001);
    assert.equal(page.querySelector('[data-item-id="same-time"]').style.height,page.querySelector('.event').style.height);
    assert.equal(overview(opts).querySelector('.event').style.height,page.querySelector('.event').style.height);
    assert.equal(items[0].item.end,'13:00');
    page.querySelector('.time-height-reset').click();
    assert.equal(parseFloat(page.querySelector('.event').style.height),before);
  } finally {dom.window.close();delete globalThis.window;delete globalThis.document;delete globalThis.localStorage;}
});
