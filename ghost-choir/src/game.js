// GHOST CHOIR client: canvas rendering, drag/drop editing, sequencer playback, progress.
(function () {
  const GC = window.GC, A = window.GCA, LEVELS = window.GC_LEVELS || [];
  const Q = new URLSearchParams(location.search);
  const W = 1200, H = 800;
  const cv = document.getElementById('c'), cx = cv.getContext('2d');
  let scale = 1, offX = 0, offY = 0, dpr = Math.min(2, window.devicePixelRatio || 1);
  function resize() { const iw = innerWidth, ih = innerHeight; scale = Math.min(iw / W, ih / H); offX = (iw - W * scale) / 2; offY = (ih - H * scale) / 2; cv.width = iw * dpr; cv.height = ih * dpr; cv.style.width = iw + 'px'; cv.style.height = ih + 'px'; }
  addEventListener('resize', resize); resize();
  // ---------- colours ----------
  const PC_COL = ['#ff5a5f', '#ff5a5f', '#ff9a3c', '#ff9a3c', '#ffd23f', '#5fd068', '#5fd068', '#3cc6c0', '#3cc6c0', '#5b8cff', '#5b8cff', '#b06cff']; // Boomwhacker-ish
  const NAME = ['do', 'do', 're', 're', 'mi', 'fa', 'fa', 'sol', 'sol', 'la', 'la', 'ti'];
  const noteCol = (n) => (n >= 72 && n % 12 === 0 ? '#ff7aa8' : PC_COL[n % 12]);
  const LIGHT = { g: '#ffcf6b', b: '#8fd3ff' };
  // ---------- state ----------
  const store = (() => { try { return JSON.parse(localStorage.getItem('gc-progress') || '{}'); } catch (e) { return {}; } })();
  const save = () => { try { localStorage.setItem('gc-progress', JSON.stringify(store)); } catch (e) {} };
  let scene = 'title', lv = null, board = new Map(), inv = null, sim = null, target = null, placedKeys = new Set();
  let playing = false, playT0 = 0, organT0 = -1, solved = false, solveAt = -1, card = null, hint = null, drag = null, hover = null;
  let hintsUsed = 0, sparks = [], finaleT = -1, finaleBeat = -1;
  let sandbox = false, motes = [], tnow = 0, frozenBeat = Q.has('beat') ? +Q.get('beat') : null, msg = null, lastBeat = -1, chords = null;
  for (let i = 0; i < 60; i++) motes.push({ x: Math.random() * W, y: Math.random() * H, s: 0.5 + Math.random() * 1.5, v: 4 + Math.random() * 10, p: Math.random() * 6 });
  // ---------- audio ----------
  let actx = null, eng = null; const muted = Q.get('mute') === '1';
  function audio() { if (muted) return null; if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); eng = A.makeEngine(actx); } catch (e) { return null; } } if (actx.state === 'suspended') actx.resume(); return eng; }
  const now = () => (actx && !muted ? actx.currentTime : performance.now() / 1000);
  // ---------- level setup ----------
  const SANDBOX = { id: 'sandbox', name: 'Midnight Practice', w: 10, h: 7, L: 16, bpm: 96, tune: [], fixed: [{ x: 0, y: 3, t: 'candle', d: 1, c: 'g', turn: true, free: true }],
    inv: { ghosts: { 48: 99, 55: 99, 60: 99, 62: 99, 64: 99, 67: 99, 69: 99, 72: 99, 74: 99, 76: 99 }, mirror: 99, prism: 99, candleG: 99, candleB: 99 } };
  function startLevel(l, opts = {}) {
    lv = l; sandbox = l.id === 'sandbox'; board = new Map(); placedKeys = new Set(); solved = false; card = null; hint = null; solveAt = -1; hintsUsed = 0; sparks = []; finaleT = -1; finaleBeat = -1;
    for (const p of l.fixed) { const q = Object.assign({}, p); delete q.x; delete q.y; board.set(GC.key(p.x, p.y), q); }
    inv = JSON.parse(JSON.stringify(l.inv || {})); inv.ghosts = inv.ghosts || {}; inv.mirror = inv.mirror || 0; inv.prism = inv.prism || 0;
    target = sandbox ? null : GC.tuneEvents(l.tune, l.L);
    if (sandbox) { try { const s = JSON.parse(localStorage.getItem('gc-sandbox') || 'null'); if (s) for (const p of s) { board.set(GC.key(p.x, p.y), Object.assign({}, p.q)); if (!p.fixed) placedKeys.add(GC.key(p.x, p.y)); } else seedSandbox(); } catch (e) {} }
    const bl = A.barLen(l);
    chords = target ? A.voice(A.chooseChords(target, l.L, bl)).map((v, i) => ({ notes: v, beat: i * bl, len: bl })) : null;
    if (opts.solve && l.sol) for (const p of l.sol) applySol(p);
    resim(); scene = 'play'; playing = false; organT0 = -1;
    if (!opts.quiet && !sandbox) setTimeout(() => listen(), 450);
  }
  function seedSandbox() { // a little starter tune so the sandbox never opens silent
    const put = (x, y, q) => { board.set(GC.key(x, y), q); placedKeys.add(GC.key(x, y)); };
    [60, 64, 67, 69, 0, 67, 64, 62].forEach((n, i) => { if (n) put(1 + i, 3, { t: 'ghost', n }); });
    put(9, 3, { t: 'mirror', m: 0 }); put(9, 1, { t: 'ghost', n: 72 }); put(9, 0, { t: 'mirror', m: 1 }); put(7, 0, { t: 'ghost', n: 67 }); put(5, 0, { t: 'ghost', n: 64 });
  }
  function applySol(p) { if (p.turn) { board.set(GC.key(p.x, p.y), Object.assign({}, p.turn)); return; } const q = Object.assign({}, p); delete q.x; delete q.y; take(q); board.set(GC.key(p.x, p.y), q); placedKeys.add(GC.key(p.x, p.y)); }
  function invKey(q) { return q.t === 'ghost' ? 'g' + q.n : q.t === 'candle' ? 'candle' + (q.c === 'b' ? 'B' : 'G') : q.t; }
  function count(q) { return q.t === 'ghost' ? inv.ghosts[q.n] || 0 : q.t === 'candle' ? inv['candle' + (q.c === 'b' ? 'B' : 'G')] || 0 : inv[q.t] || 0; }
  function take(q) { if (q.t === 'ghost') inv.ghosts[q.n]--; else if (q.t === 'candle') inv['candle' + (q.c === 'b' ? 'B' : 'G')]--; else inv[q.t]--; }
  function give(q) { if (q.t === 'ghost') inv.ghosts[q.n]++; else if (q.t === 'candle') inv['candle' + (q.c === 'b' ? 'B' : 'G')]++; else inv[q.t]++; }
  function resim() {
    sim = GC.simulate(board, lv.w, lv.h, lv.L);
    if (sandbox) { try { localStorage.setItem('gc-sandbox', JSON.stringify([...board].map(([k, q]) => { const [x, y] = k.split(',').map(Number); return { x, y, q, fixed: !placedKeys.has(k) }; }))); } catch (e) {} return; }
    const ok = GC.sameEvents(sim.events, target);
    if (ok && !solved && solveAt < 0) { solveAt = 1; if (!playing) light(true); }
    if (!ok) solveAt = -1;
  }
  const piecesUsed = () => placedKeys.size;
  // ---------- layout ----------
  function gridGeom() {
    const top = sandbox ? 60 : 190, bottom = 650, left = 150, right = 1050;
    const ts = Math.floor(Math.min((right - left) / lv.w, (bottom - top) / lv.h, 92));
    const gw = ts * lv.w, gh = ts * lv.h; return { ts, x0: Math.round((left + right - gw) / 2), y0: Math.round((top + bottom - gh) / 2), gw, gh };
  }
  function cellAt(px, py) { const g = gridGeom(); const x = Math.floor((px - g.x0) / g.ts), y = Math.floor((py - g.y0) / g.ts); return x >= 0 && y >= 0 && x < lv.w && y < lv.h ? { x, y } : null; }
  function trayItems() {
    const items = [];
    const gs = Object.keys(inv.ghosts).map(Number).sort((a, b) => a - b);
    for (const n of gs) items.push({ q: { t: 'ghost', n } });
    if (inv.mirror || (lv.inv && lv.inv.mirror)) items.push({ q: { t: 'mirror', m: 0 } });
    if (inv.prism || (lv.inv && lv.inv.prism)) items.push({ q: { t: 'prism' } });
    if (sandbox) { items.push({ q: { t: 'candle', d: 1, c: 'g' } }); items.push({ q: { t: 'candle', d: 1, c: 'b' } }); items.push({ q: { t: 'wick', d: 1, c: 'b' } }); }
    const sz = Math.min(84, 860 / Math.max(1, items.length)); const x0 = 600 - (items.length * sz) / 2;
    items.forEach((it, i) => { it.x = x0 + i * sz + sz / 2; it.y = 722; it.r = sz * 0.42; });
    return items;
  }
  const BTN = () => scene === 'play' ? [
    { id: 'back', x: 62, y: 60, r: 30, icon: 'back', label: '' },
    ...(sandbox ? [] : [{ id: 'listen', x: 62, y: 210, r: 34, icon: 'organ', label: 'Listen' }]),
    { id: 'sing', x: 62, y: sandbox ? 210 : 310, r: 38, icon: playing ? 'stop' : 'candle', label: playing ? 'Hush' : 'Sing' },
    ...(sandbox ? [{ id: 'clear', x: 62, y: 330, r: 30, icon: 'reset', label: 'Clear' }] : [{ id: 'hint', x: 62, y: 410, r: 30, icon: 'hint', label: 'Hint' }, { id: 'reset', x: 62, y: 500, r: 30, icon: 'reset', label: 'Reset' }]),
  ] : [];
  // ---------- playback ----------
  const beatDur = () => 60 / (lv ? lv.bpm : 90);
  function light(on) { if (on) { const e = audio(); playing = true; playT0 = now() + 0.08; lastBeat = -1; organT0 = -1; if (e) e.tick(now(), 1.4); } else { playing = false; } }
  function listen() { const e = audio(); playing = false; organT0 = now() + 0.1; if (!e) return; const bd = beatDur();
    target.forEach((evs, t) => evs.forEach((s) => { const n = +s.split(':')[0]; e.organ(n, organT0 + t * bd, bd * 0.92, 0.55); }));
    padChords(organT0, 0.6);
  }
  function padChords(t0, vel) { const e = eng; if (!e || !chords) return; const bd = beatDur(); for (const c of chords) e.pad(c.notes, t0 + c.beat * bd, c.len * bd, vel); }
  function schedule() {
    if (!playing || !lv) return;
    const bd = beatDur(), tnowA = now(); const ahead = tnowA + 0.12;
    while (true) {
      const b = lastBeat + 1, bt = playT0 + b * bd; if (bt > ahead) break; lastBeat = b;
      const t = b % lv.L;
      if (t === 0 && b > 0 && solveAt === 1 && !solved && !sandbox) { win(); }
      if (t === 0 && eng) { if (chords) padChords(bt, 0.45); else if (sandbox) sandboxPad(bt, Math.floor(b / lv.L)); }
      const evs = sim.sung[t] || []; const seen = new Set();
      for (const s of evs) { const k = s.n + s.c; if (seen.has(k)) continue; seen.add(k); const pan = (s.x / Math.max(1, lv.w - 1) - 0.5) * 0.7;
        if (sparks.length < 160) { const g = gridGeom(); sparks.push({ x: g.x0 + (s.x + 0.5) * g.ts, y: g.y0 + (s.y + 0.3) * g.ts, vx: (Math.random() - 0.5) * 30, vy: -40 - Math.random() * 20, t0: bt, life: 1.4, col: s.c === 'b' ? '#bfe6ff' : '#ffe7a0', glyph: s.c === 'b' ? '\u2727' : '\u266a' }); }
        if (!eng) continue;
        if (s.c === 'b') eng.bell(s.n + (s.n < 60 ? 12 : 0) + 12 * 0, bt, 0.55, pan); else eng.choir(s.n, bt, bd * 1.25, 0.55, pan, s.n < 55 ? 'oo' : 'oh'); }
    }
  }
  const SB_CHORDS = [[36, 52, 55, 62], [45, 52, 55, 60], [43, 50, 55, 60], [36, 52, 55, 64]];
  function sandboxPad(t0, loop) { const bd = beatDur(); for (let i = 0; i < 4; i++) eng.pad(SB_CHORDS[i], t0 + i * 4 * bd, 4 * bd, 0.35); }
  function win() {
    solved = true; const e = eng, used = piecesUsed(), par = lv.par;
    const two = hintsUsed === 0;
    const rec = store[lv.id] || {}; rec.solved = true; if (two) rec.par = true; rec.best = Math.min(rec.best || 99, used); store[lv.id] = rec; save();
    card = { t: performance.now(), stars: two ? 2 : 1, used, par };
    { const g = gridGeom(); for (const k of placedKeys) { const [x, y] = k.split(',').map(Number); for (let i = 0; i < 6; i++) sparks.push({ x: g.x0 + (x + 0.5) * g.ts, y: g.y0 + (y + 0.5) * g.ts, vx: (Math.random() - 0.5) * 120, vy: -60 - Math.random() * 120, t0: now() + i * 0.05, life: 1.8, col: '#ffe7a0', glyph: i % 2 ? '\u266a' : '\u2726' }); } }
    if (lv.finale) { finale(); return; }
    if (e) { const t = now() + 0.05; [60, 64, 67, 72].forEach((n, i) => e.choir(n, t + i * 0.06, 2.6, 0.45, (i - 1.5) * 0.3, 'ah')); [84, 88, 91, 96].forEach((n, i) => e.bell(n, t + 0.3 + i * 0.16, 0.25, (i - 1.5) * 0.4)); }
  }
  // ---------- the finale: the whole Midnight Choir sings an Amen ----------
  const FIN_CHORDS = [[48, 55, 64, 72], [53, 57, 65, 72], [55, 59, 62, 71], [53, 60, 65, 69], [48, 60, 64, 67]]; // I IV V IV I (plagal Amen), smooth voice-leading
  const FIN_STEP = 1.45;
  function finale() {
    finaleT = tnow; finaleBeat = -1; card.delay = 6.4; card.finale = true; playing = false;
    const e = eng; if (e) { const t0 = now() + 0.15;
      e.organ(36, t0, FIN_STEP * 4 + 3.2, 0.5); e.organ(48, t0, FIN_STEP * 4 + 3.2, 0.3);
      FIN_CHORDS.forEach((c, i) => { const last = i === FIN_CHORDS.length - 1, t = t0 + i * FIN_STEP;
        c.forEach((n, v) => e.choir(n, t, last ? 3.6 : FIN_STEP * 1.08, 0.42, (v - 1.5) * 0.35, v < 2 ? 'oh' : 'ah'));
        e.pad(c, t, last ? 3.6 : FIN_STEP, 0.3); });
      [84, 83, 81, 79, 77, 76, 74, 72].forEach((n, i) => e.bell(n, t0 + 0.2 + i * 0.18, 0.22, (i / 7 - 0.5) * 0.8)); // a peal down the scale
      [72, 76, 79, 84].forEach((n, i) => e.bell(n, t0 + FIN_STEP * 4 + 0.15 + i * 0.22, 0.26, (i / 3 - 0.5) * 0.8)); // and up again on the last Amen
    }
    setTimeout(() => { if (scene === 'play' && lv && lv.finale && solved) light(true); }, (FIN_STEP * 4 + 4.2) * 1000);
  }
  function rose(x, y, sc, a, spin) {
    cx.save(); cx.translate(x, y); cx.scale(sc, sc); cx.rotate(spin); const cols = ['#ff5a5f', '#ff9a3c', '#ffd23f', '#5fd068', '#3cc6c0', '#5b8cff', '#b06cff', '#ff7aa8'];
    for (let i = 0; i < 16; i++) { cx.rotate(Math.PI / 8); cx.globalAlpha = a * (0.45 + 0.2 * Math.sin(tnow * 2 + i)); cx.fillStyle = cols[i % 8]; cx.beginPath(); cx.ellipse(0, -95, 22, 48, 0, 0, 7); cx.fill(); }
    cx.globalAlpha = a * 0.9; cx.fillStyle = '#fff1c8'; cx.beginPath(); cx.arc(0, 0, 40, 0, 7); cx.fill(); cx.globalAlpha = 1; cx.restore();
  }
  const FIN_GHOSTS = [48, 52, 55, 57, 60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 60, 64, 67, 72, 55, 69, 62, 65, 57, 52];
  function drawFinale() {
    const f = tnow - finaleT; if (finaleT < 0 || f > 30) return;
    const ci = Math.min(FIN_CHORDS.length - 1, Math.floor(f / FIN_STEP)), cf = f - ci * FIN_STEP;
    const k = Math.min(1, f / 1.5);
    glow(600, 170, 760, 'rgba(255,214,140,1)', 0.32 * k);
    // light rays from the window
    cx.save(); cx.globalAlpha = 0.10 * k; cx.fillStyle = '#ffe2a0';
    for (let i = 0; i < 9; i++) { const ang = Math.PI / 2 + (i - 4) * 0.16 + Math.sin(tnow * 0.4 + i) * 0.02; cx.beginPath(); cx.moveTo(600, 150); cx.lineTo(600 + Math.cos(ang - 0.04) * 900, 150 + Math.sin(ang - 0.04) * 900); cx.lineTo(600 + Math.cos(ang + 0.04) * 900, 150 + Math.sin(ang + 0.04) * 900); cx.fill(); }
    cx.restore();
    rose(600, 150, 0.5 + 0.5 * k, k, tnow * 0.15);
    // every ghost in the chapel rises into a ring of singers
    FIN_GHOSTS.forEach((n, i) => {
      const d = i * 0.07, e0 = Math.max(0, Math.min(1, (f - d) / 1.8)), e = e0 * e0 * (3 - 2 * e0); if (e0 <= 0) return;
      const ang = Math.PI * (1.08 + 0.84 * (i / (FIN_GHOSTS.length - 1))), tx = 600 + Math.cos(ang) * 500, ty = 470 + Math.sin(ang) * 360;
      const sx = tx * 0.6 + 240, sy = 900, x = sx + (tx - sx) * e, y = sy + (ty - sy) * e + Math.sin(tnow * 2 + i) * 6;
      const singing = f > 0.15 && cf < 0.8 ? 1 - cf / 0.8 : 0;
      glow(x, y, 50, hexA(noteCol(n), 1), 0.25 * e); ghost(x, y, 24 + (76 - n) * 0.35, n, { sing: singing * ((i + ci) % 3 === 0 ? 1 : 0.5), alpha: e });
    });
    if (ci !== finaleBeat) { finaleBeat = ci; const tn = now(); for (let i = 0; i < 26; i++) sparks.push({ x: 600 + (Math.random() - 0.5) * 900, y: 260 + Math.random() * 380, vx: (Math.random() - 0.5) * 60, vy: -50 - Math.random() * 80, t0: tn + Math.random() * 0.4, life: 2.2, col: ['#ffe7a0', '#bfe6ff', '#ffc0d8'][i % 3], glyph: i % 2 ? '\u266a' : '\u2726' }); }
  }
  // ---------- input ----------
  function toLocal(ev) { return { x: (ev.clientX - offX) / scale, y: (ev.clientY - offY) / scale }; }
  cv.addEventListener('pointerdown', (ev) => { cv.setPointerCapture(ev.pointerId); const p = toLocal(ev); audio(); down(p); });
  cv.addEventListener('pointermove', (ev) => { const p = toLocal(ev); hover = p; if (drag) { drag.x = p.x; drag.y = p.y; if (Math.hypot(p.x - drag.sx, p.y - drag.sy) > 8) drag.moved = true; } });
  cv.addEventListener('pointerup', (ev) => { const p = toLocal(ev); up(p); });
  addEventListener('keydown', (e) => { if (scene === 'play') { if (e.key === ' ') { e.preventDefault(); act('sing'); } if (e.key === 'l') act('listen'); if (e.key === 'h') act('hint'); if (e.key === 'Escape') act('back'); } });
  function hitBtn(p) { return BTN().find((b) => Math.hypot(p.x - b.x, p.y - b.y) < b.r + 6); }
  function down(p) {
    if (scene === 'title') { const b = titleBtns().find((b) => p.x > b.x - b.w / 2 && p.x < b.x + b.w / 2 && p.y > b.y - 34 && p.y < b.y + 34); if (b) { if (b.id === 'play') scene = 'select'; else startLevel(SANDBOX); click(); } return; }
    if (scene === 'select') { const it = selectItems().find((i) => Math.hypot(p.x - i.x, p.y - i.y) < 36); if (it && it.open) { click(); startLevel(it.l); } if (Math.hypot(p.x - 62, p.y - 60) < 36) { scene = 'title'; click(); } return; }
    if (card && performance.now() - card.t < (card.delay || 0) * 1000 + 300) return;
    if (card) { const bs = cardBtns(); const b = bs.find((b) => Math.abs(p.x - b.x) < 90 && Math.abs(p.y - b.y) < 30); if (b) { click(); if (b.id === 'next') { const i = LEVELS.indexOf(lv); if (LEVELS[i + 1]) startLevel(LEVELS[i + 1]); else scene = 'select'; } else if (b.id === 'again') { card = null; solved = false; solveAt = -1; resim(); } else if (b.id === 'select') { playing = false; scene = 'select'; card = null; } } return; }
    const b = hitBtn(p); if (b) { act(b.id); return; }
    const it = trayItems().find((i) => Math.hypot(p.x - i.x, p.y - i.y) < i.r + 4);
    if (it) { if (count(it.q) <= 0) { nope(); return; } drag = { q: Object.assign({}, it.q), from: null, x: p.x, y: p.y, sx: p.x, sy: p.y, moved: false }; preview(it.q); return; }
    const c = cellAt(p.x, p.y); if (!c) return; const k = GC.key(c.x, c.y), q = board.get(k);
    if (!q) return;
    if (placedKeys.has(k)) { drag = { q, from: k, x: p.x, y: p.y, sx: p.x, sy: p.y, moved: false }; board.delete(k); placedKeys.delete(k); resim(); return; }
    // fixed piece: turnable?
    if (q.turn) { q.d = (q.d + 1) % 4; if (q.t === 'mirror') q.m = 1 - q.m; click(); resim(); return; }
    if (q.t === 'ghost') preview(q, true);
  }
  function up(p) {
    if (!drag) return; const d = drag; drag = null; const c = cellAt(p.x, p.y);
    if (d.from && !d.moved) { // tap on placed piece: turn it / hear it
      board.set(d.from, d.q); placedKeys.add(d.from);
      if (d.q.t === 'mirror') { d.q.m = 1 - d.q.m; click(); } else if (d.q.t === 'candle' || d.q.t === 'wick') { d.q.d = (d.q.d + 1) % 4; click(); } else if (d.q.t === 'ghost') preview(d.q, true);
      resim(); return;
    }
    if (c && !board.has(GC.key(c.x, c.y))) {
      if (!d.from) take(d.q); const k = GC.key(c.x, c.y); board.set(k, d.q); placedKeys.add(k); if (eng) eng.thump(now()); if (d.q.t === 'ghost') preview(d.q, true); resim(); return;
    }
    if (d.from && c && board.has(GC.key(c.x, c.y))) { board.set(d.from, d.q); placedKeys.add(d.from); resim(); return; } // occupied: snap back
    if (d.from) { give(d.q); resim(); } // dropped off the floor: back to the tray
  }
  function act(id) {
    click();
    if (id === 'back') { playing = false; scene = sandbox ? 'title' : 'select'; }
    if (id === 'listen') listen();
    if (id === 'sing') light(!playing);
    if (id === 'clear') { for (const k of [...placedKeys]) { give(board.get(k)); board.delete(k); } placedKeys.clear(); resim(); }
    if (id === 'reset') { const l = lv; startLevel(l, { quiet: true }); }
    if (id === 'hint') { hintsUsed++; giveHint(); }
  }
  function giveHint() {
    if (!lv.sol) return;
    // first par-solution piece not already on the board
    for (const p of lv.sol) {
      const k = GC.key(p.x, p.y), q = board.get(k);
      if (p.turn) { if (!q || q.d !== p.turn.d || q.m !== p.turn.m) { hint = { x: p.x, y: p.y, q: Object.assign({}, p.turn), t: performance.now(), turn: true }; return; } continue; }
      if (q && q.t === p.t && q.n === p.n && q.m === p.m) continue;
      hint = { x: p.x, y: p.y, q: (({ x, y, ...r }) => r)(p), t: performance.now() }; return;
    }
  }
  function preview(q, sing) { const e = audio(); if (!e) return; if (q.t === 'ghost') e.choir(q.n, now() + 0.01, 0.5, 0.4, 0, 'oo'); else e.tick(now()); }
  function click() { const e = audio(); if (e) e.tick(now(), 1.2); }
  function nope() { const e = audio(); if (e) e.thump(now()); }
  // ---------- drawing helpers ----------
  function rr(x, y, w, h, r) { cx.beginPath(); cx.moveTo(x + r, y); cx.arcTo(x + w, y, x + w, y + h, r); cx.arcTo(x + w, y + h, x, y + h, r); cx.arcTo(x, y + h, x, y, r); cx.arcTo(x, y, x + w, y, r); cx.closePath(); }
  function glow(x, y, r, col, a) { const g = cx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); cx.globalAlpha = a; cx.fillStyle = g; cx.beginPath(); cx.arc(x, y, r, 0, 7); cx.fill(); cx.globalAlpha = 1; }
  function hexA(h, a) { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
  function ghost(x, y, s, n, o = {}) {
    // s = radius-ish size. Low notes are bigger ghosts.
    const col = noteCol(n), t = tnow, sing = o.sing || 0, bob = Math.sin(t * 2 + x * 0.05) * s * 0.06 - sing * s * 0.18;
    y += bob;
    if (sing > 0) glow(x, y, s * 2.4, hexA(col, 0.9), 0.55 * sing);
    cx.save(); cx.translate(x, y);
    // body
    const body = cx.createLinearGradient(0, -s, 0, s);
    body.addColorStop(0, o.res ? '#e8e6f6' : '#ffffff'); body.addColorStop(1, hexA(col, o.res ? 0.55 : 0.9));
    cx.fillStyle = body; cx.globalAlpha = o.alpha ?? 0.96;
    cx.beginPath(); cx.arc(0, -s * 0.15, s * 0.82, Math.PI, 0); const hem = s * 0.75, wv = 4;
    cx.lineTo(s * 0.82, hem * 0.75);
    for (let i = wv; i >= 0; i--) { const xx = -s * 0.82 + (i / wv) * s * 1.64, yy = hem * 0.75 + (i % 2 ? -1 : 1) * s * 0.12 + Math.sin(t * 4 + i) * s * 0.04; cx.lineTo(xx, yy); }
    cx.closePath(); cx.fill();
    cx.strokeStyle = hexA(col, 0.9); cx.lineWidth = Math.max(1.5, s * 0.07); cx.stroke();
    // little arms
    cx.beginPath(); cx.ellipse(-s * 0.86, s * 0.12 - sing * s * 0.2, s * 0.16, s * 0.1, -0.6 - sing, 0, 7); cx.ellipse(s * 0.86, s * 0.12 - sing * s * 0.2, s * 0.16, s * 0.1, 0.6 + sing, 0, 7); cx.fill();
    cx.globalAlpha = 1;
    // face
    const ey = -s * 0.2, ex = s * 0.28;
    cx.fillStyle = '#2b2140';
    if (sing > 0.3) { cx.lineWidth = s * 0.08; cx.strokeStyle = '#2b2140'; cx.beginPath(); cx.arc(-ex, ey + s * 0.02, s * 0.1, Math.PI * 1.1, Math.PI * 1.9); cx.stroke(); cx.beginPath(); cx.arc(ex, ey + s * 0.02, s * 0.1, Math.PI * 1.1, Math.PI * 1.9); cx.stroke(); }
    else { const blink = Math.sin(t * 0.7 + n) > 0.985 ? 0.15 : 1; cx.beginPath(); cx.ellipse(-ex, ey, s * 0.09, s * 0.12 * blink, 0, 0, 7); cx.ellipse(ex, ey, s * 0.09, s * 0.12 * blink, 0, 0, 7); cx.fill(); cx.fillStyle = '#fff'; cx.beginPath(); cx.arc(-ex + s * 0.03, ey - s * 0.04, s * 0.03, 0, 7); cx.arc(ex + s * 0.03, ey - s * 0.04, s * 0.03, 0, 7); cx.fill(); }
    cx.fillStyle = '#2b2140';
    if (sing > 0.1) { cx.beginPath(); cx.ellipse(0, s * 0.12, s * 0.1, s * 0.14 * (0.6 + sing * 0.6), 0, 0, 7); cx.fill(); }
    else { cx.lineWidth = s * 0.06; cx.strokeStyle = '#2b2140'; cx.beginPath(); cx.arc(0, s * 0.04, s * 0.09, 0.2, Math.PI - 0.2); cx.stroke(); }
    cx.fillStyle = 'rgba(255,120,150,0.45)'; cx.beginPath(); cx.ellipse(-s * 0.48, s * 0.02, s * 0.12, s * 0.07, 0, 0, 7); cx.ellipse(s * 0.48, s * 0.02, s * 0.12, s * 0.07, 0, 0, 7); cx.fill();
    if (o.res) { // old chapel ghost: a little night cap
      cx.fillStyle = '#6c5fa8'; cx.beginPath(); cx.moveTo(-s * 0.55, -s * 0.72); cx.quadraticCurveTo(0, -s * 1.25, s * 0.75, -s * 1.05); cx.quadraticCurveTo(s * 0.3, -s * 0.85, s * 0.55, -s * 0.68); cx.closePath(); cx.fill();
      cx.fillStyle = '#fff6d0'; cx.beginPath(); cx.arc(s * 0.78, -s * 1.05, s * 0.1, 0, 7); cx.fill();
    }
    cx.restore();
  }
  function noteSize(n, base) { return base * (1.12 - (n - 48) / 28 * 0.42); }
  function candle(x, y, s, d, c, lit = true, o = {}) {
    cx.save(); cx.translate(x, y);
    // light cone hint in the facing direction
    const ang = [-Math.PI / 2, 0, Math.PI / 2, Math.PI][d];
    if (lit) { cx.save(); cx.rotate(ang); const g = cx.createLinearGradient(0, 0, s * 1.6, 0); g.addColorStop(0, hexA(LIGHT[c], 0.45)); g.addColorStop(1, hexA(LIGHT[c], 0)); cx.fillStyle = g; cx.beginPath(); cx.moveTo(s * 0.2, 0); cx.lineTo(s * 1.6, -s * 0.5); cx.lineTo(s * 1.6, s * 0.5); cx.closePath(); cx.fill(); cx.restore(); glow(0, -s * 0.4, s * 1.3, hexA(LIGHT[c], 0.8), 0.6); }
    // holder
    cx.fillStyle = '#8a6a3a'; cx.beginPath(); cx.ellipse(0, s * 0.42, s * 0.48, s * 0.16, 0, 0, 7); cx.fill();
    cx.fillStyle = '#c99b52'; cx.beginPath(); cx.ellipse(0, s * 0.36, s * 0.42, s * 0.12, 0, 0, 7); cx.fill();
    // wax
    const wax = cx.createLinearGradient(-s * 0.2, 0, s * 0.2, 0); wax.addColorStop(0, c === 'b' ? '#bfe3ff' : '#fff1d6'); wax.addColorStop(1, c === 'b' ? '#7fb2e0' : '#e3c9a0');
    cx.fillStyle = wax; rr(-s * 0.2, -s * 0.35, s * 0.4, s * 0.72, s * 0.06); cx.fill();
    cx.strokeStyle = '#3a2a3a'; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(0, -s * 0.35); cx.lineTo(0, -s * 0.45); cx.stroke();
    if (lit) { const fl = 1 + Math.sin(tnow * 13 + x) * 0.08; cx.fillStyle = c === 'b' ? '#bfe9ff' : '#ffd36b'; cx.beginPath(); cx.ellipse(0, -s * 0.58, s * 0.1 * fl, s * 0.2 * fl, 0, 0, 7); cx.fill(); cx.fillStyle = '#fff'; cx.beginPath(); cx.ellipse(0, -s * 0.54, s * 0.045, s * 0.09, 0, 0, 7); cx.fill(); }
    // direction arrow chip
    cx.rotate(ang); cx.fillStyle = hexA(LIGHT[c], lit ? 0.95 : 0.5); cx.beginPath(); cx.moveTo(s * 0.62, 0); cx.lineTo(s * 0.44, -s * 0.12); cx.lineTo(s * 0.44, s * 0.12); cx.closePath(); cx.fill();
    cx.restore();
    if (o.turn) { cx.strokeStyle = 'rgba(255,240,200,0.35)'; cx.setLineDash([4, 5]); cx.lineWidth = 2; cx.beginPath(); cx.arc(x, y, s * 0.72, 0, 7); cx.stroke(); cx.setLineDash([]); }
  }
  function mirror(x, y, s, m) {
    cx.save(); cx.translate(x, y); cx.rotate(m === 0 ? -Math.PI / 4 : Math.PI / 4);
    cx.fillStyle = '#6a5a8a'; rr(-s * 0.62, -s * 0.11, s * 1.24, s * 0.22, s * 0.08); cx.fill();
    const g = cx.createLinearGradient(0, -s * 0.08, 0, s * 0.08); g.addColorStop(0, '#f4f7ff'); g.addColorStop(0.5, '#a8b8e8'); g.addColorStop(1, '#e8eeff');
    cx.fillStyle = g; rr(-s * 0.56, -s * 0.06, s * 1.12, s * 0.12, s * 0.05); cx.fill();
    cx.fillStyle = 'rgba(255,255,255,0.8)'; cx.fillRect(-s * 0.3 + Math.sin(tnow) * s * 0.2, -s * 0.05, s * 0.08, s * 0.1);
    cx.fillStyle = '#d9b46a'; cx.beginPath(); cx.arc(-s * 0.62, 0, s * 0.07, 0, 7); cx.arc(s * 0.62, 0, s * 0.07, 0, 7); cx.fill();
    cx.restore();
  }
  function prism(x, y, s) {
    cx.save(); cx.translate(x, y); const r = s * 0.42;
    glow(0, 0, s * 0.9, 'rgba(200,170,255,0.8)', 0.35);
    const g = cx.createLinearGradient(-r, -r, r, r); g.addColorStop(0, '#e9dcff'); g.addColorStop(0.5, '#9fd8ff'); g.addColorStop(1, '#ffc6ea');
    cx.fillStyle = g; cx.beginPath(); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + Math.PI / 6 + tnow * 0.3; cx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } cx.closePath(); cx.fill();
    cx.strokeStyle = 'rgba(255,255,255,0.8)'; cx.lineWidth = 2; cx.stroke();
    cx.restore();
  }
  function pillar(x, y, s) {
    glow(x + s * 0.06, y + s * 0.1, s * 0.6, 'rgba(0,0,0,0.9)', 0.5);
    const g = cx.createRadialGradient(x - s * 0.12, y - s * 0.14, s * 0.05, x, y, s * 0.42); g.addColorStop(0, '#8b86a8'); g.addColorStop(1, '#3e3a58');
    cx.fillStyle = g; cx.beginPath(); cx.arc(x, y, s * 0.4, 0, 7); cx.fill();
    cx.strokeStyle = '#2a2740'; cx.lineWidth = 3; cx.beginPath(); cx.arc(x, y, s * 0.3, 0, 7); cx.stroke();
  }
  function drawPiece(q, x, y, ts, o = {}) {
    if (q.t === 'ghost') ghost(x, y, noteSize(q.n, ts * 0.36), q.n, o);
    else if (q.t === 'mirror') mirror(x, y, ts * 0.62, q.m);
    else if (q.t === 'prism') prism(x, y, ts * 0.7);
    else if (q.t === 'candle') candle(x, y, ts * 0.62, q.d, q.c, true, { turn: q.turn });
    else if (q.t === 'wick') candle(x, y, ts * 0.62, q.d, q.c, !!o.lit, { turn: q.turn });
    else if (q.t === 'pillar') pillar(x, y, ts * 0.9);
  }
  // ---------- scenes ----------
  function bg(dim = 1) {
    const g = cx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1b1640'); g.addColorStop(1, '#0d0b22'); cx.fillStyle = g; cx.fillRect(0, 0, W, H);
    // arches with stained glass
    for (const ax of [70, 1130]) {
      cx.save(); cx.translate(ax, 330);
      cx.fillStyle = '#231d4a'; cx.beginPath(); cx.moveTo(-58, 240); cx.lineTo(-58, -120); cx.quadraticCurveTo(0, -240, 58, -120); cx.lineTo(58, 240); cx.fill();
      const cols = ['#ff6b6b', '#ffd23f', '#5fd068', '#5b8cff', '#b06cff', '#3cc6c0'];
      for (let i = 0; i < 18; i++) { const r = 18 + (i % 3) * 14, a = (i / 18) * Math.PI * 2; cx.globalAlpha = 0.18 + 0.1 * Math.sin(tnow * 0.5 + i); cx.fillStyle = cols[i % 6]; cx.beginPath(); cx.arc(Math.cos(a) * r * 0.9, -110 + Math.sin(a) * r, 9, 0, 7); cx.fill(); }
      cx.globalAlpha = 1; cx.restore();
    }
    for (const m of motes) { m.y -= m.v * 0.016; m.x += Math.sin(tnow * 0.3 + m.p) * 0.2; if (m.y < -5) { m.y = H + 5; m.x = Math.random() * W; } cx.globalAlpha = 0.25 + 0.2 * Math.sin(tnow + m.p); cx.fillStyle = '#ffe7b0'; cx.beginPath(); cx.arc(m.x, m.y, m.s, 0, 7); cx.fill(); }
    cx.globalAlpha = 1;
  }
  function vignette() { const g = cx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,10,0.6)'); cx.fillStyle = g; cx.fillRect(0, 0, W, H); }
  function titleBtns() { return [{ id: 'play', x: 600, y: 615, w: 300, label: 'Sing the Hymns' }, { id: 'sandbox', x: 600, y: 700, w: 300, label: 'Midnight Practice' }]; }
  function drawTitle() {
    bg(); glow(600, 300, 380, 'rgba(255,200,110,0.9)', 0.25);
    // rose window
    cx.save(); cx.translate(600, 220); const cols = ['#ff5a5f', '#ff9a3c', '#ffd23f', '#5fd068', '#3cc6c0', '#5b8cff', '#b06cff', '#ff7aa8'];
    for (let i = 0; i < 16; i++) { cx.rotate(Math.PI / 8); cx.globalAlpha = 0.35 + 0.15 * Math.sin(tnow + i); cx.fillStyle = cols[i % 8]; cx.beginPath(); cx.ellipse(0, -95, 22, 48, 0, 0, 7); cx.fill(); }
    cx.globalAlpha = 0.8; cx.fillStyle = '#ffe9b8'; cx.beginPath(); cx.arc(0, 0, 40, 0, 7); cx.fill(); cx.globalAlpha = 1; cx.restore();
    cx.textAlign = 'center'; cx.fillStyle = '#fff3d6'; cx.font = 'bold 84px Georgia, serif'; cx.shadowColor = 'rgba(255,190,90,0.8)'; cx.shadowBlur = 30; cx.fillText('GHOST CHOIR', 600, 420); cx.shadowBlur = 0;
    cx.font = 'italic 24px Georgia, serif'; cx.fillStyle = '#cbbfff'; cx.fillText('light the candles, and the shy ghosts will sing', 600, 462);
    const notes = [60, 64, 67, 72, 69, 62];
    notes.forEach((n, i) => ghost(240 + i * 144, 520 + Math.sin(tnow * 1.3 + i) * 10 - (i === 2 || i === 3 ? 0 : 0), 30, n, { sing: Math.max(0, Math.sin(tnow * 1.6 - i * 0.7)) }));
    for (const b of titleBtns()) { const hv = hover && Math.abs(hover.x - b.x) < b.w / 2 && Math.abs(hover.y - b.y) < 34; cx.fillStyle = hv ? 'rgba(255,214,140,0.28)' : 'rgba(255,214,140,0.14)'; rr(b.x - b.w / 2, b.y - 30, b.w, 60, 30); cx.fill(); cx.strokeStyle = 'rgba(255,220,160,0.6)'; cx.lineWidth = 2; cx.stroke(); cx.fillStyle = '#fff1d0'; cx.font = '28px Georgia, serif'; cx.fillText(b.label, b.x, b.y + 10); }
    candle(160, 700, 60, 1, 'g'); candle(1040, 700, 60, 3, 'b');
    cx.font = '13px Georgia, serif'; cx.fillStyle = 'rgba(200,190,255,0.5)'; cx.fillText('v' + (window.GC_VERSION || 'dev'), 1150, 785);
    vignette();
  }
  const CH = [['The Nave', '#ffcf6b'], ['The Choir Loft', '#ff9ec4'], ['The Bell Tower', '#8fd3ff']];
  function selectItems() {
    const out = [];
    LEVELS.forEach((l, i) => { const ch = +l.id[0] - 1, j = +l.id.split('-')[1] - 1; const prev = LEVELS[i - 1];
      const open = Q.get('unlock') === 'all' || i === 0 || (store[prev.id] && store[prev.id].solved) || (j === 0 && LEVELS.filter((q) => +q.id[0] === ch && store[q.id] && store[q.id].solved).length >= 6);
      out.push({ l, x: 290 + j * 96, y: 230 + ch * 170, open, rec: store[l.id] || {}, ch }); });
    return out;
  }
  function drawSelect() {
    bg(); cx.textAlign = 'center'; cx.fillStyle = '#fff1d0'; cx.font = 'bold 44px Georgia, serif'; cx.fillText('Hymns', 600, 90);
    btnIcon({ x: 62, y: 60, r: 30, icon: 'back' });
    for (let c = 0; c < 3; c++) { cx.textAlign = 'left'; cx.font = 'italic 24px Georgia, serif'; cx.fillStyle = CH[c][1]; cx.fillText(CH[c][0], 240, 170 + c * 170); }
    for (const it of selectItems()) {
      const { x, y } = it; cx.fillStyle = it.open ? 'rgba(255,230,180,0.12)' : 'rgba(255,255,255,0.04)'; cx.beginPath(); cx.arc(x, y, 34, 0, 7); cx.fill();
      if (it.rec.solved) { candle(x, y + 4, 44, 0, it.ch === 2 ? 'b' : 'g', true); if (it.rec.par) { cx.fillStyle = '#ffd86b'; cx.font = '18px Georgia'; cx.textAlign = 'center'; cx.fillText('★', x + 26, y - 20); } }
      else if (it.open) { ghost(x, y, 22, [60, 64, 67, 72, 69, 62, 65, 71][(+it.l.id.split('-')[1]) - 1]); }
      else { cx.fillStyle = 'rgba(200,190,255,0.25)'; cx.beginPath(); cx.arc(x, y, 8, 0, 7); cx.fill(); }
      cx.textAlign = 'center'; cx.font = '13px Georgia, serif'; cx.fillStyle = it.open ? '#d8cff8' : '#6a6290'; cx.fillText(it.l.name, x, y + 52);
    }
    vignette();
  }
  function btnIcon(b) {
    const hv = hover && Math.hypot(hover.x - b.x, hover.y - b.y) < b.r + 4;
    cx.fillStyle = hv ? 'rgba(255,220,160,0.25)' : 'rgba(255,220,160,0.1)'; cx.beginPath(); cx.arc(b.x, b.y, b.r, 0, 7); cx.fill(); cx.strokeStyle = 'rgba(255,220,160,0.45)'; cx.lineWidth = 2; cx.stroke();
    cx.save(); cx.translate(b.x, b.y); cx.strokeStyle = '#ffeacc'; cx.fillStyle = '#ffeacc'; cx.lineWidth = 3; cx.lineCap = 'round'; const r = b.r * 0.45;
    if (b.icon === 'back') { cx.beginPath(); cx.moveTo(r * 0.6, -r); cx.lineTo(-r * 0.5, 0); cx.lineTo(r * 0.6, r); cx.stroke(); }
    if (b.icon === 'organ') { for (let i = -2; i <= 2; i++) { const hgt = r * (1.6 - Math.abs(i) * 0.3); rr(i * r * 0.4 - r * 0.14, r * 0.8 - hgt, r * 0.28, hgt, 3); cx.fill(); } }
    if (b.icon === 'candle') { cx.restore(); candle(b.x, b.y + 4, b.r * 1.1, 0, 'g', true); cx.save(); }
    if (b.icon === 'stop') { rr(-r * 0.7, -r * 0.7, r * 1.4, r * 1.4, 4); cx.fill(); }
    if (b.icon === 'hint') { cx.restore(); ghost(b.x, b.y + 2, b.r * 0.55, 67, { alpha: 0.9 }); cx.save(); cx.translate(b.x, b.y); cx.fillStyle = '#ffd86b'; cx.font = 'bold 16px Georgia'; cx.textAlign = 'center'; cx.fillText('?', b.r * 0.55, -b.r * 0.4); }
    if (b.icon === 'reset') { cx.beginPath(); cx.arc(0, 0, r, 0.6, Math.PI * 1.9); cx.stroke(); cx.beginPath(); cx.moveTo(r * 1.1, -r * 0.9); cx.lineTo(r * 0.95, -r * 0.05); cx.lineTo(r * 0.2, -r * 0.45); cx.fill(); }
    cx.restore();
    if (b.label) { cx.textAlign = 'center'; cx.font = '14px Georgia, serif'; cx.fillStyle = '#cbbfff'; cx.fillText(b.label, b.x, b.y + b.r + 18); }
  }
  // the organ's hymn scroll: one slot per beat; target notes as small ghost heads by pitch; your notes fill them in
  function drawScroll(beat) {
    const x0 = 160, x1 = 1040, y0 = 26, y1 = 160, L = lv.L, sw = (x1 - x0) / L;
    cx.fillStyle = 'rgba(40,30,70,0.85)'; rr(x0 - 16, y0 - 10, x1 - x0 + 32, y1 - y0 + 20, 18); cx.fill();
    cx.strokeStyle = 'rgba(255,214,140,0.35)'; cx.lineWidth = 2; cx.stroke();
    // organ pipes behind
    for (let i = 0; i < 22; i++) { const px = x0 + i * ((x1 - x0) / 21), ph = 18 + Math.abs(Math.sin(i * 1.7)) * 14; cx.fillStyle = 'rgba(210,180,120,0.12)'; rr(px - 6, y0 - 10 - ph, 12, ph, 4); cx.fill(); }
    const ny = (n) => y1 - 18 - ((n - 48) / 28) * (y1 - y0 - 36);
    const mine = sim.events;
    for (let t = 0; t < L; t++) {
      const sx = x0 + t * sw + sw / 2;
      const isNow = beat !== null && Math.floor(beat) % L === t;
      cx.fillStyle = isNow ? 'rgba(255,220,150,0.18)' : t % A.barLen(lv) === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.025)'; rr(x0 + t * sw + 2, y0, sw - 4, y1 - y0, 8); cx.fill();
      cx.fillStyle = isNow ? 'rgba(255,230,170,0.9)' : 'rgba(255,230,170,0.45)'; cx.font = '13px Georgia'; cx.textAlign = 'left'; cx.fillText(String(t + 1), x0 + t * sw + 8, y1 - 6);
      const tg = new Set(target[t]), my = new Set(mine[t]);
      const all = new Set([...tg, ...my]);
      if (!all.size) { cx.fillStyle = 'rgba(200,190,255,0.25)'; cx.beginPath(); cx.arc(sx, y1 - 12, 3, 0, 7); cx.fill(); }
      for (const e of all) {
        const [n, c] = e.split(':'); const m = +n, y = ny(m), inT = tg.has(e), inM = my.has(e);
        const s = Math.min(sw * 0.3, 15);
        if (inT && inM) { glow(sx, y, s * 2.4, hexA(noteCol(m), 0.9), 0.5); ghost(sx, y, s, m, { sing: isNow ? 1 : 0.2 }); }
        else if (inT) { cx.globalAlpha = 0.85; cx.setLineDash([3, 3]); cx.strokeStyle = noteCol(m); cx.lineWidth = 2; cx.beginPath(); cx.arc(sx, y - 1, s * 0.85, 0, 7); cx.stroke(); cx.setLineDash([]); cx.globalAlpha = 1; }
        else { ghost(sx, y, s * 0.8, m, { alpha: 0.35 }); cx.strokeStyle = '#ff8a8a'; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(sx - s * 0.5, y - s * 0.5); cx.lineTo(sx + s * 0.5, y + s * 0.5); cx.stroke(); }
        if (c === 'b') { cx.fillStyle = inT ? '#8fd3ff' : '#ff8a8a'; cx.beginPath(); cx.moveTo(sx + s * 0.9, y - s * 0.9); cx.lineTo(sx + s * 1.3, y - s * 0.3); cx.lineTo(sx + s * 0.5, y - s * 0.3); cx.closePath(); cx.fill(); }
      }
    }
    if (organT0 >= 0) { const ob = (now() - organT0) / beatDur(); if (ob >= 0 && ob < L) { const px = x0 + ob * sw; glow(px, (y0 + y1) / 2, 60, 'rgba(255,220,140,0.9)', 0.35); } }
    // par: little gold candles
    cx.textAlign = 'right'; cx.font = '15px Georgia, serif'; cx.fillStyle = '#ffe2a6';
    cx.fillText(`${lv.name}`, x1 + 12, y1 + 30);
  }
  function drawPlay() {
    bg(); const g = gridGeom(), { ts, x0, y0 } = g;
    const bd = beatDur();
    let beat = frozenBeat !== null ? frozenBeat : playing ? (now() - playT0) / bd : null;
    if (beat !== null && beat < 0) beat = null;
    const bi = beat !== null ? Math.floor(beat) % lv.L : -1, frac = beat !== null ? beat - Math.floor(beat) : 0;
    // candle warmth on the floor
    cx.fillStyle = '#2a2350'; rr(x0 - 14, y0 - 14, g.gw + 28, g.gh + 28, 18); cx.fill();
    for (let y = 0; y < lv.h; y++) for (let x = 0; x < lv.w; x++) { const px = x0 + x * ts, py = y0 + y * ts; cx.fillStyle = (x + y) % 2 ? '#3a3168' : '#342c5e'; rr(px + 2, py + 2, ts - 4, ts - 4, 8); cx.fill(); }
    for (const [k, q] of board) if (q.t === 'candle' || (q.t === 'wick' && k in sim.lit)) { const [x, y] = k.split(',').map(Number); glow(x0 + (x + 0.5) * ts, y0 + (y + 0.5) * ts, ts * 2.2, hexA(LIGHT[q.c], 0.7), 0.25); }
    // light path (whole loop, faint) with beat pips
    for (let t = 0; t < lv.L; t++) for (const s of sim.trail[t]) {
      const px = x0 + (s.x + 0.5) * ts, py = y0 + (s.y + 0.5) * ts;
      cx.fillStyle = hexA(LIGHT[s.c], s.kind === 'sing' ? 0.18 : 0.12); rr(px - ts / 2 + 4, py - ts / 2 + 4, ts - 8, ts - 8, 8); cx.fill();
      cx.fillStyle = hexA(LIGHT[s.c], 0.55); cx.font = `${Math.round(ts * 0.16)}px Georgia`; cx.textAlign = 'left';
      const off = sim.trail.slice(0, t).flat().filter((u) => u.x === s.x && u.y === s.y).length; cx.fillText(String(t + 1), px - ts / 2 + 8 + off * ts * 0.18, py + ts / 2 - 8);
    }
    for (let t = 0; t < lv.L; t++) for (const s of sim.trail[t]) {
      const nx = t + 1 < lv.L ? sim.trail[t + 1].find((u) => Math.abs(u.x - s.x) + Math.abs(u.y - s.y) === 1) : null;
      if (nx) { cx.strokeStyle = hexA(LIGHT[s.c], 0.3); cx.lineWidth = 3; cx.setLineDash([2, 8]); cx.beginPath(); cx.moveTo(x0 + (s.x + 0.5) * ts, y0 + (s.y + 0.5) * ts); cx.lineTo(x0 + (nx.x + 0.5) * ts, y0 + (nx.y + 0.5) * ts); cx.stroke(); cx.setLineDash([]); }
    }
    // hint
    if (hint) { const px = x0 + (hint.x + 0.5) * ts, py = y0 + (hint.y + 0.5) * ts, a = 0.45 + 0.25 * Math.sin(tnow * 5); glow(px, py, ts, 'rgba(255,240,180,0.9)', 0.4); cx.globalAlpha = a; drawPiece(hint.q, px, py, ts, { alpha: 0.6 }); cx.globalAlpha = 1; }
    // pieces
    const singing = new Map(); if (bi >= 0) for (const s of sim.sung[bi]) singing.set(GC.key(s.x, s.y), 1 - frac * 0.6);
    const order = [...board].sort((a, b) => +a[0].split(',')[1] - +b[0].split(',')[1]);
    for (const [k, q] of order) { const [x, y] = k.split(',').map(Number); const px = x0 + (x + 0.5) * ts, py = y0 + (y + 0.5) * ts; drawPiece(q, px, py, ts, { sing: singing.get(k) || 0, res: q.res, lit: playing && bi >= 0 && sim.lit[k] !== undefined && sim.lit[k] <= bi });
      if (q.t === 'ghost' && !placedKeys.has(k) && !q.res && !sandbox) {} }
    // moving light heads
    if (bi >= 0) for (const s of sim.trail[bi]) { const px = x0 + (s.x + 0.5) * ts, py = y0 + (s.y + 0.5) * ts; glow(px, py, ts * 0.9, hexA(LIGHT[s.c], 1), 0.75 - frac * 0.4); cx.fillStyle = '#fffbe8'; cx.beginPath(); cx.arc(px, py, ts * 0.07, 0, 7); cx.fill(); }
    { const tn = now(); sparks = sparks.filter((p) => tn < p.t0 + p.life); for (const p of sparks) { const a = (tn - p.t0) / p.life; if (a < 0) continue; cx.globalAlpha = (1 - a) * 0.9; cx.fillStyle = p.col; cx.font = `${Math.round(ts * 0.42)}px Georgia`; cx.textAlign = 'center'; cx.fillText(p.glyph, p.x + p.vx * a, p.y + p.vy * a + Math.sin(a * 9) * 4); } cx.globalAlpha = 1; }
    if (lv.id === '1-1' && placedKeys.size === 0 && !drag && lv.sol) drawHand(g);
    if (!sandbox) drawScroll(beat);
    // tray
    cx.fillStyle = 'rgba(30,24,60,0.85)'; rr(150, 672, 900, 100, 22); cx.fill(); cx.strokeStyle = 'rgba(255,214,140,0.25)'; cx.stroke();
    for (const it of trayItems()) { const n = count(it.q); cx.globalAlpha = n > 0 ? 1 : 0.3; drawPiece(it.q, it.x, it.y, it.r * 2.1, { lit: true }); cx.globalAlpha = 1;
      if (!sandbox) { cx.fillStyle = n > 0 ? '#ffe7b8' : '#7a7099'; cx.font = 'bold 15px Georgia'; cx.textAlign = 'center'; cx.fillText('×' + n, it.x + it.r * 0.75, it.y + it.r + 2); } }
    for (const b of BTN()) btnIcon(b);
    if (drag) { cx.globalAlpha = 0.9; drawPiece(drag.q, drag.x, drag.y, ts, { lit: true }); cx.globalAlpha = 1; }
    if (finaleT >= 0) drawFinale();
    if (card) drawCard();
    vignette();
  }
  function drawHand(g) {
    const p = lv.sol[0], it = trayItems().find((i) => i.q.t === p.t && i.q.n === p.n); if (!it) return;
    const k = (tnow % 2.6) / 2.6, e = k < 0.15 ? 0 : k > 0.75 ? 1 : (k - 0.15) / 0.6, s = e * e * (3 - 2 * e);
    const hx = it.x + (g.x0 + (p.x + 0.5) * g.ts - it.x) * s, hy = it.y + (g.y0 + (p.y + 0.5) * g.ts - it.y) * s;
    cx.globalAlpha = k > 0.85 ? (1 - k) / 0.15 : 0.85; drawPiece({ t: 'ghost', n: p.n }, hx, hy - 6, g.ts * 0.8, { alpha: 0.5 });
    cx.fillStyle = '#fff6e0'; cx.beginPath(); cx.arc(hx + 14, hy + 16, 11, 0, 7); cx.fill(); cx.fillRect(hx + 9, hy - 4, 8, 18); cx.globalAlpha = 1;
  }
  function cardBtns() { return [{ id: 'again', x: 470, y: 470, label: 'Stay' }, { id: 'next', x: 730, y: 470, label: LEVELS.indexOf(lv) === LEVELS.length - 1 ? 'All hymns' : 'Next hymn' }]; }
  function drawCard() {
    const a = Math.max(0, Math.min(1, (performance.now() - card.t - (card.delay || 0) * 1000) / 600)); if (a <= 0) return;
    cx.globalAlpha = a; cx.fillStyle = 'rgba(16,12,36,0.78)'; rr(330, 250, 540, 270, 28); cx.fill(); cx.strokeStyle = 'rgba(255,214,140,0.6)'; cx.lineWidth = 2; cx.stroke();
    cx.textAlign = 'center'; cx.fillStyle = '#fff1d0'; cx.font = 'bold 40px Georgia, serif'; cx.fillText(card.finale ? 'The Midnight Choir sings!' : 'The choir sings!', 600, 312);
    for (let i = 0; i < 2; i++) { cx.font = '46px Georgia'; cx.fillStyle = i < card.stars ? '#ffd86b' : 'rgba(255,255,255,0.15)'; cx.fillText('★', 560 + i * 80, 380); }
    cx.font = '17px Georgia, serif'; cx.fillStyle = '#d8cff8'; cx.fillText(card.finale ? 'Every ghost in the chapel is singing for you.' : card.stars === 2 ? 'Sung all by yourself!' : 'Sung with a little help. Try again on your own for the second star.', 600, 420);
    for (const b of cardBtns()) { cx.fillStyle = 'rgba(255,214,140,0.18)'; rr(b.x - 90, b.y - 26, 180, 52, 26); cx.fill(); cx.fillStyle = '#fff1d0'; cx.font = '22px Georgia, serif'; cx.fillText(b.label, b.x, b.y + 8); }
    cx.globalAlpha = 1;
  }
  // ---------- loop ----------
  function frame(ts) {
    tnow = ts / 1000; schedule();
    cx.setTransform(scale * dpr, 0, 0, scale * dpr, offX * dpr, offY * dpr);
    cx.fillStyle = '#0d0b22'; cx.fillRect(-offX / scale, -offY / scale, innerWidth / scale, innerHeight / scale);
    if (scene === 'title') drawTitle(); else if (scene === 'select') drawSelect(); else drawPlay();
    requestAnimationFrame(frame);
  }
  // ---------- test hooks / deep links ----------
  window.__GC = { layout: () => ({ tray: trayItems().map((i) => ({ q: i.q, x: i.x, y: i.y })), grid: gridGeom(), scale, offX, offY }), startLevel, get sim() { return sim; }, get board() { return board; }, levels: LEVELS, win: () => card, act, place: (x, y, q) => { take(q); board.set(GC.key(x, y), q); placedKeys.add(GC.key(x, y)); resim(); }, setBeat: (b) => (frozenBeat = b), state: () => ({ scene, solved, solveAt, used: piecesUsed(), playing }) };
  if (Q.get('scene') === 'select') scene = 'select';
  if (Q.has('level')) { const l = Q.get('level') === 'sandbox' ? SANDBOX : LEVELS.find((x) => x.id === Q.get('level')); if (l) startLevel(l, { solve: Q.get('solved') === '1', quiet: true }); if (Q.get('hint') === '1') giveHint(); if (Q.get('card') === '1') win(); if (Q.get('playing') === '1' || Q.get('sing') === '1') light(true); }
  if (Q.get('unlock') === 'all') {}
  requestAnimationFrame(frame);
})();
