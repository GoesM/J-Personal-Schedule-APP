/** Device-local pane ratio. Pointer capture supports mouse/touch; arrows support keyboard. */
export function splitter(timed, todos, available) {
  const grip=document.createElement('div');
  grip.className='pane-splitter'; grip.tabIndex=0;
  grip.setAttribute('role','separator'); grip.setAttribute('aria-orientation','horizontal');
  grip.setAttribute('aria-label','拖动调整当日日程与当日TODO高度');
  grip.title='拖动调整高度；方向键微调，双击恢复默认';
  let ratio=.68;
  try { const stored=Number(localStorage.getItem('daily-pane-ratio')); if(stored>=.2&&stored<=.85)ratio=stored; } catch {}
  function apply(value) {
    ratio=Math.max(.2,Math.min(.85,value));
    timed.style.height=Math.round(available*ratio)+'px';
    timed.style.maxHeight='none';
    for(const col of todos) {col.style.height=Math.round(available*(1-ratio))+'px';col.style.maxHeight='none';col.style.overflowY='auto';}
    grip.setAttribute('aria-valuemin','20');grip.setAttribute('aria-valuemax','85');grip.setAttribute('aria-valuenow',String(Math.round(ratio*100)));
    try {localStorage.setItem('daily-pane-ratio',String(ratio));}catch{}
  }
  grip.onpointerdown=e=>{
    if(e.button!==0)return;
    const initialY=e.clientY, initialRatio=ratio, pointer=e.pointerId;
    const move=event=>{if(event.pointerId===pointer&&grip.isConnected)apply(initialRatio+(event.clientY-initialY)/available);};
    const stop=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',stop);window.removeEventListener('pointercancel',stop);window.removeEventListener('blur',stop);};
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',stop);window.addEventListener('pointercancel',stop);window.addEventListener('blur',stop);
    e.preventDefault();
  };
  grip.onkeydown=e=>{if(['ArrowUp','ArrowDown','Home'].includes(e.key)){e.preventDefault();apply(e.key==='Home'?.68:ratio+(e.key==='ArrowUp'?-.03:.03));}};
  grip.ondblclick=()=>apply(.68);
  apply(ratio);return grip;
}
