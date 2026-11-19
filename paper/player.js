'use strict';

const get = id => document.getElementById(id);
const sheet = get('sheet');
const slug = new URLSearchParams(location.search).get('m');
const NS = 'http://www.w3.org/2000/svg';
const pen = {'vector-effect':'non-scaling-stroke','stroke-linecap':'round','stroke-linejoin':'round'};

let model, index = 0, progress = 0, timer, stamp = 0;
let showHint = true, playing = false;

function elem(name, attrs, parent=sheet) {
  const node = document.createElementNS(NS, name);
  for (const [key,val] of Object.entries(attrs)) node.setAttribute(key,val);
  parent.append(node);
  return node;
}

function project([x,y,z]) {
  return [x - .27*z, y + .28*z];
}

function planePath(path) {
  return path.map(p => project(p).map(n=>n.toFixed(4)).join(',')).join(' ');
}

function depth(points) {
  return points.reduce((sum, p)=>sum+p[2],0)/points.length;
}

function color(points) {
  const n = [0,0,0];
  points.forEach(([x,y,z],i)=>{
    const [u,v,w]=points[(i+1)%points.length];
    n[0]+=y*w-z*v; n[1]+=z*u-x*w; n[2]+=x*v-y*u;
  });
  const d = Math.hypot(...n)||1;
  const amount = Math.round((n[2]>=0?250:222) - 24*(1-Math.abs(n[2]/d)));
  return `rgb(${amount},${amount},${amount})`;
}

function spin(row, axis, theta) {
  const [a,b]=axis, diff = b.map((p,i)=>p-a[i]), len = Math.hypot(...diff);
  const [u,v,w] = diff.map(p=>p/len), c=Math.cos(theta),s=Math.sin(theta);
  return row.map(p=>{
    const [x,y,z]=p.map((q,i)=>q-a[i]);
    const d = u*x+v*y+w*z;
    return [
      a[0]+x*c+(v*z-w*y)*s+u*d*(1-c),
      a[1]+y*c+(w*x-u*z)*s+v*d*(1-c),
      a[2]+z*c+(u*y-v*x)*s+w*d*(1-c)
    ];
  });
}

function stage(row, amount) {
  const ease = (1 - Math.cos(Math.PI * amount)) / 2;
  return [...row.fixed, ...row.moving.map((f,i)=>({
    p:spin(f.p,row.axis,row.angle*ease),
    k:f.k+(row.endOrder[i]-f.k)*ease,id:f.id
  }))];
}

function current() {
  if (progress===0) return model.views[index] || model.states[index];
  if (progress===1) return model.views[index+1] || model.states[index+1];
  return stage(model.steps[index],progress);
}

function line(points,dash,weight,ink) {
  elem('polyline',{...pen,points:planePath(points),stroke:ink,fill:'none',
    'stroke-width':weight,'stroke-dasharray':dash});
}

function showGuide(move) {
  if (move.foldLine) line(move.foldLine,'6 4',1.6,'#242424');
  if (!move.guide) return;
  const [a,b] = move.guide.map(project);
  const dx=b[0]-a[0],dy=b[1]-a[1], len=Math.hypot(dx,dy);
  const ux=dx/len,uy=dy/len;
  const c=[(a[0]+b[0])/2-uy*10,(a[1]+b[1])/2+ux*10];
  const d=`M ${a.join(' ')} Q ${c.join(' ')} ${b.join(' ')}`;
  elem('path',{...pen,d,stroke:'#fff',fill:'none','stroke-width':5});
  elem('path',{...pen,d,stroke:'#252525',fill:'none','stroke-width':1.7});
  const tip=[b[0]-ux*3.7,b[1]-uy*3.7];
  const arrow=[tip,[tip[0]-ux*5-uy*2.3,tip[1]-uy*5+ux*2.3],[tip[0]-ux*5+uy*2.3,tip[1]-uy*5-ux*2.3]];
  elem('polygon',{points:arrow.map(p=>p.join(',')).join(' '),fill:'#252525'});
  for (const [i,[x,y]] of [a,b].entries()){
    elem('circle',{cx:x,cy:y,r:3.3,fill:i?'white':'#252525',stroke:'#252525',...pen,'stroke-width':1.1});
  }
}

function draw() {
  sheet.replaceChildren();
  const paper=[...current()].sort((a,b)=>depth(a.p)-depth(b.p)+(a.k-b.k)*.002);
  for (const face of paper) {
    elem('polygon',{...pen,points:planePath(face.p),fill:color(face.p),stroke:'#363631',
      'stroke-width':1.03,'data-face':face.id});
  }
  const move=model.steps[index];
  if (!progress && index) {
    for (const seam of model.steps[index-1].carry) line(seam,'1 3',.95,'#67675d');
  } else if (progress===1) {
    for (const seam of move.carry) line(seam,'1 3',.95,'#67675d');
  }
  if (progress===0 && showHint) showGuide(move);
}

function viewport() {
  let l=Infinity,t=Infinity,r=-Infinity,b=-Infinity;
  const allFrames=[...model.states,...model.steps.flatMap(s=>[.2,.5,.8].map(p=>stage(s,p)))];
  for (const frame of allFrames) {
    for (const face of frame) for (const p of face.p) {
      const [x,y]=project(p);
      l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);
    }
  }
  sheet.setAttribute('viewBox', [l-9,t-8,r-l+18,b-t+16].join(' '));
}

function controls() {
  const atEnd=progress===1, final=index===model.steps.length-1;
  get('play').textContent=playing?'暂停':atEnd?(final?(model.major?'折完了':'看后续折法'):'折下一步'):
      progress>0?'接着折':'折一下';
  get('play').disabled=atEnd && final && !model.continuation;
  get('previous').disabled=index===0;
  get('seek').value=Math.round(progress*1000);
  get('phase').textContent=playing?'正在折':atEnd?'折好了':progress>0?'暂停':'折之前';
  get('check').textContent=atEnd?model.steps[index].check:'';
  get('hint').textContent=showHint?'隐藏折线':'显示折线';
  get('hint').setAttribute('aria-pressed',String(showHint));
}

function stop() {
  cancelAnimationFrame(timer);
  stamp++;
  playing=false;
}

function step(i) {
  stop();
  index=Math.max(0,Math.min(model.steps.length-1,i));
  progress=0;
  get('pick').value=String(index);
  get('instruction').textContent=model.steps[index].title;
  history.replaceState(null,'',`#step-${index+1}`);
  draw(); controls();
}

function play() {
  if (playing) { stop();controls();return; }
  if (progress===1) {
    if (index+1===model.steps.length) {
      if (model.continuation) location.href=get('continue').href;
      return;
    }
    step(index+1);
  }
  const token=++stamp, duration=get('slow').checked?4200:2250;
  const starting=progress, start=performance.now();
  playing=true; controls();
  function frame(now) {
    if (token!==stamp) return;
    progress=Math.min(1,starting+(now-start)/duration);
    draw();
    if (progress===1) playing=false;
    controls();
    if (playing) timer=requestAnimationFrame(frame);
  }
  timer=requestAnimationFrame(frame);
}

async function main() {
  try {
    if (!slug) {get('catalog').hidden=false;get('status').textContent='';return;}
    if (!['dart','lancer','phenom'].includes(slug)) throw Error('model');
    const response=await fetch(`./${slug}.json`);
    if (!response.ok) throw Error('network');
    model=await response.json();
    get('name').textContent=model.title;
    get('paper').textContent=model.paper;
    get('chapter').textContent=model.chapter;
    if (model.continuation) {
      const target=get('continue');
      target.href=`../classic/?m=${slug}#step-${model.continuation.step}`;
      target.textContent=model.continuation.label;
      get('rest').hidden=false;
      if (slug==='phenom') {
        get('rest-note').textContent='从第 8 格看撑袋。这格开头的折尖刚做过，接着看拉开口袋的部分。';
      }
    }
    document.title=model.title+' · 一步一折';
    get('status').textContent='';
    get('lesson').hidden=false;
    model.steps.forEach((move,i)=>get('pick').add(new Option(`${i+1} / ${model.steps.length} · ${move.title}`,i)));
    const hash=()=>Number(location.hash.match(/^#step-(\d+)$/)?.[1]||1)-1;
    viewport();
    step(hash());
    get('play').onclick=play;
    get('replay').onclick=()=>{step(index);play();};
    get('previous').onclick=()=>step(index-1);
    get('pick').onchange=()=>step(Number(get('pick').value));
    get('restart').onclick=()=>step(0);
    get('hint').onclick=()=>{showHint=!showHint;draw();controls();};
    get('seek').oninput=()=>{stop();progress=Number(get('seek').value)/1000;draw();controls();};
    window.addEventListener('hashchange',()=>step(hash()));
    document.addEventListener('visibilitychange',()=>{if(document.hidden && playing){stop();controls();}});
  } catch(e) {
    get('status').textContent='演示暂时没打开。刷新重试，或点页首返回目录。';
  }
}
main();
