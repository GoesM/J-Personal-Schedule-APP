const cp=require('node:child_process');
const version=require('../package.json').version;
const result=cp.spawnSync(process.execPath,[require.resolve('electron-builder/cli.js'),'--linux','tar.gz','--x64','--config.directories.output=release/linux-'+version],{stdio:'inherit'});
if(result.status!==0)process.exit(result.status||1);
require('./fix-linux-archive.cjs')(`release/linux-${version}/J-Personal-Schedule-${version}-linux-x64.tar.gz`);
