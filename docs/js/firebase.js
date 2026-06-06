// Firebase Realtime Database integration

let _db = null;

function fbr(path) { return _db.ref(path); }

function initFirebase() {
  if (typeof firebase === 'undefined') {
    console.warn('[FB] SDK missing');
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

  const statusFn = roomRef.child('status').on('value', snap => {
    if (snap.val() === 'playing') _startClientGame();
  });
  const playersFn = roomRef.child('players').on('value', snap => {
    roomPlayers = snap.val() || {};
    _updateRoomUI();
    _checkHostPromotion();
  });

  fbUnsubs.push(
    () => roomRef.child('status').off('value', statusFn),
    () => roomRef.child('players').off('value', playersFn)
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
    countdown: 3, slots
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
    fbr(`rooms/${roomKeyword}/gameState`).once('value', snap => {
      gState = snap.val();
      if (!gState) return;
      if (!gState.slots) gState.slots = [null, null, null, null];
      gameRunning = true;
      _startHostDrive();
      _listenRemoteInputs();
      _driveCountdown();
    });
  } else {
    _listenGameState();
    _startInputSync();
    gameRunning = true;
  }

  sfx.start();
}

function _driveCountdown() {
  let n = 3;
  const iv = setInterval(() => {
    if (!gState) { clearInterval(iv); return; }
    gState.countdown = n;
    n--;
    if (n < 0) { gState.countdown = 0; clearInterval(iv); }
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
      setTimeout(() => showResultScreen(), 2500);
    }
  }, 50);
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
    if (!gState.slots) gState.slots = [null, null, null, null];
    if (gState.status === 'finished') {
      clearInterval(clientInputTimer);
      clientInputTimer = null;
      setTimeout(() => showResultScreen(), 2500);
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
  }, 33);
}

// ── Leave / Multiplayer Result ──────────────────────────────────

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

async function showResultScreen() {
  _cleanupListeners();
  gameRunning = false;
  document.getElementById('game-ui').classList.remove('on');
  document.getElementById('damage-ui').innerHTML = '';

  const winner = gState && gState.winner >= 0 ? (gState.slots || [])[gState.winner] : null;
  const wEl  = document.getElementById('result-winner');
  const rEl  = document.getElementById('result-rank');
  const subEl = document.getElementById('result-sub');

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

  // Save win and show total
  subEl.textContent = '';
  if (winner && _db && isHost) {
    try {
      const totalWins = await saveWin(winner.nick);
      subEl.textContent = `通算 ${totalWins} 勝!`;
      subEl.style.color = SLOT_COLORS[winner.slot] || '#fff';
    } catch (_) {}
  }

  if (_db && isHost && roomKeyword) {
    setTimeout(() => fbr(`rooms/${roomKeyword}`).remove().catch(() => {}), 5000);
  }

  showScreen('result');
}

// ── Solo Result ─────────────────────────────────────────────────

function showSoloResultScreen() {
  gameRunning = false;
  document.getElementById('game-ui').classList.remove('on');
  document.getElementById('damage-ui').innerHTML = '';

  const wEl  = document.getElementById('result-winner');
  const rEl  = document.getElementById('result-rank');
  const subEl = document.getElementById('result-sub');

  wEl.textContent = soloScore.toLocaleString() + ' PT';
  wEl.style.color = '#ffcc44';
  rEl.innerHTML = `Wave ${soloWave} 到達 　KO × ${soloKOs}`;

  const secs = Math.floor(soloFrames / 60);
  const mins = Math.floor(secs / 60);
  const ss   = secs % 60;
  subEl.textContent = `生存時間 ${mins}:${ss.toString().padStart(2, '0')}`;
  subEl.style.color = '#aaa';

  if (_db && myNick) {
    saveSoloScore(myNick, soloScore).then(isNew => {
      if (isNew) subEl.innerHTML += ' 　<span style="color:#44dd66">NEW RECORD!</span>';
    });
  }

  showScreen('result');
}

// ── Leaderboard / Wins ──────────────────────────────────────────

async function saveSoloScore(nick, score) {
  if (!_db) return false;
  const key = nick.replace(/[.#$\[\]/]/g, '_');
  const ref = fbr('leaderboard/solo/' + key);
  const snap = await ref.once('value');
  const current = snap.val();
  if (!current || current.score < score) {
    await ref.set({ nick, score, ts: firebase.database.ServerValue.TIMESTAMP });
    return true;
  }
  return false;
}

async function loadSoloLeaderboard(cb) {
  if (!_db) { cb([]); return; }
  try {
    const snap = await fbr('leaderboard/solo')
      .orderByChild('score').limitToLast(LB_SIZE).once('value');
    const data = snap.val() || {};
    const list = Object.values(data).sort((a, b) => b.score - a.score);
    soloLeaderboard = list;
    cb(list);
  } catch (e) {
    cb([]);
  }
}

async function saveWin(nick) {
  if (!_db || !nick) return 1;
  const key = nick.replace(/[.#$\[\]/]/g, '_');
  const ref = fbr('leaderboard/wins/' + key);
  const snap = await ref.once('value');
  const current = snap.val();
  const wins = (current ? (current.wins || 0) : 0) + 1;
  await ref.set({ nick, wins, ts: firebase.database.ServerValue.TIMESTAMP });
  return wins;
}

// ── Solo Screen ─────────────────────────────────────────────────

function showSoloScreen() {
  showScreen('solo');
  buildCharSelect('solo-char-row');
  document.getElementById('solo-nick').value = myNick || '';
  document.getElementById('solo-msg').textContent = '';
  const lbEl = document.getElementById('solo-leaderboard');
  lbEl.innerHTML = '<div class="ok-msg">読み込み中...</div>';
  loadSoloLeaderboard(list => {
    if (!list.length) {
      lbEl.innerHTML = '<div class="ok-msg" style="padding:8px">まだ記録なし</div>';
      return;
    }
    lbEl.innerHTML = list.map((s, i) => {
      const medals = ['🥇','🥈','🥉'];
      const rank = medals[i] || (i + 1) + '.';
      return `<div class="lb-row">
        <span class="lb-rank">${rank}</span>
        <span class="lb-nick">${s.nick}</span>
        <span class="lb-score">${s.score.toLocaleString()}</span>
      </div>`;
    }).join('');
  });
}

function beginSoloGame() {
  const nick = document.getElementById('solo-nick').value.trim();
  if (!nick) {
    document.getElementById('solo-msg').textContent = 'ニックネームを入力してください';
    return;
  }
  myNick = nick;
  myChar = charSelectIdx;
  startSoloGame();
}

// ── Cleanup ─────────────────────────────────────────────────────

function _cleanupListeners() {
  fbUnsubs.forEach(fn => { try { fn(); } catch (_) {} });
  fbUnsubs = [];
  if (hostSyncTimer)    { clearInterval(hostSyncTimer);    hostSyncTimer    = null; }
  if (clientInputTimer) { clearInterval(clientInputTimer); clientInputTimer = null; }
}
