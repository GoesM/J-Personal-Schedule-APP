/** Explicit --pet-self-test only; all data lives under a new temporary profile. */
const assert=require('node:assert/strict');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
module.exports=async({win,petHost,root})=>{
  const {pet,panel}=petHost,run=code=>panel.webContents.executeJavaScript(code);
  async function until(fn){for(let i=0;i<160;i++){if(await fn())return;await pause(50);}throw Error('桌宠自检超时');}
  await until(()=>run(`!document.querySelector('#add button').disabled`));
  await run(`window.petHost.call('command',{type:'add',tab:'today',title:'桌宠独立自检'})`);
  await until(()=>run(`document.body.textContent.includes('桌宠独立自检')`));
  assert.equal(await pet.webContents.executeJavaScript(`document.querySelector('j-pet').getAttribute('state')`),'added');
  await run(`document.querySelector('.check').click()`);await until(()=>run(`!!document.querySelector('.item.done')`));
  assert.equal(await pet.webContents.executeJavaScript(`document.querySelector('j-pet').getAttribute('state')`),'celebrate');
  await run(`window.petHost.call('command',{type:'add',tab:'long',title:'长期自检'})`);await run(`document.querySelector('[data-tab="long"]').click()`);
  await until(()=>run(`document.body.textContent.includes('长期自检')`));
  // X11/WSLg applies its initial configure events asynchronously.
  petHost.showPanel(false);await pause(600);const before=pet.getBounds();await pause(100);assert.deepEqual(pet.getBounds(),before);
  petHost.testCursor({x:before.x+80,y:before.y+80});petHost.startDrag();petHost.testCursor({x:before.x+20,y:before.y+20});await pause(40);
  assert.equal(await pet.webContents.executeJavaScript(`document.querySelector('j-pet').getAttribute('state')`),'walk');
  await pause(100);assert.equal(await pet.webContents.executeJavaScript(`document.querySelector('j-pet').getAttribute('state')`),'idle');
  petHost.endDrag();const after=pet.getBounds();await pause(400);assert.deepEqual(pet.getBounds(),after);
  const p=panel.getBounds();assert(p.x>=after.x+after.width||p.x+p.width<=after.x||p.y>=after.y+after.height||p.y+p.height<=after.y);
  win.close();await pause(150);assert(!win.isDestroyed());
  await run(`window.petHost.call('command',{type:'add',tab:'today',title:'隐藏主界面仍可保存'})`);
  return {passed:true,platform:process.platform,temporaryProfile:root,checks:['local writes','completion','added animation','celebration','longtodo','drag animation','drag stop','no roaming','popup separation','hide main']};
};
