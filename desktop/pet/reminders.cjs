function localDate(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function candidate(snapshot,seen,now=Date.now()){
  if(!snapshot||snapshot.busy)return null;
  for(const r of snapshot.today||[]){
    if(r.done||r.conflict||!r.start)continue;
    const start=new Date(r.date+'T'+r.start+':00').getTime(),end=new Date(r.date+'T'+r.end+':00').getTime();
    const key=`s:${r.id}:${r.date}:${r.start}`,saved=seen[key];
    const due=saved===undefined?start-now>=0&&start-now<=600000:typeof saved==='number'&&saved<=now&&end>now;
    if(due)return {key,title:r.title,detail:`日程 ${r.start}–${r.end}`,itemId:r.id};
  }
  const day=localDate(new Date(now)),key='l:'+day,saved=seen[key];
  const due=(snapshot.long||[]).filter(r=>!r.done&&!r.conflict&&r.ddl&&r.ddl<=day);
  if(due.length&&(saved===undefined||typeof saved==='number'&&saved<=now))return {key,title:`${due.length} 项长期 TODO 已到截止日期`,detail:due.slice(0,2).map(r=>r.title).join(' · '),itemId:due[0].id};
  return null;
}
module.exports={candidate};
