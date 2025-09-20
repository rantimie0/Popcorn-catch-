const W = 360, H = 600;
const cvs = document.getElementById('game');
const ctx = cvs.getContext('2d');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const livesEl = document.getElementById('lives');
const yearEl = document.getElementById('year');
yearEl.textContent = new Date().getFullYear();

// PWA install
if ('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js'));
let deferredPrompt;
const btnInstall = document.getElementById('btnInstall');
window.addEventListener('beforeinstallprompt', (e)=>{ e.preventDefault(); deferredPrompt = e; btnInstall.style.display='inline-block'; });
btnInstall.addEventListener('click', async ()=>{ if(!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null; btnInstall.style.display='none'; });

// Dialog
const dlg = document.getElementById('how');
document.getElementById('btnHow').addEventListener('click', ()=> dlg.showModal());
document.getElementById('closeHow').addEventListener('click', ()=> dlg.close());

// Game state
const rand = (a,b)=> Math.random()*(b-a)+a;
let running = true;
let score = 0, best = +localStorage.getItem('best_pc')||0, lives = 3;
bestEl.textContent = best;

const player = { x: W/2, y: H-70, w: 64, h: 20, speed: 5 };
let items = []; // {x,y,r,vy,type:'good'|'bad'}

let spawnTimer = 0;
function spawn(){
  const type = Math.random() < 0.8 ? 'good':'bad';
  items.push({ x: rand(20, W-20), y: -10, r: type==='good'?10:12, vy: rand(1.5,3.2), type });
}

function reset(){
  items = [];
  score = 0;
  lives = 3;
  spawnTimer = 0;
  player.x = W/2;
  running = true;
  scoreEl.textContent = score;
  livesEl.textContent = lives;
}

// Input
let dir = 0;
const leftBtn = document.getElementById('left');
const rightBtn = document.getElementById('right');
const pauseBtn = document.getElementById('pause');

function setDir(d){ dir = d; }
leftBtn.addEventListener('touchstart', ()=>setDir(-1)); leftBtn.addEventListener('touchend', ()=>setDir(0));
rightBtn.addEventListener('touchstart', ()=>setDir(1)); rightBtn.addEventListener('touchend', ()=>setDir(0));
leftBtn.addEventListener('mousedown', ()=>setDir(-1)); rightBtn.addEventListener('mousedown', ()=>setDir(1));
window.addEventListener('mouseup', ()=>setDir(0));

pauseBtn.addEventListener('click', ()=> running = !running);

// Swipe
let sx=null;
cvs.addEventListener('touchstart', e=>{ sx = e.changedTouches[0].clientX; });
cvs.addEventListener('touchmove', e=>{
  if(sx==null) return;
  const x = e.changedTouches[0].clientX;
  if(x - sx > 10) player.x += 12;
  if(x - sx < -10) player.x -= 12;
  sx = x;
});

// Draw helpers
function drawBucket(){
  ctx.fillStyle = '#ffd36b';
  const x = player.x - player.w/2, y = player.y;
  ctx.fillRect(x, y, player.w, player.h);
  ctx.fillRect(x+8, y-10, player.w-16, 10);
}
function drawItem(it){
  if(it.type==='good'){
    // popcorn kernel
    ctx.fillStyle = '#fff4c1';
    ctx.beginPath();
    ctx.arc(it.x, it.y, it.r, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#f2d27a';
    ctx.beginPath(); ctx.arc(it.x- it.r/3, it.y+1, it.r/2.4, 0, Math.PI*2); ctx.fill();
  }else{
    // burnt
    ctx.fillStyle = '#3b2f2f';
    ctx.beginPath(); ctx.arc(it.x, it.y, it.r, 0, Math.PI*2); ctx.fill();
  }
}

function collides(it){
  const px = player.x - player.w/2, py = player.y, pw = player.w, ph = player.h;
  return it.x > px && it.x < px + pw && it.y + it.r > py && it.y - it.r < py + ph;
}

// Game loop
let t0 = 0;
function loop(ts){
  const dt = (ts - t0) / 16.666; // frames approx
  t0 = ts;
  ctx.clearRect(0,0,W,H);

  // background
  const g = ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,'#111'); g.addColorStop(1,'#181818');
  ctx.fillStyle = g; ctx.fillRect(0,0,W,H);

  // update player
  if(running){
    player.x += dir * player.speed * dt;
    player.x = Math.max(player.w/2, Math.min(W - player.w/2, player.x));
  }
  drawBucket();

  // spawn
  if(running){
    spawnTimer -= dt;
    if(spawnTimer <= 0){
      spawn(); 
      spawnTimer = Math.max(10 - score/20, 2); // faster over time
    }
  }

  // update items
  for(let i=items.length-1; i>=0; i--){
    const it = items[i];
    if(running) it.y += it.vy * dt * (1 + score/200);
    drawItem(it);
    if(collides(it) && running){
      if(it.type==='good'){
        score++; scoreEl.textContent = score;
      }else{
        lives--; livesEl.textContent = lives;
      }
      items.splice(i,1);
      continue;
    }
    if(it.y - it.r > H){
      if(it.type==='good' && running){
        lives--; livesEl.textContent = lives;
      }
      items.splice(i,1);
    }
  }

  // game over
  if(lives<=0 && running){
    running = false;
    best = Math.max(best, score); bestEl.textContent = best;
    localStorage.setItem('best_pc', best);
    // show small overlay
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0,0,W,H);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 22px system-ui';
    ctx.textAlign='center';
    ctx.fillText('Game Over', W/2, H/2-30);
    ctx.fillText(`Score: ${score}  Best: ${best}`, W/2, H/2);
    ctx.fillText('Tap ⏯ to play again', W/2, H/2+40);
  }

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// Pause toggles reset when over
document.getElementById('pause').addEventListener('click', ()=>{
  if(lives<=0){ reset(); }
});

// Share score
function buildShare(){
  const text = `I scored ${score} in Popcorn Catch! 🍿`;
  const url = location.href;
  return { text, url };
}
document.getElementById('btnShare').addEventListener('click', async ()=>{
  const data = buildShare();
  if(navigator.share){
    try{ await navigator.share(data); }catch(e){}
  }else{
    alert(`${data.text}\n${data.url}`);
  }
});
const wa = document.getElementById('btnWA');
function updateWA(){
  const data = buildShare();
  wa.href = `https://wa.me/?text=${encodeURIComponent(data.text + ' ' + data.url)}`;
}
setInterval(updateWA, 1000);
