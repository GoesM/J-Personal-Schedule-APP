import { localDate, color } from './model.mjs';
export const revision = r => r.versions.map(v=>v.id).sort().join(':');
export function petSnapshot(rows, persona, busy, now=new Date()) {
  const day=localDate(now),clock=now.toTimeString().slice(0,5);
  const visible=rows.filter(r=>!r.deleted&&(r.item.kind==='longtodo'||r.item.date===day));
  const rank=r=>r.item.start?(r.item.end>clock?(r.item.start<=clock?0:1):4):(r.item.important?2:3);
  const map=r=>({id:r.id,revision:revision(r),conflict:!!r.conflict,title:r.item.title,kind:r.item.kind,
    date:r.item.date||'',start:r.item.start||'',end:r.item.end||'',ddl:r.item.ddl||'',done:!!r.item.done,
    important:!!r.item.important,color:color(r.item,now)});
  return {day,persona,busy:!!busy,today:visible.filter(r=>r.item.kind!=='longtodo')
    .sort((a,b)=>Number(a.item.done)-Number(b.item.done)||rank(a)-rank(b)||(a.item.start||'').localeCompare(b.item.start||'')).map(map),
    long:visible.filter(r=>r.item.kind==='longtodo').sort((a,b)=>Number(a.item.done)-Number(b.item.done)||(a.item.ddl||'9999').localeCompare(b.item.ddl||'9999')||a.item.title.localeCompare(b.item.title)).map(map)};
}
/** All mutations run in the existing renderer and use its storage/sync lock. */
export async function executePetCommand(command,{getRows,save,isBusy,now=()=>new Date()}) {
  if(isBusy())throw Error('正在保存、同步或退出，请稍后再试');
  if(command.type==='add'){
    const title=typeof command.title==='string'?command.title.trim():'';
    if(!title||title.length>200)throw Error('标题需为1–200个字符');
    if(!['today','long'].includes(command.tab))throw Error('不支持的清单');
    return save(command.tab==='long'?{kind:'longtodo',title,ddl:'',notes:'',done:false}:
      {kind:'todo',title,date:localDate(now()),start:'',end:'',notes:'',location:'',done:false,important:false});
  }
  if(command.type==='toggle'){
    const row=getRows().find(r=>r.id===command.id&&!r.deleted);
    if(!row)throw Error('事项已删除，请刷新清单');
    if(row.conflict)throw Error('事项存在版本冲突，请在主程序处理');
    if(command.revision!==revision(row))throw Error('事项刚刚发生变化，请查看最新状态后重试');
    if(typeof command.done!=='boolean')throw Error('无效的完成状态');
    if(row.item.done===command.done)return;
    return save({...row.item,done:command.done},row);
  }
  throw Error('不支持的桌宠操作');
}
