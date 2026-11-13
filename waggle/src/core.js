// WAGGLE core simulation: deterministic, seeded, no DOM. Works in browser (window.WG) and Node (require).
(function (root) {
  'use strict';
  const FPS = 60, DT = 1 / FPS;
  const C = {
    DAY_LEN: 150 * FPS, DAYS: 7, MEADOW_R: 1050,
    PULSE_SEC: 0.25, PULSE_DIST: 75,           // one buzz = 0.25 s = 75 units
    SCOUT_SPEED: 210, FORAGER_SPEED: 150, RIVAL_SPEED: 140,
    HIVE_R: 30, WAGGLE_SPEED: 55, LOOP_SEC: 0.75, MIN_RUN: 0.2,
    SIP_SEC: 1.4, TURN_RATE: 150, TRIPS: 3, REST_SEC: 25,
    REVEAL_R: 30, WASP_WARN: 24, SCENT_LEN: 430,                // hidden flowers: seen within REVEAL_R; scent plume drifts downwind
  };
  const DIFFS = {
    easy:   { foragers: 30, noiseA: 3, noiseD: 0.05, search: 95, hidden: 0.3, wasp: 150, waspScare: 0, rivalBase: 2, rivalGrow: 1, target: 1150, bubble: true, guide: true, counts: true, recruitPerRun: 6 },
    normal: { foragers: 30, noiseA: 4, noiseD: 0.06, search: 70, hidden: 0.45, wasp: 205, waspScare: 0.5, rivalBase: 4, rivalGrow: 2, target: 1650, bubble: true, guide: false, counts: true, recruitPerRun: 6 },
    hard:   { foragers: 30, noiseA: 5, noiseD: 0.07, search: 55, hidden: 0.55, wasp: 230, waspScare: 0.8, rivalBase: 6, rivalGrow: 3, target: 1800, bubble: false, guide: false, counts: false, recruitPerRun: 6 },
  };
  // season flowers: [name, petal colour, centre colour, quality]
  const SPECIES = [
    ['clover', '#f4e9f0', '#e7a5c4', 1], ['dandelion', '#ffd23f', '#f2a400', 1], ['bluebell', '#7f8cf0', '#4b4fbf', 2],
    ['poppy', '#ff5a3c', '#2a1a1a', 2], ['lavender', '#a77be0', '#7a4fc0', 3], ['sunflower', '#ffc21a', '#6b3a12', 3],
    ['aster', '#c48af0', '#ffcc33', 2], ['heather', '#e07ab8', '#b04a8a', 3],
  ];
  const SEASON = [[0, 1, 2], [0, 1, 2, 3], [2, 3, 4], [3, 4, 5], [4, 5, 6], [5, 6, 7], [6, 7, 1]];

  function rng(seed) { let a = seed >>> 0 || 1; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function gauss(r) { let u = 0, v = 0; while (u === 0) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  const wrap = (a) => ((a % 360) + 540) % 360 - 180;           // to (-180,180]
  const wrap360 = (a) => ((a % 360) + 360) % 360;
  const rad = (d) => d * Math.PI / 180;
  const bearing = (dx, dy) => wrap360(Math.atan2(dx, -dy) * 180 / Math.PI); // compass, screen y down
  const fromBearing = (b, d) => ({ x: Math.sin(rad(b)) * d, y: -Math.cos(rad(b)) * d });
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function sunAz(dayFrac) { return 90 + 180 * Math.max(0, Math.min(1, dayFrac)); }
  // what a perfect scout dances for a target point at a given sun azimuth
  function danceFor(p, az) { const d = Math.hypot(p.x, p.y); return { angle: wrap(bearing(p.x, p.y) - az), dur: d / C.PULSE_DIST * C.PULSE_SEC }; }
  // what a forager reads from a run
  function decode(run, az) { const b = wrap360(az + run.angle), d = run.dur / C.PULSE_SEC * C.PULSE_DIST; return Object.assign(fromBearing(b, d), { bearing: b, dist: d }); }

  function genDay(W, day) {
    const r = W.rng, sp = SEASON[Math.min(day, SEASON.length - 1)];
    const n = 5 + (r() < 0.5 ? 1 : 0) + (day >= 3 ? 1 : 0);
    const near = Math.max(0, 2 - day);                  // early days: some easy close patches
    for (let i = 0; i < n; i++) {
      let p, tries = 0;
      do {
        const lo = i < near ? 160 : 220 + day * 40, hi = i < near ? 420 : Math.min(980, 560 + day * 70);
        p = fromBearing(r() * 360, lo + r() * (hi - lo)); tries++;
      } while (tries < 40 && (W.patches.some((q) => q.wilt >= day && dist(p, q) < 170) || W.nests.some((nst) => dist(p, nst) < 160) || dist(p, W.rival) < 220));
      const s = sp[Math.floor(r() * sp.length)], hidden = i >= near && r() < W.D.hidden, q = Math.min(3, SPECIES[s][3] + (hidden ? 1 : 0));
      W.patches.push({ id: W.nextId++, x: p.x, y: p.y, r: 34 + r() * 22, species: s, q, nectar: 0, max: 16 + Math.floor(r() * 12) + q * 4 + (hidden ? 22 : 0), bloom: day, wilt: day + 1, seed: Math.floor(r() * 1e9), hidden, seen: !hidden, rivalSips: 0 });
    }
    for (const p of W.patches) if (p.bloom === day) p.nectar = p.max;
    // weather: some days get a shower
    W.wind = r() * 360;                                 // scent drifts toward this bearing today
    W.rain = W.tomorrowRain ? [W.tomorrowRain] : [];
    W.tomorrowRain = null;
    W.rivalCount = W.noRivals ? 0 : W.D.rivalBase + W.D.rivalGrow * day;
    while (W.rivals.length < W.rivalCount) W.rivals.push({ x: W.rival.x, y: W.rival.y, state: 'home', t: Math.floor(r() * 300), patch: -1 });
  }

  function create(opts) {
    opts = opts || {};
    const seed = opts.seed == null ? 1 : opts.seed, diff = opts.diff || 'normal', D = DIFFS[diff];
    const r = rng(seed * 7919 + 13);
    const W = { seed, diff, D, rng: r, day: 0, t: 0, frame: 0, state: 'play', honey: 0, target: D.target, nextId: 1,
      patches: [], nests: [], wasps: [], rivals: [], foragers: [], events: [], rain: [], memory: [], sel: 0,
      stats: { rivalSips: 0, reveals: 0, runs: 0, recruits: 0, finds: 0, misses: 0, angErr: [], distErr: [], stung: 0, scared: 0, honeyByDay: [] },
      tutorial: !!opts.tutorial, noRivals: !!opts.noRivals };
    const rb = r() * 360; W.rival = fromBearing(rb, 880);
    const nn = opts.tutorial ? 0 : 2 + (diff === 'hard' ? 1 : 0);
    for (let i = 0; i < nn; i++) {
      let p, k = 0; do { p = fromBearing(r() * 360, 380 + r() * 520); k++; } while (k < 50 && (dist(p, W.rival) < 300 || W.nests.some((q) => dist(p, q) < 400)));
      W.nests.push(p);
      for (let j = 0; j < 2; j++) W.wasps.push({ nest: i, x: p.x, y: p.y, vx: 0, vy: 0, state: 'hover', t: 20 + j * 30, tx: p.x, ty: p.y });
    }
    if (W.tutorial) { W.rivalOff = true; }
    for (let i = 0; i < D.foragers; i++) W.foragers.push({ id: i, state: 'idle', x: 0, y: 0, tx: 0, ty: 0, patch: -1, t: 0, carry: 0 });
    W.scout = { x: 0, y: 40, vx: 0, vy: 0, mode: 'fly', stun: 0, inv: 60, left: false, dir: 0 };
    W.dance = { x: 0, y: 0, h: 0, run: null, loop: 0, side: 1, sx: 0, sy: 0, last: null };
    if (W.tutorial) { W.t = Math.floor(C.DAY_LEN * 0.3); setupTutorial(W, 0); } else genDay(W, 0);
    return W;
  }

  function setupTutorial(W, step) {
    W.patches = []; W.rain = []; W.rivalCount = 0;
    const az = sunAz(W.t / C.DAY_LEN);
    const b = step === 0 ? az : az + 90, d = step === 0 ? 300 : 375;
    const p = fromBearing(b, d);
    W.patches.push({ id: W.nextId++, x: p.x, y: p.y, r: 60, species: step === 0 ? 1 : 0, q: 2, nectar: 30, max: 30, bloom: 0, wilt: 99, seed: 7 + step, hidden: false, seen: true, rivalSips: 0 });
    W.tutStep = step; W.tutTarget = W.patches[0].id;
  }

  // Scent plume of an unseen hidden patch: a cone drifting downwind (W.wind). Returns { p, k } with k in (0,1], strongest near the flowers.
  function scentAt(W, x, y) {
    const w = fromBearing(W.wind || 0, 1); let best = null;
    for (const p of W.patches) {
      if (p.seen || !blooming(W, p)) continue;
      const dx = x - p.x, dy = y - p.y, along = dx * w.x + dy * w.y, lat = Math.abs(-dx * w.y + dy * w.x);
      if (along < -30 || along > C.SCENT_LEN || lat > 45 + along * 0.28) continue;
      const k = (1 - Math.max(0, along) / C.SCENT_LEN) * (1 - lat / (45 + Math.max(0, along) * 0.28) * 0.5);
      if (!best || k > best.k) best = { p, k };
    }
    return best;
  }
  const sunNow = (W) => sunAz(W.t / C.DAY_LEN);
  const raining = (W) => W.rain.some(([a, b]) => W.t >= a && W.t < b);
  const blooming = (W, p) => p.bloom <= W.day && p.wilt >= W.day && p.nectar > 0;
  function emit(W, type, o) { W.events.push(Object.assign({ type }, o || {})); }

  function remember(W, p) {
    const m = W.memory.find((q) => q.id === p.id);
    if (m) return;
    p.seen = true;
    W.memory.unshift({ id: p.id, species: p.species, x: p.x, y: p.y, t: W.t });
    if (W.memory.length > 3) W.memory.pop();
    W.sel = 0; W.stats.finds++;
    emit(W, 'found', { id: p.id, x: p.x, y: p.y, buzzes: Math.round(Math.hypot(p.x, p.y) / C.PULSE_DIST) });
  }

  function stepScout(W, inp) {
    const s = W.scout, D = W.D;
    if (s.mode !== 'fly') return;
    if (s.inv > 0) s.inv--;
    if (s.stun > 0) { s.stun--; s.x += s.vx * DT; s.y += s.vy * DT; s.vx *= 0.93; s.vy *= 0.93; return; }
    let ax = (inp && inp.ax) || 0, ay = (inp && inp.ay) || 0; const m = Math.hypot(ax, ay); if (m > 1) { ax /= m; ay /= m; }
    const sp = C.SCOUT_SPEED * (raining(W) ? 0.6 : 1);
    s.vx += (ax * sp - s.vx) * 0.12; s.vy += (ay * sp - s.vy) * 0.12;
    s.x += s.vx * DT; s.y += s.vy * DT;
    const rr = Math.hypot(s.x, s.y); if (rr > C.MEADOW_R) { s.x *= C.MEADOW_R / rr; s.y *= C.MEADOW_R / rr; }
    if (Math.hypot(s.vx, s.vy) > 20) s.dir = bearing(s.vx, s.vy);
    if (rr > C.HIVE_R + 30) s.left = true;
    for (const p of W.patches) if (blooming(W, p)) {
      const dd = dist(s, p);
      if (!p.seen && dd < p.r + C.REVEAL_R) { p.seen = true; W.stats.reveals++; emit(W, 'reveal', { id: p.id, x: p.x, y: p.y }); }
      if (dd < p.r + 8) remember(W, p);
    }
    if (s.left && rr < C.HIVE_R) { s.mode = 'hive'; s.left = false; W.dance.x = 0; W.dance.y = 0; W.dance.run = null; W.dance.loop = 0; W.dance.prev = null; W.dance.combo = 0; emit(W, 'enter'); }
  }

  function exitHive(W) {
    const s = W.scout; if (s.mode !== 'hive') return;
    endRun(W);
    s.mode = 'fly'; const p = fromBearing(s.dir || 180, C.HIVE_R + 14); s.x = p.x; s.y = p.y; s.vx = 0; s.vy = 0; s.inv = 60; s.left = false;
    emit(W, 'exit');
  }

  function stepDance(W, inp) {
    const d = W.dance; inp = inp || {};
    if (W.scout.mode !== 'hive') return;
    if (inp.sel != null && W.memory[inp.sel]) W.sel = inp.sel;
    if (d.loop > 0) { // automatic return loop back to the run start: semicircle on alternating side
      d.loop--; const k = 1 - d.loop / (C.LOOP_SEC * FPS);
      const ex = d.lx, ey = d.ly, cx = (ex + d.sx) / 2, cy = (ey + d.sy) / 2, rr = Math.hypot(ex - d.sx, ey - d.sy) / 2;
      const a0 = Math.atan2(ey - cy, ex - cx), a = a0 + d.side * Math.PI * k;
      d.x = cx + Math.cos(a) * rr; d.y = cy + Math.sin(a) * rr;
      d.h = wrap360(bearing(-Math.sin(a) * d.side, Math.cos(a) * d.side));
      if (d.loop === 0) { d.x = d.sx; d.y = d.sy; d.h = d.lastH; }
      return;
    }
    if (inp.heading != null) d.h = wrap360(inp.heading);
    else if (inp.turn) d.h = wrap360(d.h + inp.turn * C.TURN_RATE * DT);
    if (inp.hold) {
      if (!d.run) { d.run = { t: 0, x0: d.x, y0: d.y, h0: d.h }; d.sx = d.x; d.sy = d.y; emit(W, 'runStart'); }
      d.run.t++;
      const v = fromBearing(d.h, C.WAGGLE_SPEED * DT); d.x += v.x; d.y += v.y;
      if (d.run.t % (C.PULSE_SEC * FPS) === 0) emit(W, 'buzz', { n: d.run.t / (C.PULSE_SEC * FPS) });
      if (d.run.t > 16 * C.PULSE_SEC * FPS) endRun(W); // cap ~ 16 buzzes
    } else if (d.run) endRun(W);
  }

  function endRun(W) {
    const d = W.dance, run = d.run; if (!run) return; d.run = null;
    const dur = run.t * DT;
    const dx = d.x - run.x0, dy = d.y - run.y0;
    if (dur < C.MIN_RUN || Math.hypot(dx, dy) < 1) { d.x = run.x0; d.y = run.y0; emit(W, 'runShort'); return; }
    const angle = wrap(bearing(dx, dy)), az = sunNow(W);
    const tgt = decode({ angle, dur }, az);
    d.last = { angle, dur, az, tx: tgt.x, ty: tgt.y, t: W.t, recruits: 0, rain: raining(W) };
    W.stats.runs++;
    // error vs the selected memory (for stats / tutorial)
    const mem = W.memory[W.sel];
    if (mem) { const ideal = danceFor(mem, az); W.stats.angErr.push(Math.abs(wrap(angle - ideal.angle))); W.stats.distErr.push(Math.abs(dur - ideal.dur) / ideal.dur); d.last.ideal = ideal; }
    // vigor: a run that repeats the previous one (same angle, same length) excites more followers
    const pv = d.prev;
    if (pv && W.t - pv.t < 6 * FPS && Math.abs(wrap(angle - pv.angle)) < 10 && Math.abs(dur - pv.dur) < Math.max(0.15, 0.15 * pv.dur)) d.combo = Math.min(3, (d.combo || 0) + 1); else d.combo = 0;
    d.prev = { angle, dur, t: W.t }; d.last.combo = d.combo;
    if (!raining(W)) {
      let k = W.D.recruitPerRun + d.combo;
      for (const f of W.foragers) { if (k <= 0) break; if (f.state !== 'idle' || f.rest > 0) continue; sendForager(W, f, tgt, true); k--; d.last.recruits++; }
      W.stats.recruits += d.last.recruits;
    }
    emit(W, 'run', d.last);
    d.lx = d.x; d.ly = d.y; d.lastH = d.h; d.loop = Math.round(C.LOOP_SEC * FPS); d.side = -d.side;
  }

  function sendForager(W, f, tgt, fromDance) {
    const r = W.rng, D = W.D;
    const b = bearing(tgt.x, tgt.y) + gauss(r) * D.noiseA * (fromDance ? 1 : 0.5);
    const dd = Math.hypot(tgt.x, tgt.y) * (1 + gauss(r) * D.noiseD * (fromDance ? 1 : 0.5));
    const p = fromBearing(b, Math.max(20, dd));
    f.state = 'out'; f.x = 0; f.y = 0; f.tx = p.x; f.ty = p.y; f.patch = -1; f.t = Math.floor(r() * 20); f.carry = 0; f.trips = 0; f.delay = fromDance ? Math.floor(r() * 50) : 0;
  }

  function moveTo(o, tx, ty, sp) { const dx = tx - o.x, dy = ty - o.y, m = Math.hypot(dx, dy), st = sp * DT; if (m <= st) { o.x = tx; o.y = ty; return true; } o.x += dx / m * st; o.y += dy / m * st; return false; }

  function stepForagers(W) {
    const D = W.D, r = W.rng, rain = raining(W);
    for (const f of W.foragers) {
      if (f.state === 'idle') { if (f.rest > 0) f.rest--; continue; }
      if (f.delay > 0) { f.delay--; continue; }
      if (rain && f.state !== 'home') { f.state = 'home'; f.patch = -1; }
      if (f.state === 'out') {
        // wasp scare
        if (D.waspScare > 0) for (const w of W.wasps) if (Math.hypot(w.x - f.x, w.y - f.y) < 22 && r() < D.waspScare * 0.15) { f.state = 'home'; f.patch = -1; W.stats.scared++; emit(W, 'scared', { x: f.x, y: f.y }); break; }
        if (f.state !== 'out') continue;
        const known = f.patch >= 0 ? W.patches.find((p) => p.id === f.patch) : null;
        if (known && !blooming(W, known)) { f.state = 'home'; f.patch = -1; continue; }
        const tx = known ? known.x + f.ox : f.tx, ty = known ? known.y + f.oy : f.ty;
        if (moveTo(f, tx, ty, C.FORAGER_SPEED)) {
          if (known) { f.state = 'sip'; f.t = C.SIP_SEC * FPS; }
          else { // search around the decoded point
            let best = null, bd = 1e9;
            for (const p of W.patches) if (blooming(W, p)) { const dd = dist(f, p) - p.r; if (dd < D.search && dd < bd) { bd = dd; best = p; } }
            if (best) { f.patch = best.id; f.ox = (r() - 0.5) * best.r; f.oy = (r() - 0.5) * best.r; f.found = true; emit(W, 'fFound', { x: best.x, y: best.y, id: best.id }); }
            else { f.state = 'search'; f.t = 110; f.sa = r() * 6.28; W.stats.misses++; emit(W, 'fMiss', { x: f.x, y: f.y }); }
          }
        }
      } else if (f.state === 'search') {
        f.t--; f.sa += 0.09; f.x += Math.cos(f.sa) * 1.6; f.y += Math.sin(f.sa) * 1.6;
        if (f.t <= 0) { f.state = 'home'; f.patch = -1; f.lost = true; }
      } else if (f.state === 'sip') {
        f.t--; const p = W.patches.find((q) => q.id === f.patch);
        if (!p || !blooming(W, p)) { f.state = 'home'; f.patch = -1; f.carry = 0; continue; }
        if (f.t <= 0) { p.nectar--; f.carry = p.q; f.state = 'home'; }
      } else if (f.state === 'home') {
        if (moveTo(f, 0, 0, C.FORAGER_SPEED)) {
          if (f.carry) { W.honey += f.carry; emit(W, 'deposit', { q: f.carry }); f.carry = 0; }
          const p = f.patch >= 0 ? W.patches.find((q) => q.id === f.patch) : null;
          if (p && blooming(W, p) && !rain && W.t < C.DAY_LEN - 8 * FPS && ++f.trips < C.TRIPS + p.q) {
            f.state = 'out'; f.delay = 20;
            // recruitment dance by a successful forager: accurate, chance by quality
            if (p.nectar > p.max * 0.4 && r() < 0.05 * p.q) { const idle = W.foragers.find((g) => g.state === 'idle' && !(g.rest > 0)); if (idle) { sendForager(W, idle, p, false); W.stats.recruits++; emit(W, 'fRecruit'); } }
          } else { f.state = 'idle'; f.patch = -1; if (f.lost) { f.rest = C.REST_SEC * FPS; f.lost = false; } }
        }
      }
    }
  }

  function stepRivals(W) {
    if (W.rivalOff) return;
    const r = W.rng, rain = raining(W);
    for (const b of W.rivals.slice(0, W.rivalCount)) {
      if (b.state === 'home') {
        if (b.t > 0) { b.t--; continue; }
        if (rain || W.t > C.DAY_LEN - 10 * FPS) continue;
        // rivals know patches near their hive (they have scouts too), after a delay into the day
        const cand = W.patches.filter((p) => blooming(W, p) && dist(p, W.rival) < 650 && W.t - 0 > 25 * FPS);
        if (!cand.length) { b.t = 120; continue; }
        cand.sort((p, q) => dist(p, W.rival) - dist(q, W.rival));
        const p = cand[Math.floor(r() * Math.min(2, cand.length))];
        b.patch = p.id; b.state = 'out'; b.ox = (r() - 0.5) * p.r; b.oy = (r() - 0.5) * p.r;
      } else if (b.state === 'out') {
        const p = W.patches.find((q) => q.id === b.patch);
        if (!p || !blooming(W, p) || rain) { b.state = 'back'; continue; }
        if (moveTo(b, p.x + b.ox, p.y + b.oy, C.RIVAL_SPEED)) { b.state = 'sip'; b.t = C.SIP_SEC * FPS; }
      } else if (b.state === 'sip') {
        const p = W.patches.find((q) => q.id === b.patch);
        if (--b.t <= 0) { if (p && p.nectar > 0) { p.nectar--; p.rivalSips = (p.rivalSips || 0) + 1; W.stats.rivalSips++; W.stats.rivalHoney = (W.stats.rivalHoney || 0) + p.q; } b.state = 'back'; }
      } else if (b.state === 'back') {
        if (moveTo(b, W.rival.x, W.rival.y, C.RIVAL_SPEED)) { b.state = 'home'; b.t = 30; }
      }
    }
  }

  function stepWasps(W) {
    const s = W.scout, D = W.D, r = W.rng;
    for (const w of W.wasps) {
      const n = W.nests[w.nest];
      const ds = s.mode === 'fly' ? Math.hypot(s.x - w.x, s.y - w.y) : 1e9;
      const sn = Math.hypot(s.x - n.x, s.y - n.y);
      if ((w.state === 'hover' || w.state === 'dart') && ds < 110 && s.inv <= 0 && s.stun <= 0 && sn < 260) { w.state = 'alert'; w.t = C.WASP_WARN; emit(W, 'waspAlert', { x: w.x, y: w.y }); }
      if (w.state === 'alert') { if (sn > 300 || s.mode !== 'fly') { w.state = 'tired'; w.t = 40; } else if (--w.t <= 0) { w.state = 'chase'; w.t = 100; } continue; }
      if (w.state === 'chase') {
        // hover-and-dash: lunges in bursts
        const ph = w.t % 30, sp = ph < 18 ? D.wasp * 1.25 : D.wasp * 0.35;
        moveTo(w, s.x, s.y, sp);
        if (ds < 16 && s.inv <= 0 && s.stun <= 0) {
          const k = Math.hypot(s.x - w.x, s.y - w.y) || 1; s.vx = (s.x - w.x) / k * 320; s.vy = (s.y - w.y) / k * 320;
          s.stun = 75; s.inv = 160; W.stats.stung++; emit(W, 'stung', { x: s.x, y: s.y }); w.state = 'tired'; w.t = 90;
        } else if (--w.t <= 0 || s.mode !== 'fly' || sn > 320 || Math.hypot(w.x - n.x, w.y - n.y) > 330) { w.state = 'tired'; w.t = 70; }
      } else if (w.state === 'tired') {
        moveTo(w, n.x, n.y, 70); if (--w.t <= 0) { w.state = 'hover'; w.t = 30; }
      } else if (w.state === 'hover') {
        w.x += Math.sin(W.frame * 0.3 + w.nest * 3) * 0.4; w.y += Math.cos(W.frame * 0.23 + w.nest) * 0.4;
        if (--w.t <= 0) { const a = r() * 6.28, rr = 40 + r() * 110; w.tx = n.x + Math.cos(a) * rr; w.ty = n.y + Math.sin(a) * rr; w.state = 'dart'; }
      } else if (w.state === 'dart') {
        if (moveTo(w, w.tx, w.ty, 260)) { w.state = 'hover'; w.t = 25 + Math.floor(r() * 40); }
      }
    }
  }

  // input: { ax, ay } for flight, { hold, heading | turn, sel } for dance, exit: bool
  function step(W, inp) {
    inp = inp || {};
    if (W.state !== 'play') return W;
    W.frame++;
    const wasRain = raining(W);
    W.t++;
    if (raining(W) && !wasRain) emit(W, 'rain');
    if (!raining(W) && wasRain) emit(W, 'rainEnd');
    if (inp.exit) exitHive(W);
    stepScout(W, inp);
    stepDance(W, inp);
    stepForagers(W);
    stepRivals(W);
    stepWasps(W);
    if (W.tutorial) {
      const p = W.patches[0];
      if (p && W.foragers.filter((f) => f.patch === p.id && f.found).length >= 3) {
        emit(W, 'tutDone', { step: W.tutStep });
        if (W.tutStep === 0) { for (const f of W.foragers) { f.state = 'idle'; f.patch = -1; f.found = false; } W.memory = []; setupTutorial(W, 1); }
        else { W.state = 'tutEnd'; }
      }
      if (W.t >= C.DAY_LEN - 1) W.t = Math.floor(C.DAY_LEN * 0.3); // tutorial sun keeps going but never sets
    }
    if (!W.tutorial && W.t >= C.DAY_LEN) endDay(W);
    return W;
  }

  function endDay(W) {
    endRun(W);
    for (const f of W.foragers) { if (f.carry) W.honey += f.carry; f.state = 'idle'; f.patch = -1; f.carry = 0; f.x = 0; f.y = 0; }
    for (const b of W.rivals) { b.state = 'home'; b.x = W.rival.x; b.y = W.rival.y; b.t = 0; }
    W.stats.honeyByDay.push(W.honey);
    const r = W.rng; W.tomorrowRain = null;
    if (r() < 0.45) { const s0 = 0.3 + r() * 0.45; W.tomorrowRain = [Math.floor(s0 * C.DAY_LEN), Math.floor((s0 + 0.1 + r() * 0.08) * C.DAY_LEN)]; }
    W.state = W.day >= C.DAYS - 1 ? 'end' : 'night';
    emit(W, W.state);
  }

  function nextDay(W) {
    if (W.state !== 'night') return W;
    W.day++; W.t = 0; W.state = 'play'; W.memory = [];
    W.scout = Object.assign(W.scout, { x: 0, y: 40, vx: 0, vy: 0, mode: 'fly', stun: 0, inv: 60, left: false });
    W.patches = W.patches.filter((p) => p.wilt >= W.day);
    genDay(W, W.day);
    emit(W, 'dawn');
    return W;
  }

  function stars(W) { const h = W.honey, t = W.target; return h >= t * 1.6 ? 3 : h >= t * 1.3 ? 2 : h >= t ? 1 : 0; }
  function forecast(W) { return W.rain.map(([a, b]) => [a / C.DAY_LEN, b / C.DAY_LEN]); }

  const API = { scentAt, C, DIFFS, SPECIES, FPS, DT, rng, gauss, wrap, wrap360, bearing, fromBearing, sunAz, danceFor, decode, create, step, nextDay, exitHive, raining, blooming, sunNow, stars, forecast, dist };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.WG = API;
})(typeof window !== 'undefined' ? window : globalThis);
