// ORBIT GARDEN audio: gentle generative space-lullaby music and soft SFX, all WebAudio. No assets.
(function (root) {
  'use strict';
  let ctx = null, master, musicBus, sfxBus, padFilter, verb, started = false, muted = false, nextT = 0, bar = 0, world = 1;
  let stretchOsc = null, stretchGain = null;
  const A = {};
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
  const WORLDS = {
    0: { root: 60, chords: [[0, 4, 7, 11], [-3, 0, 4, 7], [5, 9, 12, 16], [2, 7, 11, 14]], tempo: 7.2 },
    1: { root: 62, chords: [[0, 4, 7, 11], [5, 9, 12, 16], [-3, 0, 4, 7], [2, 5, 9, 12]], tempo: 6.4 },
    2: { root: 65, chords: [[0, 4, 9, 14], [-5, 2, 7, 11], [-3, 4, 7, 12], [5, 9, 12, 16]], tempo: 6.0 },
    3: { root: 57, chords: [[0, 3, 7, 10], [-4, 0, 3, 7], [-2, 2, 5, 9], [-7, 0, 3, 7]], tempo: 6.8 },
  };
  function impulse(sec, decay) {
    const len = ctx.sampleRate * sec, b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return b;
  }
  A.start = function () {
    if (started) { if (ctx && ctx.state === 'suspended') ctx.resume(); return; }
    const AC = root.AudioContext || root.webkitAudioContext; if (!AC) return;
    ctx = new AC(); started = true;
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ctx.destination);
    verb = ctx.createConvolver(); verb.buffer = impulse(4, 2.4);
    const vg = ctx.createGain(); vg.gain.value = 0.55; verb.connect(vg); vg.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.42; musicBus.connect(master); musicBus.connect(verb);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.7; sfxBus.connect(master); sfxBus.connect(verb);
    padFilter = ctx.createBiquadFilter(); padFilter.type = 'lowpass'; padFilter.frequency.value = 1100; padFilter.connect(musicBus);
    nextT = ctx.currentTime + 0.2; setInterval(schedule, 150);
  };
  function pad(f, t, dur, vol) {
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
    o1.type = 'triangle'; o2.type = 'sine'; o1.frequency.value = f; o2.frequency.value = f * 1.004;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.4); g.gain.linearRampToValueAtTime(0, t + dur);
    o1.connect(g); o2.connect(g); g.connect(padFilter); o1.start(t); o2.start(t); o1.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
  }
  function bell(f, t, vol, bus, len) {
    len = len || 2.4;
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), g2 = ctx.createGain();
    o.type = 'sine'; o.frequency.value = f; o2.type = 'sine'; o2.frequency.value = f * 3.01;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    g2.gain.setValueAtTime(0, t); g2.gain.linearRampToValueAtTime(vol * 0.18, t + 0.004); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g); o2.connect(g2); g.connect(bus || musicBus); g2.connect(bus || musicBus);
    o.start(t); o2.start(t); o.stop(t + len + 0.1); o2.stop(t + 0.6);
  }
  function schedule() {
    if (!ctx) return;
    const Wd = WORLDS[world] || WORLDS[1], barLen = Wd.tempo;
    while (nextT < ctx.currentTime + 1.2) {
      const t = nextT, ch = Wd.chords[bar % Wd.chords.length];
      for (const n of ch) pad(hz(Wd.root + n - 12), t, barLen * 1.2, 0.045);
      pad(hz(Wd.root + ch[0] - 24), t, barLen * 1.1, 0.06);
      // Music box: a little 8-step phrase per bar, sparse and seeded so it repeats like a lullaby.
      const s = (bar * 37 + world * 11) % 53, notes = 3 + (s % 3);
      for (let k = 0; k < notes; k++) {
        const slot = (s * (k + 2) + k * 3) % 8, deg = PENTA[(s + k * 2 + (bar % 4)) % 8];
        bell(hz(Wd.root + 12 + deg), t + slot * barLen / 8 + 0.04, 0.03 + (k === 0 ? 0.012 : 0));
      }
      nextT += barLen; bar++;
    }
  }
  A.setWorld = function (w) { world = w; };
  A.setMuted = function (m) { muted = m; if (master) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.05); };
  A.isMuted = () => muted;
  function now() { return ctx ? ctx.currentTime : 0; }
  function ok() { return ctx && !muted; }
  function blip(f0, f1, dur, vol, type) {
    const t = now(), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, vol, f0, f1, q) {
    const t = now(), len = Math.floor(ctx.sampleRate * dur), b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = b;
    const flt = ctx.createBiquadFilter(); flt.type = 'bandpass'; flt.Q.value = q || 1.5; flt.frequency.setValueAtTime(f0, t); flt.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt); flt.connect(g); g.connect(sfxBus); src.start(t);
  }
  const scaleNote = (i) => hz((WORLDS[world] || WORLDS[1]).root + 12 + PENTA[((i % 9) + 9) % 9]);
  A.stretch = function (p) { // p 0..1 while aiming, -1 to stop
    if (!ok()) return;
    if (p < 0) { if (stretchGain) { stretchGain.gain.setTargetAtTime(0, now(), 0.03); const o = stretchOsc; setTimeout(() => o.stop(), 200); stretchOsc = stretchGain = null; } return; }
    if (!stretchOsc) {
      stretchOsc = ctx.createOscillator(); stretchGain = ctx.createGain(); stretchOsc.type = 'sine';
      stretchGain.gain.value = 0; stretchOsc.connect(stretchGain); stretchGain.connect(sfxBus); stretchOsc.start();
    }
    stretchOsc.frequency.setTargetAtTime(180 + p * 260, now(), 0.04); stretchGain.gain.setTargetAtTime(0.025 + p * 0.03, now(), 0.05);
  };
  A.tick = function (p) { if (ok()) blip(500 + p * 900, 480 + p * 880, 0.04, 0.03, 'triangle'); };
  A.launch = function (p) { if (!ok()) return; A.stretch(-1); noise(0.35, 0.12, 400, 2400, 1.2); blip(300 + p * 200, 700 + p * 400, 0.18, 0.08); };
  A.land = function (i) { if (ok()) { bell(scaleNote(i), now(), 0.16, sfxBus, 2.5); blip(140, 70, 0.15, 0.12); } };
  A.green = function (i, seed) {
    if (!ok()) return; const t = now(), base = i % 5;
    const off = seed === 'F' ? 2 : seed === 'V' ? 1 : 0;
    for (let k = 0; k < 4; k++) bell(scaleNote(base + off + k * 2), t + 0.1 + k * 0.09, 0.08, sfxBus, 1.6);
  };
  A.bounce = function () { if (ok()) { blip(260, 620, 0.16, 0.12); blip(520, 1240, 0.1, 0.04, 'triangle'); } };
  A.skip = function (n) { if (!ok()) return; const t = now(); blip(320 + n * 90, 760 + n * 180, 0.12, 0.08, 'triangle'); bell(scaleNote(3 + n * 2), t + 0.03, 0.09, sfxBus, 1.4); if (n >= 2) bell(scaleNote(5 + n * 2), t + 0.1, 0.06, sfxBus, 1.2); };
  A.chorus = function (n) { if (!ok()) return; const t = now(); for (let k = 0; k < n; k++) { bell(scaleNote(k * 2 + 7), t + 0.15 + k * 0.18, 0.06, sfxBus, 1.8); blip(600 + k * 70, 900 + k * 90, 0.08, 0.025, 'sine'); } };
  A.vine = function () { if (!ok()) return; const t = now(); for (let k = 0; k < 6; k++) bell(scaleNote(k + 2) * 0.5, t + 0.25 + k * 0.06, 0.05, sfxBus, 1.0); };
  A.burn = function () { if (ok()) { noise(0.6, 0.18, 1800, 300, 0.8); blip(400, 90, 0.5, 0.05, 'sawtooth'); } };
  A.lost = function () { if (!ok()) return; const t = now(); for (let k = 0; k < 3; k++) bell(scaleNote(6 - k * 2), t + k * 0.12, 0.04, sfxBus, 0.9); };
  A.tap = function () { if (ok()) blip(700, 900, 0.06, 0.05); };
  A.win = function () {
    if (!ok()) return; const t = now(), r = (WORLDS[world] || WORLDS[1]).root;
    [0, 4, 7, 12, 16, 19, 24].forEach((n, k) => bell(hz(r + n), t + 0.2 + k * 0.11, 0.1, sfxBus, 3));
    [0, 7, 16].forEach((n) => pad(hz(r + n - 12), t + 0.2, 3.5, 0.05));
  };
  A.fail = function () { if (!ok()) return; const t = now(), r = (WORLDS[world] || WORLDS[1]).root; [9, 7, 4, 2].forEach((n, k) => bell(hz(r + n), t + k * 0.16, 0.06, sfxBus, 1.5)); };
  root.OGAudio = A;
})(typeof window !== 'undefined' ? window : globalThis);
