/** One shared scale for all visible dates. Only the union's empty gaps shrink.
 * Busy minutes always use 1.8 px, so compression never changes event duration ratios.
 */
export const minutes = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
export const clock = n => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
export function timeScale(items, weights = []) {
  const prefix=[0];
  for(let m=0;m<1440;m++) prefix.push(Math.round((prefix[m]+(Number.isFinite(weights[m]) && weights[m]>0?weights[m]:1.8))*1e8)/1e8);
  const events = items.filter(i => i.start && i.end && minutes(i.end) > minutes(i.start));
  const points = [...new Set([480, 1320, ...events.flatMap(i => [minutes(i.start), minutes(i.end)])])].sort((a,b)=>a-b);
  const segments = [];
  for (let n=1;n<points.length;n++) {
    const start=points[n-1], end=points[n];
    const busy=events.some(i=>minutes(i.start)<end && minutes(i.end)>start);
    const last=segments.at(-1);
    if(last && last.busy===busy) last.end=end;
    else segments.push({start,end,busy});
  }
  let total=0;
  for(const s of segments) {
    s.key=`${s.start}-${s.end}`;
    s.foldable=!s.busy;
    s.folded=s.foldable;
    s.top=total;
    s.height=s.folded?6:prefix[s.end]-prefix[s.start];
    total+=s.height;
  }
  const y=t=>{
    const m=typeof t==='number'?t:minutes(t);
    const s=segments.find(s=>m>=s.start && m<=s.end);
    return s?s.top+(s.folded?(m-s.start)/(s.end-s.start)*s.height:prefix[m]-prefix[s.start]):0;
  };
  return {segments,total,y,points};
}
/** Resize a shared clock range, preserving alignment and a usable minimum for
 * every affected visible card. This changes display density, never event times. */
export function resizeRange(weights, items, start, end, delta) {
  const a=minutes(start), b=minutes(end);
  const next=Array.from({length:1440},(_,m)=>weights[m]||1.8);
  const sum=(s,e)=>next.slice(s,e).reduce((v,n)=>v+n,0);
  const current=sum(a,b);
  let lower=0.05;
  for(const i of items.filter(i=>i.start && i.end)) {
    const s=minutes(i.start),e=minutes(i.end),lo=Math.max(s,a),hi=Math.min(e,b);
    if(hi<=lo) continue;
    const affected=sum(lo,hi),height=sum(s,e);
    lower=Math.max(lower,(Math.min(56,height)-(height-affected))/affected);
  }
  const factor=Math.max(lower,Math.min(2400/current,(current+delta)/current));
  for(let m=a;m<b;m++) next[m]*=factor;
  return next;
}
