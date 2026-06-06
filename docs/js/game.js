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

// ── ぷにこん: one-thumb floating virtual joystick ───────────────
// Drag left/right = move, flick up = jump (flick again = double jump),
// flick down = special, quick tap = attack. All doable with a single thumb.
function setupTouchControls() {
  const surf = document.getElementById('game-ui');
  const puni = document.getElementById('puni');
  const knob = document.getElementById('puni-knob');
  const hint = document.getElementById('touch-hint');
  if (!surf || !puni || !knob) return;

  const RADIUS     = 58;  // visual knob clamp radius (px)
  const DEAD       = 16;  // horizontal deadzone before moving
  const JUMP_UP    = 36;  // upward distance that triggers a jump
  const JUMP_REARM = 18;  // knob must return within this to re-arm jump
  const SPEC_DOWN  = 50;  // downward distance that triggers special
  const TAP_MOVE   = 18;  // max movement to still count as a tap
  const TAP_MS     = 240; // max duration to still count as a tap

  let active = false, pid = null;
  let ox = 0, oy = 0, startT = 0, maxMove = 0;
  let jumpArmed = true, specialFired = false;

  function clearMove() { keys.left = false; keys.right = false; }

  function reset() {
    active = false; pid = null;
    clearMove();
    puni.classList.remove('on');
  }

  surf.addEventListener('pointerdown', e => {
    if (active || currentScreen !== 'game') return;
    active = true; pid = e.pointerId;
    ox = e.clientX; oy = e.clientY;
    startT = performance.now(); maxMove = 0;
    jumpArmed = true; specialFired = false;
    clearMove();
    puni.style.left = ox + 'px';
    puni.style.top  = oy + 'px';
    puni.classList.add('on');
    knob.style.transform = 'translate(-50%, -50%)';
    if (hint) hint.style.opacity = '0';
    try { surf.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
  }, { passive: false });

  surf.addEventListener('pointermove', e => {
    if (!active || e.pointerId !== pid) return;
    const dx = e.clientX - ox;
    const dy = e.clientY - oy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxMove) maxMove = dist;

    // Move the visual knob (clamped to radius)
    const cl  = Math.min(dist, RADIUS);
    const ang = Math.atan2(dy, dx);
    const kx  = Math.cos(ang) * cl;
    const ky  = Math.sin(ang) * cl;
    knob.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;

    // Horizontal movement
    keys.left  = dx < -DEAD;
    keys.right = dx >  DEAD;

    // Jump on upward flick (edge-detected so each flick = one jump)
    if (dy < -JUMP_UP && jumpArmed) { inputSeq.jump++; jumpArmed = false; }
    if (dy > -JUMP_REARM) jumpArmed = true;

    // Special on downward flick (once per touch)
    if (dy > SPEC_DOWN && !specialFired) { inputSeq.special++; specialFired = true; }

    e.preventDefault();
  }, { passive: false });

  function end(e) {
    if (!active || e.pointerId !== pid) return;
    const dt = performance.now() - startT;
    if (maxMove < TAP_MOVE && dt < TAP_MS) inputSeq.attack++; // quick tap = attack
    reset();
  }
  surf.addEventListener('pointerup', end);
  surf.addEventListener('pointercancel', end);
}

// ── Game Loop ───────────────────────────────────────────────────

function gameLoop(ts) {
  lastFrameTime = ts;

  if (currentScreen === 'game' && gameRunning) {
    if (isHost && gState) updateHostGameState();
    if (soloMode && gState && gState.status === 'finished' && !soloGameEnded) {
      soloGameEnded = true;
      setTimeout(showSoloResultScreen, 2000);
    }
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

  if (soloMode) {
    soloFrames++;
    soloScore = soloKOs * SOLO_KO_SCORE + Math.floor(soloFrames / 60) * SOLO_TIME_RATE;

    // Wave advancement (up to 3 bots)
    const targetWave = Math.min(Math.floor(soloFrames / WAVE_INTERVAL) + 1, 3);
    if (targetWave > soloWave) {
      soloWave = targetWave;
      if (!gState.slots[soloWave]) {
        gState.slots[soloWave] = _makeBotState(soloWave);
      }
    }

    // Bot respawn after KO
    for (let i = 1; i <= soloWave; i++) {
      const bot = gState.slots[i];
      if (bot && bot.eliminated) {
        bot.respawnTimer = (bot.respawnTimer || 0) + 1;
        if (bot.respawnTimer >= BOT_RESPAWN) _soloRespawnBot(bot);
      }
    }

    // Run bot AI
    for (let i = 1; i <= 3; i++) {
      if (gState.slots[i] && !gState.slots[i].eliminated) updateBotAI(i);
    }
  }

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

// ── Bot AI ──────────────────────────────────────────────────────

function updateBotAI(botSlot) {
  const bot = gState.slots[botSlot];
  if (!bot || bot.eliminated || bot.hurtTimer > 0) return;

  const target = gState.slots[0];
  if (!target || target.eliminated) return;

  const aggression = Math.min(0.35 + soloWave * 0.22, 0.95);
  const dx = target.x - bot.x;
  const dy = target.y - bot.y;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);

  const seqRef = prevRemoteSeq[bot.id] || {};
  const inp = {
    left: false, right: false,
    jumpSeq:    seqRef.jumpSeq    || 0,
    attackSeq:  seqRef.attackSeq  || 0,
    specialSeq: seqRef.specialSeq || 0,
  };

  // Edge avoidance (priority)
  if (bot.x < 115) {
    inp.right = true;
  } else if (bot.x > CANVAS_W - 115) {
    inp.left = true;
  } else if (adx > 40) {
    inp.right = dx > 0;
    inp.left  = dx < 0;
  }

  // Jump to reach higher targets or unstick
  if (bot.onGround) {
    if (dy < -55 && Math.random() < 0.028 * aggression) inp.jumpSeq++;
    else if (Math.random() < 0.005) inp.jumpSeq++;
  }

  // Attack when close
  if (adx < 78 && ady < 58) {
    if (Math.random() < 0.055 * aggression) inp.attackSeq++;
    if (Math.random() < 0.022 * aggression) inp.specialSeq++;
  }

  remoteInputs[bot.id] = inp;
}

// ── Input Processing ────────────────────────────────────────────

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

  const prevJ = (prevRemoteSeq[p.id] || {}).jumpSeq    || 0;
  const prevA = (prevRemoteSeq[p.id] || {}).attackSeq  || 0;
  const prevS = (prevRemoteSeq[p.id] || {}).specialSeq || 0;
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
      if (soloMode && p.slot !== 0) {
        // Bot KO'd: count score, start respawn timer
        soloKOs++;
        soloScore = soloKOs * SOLO_KO_SCORE + Math.floor(soloFrames / 60) * SOLO_TIME_RATE;
        p.eliminated = true;
        p.stocks = 0;
        p.respawnTimer = 0;
      } else {
        p.eliminated = true;
        p.stocks = 0;
      }
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

function _soloRespawnBot(bot) {
  const sp = SPAWNS[bot.slot] || [CANVAS_W / 2, 200];
  bot.x = sp[0]; bot.y = sp[1] - 60;
  bot.vx = 0; bot.vy = 0;
  bot.damage = 0;
  bot.stocks = MAX_STOCKS;
  bot.eliminated = false;
  bot.hurtTimer = RESPAWN_INV;
  bot.onGround = false;
  bot.action = 'idle';
  bot.actionFrame = 0;
  bot.hasHit = {};
  bot.respawnTimer = 0;
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

  const kbBase = isSpec ? 12 : 7;
  const kb = (kbBase + d.damage * 0.10) / ch.weight;
  const dx = d.x - a.x;
  const dy = (d.y - PH * 0.5) - (a.y - PH * 0.5);
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  d.vx = (dx / dist) * kb * 2.2;
  d.vy = (dy / dist) * kb - (isSpec ? 3.0 : 1.0);
  if (d.vy > -2.0) d.vy = -2.0;

  d.hurtTimer = Math.min(HITSTUN_BASE + Math.floor(kb * 2.5), 45);
  d.onGround = false;

  if (isSpec) sfx.bigHit(); else sfx.hit();
}

function checkWin() {
  if (soloMode) {
    const player = gState.slots[0];
    if (player && player.eliminated) {
      gState.status = 'finished';
      gState.winner = -1;
    }
    return;
  }
  const alive = gState.slots.filter(p => p && !p.eliminated);
  if (alive.length <= 1 && gState.slots.some(p => p)) {
    gState.status = 'finished';
    gState.winner = alive.length === 1 ? alive[0].slot : -1;
  }
}

// ── Solo Mode Setup ─────────────────────────────────────────────

function startSoloGame() {
  soloMode = true;
  soloScore = 0;
  soloWave = 1;
  soloKOs = 0;
  soloFrames = 0;
  soloGameEnded = false;
  isHost = true;
  gameRunning = true;

  const slots = [null, null, null, null];
  slots[0] = {
    id: myId, nick: myNick || 'PLAYER', slot: 0, charIndex: myChar,
    x: SPAWNS[0][0], y: SPAWNS[0][1],
    vx: 0, vy: 0, damage: 0, stocks: MAX_STOCKS, facing: 1,
    onGround: false, canDJ: false, action: 'idle', actionFrame: 0,
    hurtTimer: 0, hasHit: {}, eliminated: false
  };
  slots[1] = _makeBotState(1);

  gState = { frame: 0, status: 'playing', winner: -1, countdown: 3, slots };

  showScreen('game');
  document.getElementById('game-ui').classList.add('on');
  sfx.start();

  // Drive countdown 3→2→1→GO→hidden
  let cdN = 3;
  const cdIv = setInterval(() => {
    if (!gState) { clearInterval(cdIv); return; }
    gState.countdown = cdN;
    cdN--;
    if (cdN < 0) { gState.countdown = 0; clearInterval(cdIv); }
  }, 1000);
}

function _makeBotState(slot) {
  const sp = SPAWNS[slot] || [CANVAS_W / 2, 200];
  const botChars = [0, 2, 3, 1];
  const botNicks = ['BOT-A', 'BOT-B', 'BOT-C'];
  return {
    id: 'bot_' + slot,
    nick: botNicks[slot - 1] || 'BOT',
    slot, charIndex: botChars[slot] || 0,
    x: sp[0], y: sp[1], vx: 0, vy: 0,
    damage: 0, stocks: MAX_STOCKS, facing: -1,
    onGround: false, canDJ: false, action: 'idle', actionFrame: 0,
    hurtTimer: 0, hasHit: {}, eliminated: false,
    isBot: true, respawnTimer: 0
  };
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
  buildCharSelect('char-select-row');
  document.getElementById('lobby-msg').textContent = '';
}

function showHowTo() { showScreen('howto'); }

function buildCharSelect(rowId) {
  charSelectRowId = rowId || 'char-select-row';
  const row = document.getElementById(charSelectRowId);
  if (!row) return;
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
  buildCharSelect(charSelectRowId);
  sfx.select();
  if (roomKeyword) fbUpdateMyChar(i);
}

function showLobbyMsg(msg, isErr) {
  const el = document.getElementById('lobby-msg');
  el.textContent = msg;
  el.className = isErr ? 'err-msg' : 'ok-msg';
}

function checkOrientation() {
  // Portrait one-thumb play: ask the player to hold the phone upright if in landscape.
  const el = document.getElementById('rotate-msg');
  if (!el) return;
  el.style.display = window.innerWidth > window.innerHeight * 1.1 ? 'flex' : 'none';
}

function returnToLobby() {
  const wasSolo = soloMode;
  gState = null;
  koEffect = null;
  soloMode = false;
  soloGameEnded = false;
  soloScore = 0;
  soloWave = 1;
  soloKOs = 0;
  soloFrames = 0;
  if (wasSolo) showSoloScreen(); else showLobby();
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
