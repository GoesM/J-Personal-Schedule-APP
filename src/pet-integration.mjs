import { petSnapshot,executePetCommand } from './pet-model.mjs';
export function connectPet({bridge,getRows,save,isBusy,getPersona,render,openItem,begin,end}) {
  if(!bridge?.onPetCommand)return {publish(){}};
  let scheduled=false;
  const publish=()=>{if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;
    bridge.invoke('petSnapshot',[petSnapshot(getRows(),getPersona(),isBusy())]).catch(()=>{});
  });};
  bridge.onPetCommand(async ({requestId,command})=>{
    let error;
    try {
      if(isBusy())throw Error('正在保存、同步或退出，请稍后再试');
      if(command.type==='open'){openItem(command.id);return;}
      begin();
      try{await executePetCommand(command,{getRows,save,isBusy:()=>false});render();}finally{end();}
    }catch(e){error=e.message;}finally{
      publish();bridge.invoke('petReply',[{requestId,error:error||null}]).catch(()=>{});
    }
  });
  window.addEventListener('item-saved',e=>{
    publish();if(e.detail.effect)bridge.invoke('petEffect',[e.detail.effect]).catch(()=>{});
  });
  // Hidden main window still owns data, reminder snapshots and Git operations.
  setInterval(publish,15000);
  window.addEventListener('focus',publish);
  return {publish};
}
