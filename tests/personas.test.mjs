import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {JSDOM} from 'jsdom';
import {personas, normalizePersona, personaPicker, applyPersona} from '../src/personas.mjs';
const require = createRequire(import.meta.url);
const {createPersonas} = require('../desktop/personas.cjs');
test('refresh updates release and renamed desktop copies, preserves targets and unrelated links', async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'j-links-'));
  try {
    const desktop=path.join(root,'desktop'), release=path.join(root,'release');
    await fs.mkdir(desktop);await fs.mkdir(release);
    const launcher=path.join(release,'launch-current.vbs');await fs.writeFile(launcher,'test');
    const executable=path.join(release,'windows-1.6.3','win-unpacked','J.exe');
    const links=new Map(), updates=[];
    for(const [dir,name,ours] of [[desktop,'renamed.lnk',true],[release,'app.lnk',true],[desktop,'other.lnk',false]]) {
      const filename=path.join(dir,name);await fs.writeFile(filename,'test');
      links.set(filename,{target:'C:\\Windows\\System32\\wscript.exe',args:ours?'"'+launcher+'"':'"unrelated.vbs"',icon:'old.ico',iconIndex:0});
    }
    const shell={readShortcutLink:p=>links.get(p),writeShortcutLink:(p,mode,options)=>{
      assert.equal(mode,'update');assert.deepEqual(Object.keys(options).sort(),['icon','iconIndex']);
      Object.assign(links.get(p),options);updates.push(p);return true;
    }};
    const manager=createPersonas({root,app:{isPackaged:true,getPath:()=>desktop},shell,executable,getWindow:()=>({setIcon(){}})});
    await manager.save('INFJ');assert.equal(updates.length,2);
    assert.match(links.get(path.join(desktop,'renamed.lnk')).icon,/INFJ.ico$/);
    assert.equal(links.get(path.join(desktop,'other.lnk')).icon,'old.ico');
    await manager.save('ENTJ');assert.equal(updates.length,4);
    assert.match(links.get(path.join(release,'app.lnk')).icon,/ENTJ.ico$/);
    // A shortcut copied later is repaired on startup without changing the choice.
    links.get(path.join(desktop,'renamed.lnk')).icon='old.ico';
    await manager.refresh();assert.equal(updates.length,5);
    assert.equal(links.get(path.join(desktop,'renamed.lnk')).args,'"'+launcher+'"');
  } finally {await fs.rm(root,{recursive:true,force:true});}
});
test('eight accessible choices, safe default, selected brand', () => {
  const dom = new JSDOM('<span class="brand-icon"></span>');
  globalThis.document = dom.window.document;
  try {
    assert.equal(personas.length,8); assert.equal(normalizePersona('../bad'), 'ISTJ');
    const picker = personaPicker('ENFJ'); document.body.append(picker);
    assert.equal(picker.querySelectorAll('input[type=radio]').length,8);
    assert.equal(picker.querySelector('input:checked').value,'ENFJ');
    applyPersona('ENFJ'); assert.match(document.querySelector('.brand-icon img').src,/ENFJ/);
    for(const [id] of personas) assert.ok(picker.querySelector(`input[value=${id}]`).closest('label').textContent.includes(id));
  } finally { delete globalThis.document; dom.window.close(); }
});
test('device-local persistence and shortcut icons survive upgrades without touching repository settings', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'j-persona-test-'));
  const desktop = path.join(root,'desktop'); await fs.mkdir(desktop);
  let currentIcon; const links=[];
  const options = {root, app:{isPackaged:true,getPath:()=>desktop},shell:{writeShortcutLink:(target,op,data)=>{links.push({target,data});return true;}},getWindow:()=>({setIcon:p=>currentIcon=p})};
  try {
    const manager=createPersonas(options);
    assert.equal((await manager.read()).persona,'ISTJ');
    await manager.save('INFJ'); assert.match(currentIcon,/INFJ/);
    assert.equal(links.length,0, 'saving never creates an unsolicited desktop link');
    assert.equal((await createPersonas(options).read()).persona,'INFJ');
    await manager.shortcut(true);
    assert.match(links[0].data.icon,/INFJ.ico$/);
    assert.ok((await fs.stat(links[0].data.icon)).size>100);
    await fs.writeFile(links[0].target,'fake shortcut');
    await manager.save('ENTJ'); assert.match(links.at(-1).data.icon,/ENTJ.ico$/);
    await assert.rejects(manager.save('../../bad'),/未知/);
    assert.equal((await manager.read()).persona,'ENTJ');
    await assert.rejects(fs.access(path.join(root,'settings.enc')));
  } finally { await fs.rm(root,{recursive:true,force:true}); }
});
test('an unrelated existing desktop shortcut is never overwritten', async () => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'j-persona-collision-'));
  try {
    await fs.writeFile(path.join(root,'J人日程APP · 个性化.lnk'),'user file');
    const manager=createPersonas({root,app:{getPath:()=>root},shell:{writeShortcutLink:()=>{throw Error('must not write');}}});
    await assert.rejects(manager.shortcut(true),/同名/);
  } finally { await fs.rm(root,{recursive:true,force:true}); }
});
