const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {classify,status}=require('../renderer/pricing.js');
const {Store,DEFAULT_PROMPT,defaults}=require('../backend/core.cjs');
test.before(()=>fs.mkdir(path.resolve(__dirname,'../work'),{recursive:true}));
const at=(date,time)=>date+'T'+time+':00+08:00';
test('DeepSeek correctly classifies all daily boundaries in Beijing time',()=>{
 for(const [time,peak] of [['08:59',false],['09:00',true],['11:59',true],['12:00',false],['13:59',false],['14:00',true],['17:59',true],['18:00',false]])
 assert.equal(classify(at('2026-10-19',time)).peak,peak,time);
 assert.equal(classify('2026-10-19T01:00:00Z').peak,true);
});
test('weekends, holidays and weekend make-up workdays stay off-peak',()=>{
 for(const date of ['2026-10-18','2026-10-10','2026-01-02','2026-02-23','2026-05-04','2026-06-19','2026-09-25','2026-10-07'])assert.equal(classify(at(date,'10:00')).peak,false,date);
 assert.equal(classify(at('2026-10-08','10:00')).peak,true);
 assert.equal(classify(at('2027-01-04','10:00')).known,false);
});
test('next rate transition skips weekend and all-day holidays',()=>{
 assert.equal(status(at('2026-10-19','11:59')).next.at,'2026-10-19T04:00:00.000Z');
 assert.equal(status(at('2026-10-23','18:00')).next.at,'2026-10-26T01:00:00.000Z');
 assert.equal(status(at('2026-09-30','18:00')).next.at,'2026-10-08T01:00:00.000Z');
});
test('persona migration preserves previous prompt and recovers interrupted messages',async()=>{
 const dir=await fs.mkdtemp(path.resolve(__dirname,'../work/migrate-'));const config=defaults();delete config.personaVersion;delete config.bootAnimation;config.systemPrompt='Previous custom role.';
 const c={id:'test',title:'keep',messages:[{role:'assistant',content:'retained',status:'streaming'}]};
 await fs.writeFile(path.join(dir,'state.json'),JSON.stringify({config,conversations:[c]}));
 const s=await new Store(dir).init();assert.equal(s.state.config.systemPrompt,DEFAULT_PROMPT);assert.ok(DEFAULT_PROMPT.length>2500);
 assert.equal(await fs.readFile(path.join(dir,'previous-prompt-v0.1.txt'),'utf8'),'Previous custom role.');
 assert.equal(s.get('test').messages[0].status,'interrupted');assert.equal(s.get('test').messages[0].content,'retained');
 await s.configure({provider:'compatible',baseUrl:'https://api.openai.com/v1',model:'test',systemPrompt:'new custom',bootAnimation:false});
 const reloaded=await new Store(dir).init();assert.equal(reloaded.state.config.systemPrompt,'new custom');assert.equal(reloaded.state.config.bootAnimation,false);
});

test('drafts and display preferences survive server restart without becoming chat messages',async t=>{
 const dir=await fs.mkdtemp(path.resolve(__dirname,'../work/draft-'));const {createServer}=require('../backend/server.cjs');
 const server=await createServer({dataDir:dir,webDir:path.resolve(__dirname,'../dist')});t.after(()=>server.close());
 const headers={'X-Fairy-Token':server.token,'Content-Type':'application/json'};
 const post=(r,b)=>fetch(server.origin+'/api/'+r,{method:'POST',headers,body:JSON.stringify(b)});
 const c=await(await post('conversations',{})).json();assert.equal((await post('conversations/'+c.id+'/draft',{draft:'保留但尚未发送'})).status,200);
 await post('config',{provider:'deepseek',baseUrl:'https://api.deepseek.com',model:'deepseek-flash',bootAnimation:false,motion:false});
 const reload=await new Store(dir).init();assert.equal(reload.get(c.id).draft,'保留但尚未发送');assert.equal(reload.get(c.id).messages.length,0);assert.equal(reload.state.config.bootAnimation,false);assert.equal(reload.state.config.motion,false);
});
