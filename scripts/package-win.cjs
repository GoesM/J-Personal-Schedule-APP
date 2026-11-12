const cp=require('node:child_process');
const path=require('node:path');
const version=require('../package.json').version;
function run(exe,args){const r=cp.spawnSync(exe,args,{stdio:'inherit'});if(r.status!==0)throw Error('Packaging failed: '+exe);}
run(process.execPath,[require.resolve('electron-builder/cli.js'),'--win','dir','zip','--config.directories.output=release/windows-'+version]);
run('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'release-shortcut.ps1'),'-Version',version]);
