const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('fairyDesktop',{openExternal:(url)=>ipcRenderer.send('fairy:external',url),window:action=>{if(['minimize','maximize','close','fullscreen'].includes(action))ipcRenderer.send('fairy:window',action);}});
