const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('petHost',{
  call:(method,value)=>ipcRenderer.invoke('pet:call',method,value),
  onEvent:callback=>ipcRenderer.on('pet:event',(_e,message)=>callback(message)),
});
