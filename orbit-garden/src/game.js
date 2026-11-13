// ORBIT GARDEN client: rendering, input, screens. All art is drawn procedurally on a canvas.
(function () {
  'use strict';
  const OG = window.OG, LV = window.OG_LEVELS, SOL = window.OG_SOLUTIONS || {}, A = window.OGAudio, SV = window.OGSolver;
  const cv = document.getElementById('c'), c = cv.getContext('2d');
  const Q = new URLSearchParams(location.search);
  const TAU = Math.PI * 2, FONT = '"Trebuchet MS","Avenir Next","Nunito","Segoe UI",sans-serif';
  const SEEDCOL = { T: '#8be86f', F: '#ff92cc', V: '#52e3d2' };
  const SPROUT_ASSIST = 16, PULL_MAX = 210, PREVIEW = 80, PREVIEW_SPROUT = OG.MAX_STEPS, PREVIEW_HINT = 110;
  let VW, VH, DPR, sc, ox, oy, bg = null, time = 0;

  // ---------- save ----------
  const SAVE_KEY = 'orbit-garden-save-1';
  let save = { done: {}, sprout: false, muted: false };
  try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) { /* fresh */ }
  const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } };
  if (Q.get('sprout')) save.sprout = Q.get('sprout') === '1';
  if (Q.get('mute') === '1') save.muted = true;
  A.setMuted(save.muted);
  const unlockAll = Q.get('unlock') === 'all';

  // ---------- helpers ----------
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
  const angDist = (a, b) => { let d = Math.abs(a - b) % TAU; return d > Math.PI ? TAU - d : d; };
  function shotStr(s) { return s.a + '.' + s.p + '.' + s.s; }
  function parseShot(t) { const [a, p, s] = t.split('.'); return { a: +a, p: +p, s: s || 'T' }; }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2); VW = window.innerWidth; VH = window.innerHeight;
    cv.width = Math.round(VW * DPR); cv.height = Math.round(VH * DPR); cv.style.width = VW + 'px'; cv.style.height = VH + 'px';
    sc = Math.min(VW / OG.W, VH / OG.H); ox = (VW - OG.W * sc) / 2; oy = (VH - OG.H * sc) / 2; bg = null;
  }
  window.addEventListener('resize', resize); resize();
  const toWorld = (e) => ({ x: (e.clientX - ox) / sc, y: (e.clientY - oy) / sc });

  // ---------- background ----------
  let twinkles = [];
  function buildBg(hue) {
    const b = document.createElement('canvas'); b.width = cv.width; b.height = cv.height; const g = b.getContext('2d');
    const gr = g.createRadialGradient(b.width * 0.5, b.height * 0.42, 0, b.width * 0.5, b.height * 0.5, Math.max(b.width, b.height) * 0.75);
    const bh = 245 + (hue - 140) * 0.12; gr.addColorStop(0, `hsl(${bh},48%,19%)`); gr.addColorStop(0.55, `hsl(${bh + 8},52%,10%)`); gr.addColorStop(1, '#05040f');
    g.fillStyle = gr; g.fillRect(0, 0, b.width, b.height);
    const R = rng(7 + hue);
    for (let i = 0; i < 9; i++) { // nebula puffs
      const x = R() * b.width, y = R() * b.height, r = (0.15 + R() * 0.3) * Math.max(b.width, b.height), h = [hue, 270, 200, 320][i % 4] + R() * 30;
      const ng = g.createRadialGradient(x, y, 0, x, y, r); ng.addColorStop(0, `hsla(${h},70%,55%,0.10)`); ng.addColorStop(1, `hsla(${h},70%,40%,0)`);
      g.fillStyle = ng; g.fillRect(0, 0, b.width, b.height);
    }
    for (let i = 0; i < 420; i++) {
      const x = R() * b.width, y = R() * b.height, s = R() < 0.92 ? R() * 1.1 + 0.3 : R() * 2 + 1;
      g.fillStyle = `hsla(${R() < 0.5 ? 220 : 45},80%,${85 + R() * 15}%,${0.3 + R() * 0.6})`; g.beginPath(); g.arc(x, y, s * DPR * 0.8, 0, TAU); g.fill();
    }
    twinkles = []; for (let i = 0; i < 46; i++) twinkles.push({ x: R() * 1400 - 100, y: R() * 1000 - 100, s: 1 + R() * 2.2, ph: R() * TAU, sp: 0.6 + R() * 1.4 });
    return b;
  }
  let bgHue = 0;
  function drawBg(hue) {
    if (!bg || bgHue !== hue) { bg = buildBg(hue); bgHue = hue; }
    c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(bg, 0, 0);
    c.setTransform(DPR * sc, 0, 0, DPR * sc, DPR * ox, DPR * oy);
    for (const t of twinkles) {
      const a = 0.5 + 0.5 * Math.sin(time * t.sp + t.ph); if (a < 0.15) continue;
      c.globalAlpha = a * 0.9; c.fillStyle = '#fff7e0';
      c.beginPath(); c.moveTo(t.x - t.s * 2.5, t.y); c.lineTo(t.x, t.y - t.s * 0.4); c.lineTo(t.x + t.s * 2.5, t.y); c.lineTo(t.x, t.y + t.s * 0.4); c.fill();
      c.beginPath(); c.moveTo(t.x, t.y - t.s * 2.5); c.lineTo(t.x + t.s * 0.4, t.y); c.lineTo(t.x, t.y + t.s * 2.5); c.lineTo(t.x - t.s * 0.4, t.y); c.fill();
    }
    c.globalAlpha = 1;
  }

  // ---------- game state ----------
  const G = { mode: 'title', level: null, s: null, hist: [], seed: 'T', fl: null, shot: null, trail: [], aim: null, drag: null,
    pv: [], parts: [], tethers: [], win: 0, fail: 0, bannerT: 0, hintT: 0, hint: null, impactT: 0, fast: false, msg: null, msgT: 0,
    selWorld: 1, sb: null };
  window.__OG = { G, OG };

  function levelById(id) { return LV.LEVELS.find((l) => l.id === id); }
  function worldOf(l) { return +l.id.split('-')[0]; }
  function worldLevels(w) { return LV.LEVELS.filter((l) => worldOf(l) === w); }
  function isUnlocked(l) {
    if (unlockAll || save.sprout) return true;
    const w = worldOf(l), wl = worldLevels(w), idx = wl.indexOf(l);
    if (w > 1 && worldLevels(w - 1).filter((x) => save.done[x.id]).length < 6) return false;
    return idx < 3 || wl.slice(0, idx).filter((x) => save.done[x.id]).length >= idx - 2;
  }
  function parOf(l) { return (SOL[l.id] && SOL[l.id].par) || l.par || null; }

  function startLevel(l) {
    if (save.sprout) l = Object.assign({}, l, { assist: SPROUT_ASSIST }); // kids: wider catch for planets that still need seeds
    G.mode = 'play'; G.level = l; G.s = OG.init(l); G.hist = []; G.fl = null; G.trail = []; G.aim = null; G.drag = null; G.parts = [];
    G.win = 0; G.fail = 0; G.bannerT = 0; G.idleT = 0; G.hintT = 0; G.hint = null; G.impactT = 0; G.fast = false;
    G.pv = l.planets.map((p, i) => ({ grow: G.s.f[i] ? 1 : 0, from: -Math.PI / 2, kind: G.s.f[i], prev: '', wake: G.s.f[i] ? 1 : 0, squish: 0, blink: 2 + (i * 1.7) % 3, cheer: 0, mu: OG.mu(p, G.s.f[i]) }));
    G.tethers = G.s.tethers.map((t) => ({ i: t[0], j: t[1], g: 1 }));
    G.seed = OG.SEEDS.find((k) => G.s.pouch[k] > 0) || 'T';
    A.setWorld(worldOf(l));
  }
  function syncVisuals() { // after undo/restart: snap visuals to the state
    G.level.planets.forEach((p, i) => { const v = G.pv[i]; v.kind = G.s.f[i]; v.grow = v.kind ? 1 : 0; v.prev = ''; v.wake = v.kind ? 1 : 0; v.mu = OG.mu(p, v.kind); });
    G.tethers = G.s.tethers.map((t) => ({ i: t[0], j: t[1], g: 1 }));
    if (!(G.s.pouch[G.seed] > 0)) G.seed = OG.SEEDS.find((k) => G.s.pouch[k] > 0) || G.seed;
  }
  function seedsLeft() { return save.sprout || G.mode === 'sandbox' ? 99 : OG.remaining(G.s); }
  function canShoot() { return !G.fl && !G.win && !G.fail && (G.mode === 'sandbox' || save.sprout || G.s.pouch[G.seed] > 0); }

  function fire(shot) {
    if (!canShoot()) return;
    shot = shot || G.aim; if (!shot) return;
    shot = { a: shot.a, p: shot.p, s: G.seed };
    G.shot = shot; G.aim = { a: shot.a, p: shot.p }; G.fl = OG.flight(G.level, G.s, shot); G.trail = []; G.hintT = 0; G.fast = false;
    A.launch(shot.p / 100);
    const L = G.level.launch; burst(L[0], L[1], SEEDCOL[shot.s], 10, 2.2);
  }
  function resolve() {
    const fl = G.fl, shot = G.shot, before = G.s;
    const r = OG.apply(G.level, G.s, shot, fl.out);
    G.hist.push(before); G.s = r.state;
    if (save.sprout || G.mode === 'sandbox') G.s.pouch[shot.s] = Math.max(1, before.pouch[shot.s]);
    for (const e of r.events) {
      if (e.type === 'green' || e.type === 'replant') { if (!e.skip) plantFx(e.i, e.seed, e.nx, e.ny, e.prev); }
      else if (e.type === 'touch') { if (!e.skip) { A.land(e.i); G.pv[e.i].squish = 0.6; } }
      else if (e.type === 'vine') {
        G.tethers.push({ i: e.i, j: e.j, g: 0, greened: e.greened });
        A.vine();
        if (e.greened) { const v = G.pv[e.j], a = G.level.planets[e.i], b = G.level.planets[e.j]; v.kind = 'V'; v.prev = ''; v.grow = -0.7; v.from = Math.atan2(a.y - b.y, a.x - b.x); v.cheer = 1; }
      } else if (e.type === 'burn') { A.burn(); burst(fl.x, fl.y, '#ffb347', 40, 3.5); burst(fl.x, fl.y, '#5b5b6b', 16, 1.4); }
      else { A.lost(); burst(clamp(fl.x, 10, OG.W - 10), clamp(fl.y, 10, OG.H - 10), SEEDCOL[shot.s], 18, 1.5); }
    }
    G.fl = null; G.impactT = 0.35;
    if (G.mode === 'sandbox') return;
    if (OG.won(G.level, G.s)) {
      G.win = 0.001; A.win(); const order = G.level.planets.map((p, i) => i).filter((i) => !G.level.planets[i].rock).sort((a, b) => G.level.planets[a].x - G.level.planets[b].x);
      order.forEach((i, k) => { G.pv[i].cheerAt = 0.15 + k * 0.18; }); A.chorus(order.length);
      const used = G.s.used, prev = save.done[G.level.id];
      if (!prev || used < prev) save.done[G.level.id] = used; persist();
    } else if (!save.sprout && OG.remaining(G.s) === 0) { G.fail = 0.001; setTimeout(() => A.fail(), 500); }
  }
  function plantFx(i, seed, nx, ny, prev) {
    const p = G.level.planets[i], v = G.pv[i];
    v.prev = prev; v.kind = seed; v.grow = 0; v.from = Math.atan2(ny, nx); v.squish = 1; v.cheer = 1;
    A.land(i); setTimeout(() => A.green(i, seed), 60);
    const fx = p.x + nx * p.r, fy = p.y + ny * p.r;
    burst(fx, fy, SEEDCOL[seed], 26, 3.2); burst(fx, fy, '#fff6c8', 10, 1.6);
    for (let k = 0; k < 10; k++) leaf(fx, fy, seed);
  }
  function undo() { if (G.fl || !G.hist.length) return; G.s = G.hist.pop(); G.win = 0; G.fail = 0; syncVisuals(); A.tap(); }
  function restart() { if (!G.level) return; const l = G.level; startLevel(l); G.bannerT = 2; A.tap(); }
  function nextLevel() {
    const i = LV.LEVELS.indexOf(G.level), n = LV.LEVELS[i + 1];
    if (n && isUnlocked(n)) startLevel(n); else { G.mode = 'select'; G.selWorld = worldOf(G.level); }
  }

  // ---------- hint ----------
  const fk = (s) => s.f.map((x) => x || '.').join('') + '|' + s.tethers.map((t) => t.join('-')).sort().join(',');
  function hint() {
    if (G.fl || G.win || G.fail) return;
    const sol = SOL[G.level.id]; let shot = null;
    // hints follow the forgiving route (wide windows), not the trick-shot par route
    if (sol) for (const path of [sol.easy && sol.easy.path, sol.path]) {
      if (!path || shot) continue;
      let s = OG.init(G.level);
      for (const st of path) { if (fk(s) === fk(G.s) && G.s.pouch[st.s] > 0) { shot = st; break; } s = OG.shoot(G.level, s, st).state; }
    }
    if (!shot && SV) {
      let r = SV.solve(G.level, { start: G.s, aStep: 8, pStep: 10, beam: 25, minWin: 3 });
      if (!r.par) r = SV.solve(G.level, { start: G.s, aStep: 8, pStep: 10, beam: 25 });
      if (r.par) shot = r.path[0].shot;
    }
    if (!shot) { G.msg = 'restart'; G.msgT = 2.5; return; }
    G.seed = shot.s; G.aim = { a: shot.a, p: shot.p }; G.hintT = 6; A.tap();
  }

  // ---------- particles ----------
  function burst(x, y, col, n, sp) {
    for (let k = 0; k < n; k++) { const a = Math.random() * TAU, v = Math.random() * sp; G.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 0.5 + Math.random() * 0.7, col, s: 1.5 + Math.random() * 2.5, k: 'spark' }); }
  }
  function leaf(x, y, seed) {
    const a = Math.random() * TAU, v = 0.6 + Math.random() * 1.6;
    G.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 1.2 + Math.random(), col: seed === 'F' ? (Math.random() < 0.5 ? '#ffc4e4' : '#ff7dbd') : seed === 'V' ? '#6ff0db' : '#9bec74', s: 3 + Math.random() * 3, k: 'leaf', rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 0.2 });
  }
  function confetti() {
    for (let k = 0; k < 4; k++) {
      const x = Math.random() * OG.W, cols = ['#ffd36e', '#ff9ccf', '#9cf08a', '#7fe8ff', '#c9a6ff'];
      G.parts.push({ x, y: -10, vx: (Math.random() - 0.5) * 1.2, vy: 1 + Math.random() * 1.5, life: 0, max: 5, col: cols[k % 5], s: 4 + Math.random() * 3, k: 'petal', rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 0.15 });
    }
  }
  function updateParts(dt) {
    for (const p of G.parts) { p.life += dt; p.x += p.vx * dt * 60; p.y += p.vy * dt * 60; if (p.k === 'spark') { p.vx *= 0.94; p.vy *= 0.94; } else { p.vx *= 0.985; p.vy = p.k === 'petal' ? p.vy : p.vy * 0.985; p.rot += p.vr; } }
    G.parts = G.parts.filter((p) => p.life < p.max);
  }
  function drawParts() {
    for (const p of G.parts) {
      const a = 1 - p.life / p.max; c.globalAlpha = clamp(a, 0, 1);
      if (p.k === 'spark') { c.fillStyle = p.col; c.beginPath(); c.arc(p.x, p.y, p.s * (0.4 + a * 0.6), 0, TAU); c.fill(); }
      else if (p.k === 'star') { c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.fillStyle = p.col; c.shadowColor = p.col; c.shadowBlur = 10; c.beginPath(); for (let q = 0; q < 10; q++) { const rr = q % 2 ? p.s * 0.45 : p.s, aa = q * Math.PI / 5 - Math.PI / 2; c.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr); } c.closePath(); c.fill(); c.restore(); }
      else { c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.fillStyle = p.col; c.beginPath(); c.ellipse(0, 0, p.s, p.s * 0.5, 0, 0, TAU); c.fill(); c.restore(); }
    }
    c.globalAlpha = 1;
  }

  // ---------- drawing: bodies ----------
  function planetHue(i, l) { return (hash(l.id + ':' + i) % 360); }
  function gravityRings(x, y, mu, r, col, strength) {
    const R0 = Math.sqrt(mu / 0.0035);
    if (R0 <= r + 6) return;
    c.lineWidth = 1.4;
    for (let k = 0; k < 4; k++) {
      const ph = ((time * 0.25 + k / 4) % 1), R = r + (R0 - r) * (1 - ph);
      c.strokeStyle = col; c.globalAlpha = 0.11 * strength * Math.sin(ph * Math.PI);
      c.setLineDash([3, 7]); c.beginPath(); c.arc(x, y, R, 0, TAU); c.stroke();
    }
    c.setLineDash([]); c.globalAlpha = 1;
  }
  function drawTree(s, h) { // at origin, pointing up (-y)
    c.fillStyle = '#7a4f35'; c.fillRect(-s * 0.12, -s * 0.9, s * 0.24, s * 0.95);
    c.fillStyle = `hsl(${h},58%,38%)`; c.beginPath(); c.arc(0, -s * 1.15, s * 0.62, 0, TAU); c.fill();
    c.fillStyle = `hsl(${h},62%,52%)`; c.beginPath(); c.arc(-s * 0.15, -s * 1.3, s * 0.36, 0, TAU); c.fill();
  }
  function drawPine(s, h) {
    c.fillStyle = '#6b4630'; c.fillRect(-s * 0.1, -s * 0.5, s * 0.2, s * 0.55);
    c.fillStyle = `hsl(${h},50%,32%)`; c.beginPath(); c.moveTo(-s * 0.55, -s * 0.45); c.lineTo(0, -s * 1.7); c.lineTo(s * 0.55, -s * 0.45); c.fill();
    c.fillStyle = `hsl(${h},55%,45%)`; c.beginPath(); c.moveTo(-s * 0.35, -s * 0.95); c.lineTo(0, -s * 1.7); c.lineTo(s * 0.18, -s * 1.1); c.fill();
  }
  function drawFlower(s, k) {
    c.strokeStyle = '#4fae5a'; c.lineWidth = s * 0.14; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -s * 0.9); c.stroke();
    const cols = ['#ff8fc8', '#ffd1ea', '#ffb36b', '#c79bff']; c.fillStyle = cols[k % cols.length];
    for (let j = 0; j < 5; j++) { const a = j / 5 * TAU + time * 0.5; c.beginPath(); c.arc(Math.cos(a) * s * 0.34, -s * 1.05 + Math.sin(a) * s * 0.34, s * 0.27, 0, TAU); c.fill(); }
    c.fillStyle = '#ffe97a'; c.beginPath(); c.arc(0, -s * 1.05, s * 0.2, 0, TAU); c.fill();
  }
  function drawVineSprig(s, k) {
    c.strokeStyle = '#2fbfa8'; c.lineWidth = s * 0.13; c.beginPath(); c.moveTo(0, 0);
    c.quadraticCurveTo(s * 0.5 * (k % 2 ? 1 : -1), -s * 0.6, 0, -s * 1.2); c.stroke();
    c.fillStyle = '#5ff0d5'; c.beginPath(); c.ellipse(s * 0.25 * (k % 2 ? -1 : 1), -s * 0.7, s * 0.28, s * 0.14, 0.6, 0, TAU); c.fill();
    c.beginPath(); c.arc(0, -s * 1.2, s * 0.13, 0, TAU); c.fill();
  }
  function forestDecor(p, kind, frac, from, alpha, seedN) {
    if (frac <= 0 || !kind) return;
    const N = Math.max(7, Math.round(TAU * p.r / 20)), s = clamp(p.r * 0.2, 7, 14);
    c.globalAlpha = alpha;
    for (let k = 0; k < N; k++) {
      const a = from + (k / N) * TAU + (seedN % 7) * 0.05, d = angDist(a, from) / Math.PI;
      const pop = clamp((frac - d) * 4, 0, 1); if (pop <= 0) continue;
      const sz = s * ease(pop) * (0.85 + ((k * 7 + seedN) % 5) * 0.07);
      c.save(); c.translate(p.x + Math.cos(a) * p.r * 0.94, p.y + Math.sin(a) * p.r * 0.94); c.rotate(a + Math.PI / 2 + Math.sin(time * 1.3 + k) * 0.05);
      if (kind === 'T') ((k + seedN) % 3 === 0 ? drawPine : drawTree)(sz, 105 + ((k * 13) % 30));
      else if (kind === 'F') drawFlower(sz * 0.9, k + seedN);
      else drawVineSprig(sz, k);
      c.restore();
    }
    c.globalAlpha = 1;
  }
  function groundColor(kind) { return kind === 'F' ? ['#7fd776', '#4ea85a'] : kind === 'V' ? ['#4fd6b5', '#2a9a8c'] : ['#6fcf5c', '#3a8f45']; }
  function drawPlanet(p, i, v, l, pod) {
    const h = planetHue(i, l), sq = 1 + Math.sin(v.squish * 14) * v.squish * 0.08, cheer = Math.max(0, Math.sin(v.cheer * 9)) * v.cheer * 6;
    const x = p.x, y = p.y - cheer, r = p.r;
    // glow
    const gg = c.createRadialGradient(x, y, r * 0.8, x, y, r * 2.1);
    const glowCol = v.kind ? (v.kind === 'F' ? '255,150,210' : v.kind === 'V' ? '90,240,210' : '150,255,140') : `${120 + (h % 60)},${130},${200}`;
    gg.addColorStop(0, `rgba(${glowCol},${v.kind ? 0.32 : 0.16})`); gg.addColorStop(1, `rgba(${glowCol},0)`);
    c.fillStyle = gg; c.beginPath(); c.arc(x, y, r * 2.1, 0, TAU); c.fill();
    if (v.kind === 'F') { c.strokeStyle = `rgba(255,170,220,${0.35 + 0.2 * Math.sin(time * 3 + i)})`; c.lineWidth = 3; c.setLineDash([2, 6]); c.beginPath(); c.arc(x, y, r + 9 + Math.sin(time * 3 + i) * 2, 0, TAU); c.stroke(); c.setLineDash([]); }
    const wish = p.w, unhappy = wish && v.kind !== wish;
    if (unhappy) {
      const pu = 0.5 + 0.5 * Math.sin(time * 3 + i);
      c.strokeStyle = SEEDCOL[wish]; c.globalAlpha = 0.45 + 0.35 * pu; c.lineWidth = 3; c.setLineDash([7, 7]); c.lineDashOffset = -time * 12;
      c.beginPath(); c.arc(x, y, r + 7, 0, TAU); c.stroke(); c.setLineDash([]); c.lineDashOffset = 0; c.globalAlpha = 1;
    }
    c.save(); c.translate(x, y); c.scale(sq, 2 - sq); c.translate(-x, -y);
    // body
    const wk = v.wake;
    const bg1 = `hsl(${lerp(h, 105, wk * 0.6)},${lerp(22, 45, wk)}%,${lerp(62, 66, wk)}%)`, bg2 = `hsl(${lerp(h, 120, wk * 0.6) + 10},${lerp(26, 40, wk)}%,${lerp(30, 32, wk)}%)`;
    const bgg = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    bgg.addColorStop(0, bg1); bgg.addColorStop(1, bg2);
    c.fillStyle = bgg; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    // craters (barren look fades as it wakes)
    const R = rng(hash(l.id + i));
    c.globalAlpha = 0.25 * (1 - wk * 0.7);
    for (let k = 0; k < 4; k++) { const a = Math.PI * (0.15 + R() * 0.7) * (R() < 0.5 ? 1 : -1) + (k % 2 ? 0 : Math.PI), d = r * (0.55 + R() * 0.2), cr = r * (0.08 + R() * 0.1); c.fillStyle = `hsl(${h},20%,30%)`; c.beginPath(); c.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, cr, 0, TAU); c.fill(); }
    c.globalAlpha = 1;
    // grass band spreading from the landing point
    const drawBand = (kind, frac, from, alpha) => {
      if (!kind || frac <= 0) return;
      const [g1, g2] = groundColor(kind); c.globalAlpha = alpha;
      c.save(); c.beginPath(); c.arc(x, y, r, 0, TAU); c.clip();
      c.lineWidth = r * 0.36; c.strokeStyle = g2; c.beginPath();
      if (frac >= 1) c.arc(x, y, r * 0.9, 0, TAU); else c.arc(x, y, r * 0.9, from - frac * Math.PI, from + frac * Math.PI); c.stroke();
      c.lineWidth = r * 0.16; c.strokeStyle = g1; c.beginPath();
      if (frac >= 1) c.arc(x, y, r * 0.95, 0, TAU); else c.arc(x, y, r * 0.95, from - frac * Math.PI, from + frac * Math.PI); c.stroke();
      c.restore(); c.globalAlpha = 1;
    };
    const gfrac = ease(clamp(v.grow, 0, 1));
    if (v.prev && gfrac < 1) drawBand(v.prev, 1, 0, 1 - gfrac);
    drawBand(v.kind, gfrac, v.from, 1);
    // face
    const fs = r / 40, look = pod ? Math.atan2(pod.y - y, pod.x - x) : 0, lk = pod ? 1.6 * fs : 0;
    const ex = r * 0.28, ey = -r * 0.04, er = Math.max(2.4, r * 0.1);
    c.lineCap = 'round';
    if (wk < 0.5) {
      c.strokeStyle = 'rgba(40,30,70,0.7)'; c.lineWidth = Math.max(1.5, 2.2 * fs);
      for (const sx of [-1, 1]) { c.beginPath(); c.arc(x + sx * ex, y + ey, er * 0.9, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke(); }
      const br = 1 + 0.15 * Math.sin(time * 2 + i); c.fillStyle = 'rgba(40,30,70,0.55)'; c.beginPath(); c.ellipse(x, y + r * 0.25, er * 0.45 * br, er * 0.55 * br, 0, 0, TAU); c.fill();
    } else {
      const blink = (time + v.blink) % 4 < 0.12;
      for (const sx of [-1, 1]) {
        if (blink) { c.strokeStyle = '#2a1f45'; c.lineWidth = Math.max(1.5, 2.2 * fs); c.beginPath(); c.moveTo(x + sx * ex - er, y + ey); c.lineTo(x + sx * ex + er, y + ey); c.stroke(); continue; }
        c.fillStyle = '#fff'; c.beginPath(); c.ellipse(x + sx * ex, y + ey, er * 1.05, er * 1.25, 0, 0, TAU); c.fill();
        c.fillStyle = '#2a1f45'; c.beginPath(); c.arc(x + sx * ex + Math.cos(look) * lk, y + ey + Math.sin(look) * lk + er * 0.15, er * 0.68, 0, TAU); c.fill();
        c.fillStyle = '#fff'; c.beginPath(); c.arc(x + sx * ex + Math.cos(look) * lk - er * 0.25, y + ey + Math.sin(look) * lk - er * 0.15, er * 0.24, 0, TAU); c.fill();
      }
      c.fillStyle = 'rgba(255,120,150,0.45)'; for (const sx of [-1, 1]) { c.beginPath(); c.ellipse(x + sx * r * 0.47, y + r * 0.16, er * 0.9, er * 0.55, 0, 0, TAU); c.fill(); }
      c.strokeStyle = '#2a1f45'; c.lineWidth = Math.max(1.5, 2.2 * fs); c.beginPath();
      if (unhappy) { c.moveTo(x - r * 0.1, y + r * 0.27); c.quadraticCurveTo(x, y + r * 0.22, x + r * 0.1, y + r * 0.27); } else c.arc(x, y + r * 0.14, r * (v.cheer > 0.2 ? 0.2 : 0.14), 0.15 * Math.PI, 0.85 * Math.PI);
      c.stroke();
    }
    c.restore();
    // forest on the rim
    if (v.prev && gfrac < 1) forestDecor({ x, y, r }, v.prev, 1, 0, 1 - gfrac, i);
    forestDecor({ x, y, r }, v.kind, gfrac, v.from, 1, i);
    if (unhappy) { // a little thought-bubble with the seed it wants
      const bx = x + r * 0.78 + 10, by = y - r * 0.78 - 12, bob = Math.sin(time * 2 + i) * 2;
      c.fillStyle = 'rgba(255,255,255,0.16)'; c.beginPath(); c.arc(bx, by + bob, 15, 0, TAU); c.fill();
      c.beginPath(); c.arc(bx - 11, by + 12 + bob, 3.5, 0, TAU); c.fill();
      c.globalAlpha = 0.95; drawPod(bx, by + bob + 1, wish, 0.8); c.globalAlpha = 1;
    }
    // sleepy z's
    if (!v.kind && !p.w && G.mode !== 'title') {
      const zt = (time * 0.5 + i * 0.37) % 1; c.globalAlpha = Math.sin(zt * Math.PI) * 0.6; c.fillStyle = '#d8d0ff';
      c.font = `bold ${Math.round(10 + zt * 8)}px ${FONT}`; c.fillText('z', x + r * 0.7 + zt * 14, y - r * 0.7 - zt * 26); c.globalAlpha = 1;
    }
  }
  function drawSun(u) {
    const g = c.createRadialGradient(u.x, u.y, u.r * 0.3, u.x, u.y, u.r * 2.6);
    g.addColorStop(0, 'rgba(255,220,120,0.9)'); g.addColorStop(0.4, 'rgba(255,150,60,0.35)'); g.addColorStop(1, 'rgba(255,90,40,0)');
    c.fillStyle = g; c.beginPath(); c.arc(u.x, u.y, u.r * 2.6, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,190,90,0.8)';
    for (let k = 0; k < 12; k++) {
      const a = k / 12 * TAU + time * 0.3, l2 = u.r * (1.35 + 0.12 * Math.sin(time * 3 + k));
      c.beginPath(); c.moveTo(u.x + Math.cos(a - 0.12) * u.r, u.y + Math.sin(a - 0.12) * u.r); c.lineTo(u.x + Math.cos(a) * l2, u.y + Math.sin(a) * l2); c.lineTo(u.x + Math.cos(a + 0.12) * u.r, u.y + Math.sin(a + 0.12) * u.r); c.fill();
    }
    const bg2 = c.createRadialGradient(u.x - u.r * 0.3, u.y - u.r * 0.3, 2, u.x, u.y, u.r);
    bg2.addColorStop(0, '#fff3b0'); bg2.addColorStop(1, '#ff9a3c'); c.fillStyle = bg2; c.beginPath(); c.arc(u.x, u.y, u.r, 0, TAU); c.fill();
    c.strokeStyle = '#a0461c'; c.lineWidth = 2.5; c.lineCap = 'round';
    for (const sx of [-1, 1]) { c.beginPath(); c.arc(u.x + sx * u.r * 0.3, u.y - u.r * 0.05, u.r * 0.1, 1.1 * Math.PI, 1.9 * Math.PI); c.stroke(); }
    c.beginPath(); c.arc(u.x, u.y + u.r * 0.15, u.r * 0.18, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
  }
  function drawRock(p, i, l) {
    const R = rng(hash(l.id + 'rock' + i)); c.fillStyle = '#5d5872'; c.beginPath();
    for (let k = 0; k < 9; k++) { const a = k / 9 * TAU, rr = p.r * (0.82 + R() * 0.25); c.lineTo(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr); }
    c.closePath(); c.fill(); c.fillStyle = '#7c7795'; c.beginPath(); c.arc(p.x - p.r * 0.25, p.y - p.r * 0.25, p.r * 0.3, 0, TAU); c.fill();
    c.fillStyle = '#48445a'; c.beginPath(); c.arc(p.x + p.r * 0.3, p.y + p.r * 0.2, p.r * 0.18, 0, TAU); c.fill();
  }
  function drawTether(t, l) {
    const a = l.planets[t.i], b = l.planets[t.j], g = ease(t.g);
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), nx = dx / d, ny = dy / d;
    const sx = a.x + nx * a.r, sy = a.y + ny * a.r, exx = b.x - nx * b.r, eyy = b.y - ny * b.r;
    const mx = (sx + exx) / 2 - ny * 18 * Math.sin(time * 1.2 + t.i), my = (sy + eyy) / 2 + nx * 18 * Math.sin(time * 1.2 + t.i);
    c.strokeStyle = '#2fbfa8'; c.lineWidth = 4; c.lineCap = 'round'; c.beginPath();
    const steps = 30, upto = Math.round(steps * g);
    for (let k = 0; k <= upto; k++) { const u = k / steps, x = (1 - u) * (1 - u) * sx + 2 * (1 - u) * u * mx + u * u * exx, y = (1 - u) * (1 - u) * sy + 2 * (1 - u) * u * my + u * u * eyy; if (k) c.lineTo(x, y); else c.moveTo(x, y); }
    c.stroke();
    c.fillStyle = '#5ff0d5';
    for (let k = 2; k < upto; k += 3) {
      const u = k / steps, x = (1 - u) * (1 - u) * sx + 2 * (1 - u) * u * mx + u * u * exx, y = (1 - u) * (1 - u) * sy + 2 * (1 - u) * u * my + u * u * eyy;
      c.beginPath(); c.ellipse(x, y, 6, 3, Math.atan2(ny, nx) + (k % 2 ? 0.9 : -0.9), 0, TAU); c.fill();
    }
  }
  function drawPod(x, y, seed, s) {
    s = s || 1; if (!SEEDCOL[seed]) { console.warn('bad seed ' + seed + ' ' + new Error().stack.split('\n')[2]); seed = 'T'; } const col = SEEDCOL[seed];
    const g = c.createRadialGradient(x, y, 1, x, y, 20 * s); g.addColorStop(0, col); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.globalAlpha = 0.6; c.fillStyle = g; c.beginPath(); c.arc(x, y, 20 * s, 0, TAU); c.fill(); c.globalAlpha = 1;
    c.fillStyle = col; c.beginPath(); c.ellipse(x, y, 7.5 * s, 9 * s, 0, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.7)'; c.beginPath(); c.ellipse(x - 2.5 * s, y - 3 * s, 2.2 * s, 3 * s, -0.4, 0, TAU); c.fill();
    c.fillStyle = seed === 'F' ? '#ff5ea8' : seed === 'V' ? '#1fa596' : '#3f9c3a';
    c.beginPath(); c.ellipse(x + 3 * s, y - 9 * s, 4 * s, 2 * s, -0.6, 0, TAU); c.fill();
  }

  // ---------- trajectory preview ----------
  // Onboarding curve: Meadow shows a long path, Blossom medium, Tangle the classic short one (you read the gravity).
  function previewLen() { const w = worldOf(G.level) || 0; return w === 1 ? 160 : w === 2 ? 115 : PREVIEW; }
  function preview(shot, steps, col, alpha, big) {
    big = big || 1;
    const fl = OG.flight(G.level, G.s, { a: shot.a, p: shot.p, s: G.seed });
    c.fillStyle = col;
    for (let k = 1; k <= steps && !fl.done; k++) {
      OG.step(fl);
      if (k % (steps > 300 ? 6 : 4) === 0) { const f = 1 - k / steps; c.globalAlpha = alpha * (0.25 + 0.75 * f); c.beginPath(); c.arc(fl.x, fl.y, (2 + 2.2 * f) * big, 0, TAU); c.fill(); }
    }
    if (fl.done && fl.out && fl.out.type === 'land') { c.globalAlpha = alpha; c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); c.arc(fl.x, fl.y, 9, 0, TAU); c.stroke(); }
    c.globalAlpha = 1;
  }

  // ---------- UI buttons ----------
  let btns = [];
  function button(x, y, r, glyph, fn, opt) {
    opt = opt || {}; btns.push({ x, y, r, fn });
    const hot = opt.pulse ? 0.5 + 0.5 * Math.sin(time * 5) : 0;
    c.fillStyle = opt.fill || 'rgba(255,255,255,0.10)'; c.strokeStyle = `rgba(255,255,255,${0.35 + hot * 0.5})`; c.lineWidth = 2 + hot * 2;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.stroke();
    c.save(); c.translate(x, y); c.strokeStyle = '#fff'; c.fillStyle = '#fff'; c.lineWidth = 3; c.lineCap = 'round'; c.lineJoin = 'round';
    glyph(r); c.restore();
  }
  const GL = {
    home: (r) => { const s = r * 0.45; c.beginPath(); c.moveTo(-s, 0); c.lineTo(0, -s); c.lineTo(s, 0); c.moveTo(-s * 0.7, -s * 0.2); c.lineTo(-s * 0.7, s * 0.8); c.lineTo(s * 0.7, s * 0.8); c.lineTo(s * 0.7, -s * 0.2); c.stroke(); },
    undo: (r) => { const s = r * 0.42; c.beginPath(); c.arc(0, s * 0.15, s, Math.PI * 1.05, Math.PI * 0.35, false); c.stroke(); c.beginPath(); c.moveTo(-s * 1.25, -s * 0.35); c.lineTo(-s, s * 0.25); c.lineTo(-s * 0.35, -s * 0.15); c.stroke(); },
    restart: (r) => { const s = r * 0.42; c.beginPath(); c.arc(0, 0, s, -Math.PI * 0.35, Math.PI * 1.5); c.stroke(); c.beginPath(); c.moveTo(s * 0.2, -s * 1.35); c.lineTo(s * 0.62, -s * 0.8); c.lineTo(0, -s * 0.5); c.stroke(); },
    hint: (r) => { const s = r * 0.36; c.beginPath(); c.arc(0, -s * 0.3, s, Math.PI * 0.75, Math.PI * 2.25); c.lineTo(s * 0.4, s * 0.9); c.lineTo(-s * 0.4, s * 0.9); c.closePath(); c.stroke(); c.beginPath(); c.moveTo(-s * 0.35, s * 1.3); c.lineTo(s * 0.35, s * 1.3); c.stroke(); },
    sound: (r) => { const s = r * 0.38; c.beginPath(); c.moveTo(-s, -s * 0.35); c.lineTo(-s * 0.4, -s * 0.35); c.lineTo(s * 0.2, -s); c.lineTo(s * 0.2, s); c.lineTo(-s * 0.4, s * 0.35); c.lineTo(-s, s * 0.35); c.closePath(); c.fill(); if (save.muted) { c.beginPath(); c.moveTo(s * 0.55, -s * 0.4); c.lineTo(s * 1.25, s * 0.4); c.moveTo(s * 1.25, -s * 0.4); c.lineTo(s * 0.55, s * 0.4); c.stroke(); } else { c.beginPath(); c.arc(s * 0.3, 0, s * 0.75, -0.8, 0.8); c.stroke(); } },
    play: (r) => { const s = r * 0.4; c.beginPath(); c.moveTo(-s * 0.6, -s); c.lineTo(s, 0); c.lineTo(-s * 0.6, s); c.closePath(); c.fill(); },
    sprout: (r) => { const s = r * 0.42; c.lineWidth = 3; c.strokeStyle = '#9bec74'; c.beginPath(); c.moveTo(0, s); c.lineTo(0, -s * 0.2); c.stroke(); c.fillStyle = '#9bec74'; c.beginPath(); c.ellipse(-s * 0.45, -s * 0.45, s * 0.5, s * 0.25, 0.6, 0, TAU); c.fill(); c.beginPath(); c.ellipse(s * 0.45, -s * 0.6, s * 0.5, s * 0.25, -0.6, 0, TAU); c.fill(); },
    planet: (r) => { const s = r * 0.42; c.beginPath(); c.arc(0, 0, s, 0, TAU); c.fill(); },
    sun: (r) => { const s = r * 0.3; c.fillStyle = '#ffb347'; c.beginPath(); c.arc(0, 0, s, 0, TAU); c.fill(); c.strokeStyle = '#ffb347'; for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; c.beginPath(); c.moveTo(Math.cos(a) * s * 1.4, Math.sin(a) * s * 1.4); c.lineTo(Math.cos(a) * s * 1.9, Math.sin(a) * s * 1.9); c.stroke(); } },
    rock: (r) => { const s = r * 0.4; c.fillStyle = '#9c97b5'; c.beginPath(); c.moveTo(-s, -s * 0.2); c.lineTo(-s * 0.3, -s); c.lineTo(s * 0.8, -s * 0.6); c.lineTo(s, s * 0.4); c.lineTo(0, s); c.lineTo(-s * 0.8, s * 0.6); c.closePath(); c.fill(); },
    erase: (r) => { const s = r * 0.35; c.beginPath(); c.moveTo(-s, -s); c.lineTo(s, s); c.moveTo(s, -s); c.lineTo(-s, s); c.stroke(); },
    sling: (r) => { drawPod(0, 0, G.seed, r / 26); },
    clear: (r) => { const s = r * 0.4; c.beginPath(); c.arc(0, 0, s, 0, TAU); c.stroke(); c.beginPath(); c.moveTo(-s * 0.7, s * 0.7); c.lineTo(s * 0.7, -s * 0.7); c.stroke(); },
  };
  function seedGlyph(seed) { return (r) => { drawPod(0, 1, seed, r / 24); }; }

  // ---------- pouch (in-world seed budget + picker) ----------
  function pouchLayout() {
    const L = G.level.launch, types = OG.SEEDS.filter((k) => (G.level.pouch[k] || 0) > 0 || G.mode === 'sandbox');
    const below = L[1] < OG.H - 150, y = L[1] + (below ? 88 : -88);
    return types.map((k, n) => ({ k, x: L[0] + (n - (types.length - 1) / 2) * 64, y }));
  }
  function drawPouch() {
    const lay = pouchLayout(); if (lay.length === 0) return;
    for (const b of lay) {
      const n = (save.sprout || G.mode === 'sandbox') ? -1 : G.s.pouch[b.k], sel = G.seed === b.k, empty = n === 0;
      btns.push({ x: b.x, y: b.y, r: 28, fn: () => { if (!empty) { G.seed = b.k; A.tap(); } } });
      c.globalAlpha = empty ? 0.3 : 1;
      c.fillStyle = sel ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.06)'; c.strokeStyle = sel ? SEEDCOL[b.k] : 'rgba(255,255,255,0.2)'; c.lineWidth = sel ? 3 : 1.5;
      c.beginPath(); c.arc(b.x, b.y, 24, 0, TAU); c.fill(); c.stroke();
      drawPod(b.x, b.y + 1, b.k, 1.05);
      if (n > 0) { // budget pips under the seed
        for (let k = 0; k < n; k++) { const px = b.x + (k - (n - 1) / 2) * 9; c.fillStyle = SEEDCOL[b.k]; c.beginPath(); c.arc(px, b.y + 34, 3.2, 0, TAU); c.fill(); }
      } else if (n < 0) { c.fillStyle = SEEDCOL[b.k]; c.font = `bold 15px ${FONT}`; c.textAlign = 'center'; c.fillText('∞', b.x, b.y + 42); c.textAlign = 'left'; }
      c.globalAlpha = 1;
    }
    const par = G.mode === 'play' && !save.sprout ? parOf(G.level) : null;
    if (par) { // tiny gold flower with the par number, tucked by the pouch
      const last = lay[lay.length - 1], x = last.x + 50, y = last.y;
      c.fillStyle = 'rgba(255,214,110,0.85)'; for (let k = 0; k < 5; k++) { const a = k / 5 * TAU - Math.PI / 2; c.beginPath(); c.arc(x + Math.cos(a) * 8, y + Math.sin(a) * 8, 6, 0, TAU); c.fill(); }
      c.fillStyle = '#5a3d10'; c.font = `bold 13px ${FONT}`; c.textAlign = 'center'; c.fillText(par, x, y + 5); c.textAlign = 'left';
    }
  }
  function drawLauncher() {
    const L = G.level.launch, x = L[0], y = L[1];
    const pulse = 0.5 + 0.5 * Math.sin(time * 2.5);
    const g = c.createRadialGradient(x, y, 4, x, y, 44); g.addColorStop(0, 'rgba(255,240,180,0.35)'); g.addColorStop(1, 'rgba(255,240,180,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, 44, 0, TAU); c.fill();
    c.strokeStyle = `rgba(255,240,200,${0.3 + pulse * 0.25})`; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 26, 0, TAU); c.stroke();
    // two leaf prongs
    c.fillStyle = '#5fbf6a';
    for (const sx of [-1, 1]) { c.save(); c.translate(x + sx * 20, y + 10); c.rotate(sx * -0.5); c.beginPath(); c.ellipse(0, 0, 7, 16, 0, 0, TAU); c.fill(); c.restore(); }
    let px = x, py = y;
    if (G.drag && G.aim) { const pull = G.aim.p / 100 * 36, d = OG.DIR[G.aim.a]; px = x - d[0] * pull; py = y - d[1] * pull; }
    if (G.drag || G.aim) { c.strokeStyle = 'rgba(200,255,190,0.7)'; c.lineWidth = 2; c.beginPath(); c.moveTo(x - 22, y + 2); c.lineTo(px, py); c.lineTo(x + 22, y + 2); c.stroke(); }
    if (canShoot()) drawPod(px, py, G.seed, 1.1);
  }

  // ---------- screens ----------
  // onboarding: a ghost fingertip shows "pull back and let go" (no words; for the kids). Early levels right away, later when idle.
  function drawGhostHand(l) {
    if (G.mode !== 'play' || G.hist.length || G.aim || G.drag || G.fl || G.win || G.fail) return;
    const early = l.id === '1-1' || l.id === '1-2';
    if (G.idleT < (early ? 1.5 : 12)) return;
    const sol = SOL[l.id], shot = sol && (sol.demo || (sol.easy && sol.easy.path[0]) || sol.path[0]); if (!shot) return;
    const T = 2.8, ph = ((G.idleT - (early ? 1.5 : 12)) % T) / T;
    const ang = shot.a / OG.ANG_STEPS * TAU, full = shot.p / 100 * PULL_MAX, [lx, ly] = l.launch;
    const pull = ph < 0.15 ? 0 : ph < 0.65 ? (ph - 0.15) / 0.5 : ph < 0.8 ? 1 : 0;
    const ease = 1 - Math.pow(1 - pull, 2), d = full * ease;
    const hx = lx - Math.cos(ang) * d, hy = ly - Math.sin(ang) * d;
    const alpha = ph < 0.1 ? ph / 0.1 : ph < 0.8 ? 1 : Math.max(0, 1 - (ph - 0.8) / 0.12);
    if (pull > 0.05) preview({ a: shot.a, p: Math.max(1, Math.round(shot.p * ease)) }, PREVIEW, '#ffffff', 0.45 * alpha);
    if (pull > 0) { c.strokeStyle = `rgba(255,255,255,${0.25 * alpha})`; c.lineWidth = 3; c.setLineDash([4, 6]); c.beginPath(); c.moveTo(lx, ly); c.lineTo(hx, hy); c.stroke(); c.setLineDash([]); }
    c.globalAlpha = alpha * 0.85; c.fillStyle = '#ffffff'; c.shadowColor = '#fff6c8'; c.shadowBlur = 16;
    c.beginPath(); c.arc(hx, hy, 13, 0, TAU); c.fill(); c.shadowBlur = 0;
    if (ph > 0.1 && ph < 0.8) { c.strokeStyle = '#ffffff'; c.lineWidth = 2; c.globalAlpha = alpha * 0.5; c.beginPath(); c.arc(hx, hy, 20 + 3 * Math.sin(time * 8), 0, TAU); c.stroke(); }
    if (ph >= 0.8 && ph < 0.95) { const k = (ph - 0.8) / 0.15; c.globalAlpha = (1 - k) * 0.8; c.strokeStyle = '#fff6c8'; c.lineWidth = 3; c.beginPath(); c.arc(lx, ly, 20 + k * 40, 0, TAU); c.stroke(); }
    c.globalAlpha = 1;
  }
  function drawPlay(dt) {
    const l = G.level;
    const wd = LV.WORLDS[(worldOf(l) || 0) - 1]; drawBg(wd ? wd.hue : 250); // sandbox has no world
    const pod = G.fl ? { x: G.fl.x, y: G.fl.y } : { x: l.launch[0], y: l.launch[1] };
    // gravity rings
    l.planets.forEach((p, i) => { const v = G.pv[i]; if (!p.rock) gravityRings(p.x, p.y, v.mu, p.r, v.kind === 'T' ? '#b8ffa0' : '#cfd8ff', v.kind === 'T' ? 1.6 : 1); });
    for (const u of l.suns || []) gravityRings(u.x, u.y, OG.K * 1.6 * u.r * u.r, u.r, '#ffc27a', 1.2);
    for (const t of G.tethers) drawTether(t, l);
    if (l.assist && !G.win) l.planets.forEach((p, i) => { // sprout mode: soft "catch" glow on planets that still need seeds
      if (p.rock || (G.s.f[i] && (!p.w || p.w === G.s.f[i]))) return;
      c.strokeStyle = `rgba(255,246,200,${0.10 + 0.05 * Math.sin(time * 2 + i)})`; c.lineWidth = l.assist; c.beginPath(); c.arc(p.x, p.y, p.r + l.assist / 2 + 4, 0, TAU); c.stroke();
    });
    // vine reach cue: when a vine seed is chosen, show where each planet's vine would go
    if (G.seed === 'V' && !G.fl && !G.win) {
      l.planets.forEach((p, i) => {
        if (p.rock) return; const j = OG.vineTarget(l, G.s, i); if (j < 0) return; const q = l.planets[j];
        c.strokeStyle = 'rgba(95,240,213,0.22)'; c.lineWidth = 2; c.setLineDash([2, 8]); c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y); c.stroke(); c.setLineDash([]);
      });
    }
    for (const u of l.suns || []) drawSun(u);
    l.planets.forEach((p, i) => (p.rock ? drawRock(p, i, l) : drawPlanet(p, i, G.pv[i], l, pod)));
    // aim preview
    if (G.aim && canShoot()) {
      if (G.hintT > 0) { c.save(); c.shadowColor = '#ffe58a'; c.shadowBlur = 12; preview(G.aim, PREVIEW_HINT, '#ffe58a', 0.8 + 0.2 * Math.sin(time * 6), 1.5); c.restore(); }
      else preview(G.aim, save.sprout ? PREVIEW_SPROUT : previewLen(), '#ffffff', G.drag ? 0.95 : 0.35);
    }
    drawGhostHand(l);
    drawLauncher();
    // pod trail + pod
    if (G.trail.length) { for (let k = 0; k < G.trail.length; k++) { const t = G.trail[k], a = k / G.trail.length; c.globalAlpha = a * (t[2] ? 0.8 : 0.55); c.fillStyle = t[2] ? '#ffe58a' : SEEDCOL[G.shot.s]; c.beginPath(); c.arc(t[0], t[1], (1 + a * 3) * (t[2] ? 1.3 : 1), 0, TAU); c.fill(); } c.globalAlpha = 1; }
    if (G.fl) drawPod(G.fl.x, G.fl.y, G.shot.s, 1);
    drawParts();
    btns = [];
    if (G.mode === 'play') drawPouch();
    // corner buttons
    button(44, 44, 24, GL.home, () => { G.mode = G.mode === 'sandbox' ? 'title' : 'select'; G.selWorld = worldOf(l) || 1; A.setWorld(0); });
    const outOfSeeds = G.mode === 'play' && !save.sprout && OG.remaining(G.s) === 0 && !G.win;
    button(OG.W - 44, 44, 24, GL.sound, () => { save.muted = !save.muted; A.setMuted(save.muted); persist(); });
    button(OG.W - 104, 44, 24, GL.restart, restart, { pulse: outOfSeeds || G.msgT > 0 });
    button(OG.W - 164, 44, 24, GL.undo, undo);
    if (G.mode === 'play') button(OG.W - 224, 44, 24, GL.hint, hint, { pulse: G.hintT > 0 });
    // level banner
    if (G.mode === 'play' && G.bannerT < 3.2) {
      const a = clamp(Math.min(G.bannerT * 2, (3.2 - G.bannerT) * 1.5), 0, 1); c.globalAlpha = a;
      c.textAlign = 'center'; c.fillStyle = '#fff6dd'; c.font = `bold 34px ${FONT}`; c.shadowColor = 'rgba(255,200,120,0.6)'; c.shadowBlur = 18;
      c.fillText(l.name, OG.W / 2, 64); c.shadowBlur = 0; c.font = `18px ${FONT}`; c.fillStyle = 'rgba(255,246,221,0.7)'; c.fillText(l.id, OG.W / 2, 90); c.textAlign = 'left'; c.globalAlpha = 1;
    }
    if (G.win > 1.4) drawWinCard(); else if (G.fail > 1.0) drawFailCard();
    if (G.mode === 'sandbox') drawSandboxBar();
  }
  function card(w, h) {
    const x = OG.W / 2 - w / 2, y = OG.H / 2 - h / 2;
    c.fillStyle = 'rgba(20,14,50,0.82)'; c.strokeStyle = 'rgba(255,230,180,0.45)'; c.lineWidth = 2;
    c.beginPath(); c.roundRect(x, y, w, h, 28); c.fill(); c.stroke();
    return { x, y };
  }
  function bloom(x, y, s, gold, filled) {
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + time * 0.4; c.fillStyle = filled ? (gold ? '#ffd36e' : '#ff9ccf') : 'rgba(255,255,255,0.15)'; c.beginPath(); c.ellipse(x + Math.cos(a) * s * 0.55, y + Math.sin(a) * s * 0.55, s * 0.42, s * 0.26, a, 0, TAU); c.fill(); }
    c.fillStyle = filled ? '#fff1a8' : 'rgba(255,255,255,0.2)'; c.beginPath(); c.arc(x, y, s * 0.3, 0, TAU); c.fill();
  }
  function drawWinCard() {
    const a = clamp((G.win - 1.4) * 3, 0, 1); c.globalAlpha = a;
    const { y } = card(420, 250);
    c.textAlign = 'center'; c.fillStyle = '#fff6dd'; c.font = `bold 34px ${FONT}`; c.fillText('Garden bloomed!', OG.W / 2, y + 56);
    const par = parOf(G.level), used = G.s.used, gold = !save.sprout && par && used <= par;
    bloom(OG.W / 2 - 40, y + 118, 46, false, true); bloom(OG.W / 2 + 40, y + 118, 46, true, !!gold);
    if (!save.sprout && par) { c.font = `16px ${FONT}`; c.fillStyle = 'rgba(255,246,221,0.75)'; c.fillText(`${used} seed${used === 1 ? '' : 's'}  ·  gold at ${par}`, OG.W / 2, y + 178); }
    c.textAlign = 'left';
    button(OG.W / 2 - 60, y + 214, 26, GL.restart, restart);
    button(OG.W / 2 + 60, y + 214, 30, GL.play, nextLevel, { fill: 'rgba(120,230,140,0.35)', pulse: true });
    c.globalAlpha = 1;
  }
  function drawFailCard() {
    const a = clamp((G.fail - 1.0) * 3, 0, 1); c.globalAlpha = a;
    const { y } = card(380, 200);
    c.textAlign = 'center'; c.fillStyle = '#fff6dd'; c.font = `bold 28px ${FONT}`; c.fillText('Out of seeds', OG.W / 2, y + 54);
    c.font = `16px ${FONT}`; c.fillStyle = 'rgba(255,246,221,0.7)'; c.fillText('The sleepy planets will wait for you.', OG.W / 2, y + 86); c.textAlign = 'left';
    button(OG.W / 2 - 55, y + 145, 28, GL.undo, undo);
    button(OG.W / 2 + 55, y + 145, 30, GL.restart, restart, { fill: 'rgba(120,230,140,0.35)', pulse: true });
    c.globalAlpha = 1;
  }

  // title
  const TITLE_PLANETS = [{ x: 300, y: 560, r: 60 }, { x: 900, y: 590, r: 46 }, { x: 640, y: 690, r: 32 }];
  const titleLevel = { id: 'title', launch: [0, 0], planets: TITLE_PLANETS };
  const titlePV = TITLE_PLANETS.map((p, i) => ({ grow: 1, from: -Math.PI / 2, kind: ['T', 'F', 'V'][i], prev: '', wake: 1, squish: 0, blink: i, cheer: 0, mu: 0 }));
  function drawTitle() {
    drawBg(140); btns = [];
    const t = time * 0.6;
    TITLE_PLANETS.forEach((p, i) => drawPlanet(p, i, titlePV[i], titleLevel, { x: 600 + Math.cos(t) * 330, y: 560 + Math.sin(t) * 110 }));
    // a pod looping around the garden with a sparkly trail
    for (let k = 0; k < 26; k++) { const tt = t - k * 0.03; c.globalAlpha = (1 - k / 26) * 0.5; c.fillStyle = '#ffe58a'; c.beginPath(); c.arc(600 + Math.cos(tt) * 330, 560 + Math.sin(tt) * 110, 3.5 - k * 0.1, 0, TAU); c.fill(); }
    c.globalAlpha = 1; drawPod(600 + Math.cos(t) * 330, 560 + Math.sin(t) * 110, ['T', 'F', 'V'][Math.floor(time / 4) % 3], 1.2);
    c.textAlign = 'center';
    c.shadowColor = 'rgba(160,255,170,0.7)'; c.shadowBlur = 30;
    const tg = c.createLinearGradient(0, 120, 0, 220); tg.addColorStop(0, '#fffbe6'); tg.addColorStop(1, '#a9f5b4');
    c.fillStyle = tg; c.font = `bold 96px ${FONT}`; c.fillText('ORBIT GARDEN', OG.W / 2, 200); c.shadowBlur = 0;
    c.font = `22px ${FONT}`; c.fillStyle = 'rgba(255,246,221,0.75)'; c.fillText('fling seeds · wake the sleepy planets', OG.W / 2, 245);
    c.textAlign = 'left';
    button(OG.W / 2, 340, 52, GL.play, () => { G.mode = 'select'; A.tap(); }, { fill: 'rgba(120,230,140,0.35)', pulse: true });
    // sprout mode toggle (for little gardeners): seedling glyph, glows when on
    button(OG.W / 2 - 130, 350, 32, GL.sprout, () => { save.sprout = !save.sprout; persist(); A.tap(); }, { fill: save.sprout ? 'rgba(150,240,120,0.45)' : 'rgba(255,255,255,0.08)' });
    button(OG.W / 2 + 130, 350, 32, GL.planet, () => { startSandbox(); A.tap(); });
    c.textAlign = 'center'; c.font = `15px ${FONT}`; c.fillStyle = 'rgba(255,246,221,0.65)';
    c.fillText(save.sprout ? 'Sprout mode ON' : 'Sprout mode', OG.W / 2 - 130, 402); c.fillText('Sandbox', OG.W / 2 + 130, 402);
    c.fillText('v' + (window.OG_VERSION || 'dev'), OG.W - 40, OG.H - 16); c.textAlign = 'left';
    button(OG.W - 44, 44, 24, GL.sound, () => { save.muted = !save.muted; A.setMuted(save.muted); persist(); });
  }
  // level select: three constellations of little planets
  function drawSelect() {
    drawBg(150); btns = [];
    button(44, 44, 24, GL.home, () => { G.mode = 'title'; });
    button(OG.W - 44, 44, 24, GL.sound, () => { save.muted = !save.muted; A.setMuted(save.muted); persist(); });
    LV.WORLDS.forEach((w, wi) => {
      const lv = worldLevels(w.n), y0 = 170 + wi * 220;
      const unlocked = lv.some(isUnlocked);
      c.textAlign = 'left'; c.font = `bold 26px ${FONT}`; c.fillStyle = unlocked ? `hsl(${w.hue},80%,82%)` : 'rgba(255,255,255,0.25)';
      c.fillText(w.name, 90, y0 - 52);
      const got = lv.filter((l) => save.done[l.id]).length, gold = lv.filter((l) => save.done[l.id] && parOf(l) && save.done[l.id] <= parOf(l)).length;
      c.font = `15px ${FONT}`; c.fillStyle = 'rgba(255,246,221,0.55)'; c.fillText(`${got}/${lv.length}   ✿ ${gold}`, 90 + c.measureText(w.name).width * 1.75 + 20, y0 - 52);
      // connecting dotted path
      const pts = lv.map((l, k) => ({ x: 120 + k * 106, y: y0 + Math.sin(k * 0.9 + wi) * 26 }));
      c.strokeStyle = 'rgba(255,255,255,0.15)'; c.setLineDash([2, 8]); c.lineWidth = 2; c.beginPath(); pts.forEach((p, k) => (k ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.stroke(); c.setLineDash([]);
      lv.forEach((l, k) => {
        const p = pts[k], ok = isUnlocked(l), done = save.done[l.id], gp = done && parOf(l) && done <= parOf(l);
        const r = 26;
        if (ok) btns.push({ x: p.x, y: p.y, r: r + 8, fn: () => { startLevel(l); A.tap(); } });
        const v = { grow: done ? 1 : 0, from: -Math.PI / 2, kind: done ? ['T', 'F', 'V'][wi] : '', prev: '', wake: done ? 1 : 0, squish: 0, blink: k, cheer: 0, mu: 0 };
        c.globalAlpha = ok ? 1 : 0.28;
        drawPlanet({ x: p.x, y: p.y, r }, k, v, { id: l.id }, null);
        if (gp) { c.strokeStyle = '#ffd36e'; c.lineWidth = 3; c.beginPath(); c.arc(p.x, p.y, r + 7, 0, TAU); c.stroke(); }
        c.fillStyle = 'rgba(255,246,221,0.8)'; c.font = `bold 14px ${FONT}`; c.textAlign = 'center'; c.fillText(String(k + 1), p.x, p.y + r + 26); c.textAlign = 'left';
        c.globalAlpha = 1;
      });
    });
  }

  // ---------- sandbox ----------
  function startSandbox() {
    const l = { id: 'sandbox', name: 'Sandbox', launch: [160, 400], planets: [{ x: 520, y: 320, r: 50 }, { x: 800, y: 520, r: 40 }, { x: 980, y: 260, r: 34 }], suns: [], pouch: { T: 99, F: 99, V: 99 } };
    startLevel(l); G.mode = 'sandbox'; G.sb = { tool: 'aim', dragBody: null }; G.bannerT = 9; A.setWorld(0);
  }
  const SB_TOOLS = [['aim', GL.sling], ['planet', GL.planet], ['sun', GL.sun], ['rock', GL.rock], ['erase', GL.erase], ['clear', GL.clear]];
  function drawSandboxBar() {
    SB_TOOLS.forEach(([k, gl], n) => {
      const x = OG.W / 2 + (n - (SB_TOOLS.length - 1) / 2) * 70, y = OG.H - 44;
      button(x, y, 26, gl, () => {
        if (k === 'clear') { G.s = OG.init(Object.assign({}, G.level, { planets: G.level.planets.map((p) => Object.assign({}, p, { f: '' })) })); G.s.pouch = { T: 99, F: 99, V: 99 }; G.hist = []; syncVisuals(); A.tap(); return; }
        G.sb.tool = k; A.tap();
      }, { fill: G.sb.tool === k ? 'rgba(150,240,120,0.4)' : 'rgba(255,255,255,0.08)' });
    });
    const lay = pouchLayout();
    for (const b of lay) { btns.push({ x: b.x, y: b.y, r: 28, fn: () => { G.seed = b.k; A.tap(); } }); c.fillStyle = G.seed === b.k ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.05)'; c.strokeStyle = G.seed === b.k ? SEEDCOL[b.k] : 'rgba(255,255,255,0.2)'; c.lineWidth = G.seed === b.k ? 3 : 1.5; c.beginPath(); c.arc(b.x, b.y, 24, 0, TAU); c.fill(); c.stroke(); drawPod(b.x, b.y + 1, b.k, 1.05); }
  }
  function sbBodyAt(w) {
    const l = G.level;
    for (let i = l.planets.length - 1; i >= 0; i--) { const p = l.planets[i]; if (Math.hypot(w.x - p.x, w.y - p.y) < p.r + 6) return { list: 'planets', i }; }
    for (let i = (l.suns || []).length - 1; i >= 0; i--) { const p = l.suns[i]; if (Math.hypot(w.x - p.x, w.y - p.y) < p.r + 6) return { list: 'suns', i }; }
    if (Math.hypot(w.x - l.launch[0], w.y - l.launch[1]) < 30) return { list: 'launch' };
    return null;
  }
  function sbRebuild() { // keep forests by index when bodies change
    const old = G.s; G.s = OG.init(G.level); G.level.planets.forEach((p, i) => { G.s.f[i] = (old.f[i] !== undefined ? old.f[i] : ''); });
    G.s.tethers = old.tethers.filter((t) => t[0] < G.level.planets.length && t[1] < G.level.planets.length);
    G.s.pouch = { T: 99, F: 99, V: 99 };
    while (G.pv.length < G.level.planets.length) G.pv.push({ grow: 0, from: 0, kind: '', prev: '', wake: 0, squish: 0, blink: G.pv.length, cheer: 0, mu: 0 });
    G.pv.length = G.level.planets.length; syncVisuals();
  }

  // ---------- input ----------
  function setAimFromDrag(w) {
    const dx = G.drag.x - w.x, dy = G.drag.y - w.y, len = Math.hypot(dx, dy);
    if (len < 12) { G.aim = G.drag.prevAim; G.drag.live = false; return; }
    const p = Math.round(clamp(len / PULL_MAX, 0, 1) * 100);
    let a = Math.round(Math.atan2(dy, dx) / TAU * OG.ANG_STEPS); a = ((a % OG.ANG_STEPS) + OG.ANG_STEPS) % OG.ANG_STEPS;
    if (G.drag.lastP !== undefined && Math.floor(p / 10) !== Math.floor(G.drag.lastP / 10)) A.tick(p / 100);
    G.drag.lastP = p; G.drag.live = true; G.aim = { a, p }; G.hintT = 0; A.stretch(p / 100);
    (G.drag.hist = G.drag.hist || []).push({ t: performance.now(), a, p }); if (G.drag.hist.length > 40) G.drag.hist.shift();
  }
  cv.addEventListener('pointerdown', (e) => {
    A.start(); G.idleT = 0; const w = toWorld(e);
    for (let k = btns.length - 1; k >= 0; k--) { const b = btns[k]; if (Math.hypot(w.x - b.x, w.y - b.y) <= b.r) { b.fn(); return; } }
    if (G.mode === 'play' || G.mode === 'sandbox') {
      if (G.fl) { G.fast = true; return; }
      if (G.mode === 'sandbox' && G.sb.tool !== 'aim') { sandboxDown(w); return; }
      if (!canShoot()) return;
      G.drag = { x: w.x, y: w.y, prevAim: G.aim, onPod: Math.hypot(w.x - G.level.launch[0], w.y - G.level.launch[1]) < 34 };
      cv.setPointerCapture(e.pointerId);
    }
  });
  cv.addEventListener('pointermove', (e) => {
    const w = toWorld(e);
    if (G.drag) setAimFromDrag(w);
    else if (G.sb && G.sb.dragBody) sandboxMove(w);
  });
  cv.addEventListener('pointerup', (e) => {
    if (G.fl) G.fast = false;
    if (G.sb && G.sb.dragBody) { G.sb.dragBody = null; sbRebuild(); return; }
    if (!G.drag) return;
    const d = G.drag; A.stretch(-1);
    // Steady release: fingers wobble as they lift. If the aim only twitched in the last ~100 ms, fire the aim the
    // player was looking at just before (the preview they chose), not the lift-off jitter.
    if (d.hist && d.hist.length) {
      const now = performance.now(), held = d.hist.filter((h) => h.t <= now - 100).pop();
      if (held) { let da = Math.abs(held.a - G.aim.a); da = Math.min(da, OG.ANG_STEPS - da);
        if (da <= OG.ANG_STEPS / 120 && Math.abs(held.p - G.aim.p) <= 8) G.aim = { a: held.a, p: held.p }; }
    }
    G.drag = null;
    if (d.live) fire(G.aim); else if (d.onPod && G.aim) fire(G.aim); // tap the pod = launch the ghost/hint aim
  });
  function sandboxDown(w) {
    const l = G.level, hit = sbBodyAt(w), tool = G.sb.tool;
    if (tool === 'erase') { if (hit && hit.list !== 'launch') { l[hit.list].splice(hit.i, 1); if (hit.list === 'planets') { G.s.f.splice(hit.i, 1); G.s.tethers = []; G.pv.splice(hit.i, 1); } sbRebuild(); A.tap(); } return; }
    if (hit) { G.sb.dragBody = hit; return; }
    if (tool === 'planet') { const sizes = [26, 40, 56]; l.planets.push({ x: w.x, y: w.y, r: sizes[l.planets.length % 3] }); }
    else if (tool === 'rock') l.planets.push({ x: w.x, y: w.y, r: 18, rock: 1 });
    else if (tool === 'sun') { l.suns = l.suns || []; l.suns.push({ x: w.x, y: w.y, r: 40 }); }
    sbRebuild(); A.tap();
  }
  function sandboxMove(w) {
    const h = G.sb.dragBody, l = G.level;
    if (h.list === 'launch') l.launch = [w.x, w.y]; else { l[h.list][h.i].x = w.x; l[h.list][h.i].y = w.y; }
  }
  window.addEventListener('keydown', (e) => {
    A.start(); G.idleT = 0;
    if (G.mode !== 'play' && G.mode !== 'sandbox') { if (e.code === 'Enter' || e.code === 'Space') { if (G.mode === 'title') G.mode = 'select'; } if (e.code === 'Escape') G.mode = 'title'; return; }
    const big = e.shiftKey ? 8 : 1;
    if (!G.aim) G.aim = { a: 0, p: 50 };
    if (e.code === 'ArrowLeft') { G.aim.a = (G.aim.a - big + OG.ANG_STEPS) % OG.ANG_STEPS; G.hintT = 0; }
    else if (e.code === 'ArrowRight') { G.aim.a = (G.aim.a + big) % OG.ANG_STEPS; G.hintT = 0; }
    else if (e.code === 'ArrowUp') { G.aim.p = clamp(G.aim.p + (e.shiftKey ? 5 : 1), 0, 100); G.hintT = 0; }
    else if (e.code === 'ArrowDown') { G.aim.p = clamp(G.aim.p - (e.shiftKey ? 5 : 1), 0, 100); G.hintT = 0; }
    else if (e.code === 'Space' || e.code === 'Enter') { if (G.win > 1.4) nextLevel(); else fire(G.aim); }
    else if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') { const k = OG.SEEDS[+e.code.slice(5) - 1]; if (G.mode === 'sandbox' || G.s.pouch[k] > 0) G.seed = k; }
    else if (e.code === 'KeyZ' || e.code === 'KeyU' || e.code === 'Backspace') undo();
    else if (e.code === 'KeyR') restart();
    else if (e.code === 'KeyH') hint();
    else if (e.code === 'KeyM') { save.muted = !save.muted; A.setMuted(save.muted); persist(); }
    else if (e.code === 'Escape') { G.mode = G.mode === 'sandbox' ? 'title' : 'select'; }
    else return;
    e.preventDefault();
  });

  // ---------- loop ----------
  let last = performance.now(), acc = 0;
  function update(dt) {
    time += dt;
    if (G.mode === 'play' || G.mode === 'sandbox') {
      G.bannerT += dt; G.idleT = (G.idleT || 0) + dt; if (G.hintT > 0) G.hintT -= dt; if (G.msgT > 0) G.msgT -= dt;
      if (G.fl) {
        acc += dt * OG.HZ * (G.fast ? 3 : 1);
        let n = 0;
        while (acc >= 1 && G.fl && n < 400) {
          acc -= 1; n++; const nb = G.fl.bounces.length, ns = G.fl.skips.length; OG.step(G.fl);
          if (G.fl.t % 3 === 0) { G.trail.push([G.fl.x, G.fl.y, G.fl.chain || 0]); if (G.fl.chain && G.fl.t % 6 === 0) G.parts.push({ x: G.fl.x, y: G.fl.y, vx: (Math.random() - 0.5) * 0.6, vy: (Math.random() - 0.5) * 0.6, life: 0, max: 0.8, col: '#fff2b0', s: 1.5 + Math.random() * 1.5, k: 'spark' }); if (G.trail.length > 70) G.trail.shift(); }
          if (G.fl.bounces.length > nb) { const b = G.fl.bounces[nb]; A.bounce(); G.pv[b.i].squish = 1; burst(b.x, b.y, '#ffb3dc', 14, 2.4); }
          if (G.fl.skips.length > ns) { // skip: the planet sprouts right away (the sim plants it no matter how the flight ends)
            const k = G.fl.skips[ns], v = G.pv[k.i];
            if (v.kind !== G.shot.s) plantFx(k.i, G.shot.s, k.nx, k.ny, v.kind); else { v.squish = 0.6; A.land(k.i); }
            G.fl.chain = (G.fl.chain || 0) + 1; A.skip(G.fl.chain); G.skipCount = (G.skipCount || 0) + 1;
            const P = G.level.planets[k.i]; burst(P.x + k.nx * P.r, P.y + k.ny * P.r, '#ffe58a', 18 + 6 * G.fl.chain, 2.6);
            for (let q = 0; q < G.fl.chain; q++) G.parts.push({ x: P.x + k.nx * (P.r + 14) + (q - (G.fl.chain - 1) / 2) * 16, y: P.y + k.ny * (P.r + 14), vx: 0, vy: -0.5, life: 0, max: 1.4, col: '#ffe58a', s: 7, k: 'star', rot: 0, vr: 0.05 });
          }
          if (G.fl.done) { resolve(); acc = 0; }
        }
      } else { acc = 0; if (G.trail.length) G.trail.shift(); }
      for (const v of G.pv) {
        if (v.grow < 1) v.grow = Math.min(1, v.grow + dt * 0.9);
        const target = v.kind ? 1 : 0; v.wake += (target - v.wake) * Math.min(1, dt * 3);
        v.squish = Math.max(0, v.squish - dt * 1.6); v.cheer = Math.max(0, v.cheer - dt * 0.8);
        if (v.cheerAt !== undefined && G.win && G.win >= v.cheerAt) { v.cheer = 1.6; v.squish = 0.8; v.cheerAt = undefined; }
      }
      G.level.planets.forEach((p, i) => { const tm = OG.mu(p, G.s.f[i]); G.pv[i].mu += (tm - G.pv[i].mu) * Math.min(1, dt * 2); });
      for (const t of G.tethers) t.g = Math.min(1, t.g + dt * 1.2);
      if (G.win) { G.win += dt; if (G.win < 4) confetti(); }
      if (G.fail) G.fail += dt;
    }
    updateParts(dt);
  }
  function frame(now) {
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; // rAF time can be slightly behind performance.now()
    update(dt); draw(); requestAnimationFrame(frame);
  }
  function draw() {
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height);
    if (G.mode === 'title') drawTitle(); else if (G.mode === 'select') drawSelect(); else drawPlay();
  }

  // ---------- boot (URL params drive screenshots / tests) ----------
  const qs = Q.get('screen');
  if (Q.get('level') && levelById(Q.get('level'))) {
    startLevel(levelById(Q.get('level')));
    if (Q.get('shots')) for (const t of Q.get('shots').split(',')) { G.seed = parseShot(t).s; fire(parseShot(t)); while (G.fl) { OG.step(G.fl); if (G.fl.done) resolve(); } }
    syncVisuals(); G.pv.forEach((v) => { v.grow = 1; v.wake = v.kind ? 1 : 0; v.cheer = 0; }); G.tethers.forEach((t) => { t.g = 1; }); G.parts = [];
    if (G.win) G.win = 2; if (G.fail) G.fail = 2;
    if (Q.get('seed')) G.seed = Q.get('seed');
    if (Q.get('aim')) { const s = parseShot(Q.get('aim')); G.seed = s.s; G.aim = { a: s.a, p: s.p }; G.drag = Q.get('drag') ? { x: 0, y: 0, live: true } : null; }
    if (Q.get('hint')) hint();
    if (Q.get('fly')) { const s = parseShot(Q.get('fly')); G.seed = s.s; fire(s); const ff = +(Q.get('ff') || 60); for (let k = 0; k < ff && G.fl; k++) { OG.step(G.fl); if (k % 3 === 0) { G.trail.push([G.fl.x, G.fl.y]); if (G.trail.length > 70) G.trail.shift(); } } }
    G.bannerT = Q.get('banner') ? 1 : 9;
  } else if (qs === 'select') G.mode = 'select';
  else if (qs === 'sandbox') startSandbox();
  if (Q.get('paused')) { update(0.016); draw(); window.__OG.tick = (n) => { for (let k = 0; k < (n || 1); k++) update(1 / 60); draw(); }; }
  else requestAnimationFrame(frame);
  window.__OG.fire = fire; window.__OG.startLevel = startLevel;
})();
