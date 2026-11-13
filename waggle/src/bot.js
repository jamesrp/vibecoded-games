// Scripted players for tests, balance and the in-browser ?auto= demo. Deterministic given (world, profile).
(function (root) {
  'use strict';
  const WG = root.WG || (typeof require !== 'undefined' ? require('./core.js') : null);
  // sA: run angle noise (deg), sT: duration noise (fraction), bias: constant angle mistake (deg),
  // runs: runs per dance, view: how far the bot can see flowers, sunLag: uses the sun azimuth from N seconds ago
  const PROFILES = {
    perfect: { sA: 0, sT: 0, runs: 2, view: 480, wait: 0, scent: 1, dodge: 1 },
    expert:  { sA: 5, sT: 0.07, runs: 2, view: 460, wait: 10, scent: 1, dodge: 1 },
    learner: { sA: 12, sT: 0.15, runs: 3, view: 420, wait: 20, scent: 0.8, dodge: 0.8 },
    kid:     { sA: 22, sT: 0.25, runs: 3, view: 380, wait: 40, scent: 0.5, dodge: 0.6 },
    sloppy:  { sA: 40, sT: 0.4, runs: 3, view: 380, wait: 40, scent: 0.5, dodge: 0.6 },
    random:  { sA: 1e9, sT: 0.6, runs: 3, view: 380, wait: 40, scent: 0.5, dodge: 0.6 },
    noSun:   { sA: 5, sT: 0.07, runs: 2, view: 460, wait: 10, noSun: true, scent: 1, dodge: 1 }, // forgets to correct for the sun (dances compass bearing)
    noScent: { sA: 5, sT: 0.07, runs: 2, view: 460, wait: 10, scent: 0, dodge: 1 },               // expert dancer who never follows scent
  };
  function makeBot(profile, seed) {
    const P = typeof profile === 'string' ? PROFILES[profile] : profile;
    const r = WG.rng((seed || 1) * 31 + 7);
    const g = () => WG.gauss(r);
    const B = { P, phase: 'scout', goal: null, runsLeft: 0, hold: 0, wait: 0, heading: 0, way: null, danced: new Set(), wayI: 0 };
    // following a scent plume: the bot notices it with probability P.scent (decided once per plume)
    B.sniff = function (W, s) { const sc = WG.scentAt(W, s.x, s.y); if (!sc) { B.sniffed = null; return false; } const key = sc.p.id; if (B.noticed[key] == null) B.noticed[key] = r() < P.scent; if (!B.noticed[key]) return false; B.sniffed = sc; return true; };
    B.noticed = {};
    B.input = function (W) {
      const s = W.scout, inp = {};
      if (s.mode === 'fly') {
        const cand = W.patches.filter((p) => WG.blooming(W, p) && p.seen && !W.memory.some((m) => m.id === p.id) && WG.dist(p, s) < P.view && (p.nectar > p.max * 0.35));
        let tx, ty;
        const lateDay = W.t > WG.C.DAY_LEN - 20 * 60;
        const idleN = W.foragers.filter((f) => f.state === 'idle' && !(f.rest > 0)).length;
        const wantHome = W.memory.some((m) => !B.danced.has(m.id + ':' + W.day)) && (W.memory.length >= 2 || !cand.length || lateDay) && idleN >= 6 && !WG.raining(W);
        if (wantHome && !s.left && Math.hypot(s.x, s.y) < 70) { const o = WG.fromBearing(s.dir || 0, 200); tx = o.x; ty = o.y; }
        else if (wantHome) { tx = 0; ty = 0; }
        else if (cand.length) { cand.sort((a, b) => WG.dist(a, s) - WG.dist(b, s)); tx = cand[0].x; ty = cand[0].y; }
        else if (B.sniff(W, s)) { const w = WG.fromBearing(W.wind, 1), sc = B.sniffed; const k = (s.x - sc.p.x) * w.x + (s.y - sc.p.y) * w.y; tx = s.x - w.x * 120 + (sc.p.x + w.x * k - s.x) * 0.8; ty = s.y - w.y * 120 + (sc.p.y + w.y * k - s.y) * 0.8; }
        else {
          if (W.frame % 120 === 0) { if (B.lastPos && Math.hypot(B.lastPos.x - s.x, B.lastPos.y - s.y) < 30) B.way = null; B.lastPos = { x: s.x, y: s.y }; }
          for (let k = 0; k < 12 && (!B.way || Math.hypot(B.way.x - s.x, B.way.y - s.y) < 40 || W.nests.some((n) => WG.dist(n, B.way) < 300)); k++) { B.wayI++; const b = (B.wayI * 137.5) % 360, d = 300 + (B.wayI * 211) % 600; B.way = WG.fromBearing(b, d); }
          tx = B.way.x; ty = B.way.y;
        }
        // avoid wasp nests a little
        let ax = tx - s.x, ay = ty - s.y; const m = Math.hypot(ax, ay) || 1; ax /= m; ay /= m;
        for (const n of W.nests) { const dx = s.x - n.x, dy = s.y - n.y, d = Math.hypot(dx, dy) || 1; if (d < 300) { const k = P.dodge * 2.2 * (1 - d / 300) + 0.4; ax += dx / d * k; ay += dy / d * k; } }
        for (const w of W.wasps) if ((w.state === 'chase' || w.state === 'alert') && (B.dodging = B.dodging || r() < P.dodge * 0.04)) { const n = W.nests[w.nest], dx = s.x - n.x, dy = s.y - n.y, d = Math.hypot(dx, dy) || 1; ax = dx / d * 3; ay = dy / d * 3; }
        if (!W.wasps.some((w) => w.state === 'chase' || w.state === 'alert')) B.dodging = false;
        inp.ax = ax; inp.ay = ay;
        B.phase = 'scout';
        return inp;
      }
      // in the hive: dance each remembered flower that has not been danced today
      const d = W.dance;
      if (d.loop > 0) return inp;
      if (B.hold > 0) { B.hold--; inp.hold = true; inp.heading = B.heading; return inp; }
      if (B.wait > 0) { B.wait--; return inp; }
      if (B.runsLeft > 0 && !W.foragers.some((f) => f.state === 'idle' && !(f.rest > 0))) B.runsLeft = 0;
      if (B.runsLeft > 0) {
        const m = W.memory.find((q) => q.id === B.goal);
        if (!m) { B.runsLeft = 0; return inp; }
        const az = P.noSun ? 0 : WG.sunNow(W);
        const ideal = WG.danceFor(m, az);
        B.heading = ideal.angle + (P.sA > 1e6 ? r() * 360 : g() * P.sA) + (P.bias || 0);
        B.hold = Math.max(13, Math.round(ideal.dur * 60 * (1 + g() * P.sT)));
        B.runsLeft--; B.wait = P.wait;
        inp.heading = B.heading; return inp; // turn first, hold from next frame
      }
      const key = (q) => q.id + ':' + W.day + ':' + Math.floor(W.t / (40 * 60));
      for (const q of W.memory) { const p = W.patches.find((pp) => pp.id === q.id); if (p && WG.blooming(W, p) && p.nectar > p.max * 0.3 && !B.danced.has(key(q))) { B.danced.delete(q.id + ':' + W.day); B.danced.add(key(q)); } }
      const next = W.memory.findIndex((q) => !B.danced.has(q.id + ':' + W.day));
      const idle = W.foragers.filter((f) => f.state === 'idle' && !(f.rest > 0)).length;
      if (next >= 0 && idle > 0 && !WG.raining(W)) { const m = W.memory[next]; B.goal = m.id; B.danced.add(m.id + ':' + W.day); B.runsLeft = P.runs; inp.sel = next; return inp; }
      if (WG.raining(W) && W.memory.some((q) => !B.danced.has(q.id + ':' + W.day))) return inp; // wait out the shower
      inp.exit = true; return inp;
    };
    return B;
  }
  function playSeason(opts) {
    const W = WG.create(opts), B = makeBot(opts.bot || 'expert', opts.seed);
    let guard = 0;
    while (W.state !== 'end' && guard++ < 1e7) { if (W.state === 'night') WG.nextDay(W); WG.step(W, B.input(W)); W.events.length = 0; }
    return W;
  }
  const API = { PROFILES, makeBot, playSeason };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.WGBot = API;
})(typeof window !== 'undefined' ? window : globalThis);
