const fs = require('node:fs/promises');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const DEFAULT_PROMPT = require('./persona.cjs');
const {preferenceDefaults,preferences,migrateLedger}=require('./features.cjs');
const {validateVoiceEndpoint}=require('./speech.cjs');
const defaults=()=>({...preferenceDefaults(),provider:'compatible',profiles:{compatible:{baseUrl:'https://api.openai.com/v1',model:'',thinking:false},deepseek:{baseUrl:'https://api.deepseek.com',model:'deepseek-flash',thinking:false}},systemPrompt:DEFAULT_PROMPT,personaVersion:2,motion:true,bootAnimation:true});
function normalizeBase(value){
  let u;try{u=new URL(String(value).trim());}catch{throw new Error('请输入完整的 API 地址。');}
  if(u.username||u.password||u.search||u.hash)throw new Error('API 地址不能包含密码、查询参数或片段。');
  const local=['localhost','127.0.0.1','[::1]'].includes(u.hostname);
  if(u.protocol!=='https:'&&!(u.protocol==='http:'&&local))throw new Error('远程 API 请使用 HTTPS；本机服务可以使用 HTTP。');
  u.pathname=u.pathname.replace(/\/+$/,'').replace(/\/(?:chat\/completions|models)$/,'');
  return u.toString().replace(/\/+$/,'');
}
function endpoint(base,kind){return normalizeBase(base)+'/'+kind;}
function errorText(error,key=''){
  let s=String(error?.message||error||'请求失败');
  if(key)s=s.split(key).join('[redacted]');
  return s.replace(/Bearer\s+\S+/gi,'Bearer [redacted]').replace(/sk-[A-Za-z0-9_-]+/g,'[redacted]').slice(0,400);
}
async function atomic(file,value){
  const temp=file+'.tmp';await fs.writeFile(temp,value,{mode:0o600});await fs.rename(temp,file);
}
class Store {
  constructor(dir,vault){this.dir=dir;this.vault=vault;this.state={config:defaults(),conversations:[]};this.keys={};this.queue=Promise.resolve();}
  async init(){
    await fs.mkdir(this.dir,{recursive:true});
    try{this.state=JSON.parse(await fs.readFile(path.join(this.dir,'state.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw new Error('无法读取本地会话数据，请检查 data/state.json。');}
    let changed=false;
    this.state.config={...this.state.config,...preferences({},this.state.config)};migrateLedger(this.state);changed=true;
    if(this.state.config.personaVersion!==2){
      const previous=this.state.config.systemPrompt||'';
      if(previous&&previous!==DEFAULT_PROMPT)await fs.writeFile(path.join(this.dir,'previous-prompt-v0.1.txt'),previous,{flag:'wx'}).catch(e=>{if(e.code!=='EEXIST')throw e;});
      this.state.config.systemPrompt=DEFAULT_PROMPT;this.state.config.personaVersion=2;changed=true;
    }
    if(this.state.config.bootAnimation===undefined){this.state.config.bootAnimation=true;changed=true;}
    for(const c of this.state.conversations)for(const m of c.messages)if(m.status==='streaming'){m.status='interrupted';m.error='上次会话在生成期间退出，已保留收到的内容。';changed=true;}
    if(changed)await this.persist();
    if(this.vault){
      try{this.keys=JSON.parse(await this.vault.decrypt(await fs.readFile(path.join(this.dir,'keys.enc'))));}catch(e){if(e.code!=='ENOENT')this.keyWarning='密钥无法解密，请重新填写。';}
    }
    return this;
  }
  persist(){this.queue=this.queue.catch(()=>{}).then(()=>atomic(path.join(this.dir,'state.json'),JSON.stringify(this.state,null,2)));return this.queue;}
  keyFor(provider=this.state.config.provider){const p=this.state.config.profiles[provider];const k=this.keys[provider];return k?.baseUrl===p.baseUrl?k.value:'';}
  publicConfig(){const c=structuredClone(this.state.config);for(const [id,p] of Object.entries(c.profiles))p.hasKey=!!this.keyFor(id);c.voice.hasKey=!!this.voiceKey();return {...c,keyStorage:this.vault?'encrypted':'session',keyWarning:this.keyWarning||''};}
  voiceKey(){const k=this.keys.speech;return k?.baseUrl===this.state.config.voice.endpoint?k.value:'';}
  async preferences(input){
    const next=preferences(input,this.state.config);
    if(next.voice.endpoint)next.voice.endpoint=validateVoiceEndpoint(next.voice.endpoint);
    if(input.voiceKey!==undefined&&(typeof input.voiceKey!=='string'||input.voiceKey.length>8192||/[\r\n]/.test(input.voiceKey)))throw Error('语音密钥格式无效。');
    if(this.keys.speech?.baseUrl!==next.voice.endpoint||input.clearVoiceKey)delete this.keys.speech;
    if(input.voiceKey?.trim())this.keys.speech={baseUrl:next.voice.endpoint,value:input.voiceKey.trim()};
    if(this.vault)await atomic(path.join(this.dir,'keys.enc'),await this.vault.encrypt(JSON.stringify(this.keys)));
    this.state.config={...this.state.config,...next};await this.persist();return this.publicConfig();
  }
  async configure(input){
    if(input.preferences){const p=preferences(input.preferences,this.state.config);if(p.voice.endpoint)validateVoiceEndpoint(p.voice.endpoint);const k=input.preferences.voiceKey;if(k!==undefined&&(typeof k!=='string'||k.length>8192||/[\r\n]/.test(k)))throw Error('语音密钥格式无效。');}
    if(!['compatible','deepseek'].includes(input.provider))throw new Error('请选择有效的 API 类型。');
    const baseUrl=normalizeBase(input.baseUrl),model=String(input.model||'').trim();
    if(model.length>200)throw new Error('模型名称过长。');
    const systemPrompt=String(input.systemPrompt??this.state.config.systemPrompt);
    if(systemPrompt.length>16000)throw new Error('角色设定过长。');
    const apiKey=input.apiKey;
    if(apiKey!==undefined&&(typeof apiKey!=='string'||apiKey.length>8192||/[\r\n]/.test(apiKey)))throw new Error('API Key 格式不正确。');
    const prior=this.keys[input.provider];
    if(prior&&prior.baseUrl!==baseUrl)delete this.keys[input.provider];
    if(input.clearKey)delete this.keys[input.provider];
    else if(apiKey?.trim())this.keys[input.provider]={baseUrl,value:apiKey.trim()};
    if(this.vault)await atomic(path.join(this.dir,'keys.enc'),await this.vault.encrypt(JSON.stringify(this.keys)));
    this.state.config={...this.state.config,provider:input.provider,systemPrompt,personaVersion:2,motion:input.motion===undefined?this.state.config.motion:input.motion!==false,bootAnimation:input.bootAnimation===undefined?this.state.config.bootAnimation:input.bootAnimation!==false,profiles:{...this.state.config.profiles,[input.provider]:{baseUrl,model,thinking:!!input.thinking}}};
    this.keyWarning='';if(input.preferences)await this.preferences(input.preferences);await this.persist();return this.publicConfig();
  }
  list(){return this.state.conversations.map(({id,title,updatedAt,messages})=>({id,title,updatedAt,count:messages.length})).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));}
  get(id){return this.state.conversations.find(c=>c.id===id);}
  async create(){const c={id:randomUUID(),title:'新会话',updatedAt:new Date().toISOString(),messages:[]};this.state.conversations.push(c);await this.persist();return c;}
  async remove(id){this.state.conversations=this.state.conversations.filter(c=>c.id!==id);await this.persist();}
}
async function* sseData(body){
  const decoder=new TextDecoder();let buf='',lines=[];
  const consume=line=>{if(line===''){const value=lines.join('\n');lines=[];return value;}if(line.startsWith('data:'))lines.push(line.slice(5).replace(/^ /,''));return null;};
  for await(const chunk of body){
    buf+=decoder.decode(chunk,{stream:true});if(buf.length>8*1024*1024)throw new Error('服务返回的数据块过大。');
    let end;while((end=buf.indexOf('\n'))>=0){const line=buf.slice(0,end).replace(/\r$/,'');buf=buf.slice(end+1);const value=consume(line);if(value)yield value;}
  }
  buf+=decoder.decode();if(buf){const value=consume(buf.replace(/\r$/,''));if(value)yield value;}
  if(lines.length)yield lines.join('\n');
}
function requestBody(config,messages){
  const p=config.profiles[config.provider];
  const body={model:p.model,messages:[{role:'system',content:config.systemPrompt},...messages],stream:true};
  if(config.provider==='deepseek')body.thinking={type:p.thinking?'enabled':'disabled'};
  const c=config.chat||{};if(c.maxTokens)body.max_tokens=c.maxTokens;if(c.temperature!==null&&c.temperature!==undefined)body.temperature=c.temperature;if(c.includeUsage)body.stream_options={include_usage:true};
  return body;
}
async function upstreamError(res){
  if(res.status===401)return '鉴权失败，请检查 API Key。';
  if(res.status===402)return 'API 账户余额不足，请检查服务商账户。';
  if(res.status===429)return '请求过于频繁或额度不足，请稍后重试。';
  if(res.status===404)return '接口或模型不存在，请检查 API 地址和模型名称。';
  if(res.status>=500)return '模型服务暂时不可用，请稍后重试。';
  return 'API 请求失败（HTTP '+res.status+'），请检查模型与接口参数。';
}
async function listModels(config,key,{fetchImpl=fetch,signal}={}){
  const p=config.profiles[config.provider];
  const res=await fetchImpl(endpoint(p.baseUrl,'models'),{headers:key?{Authorization:'Bearer '+key}:{},signal,redirect:'error'});
  if(!res.ok)throw new Error(await upstreamError(res));
  const json=await res.json();if(!Array.isArray(json.data))throw new Error('服务未返回兼容的模型列表。');
  return json.data.map(x=>x.id).filter(x=>typeof x==='string').slice(0,500);
}
async function streamChat(config,key,messages,onEvent,{fetchImpl=fetch,signal}={}){
  const p=config.profiles[config.provider];
  if(!p.model)throw new Error('请先在 API 设置中填写模型名称。');
  if(!key&&!['localhost','127.0.0.1','[::1]'].includes(new URL(p.baseUrl).hostname))throw new Error('请先在 API 设置中填写 API Key。');
  const res=await fetchImpl(endpoint(p.baseUrl,'chat/completions'),{method:'POST',headers:{'Content-Type':'application/json',...(key?{Authorization:'Bearer '+key}:{})},body:JSON.stringify(requestBody(config,messages)),signal,redirect:'error'});
  if(!res.ok)throw new Error(await upstreamError(res));
  let text='',usage=null,finishReason=null,finished=false,thinkingSent=false;
  if(!(res.headers.get('content-type')||'').includes('text/event-stream')){
    const j=await res.json();const c=j.choices?.[0];text=c?.message?.content||'';if(typeof text!=='string'||!text)throw new Error('模型没有返回文本内容。');
    onEvent('delta',{text});return {text,usage:j.usage||null,finishReason:c?.finish_reason||'stop'};
  }
  for await(const raw of sseData(res.body)){
    if(raw==='[DONE]'){finished=true;break;}
    let j;try{j=JSON.parse(raw);}catch{throw new Error('服务返回了无法解析的流式数据。');}
    if(j.error)throw new Error('模型服务返回错误，请检查接口配置后重试。');
    const c=j.choices?.[0];if(j.usage)usage=j.usage;
    if(c?.finish_reason){finishReason=c.finish_reason;finished=true;}
    if(c?.delta?.reasoning_content&&!thinkingSent){onEvent('status',{text:'深度思考中'});thinkingSent=true;}
    const delta=c?.delta?.content;
    if(typeof delta==='string'&&delta){text+=delta;if(text.length>2_000_000)throw new Error('回复过长，已停止接收。');onEvent('delta',{text:delta});}
  }
  if(!finished)throw new Error('连接意外中断，已保留收到的内容。');
  if(!text)throw new Error('模型没有返回文本内容，请尝试其他模型。');
  return {text,usage,finishReason};
}
module.exports={Store,defaults,normalizeBase,endpoint,errorText,sseData,requestBody,streamChat,listModels,DEFAULT_PROMPT};
