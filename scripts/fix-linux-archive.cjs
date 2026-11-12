/** Windows tar writers can omit POSIX executable bits. Repair headers deterministically. */
const fs=require('node:fs'),zlib=require('node:zlib'),path=require('node:path');
function fixArchive(filename){
  const data=zlib.gunzipSync(fs.readFileSync(filename)),required=new Set(['j-personal-schedule','chrome-sandbox','chrome_crashpad_handler']),found=new Set();
  for(let offset=0;offset+512<=data.length;){
    const header=data.subarray(offset,offset+512);if(header.every(v=>v===0))break;
    const name=header.subarray(0,100).toString('utf8').split('\0')[0],type=String.fromCharCode(header[156]);
    const size=parseInt(header.subarray(124,136).toString('ascii').replace(/\0/g,'').trim(),8)||0;
    const base=path.posix.basename(name);
    if(type==='5'||required.has(base)){
      if(required.has(base))found.add(base);
      header.write('0000755\0',100,8,'ascii');header.fill(32,148,156);
      const sum=header.reduce((n,v)=>n+v,0);header.write(sum.toString(8).padStart(6,'0')+'\0 ',148,8,'ascii');
    }
    offset+=512+Math.ceil(size/512)*512;
  }
  if(found.size!==required.size)throw Error('Missing executable entries in Linux archive');
  const temp=filename+'.tmp';fs.writeFileSync(temp,zlib.gzipSync(data,{level:6}));fs.renameSync(temp,filename);
  console.log('Linux executable modes verified: '+[...found].join(', '));
}
module.exports=fixArchive;if(require.main===module)fixArchive(process.argv[2]);
