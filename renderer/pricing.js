/* DeepSeek public billing schedule. Verified 2026-10-19. No credentials/network required. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FairyPricing=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const source='https://api-docs.deepseek.com/zh-cn/quick_start/pricing/';
 const holidays={'2026':[['01-01','01-03'],['02-15','02-23'],['04-04','04-06'],['05-01','05-05'],['06-19','06-21'],['09-25','09-27'],['10-01','10-07']]};
 function classify(instant){
  const d=new Date(new Date(instant).getTime()+8*3600000),year=d.getUTCFullYear(),day=d.getUTCDay(),date=d.toISOString().slice(0,10),md=date.slice(5),mins=d.getUTCHours()*60+d.getUTCMinutes();
  const holiday=(holidays[year]||[]).some(([from,to])=>md>=from&&md<=to),weekend=day===0||day===6,known=!!holidays[year];
  const peak=!holiday&&!weekend&&((mins>=540&&mins<720)||(mins>=840&&mins<1080));
  return {peak,holiday,weekend,known,date,label:peak?'高峰时段':'空闲时段',reason:holiday?'中国节假日':weekend?'周末':'北京时间计费规则'};
 }
 function status(instant=new Date()){
  const now=new Date(instant),result=classify(now);let next=null;
  // Scan only possible boundaries in Beijing time. Weekend make-up workdays remain off-peak.
  const local=new Date(now.getTime()+8*3600000);local.setUTCHours(0,0,0,0);
  for(let day=0;day<16&&!next;day++)for(const hour of [0,9,12,14,18]){
   const at=new Date(local.getTime()+day*86400000+hour*3600000-8*3600000);
   if(at>now&&classify(at).peak!==result.peak){next={at:at.toISOString(),label:classify(at).label};break;}
  }
  return {...result,next,source,verifiedAt:'2026-10-19',caveat:result.known?'按公开计费规则计算，非实时负载；最终以官方账单为准。':'该年节假日尚未内置；按周规则估算，请核对官方日历。'};
 }
 return {classify,status,source};
});
