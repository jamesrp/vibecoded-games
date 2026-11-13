// TIDEBOUND audio: a generative, calm ocean soundtrack and soft SFX, all WebAudio. No assets.
(function (root) {
  'use strict';
  let ctx = null, master, musicBus, sfxBus, surfGain, surfFilter, padFilter, verb, started = false;
  let muted = false, musicOn = true, nextNoteT = 0, bar = 0, tideHigh = false, world = 1;
  const A = {};

  function makeImpulse(sec, decay) {
    const len = ctx.sampleRate * sec, b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return b;
  }
  function noiseBuf(sec) {
    const len = ctx.sampleRate * sec, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    let last = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5 + w * 0.15; }
    return b;
  }

  A.start = function () {
    if (started) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = root.AudioContext || root.webkitAudioContext; if (!AC) return;
    ctx = new AC(); started = true;
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ctx.destination);
    verb = ctx.createConvolver(); verb.buffer = makeImpulse(3.5, 2.6);
    const verbGain = ctx.createGain(); verbGain.gain.value = 0.45; verb.connect(verbGain); verbGain.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.5; musicBus.connect(master); musicBus.connect(verb);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.7; sfxBus.connect(master); sfxBus.connect(verb);
    // Surf: brown-ish noise through a slowly breathing lowpass.
    const src = ctx.createBufferSource(); src.buffer = noiseBuf(6); src.loop = true;
    surfFilter = ctx.createBiquadFilter(); surfFilter.type = 'lowpass'; surfFilter.frequency.value = 500; surfFilter.Q.value = 0.3;
    surfGain = ctx.createGain(); surfGain.gain.value = 0.0;
    src.connect(surfFilter); surfFilter.connect(surfGain); surfGain.connect(musicBus);
    src.start();
    padFilter = ctx.createBiquadFilter(); padFilter.type = 'lowpass'; padFilter.frequency.value = 900; padFilter.connect(musicBus);
    nextNoteT = ctx.currentTime + 0.3;
    setInterval(schedule, 120);
  };

  // Scales per world (MIDI roots) and chord loops; everything is pentatonic so nothing ever clashes.
  const WORLDS = {
    1: { root: 62, chords: [[0, 4, 7, 11], [5, 9, 12, 16], [-3, 0, 4, 7], [2, 5, 9, 12]] },
    2: { root: 60, chords: [[0, 7, 9, 14], [-4, 3, 7, 10], [5, 9, 12, 16], [-2, 5, 9, 12]] },
    3: { root: 57, chords: [[0, 3, 7, 10], [-4, 0, 3, 7], [-2, 2, 5, 9], [-5, -1, 2, 7]] },
    4: { root: 64, chords: [[0, 4, 7, 14], [-3, 4, 9, 12], [-7, 0, 4, 9], [-5, 2, 7, 11]] },
  };
  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function pad(freq, t, dur, vol) {
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
    o1.type = 'triangle'; o2.type = 'sine'; o1.frequency.value = freq; o2.frequency.value = freq * 1.003;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.35); g.gain.linearRampToValueAtTime(0, t + dur);
    o1.connect(g); o2.connect(g); g.connect(padFilter); o1.start(t); o2.start(t); o1.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
  }
  function bell(freq, t, vol, bus) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), g2 = ctx.createGain();
    o.type = 'sine'; o.frequency.value = freq; o2.type = 'sine'; o2.frequency.value = freq * 2.76;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    g2.gain.setValueAtTime(0, t); g2.gain.linearRampToValueAtTime(vol * 0.25, t + 0.005); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(g); o2.connect(g2); g.connect(bus || musicBus); g2.connect(bus || musicBus);
    o.start(t); o2.start(t); o.stop(t + 2.3); o2.stop(t + 0.7);
  }
  function schedule() {
    if (!ctx || !musicOn) return;
    const W = WORLDS[world] || WORLDS[1];
    const barLen = 6.4;
    while (nextNoteT < ctx.currentTime + 1.0) {
      const t = nextNoteT, ch = W.chords[bar % W.chords.length];
      for (const n of ch) pad(hz(W.root + n - 12), t, barLen * 1.15, 0.05);
      pad(hz(W.root + ch[0] - 24), t, barLen * 1.1, 0.06);
      // A sparse melody: 2-4 bell notes per bar on a gentle grid, chosen from the pentatonic scale.
      const seedA = (bar * 7919 + world * 31) % 97;
      const count = 2 + (seedA % 3);
      for (let k = 0; k < count; k++) {
        const slot = (seedA * (k + 3) + k * 5) % 8;
        const deg = PENTA[(seedA + k * 3 + bar) % PENTA.length];
        bell(hz(W.root + deg + (tideHigh ? 12 : 0)), t + slot * (barLen / 8) + 0.05, tideHigh ? 0.035 : 0.045);
      }
      // Surf swell once per bar.
      surfGain.gain.cancelScheduledValues(t);
      surfGain.gain.setValueAtTime(0.05, t); surfGain.gain.linearRampToValueAtTime(tideHigh ? 0.22 : 0.14, t + barLen * 0.45); surfGain.gain.linearRampToValueAtTime(0.05, t + barLen);
      nextNoteT += barLen; bar++;
    }
  }

  function env(node, t, a, peak, d) { node.gain.setValueAtTime(0, t); node.gain.linearRampToValueAtTime(peak, t + a); node.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  function noise(t, dur, type, f0, f1, vol, q) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf(Math.max(0.3, dur + 0.1));
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q || 1; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); env(g, t, Math.min(0.02, dur / 4), vol, dur);
    s.connect(f); f.connect(g); g.connect(sfxBus); s.start(t); s.stop(t + dur + 0.2);
  }
  function tone(t, f0, f1, dur, vol, type) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, 0.005, vol, dur); o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + dur + 0.05);
  }
  A.sfx = function (name, arg) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + 0.01;
    switch (name) {
      case 'step': noise(t, 0.07, 'bandpass', arg ? 2200 : 1400, arg ? 1600 : 900, 0.16, 2); break;
      case 'push': noise(t, 0.16, 'bandpass', 500, 300, 0.35, 3); tone(t, 130, 90, 0.12, 0.12, 'triangle'); break;
      case 'stone': noise(t, 0.22, 'lowpass', 700, 200, 0.45, 1); tone(t, 80, 55, 0.2, 0.25, 'sine'); break;
      case 'splash': noise(t, 0.45, 'bandpass', 2600, 500, 0.4, 0.8); noise(t + 0.05, 0.3, 'highpass', 4000, 2500, 0.1, 0.5); break;
      case 'drift': noise(t, 0.2 + (arg || 3) * 0.09, 'bandpass', 900, 1800, 0.18, 1.5); break;
      case 'bump': tone(t, 220, 160, 0.09, 0.12, 'sine'); break;
      case 'fill': noise(t, 0.6, 'lowpass', 1200, 150, 0.5, 0.7); tone(t + 0.05, 70, 40, 0.5, 0.35); break;
      case 'settle': tone(t, 110, 70, 0.25, 0.25, 'sine'); noise(t, 0.2, 'lowpass', 900, 300, 0.12, 1); break;
      case 'goal': bell(hz(74 + (arg || 0) * 2), t, 0.16, sfxBus); bell(hz(81 + (arg || 0) * 2), t + 0.09, 0.1, sfxBus); break;
      case 'undo': tone(t, 500, 700, 0.08, 0.06, 'sine'); break;
      case 'tide': { noise(t, 1.4, 'lowpass', arg ? 300 : 1400, arg ? 1400 : 300, 0.3, 0.5); bell(hz(arg ? 79 : 67), t + 0.25, 0.06, sfxBus); break; }
      case 'win': { const W = WORLDS[world] || WORLDS[1]; [0, 4, 7, 12, 16, 19].forEach((d, k) => bell(hz(W.root + 12 + d), t + k * 0.11, 0.12, sfxBus)); break; }
      case 'pearl': bell(hz(98), t, 0.1, sfxBus); bell(hz(103), t + 0.08, 0.07, sfxBus); break;
      case 'ui': tone(t, 660, 880, 0.06, 0.05, 'sine'); break;
    }
  };
  A.setTide = function (high) { tideHigh = high; if (padFilter) padFilter.frequency.setTargetAtTime(high ? 1500 : 900, ctx.currentTime, 1.5); };
  A.setWorld = function (w) { world = w; };
  A.toggleMute = function () { muted = !muted; if (master) master.gain.setTargetAtTime(muted ? 0 : 0.8, ctx.currentTime, 0.05); return muted; };
  A.isMuted = () => muted;
  root.TBAudio = A;
})(typeof window !== 'undefined' ? window : globalThis);
