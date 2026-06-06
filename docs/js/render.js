function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function getScale() {
  return Math.min(canvas.width / CANVAS_W, canvas.height / CANVAS_H);
}

function getOffset() {
  const s = getScale();
  return { x: (canvas.width - CANVAS_W * s) / 2, y: (canvas.height - CANVAS_H * s) / 2 };
}

function renderGame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const s = getScale();
  const o = getOffset();
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.scale(s, s);

  drawBackground();
  drawPlatforms();

  if (gState && gState.slots) {
    for (let i = 0; i < 4; i++) {
      const p = gState.slots[i];
      if (p && !p.eliminated) drawPlayer(p);
    }
    for (let i = 0; i < 4; i++) {
      const p = gState.slots[i];
      if (p && !p.eliminated) drawPlayerLabel(p);
    }
    drawKOEffect();
    if (gState.countdown > 0) drawCountdown(gState.countdown);
  }

  ctx.restore();
}

function renderBackground() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const s = getScale();
  const o = getOffset();
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.scale(s, s);
  drawBackground();
  drawPlatforms();
  ctx.restore();
}

function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  g.addColorStop(0, '#060618');
  g.addColorStop(1, '#1a0830');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  for (let i = 0; i < STARS.length; i++) {
    const st = STARS[i];
    ctx.globalAlpha = st.a;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(st.x, st.y, st.r, 0, 6.2832);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawPlatforms() {
  for (let i = 0; i < STAGES.length; i++) {
    const [x, y, w, h, main] = STAGES[i];
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(x + 3, y + 5, w, h);

    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, main ? '#4455cc' : '#334477');
    g.addColorStop(1, main ? '#2233aa' : '#223355');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);

    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(x, y, w, 3);
  }
}

function drawPlayer(p) {
  const color = SLOT_COLORS[p.slot];
  const x = Math.round(p.x);
  const y = Math.round(p.y);
  const now = Date.now();
  const flashing = p.hurtTimer > RESPAWN_INV * 0.5 && Math.floor(now / 55) % 2 === 0;

  ctx.globalAlpha = flashing ? 0.35 : 1;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(x, y + 2, PW * 0.55, 4, 0, 0, 6.2832);
  ctx.fill();

  // Body
  ctx.fillStyle = color;
  ctx.fillRect(x - PW / 2, y - PH, PW, PH);

  // Highlight top
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(x - PW / 2, y - PH, PW, PH * 0.38);

  // Legs darkening
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(x - PW / 2, y - PH * 0.32, PW, PH * 0.32);

  // Eye
  const eyeOffX = p.facing === 1 ? PW * 0.22 : -PW * 0.22;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x + eyeOffX, y - PH * 0.72, 5, 0, 6.2832);
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(x + eyeOffX + p.facing * 1.8, y - PH * 0.72, 2.5, 0, 6.2832);
  ctx.fill();

  // Attack effect
  if ((p.action === 'attack' || p.action === 'special') && p.actionFrame !== undefined) {
    const su = p.action === 'special' ? SPEC_STARTUP : ATK_STARTUP;
    const ac = p.action === 'special' ? SPEC_ACTIVE : ATK_ACTIVE;
    if (p.actionFrame >= su && p.actionFrame < su + ac) {
      drawAttackFx(x, y, p.facing, p.action === 'special');
    }
  }

  ctx.globalAlpha = 1;
}

function drawAttackFx(x, y, facing, isSpecial) {
  ctx.save();
  if (isSpecial) {
    const cx = x + facing * 32;
    const cy = y - PH * 0.5;
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 38);
    g.addColorStop(0, 'rgba(255,220,0,0.85)');
    g.addColorStop(1, 'rgba(255,100,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, 38, 0, 6.2832);
    ctx.fill();
  } else {
    ctx.strokeStyle = 'rgba(255,255,255,0.88)';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    const startA = facing === 1 ? -0.85 : 2.3;
    const endA   = facing === 1 ?  0.85 : 3.8;
    ctx.beginPath();
    ctx.arc(x + facing * 6, y - PH * 0.5, 30, startA, endA);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPlayerLabel(p) {
  const color = SLOT_COLORS[p.slot];
  ctx.fillStyle = color;
  ctx.font = 'bold 10px "Courier New"';
  ctx.textAlign = 'center';
  ctx.fillText(p.nick || '?', Math.round(p.x), Math.round(p.y) - PH - 5);
}

function drawCountdown(n) {
  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 100px Impact';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(n > 0 ? n : 'GO!', CANVAS_W / 2, CANVAS_H / 2);
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
}

function drawKOEffect() {
  if (!koEffect || koEffect.timer <= 0) return;
  const a = koEffect.timer / 55;
  ctx.fillStyle = `rgba(255,255,255,${a * 0.28})`;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = koEffect.color;
  ctx.font = 'bold 64px Impact';
  ctx.textAlign = 'center';
  ctx.fillText('KO!', CANVAS_W / 2, CANVAS_H / 2 - 20);
  ctx.globalAlpha = 1;
  ctx.restore();
  koEffect.timer--;
}

function updateDamageUI() {
  const el = document.getElementById('damage-ui');
  if (!gState || !gameRunning || !gState.slots) { el.innerHTML = ''; return; }

  let html = '';
  for (let i = 0; i < 4; i++) {
    const p = gState.slots[i];
    if (!p) continue;
    const isMe = p.id === myId;
    const stocks = '●'.repeat(Math.max(0, p.stocks)) + '○'.repeat(Math.max(0, MAX_STOCKS - p.stocks));
    const dimmed = p.eliminated ? 'opacity:0.3;' : '';
    const dc = p.damage < 60 ? '#fff' : p.damage < 120 ? '#ffaa00' : '#ff4400';
    html += `<div class="dmg-card${isMe ? ' me' : ''}" style="${dimmed}">
      <div class="dmg-nick">${(p.nick || '?').slice(0, 6)}</div>
      <div class="dmg-pct" style="color:${dc}">${p.damage}%</div>
      <div class="dmg-stocks">${stocks}</div>
    </div>`;
  }
  el.innerHTML = html;
}
