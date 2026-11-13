// CLOCKWORK HEIST audio: procedural cool jazz (walking bass, brushes, ride, vibes) + caper SFX. WebAudio only.
(function (root) {
  'use strict';
  let ac = null, master = null, musicBus = null, sfxBus = null, noiseBuf = null, muted = false;
  let timer = null, nextBeat = 0, beat = 0, mode = 'off', tempo = 96, intensity = 0;
  const MID = (n) => 440 * Math.pow(2, (n - 69) / 12);
  // ii-V-I-VI in D minor-ish, cool and a bit sly: Dm9 | G13 | Cmaj9 | A7b9  /  Bbmaj7 | A7 | Dm | E7b9 A7
  const PROG = [
    { root: 50, tones: [62, 65, 69, 72, 64] }, { root: 43, tones: [59, 64, 65, 69] }, { root: 48, tones: [60, 64, 67, 71, 74] }, { root: 45, tones: [61, 64, 67, 70] },
    { root: 46, tones: [62, 65, 69, 70] }, { root: 45, tones: [61, 64, 67, 73] }, { root: 50, tones: [62, 65, 69, 72] }, { root: 52, tones: [62, 64, 68, 71] },
  ];
  const TENSE = [ // run mode: chromatic minor vamp
    { root: 50, tones: [62, 65, 68, 72] }, { root: 50, tones: [62, 65, 68, 72] }, { root: 51, tones: [63, 66, 70, 73] }, { root: 49, tones: [61, 65, 68, 71] },
  ];
  function init() {
    if (ac) return true;
    const AC = root.AudioContext || root.webkitAudioContext; if (!AC) return false;
    ac = new AC(); master = ac.createGain(); master.gain.value = muted ? 0 : 0.8;
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3;
    master.connect(comp); comp.connect(ac.destination);
    musicBus = ac.createGain(); musicBus.gain.value = 0.5; musicBus.connect(master);
    sfxBus = ac.createGain(); sfxBus.gain.value = 0.7; sfxBus.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); let s = 99; for (let i = 0; i < d.length; i++) { s = (s * 16807) % 2147483647; d[i] = s / 1073741823.5 - 1; }
    return true;
  }
  function resume() { if (init() && ac.state === 'suspended') ac.resume(); }
  function env(g, t, a, peak, dec, sus) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sus || 0.0001), t + a + dec); }
  function osc(type, f, t, dur, vol, bus, opts) {
    opts = opts || {};
    const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (opts.slide) o.frequency.exponentialRampToValueAtTime(opts.slide, t + dur);
    if (opts.detune) o.detune.value = opts.detune;
    let node = o;
    if (opts.lp) { const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(opts.lp, t); if (opts.lpTo) fl.frequency.exponentialRampToValueAtTime(opts.lpTo, t + dur); fl.Q.value = opts.q || 1; o.connect(fl); node = fl; }
    node.connect(g); g.connect(bus || sfxBus);
    env(g, t, opts.a || 0.005, vol, dur, opts.sus);
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  function noise(t, dur, vol, type, freq, bus, q) {
    const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ac.createBiquadFilter(); f.type = type || 'highpass'; f.frequency.value = freq || 6000; f.Q.value = q || 0.7;
    const g = ac.createGain(); s.connect(f); f.connect(g); g.connect(bus || sfxBus);
    env(g, t, 0.003, vol, dur); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  // ---------- music ----------
  function vibe(n, t, vol) { // vibraphone: sine + soft overtone with tremolo
    const o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain(), tr = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
    o.type = 'sine'; o2.type = 'sine'; o.frequency.value = MID(n); o2.frequency.value = MID(n) * 4.0;
    const g2 = ac.createGain(); g2.gain.value = 0.08; o2.connect(g2); g2.connect(g); o.connect(g);
    lfo.frequency.value = 5.2; lg.gain.value = 0.25; lfo.connect(lg); lg.connect(tr.gain); tr.gain.value = 0.75;
    g.connect(tr); tr.connect(musicBus); env(g, t, 0.004, vol, 1.6);
    [o, o2, lfo].forEach((x) => { x.start(t); x.stop(t + 1.7); });
  }
  function bass(n, t, dur) { osc('triangle', MID(n), t, dur, 0.5, musicBus, { lp: 900, a: 0.01 }); osc('sine', MID(n), t, dur * 0.6, 0.35, musicBus); }
  function ride(t, v) { noise(t, 0.22, 0.06 * v, 'highpass', 7500, musicBus); osc('square', 5274, t, 0.12, 0.006 * v, musicBus, { lp: 9000 }); }
  function brush(t, v) { noise(t, 0.16, 0.08 * v, 'bandpass', 3000, musicBus, 0.6); }
  function kick(t, v) { osc('sine', 110, t, 0.18, 0.5 * v, musicBus, { slide: 45 }); }
  function stab(tones, t, vol) { tones.forEach((n) => osc('sawtooth', MID(n), t, 0.22, vol, musicBus, { lp: 2200, lpTo: 600, a: 0.01 })); }
  function scheduleBeat(t, b) {
    const spb = 60 / tempo, prog = mode === 'run' || mode === 'alarm' ? TENSE : PROG;
    const bar = Math.floor(b / 4), inBar = b % 4, ch = prog[bar % prog.length], nx = prog[(bar + 1) % prog.length];
    const swing = spb * 0.66;
    // walking bass: root, chord tone, chord tone, chromatic approach to next root
    let bn;
    if (mode === 'run' || mode === 'alarm') bn = [ch.root, ch.root + 12, ch.root + 7, ch.root + (inBar === 3 ? 6 : 10)][inBar];
    else bn = inBar === 0 ? ch.root : inBar === 3 ? nx.root + (((bar * 7) % 2) ? 1 : -1) : ch.tones[(inBar + bar) % ch.tones.length] - 12;
    bass(bn, t, spb * 0.9);
    // ride: ding, ding-da ding
    ride(t, 1); if (inBar % 2 === 1) ride(t + swing, 0.7);
    if (inBar % 2 === 1) brush(t, 1); else brush(t, 0.35);
    if (mode === 'run' || mode === 'alarm') { if (inBar === 0 || inBar === 2) kick(t, 0.7); }
    // comping
    if (mode === 'plan' || mode === 'title') {
      if (inBar === 1 && bar % 2 === 0) ch.tones.slice(0, 4).forEach((n) => vibe(n, t + swing, 0.07));
      if (inBar === 3) ch.tones.slice(1, 4).forEach((n) => vibe(n + (bar % 2 ? 0 : 12) - 12, t, 0.05));
      if (inBar === 2 && bar % 4 === 2) vibe(ch.tones[ch.tones.length - 1] + 12, t + swing, 0.06);
    } else if (mode === 'run') {
      if (inBar === 3) stab(ch.tones.slice(0, 3), t + swing, 0.03 + intensity * 0.02);
      if (bar % 2 === 1 && inBar === 1) vibe(ch.tones[3] + 12, t, 0.05);
    } else if (mode === 'alarm') {
      stab(ch.tones.slice(0, 3).map((n) => n + 12), t, 0.05);
    }
  }
  function tick() {
    if (!ac || mode === 'off') return;
    while (nextBeat < ac.currentTime + 0.2) { scheduleBeat(nextBeat, beat); beat++; nextBeat += 60 / tempo; }
  }
  function setMode(m) {
    if (!init()) return;
    if (m === mode) return;
    const was = mode; mode = m;
    tempo = m === 'run' ? 138 : m === 'alarm' ? 152 : m === 'title' ? 100 : 92;
    if (was === 'off' || nextBeat < ac.currentTime) { nextBeat = ac.currentTime + 0.08; beat = 0; }
    else { beat = Math.ceil(beat / 4) * 4; }
    if (!timer) timer = setInterval(tick, 40);
  }
  // ---------- sfx ----------
  const SFX = {
    click() { const t = ac.currentTime; osc('square', 1200, t, 0.03, 0.05, sfxBus, { lp: 3000 }); },
    place() { const t = ac.currentTime; osc('triangle', 660, t, 0.06, 0.12); osc('triangle', 990, t + 0.04, 0.08, 0.08); },
    remove() { const t = ac.currentTime; osc('triangle', 500, t, 0.08, 0.1, sfxBus, { slide: 300 }); },
    scrub() { const t = ac.currentTime; osc('square', 2400, t, 0.012, 0.025, sfxBus, { lp: 5000 }); },
    step() { const t = ac.currentTime; noise(t, 0.03, 0.03, 'bandpass', 900, sfxBus, 2); },
    pick() { const t = ac.currentTime; osc('square', 3000 + Math.random() * 800, t, 0.015, 0.05, sfxBus, { lp: 6000 }); noise(t, 0.02, 0.05, 'highpass', 5000); },
    unlock() { const t = ac.currentTime; noise(t, 0.05, 0.25, 'bandpass', 1800, sfxBus, 3); osc('square', 400, t + 0.04, 0.06, 0.1, sfxBus, { lp: 1500 }); },
    safe() { const t = ac.currentTime; [0, 0.07, 0.14].forEach((d, i) => osc('triangle', [784, 988, 1319][i], t + d, 0.25, 0.12)); noise(t, 0.08, 0.2, 'bandpass', 1000); },
    grab() { const t = ac.currentTime; osc('sine', 1568, t, 0.12, 0.12); osc('sine', 2093, t + 0.06, 0.2, 0.1); },
    toss() { const t = ac.currentTime; osc('sine', 2637, t, 0.08, 0.06); osc('sine', 3136, t + 0.35, 0.3, 0.12); osc('sine', 2637, t + 0.5, 0.2, 0.06); },
    chat() { const t = ac.currentTime; vibe(74, t, 0.12); vibe(79, t + 0.12, 0.1); },
    ko() { const t = ac.currentTime; osc('sine', 140, t, 0.25, 0.6, sfxBus, { slide: 50 }); noise(t, 0.08, 0.3, 'lowpass', 600); },
    smash() { const t = ac.currentTime; noise(t, 0.5, 0.5, 'lowpass', 1400); osc('sine', 90, t, 0.4, 0.6, sfxBus, { slide: 40 }); },
    loop() { const t = ac.currentTime; noise(t, 0.35, 0.12, 'bandpass', 2500, sfxBus, 4); osc('square', 220, t, 0.3, 0.05, sfxBus, { slide: 880, lp: 2000 }); },
    glance() { const t = ac.currentTime; vibe(80, t, 0.16); vibe(81, t, 0.12); osc('sine', 1760, t, 0.4, 0.04); },
    near() { const t = ac.currentTime; kick(t, 0.7); kick(t + 0.22, 0.45); vibe(57, t, 0.09); vibe(58, t + 0.02, 0.08); noise(t, 0.5, 0.05, 'bandpass', 2600, sfxBus, 0.8); osc('sine', 1975, t + 0.05, 0.6, 0.025); },
    hear() { const t = ac.currentTime; vibe(76, t, 0.08); vibe(75, t + 0.1, 0.08); },
    bust() { const t = ac.currentTime; stab([50, 56, 59, 62], t, 0.12); stab([49, 55, 58, 61], t + 0.25, 0.12); noise(t, 1.2, 0.15, 'highpass', 5000); },
    alarm() { const t = ac.currentTime; for (let i = 0; i < 4; i++) osc('square', 880, t + i * 0.5, 0.45, 0.06, sfxBus, { slide: 660, lp: 2500 }); },
    win() { const t = ac.currentTime; const ch = [62, 66, 69, 73, 76]; ch.forEach((n, i) => vibe(n, t + i * 0.07, 0.12)); stab([62, 66, 69], t + 0.45, 0.06); },
    go() { const t = ac.currentTime; noise(t, 0.3, 0.1, 'highpass', 4000); osc('triangle', 392, t, 0.1, 0.1); osc('triangle', 587, t + 0.08, 0.15, 0.12); },
    out() { const t = ac.currentTime; osc('triangle', 880, t, 0.1, 0.06); },
  };
  function sfx(name) { if (!ac || muted || !SFX[name]) return; try { SFX[name](); } catch (e) { /* ignore */ } }
  function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.8; }
  function setIntensity(v) { intensity = v; }
  root.CHAudio = { resume, setMode, sfx, setMuted, isMuted: () => muted, setIntensity };
})(window);
