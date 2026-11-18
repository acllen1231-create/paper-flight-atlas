"use strict";
const $=id=>document.getElementById(id);
const ns='http://www.w3.org/2000/svg';
const target=$('paper');
const query=new URLSearchParams(location.search);
let book;
let current=0;
let progress=0;
let playID;
let last=0;
let running=false;
const svg=(tag,attrs,parent=target)=>{
  const node=document.createElementNS(ns,tag);
  for(const [key,value] of Object.entries(attrs)) node.setAttribute(key,value);
  parent.append(node);
  return node;
};
const stroke={'vector-effect':'non-scaling-stroke',stroke:'#171713','stroke-width':1.48,'stroke-linejoin':'round'};
const xy=point=>point.join(' ');

function area(points,fill,g) {
  svg('polygon',{...stroke,points:points.map(p=>p.join(',')).join(' '),fill},g);
}
function line(a,b,style,g) {
  svg('line',{...stroke,x1:a[0],y1:a[1],x2:b[0],y2:b[1],
    stroke:style==='edge'?'#605e57':'#171713',
    'stroke-width':style==='edge'?1.05:1.66,
    'stroke-dasharray':style==='valley'?'5.2 3':style==='mountain'?'5 2.5 1 2.5':'none'},g);
}
function badge(p,label,g) {
  svg('circle',{cx:p[0],cy:p[1],r:label?2.44:.95,fill:'#181815',
    stroke:'#fff','stroke-width':.63,'vector-effect':'non-scaling-stroke'},g);
  if(label) svg('text',{x:p[0],y:p[1]+.93,'text-anchor':'middle',
    fill:'#fff','font-size':2.8,'font-weight':750},g).textContent=label.length===1?label:'•';
}
function defs() {
  const group=svg('defs',{});
  for(const [id,fill] of [['solid','#171713'],['hollow','#fff']]) {
    const marker=svg('marker',{id,viewBox:'0 0 10 10',refX:8,refY:5,
      markerWidth:6,markerHeight:6,orient:'auto'},group);
    svg('path',{d:'M.9 1L9 5 .9 9Z',fill,stroke:'#171713','stroke-width':1},marker);
  }
}
function drawPose(s,g) {
  if(!s)return;
  area(s.paper,'#fff',g);
  s.layers.forEach((p,i)=>area(p,i%2?'#eeede7':'#e1dfd8',g));
  s.creases.forEach(([a,b])=>line(a,b,'edge',g));
  s.marks.forEach(([p,label])=>badge(p,label,g));
}
function drawMove(move,g,breathe=0) {
  if(!move)return;
  const axes=[...(move.axis.length?[move.axis]:[]),...move.extra_axes];
  if(['valley','mountain'].includes(move.kind)) {
    for(const [a,b] of axes) line(a,b,move.kind,g);
  }
  const hollow=['push','reverse','tuck','shape'].includes(move.kind);
  for(const [a,u,b] of move.arrows) {
    const d=`M ${xy(a)} Q ${xy(u)} ${xy(b)}`;
    svg('path',{d,fill:'none',stroke:'#fff','stroke-width':4.7,'vector-effect':'non-scaling-stroke'},g);
    svg('path',{d,fill:'none',stroke:'#171713','stroke-width':2.05,
      'vector-effect':'non-scaling-stroke','marker-end':`url(#${hollow?'hollow':'solid'})`},g);
    if(hollow) svg('path',{d,fill:'none',stroke:'#fff','stroke-width':.63,
      'vector-effect':'non-scaling-stroke'},g);
    if(breathe>0 && breathe<1) {
      const t=breathe,k=1-t;
      const x=k*k*a[0]+2*k*t*u[0]+t*t*b[0];
      const y=k*k*a[1]+2*k*t*u[1]+t*t*b[1];
      svg('circle',{cx:x,cy:y,r:1.45,fill:'#73716a',stroke:'#fff','stroke-width':.45},g);
    }
  }
  move.marks.forEach(([p,label])=>badge(p,label,g));
}
function project(p,angle,seam) {
  const [a,b]=seam;
  const dx=b[0]-a[0],dy=b[1]-a[1],d=Math.hypot(dx,dy);
  const ux=dx/d,uy=dy/d,x=p[0]-a[0],y=p[1]-a[1];
  const along=x*ux+y*uy,cross=y*ux-x*uy;
  const shift=cross*Math.cos(angle),lift=Math.abs(cross)*Math.sin(angle)*.19;
  return [a[0]+along*ux-shift*uy,a[1]+along*uy+shift*ux-lift];
}
function changePose(s,g,move,t) {
  if(move.kind==='turn') {
    g.setAttribute('transform',`rotate(${180*t} 50 42.5)`);
  } else {
    const m=Math.cos(Math.PI*t);
    const horizontal=move.arrows[0] && Math.abs(move.arrows[0][0][0]-move.arrows[0][2][0])>
                      Math.abs(move.arrows[0][0][1]-move.arrows[0][2][1]);
    g.setAttribute('transform',horizontal?`translate(50 0) scale(${m} 1) translate(-50 0)`:
      `translate(0 43) scale(1 ${m}) translate(0 -43)`);
  }
  drawPose(s,g);
}
function animate(phase,move,from,to,g) {
  const p=(1-Math.cos(Math.PI*phase))/2;
  if(move.kind==='turn'||move.kind==='flip') {
    changePose(from,g,move,p);
    return;
  }
  if(move.kind==='tuck' && move.moving.length) {
    const [a,,b]=move.arrows[0];
    drawPose({...from,layers:from.layers.slice(move.moving.length)},g);
    const shift=[(b[0]-a[0])*p,(b[1]-a[1])*p];
    let id='slot-mask';
    const clip=svg('clipPath',{id});
    const left=b[0]>a[0];
    svg('rect',{x:left?0:b[0],y:0,width:left?b[0]:100-b[0],height:86},clip);
    const overlay=svg('g',{'clip-path':`url(#${id})`},g);
    for(const [i,flap] of move.moving.entries()) {
      area(flap.map(([x,y])=>[x+shift[0],y+shift[1]]),i?'#dedcd4':'#c7c5bb',overlay);
    }
    drawMove({...move,marks:move.marks.map(([point,label])=>
      [label==='1'?[point[0]+shift[0],point[1]+shift[1]]:point,label])},g,p);
    return;
  }
  if(move.moving.length && (move.axis.length||move.animation)) {
    let progress=p;
    if(move.animation?.practice)progress=p<=.55?p/.55:(1-p)/.45;
    if(move.animation?.opening || move.kind==='unfold')progress=1-progress;
    const theta=progress*Math.PI*(move.kind==='mountain'?-1:1);
    for(const [i,fixed] of move.fixed.entries())area(fixed,i?'#e3e0d8':'#fff',g);
    move.moving.forEach((layer,i)=>{
      const axis=move.animation?.axes[i]||move.axis;
      area(layer.map(point=>project(point,theta,axis)),p>.5?'#cccac1':'#e1dfd7',g);
    });
    drawMove({...move,arrows:[],marks:[]},g);
    return;
  }
  // If the fold has no flat hinge geometry, display the marked action on the
  // same paper until the next authored paper state is reached.
  drawPose(from,g);
  drawMove(move,g,p);
}
function render() {
  const step=book.steps[current];
  const preceding=book.states[String(current)];
  target.replaceChildren();
  defs();
  const g=svg('g',{});
  const beforeCaption=current===0?'原纸':`接第 ${current} 步`;
  if(!step.moves) {
    $('demo').hidden=!preceding;
    if(preceding){
      $('type').textContent='上一折的纸形';
      $('phase').textContent=beforeCaption;
      drawPose(preceding,g);
    }
    return;
  }
  if(progress===1) {
    $('type').textContent='核对纸形';
    $('phase').textContent=`折好 ${current+1}`;
    drawPose(book.states[String(current+1)],g);
  } else {
    const value=progress*step.moves.length, phase=Math.floor(value);
    const move=step.moves[phase];
    const from=phase===0?preceding:book.states[step.moves[phase-1].to];
    const to=book.states[move.to];
    const local=value-phase;
    $('type').textContent=phase===0?beforeCaption:`动作 ${phase+1}`;
    $('phase').textContent=move.title;
    if(local<.24) { drawPose(from,g); drawMove(move,g); }
    else if(local>.86) drawPose(to,g);
    else animate((local-.24)/.62,move,from,to,g);
  }
  $('position').value=String(Math.round(progress*1000));
}
function stop() {
  cancelAnimationFrame(playID);
  running=false;
  last=0;
  $('play').textContent=progress===1?'再看一遍':progress>0?'继续播放':'播放动作';
}
function animateFrame(now) {
  if(!running)return;
  const stages=book.steps[current].moves.length;
  if(last)progress=Math.min(1,progress+(now-last)/((($('slow').checked)?5850:3050)*stages));
  last=now;
  render();
  if(progress===1){stop();return;}
  playID=requestAnimationFrame(animateFrame);
}
function play(fromStart=false) {
  if(!book.steps[current].moves)return;
  stop();
  if(fromStart||progress===1)progress=0;
  $('play').textContent='暂停';
  running=true;
  playID=requestAnimationFrame(animateFrame);
}
function seek(p) {
  progress=p;
  stop();
  render();
}
function go(index) {
  if(index<0||index>=book.steps.length)return;
  current=index;
  const step=book.steps[index];
  $('step').value=String(index);
  $('progress').value=index+1;
  $('number').textContent=String(index+1).padStart(2,'0');
  $('title').textContent=step.title;
  $('instruction').textContent=step.body;
  $('photo-guide').hidden=!!step.moves;
  $('guide-copy').textContent=`翻到连续对照版第 ${step.page} 页。从左边纸形接着折，右边是本步折好样子。`;
  $('player').hidden=!step.moves;
  $('demo').hidden=!step.moves && !book.states[String(index)];
  $('hint').hidden=!step.moves;
  $('hint').textContent=step.moves?.length>1?'慢慢做，先看第一个动作做完的样子。':'照箭头动纸片。折好后，比一比纸边。';
  $('check').textContent=step.check||'';
  $('checkpoint').hidden=!step.check;
  $('page').textContent=`连续对照版 · 第 ${step.page} 页`;
  $('prev').disabled=index===0;
  $('next').disabled=index===book.steps.length-1;
  $('next').textContent=$('next').disabled?'折完了':'下一步 →';
  history.replaceState(null,'',`#step-${index+1}`);
  seek(0);
}
function hashIndex() {
  const n=Number(location.hash.match(/^#step-(\d+)$/)?.[1])||1;
  return Math.max(0,Math.min(book.steps.length-1,n-1));
}
async function load(name) {
  const res=await fetch(`./data/${name}.json?v=sequence`);
  if(!res.ok)throw new Error(name);
  return await res.json();
}
async function catalog() {
  const models=await load('catalog');
  const filter=()=>{
    const word=$('filter').value.toLowerCase().trim();
    const rows=models.filter(m=>m.search.includes(word)).map(m=>{
      const li=document.createElement('li'),a=document.createElement('a');
      const label=document.createElement('span'),en=document.createElement('small');
      label.textContent=`${m.no}  ${m.cn}`;
      en.textContent=m.en;
      a.href=`?m=${m.slug}`;a.append(label,en);li.append(a);
      return li;
    });
    $('models').replaceChildren(...rows);
  };
  filter();
  $('filter').oninput=filter;
  $('catalog').hidden=false;
}
async function start() {
  try {
    const slug=query.get('m');
    if(!slug)await catalog();
    else {
      if(!/^[a-z0-9-]+$/.test(slug))throw new Error('slug');
      book=await load(slug);
      $('name').textContent=book.cn;
      $('english').textContent=book.en;
      document.title=`${book.cn} · 连续折法`;
      $('coverage').textContent=book.drawn===book.steps.length?
        '每一步接着上一折的纸形。':
        `目前 ${book.drawn} 步有连续线图。其余步骤按页面提示查纸书。`;
      $('progress').max=book.steps.length;
      book.steps.forEach((step,i)=>$('step').add(new Option(`第 ${i+1} 步 · ${step.title}`,i)));
      go(hashIndex());
      $('lesson').hidden=false;
    }
    $('loading').hidden=true;
  } catch(_) {
    $('loading').textContent='没有加载成功。点上方图鉴，从目录重试。';
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
window.addEventListener('hashchange',()=>{if(book)go(hashIndex());});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&running)stop();});
start();
