// Local player identity
let myId = 'p_' + Math.random().toString(36).slice(2, 10);
let mySlot = -1;
let myNick = '';
let myChar = 0;
let myReady = false;
let isHost = false;

// Room
let roomKeyword = '';
let roomPlayers = {};

// Keyboard / touch input (local only)
let keys = { left:false, right:false, jump:false, attack:false, special:false };
let inputSeq = { jump:0, attack:0, special:0 };

// Host: last known seq per remote player (to detect new presses)
let prevRemoteSeq = {};

// Remote inputs snapshot (host reads from Firebase listeners)
let remoteInputs = {};

// Canonical game state — host maintains and writes to Firebase
// Clients read from Firebase and set this variable
let gState = null;

// Firebase listeners (kept so we can call .off())
let fbUnsubs = [];

// Intervals
let hostSyncTimer = null;
let clientInputTimer = null;

// Rendering
let canvas, ctx;
let lastFrameTime = 0;
let animFrame = null;

// Game status
let gameRunning = false;
let currentScreen = 'title';

// KO flash
let koEffect = null;

// Char select
let charSelectIdx = 0;

// Stars for background (computed once)
const STARS = Array.from({ length: 70 }, (_, i) => ({
  x: (i * 137.508) % CANVAS_W,
  y: (i * 97.334) % CANVAS_H,
  r: i % 5 === 0 ? 1.8 : 0.9,
  a: 0.3 + (i % 4) * 0.15,
}));
