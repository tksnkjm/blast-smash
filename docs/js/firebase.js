// Firebase Realtime Database integration
// Host-authoritative: host writes gState at 20Hz, clients write inputs at 30Hz

let _db = null;

function fbr(path) { return _db.ref(path); }

function initFirebase() {
  if (typeof firebase === 'undefined') {
    console.warn('[FB] SDK missing — demo mode only');
    return;
  }
  try {
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    _db = firebase.database();
    console.log('[FB] ready');
  } catch (e) {
    console.error('[FB] init error:', e);
  }
}

// ── Join / Create Room ──────────────────────────────────────────

async function joinRoom() {
  if (!_db) { showLobbyMsg('Firebase未設定。constants.jsを編集してください。', true); return; }

  const nick    = document.getElementById('input-nick').value.trim();
  const keyword = document.getElementById('input-keyword').value.trim().toUpperCase().replace(/\s+/g, '_');

  if (!nick)    { showLobbyMsg('ニックネームを入力してください', true); return; }
  if (!keyword) { showLobbyMsg('合言葉を入力してください', true); return; }

  myNick = nick;
  myChar = charSelectIdx;
  roomKeyword = keyword;
  showLobbyMsg('接続中...');

  try {
    const roomRef = fbr(`rooms/${keyword}`);
    const snap = await roomRef.once('value');
    const room = snap.val();

    if (!room) {
      await _createRoom(roomRef);
    } else if (room.status === 'playing' || room.status === 'finished') {
      showLobbyMsg('このルームは試合中か終了済みです', true);
      return;
    } else {
      await _joinExistingRoom(roomRef, room);
    }

    showScreen('room');
    _setupRoomListeners();
  } catch (e) {
    console.error('[FB] joinRoom:', e);
    showLobbyMsg('接続エラー: ' + e.message, true);
  }
}

async function _createRoom(roomRef) {
  isHost = true;
  mySlot = 0;
  await roomRef.set({
    status:    'waiting',
    host:      myId,
    keyword:   roomKeyword,
    createdAt: firebase.database.ServerValue.TIMESTAMP,
    players: {
      [myId]: { nick: myNick, slot: 0, charIndex: myChar, ready: false }
    }
  });
  roomRef.child(`players/${myId}`).onDisconnect().remove();
  roomRef.onDisconnect().remove();
}

async function _joinExistingRoom(roomRef, room) {
  const players = room.players || {};
  const usedSlots = Object.values(players).map(p => p.slot);
  let slot = -1;
  for (let i = 0; i < 4; i++) { if (!usedSlots.includes(i)) { slot = i; break; } }
  if (slot === -1) { showLobbyMsg('ルームが満員です (4/4)', true); throw new Error('full'); }

  isHost = false;
  mySlot = slot;
  const pRef = roomRef.child(`players/${myId}`);
  await pRef.set({ nick: myNick, slot, charIndex: myChar, ready: false });
  pRef.onDisconnect().remove();
}

function fbUpdateMyChar(idx) {
  if (!_db || !roomKeyword) return;
  fbr(`rooms/${roomKeyword}/players/${myId}/charIndex`).set(idx);
}

// ── Room Listeners ──────────────────────────────────────────────

function _setupRoomListeners() {
  document.getElementById('room-keyword-display').textContent = roomKeyword;

  const roomRef = fbr(`rooms/${roomKeyword}`);

  const statusUnsub = roomRef.child('status').on('value', snap => {
    const st = snap.val();
    if (st === 'playing') _startClientGame();
  });

  const playersUnsub = roomRef.child('players').on('value', snap => {
    roomPlayers = snap.val() || {};
    _updateRoomUI();
    _checkHostPromotion();
  });

  fbUnsubs.push(
    () => roomRef.child('status').off('value', statusUnsub),
    () => roomRef.child('players').off('value', playersUnsub)
  );
}

function _checkHostPromotion() {
  const ids = Object.keys(roomPlayers);
  if (!ids.length) return;
  fbr(`rooms/${roomKeyword}/host`).once('value', snap => {
    const hostId = snap.val();
    if (!ids.includes(hostId) && ids[0] === myId) {
      isHost = true;
      fbr(`rooms/${roomKeyword}/host`).set(myId);
    }
    isHost = (snap.val() === myId) || (isHost && ids[0] === myId);
    _renderStartBtn();
  });
}

function _updateRoomUI() {
  const slotData = [null, null, null, null];
  Object.values(roomPlayers).forEach(p => { if (p.slot >= 0 && p.slot < 4) slotData[p.slot] = p; });

  document.getElementById('player-slots').innerHTML = slotData.map((p, i) => {
    const col = SLOT_COLORS[i];
    if (!p) {
      return `<div class="slot"><div style="color:#444;font-size:22px">+</div><div class="slot-sub">空き</div></div>`;
    }
    const ch = CHARS[p.charIndex] || CHARS[0];
    const readyMark = p.ready ? '<span style="color:#44dd66">✓ READY</span>' : '';
    const meTag = (p.slot === mySlot) ? '<span style="color:#aaa"> (YOU)</span>' : '';
    return `<div class="slot" style="border-color:${col}">
      <div style="font-size:26px">${ch.emoji}</div>
      <div class="slot-nick" style="color:${col}">${p.nick}${meTag}</div>
      <div class="slot-sub">${readyMark}</div>
    </div>`;
  }).join('');

  const cnt   = Object.keys(roomPlayers).length;
  const ready = Object.values(roomPlayers).filter(p => p.ready).length;
  document.getElementById('room-status').textContent = `${cnt}/4 人参加中 — READY ${ready}/${cnt}`;
  _renderStartBtn();
}

function _renderStartBtn() {
  const btn = document.getElementById('btn-host-start');
  if (!btn) return;
  const cnt = Object.keys(roomPlayers).length;
  btn.style.display = (isHost && cnt >= 2) ? 'inline-block' : 'none';
}

// ── Ready & Start ───────────────────────────────────────────────

async function toggleReady() {
  if (!_db) return;
  myReady = !myReady;
  await fbr(`rooms/${roomKeyword}/players/${myId}/ready`).set(myReady);
  const btn = document.getElementById('btn-ready');
  btn.textContent = myReady ? 'CANCEL' : 'READY';
  btn.className = myReady ? 'btn secondary' : 'btn green';
  sfx.ready();
}

async function hostStartGame() {
  if (!isHost || !_db) return;
  const cnt = Object.keys(roomPlayers).length;
  if (cnt < 2) return;

  const slots = [null, null, null, null];
  Object.entries(roomPlayers).forEach(([pid, p]) => {
    slots[p.slot] = _makePlayerState(pid, p);
  });

  const initState = {
    frame: 0, status: 'playing', winner: -1,
    countdown: 3,
    slots
  };

  await fbr(`rooms/${roomKeyword}/gameState`).set(initState);
  await fbr(`rooms/${roomKeyword}/status`).set('playing');
}

function _makePlayerState(pid, p) {
  const sp = SPAWNS[p.slot] || [CANVAS_W / 2, 200];
  return {
    id: pid, nick: p.nick, slot: p.slot, charIndex: p.charIndex || 0,
    x: sp[0], y: sp[1], vx: 0, vy: 0,
    damage: 0, stocks: MAX_STOCKS, facing: 1,
    onGround: false, canDJ: false,
    action: 'idle', actionFrame: 0,
    hurtTimer: 0, hasHit: {}, eliminated: false
  };
}

// ── Game Listeners ──────────────────────────────────────────────

function _startClientGame() {
  _cleanupListeners();
  showScreen('game');
  document.getElementById('game-ui').classList.add('on');

  if (isHost) {
    // Host: load initial state then start driving
    fbr(`rooms/${roomKeyword}/gameState`).once('value', snap => {
      gState = snap.val();
      if (!gState) return;
      if (!gState.slots) gState.slots = [null,null,null,null];
      gameRunning = true;
      _startHostDrive();
      _listenRemoteInputs();
      _driveCountdown();
    });
  } else {
    // Client: listen to gameState
    _listenGameState();
    _startInputSync();
    gameRunning = true;
  }

  sfx.start();
}

function _driveCountdown() {
  if (!isHost) return;
  let n = 3;
  const iv = setInterval(() => {
    if (!gState) { clearInterval(iv); return; }
    gState.countdown = n;
    n--;
    if (n < 0) {
      gState.countdown = 0;
      clearInterval(iv);
    }
  }, 1000);
}

function _startHostDrive() {
  if (hostSyncTimer) clearInterval(hostSyncTimer);
  hostSyncTimer = setInterval(() => {
    if (!gState || !gameRunning) return;
    fbr(`rooms/${roomKeyword}/gameState`).set(gState).catch(() => {});
    if (gState.status === 'finished') {
      clearInterval(hostSyncTimer);
      hostSyncTimer = null;
      setTimeout(showResultScreen, 2500);
    }
  }, 50); // 20 Hz
}

function _listenRemoteInputs() {
  const ref = fbr(`rooms/${roomKeyword}/inputs`);
  const fn = ref.on('value', snap => { remoteInputs = snap.val() || {}; });
  fbUnsubs.push(() => ref.off('value', fn));
}

function _listenGameState() {
  const ref = fbr(`rooms/${roomKeyword}/gameState`);
  const fn = ref.on('value', snap => {
    const st = snap.val();
    if (!st) return;
    gState = st;
    if (!gState.slots) gState.slots = [null,null,null,null];
    if (gState.status === 'finished') {
      clearInterval(clientInputTimer);
      clientInputTimer = null;
      setTimeout(showResultScreen, 2500);
    }
  });
  fbUnsubs.push(() => ref.off('value', fn));
}

function _startInputSync() {
  if (clientInputTimer) clearInterval(clientInputTimer);
  clientInputTimer = setInterval(() => {
    if (!gameRunning || !_db) return;
    fbr(`rooms/${roomKeyword}/inputs/${myId}`).set({
      left: keys.left, right: keys.right,
      jump: keys.jump, attack: keys.attack, special: keys.special,
      jumpSeq: inputSeq.jump, attackSeq: inputSeq.attack, specialSeq: inputSeq.special
    }).catch(() => {});
  }, 33); // ~30 Hz
}

// ── Leave / Result ──────────────────────────────────────────────

async function leaveRoom() {
  _cleanupListeners();
  if (_db && roomKeyword) {
    try { await fbr(`rooms/${roomKeyword}/players/${myId}`).remove(); } catch (_) {}
  }
  roomKeyword = ''; mySlot = -1; myReady = false; isHost = false;
  const btn = document.getElementById('btn-ready');
  if (btn) { btn.textContent = 'READY'; btn.className = 'btn green'; }
  showLobby();
}

function showResultScreen() {
  _cleanupListeners();
  gameRunning = false;
  document.getElementById('game-ui').classList.remove('on');
  document.getElementById('damage-ui').innerHTML = '';

  const winner = gState && gState.winner >= 0 ? (gState.slots || [])[gState.winner] : null;
  const wEl = document.getElementById('result-winner');
  const rEl = document.getElementById('result-rank');

  if (winner) {
    wEl.textContent = `🏆 ${winner.nick} WIN!`;
    wEl.style.color = SLOT_COLORS[winner.slot];
  } else {
    wEl.textContent = '引き分け';
    wEl.style.color = '#fff';
  }

  if (gState && gState.slots) {
    const filled = gState.slots.filter(Boolean);
    const sorted = [...filled].sort((a, b) => {
      if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
      return b.stocks - a.stocks || a.damage - b.damage;
    });
    rEl.innerHTML = sorted.map((p, i) => {
      const medal = ['🥇','🥈','🥉','4️⃣'][i] || '';
      return `<span style="color:${SLOT_COLORS[p.slot]}">${medal}${p.nick}</span>`;
    }).join('　');
  }

  // Clean up Firebase room
  if (_db && isHost && roomKeyword) {
    setTimeout(() => fbr(`rooms/${roomKeyword}`).remove().catch(() => {}), 5000);
  }

  showScreen('result');
}

function _cleanupListeners() {
  fbUnsubs.forEach(fn => { try { fn(); } catch (_) {} });
  fbUnsubs = [];
  if (hostSyncTimer)  { clearInterval(hostSyncTimer);  hostSyncTimer  = null; }
  if (clientInputTimer) { clearInterval(clientInputTimer); clientInputTimer = null; }
}
