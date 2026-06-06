const AC = new (window.AudioContext || window.webkitAudioContext)();

function beep(freq, dur, type, vol) {
  if (AC.state === 'suspended') AC.resume();
  const o = AC.createOscillator();
  const g = AC.createGain();
  o.connect(g);
  g.connect(AC.destination);
  o.type = type || 'square';
  o.frequency.setValueAtTime(freq, AC.currentTime);
  g.gain.setValueAtTime(vol || 0.15, AC.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + dur);
  o.start(AC.currentTime);
  o.stop(AC.currentTime + dur);
}

const sfx = {
  jump:    () => beep(320, 0.12, 'sine', 0.18),
  attack:  () => beep(200, 0.07, 'square', 0.12),
  hit:     () => beep(130, 0.14, 'sawtooth', 0.22),
  bigHit:  () => { beep(90, 0.22, 'sawtooth', 0.28); beep(180, 0.1, 'square', 0.14); },
  ko:      () => { beep(440, 0.08, 'sine', 0.28); beep(330, 0.12, 'sine', 0.22); beep(220, 0.25, 'sine', 0.18); },
  special: () => beep(520, 0.06, 'sine', 0.16),
  ready:   () => beep(660, 0.1, 'sine', 0.2),
  start:   () => {
    beep(392, 0.1, 'sine', 0.2);
    setTimeout(() => beep(523, 0.1, 'sine', 0.2), 130);
    setTimeout(() => beep(659, 0.22, 'sine', 0.25), 260);
  },
  select:  () => beep(440, 0.06, 'sine', 0.12),
};
