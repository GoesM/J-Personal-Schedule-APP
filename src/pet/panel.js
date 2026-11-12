const host=window.petHost,$=id=>document.getElementById(id);
let snapshot=null,tab='today',expanded=false,pending=false,undoId=null,lastData='';
const element=(tag,text,cls)=>{const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e;};
function measure(count){host.call('measure',{height:Math.min(640,224+Math.max(1,Math.min(count,expanded?7:5))*64+($('notice').hidden?0:126))}).catch(()=>{});}
async function perform(command){if(pending)return;pending=true;render();
  try{await host.call('command',command);$('status').textContent=command.type==='add'?'已记到本机':command.type==='toggle'?'已保存，可再次勾选撤销':'已在主程序打开';return true;}
  catch(e){$('status').textContent=e.message.replace(/^Error invoking remote method '[^']+': Error: /,'');return false;}
  finally{pending=false;render();}
}
function render(){
  const rows=snapshot?.[tab]||[],showDone=$('completed').checked,visible=rows.filter(r=>!r.done||showDone||r.id===undoId),limit=expanded?visible.length:5;
  const disabled=pending||!snapshot||snapshot.busy;
  $('count').textContent=(tab==='today'?(snapshot?.day||'今日')+' · ':'')+rows.filter(r=>!r.done).length+' 项未完成';
  $('items').replaceChildren();
  for(const r of visible.slice(0,limit)){
    const row=element('div','',`item ${r.color}`),check=element('button',r.done?'✓':'','check'),body=element('button','','body');
    check.type=body.type='button';check.disabled=disabled||r.conflict;check.setAttribute('aria-label',(r.done?'恢复：':'完成：')+r.title);check.setAttribute('aria-pressed',String(r.done));
    check.onclick=()=>{undoId=r.id;perform({type:'toggle',id:r.id,revision:r.revision,done:!r.done});};
    body.append(element('span',r.title,'title'));
    let detail=r.kind==='longtodo'?(r.ddl?'截止 '+r.ddl:'未设截止日期'):r.start?`日程 ${r.start}–${r.end}`:'今日 TODO';
    if(r.ddl&&r.ddl<snapshot.day&&!r.done)detail+=' · 已逾期';if(r.ddl===snapshot.day&&!r.done)detail+=' · 今天截止';if(r.conflict)detail+=' · 版本冲突';
    body.append(element('span',detail,'detail'));body.disabled=disabled;body.onclick=()=>perform({type:'open',id:r.id});row.append(check,body);$('items').append(row);
  }
  if(!visible.length)$('items').append(element('p',snapshot?'这里暂时没有待办事项':'正在读取主程序数据…'));
  $('more').hidden=visible.length<=5;$('more').textContent=expanded?'收起':'查看全部 '+visible.length+' 项';
  $('add').querySelector('button').disabled=disabled;$('title').disabled=pending;
  for(const b of document.querySelectorAll('[data-tab]'))b.setAttribute('aria-pressed',String(b.dataset.tab===tab));
  $('title').placeholder=tab==='today'?'记一件今天要做的事…':'记一个长期目标…';measure(Math.min(visible.length,limit));
}
for(const b of document.querySelectorAll('[data-tab]'))b.onclick=()=>{tab=b.dataset.tab;expanded=false;render();};
$('completed').onchange=render;$('more').onclick=()=>{expanded=!expanded;render();};
$('close').onclick=()=>host.call('hide');$('main').onclick=()=>host.call('showMain');
$('pin').onclick=()=>host.call('pin',$('pin').getAttribute('aria-pressed')!=='true');
$('title').oninput=()=>host.call('draft',!!$('title').value.trim()).catch(()=>{});
$('add').onsubmit=async e=>{e.preventDefault();const title=$('title').value.trim();if(!title)return;if(await perform({type:'add',tab,title})){$('title').value='';host.call('draft',false).catch(()=>{});}};
$('snooze').onclick=()=>host.call('snooze');$('dismiss').onclick=()=>host.call('dismiss');
host.onEvent(({type,value})=>{
  if(type==='snapshot'){const serialized=JSON.stringify(value);if(serialized===lastData)return;lastData=serialized;snapshot=value;render();}
  if(type==='settings'){$('pin').setAttribute('aria-pressed',String(value.pinned));$('pin').textContent=value.pinned?'已固定':'固定';}
  if(type==='notice'){$('notice').hidden=!value;$('notice-title').textContent=value?.title||'';$('notice-detail').textContent=value?.detail||'';render();}
});
render();host.call('ready').catch(e=>$('status').textContent=e.message);
