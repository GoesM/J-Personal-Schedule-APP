// Real Windows .lnk round trip in a disposable directory; no user shortcuts.
const {app,shell}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {createPersonas}=require('../desktop/personas.cjs');
app.whenReady().then(async()=>{
  const root=await fs.mkdtemp(path.join(require('node:os').tmpdir(),'j-native-links-'));
  try {
    const desktop=path.join(root,'desktop'),release=path.join(root,'release');
    await fs.mkdir(desktop);await fs.mkdir(release);
    const launcher=path.join(release,'launch-current.vbs');await fs.writeFile(launcher,'');
    const target=path.join(process.env.WINDIR,'System32/wscript.exe'),args='"'+launcher+'"';
    const links=[path.join(desktop,'renamed.lnk'),path.join(release,'app.lnk')];
    for(const link of links) assert.ok(shell.writeShortcutLink(link,'create',{target,args}));
    const manager=createPersonas({root,app:{isPackaged:true,getPath:()=>desktop},shell,
      executable:path.join(release,'windows-test','win-unpacked','J.exe'),getWindow:()=>({setIcon(){}})});
    for(const persona of ['INFJ','ENTJ']) {
      assert.equal((await manager.save(persona)).shortcutWarning,'');
      for(const link of links) {
        const value=shell.readShortcutLink(link);
        assert.equal(value.target.toLowerCase(),target.toLowerCase());assert.equal(value.args,args);
        assert.equal(value.icon,path.join(root,'icons',persona+'.ico'));
      }
    }
    console.log('NATIVE_SHORTCUT_ICON_PASS');
  } finally {await fs.rm(root,{recursive:true,force:true});}
  app.exit(0);
}).catch(e=>{console.error(e);app.exit(1);});
