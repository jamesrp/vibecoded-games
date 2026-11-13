// BRIGHTFIELD RADIO engine: Brightfield voices + reverb, live or offline.
(function (root) {
  'use strict';
  const P = (typeof require !== 'undefined' ? require('./planners.js') : root.RADIO_PLAN);

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function create(ctx, opts) {
    opts = opts || {};
    const offline = !!opts.offline;
    const E = {
      ctx: ctx,
      on: false,
      track: opts.track || 'victory',
      variant: opts.variant || 'leaf',
      seed: opts.seed || 1,
      volume: opts.volume == null ? 0.85 : opts.volume,
      progress: opts.progress == null ? 0 : opts.progress,
      step: 0,
      nextT: 0,
      timer: null,
      sleepMin: 0,
      sleepEnd: 0,
      fadeUntil: 0,
      live: [],
      extras: [],
    };

    const master = ctx.createGain();
    master.gain.value = E.volume * 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3;
    comp.knee.value = 12;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;
    master.connect(comp);
    comp.connect(ctx.destination);

    const music = ctx.createGain();
    music.gain.value = 0.8;
    music.connect(master);

    const rev = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 3);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    rev.buffer = ir;
    const revIn = ctx.createGain();
    revIn.gain.value = 0.5;
    revIn.connect(rev);
    rev.connect(master);

    const dly = ctx.createDelay(1);
    dly.delayTime.value = 60 / 80 * 0.75;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const dlp = ctx.createBiquadFilter();
    dlp.frequency.value = 2600;
    const dlyIn = ctx.createGain();
    dlyIn.gain.value = 0.3;
    dlyIn.connect(dly);
    dly.connect(dlp);
    dlp.connect(fb);
    fb.connect(dly);
    dlp.connect(master);
    dlp.connect(revIn);

    const padF = ctx.createBiquadFilter();
    padF.type = 'lowpass';
    padF.frequency.value = 1800;
    padF.Q.value = 0.7;
    const padG = ctx.createGain();
    padG.gain.value = 0.16;
    padF.connect(padG);
    padG.connect(music);
    padG.connect(revIn);

    const pumpG = ctx.createGain();
    pumpG.gain.value = 1;
    const chorusIn = ctx.createGain();
    const chorusOut = ctx.createGain();
    chorusOut.gain.value = 0.6;
    function chorusTap(base, rate, depth) {
      const d = ctx.createDelay(0.1);
      d.delayTime.value = base;
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = rate;
      lg.gain.value = depth;
      lfo.connect(lg);
      lg.connect(d.delayTime);
      lfo.start();
      chorusIn.connect(d);
      d.connect(chorusOut);
    }
    chorusTap(0.022, 0.17, 0.0036);
    chorusTap(0.034, 0.13, 0.0048);
    pumpG.connect(chorusIn);
    chorusIn.connect(music);
    chorusOut.connect(music);
    chorusOut.connect(revIn);

    const wb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const wd = wb.getChannelData(0);
    for (let i = 0; i < wd.length; i++) wd[i] = Math.random() * 2 - 1;

    const bb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const bd = bb.getChannelData(0);
    let last = 0;
    for (let i = 0; i < bd.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      bd[i] = last * 3.5;
    }

    function remember(node, stopAt) {
      E.live.push({ node: node, t: stopAt });
    }
    function reap(now) {
      const keep = [];
      for (const n of E.live) {
        if (n.t > now - 0.2) keep.push(n);
      }
      E.live = keep;
    }
    function stopAllVoices(now) {
      for (const n of E.live) {
        try { n.node.stop(now); } catch (e) {}
      }
      E.live = [];
    }
    function stopExtras(now) {
      for (const n of E.extras) {
        try { n.stop(now); } catch (e) {}
      }
      E.extras = [];
    }

    function env(g, t, a, peak, d, sus, r, hold) {
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + a);
      g.gain.setTargetAtTime(peak * sus, t + a, d);
      g.gain.setTargetAtTime(0.0001, t + hold, r);
    }
    function padNote(m, t, hold, vol) {
      if (E.live.length > 88) return;
      const g = ctx.createGain();
      env(g, t, 1.2, vol, 1.5, 0.8, 0.9, hold);
      g.connect(padF);
      for (const det of [-7, 6]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(m);
        o.detune.value = det;
        o.connect(g);
        o.start(t);
        o.stop(t + hold + 4);
        remember(o, t + hold + 4);
      }
    }
    function pluck(m, t, vol, bright) {
      bright = (bright == null || bright === 0) ? 1 : bright;
      const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      o.type = 'triangle'; o.frequency.value = mtof(m);
      o2.type = 'sine'; o2.frequency.value = mtof(m) * 4;
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(vol * 0.25 * bright, t);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      f.type = 'lowpass'; f.frequency.value = 1400 + 2600 * Math.min(2, bright);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(f); o2.connect(g2); g2.connect(g); f.connect(g);
      g.connect(music); g.connect(revIn); g.connect(dlyIn);
      o.start(t); o2.start(t); o.stop(t + 1); o2.stop(t + 1);
      remember(o, t + 1); remember(o2, t + 1);
    }
    function bell(m, t, vol) {
      const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
      car.frequency.value = mtof(m);
      mod.frequency.value = mtof(m) * 3.5;
      mg.gain.setValueAtTime(mtof(m) * 1.6, t);
      mg.gain.exponentialRampToValueAtTime(1, t + 1.6);
      mod.connect(mg); mg.connect(car.frequency);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
      car.connect(g); g.connect(music); g.connect(revIn); g.connect(dlyIn);
      car.start(t); mod.start(t); car.stop(t + 2.5); mod.stop(t + 2.5);
      remember(car, t + 2.5); remember(mod, t + 2.5);
    }
    function bass(m, t, hold, vol) {
      const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      o.type = 'triangle'; o.frequency.value = mtof(m);
      f.frequency.value = 500;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.02);
      g.gain.setTargetAtTime(0.0001, t + hold * 0.7, 0.12);
      o.connect(f); f.connect(g); g.connect(music);
      o.start(t); o.stop(t + hold + 0.6);
      remember(o, t + hold + 0.6);
    }
    function marimba(m, t, vol) {
      const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), g2 = ctx.createGain();
      o.type = 'sine'; o.frequency.value = mtof(m);
      o2.type = 'sine'; o2.frequency.value = mtof(m) * 3.98;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      g2.gain.setValueAtTime(vol * 0.5, t);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      o.connect(g); o2.connect(g2); g2.connect(g);
      g.connect(music); g.connect(revIn);
      o.start(t); o2.start(t); o.stop(t + 0.8); o2.stop(t + 0.8);
      remember(o, t + 0.8); remember(o2, t + 0.8);
    }
    function musicBox(m, t, vol) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.15);
      g.connect(music); g.connect(revIn); g.connect(dlyIn);
      const parts = [[1, 1], [2.01, 0.22], [2.76, 0.07]];
      for (const [mult, amp] of parts) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = mtof(m) * mult;
        const gg = ctx.createGain();
        gg.gain.value = amp;
        o.connect(gg); gg.connect(g);
        o.start(t); o.stop(t + 1.3);
        remember(o, t + 1.3);
      }
    }
    function noise(t, hold, vol, freq, q, type, dest) {
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = wb;
      f.type = type || 'bandpass';
      f.frequency.value = freq;
      f.Q.value = q == null ? 1 : q;
      g.gain.setValueAtTime(Math.max(0.0001, vol), t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + hold);
      s.connect(f); f.connect(g); g.connect(dest || music);
      s.start(t); s.stop(t + hold + 0.05);
      remember(s, t + hold + 0.05);
      return f;
    }
    function tone(type, f0, f1, t, hold, vol, dest) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(Math.max(20, f0), t);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + hold);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + hold);
      o.connect(g); g.connect(dest || music);
      o.start(t); o.stop(t + hold + 0.05);
      remember(o, t + hold + 0.05);
      return o;
    }
    function drip(t, freq, vol) {
      tone('sine', freq, Math.max(220, freq * 0.42), t, 0.2, vol, music);
      noise(t, 0.05, vol * 0.3, freq * 1.3, 2, 'bandpass', music);
    }
    function cricket(t, freq, vol) {
      const f = freq || (4200 + Math.random() * 600);
      for (let i = 0; i < 3; i++) tone('sine', f, f, t + i * 0.045, 0.03, vol, music);
    }


    function aeroOut(node) {
      node.connect(pumpG);
    }
    function pump(t) {
      pumpG.gain.cancelScheduledValues(t);
      pumpG.gain.setValueAtTime(0.42, t);
      pumpG.gain.setTargetAtTime(1, t + 0.03, 0.13);
    }
    function rhodes(m, t, vol, hold) {
      hold = hold || 1.35;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.01);
      g.gain.setTargetAtTime(vol * 0.38, t + 0.14, 0.2);
      g.gain.setTargetAtTime(0.0001, t + hold, 0.28);
      const trem = ctx.createGain();
      trem.gain.value = 1;
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = 4.8;
      lg.gain.value = 0.16;
      lfo.connect(lg); lg.connect(trem.gain);
      const car = ctx.createOscillator();
      car.type = 'sine';
      car.frequency.value = mtof(m);
      const mod = ctx.createOscillator();
      mod.frequency.value = mtof(m);
      const mg = ctx.createGain();
      mg.gain.setValueAtTime(Math.max(20, mtof(m) * 2.1), t);
      mg.gain.exponentialRampToValueAtTime(Math.max(8, mtof(m) * 0.18), t + 0.32);
      mod.connect(mg); mg.connect(car.frequency);
      const tine = ctx.createOscillator();
      tine.type = 'sine';
      tine.frequency.value = mtof(m) * 4.03;
      const tg = ctx.createGain();
      tg.gain.setValueAtTime(vol * 0.2, t);
      tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      car.connect(trem); tine.connect(tg); tg.connect(trem);
      trem.connect(g); aeroOut(g);
      const stop = t + hold + 1.1;
      car.start(t); mod.start(t); tine.start(t); lfo.start(t);
      car.stop(stop); mod.stop(stop); tine.stop(stop); lfo.stop(stop);
      remember(car, stop); remember(mod, stop); remember(tine, stop); remember(lfo, stop);
    }
    function ooh(m, t, hold, vol) {
      hold = hold || 2.5;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.85);
      g.gain.setTargetAtTime(vol * 0.75, t + 1.2, 0.6);
      g.gain.setTargetAtTime(0.0001, t + hold, 0.9);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2400;
      g.connect(lp); aeroOut(lp);
      for (const det of [-7, 6]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(m);
        o.detune.value = det;
        const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 380; f1.Q.value = 5;
        const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 920; f2.Q.value = 4;
        const mix = ctx.createGain(); mix.gain.value = 0.55;
        o.connect(f1); o.connect(f2); f1.connect(mix); f2.connect(mix); mix.connect(g);
        o.start(t); o.stop(t + hold + 2);
        remember(o, t + hold + 2);
      }
      const body = ctx.createOscillator();
      body.type = 'sine';
      body.frequency.value = mtof(m);
      const bg = ctx.createGain(); bg.gain.value = 0.45;
      body.connect(bg); bg.connect(g);
      body.start(t); body.stop(t + hold + 2);
      remember(body, t + hold + 2);
    }
    function glass(m, t, vol) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
      aeroOut(g); g.connect(dlyIn);
      const parts = [[1, 1], [2.01, 0.22], [2.99, 0.1]];
      for (const [mult, amp] of parts) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = mtof(m) * mult;
        const gg = ctx.createGain(); gg.gain.value = amp;
        o.connect(gg); gg.connect(g);
        o.start(t); o.stop(t + 1);
        remember(o, t + 1);
      }
    }
    function bubble(t, freq, vol) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      const f0 = Math.max(80, freq || 800);
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f0 * 2.25, t + 0.16);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
      o.connect(g); g.connect(music); g.connect(revIn);
      o.start(t); o.stop(t + 0.3);
      remember(o, t + 0.3);
    }
    function snare(t, vol) {
      noise(t, 0.11, vol, 2300, 0.85, 'bandpass', music);
      tone('sine', 210, 90, t, 0.09, vol * 0.32, music);
    }
    function bird(t, freq, vol) {
      const f = Math.max(400, freq || 2000);
      for (let i = 0; i < 3; i++) tone('sine', f * (1 + i * 0.07), f * 1.28, t + i * 0.1, 0.07, vol, music);
    }

    function fire(e, t) {
      const tt = t + (e.off || 0);
      if (e.v === 'pad') padNote(e.m, tt, e.len, e.vol);
      else if (e.v === 'bass') bass(e.m, tt, e.len, e.vol);
      else if (e.v === 'pluck') pluck(e.m, tt, e.vol, e.len);
      else if (e.v === 'bell') bell(e.m, tt, e.vol);
      else if (e.v === 'marimba') marimba(e.m, tt, e.vol);
      else if (e.v === 'musicbox') musicBox(e.m, tt, e.vol);
      else if (e.v === 'rhodes') rhodes(e.m, tt, e.vol, e.len);
      else if (e.v === 'ooh') ooh(e.m, tt, e.len, e.vol);
      else if (e.v === 'glass') glass(e.m, tt, e.vol);
      else if (e.v === 'bubble') bubble(tt, e.m, e.vol);
      else if (e.v === 'snare') snare(tt, e.vol);
      else if (e.v === 'bird') bird(tt, e.m, e.vol);
      else if (e.v === 'hat') noise(tt, 0.05, e.vol, e.m, 1, 'highpass', music);
      else if (e.v === 'kick') {
        tone('sine', 120, 40, tt, 0.25, e.vol, music);
        if (P.groupOf(E.track) === 'aero') pump(tt);
      }
      else if (e.v === 'drip') drip(tt, e.m, e.vol);
      else if (e.v === 'cricket') cricket(tt, e.m, e.vol);
    }

    function trackMeta() {
      return P.TRACKS.find((t) => t.id === E.track) || P.TRACKS[0];
    }
    function st() {
      return { variant: E.variant, seed: E.seed, progress: E.progress };
    }
    function applyTrackGain(t) {
      const g = trackMeta().gain * 0.8;
      music.gain.setTargetAtTime(g, t, 0.12);
    }
    function applyPad(t) {
      padF.frequency.setTargetAtTime(P.padFilterHz(E.track, st()), t, 0.8);
    }

    function startRain(at, until) {
      const src = ctx.createBufferSource();
      src.buffer = bb;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1700;
      bp.Q.value = 0.55;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3800;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(0.045, at + 1.2);
      src.connect(bp); bp.connect(lp); lp.connect(g); g.connect(music); g.connect(revIn);
      src.start(at);
      if (until) {
        g.gain.setTargetAtTime(0.0001, until - 0.4, 0.12);
        src.stop(until + 0.2);
      }
      E.extras.push(src);
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = 0.07;
      lg.gain.value = 280;
      lfo.connect(lg); lg.connect(bp.frequency);
      lfo.start(at);
      if (until) lfo.stop(until + 0.2);
      E.extras.push(lfo);
    }

    function startDrone(at, until) {
      const g = ctx.createGain();
      const startP = E.progress;
      const startGain = 0.06 + Math.max(0, 0.04 - startP * 0.03);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(startGain, at + 2);
      g.connect(padF);
      for (const [det, type] of [[-6, 'sine'], [5, 'sine']]) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = mtof(36);
        o.detune.value = det;
        o.connect(g);
        o.start(at);
        if (until) o.stop(until + 0.3);
        E.extras.push(o);
      }
      E.droneG = g;
    }

    function startExtras(at, until) {
      stopExtras(at);
      if (E.track === 'greenhouse') startRain(at, until);
      if (E.track === 'dawn') startDrone(at, until);
    }

    function pulse(now) {
      if (!E.on) return;
      if (E.sleepMin > 0 && E.sleepLeft > 0) {
        if (E.sleepLast) E.sleepLeft -= Math.max(0, now - E.sleepLast);
        E.sleepLast = now;
        if (E.sleepLeft <= 0 && !E.fadeUntil) {
          const fade = 12;
          master.gain.setTargetAtTime(0.0001, now, fade / 4);
          E.fadeUntil = now + fade;
          E.sleepLeft = 0;
        }
      }
      if (E.fadeUntil && now >= E.fadeUntil) {
        E.on = false;
        E.fadeUntil = 0;
        if (E.timer) { clearInterval(E.timer); E.timer = null; }
        stopAllVoices(now);
        stopExtras(now);
        return;
      }
      applyPad(now);
      applyTrackGain(now);
      const look = offline ? 0 : 0.28;
      const ceiling = offline ? E.renderUntil : now + look;
      while (E.nextT < ceiling) {
        if (E.track === 'dawn') {
          if (E.progressBase == null) E.progressBase = E.progress;
          if (E.t0 == null) E.t0 = E.nextT;
          E.progress = E.progressBase + Math.max(0, E.nextT - E.t0) / P.FD.buildSecs;
        }
        reap(E.nextT);
        const ev = P.plan(E.track, st(), E.step);
        for (const e of ev) {
          if (!offline && E.live.length > 88 && (e.v === 'drip' || e.v === 'hat' || e.v === 'cricket' || e.v === 'bubble' || e.v === 'bird' || e.v === 'snare')) continue;
          fire(e, E.nextT);
        }
        E.nextT += 60 / P.bpmOf(E.track, st()) / 2;
        E.step++;
      }
      reap(now);
    }

    function playFrom(at) {
      E.on = true;
      E.step = 0;
      E.nextT = at + 0.06;
      E.t0 = E.nextT;
      if (E.track !== 'dawn') E.progress = 0;
      if (E.progressBase == null) E.progressBase = E.progress;
      if (E.sleepMin > 0 && E.sleepLeft == null) E.sleepLeft = E.sleepMin * 60;
      if (E.sleepMin > 0) E.sleepLast = at;
      const meta = trackMeta();
      music.gain.setValueAtTime(0.0001, at);
      music.gain.linearRampToValueAtTime(meta.gain * 0.8, at + 0.5);
      master.gain.setTargetAtTime(E.volume * 0.9, at, 0.05);
      padF.frequency.setValueAtTime(P.padFilterHz(E.track, st()), at);
      startExtras(at, offline ? E.renderUntil : 0);
    }

    function scheduleOffline(duration) {
      E.renderUntil = duration + 0.8;
      playFrom(0);
      pulse(0);
      stopExtras(duration + 0.15);
    }

    function startLive() {
      if (E.on) return;
      playFrom(ctx.currentTime);
      if (!E.timer && !offline) E.timer = setInterval(() => pulse(ctx.currentTime), 50);
    }
    function pauseLive() {
      if (!E.on) return;
      const now = ctx.currentTime;
      E.on = false;
      if (E.sleepLast) {
        E.sleepLeft = Math.max(0, (E.sleepLeft || 0) - (now - E.sleepLast));
        E.sleepLast = 0;
      }
      music.gain.setTargetAtTime(0.0001, now, 0.08);
      if (E.timer) { clearInterval(E.timer); E.timer = null; }
      setTimeout(() => {
        stopAllVoices(ctx.currentTime);
        stopExtras(ctx.currentTime);
      }, 280);
    }
    function toggle() {
      if (E.on) pauseLive(); else startLive();
    }
    function setTrack(id, variant) {
      if (P.TRACKS.every((t) => t.id !== id)) return;
      const was = E.on;
      const now = ctx.currentTime;
      if (was) {
        music.gain.setTargetAtTime(0.0001, now, 0.05);
        stopAllVoices(now + 0.02);
        stopExtras(now + 0.02);
      }
      E.track = id;
      if (variant) E.variant = variant;
      if (id !== 'dawn') E.progress = 0;
      E.progressBase = E.progress;
      E.t0 = null;
      E.step = 0;
      if (was) playFrom(now + 0.12);
    }
    function setVariant(v) {
      if (v !== 'leaf' && v !== 'star') return;
      if (E.variant === v) return;
      setTrack(E.track, v);
    }
    function setVolume(v) {
      E.volume = Math.max(0, Math.min(1, v));
      master.gain.setTargetAtTime(E.volume * 0.9, ctx.currentTime, 0.05);
    }
    function setSleep(min) {
      E.sleepMin = min;
      E.sleepLeft = min > 0 ? min * 60 : 0;
      E.sleepLast = (min > 0 && E.on) ? ctx.currentTime : 0;
    }
    function setProgress(p) {
      E.progress = p;
      E.progressBase = p;
      E.t0 = E.nextT || ctx.currentTime;
    }
    function dispose() {
      if (E.timer) clearInterval(E.timer);
      E.timer = null;
      E.on = false;
      try { stopAllVoices(ctx.currentTime); stopExtras(ctx.currentTime); } catch (e) {}
    }

    if (!offline) {
      // timer starts on first play
    }

    return {
      E: E,
      start: startLive,
      pause: pauseLive,
      toggle: toggle,
      setTrack: setTrack,
      setVariant: setVariant,
      setVolume: setVolume,
      setSleep: setSleep,
      setProgress: setProgress,
      scheduleOffline: scheduleOffline,
      dispose: dispose,
      pulse: pulse,
      get playing() { return E.on; },
      get track() { return E.track; },
      get variant() { return E.variant; },
      get progress() { return E.progress; },
      get volume() { return E.volume; },
      get sleepLeft() {
        if (!E.sleepMin || !E.sleepLeft) return 0;
        if (!E.on || !E.sleepLast) return E.sleepLeft;
        return Math.max(0, E.sleepLeft - (ctx.currentTime - E.sleepLast));
      },
    };
  }

  async function renderOffline(opts) {
    const seconds = opts.seconds || 30;
    const sr = opts.sampleRate || 44100;
    const C = (typeof OfflineAudioContext !== 'undefined')
      ? OfflineAudioContext
      : (root.OfflineAudioContext || root.webkitOfflineAudioContext);
    const ctx = new C(2, Math.ceil(sr * seconds), sr);
    const eng = create(ctx, {
      offline: true,
      track: opts.track,
      variant: opts.variant,
      seed: opts.seed || 11,
      volume: opts.volume == null ? 0.85 : opts.volume,
      progress: opts.progress == null ? 0 : opts.progress,
    });
    eng.scheduleOffline(seconds);
    const buf = await ctx.startRendering();
    return buf;
  }

  function analyse(buf) {
    const n = buf.length, ch = buf.numberOfChannels;
    let peak = 0, sum = 0, absSum = 0;
    for (let c = 0; c < ch; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) {
        const x = d[i], a = Math.abs(x);
        if (a > peak) peak = a;
        sum += x * x;
        absSum += a;
      }
    }
    const samples = n * ch;
    const rms = Math.sqrt(sum / samples);
    const peakDb = peak > 0 ? 20 * Math.log10(peak) : -Infinity;
    const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
    return {
      peak: peak,
      rms: rms,
      peakDb: peakDb,
      rmsDb: rmsDb,
      clipping: peak >= 0.8912509381337456, // -1 dBFS
      silent: rms < 0.00056, // ~ -65 dBFS
      duration: buf.duration,
      sampleRate: buf.sampleRate,
      channels: ch,
    };
  }

  function encodeWav(buf) {
    const n = buf.length, ch = buf.numberOfChannels, sr = buf.sampleRate;
    const dataLen = n * ch * 2;
    const out = new ArrayBuffer(44 + dataLen);
    const v = new DataView(out);
    const w = (off, s) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + dataLen, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * ch * 2, true);
    v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
    w(36, 'data'); v.setUint32(40, dataLen, true);
    const chans = [];
    for (let c = 0; c < ch; c++) chans.push(buf.getChannelData(c));
    let o = 44;
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < ch; c++) {
        let x = chans[c][i];
        if (x > 1) x = 1; else if (x < -1) x = -1;
        v.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7fff, true);
        o += 2;
      }
    }
    return new Uint8Array(out);
  }

  const api = { create: create, renderOffline: renderOffline, analyse: analyse, encodeWav: encodeWav };
  root.RADIO_ENG = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
