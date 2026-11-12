/** Real hidden Electron windows; temporary profile, no network or real shortcuts. */
const {app}=require('electron'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
process.argv.push('--pet-smoke-test');
const main=require('../desktop/main.cjs'),pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let n=0;n<200;n++){if(await fn())return;await pause(50);}throw Error('Timed out');}
app.whenReady().then(async()=>{
try{
  await until(()=>main.inspect().petHost);
  const {petHost,win,root}=main.inspect(),{pet,panel}=petHost;
  const evaluate=code=>panel.webContents.executeJavaScript(code);
  await until(()=>evaluate(`document.getElementById('count').textContent.includes('项未完成')&&!document.querySelector('#add button').disabled`));
  await pause(100);
  await evaluate(`window.petHost.call('command',{type:'add',tab:'today',title:'桌宠实测新增'})`);
  await until(()=>evaluate(`document.body.textContent.includes('桌宠实测新增')`));
  assert.equal(await pet.webContents.executeJavaScript(`document.getElementById('character').getAttribute('state')`),'added');
  await evaluate(`document.querySelector('.item .check').click()`);
  await until(()=>evaluate(`!!document.querySelector('.item.done')`));
  assert.equal(await pet.webContents.executeJavaScript(`document.getElementById('character').getAttribute('state')`),'celebrate');
  await evaluate(`window.petHost.call('command',{type:'add',tab:'long',title:'桌宠长期测试'})`);
  await evaluate(`document.querySelector('[data-tab="long"]').click()`);
  await until(()=>evaluate(`document.body.textContent.includes('桌宠长期测试')`));
  await evaluate(`window.petHost.call('pin',true)`);petHost.showPanel(false);
  const initial=pet.getBounds();await pause(300);assert.deepEqual(pet.getBounds(),initial,'no automatic movement');
  const painted=await pet.webContents.executeJavaScript(`(()=>{const c=document.getElementById('character');for(let y=30;y<innerHeight-20;y+=8)for(let x=30;x<innerWidth-20;x+=8)if(c.hitTest(x,y))return {x,y};throw Error('no painted point');})()`);
  petHost.testCursor({x:initial.x+80,y:initial.y+80});
  pet.setIgnoreMouseEvents(false);
  pet.webContents.sendInputEvent({type:'mouseMove',...painted});
  pet.webContents.sendInputEvent({type:'mouseDown',...painted,button:'left',clickCount:1});
  await pause(40);
  petHost.testCursor({x:initial.x+20,y:initial.y+20});await pause(40);
  const moving=await pet.webContents.executeJavaScript(`document.getElementById('character').getAttribute('state')`);
  assert.equal(moving,'walk');await pause(100);assert.equal(await pet.webContents.executeJavaScript(`document.getElementById('character').getAttribute('state')`),'idle');
  pet.webContents.sendInputEvent({type:'mouseUp',...painted,button:'left',clickCount:1});await pause(50);const dropped=pet.getBounds();await pause(400);assert.deepEqual(pet.getBounds(),dropped);
  const p=panel.getBounds(),b=pet.getBounds();assert(p.x>=b.x+b.width||p.x+p.width<=b.x||p.y>=b.y+b.height||p.y+p.height<=b.y,'popup avoids pet');
  const hit=await pet.webContents.executeJavaScript(`(()=>{const c=document.getElementById('character');let hits=0;for(let y=10;y<innerHeight;y+=12)for(let x=10;x<innerWidth;x+=12)if(c.hitTest(x,y))hits++;return {hits,corner:c.hitTest(1,1)};})()`);
  assert(hit.hits>0&&!hit.corner,'painted hit testing');
  win.close();await pause(150);assert(!win.isDestroyed(),'close keeps shared data owner alive');
  await evaluate(`window.petHost.call('command',{type:'add',tab:'today',title:'隐藏后新增'})`);
  const out=path.resolve('env/pet-1.8.0');fs.mkdirSync(out,{recursive:true});
  await pause(300);fs.writeFileSync(path.join(out,'pet.png'),(await pet.webContents.capturePage()).toPNG());fs.writeFileSync(path.join(out,'panel.png'),(await panel.webContents.capturePage()).toPNG());
  console.log('PET_SMOKE_REPORT '+JSON.stringify({passed:true,temporaryProfile:root,checks:['add','complete','longtodo','feedback','drag walking','stop while held','position retained','popup avoids pet','alpha hit testing','main close keeps alive']}));
  await petHost.dispose();app.exit(0);
}catch(e){console.error(e.stack);app.exit(1);}
});
