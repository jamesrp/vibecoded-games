// WAGGLE audio: WebAudio hum drone, generative pentatonic meadow music at 120 bpm, buzz + SFX.
(function (root) {
  'use strict';
  const S = { on: false, muted: false, scene: 'meadow', rain: false };
  let ac, master, musicBus, sfxBus, filt, hum = [], noiseBuf, buzz = null, nextT = 0, step = 0, timer = null;
  const BPM = 120, EIGHTH = 60 / BPM / 2;
  // F major pentatonic, warm
  const SCALE = [0, 2, 4, 7, 9];
  const CHORDS = [[53, 57, 60], [50, 53, 57], [58, 62, 65], [48, 52, 55]]; // F, Dm, Bb, C
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = root.AudioContext || root.webkitAudioContext; if (!AC) return;
    ac = new AC();
    master = ac.createGain(); master.gain.value = S.muted ? 0 : 0.8;
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3;
    master.connect(comp); comp.connect(ac.destination);
    filt = ac.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 5000; filt.Q.value = 0.4;
    musicBus = ac.createGain(); musicBus.gain.value = 0.55; musicBus.connect(filt); filt.connect(master);
    sfxBus = ac.createGain(); sfxBus.gain.value = 0.8; sfxBus.connect(master);
    // simple feedback delay for warmth
    const dl = ac.createDelay(); dl.delayTime.value = EIGHTH * 3; const fb = ac.createGain(); fb.gain.value = 0.28; const wet = ac.createGain(); wet.gain.value = 0.25;
    musicBus.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(wet); wet.connect(filt);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // hive hum drone: detuned saws through a breathing lowpass
    const hf = ac.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 420; hf.Q.value = 2;
    const hg = ac.createGain(); hg.gain.value = 0.05; hf.connect(hg); hg.connect(master);
    for (const [f, det] of [[110, -6], [110, 7], [165, 3], [220.6, -4]]) { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det; o.connect(hf); o.start(); hum.push(o); }
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.13; const lg = ac.createGain(); lg.gain.value = 160; lfo.connect(lg); lg.connect(hf.frequency); lfo.start();
    const am = ac.createOscillator(); am.frequency.value = 0.4; const amg = ac.createGain(); amg.gain.value = 0.015; am.connect(amg); amg.connect(hg.gain); am.start();
    S.humGain = hg; S.humFilt = hf;
    // rain bed
    const rn = ac.createBufferSource(); rn.buffer = noiseBuf; rn.loop = true; const rf = ac.createBiquadFilter(); rf.type = 'highpass'; rf.frequency.value = 1800; const rg = ac.createGain(); rg.gain.value = 0;
    rn.connect(rf); rf.connect(rg); rg.connect(master); rn.start(); S.rainGain = rg;
    nextT = ac.currentTime + 0.1; S.on = true;
    timer = setInterval(schedule, 50);
  }

  function pluck(t, m, vel, dur, type) {
    const o = ac.createOscillator(), g = ac.createGain(), o2 = ac.createOscillator();
    o.type = type || 'triangle'; o.frequency.value = mtof(m); o2.type = 'sine'; o2.frequency.value = mtof(m + 12);
    const g2 = ac.createGain(); g2.gain.value = 0.25;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(musicBus); o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }
  function pad(t, ms, dur, vel) {
    for (const m of ms) {
      const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = mtof(m); o.detune.value = (Math.random() - 0.5) * 8;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + dur * 0.35); g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + dur + 0.1);
    }
  }
  // deterministic-ish generative melody: motif per bar, varied
  let motif = [0, 2, 4, 2, 7, 4, 2, 0];
  function schedule() {
    if (!ac) return;
    while (nextT < ac.currentTime + 0.25) {
      const bar = Math.floor(step / 8), pos = step % 8, ch = CHORDS[bar % 4];
      const hive = S.scene === 'hive', calm = S.scene === 'title' || S.scene === 'night';
      if (pos === 0) {
        pad(nextT, ch.map((m) => m - 12), EIGHTH * 8, hive ? 0.03 : 0.035);
        pluck(nextT, ch[0] - 24, 0.18, EIGHTH * 6, 'sine');
        if (bar % 4 === 0) motif = motif.map((v, i) => (Math.random() < 0.3 ? SCALE[Math.floor(Math.random() * 5)] + (Math.random() < 0.3 ? 12 : 0) : v));
      }
      if (pos === 4) pluck(nextT, ch[0] - 17, 0.1, EIGHTH * 3, 'sine');
      const rest = S.rain ? 0.6 : hive ? 0.45 : calm ? 0.5 : 0.25;
      if (Math.random() > rest) {
        const deg = motif[pos], m = 65 + deg + (bar % 8 >= 4 && pos > 5 ? 12 : 0);
        pluck(nextT + (pos % 2 ? 0.012 : 0), m, hive ? 0.06 : 0.09, EIGHTH * (hive ? 2 : 3));
      }
      if (!hive && !calm && pos % 2 === 1 && Math.random() < 0.35) { // grass shaker
        const n = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(); n.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = 7000; g.gain.setValueAtTime(0.025, nextT); g.gain.exponentialRampToValueAtTime(0.001, nextT + 0.06);
        n.connect(f); f.connect(g); g.connect(musicBus); n.start(nextT, Math.random()); n.stop(nextT + 0.08);
      }
      nextT += EIGHTH; step++;
    }
  }

  function setScene(sc) {
    S.scene = sc; if (!ac) return;
    const t = ac.currentTime;
    filt.frequency.setTargetAtTime(sc === 'hive' ? 1100 : 5000, t, 0.3);
    S.humGain.gain.setTargetAtTime(sc === 'hive' ? 0.085 : sc === 'meadow' ? 0.025 : 0.04, t, 0.4);
  }
  function setRain(on) { S.rain = on; if (S.rainGain) S.rainGain.gain.setTargetAtTime(on ? 0.06 : 0, ac.currentTime, 0.8); }

  function startBuzz() {
    if (!ac || buzz) return;
    const o = ac.createOscillator(), g = ac.createGain(), am = ac.createOscillator(), amg = ac.createGain(), f = ac.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = 196; f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 1.4;
    am.frequency.value = 14; amg.gain.value = 0.06; g.gain.value = 0.0; g.gain.setTargetAtTime(0.09, ac.currentTime, 0.02);
    am.connect(amg); amg.connect(g.gain); o.connect(f); f.connect(g); g.connect(sfxBus); o.start(); am.start();
    buzz = { o, g, am };
  }
  function stopBuzz() { if (!buzz) return; const b = buzz; buzz = null; b.g.gain.setTargetAtTime(0, ac.currentTime, 0.03); b.o.stop(ac.currentTime + 0.2); b.am.stop(ac.currentTime + 0.2); }
  function blip(m, vel, dur, type, slide) {
    if (!ac) return; const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(mtof(m), t); if (slide) o.frequency.exponentialRampToValueAtTime(mtof(m + slide), t + dur);
    g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur); o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, freq, vel, q) {
    if (!ac) return; const t = ac.currentTime, n = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    n.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(freq * 2.5, t + dur); f.Q.value = q || 1;
    g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); n.connect(f); f.connect(g); g.connect(sfxBus); n.start(t, Math.random()); n.stop(t + dur + 0.05);
  }
  const SFX = {
    buzz: (n) => { blip(72 + Math.min(n, 16) * 1, 0.11, 0.07, 'square'); if (buzz) buzz.o.frequency.setTargetAtTime(196 + n * 4, ac.currentTime, 0.05); },
    found: (n) => { blip(77, 0.12, 0.25, 'triangle'); setTimeout(() => blip(84, 0.12, 0.35, 'triangle'), 110); for (let i = 0; i < (n || 0); i++) setTimeout(() => blip(72 + Math.min(i, 16), 0.07, 0.06, 'square'), 520 + i * 250); },
    deposit: (q) => blip(84 + (q || 1) * 2, 0.035, 0.12, 'sine'),
    fFound: () => blip(89, 0.05, 0.2, 'triangle'),
    sniff: () => { blip(84, 0.035, 0.35, 'sine'); setTimeout(() => blip(91, 0.03, 0.5, 'sine'), 110); },
    fMiss: () => blip(55, 0.05, 0.25, 'sine', -3),
    stung: () => { blip(70, 0.18, 0.35, 'sawtooth', -20); noise(0.2, 600, 0.12, 2); },
    waspAlert: () => blip(62, 0.08, 0.2, 'square', 5),
    run: (k, c) => { noise(0.35, 500, 0.06, 0.8); if (k) blip(79 + (c || 0) * 3, 0.06 + (c || 0) * 0.02, 0.25, 'triangle', 5); if (c >= 3) setTimeout(() => blip(91, 0.07, 0.4, 'sine'), 90); },
    runShort: () => blip(60, 0.06, 0.12, 'sine'),
    enter: () => noise(0.4, 300, 0.1, 0.7), exit: () => noise(0.4, 500, 0.1, 0.7),
    dawn: () => { [65, 69, 72, 77].forEach((m, i) => setTimeout(() => blip(m, 0.09, 1.2, 'sine'), i * 140)); },
    night: () => { [77, 72, 69, 65].forEach((m, i) => setTimeout(() => blip(m, 0.08, 1.2, 'sine'), i * 160)); },
    select: () => blip(81, 0.06, 0.08, 'triangle'),
    win: () => { [65, 69, 72, 77, 81, 84].forEach((m, i) => setTimeout(() => blip(m, 0.1, 0.9, 'triangle'), i * 120)); },
    scared: () => blip(74, 0.03, 0.1, 'square', -5),
  };
  root.WGAudio = { init, setScene, setRain, startBuzz, stopBuzz, SFX, S, mute(m) { S.muted = m; if (master) master.gain.value = m ? 0 : 0.8; } };
})(window);
