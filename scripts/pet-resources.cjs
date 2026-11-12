const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
module.exports=function(){
  const source=path.resolve(__dirname,'../../J人形象设计/pet'),cache=path.resolve(__dirname,'../assets/pet');
  const names=['pet-data.js','pet-runtime.js','manifest.json','NOTICE.md'];
  if(fs.existsSync(source)){
    fs.mkdirSync(cache,{recursive:true});const hashes={};
    for(const name of names){const bytes=fs.readFileSync(path.join(source,name));fs.writeFileSync(path.join(cache,name),bytes);hashes[name]=crypto.createHash('sha256').update(bytes).digest('hex');}
    fs.writeFileSync(path.join(cache,'source.json'),JSON.stringify({source:'J人形象设计/pet',version:JSON.parse(fs.readFileSync(path.join(cache,'manifest.json'),'utf8')).version,sha256:hashes},null,2));
  }
  const sourceInfo=JSON.parse(fs.readFileSync(path.join(cache,'source.json'),'utf8'));
  for(const name of names)if(crypto.createHash('sha256').update(fs.readFileSync(path.join(cache,name))).digest('hex')!==sourceInfo.sha256[name])throw Error('桌宠资源校验失败：'+name);
  require('./copy-tree.cjs')(cache,'dist/pet/assets');
  fs.mkdirSync('dist/pet',{recursive:true});for(const name of fs.readdirSync('src/pet'))fs.copyFileSync(path.join('src/pet',name),path.join('dist/pet',name));
};
