// BRIGHTFIELD audio: generative WebAudio score that grows with the town, plus SFX. No samples.
(function (root) {
  'use strict';
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  // Chords as MIDI (root-position-ish voicings around C3-C5).
  const PROG = {
    smog: [[45, 52, 57, 60, 64], [41, 48, 53, 57, 60], [43, 50, 55, 59, 62], [40, 47, 52, 55, 59]], // Am F G Em: wistful
    town: [[48, 55, 60, 64, 71], [45, 52, 57, 60, 67], [41, 48, 53, 57, 64], [43, 50, 55, 62, 65]], // Cmaj7 Am7 Fmaj7 G7sus
    leaf: [[41, 48, 57, 60, 64], [48, 55, 60, 64, 67], [43, 50, 55, 59, 62], [45, 52, 57, 60, 64], [41, 48, 53, 57, 60], [48, 55, 59, 64, 67], [38, 50, 53, 57, 60], [43, 50, 55, 59, 65]],
    star: [[48, 55, 62, 64, 71], [43, 50, 57, 59, 66], [45, 52, 59, 60, 67], [41, 48, 55, 57, 64], [48, 55, 62, 64, 71], [43, 50, 57, 59, 66], [41, 48, 55, 57, 64], [43, 50, 55, 62, 65]],
  };
  // Finale melodies (8 bars x 8 eighths; null = rest, numbers = MIDI).
  const MEL = {
    leaf: [72, null, 69, 72, 74, null, 76, null, 72, null, null, 67, 69, null, 72, null, 74, null, 71, 74, 76, null, 79, null, 76, null, 74, null, 72, null, null, null,
      77, null, 76, 74, 72, null, 69, null, 76, null, 74, 72, 71, null, 67, null, 74, null, 72, 69, 72, null, 74, null, 72, null, null, null, null, null, null, null],
    star: [76, 79, 83, null, 81, 79, 76, null, 74, 78, 81, null, 79, 78, 74, null, 76, 79, 84, null, 83, 81, 79, null, 77, 81, 84, null, 83, null, 79, null,
      76, 79, 83, null, 86, null, 83, null, 81, 79, 78, null, 74, null, 78, null, 77, 79, 81, null, 84, null, 83, null, 79, null, null, null, null, null, null, null],
  };
  const PENTA = [0, 2, 4, 7, 9];
  const A = {
    ctx: null, on: true, master: null, music: null, sfx: null, rev: null, dly: null,
    state: { progress: 0, clean: 0, finale: null, critters: 0 },
    step: 0, nextT: 0, timer: null, mood: 'smog', seed: 1, duck: 1, duckUntil: 0,
  };
  function rand() { A.seed = (A.seed * 1103515245 + 12345) & 0x7fffffff; return A.seed / 0x7fffffff; }
  function init() {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    const ctx = (A.ctx = new C());
    A.master = ctx.createGain(); A.master.gain.value = A.on ? 0.9 : 0;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3;
    A.master.connect(comp); comp.connect(ctx.destination);
    A.music = ctx.createGain(); A.music.gain.value = 0.8; A.music.connect(A.master);
    A.sfx = ctx.createGain(); A.sfx.gain.value = 0.7; A.sfx.connect(A.master);
    // Reverb: generated stereo noise impulse, 3 s.
    A.rev = ctx.createConvolver();
    const len = ctx.sampleRate * 3, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    A.rev.buffer = ir; A.revIn = ctx.createGain(); A.revIn.gain.value = 0.5; A.revIn.connect(A.rev); A.rev.connect(A.master);
    A.dly = ctx.createDelay(1); A.dly.delayTime.value = 60 / 80 * 0.75; const fb = ctx.createGain(); fb.gain.value = 0.32; const dlp = ctx.createBiquadFilter(); dlp.frequency.value = 2600;
    A.dlyIn = ctx.createGain(); A.dlyIn.gain.value = 0.3; A.dlyIn.connect(A.dly); A.dly.connect(dlp); dlp.connect(fb); fb.connect(A.dly); dlp.connect(A.master); dlp.connect(A.revIn);
    // Pad filter (opens as the air clears).
    A.padF = ctx.createBiquadFilter(); A.padF.type = 'lowpass'; A.padF.frequency.value = 600; A.padF.Q.value = 0.7; A.padG = ctx.createGain(); A.padG.gain.value = 0.16; A.padF.connect(A.padG); A.padG.connect(A.music); A.padG.connect(A.revIn);
    // Smog hum: filtered brown noise.
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), nd = nb.getChannelData(0); let last = 0;
    for (let i = 0; i < nd.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; nd[i] = last * 3.5; }
    A.noiseBuf = nb;
    const hum = ctx.createBufferSource(); hum.buffer = nb; hum.loop = true; const hf = ctx.createBiquadFilter(); hf.frequency.value = 280; A.humG = ctx.createGain(); A.humG.gain.value = 0; hum.connect(hf); hf.connect(A.humG); A.humG.connect(A.music); hum.start();
    // White noise for SFX.
    const wb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), wd = wb.getChannelData(0); for (let i = 0; i < wd.length; i++) wd[i] = Math.random() * 2 - 1; A.white = wb;
    A.nextT = ctx.currentTime + 0.2; A.step = 0;
    A.timer = setInterval(schedule, 50);
  }
  function setMute(m) { A.on = !m; if (A.master) A.master.gain.setTargetAtTime(A.on ? 0.9 : 0, A.ctx.currentTime, 0.05); }
  function update(st) { Object.assign(A.state, st); }

  // ---- voices ----
  function env(g, t, a, peak, d, sus, r, len) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.setTargetAtTime(peak * sus, t + a, d); g.gain.setTargetAtTime(0.0001, t + len, r); }
  function padNote(m, t, len, vol) {
    const ctx = A.ctx, g = ctx.createGain(); env(g, t, 1.2, vol, 1.5, 0.8, 0.9, len); g.connect(A.padF);
    for (const det of [-7, 6]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det; o.connect(g); o.start(t); o.stop(t + len + 4); }
  }
  function pluck(m, t, vol, bright = 1, dest) {
    const ctx = A.ctx, o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'triangle'; o.frequency.value = mtof(m); o2.type = 'sine'; o2.frequency.value = mtof(m) * 4; const g2 = ctx.createGain(); g2.gain.setValueAtTime(vol * 0.25 * bright, t); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    f.type = 'lowpass'; f.frequency.value = 1400 + 2600 * bright;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(f); o2.connect(g2); g2.connect(g); f.connect(g); g.connect(dest || A.music); g.connect(A.revIn); g.connect(A.dlyIn);
    o.start(t); o2.start(t); o.stop(t + 1); o2.stop(t + 1);
  }
  function bell(m, t, vol, dest) {
    const ctx = A.ctx, car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
    car.frequency.value = mtof(m); mod.frequency.value = mtof(m) * 3.5; mg.gain.setValueAtTime(mtof(m) * 1.6, t); mg.gain.exponentialRampToValueAtTime(1, t + 1.6);
    mod.connect(mg); mg.connect(car.frequency); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    car.connect(g); g.connect(dest || A.music); g.connect(A.revIn); g.connect(A.dlyIn); car.start(t); mod.start(t); car.stop(t + 2.5); mod.stop(t + 2.5);
  }
  function bass(m, t, len, vol) {
    const ctx = A.ctx, o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter(); o.type = 'triangle'; o.frequency.value = mtof(m); f.frequency.value = 500;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.02); g.gain.setTargetAtTime(0.0001, t + len * 0.7, 0.12);
    o.connect(f); f.connect(g); g.connect(A.music); o.start(t); o.stop(t + len + 0.6);
  }
  function marimba(m, t, vol) {
    const ctx = A.ctx, o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), g2 = ctx.createGain();
    o.type = 'sine'; o.frequency.value = mtof(m); o2.type = 'sine'; o2.frequency.value = mtof(m) * 3.98;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    g2.gain.setValueAtTime(vol * 0.5, t); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(A.music); g.connect(A.revIn); o.start(t); o2.start(t); o.stop(t + 0.8); o2.stop(t + 0.8);
  }
  function noise(t, len, vol, freq, q = 1, type = 'bandpass', dest) {
    const ctx = A.ctx, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = A.white; f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    s.connect(f); f.connect(g); g.connect(dest || A.sfx); s.start(t); s.stop(t + len + 0.05); return f;
  }
  function tone(type, f0, f1, t, len, vol, dest) {
    const ctx = A.ctx, o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + len);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g); g.connect(dest || A.sfx); o.start(t); o.stop(t + len + 0.05); return o;
  }

  // ---- music: pure planner (testable in node) + scheduler ----
  // Moods follow the town: smog (wistful A minor) -> dawn -> town -> bloom (lifts to D major). Each mood has
  // 2-3 eight-bar sections played in a form (A A B A C...), and each phrase picks its own arp pattern and a
  // short bell motif, so the harmony cycle is 32-40 bars and the texture almost never repeats exactly.
  const MOODS = {
    smog: { key: 0, bpm: 72, form: 'AABA', sec: {
      A: [[45, 52, 57, 60, 64], [41, 48, 53, 57, 60], [43, 50, 55, 59, 62], [40, 47, 52, 55, 59]], // Am F G Em
      B: [[38, 50, 53, 57, 60], [45, 52, 57, 60, 64], [41, 48, 53, 57, 60], [40, 47, 52, 56, 59]] } }, // Dm Am F E
    dawn: { key: 0, bpm: 78, form: 'AABAC', sec: {
      A: [[48, 55, 60, 64, 67], [47, 55, 59, 62, 67], [45, 52, 57, 60, 64], [41, 48, 53, 57, 60]], // C G/B Am F
      B: [[41, 48, 53, 57, 64], [43, 50, 55, 59, 62], [40, 47, 52, 55, 59], [45, 52, 57, 60, 64]], // F G Em Am
      C: [[38, 50, 53, 57, 60], [43, 50, 55, 59, 65], [48, 55, 60, 64, 67], [48, 55, 60, 64, 67]] } }, // Dm G7 C C
    town: { key: 0, bpm: 82, form: 'AABAC', sec: {
      A: [[48, 55, 60, 64, 71], [45, 52, 57, 60, 67], [41, 48, 53, 57, 64], [43, 50, 55, 62, 65]], // Cmaj7 Am7 Fmaj7 G7sus
      B: [[41, 48, 57, 60, 64], [43, 50, 55, 59, 62], [40, 47, 55, 59, 62], [45, 52, 55, 60, 64]], // Fmaj7 G Em7 Am7
      C: [[38, 50, 57, 60, 65], [43, 50, 53, 59, 65], [48, 55, 59, 64, 67], [41, 53, 57, 60, 64]] } }, // Dm7 G7 Cmaj7 F
    bloom: { key: 2, bpm: 86, form: 'AABAC', sec: {
      A: [[50, 57, 61, 66, 69], [47, 54, 57, 62, 66], [43, 50, 54, 59, 62], [45, 52, 57, 61, 67]], // Dmaj7 Bm7 Gmaj7 A7sus
      B: [[43, 50, 55, 59, 66], [45, 52, 57, 61, 64], [42, 49, 54, 57, 61], [47, 54, 59, 62, 66]], // Gmaj7 A F#m Bm
      C: [[40, 52, 55, 59, 62], [45, 52, 55, 61, 64], [50, 57, 62, 66, 69], [50, 57, 62, 66, 69]] } }, // Em7 A7 D D
  };
  const ARPS = [[1, 2, 3, 4, 3, 2, 3, 4], [1, 3, 2, 4, 1, 3, 2, 4], [4, 3, 2, 1, 2, 3, 4, 3], [1, 2, 4, 2, 3, 2, 4, 2]];
  function moodOf(st) { return st.progress >= 0.75 ? 'bloom' : st.progress >= 0.45 ? 'town' : (st.clean > 0.35 || st.progress >= 0.2) ? 'dawn' : 'smog'; }
  function chordAt(st, step) {
    if (st.finale) { const pr = PROG[st.finale]; return pr[Math.floor(step / 8) % pr.length]; }
    const M = MOODS[moodOf(st)], bar = Math.floor(step / 8), phrase = Math.floor(bar / 8);
    return M.sec[M.form[phrase % M.form.length]][Math.floor((bar % 8) / 2)];
  }
  function keyOf(st) { return st.finale ? 0 : MOODS[moodOf(st)].key; }
  function bpmOf(st) { return st.finale === 'star' ? 100 : st.finale === 'leaf' ? 88 : MOODS[moodOf(st)].bpm - (st.eve || 0) * 6; }
  // Events for one eighth-note step. r() is a seeded random. Returns [{v, m, vol, len, off}]
  function plan(st, s, r) {
    const ev = [], ch = chordAt(st, s), i8 = s % 8, bar = Math.floor(s / 8), phrase = Math.floor(bar / 8), e8 = 60 / bpmOf(st) / 2;
    const P = (v, m, vol, len, off) => ev.push({ v, m, vol, len: len || 0, off: off || 0 });
    if (st.finale) {
      const part = phrase % 3; // 0 full, 1 airy (no drums, melody an octave up), 2 breakdown (pads + sparse melody)
      if (i8 === 0) for (const m of ch.slice(1)) P('pad', m + 12, part === 2 ? 0.09 : 0.075, e8 * 8 - 0.2);
      if (part !== 2 && (i8 === 0 || i8 === 5)) P('bass', ch[0], 0.2, e8 * (i8 ? 3 : 5));
      const mel = MEL[st.finale][s % MEL[st.finale].length];
      if (st.finale === 'leaf') {
        const arp = [ch[1], ch[2], ch[3], ch[4], ch[3] + 12, ch[4], ch[2] + 12, ch[3]];
        if (part !== 2 || i8 % 2 === 0) P('marimba', arp[i8] + 12, 0.09 + (i8 % 2 ? 0 : 0.03));
        if (mel && (part !== 2 || i8 % 4 === 0)) P('bell', mel + (part === 1 ? 12 : 0), part === 1 ? 0.05 : 0.07);
        if (part === 0 && i8 % 2 === 0) P('hat', 7000, 0.03);
      } else {
        const arp = [ch[1], ch[2] + 12, ch[3], ch[4] + 12, ch[2], ch[3] + 12, ch[4], ch[2] + 24];
        P('pluck', arp[i8] + 12, part === 2 ? 0.04 : 0.07, 1.2); if (part === 0) P('pluck', arp[(i8 + 4) % 8] + 12, 0.035, 1.2, e8 / 2);
        if (mel && (part !== 2 || i8 % 4 === 0)) P('bell', mel - 12 + (part === 1 ? 12 : 0), part === 1 ? 0.05 : 0.07);
        if (part === 0 && i8 % 2 === 0) P('hat', 9000, i8 % 4 === 0 ? 0.05 : 0.025);
        if (part === 0 && (i8 === 0 || i8 === 4)) P('kick', 0, 0.25);
      }
      return ev;
    }
    const p = st.progress, c = st.clean, eve = st.eve || 0, mood = moodOf(st);
    if (i8 === 0 && bar % 2 === 0) for (const m of ch.slice(1)) P('pad', m + 12, 0.075, e8 * 16 - 0.2);
    if (p > 0.08 && (i8 === 0 || (i8 === 5 && p > 0.4 && eve < 0.5))) P('bass', ch[0], 0.2, e8 * (i8 ? 3 : 5));
    // phrase-level choices (seeded per phrase so a phrase is coherent, phrases differ)
    let h = (phrase * 2654435761) >>> 0; const pr = () => { h = (h * 1103515245 + 12345) >>> 0; return (h >>> 8) / 16777216; };
    const arp = ARPS[Math.floor(pr() * ARPS.length)], motif = [0, 1, 2, 3].map(() => Math.floor(pr() * 5)), motifOn = pr() < 0.65;
    if (mood === 'smog') { if (i8 % 4 === 0) { const pat0 = [3, 4, 2, 3]; P('pluck', ch[pat0[(bar + i8 / 4) % 4]] + 12, 0.06, 0.25 + c * 0.5); } }
    else {
      const dens = eve > 0.5 ? 2 : p > 0.5 ? 1 : 2;
      if (i8 % dens === 0) P('pluck', ch[arp[i8]] + 12, 0.045 + c * 0.02, c * (1 - eve * 0.5));
      // a 4-note bell motif on the chord, played on bars 2,4,6,8 of the phrase
      const tones = ch.slice(1).map((m) => 72 + (((m - 72) % 12) + 12) % 12).sort((a, b) => a - b);
      if (motifOn && p > 0.3 && bar % 2 === 1 && i8 % 2 === 0) P('bell', tones[motif[i8 / 2] % 4], 0.045 * (1 - eve * 0.4));
      else if (!motifOn && p > 0.45 && r() < 0.2 + c * 0.1 && i8 % 2 === 0) P('bell', tones[Math.floor(r() * 4)], 0.045);
      if (c > 0.75 && i8 === 6 && r() < 0.5 && eve < 0.5) P('bell', 84 + keyOf(st) + PENTA[Math.floor(r() * 5)], 0.025);
    }
    if (st.critters > 0 && eve < 0.5 && r() < Math.min(0.06, st.critters * 0.008)) P('chirp', 0, 0.025);
    if (eve > 0.4 && c > 0.4 && i8 % 2 === 1 && r() < 0.35) P('cricket', 0, 0.012 * eve);
    return ev;
  }
  function schedule() {
    if (!A.ctx) return;
    const ctx = A.ctx, st = A.state;
    const e8 = 60 / bpmOf(st) / 2;
    A.mood = st.finale || moodOf(st);
    A.padF.frequency.setTargetAtTime(st.finale ? 3600 : (500 + st.clean * 2300) * (1 - (st.eve || 0) * 0.35), ctx.currentTime, 2);
    A.humG.gain.setTargetAtTime(st.finale ? 0 : (1 - st.clean) * 0.05, ctx.currentTime, 2);
    A.music.gain.setTargetAtTime((st.finale ? 1.0 : 0.8) * A.duck, ctx.currentTime, A.duck < 1 ? 0.03 : 0.4);
    if (A.duck < 1 && ctx.currentTime > A.duckUntil) A.duck = 1;
    while (A.nextT < ctx.currentTime + 0.25) {
      const t = A.nextT;
      for (const e of plan(st, A.step, rand)) {
        const tt = t + e.off;
        if (e.v === 'pad') padNote(e.m, tt, e.len, e.vol);
        else if (e.v === 'bass') bass(e.m, tt, e.len, e.vol);
        else if (e.v === 'pluck') pluck(e.m, tt, e.vol, e.len);
        else if (e.v === 'bell') bell(e.m, tt, e.vol);
        else if (e.v === 'marimba') marimba(e.m, tt, e.vol);
        else if (e.v === 'hat') noise(tt, 0.05, e.vol, e.m, 1, 'highpass', A.music);
        else if (e.v === 'kick') tone('sine', 120, 40, tt, 0.25, e.vol, A.music);
        else if (e.v === 'chirp') chirp(tt);
        else if (e.v === 'cricket') { const f = 4200 + rand() * 600; for (let i = 0; i < 3; i++) tone('sine', f, f, tt + i * 0.045, 0.03, e.vol, A.music); }
      }
      A.nextT += e8; A.step++;
    }
  }
  // Duck the music briefly under big SFX so they never fight.
  function duck(amount, len) { if (!A.ctx) return; A.duck = amount; A.duckUntil = A.ctx.currentTime + len; schedule(); }
  // SFX pitches are written in C; shift them into the current key so they always sit in the music.
  const K = (m) => m + keyOf(A.state);
  function chirp(t) { const f = 2400 + rand() * 1400; for (let i = 0; i < 2 + Math.floor(rand() * 3); i++) tone('sine', f, f * 1.35, t + i * 0.09, 0.07, 0.025, A.music); }

  // ---- SFX ----
  function now() { return A.ctx ? A.ctx.currentTime : 0; }
  const S = {
    pick() { if (!A.ctx) return; const t = now(); tone('triangle', 660, 880, t, 0.08, 0.08); },
    hover(h) { if (!A.ctx) return; const t = now(); tone('sine', 520 + h * 90, 540 + h * 90, t, 0.06, 0.03); },
    place(hearts, district) {
      if (!A.ctx) return; const t = now();
      noise(t, 0.12, 0.35, 380, 2); tone('sine', 190, 70, t, 0.18, 0.4);
      const ch = chordAt(A.state, A.step); const notes = [ch[1], ch[2], ch[3], ch[4], ch[2] + 12, ch[3] + 12, ch[4] + 12];
      for (let i = 0; i < Math.min(hearts, 7); i++) pluck(notes[i] + 12, t + 0.12 + i * 0.075, 0.12, 1, A.sfx);
      if (district) for (let i = 0; i < 4; i++) bell(ch[1 + (i % 4)] + 24, t + 0.15 + i * 0.03, 0.06, A.sfx);
    },
    deny() { if (!A.ctx) return; const t = now(); tone('sine', 300, 260, t, 0.12, 0.06); },
    level() { if (!A.ctx) return; duck(0.55, 0.6); const t = now(); [72, 76, 79, 84, 88].forEach((m, i) => bell(K(m), t + i * 0.08, 0.08, A.sfx)); noise(t, 0.6, 0.06, 6000, 0.5, 'highpass'); },
    party(n) { if (!A.ctx) return; duck(0.5, 0.9); const t = now(); [67, 72, 76, 79].forEach((m, i) => { pluck(K(m), t + i * 0.07, 0.07, 1.4, A.sfx); }); for (let i = 0; i <= n; i++) bell(K(84 + [0, 4, 7, 12][i % 4]), t + 0.35 + i * 0.12, 0.06, A.sfx); noise(t + 0.05, 0.25, 0.04, 3000, 1, 'bandpass'); },
    wish() { if (!A.ctx) return; duck(0.65, 0.5); const t = now(); [79, 84, 88, 91].forEach((m, i) => { bell(K(m), t + i * 0.06, 0.07, A.sfx); pluck(K(m) - 12, t + i * 0.06, 0.05, 1, A.sfx); }); },
    idea() { if (!A.ctx) return; const t = now(); tone('sine', 900, 1800, t, 0.25, 0.08); bell(K(91), t + 0.1, 0.06, A.sfx); },
    upgrade(variant) {
      if (!A.ctx) return; duck(0.5, 1.2); const t = now();
      const f = noise(t, 1.2, 0.18, 400, 3); f.frequency.exponentialRampToValueAtTime(5000, t + 1.1);
      const base = variant === 'star' ? [72, 79, 83, 86, 91] : [67, 72, 76, 79, 84];
      base.forEach((m, i) => { m = K(m); if (variant === 'star') pluck(m, t + 0.25 + i * 0.09, 0.1, 1, A.sfx); else bell(m, t + 0.25 + i * 0.09, 0.08, A.sfx); });
      tone('sine', 110, 55, t + 0.2, 0.8, 0.25);
    },
    grow() { if (!A.ctx) return; const t = now(); const f = noise(t, 1.4, 0.2, 200, 1, 'lowpass'); f.frequency.exponentialRampToValueAtTime(1800, t + 1); [60, 67, 72, 76].forEach((m, i) => padNote(K(m), t + i * 0.05, 1.5, 0.05)); },
    swap() { if (!A.ctx) return; const t = now(); for (let i = 0; i < 3; i++) noise(t + i * 0.06, 0.07, 0.15, 2500 + i * 600, 3); },
    critter(id) {
      if (!A.ctx) return; const t = now() + 0.05;
      if (id === 'bird') { for (let i = 0; i < 4; i++) tone('sine', 2600 + i * 200, 3600 + i * 150, t + i * 0.1, 0.08, 0.07); }
      else if (id === 'bee') { const o = tone('sawtooth', 220, 230, t, 0.6, 0.04); const lf = A.ctx.createOscillator(), lg = A.ctx.createGain(); lf.frequency.value = 28; lg.gain.value = 18; lf.connect(lg); lg.connect(o.frequency); lf.start(t); lf.stop(t + 0.7); }
      else if (id === 'duck') { for (let i = 0; i < 2; i++) { const o = tone('square', 520, 380, t + i * 0.22, 0.14, 0.05); } noise(t, 0.12, 0.06, 1200, 4); noise(t + 0.22, 0.12, 0.06, 1200, 4); }
      else if (id === 'butterfly') { [88, 91, 95, 100].forEach((m, i) => bell(K(m), t + i * 0.06, 0.03, A.sfx)); }
      else if (id === 'fox') { tone('triangle', 700, 1300, t, 0.12, 0.08); tone('triangle', 800, 1400, t + 0.18, 0.1, 0.06); }
      else if (id === 'deer') { bell(K(79), t, 0.07, A.sfx); bell(K(86), t + 0.25, 0.05, A.sfx); }
      [79, 84].forEach((m, i) => bell(K(m), t + 0.35 + i * 0.1, 0.04, A.sfx));
    },
    goal() { if (!A.ctx) return; const t = now(); bell(K(84), t, 0.05, A.sfx); bell(K(91), t + 0.12, 0.05, A.sfx); },
    clear() { if (!A.ctx) return; duck(0.5, 1.2); const t = now(); const f = noise(t, 1.0, 0.12, 300, 1, 'bandpass'); f.frequency.exponentialRampToValueAtTime(3000, t + 0.9); [72, 76, 79, 84, 88, 91].forEach((m, i) => bell(K(m), t + 0.3 + i * 0.07, 0.06, A.sfx)); },
    crown(v) { if (!A.ctx) return; duck(0.3, 2.5); const t = now(); tone('sine', 65, 65, t, 4, 0.25); (v === 'star' ? [60, 67, 71, 74, 79, 83, 86, 91] : [60, 64, 67, 72, 76, 79, 84, 88]).forEach((m, i) => bell(m, t + i * 0.12, 0.1, A.sfx)); noise(t, 3, 0.08, 8000, 0.3, 'highpass'); },
  };
  root.AUDIO = { _A: A, plan, chordAt, moodOf, keyOf, bpmOf, MOODS, init, setMute, update, S, get on() { return A.on; }, get ctx() { return A.ctx; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.AUDIO;
})(typeof window !== 'undefined' ? window : globalThis);
