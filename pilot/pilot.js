"use strict";
const width=512,height=288,ns='http://www.w3.org/2000/svg';
const $=id=>document.getElementById(id);
const svg=$('scene');
const query=new URLSearchParams(location.search);
const slug=query.get('m');
let chapter,index=0,active=null,frame=0,mode='start';
let running=false,baseline=0,remainder=0,tickId,version=0;
const cached=new Map();

function item(tag,attrs,parent=svg){
  const elem=document.createElementNS(ns,tag);
  for(const [name,value] of Object.entries(attrs))elem.setAttribute(name,value);
  parent.append(elem);return elem;
}
const outline={'vector-effect':'non-scaling-stroke','stroke-linejoin':'round','stroke-linecap':'round'};
function polygons(group, fill, stroke, weight) {
  for(const poly of group) {
    const path=[];
    for(let i=0;i<poly.length;i+=2)path.push(`${poly[i]},${poly[i+1]}`);
    item('polygon',{...outline,points:path.join(' '),fill,stroke,'stroke-width':weight});
  }
}
function line(a,b,style) {
  item('line',{...outline,x1:a[0],y1:a[1],x2:b[0],y2:b[1],stroke:style==='plain'?'#57564e':'#1a1917',
    'stroke-width':style==='plain'?1.03:2,
    'stroke-dasharray':style==='valley'?'6 4':style==='mountain'?'6 3 1 3':'none'});
}
function label(text,x,y,radius){
  item('circle',{cx:x,cy:y,r:radius,fill:'#1b1a18','vector-effect':'non-scaling-stroke',stroke:'#fff','stroke-width':1.25});
  item('text',{x,y:y+radius*.36,fill:'#fff','font-size':radius*1.25,'font-weight':750,'text-anchor':'middle'}).textContent=text;
}

function axes(cue,scale) {
  if(!cue)return;
  const pos=p=>[p[0]*width/100,p[1]*height/100];
  if(cue.axis.length)line(pos(cue.axis[0]),pos(cue.axis[1]),cue.kind);
  if(cue.arrow.length) {
    const def=item('defs',{});
    const head=item('marker',{id:'head',viewBox:'0 0 10 10',refX:8.2,refY:5,orient:'auto',markerWidth:6,markerHeight:6},def);
    item('path',{d:'M0 0L10 5 0 10Z',fill:'#1a1917'},head);
    const [a,b,c]=cue.arrow.map(pos);
    const d=`M${a.join(',')} Q${b.join(',')} ${c.join(',')}`;
    item('path',{...outline,d,fill:'none',stroke:'#fff','stroke-width':5.4});
    item('path',{...outline,d,fill:'none',stroke:'#1a1917','stroke-width':2.4,'marker-end':'url(#head)'});
  }
  for(const [text,a,b] of cue.dots) {
    const [x,y]=pos([a,b]);
    label(text,x,y,scale*.022);
  }
}

function bounds(appearance, cue) {
  const points=appearance[0].flatMap(poly=>{
    const result=[];
    for(let i=0;i<poly.length;i+=2)result.push([poly[i],poly[i+1]]);
    return result;
  });
  for(const [,x,y] of cue?.dots || [])points.push([x*width/100,y*height/100]);
  if(!points.length)return [0,0,width,height];
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  const loX=Math.max(0,Math.min(...xs)-18),loY=Math.max(0,Math.min(...ys)-16);
  const hiX=Math.min(width,Math.max(...xs)+18),hiY=Math.min(height,Math.max(...ys)+16);
  return [loX,loY,hiX,hiY];
}
function paint(appearance,view,cue=null){
  svg.replaceChildren();
  let [x,y,r,b]=view;
  const cx=(x+r)/2,cy=(y+b)/2;
  const w=Math.max(144,r-x),h=Math.max(100,b-y);
  svg.setAttribute('viewBox',`${cx-w/2} ${cy-h/2} ${w} ${h}`);
  const [paper,shadow,hands,seam]=appearance;
  polygons(hands,'#f6f5f1','#a9a59b',.83);
  polygons(paper,'#f5f4ee','#211f1b',1.55);
  polygons(shadow,'#dfddd2','none',0);
  for(const [x,y,u,v] of seam)line([x,y],[u,v],'plain');
  axes(cue,Math.max(w,h));
}

function readBinary(data) {
  const view=new DataView(data),arr=new Uint8Array(data);
  if(String.fromCharCode(...arr.slice(0,3))!=='PL1')throw new Error('format');
  const amount=view.getUint16(3,true),frames=[];
  let offset=5;
  for(let i=0;i<amount;i++){
    const frame=[];
    for(let j=0;j<4;j++){
      const result=[],count=arr[offset++];
      for(let k=0;k<count;k++){
        const size=view.getUint16(offset,true);offset+=2;
        const points=[];
        for(let p=0;p<size;p++)points.push(Math.round(arr[offset++]*(p%2?(height-1):(width-1))/255));
        result.push(points);
      }
      frame.push(result);
    }
    frames.push(frame);
  }
  if(offset!==arr.length)throw new Error('length');
  return frames;
}
async function json(url){
  const response=await fetch(url);
  if(!response.ok)throw new Error(url);
  return response.json();
}
function get_clip(where) {
  const step=chapter.steps[where];
  if(!cached.has(where)){
    const promise=(async()=>{
      const payload=await json(`./data/${slug}/${step.clip}`);
      const text=atob(payload.drawing);
      const zipped=Uint8Array.from(text,c=>c.charCodeAt(0));
      const stream=new Blob([zipped]).stream().pipeThrough(new DecompressionStream('gzip'));
      const frames=readBinary(await new Response(stream).arrayBuffer());
      if(frames.length!==payload.total)throw new Error('frame count');
      return {frames,fps:payload.fps};
    })();
    cached.set(where,promise);
    promise.catch(()=>cached.delete(where));
  }
  return cached.get(where);
}

function controls(){
  $('prev').disabled=index===0;
  $('next').disabled=index===chapter.steps.length-1;
  $('next').textContent=$('next').disabled?'折完啦':'下一步 →';
  $('play').textContent=running?'暂停':mode==='end'?'再看一遍':mode==='motion'?'继续播放':'播放动作';
}
function halt(){
  cancelAnimationFrame(tickId);running=false;baseline=0;remainder=0;controls();
}
function show(kind) {
  mode=kind;
  const step=chapter.steps[index];
  const count=active?.frames.length || 2;
  const final=index===chapter.steps.length-1;
  let frameToDraw,view,cue=null;
  if(kind==='start') {
    frame=0;
    frameToDraw=chapter.states[index];
    view=bounds(frameToDraw);
    $('phase').textContent=index===0?'原纸':`接第 ${index} 步`;
  } else if(kind==='end') {
    frame=count-1;
    frameToDraw=chapter.states[index+1];
    view=bounds(frameToDraw);
    $('phase').textContent=final?'成品 · 折好 '+(index+1):`折好 ${index+1}`;
  } else if(kind==='location') {
    frame=step.focus;
    frameToDraw=step.frame;
    cue=step.cue;
    view=bounds(frameToDraw,cue);
    $('phase').textContent='找这一折的位置';
  } else {
    frameToDraw=active.frames[frame];
    view=step.view;
    $('phase').textContent=`动作进行中 · 第 ${index+1} 步`;
  }
  paint(frameToDraw,view,cue);
  $('position').value=Math.min(1000,Math.round(1000*frame/(count-1)));
  controls();
}
async function ensure(i) {
  try {
    const clip=await get_clip(i);
    if(i!==index)return null;
    active=clip;
    $('status').textContent='';
    return clip;
  }catch(_){
    if(i===index)$('status').textContent='这一折的动作暂时没加载好。点播放重试。起点、定位和结果图仍可看。';
    return null;
  }
}
async function go(i){
  if(i<0||i>=chapter.steps.length)return;
  halt();version++;
  index=i;active=null;
  const step=chapter.steps[index],phase=chapter.phases.find(([a,b])=>a<=step.id&&step.id<=b);
  $('step').value=String(i);
  $('whole').value=step.id;
  $('direction').textContent=phase[2];
  $('title').textContent=`${String(step.id).padStart(2,'0')}  ${step.title}`;
  $('instruction').textContent=step.body;
  $('note').textContent=step.cue?.note || step.note;
  $('check').textContent='折好看看　'+step.checkpoint;
  $('print').textContent=`书第 ${step.page} 页`;
  $('status').textContent='';
  history.replaceState(null,'',`#step-${step.id}`);
  show('start');
  return await ensure(i);
}
function tick(now) {
  if(!running || !active)return;
  const period=1000/(active.fps*($('slow').checked?.88:1.9));
  if(baseline)remainder+=Math.min(240,now-baseline);
  baseline=now;
  if(remainder>=period) {
    const next=Math.min(active.frames.length-1,frame+Math.floor(remainder/period));
    remainder=remainder%period;
    frame=next;
    if(frame===active.frames.length-1){
      halt();show('end');
      if($('continuous').checked && index<chapter.steps.length-1) {
        const token=version;
        setTimeout(async()=>{
          if(token!==version||mode!=='end'||!$('continuous').checked)return;
          if(await go(index+1))play();
        },1100);
      }
      return;
    }
    show('motion');
  }
  tickId=requestAnimationFrame(tick);
}
async function play(reset=false) {
  let i=index,token=++version;
  if(!active) $('status').textContent='正在加载这一步的线稿……';
  const clip=active||await ensure(i);
  if(!clip||i!==index||token!==version)return;
  halt();
  if(reset||mode==='end')frame=0;
  running=true;controls();
  tickId=requestAnimationFrame(tick);
}
function fromHash(){
  const value=Number(location.hash.match(/^#step-(\d+)$/)?.[1])||1;
  return Math.max(0,Math.min(chapter.steps.length-1,value-1));
}
async function start() {
  try {
    if(!slug){
      $('catalog').hidden=false;
      $('loading').hidden=true;
      return;
    }
    if(!['lancer','phenom'].includes(slug))throw new Error('model');
    chapter=await json(`./data/${slug}/book.json`);
    $('number').textContent=slug==='lancer'?'108':'109';
    $('name').textContent=chapter.title;
    $('english').textContent=chapter.english;
    $('supply').textContent=chapter.paper+'  ·  家长带着折';
    document.title=chapter.title+' · 纸飞机折法图册';
    $('whole').max=chapter.steps.length;
    chapter.steps.forEach((step,i)=>$('step').add(new Option(`第 ${step.id} 步 · ${step.title}`,i)));
    $('lesson').hidden=false;
    $('loading').hidden=true;
    await go(fromHash());
  } catch (_) {
    $('loading').textContent='暂时打不开。点上方「纸飞机折法图册」回到目录。';
  }
}
$('play').onclick=()=>running?(version++,halt()):play();
$('replay').onclick=()=>play(true);
$('before').onclick=()=>{version++;halt();show('start');};
$('after').onclick=()=>{version++;halt();show('end');};
$('locate').onclick=()=>{version++;halt();show('location');};
$('restart').onclick=()=>go(0);
$('step').onchange=()=>go(Number($('step').value));
$('next').onclick=()=>go(index+1);
$('prev').onclick=()=>go(index-1);
$('position').oninput=async event=>{
  const value=Number(event.target.value);
  const token=++version,i=index;
  halt();
  const clip=active||await ensure(i);
  if(!clip||i!==index||token!==version)return;
  frame=Math.round(value*(active.frames.length-1)/1000);
  show(frame===0?'start':frame===active.frames.length-1?'end':'motion');
};
window.addEventListener('hashchange',()=>{if(chapter)go(fromHash());});
document.addEventListener('visibilitychange',()=>{if(document.hidden){version++;if(running)halt();}});
start();
