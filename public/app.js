const dims = ['Religion','City','Politics','Team','Language','Class','Ethnicity','Nation'];
const groups = [
  {name:'Religion', size:22}, {name:'City', size:18}, {name:'Politics', size:24}, {name:'Sports', size:17},
  {name:'Language', size:16}, {name:'Class', size:20}, {name:'Ethnicity', size:21}, {name:'Nation', size:19}
];

const API_BASE = '';
const ids = ['outrage','fear','stress','echo','goals','contact','empathy'];
const el = Object.fromEntries(ids.map(i=>[i,document.getElementById(i)]));
const out = {
  frag: document.getElementById('m_frag'), trust: document.getElementById('m_trust'),
  cross: document.getElementById('m_cross'), manip: document.getElementById('m_manip')
};
ids.forEach(i=>document.getElementById('v_'+i).textContent=el[i].value);

const heat = document.getElementById('heat');
const hctx = heat.getContext('2d');
const bub = document.getElementById('bubbles');
const bctx = bub.getContext('2d');

let nodes = groups.map((g,i)=>({ ...g, x:80+i*90, y:180+(i%2?30:-20), vx:0, vy:0 }));

function state(){
  const s={}; ids.forEach(i=>s[i]=Number(el[i].value)); return s;
}

function metrics(s){
  const manip = Math.round((s.outrage*0.32 + s.fear*0.25 + s.stress*0.2 + s.echo*0.23));
  const bridge = Math.round((s.goals*0.36 + s.contact*0.39 + s.empathy*0.25));
  const frag = Math.max(0, Math.min(100, Math.round(15 + manip*0.9 - bridge*0.75)));
  const trust = Math.max(0, Math.min(100, Math.round(88 - frag*0.7 + bridge*0.2)));
  const cross = Math.max(0, Math.min(100, Math.round(12 + bridge*0.7 - manip*0.45)));
  return {manip, bridge, frag, trust, cross};
}

function drawHeat(s,m){
  hctx.clearRect(0,0,heat.width,heat.height);
  const n=dims.length, cell=26, ox=180, oy=26;
  hctx.fillStyle='#dfe7ff'; hctx.font='12px sans-serif';
  dims.forEach((d,i)=>{ hctx.fillText(d,18,oy+i*cell+18); hctx.fillText(d,ox+i*cell+2,18); });
  for(let r=0;r<n;r++) for(let c=0;c<n;c++){
    const base = r===c ? 10 : Math.abs(r-c)*5 + 20;
    const pressure = base + m.frag*0.55 + s.echo*0.2 - s.contact*0.18 - s.empathy*0.12;
    const v=Math.max(0,Math.min(100,pressure));
    const red = Math.round(40 + v*2.1), green = Math.round(140 - v*0.9), blue = Math.round(220 - v*1.5);
    hctx.fillStyle=`rgb(${red},${Math.max(30,green)},${Math.max(40,blue)})`;
    hctx.fillRect(ox+c*cell, oy+r*cell, cell-2, cell-2);
  }
}

function simStep(s,m){
  const targetSpread = 50 + m.frag*2.1; // bigger = further apart
  const cohesion = 0.002 + s.contact/100000 + s.goals/120000;
  for(let i=0;i<nodes.length;i++){
    for(let j=i+1;j<nodes.length;j++){
      const a=nodes[i], b=nodes[j];
      let dx=b.x-a.x, dy=b.y-a.y, d=Math.hypot(dx,dy)||1;
      const force = (targetSpread - d) * 0.0008;
      a.vx -= force*dx; a.vy -= force*dy;
      b.vx += force*dx; b.vy += force*dy;
    }
  }
  const cx=bub.width/2, cy=bub.height/2;
  nodes.forEach(n=>{
    n.vx += (cx-n.x)*cohesion;
    n.vy += (cy-n.y)*cohesion;
    n.vx*=0.95; n.vy*=0.95;
    n.x += n.vx*16; n.y += n.vy*16;
    n.x = Math.max(40,Math.min(bub.width-40,n.x));
    n.y = Math.max(40,Math.min(bub.height-40,n.y));
  });
}

function drawBubbles(m){
  bctx.clearRect(0,0,bub.width,bub.height);
  bctx.fillStyle='rgba(130,160,255,.14)';
  nodes.forEach(a=>nodes.forEach(b=>{
    if(a===b) return;
    const d=Math.hypot(a.x-b.x,a.y-b.y);
    if(d<180){
      bctx.strokeStyle='rgba(115,155,255,.12)';
      bctx.beginPath(); bctx.moveTo(a.x,a.y); bctx.lineTo(b.x,b.y); bctx.stroke();
    }
  }));

  nodes.forEach(n=>{
    const r = n.size + (100-m.trust)*0.08;
    const g = Math.max(60, Math.round(210 - m.frag*1.4));
    const rr = Math.min(255, Math.round(70 + m.frag*1.6));
    bctx.fillStyle=`rgba(${rr},${g},130,0.75)`;
    bctx.beginPath(); bctx.arc(n.x,n.y,r,0,Math.PI*2); bctx.fill();
    bctx.fillStyle='#f5f8ff'; bctx.font='12px sans-serif'; bctx.textAlign='center';
    bctx.fillText(n.name,n.x,n.y+4);
  });
}

function render(){
  const s=state(); ids.forEach(i=>document.getElementById('v_'+i).textContent=s[i]);
  const m=metrics(s);
  out.frag.textContent=m.frag; out.trust.textContent=m.trust; out.cross.textContent=m.cross+'%'; out.manip.textContent=m.manip;
  drawHeat(s,m); simStep(s,m); drawBubbles(m);
  requestAnimationFrame(render);
}

function setPreset(name){
  const presets={
    calm:{outrage:20,fear:20,stress:25,echo:22,goals:70,contact:72,empathy:66},
    election:{outrage:88,fear:74,stress:60,echo:82,goals:26,contact:20,empathy:18},
    bridge:{outrage:28,fear:30,stress:35,echo:30,goals:85,contact:88,empathy:90}
  };
  const p=presets[name]; if(!p) return; ids.forEach(i=>el[i].value=p[i]);
}

const reflections = [
  "Which 2 identities do you assume the most about?",
  "What common need exists across all bubbles?",
  "Who in your life crosses these lines?",
  "What would change if you talked to someone different?",
  "What shared goals could bring groups together?",
  "When did you last feel connected to a stranger?",
  "What story changed how you see another group?",
  "What would your ideal connected community look like?"
];

function nextReflection(){
  const r = reflections[Math.floor(Math.random() * reflections.length)];
  document.getElementById('reflection-q').textContent = r;
}

function getCurrentState() {
  const s = {};
  ids.forEach(i => s[i] = Number(el[i].value));
  return s;
}

async function saveScenario(name, share) {
  const state = getCurrentState();
  const payload = { name: name || 'Untitled', state };
  const res = await fetch('/api/scenarios', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    document.getElementById('save-status').textContent = 'Failed to save';
    return;
  }
  const data = await res.json();
  if (share) {
    const shareRes = await fetch(`/api/scenarios/${data.scenario.id}/share`, { method: 'POST' });
    const shareData = await shareRes.json();
    const url = window.location.origin + '/api/share/' + shareData.share.token;
    document.getElementById('save-status').innerHTML = `Saved! <a href="${url}" target="_blank" style="color:#2c79ff;">Share link</a>`;
  } else {
    document.getElementById('save-status').textContent = 'Saved!';
  }
}

document.querySelectorAll('button[data-preset]').forEach(b=>b.onclick=()=>setPreset(b.dataset.preset));
document.getElementById('reflect-btn').onclick = nextReflection;
document.getElementById('save-btn').onclick = () => saveScenario(document.getElementById('scenario-name').value, false);
document.getElementById('share-btn').onclick = () => saveScenario(document.getElementById('scenario-name').value, true);
ids.forEach(i=>el[i].addEventListener('input',()=>{}));
render();
