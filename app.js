const W = 360, H = 600;
const cvs = document.getElementById('game');
const ctx = cvs.getContext('2d');
const scoreEl = document.getElementById('score');
const bestEl  = document.getElementById('best');
const livesEl = document.getElementById('lives');
const gemsEl  = document.getElementById('gems');
const levelEl = document.getElementById('level');
const gemsStoreEl = document.getElementById('gemsStore');
document.getElementById('year').textContent = new Date().getFullYear();

// PWA
if ('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js'));
let deferredPrompt; const btnInstall = document.getElementById('btnInstall');
window.addEventListener('beforeinstallprompt', (e)=>{ e.preventDefault(); deferredPrompt = e; if(btnInstall) btnInstall.style.display='inline-block'; });
if(btnInstall) btnInstall.addEventListener('click', async ()=>{ if(!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null; btnInstall.style.display='none'; });

// Dialogs
const dlgHow = document.getElementById('how');
document.getElementById('btnHow').addEventListener('click', ()=> dlgHow.showModal());
document.getElementById('closeHow').addEventListener('click', ()=> dlgHow.close());
const dlgStore = document.getElementById('store');
document.getElementById('btnStore').addEventListener('click', ()=>{ updateGems(); dlgStore.showModal(); });
document.getElementById('closeStore').addEventListener('click', ()=> dlgStore.close());
const dlgSkins = document.getElementById('skins');
document.getElementById('btnSkins').addEventListener('click', ()=> dlgSkins.showModal());
document.getElementById('closeSkins').addEventListener('click', ()=> dlgSkins.close());

// Audio
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let actx, masterGain, musicOn = true;
function initAudio(){
  if(actx) return;
  actx = new AudioCtx();
  masterGain = actx.createGain(); masterGain.gain.value = 0.2; masterGain.connect(actx.destination);
  startMusic();
}
function startMusic(){
  if(!actx) return;
  const tempo = 96;
  const loop = actx.createGain(); loop.connect(masterGain);
  const scale = [0,2,4,5,7,9,11,12];
  const root = 60;
  for(let bar=0; bar<4; bar++){
    for(let step=0; step<16; step++){
      const t = actx.currentTime + (bar*16+step)*(60/tempo)/2;
      const o = actx.createOscillator(); const g = actx.createGain();
      o.type = 'sine';
      const note = root + scale[(bar*3+step)%scale.length];
      o.frequency.value = 440 * Math.pow(2, (note-69)/12);
      g.gain.setValueAtTime(0.0, t);
      g.gain.linearRampToValueAtTime(0.12, t+0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t+0.25);
      o.connect(g).connect(loop);
      o.start(t); o.stop(t+0.3);
    }
  }
  setTimeout(startMusic, 4000);
}
function beep(freq=880, dur=0.12, vol=0.25){
  if(!actx) return;
  const o = actx.createOscillator(); const g = actx.createGain();
  o.type='square'; o.frequency.value=freq;
  g.gain.value=vol; o.connect(g).connect(masterGain);
  o.start(); o.stop(actx.currentTime + dur);
}
document.getElementById('btnMute').addEventListener('click', ()=>{
  musicOn = !musicOn;
  if(!actx) initAudio();
  masterGain.gain.value = musicOn ? 0.22 : 0.0;
  document.getElementById('btnMute').textContent = musicOn ? '🔊' : '🔈';
});

// Persistent
const LS = {
  best:       +localStorage.getItem('best_pc_plus')||0,
  gems:       +localStorage.getItem('gems_pc_plus')||0,
  perm_bigBucket: localStorage.getItem('perm_bigBucket_pc')==='1',
  perm_slowStart: localStorage.getItem('perm_slowStart_pc')==='1',
  perm_extraLife: localStorage.getItem('perm_extraLife_pc')==='1',
  start_star:   localStorage.getItem('start_star_pc')==='1',
  start_clock:  localStorage.getItem('start_clock_pc')==='1',
  start_shield: localStorage.getItem('start_shield_pc')==='1',
  skin:         localStorage.getItem('skin_pc') || 'classic',
};
function saveLS(){
  localStorage.setItem('best_pc_plus', LS.best);
  localStorage.setItem('gems_pc_plus', LS.gems);
  ['perm_bigBucket','perm_slowStart','perm_extraLife','start_star','start_clock','start_shield']
    .forEach(k=> localStorage.setItem(k+'_pc', LS[k]?'1':'0'));
  localStorage.setItem('skin_pc', LS.skin);
}
function updateGems(){ gemsEl.textContent = LS.gems; gemsStoreEl.textContent = LS.gems; }
bestEl.textContent = LS.best; updateGems();

// Store buttons
document.querySelectorAll('.buy').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const key = btn.dataset.key; const cost = +btn.dataset.cost;
    if(LS[key]){ alert('Already purchased 💛'); return; }
    if(LS.gems < cost){ alert('Not enough gems'); return; }
    LS.gems -= cost; LS[key] = true; saveLS(); updateGems();
    alert('Purchased!');
  });
});
// Skins
document.querySelectorAll('.skin').forEach(btn=>{
  btn.addEventListener('click', ()=>{ LS.skin = btn.dataset.id; saveLS(); alert('Skin selected: '+LS.skin); });
});

// Game state
const rand = (a,b)=> Math.random()*(b-a)+a;
let running = true;
let score = 0, lives = 5;
if(LS.perm_extraLife) lives = 6;
livesEl.textContent = lives;

const player = { x: W/2, y: H-72, w: 64, h: 22 };
function applySkinPerks(){
  player.w = 64;
  if(LS.perm_bigBucket) player.w += 8;
  if(LS.skin==='wide') player.w += 12;
}
applySkinPerks();

let items = []; // falling objects
let level = 1; levelEl.textContent = level;
const LEVEL_EVERY = 12; // level up every 12 points
let spawnEveryMs = (LS.perm_slowStart || LS.skin==='coolStart') ? 1400 : 1100;
const MIN_SPAWN_MS = 520;
const MAX_ITEMS = 6;
const BASE_FALL = (LS.perm_slowStart || LS.skin==='coolStart') ? 0.7 : 0.9;
const LEVEL_FALL_ADD = 0.18;

let spawnAccMs = 0;
let tPrev = 0;

// Power-up timers
let doublePtsMs = 0;
let slowMoMs = 0;
let shieldOn = false;

// Start-of-run power-ups
function applyStartBoosts(){
  if(LS.start_star) doublePtsMs = Math.max(doublePtsMs, 6000);
  if(LS.start_clock) slowMoMs = Math.max(slowMoMs, 5000);
  if(LS.start_shield) shieldOn = true;
}

// Controls (slide)
function setPlayerXFromClientX(clientX){
  const r = cvs.getBoundingClientRect();
  const x = (clientX - r.left) * (W / r.width);
  player.x = Math.max(player.w/2, Math.min(W - player.w/2, x));
  if(!actx) initAudio();
}
cvs.addEventListener('touchstart', e=>{ e.preventDefault(); setPlayerXFromClientX(e.changedTouches[0].clientX); }, {passive:false});
cvs.addEventListener('touchmove',  e=>{ e.preventDefault(); setPlayerXFromClientX(e.changedTouches[0].clientX); }, {passive:false});
cvs.addEventListener('mousedown', e=> setPlayerXFromClientX(e.clientX));
cvs.addEventListener('mousemove', e=>{ if(e.buttons) setPlayerXFromClientX(e.clientX); });

document.getElementById('pause').addEventListener('click', ()=>{ if(lives<=0){ reset(); } else { running = !running; } });

function reset(){
  items.length = 0;
  score = 0; lives = LS.perm_extraLife?6:5; level = 1; levelEl.textContent = level;
  spawnEveryMs = (LS.perm_slowStart || LS.skin==='coolStart') ? 1400 : 1100;
  doublePtsMs = 0; slowMoMs = 0; shieldOn = false;
  applySkinPerks(); player.x = W/2;
  applyStartBoosts();
  running = true; scoreEl.textContent = score; livesEl.textContent = lives;
}

function maybeLevelUp(){
  const newLevel = Math.floor(score/LEVEL_EVERY) + 1;
  if(newLevel!==level){
    level = newLevel; levelEl.textContent = level;
    spawnEveryMs = Math.max(MIN_SPAWN_MS, spawnEveryMs - 90);
  }
}

function drawBackground(){
  // changes every 2 levels among 5 palettes
  const theme = Math.floor((level-1)/2) % 5;
  let g = ctx.createLinearGradient(0,0,0,H);
  if(theme===0){ g.addColorStop(0,'#1a1a2e'); g.addColorStop(1,'#16213e'); }
  else if(theme===1){ g.addColorStop(0,'#0f2027'); g.addColorStop(1,'#203a43'); }
  else if(theme===2){ g.addColorStop(0,'#2c003e'); g.addColorStop(1,'#512b58'); }
  else if(theme===3){ g.addColorStop(0,'#0b2b1b'); g.addColorStop(1,'#174530'); }
  else { g.addColorStop(0,'#2b0b19'); g.addColorStop(1,'#571d31'); }
  ctx.fillStyle = g; ctx.fillRect(0,0,W,H);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  for(let i=0;i<12;i++){ ctx.fillRect((i*29+level*7)%W, (i*53+level*11)%H, 2, 2); }
}

function drawBucket(){
  if(LS.skin==='classic' || LS.skin==='coolStart'){ ctx.fillStyle = '#ffd36b'; }
  else if(LS.skin==='wide'){ ctx.fillStyle = '#ffb347'; }
  else if(LS.skin==='gemBoost'){ ctx.fillStyle = '#ffd36b'; ctx.strokeStyle = '#7ef9ff'; ctx.lineWidth = 2; }
  const x = player.x - player.w/2, y = player.y;
  ctx.fillRect(x, y, player.w, player.h);
  ctx.fillRect(x+8, y-10, player.w-16, 10);
  if(LS.skin==='gemBoost'){ ctx.strokeRect(x-2, y-12, player.w+4, player.h+14); }
  if(shieldOn){ ctx.strokeStyle = '#66d9ff'; ctx.lineWidth = 2; ctx.strokeRect(x-4, y-14, player.w+8, player.h+18); }
}

function drawFood(it){
  if(it.type==='noodle'){
    ctx.strokeStyle = '#ffd18b'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(it.x, it.y, it.r+2, 0.2*Math.PI, 1.3*Math.PI); ctx.stroke();
  }else if(it.type==='zobo'){
    ctx.fillStyle = '#9b0036'; ctx.fillRect(it.x-it.r/1.5, it.y-it.r, it.r*1.2, it.r*1.4);
    ctx.fillStyle = '#eee'; ctx.fillRect(it.x-it.r/1.7, it.y-it.r-4, it.r*1.4, 4);
  }else if(it.type==='toast'){
    ctx.fillStyle = '#f7d197'; ctx.beginPath(); ctx.arc(it.x, it.y, it.r, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#e9b96e'; ctx.fillRect(it.x-it.r, it.y, it.r*2, it.r/2);
  }else if(it.type==='burnt'){
    ctx.fillStyle = '#3b2f2f'; ctx.beginPath(); ctx.arc(it.x, it.y, it.r, 0, Math.PI*2); ctx.fill();
  }else if(it.type==='star'){
    ctx.fillStyle = '#ffd84d'; ctx.beginPath();
    for(let i=0;i<5;i++){ const a = i*2*Math.PI/5 - Math.PI/2; const r1 = it.r, r2 = it.r/2;
      ctx.lineTo(it.x + Math.cos(a)*r1, it.y + Math.sin(a)*r1);
      ctx.lineTo(it.x + Math.cos(a+Math.PI/5)*r2, it.y + Math.sin(a+Math.PI/5)*r2);
    } ctx.closePath(); ctx.fill();
  }else if(it.type==='clock'){
    ctx.fillStyle='#c0e7ff'; ctx.beginPath(); ctx.arc(it.x,it.y,it.r,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='#0b3b60'; ctx.lineWidth=2; ctx.beginPath();
    ctx.moveTo(it.x, it.y); ctx.lineTo(it.x, it.y-it.r/2);
    ctx.moveTo(it.x, it.y); ctx.lineTo(it.x+it.r/3, it.y);
    ctx.stroke();
  }else if(it.type==='shield'){
    ctx.strokeStyle='#66d9ff'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.arc(it.x,it.y,it.r,0,Math.PI*2); ctx.stroke();
  }
}

function spawn(){
  if(items.length >= MAX_ITEMS) return;
  const r = Math.random();
  let type;
  if(r < 0.6) type = ['noodle','zobo','toast'][Math.floor(Math.random()*3)];
  else if(r < 0.78) type = 'burnt';
  else type = ['star','clock','shield'][Math.floor(Math.random()*3)];
  const vyBase = BASE_FALL + (level-1)*LEVEL_FALL_ADD;
  items.push({ x: Math.random()*(W-40)+20, y: -14, r: 12, vy: vyBase, type });
}

function collides(it){
  const px = player.x - player.w/2, py = player.y, pw = player.w, ph = player.h;
  return it.x > px && it.x < px + pw && it.y + it.r > py && it.y - it.r < py + ph;
}

function addScore(n){
  score += (doublePtsMs>0) ? n*2 : n;
  scoreEl.textContent = score;
  const mod = (LS.skin==='gemBoost') ? 8 : 10;
  if(score % mod === 0){ LS.gems += 1; saveLS(); updateGems(); beep(1200,0.05,0.2); }
  maybeLevelUp();
}

function loop(ts){
  const dt = Math.min(2.5, (ts - (tPrev||ts)) / 16.666);
  const dms = ts - (tPrev||ts);
  tPrev = ts;

  drawBackground();

  if(doublePtsMs>0) doublePtsMs = Math.max(0, doublePtsMs - dms);
  if(slowMoMs>0)    slowMoMs    = Math.max(0, slowMoMs - dms);

  if(running){
    spawnAccMs += dms * (slowMoMs>0 ? 0.6 : 1);
    if (spawnAccMs >= spawnEveryMs){ spawn(); spawnAccMs = 0; }
  }

  drawBucket();

  for(let i=items.length-1; i>=0; i--){
    const it = items[i];
    const speedMod = (slowMoMs>0 ? 0.55 : 1);
    if(running) it.y += it.vy * dt * speedMod;
    drawFood(it);

    if(collides(it) && running){
      if(it.type==='burnt'){
        if(shieldOn){ shieldOn=false; beep(600,0.08,0.15); }
        else { lives--; livesEl.textContent = lives; beep(200,0.12,0.2); }
      }else if(it.type==='star'){ doublePtsMs = 8000; beep(1000,0.08,0.2); }
      else if(it.type==='clock'){ slowMoMs = 6000; beep(700,0.08,0.2); }
      else if(it.type==='shield'){ shieldOn = true; beep(900,0.08,0.2); }
      else { addScore(1); beep(880,0.05,0.12); }
      items.splice(i,1); continue;
    }

    if(it.y - it.r > H){
      if((it.type==='noodle'||it.type==='zobo'||it.type==='toast') && running){
        if(shieldOn){ shieldOn=false; beep(600,0.08,0.15); }
        else { lives--; livesEl.textContent = lives; beep(220,0.12,0.2); }
      }
      items.splice(i,1);
    }
  }

  if(lives<=0 && running){
    running = false;
    LS.best = Math.max(LS.best, score); bestEl.textContent = LS.best; saveLS();
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0,0,W,H);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 22px system-ui'; ctx.textAlign='center';
    ctx.fillText('Game Over', W/2, H/2-30);
    ctx.fillText(`Score: ${score}  Best: ${LS.best}`, W/2, H/2);
    ctx.fillText('Tap ⏯ to play again', W/2, H/2+40);
  }

  requestAnimationFrame(loop);
}
requestAnimationFrame(()=>{ applyStartBoosts(); loop(performance.now()); });

// Share score
function buildShare(){ return { text:`I scored ${score} in Popcorn Catch PLUS! 🍿`, url: location.href }; }
document.getElementById('btnShare').addEventListener('click', async ()=>{
  const data = buildShare(); if(navigator.share){ try{ await navigator.share(data);}catch(e){} } else { alert(`${data.text}\n${data.url}`); }
});
const wa = document.getElementById('btnWA'); setInterval(()=>{ const d=buildShare(); wa.href=`https://wa.me/?text=${encodeURIComponent(d.text+' '+d.url)}`; }, 1000);
