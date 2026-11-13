// CARTOGRAPHER audio: gentle 6/8 seafaring tune (lute arpeggios, soft whistle melody, pad, sea swell) + SFX. WebAudio only.
(function (root) {
  'use strict';
  let ctx = null, master, music, sfx, verb, swellG, started = false, musicOn = true, muted = false;
  let nextT = 0, eighth = 0, region = 0, timer = null;
  const A = {};
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function impulse(sec, dec) { const n = ctx.sampleRate * sec, b = ctx.createBuffer(2, n, ctx.sampleRate); for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, dec); } return b; }
  function noise(sec, brown) { const n = ctx.sampleRate * sec, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0); let l = 0; for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; if (brown) { l = (l + 0.02 * w) / 1.02; d[i] = l * 3.5; } else d[i] = w; } return b; }
  let whiteBuf = null;
  A.start = function () {
    if (started) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = root.AudioContext || root.webkitAudioContext; if (!AC) return;
    ctx = new AC(); started = true;
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.85; master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor(); comp.connect(master);
    verb = ctx.createConvolver(); verb.buffer = impulse(3.2, 2.4); const vg = ctx.createGain(); vg.gain.value = 0.38; verb.connect(vg); vg.connect(comp);
    music = ctx.createGain(); music.gain.value = musicOn ? 0.55 : 0; music.connect(comp); music.connect(verb);
    sfx = ctx.createGain(); sfx.gain.value = 0.7; sfx.connect(comp); sfx.connect(verb);
    whiteBuf = noise(1.5, false);
    const sw = ctx.createBufferSource(); sw.buffer = noise(8, true); sw.loop = true;
    const sf = ctx.createBiquadFilter(); sf.type = 'lowpass'; sf.frequency.value = 420; swellG = ctx.createGain(); swellG.gain.value = 0.0;
    sw.connect(sf); sf.connect(swellG); swellG.connect(music); sw.start();
    nextT = ctx.currentTime + 0.2; timer = setInterval(sched, 100);
  };
  A.setRegion = (r) => { region = r | 0; };
  A.toggleMusic = () => { musicOn = !musicOn; if (music) music.gain.setTargetAtTime(musicOn ? 0.55 : 0, ctx.currentTime, 0.3); return musicOn; };
  A.musicOn = () => musicOn;

  // ---- instruments ----
  function lute(f, t, vol, dur) { // plucked: saw through closing lowpass, quick decay
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o2.type = 'triangle'; o.frequency.value = f; o2.frequency.value = f * 2.001;
    fl.type = 'lowpass'; fl.Q.value = 1.5; fl.frequency.setValueAtTime(f * 7, t); fl.frequency.exponentialRampToValueAtTime(f * 1.2, t + 0.35);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0008, t + (dur || 1.4));
    const g2 = ctx.createGain(); g2.gain.value = 0.25; o2.connect(g2); g2.connect(fl);
    o.connect(fl); fl.connect(g); g.connect(music); o.start(t); o2.start(t); o.stop(t + (dur || 1.4) + 0.05); o2.stop(t + (dur || 1.4) + 0.05);
  }
  function whistle(f, t, dur, vol) {
    const o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain(), g = ctx.createGain(), fl = ctx.createBiquadFilter();
    o.type = 'triangle'; o.frequency.value = f; lfo.frequency.value = 5.2; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.006, t + dur * 0.6);
    lfo.connect(lg); lg.connect(o.frequency); fl.type = 'lowpass'; fl.frequency.value = 2600;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.07); g.gain.setValueAtTime(vol, t + dur * 0.7); g.gain.linearRampToValueAtTime(0, t + dur + 0.08);
    o.connect(fl); fl.connect(g); g.connect(music); o.start(t); lfo.start(t); o.stop(t + dur + 0.15); lfo.stop(t + dur + 0.15);
  }
  function pad(f, t, dur, vol) {
    for (const det of [0.997, 1.003]) { const o = ctx.createOscillator(), g = ctx.createGain(), fl = ctx.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.value = f * det; fl.type = 'lowpass'; fl.frequency.value = 700;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.4); g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(fl); fl.connect(g); g.connect(music); o.start(t); o.stop(t + dur + 0.05); }
  }
  function bass(f, t, vol) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 1.1); o.connect(g); g.connect(music); o.start(t); o.stop(t + 1.2); }

  // ---- the tune (6/8). Melody as [midi offset from root, eighths]; root = D4 in region 0.
  const MEL_A = [[7, 2], [5, 1], [3, 2], [2, 1], [0, 3], [7, 3], [10, 2], [9, 1], [7, 2], [5, 1], [7, 6]];
  const MEL_B = [[12, 2], [10, 1], [7, 2], [5, 1], [3, 2], [5, 1], [7, 3], [5, 2], [3, 1], [2, 2], [-2, 1], [0, 6]];
  const MEL_C = [[0, 1], [2, 1], [3, 1], [5, 3], [7, 2], [3, 1], [5, 3], [10, 2], [9, 1], [7, 2], [5, 1], [2, 6]];
  const MEL_D = [[7, 3], [12, 3], [10, 2], [7, 1], [5, 3], [3, 2], [5, 1], [7, 2], [3, 1], [2, 3], [0, 6]];
  // chords per bar: [root offset, minor?]
  const PROG = [[0, 1], [0, 1], [-2, 0], [7, 1], [3, 0], [3, 0], [-2, 0], [0, 1]];
  const ROOTS = [62, 57, 64]; const TEMPO = [0.3, 0.33, 0.29];
  const SECTIONS = [MEL_A, MEL_B, null, MEL_C, MEL_D, null]; // nulls = melody rests (accompaniment only)
  let melQueue = [], section = 0;
  function sched() {
    if (!ctx) return;
    const e = TEMPO[region] || 0.3, root = ROOTS[region] || 62;
    while (nextT < ctx.currentTime + 0.6) {
      const t = nextT, barIdx = Math.floor(eighth / 6) % 8, pos = eighth % 6;
      const [cr, minor] = PROG[barIdx], third = minor ? 3 : 4, ch = root - 12 + cr;
      // lute arpeggio: root 5th 8ve 10th 8ve 5th
      const arp = [0, 7, 12, 12 + third, 12, 7];
      lute(hz(ch + arp[pos]), t + (Math.random() - 0.5) * 0.01, pos === 0 ? 0.085 : 0.055, 1.2);
      if (pos === 0) { bass(hz(ch - 12), t, 0.16); pad(hz(ch + 12), t, e * 6.3, 0.018); pad(hz(ch + 12 + third), t, e * 6.3, 0.014); }
      if (pos === 3) bass(hz(ch - 5), t, 0.08);
      // swell rises and falls each two bars
      if (pos === 0 && barIdx % 2 === 0) { swellG.gain.cancelScheduledValues(t); swellG.gain.setTargetAtTime(0.11, t, e * 3); swellG.gain.setTargetAtTime(0.03, t + e * 6, e * 3); }
      // melody
      if (eighth % 48 === 0) { const m = SECTIONS[section % SECTIONS.length]; section++; melQueue = m ? m.map((x) => x.slice()) : []; melQueue.at = 0; }
      if (melQueue.length && melQueue.at <= 0) { const [off, len] = melQueue.shift(); melQueue.at = len; whistle(hz(root + 12 + off), t, len * e * 0.95, 0.06); }
      if (melQueue.at !== undefined) melQueue.at--;
      eighth++; nextT += e;
    }
  }

  // ---- SFX ----
  function nz(t, dur, f0, f1, vol, type) {
    const s = ctx.createBufferSource(); s.buffer = whiteBuf; const fl = ctx.createBiquadFilter(), g = ctx.createGain();
    fl.type = type || 'bandpass'; fl.Q.value = 1.2; fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(fl); fl.connect(g); g.connect(sfx); s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }
  function tone(f, t, dur, vol, type) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type || 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0008, t + dur); o.connect(g); g.connect(sfx); o.start(t); o.stop(t + dur + 0.02); }
  function bellAt(f, t, vol) { for (const [r, a, d] of [[1, 1, 2.5], [2.4, 0.5, 1.6], [3.9, 0.3, 1.0], [5.4, 0.18, 0.6]]) tone(f * r, t, d, vol * a); }
  const S = {
    ink: (t) => nz(t, 0.09, 2600 + Math.random() * 800, 1200, 0.1),
    erase: (t) => nz(t, 0.12, 900, 3000, 0.07, 'highpass'),
    place: (t) => { tone(190, t, 0.18, 0.2, 'triangle'); nz(t, 0.05, 900, 500, 0.12); },
    seal: (t) => { tone(140, t, 0.2, 0.22); tone(hz(81), t + 0.04, 0.9, 0.05); },
    blot: (t) => { tone(110, t, 0.35, 0.12, 'triangle'); tone(104, t + 0.03, 0.35, 0.08, 'triangle'); },
    bell: (t) => { bellAt(520, t, 0.13); bellAt(520, t + 0.55, 0.1); },
    page: (t) => nz(t, 0.35, 500, 4000, 0.08, 'bandpass'),
    hint: (t) => { tone(hz(81), t, 0.6, 0.06); tone(hz(88), t + 0.12, 0.8, 0.05); },
    win: (t) => { const r = (ROOTS[region] || 62) + 12; [0, 3, 7, 12, 15, 19, 24].forEach((o, i) => lute(hz(r + o), t + i * 0.11, 0.12, 2)); bellAt(hz(r + 12), t + 0.9, 0.1); },
    click: (t) => tone(880, t, 0.05, 0.05, 'triangle'),
  };
  A.sfx = function (name) { if (!ctx || muted) return; const f = S[name]; if (f) f(ctx.currentTime + 0.01); };
  root.CAUDIO = A;
})(typeof window !== 'undefined' ? window : globalThis);
