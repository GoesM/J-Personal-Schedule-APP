/** Local-only UI preview with disposable sample data; never opens the real profile. */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const bridge = `
(() => {
  const files = new Map(), dirs = new Set(['/repo','/repo/ops']);
  const day = offset => { const d = new Date(); d.setDate(d.getDate()+offset); return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'); };
  const encode = s => btoa(Array.from(new TextEncoder().encode(s),b=>String.fromCharCode(b)).join(''));
  const add = (offset,title,start,end,kind,location='',notes='',important=false,done=false) => {
    const id=crypto.randomUUID(), op={id,itemId:crypto.randomUUID(),parents:[],at:new Date().toISOString(),deleted:false,item:{date:day(offset),title,start,end,kind,location,notes,important,done}};
    files.set('/repo/ops/'+id+'.json',encode(JSON.stringify(op)));
  };
  add(0,'算法与优化','09:50','12:15','course','示例校园，教学楼 A310','课前整理上次笔记');
  add(0,'研究进展讨论','14:00','15:00','schedule','实验室','带上实验结果与问题清单');
  add(0,'整理本周文献','','','todo','','提炼三个值得继续探索的问题');
  add(0,'检查投稿反馈','','','todo','','记录回复计划与下一步安排',true);
  add(-2,'阅读与笔记','10:00','11:30','schedule','图书馆','',false,true);
  add(-1,'修改实验脚本','','','todo');
  add(1,'户外散步','16:00','17:00','schedule','校园');
  add(2,'数据分析专题','15:50','18:15','course','示例校园，教学楼 A310');
  add(3,'系统设计研讨','19:00','21:25','course','示例校园，教学楼 B206');
  window.native={invoke:async(method,args)=>{const [p,v]=args;switch(method){case 'settings':return {};case 'mkdir':dirs.add(p);return;case 'list':return [...files.keys(),...dirs].filter(x=>x.startsWith(p+'/')&&!x.slice(p.length+1).includes('/')).map(x=>x.slice(p.length+1));case 'read':if(!files.has(p))throw Error('ENOENT');return files.get(p);case 'write':files.set(p,v);return;case 'ready':return;case 'export':return true;case 'saveSettings':throw Error('预览模式不保存真实仓库凭据');default:throw Error('预览模式不执行远程同步');}}};
})();`;
const root = path.resolve("dist");
http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/preview-native.js") {
      res.setHeader("Content-Type", "text/javascript; charset=utf-8");
      res.end(bridge);
      return;
    }
    const name = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    if (!["index.html", "app.js", "style.css"].includes(name)) {
      res.writeHead(404);
      res.end();
      return;
    }
    let body = fs.readFileSync(path.join(root, name));
    if (name === "index.html")
      body = body
        .toString()
        .replace(
          '<script src="app.js">',
          '<script src="preview-native.js"></script><script src="app.js">',
        );
    res.setHeader(
      "Content-Type",
      name.endsWith(".html")
        ? "text/html; charset=utf-8"
        : name.endsWith(".css")
          ? "text/css; charset=utf-8"
          : "text/javascript; charset=utf-8",
    );
    res.end(body);
  })
  .listen(4173, "127.0.0.1", () =>
    console.log("Disposable UI preview: http://127.0.0.1:4173"),
  );
