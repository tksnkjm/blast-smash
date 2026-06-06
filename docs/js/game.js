// ── Canvas & Input ──────────────────────────────────────────────

function initCanvas() {
  canvas = document.getElementById('c');
  ctx = canvas.getContext('2d');
  resizeCanvas();
  window.addEventListener('resize', () => { resizeCanvas(); });
}

function setupKeyboard() {
  const down = (code) => {
    if (code === 'ArrowLeft'  || code === 'KeyA') { keys.left = true; }
    if (code === 'ArrowRight' || code === 'KeyD') { keys.right = true; }
    if (code === 'ArrowUp' || code === 'KeyZ' || code === 'Space') {
      if (!keys.jump) inputSeq.jump++;
      keys.jump = true;
    }
    if (code === 'KeyX') {
      if (!keys.attack) inputSeq.attack++;
      keys.attack = true;
    }
    if (code === 'KeyC') {
      if (!keys.special) inputSeq.special++;
      keys.special = true;
    }
  };
  const up = (code) => {
    if (code === 'ArrowLeft'  || code === 'KeyA') keys.left = false;
    if (code === 'ArrowRight' || code === 'KeyD') keys.right = false;
    if (code === 'ArrowUp' || code === 'KeyZ' || code === 'Space') keys.jump = false;
    if (code === 'KeyX') keys.attack = false;
    if (code === 'KeyC') keys.special = false;
  };
  document.addEventListener('keydown', e => {
    if (['ArrowLeft','ArrowRight','ArrowUp','Space'].includes(e.code)) e.preventDefault();
    down(e.code);
  });
  document.addEventListener('keyup', e => up(e.code));
}

function setupTouchControls() {
  const map = {
    'btn-left':    () => { keys.left = true; },
    'btn-right':   () => { keys.right = true; },
    'btn-jump':    () => { if (!keys.jump) inputSeq.jump++; keys.jump = true; },
    'btn-attack':  () => { if (!keys.attack) inputSeq.attack++; keys.attack = true; },
    'btn-special': () => { if (!keys.special) inputSeq.special++; keys.special = true; },
  };
  const releaseMap = {
    'btn-left':    () => { keys.left = false; },
    'btn-right':   () => { keys.right = false; },
    'btn-jump':    () => { keys.jump = false; },
    'btn-attack':  () => { keys.attack = false; },
    'btn-special': () => { keys.special = false; },
  };
  Object.keys(map).forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('pointerdown', e => { e.preventDefault(); el.classList.add('active'); map[id](); }, { passive: false });
    ['pointerup','pointerleave','pointercancel'].forEach(ev =>
      el.addEventListener(ev, () => { el.classList.remove('active'); releaseMap[id](); })
    );
  });
}

// ── Game Loop ───────────────────────────────────────────────────

function gameLoop(ts) {
  lastFrameTime = ts;

  if (currentScreen === 'game' && gameRunning) {
    if (isHost && gState) updateHostGameState();
    renderGame();
    updateDamageUI();
  } else {
    renderBackground();
  }

  animFrame = requestAnimationFrame(gameLoop);
}

// ── Host Physics ────────────────────────────────────────────────

function updateHostGameState() {
  if (!gState || gState.status !== 'playing') return;
  gState.frame = (gState.frame || 0) + 1;

  for (let i = 0; i < 4; i++) {
    const p = gState.slots[i];
    if (!p || p.eliminated) continue;
    const inp = getInputForPlayer(p);
    applyInput(p, inp);
    applyPhysics(p);
    checkPlatforms(p);
    checkBlastZones(p);
  }

  checkHits();
  checkWin();
}

function getInputForPlayer(p) {
  if (p.id === myId) {
    return {
      left: keys.left, right: keys.right, jump: keys.jump,
      attack: keys.attack, special: keys.special,
      jumpSeq: inputSeq.jump, attackSeq: inputSeq.attack, specialSeq: inputSeq.special
    };
  }
  return remoteInputs[p.id] || {};
}

function applyInput(p, inp) {
  if (!inp) return;
  const ch = CHARS[p.charIndex] || CHARS[0];

  if (p.hurtTimer > 0) { p.hurtTimer--; return; }

  let inAttack = p.action === 'attack' || p.action === 'special';
  const su = p.action === 'special' ? SPEC_STARTUP : ATK_STARTUP;
  const ac = p.action === 'special' ? SPEC_ACTIVE : ATK_ACTIVE;
  const inRecovery = inAttack && p.actionFrame >= su + ac;

  if (!inRecovery) {
    const spd = MOVE_SPD * ch.spd * 0.3;
    if (inp.left)  p.vx -= spd;
    if (inp.right) p.vx += spd;
  }

  const maxSpd = MOVE_SPD * ch.spd;
  if (p.vx >  maxSpd) p.vx =  maxSpd;
  if (p.vx < -maxSpd) p.vx = -maxSpd;
  if (p.vx > 0.3) p.facing = 1;
  if (p.vx < -0.3) p.facing = -1;

  // Jump via seq comparison
  const prevJ  = (prevRemoteSeq[p.id] || {}).jumpSeq    || 0;
  const prevA  = (prevRemoteSeq[p.id] || {}).attackSeq  || 0;
  const prevS  = (prevRemoteSeq[p.id] || {}).specialSeq || 0;
  const jumpPressed    = (inp.jumpSeq    || 0) > prevJ;
  const attackPressed  = (inp.attackSeq  || 0) > prevA;
  const specialPressed = (inp.specialSeq || 0) > prevS;

  if (jumpPressed) {
    if (p.onGround) {
      p.vy = JUMP_F * ch.jump;
      p.onGround = false;
      p.canDJ = true;
      sfx.jump();
    } else if (p.canDJ) {
      p.vy = DJ_F * ch.jump;
      p.canDJ = false;
      sfx.jump();
    }
  }

  if (!inAttack && attackPressed)  { startAttack(p, false); inAttack = true; }
  if (!inAttack && specialPressed) { startAttack(p, true);  inAttack = true; }

  // Advance attack frames
  if (inAttack) {
    p.actionFrame++;
    const total = (p.action === 'special')
      ? SPEC_STARTUP + SPEC_ACTIVE + SPEC_RECOVERY
      : ATK_STARTUP  + ATK_ACTIVE  + ATK_RECOVERY;
    if (p.actionFrame >= total) {
      p.action = p.onGround ? 'idle' : 'jump';
      p.actionFrame = 0;
      p.hasHit = {};
    }
  } else {
    p.actionFrame = 0;
    p.action = p.onGround ? (Math.abs(p.vx) > 0.5 ? 'walk' : 'idle') : 'jump';
  }

  // Save seqs for next frame edge detection
  if (!prevRemoteSeq[p.id]) prevRemoteSeq[p.id] = {};
  prevRemoteSeq[p.id].jumpSeq    = inp.jumpSeq    || 0;
  prevRemoteSeq[p.id].attackSeq  = inp.attackSeq  || 0;
  prevRemoteSeq[p.id].specialSeq = inp.specialSeq || 0;
}

function startAttack(p, isSpecial) {
  p.action = isSpecial ? 'special' : 'attack';
  p.actionFrame = 0;
  p.hasHit = {};
  if (isSpecial) sfx.special(); else sfx.attack();
}

function applyPhysics(p) {
  p.vy += GRAVITY;
  if (p.vy > MAX_FALL_SPD) p.vy = MAX_FALL_SPD;
  p.vx *= p.onGround ? FRICTION_GND : FRICTION_AIR;
  p.x += p.vx;
  p.y += p.vy;
  p.onGround = false;
}

function checkPlatforms(p) {
  for (let i = 0; i < STAGES.length; i++) {
    const [px, py, pw] = STAGES[i];
    const inX = p.x + PW / 2 > px && p.x - PW / 2 < px + pw;
    if (inX && p.vy >= 0 && p.y > py && p.y <= py + p.vy + 2) {
      p.y = py;
      p.vy = 0;
      p.onGround = true;
      p.canDJ = true;
    }
  }
}

function checkBlastZones(p) {
  if (p.x < BLAST_L || p.x > BLAST_R || p.y < BLAST_T || p.y > BLAST_B) {
    p.stocks--;
    koEffect = { slot: p.slot, timer: 55, color: SLOT_COLORS[p.slot] };
    sfx.ko();
    if (p.stocks <= 0) {
      p.eliminated = true;
      p.stocks = 0;
    } else {
      respawnPlayer(p);
    }
  }
}

function respawnPlayer(p) {
  const sp = SPAWNS[p.slot] || [CANVAS_W / 2, 200];
  p.x = sp[0]; p.y = sp[1];
  p.vx = 0; p.vy = 0;
  p.damage = 0;
  p.hurtTimer = RESPAWN_INV;
  p.onGround = false;
  p.action = 'idle';
  p.actionFrame = 0;
  p.hasHit = {};
}

function checkHits() {
  for (let ai = 0; ai < 4; ai++) {
    const a = gState.slots[ai];
    if (!a || a.eliminated) continue;
    const isSpec = a.action === 'special';
    const su = isSpec ? SPEC_STARTUP : ATK_STARTUP;
    const ac = isSpec ? SPEC_ACTIVE  : ATK_ACTIVE;
    if (a.actionFrame < su || a.actionFrame >= su + ac) continue;

    const hbRange = isSpec ? 42 : 32;
    const hbX = a.x + a.facing * (PW / 2 + hbRange / 2);
    const hbY = a.y - PH / 2;

    for (let di = 0; di < 4; di++) {
      const d = gState.slots[di];
      if (!d || d.eliminated || di === ai) continue;
      if (a.hasHit && a.hasHit[di]) continue;
      if (d.hurtTimer > HITSTUN_BASE) continue;

      const overlapX = Math.abs(hbX - d.x) < hbRange / 2 + PW / 2;
      const overlapY = Math.abs(hbY - (d.y - PH / 2)) < hbRange / 2 + PH / 2;
      if (overlapX && overlapY) {
        applyHit(a, d, isSpec);
        if (!a.hasHit) a.hasHit = {};
        a.hasHit[di] = true;
      }
    }
  }
}

function applyHit(a, d, isSpec) {
  const ch = CHARS[d.charIndex] || CHARS[0];
  const dmg = isSpec ? 13 : 7;
  d.damage += dmg;

  const kbBase = isSpec ? 9 : 5;
  const kb = (kbBase + d.damage * 0.055) / ch.weight;
  const dx = d.x - a.x;
  const dy = (d.y - PH * 0.5) - (a.y - PH * 0.5);
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  d.vx = (dx / dist) * kb * 1.6;
  d.vy = (dy / dist) * kb - (isSpec ? 1.5 : 0);
  if (d.vy > -1.5) d.vy = -1.5;

  d.hurtTimer = Math.min(HITSTUN_BASE + Math.floor(kb * 2.5), 45);
  d.onGround = false;

  if (isSpec) sfx.bigHit(); else sfx.hit();
}

function checkWin() {
  const alive = gState.slots.filter(p => p && !p.eliminated);
  if (alive.length <= 1 && gState.slots.some(p => p)) {
    gState.status = 'finished';
    gState.winner = alive.length === 1 ? alive[0].slot : -1;
  }
}

// ── UI Helpers ──────────────────────────────────────────────────

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(el => el.classList.add('off'));
  const el = document.getElementById('screen-' + name);
  if (el) el.classList.remove('off');
  currentScreen = name;

  if (name !== 'game') {
    document.getElementById('game-ui').classList.remove('on');
    document.getElementById('damage-ui').innerHTML = '';
  }
}

function showLobby() {
  showScreen('lobby');
  buildCharSelect();
  document.getElementById('lobby-msg').textContent = '';
}

function showHowTo() { showScreen('howto'); }

function buildCharSelect() {
  const row = document.getElementById('char-select-row');
  row.innerHTML = CHARS.map((ch, i) => {
    const sel = i === charSelectIdx;
    return `<div class="char-opt ${sel ? 'sel' : ''}"
              style="background:${ch.color}22;border-color:${sel ? ch.color : '#334'}"
              onclick="selectChar(${i})">
      <div class="char-emoji">${ch.emoji}</div>
      <div class="char-lbl">${ch.name}</div>
    </div>`;
  }).join('');
}

function selectChar(i) {
  charSelectIdx = i;
  myChar = i;
  buildCharSelect();
  sfx.select();
  if (roomKeyword) fbUpdateMyChar(i);
}

function showLobbyMsg(msg, isErr) {
  const el = document.getElementById('lobby-msg');
  el.textContent = msg;
  el.className = isErr ? 'err-msg' : 'ok-msg';
}

function checkOrientation() {
  const el = document.getElementById('rotate-msg');
  if (!el) return;
  el.style.display = window.innerHeight > window.innerWidth * 1.1 ? 'flex' : 'none';
}

function returnToLobby() {
  gState = null;
  koEffect = null;
  showLobby();
}

// ── Init ────────────────────────────────────────────────────────

function init() {
  initCanvas();
  setupKeyboard();
  setupTouchControls();
  initFirebase();
  checkOrientation();
  window.addEventListener('resize', checkOrientation);
  requestAnimationFrame(gameLoop);
  showScreen('title');
}

window.addEventListener('load', init);
