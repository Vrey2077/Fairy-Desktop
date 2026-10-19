/* Safe DOM renderer: model text is never treated as HTML. */
(function(){
 async function copy(text,button){try{await navigator.clipboard.writeText(text);const old=button.textContent;button.textContent='已复制';setTimeout(()=>button.textContent=old,1200);}catch{button.textContent='复制失败';}}
 function inline(target,text){
  const re=/(\x60[^\x60]+\x60|\*\*[^*]+\*\*|\*[^*\n]+\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g;
  let last=0,m;
  while((m=re.exec(text))){
   target.append(document.createTextNode(text.slice(last,m.index)));const s=m[0];let node;
   if(s[0]==='\x60'){node=document.createElement('code');node.textContent=s.slice(1,-1);}
   else if(s.startsWith('**')){node=document.createElement('strong');node.textContent=s.slice(2,-2);}
   else if(s[0]==='*'){node=document.createElement('em');node.textContent=s.slice(1,-1);}
   else{const x=/^\[([^\]]+)\]\((.+)\)$/.exec(s);node=document.createElement('a');node.textContent=x[1];node.href=x[2];node.target='_blank';node.rel='noreferrer noopener';node.addEventListener('click',e=>{if(window.fairyDesktop?.openExternal){e.preventDefault();window.fairyDesktop.openExternal(x[2]);}});}
   target.append(node);last=re.lastIndex;
  }
  target.append(document.createTextNode(text.slice(last)));
 }
 function render(target,text){
  const frag=document.createDocumentFragment(),lines=text.replace(/\r/g,'').split('\n');let i=0;
  const block=/^(#{1,6}\s|>|[-*+]\s|\d+\.\s|---+$|\x60{3})/;
  while(i<lines.length){
   let line=lines[i];if(!line.trim()){i++;continue;}
   if(line.startsWith('\x60\x60\x60')){
    const language=line.slice(3).trim();let code='';i++;while(i<lines.length&&!lines[i].startsWith('\x60\x60\x60'))code+=lines[i++]+'\n';if(i<lines.length)i++;
    const wrap=document.createElement('div');wrap.className='code-wrap';const head=document.createElement('div');head.className='code-head';const lang=document.createElement('span');lang.textContent=language||'code';const button=document.createElement('button');button.type='button';button.textContent='复制代码';button.addEventListener('click',()=>copy(code.trimEnd(),button));head.append(lang,button);const pre=document.createElement('pre'),c=document.createElement('code');c.textContent=code.trimEnd();pre.append(c);wrap.append(head,pre);frag.append(wrap);continue;
   }
   if(i+1<lines.length&&line.includes('|')&&/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i+1])){
    const wrap=document.createElement('div');wrap.className='table-scroll';const table=document.createElement('table');
    const cells=s=>s.trim().replace(/^\||\|$/g,'').split('|').map(x=>x.trim());
    const row=(s,tag)=>{const tr=document.createElement('tr');for(const value of cells(s)){const td=document.createElement(tag);inline(td,value);tr.append(td);}return tr;};
    const thead=document.createElement('thead');thead.append(row(line,'th'));table.append(thead);i+=2;const tbody=document.createElement('tbody');while(i<lines.length&&lines[i].includes('|')&&lines[i].trim())tbody.append(row(lines[i++],'td'));table.append(tbody);wrap.append(table);frag.append(wrap);continue;
   }
   const h=/^(#{1,6})\s+(.*)$/.exec(line);if(h){const el=document.createElement('h'+Math.min(4,h[1].length));inline(el,h[2]);frag.append(el);i++;continue;}
   if(/^---+$/.test(line.trim())){frag.append(document.createElement('hr'));i++;continue;}
   if(/^\s*([-*+]|\d+\.)\s/.test(line)){
    const ordered=/^\s*\d+\./.test(line),list=document.createElement(ordered?'ol':'ul');
    while(i<lines.length&&new RegExp(ordered?'^\\s*\\d+\\.\\s':'^\\s*[-*+]\\s').test(lines[i])){const li=document.createElement('li');inline(li,lines[i++].replace(/^\s*(?:[-*+]|\d+\.)\s+/,''));list.append(li);}frag.append(list);continue;
   }
   if(line.startsWith('>')){const quote=document.createElement('blockquote');let value='';while(i<lines.length&&lines[i].startsWith('>'))value+=lines[i++].replace(/^>\s?/,'')+'\n';inline(quote,value.trimEnd());frag.append(quote);continue;}
   const para=document.createElement('p');let value=lines[i++];while(i<lines.length&&lines[i].trim()&&!block.test(lines[i])&&!(lines[i+1]&&/^\s*\|?[-: ]+\|/.test(lines[i+1])))value+='\n'+lines[i++];inline(para,value);frag.append(para);
  }
  target.replaceChildren(frag);
 }
 window.FairyMarkdown={render,copy};
})();
