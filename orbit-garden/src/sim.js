// ORBIT GARDEN gravity sim. Pure and deterministic (only + - * / and sqrt, own Taylor trig), shared by
// the browser and Node (tests, solver). World is 1200x800 units; one sim step = 1/120 s.
(function (root) {
  'use strict';
  const W = 1200, H = 800, HZ = 120;
  const K = 0.12;          // surface gravity of a plain planet (units/step^2); mu = K * r^2
  const TREE_MASS = 3.5;   // tree forests multiply a planet's pull
  const BOUNCE_E = 0.9;    // flower forests bounce pods
  const VINE_REACH = 240;  // surface-to-surface reach of a vine
  const SKIP = 0.5;        // a pod grazing a planet (|v_normal| < SKIP*|v|) skips off it, seeding it on the way
  const SKIP_N = 0.55, SKIP_T = 0.92; // normal / tangential restitution of a skip
  const POD_R = 6, SOFT = 25, MARGIN = 60, MAX_STEPS = 960;
  const MIN_SPEED = 0.6, MAX_SPEED = 2.6, ANG_STEPS = 1440, PMAX = 100;
  const SEEDS = ['T', 'F', 'V'];
  const PI = 3.141592653589793;

  function tsin(x) { let t = x, s = x; const x2 = x * x; for (let n = 1; n < 14; n++) { t *= -x2 / ((2 * n) * (2 * n + 1)); s += t; } return s; }
  function tcos(x) { let t = 1, s = 1; const x2 = x * x; for (let n = 1; n < 14; n++) { t *= -x2 / ((2 * n - 1) * (2 * n)); s += t; } return s; }
  const DIR = [];
  for (let a = 0; a < ANG_STEPS; a++) { let th = (a / ANG_STEPS) * 2 * PI; if (th > PI) th -= 2 * PI; DIR.push([tcos(th), tsin(th)]); }
  const speedOf = (p) => MIN_SPEED + (MAX_SPEED - MIN_SPEED) * p / PMAX;

  // Level: { id, name, launch:[x,y], planets:[{x,y,r,f?:'T'|'F'|'V', rock?:1}], suns:[{x,y,r}], pouch:{T,F,V}, tethers? }
  function init(level) {
    const f = level.planets.map((p) => p.f || '');
    return { f, tethers: (level.tethers || []).map((t) => t.slice()), pouch: Object.assign({ T: 0, F: 0, V: 0 }, level.pouch), used: 0 };
  }
  function clone(s) { return { f: s.f.slice(), tethers: s.tethers.map((t) => t.slice()), pouch: Object.assign({}, s.pouch), used: s.used }; }
  function mu(p, forest) { return p.rock ? K * 0.5 * p.r * p.r : K * p.r * p.r * (forest === 'T' ? TREE_MASS : 1); }
  function bodies(level, s) {
    const b = level.planets.map((p, i) => ({ x: p.x, y: p.y, r: p.r, mu: mu(p, s.f[i]), kind: p.rock ? 'rock' : 'planet', i, bouncy: s.f[i] === 'F', need: !p.rock && !(!!s.f[i] && (!p.w || p.w === s.f[i])) }));
    for (const u of level.suns || []) b.push({ x: u.x, y: u.y, r: u.r, mu: K * 1.6 * u.r * u.r, kind: 'sun', i: -1, bouncy: false });
    return b;
  }
  function flight(level, s, shot) {
    const d = DIR[((shot.a % ANG_STEPS) + ANG_STEPS) % ANG_STEPS], sp = speedOf(shot.p);
    return { x: level.launch[0], y: level.launch[1], vx: d[0] * sp, vy: d[1] * sp, t: 0, done: false, out: null, bounces: [], skips: [], B: bodies(level, s), assist: level.assist || 0 };
  }
  // Advance one step. Sets fl.out = {type:'land'|'burn'|'rock'|'lost'|'fizzle', i} when done.
  function step(fl) {
    if (fl.done) return fl;
    const B = fl.B; let ax = 0, ay = 0;
    for (let k = 0; k < B.length; k++) {
      const b = B[k], dx = b.x - fl.x, dy = b.y - fl.y, d2 = dx * dx + dy * dy + SOFT, inv = b.mu / (d2 * Math.sqrt(d2));
      ax += dx * inv; ay += dy * inv;
    }
    fl.vx += ax; fl.vy += ay; fl.x += fl.vx; fl.y += fl.vy; fl.t++;
    for (let k = 0; k < B.length; k++) {
      const b = B[k], dx = fl.x - b.x, dy = fl.y - b.y, d2 = dx * dx + dy * dy, rr = b.r + POD_R + (fl.assist && b.need && !b.bouncy ? fl.assist : 0);
      if (d2 >= rr * rr) continue;
      if (b.kind === 'sun') { fl.done = true; fl.out = { skips: fl.skips, type: 'burn', i: -1 }; return fl; }
      if (b.kind === 'rock') { fl.done = true; fl.out = { skips: fl.skips, type: 'rock', i: b.i }; return fl; }
      if (b.bouncy) {
        const d = Math.sqrt(d2) || 1, nx = dx / d, ny = dy / d, vn = fl.vx * nx + fl.vy * ny;
        if (vn < 0) { fl.vx -= (1 + BOUNCE_E) * vn * nx; fl.vy -= (1 + BOUNCE_E) * vn * ny; fl.bounces.push({ i: b.i, t: fl.t, x: b.x + nx * b.r, y: b.y + ny * b.r }); }
        fl.x = b.x + nx * rr; fl.y = b.y + ny * rr;
        continue;
      }
      const d = Math.sqrt(d2) || 1, nx = dx / d, ny = dy / d, vn = fl.vx * nx + fl.vy * ny;
      const v2 = fl.vx * fl.vx + fl.vy * fl.vy;
      if (!fl.assist && vn < 0 && vn * vn < SKIP * SKIP * v2 && !fl.skips.some((k) => k.i === b.i)) {
        // grazing touch: skip like a stone on a pond, leaving seeds behind
        const tx = fl.vx - vn * nx, ty = fl.vy - vn * ny;
        fl.vx = tx * SKIP_T - vn * SKIP_N * nx; fl.vy = ty * SKIP_T - vn * SKIP_N * ny;
        fl.x = b.x + nx * rr; fl.y = b.y + ny * rr;
        fl.skips.push({ i: b.i, t: fl.t, nx, ny });
        continue;
      }
      fl.done = true; fl.out = { skips: fl.skips, type: 'land', i: b.i, nx, ny }; return fl;
    }
    if (fl.x < -MARGIN || fl.x > W + MARGIN || fl.y < -MARGIN || fl.y > H + MARGIN) { fl.done = true; fl.out = { skips: fl.skips, type: 'lost', i: -1 }; return fl; }
    if (fl.t >= MAX_STEPS) { fl.done = true; fl.out = { skips: fl.skips, type: 'fizzle', i: -1 }; }
    return fl;
  }
  function fly(level, s, shot, path) {
    const fl = flight(level, s, shot);
    while (!fl.done) { step(fl); if (path) path.push(fl.x, fl.y); }
    return fl;
  }
  // Where a vine from planet i reaches: nearest other planet (surface distance) within reach that isn't tethered to i yet.
  function vineTarget(level, s, i) {
    const P = level.planets, a = P[i]; let best = -1, bd = Infinity;
    for (let j = 0; j < P.length; j++) {
      if (j === i || P[j].rock) continue;
      if (s.tethers.some((t) => (t[0] === i && t[1] === j) || (t[0] === j && t[1] === i))) continue;
      const dx = P[j].x - a.x, dy = P[j].y - a.y, d = Math.sqrt(dx * dx + dy * dy) - a.r - P[j].r;
      if (d <= VINE_REACH && d < bd) { bd = d; best = j; }
    }
    return best;
  }
  // Apply a finished flight. Returns { state, events:[{type,...}] }.
  function apply(level, s0, shot, out) {
    const s = clone(s0), ev = [];
    s.pouch[shot.s]--; s.used++;
    const touched = (out.skips || []).map((k) => ({ i: k.i, nx: k.nx, ny: k.ny, skip: true }));
    if (out.type === 'land') touched.push({ i: out.i, nx: out.nx, ny: out.ny });
    for (const tc of touched) {
      const i = tc.i, prev = s.f[i];
      if (prev === shot.s) { ev.push({ type: 'touch', i, skip: !!tc.skip, nx: tc.nx, ny: tc.ny }); continue; }
      s.f[i] = shot.s;
      ev.push({ type: prev ? 'replant' : 'green', i, seed: shot.s, prev, skip: !!tc.skip, nx: tc.nx, ny: tc.ny });
      if (shot.s === 'V') {
        const j = vineTarget(level, s, i);
        if (j >= 0) { s.tethers.push([i, j]); const pj = s.f[j]; if (!pj) s.f[j] = 'V'; ev.push({ type: 'vine', i, j, greened: !pj }); }
      }
    }
    if (out.type !== 'land') ev.push({ type: out.type });
    return { state: s, events: ev };
  }
  function shoot(level, s, shot, path) { const fl = fly(level, s, shot, path); const r = apply(level, s, shot, fl.out); r.out = fl.out; r.steps = fl.t; r.bounces = fl.bounces; return r; }
  // A planet may wish for a forest type (p.w = 'T'|'F'|'V'); no wish = any forest will do.
  function happy(p, f) { return !!f && (!p.w || p.w === f); }
  function won(level, s) { return level.planets.every((p, i) => p.rock || happy(p, s.f[i])); }
  function remaining(s) { return s.pouch.T + s.pouch.F + s.pouch.V; }
  function key(s) { return s.f.map((x) => x || '.').join('') + '|' + s.tethers.map((t) => t.join('-')).sort().join(',') + '|' + s.pouch.T + s.pouch.F + s.pouch.V; }

  const api = { W, H, HZ, K, TREE_MASS, BOUNCE_E, VINE_REACH, POD_R, MAX_STEPS, ANG_STEPS, PMAX, SEEDS, DIR, speedOf, init, clone, bodies, mu, flight, step, fly, vineTarget, apply, shoot, won, happy, remaining, key };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.OG = api;
})(typeof window !== 'undefined' ? window : globalThis);
