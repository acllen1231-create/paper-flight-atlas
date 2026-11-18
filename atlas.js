"use strict";
const $ = id => document.getElementById(id);
const ns = 'http://www.w3.org/2000/svg';
const target = $('paper');
const query = new URLSearchParams(location.search);
let book;
let current = 0;
let time = 0;
let tickID;
let lastFrame = 0;
let running = false;

const draw = (tag, attrs, parent = target) => {
  const node = document.createElementNS(ns, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  parent.append(node);
  return node;
};
const outline = {stroke:'#131312','vector-effect':'non-scaling-stroke','stroke-width':1.65,'stroke-linejoin':'round'};

function polygon(points, fill, group) {
  draw('polygon', {...outline, points:points.map(point => point.join(',')).join(' '),fill},group);
}
function crease(a,b,dashed,group) {
  draw('line',{...outline,x1:a[0],y1:a[1],x2:b[0],y2:b[1],
    stroke:dashed?'#181817':'#77766e','stroke-width':dashed?1.7:1.15,'stroke-dasharray':dashed?'5 4':'none'},group);
}
function marker() {
  const defs=draw('defs',{});
  const arrow=draw('marker',{id:'arrow',viewBox:'0 0 10 10',refX:8,refY:5,
    markerWidth:6,markerHeight:6,orient:'auto'},defs);
  draw('path',{d:'M 0 0 L 10 5 L 0 10 Z',fill:'#171715'},arrow);
}
function figure(frame,group,arrows=true,markSize=1) {
  polygon(frame.paper,'#fff',group);
  for (const layer of frame.layers) polygon(layer,'#e1dfd8',group);
  for (const [a,b] of frame.creases) crease(a,b,false,group);
  for (const [a,b] of frame.dashed) crease(a,b,true,group);
  for (const [[x,y],name] of frame.marks) {
    draw('circle',{cx:x,cy:y,r:(name?2.15:1.05)*markSize,fill:'#1f1f1b',stroke:'#fff',
      'stroke-width':.65,'vector-effect':'non-scaling-stroke'},group);
    if (name && name.length===1) {
      const badge=draw('text',{x,y:y+.83*markSize,'text-anchor':'middle',fill:'#fff',
        'font-size':2.6*markSize,'font-weight':'750'},group);
      badge.textContent=name;
    }
  }
  if (arrows) for (const [a,b,c] of frame.arrows) {
    const d=`M ${a.join(' ')} Q ${b.join(' ')} ${c.join(' ')}`;
    draw('path',{d,fill:'none',stroke:'#fff','stroke-width':5,'vector-effect':'non-scaling-stroke'},group);
    draw('path',{d,fill:'none',stroke:'#161614','stroke-width':2.25,
      'vector-effect':'non-scaling-stroke','marker-end':'url(#arrow)'},group);
  }
}

function rotatePoint(point, angle, seam) {
  const [a,b]=seam, dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
  const ux=dx/length,uy=dy/length,x=point[0]-a[0],y=point[1]-a[1];
  const along=x*ux+y*uy,cross=y*ux-x*uy;
  const scale=cross*Math.cos(angle), lift=Math.abs(cross)*Math.sin(angle)*.16;
  return [a[0]+along*ux-scale*uy,a[1]+along*uy+scale*ux-lift];
}
function motion(m,t,g) {
  let p=t;
  if (m.practice) p=p<.53?p/.53:(1-p)/.47;
  if (m.opening) p=1-p;
  const angle=(1-Math.cos(Math.PI*p))*Math.PI/2;
  polygon(m.fixed,'#fff',g);
  for (const part of m.parts) {
    polygon(part.paper.map(v=>rotatePoint(v,angle,part.crease)),p>.5?'#d3d2cd':'#e5e4df',g);
    crease(...part.crease,true,g);
  }
}
function between(a,b,t) {
  return a.map(([x,y],i)=>[x+(b[i][0]-x)*t,y+(b[i][1]-y)*t]);
}
function canTween(a,b) {
  return a.paper.length===b.paper.length && a.layers.length===b.layers.length
    && a.layers.every((layer,i)=>layer.length===b.layers[i].length);
}
function betweenFrames(a,b,t,g) {
  polygon(between(a.paper,b.paper,t),'#fff',g);
  for (const [i,layer] of a.layers.entries()) polygon(between(layer,b.layers[i],t),'#e1dfd8',g);
  for (const [x,y] of a.dashed) crease(x,y,true,g);
  for (const [point,name] of a.marks) {
    if (!name || name.length!==1) continue;
    const next=b.marks.find(item=>item[1]===name);
    if (!next) continue;
    const [[x,y]]=between([point],[next[0]],t);
    draw('circle',{cx:x,cy:y,r:2.3,fill:'#1f1f1b',stroke:'#fff','stroke-width':.6,
      'vector-effect':'non-scaling-stroke'},g);
    const letter=draw('text',{x,y:y+.89,'text-anchor':'middle',fill:'#fff','font-size':2.65,'font-weight':'750'},g);
    letter.textContent=name;
  }
}
function render() {
  const step=book.steps[current], frames=step.frames, [x,X,y,Y]=step.bounds;
  const pad=Math.max(X-x,Y-y)*.14;
  target.setAttribute('viewBox',`${x-pad} ${y-pad} ${X-x+2*pad} ${Y-y+2*pad}`);
  target.replaceChildren();
  marker();
  const tween=Math.max(0,Math.min(1,(time-.13)/.75));
  const last=frames.length-1;
  const area=Math.max(X-x,Y-y);
  const g=draw('g',{});
  if (tween<=0 || tween>=1) {
    const frame=tween<=0?0:last;
    figure(frames[frame],g,frame===0,area/78);
    $('phase').textContent=step.phases[frame];
  } else if (step.motion) {
    motion(step.motion,tween,g);
    $('phase').textContent='纸片移动中';
  } else {
    const start=Math.min(last-1,Math.floor(tween*last)), end=start+1, t=tween*last-start;
    const a=frames[start],b=frames[end];
    if (canTween(a,b)) {
      betweenFrames(a,b,t,g);
    } else {
      const index=t<.56?start:end;
      figure(frames[index],g,index===0,area/78);
    }
    $('phase').textContent=step.phases[t<.56?start:end];
  }
  $('position').value=String(Math.round(time*1000));
}
function stop() {
  cancelAnimationFrame(tickID);
  lastFrame=0;
  running=false;
  $('play').textContent=time===1?'再看一遍':time>0?'继续播放':'播放动画';
}
function tick(now) {
  if (!running) return;
  if (lastFrame) time=Math.min(1,time+(now-lastFrame)/($('slow').checked?5700:2850));
  lastFrame=now;
  render();
  if (time===1) return stop();
  tickID=requestAnimationFrame(tick);
}
function play(replay=false) {
  if (running) stop();
  if (replay || time===1) time=0;
  running=true;
  $('play').textContent='暂停';
  tickID=requestAnimationFrame(tick);
}
function seek(value) {
  time=value;
  stop();
  render();
}
function go(index) {
  if (index<0 || index>=book.steps.length) return;
  current=index;
  const step=book.steps[index];
  $('step').value=String(index);
  $('progress').value=index+1;
  $('number').textContent=String(index+1).padStart(2,'0');
  $('title').textContent=step.title;
  $('instruction').textContent=step.body;
  $('type').textContent=step.exact?'机型线图':step.custom?'关键动作线图':'局部动作示意';
  $('hint').textContent=step.hint;
  $('checkpoint').hidden=!step.check;
  $('check').textContent=step.check;
  $('prev').disabled=index===0;
  $('next').disabled=index===book.steps.length-1;
  $('next').textContent=$('next').disabled?'完成':'下一步 →';
  history.replaceState(null,'',`#step-${index+1}`);
  seek(0);
}
async function catalog() {
  const response=await fetch('./data/catalog.json');
  if(!response.ok) throw new Error('catalog');
  const names=await response.json();
  function filter() {
    const term=$('filter').value.toLowerCase().trim();
    const rows=names.filter(row=>row.search.includes(term)).map(row=>{
      const entry=document.createElement('li'), link=document.createElement('a');
      const name=document.createElement('span'), en=document.createElement('small');
      name.textContent=`${row.no}  ${row.cn}`;
      en.textContent=row.en;
      link.href=`?m=${row.slug}`;
      link.append(name,en);
      entry.append(link);
      return entry;
    });
    $('models').replaceChildren(...rows);
  }
  filter();
  $('filter').oninput=filter;
  $('catalog').hidden=false;
}
async function start() {
  try {
    const slug=query.get('m');
    if (!slug) {
      await catalog();
    } else {
      if (!/^[a-z0-9-]+$/.test(slug)) throw new Error('model');
      const result=await fetch(`./data/${slug}.json`);
      if (!result.ok) throw new Error('model');
      book=await result.json();
      $('name').textContent=book.cn;
      $('english').textContent=book.en;
      document.title=`${book.cn} · 纸飞机折叠图鉴`;
      $('progress').max=book.steps.length;
      for (const [i,s] of book.steps.entries()) $('step').add(new Option(`第 ${i+1} 步 · ${s.title}`,i));
      const next=Number(location.hash.match(/^#step-(\d+)$/)?.[1]) || 1;
      go(Math.max(0,Math.min(book.steps.length-1,next-1)));
      $('lesson').hidden=false;
    }
    $('loading').hidden=true;
  } catch (_) {
    $('loading').textContent='这个机型暂时打不开。可以点上方图鉴，按名字再找一次。';
  }
}
$('play').onclick=()=>running?stop():play();
$('replay').onclick=()=>play(true);
$('before').onclick=()=>seek(0);
$('after').onclick=()=>seek(1);
$('position').oninput=e=>seek(Number(e.target.value)/1000);
$('step').onchange=e=>go(Number(e.target.value));
$('prev').onclick=()=>{go(current-1);scrollTo(0,0);};
$('next').onclick=()=>{go(current+1);scrollTo(0,0);};
document.addEventListener('visibilitychange',()=>{if(document.hidden&&running)stop();});
start();
