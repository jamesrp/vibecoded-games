// GHOST CHOIR audio: real WebAudio synthesis. Choir "oo-oh" formant voices, glass bells, flue organ, pads, and a
// generated chapel reverb. makeEngine(ctx) works on a live AudioContext or an OfflineAudioContext (for analysis).
(function (root) {
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  // simple seeded noise so the reverb is identical every run
  function prng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1; }; }
  function chapelIR(ctx, secs = 3.6) {
    const sr = ctx.sampleRate, n = Math.floor(sr * secs), buf = ctx.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch), R = prng(7 + ch * 101); let lp = 0;
      const pre = Math.floor(0.022 * sr);
      // early reflections: a few stone-wall taps
      const taps = [0.011, 0.019, 0.027, 0.041, 0.053, 0.067].map((s, i) => [Math.floor((s + ch * 0.003) * sr), 0.5 / (i + 1.5)]);
      for (const [i, g] of taps) d[i] += g * (ch ? -1 : 1);
      for (let i = pre; i < n; i++) {
        const t = (i - pre) / sr, env = Math.exp(-t * 6.9 / 3.1); // T60 ~ 3.1 s
        const k = 0.55 + 0.4 * Math.min(1, t / 2.2); // tail gets darker over time
        lp = lp * k + R() * (1 - k);
        d[i] += lp * env * 2.2 * Math.min(1, (i - pre) / (0.03 * sr));
      }
    }
    return buf;
  }
  function makeEngine(ctx, opts = {}) {
    const out = ctx.createGain(); out.gain.value = opts.volume ?? 2.0;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.02; comp.release.value = 0.3;
    out.connect(comp); comp.connect(ctx.destination);
    const dry = ctx.createGain(); dry.gain.value = 0.62; dry.connect(out);
    const verb = ctx.createConvolver(); verb.buffer = chapelIR(ctx);
    const wet = ctx.createGain(); wet.gain.value = 0.5; verb.connect(wet); wet.connect(out);
    const send = ctx.createGain(); send.gain.value = 1; send.connect(verb);
    // a bus that feeds both dry and the reverb send by amount
    function bus(wetAmt) { const g = ctx.createGain(); const s = ctx.createGain(); s.gain.value = wetAmt; g.connect(dry); g.connect(s); s.connect(send); return g; }
    const choirBus = bus(0.85), bellBus = bus(0.75), organBus = bus(0.7), padBus = bus(1.0), sfxBus = bus(0.5);
    const noiseBuf = (() => { const n = ctx.sampleRate, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0), R = prng(3); for (let i = 0; i < n; i++) d[i] = R(); return b; })();
    // ---- choir: 3 detuned saws -> vowel formants (oo opening to oh) -> soft lowpass ----
    const VOW = { oo: [[300, 1], [870, 0.35], [2240, 0.08]], oh: [[430, 1], [820, 0.5], [2500, 0.1]], ah: [[650, 1], [1080, 0.55], [2650, 0.12]] };
    function choir(m, t, dur, vel = 0.5, pan = 0, vowel = 'oh') {
      const f = hz(m), g = ctx.createGain(), p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.min(3200, f * 7); lp.Q.value = 0.3;
      const mix = ctx.createGain(); mix.gain.value = 1;
      const att = 0.09, rel = 0.9, end = t + dur + rel;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel * 0.16, t + att); g.gain.setTargetAtTime(vel * 0.12, t + att, 0.25);
      g.gain.setValueAtTime(vel * 0.12, t + dur); g.gain.setTargetAtTime(0, t + dur, rel / 4);
      // vibrato that fades in after the attack
      const lfo = ctx.createOscillator(); lfo.frequency.value = 4.8 + ((m * 7) % 5) * 0.12; const ld = ctx.createGain(); ld.gain.setValueAtTime(0, t); ld.gain.linearRampToValueAtTime(f * 0.0045, t + 0.45); lfo.connect(ld);
      const oscs = [];
      for (const [cents, a] of [[-7, 0.33], [0, 0.4], [6, 0.33]]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = cents; ld.connect(o.frequency);
        const og = ctx.createGain(); og.gain.value = a; o.connect(og); og.connect(mix); oscs.push(o);
      }
      // formant bank: vowel glides from oo to target vowel
      const v0 = VOW.oo, v1 = VOW[vowel] || VOW.oh, fsum = ctx.createGain(); fsum.gain.value = 1.6;
      for (let i = 0; i < 3; i++) {
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = i === 0 ? 3.5 : 6;
        bp.frequency.setValueAtTime(v0[i][0], t); bp.frequency.linearRampToValueAtTime(v1[i][0], t + Math.min(0.5, dur));
        const bg = ctx.createGain(); bg.gain.value = v1[i][1]; mix.connect(bp); bp.connect(bg); bg.connect(fsum);
      }
      // a little body (fundamental warmth) so low notes don't thin out
      const sine = ctx.createOscillator(); sine.frequency.value = f; ld.connect(sine.frequency); const sg = ctx.createGain(); sg.gain.value = 0.35; sine.connect(sg); sg.connect(lp); oscs.push(sine);
      // breath at onset
      const nz = ctx.createBufferSource(); nz.buffer = noiseBuf; const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 1800; nf.Q.value = 0.8; const ng = ctx.createGain();
      ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(vel * 0.02, t + 0.04); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.35); nz.connect(nf); nf.connect(ng); ng.connect(g);
      fsum.connect(lp); lp.connect(g);
      if (p) { p.pan.value = pan; g.connect(p); p.connect(choirBus); } else g.connect(choirBus);
      for (const o of oscs) { o.start(t); o.stop(end + 0.1); } lfo.start(t); lfo.stop(end + 0.1); nz.start(t); nz.stop(t + 0.4);
    }
    // ---- bell: glassy additive partials with shimmer and a soft strike ----
    const BELL = [[1, 1, 2.6], [2.0, 0.42, 1.5], [3.01, 0.2, 0.9], [4.17, 0.12, 0.55], [5.43, 0.07, 0.35], [6.8, 0.04, 0.22]];
    function bell(m, t, vel = 0.5, pan = 0) {
      const f = hz(m), g = ctx.createGain(); g.gain.value = vel * 0.22;
      const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      const decayScale = Math.pow(2, -(m - 72) / 24); // lower bells ring longer
      for (const [r, a, d] of BELL) {
        const fr = f * r; if (fr > 12000) continue;
        for (const det of r === 1 ? [-0.9, 0.9] : [0]) {
          const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = fr + det; const og = ctx.createGain();
          const dd = d * decayScale, amp = a * (r === 1 ? 0.55 : 1);
          og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(amp, t + 0.004); og.gain.exponentialRampToValueAtTime(amp * 0.001, t + dd * 3);
          o.connect(og); og.connect(g); o.start(t); o.stop(t + dd * 3 + 0.05);
        }
      }
      const nz = ctx.createBufferSource(); nz.buffer = noiseBuf; const nf = ctx.createBiquadFilter(); nf.type = 'highpass'; nf.frequency.value = 5000; const ng = ctx.createGain();
      ng.gain.setValueAtTime(vel * 0.15, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.03); nz.connect(nf); nf.connect(ng); ng.connect(g); nz.start(t); nz.stop(t + 0.05);
      if (p) { p.pan.value = pan; g.connect(p); p.connect(bellBus); } else g.connect(bellBus);
    }
    // ---- organ: soft flue stops 8' + 4' + 2 2/3', gentle chiff ----
    function organ(m, t, dur, vel = 0.5) {
      const f = hz(m), g = ctx.createGain(), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400; lp.Q.value = 0.2;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel * 0.13, t + 0.05); g.gain.setValueAtTime(vel * 0.13, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.25);
      const trem = ctx.createOscillator(); trem.frequency.value = 5.5; const tg = ctx.createGain(); tg.gain.value = vel * 0.012; trem.connect(tg); tg.connect(g.gain);
      for (const [r, a, type] of [[1, 0.6, 'triangle'], [2, 0.25, 'sine'], [3, 0.1, 'sine'], [0.5, 0.18, 'sine']]) {
        const o = ctx.createOscillator(); o.type = type; o.frequency.value = f * r; const og = ctx.createGain(); og.gain.value = a; o.connect(og); og.connect(lp); o.start(t); o.stop(t + dur + 0.3);
      }
      const nz = ctx.createBufferSource(); nz.buffer = noiseBuf; const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = f * 4; nf.Q.value = 2; const ng = ctx.createGain();
      ng.gain.setValueAtTime(vel * 0.05, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.06); nz.connect(nf); nf.connect(ng); ng.connect(lp); nz.start(t); nz.stop(t + 0.08);
      lp.connect(g); g.connect(organBus); trem.start(t); trem.stop(t + dur + 0.3);
    }
    // ---- pad: very soft sustained "ah" choir chord under the loop ----
    function pad(notes, t, dur, vel = 0.3) {
      notes.forEach((m, i) => {
        const f = hz(m), g = ctx.createGain(), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(900, t + dur * 0.5); lp.frequency.linearRampToValueAtTime(600, t + dur);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel * 0.05, t + Math.min(0.8, dur * 0.4)); g.gain.setValueAtTime(vel * 0.05, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 1.0);
        for (const det of [-5, 5]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det + i; o.connect(lp); o.start(t); o.stop(t + dur + 1.1); }
        lp.connect(g); g.connect(padBus);
      });
    }
    // ---- sfx ----
    function tick(t, hi = 1) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(900 * hi, t); o.frequency.exponentialRampToValueAtTime(500 * hi, t + 0.05); g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08); o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.1); }
    function thump(t) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.12); g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18); o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.2); }
    return { ctx, out, choir, bell, organ, pad, tick, thump, hz };
  }
  // ---- harmony: pick a chord per bar that fits the tune (I, ii, IV, V, vi) and voice-lead the pad ----
  const CHORDS = { I: [0, 4, 7], ii: [2, 5, 9], IV: [5, 9, 0], V: [7, 11, 2], vi: [9, 0, 4], iii: [4, 7, 11] };
  function chooseChords(events, L, barLen) {
    const bars = Math.ceil(L / barLen), out = [];
    for (let b = 0; b < bars; b++) {
      let best = null;
      for (const [name, pcs] of Object.entries(CHORDS)) {
        let s = 0;
        for (let t = b * barLen; t < Math.min(L, (b + 1) * barLen); t++) {
          const strong = (t - b * barLen) === 0 ? 2 : (t - b * barLen) % 2 === 0 ? 1.3 : 0.8;
          for (const e of events[t]) { const pc = (+e.split(':')[0]) % 12; s += pcs.includes(pc) ? strong * (pc === pcs[0] ? 1.2 : 1) : -strong * (pc === (pcs[0] + 1) % 12 || pc === (pcs[0] + 6) % 12 ? 2.5 : 1.2); }
        }
        if (name === 'I' && b === 0) s += 1.0;
        if (b === bars - 1 && bars > 1) s += name === 'I' ? 2.5 : name === 'V' ? 1.0 : 0;
        if (name === 'iii') s -= 0.8; if (name === 'ii') s -= 0.3;
        if (!best || s > best.s) best = { name, s };
      }
      out.push(best.name);
    }
    return out;
  }
  // close voicing in C3..A3 nearest to previous voicing
  function voice(chords) {
    let prev = [48, 52, 55]; const res = [];
    for (const c of chords) {
      const pcs = CHORDS[c]; let best = null;
      for (let inv = 0; inv < 3; inv++) {
        const v = []; let base = 45;
        for (let i = 0; i < 3; i++) { const pc = pcs[(i + inv) % 3]; let m = base + ((pc - base) % 12 + 12) % 12; if (i > 0 && m <= v[i - 1]) m += 12; v.push(m); base = m; }
        while (v[0] > 50) v.forEach((_, i) => (v[i] -= 12));
        const cost = v.reduce((a, m, i) => a + Math.abs(m - prev[i]), 0);
        if (!best || cost < best.cost) best = { v, cost };
      }
      prev = best.v; res.push([pcs[0] + 36].concat(best.v));
    }
    return res; // [bass, tenor voices...]
  }
  function barLen(lv) { return lv.hr || (lv.L % 4 === 0 ? 4 : lv.L % 3 === 0 ? 3 : lv.L % 5 === 0 ? 5 : lv.L); }
  const api = { makeEngine, chooseChords, voice, CHORDS, hz, barLen };
  if (typeof module !== 'undefined') module.exports = api; else root.GCA = api;
})(this);
