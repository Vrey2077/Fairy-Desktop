const {app,BrowserWindow,ipcMain,safeStorage,Menu,shell}=require('electron');
const path=require('node:path');const fs=require('node:fs');
const {createServer}=require('../backend/server.cjs');
const root=app.isPackaged?path.resolve(path.dirname(process.execPath),'../..'):path.resolve(__dirname,'..');
const data=path.join(root,'data');fs.mkdirSync(data,{recursive:true});
app.setPath('userData',path.join(data,'chromium'));
app.setPath('sessionData',path.join(data,'chromium'));
app.setPath('logs',path.join(root,'work','logs'));
fs.mkdirSync(path.join(root,'exports'),{recursive:true});app.setPath('downloads',path.join(root,'exports'));
let service,win;
if(!app.requestSingleInstanceLock())app.quit();
else{
 app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.focus();}});
 app.whenReady().then(async()=>{
  const vault=safeStorage.isEncryptionAvailable()?{encrypt:async s=>safeStorage.encryptString(s),decrypt:async b=>safeStorage.decryptString(b)}:null;
  service=await createServer({dataDir:data,webDir:path.join(__dirname,'../dist'),vault});
  fs.mkdirSync(path.join(root,'work'),{recursive:true});
  fs.writeFileSync(path.join(root,'work','desktop-runtime.json'),JSON.stringify({url:service.origin,pid:process.pid,version:app.getVersion()},null,2));
  win=new BrowserWindow({width:1380,height:900,minWidth:980,minHeight:680,backgroundColor:'#080f21',title:'Fairy · Hollow Deep Dive',autoHideMenuBar:true,frame:false,show:false,icon:path.join(__dirname,'../dist/fairy.png'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
  Menu.setApplicationMenu(null);
  win.webContents.session.on('will-download',(_event,item)=>{const name=path.basename(item.getFilename()).replace(/[^a-zA-Z0-9._-]/g,'_');item.setSavePath(path.join(root,'exports',name));});
  win.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!==service.origin)event.preventDefault();});
  ipcMain.on('fairy:window',(event,action)=>{
    if(event.sender!==win.webContents||new URL(event.senderFrame.url).origin!==service.origin)return;
    if(action==='minimize')win.minimize();
    if(action==='maximize')win.isMaximized()?win.unmaximize():win.maximize();
    if(action==='close')win.close();
    if(action==='fullscreen')win.setFullScreen(!win.isFullScreen());
  });
  ipcMain.on('fairy:external',(event,url)=>{
    if(event.sender!==win.webContents||new URL(event.senderFrame.url).origin!==service.origin)return;
    try{const target=new URL(url);if(['https:','http:'].includes(target.protocol)&&!target.username&&!target.password)shell.openExternal(target.toString());}catch{}
  });
  win.once('ready-to-show',()=>win.show());
  await win.loadURL(service.origin);
 }).catch(e=>{fs.mkdirSync(path.join(root,'work'),{recursive:true});fs.writeFileSync(path.join(root,'work','startup-error.log'),String(e.stack||e));app.quit();});
 app.on('window-all-closed',()=>app.quit());
 app.on('before-quit',()=>{service?.server.close();});
}
