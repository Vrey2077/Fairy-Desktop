(() => {
'use strict';
const $=s=>document.querySelector(s);
let config,conversation=null,controller=null,busy=false,activeProvider='compatible',configDrafts={},toastTimer,typingTimer,phase='idle',startedAt=0,listItems=[],bootTimers=[],stickToBottom=true;
const mascot=$('#mascot'),motionQuery=matchMedia('(prefers-reduced-motion: reduce)');
async function api(route,{method='GET',body,signal}={}){
 const res=await fetch('/api/'+route,{method,headers:{'X-Fairy-Token':window.FAIRY_TOKEN,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal});
 if(!res.ok){let j;try{j=await res.json();}catch{}throw new Error(j?.error||'请求失败，请重试。');}return res;
}
async function json(route,options){return (await api(route,options)).json();}
function notice(text){clearTimeout(toastTimer);$('#toast').textContent=text;$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,3200);}
function setFormNotice(text,error=false){$('#settings-notice').textContent=text;$('#settings-notice').classList.toggle('error',error);}
function isLocal(p){try{return ['localhost','127.0.0.1','[::1]'].includes(new URL(p.baseUrl).hostname);}catch{return false;}}
function ready(){const p=config.profiles[config.provider];return !!p.model&&(p.hasKey||isLocal(p));}
const speech=FairyVoice.create({api,getConfig:()=>config,onState:id=>{document.body.classList.toggle('voice-playing',!!id);$('#voice-stop').hidden=!id;$('#voice-preview').textContent=id==='preview'?'■ 停止试听':'▷ 试听系统音色';document.querySelectorAll('.read-aloud').forEach(b=>{const active=b.dataset.id===id;b.textContent=active?'■ 停止':'▷ 朗读';b.setAttribute('aria-pressed',String(active));});},onError:report});
function updateConfig(){
 const p=config.profiles[config.provider];
 $('#provider-label').textContent=config.provider==='deepseek'?'DeepSeek':'API';$('#model-label').textContent=p.model||'选择模型';
 $('#mini-status').textContent=ready()?'连接已配置':'等待配置';$('#connection-state').textContent=ready()?'已配置 · '+(config.provider==='deepseek'?'DeepSeek':'兼容 OpenAI'):'等待 API 配置';
 document.body.classList.toggle('motion-off',!config.motion);document.body.classList.toggle('motion-on',config.motion);
 $('#motion-toggle').setAttribute('aria-pressed',String(!config.motion));$('#motion-toggle').textContent=config.motion?'Ⅱ 动画':'▷ 动画';
 document.body.style.setProperty('--message-font',config.appearance.fontSize+'px');document.body.classList.toggle('compact',config.appearance.density==='compact');document.body.classList.toggle('no-scanlines',!config.appearance.scanlines);$('#voice-toggle').setAttribute('aria-pressed',String(config.voice.enabled));$('#voice-toggle').textContent=config.voice.enabled?'♪ 朗读开':'♪ 朗读关';$('.send-hint').textContent=config.chat.sendShortcut==='ctrlEnter'?'Ctrl Enter 发送 · Enter 换行':'Enter 发送 · Shift Enter 换行';
 motionState();updatePricing();updateComposer();
}
function motionState(){const paused=!config?.motion||document.hidden;mascot.toggleAttribute('data-visual-suspended',paused);document.body.classList.toggle('visual-suspended',document.hidden);}
document.addEventListener('visibilitychange',()=>{motionState();if(!document.hidden)updatePricing();});
motionQuery.addEventListener('change',()=>{if(config)updateConfig();if(!config?.motion)finishBoot();});
function setPhase(next,label){
 phase=next;document.body.dataset.phase=next;
 mascot.dataset.state=next==='thinking'?'thinking':'normal';
 const labels={idle:'待命中',typing:'正在聆听',thinking:'思考中',answering:'正在回答'};
 $('#activity-label').textContent=labels[next];$('#input-status').textContent=label||({idle:$('#prompt').value?'草稿已保留':'就绪',typing:'正在聆听你的指令',thinking:'正在等待模型响应',answering:'正在生成回答'})[next];
 if(next==='idle')$('#elapsed').textContent='';
}
function setBusy(value){
 busy=value;document.body.classList.toggle('busy',value);$('#send').hidden=value;$('#stop').hidden=!value;$('#stop').disabled=false;
 for(const id of ['#new-chat','#delete-chat','#settings-open','#model-picker','#boot-replay','#export'])$(id).disabled=value;
 $('#messages').setAttribute('aria-busy',String(value));if(value){clearTimeout(typingTimer);startedAt=performance.now();setPhase('thinking');}else setPhase('idle');updateComposer();
}
function updateComposer(){const p=$('#prompt');p.style.height='auto';p.style.height=Math.min(180,Math.max(42,p.scrollHeight))+'px';$('#send').disabled=busy||!p.value.trim();}
const draftTimers=new Map();
function saveDraft(){if(!conversation)return;const id=conversation.id,text=$('#prompt').value;conversation.draft=text;localStorage.setItem('fairy-draft-'+id,text);clearTimeout(draftTimers.get(id));draftTimers.set(id,setTimeout(()=>{draftTimers.delete(id);json('conversations/'+id+'/draft',{method:'POST',body:{draft:text}}).catch(report);},300));}
function restoreDraft(){ $('#prompt').value=conversation?localStorage.getItem('fairy-draft-'+conversation.id)??conversation.draft??'':'';updateComposer();if(!busy)setPhase('idle');}
let accountAt=0,accountPending=null;
function updatePricing(){
 if(!config)return;const p=config.profiles[config.provider];let official=false;try{official=new URL(p.baseUrl).hostname==='api.deepseek.com';}catch{}
 if(config.provider==='deepseek'||official){const period=FairyPricing.status();$('#pricing-title').textContent=period.label+(!period.known?' · 估算':'');$('#pricing-next').textContent=period.next?'下一次切换 '+new Date(period.next.at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})+' · '+period.next.label:'';}
 else{$('#pricing-title').textContent='Fairy · '+$('#activity-label').textContent;$('#pricing-next').textContent=p.model||'等待连接';}
}
async function refreshAccount(force=false){if(accountPending)return accountPending;if(!force&&Date.now()-accountAt<60000)return;$('#account-refresh').disabled=true;accountPending=(async()=>{try{const a=await json('account');$('#account-balance').textContent=a.balance.balances?.map(x=>(x.currency==='CNY'?'¥':x.currency==='USD'?'$':x.currency+' ')+x.total).join(' / ')||'—';$('#account-requests').textContent=a.usage.requests+' 次';$('#account-input').textContent=a.usage.reported||!a.usage.requests?a.usage.input.toLocaleString():'—';$('#account-output').textContent=a.usage.reported||!a.usage.requests?a.usage.output.toLocaleString():'—';$('#account-note').textContent=[a.balance.error||(!a.balance.supported?'此接口不提供余额':''),a.usage.unreported?a.usage.unreported+' 次未返回用量':'北京时间 · 本机统计'].filter(Boolean).join(' · ');accountAt=Date.now();}catch(e){$('#account-note').textContent=e.message;}finally{accountPending=null;$('#account-refresh').disabled=false;}})();return accountPending;}
$('#eye-trigger').addEventListener('click',()=>{$('.eye-wrap').classList.toggle('pinned');updatePricing();refreshAccount();});
$('#eye-trigger').addEventListener('pointerenter',()=>{updatePricing();refreshAccount();});$('#eye-trigger').addEventListener('focus',()=>{updatePricing();refreshAccount();});
$('#account-refresh').addEventListener('click',()=>refreshAccount(true));
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.eye-wrap'))$('.eye-wrap').classList.remove('pinned');});
document.addEventListener('pointermove',e=>{if(phase!=='idle'||!config?.motion)return;const r=$('#eye-trigger').getBoundingClientRect();mascot.style.setProperty('--look-x',Math.max(-8,Math.min(8,(e.clientX-r.x-r.width/2)/80))+'px');mascot.style.setProperty('--look-y',Math.max(-6,Math.min(6,(e.clientY-r.y-r.height/2)/80))+'px');});
function finishBoot(){for(const timer of bootTimers)clearTimeout(timer);bootTimers=[];$('#boot').classList.add('leaving');setTimeout(()=>{$('#boot').hidden=true;$('.workspace').inert=false;$('#prompt').focus();},450);}
function playBoot(){
 if(!config?.motion){notice('启用动态效果后可播放开屏。');return;}
 for(const timer of bootTimers)clearTimeout(timer);bootTimers=[];$('#boot').hidden=false;$('#boot').classList.remove('leaving');$('.workspace').inert=true;
 $('#boot-status').textContent='本地终端已连接';$('#boot-skip').focus();
 const stages=[[850,'正在载入 Fairy 界面'],[1750,'Ⅲ 型总序式集成人工智能'],[2500,'系统就绪。主人，欢迎回来。']];
 for(const [ms,text] of stages)bootTimers.push(setTimeout(()=>$('#boot-status').textContent=text,ms));bootTimers.push(setTimeout(finishBoot,3400));
}
$('#boot-skip').addEventListener('click',finishBoot);$('#boot-replay').addEventListener('click',playBoot);
function scrollLatest(){const box=$('#messages');box.scrollTop=box.scrollHeight;stickToBottom=true;$('#scroll-latest').hidden=true;}
$('#messages').addEventListener('scroll',()=>{const b=$('#messages');stickToBottom=b.scrollHeight-b.scrollTop-b.clientHeight<100;$('#scroll-latest').hidden=stickToBottom;});
$('#scroll-latest').addEventListener('click',scrollLatest);
function richText(target,text){FairyMarkdown.render(target,text);}
function messageElement(m){
 const el=document.createElement('article');el.className='message '+m.role+(m.status==='streaming'?' streaming':'');el.dataset.message=m.id;
 const meta=document.createElement('div');meta.className='message-meta';const b=document.createElement('b');b.textContent=m.role==='assistant'?'✦ FAIRY':'你';const time=document.createElement('time');time.textContent=new Date(m.createdAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});meta.append(b,time);
 const content=document.createElement('div');content.className='message-body';if(m.role==='assistant')richText(content,m.content);else content.textContent=m.content;
 el.append(meta,content);
 if(m.status==='streaming'&&!m.content){const line=document.createElement('div');line.className='thinking-line';const icon=document.createElement('i');icon.className='thinking-spinner';const label=document.createElement('span');label.textContent='Fairy 正在思考…';line.append(icon,label);el.append(line);}
 if(m.error){const err=document.createElement('div');err.className='message-error';err.textContent=m.error;el.append(err);}
 if(m.content&&m.status!=='streaming'){const row=document.createElement('div');row.className='message-tools';const copy=document.createElement('button');copy.textContent='复制';copy.addEventListener('click',()=>FairyMarkdown.copy(m.content,copy));row.append(copy);if(m.role==='assistant'){const read=document.createElement('button');read.className='read-aloud';read.dataset.id=m.id;read.textContent=speech.activeId===m.id?'■ 停止':'▷ 朗读';read.setAttribute('aria-pressed',String(speech.activeId===m.id));read.addEventListener('click',()=>{if(speech.activeId===m.id)speech.stop();else if(!config.voice.enabled)notice('语音已关闭，请先打开右上角朗读开关。');else speech.speak(m.content,m.id);});row.append(read);}if(m.role==='assistant'&&m.model){const model=document.createElement('span');model.textContent=m.model;row.append(model);}el.append(row);}
 return el;
}
function welcome(){
 const wrap=document.createElement('div');wrap.className='welcome';
 wrap.innerHTML='<div class="welcome-hdd" aria-hidden="true"><img src="/terminal-mark.svg" alt=""></div><div class="welcome-kicker">TYPE Ⅲ / FAIRY ONLINE</div><h1>主人，今天从哪里开始？</h1><p>一个计划，一段代码，或一个还没想清楚的问题。<br>我在这里，随时接收你的指令。</p><div class="suggestions"><button data-suggestion="Fairy，帮我把今天的任务整理成清晰的行动计划。">整理行动计划 <span>↗</span></button><button data-suggestion="Fairy，我有一个想法，想和你一起推敲。">推敲一个新想法 <span>↗</span></button><button data-suggestion="Fairy，我想请你帮我检查一段代码。">一起检查代码 <span>↗</span></button><button data-suggestion="Fairy，介绍一下你自己，以及你能帮我做什么。">认识一下 Fairy <span>↗</span></button></div><button class="setup-link">连接与角色设置 ↗</button>';
 wrap.querySelector('.setup-link').addEventListener('click',openSettings);
 wrap.querySelectorAll('[data-suggestion]').forEach(b=>b.addEventListener('click',()=>{$('#prompt').value=b.dataset.suggestion;$('#prompt').dispatchEvent(new Event('input'));$('#prompt').focus();}));return wrap;
}
function renderMessages({scroll=true}={}){
 const box=$('#messages');box.replaceChildren();$('#conversation-title').textContent=conversation?.title||'新对话';
 if(!conversation?.messages.length){box.append(welcome());box.scrollTop=0;$('#chat-notice').hidden=true;}else{conversation.messages.forEach(m=>box.append(messageElement(m)));if(scroll)scrollLatest();}
}
function renderList(){
 const query=$('#conversation-search').value.toLocaleLowerCase();$('#conversation-count').textContent=String(listItems.length).padStart(2,'0');const nav=$('#conversations');nav.replaceChildren();
 listItems.filter(c=>c.title.toLocaleLowerCase().includes(query)).forEach((c,i)=>{
 const btn=document.createElement('button');btn.className='conversation'+(c.id===conversation?.id?' active':'');btn.title=c.title;const index=document.createElement('span');index.className='index';index.textContent='◌';const name=document.createElement('span');name.className='name';name.textContent=c.title;btn.append(index,name);
 btn.addEventListener('click',async()=>{if(busy){notice('请先等待回复完成或停止生成。');return;}try{speech.stop();saveDraft();conversation=await json('conversations/'+c.id);renderMessages();restoreDraft();renderList();}catch(e){report(e);}});nav.append(btn);
 });
}
async function refreshList(){listItems=await json('conversations');renderList();return listItems;}
$('#conversation-search').addEventListener('input',renderList);
function report(e){notice(e.message||'操作失败。');}
async function createConversation(){speech.stop();saveDraft();conversation=await json('conversations',{method:'POST',body:{}});renderMessages();restoreDraft();await refreshList();$('#prompt').focus();}
function currentForm(){return {baseUrl:$('#base-url').value,model:$('#model').value,apiKey:$('#api-key').value,clearKey:$('#clear-key').checked,thinking:$('#thinking').checked};}
function fillProvider(provider){
 activeProvider=provider;const p=configDrafts[provider];for(const b of document.querySelectorAll('[data-provider]'))b.setAttribute('aria-pressed',String(b.dataset.provider===provider));
 $('#base-url').value=p.baseUrl;$('#model').value=p.model;$('#api-key').value=p.apiKey||'';$('#clear-key').checked=!!p.clearKey;$('#thinking').checked=!!p.thinking;$('#thinking-row').hidden=provider!=='deepseek';
 $('#api-key').placeholder=p.hasKey?'留空以保留已保存的密钥':'输入你的 API Key';$('#key-status').textContent=p.hasKey?'已保存 · 不回显':'尚未保存';$('#key-storage').textContent=config.keyStorage==='encrypted'?'使用 Windows 加密保存。':'预览模式：密钥仅保留到程序退出。';
 populateModels(provider==='deepseek'?['deepseek-flash','deepseek-v4-pro']:[]);
}
let modelIds=[],voicesLoaded=false;
function populateModels(models){modelIds=[...new Set([...(models||[]),$('#model').value].filter(Boolean))];renderModels();}
function renderModels(){const box=$('#model-options');box.replaceChildren();$('#model-count').textContent=String(modelIds.length).padStart(2,'0');if(!modelIds.length){const empty=document.createElement('div');empty.className='model-empty';empty.textContent='点击“读取模型”，或在下方填写模型 ID。';box.append(empty);}for(const id of modelIds){const b=document.createElement('button');b.type='button';b.className='model-card';b.setAttribute('aria-pressed',String($('#model').value===id));const name=document.createElement('strong');name.textContent=id;const sub=document.createElement('small');sub.textContent=$('#model').value===id?'当前选择 ✓':'选择此模型';b.append(name,sub);b.addEventListener('click',()=>{$('#model').value=id;renderModels();});box.append(b);}}
$('#model').addEventListener('input',renderModels);
function section(name){document.querySelectorAll('[data-panel]').forEach(p=>p.hidden=p.dataset.panel!==name);document.querySelectorAll('[data-section]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.section===name)));$('.modal-body').scrollTop=0;}
document.querySelectorAll('[data-section]').forEach(b=>b.addEventListener('click',()=>section(b.dataset.section)));
function rangeLabels(){$('#voice-rate-value').textContent=Number($('#voice-rate').value).toFixed(1)+'×';$('#voice-volume-value').textContent=Math.round(Number($('#voice-volume').value)*100)+'%';$('#font-size-value').textContent=$('#font-size').value+' px';}
for(const id of ['#voice-rate','#voice-volume','#font-size'])$(id).addEventListener('input',rangeLabels);
function voiceFields(){$('#api-voice-fields').hidden=$('#voice-engine').value!=='api';$('#system-voice-fields').hidden=$('#voice-engine').value!=='system';}
$('#voice-engine').addEventListener('change',voiceFields);
async function loadVoices(){if(voicesLoaded)return;$('#voice-count').textContent='读取中…';try{const {voices}=await json('voices');const select=$('#voice-id');for(const v of voices){const option=document.createElement('option');option.value=v.id;option.textContent=v.name+' · '+v.language;select.append(option);}select.value=config.voice.voiceId;$('#voice-count').textContent=voices.length+' 个系统音色';voicesLoaded=true;}catch(e){$('#voice-count').textContent=e.message;}}
function openSettings(){
 configDrafts=structuredClone(config.profiles);$('#system-prompt').value=config.systemPrompt;$('#motion').checked=config.motion;$('#boot-enabled').checked=config.bootAnimation!==false;fillProvider(config.provider);
 const v=config.voice,a=config.appearance,c=config.chat;
 $('#voice-enabled').checked=v.enabled;$('#voice-auto').checked=v.autoRead;$('#voice-engine').value=v.engine;$('#voice-id').value=v.voiceId;$('#voice-endpoint').value=v.endpoint;$('#voice-model').value=v.model;$('#voice-api-id').value=v.apiVoice;$('#voice-key').value='';$('#clear-voice-key').checked=false;$('#voice-key-status').textContent=v.hasKey?'密钥已保存':'';$('#voice-rate').value=v.rate;$('#voice-volume').value=v.volume;$('#voice-skip-code').checked=v.skipCode;
 $('#font-size').value=a.fontSize;$('#density').value=a.density;$('#scanlines').checked=a.scanlines;$('#context-count').value=c.contextMessages;$('#max-tokens').value=c.maxTokens??'';$('#temperature').value=c.temperature??'';$('#send-shortcut').value=c.sendShortcut;$('#include-usage').checked=c.includeUsage;
 voiceFields();rangeLabels();section('connection');setFormNotice(config.keyWarning||'');$('#settings').showModal();loadVoices();if(ready())$('#fetch-models').click();
}
function preferenceForm(){return {voice:{enabled:$('#voice-enabled').checked,autoRead:$('#voice-auto').checked,engine:$('#voice-engine').value,voiceId:$('#voice-id').value,endpoint:$('#voice-endpoint').value,model:$('#voice-model').value,apiVoice:$('#voice-api-id').value,rate:Number($('#voice-rate').value),volume:Number($('#voice-volume').value),skipCode:$('#voice-skip-code').checked},voiceKey:$('#voice-key').value,clearVoiceKey:$('#clear-voice-key').checked,appearance:{fontSize:Number($('#font-size').value),density:$('#density').value,scanlines:$('#scanlines').checked},chat:{contextMessages:Number($('#context-count').value),maxTokens:$('#max-tokens').value===''?null:Number($('#max-tokens').value),temperature:$('#temperature').value===''?null:Number($('#temperature').value),sendShortcut:$('#send-shortcut').value,includeUsage:$('#include-usage').checked}};}
async function saveSettings(close=true){
 const prefs=preferenceForm();
 const next=await json('config',{method:'POST',body:{provider:activeProvider,...currentForm(),preferences:prefs,systemPrompt:$('#system-prompt').value,motion:$('#motion').checked,bootAnimation:$('#boot-enabled').checked}});
 config=next;accountAt=0;updateConfig();speech.stop();configDrafts[activeProvider]={...next.profiles[activeProvider]};fillProvider(activeProvider);if(close){$('#settings').close();notice('设置已保存。');}return next;
}
$('#settings-open').addEventListener('click',openSettings);$('#settings-close').addEventListener('click',()=>{$('#settings').close();if(speech.activeId==='preview')speech.stop();});$('#settings').addEventListener('cancel',()=>{if(speech.activeId==='preview')speech.stop();});
document.querySelectorAll('[data-provider]').forEach(b=>b.addEventListener('click',()=>{configDrafts[activeProvider]={...configDrafts[activeProvider],...currentForm()};fillProvider(b.dataset.provider);setFormNotice('');}));
$('#settings-form').addEventListener('submit',async e=>{e.preventDefault();$('#save-config').disabled=true;try{await saveSettings();}catch(err){setFormNotice(err.message,true);}finally{$('#save-config').disabled=false;}});
$('#fetch-models').addEventListener('click',async()=>{
 $('#fetch-models').disabled=true;$('#save-config').disabled=true;const provider=activeProvider,base=$('#base-url').value;setFormNotice('正在读取可用模型…');
 try{const {models}=await json('models',{method:'POST',body:{provider,...currentForm()}});if(activeProvider!==provider||$('#base-url').value!==base)return;populateModels(models);setFormNotice('连接成功 · '+models.length+' 个可用模型。');}catch(e){setFormNotice(e.message,true);}finally{$('#fetch-models').disabled=false;$('#save-config').disabled=false;}
});
$('#voice-preview').addEventListener('click',()=>{if(speech.activeId==='preview'){speech.stop();return;}speech.speak('主人，系统语音已就绪。我在这里，随时接收你的指令。','preview',{voiceId:$('#voice-id').value,rate:Number($('#voice-rate').value),volume:Number($('#voice-volume').value)});});
$('#voice-toggle').addEventListener('click',async()=>{if(!config)return;$('#voice-toggle').disabled=true;try{const enabled=!config.voice.enabled;if(!enabled)speech.stop();config=await json('preferences',{method:'POST',body:{voice:{enabled}}});updateConfig();}catch(e){report(e);}finally{$('#voice-toggle').disabled=false;}});
$('#voice-stop').addEventListener('click',()=>speech.stop());
$('#motion-toggle').addEventListener('click',async()=>{if(!config)return;try{config=await json('config',{method:'POST',body:{provider:config.provider,...config.profiles[config.provider],systemPrompt:config.systemPrompt,motion:!config.motion}});updateConfig();}catch(e){report(e);}});
$('#model-picker').addEventListener('click',openSettings);
$('#persona-reset').addEventListener('click',async()=>{try{const preset=await json('persona');$('#system-prompt').value=preset.prompt;setFormNotice('已载入完整版设定；点击保存后生效。');}catch(e){report(e);}});
$('#persona-copy').addEventListener('click',()=>FairyMarkdown.copy($('#system-prompt').value,$('#persona-copy')));
$('#new-chat').addEventListener('click',()=>createConversation().catch(report));
$('#sidebar-toggle').addEventListener('click',()=>document.body.classList.toggle('sidebar-collapsed'));
$('#delete-chat').addEventListener('click',()=>conversation&&$('#confirm-delete').showModal());
$('#cancel-delete').addEventListener('click',()=>$('#confirm-delete').close());
$('#confirm-delete-button').addEventListener('click',async()=>{
 try{const id=conversation.id;await json('conversations/'+id,{method:'DELETE'});localStorage.removeItem('fairy-draft-'+id);conversation=null;$('#confirm-delete').close();const items=await refreshList();if(items.length){conversation=await json('conversations/'+items[0].id);renderMessages();restoreDraft();renderList();}else await createConversation();}catch(e){report(e);}
});
$('#export').addEventListener('click',()=>{if(!conversation)return;const blob=new Blob([JSON.stringify(conversation,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Fairy-'+conversation.id+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
document.querySelectorAll('[data-window]').forEach(b=>{b.hidden=!window.fairyDesktop;b.addEventListener('click',()=>window.fairyDesktop?.window(b.dataset.window));});
$('#prompt').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing&&(config?.chat.sendShortcut==='ctrlEnter'?(e.ctrlKey||e.metaKey):!e.shiftKey)){e.preventDefault();if(!busy)$('#composer').requestSubmit();}});
$('#prompt').addEventListener('input',()=>{saveDraft();updateComposer();if(busy)return;clearTimeout(typingTimer);setPhase($('#prompt').value?'typing':'idle');typingTimer=setTimeout(()=>{if(!busy)setPhase('idle');},1800);});
$('#stop').addEventListener('click',async()=>{$('#stop').disabled=true;$('#input-status').textContent='正在停止…';try{await json('stop',{method:'POST',body:{conversationId:conversation.id}});}catch{controller?.abort();}});
async function consumeEvents(body,onEvent){
 const reader=body.getReader(),decoder=new TextDecoder();let buf='';
 try{while(true){const {done,value}=await reader.read();if(done)break;buf+=decoder.decode(value,{stream:true});let match;while((match=/\r?\n\r?\n/.exec(buf))){const block=buf.slice(0,match.index);buf=buf.slice(match.index+match[0].length);let name='message',data=[];for(const line of block.split(/\r?\n/)){if(line.startsWith('event:'))name=line.slice(6).trim();if(line.startsWith('data:'))data.push(line.slice(5).trimStart());}if(data.length)onEvent(name,JSON.parse(data.join('\n')));}}}finally{reader.releaseLock();}
}
$('#composer').addEventListener('submit',async e=>{
 e.preventDefault();const text=$('#prompt').value.trim();if(!text||busy||!config)return;speech.stop();
 if(!ready()){openSettings();setFormNotice('请先配置模型和 API Key，再开始对话。');return;}
 if(!conversation)await createConversation();
 $('#usage-label').textContent='本地保存会话';$('#connection-state').textContent='正在连接…';const start=performance.now();controller=new AbortController();setBusy(true);$('#chat-notice').hidden=true;$('#prompt').value='';saveDraft();updateComposer();
 const user={id:'pending-user',role:'user',content:text,status:'complete',createdAt:new Date().toISOString()},answer={id:'pending-answer',role:'assistant',content:'',status:'streaming',createdAt:new Date().toISOString()};
 if(!conversation.messages.length)$('#messages').replaceChildren();$('#messages').append(messageElement(user));const answerEl=messageElement(answer);$('#messages').append(answerEl);const content=answerEl.querySelector('.message-body');scrollLatest();
 let gotFirst=false,terminalEvent=false,renderTimer=null;
 const paint=()=>{renderTimer=null;richText(content,answer.content);if(stickToBottom)scrollLatest();};
 try{
  const res=await api('chat',{method:'POST',body:{conversationId:conversation.id,text},signal:controller.signal});
  await consumeEvents(res.body,(event,data)=>{
   if(event==='start'){$('#conversation-title').textContent=data.title;conversation.title=data.title;answerEl.dataset.message=data.messageId;refreshList().catch(report);}
   if(event==='delta'){
    answer.content+=data.text;
    if(!gotFirst){gotFirst=true;setPhase('answering');answerEl.querySelector('.thinking-line')?.remove();$('#connection-state').textContent='首字响应 '+((performance.now()-start)/1000).toFixed(1)+'s';document.body.classList.add('connected');}
    if(!renderTimer)renderTimer=setTimeout(paint,120);
   }
   if(event==='status'&&!gotFirst){setPhase('thinking',data.text);const line=answerEl.querySelector('.thinking-line span');if(line)line.textContent=data.text;}
   if(event==='done'){terminalEvent=true;accountAt=0;if(config.voice.enabled&&config.voice.autoRead)speech.speak(data.message.content,data.message.id);if(data.message.usage?.total_tokens)$('#usage-label').textContent=data.message.usage.total_tokens+' tokens';if(data.message.finishReason==='length'){$('#chat-notice').textContent='回复达到模型长度限制，可继续追问。';$('#chat-notice').hidden=false;}}
   if(event==='error'){terminalEvent=true;$('#chat-notice').textContent=data.message;$('#chat-notice').hidden=false;}
  });
  if(!terminalEvent)throw new Error('连接意外中断，已接收内容会保留。');
 }catch(err){$('#chat-notice').textContent=err.name==='AbortError'?'已停止生成。':err.message;$('#chat-notice').hidden=false;}
 finally{
  clearTimeout(renderTimer);controller=null;const shouldScroll=stickToBottom,oldScroll=$('#messages').scrollTop;setBusy(false);
  try{conversation=await json('conversations/'+conversation.id);renderMessages({scroll:shouldScroll});if(!shouldScroll)$('#messages').scrollTop=oldScroll;await refreshList();}catch(err){report(err);}
  $('#prompt').focus();updateComposer();
 }
});
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'){if(!$('#boot').hidden)finishBoot();$('.eye-wrap').classList.remove('pinned');}
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='n'&&!$('#settings').open){e.preventDefault();if(!busy&&$('#boot').hidden)createConversation().catch(report);}
 if(e.key==='F11'){e.preventDefault();window.fairyDesktop?.window('fullscreen');}
});
function tick(){
 $('#clock').textContent=new Date().toLocaleString('zh-CN',{hour12:false}).replaceAll('/','.');
 if(busy)$('#elapsed').textContent=((performance.now()-startedAt)/1000).toFixed(0)+'s';
}tick();setInterval(tick,1000);setInterval(updatePricing,30000);
(async()=>{try{
 config=await json('config');updateConfig();const items=await refreshList();
 if(items.length){conversation=await json('conversations/'+items[0].id);renderMessages();restoreDraft();renderList();}else await createConversation();
 if(config.bootAnimation!==false&&config.motion)playBoot();
}catch(e){$('#messages').textContent='本地服务未能初始化：'+e.message;}})();
})();
