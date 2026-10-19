((root)=>{
function plain(text,skipCode=true){let s=String(text);if(skipCode)s=s.replace(/```[\s\S]*?(?:```|$)/g,' ');return s.replace(/!\[[^\]]*\]\([^)]*\)/g,' ').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/https?:\/\/\S+/g,' ').replace(/[*_`#>|~]/g,'').replace(/\s+/g,' ').trim();}
function chunks(text,max=800){const result=[];let rest=text;while(rest.length){let end=Math.min(rest.length,max);if(end<rest.length){const cut=Math.max(rest.lastIndexOf('。',end),rest.lastIndexOf('！',end),rest.lastIndexOf('？',end),rest.lastIndexOf('；',end));if(cut>max/2)end=cut+1;}result.push(rest.slice(0,end));rest=rest.slice(end);}return result;}
function create({api,getConfig,onState,onError}){let seq=0,audio=null,abort=null,url=null,activeId=null,settle=null;
 function stop(){seq++;abort?.abort();abort=null;if(audio){audio.pause();audio.removeAttribute('src');audio.load();audio=null;}settle?.();settle=null;if(url)URL.revokeObjectURL(url);url=null;activeId=null;onState(null);}
 async function speak(text,id='preview',preview=null){stop();const run=seq,voice={...getConfig().voice,...preview};const parts=chunks(plain(text,voice.skipCode));if(!parts.length)return;activeId=id;onState(id);
 try{for(const part of parts){if(run!==seq)break;abort=new AbortController();const res=await api('speech',{method:'POST',body:{text:part,...(preview?{preview:true,voiceId:voice.voiceId,rate:voice.rate}:{})},signal:abort.signal});const blob=await res.blob();if(run!==seq)break;url=URL.createObjectURL(blob);audio=new Audio(url);audio.volume=voice.volume;await new Promise((resolve,reject)=>{settle=resolve;audio.onended=resolve;audio.onerror=()=>reject(Error('音频无法播放。'));audio.play().catch(reject);});if(run!==seq)break;settle=null;if(url)URL.revokeObjectURL(url);url=null;}}
 catch(e){if(run===seq&&e.name!=='AbortError')onError(e);}finally{if(run===seq)stop();}}
 return {stop,speak,get activeId(){return activeId;}};
}
const exported={plain,chunks,create};if(typeof module==='object'&&module.exports)module.exports=exported;else root.FairyVoice=exported;
})(typeof window==='undefined'?globalThis:window);
