// CARTOGRAPHER client: screens, input, rendering, hints, chart mode, daily island, saves.
(function () {
  'use strict';
  const CG = window.CG, LD = window.CG_LADDER, GEN = window.CGEN, ART = window.CART, AU = window.CAUDIO;
  const ISL = window.CG_ISLANDS, REG = window.CG_REGIONS, CHARTS = window.CG_CHARTS || [];
  const VW = 1280, VH = 800;
  const cv = document.getElementById('c'), g = cv.getContext('2d');
  const Q = new URLSearchParams(location.search);
  let scale = 1, offX = 0, offY = 0, dpr = 1;
  const SAVEKEY = 'cartographer.v1';
  let save = { solved: {}, maps: {}, reduced: false, autoInk: false, charted: {}, bestStreak: 0 };
  try { const s = JSON.parse(localStorage.getItem(SAVEKEY)); if (s) save = Object.assign(save, s); } catch (e) { /* fresh */ }
  // v0.4.1 re-rated the voyage (Gull Rock moved to the end of the Shoals), so old save ids move with their islands.
  const ID_MOVES_041 = {"r1-7":"r1-10","r1-8":"r1-7","r1-9":"r1-8","r1-10":"r1-9","r2-2":"r2-3","r2-3":"r2-4","r2-4":"r2-2","r2-5":"r2-6","r2-6":"r2-5","r2-9":"r2-10","r2-10":"r2-9","r3-3":"r3-4","r3-4":"r3-3"};
  if ((save.idv || 1) < 2) {
    for (const bag of ['solved', 'maps', 'charted']) { const o = save[bag] || {}, n = {}; for (const k in o) n[ID_MOVES_041[k] || k] = o[k]; save[bag] = n; }
    save.idv = 2;
  }
  const persist = () => { try { localStorage.setItem(SAVEKEY, JSON.stringify(save)); } catch (e) { /* private mode */ } };
  // ---------- daily streak + charted log ----------
  const dayKey = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const todayKey = () => Q.get('day') || dayKey(new Date());
  function shiftDay(key, n) { const [y, m, d] = key.split('-').map(Number); return dayKey(new Date(y, m - 1, d + n)); }
  function streak() { // consecutive charted dailies ending today (or yesterday, if today is still open)
    let k = todayKey(); if (!save.solved['daily:' + k]) k = shiftDay(k, -1);
    let n = 0; while (save.solved['daily:' + k] && n < 3660) { n++; k = shiftDay(k, -1); }
    return n;
  }
  function logCharted(key, P, mode, secs) {
    save.charted[key] = { name: P.name, mode, region: P.region || 0, W: P.W, H: P.H, t: P.sol.t.slice(), lm: { ...P.sol.lm }, date: dayKey(new Date()), secs };
  }
  const reduced = () => save.reduced || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  function resize() {
    dpr = window.devicePixelRatio || 1;
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px';
    scale = Math.min(innerWidth / VW, innerHeight / VH); offX = (innerWidth - VW * scale) / 2; offY = (innerHeight - VH * scale) / 2;
  }
  addEventListener('resize', resize); resize();

  // ---------- game state ----------
  let screen = 'title', T = 0, last = performance.now();
  let cur = null; // play state
  let buttons = []; // per-frame hit regions
  let mouse = { x: -1, y: -1 }, toast = null;
  const TERR_KEYS = ['sea', 'sand', 'grass', 'forest', 'mountain'];

  function islandById(id) { return ISL.find((p) => p.id === id); }
  function regionOpen(r) { if (Q.get('unlock') === 'all' || r === 0) return true; return ISL.filter((p) => p.region === r - 1 && save.solved[p.id]).length >= 5; }

  function startIsland(P, mode, extra) {
    const N = P.W * P.H;
    const map = { t: new Array(N).fill(-1), lm: {} }; for (const L of P.lms) map.lm[L] = -1;
    const locked = new Set();
    cur = { P, mode, map, locked, undo: [], brush: { kind: 't', v: P.pal.includes(2) ? 2 : P.pal[1] }, hover: -1, hoverClue: -1, hint: null,
      won: false, wonT: 0, t0: Date.now(), status: [], seals: new Set(), anim: [], wave: 0, waves: null, shipT: -99, ...extra };
    // the sketch tiles are pre-inked
    const activeClues = () => cur.waves ? cur.waves.slice(0, cur.wave + 1).flat() : P.clues;
    cur.active = activeClues;
    for (const c of P.clues) if (c.t === 'sketch' && (!cur.waves || cur.waves[0].includes(c))) for (const [i, v] of c.cells) { map.t[i] = v; locked.add(i); }
    const saved = mode === 'voyage' && save.maps[P.id] && (!save.maps[P.id].name || save.maps[P.id].name === P.name) && save.maps[P.id];
    if (saved && !save.solved[P.id]) { for (let i = 0; i < N; i++) if (!locked.has(i) && saved.t[i] >= 0) map.t[i] = saved.t[i]; for (const L of P.lms) if (saved.lm && saved.lm[L] >= 0) map.lm[L] = saved.lm[L]; }
    // v0.5: the skills this island needs (pictures in the journal); lessons show their new skill big
    if (!P._needs) { try { P._needs = LD.needs(P) || []; } catch (e) { P._needs = []; } }
    cur.needs = P._needs; cur.newSkill = P.tutorial && P.teaches ? P.teaches.filter((t) => t !== 'look') : [];
    AU.setRegion(P.region || 0);
    screen = 'play'; refresh(); AU.sfx('page');
  }
  function visModel() { return CG.visibleModel(cur.P, clueList(), [...cur.locked].map((i) => [i, cur.map.t[i]])); }
  function lmWords(L) { return 'This island has one ' + L + '. It stands ' + (L === 'lighthouse' ? 'on land next to a sea tile.' : 'on ' + CG.TNAME[CG.only(CG.HOME[L])] + '.') + ' Place it to finish the map.'; }
  function clueList() { return cur.active().filter((c) => c.t !== 'sketch'); }
  // optional: ink tiles that a margin count forces (only while every inked tile is still right)
  function autoInk() {
    if (!save.autoInk || cur.won) return;
    const P = cur.P;
    for (let i = 0; i < cur.map.t.length; i++) if (cur.map.t[i] >= 0 && cur.map.t[i] !== P.sol.t[i]) return;
    const forced = CG.forcedByCounts(P, clueList(), cur.map); if (!forced.length) return;
    forced.forEach(([i, v], n) => { cur.map.t[i] = v; cur.anim.push({ i, t: T + n * 0.04, auto: 1 }); });
    AU.sfx('ink');
  }
  function toggleAutoInk() {
    save.autoInk = !save.autoInk; persist(); AU.sfx('click');
    if (cur) { cur.hint = { cells: [], text: save.autoInk ? 'Auto-ink is on: tiles a margin count forces will ink themselves.' : 'Auto-ink is off: you ink every tile yourself.', t: T }; if (screen === 'play') refresh(); }
  }
  function refresh() {
    autoInk();
    const P = cur.P, cl = clueList();
    const Pa = { ...P, clues: cl };
    const prev = cur.status;
    cur.status = cl.map((c) => CG.clueStatus(Pa, c, cur.map));
    cur.status.forEach((s, k) => { if (prev[k] !== s) { if (s === 'ok' && prev.length) AU.sfx('seal'); if (s === 'broken') AU.sfx('blot'); } });
    // win?
    let full = cur.map.t.every((v) => v >= 0) && P.lms.every((L) => cur.map.lm[L] >= 0);
    if (full && CG.sameMap(cur.map, P.sol) && (!cur.waves || cur.wave >= cur.waves.length - 1)) {
      if (!cur.won) { cur.won = true; cur.wonT = T; AU.sfx('win'); if (cur.mode === 'voyage') { save.solved[P.id] = Math.min(save.solved[P.id] || 1e9, Math.round((Date.now() - cur.t0) / 1000)); delete save.maps[P.id]; } if (cur.mode === 'daily') save.solved['daily:' + cur.dayKey] = 1; if (cur.mode === 'chart') save.solved['chart:' + P.id] = 1;
        const key = cur.mode === 'voyage' ? P.id : (cur.mode === 'daily' ? 'daily:' + cur.dayKey : 'chart:' + P.id);
        if (!save.charted[key]) logCharted(key, P, cur.mode, Math.round((Date.now() - cur.t0) / 1000));
        if (cur.mode === 'daily') save.bestStreak = Math.max(save.bestStreak || 0, streak());
        persist(); }
    } else if (cur.mode === 'voyage') { save.maps[P.id] = { name: P.name, t: cur.map.t.map((v, i) => cur.locked.has(i) ? -1 : v), lm: cur.map.lm }; persist(); }
    if (cur.waves) checkWave();
    cur.nudge = cur.won ? null : stuckNudge();
  }
  // v0.5 (James, Gull Rock): when the margins can't settle anything more and the map so far is right, say what to do
  // next in plain words: usually "find a landmark first".
  function stuckNudge() {
    const P = cur.P, cl = cur.active(), Pa = { ...P, clues: cl };
    for (let i = 0; i < cur.map.t.length; i++) if (cur.map.t[i] >= 0 && cur.map.t[i] !== P.sol.t[i]) return null;
    for (const L of P.lms) if (cur.map.lm[L] >= 0 && cur.map.lm[L] !== P.sol.lm[L]) return null;
    if (CG.forcedByCounts(Pa, cl, cur.map).length) return null;
    const st = CG.stateFromMap(Pa, cur.map);
    for (let k = 0; k < 300; k++) {
      const b = CG.clone(st); let s;
      try { s = CG.step(st, Pa, 4); } catch (e) { return null; }
      if (!s) return null;
      for (const L of P.lms) if (cur.map.lm[L] < 0 && CG.lmFixed(b, L) < 0 && CG.lmFixed(st, L) >= 0) return { L, text: 'The margins can\'t settle any more tiles. Find a landmark first: where can the ' + L + ' stand? Cross out the spots that break a report. (Stuck? The Lantern shows how.)' };
      for (let i = 0; i < st.N; i++) if (cur.map.t[i] < 0 && CG.only(b.dom[i]) < 0 && CG.only(st.dom[i]) >= 0) {
        if (typeof s.src === 'number' && cl[s.src].t === 'count') break;
        return { text: s.lvl >= 3 ? 'The margins and reports can\'t settle a tile directly now. Time for a "what if?": pick a landmark spot and follow the reports.' : 'The margins are done for now. One of the reports settles the next tile.' };
      }
    }
    return null;
  }
  // chart mode: next explorer arrives once everything the current reports allow is inked correctly
  function checkWave() {
    if (cur.wave >= cur.waves.length - 1) return;
    const P = cur.P, Pa = { ...P, clues: cur.active() };
    const r = CG.solve(Pa, { maxLvl: 3 });
    for (let i = 0; i < r.st.N; i++) { const v = CG.only(r.st.dom[i]); if (v >= 0 && cur.map.t[i] !== v) return; }
    for (const L of P.lms) { const f = CG.lmFixed(r.st, L); if (f >= 0 && cur.map.lm[L] !== f) return; }
    cur.wave++; cur.shipT = T; cur.newFrom = clueList().length - cur.waves[cur.wave].filter((c) => c.t !== 'sketch').length;
    for (const c of cur.waves[cur.wave]) if (c.t === 'sketch') for (const [i, v] of c.cells) { cur.map.t[i] = v; cur.locked.add(i); }
    AU.sfx('bell'); refresh();
  }

  // ---------- layout for the play screen ----------
  function layout() {
    const P = cur.P;
    const slots = (ax) => P.pal.filter((v) => clueList().some((c) => c.t === 'count' && c.ax === ax && c.v === v)).length;
    const mr = slots('r'), mc = slots('c');
    const mw = Math.max(mr, 1) * 52, mh = Math.max(mc, 1) * 42;
    const top = 132, bot = VH - 134, left = 64, right = 800;
    const s = Math.min(92, Math.floor((bot - top - mh) / P.H), Math.floor((right - left - mw - 10) / P.W));
    const gw = s * P.W, gh = s * P.H;
    const gx = Math.round(left + mw + (right - left - mw - gw) / 2), gy = Math.round(top + mh + (bot - top - mh - gh) / 2);
    return { s, gx, gy, gw, gh };
  }
  function cellAt(x, y) { const L = layout(); const cx = Math.floor((x - L.gx) / L.s), cy = Math.floor((y - L.gy) / L.s); if (cx < 0 || cy < 0 || cx >= cur.P.W || cy >= cur.P.H) return -1; return cy * cur.P.W + cx; }

  // ---------- input ----------
  let drag = null;
  function toV(e) { return { x: (e.clientX - offX) / scale, y: (e.clientY - offY) / scale }; }
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('pointerdown', (e) => {
    AU.start(); const p = toV(e); mouse = p;
    for (let k = buttons.length - 1; k >= 0; k--) { const b = buttons[k]; if (p.x >= b.x && p.y >= b.y && p.x <= b.x + b.w && p.y <= b.y + b.h) { AU.sfx('click'); if (b.words && cur) cur.hint = null; b.fn(); return; } }
    if (screen !== 'play' || cur.won) return;
    const i = cellAt(p.x, p.y); if (i < 0) return;
    cur.hint = null; cur.pinText = null;
    const erase = e.button === 2 || cur.brush.kind === 'x';
    if (cur.brush.kind === 'l' && !erase) { placeLm(cur.brush.v, i); return; }
    if (erase) { drag = { mode: 'erase' }; pushUndo(); eraseCell(i); return; }
    pushUndo();
    if (cur.map.t[i] === cur.brush.v && !cur.locked.has(i)) { drag = { mode: 'clear' }; setCell(i, -1); }
    else { drag = { mode: 'paint' }; setCell(i, cur.brush.v); }
  });
  cv.addEventListener('pointermove', (e) => {
    const p = toV(e); mouse = p;
    if (screen !== 'play') return;
    cur.hover = cellAt(p.x, p.y);
    if (drag && cur.hover >= 0) { if (drag.mode === 'paint') setCell(cur.hover, cur.brush.v); else if (drag.mode === 'clear') setCell(cur.hover, -1); else eraseCell(cur.hover); }
  });
  addEventListener('pointerup', () => { if (drag) { drag = null; refresh(); } });
  function pushUndo() { cur.undo.push({ t: cur.map.t.slice(), lm: { ...cur.map.lm } }); if (cur.undo.length > 200) cur.undo.shift(); }
  function setCell(i, v) {
    if (cur.locked.has(i) || cur.map.t[i] === v) return;
    cur.map.t[i] = v; AU.sfx(v < 0 ? 'erase' : 'ink');
    if (v >= 0) cur.anim.push({ i, t: T });
    refreshLight();
  }
  function eraseCell(i) {
    let ch = false;
    for (const L of cur.P.lms) if (cur.map.lm[L] === i) { cur.map.lm[L] = -1; ch = true; }
    if (!ch && !cur.locked.has(i) && cur.map.t[i] >= 0) { cur.map.t[i] = -1; ch = true; }
    if (ch) { AU.sfx('erase'); refreshLight(); }
  }
  function placeLm(L, i) {
    pushUndo();
    if (cur.map.lm[L] === i) cur.map.lm[L] = -1;
    else { for (const K of cur.P.lms) if (cur.map.lm[K] === i) cur.map.lm[K] = -1; cur.map.lm[L] = i; cur.anim.push({ i, t: T, lm: 1 }); }
    AU.sfx('place'); refresh();
  }
  let lightPending = false;
  function refreshLight() { if (!drag) refresh(); else lightPending = true; }
  function undo() { const u = cur.undo.pop(); if (!u) return; cur.map.t = u.t; cur.map.lm = u.lm; cur.hint = null; AU.sfx('erase'); refresh(); }
  addEventListener('keydown', (e) => {
    AU.start();
    if (e.key === 'm' || e.key === 'M') { AU.toggleMusic(); return; }
    if (screen !== 'play') { if (e.key === 'Escape') screen = 'title'; return; }
    if (e.key === 'Escape') { screen = 'atlas'; return; }
    if ((e.key === 'z' || e.key === 'Z') || (e.key === 'u')) { undo(); return; }
    if (e.key === 'h' || e.key === 'H') { hint(); return; }
    if (e.key === 'a' || e.key === 'A') { toggleAutoInk(); return; }
    if (e.key === 'e' || e.key === 'E' || e.key === '0') { cur.brush = { kind: 'x' }; return; }
    const n = parseInt(e.key, 10);
    if (n >= 1) { const opts = brushes(); if (opts[n - 1]) cur.brush = opts[n - 1]; }
  });
  function brushes() { return cur.P.pal.map((v) => ({ kind: 't', v })).concat(cur.P.lms.map((L) => ({ kind: 'l', v: L }))); }

  // ---------- hints ----------
  function storyFrame(h) {
    const f = h.frames[h.fi], n = h.frames.length;
    h.text = '(' + (h.fi + 1) + '/' + n + ') ' + f.text;
    h.crosses = f.cross; h.old = h.frames.slice(0, h.fi).flatMap((x) => x.cross);
    h.spots = f.spots; h.spotLm = f.lm; h.marks = f.mark || []; h.cells = f.pin >= 0 ? [f.pin] : []; h.clue = f.ci; h.lvl = 2;
  }
  function hint() {
    if (cur.won) return;
    if (cur.hint && cur.hint.frames && cur.hint.fi < cur.hint.frames.length - 1) { cur.hint.hold = false; AU.sfx('hint'); cur.hint.fi++; cur.hint.ft = T; storyFrame(cur.hint); return; }
    const P = cur.P, sol = P.sol;
    AU.sfx('hint');
    for (let i = 0; i < cur.map.t.length; i++) if (cur.map.t[i] >= 0 && cur.map.t[i] !== sol.t[i]) { cur.hint = { cells: [i], text: 'This tile doesn\'t fit the reports. Try again here.', bad: true, t: T }; return; }
    for (const L of P.lms) if (cur.map.lm[L] >= 0 && cur.map.lm[L] !== sol.lm[L]) { cur.hint = { cells: [cur.map.lm[L]], text: 'The ' + L + ' isn\'t here.', bad: true, t: T }; return; }
    const Pa = { ...P, clues: cur.active() };
    const st = CG.stateFromMap(Pa, cur.map);
    // v0.4: show the first step that pins something you can ink (a tile or a landmark). Steps that only narrow
    // things down are applied silently; otherwise pressing the Lantern again repeats the same un-inkable step.
    let s = null, first = null, sawNarrow = false; const st0 = CG.clone(st);
    for (let k = 0; k < 300; k++) {
      const before = CG.clone(st); const s2 = CG.step(st, Pa, 4); if (!s2) break;
      if (s2.lvl >= 2 && (s2.gone || []).length) sawNarrow = true;
      const isRule = typeof s2.src === 'string' && s2.src.startsWith('rule:');
      if (!first && !isRule) first = { s: s2, st: CG.clone(st) };
      const pinsTile = s2.cells.some((i) => CG.only(st.dom[i]) >= 0 && cur.map.t[i] < 0);
      const pinsLm = Pa.lms.some((Lm) => CG.lmFixed(before, Lm) < 0 && CG.lmFixed(st, Lm) >= 0 && cur.map.lm[Lm] < 0);
      if (pinsTile || pinsLm) { s = s2; s.pinsLm = pinsLm; break; }
    }
    // v0.4.1: if getting there meant narrowing down where a landmark can stand, show that as a story:
    // ask, cross the spots out one reason at a time, then the last spot.
    if (s && s.pinsLm && sawNarrow) {
      const Lp = Pa.lms.find((Lm) => CG.lmFixed(st0, Lm) < 0 && CG.lmFixed(st, Lm) >= 0 && cur.map.lm[Lm] < 0);
      const frames = Lp && CG.placeStory(st0, Pa, Lp);
      if (frames) {
        const cl = clueList();
        frames.forEach((f) => { f.ci = f.clue >= 0 ? cl.indexOf(Pa.clues[f.clue]) : -1; });
        const key = Lp + ':' + frames[frames.length - 1].pin, again = cur.hint && cur.hint.story === key;
        cur.hint = { frames, fi: again ? frames.length - 1 : 0, ft: T, t: T, story: key };
        storyFrame(cur.hint); return;
      }
    }
    if (!s && first) { s = first.s; for (let i = 0; i < st.N; i++) st.dom[i] = first.st.dom[i]; for (const k in st.lm) st.lm[k] = first.st.lm[k]; }
    if (!s) { cur.hint = { cells: [], text: cur.waves ? 'Wait for the next explorer.' : 'All done?', t: T }; return; }
    const pinned = s.cells.filter((i) => CG.only(st.dom[i]) >= 0 && cur.map.t[i] < 0);
    const gone = (s.gone || []).filter(([L]) => cur.map.lm[L] < 0);
    const lmShown = s.L || (gone.length ? gone[0][0] : null);
    let spots = [];
    if (lmShown && cur.map.lm[lmShown] < 0) { spots = CG.cands(st, lmShown); if (spots.length > 10) spots = []; }
    const cl = clueList(); const ci = typeof s.src === 'number' ? cl.indexOf(Pa.clues[s.src]) : -1;
    cur.hint = { cells: pinned.length ? pinned : (gone.length ? [] : s.cells.slice(0, 12)), crosses: pinned.length ? [] : gone.slice(0, 14).map((g2) => g2[1]), spots: pinned.length ? [] : spots, spotLm: lmShown, clue: ci, text: CG.stepText(Pa, s), lvl: s.lvl, t: T };
  }

  // ---------- drawing helpers ----------
  function rr(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function text(s, x, y, size, opts) {
    opts = opts || {}; g.font = (opts.italic ? 'italic ' : '') + (opts.bold ? 'bold ' : '') + size + 'px ' + ART.SERIF;
    g.fillStyle = opts.color || ART.INK; g.textAlign = opts.align || 'left'; g.textBaseline = opts.base || 'middle';
    if (opts.spacing) { try { g.letterSpacing = opts.spacing + 'px'; } catch (e) { /* old */ } }
    g.fillText(s, x, y); if (opts.spacing) { try { g.letterSpacing = '0px'; } catch (e) { /* old */ } }
  }
  function wrap(s, maxW, size) { g.font = size + 'px ' + ART.SERIF; const words = s.split(' '), lines = []; let line = ''; for (const w of words) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; } if (line) lines.push(line); return lines; }
  function button(x, y, w, h, label, fn, opts) {
    opts = opts || {}; const hov = mouse.x >= x && mouse.y >= y && mouse.x <= x + w && mouse.y <= y + h;
    g.save(); g.shadowColor = 'rgba(60,30,10,0.3)'; g.shadowBlur = hov ? 10 : 4; g.shadowOffsetY = 2;
    rr(x, y, w, h, 8); g.fillStyle = opts.fill || (hov ? '#f6ead0' : '#efdfbd'); g.fill(); g.restore();
    rr(x, y, w, h, 8); g.strokeStyle = ART.INK; g.lineWidth = 1.5; g.stroke();
    rr(x + 4, y + 4, w - 8, h - 8, 5); g.strokeStyle = 'rgba(58,39,22,0.3)'; g.lineWidth = 1; g.stroke();
    if (opts.icon) opts.icon(x + w / 2, y + h / 2); else text(label, x + w / 2, y + h / 2 + 1, opts.size || 20, { align: 'center', bold: opts.bold });
    buttons.push({ x, y, w, h, fn });
  }
  function sheet(seed) {
    g.fillStyle = '#2f2219'; g.fillRect(-offX / scale - 10, -offY / scale - 10, VW + offX * 2 / scale + 20, VH + offY * 2 / scale + 20);
    // desk wood grain
    g.strokeStyle = 'rgba(255,220,170,0.04)'; g.lineWidth = 2; for (let k = 0; k < 40; k++) { g.beginPath(); g.moveTo(-50, k * 22); g.bezierCurveTo(400, k * 22 + 10, 900, k * 22 - 10, VW + 50, k * 22 + 4); g.stroke(); }
    g.save(); ART.deckle(g, 16, 14, VW - 32, VH - 28, seed, 7); g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = 24; g.shadowOffsetY = 6; g.fillStyle = '#e6d3a5'; g.fill(); g.restore();
    g.save(); ART.deckle(g, 16, 14, VW - 32, VH - 28, seed, 7); g.clip(); g.drawImage(ART.parchment(VW, VH, seed), 0, 0); g.restore();
  }
  function border(x, y, w, h) {
    g.strokeStyle = ART.INK; g.lineWidth = 2.2; g.strokeRect(x, y, w, h); g.lineWidth = 0.8; g.strokeRect(x + 6, y + 6, w - 12, h - 12);
    // checkered latitude band like old maps
    for (let k = 0; k < (w - 12) / 24; k++) { if (k % 2) { g.fillStyle = 'rgba(58,39,22,0.75)'; g.fillRect(x + 6 + k * 24, y + 1, 24, 4); g.fillRect(x + 6 + k * 24, y + h - 5, 24, 4); } }
    for (let k = 0; k < (h - 12) / 24; k++) { if (k % 2) { g.fillStyle = 'rgba(58,39,22,0.75)'; g.fillRect(x + 1, y + 6 + k * 24, 4, 24); g.fillRect(x + w - 5, y + 6 + k * 24, 4, 24); } }
  }
  function cartouche(cx, cy, w, title, sub) {
    g.save(); g.fillStyle = 'rgba(246,236,210,0.92)'; g.strokeStyle = ART.INK; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(cx - w / 2, cy - 26); g.lineTo(cx + w / 2, cy - 26); g.quadraticCurveTo(cx + w / 2 + 22, cy - 26, cx + w / 2 + 30, cy - 10);
    g.quadraticCurveTo(cx + w / 2 + 14, cy, cx + w / 2 + 30, cy + 10); g.quadraticCurveTo(cx + w / 2 + 22, cy + 26, cx + w / 2, cy + 26);
    g.lineTo(cx - w / 2, cy + 26); g.quadraticCurveTo(cx - w / 2 - 22, cy + 26, cx - w / 2 - 30, cy + 10); g.quadraticCurveTo(cx - w / 2 - 14, cy, cx - w / 2 - 30, cy - 10);
    g.quadraticCurveTo(cx - w / 2 - 22, cy - 26, cx - w / 2, cy - 26); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.rect(cx - w / 2 + 6, cy - 20, w - 12, 40); g.lineWidth = 0.7; g.stroke(); g.restore();
    text(title, cx, cy - (sub ? 5 : 0), 26, { align: 'center', bold: true, spacing: 2 });
    if (sub) text(sub, cx, cy + 14, 13, { align: 'center', italic: true, color: ART.INK2 });
  }
  function terrIcon(v, x, y, s) { ART.tile(g, v, x - s / 2, y - s / 2, s, 7 + v); g.strokeStyle = 'rgba(58,39,22,0.6)'; g.lineWidth = 1; g.strokeRect(x - s / 2, y - s / 2, s, s); }

  // ---------- TITLE ----------
  function drawTitle() {
    sheet(3);
    ART.rhumbLines(g, VW / 2, 330, 900, 32);
    ART.compass(g, VW / 2, 330, 150, T);
    ART.serpent(g, 230, 640, 190, T, false); ART.kraken(g, 1060, 650, 170, T); ART.ship(g, 1040, 200 + Math.sin(T) * 3, 70, T);
    text('CARTOGRAPHER', VW / 2, 545, 64, { align: 'center', bold: true, spacing: 8 });
    text('an atlas of small deductions', VW / 2, 590, 22, { align: 'center', italic: true, color: ART.INK2 });
    button(VW / 2 - 385, 640, 170, 56, 'Voyage', () => { screen = 'atlas'; AU.sfx('page'); }, { bold: true, size: 24 });
    button(VW / 2 - 195, 640, 180, 56, 'Daily Island', startDaily, { size: 22 });
    button(VW / 2 + 5, 640, 180, 56, 'Chart Mode', () => { screen = 'charts'; AU.sfx('page'); }, { size: 22 });
    button(VW / 2 + 205, 640, 170, 56, 'My Atlas', () => { screen = 'myatlas'; atlasPage = 0; AU.sfx('page'); }, { size: 22 });
    { const sk = streak(), done = !!save.solved['daily:' + todayKey()];
      text(sk ? 'streak ' + sk + (sk === 1 ? ' day' : ' days') + (done ? ' · today charted' : ' · today waits') : 'start a daily streak', VW / 2 - 105, 714, 14, { align: 'center', italic: true, color: ART.INK2 });
      if (done) ART.wax(g, VW / 2 - 25, 652, 9); }
    text('auto-ink ' + (save.autoInk ? 'on' : 'off') + '  ·  toggle with A or the Auto button while playing', 120, 735, 13, { italic: true, color: 'rgba(58,39,22,0.5)' });
    text('click anywhere to hear the sea  ·  M toggles music', VW / 2 + 130, 735, 14, { align: 'center', italic: true, color: 'rgba(58,39,22,0.55)' });
    text('v' + (window.CG_VERSION || 'dev'), VW - 40, VH - 34, 12, { align: 'right', color: 'rgba(58,39,22,0.5)' });
  }
  // ---------- ATLAS ----------
  function miniMap(P, x, y, size, solved) {
    const s = size / Math.max(P.W, P.H), ox = x - P.W * s / 2, oy = y - P.H * s / 2;
    if (solved) { for (let i = 0; i < P.W * P.H; i++) { const v = P.sol.t[i]; g.fillStyle = ['#7fa8b8', '#e3c785', '#a9bd6a', '#6d955a', '#9c7b5a'][v]; g.fillRect(ox + (i % P.W) * s, oy + ((i / P.W) | 0) * s, s + 0.5, s + 0.5); } }
    else {
      // unknown coast: a rumoured, hatched island outline (seeded, not the real shape)
      const R = GEN.rng(GEN.hashStr(P.id || P.name)); const n = 14, pts = [];
      for (let k = 0; k < n; k++) { const a = k / n * 6.283, r = size * (0.3 + R() * 0.16); pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r * 0.85]); }
      g.save(); g.beginPath(); pts.forEach((p, k) => { const q = pts[(k + 1) % n], mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2; if (!k) g.moveTo(mx, my); else g.quadraticCurveTo(p[0], p[1], mx, my); }); { const p = pts[0], q = pts[1]; g.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2); } g.closePath();
      g.fillStyle = 'rgba(214,190,140,0.45)'; g.fill(); g.setLineDash([4, 3]); g.strokeStyle = ART.INK2; g.lineWidth = 1.3; g.stroke(); g.setLineDash([]);
      g.clip(); g.strokeStyle = 'rgba(58,39,22,0.18)'; g.lineWidth = 1; for (let k = -size; k < size; k += 6) { g.beginPath(); g.moveTo(x + k, y - size); g.lineTo(x + k + size, y + size); g.stroke(); }
      g.restore();
      text('?', x, y + 2, 22, { align: 'center', italic: true, color: 'rgba(58,39,22,0.55)' });
      return;
    }
    g.strokeStyle = ART.INK; g.lineWidth = 1.2; g.strokeRect(ox, oy, P.W * s, P.H * s);
  }
  function drawAtlas() {
    sheet(5); border(40, 36, VW - 80, VH - 72);
    cartouche(VW / 2, 92, 300, 'The Voyage', 'three seas, thirty islands');
    const cols = [[90, 'Shoals of gentle reports'], [490, 'Mists where you ask "what if?"'], [890, 'Where the dragons are']];
    for (let r = 0; r < 3; r++) {
      const x0 = cols[r][0], open = regionOpen(r);
      text(REG[r], x0 + 150, 160, 26, { align: 'center', bold: true });
      text(cols[r][1], x0 + 150, 186, 14, { align: 'center', italic: true, color: ART.INK2 });
      const isl = ISL.filter((p) => p.region === r);
      const pos = (k) => [x0 + 45 + (k % 3) * 105 + (Math.floor(k / 3) % 2 ? 26 : 0), 250 + Math.floor(k / 3) * 112];
      g.save(); g.strokeStyle = 'rgba(58,39,22,0.35)'; g.lineWidth = 1.5; g.setLineDash([2, 6]); g.beginPath();
      isl.forEach((P, k) => { const [a, b] = pos(k); if (!k) g.moveTo(a, b); else { const [pa, pb] = pos(k - 1); g.quadraticCurveTo((a + pa) / 2 + 10, (b + pb) / 2 - 18, a, b); } }); g.stroke(); g.restore();
      isl.forEach((P, k) => {
        const cx = x0 + 45 + (k % 3) * 105 + (Math.floor(k / 3) % 2 ? 26 : 0), cy = 250 + Math.floor(k / 3) * 112;
        const solved = !!save.solved[P.id];
        const hov = Math.abs(mouse.x - cx) < 40 && Math.abs(mouse.y - cy) < 40;
        g.save(); if (!open) g.globalAlpha = 0.35;
        if (hov && open) { g.fillStyle = 'rgba(255,240,200,0.6)'; g.beginPath(); g.arc(cx, cy, 44, 0, 6.29); g.fill(); }
        miniMap(P, cx, cy, 56, solved);
        if (solved) ART.wax(g, cx + 28, cy + 26, 11);
        text((k + 1) + '', cx - 34, cy - 30, 13, { bold: true });
        text(P.name, cx, cy + 42, 12, { align: 'center', italic: true });
        g.restore();
        if (open) buttons.push({ x: cx - 40, y: cy - 40, w: 80, h: 90, fn: () => startIsland(P, 'voyage') });
      });
      if (!open) text('Chart 5 islands of ' + REG[r - 1] + ' to sail here', x0 + 150, 700, 14, { align: 'center', italic: true });
    }
    ART.compass(g, 1150, 700, 38, T);
    ART.serpent(g, 640, 728, 90, T, true);
    button(60, 690, 120, 44, '‹ Title', () => { screen = 'title'; });
  }
  function drawCharts() {
    sheet(9); border(40, 36, VW - 80, VH - 72);
    cartouche(VW / 2, 92, 300, 'Chart Mode', 'big islands, explorers return in turn');
    text('Ink what the first reports allow. When nothing more can be known, the next ship comes home.', VW / 2, 160, 17, { align: 'center', italic: true });
    CHARTS.forEach((P, k) => {
      const cx = 290 + k * 350, cy = 400, solved = !!save.solved['chart:' + P.id];
      miniMap(P, cx, cy, 170, solved); if (solved) ART.wax(g, cx + 80, cy + 80, 18);
      text(P.name, cx, cy + 125, 22, { align: 'center', bold: true });
      text(P.W + '×' + P.H + ' · ' + P.waves.length + ' explorers', cx, cy + 150, 14, { align: 'center', italic: true, color: ART.INK2 });
      buttons.push({ x: cx - 90, y: cy - 90, w: 180, h: 250, fn: () => startIsland(P, 'chart', { waves: P.waves.map((w) => w.map((i) => P.clues[i])) }) });
    });
    ART.ship(g, 640 + Math.sin(T * 0.3) * 200, 640, 60, T);
    button(60, 690, 120, 44, '‹ Title', () => { screen = 'title'; });
  }
  // ---------- MY ATLAS: every island you have charted ----------
  let atlasPage = 0;
  function chartedList() {
    const out = [];
    for (const key in save.solved) {
      const e = save.charted[key];
      if (e) { out.push({ key, ...e }); continue; }
      // older saves: rebuild from the island data we ship
      const P = key.startsWith('chart:') ? CHARTS.find((c) => 'chart:' + c.id === key) : (key.startsWith('daily:') ? null : islandById(key));
      if (P) out.push({ key, name: P.name, mode: key.startsWith('chart:') ? 'chart' : 'voyage', region: P.region || 0, W: P.W, H: P.H, t: P.sol.t, lm: P.sol.lm, date: '' });
    }
    const order = (e) => (e.mode === 'daily' ? 0 : 1);
    return out.sort((a, b) => order(a) - order(b) || (b.date || '').localeCompare(a.date || '') || a.key.localeCompare(b.key, undefined, { numeric: true }));
  }
  function drawMyAtlas() {
    sheet(14); border(40, 36, VW - 80, VH - 72);
    const list = chartedList(), sk = streak();
    cartouche(VW / 2, 92, 320, 'My Atlas', list.length + (list.length === 1 ? ' island' : ' islands') + ' charted');
    text('Daily streak: ' + sk + (sk === 1 ? ' day' : ' days') + '   ·   best ' + Math.max(save.bestStreak || 0, sk), VW / 2, 156, 18, { align: 'center', italic: true, color: ART.INK2 });
    // streak ribbon: the last 7 days as seals
    for (let k = 6; k >= 0; k--) {
      const key = shiftDay(todayKey(), -k), x = VW / 2 - 168 + (6 - k) * 56, y = 192, done = !!save.solved['daily:' + key];
      if (done) ART.wax(g, x, y, 13); else { g.strokeStyle = 'rgba(58,39,22,0.35)'; g.lineWidth = 1.2; g.setLineDash([3, 3]); g.beginPath(); g.arc(x, y, 12, 0, 6.29); g.stroke(); g.setLineDash([]); }
      text(['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][new Date(key + 'T12:00').getDay()], x, y + 24, 11, { align: 'center', color: ART.INK2 });
    }
    if (!list.length) text('No islands charted yet. Every island you finish is drawn here.', VW / 2, 420, 20, { align: 'center', italic: true });
    const per = 12, pages = Math.max(1, Math.ceil(list.length / per)); atlasPage = Math.min(atlasPage, pages - 1);
    list.slice(atlasPage * per, atlasPage * per + per).forEach((e, k) => {
      const cx = 190 + (k % 6) * 180, cy = 330 + Math.floor(k / 6) * 210, size = 120;
      const s = size / Math.max(e.W, e.H), ox = cx - e.W * s / 2, oy = cy - e.H * s / 2;
      g.save(); g.translate(2, 3); g.fillStyle = 'rgba(60,30,10,0.12)'; g.fillRect(ox, oy, e.W * s, e.H * s); g.restore();
      for (let i = 0; i < e.W * e.H; i++) ART.tile(g, e.t[i], ox + (i % e.W) * s, oy + ((i / e.W) | 0) * s, s + 0.5, i * 13 + e.t[i], true);
      for (let i = 0; i < e.W * e.H; i++) { const v = e.t[i]; if (v <= 0) continue; const x = i % e.W, y = (i / e.W) | 0; [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach((d, side) => { const xx = x + d[0], yy = y + d[1]; if (xx >= 0 && yy >= 0 && xx < e.W && yy < e.H && e.t[yy * e.W + xx] === 0) ART.coast(g, ox + x * s, oy + y * s, s, side); }); }
      g.strokeStyle = ART.INK; g.lineWidth = 1.5; g.strokeRect(ox, oy, e.W * s, e.H * s);
      for (const L in e.lm) { const i = e.lm[L]; if (i >= 0) ART.landmark(g, L, ox + (i % e.W + 0.5) * s, oy + (((i / e.W) | 0) + 0.5) * s, s * 0.8, T); }
      ART.wax(g, ox + e.W * s - 4, oy + e.H * s - 4, 10, e.mode === 'daily' ? '#a8281e' : (e.mode === 'chart' ? '#2f5f7a' : '#8a5a1e'));
      text(e.name, cx, oy + e.H * s + 20, 14, { align: 'center', bold: true });
      text(e.mode === 'daily' ? 'the daily island' : (e.mode === 'chart' ? 'chart mode' : REG[e.region]), cx, oy + e.H * s + 38, 12, { align: 'center', italic: true, color: ART.INK2 });
    });
    if (pages > 1) {
      text('page ' + (atlasPage + 1) + ' of ' + pages, VW / 2, 712, 14, { align: 'center', italic: true, color: ART.INK2 });
      if (atlasPage > 0) button(VW / 2 - 170, 690, 90, 40, '‹ Prev', () => { atlasPage--; AU.sfx('page'); }, { size: 16 });
      if (atlasPage < pages - 1) button(VW / 2 + 80, 690, 90, 40, 'Next ›', () => { atlasPage++; AU.sfx('page'); }, { size: 16 });
    }
    ART.compass(g, 1150, 700, 38, T);
    button(60, 690, 120, 44, '‹ Title', () => { screen = 'title'; }, {});
  }
  function startDaily() { const key = todayKey(); startIsland(dailyPuzzle(key), 'daily', { dayKey: key }); }
  function dailyPuzzle(key) {
    let P = null;
    for (let k = 0; k < 6 && !P; k++) P = GEN.generate({ W: 6, H: 6, pal: [0, 1, 2, 3, 4], lms: ['village', 'lighthouse', 'volcano', 'temple'], seed: GEN.hashStr('daily' + key) + k * 977, maxLvl: 3, minLvl: 3, reveal: 0.25, maxClues: 20, attempts: 12 });
    if (!P) P = ISL[ISL.length - 1];
    return { ...P, id: 'daily', name: 'Island of ' + key, region: 1 };
  }

  // ---------- PLAY ----------
  function clueIcons(c, x, y, s) { // draws a compact pictogram for a clue; returns width used
    const P = cur.P; const lmI = (L, xx) => { ART.landmark(g, L, xx, y, s, T); };
    if (c.t === 'rel') {
      lmI(c.a, x + s / 2);
      const parts = []; if (c.dy) parts.push((c.dy < 0 ? '↑' : '↓') + Math.abs(c.dy)); if (c.dx) parts.push((c.dx > 0 ? '→' : '←') + Math.abs(c.dx));
      text(parts.join(' '), x + s * 1.55, y, 18, { align: 'center', bold: true });
      text('of', x + s * 1.55, y + 15, 11, { align: 'center', italic: true });
      lmI(c.b, x + s * 2.6); return s * 3.1;
    }
    if (c.t === 'touch') {
      terrIcon(c.v, x + s * 0.45, y, s * 0.62); lmI(c.lm, x + s * 1.75);
      // plus-shaped touch mark between
      g.strokeStyle = c.neg ? '#a8281e' : ART.INK; g.lineWidth = 2.5; const mx = x + s * 1.08;
      if (c.neg) { g.beginPath(); g.arc(mx, y, 9, 0, 6.29); g.moveTo(mx - 6, y - 6); g.lineTo(mx + 6, y + 6); g.stroke(); }
      else { g.beginPath(); g.moveTo(mx - 7, y); g.lineTo(mx + 7, y); g.moveTo(mx, y - 7); g.lineTo(mx, y + 7); g.stroke(); }
      return s * 2.3;
    }
    if (c.t === 'walk') {
      lmI(c.lm, x + s / 2);
      const ar = { n: '↑', s: '↓', e: '→', w: '←' }[c.d];
      text(ar + ' ' + c.n, x + s * 1.35, y - 2, 19, { align: 'center', bold: true });
      g.fillStyle = ART.INK2; for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse(x + s * 1.05 + k * 11, y + 14 + (k % 2) * 3, 3, 4.5, 0, 0, 6.29); g.fill(); }
      terrIcon(0, x + s * 2.15, y, s * 0.55);
      if (!c.reach) { g.strokeStyle = '#a8281e'; g.lineWidth = 3; g.beginPath(); g.moveTo(x + s * 1.9, y - s * 0.25); g.lineTo(x + s * 2.4, y + s * 0.25); g.stroke(); }
      return s * 2.6;
    }
    if (c.t === 'path') {
      lmI(c.lm, x + s / 2);
      const ar = { n: '↑', s: '↓', e: '→', w: '←' }[c.d];
      text(ar + ' ' + c.n, x + s * 1.35, y - 2, 19, { align: 'center', bold: true });
      g.fillStyle = ART.INK2; for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse(x + s * 1.05 + k * 11, y + 14 + (k % 2) * 3, 3, 4.5, 0, 0, 6.29); g.fill(); }
      for (let k = Math.min(c.n, 3) - 1; k >= 0; k--) terrIcon(c.v, x + s * 2.15 + k * 5, y - k * 4, s * 0.55);
      return s * 2.75;
    }
    if (c.t === 'ntouch') {
      lmI(c.lm, x + s / 2);
      g.strokeStyle = ART.INK; g.lineWidth = 2.5; const mx = x + s * 1.1;
      g.beginPath(); g.moveTo(mx - 7, y); g.lineTo(mx + 7, y); g.moveTo(mx, y - 7); g.lineTo(mx, y + 7); g.stroke();
      text(String(c.n), x + s * 1.55, y + 1, 20, { align: 'center', bold: true });
      terrIcon(c.v, x + s * 2.15, y, s * 0.55);
      return s * 2.6;
    }
    if (c.t === 'zone') {
      const bx = x + 4, by = y - s * 0.4, bw = s * 0.8;
      g.strokeStyle = ART.INK; g.lineWidth = 1.5; g.strokeRect(bx, by, bw, bw);
      g.fillStyle = 'rgba(184,57,42,0.35)'; const h = bw / 2;
      if (c.z === 'n') g.fillRect(bx, by, bw, h - 2); else if (c.z === 's') g.fillRect(bx, by + h + 2, bw, h - 2); else if (c.z === 'w') g.fillRect(bx, by, h - 2, bw); else g.fillRect(bx + h + 2, by, h - 2, bw);
      lmI(c.lm, x + s * 1.55); return s * 2.1;
    }
    if (c.t === 'count') { terrIcon(c.v, x + s * 0.45, y, s * 0.62); text('× ' + c.n, x + s * 1.2, y, 22, { bold: true }); return s * 2; }
    return 0;
  }
  // ---- v0.5 skill pictures: one drawn picture per deduction step type (src/ladder.js) ----
  function stepPic(id, x, y, s) {
    const k = s / 40, ln = (w) => { g.lineWidth = w * k; g.strokeStyle = ART.INK; };
    const cross = (cx, cy, r, col) => { g.strokeStyle = col || '#a8281e'; g.lineWidth = 3 * k; g.beginPath(); g.moveTo(cx - r, cy - r); g.lineTo(cx + r, cy + r); g.moveTo(cx + r, cy - r); g.lineTo(cx - r, cy + r); g.stroke(); };
    switch (id) {
      case 'look': g.save(); ART.deckle(g, x - 15 * k, y - 15 * k, 30 * k, 30 * k, 3, 3); g.fillStyle = '#fbf3df'; g.fill(); g.restore(); terrIcon(2, x, y, 18 * k); break;
      case 'count': terrIcon(2, x - 9 * k, y, 18 * k); text('2', x + 10 * k, y + 1, 20 * k, { bold: true, align: 'center' }); break;
      case 'twoinks': terrIcon(0, x - 13 * k, y - 8 * k, 12 * k); cross(x - 13 * k, y - 8 * k, 6 * k); terrIcon(2, x - 13 * k, y + 9 * k, 12 * k); cross(x - 13 * k, y + 9 * k, 6 * k); text('→', x + 1 * k, y, 14 * k, { align: 'center', bold: true }); terrIcon(3, x + 14 * k, y, 16 * k); break;
      case 'home': terrIcon(2, x, y + 4 * k, 26 * k); ART.landmark(g, 'village', x, y - 2 * k, 26 * k, T); text('1', x + 15 * k, y - 12 * k, 13 * k, { bold: true, align: 'center' }); break;
      case 'walk': ART.landmark(g, 'village', x - 12 * k, y, 18 * k, T); g.fillStyle = ART.INK2; for (let q = 0; q < 3; q++) { g.beginPath(); g.ellipse(x + (q * 7 - 1) * k, y + (q % 2 ? 3 : -3) * k, 2.2 * k, 3.4 * k, 1.57, 0, 6.29); g.fill(); } text('→', x + 16 * k, y, 14 * k, { align: 'center', bold: true }); break;
      case 'touch': { const q = 11 * k; terrIcon(3, x, y - q, 10 * k); terrIcon(3, x, y + q, 10 * k); terrIcon(2, x - q, y, 10 * k); terrIcon(2, x + q, y, 10 * k); ART.landmark(g, 'volcano', x, y, 12 * k, T); break; }
      case 'rel': ART.landmark(g, 'temple', x - 8 * k, y - 10 * k, 15 * k, T); text('↓2', x + 9 * k, y, 13 * k, { bold: true, align: 'center' }); ART.landmark(g, 'village', x - 8 * k, y + 11 * k, 15 * k, T); break;
      case 'total': g.save(); g.fillStyle = 'rgba(110,150,170,0.5)'; g.beginPath(); g.ellipse(x, y, 19 * k, 14 * k, 0, 0, 6.29); g.fill(); g.restore(); ART.tree(g, x - 7 * k, y + 5 * k, 9 * k); ART.tree(g, x + 1 * k, y + 2 * k, 9 * k); text('×6', x + 11 * k, y - 8 * k, 11 * k, { bold: true, align: 'center' }); break;
      case 'zone': ln(1.5); g.strokeRect(x - 16 * k, y - 14 * k, 32 * k, 28 * k); g.fillStyle = 'rgba(184,57,42,0.3)'; g.fillRect(x - 16 * k, y - 14 * k, 32 * k, 13 * k); ART.landmark(g, 'treasure', x, y - 7 * k, 13 * k, T); break;
      case 'narrow': for (const [dx, dy, ok] of [[-11, -9, 0], [11, -9, 0], [-11, 9, 0], [11, 9, 1]]) { g.save(); g.globalAlpha = ok ? 1 : 0.45; ART.landmark(g, 'lighthouse', x + dx * k, y + dy * k, 13 * k, T); g.restore(); if (!ok) cross(x + dx * k, y + dy * k, 5 * k); } break;
      case 'whatif': g.save(); g.fillStyle = '#fff8e6'; g.strokeStyle = ART.INK; g.lineWidth = 1.2 * k; g.beginPath(); g.ellipse(x + 2 * k, y - 3 * k, 16 * k, 12 * k, 0, 0, 6.29); g.fill(); g.stroke(); g.beginPath(); g.arc(x - 11 * k, y + 13 * k, 2.5 * k, 0, 6.29); g.stroke(); g.restore(); ART.landmark(g, 'volcano', x + 2 * k, y - 3 * k, 14 * k, T); cross(x + 2 * k, y - 3 * k, 8 * k); break;
      case 'allroads': ln(2); g.beginPath(); g.moveTo(x - 16 * k, y - 12 * k); g.lineTo(x, y); g.moveTo(x - 16 * k, y + 12 * k); g.lineTo(x, y); g.moveTo(x - 16 * k, y); g.lineTo(x, y); g.stroke(); terrIcon(3, x + 10 * k, y, 14 * k); break;
      case 'whatiftile': g.save(); g.fillStyle = '#fff8e6'; g.strokeStyle = ART.INK; g.lineWidth = 1.2 * k; g.beginPath(); g.ellipse(x + 2 * k, y - 3 * k, 16 * k, 12 * k, 0, 0, 6.29); g.fill(); g.stroke(); g.restore(); terrIcon(4, x + 2 * k, y - 3 * k, 13 * k); cross(x + 2 * k, y - 3 * k, 7 * k); break;
    }
  }
  function skillCard(x, y, w, ids, nCards) { // a lesson's new skill: big picture, name, one plain line
    const st = LD.BY[ids[ids.length - 1]], big = nCards > 5 ? 34 : 54;
    const lines = wrap(st.line, w - big - 40, 13).slice(0, 4), h = Math.max(big + 18, 30 + lines.length * 16 + 8);
    g.save(); g.shadowColor = 'rgba(60,30,10,0.25)'; g.shadowBlur = 5; g.fillStyle = '#fff1c8'; rr(x, y, w, h, 8); g.fill(); g.restore();
    g.strokeStyle = 'rgba(200,140,20,' + (0.6 + 0.3 * Math.sin(T * 3)) + ')'; g.lineWidth = 2.5; rr(x, y, w, h, 8); g.stroke();
    g.save(); g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.arc(x + 14 + big / 2, y + h / 2, big / 2 + 4, 0, 6.29); g.fill(); g.restore();
    stepPic(st.id, x + 14 + big / 2, y + h / 2, big);
    text('New skill: ' + st.name, x + big + 30, y + 16, 15, { bold: true });
    lines.forEach((l, q) => text(l, x + big + 30, y + 34 + q * 16, 13, { italic: true }));
    buttons.push({ x, y, w, h, fn: () => { cur.pinText = st.line; }, words: st.line });
    return y + h;
  }
  function skillStrip(x, y, w) { // the skills this island needs, as small pictures; the newest one is ringed
    const ids = cur.needs.filter((t) => t !== 'look'), d = Math.min(30, (w - 60) / Math.max(1, ids.length) - 4);
    text('Skills:', x + 2, y + 15, 12, { italic: true, color: ART.INK2 });
    const newest = ids.reduce((a, t) => (LD.BY[t].rank > (a ? LD.BY[a].rank : -1) ? t : a), null);
    ids.forEach((t, n) => {
      const cx = x + 56 + n * (d + 4) + d / 2, cy = y + 15;
      g.save(); g.fillStyle = t === newest ? '#ffe9b0' : 'rgba(255,250,235,0.8)'; g.beginPath(); g.arc(cx, cy, d / 2 + 1, 0, 6.29); g.fill();
      g.strokeStyle = t === newest ? 'rgba(200,140,20,0.9)' : 'rgba(58,39,22,0.35)'; g.lineWidth = t === newest ? 2 : 1; g.stroke(); g.restore();
      stepPic(t, cx, cy, d * 0.9);
      const st = LD.BY[t], words = st.name + ': ' + st.line;
      buttons.push({ x: cx - d / 2, y: cy - d / 2, w: d, h: d, fn: () => { cur.pinText = words; }, words });
    });
    return y + 30;
  }
  function drawPlay() {
    const P = cur.P, L = layout(), cl = clueList();
    sheet((P.seed || 11) % 50);
    // map frame
    const fx = 44, fy = 36, fw = 770, fh = VH - 72;
    border(fx, fy, fw, fh);
    ART.rhumbLines(g, L.gx + L.gw / 2, L.gy + L.gh / 2, 700, 24);
    cartouche(fx + fw / 2, 82, Math.max(220, P.name.length * 15), P.name, cur.mode === 'daily' ? 'the daily island' : (cur.mode === 'chart' ? 'chart mode · explorer ' + (cur.wave + 1) + ' of ' + cur.waves.length : (P.tutorial ? 'a lesson' : REG[P.region] + ' · ' + P.W + '×' + P.H)));
    // decorations
    ART.compass(g, fx + 58, fy + 62, 34, T);
    ART.kraken(g, fx + fw - 70, fy + 84, 62, T);
    { const nb = P.pal.length + P.lms.length + 1; if (L.gx + L.gw / 2 + nb * 31 < fx + fw - 200) ART.serpent(g, fx + fw - 110, VH - 72, 100, T, false); }
    // hovered clue scope
    const hc = cur.hoverClue >= 0 ? cl[cur.hoverClue] : (cur.hint && cur.hint.clue >= 0 ? cl[cur.hint.clue] : null);
    const scope = new Set(hc ? CG.clueScope({ ...P, clues: cl }, hc, cur.map) : []);
    // grid
    const s = L.s;
    g.save(); g.fillStyle = 'rgba(250,242,220,0.35)'; g.fillRect(L.gx, L.gy, L.gw, L.gh); g.restore();
    for (let i = 0; i < P.W * P.H; i++) {
      const x = L.gx + (i % P.W) * s, y = L.gy + ((i / P.W) | 0) * s, v = cur.map.t[i];
      if (cur.locked.has(i)) { g.save(); ART.deckle(g, x + 1, y + 1, s - 2, s - 2, i, 3); g.fillStyle = 'rgba(255,250,235,0.55)'; g.fill(); g.restore(); }
      if (v >= 0) {
        const a = cur.anim.find((q) => q.i === i && !q.lm); let k = 1; if (a && !reduced()) k = Math.min(1, (T - a.t) / 0.18);
        g.save(); g.globalAlpha = k; const ss = s * (0.85 + 0.15 * k); ART.tile(g, v, x + (s - ss) / 2, y + (s - ss) / 2, ss, i * 13 + v, cur.won); g.restore();
      }
    }
    // ink splash on fresh strokes
    if (!reduced()) for (const a of cur.anim) {
      const age = T - a.t; if (age > 0.45 || age < 0 || a.auto) continue;
      const i = a.i, cx0 = L.gx + (i % P.W + 0.5) * s, cy0 = L.gy + (((i / P.W) | 0) + 0.5) * s;
      g.save(); g.fillStyle = 'rgba(58,39,22,' + (0.5 * (1 - age / 0.45)) + ')';
      for (let k = 0; k < 7; k++) { const ang = (i * 2.399 + k * 0.9) % 6.283, d = s * (0.3 + age * 1.1) * (0.7 + ((i * 7 + k * 13) % 10) / 25); g.beginPath(); g.arc(cx0 + Math.cos(ang) * d, cy0 + Math.sin(ang) * d, (a.lm ? 3 : 2.2) * (1 - age / 0.5), 0, 6.29); g.fill(); }
      g.restore();
    }
    // coast lines
    for (let i = 0; i < P.W * P.H; i++) {
      const v = cur.map.t[i]; if (v <= 0) continue; const [cx, cy] = [i % P.W, (i / P.W) | 0];
      [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach((d, side) => { const j = CG.at({ W: P.W, H: P.H }, cx + d[0], cy + d[1]); if (j >= 0 && cur.map.t[j] === 0) ART.coast(g, L.gx + cx * s, L.gy + cy * s, s, side); });
    }
    // pencil grid
    g.strokeStyle = 'rgba(58,39,22,0.22)'; g.lineWidth = 1;
    for (let x = 0; x <= P.W; x++) { g.beginPath(); g.moveTo(L.gx + x * s, L.gy); g.lineTo(L.gx + x * s, L.gy + L.gh); g.stroke(); }
    for (let y = 0; y <= P.H; y++) { g.beginPath(); g.moveTo(L.gx, L.gy + y * s); g.lineTo(L.gx + L.gw, L.gy + y * s); g.stroke(); }
    g.strokeStyle = ART.INK; g.lineWidth = 2; g.strokeRect(L.gx, L.gy, L.gw, L.gh);
    // landmarks
    for (const Lm of P.lms) {
      const i = cur.map.lm[Lm]; if (i < 0) continue;
      const x = L.gx + (i % P.W + 0.5) * s, y = L.gy + (((i / P.W) | 0) + 0.5) * s;
      const a = cur.anim.find((q) => q.i === i && q.lm); let k = 1; if (a && !reduced()) k = Math.min(1, (T - a.t) / 0.25);
      ART.landmark(g, Lm, x, y - (1 - k) * 20, s * 0.78, T);
      const tv = cur.map.t[i];
      const wrongHome = tv >= 0 && !(CG.HOME[Lm] & CG.bit(tv));
      if (wrongHome) { g.strokeStyle = '#b8281e'; g.lineWidth = 3; g.beginPath(); g.arc(x, y, s * 0.42, 0, 6.29); g.stroke(); }
    }
    // highlights
    const pulse = 0.55 + 0.35 * Math.sin(T * 5);
    if (scope.size) { g.strokeStyle = 'rgba(200,140,20,' + pulse + ')'; g.lineWidth = 4; for (const i of scope) g.strokeRect(L.gx + (i % P.W) * s + 3, L.gy + ((i / P.W) | 0) * s + 3, s - 6, s - 6); }
    if (cur.hint) { g.strokeStyle = cur.hint.bad ? 'rgba(184,40,30,' + pulse + ')' : 'rgba(60,120,200,' + pulse + ')'; g.lineWidth = 4; for (const i of cur.hint.cells) { g.beginPath(); g.arc(L.gx + (i % P.W + 0.5) * s, L.gy + (((i / P.W) | 0) + 0.5) * s, s * 0.44, 0, 6.29); g.stroke(); }
      if (cur.hint.frames && !cur.hint.hold && cur.hint.fi < cur.hint.frames.length - 1 && T - cur.hint.ft > 3.6) { cur.hint.fi++; cur.hint.ft = T; storyFrame(cur.hint); }
      g.strokeStyle = 'rgba(214,120,20,' + (0.55 + 0.4 * pulse) + ')'; g.lineWidth = 3; for (const i of cur.hint.marks || []) { rr(L.gx + (i % P.W) * s + 4, L.gy + ((i / P.W) | 0) * s + 4, s - 8, s - 8, 6); g.stroke(); }
      g.strokeStyle = 'rgba(168,40,30,0.3)'; g.lineWidth = 2; for (const i of cur.hint.old || []) { const x = L.gx + (i % P.W + 0.5) * s, y = L.gy + (((i / P.W) | 0) + 0.5) * s, r = s * 0.16; g.beginPath(); g.moveTo(x - r, y - r); g.lineTo(x + r, y + r); g.moveTo(x + r, y - r); g.lineTo(x - r, y + r); g.stroke(); }
      g.strokeStyle = 'rgba(168,40,30,0.75)'; g.lineWidth = 3; for (const i of cur.hint.crosses || []) { const x = L.gx + (i % P.W + 0.5) * s, y = L.gy + (((i / P.W) | 0) + 0.5) * s, r = s * 0.2; g.beginPath(); g.moveTo(x - r, y - r); g.lineTo(x + r, y + r); g.moveTo(x + r, y - r); g.lineTo(x - r, y + r); g.stroke(); }
      for (const i of cur.hint.spots || []) { const x = L.gx + (i % P.W + 0.5) * s, y = L.gy + (((i / P.W) | 0) + 0.5) * s; if ((cur.hint.spots || []).length <= 10) { g.save(); g.globalAlpha = 0.35 + 0.2 * pulse; ART.landmark(g, cur.hint.spotLm, x, y, s * 0.5, T); g.restore(); } g.strokeStyle = 'rgba(60,120,200,' + pulse + ')'; g.lineWidth = 2; g.setLineDash([4, 4]); g.beginPath(); g.arc(x, y, s * 0.36, 0, 6.29); g.stroke(); g.setLineDash([]); } }
    if (cur.hover >= 0 && !cur.won) { const i = cur.hover; g.strokeStyle = 'rgba(58,39,22,0.6)'; g.lineWidth = 2; g.setLineDash([5, 4]); g.strokeRect(L.gx + (i % P.W) * s + 2, L.gy + ((i / P.W) | 0) * s + 2, s - 4, s - 4); g.setLineDash([]); }
    // margin counts: fixed terrain slots per side; a slot nobody counted shows a faint "?"
    const VM = visModel();
    const cueIdx = (ax, k, v) => cl.findIndex((c) => c.t === 'count' && c.ax === ax && c.k === k && c.v === v);
    cur.rendered = { margins: { r: { slots: VM.margins.r.slots, lines: [] }, c: { slots: VM.margins.c.slots, lines: [] } }, cards: [], legend: [], sketch: [...cur.locked].map((i) => [i, cur.map.t[i]]) };
    for (const ax of ['r', 'c']) {
      const M = VM.margins[ax], S = M.slots.length;
      M.lines.forEach((line, k) => {
        const rl = []; cur.rendered.margins[ax].lines.push(rl);
        const cells = ax === 'r' ? [...Array(P.W).keys()].map((x) => k * P.W + x) : [...Array(P.H).keys()].map((y) => y * P.W + k);
        const allSketched = cells.every((i) => cur.locked.has(i));
        line.forEach((n, j) => {
          const v = M.slots[j];
          let x, y;
          if (ax === 'r') { x = L.gx - 30 - (S - 1 - j) * 52; y = L.gy + (k + 0.5) * s; } else { x = L.gx + (k + 0.5) * s; y = L.gy - 24 - (S - 1 - j) * 42; }
          const words = CG.marginWords(ax, k, v, n);
          if (n === null) {
            rl.push(null);
            // v0.5 (James: "every constraint must be clear"): an uncounted slot always shows a faded icon and a
            // dotted "?" chip, so a gap can never be read as 0. Pointing at it lights the row and explains it.
            const hv = Math.abs(mouse.x - x) < 24 && Math.abs(mouse.y - y) < 20;
            if (!allSketched) {
              g.save(); g.globalAlpha = hv ? 0.55 : 0.2; terrIcon(v, x - 11, y, 16); g.restore();
              g.save(); g.setLineDash([2, 3]); g.strokeStyle = 'rgba(58,39,22,' + (hv ? 0.7 : 0.35) + ')'; g.lineWidth = 1.2; g.beginPath(); g.arc(x + 11, y, 9, 0, 6.29); g.stroke(); g.restore();
              text('?', x + 11, y + 1, 13, { align: 'center', italic: true, color: 'rgba(58,39,22,' + (hv ? 0.85 : 0.45) + ')' });
              if (hv) { g.save(); g.strokeStyle = 'rgba(120,90,60,0.5)'; g.lineWidth = 3; g.setLineDash([6, 5]); const c0 = cells[0], c1 = cells[cells.length - 1]; g.strokeRect(L.gx + (c0 % P.W) * s + 2, L.gy + ((c0 / P.W) | 0) * s + 2, ((c1 % P.W) - (c0 % P.W) + 1) * s - 4, (((c1 / P.W) | 0) - ((c0 / P.W) | 0) + 1) * s - 4); g.restore(); }
            }
            buttons.push({ x: x - 24, y: y - 20, w: 48, h: 40, fn: () => { cur.pinText = words; }, words });
            return;
          }
          rl.push(n);
          const ci = cueIdx(ax, k, v), st = cur.status[ci], isNew = cur.newFrom !== undefined && ci >= cur.newFrom && T - cur.shipT < 4;
          g.save(); if (st === 'ok') g.globalAlpha = 0.38;
          if (isNew) { g.fillStyle = 'rgba(255,215,120,0.6)'; g.beginPath(); g.arc(x, y, 24, 0, 6.29); g.fill(); }
          if (ci === cur.hoverClue || (cur.hint && cur.hint.clue === ci)) { g.fillStyle = 'rgba(255,215,120,0.7)'; g.beginPath(); g.arc(x, y, 24, 0, 6.29); g.fill(); }
          terrIcon(v, x - 11, y, 22);
          text(String(n), x + 12, y + 1, 22, { bold: true, align: 'center', color: st === 'broken' ? '#b8281e' : ART.INK });
          g.restore();
          buttons.push({ x: x - 24, y: y - 20, w: 48, h: 40, fn: () => { cur.pinText = words; }, clue: ci, words });
        });
      });
    }
    // palette
    const opts = cur.won ? [] : brushes().concat([{ kind: 'x' }]);
    cur.rendered.pal = opts.filter((b) => b.kind === 't').map((b) => b.v);
    const pw = 62, px0 = L.gx + L.gw / 2 - opts.length * pw / 2, py = VH - 92;
    opts.forEach((b, k) => {
      const x = px0 + k * pw + pw / 2, y = py, sel = cur.brush.kind === b.kind && cur.brush.v === b.v;
      g.save(); g.fillStyle = sel ? 'rgba(255,236,190,0.95)' : 'rgba(246,236,210,0.7)'; g.beginPath(); g.arc(x, y, 26, 0, 6.29); g.fill();
      g.strokeStyle = ART.INK; g.lineWidth = sel ? 3 : 1.2; g.stroke(); g.restore();
      if (b.kind === 't') terrIcon(b.v, x, y, 32); else if (b.kind === 'l') ART.landmark(g, b.v, x, y, 40, T);
      else { g.strokeStyle = ART.INK; g.lineWidth = 2; g.save(); g.translate(x, y); g.rotate(-0.6); rr(-14, -8, 28, 16, 3); g.fillStyle = '#e8b4a0'; g.fill(); g.stroke(); g.restore(); }
      if (b.kind === 'l' && cur.map.lm[b.v] >= 0) ART.wax(g, x + 18, y - 18, 6, '#3a6e3a');
      text(String(k + 1 > 9 ? 'E' : (b.kind === 'x' ? 'E' : k + 1)), x, y + 36, 11, { align: 'center', color: ART.INK2 });
      buttons.push({ x: x - 28, y: y - 28, w: 56, h: 56, fn: () => { cur.brush = b; } });
    });
    // ---- journal ----
    const jx = 838, jy = 36, jw = VW - 44 - jx, jh = VH - 72;
    g.save(); g.fillStyle = 'rgba(250,242,222,0.55)'; g.fillRect(jx, jy, jw, jh); g.restore(); border(jx, jy, jw, jh);
    text('Explorers\' Reports', jx + jw / 2, jy + 70, 22, { align: 'center', bold: true, italic: true });
    // tool buttons
    const bx = jx + 18; const by = jy + 18;
    button(bx, by, 80, 34, '‹ Atlas', () => { screen = cur.mode === 'chart' ? 'charts' : (cur.mode === 'daily' ? 'title' : 'atlas'); AU.sfx('page'); }, { size: 15 });
    button(bx + 88, by, 70, 34, 'Undo', undo, { size: 15 });
    button(bx + 166, by, 76, 34, 'Lantern', hint, { size: 15, fill: cur.hint ? '#ffe6a0' : null });
    button(bx + 302, by, 62, 34, 'Auto', toggleAutoInk, { size: 15, fill: save.autoInk ? '#ffe6a0' : null });
    button(bx + 250, by, 44, 34, '', () => AU.toggleMusic(), { icon: (x, y) => { text(AU.musicOn() ? '♪' : '♪̸', x, y + 1, 20, { align: 'center' }); } });
    // report cards (island totals live on the island card below)
    const cards = cl.map((c, k) => [c, k]).filter(([c]) => c.t !== 'count');
    // v0.5: skills. A lesson shows its new skill as a big picture card; other islands show the skills they need as badges.
    let top = jy + 100;
    if (cur.newSkill && cur.newSkill.length && !cur.won) top = skillCard(jx + 14, jy + 88, jw - 28, cur.newSkill, cards.length) + 8;
    else if (cur.needs && cur.needs.length && cur.mode !== 'chart') top = skillStrip(jx + 14, jy + 86, jw - 28) + 6;
    // the island card: everything this island has, with the rules the map must keep
    const items = P.lms.map((Lm) => ({ lm: Lm })).concat(cl.map((c, k) => [c, k]).filter(([c]) => c.t === 'count' && c.ax === 'a').map(([c, k]) => ({ tot: c, k })));
    const perRow = 5, iRows = Math.ceil(items.length / perRow);
    const legendH = 30 + iRows * 34 + (P.lms.length ? 18 : 0) + 22;
    const readH = 58, legendTop = jy + jh - 14 - readH - legendH - 8;
    const twoCol = cards.length > 9, rows = twoCol ? Math.ceil(cards.length / 2) : cards.length;
    const ch = Math.max(40, Math.min(62, Math.floor((legendTop - top - 6) / Math.max(1, rows))));
    let cy = top;
    cards.forEach(([c, k], n) => {
      const st = cur.status[k], isNew = cur.newFrom !== undefined && k >= cur.newFrom && T - cur.shipT < 4;
      const slide = isNew && !reduced() ? Math.max(0, 1 - (T - cur.shipT) / 0.6) * 300 : 0;
      const w = twoCol ? (jw - 34) / 2 : jw - 28;
      const x = jx + 14 + slide + (twoCol ? (n % 2) * (w + 6) : 0), y0 = top + (twoCol ? Math.floor(n / 2) : n) * ch;
      cy = y0 + ch;
      const hov = mouse.x >= x && mouse.x <= x + w && mouse.y >= y0 && mouse.y <= y0 + ch - 6;
      g.save(); g.shadowColor = 'rgba(60,30,10,0.25)'; g.shadowBlur = 4; g.shadowOffsetY = 1;
      g.fillStyle = (hov || (cur.hint && cur.hint.clue === k)) ? '#fff3d0' : (isNew ? '#fbe8b8' : '#f4e7c8'); rr(x, y0, w, ch - 6, 6); g.fill(); g.restore();
      g.strokeStyle = 'rgba(58,39,22,0.45)'; g.lineWidth = 1; rr(x, y0, w, ch - 6, 6); g.stroke();
      g.save(); if (st === 'ok') g.globalAlpha = 0.5;
      const words = CG.clueText({ ...P, clues: cl }, c);
      const iw = clueIcons(c, x + 8, y0 + (ch - 6) / 2, Math.min(twoCol ? 34 : 44, ch - 18));
      if (!twoCol) {
        const lines = wrap(words, w - iw - 46, 13);
        lines.slice(0, 3).forEach((ln, q) => text(ln, x + iw + 16, y0 + (ch - 6) / 2 + (q - (Math.min(3, lines.length) - 1) / 2) * 15, 13, { color: st === 'broken' ? '#a8281e' : ART.INK }));
      }
      g.restore();
      if (st === 'ok') ART.wax(g, x + w - 16, y0 + (ch - 6) / 2, 10); else if (st === 'broken') ART.blot(g, x + w - 16, y0 + (ch - 6) / 2, 8);
      cur.rendered.cards.push(c);
      buttons.push({ x, y: y0, w, h: ch - 6, fn: () => { cur.pinText = words; }, clue: k, words });
    });
    if (!cards.length) {
      const msg0 = cur.waves ? 'The first explorer only sketched a little coast and counted a few rows. Ink what you can be sure of. When nothing more is certain, the next ship comes home.' : (P.tutorial ? (P.lms.length ? 'No explorer reports here. The margins and the island card below tell you everything.' : 'No explorer reports on this one. The margins tell you everything.') : '');
      wrap(msg0, jw - 70, 17).forEach((ln, q) => text(ln, jx + jw / 2, Math.max(jy + 180, top + 30) + q * 24, 17, { align: 'center', italic: true, color: ART.INK2 }));
    }
    { // ---- the island card ----
      const lx = jx + 12, lw = jw - 24, glow = P.teachCard && !cur.won ? 0.5 + 0.4 * Math.sin(T * 3) : 0;
      g.save(); g.fillStyle = 'rgba(255,250,235,0.7)'; rr(lx, legendTop, lw, legendH, 8); g.fill();
      g.strokeStyle = glow ? 'rgba(200,140,20,' + glow + ')' : 'rgba(58,39,22,0.45)'; g.lineWidth = glow ? 4 : 1.2; g.stroke(); g.restore();
      let ry = legendTop + 14;
      text(items.length ? 'This island has' : 'How the margins work', jx + jw / 2, ry, 14, { align: 'center', italic: true, bold: true, color: ART.INK2 }); ry += 24;
      const cw = lw / Math.min(perRow, Math.max(1, items.length));
      items.forEach((it, n) => {
        const row = Math.floor(n / perRow), inRow = Math.min(perRow, items.length - row * perRow), cw2 = lw / inRow;
        const x = lx + cw2 * ((n % perRow) + 0.5), y = ry + row * 34 + 2;
        if (it.lm) {
          const z = items.length <= 3 ? 1.3 : 1;
          ART.landmark(g, it.lm, x - 20 * z, y, 28 * z, T); text('1', x - 2 * z, y + 1, 15 * z, { bold: true, align: 'center' });
          text(it.lm === 'lighthouse' ? 'by' : 'on', x + 12 * z, y + 1, 11 * z, { align: 'center', italic: true });
          terrIcon(it.lm === 'lighthouse' ? 0 : CG.only(CG.HOME[it.lm]), x + 28 * z, y, 17 * z);
          cur.rendered.legend.push({ L: it.lm, n: 1, home: it.lm === 'lighthouse' ? 'by-sea' : CG.only(CG.HOME[it.lm]) });
          buttons.push({ x: x - 34, y: y - 16, w: 70, h: 32, fn: () => { cur.pinText = lmWords(it.lm); }, words: lmWords(it.lm) });
        } else {
          const st = cur.status[it.k];
          g.save(); if (st === 'ok') g.globalAlpha = 0.45;
          terrIcon(it.tot.v, x - 14, y, 20); text('× ' + it.tot.n, x + 12, y + 1, 17, { bold: true, align: 'center', color: st === 'broken' ? '#b8281e' : ART.INK });
          g.restore();
          const words = CG.clueText({ ...P, clues: cl }, it.tot);
          cur.rendered.cards.push(it.tot);
          buttons.push({ x: x - 30, y: y - 16, w: 60, h: 32, fn: () => { cur.pinText = words; }, clue: it.k, words });
        }
      });
      ry += iRows * 34;
      if (P.lms.length) { text('Each landmark once, one per tile. Only tiles on the map count.', jx + jw / 2, ry - 4, 12, { align: 'center', italic: true, color: ART.INK2 }); ry += 18; }
      // margin key, one centred line
      const keyV = VM.margins.r.slots[0] !== undefined ? VM.margins.r.slots[0] : (VM.margins.c.slots[0] !== undefined ? VM.margins.c.slots[0] : 3);
      const parts = [['i', keyV], ['t', '2', 15, true], ['t', ' = exactly 2 in that row or column   ·  ', 12], ['g'], ['t', ' = nobody counted', 12]];
      const wOf = (q) => { if (q[0] === 'i') return 20; if (q[0] === 'g') return 26; g.font = (q[3] ? 'bold ' : 'italic ') + q[2] + 'px ' + ART.SERIF; return g.measureText(q[1]).width + 4; };
      let kx = jx + jw / 2 - parts.reduce((t, q) => t + wOf(q), 0) / 2;
      for (const q of parts) { const w = wOf(q);
        if (q[0] === 'i') terrIcon(q[1], kx + 8, ry, 16);
        else if (q[0] === 'g') { g.save(); g.setLineDash([2, 3]); g.strokeStyle = 'rgba(58,39,22,0.45)'; g.lineWidth = 1.2; g.beginPath(); g.arc(kx + 13, ry, 8, 0, 6.29); g.stroke(); g.restore(); text('?', kx + 13, ry + 1, 12, { italic: true, align: 'center', color: 'rgba(58,39,22,0.6)' }); }
        else text(q[1], kx + 2, ry + 1, q[2], { bold: q[3], italic: !q[3] });
        kx += w; }
    }
    // reading line: hint, then whatever you point at or tap, then the lesson tip
    const hovWords = (() => { for (let k2 = buttons.length - 1; k2 >= 0; k2--) { const b = buttons[k2]; if (b.words && mouse.x >= b.x && mouse.x <= b.x + b.w && mouse.y >= b.y && mouse.y <= b.y + b.h) return b.words; } return null; })();
    const msg = cur.hint ? cur.hint.text : (hovWords || cur.pinText || (P.teach && !cur.won ? P.teach : (cur.nudge ? cur.nudge.text : (twoCol && !cur.won ? 'Point at or tap a report to read it.' : null))));
    if (msg) {
      const lines = wrap(msg, jw - 40, 15).slice(0, 3), hy = jy + jh - 14 - readH / 2 - (lines.length - 1) * 9;
      g.save(); g.fillStyle = cur.hint ? 'rgba(255,236,180,0.9)' : 'rgba(255,250,235,0.85)'; rr(jx + 12, jy + jh - 14 - readH, jw - 24, readH, 6); g.fill(); g.restore();
      lines.forEach((ln, q) => text(ln, jx + jw / 2, hy + q * 18, 15, { align: 'center', italic: true }));
    }
    // hover detection for clues
    cur.hoverClue = -1; for (const b of buttons) if (b.clue !== undefined && mouse.x >= b.x && mouse.x <= b.x + b.w && mouse.y >= b.y && mouse.y <= b.y + b.h) cur.hoverClue = b.clue;
    // chart ship arrival
    if (cur.waves && T - cur.shipT < 4) { const k = (T - cur.shipT) / 4; ART.ship(g, fx + fw + 20 - k * (fw - 60), 140 + Math.sin(k * 6) * 5, 60, T); text('An explorer returns!', fx + fw / 2, 140, 22, { align: 'center', italic: true, bold: true, color: 'rgba(58,39,22,' + Math.max(0, 1 - k) + ')' }); }
    // win
    if (cur.won) {
      const k = Math.min(1, (T - cur.wonT) / 0.8);
      g.save(); g.globalAlpha = k;
      ART.wax(g, L.gx + L.gw - 10, L.gy + L.gh - 10, 30 + (1 - k) * 30);
      g.fillStyle = 'rgba(246,236,210,0.94)'; rr(fx + fw / 2 - 210, VH - 150, 420, 92, 10); g.fill(); g.strokeStyle = ART.INK; g.lineWidth = 1.5; g.stroke();
      const secs = Math.round((Date.now() - cur.t0) / 1000);
      text('Charted!', fx + fw / 2 - 90, VH - 118, 30, { align: 'center', bold: true, italic: true });
      text(Math.floor(secs / 60) + 'm ' + (secs % 60) + 's' + (cur.mode === 'daily' ? '  ·  streak ' + streak() : ''), fx + fw / 2 - 90, VH - 84, 15, { align: 'center', italic: true, color: ART.INK2 });
      g.restore();
      if (k >= 1) {
        const nxt = nextIsland();
        if (nxt) button(fx + fw / 2 + 10, VH - 134, 180, 58, 'Next island ›', () => startIsland(nxt, 'voyage'), { bold: true, size: 20 });
        else if (cur.mode === 'daily') button(fx + fw / 2 + 10, VH - 134, 180, 58, 'My Atlas', () => { screen = 'myatlas'; atlasPage = 0; }, { size: 20 });
        else button(fx + fw / 2 + 10, VH - 134, 180, 58, 'To the atlas', () => { screen = cur.mode === 'chart' ? 'charts' : 'atlas'; }, { size: 20 });
      }
    }
  }
  function nextIsland() { if (cur.mode !== 'voyage') return null; const k = ISL.indexOf(cur.P); const n = ISL[k + 1]; return n && regionOpen(n.region) ? n : null; }

  // ---------- loop ----------
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; T += dt;
    if (lightPending && !drag) { lightPending = false; refresh(); }
    g.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offX, dpr * offY);
    buttons = [];
    if (screen === 'title') drawTitle(); else if (screen === 'atlas') drawAtlas(); else if (screen === 'charts') drawCharts(); else if (screen === 'myatlas') drawMyAtlas(); else if (screen === 'play') drawPlay();
    if (cur) cur.anim = cur.anim.filter((a) => T - a.t < 1);
    requestAnimationFrame(frame);
  }
  // ---------- test hooks (?screen=, ?island=, ?fill=, ?solve=1, ?hint=1, ?chart=, ?daily=1) ----------
  function boot() {
    if (Q.get('autoink')) save.autoInk = Q.get('autoink') === '1';
    if (Q.get('demosave')) { // screenshot hook: a few charted islands and a 4-day daily streak (not persisted)
      ISL.slice(0, 9).concat(ISL.slice(16, 19)).forEach((P) => { save.solved[P.id] = 300; logCharted(P.id, P, 'voyage', 300); });
      for (let k = 0; k < 4; k++) { const key = shiftDay(todayKey(), -k - (Q.get('daily') ? 1 : 0)); const P = dailyPuzzle(key); save.solved['daily:' + key] = 1; logCharted('daily:' + key, P, 'daily', 400); save.charted['daily:' + key].date = key; }
      save.solved['chart:' + CHARTS[0].id] = 1; logCharted('chart:' + CHARTS[0].id, CHARTS[0], 'chart', 900);
    }
    if (Q.get('screen')) screen = Q.get('screen');
    const id = Q.get('island'), ch = Q.get('chart');
    if (id && islandById(id)) startIsland(islandById(id), 'voyage');
    if (ch && CHARTS[+ch]) { const P = CHARTS[+ch]; startIsland(P, 'chart', { waves: P.waves.map((w) => w.map((i) => P.clues[i])) }); }
    if (Q.get('daily')) startDaily();
    if (cur && Q.get('fill')) { const f = +Q.get('fill'); const N = cur.P.W * cur.P.H; for (let i = 0; i < N * f; i++) if (!cur.locked.has(i)) cur.map.t[i] = cur.P.sol.t[i]; refresh(); }
    if (cur && Q.get('wrong')) { const i = [...Array(cur.P.W * cur.P.H).keys()].find((k) => !cur.locked.has(k)); cur.map.t[i] = (cur.P.sol.t[i] + 1) % 5; refresh(); }
    if (cur && Q.get('solve')) { cur.map.t = cur.P.sol.t.slice(); for (const L of cur.P.lms) cur.map.lm[L] = cur.P.sol.lm[L]; if (cur.waves) cur.wave = cur.waves.length - 1; refresh(); }
    if (cur && Q.get('lms')) { for (const L of cur.P.lms) cur.map.lm[L] = cur.P.sol.lm[L]; refresh(); }
    if (cur && Q.get('ink')) { for (const part of Q.get('ink').split(';')) { const [a, b] = part.split(':'); if (b === 'col') { for (let y = 0; y < cur.P.H; y++) { const i = y * cur.P.W + (+a); if (!cur.locked.has(i)) cur.map.t[i] = cur.P.sol.t[i]; } } } refresh(); }
    if (cur && Q.get('counts')) { for (let k = 0; k < 50; k++) { const f = CG.forcedByCounts(cur.P, clueList(), cur.map); if (!f.length) break; for (const [i, v] of f) cur.map.t[i] = v; } refresh(); }
    if (cur && Q.get('hint')) hint();
    if (cur && cur.hint && cur.hint.frames && Q.get('frame')) { cur.hint.fi = Math.min(+Q.get('frame'), cur.hint.frames.length - 1); cur.hint.hold = true; storyFrame(cur.hint); }
    if (cur && Q.get('pin')) { const [ax, k, v] = Q.get('pin').split(','); cur.pinText = CG.marginWords(ax, +k, +v, null); }
    if (Q.get('mouse')) { const [mx, my] = Q.get('mouse').split(',').map(Number); mouse = { x: mx, y: my }; }
    window.__cg = { get cur() { return cur; }, hint, refresh, setScreen: (s) => { screen = s; } };
    requestAnimationFrame(frame);
  }
  boot();
})();
