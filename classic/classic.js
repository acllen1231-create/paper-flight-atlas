'use strict';

const $ = id => document.getElementById(id);
const svg = $('scene');
const slug = new URLSearchParams(location.search).get('m');
const svgNS = 'http://www.w3.org/2000/svg';
const pen = {'vector-effect':'non-scaling-stroke','stroke-linejoin':'round','stroke-linecap':'round'};
const sources = new Map();
const sourceWidth = 512, sourceHeight = 288;
let chapter, oldBook, index = 0, runId = 0, animationFrame = 0;
let motion, currentProgress = 0, isPlaying = false;

function element(tag, attrs, parent=svg) {
  const value = document.createElementNS(svgNS,tag);
  for (const [key,val] of Object.entries(attrs)) value.setAttribute(key,val);
  parent.append(value);
  return value;
}

function polygon(points,fill,stroke='none',weight=1.35, parent=svg) {
  element('polygon',{
    ...pen,points:points.map(p=>p.join(',')).join(' '),fill,stroke,'stroke-width':weight
  },parent);
}

function line(points, stroke, weight, dash='none') {
  element('polyline',{...pen,points:points.map(p=>p.join(',')).join(' '),fill:'none',stroke,
    'stroke-width':weight,'stroke-dasharray':dash});
}

function arrow(points, width) {
  const [a,q,b]=points;
  const point=(p)=>p.join(' ');
  const d=`M ${point(a)} Q ${point(q)} ${point(b)}`;
  element('path',{...pen,d,fill:'none',stroke:'#fff','stroke-width':4.2});
  element('path',{...pen,d,fill:'none',stroke:'#141414','stroke-width':1.8});
  const u=Math.atan2(b[1]-q[1],b[0]-q[0]),s=width*.048;
  polygon([b,...[-.44,.44].map(t=>[b[0]-s*Math.cos(u+t),b[1]-s*Math.sin(u+t)])],'#161616');
}

function plot(view) {
  svg.replaceChildren();
  const [x0,y0,x1,y1]=view;
  svg.setAttribute('viewBox',[x0,y0,x1-x0,y1-y0].join(' '));
}

function bounds(points, margin=9) {
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  return [Math.min(...xs)-margin,Math.min(...ys)-margin,Math.max(...xs)+margin,Math.max(...ys)+margin];
}

function plate(card,action=true) {
  const view=bounds([...card.paper.flat(),...card.arrows.flat(),...card.dots.map(row=>row.slice(1))]);
  plot(view);
  const defs=element('defs',{});
  const clip=element('clipPath',{id:'paper-limit'},defs);
  for (const p of card.paper) {
    polygon(p,'#fafafa');
    polygon(p,'#000','none',0,clip);
  }
  const layers=element('g',{'clip-path':'url(#paper-limit)'});
  for (const p of card.layers) polygon(p,'#e2e2e2','none',0,layers);
  for (const p of card.paper) polygon(p,'none','#171717');
  for (const p of card.edges) line(p,'#505050',.87);
  if (!action) return;
  for (const [kind,p] of card.folds) line(p,'#171717',1.55,kind==='mountain'?'7 3 1 3':'6 4');
  const scale=Math.max(view[2]-view[0],view[3]-view[1]);
  for (const p of card.arrows) arrow(p,scale);
  for (const [name,x,y] of card.dots) {
    const r=scale*.0235;
    element('circle',{cx:x,cy:y,r,fill:'#171717',stroke:'#fff',...pen,'stroke-width':.65});
    element('text',{x,y:y+r*.38,fill:'#fff','font-size':r*1.22,'font-weight':700,
      'text-anchor':'middle'}).textContent=name;
  }
}

function pairs(list) {
  const result=[];
  for (let i=0;i<list.length;i+=2) result.push([list[i],list[i+1]]);
  return result;
}

function paperMotion(frame,view) {
  plot(view);
  const [paper,shade,,seams]=frame;
  for (const raw of paper) {
    if (raw.length>=6) polygon(pairs(raw),'#f5f5f5','#232323',1.12);
  }
  for (const raw of shade.slice(0,5)) polygon(pairs(raw),'#dedede');
  for (const [a,b,x,y] of seams.slice(0,8)) {
    if (Math.hypot(a-x,b-y)>19) line([[a,b],[x,y]],'#616161',.76);
  }
}

function readBinary(buffer) {
  const view=new DataView(buffer), arr=new Uint8Array(buffer);
  if (String.fromCharCode(...arr.slice(0,3))!=='PL1') throw Error('format');
  const count=view.getUint16(3,true), frames=[];
  let offset=5;
  for (let i=0;i<count;i++) {
    const groups=[];
    for (let j=0;j<4;j++) {
      const paths=[],n=arr[offset++];
      for (let k=0;k<n;k++) {
        const size=view.getUint16(offset,true); offset+=2;
        const path=[];
        for (let p=0;p<size;p++) path.push(Math.round(arr[offset++]*(p%2?sourceHeight-1:sourceWidth-1)/255));
        paths.push(path);
      }
      groups.push(paths);
    }
    frames.push(groups);
  }
  if (offset!==arr.length) throw Error('length');
  return frames;
}

async function data(name) {
  const response=await fetch(name);
  if (!response.ok) throw Error(name);
  return response.json();
}

function sourceClip(id) {
  if (!sources.has(id)) {
    const request=(async()=>{
      const step=oldBook.steps[id-1];
      const payload=await data(`../pilot/data/${slug}/${step.clip}`);
      const compressed=Uint8Array.from(atob(payload.drawing),c=>c.charCodeAt(0));
      const stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
      const frames=readBinary(await new Response(stream).arrayBuffer());
      if (frames.length!==payload.total) throw Error('clip');
      const [a,b,x,y]=step.view;
      return {
        duration:Math.max(1.4,frames.length/(payload.fps*1.9)),
        draw(progress) {
          paperMotion(frames[Math.round(progress*(frames.length-1))],[a-5,b-5,x+5,y+5]);
        }
      };
    })();
    sources.set(id,request);
    request.catch(()=>sources.delete(id));
  }
  return sources.get(id);
}

function face(a,b,x,y){return [[a,b],[x,b],[x,y],[a,y]];}
function linearFold(fixed,flap,hinge,view,{unfold=false,returnToStart=false,behind=false}={}) {
  const [start,end]=hinge;
  const length=Math.hypot(end[0]-start[0],end[1]-start[1]);
  const ex=(end[0]-start[0])/length,ey=(end[1]-start[1])/length;
  return {duration:returnToStart?3.4:2.4,draw(p) {
    const turn=returnToStart?(p<.5?p*2:2-2*p):p;
    const theta=Math.PI*(unfold?1-turn:turn);
    const projected=flap.map(([x,y])=>{
      const sx=x-start[0],sy=y-start[1];
      const parallel=sx*ex+sy*ey, distance=-sx*ey+sy*ex;
      const height=Math.sin(theta)*distance;
      return [start[0]+parallel*ex-distance*Math.cos(theta)*ey+height*.21,
              start[1]+parallel*ey+distance*Math.cos(theta)*ex-height*.13];
    });
    plot(view);
    if (behind) polygon(projected,'#ddd','#232323');
    polygon(fixed,'#f9f9f9','#232323');
    if (!behind) polygon(projected,theta>Math.PI/2?'#dedede':'#f9f9f9','#232323');
  }};
}

function geometric(model, id) {
  const w=100, h=model==='lancer'?100:129.4;
  const view=[-9,-9,w+9,h+9];
  const half=face(0,0,50,h), right=face(50,0,100,h);
  const middle=[[50,0],[50,h]];
  if (id===1) return linearFold(half,right,middle,view);
  if (model==='lancer') {
    if (id===2) return linearFold(half,right,middle,view,{unfold:true});
    if (id===3) return linearFold(face(0,50,100,100),face(0,0,100,50),[[0,50],[100,50]],view,{returnToStart:true});
    if (id===4) return linearFold(face(0,25,100,100),face(0,0,100,25),[[0,25],[100,25]],view);
    if (id===5) return linearFold(face(50,25,100,100),face(0,25,50,100),[[50,25],[50,100]],view,{behind:true});
    return null;
  }
  if (id===2) return linearFold(half,[[0,0],[50,0],[0,50]],[[0,50],[50,0]],view);
  if (id===3) return linearFold([[0,0],[50,50],[50,h],[0,h]],[[0,0],[50,0],[50,50]],[[0,0],[50,50]],view);
  const folded=[[0,50],[25,25],[75,25],[100,50],[100,h],[0,h]];
  const nose=[[25,25],[50,0],[75,25]];
  if (id===4||id===5) return linearFold(folded,nose,[[25,25],[75,25]],view,{unfold:id===5});
  return null;
}

function show(indexToShow) {
  stop();
  index=Math.max(0,Math.min(chapter.cards.length-1,indexToShow));
  const current=chapter.cards[index];
  motion=null;
  currentProgress=0;
  $('seek').value=0;
  $('seek').disabled=true;
  $('instruction').textContent=current.text;
  $('print').textContent=current.id?`第 ${chapter.steps[current.id]} 页`:'';
  $('phase').textContent=current.id?'折法图':'成品';
  $('play').textContent='播放动作';
  $('play').disabled=!current.id;
  $('step').value=String(index);
  $('prev').disabled=index===0;
  $('next').disabled=!current.id;
  $('next').textContent=current.id?'下一格 →':'折好了';
  $('status').textContent='';
  history.replaceState(null,'',current.id?'#step-'+current.id:'#finish');
  plate(current);
}

function stop() {
  runId++;
  cancelAnimationFrame(animationFrame);
  isPlaying=false;
  $('play').textContent=currentProgress>0&&currentProgress<1?'继续':'播放动作';
}

function animate(token) {
  const started=performance.now(), initial=currentProgress;
  const duration=motion.duration*($('slow').checked?2:1)*1000;
  const tick=(time)=>{
    if (token!==runId) return;
    currentProgress=Math.min(1,initial+(time-started)/duration);
    motion.draw(currentProgress);
    $('seek').value=Math.round(currentProgress*1000);
    if (currentProgress<1) {
      animationFrame=requestAnimationFrame(tick);
    } else {
      isPlaying=false;
      $('phase').textContent='折好这一格';
      $('play').textContent='再看一遍';
      const next=chapter.cards[index+1];
      plate(next,false);
      if ($('auto').checked) setTimeout(()=>{
        if (token!==runId||!$('auto').checked) return;
        show(index+1);
        if (next.id) play();
      },1050);
    }
  };
  animationFrame=requestAnimationFrame(tick);
}

async function play() {
  if (isPlaying) { stop();return; }
  const token=++runId;
  const card=chapter.cards[index];
  try {
    if (!motion) {
      $('status').textContent='正在加载动作……';
      const ready=geometric(slug,card.id) || await sourceClip(card.old);
      if (token!==runId) return;
      motion=ready;
    }
    if (currentProgress>=1) currentProgress=0;
    $('status').textContent='';
    $('phase').textContent='折叠动作';
    $('play').textContent='暂停';
    $('seek').disabled=false;
    isPlaying=true;
    animate(token);
  } catch {
    if (token===runId) $('status').textContent='动作暂时没加载好。点播放重试。';
  }
}

function hashIndex() {
  if (location.hash==='#finish') return chapter.cards.length-1;
  return Math.max(0,(Number(location.hash.match(/^#step-(\d+)$/)?.[1])||1)-1);
}

async function start() {
  if (!slug) {
    $('catalog').hidden=false;
    $('status').textContent='';
    return;
  }
  try {
    if (!['lancer','phenom'].includes(slug)) throw Error('model');
    [chapter,oldBook] = await Promise.all([data(`./${slug}.json`),data(`../pilot/data/${slug}/book.json`)]);
    $('name').textContent=oldBook.title;
    $('number').textContent=slug==='lancer'?'108':'109';
    document.title=`${oldBook.title} · 纸飞机折法图册`;
    chapter.cards.forEach((card,i)=>$('step').add(new Option(card.id?`${card.id} · ${card.text}`:'完成',i)));
    $('lesson').hidden=false;
    show(hashIndex());
    $('play').onclick=play;
    $('diagram').onclick=()=>show(index);
    $('prev').onclick=()=>show(index-1);
    $('next').onclick=()=>show(index+1);
    $('restart').onclick=()=>show(0);
    $('step').onchange=()=>show(Number($('step').value));
    $('seek').oninput=()=>{
      if (!motion) return;
      stop();
      currentProgress=Number($('seek').value)/1000;
      $('phase').textContent='折叠动作';
      motion.draw(currentProgress);
      $('play').textContent=currentProgress===1?'再看一遍':'继续';
    };
    window.addEventListener('hashchange',()=>show(hashIndex()));
    document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  } catch {
    $('status').textContent='暂时打不开这架飞机。点页首回到目录。';
  }
}
start();
