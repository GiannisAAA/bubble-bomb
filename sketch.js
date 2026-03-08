// This is a JavaScript file

// ==========================================
// BUBBLE BOMB: Mobile Optimized Edition
// ==========================================

let particles = [];
let effects = [];
let shakeTime = 0;
let remainingTaps = 10;
let isGameOver = false;
let audioCtx;
let meltdownProgress = 0;
let soapCount = 0; 
let highScore = 0; 
let clearedStages = 0; 
let gameState = "TITLE"; 
let clearedCountForAd = 0; 
const AD_INTERVAL = 3; 
let bombBoostUntil = 0; 
const BOOST_DURATION = 90 * 1000;

const COLORS = {
  'RED': '#FF99CC', 'BLUE': '#99E6FF', 'YELLOW': '#FFFFCC',
  'PURPLE': '#D9B3FF', 'ORANGE': '#FFCC99', 'GREEN': '#BCFFDB', 'BOMB': '#444444'
};
const STROKE_COLORS = {
  'RED': '#CC6699', 'BLUE': '#66B2CC', 'YELLOW': '#CCCC99',
  'PURPLE': '#9980CC', 'ORANGE': '#CC9966', 'GREEN': '#8ACEA6', 'BOMB': '#000000'
};
const COLOR_LIST = ['RED', 'BLUE', 'YELLOW'];

// ==========================================
// 1. スマホ向けセットアップ (全画面対応)
// ==========================================
function setup() {
  // スマホの画面比率に合わせつつ、400x600の論理サイズを維持
  let canvas = createCanvas(400, 600);
  canvas.id('gameCanvas');
  
  // スマホでのスクロールやズームを防止
  let canvasElement = canvas.elt;
  canvasElement.style.touchAction = 'none';
  canvasElement.style.width = '100%';
  canvasElement.style.height = 'auto';
  canvasElement.style.maxWidth = '400px'; // PCでも見やすいように
  
  // 背景色を固定してスクロール時のガタつきを防ぐ
  document.body.style.backgroundColor = '#1A2533';
  document.body.style.margin = '0';
  document.body.style.overflow = 'hidden';

  loadGameData();
}

function loadGameData() {
  const savedSoap = localStorage.getItem('bubbleBomb_soap');
  const savedScore = localStorage.getItem('bubbleBomb_highScore');
  soapCount = savedSoap ? parseInt(savedSoap) : 300; 
  highScore = savedScore ? parseInt(savedScore) : 0;
}

function saveGameData() {
  localStorage.setItem('bubbleBomb_soap', soapCount);
  if (clearedStages > highScore) {
    highScore = clearedStages;
    localStorage.setItem('bubbleBomb_highScore', highScore);
  }
}

function initGrid() {
  particles = []; effects = []; remainingTaps = 10; isGameOver = false;
  meltdownProgress = 0; gameState = "PLAY";
  let isBoostActive = (millis() < bombBoostUntil);

  for (let y = height - 50; y > 260; y -= 40) {
    let lastColor = "";
    for (let x = 40; x < width - 10; x += 45) {
      let type;
      if (isBoostActive && random() < 0.20) { type = 'BOMB'; } 
      else { do { type = random(COLOR_LIST); } while (type === lastColor); }
      lastColor = type;
      let p = new Nucleus(x, y, type);
      if (type === 'BOMB') { p.level = 6; p.targetR = 65; } 
      else { let lv = floor(random(1, 4)); for(let i=1; i<lv; i++) p.grow(); }
      particles.push(p);
    }
  }
}

// ==========================================
// 2. メイン描画ループ
// ==========================================
function draw() {
  let offsetX = 0, offsetY = 0;
  let alertMode = (remainingTaps <= 3 && remainingTaps > 0 && gameState === "PLAY");
  if (shakeTime > 0) { 
    offsetX = random(-shakeTime, shakeTime); offsetY = random(-shakeTime, shakeTime); shakeTime *= 0.85; 
  }
  
  push(); translate(offsetX, offsetY); drawTileBackground();

  if (gameState === "TITLE") {
    drawTitleScreen();
  } else {
    if (gameState === "PLAY") {
      if (particles.length === 0) { 
        gameState = "RESULT"; clearedStages++; clearedCountForAd++; soapCount += 10; saveGameData(); SE.quack(); 
      } else if (remainingTaps <= 0) {
        let anyBombFusing = particles.some(p => p.isFusing);
        if(!anyBombFusing) gameState = "REVIVE";
      }
    }

    for (let step = 0; step < 2; step++) { updatePhysics(); }
    
    for (let i = particles.length - 1; i >= 0; i--) {
      let p = particles[i];
      if (!p) continue;
      p.display();
      if (p.shouldExplode) {
        if (p.type === 'BOMB') triggerExplosion(p.pos.x, p.pos.y);
        else triggerSmallBurst(p.pos.x, p.pos.y, p.type);
        particles.splice(i, 1);
      }
    }

    for (let i = effects.length - 1; i >= 0; i--) {
      effects[i].update(); effects[i].display();
      if (effects[i].isDead()) effects.splice(i, 1);
    }
    
    drawUI(alertMode);
    if (gameState === "RESULT") drawResultScreen();
    if (gameState === "REVIVE") drawReviveScreen();
    if (gameState === "AD") drawInterstitialAd();
    if (isGameOver) drawEndScreen();
  }
  pop();
}

// ==========================================
// 3. 座標補正ロジック (スマホ画面リサイズ対応)
// ==========================================
function getAdjustedMouse() {
  const canvasElement = document.getElementById('gameCanvas');
  if(!canvasElement) return { x: mouseX, y: mouseY };
  const rect = canvasElement.getBoundingClientRect();
  
  // タッチ位置を論理座標(400x600)にマッピング
  let mx = (mouseX * (width / rect.width));
  let my = (mouseY * (height / rect.height));
  
  if (mx < 0 || mx > width || my < 0 || my > height) return { x: -1, y: -1 };
  return { x: mx, y: my };
}

// ==========================================
// 4. 物理演算 & 衝突
// ==========================================
function updatePhysics() {
  for (let i = particles.length - 1; i >= 0; i--) {
    let p = particles[i]; 
    if (!p) continue;
    p.update();
    if (!isGameOver) {
      for (let j = i - 1; j >= 0; j--) {
        let other = particles[j];
        if (!other) continue;
        let d = dist(p.pos.x, p.pos.y, other.pos.x, other.pos.y);
        let minDist = p.r + other.r;
        if (d < minDist) {
          if (handleCollision(p, other, i, j, d, minDist)) return;
          let angle = atan2(p.pos.y - other.pos.y, p.pos.x - other.pos.x);
          let overlap = minDist - d;
          p.pos.x += cos(angle) * overlap * 0.5; p.pos.y += sin(angle) * overlap * 0.5;
          other.pos.x -= cos(angle) * overlap * 0.5; other.pos.y -= sin(angle) * overlap * 0.5;
          p.vel.mult(0.9); other.vel.mult(0.9);
        }
      }
    }
  }
}

function handleCollision(p, other, i, j, d, minDist) {
  if (p.isFusing || other.isFusing) return false;
  if (p.type === other.type && p.level === other.level && p.level < 4) {
    SE.merge(p.level); p.grow(); particles.splice(j, 1); return true;
  } 
  if (p.level === 4 && other.level === 4 && p.type !== other.type) {
    let newType = getCombination(p.type, other.type);
    if (newType) { SE.merge(5); p.type = newType; p.level = 5; p.targetR = 50; particles.splice(j, 1); return true; }
  }
  let p5 = (p.level === 5) ? p : (other.level === 5 ? other : null);
  let p4 = (p.level === 4) ? p : (other.level === 4 ? other : null);
  if (p5 && p4 && isFinalMix(p5.type, p4.type)) {
    SE.merge(6); p5.type = 'BOMB'; p5.level = 6; p5.targetR = 65; particles.splice(p === p4 ? i : j, 1); return true;
  }
  return false;
}

// ==========================================
// 5. クラス定義
// ==========================================
class Nucleus {
  constructor(x, y, type) {
    this.pos = createVector(x, y); this.vel = createVector(0, 0);
    this.acc = createVector(0, 0.25); this.type = type; this.level = 1;
    this.r = 15; this.targetR = 15; this.meltOffset = random(0, 100);
    this.iriPhase = random(0, TWO_PI);
    this.isFusing = false;
    this.fuseTimer = 60; 
    this.shouldExplode = false;
  }
  update() {
    if (this.isFusing) {
      this.fuseTimer--;
      if (this.fuseTimer <= 0) this.shouldExplode = true;
      this.pos.x += random(-2, 2);
      this.pos.y += random(-2, 2);
    }
    if (isGameOver) {
      meltdownProgress += 0.3;
      this.pos.y += (meltdownProgress * 0.05) + sin(frameCount * 0.1 + this.meltOffset) * 0.5;
    } else {
      this.vel.add(this.acc); this.pos.add(this.vel);
      let b = this.r;
      if (this.pos.y > height - b) { this.pos.y = height - b; this.vel.y *= -0.2; }
      if (this.pos.x < b || this.pos.x > width - b) { this.pos.x = constrain(this.pos.x, b, width - b); this.vel.x *= -0.5; }
    }
    this.r = lerp(this.r, this.targetR, 0.1);
  }
  grow() { if (this.level < 4) { this.level++; this.targetR = 15 + (this.level - 1) * 10; } }
  ignite() { 
    if (!this.isFusing) { 
      this.isFusing = true; 
      this.fuseTimer = (this.level === 6) ? 60 : 30; 
      SE.merge(6); 
    } 
  }
  display() {
    push(); translate(this.pos.x, this.pos.y);
    if (isGameOver) scale(map(min(meltdownProgress, 100), 0, 100, 1, 1.2), 1);
    let isWarning = this.isFusing && frameCount % 10 < 5;
    if (this.type === 'BOMB') {
      stroke('#8B4513'); strokeWeight(4); noFill();
      beginShape(); vertex(0, -this.r); vertex(this.r * 0.5, -this.r * 1.3); vertex(this.r * 0.3, -this.r * 1.5); endShape();
      let fireSize = this.isFusing ? random(12, 22) : 8;
      noStroke(); fill('#FFD700'); circle(this.r * 0.3, -this.r * 1.5, fireSize); 
      fill('#FF4500'); circle(this.r * 0.3, -this.r * 1.5, fireSize * 0.5);
      let baseCol = color(isWarning ? '#FF0000' : COLORS[this.type]);
      for (let i = this.r; i > 0; i -= 2) { baseCol.setAlpha(map(i, 0, this.r, 200, 255)); fill(baseCol); noStroke(); circle(0, 0, i * 2); }
      fill(255, 50); noStroke(); ellipse(-this.r * 0.3, -this.r * 0.3, this.r, this.r * 0.5);
      stroke(0); strokeWeight(2); noFill(); circle(0, 0, this.r * 2);
      fill(255, 150); noStroke(); textSize(max(16, this.r)); textAlign(CENTER, CENTER); text("☠", 0, 0);
    } else {
      let baseCol = color(isWarning ? '#FFFFFF' : COLORS[this.type]);
      for (let i = this.r; i > 0; i -= 2) { baseCol.setAlpha(map(i, 0, this.r, 30, 150)); fill(baseCol); noStroke(); circle(0, 0, i * 2); }
      push(); rotate(frameCount * 0.02 + this.iriPhase); noFill();
      stroke(180, 220, 255, 120); strokeWeight(2); arc(0, 0, this.r * 1.8, this.r * 1.8, 0, HALF_PI); pop();
      fill(255, 200); noStroke(); ellipse(-this.r * 0.4, -this.r * 0.4, this.r * 0.6, this.r * 0.3);
      let strokeCol = color(STROKE_COLORS[this.type]); strokeCol.setAlpha(180);
      stroke(strokeCol); strokeWeight(1.5); noFill(); circle(0, 0, this.r * 2);
      noStroke(); fill(255, 210); circle(0, 0, max(18, this.r * 1.4));
      fill(STROKE_COLORS[this.type]); textAlign(CENTER, CENTER); textStyle(BOLD); textSize(max(14, this.r)); 
      text(this.level < 5 ? String(this.level) : "❤", 0, 0);
    }
    pop();
  }
}

class Spark { 
  constructor(x,y,col,isExplosion=false){ 
    this.pos=createVector(x,y); this.vel=p5.Vector.random2D().mult(random(2, isExplosion?8:5)); 
    this.lifespan=255; this.color=col; this.isExplosion=isExplosion;
  } 
  update(){ this.pos.add(this.vel); this.lifespan-=(this.isExplosion?8:15); if(this.isExplosion) this.vel.mult(0.95); }
  display(){ let c=color(this.color); c.setAlpha(this.lifespan); fill(c); noStroke(); circle(this.pos.x,this.pos.y, this.isExplosion?random(4,12):4); } 
  isDead(){ return this.lifespan<0; } 
}

class ExplosionFlash {
  constructor(x,y,col='#FFFFC8'){ this.pos=createVector(x,y); this.lifespan=255; this.r=50; this.col=color(col); }
  update(){ this.lifespan-=20; this.r+=5; }
  display(){ noStroke(); this.col.setAlpha(this.lifespan); fill(this.col); circle(this.pos.x, this.pos.y, this.r*2); }
  isDead(){ return this.lifespan<0; }
}

// ==========================================
// 6. 入力イベント (タッチ対応強化)
// ==========================================
function mousePressed() {
  initAudio(); 
  let m = getAdjustedMouse();
  if (m.x === -1) return false;

  if (gameState === "TITLE") {
    if (m.x > width/2 - 80 && m.x < width/2 + 80 && m.y > height/2 + 60 && m.y < height/2 + 110) {
      clearedStages = 0; initGrid();
    }
    return false;
  }
  if (isGameOver) { saveGameData(); gameState = "TITLE"; return false; }
  
  if (gameState === "PLAY" && m.y > 85 && m.y < 115 && m.x > width/2 - 80 && m.x < width/2 + 80) {
    if (millis() >= bombBoostUntil && soapCount >= 150) {
      soapCount -= 150; bombBoostUntil = millis() + BOOST_DURATION; saveGameData(); SE.merge(4); return false;
    }
  }
  handleStatesAndInput(m);
  return false; // デフォルトのタッチ挙動を防止
}

function handleStatesAndInput(m) {
  if (gameState === "AD") { initGrid(); return; }
  if (gameState === "RESULT") {
    if (m.y > height/2 + 20 && m.y < height/2 + 70) { soapCount += 50; saveGameData(); }
    if (clearedCountForAd % AD_INTERVAL === 0) gameState = "AD"; else initGrid(); return;
  }
  if (gameState === "REVIVE") {
    if (dist(m.x, m.y, width/2, height/2 - 20) < 60 && soapCount >= 5) { soapCount -= 5; remainingTaps = 3; gameState = "PLAY"; saveGameData(); } 
    else if (dist(m.x, m.y, width/2, height/2 + 50) < 60) { remainingTaps = 3; gameState = "PLAY"; } 
    else if (m.y > height/2 + 100) { isGameOver = true; SE.melt(); saveGameData(); } return;
  }
  if (gameState === "PLAY" && m.y > 140) {
    for (let i = particles.length - 1; i >= 0; i--) {
      let p = particles[i];
      if (!p) continue;
      if (dist(m.x, m.y, p.pos.x, p.pos.y) < p.r * 1.8) { // 判定を少し広く(スマホ用)
        if (p.level >= 5) p.ignite(); 
        else { SE.merge(1); addSparks(p.pos.x, p.pos.y, COLORS[p.type], 8); particles.splice(i, 1); }
        remainingTaps--; return;
      }
    }
  }
}

// ==========================================
// 7. 爆発処理
// ==========================================
function triggerExplosion(x, y) {
  shakeTime = 60; SE.bigBang();
  effects.push(new ExplosionFlash(x, y));
  for (let i = 0; i < 40; i++) addSparks(x, y, random(['#FF4500', '#FFD700', '#FF8800']), 1, true);
  processBlast(x, y, 190);
}

function triggerSmallBurst(x, y, type) {
  shakeTime = 25; SE.merge(4);
  effects.push(new ExplosionFlash(x, y, COLORS[type]));
  for (let i = 0; i < 20; i++) addSparks(x, y, COLORS[type], 1, true);
  processBlast(x, y, 140);
}

function processBlast(x, y, range) {
  for (let i = particles.length - 1; i >= 0; i--) {
    let p = particles[i];
    if (!p) continue;
    if (dist(x, y, p.pos.x, p.pos.y) < range) {
      if (p.level >= 5) p.ignite(); 
      else { addSparks(p.pos.x, p.pos.y, COLORS[p.type], 3); particles.splice(i, 1); }
    }
  }
}

// ==========================================
// 8. 補助・音響
// ==========================================
function getCombination(c1,c2){ let combo=[c1,c2].sort().join(""); if(combo==="BLUERED") return 'PURPLE'; if(combo==="REDYELLOW") return 'ORANGE'; if(combo==="BLUEYELLOW") return 'GREEN'; return null; }
function isFinalMix(m,s){ return (m==='PURPLE'&&s==='YELLOW')||(m==='ORANGE'&&s==='BLUE')||(m==='GREEN'&&s==='RED'); }
function addSparks(x,y,col,num,isExplosion=false){ for(let i=0;i<num;i++) effects.push(new Spark(x,y,col,isExplosion)); }
function initAudio(){ if(!audioCtx) audioCtx=new(window.AudioContext||window.webkitAudioContext)(); if(audioCtx.state==='suspended') audioCtx.resume(); }
const SE={ merge:(lv)=>playTone(1800+lv*300,'sine',0.1,0.2), bigBang:()=>playTone(60,'sine',1.0,0.8), melt:()=>playTone(150,'sine',3.0,0.3), quack:()=>playTone(1000,'sine',0.1,0.1) };
function playTone(f,t,d,v){ initAudio(); if(!audioCtx)return; let g=audioCtx.createGain(); let now=audioCtx.currentTime; let o=audioCtx.createOscillator(); o.type=t; o.frequency.setValueAtTime(f,now); o.connect(g); o.start(); o.stop(now+d); g.gain.setValueAtTime(v,now); g.gain.exponentialRampToValueAtTime(0.0001,now+d); g.connect(audioCtx.destination); }

// ==========================================
// 9. UI & 背景
// ==========================================
function drawUI(alert) {
  fill(20, 30, 40, 220); noStroke(); rect(10, 10, width - 20, 125, 20);
  
  textAlign(LEFT, TOP); textSize(18); fill('#FFCCFF'); textStyle(BOLD); noStroke();
  text("🏆 STAGE: " + clearedStages, 30, 25);
  textAlign(RIGHT, TOP); fill('#FFFFFF'); text("🧼 " + soapCount, width - 30, 25);

  drawCuteBubbleTitle(width / 2, 60);

  noStroke(); textStyle(NORMAL);
  let now = millis();
  if (now < bombBoostUntil) {
    let timeLeft = ceil((bombBoostUntil - now) / 1000); fill('#FFD700'); rect(width/2 - 80, 95, 160, 30, 15);
    fill(0); textSize(14); textAlign(CENTER, CENTER); text("🔥 BOMB TIME: " + timeLeft + "s", width/2, 110);
  } else {
    fill(soapCount >= 150 ? '#555555' : '#333333'); rect(width/2 - 80, 95, 160, 30, 15);
    fill(255); textSize(12); textAlign(CENTER, CENTER); text("BUY BOMB BOOST (150🧼)", width/2, 110);
  }
  textAlign(CENTER, TOP); textSize(16);
  fill(alert && frameCount % 40 < 20 ? '#FF80BF' : '#CCCCCC'); text("🐤 Taps: " + remainingTaps, width / 2, 130);
}

function drawCuteBubbleTitle(x, y) {
  push(); translate(x, y); textAlign(CENTER, CENTER); textStyle(BOLD); textSize(30);
  let txt = "Bubble Bomb";
  noStroke(); fill(0, 100); text(txt, 2, 3);
  let bubblePink = color('#FFCCFF'); 
  for(let i = 4; i > 0; i--) {
    let pct = i / 4;
    let col = lerpColor(bubblePink, color(255), 1 - pct);
    let alpha = map(i, 0, 4, 255, 150);
    col.setAlpha(alpha);
    fill(col); stroke(col); strokeWeight(i * 1.5);
    text(txt, 0, 0);
  }
  noFill();
  let edgeColor = color(COLORS['BLUE']); 
  edgeColor.setAlpha(180);
  stroke(edgeColor); strokeWeight(2);
  text(txt, 0, 0);
  noStroke(); fill(255, 230);
  let tw = textWidth(txt);
  let startX = -tw / 2 + 8;
  let charSpaces = [0, 15, 32, 45, 58, 70, 88, 105, 116, 133, 151, 168];
  for(let i = 0; i < txt.length; i++) {
    if(txt[i] === ' ') continue;
    let cx = startX + charSpaces[i];
    ellipse(cx, -8, 5, 3); 
    fill(255, 50); ellipse(cx + 4, 4, 2.5, 2.5);
    fill(255, 230);
  }
  pop();
}

function drawTileBackground() { 
  background('#1A2533'); stroke('#2D3B4D'); strokeWeight(2); 
  for(let x=0; x<=width; x+=25) line(x,0,x,height); 
  for(let y=0; y<=height; y+=25) line(0,y,width,y); 
}

function drawTitleScreen() { 
  fill(0, 150); rect(0, 0, width, height); textAlign(CENTER, CENTER); 
  fill(255); textSize(42); textStyle(BOLD); text("Bubble Bomb", width/2, height/2 - 100); 
  fill('#FFD700'); textSize(20); text("BEST STAGE: " + highScore, width/2, height/2 - 30); 
  fill('#FFFFFF'); text("Your Soap: 🧼 " + soapCount, width/2, height/2); 
  fill('#FF80BF'); rect(width/2 - 80, height/2 + 60, 160, 50, 25); 
  fill(255); textSize(24); text("START", width/2, height/2 + 85); 
}

function drawResultScreen() { 
  fill(0, 200); rect(0, 0, width, height); textAlign(CENTER, CENTER); 
  fill('#CCFFCC'); textSize(36); textStyle(BOLD); text("CLEAR! +10 🧼", width/2, height/2 - 50); 
  fill(255, 215, 0); rect(width/2 - 120, height/2 + 20, 240, 50, 15); 
  fill(0); textSize(18); text("Watch Ad for +50 🧼", width/2, height/2 + 45); 
}

function drawReviveScreen() { 
  fill(0, 200); rect(0, 0, width, height); textAlign(CENTER, CENTER); 
  fill(255); textSize(32); text("OUT OF TAPS", width/2, height/2 - 100); 
  fill(soapCount >= 5 ? "#44AAFF" : "#888888"); rect(width/2 - 110, height/2 - 45, 220, 45, 10); 
  fill(255); textSize(16); text("Use 5 🧼 (+3 Taps)", width/2, height/2 - 22); 
  fill("#FF8800"); rect(width/2 - 110, height/2 + 25, 220, 45, 10); 
  fill(255); text("Watch Ad (+3 Taps)", width/2, height/2 + 48); 
  fill(255, 150); textSize(14); text("Or click below to end game", width/2, height/2 + 100);
}

function drawInterstitialAd() { 
  fill(0); rect(0, 0, width, height); textAlign(CENTER, CENTER); 
  fill(255); textSize(24); text("INTERSTITIAL AD", width/2, height/2 - 20); 
  fill(255); rect(width/2 - 50, height/2 + 60, 100, 40, 5); 
  fill(0); text("CLOSE", width/2, height/2 + 80); 
}

function drawEndScreen(){ 
  fill(0,200); rect(0,0,width,height); textAlign(CENTER,CENTER); 
  fill('#FF3333'); textSize(48); textStyle(BOLD); text("MELTDOWN", width/2, height/2); 
  textSize(20); fill(255); text("Click to Title", width/2, height/2 + 60); 
}