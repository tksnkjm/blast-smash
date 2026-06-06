const VERSION = '1.2.0';

const CANVAS_W = 800;
const CANVAS_H = 500;

const GRAVITY = 0.55;
const MAX_FALL_SPD = 16;
const FRICTION_GND = 0.76;
const FRICTION_AIR = 0.965;

const PW = 30;
const PH = 44;
const MOVE_SPD = 5.5;
const JUMP_F = -13.5;
const DJ_F = -11.0;

const MAX_STOCKS = 3;
const ATK_STARTUP = 5;
const ATK_ACTIVE = 8;
const ATK_RECOVERY = 12;
const SPEC_STARTUP = 8;
const SPEC_ACTIVE = 12;
const SPEC_RECOVERY = 20;
const HITSTUN_BASE = 18;
const RESPAWN_INV = 90;

const BLAST_L = -220;
const BLAST_R = CANVAS_W + 220;
const BLAST_T = -180;
const BLAST_B = CANVAS_H + 80;

const CHARS = [
  { name:'FIGHTER',   emoji:'⚔️',  color:'#ff4466', weight:1.0,  spd:1.0,  jump:1.0  },
  { name:'SPEEDER',   emoji:'💨',  color:'#44aaff', weight:0.78, spd:1.38, jump:1.18 },
  { name:'HEAVY',     emoji:'🛡️', color:'#44dd66', weight:1.45, spd:0.72, jump:0.80 },
  { name:'TRICKSTER', emoji:'⭐',  color:'#ffcc44', weight:0.88, spd:1.15, jump:1.12 }
];

const SLOT_COLORS = ['#ff4466', '#44aaff', '#44dd66', '#ffcc44'];

const WAVE_INTERVAL  = 1200; // frames per wave (~20s)
const BOT_RESPAWN    = 150;  // frames before bot respawns after KO
const SOLO_KO_SCORE  = 150;  // score per bot KO
const SOLO_TIME_RATE = 8;    // score per second survived
const LB_SIZE        = 10;   // leaderboard entries to display

// [x, y, w, h, isMain]
const STAGES = [
  [80,  390, 640, 18, true],
  [160, 280, 160, 14, false],
  [480, 280, 160, 14, false],
  [320, 185, 160, 14, false],
];

const SPAWNS = [[200,260],[600,260],[300,160],[500,160]];

const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyAhv0QN06Mt9i1vAK3D4istWkD24AYNO_M',
  authDomain:        'tksnkjm-games-fc680.firebaseapp.com',
  databaseURL:       'https://tksnkjm-games-fc680-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId:         'tksnkjm-games-fc680',
  storageBucket:     'tksnkjm-games-fc680.firebasestorage.app',
  messagingSenderId: '881316603081',
  appId:             '1:881316603081:web:628385cd6499124a925918'
};
