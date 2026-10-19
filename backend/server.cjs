const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomBytes,randomUUID}=require('node:crypto');
const {Store,streamChat,listModels,errorText,DEFAULT_PROMPT,normalizeBase}=require('./core.cjs');
const {todayUsage,recordUsage,balanceReader}=require('./features.cjs');
const {systemSpeech,synthesize}=require('./speech.cjs');
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
const BODY_LIMIT=512*1024;
async function body(req){let text='';for await(const c of req){text+=c;if(Buffer.byteLength(text)>BODY_LIMIT)throw new Error('请求内容过大。');}try{return JSON.parse(text||'{}');}catch{throw new Error('请求格式不正确。');}}
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
async function createServer({dataDir,webDir,vault,port=0,fetchImpl=fetch}){
  const store=await new Store(dataDir,vault).init();const token=randomBytes(32).toString('hex');let origin='';const active=new Map();const readBalance=balanceReader();let voiceList=null;
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; media-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    if(req.headers.host!==new URL(origin).host){json(res,403,{error:'Host rejected'});return;}
    const url=new URL(req.url,origin), route=url.pathname;
    if(route.startsWith('/api/')){
      if(req.headers.origin&&req.headers.origin!==origin){json(res,403,{error:'Origin rejected'});return;}
      if(req.headers['x-fairy-token']!==token){json(res,403,{error:'Session rejected'});return;}
    }
    try{
      if(route==='/api/persona'&&req.method==='GET')return json(res,200,{version:2,prompt:DEFAULT_PROMPT});
      if(route==='/api/config'&&req.method==='GET')return json(res,200,store.publicConfig());
      if(route==='/api/config'&&req.method==='POST')return json(res,200,await store.configure(await body(req)));
      if(route==='/api/preferences'&&req.method==='POST')return json(res,200,await store.preferences(await body(req)));
      if(route==='/api/account'&&req.method==='GET')return json(res,200,{usage:todayUsage(store.state),balance:await readBalance(store.state.config,store.keyFor(),fetchImpl)});
      if(route==='/api/voices'&&req.method==='GET'){if(!voiceList)voiceList=await systemSpeech({action:'voices'});return json(res,200,voiceList);}
      if(route==='/api/speech'&&req.method==='POST'){
        const input=await body(req),controller=new AbortController();res.on('close',()=>{if(!res.writableEnded)controller.abort();});
        const timer=setTimeout(()=>controller.abort(),90000);
        try{const voice={...store.state.config.voice};if(input.preview){voice.engine='system';voice.voiceId=String(input.voiceId||'').slice(0,300);voice.rate=Math.min(2,Math.max(.5,Number(input.rate)||1));}
          const audio=await synthesize(input.text,voice,store.voiceKey(),{signal:controller.signal,fetchImpl});res.writeHead(200,{'Content-Type':audio.type,'Cache-Control':'no-store'});res.end(audio.bytes);
        }finally{clearTimeout(timer);}return;
      }
      if(route==='/api/models'&&req.method==='POST'){
        const input=await body(req),probe=structuredClone(store.state.config);let key=store.keyFor();
        if(input.provider){if(!['compatible','deepseek'].includes(input.provider))throw Error('服务商无效。');const baseUrl=normalizeBase(input.baseUrl);probe.provider=input.provider;probe.profiles[input.provider]={baseUrl,model:input.model||''};key=input.clearKey?'':(input.apiKey||((baseUrl===store.state.config.profiles[input.provider].baseUrl)?store.keyFor(input.provider):''));if(typeof key!=='string'||key.length>8192||/[\r\n]/.test(key))throw Error('密钥格式无效。');}
        const ids=await listModels(probe,key,{fetchImpl,signal:AbortSignal.timeout(25000)});
        return json(res,200,{models:ids});
      }
      if(route==='/api/conversations'&&req.method==='GET')return json(res,200,store.list());
      if(route==='/api/conversations'&&req.method==='POST')return json(res,200,await store.create());
      const draftMatch=route.match(/^\/api\/conversations\/([a-f0-9-]{36})\/draft$/);
      if(draftMatch&&req.method==='POST'){const c=store.get(draftMatch[1]);if(!c)return json(res,404,{error:'会话不存在。'});const input=await body(req);if(typeof input.draft!=='string'||input.draft.length>64000)return json(res,400,{error:'草稿过长。'});c.draft=input.draft;await store.persist();return json(res,200,{ok:true});}
      const match=route.match(/^\/api\/conversations\/([a-f0-9-]{36})$/);
      if(match&&req.method==='GET'){const c=store.get(match[1]);return json(res,c?200:404,c||{error:'会话不存在。'});}
      if(match&&req.method==='DELETE'){if(active.has(match[1]))return json(res,409,{error:'请先停止生成。'});await store.remove(match[1]);return json(res,200,{ok:true});}
      if(route==='/api/stop'&&req.method==='POST'){const input=await body(req);active.get(input.conversationId)?.abort();return json(res,200,{ok:true});}
      if(route==='/api/chat'&&req.method==='POST'){
        const input=await body(req);const c=store.get(input.conversationId);
        if(!c)return json(res,404,{error:'会话不存在。'});
        const text=typeof input.text==='string'?input.text.trim():'';
        if(!text||text.length>64000)return json(res,400,{error:'消息不能为空，且不能超过 64000 字符。'});
        if(active.has(c.id))return json(res,409,{error:'这个会话正在生成回复。'});
        const controller=new AbortController();active.set(c.id,controller);res.on('close',()=>{if(!res.writableEnded)controller.abort();});
        const timeout=setTimeout(()=>controller.abort(new Error('请求超时')),300000);
        const config=structuredClone(store.state.config),key=store.keyFor();
        c.messages.push({id:randomUUID(),role:'user',content:text,status:'complete',createdAt:new Date().toISOString()});
        if(c.title==='新会话')c.title=text.slice(0,30);
        const history=c.messages.filter(m=>m.role==='user'||m.status==='complete').slice(-(config.chat?.contextMessages||60)).map(({role,content})=>({role,content}));
        const answer={id:randomUUID(),role:'assistant',content:'',status:'streaming',provider:config.provider,model:config.profiles[config.provider].model,createdAt:new Date().toISOString()};
        c.messages.push(answer);recordUsage(store.state,answer,config.provider);c.updatedAt=new Date().toISOString();
        const emit=(event,data)=>{if(!res.destroyed)res.write('event: '+event+'\ndata: '+JSON.stringify(data)+'\n\n');};
        try{
          await store.persist();
          res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','Connection':'keep-alive'});
          emit('start',{conversationId:c.id,messageId:answer.id,title:c.title});
          const result=await streamChat(config,key,history,(event,data)=>{if(event==='delta')answer.content+=data.text;emit(event,data);},{fetchImpl,signal:controller.signal});
          answer.status='complete';answer.usage=result.usage;answer.finishReason=result.finishReason;
          recordUsage(store.state,answer,config.provider);await store.persist();emit('done',{message:answer});
        }catch(e){
          answer.status=controller.signal.aborted?'interrupted':'error';answer.error=controller.signal.aborted?'已停止生成。':errorText(e,key);
          recordUsage(store.state,answer,config.provider);await store.persist();if(!res.headersSent)json(res,400,{error:answer.error});else emit('error',{message:answer.error,status:answer.status});
        }finally{clearTimeout(timeout);active.delete(c.id);if(!res.writableEnded)res.end();}
        return;
      }
      if(route==='/bootstrap.js'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'});return res.end('window.FAIRY_TOKEN='+JSON.stringify(token)+';');}
      if(route==='/health'&&req.method==='GET')return json(res,200,{app:'Fairy Desktop',version:'0.3.1'});
      const allow={'/':'index.html','/app.js':'app.js','/pricing.js':'pricing.js','/markdown.js':'markdown.js','/style.css':'style.css','/fairy.svg':'fairy.svg','/fairy.png':'fairy.png','/terminal-mark.svg':'terminal-mark.svg','/terminal-grid.svg':'terminal-grid.svg','/voice.js':'voice.js'};
      if(req.method==='GET'&&Object.hasOwn(allow,route)){
        const file=path.join(webDir,allow[route]);res.writeHead(200,{'Content-Type':TYPES[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});return res.end(await fs.readFile(file));
      }
      json(res,404,{error:'Not found'});
    }catch(e){if(!res.headersSent)json(res,400,{error:errorText(e,store.keyFor())});else res.end();}
  });
  server.requestTimeout=0;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  origin='http://127.0.0.1:'+server.address().port;
  return {server,origin,token,store,close:async()=>{for(const c of active.values())c.abort();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await store.queue;}};
}
module.exports={createServer};
