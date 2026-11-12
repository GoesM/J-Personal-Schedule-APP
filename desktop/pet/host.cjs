const {BrowserWindow,ipcMain,screen,Menu,Tray,nativeImage}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {clampRect,placePanel}=require('./geometry.cjs'),{candidate}=require('./reminders.cjs');
async function createPetHost({root,getMain,requestExit,icon,testing=false}){
  const configPath=path.join(root,'desktop-pet.json');
  let settings={enabled:true,size:192,reminders:true,resting:false},snapshot=null,drag=null,panelOpen=false,pinned=false,notice=null,layout=null;
  let panelSize={width:340,height:440},tray=null,closed=false,lastHit=null,reminderBinding='offline',seen={},feedbackTimer,noticeTimer,bindingReady=false;
  const pending=new Map();let writes=Promise.resolve();
  const read=async(file,fallback)=>{try{return JSON.parse(await fs.readFile(file,'utf8'));}catch{return fallback;}};
  const loaded=await read(configPath,{});settings={...settings,...loaded,size:[144,192,240].includes(loaded.size)?loaded.size:192};
  function persist(file,data){const text=JSON.stringify(data);writes=writes.then(async()=>{const temp=file+'.tmp';await fs.writeFile(temp,text);await fs.rename(temp,file);}).catch(e=>console.error('PET_CONFIG',e.message));return writes;}
  const save=()=>persist(configPath,settings);
  const reminderPath=()=>path.join(root,'pet-reminders-'+reminderBinding+'.json');
  const send=(win,type,value)=>{if(win&&!win.isDestroyed())win.webContents.send('pet:event',{type,value});};
  const options={frame:false,show:false,resizable:false,alwaysOnTop:true,skipTaskbar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,offscreen:testing}};
  const pet=new BrowserWindow({...options,width:settings.size,height:settings.size,transparent:true,hasShadow:false,focusable:false});
  const panel=new BrowserWindow({...options,...panelSize,transparent:false,backgroundColor:'#ffffff',focusable:true});
  for(const win of [pet,panel]){
    win.setMenu(null);win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());
    win.on('close',e=>{if(!closed){e.preventDefault();if(win===pet)toggle(false);else hidePanel();}});
  }
  function showMain(){const main=getMain();if(main&&!testing){if(main.isMinimized())main.restore();main.show();main.focus();}}
  function settingsEvent(){for(const w of [pet,panel])send(w,'settings',{...settings,pinned});}
  function menu(){return Menu.buildFromTemplate([
    {label:'打开 J人日程APP',click:showMain},{label:'显示桌宠',type:'checkbox',checked:settings.enabled,click:()=>toggle(!settings.enabled)},
    {label:'今日 / 长期清单',click:()=>showPanel(true)},
    {label:'角色大小',submenu:[['小',144],['中',192],['大',240]].map(([label,size])=>({label,type:'radio',checked:settings.size===size,click:()=>resize(size)}))},
    {label:'原地休息',type:'checkbox',checked:settings.resting,click:()=>{settings.resting=!settings.resting;save();settingsEvent();refreshMenu();}},
    {label:'无声提醒',type:'checkbox',checked:settings.reminders,click:()=>{settings.reminders=!settings.reminders;if(!settings.reminders){notice=null;send(panel,'notice',null);}save();settingsEvent();refreshMenu();}},
    {type:'separator'},{label:'完全退出',click:()=>{showMain();requestExit();}}
  ]);}
  function refreshMenu(){if(tray)tray.setContextMenu(menu());}
  if(!testing){try{tray=new Tray(nativeImage.createFromPath(icon).resize({width:20,height:20}));tray.setToolTip('J人日程APP');tray.on('double-click',showMain);refreshMenu();}catch(e){console.error('PET_TRAY',e.message);}}
  function workArea(){return screen.getDisplayMatching(pet.getBounds()).workArea;}
  function relocate(){
    if(!panelOpen||drag)return false;
    const rect=placePanel(pet.getBounds(),workArea(),panelSize,pinned?layout:null);
    if(!rect){panel.hide();send(pet,'message','空间不足，请右键打开主程序');return false;}
    layout=rect;panel.setBounds(rect);if(settings.enabled&&!testing)panel.showInactive();return true;
  }
  function showPanel(user=false){if(user&&!settings.enabled)toggle(true);panelOpen=true;const placed=relocate();if(placed&&user&&!testing){panel.show();panel.focus();}send(panel,'snapshot',snapshot);send(panel,'notice',notice);settingsEvent();}
  function hidePanel(){panelOpen=false;pinned=false;panel.hide();settingsEvent();}
  panel.on('blur',()=>{if(!pinned&&!notice&&!drag)hidePanel();});
  function toggle(value=!settings.enabled){settings.enabled=!!value;if(settings.enabled){if(!testing)pet.showInactive();if(panelOpen)relocate();}else{endDrag();pet.hide();panel.hide();}save();settingsEvent();refreshMenu();return settings.enabled;}
  function resize(size){settings.size=size;pet.setBounds(clampRect({...pet.getBounds(),width:size,height:size},workArea()));settings.position=pet.getPosition();save();relocate();settingsEvent();refreshMenu();}
  function recover(){const b=pet.getBounds(),d=screen.getDisplayMatching(b);pet.setBounds(clampRect(b,d.workArea));relocate();}
  const area=screen.getPrimaryDisplay().workArea,pos=Array.isArray(settings.position)?settings.position:[area.x+area.width-settings.size-24,area.y+area.height-settings.size-24];
  pet.setBounds(clampRect({x:Number(pos[0])||0,y:Number(pos[1])||0,width:settings.size,height:settings.size},screen.getDisplayMatching({x:Number(pos[0])||0,y:Number(pos[1])||0,width:settings.size,height:settings.size}).workArea));
  for(const name of ['display-added','display-removed','display-metrics-changed'])screen.on(name,recover);
  let dragTick,testCursor=null;
  const cursor=()=>testing&&testCursor?testCursor:screen.getCursorScreenPoint();
  function startDrag(){
    if(drag)return;clearTimeout(feedbackTimer);const p=cursor();drag={start:p,last:p,bounds:pet.getBounds(),moved:false,at:Date.now(),lastAt:Date.now()};
    pet.setIgnoreMouseEvents(false);lastHit=true;
    dragTick=setInterval(()=>{
      if(!drag)return;const point=cursor(),dx=point.x-drag.start.x,dy=point.y-drag.start.y;
      if(Math.hypot(dx,dy)>4)drag.moved=true;
      if(drag.moved){panel.hide();const next={...drag.bounds,x:drag.bounds.x+dx,y:drag.bounds.y+dy};const a=screen.getDisplayNearestPoint(point).workArea;pet.setBounds(clampRect(next,a));
        const moved=Math.hypot(point.x-drag.last.x,point.y-drag.last.y),now=Date.now();
        send(pet,'motion',{state:moved>.1?'walk':'idle',direction:point.x<drag.last.x?-1:point.x>drag.last.x?1:0,speed:Math.max(.5,Math.min(2.5,moved/Math.max(1,now-drag.lastAt)*1.6))});drag.last=point;drag.lastAt=now;
      }
      if(Date.now()-drag.at>120000)endDrag();
    },32);
  }
  function endDrag(){
    if(!drag)return false;const moved=drag.moved;clearInterval(dragTick);drag=null;
    if(moved){settings.position=pet.getPosition();save();effect('settle');relocate();}
    else if(panelOpen)hidePanel();else{effect('wave');showPanel(true);}
    return moved;
  }
  function effect(state){if(!['added','celebrate','wave','settle'].includes(state)||drag)return;clearTimeout(feedbackTimer);send(pet,'motion',{state});feedbackTimer=setTimeout(()=>send(pet,'motion',{state:settings.resting?'sleep':'idle'}),state==='settle'?350:1500);}
  function command(command){
    if(!snapshot||snapshot.busy)return Promise.reject(Error('日程尚未就绪或正在同步，请稍后再试'));
    if(!command||!['add','toggle','open'].includes(command.type))return Promise.reject(Error('不支持的操作'));
    if(command.type==='open')showMain();
    const requestId=randomUUID();return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{pending.delete(requestId);reject(Error('操作结果尚未确认，请查看最新清单后再操作'));},30000);
      pending.set(requestId,{resolve,reject,timer});getMain().webContents.send('pet-command',{requestId,command});
    });
  }
  async function setBinding(binding){bindingReady=false;snapshot=null;send(panel,'snapshot',null);reminderBinding=/^[a-zA-Z0-9-]+$/.test(binding)?binding:'offline';seen=await read(reminderPath(),{});notice=null;send(panel,'notice',null);bindingReady=true;}
  await setBinding('offline');
  function remind(){if(!bindingReady||!settings.enabled||!settings.reminders||drag||notice||!snapshot)return;
    const next=candidate(snapshot,seen);if(!next)return;
    notice=next;seen[next.key]=null;persist(reminderPath(),seen);send(panel,'notice',notice);
    const wasOpen=panelOpen;showPanel(false);clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>{notice=null;send(panel,'notice',null);if(!wasOpen&&!pinned)hidePanel();else relocate();},20000);
  }
  const reminderTimer=setInterval(remind,30000);
  // Native cursor probing also works when click-through prevents renderer mousemove on Linux.
  const hitTimer=setInterval(()=>{if(closed||!settings.enabled||drag||testing)return;const point=screen.getCursorScreenPoint(),b=pet.getBounds();
    if(point.x<b.x||point.y<b.y||point.x>=b.x+b.width||point.y>=b.y+b.height){if(lastHit!==false){pet.setIgnoreMouseEvents(true);lastHit=false;}}
    else send(pet,'probe',{x:point.x-b.x,y:point.y-b.y});
  },60);
  const handler=async(event,method,value)=>{
    const actor=event.sender===pet.webContents,card=event.sender===panel.webContents;if(!actor&&!card)throw Error('非法桌宠来源');
    switch(method){
      case 'ready':send(actor?pet:panel,'snapshot',snapshot);settingsEvent();send(panel,'notice',notice);return;
      case 'hit':if(actor&&!drag&&typeof value==='boolean'&&lastHit!==value){pet.setIgnoreMouseEvents(!value,process.platform==='win32'?{forward:true}:undefined);lastHit=value;}return;
      case 'dragStart':if(actor&&settings.enabled)startDrag();return;
      case 'dragEnd':if(actor)return endDrag();return;
      case 'menu':if(actor)menu().popup({window:pet});return;
      case 'showMain':showMain();return;
      case 'hide':hidePanel();return;
      case 'pin':if(card){pinned=!!value;settingsEvent();}return;
      case 'draft':if(card)getMain().webContents.send('pet-draft',!!value);return;
      case 'measure':if(card&&value&&Number.isFinite(value.height)){panelSize.height=Math.round(Math.max(260,Math.min(650,value.height)));relocate();}return;
      case 'command':if(card)return command(value);throw Error('操作仅供清单使用');
      case 'snooze':case 'dismiss':if(card&&notice){seen[notice.key]=method==='snooze'?Date.now()+300000:null;persist(reminderPath(),seen);notice=null;clearTimeout(noticeTimer);send(panel,'notice',null);if(!pinned)hidePanel();}return;
      default:throw Error('不支持的桌宠接口');
    }
  };
  ipcMain.handle('pet:call',handler);
  await pet.loadFile(path.join(__dirname,'../../dist/pet/pet.html'));
  await panel.loadFile(path.join(__dirname,'../../dist/pet/panel.html'));
  if(settings.enabled&&!testing)pet.showInactive();
  return {
    toggle,showMain,get enabled(){return settings.enabled;},pet,panel,
    publish(value){snapshot=value;send(pet,'snapshot',snapshot);send(panel,'snapshot',snapshot);},effect,setBinding,
    reply({requestId,error}){const p=pending.get(requestId);if(!p)return;clearTimeout(p.timer);pending.delete(requestId);error?p.reject(Error(error)):p.resolve({ok:true});},
    ...(testing?{testCursor:point=>{testCursor=point;},startDrag,endDrag,showPanel}:{}),
    async dispose(){closed=true;clearInterval(dragTick);clearInterval(hitTimer);clearInterval(reminderTimer);clearTimeout(feedbackTimer);clearTimeout(noticeTimer);ipcMain.removeHandler('pet:call');for(const n of ['display-added','display-removed','display-metrics-changed'])screen.removeListener(n,recover);for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('程序已退出'));}pet.destroy();panel.destroy();tray?.destroy();await writes;},
  };
}
module.exports={createPetHost};
