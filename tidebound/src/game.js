// TIDEBOUND client: rendering, input, animation, menus. Logic lives in core.js.
(function () {
  'use strict';
  const TB = window.TB, A = window.TBAudio, LEVELS = window.TB_LEVELS, SOL = window.TBSolver;
  const VERSION = window.TB_VERSION || 'dev';
  const cv = document.getElementById('c'), cx = cv.getContext('2d');
  const Q = new URLSearchParams(location.search);
  let W = 0, H = 0, DPR = 1;
  const WORLD_NAMES = { 0: 'Tidepool', 1: 'Shore', 2: 'Lagoon', 3: 'Quarry', 4: 'Currents', 5: 'Riddles' };
  const WORLD_HUE = { 0: '#f4a9bd', 1: '#f2c879', 2: '#7fd6c8', 3: '#b9b2c9', 4: '#8fb8f0', 5: '#d9a6f2' };

  // ---------- save ----------
  const SAVE_KEY = 'tidebound.save.v1';
  let save = { done: {}, last: 0 };
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && s.done) save = s; } catch (e) { /* file:// may block storage */ }
  // reduced motion: OS setting by default, toggle on the select screen (V key), remembered
  let RM = Q.get('rm') ? Q.get('rm') === '1' : (save.rm !== undefined ? save.rm : !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches));
  const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } };
  // main path unlocks in order (solved + 2 ahead); the Tidepool kids' track (world 0) is always open
  // three tracks: Tidepool (0, always open), the main worlds (1-4), Riddles (5, opens once Shore-Quarry are behind you)
  const track = (w) => (w === 0 ? 0 : w === 5 ? 2 : 1);
  const MAIN = LEVELS.map((l, k) => k).filter((k) => track(LEVELS[k].world) === 1);
  const solvedCount = () => MAIN.filter((k) => save.done[LEVELS[k].id]).length;
  const RIDDLE_AT = 24;
  const unlocked = (k) => Q.get('unlock') === 'all' || LEVELS[k].world === 0 || !!save.done[LEVELS[k].id] ||
    (LEVELS[k].world === 5 ? solvedCount() >= RIDDLE_AT : MAIN.indexOf(k) <= solvedCount() + 2);

  // ---------- par (computed once, cached) ----------
  const parCache = {};
  function parOf(def) {
    if (def.par) return def.par;
    const B = window.TB_SOLUTIONS && window.TB_SOLUTIONS[def.id];
    if (B) return B.par;
    if (parCache[def.id] === undefined) { const r = SOL.solve(def); parCache[def.id] = r.moves; }
    return parCache[def.id];
  }

  // ---------- app ----------
  const app = { screen: Q.get('level') ? 'play' : (Q.get('screen') || 'title'), t: 0, sel: save.last || 0, fade: 0 };
  let G = null;
  const particles = [];

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = W * DPR; cv.height = H * DPR; cv.style.width = W + 'px'; cv.style.height = H + 'px';
    if (G) layout();
  }

  function startLevel(k) {
    k = Math.max(0, Math.min(LEVELS.length - 1, k));
    const def = LEVELS[k];
    const { level, state } = TB.parse(def);
    G = { k, def, level, state, init: state, hist: [], queue: [], won: false, wonT: 0, idle: 0, hint: null, msgT: 0, dialPulse: 0,
      wl: TB.isHigh(level, state.t) ? 1 : 0, sprites: [], player: null, staticDirty: true, par: parOf(def), shake: 0, goalsLit: {} };
    // world intro card: big picture + name when you first step into a world
    G.intro = (k === 0 || LEVELS[k - 1].world !== def.world) && !save.done[def.id] && !Q.get('moves') ? 2.6 : 0;
    save.last = k; persist();
    app.screen = 'play'; app.sel = k;
    A.setWorld(def.world); A.setTide(TB.isHigh(level, state.t));
    layout(); rebuildSprites(true);
  }

  function layout() {
    const top = 86, bottom = 96;
    const T = Math.floor(Math.min((W - 40) / G.level.w, (H - top - bottom) / G.level.h, 84));
    G.T = Math.max(16, T);
    G.ox = Math.floor((W - G.level.w * G.T) / 2);
    G.oy = Math.floor(top + (H - top - bottom - G.level.h * G.T) / 2);
    G.staticDirty = true;
  }

  function rebuildSprites(snap) {
    const s = G.state, w = G.level.w;
    G.sprites = [];
    for (let i = 0; i < s.occ.length; i++) if (s.occ[i]) G.sprites.push({ type: s.occ[i], i, x: i % w, y: (i / w) | 0, q: [], sink: 0, id: i });
    const px = s.p % w, py = (s.p / w) | 0;
    if (!G.player || snap) G.player = { x: px, y: py, q: [], face: 2, bump: 0, bumpDir: 0, walk: 0 };
    else { G.player.x = px; G.player.y = py; G.player.q = []; }
  }

  // ---------- actions ----------
  const DIRNAME = ['up', 'right', 'down', 'left'];
  function busy() {
    if (!G) return false;
    if (G.player.q.length > 1) return true;
    return G.sprites.some((sp) => sp.q.length > 2);
  }
  function act(a) {
    if (!G || G.won) return;
    G.idle = 0; G.hint = null; if (G.intro > 0.3) G.intro = 0.3;
    const lv = G.level, before = G.state;
    const wasHigh = TB.isHigh(lv, before.t);
    const r = TB.step(lv, before, a);
    if (a < 4) G.player.face = a;
    if (!r.ok) {
      G.player.bump = 1; G.player.bumpDir = a;
      if (r.why === 'water' || r.why === 'tide') {
        const n = r.why === 'water' ? TB.neighbor(lv, before.p, a) : before.p;
        splash(n, 10); A.sfx('splash'); G.dialPulse = 1;
      } else A.sfx('bump');
      return;
    }
    G.hist.push(before);
    G.state = r.state;
    const ev = r.ev, w = lv.w;
    if (ev.push) {
      const sp = G.sprites.find((s) => s.i === ev.push.from);
      if (sp) {
        sp.i = ev.push.end;
        for (let k = 1; k < ev.push.path.length; k++) sp.q.push(ev.push.path[k]);
        sp.drift = ev.push.path.length > 2;
        if (ev.fill >= 0) { sp.sinkAt = ev.fill; }
      }
      if (ev.push.type === TB.STONE) A.sfx('stone'); else A.sfx('push');
      if (ev.push.path.length > 2) { A.sfx('drift', ev.push.path.length); }
      const firstWet = ev.push.path.slice(1).find((i) => TB.isWater(before.tiles[i], wasHigh));
      if (firstWet !== undefined) setTimeout(() => { splash(firstWet, 8); A.sfx('splash'); }, 90);
    }
    if (ev.kind !== 'shove' && a < 4) { G.player.q.push(G.state.p); A.sfx('step', before.tiles[G.state.p] === TB.SAND); }
    if (a === 4) { G.player.waitPulse = 1; }
    if (ev.tideTurn) { const hi = TB.isHigh(lv, G.state.t); A.sfx('tide', hi); A.setTide(hi); G.dialPulse = 1; if (!hi) settleFx(); }
    // goal chimes
    const hi2 = TB.isHigh(lv, G.state.t);
    let lit = 0; const nowLit = {};
    for (let i = 0; i < lv.goal.length; i++) if (lv.goal[i] && TB.settledOn(lv, G.state, i, hi2)) { nowLit[i] = 1; lit++; }
    for (const i in nowLit) if (!G.goalsLit[i]) { setTimeout(() => A.sfx('goal', lit), 160); sparkle(+i, 14, '#ffe9a8'); }
    G.goalsLit = nowLit;
    if (TB.isWon(lv, G.state)) win();
  }
  function settleFx() {
    const s = G.state;
    for (let i = 0; i < s.occ.length; i++) if (s.occ[i] === TB.WOOD && s.tiles[i] === TB.SAND) { puff(i); }
    setTimeout(() => A.sfx('settle'), 200);
  }
  function undo() {
    if (!G || !G.hist.length) return;
    if (G.won) { G.won = false; }
    G.state = G.hist.pop(); G.idle = 0; G.hint = null;
    A.sfx('undo'); A.setTide(TB.isHigh(G.level, G.state.t));
    G.goalsLit = litGoals(); G.staticDirty = true; rebuildSprites(false);
  }
  function restart() {
    if (!G) return;
    if (G.state !== G.init) G.hist.push(G.state);
    G.state = G.init; G.won = false; G.idle = 0; G.hint = null; A.sfx('undo');
    A.setTide(TB.isHigh(G.level, G.state.t)); G.goalsLit = litGoals(); G.staticDirty = true; rebuildSprites(true);
  }
  function litGoals() { const o = {}, lv = G.level, hi = TB.isHigh(lv, G.state.t); for (let i = 0; i < lv.goal.length; i++) if (lv.goal[i] && TB.settledOn(lv, G.state, i, hi)) o[i] = 1; return o; }
  function hint() {
    if (!G || G.won) return;
    // fast path: the baked optimal route, if the player is still on it
    if (!G.route) {
      G.route = new Map();
      const B = window.TB_SOLUTIONS && window.TB_SOLUTIONS[G.def.id];
      if (B) { let s = G.init; for (let i = 0; i < B.sol.length; i++) { const a = 'URDLW'.indexOf(B.sol[i]); G.route.set(TB.key(G.level, s), [a, B.sol.length - i]); const r = TB.step(G.level, s, a); if (!r.ok) break; s = r.state; } }
    }
    const on = G.route.get(TB.key(G.level, G.state));
    if (on) { G.hint = { a: on[0], t: 0, left: on[1] }; A.sfx('ui'); return; }
    const r = SOL.solveState(G.level, G.state, { maxStates: 150000 });
    if (r.moves > 0) G.hint = { a: r.actions[0], t: 0, left: r.moves };
    else G.hint = { a: -1, t: 0 };
    A.sfx('ui');
  }
  function win() {
    G.won = true; G.wonT = 0;
    const moves = G.state.t, id = G.def.id;
    const prev = save.done[id];
    const best = prev ? Math.min(prev.best, moves) : moves;
    save.done[id] = { best, pearl: best <= G.par };
    persist();
    setTimeout(() => { A.sfx('win'); if (moves <= G.par) setTimeout(() => A.sfx('pearl'), 600); }, 250);
    for (let i = 0; i < G.level.goal.length; i++) if (G.level.goal[i]) sparkle(i, 24, '#fff6c8');
  }

  // ---------- particles ----------
  function tileCenter(i) { const w = G.level.w; return [G.ox + (i % w + 0.5) * G.T, G.oy + (((i / w) | 0) + 0.5) * G.T]; }
  function splash(i, n) {
    if (i < 0) return; if (RM) n = Math.min(n, 3); const [x, y] = tileCenter(i);
    for (let k = 0; k < n; k++) { const a = Math.random() * Math.PI * 2, v = 30 + Math.random() * 70; particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, life: 0.6 + Math.random() * 0.3, t: 0, c: '#e8fbff', r: 1.5 + Math.random() * 2.5, g: 160 }); }
    particles.push({ ring: true, x, y, t: 0, life: 0.8, c: 'rgba(230,250,255,', r: G.T * 0.2 });
  }
  function sparkle(i, n, c) {
    if (RM) n = Math.min(n, 4);
    const [x, y] = tileCenter(i);
    for (let k = 0; k < n; k++) { const a = Math.random() * Math.PI * 2, v = 20 + Math.random() * 60; particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.7 + Math.random() * 0.6, t: 0, c, r: 1 + Math.random() * 2, g: -10, star: true }); }
  }
  function puff(i) {
    const [x, y] = tileCenter(i);
    for (let k = 0; k < 8; k++) { const a = Math.random() * Math.PI * 2, v = 10 + Math.random() * 25; particles.push({ x: x + Math.cos(a) * G.T * 0.3, y: y + Math.sin(a) * G.T * 0.3, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.6, t: 0, c: '#f3dfb0', r: 2 + Math.random() * 2, g: 0 }); }
  }

  // ---------- input ----------
  const KEYDIR = { ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3 };
  window.addEventListener('keydown', (e) => {
    A.start();
    if (e.repeat && !(e.code in KEYDIR)) return;
    const c = e.code;
    if (app.screen === 'title') { app.screen = 'select'; A.sfx('ui'); e.preventDefault(); return; }
    if (app.screen === 'select') { selectKey(c); e.preventDefault(); return; }
    if (!G) return;
    if (G.won && G.wonT > 0.6) {
      if (c === 'KeyZ' || c === 'Backspace') { undo(); return; }
      if (c === 'KeyR') { restart(); return; }
      if (c === 'Escape') { app.screen = 'select'; return; }
      next(); e.preventDefault(); return;
    }
    if (c in KEYDIR) { if (G.queue.length < 3) G.queue.push(KEYDIR[c]); e.preventDefault(); }
    else if (c === 'Space' || c === 'Period') { if (G.queue.length < 3) G.queue.push(4); e.preventDefault(); }
    else if (c === 'KeyZ' || c === 'Backspace' || c === 'KeyU') { G.queue.length = 0; undo(); e.preventDefault(); }
    else if (c === 'KeyR') { G.queue.length = 0; restart(); }
    else if (c === 'KeyH') hint();
    else if (c === 'KeyM') A.toggleMute();
    else if (c === 'Escape') { app.screen = 'select'; A.sfx('ui'); }
  });
  function next() {
    const n = G.k + 1;
    if (n < LEVELS.length && track(LEVELS[n].world) === track(G.def.world)) startLevel(n); else { app.screen = 'select'; }
  }
  function selectKey(c) {
    const k = app.sel, row = levelRows();
    let [r, col] = posOf(k);
    if (c === 'ArrowRight' || c === 'KeyD') col++;
    else if (c === 'ArrowLeft' || c === 'KeyA') col--;
    else if (c === 'ArrowDown' || c === 'KeyS') r++;
    else if (c === 'ArrowUp' || c === 'KeyW') r--;
    else if (c === 'Enter' || c === 'Space') { if (unlocked(k)) { A.sfx('ui'); startLevel(k); } else A.sfx('bump'); return; }
    else if (c === 'KeyM') { A.toggleMute(); return; }
    else if (c === 'KeyV') { toggleRM(); return; }
    else if (c === 'Escape') { app.screen = 'title'; return; }
    r = Math.max(0, Math.min(row.length - 1, r)); col = Math.max(0, Math.min(row[r].length - 1, col));
    if (row[r][col] !== k) { app.sel = row[r][col]; A.sfx('ui'); }
  }
  function levelRows() { const rows = []; LEVELS.forEach((l, k) => { (rows[l.world] = rows[l.world] || []).push(k); }); return rows.filter(Boolean); }
  function posOf(k) { const rows = levelRows(); for (let r = 0; r < rows.length; r++) { const c = rows[r].indexOf(k); if (c >= 0) return [r, c]; } return [0, 0]; }

  // pointer: buttons, tap-to-step, swipe
  let ptr = null;
  const buttons = [];
  cv.addEventListener('pointerdown', (e) => { A.start(); ptr = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  cv.addEventListener('pointerup', (e) => {
    if (!ptr) return; const dx = e.clientX - ptr.x, dy = e.clientY - ptr.y; ptr = null;
    const x = e.clientX, y = e.clientY;
    for (const b of buttons) if (Math.hypot(x - b.x, y - b.y) < b.r + 6) { b.fn(); return; }
    if (app.screen === 'title') { app.screen = 'select'; A.sfx('ui'); return; }
    if (app.screen === 'select') return;
    if (!G) return;
    if (G.won && G.wonT > 0.6) { next(); return; }
    if (Math.hypot(dx, dy) > 28) { const a = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0); G.queue.push(a); return; }
    const tx = Math.floor((x - G.ox) / G.T), ty = Math.floor((y - G.oy) / G.T);
    const px = G.state.p % G.level.w, py = (G.state.p / G.level.w) | 0;
    const ddx = tx - px, ddy = ty - py;
    if (ddx === 0 && ddy === 0) G.queue.push(4);
    else if (Math.abs(ddx) + Math.abs(ddy) === 1) G.queue.push(ddx === 1 ? 1 : ddx === -1 ? 3 : ddy === 1 ? 2 : 0);
    else if (ddx === 0 || ddy === 0) G.queue.push(ddx > 0 ? 1 : ddx < 0 ? 3 : ddy > 0 ? 2 : 0);
  });

  // ---------- update ----------
  function update(dt) {
    app.t += dt;
    for (let k = particles.length - 1; k >= 0; k--) { const p = particles[k]; p.t += dt; if (p.t > p.life) { particles.splice(k, 1); continue; } if (!p.ring) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g || 0) * dt; p.vx *= 0.97; } }
    if (app.screen !== 'play' || !G) return;
    const hi = TB.isHigh(G.level, G.state.t);
    G.wl += ((hi ? 1 : 0) - G.wl) * Math.min(1, dt * 3.2);
    G.dialPulse = Math.max(0, G.dialPulse - dt * 1.5);
    if (G.won) G.wonT += dt; else G.idle += dt;
    if (G.hint) G.hint.t += dt;
    if (G.intro > 0) G.intro = Math.max(0, G.intro - dt);
    if (G.def.world === 1 && G.k < 4 && G.idle > 9 && !G.hint && !G.won) hint();
    // animation
    const fast = G.queue.length > 0 ? 2 : 1;
    const pl = G.player;
    if (pl.q.length) { const tgt = pl.q[0], tx = tgt % G.level.w, ty = (tgt / G.level.w) | 0; const sp = 9 * fast * dt; const d = Math.hypot(tx - pl.x, ty - pl.y); if (d <= sp) { pl.x = tx; pl.y = ty; pl.q.shift(); } else { pl.x += (tx - pl.x) / d * sp; pl.y += (ty - pl.y) / d * sp; } pl.walk += dt * 14; }
    pl.bump = Math.max(0, pl.bump - dt * 5);
    pl.waitPulse = Math.max(0, (pl.waitPulse || 0) - dt * 2);
    for (const sp of G.sprites) {
      if (sp.q.length) {
        const tgt = sp.q[0], tx = tgt % G.level.w, ty = (tgt / G.level.w) | 0;
        const v = (sp.drift ? 7.5 : 9) * fast * dt; const d = Math.hypot(tx - sp.x, ty - sp.y);
        if (d <= v) { sp.x = tx; sp.y = ty; sp.q.shift(); if (sp.drift && Math.random() < 0.7) wake(sp); } else { sp.x += (tx - sp.x) / d * v; sp.y += (ty - sp.y) / d * v; }
        if (!sp.q.length && sp.sinkAt !== undefined) { sp.sinking = 0.001; splash(sp.sinkAt, 16); A.sfx('fill'); }
      }
      if (sp.sinking) { sp.sinking += dt * 2; if (sp.sinking >= 1) { sp.dead = true; G.staticDirty = true; } }
    }
    G.sprites = G.sprites.filter((s) => !s.dead);
    // input queue: only take the next action when the player has nearly arrived
    if (G.queue.length && pl.q.length === 0 && !G.sprites.some((s) => s.q.length > 1 || (s.sinking && !s.dead))) act(G.queue.shift());
  }
  function wake(sp) { const x = G.ox + (sp.x + 0.5) * G.T, y = G.oy + (sp.y + 0.5) * G.T; particles.push({ ring: true, x, y, t: 0, life: 0.7, c: 'rgba(230,250,255,', r: G.T * 0.35 }); }

  // ---------- drawing helpers ----------
  function hash(i, k) { let h = (i * 374761393 + k * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

  function drawOcean(c, t, tint) {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, tint ? '#0d4f63' : '#0f5a6e'); g.addColorStop(1, '#073042');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // caustic glints
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 70; k++) {
      const bx = hash(k, 1) * W, by = hash(k, 2) * H, ph = hash(k, 3) * 6.28;
      const x = bx + Math.sin(t * 0.3 + ph) * 18, y = by + Math.cos(t * 0.23 + ph) * 10;
      const a = 0.02 + 0.018 * Math.sin(t * 0.8 + ph);
      c.strokeStyle = `rgba(160,235,240,${a})`; c.lineWidth = 2;
      c.beginPath(); c.ellipse(x, y, 22 + hash(k, 4) * 30, 5 + hash(k, 5) * 6, Math.sin(ph) * 0.4, 0, Math.PI * 2); c.stroke();
    }
    c.restore();
  }

  function floorAt(i) { return G.state.tiles[i] !== TB.WALL; }
  function buildStatic() {
    const lv = G.level, T = G.T, s = G.state, w = lv.w, h = lv.h;
    const can = G.static || (G.static = document.createElement('canvas'));
    can.width = (w * T + 2 * T) * DPR; can.height = (h * T + 2 * T) * DPR;
    const c = can.getContext('2d'); c.setTransform(DPR, 0, 0, DPR, T, T);
    c.clearRect(-T, -T, w * T + 2 * T, h * T + 2 * T);
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? TB.WALL : s.tiles[y * w + x];
    // shallow halo around the island
    c.save(); c.filter = `blur(${T * 0.25}px)`; c.fillStyle = 'rgba(90,200,200,0.35)';
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (at(x, y) === TB.ROCK || at(x, y) === TB.SAND) { rr(c, x * T - T * 0.25, y * T - T * 0.25, T * 1.5, T * 1.5, T * 0.5); c.fill(); }
    c.restore();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, tl = at(x, y), X = x * T, Y = y * T;
      if (tl === TB.SAND) {
        c.fillStyle = '#e6cd92'; c.fillRect(X, Y, T + 0.5, T + 0.5);
        c.strokeStyle = 'rgba(170,130,70,0.28)'; c.lineWidth = Math.max(1, T * 0.025);
        for (let k = 0; k < 3; k++) { const yy = Y + T * (0.25 + k * 0.25) + (hash(i, k) - 0.5) * T * 0.08; c.beginPath(); c.moveTo(X + T * 0.08, yy); c.quadraticCurveTo(X + T * 0.5, yy - T * 0.08, X + T * 0.92, yy); c.stroke(); }
        c.fillStyle = 'rgba(150,110,60,0.25)'; for (let k = 0; k < 5; k++) c.fillRect(X + hash(i, 10 + k) * T, Y + hash(i, 20 + k) * T, 1.5, 1.5);
      } else if (tl === TB.ROCK) {
        c.fillStyle = '#a99d88'; c.fillRect(X, Y, T + 0.5, T + 0.5);
        const v = Math.floor(hash(i, 7) * 18);
        c.fillStyle = `rgb(${190 + v},${180 + v},${160 + v})`; rr(c, X + T * 0.06, Y + T * 0.06, T * 0.88, T * 0.88, T * 0.16); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.12)'; rr(c, X + T * 0.1, Y + T * 0.08, T * 0.8, T * 0.3, T * 0.12); c.fill();
        c.fillStyle = 'rgba(90,80,60,0.18)'; for (let k = 0; k < 3; k++) { c.beginPath(); c.arc(X + T * (0.2 + 0.6 * hash(i, 30 + k)), Y + T * (0.2 + 0.6 * hash(i, 40 + k)), T * 0.03, 0, 7); c.fill(); }
      } else if (tl === TB.WALL) {
        // cliff wherever it borders the playfield (land or lagoon water), so the
        // lagoon reads as enclosed: crates can never float out to sea
        let near = false; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const t2 = at(x + dx, y + dy); if (t2 !== TB.WALL) near = true; }
        if (!near) continue;
        const v = Math.floor(hash(i, 3) * 14);
        c.fillStyle = `rgb(${62 + v},${66 + v},${72 + v})`;
        c.beginPath(); const j = (k) => (hash(i, 50 + k) - 0.5) * T * 0.12;
        c.moveTo(X + j(1), Y + T * 0.15 + j(2)); c.lineTo(X + T * 0.4 + j(3), Y + j(4)); c.lineTo(X + T + j(5), Y + T * 0.1 + j(6)); c.lineTo(X + T + j(7), Y + T + j(8)); c.lineTo(X + j(9), Y + T + j(10)); c.closePath(); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.10)'; c.beginPath(); c.moveTo(X + T * 0.1, Y + T * 0.2); c.lineTo(X + T * 0.45, Y + T * 0.08); c.lineTo(X + T * 0.85, Y + T * 0.18); c.lineTo(X + T * 0.5, Y + T * 0.42); c.closePath(); c.fill();
        if (hash(i, 9) > 0.6) { c.fillStyle = 'rgba(110,160,90,0.55)'; c.beginPath(); c.arc(X + T * (0.3 + hash(i, 11) * 0.4), Y + T * 0.25, T * 0.12, 0, 7); c.fill(); }
      }
      if (lv.goal[i]) drawGoalMark(c, X + T / 2, Y + T / 2, T, tl === TB.SAND);
    }
    // soft shadow under cliffs onto floor
    G.staticDirty = false;
  }
  function drawGoalMark(c, x, y, T, sunken) {
    c.save(); c.translate(x, y);
    if (!sunken) {
      c.strokeStyle = 'rgba(120,70,50,0.55)'; c.lineWidth = T * 0.07; c.beginPath(); c.arc(0, 0, T * 0.33, 0, 7); c.stroke();
      c.strokeStyle = '#e98a6c'; c.lineWidth = T * 0.05; c.beginPath(); c.arc(0, 0, T * 0.33, 0, 7); c.stroke();
      // shell spiral
      c.strokeStyle = '#e98a6c'; c.lineWidth = T * 0.035; c.beginPath();
      for (let a = 0; a < 12; a += 0.2) { const r = T * 0.012 * a * 1.4; const px = Math.cos(a) * r, py = Math.sin(a) * r; a === 0 ? c.moveTo(px, py) : c.lineTo(px, py); }
      c.stroke();
    } else {
      // starfish
      c.fillStyle = '#ef7f62'; c.strokeStyle = '#a84a35'; c.lineWidth = T * 0.025; c.beginPath();
      for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? T * 0.13 : T * 0.34; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      c.closePath(); c.fill(); c.stroke();
      c.fillStyle = 'rgba(255,230,200,0.7)'; for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + k * Math.PI * 2 / 5; c.beginPath(); c.arc(Math.cos(a) * T * 0.17, Math.sin(a) * T * 0.17, T * 0.025, 0, 7); c.fill(); }
    }
    c.restore();
  }

  function drawWater(t) {
    const lv = G.level, T = G.T, s = G.state, w = lv.w, wl = G.wl;
    const hi = TB.isHigh(lv, s.t);
    const turnSoon = TB.movesToTurn(lv, s.t) === 1;
    // a stone still sinking: its tile stays water until it has gone under
    const pend = new Set(G.sprites.filter((sp) => sp.sinkAt !== undefined && !sp.dead).map((sp) => sp.sinkAt));
    for (let i = 0; i < s.tiles.length; i++) {
      const tl = pend.has(i) ? TB.DEEP : s.tiles[i]; if (tl !== TB.SAND && tl !== TB.DEEP) continue;
      const x = G.ox + (i % w) * T, y = G.oy + ((i / w) | 0) * T;
      const a = tl === TB.DEEP ? 1 : wl;
      if (tl === TB.DEEP) { cx.fillStyle = 'rgba(14,90,110,0.55)'; cx.fillRect(x, y, T + 0.5, T + 0.5); }
      if (a > 0.01 && tl === TB.SAND) {
        cx.fillStyle = `rgba(40,150,165,${0.6 * a})`; cx.fillRect(x, y, T + 0.5, T + 0.5);
      }
      if (a > 0.05) {
        // glints
        cx.strokeStyle = `rgba(220,255,255,${0.22 * a})`; cx.lineWidth = Math.max(1, T * 0.03);
        for (let k = 0; k < 2; k++) { const ph = hash(i, 60 + k) * 6.28, gx = x + T * (0.2 + 0.6 * hash(i, 70 + k)) + Math.sin(t * 0.9 + ph) * T * 0.05, gy = y + T * (0.25 + 0.5 * hash(i, 80 + k)); cx.beginPath(); cx.moveTo(gx - T * 0.1, gy); cx.quadraticCurveTo(gx, gy - T * 0.05 * (1 + Math.sin(t * 2 + ph)), gx + T * 0.1, gy); cx.stroke(); }
      }
      // currents
      const cu = lv.cur[i];
      if (cu && (tl === TB.DEEP || wl > 0.3 || true)) {
        const live = tl === TB.DEEP || hi;
        cx.save(); cx.translate(x + T / 2, y + T / 2); cx.rotate((cu - 1) * Math.PI / 2);
        const al = live ? 0.75 : 0.22;
        for (let k = 0; k < 2; k++) {
          const off = (((t * 0.9 + k * 0.5) % 1) - 0.5) * T * 0.8;
          const fadeA = al * (1 - Math.abs(off) / (T * 0.45));
          cx.strokeStyle = live ? `rgba(230,255,255,${fadeA})` : `rgba(120,90,50,${al})`; cx.lineWidth = T * 0.07; cx.lineCap = 'round';
          cx.beginPath(); cx.moveTo(-T * 0.2, -off + T * 0.12); cx.lineTo(0, -off - T * 0.08); cx.lineTo(T * 0.2, -off + T * 0.12); cx.stroke();
          if (!live) break;
        }
        cx.restore();
      }
    }
    // foam on water/land boundaries
    const dryNow = (i) => i < 0 || s.tiles[i] === TB.WALL ? null : !(s.tiles[i] === TB.DEEP || (s.tiles[i] === TB.SAND && wl > 0.5));
    for (let i = 0; i < s.tiles.length; i++) {
      const tl = s.tiles[i];
      const wet = tl === TB.DEEP ? 1 : tl === TB.SAND ? wl : 0; if (wet < 0.15) continue;
      const x = G.ox + (i % w) * T, y = G.oy + ((i / w) | 0) * T;
      for (let d = 0; d < 4; d++) {
        const n = TB.neighbor(lv, i, d); const dn = n < 0 ? null : (s.tiles[n] === TB.WALL ? 'wall' : dryNow(n));
        if (dn === true || dn === 'wall') {
          const wob = Math.sin(t * 2.2 + i + d) * T * 0.03;
          cx.strokeStyle = `rgba(245,255,255,${0.5 * wet})`; cx.lineWidth = T * 0.06; cx.lineCap = 'round';
          cx.beginPath();
          const e = T * 0.07 + wob;
          if (d === 0) { cx.moveTo(x + 2, y + e); cx.lineTo(x + T - 2, y + e); }
          if (d === 2) { cx.moveTo(x + 2, y + T - e); cx.lineTo(x + T - 2, y + T - e); }
          if (d === 3) { cx.moveTo(x + e, y + 2); cx.lineTo(x + e, y + T - 2); }
          if (d === 1) { cx.moveTo(x + T - e, y + 2); cx.lineTo(x + T - e, y + T - 2); }
          cx.stroke();
        }
      }
    }
    // "the tide turns on your next move": shimmer on every sand tile
    if (turnSoon && !G.won) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 5);
      for (let i = 0; i < s.tiles.length; i++) if (s.tiles[i] === TB.SAND) {
        const x = G.ox + (i % w) * T, y = G.oy + ((i / w) | 0) * T;
        cx.strokeStyle = hi ? `rgba(255,236,170,${0.35 * pulse})` : `rgba(160,240,255,${0.45 * pulse})`; cx.lineWidth = T * 0.05;
        rr(cx, x + T * 0.12, y + T * 0.12, T * 0.76, T * 0.76, T * 0.2); cx.stroke();
      }
    }
  }

  function drawCrate(sp, t) {
    const T = G.T, s = G.state, lv = G.level, hi = TB.isHigh(lv, s.t);
    const ti = Math.round(sp.y) * lv.w + Math.round(sp.x);
    const tl = s.tiles[ti] === undefined ? TB.ROCK : s.tiles[ti];
    const wetness = sp.type === TB.WOOD ? (tl === TB.DEEP ? 1 : tl === TB.SAND ? G.wl : 0) : 0;
    const bob = wetness * Math.sin(t * 2.4 + sp.id) * T * 0.035;
    const rot = wetness * Math.sin(t * 1.7 + sp.id * 2) * 0.06;
    const x = G.ox + (sp.x + 0.5) * T, y = G.oy + (sp.y + 0.5) * T + bob;
    const sink = sp.sinking || 0;
    const onGoal = lv.goal[ti] && !sp.q.length && TB.settledOn(lv, s, ti, hi);
    cx.save(); cx.translate(x, y); cx.rotate(rot);
    const sc = 1 - sink * 0.35; cx.scale(sc, sc); cx.globalAlpha = 1 - sink * 0.85;
    if (wetness > 0.2) { cx.strokeStyle = `rgba(230,255,255,${0.35 * wetness})`; cx.lineWidth = T * 0.04; cx.beginPath(); cx.ellipse(0, T * 0.05, T * (0.46 + 0.03 * Math.sin(t * 3 + sp.id)), T * 0.42, 0, 0, 7); cx.stroke(); }
    // shadow
    cx.fillStyle = 'rgba(0,0,0,0.25)'; rr(cx, -T * 0.38 + T * 0.04, -T * 0.38 + T * 0.07, T * 0.76, T * 0.76, T * 0.1); cx.fill();
    if (onGoal) { cx.shadowColor = '#ffe9a0'; cx.shadowBlur = T * 0.35; }
    if (sp.type === TB.WOOD) {
      cx.fillStyle = '#8a5428'; rr(cx, -T * 0.38, -T * 0.38, T * 0.76, T * 0.76, T * 0.09); cx.fill(); cx.shadowBlur = 0;
      cx.fillStyle = '#c0813f'; rr(cx, -T * 0.33, -T * 0.33, T * 0.66, T * 0.66, T * 0.06); cx.fill();
      cx.strokeStyle = '#8f5a2a'; cx.lineWidth = T * 0.025;
      for (let k = 1; k < 3; k++) { cx.beginPath(); cx.moveTo(-T * 0.33, -T * 0.33 + k * T * 0.22); cx.lineTo(T * 0.33, -T * 0.33 + k * T * 0.22); cx.stroke(); }
      cx.strokeStyle = '#9b6230'; cx.lineWidth = T * 0.08; cx.beginPath(); cx.moveTo(-T * 0.28, -T * 0.28); cx.lineTo(T * 0.28, T * 0.28); cx.stroke();
      cx.fillStyle = 'rgba(255,230,180,0.25)'; cx.fillRect(-T * 0.33, -T * 0.33, T * 0.66, T * 0.06);
      cx.fillStyle = '#5a3a1e'; for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { cx.beginPath(); cx.arc(a * T * 0.27, b * T * 0.27, T * 0.028, 0, 7); cx.fill(); }
      if (onGoal) { cx.fillStyle = 'rgba(255,240,170,0.25)'; rr(cx, -T * 0.33, -T * 0.33, T * 0.66, T * 0.66, T * 0.06); cx.fill(); }
    } else {
      cx.fillStyle = '#5d6168'; rr(cx, -T * 0.4, -T * 0.4, T * 0.8, T * 0.8, T * 0.14); cx.fill(); cx.shadowBlur = 0;
      cx.fillStyle = '#8e949b'; rr(cx, -T * 0.35, -T * 0.37, T * 0.7, T * 0.68, T * 0.12); cx.fill();
      cx.fillStyle = 'rgba(255,255,255,0.18)'; rr(cx, -T * 0.3, -T * 0.34, T * 0.6, T * 0.2, T * 0.08); cx.fill();
      cx.strokeStyle = '#5d6168'; cx.lineWidth = T * 0.045; cx.beginPath();
      for (let a = 0; a < 13; a += 0.25) { const r = T * 0.017 * a; const px = Math.cos(a) * r, py = Math.sin(a) * r; a === 0 ? cx.moveTo(px, py) : cx.lineTo(px, py); }
      cx.stroke();
      if (onGoal) { cx.fillStyle = 'rgba(255,240,170,0.22)'; rr(cx, -T * 0.35, -T * 0.37, T * 0.7, T * 0.68, T * 0.12); cx.fill(); }
    }
    cx.restore();
    // submerged stone: water over it at high tide
    if (sp.type === TB.STONE && tl === TB.SAND && G.wl > 0.05) { cx.fillStyle = `rgba(40,150,165,${0.5 * G.wl})`; rr(cx, x - T * 0.42, y - T * 0.42, T * 0.84, T * 0.84, T * 0.14); cx.fill(); }
  }

  function drawPlayer(t) {
    const T = G.T, pl = G.player;
    const bx = pl.bump ? Math.sin(pl.bump * Math.PI) * T * 0.12 : 0;
    const dxy = [[0, -1], [1, 0], [0, 1], [-1, 0]][pl.bumpDir];
    const walking = pl.q.length > 0;
    const hop = walking ? Math.abs(Math.sin(pl.walk)) * T * 0.05 : Math.sin(t * 2) * T * 0.01;
    const x = G.ox + (pl.x + 0.5) * T + dxy[0] * bx, y = G.oy + (pl.y + 0.5) * T + dxy[1] * bx - hop;
    cx.fillStyle = 'rgba(0,0,0,0.25)'; cx.beginPath(); cx.ellipse(x + T * 0.03, y + T * 0.2 + hop, T * 0.26, T * 0.12, 0, 0, 7); cx.fill();
    if (pl.waitPulse) { cx.strokeStyle = `rgba(255,255,255,${pl.waitPulse * 0.6})`; cx.lineWidth = T * 0.04; cx.beginPath(); cx.arc(x, y, T * (0.5 - pl.waitPulse * 0.15), 0, 7); cx.stroke(); }
    // raincoat body
    cx.fillStyle = '#d9a514'; cx.beginPath(); cx.arc(x, y, T * 0.3, 0, 7); cx.fill();
    cx.fillStyle = '#ffd23f'; cx.beginPath(); cx.arc(x - T * 0.03, y - T * 0.03, T * 0.27, 0, 7); cx.fill();
    // face toward facing direction
    const f = [[0, -1], [1, 0], [0, 1], [-1, 0]][pl.face];
    const fx = x + f[0] * T * 0.1, fy = y + f[1] * T * 0.1 + (f[1] === 0 ? T * 0.02 : 0);
    if (pl.face !== 0) {
      cx.fillStyle = '#ffd9b8'; cx.beginPath(); cx.arc(fx, fy, T * 0.15, 0, 7); cx.fill();
      cx.fillStyle = '#3a2a20';
      const ex = f[1] !== 0 ? T * 0.06 : T * 0.03, base = f[0] * T * 0.05;
      const blink = (t % 4) < 0.12 ? 0.3 : 1;
      for (const sgn of [-1, 1]) { cx.beginPath(); cx.ellipse(fx + base + (f[1] !== 0 ? sgn * ex : (sgn > 0 ? T * 0.03 : -T * 0.01) * f[0]), fy - T * 0.02 + (f[1] === 0 ? sgn * T * 0.0 : 0), T * 0.022, T * 0.03 * blink, 0, 0, 7); cx.fill(); if (f[1] === 0) break; }
      cx.fillStyle = 'rgba(240,120,110,0.5)'; cx.beginPath(); cx.arc(fx + f[0] * T * 0.04 - (f[1] ? T * 0.08 : 0), fy + T * 0.05, T * 0.025, 0, 7); cx.fill();
    } else {
      cx.strokeStyle = '#b8870c'; cx.lineWidth = T * 0.03; cx.beginPath(); cx.arc(x, y + T * 0.02, T * 0.16, Math.PI * 1.15, Math.PI * 1.85); cx.stroke();
    }
    // hood rim
    cx.strokeStyle = '#b8870c'; cx.lineWidth = T * 0.035; cx.beginPath(); cx.arc(fx, fy, T * 0.17, 0, 7); if (pl.face !== 0) cx.stroke();
  }

  // Tide dial: current tide icon + beads (moves until it turns), in the next tide's colour.
  function drawDial(t) {
    const lv = G.level, s = G.state, hi = TB.isHigh(lv, s.t), left = TB.movesToTurn(lv, s.t), P = lv.P;
    const cxm = W / 2, cy = 46, bead = 11, gap = 30;
    const total = 92 + P * gap;
    const pulse = G.dialPulse;
    cx.save();
    cx.fillStyle = 'rgba(4,30,40,0.55)'; rr(cx, cxm - total / 2 - 12, cy - 26, total + 24, 52, 26); cx.fill();
    if (pulse > 0) { cx.strokeStyle = `rgba(255,255,255,${pulse * 0.8})`; cx.lineWidth = 3; rr(cx, cxm - total / 2 - 12 - pulse * 4, cy - 26 - pulse * 4, total + 24 + pulse * 8, 52 + pulse * 8, 30); cx.stroke(); }
    // icon: wave (high) or sand+shell (low)
    const ix = cxm - total / 2 + 22;
    drawTideIcon(ix, cy, hi, t, 1);
    // beads
    for (let k = 0; k < P; k++) {
      const bxp = cxm - total / 2 + 64 + k * gap, filled = k < left;
      cx.beginPath(); cx.arc(bxp, cy, bead, 0, 7);
      if (filled) { cx.fillStyle = hi ? '#e9cf8f' : '#5fd0e0'; cx.fill(); cx.fillStyle = 'rgba(255,255,255,0.35)'; cx.beginPath(); cx.arc(bxp - 3, cy - 3, 4, 0, 7); cx.fill(); }
      else { cx.strokeStyle = 'rgba(255,255,255,0.35)'; cx.lineWidth = 2; cx.stroke(); }
    }
    // arrow toward the next tide icon
    const ax = cxm - total / 2 + 64 + P * gap + 6;
    drawTideIcon(ax, cy, !hi, t, 0.55 + (left === 1 ? 0.45 * (0.5 + 0.5 * Math.sin(t * 6)) : 0));
    cx.restore();
  }
  function drawTideIcon(x, y, high, t, alpha) {
    cx.save(); cx.globalAlpha = alpha; cx.translate(x, y);
    if (high) {
      cx.fillStyle = '#3fb6c9'; cx.beginPath(); cx.arc(0, 0, 16, 0, 7); cx.fill();
      cx.strokeStyle = '#eaffff'; cx.lineWidth = 3; cx.lineCap = 'round';
      for (const yy of [-4, 4]) { cx.beginPath(); for (let k = -10; k <= 10; k += 2) { const yv = yy + Math.sin(k * 0.45 + t * 3) * 2.5; k === -10 ? cx.moveTo(k, yv) : cx.lineTo(k, yv); } cx.stroke(); }
    } else {
      cx.fillStyle = '#e9cf8f'; cx.beginPath(); cx.arc(0, 0, 16, 0, 7); cx.fill();
      cx.fillStyle = '#ef7f62'; cx.beginPath();
      for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 3.5 : 9; cx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      cx.closePath(); cx.fill();
    }
    cx.restore();
  }

  function iconButton(x, y, r, kind, fn, hot) {
    buttons.push({ x, y, r, fn });
    cx.save(); cx.translate(x, y);
    cx.fillStyle = hot ? 'rgba(255,240,200,0.9)' : 'rgba(4,30,40,0.55)'; cx.beginPath(); cx.arc(0, 0, r, 0, 7); cx.fill();
    cx.strokeStyle = hot ? '#5a3a1e' : '#e9f6f4'; cx.fillStyle = cx.strokeStyle; cx.lineWidth = 3; cx.lineCap = 'round'; cx.lineJoin = 'round';
    const s = r * 0.45;
    if (kind === 'undo') { cx.beginPath(); cx.arc(0, 2, s, Math.PI * 1.1, Math.PI * 0.4, false); cx.stroke(); cx.beginPath(); cx.moveTo(-s * 1.15, -s * 0.6); cx.lineTo(-s * 0.95, s * 0.35); cx.lineTo(-s * 0.05, -s * 0.1); cx.closePath(); cx.fill(); }
    else if (kind === 'restart') { cx.beginPath(); cx.arc(0, 0, s, -Math.PI * 0.35, Math.PI * 1.45); cx.stroke(); cx.beginPath(); cx.moveTo(s * 0.35, -s * 1.25); cx.lineTo(s * 0.95, -s * 0.75); cx.lineTo(s * 0.25, -s * 0.4); cx.closePath(); cx.fill(); }
    else if (kind === 'wait') { // hourglass
      cx.beginPath(); cx.moveTo(-s * 0.7, -s); cx.lineTo(s * 0.7, -s); cx.lineTo(-s * 0.7, s); cx.lineTo(s * 0.7, s); cx.closePath(); cx.stroke();
    } else if (kind === 'hint') { // lighthouse
      cx.beginPath(); cx.moveTo(-s * 0.45, s); cx.lineTo(-s * 0.3, -s * 0.5); cx.lineTo(s * 0.3, -s * 0.5); cx.lineTo(s * 0.45, s); cx.closePath(); cx.stroke();
      cx.beginPath(); cx.arc(0, -s * 0.75, s * 0.25, 0, 7); cx.fill();
      cx.globalAlpha = 0.6; cx.beginPath(); cx.moveTo(0, -s * 0.75); cx.lineTo(s * 1.2, -s * 1.1); cx.lineTo(s * 1.2, -s * 0.4); cx.closePath(); cx.fill();
    } else if (kind === 'menu') { for (const yy of [-s * 0.6, 0, s * 0.6]) { cx.beginPath(); cx.moveTo(-s * 0.8, yy); cx.lineTo(s * 0.8, yy); cx.stroke(); } }
    else if (kind === 'motion') { cx.beginPath(); for (let i = -5; i <= 5; i++) { const px = i * s * 0.18, py = RM ? 0 : Math.sin(i * 0.9) * s * 0.45; i === -5 ? cx.moveTo(px, py) : cx.lineTo(px, py); } cx.stroke(); }
    else if (kind === 'sound') { cx.beginPath(); cx.moveTo(-s, -s * 0.35); cx.lineTo(-s * 0.4, -s * 0.35); cx.lineTo(s * 0.2, -s * 0.9); cx.lineTo(s * 0.2, s * 0.9); cx.lineTo(-s * 0.4, s * 0.35); cx.lineTo(-s, s * 0.35); cx.closePath(); cx.fill(); if (!A.isMuted()) { cx.beginPath(); cx.arc(s * 0.3, 0, s * 0.6, -0.8, 0.8); cx.stroke(); } else { cx.beginPath(); cx.moveTo(s * 0.5, -s * 0.4); cx.lineTo(s * 1.1, s * 0.4); cx.moveTo(s * 1.1, -s * 0.4); cx.lineTo(s * 0.5, s * 0.4); cx.stroke(); } }
    else if (kind === 'next') { cx.beginPath(); cx.moveTo(-s * 0.5, -s * 0.9); cx.lineTo(s * 0.8, 0); cx.lineTo(-s * 0.5, s * 0.9); cx.closePath(); cx.fill(); }
    cx.restore();
  }

  function drawHint(t) {
    const h = G.hint; if (!h || h.t > 3.5) return;
    const T = G.T, w = G.level.w, p = G.state.p;
    const x = G.ox + (p % w + 0.5) * T, y = G.oy + (((p / w) | 0) + 0.5) * T;
    const a = Math.min(1, h.t * 4) * Math.min(1, (3.5 - h.t) * 2);
    cx.save(); cx.globalAlpha = a;
    if (h.a === -1) { cx.translate(W - 92, H - 50); cx.strokeStyle = '#ffe9a0'; cx.lineWidth = 4; cx.beginPath(); cx.arc(0, 0, 32 + Math.sin(t * 6) * 4, 0, 7); cx.stroke(); }
    else if (h.a === 4) { cx.strokeStyle = '#ffe9a0'; cx.lineWidth = 4; cx.beginPath(); cx.arc(x, y, T * (0.45 + 0.08 * Math.sin(t * 6)), 0, 7); cx.stroke(); }
    else {
      const d = [[0, -1], [1, 0], [0, 1], [-1, 0]][h.a], bob = (Math.sin(t * 6) * 0.5 + 0.5) * T * 0.12;
      cx.translate(x + d[0] * (T * 0.62 + bob), y + d[1] * (T * 0.62 + bob)); cx.rotate(h.a * Math.PI / 2);
      cx.fillStyle = '#ffe9a0'; cx.strokeStyle = '#7a4b16'; cx.lineWidth = 3;
      cx.beginPath(); cx.moveTo(0, -T * 0.28); cx.lineTo(T * 0.24, 0); cx.lineTo(T * 0.09, 0); cx.lineTo(T * 0.09, T * 0.22); cx.lineTo(-T * 0.09, T * 0.22); cx.lineTo(-T * 0.09, 0); cx.lineTo(-T * 0.24, 0); cx.closePath(); cx.fill(); cx.stroke();
    }
    cx.restore();
  }

  function text(str, x, y, size, color, align, weight) {
    cx.font = `${weight || 600} ${size}px ui-rounded, "Trebuchet MS", "Segoe UI", system-ui, sans-serif`;
    cx.textAlign = align || 'center'; cx.textBaseline = 'middle'; cx.fillStyle = color || '#fff'; cx.fillText(str, x, y);
  }

  function drawPlay(t) {
    drawOcean(cx, t);
    if (G.staticDirty) buildStatic();
    // sinking stones only become rock after they finish sinking: draw the pending deep tile as water until then
    cx.drawImage(G.static, G.ox - G.T, G.oy - G.T, (G.level.w + 2) * G.T, (G.level.h + 2) * G.T);
    drawWater(t);
    // goals glow when filled
    for (const i in G.goalsLit) { const [x, y] = tileCenter(+i); const g = cx.createRadialGradient(x, y, 0, x, y, G.T * 0.7); g.addColorStop(0, 'rgba(255,236,160,0.35)'); g.addColorStop(1, 'rgba(255,236,160,0)'); cx.fillStyle = g; cx.fillRect(x - G.T, y - G.T, G.T * 2, G.T * 2); }
    const ents = G.sprites.slice().sort((a, b) => a.y - b.y);
    let drewP = false;
    for (const sp of ents) { if (!drewP && G.player.y < sp.y) { drawPlayer(t); drewP = true; } drawCrate(sp, t); }
    if (!drewP) drawPlayer(t);
    drawParticles();
    drawHint(t);
    // HUD: level name (left), moves/par (right), dial (center)
    text(`${G.def.id}`, 24, 34, 15, WORLD_HUE[G.def.world], 'left', 700);
    text(G.def.name, 24, 56, 20, '#f4fbfa', 'left', 700);
    const mv = G.state.t;
    text(`${mv}`, W - 24, 34, 22, '#f4fbfa', 'right', 700);
    if (G.par > 0) { cx.font = '600 15px ui-rounded, "Trebuchet MS", sans-serif'; drawPearl(W - 34 - cx.measureText(String(G.par)).width, 60, 7, mv <= G.par ? 1 : 0.3); text(`${G.par}`, W - 24, 60, 15, mv <= G.par ? '#cfeeee' : '#7fa6a8', 'right', 600); }
    drawDial(t);
    // buttons
    buttons.length = 0;
    const by = H - 46, gap = 70;
    iconButton(W / 2 - gap * 1.5, by, 26, 'undo', () => { A.start(); undo(); });
    iconButton(W / 2 - gap * 0.5, by, 26, 'wait', () => { A.start(); G.queue.push(4); });
    iconButton(W / 2 + gap * 0.5, by, 26, 'restart', () => { A.start(); restart(); });
    iconButton(W / 2 + gap * 1.5, by, 26, 'hint', () => { A.start(); hint(); });
    iconButton(36, by, 22, 'menu', () => { app.screen = 'select'; A.sfx('ui'); });
    iconButton(W - 36, by, 22, 'sound', () => { A.start(); A.toggleMute(); });
    if (G.won) drawWin(t);
    if (G.intro > 0) {
      const a = Math.min(1, G.intro / 0.6, (2.6 - G.intro) / 0.3 + 0.2);
      cx.save(); cx.globalAlpha = a;
      cx.fillStyle = 'rgba(4,28,38,0.55)'; cx.fillRect(0, 0, W, H);
      worldBadge(W / 2, H / 2 - 30, 64, G.def.world, t);
      text(WORLD_NAMES[G.def.world], W / 2, H / 2 + 70, 30, WORLD_HUE[G.def.world], 'center', 800);
      cx.restore();
    }
  }
  function drawPearl(x, y, r, a) {
    cx.save(); cx.globalAlpha = a;
    const g = cx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#f1ece6'); g.addColorStop(1, '#bdb2c8');
    cx.fillStyle = g; cx.beginPath(); cx.arc(x, y, r, 0, 7); cx.fill(); cx.restore();
  }
  function drawWin(t) {
    const a = Math.min(1, G.wonT * 2);
    cx.fillStyle = `rgba(3,25,35,${0.45 * a})`; cx.fillRect(0, 0, W, H);
    const y = H / 2 - 20;
    const pearl = G.state.t <= G.par;
    cx.save(); cx.globalAlpha = a;
    // shell
    const sc = 1 + Math.max(0, 0.6 - G.wonT) * 0.5;
    cx.translate(W / 2, y); cx.scale(sc, sc);
    cx.fillStyle = '#f6d9c2'; cx.strokeStyle = '#c98c6a'; cx.lineWidth = 3; cx.beginPath();
    cx.moveTo(0, 40); for (let k = 0; k <= 8; k++) { const ang = Math.PI * (1.1 + k * 0.1), r = 70; cx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r * 0.9 + 10); } cx.closePath(); cx.fill(); cx.stroke();
    for (let k = 1; k < 8; k++) { const ang = Math.PI * (1.1 + k * 0.1); cx.beginPath(); cx.moveTo(0, 40); cx.lineTo(Math.cos(ang) * 66, Math.sin(ang) * 60 + 10); cx.stroke(); }
    if (pearl) { drawPearl(0, -8, 16 + Math.sin(t * 3) * 1, 1); }
    cx.restore();
    cx.save(); cx.globalAlpha = a;
    text(`${G.state.t}`, W / 2, y + 74, 26, '#fff', 'center', 700);
    if (G.par > 0) text(pearl ? `par ${G.par}` : `par ${G.par}`, W / 2, y + 102, 15, pearl ? '#ffeec2' : '#9fc4c6', 'center', 600);
    cx.restore();
    if (G.wonT > 0.6) {
      iconButton(W / 2 + 70, y + 160, 30, 'next', () => next(), true);
      iconButton(W / 2 - 70, y + 160, 26, 'restart', () => restart());
    }
  }
  function drawParticles() {
    for (const p of particles) {
      const k = p.t / p.life;
      if (p.ring) { cx.strokeStyle = p.c + (0.6 * (1 - k)) + ')'; cx.lineWidth = 2; cx.beginPath(); cx.arc(p.x, p.y, p.r + k * G.T * 0.5, 0, 7); cx.stroke(); continue; }
      cx.globalAlpha = 1 - k; cx.fillStyle = p.c;
      if (p.star) { cx.save(); cx.translate(p.x, p.y); cx.rotate(p.t * 3); cx.fillRect(-p.r * 2, -p.r * 0.4, p.r * 4, p.r * 0.8); cx.fillRect(-p.r * 0.4, -p.r * 2, p.r * 0.8, p.r * 4); cx.restore(); }
      else { cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, 7); cx.fill(); }
      cx.globalAlpha = 1;
    }
  }

  // ---------- title & select ----------
  function drawTitle(t) {
    drawOcean(cx, t);
    buttons.length = 0;
    // floating crate
    const T = Math.min(W, H) * 0.09, x = W / 2 + Math.sin(t * 0.4) * W * 0.18, y = H * 0.66 + Math.sin(t * 1.3) * 6;
    cx.save(); cx.translate(x, y); cx.rotate(Math.sin(t * 0.9) * 0.08);
    cx.strokeStyle = 'rgba(230,255,255,0.3)'; cx.lineWidth = 2; cx.beginPath(); cx.ellipse(0, 6, T * 0.7, T * 0.5, 0, 0, 7); cx.stroke();
    cx.fillStyle = '#8a5428'; rr(cx, -T * 0.38, -T * 0.38, T * 0.76, T * 0.76, T * 0.09); cx.fill();
    cx.fillStyle = '#c0813f'; rr(cx, -T * 0.33, -T * 0.33, T * 0.66, T * 0.66, T * 0.06); cx.fill();
    cx.strokeStyle = '#9b6230'; cx.lineWidth = T * 0.08; cx.beginPath(); cx.moveTo(-T * 0.28, -T * 0.28); cx.lineTo(T * 0.28, T * 0.28); cx.stroke();
    cx.restore();
    // wave band
    cx.fillStyle = 'rgba(160,235,240,0.12)';
    for (let b = 0; b < 3; b++) { cx.beginPath(); cx.moveTo(0, H); for (let xx = 0; xx <= W; xx += 10) cx.lineTo(xx, H * (0.78 + b * 0.06) + Math.sin(xx * 0.012 + t * (0.8 + b * 0.2) + b) * 10); cx.lineTo(W, H); cx.closePath(); cx.fill(); }
    text('TIDEBOUND', W / 2, H * 0.32, Math.min(96, W * 0.11), '#f6efe0', 'center', 800);
    text('a puzzle of tides', W / 2, H * 0.32 + Math.min(70, W * 0.08), 20, '#9fd8d8', 'center', 500);
    const a = 0.5 + 0.5 * Math.sin(t * 2.5);
    cx.globalAlpha = 0.4 + 0.6 * a; iconButton(W / 2, H * 0.5, 30, 'next', () => { app.screen = 'select'; A.sfx('ui'); }, true); cx.globalAlpha = 1;
    text(`v${VERSION}`, W - 16, H - 14, 11, 'rgba(255,255,255,0.35)', 'right', 500);
  }
  // little picture per world so non-readers can tell them apart
  function worldBadge(x, y, r, w, t) {
    cx.save(); cx.translate(x, y);
    cx.fillStyle = 'rgba(5,30,40,0.45)'; cx.beginPath(); cx.arc(0, 0, r, 0, 7); cx.fill();
    cx.strokeStyle = WORLD_HUE[w]; cx.fillStyle = WORLD_HUE[w]; cx.lineWidth = r * 0.12; cx.lineCap = 'round'; cx.lineJoin = 'round';
    if (w === 0) { // little crab-free tide pool: a pink shell
      cx.beginPath(); cx.moveTo(0, r * 0.45); for (let k = 0; k <= 8; k++) { const a = Math.PI * (1.1 + k * 0.1), rr2 = r * 0.55; cx.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2 + r * 0.15); } cx.closePath(); cx.fill();
      cx.strokeStyle = 'rgba(120,50,70,0.5)'; for (let k = 1; k < 8; k += 2) { const a = Math.PI * (1.1 + k * 0.1); cx.beginPath(); cx.moveTo(0, r * 0.45); cx.lineTo(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5 + r * 0.15); cx.stroke(); }
    } else if (w === 1) { // starfish on sand
      cx.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr2 = k % 2 ? r * 0.26 : r * 0.6; cx.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2); } cx.closePath(); cx.fill();
    } else if (w === 2) { // waves
      for (let k = -1; k <= 1; k++) { cx.beginPath(); for (let i = -6; i <= 6; i++) { const px = i * r * 0.1, py = k * r * 0.32 + Math.sin(i * 0.9 + t * 2 + k) * r * 0.08; i === -6 ? cx.moveTo(px, py) : cx.lineTo(px, py); } cx.stroke(); }
    } else if (w === 3) { // stone block
      rr(cx, -r * 0.45, -r * 0.45, r * 0.9, r * 0.9, r * 0.18); cx.fill();
      cx.strokeStyle = 'rgba(40,40,60,0.6)'; cx.beginPath(); cx.arc(0, 0, r * 0.2, 0, 5); cx.stroke();
    } else if (w === 5) { // riddle: a spiral whirl
      cx.beginPath(); for (let i = 0; i <= 40; i++) { const a = i * 0.42 + t * 0.8, rr2 = r * 0.06 + i * r * 0.013; i ? cx.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2) : cx.moveTo(Math.cos(a) * rr2, Math.sin(a) * rr2); } cx.stroke();
    } else { // current chevrons
      for (let k = 0; k < 2; k++) { const o = ((t * 0.6 + k * 0.5) % 1) * r * 0.5 - r * 0.35; cx.beginPath(); cx.moveTo(o - r * 0.15, -r * 0.35); cx.lineTo(o + r * 0.15, 0); cx.lineTo(o - r * 0.15, r * 0.35); cx.stroke(); }
    }
    cx.restore();
  }
  function drawSelect(t) {
    drawOcean(cx, t, true);
    buttons.length = 0;
    const rows = levelRows();
    const top = 90, rowH = Math.min(120, (H - top - 40) / rows.length);
    text('TIDEBOUND', 28, 40, 26, '#f6efe0', 'left', 800);
    const pearls = LEVELS.filter((l) => save.done[l.id] && save.done[l.id].pearl).length;
    iconButton(36, H - 30, 20, 'motion', toggleRM, RM);
    drawPearl(W - 110, 40, 9, 1); text(`${pearls} / ${LEVELS.length}`, W - 24, 40, 18, '#f4fbfa', 'right', 700);
    const maxN = Math.max(...rows.map((r) => r.length));
    const gap = Math.min(84, (W - 140) / maxN), sz = Math.min(29, gap * 0.38);
    const x0 = Math.max(110, (W - gap * maxN) / 2 + 30);
    rows.forEach((row, r) => {
      const y = top + r * rowH + rowH / 2, wnum = LEVELS[row[0]].world;
      worldBadge(x0 - gap * 0.55 - 26, y + 6, 24, wnum, t);
      text(WORLD_NAMES[wnum], x0 - 4, y - Math.max(rowH * 0.34, sz + 12), 14, WORLD_HUE[wnum], 'left', 700);
      row.forEach((k, c) => {
        const x = x0 + gap * (c + 0.5), L = LEVELS[k], d = save.done[L.id], open = unlocked(k), sel = app.sel === k;
        cx.save(); cx.translate(x, y + 6 + Math.sin(t * 1.2 + k) * 1.5);
        if (sel) { cx.strokeStyle = '#ffe9a0'; cx.lineWidth = 3; cx.beginPath(); cx.arc(0, 0, sz + 7, 0, 7); cx.stroke(); }
        cx.fillStyle = !open ? 'rgba(10,40,50,0.6)' : d ? WORLD_HUE[wnum] : 'rgba(240,250,250,0.85)';
        cx.beginPath(); cx.arc(0, 0, sz, 0, 7); cx.fill();
        cx.restore();
        if (open) text(String(c + 1), x, y + 6, sz * 0.8, d ? '#3a2a1a' : '#174450', 'center', 800);
        else { cx.fillStyle = 'rgba(255,255,255,0.25)'; cx.beginPath(); cx.arc(x, y + 6, 4, 0, 7); cx.fill(); }
        if (d && d.pearl) drawPearl(x + sz * 0.75, y + 6 - sz * 0.75, 6, 1);
        buttons.push({ x, y: y + 6, r: sz, fn: () => { app.sel = k; if (open) startLevel(k); else A.sfx('bump'); } });
      });
    });
    const L = LEVELS[app.sel];
    const dd = save.done[L.id];
    text(`${L.id}  ${L.name}` + (dd ? `   ·   best ${dd.best}  (par ${parOf(L)})` : ''), W / 2, H - 22, 15, '#cfeeee', 'center', 600);
  }

  // ---------- main loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    update(dt);
    cx.setTransform(DPR, 0, 0, DPR, 0, 0);
    // reduced motion freezes ambient motion (ocean drift, bobbing, pulses); gameplay moves still animate
    const tt = RM ? 0 : app.t;
    if (app.screen === 'title') drawTitle(tt);
    else if (app.screen === 'select') drawSelect(tt);
    else if (G) drawPlay(tt);
    requestAnimationFrame(frame);
  }
  window.addEventListener('resize', resize);
  resize();
  if (app.screen === 'play') {
    const k = Math.max(0, LEVELS.findIndex((l) => l.id === Q.get('level')));
    startLevel(k);
    const mv = Q.get('moves');
    if (mv) for (const ch of mv) { const a = 'URDLW'.indexOf(ch); if (a >= 0) { act(a); finishAnims(); } }
  }
  function toggleRM() { RM = !RM; save.rm = RM; persist(); A.sfx('ui'); }
  function finishAnims() { if (!G) return; G.player.q.length = 0; rebuildSprites(false); particles.length = 0; G.wl = TB.isHigh(G.level, G.state.t) ? 1 : 0; }
  window.__TB = { get G() { return G; }, app, act, undo, restart, hint, startLevel, finishAnims, LEVELS };
  requestAnimationFrame(frame);
})();
