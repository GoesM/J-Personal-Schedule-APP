/** Local-only UI preview with disposable sample data; never opens the real profile. */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const bridge = `
(() => {
  // Deterministic fictional clock. This exists only in the disposable preview.
  const RealDate = window.Date;
  window.Date = class DemoDate extends RealDate {
    constructor(...args) { super(...(args.length ? args : ['2026-05-18T08:30:00'])); }
    static now() { return new RealDate('2026-05-18T08:30:00').getTime(); }
  };
  document.title = 'J人小程序 · DEMO';
  document.body.dataset.demo = 'true';
  document.querySelector('.page-title .eyebrow').textContent = 'DEMO · 虚构日程展示';
  document.querySelector('.brand p').textContent = '演示环境 · 所有事项均为虚构';
  const files = new Map(), dirs = new Set(['/repo','/repo/ops']);
  const day = offset => { const d = new Date(); d.setDate(d.getDate()+offset); return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'); };
  const encode = s => btoa(Array.from(new TextEncoder().encode(s),b=>String.fromCharCode(b)).join(''));
  const add = (offset,title,start,end,kind,location='',notes='',important=false,done=false) => {
    const id=crypto.randomUUID(), op={id,itemId:crypto.randomUUID(),parents:[],at:new Date().toISOString(),deleted:false,item:{date:day(offset),title,start,end,kind,location,notes,important,done}};
    files.set('/repo/ops/'+id+'.json',encode(JSON.stringify(op)));
  };
  add(0,'Demo · 专注工作','09:00','10:30','schedule','Demo书房','虚构示例：拆解目标，专注完成一个小任务');
  add(0,'Demo · 创意讨论','14:00','15:00','schedule','Demo会议室','虚构示例：准备三个设计方案');
  add(0,'Demo · 整理笔记','','','todo','','虚构示例：归纳本周灵感');
  add(0,'Demo · 确认计划','','','todo','','虚构示例：检查时间与优先级',true);
  add(-2,'Demo · 阅读时间','10:00','11:30','schedule','Demo图书角','虚构示例：已完成的安排',false,true);
  add(-1,'Demo · 清理清单','','','todo','','虚构示例：逾期待办');
  add(1,'Demo · 轻松散步','16:00','17:00','schedule','Demo公园','虚构示例：留一点休息时间');
  add(2,'Demo · 学习新技能','15:30','17:00','schedule','Demo工作台','虚构示例：尝试一个小练习');
  add(3,'Demo · 周中复盘','19:00','20:00','schedule','Demo书房','虚构示例：回顾进度');
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
