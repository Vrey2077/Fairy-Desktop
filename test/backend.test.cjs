const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const path=require('node:path');
const {Store,defaults,normalizeBase,endpoint,streamChat,requestBody,sseData}=require('../backend/core.cjs');const {createServer}=require('../backend/server.cjs');
const work=path.resolve(__dirname,'../work');
async function temp(){await fs.mkdir(work,{recursive:true});return fs.mkdtemp(path.join(work,'test-'));}
function sse(parts){return new Response(new ReadableStream({start(c){for(const part of parts)c.enqueue(Buffer.from(part));c.close();}}),{headers:{'content-type':'text/event-stream'}});}
const packet=(content,reason=null)=>'data: '+JSON.stringify({choices:[{delta:{content},finish_reason:reason}]})+'\n\n';
test('normalizes API bases and refuses plaintext remote credential endpoints',()=>{assert.equal(endpoint('https://api.deepseek.com/v1/','chat/completions'),'https://api.deepseek.com/v1/chat/completions');assert.equal(normalizeBase('https://api.deepseek.com/chat/completions'),'https://api.deepseek.com');assert.throws(()=>normalizeBase('http://remote.test'));assert.throws(()=>normalizeBase((()=>{const u=new URL('https://example.com');u.username='user';u.password='secret';return u.toString();})()));assert.equal(normalizeBase('http://127.0.0.1:9999'),'http://127.0.0.1:9999');});
test('provider keys remain private and are cleared on endpoint changes',async()=>{const dir=await temp(),s=await new Store(dir).init();await s.configure({provider:'deepseek',baseUrl:'https://api.deepseek.com',model:'deepseek-flash',apiKey:'test-secret'});assert.equal(s.keyFor(),'test-secret');assert.equal(s.publicConfig().profiles.deepseek.hasKey,true);assert.ok(!JSON.stringify(s.publicConfig()).includes('test-secret'));assert.ok(!(await fs.readFile(path.join(dir,'state.json'),'utf8')).includes('test-secret'));await s.configure({provider:'deepseek',baseUrl:'https://other.example/v1',model:'m'});assert.equal(s.keyFor(),'');});
test('deepseek thinking is optional and generic providers receive no vendor parameter',()=>{const c=defaults();assert.ok(!('thinking' in requestBody(c,[])));c.provider='deepseek';assert.deepEqual(requestBody(c,[]).thinking,{type:'disabled'});c.profiles.deepseek.thinking=true;assert.deepEqual(requestBody(c,[]).thinking,{type:'enabled'});});
test('streams fragmented Unicode SSE without losing text or completion status',async()=>{const c=defaults();c.profiles.compatible.model='test';const bytes=Buffer.from(packet('主人，')+packet('我在。','stop')+'data: [DONE]\n\n');const chunks=[];for(let i=0;i<bytes.length;i+=3)chunks.push(bytes.subarray(i,i+3));const events=[];const result=await streamChat(c,'fake',[{role:'user',content:'hello'}],(e,d)=>events.push([e,d]),{fetchImpl:async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/chat/completions');assert.equal(options.redirect,'error');return sse(chunks);}});assert.equal(result.text,'主人，我在。');assert.equal(result.finishReason,'stop');});
test('does not mark interrupted or rejected upstream requests as successful',async()=>{const c=defaults();c.profiles.compatible.model='test';await assert.rejects(streamChat(c,'fake',[],()=>{},{fetchImpl:async()=>sse([packet('partial')])}),/连接意外中断/);await assert.rejects(streamChat(c,'fake',[],()=>{},{fetchImpl:async()=>new Response('{}',{status:401})}),/鉴权失败/);});
test('accepts compatible non-streaming JSON responses',async()=>{const c=defaults();c.profiles.compatible.model='test';const r=await streamChat(c,'fake',[],()=>{},{fetchImpl:async()=>Response.json({choices:[{message:{content:'OK'},finish_reason:'stop'}]})});assert.equal(r.text,'OK');});
test('local API enforces token/origin, streams chat, and persists only public state',async t=>{
 const dir=await temp(),s=await createServer({dataDir:dir,webDir:path.resolve(__dirname,'../dist'),fetchImpl:async()=>sse([packet('连接正常。','stop'),'data: [DONE]\n\n'])});t.after(()=>s.close());
 assert.equal((await fetch(s.origin+'/api/config')).status,403);
 const headers={'X-Fairy-Token':s.token,'Content-Type':'application/json'};
 assert.equal((await fetch(s.origin+'/api/config',{headers:{...headers,Origin:'https://evil.example'}})).status,403);
 const post=async(route,b)=>fetch(s.origin+'/api/'+route,{method:'POST',headers,body:JSON.stringify(b)});
 await post('config',{provider:'compatible',baseUrl:'https://api.example/v1',model:'fake',apiKey:'secret-test-only'});
 const c=await (await post('conversations',{})).json();const stream=await (await post('chat',{conversationId:c.id,text:'协议测试'})).text();assert.match(stream,/event: done/);assert.match(stream,/连接正常/);
 const persisted=await fs.readFile(path.join(dir,'state.json'),'utf8');assert.ok(!persisted.includes('secret-test-only'));const saved=JSON.parse(persisted).conversations[0];assert.equal(saved.messages[1].status,'complete');
});
test('stop endpoint cancels upstream and saves an interrupted response',async t=>{
 let started;const ready=new Promise(r=>started=r);const dir=await temp();
 const s=await createServer({dataDir:dir,webDir:path.resolve(__dirname,'../dist'),fetchImpl:async(_url,{signal})=>{started();return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));}});t.after(()=>s.close());
 const headers={'X-Fairy-Token':s.token,'Content-Type':'application/json'};
 const post=(route,b)=>fetch(s.origin+'/api/'+route,{method:'POST',headers,body:JSON.stringify(b)});
 await post('config',{provider:'compatible',baseUrl:'https://api.example/v1',model:'fake',apiKey:'test-only'});const c=await(await post('conversations',{})).json();
 const pending=post('chat',{conversationId:c.id,text:'cancel test'}).then(r=>r.text());await ready;await post('stop',{conversationId:c.id});const events=await pending;assert.match(events,/interrupted/);assert.equal(s.store.get(c.id).messages[1].status,'interrupted');
});
