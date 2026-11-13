// POCKET EMPIRE — generative era music + SFX (WebAudio, no assets)
(function (root) {
'use strict';
const A = { ctx: null, on: true, era: 0, nextBar: 0, bar: 0, timer: null, vol: 0.55, seed: 1, tension: 0, finale: false };
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
// Era songs. Each era has its own key (the music climbs as the ages pass), mode, tempo, instruments,
// an A progression and a contrasting B progression. Form per cycle: A A B A + a 4-bar "breath" (36 bars, ~1.5-2 min),
// and the melody is built from a 2-bar motif generated from the island seed, so every island has its own theme.
const ERAS = [
  { bpm: 72, root: 50, scale: [0, 2, 4, 7, 9], A: [[0, 7, 12], [0, 7, 12], [-3, 4, 9], [-5, 2, 7]], B: [[-7, 0, 5], [-3, 4, 9], [-7, 0, 5], [-5, 2, 7]], lead: 'flute', pad: 'drone', perc: 'hand', bass: 'none' },
  { bpm: 80, root: 52, scale: [0, 2, 3, 5, 7, 8, 10], A: [[0, 3, 7], [-4, 0, 3], [-7, -4, 0], [-2, 2, 5]], B: [[-9, -5, -2], [-4, 0, 3], [-2, 2, 5], [-5, -1, 2]], lead: 'lyre', pad: 'soft', perc: 'frame', bass: 'soft' },
  { bpm: 88, root: 55, scale: [0, 2, 3, 5, 7, 9, 10], A: [[0, 3, 7], [5, 9, 12], [-2, 2, 5], [0, 3, 7]], B: [[-4, 0, 3], [-2, 2, 5], [-7, -4, 0], [-5, -2, 2]], lead: 'recorder', pad: 'organ', perc: 'bell', bass: 'walk' },
  { bpm: 98, root: 57, scale: [0, 2, 4, 5, 7, 9, 11], A: [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]], B: [[-7, -3, 0], [-5, -1, 2], [-3, 0, 4], [-5, -1, 2]], lead: 'harpsi', pad: 'strings', perc: 'tamb', bass: 'walk' },
];
const FORM = []; for (const [sec, n] of [['A', 8], ['A', 8], ['B', 8], ['A', 8], ['C', 4]]) for (let k = 0; k < n; k++) FORM.push([sec, k]);
A.FORM_BARS = FORM.length;
// small seeded PRNG so the island's theme is stable (and never touches the game's RNG)
function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const RHYTHMS = [ // 2-bar rhythms on an 8th grid (16 slots): [slot, length in 8ths]
  [[0, 2], [2, 1], [3, 1], [4, 4], [8, 2], [10, 2], [12, 4]],
  [[0, 3], [3, 1], [4, 2], [6, 2], [8, 6], [14, 2]],
  [[0, 1], [1, 1], [2, 2], [4, 2], [6, 2], [8, 3], [11, 1], [12, 4]],
  [[0, 4], [4, 2], [6, 2], [8, 2], [10, 2], [12, 4]],
  [[2, 2], [4, 1], [5, 1], [6, 2], [8, 4], [12, 2], [14, 2]],
];
function makeTheme(seed, era) {
  const r = mulberry((seed >>> 0) * 31 + era * 7919 + 1); const E = ERAS[era]; const n = E.scale.length;
  const rhy = RHYTHMS[Math.floor(r() * RHYTHMS.length)];
  let d = n + Math.floor(r() * 3); const motif = [];
  for (let k = 0; k < rhy.length; k++) { if (k) { const leap = r() < 0.2; d += (r() < 0.5 ? -1 : 1) * (leap ? 2 + Math.floor(r() * 2) : 1); d = Math.max(n - 2, Math.min(n * 2 + 2, d)); } motif.push({ at: rhy[k][0], len: rhy[k][1], d }); }
  const answer = motif.map((m, k) => ({ ...m, d: k === motif.length - 1 ? n : m.d + (k > motif.length / 2 ? -1 : 0) }));
  const counter = []; let cd = n + 2; for (let at = 0; at < 16; at += 4) { cd += Math.floor(r() * 3) - 1; counter.push({ at, len: 4, d: cd }); }
  return { motif, answer, counter, orn: r };
}
function init() {
  if (A.ctx) return; const AC = root.AudioContext || root.webkitAudioContext; if (!AC) return;
  const c = A.ctx = new AC();
  A.master = c.createGain(); A.master.gain.value = A.on ? A.vol : 0;
  const comp = c.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3;
  A.master.connect(comp); comp.connect(c.destination);
  // reverb
  const len = c.sampleRate * 2.6, ir = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
  A.rev = c.createConvolver(); A.rev.buffer = ir; const rg = c.createGain(); rg.gain.value = 0.42; A.rev.connect(rg); rg.connect(A.master);
  A.music = c.createGain(); A.music.gain.value = 0.5; A.music.connect(A.master); A.music.connect(A.rev);
  A.sfx = c.createGain(); A.sfx.gain.value = 0.7; A.sfx.connect(A.master); A.sfx.connect(A.rev);
  A.noise = c.createBuffer(1, c.sampleRate, c.sampleRate); const nd = A.noise.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  A.nextBar = c.currentTime + 0.2; A.timer = setInterval(schedule, 120);
}
function env(g, t, a, peak, d, sus, r, len) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.setTargetAtTime(peak * sus, t + a, d); g.gain.setTargetAtTime(0.0001, t + len, r); }
function voice(type, freq, t, len, vol, dest, opt) {
  const c = A.ctx; opt = opt || {}; const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (opt.vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = 5; lg.gain.value = freq * 0.006; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + len + 1); }
  if (opt.detune) o.detune.value = opt.detune;
  let node = o;
  if (opt.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(opt.lp, t); if (opt.lpEnd) f.frequency.exponentialRampToValueAtTime(opt.lpEnd, t + len); o.connect(f); node = f; }
  node.connect(g); g.connect(dest || A.music);
  env(g, t, opt.a || 0.01, vol, opt.d || 0.2, opt.s === undefined ? 0.6 : opt.s, opt.r || 0.3, len);
  o.start(t); o.stop(t + len + (opt.r || 0.3) * 5);
}
function noiseHit(t, len, vol, fType, freq, dest) {
  const c = A.ctx; const s = c.createBufferSource(); s.buffer = A.noise; const f = c.createBiquadFilter(); f.type = fType; f.frequency.value = freq; const g = c.createGain();
  s.connect(f); f.connect(g); g.connect(dest || A.music); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len); s.start(t); s.stop(t + len + 0.05);
}
function drum(t, f0, f1, len, vol) { const c = A.ctx; const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + len); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len); o.connect(g); g.connect(A.music); o.start(t); o.stop(t + len + 0.05); }
function lead(kind, f, t, len, vol) {
  if (kind === 'flute') { voice('sine', f, t, len, vol, null, { a: 0.08, vib: true, s: 0.8, r: 0.25 }); voice('triangle', f * 2, t, len, vol * 0.12, null, { a: 0.1, s: 0.7 }); noiseHit(t, 0.08, vol * 0.15, 'bandpass', f * 2); }
  else if (kind === 'lyre') { voice('triangle', f, t, 1.2, vol, null, { a: 0.003, d: 0.25, s: 0.15, r: 0.5 }); voice('sine', f * 2, t, 0.6, vol * 0.25, null, { a: 0.003, d: 0.15, s: 0.1 }); }
  else if (kind === 'recorder') { voice('triangle', f, t, len, vol * 0.9, null, { a: 0.05, vib: true, s: 0.75, lp: 2400 }); }
  else if (kind === 'harpsi') { voice('sawtooth', f, t, 0.5, vol * 0.5, null, { a: 0.002, d: 0.12, s: 0.2, lp: 3200, lpEnd: 900, r: 0.3 }); voice('square', f * 2, t, 0.25, vol * 0.12, null, { a: 0.002, d: 0.08, s: 0.1, lp: 2500 }); }
}
function pad(kind, notes, t, len, vol) {
  for (const m of notes) {
    const f = midi(m);
    if (kind === 'drone') { voice('sawtooth', f, t, len, vol * 0.35, null, { a: 1.2, s: 0.9, lp: 500, r: 1.2 }); voice('sine', f / 2, t, len, vol * 0.5, null, { a: 1, s: 0.9, r: 1.2 }); }
    else if (kind === 'soft') voice('triangle', f, t, len, vol * 0.45, null, { a: 0.6, s: 0.8, r: 1 });
    else if (kind === 'organ') { voice('sawtooth', f, t, len, vol * 0.18, null, { a: 0.4, s: 0.9, lp: 1300, detune: -6, r: 0.9 }); voice('sawtooth', f, t, len, vol * 0.18, null, { a: 0.4, s: 0.9, lp: 1300, detune: 6, r: 0.9 }); voice('sine', f / 2, t, len, vol * 0.3, null, { a: 0.4, s: 0.9 }); }
    else if (kind === 'strings') { for (const dt of [-8, 0, 8]) voice('sawtooth', f, t, len, vol * 0.12, null, { a: 0.7, s: 0.85, lp: 1800, detune: dt, vib: true, r: 1 }); }
  }
}
function schedule() {
  const c = A.ctx; if (!c) return;
  while (A.nextBar < c.currentTime + 0.6) { const len = playBar(A.nextBar); A.nextBar += len; A.bar++; }
}
function degMidi(E, d) { const n = E.scale.length; return E.root + 12 + E.scale[((d % n) + n) % n] + 12 * Math.floor(d / n); }
function snap(E, m, chord) { let best = m, bd = 99; for (const x of chord) for (let o = -24; o <= 24; o += 12) { const cm = E.root + 12 + x + o; if (Math.abs(cm - m) < bd) { bd = Math.abs(cm - m); best = cm; } } return best; }
// Plays one bar at time t and returns its length. Pure function of (era, bar, seed, tension, finale) so it can be analysed offline.
function playBar(t) {
  if (A.pendingEra !== undefined && FORM[A.bar % FORM.length][1] % 4 === 0) { A.era = A.pendingEra; A.pendingEra = undefined; A.bar = 0; } // change era on a phrase boundary
  const E = ERAS[A.era], beat = 60 / E.bpm; const fi = A.bar % FORM.length, cycle = Math.floor(A.bar / FORM.length);
  const [sec, k] = FORM[fi]; const prog = sec === 'B' ? E.B : E.A; const ch = prog[k % 4];
  if (!A.theme || A.theme.era !== A.era || A.theme.seed !== A.seed) A.theme = Object.assign(makeTheme(A.seed || 1, A.era), { era: A.era, seed: A.seed });
  const T = A.theme; const intensity = A.tension || 0; const firstA = cycle === 0 && fi < 8;
  pad(E.pad, ch.map((x) => E.root + x - 12), t, beat * 4 - 0.05, sec === 'C' ? 0.16 : 0.22);
  // bass
  if (E.bass !== 'none' && sec !== 'C') { const r0 = E.root + ch[0] - 24; voice('triangle', midi(r0), t, beat * 1.6, 0.16, null, { a: 0.01, d: 0.3, s: 0.5, lp: 600 }); if (E.bass === 'walk') { voice('triangle', midi(r0 + 7), t + beat * 2, beat * 0.9, 0.12, null, { a: 0.01, d: 0.2, s: 0.4, lp: 600 }); voice('triangle', midi(r0 + (k % 2 ? 5 : 4)), t + beat * 3, beat * 0.9, 0.1, null, { a: 0.01, d: 0.2, s: 0.4, lp: 600 }); } else voice('triangle', midi(r0 + 7), t + beat * 2, beat * 1.6, 0.11, null, { a: 0.01, d: 0.3, s: 0.5, lp: 600 }); }
  // percussion: enters after the first phrase, sits out in the breath
  if (!(firstA && k < 4) && sec !== 'C') for (let b = 0; b < 4; b++) {
    const bt = t + b * beat;
    if (E.perc === 'hand') { if (b === 0 || b === 2) drum(bt, 120, 55, 0.3, 0.32); if (b === 3) drum(bt + beat / 2, 220, 120, 0.12, 0.14); }
    if (E.perc === 'frame') { drum(bt, b === 0 ? 110 : 160, 60, 0.25, b === 0 ? 0.3 : 0.12); if (b % 2) noiseHit(bt + beat / 2, 0.05, 0.05, 'highpass', 5000); }
    if (E.perc === 'bell') { if (b === 0 && k % 2 === 0) { voice('sine', midi(E.root + 24), bt, 2, 0.08, null, { a: 0.002, d: 0.6, s: 0.2, r: 1 }); voice('sine', midi(E.root + 24) * 2.76, bt, 1, 0.03, null, { a: 0.002, d: 0.3, s: 0.1 }); } if (b === 0 || b === 2) drum(bt, 90, 50, 0.3, 0.2); }
    if (E.perc === 'tamb') { noiseHit(bt, 0.06, 0.06, 'highpass', 6000); noiseHit(bt + beat / 2, 0.04, 0.035, 'highpass', 7000); if (b === 0 || b === 2) drum(bt, 100, 50, 0.25, 0.22); }
    if (intensity > 0.5 && b % 2 === 1) drum(bt, 70, 40, 0.35, 0.25 * intensity);
    if (A.finale && b % 2 === 0) noiseHit(bt + beat * 0.75, 0.05, 0.05, 'highpass', 8000);
  }
  if (intensity > 0.5 && sec !== 'C') for (let e = 0; e < 8; e++) voice('sawtooth', midi(E.root + ch[0] - 12 + (e % 2 ? 7 : 0)), t + e * beat / 2, beat * 0.4, 0.045 * intensity, null, { a: 0.005, d: 0.08, s: 0.3, lp: 900 }); // war ostinato
  // breath: a few bell tones, no melody
  if (sec === 'C') { if (k % 2 === 0) voice('sine', midi(snap(E, degMidi(E, E.scale.length + 4), ch) + 12), t + beat, beat * 3, 0.05, null, { a: 0.002, d: 0.8, s: 0.2, r: 1.2 }); return beat * 4; }
  // melody: motif (bars 1-2), answer (3-4), motif again a step up (5-6), answer resolving (7-8); B uses the long-note counter line
  const half = k % 2; const pair = Math.floor(k / 2); let line, shift = 0;
  if (sec === 'B') { line = T.counter; shift = pair % 2 ? 1 : 0; }
  else { line = pair % 2 === 0 ? T.motif : T.answer; shift = pair === 2 ? 1 : 0; if (cycle % 2 === 1 && pair === 2) shift = -2; }
  const steps = E.lead === 'lyre' || E.lead === 'harpsi'; const e8 = beat / 2;
  for (const n of line) {
    if (n.at < half * 8 || n.at >= half * 8 + 8) continue;
    let m = degMidi(E, n.d + shift); if ((n.at % 4) === 0) m = snap(E, m, ch);
    const tt = t + (n.at - half * 8) * e8; const dur = n.len * e8;
    lead(E.lead, midi(m), tt, steps ? Math.min(dur, e8 * 3) * 0.95 : dur * 0.95, sec === 'B' ? 0.11 : 0.14);
    // ornament: in later cycles, a grace note or harmony third
    if (cycle >= 1 && T.orn() < 0.25) lead(E.lead, midi(snap(E, m - 3, ch)), tt, dur * 0.8, 0.06);
  }
  if (A.finale && sec !== 'C') voice('sine', midi(snap(E, E.root + 36, ch)), t, beat * 4, 0.03, null, { a: 0.4, s: 0.8, vib: true, r: 0.8 }); // last turns: a high shimmer
  return beat * 4;
}
const SFX = {
  click: () => voice('sine', 880, A.ctx.currentTime, 0.05, 0.08, A.sfx, { a: 0.002, d: 0.03, s: 0.1 }),
  move: () => { const t = A.ctx.currentTime; noiseHit(t, 0.12, 0.12, 'lowpass', 600, A.sfx); drum(t, 140, 80, 0.1, 0.12); },
  melee: () => { const t = A.ctx.currentTime; noiseHit(t, 0.25, 0.35, 'bandpass', 2500, A.sfx); voice('square', 320, t, 0.08, 0.06, A.sfx, { a: 0.001, d: 0.05, s: 0.1, lp: 3000 }); drum(t, 160, 50, 0.25, 0.3); },
  ranged: () => { const t = A.ctx.currentTime; const s = A.ctx.createBufferSource(); s.buffer = A.noise; const f = A.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(800, t); f.frequency.exponentialRampToValueAtTime(3500, t + 0.35); const g = A.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.18, t + 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45); s.connect(f); f.connect(g); g.connect(A.sfx); s.start(t); s.stop(t + 0.5); setTimeout(() => A.ctx && drum(A.ctx.currentTime, 200, 60, 0.15, 0.2), 380); },
  found: () => { const t = A.ctx.currentTime; [0, 4, 7, 12].forEach((x, k) => voice('triangle', midi(62 + x), t + k * 0.08, 1.4, 0.12, A.sfx, { a: 0.01, d: 0.4, s: 0.3, r: 0.6 })); },
  tech: () => { const t = A.ctx.currentTime; [0, 7, 12, 16, 19].forEach((x, k) => voice('sine', midi(74 + x), t + k * 0.06, 0.8, 0.08, A.sfx, { a: 0.002, d: 0.3, s: 0.2 })); },
  war: () => { const t = A.ctx.currentTime; voice('sawtooth', midi(38), t, 1.2, 0.22, A.sfx, { a: 0.15, s: 0.8, lp: 700, r: 0.5 }); voice('sawtooth', midi(45), t + 0.05, 1.1, 0.16, A.sfx, { a: 0.15, s: 0.8, lp: 700, r: 0.5 }); drum(t, 80, 40, 0.8, 0.4); },
  wonder: () => { const t = A.ctx.currentTime; [[0, 4, 7], [5, 9, 12], [7, 11, 14], [12, 16, 19]].forEach((chd, k) => chd.forEach((x) => voice('sawtooth', midi(60 + x), t + k * 0.22, 0.5, 0.06, A.sfx, { a: 0.02, s: 0.6, lp: 2500 }))); },
  turn: () => { const t = A.ctx.currentTime; voice('sine', midi(50), t, 1.6, 0.14, A.sfx, { a: 0.003, d: 0.8, s: 0.3, r: 0.8 }); voice('sine', midi(50) * 2.4, t, 0.8, 0.04, A.sfx, { a: 0.003, d: 0.3, s: 0.1 }); },
  bad: () => { const t = A.ctx.currentTime; voice('triangle', midi(57), t, 0.3, 0.12, A.sfx, { a: 0.01 }); voice('triangle', midi(56), t + 0.15, 0.5, 0.12, A.sfx, { a: 0.01 }); },
  victory: () => { const t = A.ctx.currentTime; [0, 4, 7, 12, 16, 19, 24].forEach((x, k) => voice('triangle', midi(60 + x), t + k * 0.12, 2, 0.1, A.sfx, { a: 0.01, d: 0.6, s: 0.4, r: 1 })); },
};
A.init = init;
A.play = (name) => { if (!A.ctx || !A.on) return; try { SFX[name] && SFX[name](); } catch (e) { /* ignore */ } };
A.setEra = (e) => { e = Math.max(0, Math.min(3, e)); if (!A.ctx) { A.era = e; A.bar = 0; } else if (e !== A.era) A.pendingEra = e; };
A.setSeed = (s) => { if (A.seed !== s) { A.seed = s; A.bar = 0; A.theme = null; } };
A._playBar = playBar; A._ERAS = ERAS;
A.toggle = () => { A.on = !A.on; if (A.master) A.master.gain.setTargetAtTime(A.on ? A.vol : 0, A.ctx.currentTime, 0.1); return A.on; };
root.PE_AUDIO = A;
})(typeof globalThis !== 'undefined' ? globalThis : this);
