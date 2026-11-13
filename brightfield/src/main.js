// BRIGHTFIELD browser front end: rendering, input, guidance, finale.
(function () {
  'use strict';
  const B = window.BF, ART = window.ART, AU = window.AUDIO, TECHS = window.TECHS;
  const { mix, shade, circle, ell, glowDot, TAU } = ART;
  const Q = new URLSearchParams(location.search);
  const cv = document.getElementById('c'), g = cv.getContext('2d');
  const PIXEL_MODE = Q.get('art') === 'pixel' && window.PIXEL;
  const SQ = PIXEL_MODE ? window.PIXEL.SQ : 0.64, SQ3 = Math.sqrt(3);
  const SAVE = 'brightfield.v1.save', BEST = 'brightfield.v1.best', SEEN = 'brightfield.v1.seen';
  let W = 0, H = 0, DPR = 1;
  let s = null; // game state
  const V = { // view state (UI only, never touches rules)
    t: 0, u: 30, uT: 30, cx: 0, cy: 0, smog: 0.55, vivid: 0, sel: -1, hover: null, prev: null,
    anim: {}, flips: {}, parts: [], floats: [], ripples: [], screen: 'title', fork: null, finale: null, idle: 0,
    seen: {}, rowFlash: {}, toast: null, goalPop: 0, goalStage: null, eve: 0, hitR: 24, guide: null, lastInput: 0, drag: null, mouse: { x: -1, y: -1 }, critterPhase: {}, growT: 0, lvlPulse: 0, bulbPulse: 0, newBadge: {},
  };
  try { V.seen = JSON.parse(localStorage.getItem(SEEN) || '{}'); } catch (e) { V.seen = {}; }
  const markSeen = (k) => { V.seen[k] = 1; try { localStorage.setItem(SEEN, JSON.stringify(V.seen)); } catch (e) {} };

  // ---------- layout ----------
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = W * DPR; cv.height = H * DPR; cv.style.width = W + 'px'; cv.style.height = H + 'px';
    fitBoard();
  }
  const portrait = () => H > W * 1.15;
  // In portrait the tech panel becomes a 4x2 grid above the hand, so the board gets the full width.
  function panelW() { return portrait() ? 0 : Math.max(118, Math.min(170, W * 0.13)); }
  function cardH() { return Math.min(portrait() ? 130 : 118, W * (portrait() ? 0.15 : 0.11)) * 1.12; }
  function techTop() { return H - cardH() - 14 - 2 * 74 - 14; }
  function fitBoard() {
    if (!s) return;
    const R = s.radius + 0.6;
    const availW = W - panelW() - 40, availH = portrait() ? techTop() - 90 - 30 : H - 150 - 90;
    V.uT = Math.max(14, Math.min(76, availW / (SQ3 * (2 * R + 1)), availH / ((1.5 * 2 * R + 2) * SQ + 1.2)));
    V.cx = (W - panelW()) / 2 + 6; V.cy = 90 + availH / 2 + 18;
    if (V.finale) { V.uT *= 1.0; V.cx = W / 2; V.cy = H * 0.39; }
  }
  const hx = (q, r) => V.cx + V.u * SQ3 * (q + r / 2);
  const hy = (q, r) => V.cy + V.u * 1.5 * r * SQ;
  function pick(px, py) {
    const x = (px - V.cx) / V.u, y = (py - V.cy) / (V.u * SQ);
    let q = (SQ3 / 3) * x - (1 / 3) * y, r = (2 / 3) * y;
    let cx = q, cz = r, cy2 = -q - r; let rx = Math.round(cx), rz = Math.round(cz), ry = Math.round(cy2);
    const dx = Math.abs(rx - cx), dy = Math.abs(ry - cy2), dz = Math.abs(rz - cz);
    if (dx > dy && dx > dz) rx = -ry - rz; else if (dy <= dz) rz = -rx - ry;
    return [rx, rz];
  }

  // ---------- game lifecycle ----------
  function start(opts, log) {
    s = log ? B.replay(opts, log) : B.newGame(opts);
    V.sel = -1; V.prev = null; V.anim = {}; V.flips = {}; V.parts = []; V.floats = []; V.ripples = []; V.fork = null; V.finale = null; V.toast = null; V.toastQ = []; V.goalStage = null; V.rowFlash = {};
    V.smog = B.smogLevel(s); V.eve = eveTarget(); fitBoard(); V.u = V.uT; V.screen = 'play'; V.idle = 0; V.lastInput = V.t;
    V.guide = V.seen.placed ? null : 'place';
    if (s.crowned && s.over) startFinale(s.crowned, true);
    save();
  }
  function save() { if (s && s.mode === 'cozy') try { localStorage.setItem(SAVE, B.serialize(s)); } catch (e) {} }
  function loadSave() { try { const o = JSON.parse(localStorage.getItem(SAVE) || 'null'); return o && o.log && o.log.length ? o : null; } catch (e) { return null; } }

  // ---------- events -> juice ----------
  function consume(ev, ox, oy) {
    if (!ev) return;
    let hearts = 0, district = 0;
    for (const e of ev) {
      if (e.type === 'place') {
        hearts = e.links.reduce((a, l) => a + l.hearts, 0); district = e.district;
        V.anim[B.key(e.q, e.r)] = V.t;
        const x = hx(e.q, e.r), y = hy(e.q, e.r);
        for (let i = 0; i < 14; i++) V.parts.push({ k: 'dust', x, y, vx: Math.cos(i / 14 * TAU) * 1.4, vy: Math.sin(i / 14 * TAU) * 0.5, life: 0.7, t: 0 });
        { let n = 0; e.links.forEach((l) => (l.ops || []).forEach((o) => { const self = o.by === 'self'; V.floats.push({ k: 'thought', q: self ? e.q : l.q, r: self ? e.r : l.r, oq: self ? l.q : e.q, or: self ? l.r : e.r, why: o.why, kind: o.v > 0 ? 'like' : 'frown', t: -0.12 - 0.1 * n++, life: 2.6 }); })); }
        flySun(x, y - V.u * 0.8, e.points);
        if ((e.wishes || []).length) markSeen('wished');
        (e.wishes || []).forEach((w, i) => { const wx = hx(w.q, w.r), wy = hy(w.q, w.r); V.floats.push({ k: 'wish', x: wx, y: wy - V.u * 1.2, t: -0.25 - i * 0.15, life: 1.6 }); for (let j = 0; j < 16; j++) V.parts.push({ k: 'spark', x: wx + V.u * 0.4, y: wy - V.u * 1.2, vx: Math.cos(j / 16 * TAU) * 2.4, vy: Math.sin(j / 16 * TAU) * 2.4, life: 1, t: -0.25, c: '#ffe36a' }); setTimeout(() => AU.S.wish(), 250 + i * 150); });
        if (e.hood) {
          const gt = B.groupTiles(s, e.q, e.r, e.tile); let gx = 0, gy = 0; for (const [a, b] of gt) { gx += hx(a, b); gy += hy(a, b); } gx /= gt.length; gy /= gt.length;
          V.floats.push({ k: 'party', x: gx, y: gy - V.u * 1.8, t: -0.3, life: 2.6, friends: e.hood.friends, size: e.hood.size });
          const cols = ['#ff6b6b', '#ffd23f', '#4ecdc4', '#a78bfa', '#ff9f43'];
          for (const [a, b] of gt) for (let j = 0; j < 3; j++) V.parts.push({ k: 'confetti', x: hx(a, b), y: hy(a, b) - V.u, vx: (Math.random() - 0.5) * 3, vy: -2 - Math.random() * 3, life: 1.8, t: -0.3 - Math.random() * 0.3, c: cols[j % 5], ph: Math.random() * TAU });
          setTimeout(() => AU.S.party(e.hood.friends.length), 300);
        }
        if (e.district) { V.ripples.push({ x, y, t: 0, c: '#fff4b0' }); V.floats.push({ k: 'district', x, y: y - V.u * 1.6, t: 0, life: 1.6, type: e.tile }); }
      } else if (e.type === 'critter') {
        const x = hx(e.q, e.r), y = hy(e.q, e.r);
        V.floats.push({ k: 'critter', x, y: y - V.u * 1.2, t: 0, life: 2.2, id: e.critter, first: e.first });
        for (let i = 0; i < 18; i++) V.parts.push({ k: 'spark', x, y: y - V.u * 0.6, vx: (Math.random() - 0.5) * 3, vy: -Math.random() * 2.5, life: 1.2, t: 0, c: '#fff7c0' });
        flySun(x, y - V.u, e.points, 0.6);
        setTimeout(() => AU.S.critter(e.critter), 200);
        if (e.first) V.newBadge[e.critter] = V.t;
        if (e.first && !V.seen.critter) { markSeen('critter'); toast('Clean air brings animals!', { k: 'critter', id: e.critter }); }
      } else if (e.type === 'level') { V.lvlPulse = V.t; V.bulbPulse = V.t; setTimeout(() => { AU.S.level(); }, 350); }
      else if (e.type === 'grow') { V.growT = V.t; fitBoard(); AU.S.grow(); }
      else if (e.type === 'upgrade') {
        AU.S.upgrade(e.variant);
        V.rowFlash[e.axis] = V.t;
        { const ri = B.AXES.indexOf(e.axis), rc = techRects()[ri]; if (rc) for (let j = 0; j < 22; j++) V.parts.push({ k: 'spark', x: rc.x + rc.w / 2, y: rc.y + rc.h / 2, vx: Math.cos(j / 22 * TAU) * 3.2, vy: Math.sin(j / 22 * TAU) * 2.2 - 1, life: 1, t: 0, c: e.variant === 'star' ? '#9fe4ff' : '#ffe36a' }); }
        const wasSmoky = B.EMIT[e.axis][e.era - 1] > 0, nowClean = B.EMIT[e.axis][e.era] <= 0;
        if (wasSmoky && nowClean) {
          const left = smokyKinds().length;
          const nm = e.era === 3 ? B.ERA_NAMES[e.axis][3][e.variant === 'star' ? 1 : 0] : B.ERA_NAMES[e.axis][e.era];
          toast(left ? nm[0].toUpperCase() + nm.slice(1) + ': no more smoke!' : 'The sky is clear! Now reach the crown', { k: 'bld', axis: e.axis, era: e.era, v: e.variant, clean: true });
          setTimeout(() => AU.S.clear(), 500);
          for (const p of V.parts) if (p.k === 'smoke') p.life = Math.min(p.life, p.t + 0.4);
        } else if (!V.seen.upgraded) toast(B.EMIT[e.axis][e.era] < B.EMIT[e.axis][e.era - 1] ? 'Every ' + B.ERA_NAMES[e.axis][e.era - 1] + ' got better: less smoke!' : 'Every ' + B.ERA_NAMES[e.axis][e.era - 1] + ' got better!', { k: 'bld', axis: e.axis, era: e.era, v: e.variant });
        const list = Object.values(s.tiles).filter((t) => t.type === e.axis);
        list.forEach((t, i) => { V.flips[B.key(t.q, t.r)] = { t0: V.t + i * 0.07, from: e.era - 1, fromV: null }; });
        if (e.points) setTimeout(() => flySun(V.cx, V.cy - 40, e.points), 300 + list.length * 70);
        (e.changed || []).slice(0, 12).forEach((c, i) => V.floats.push({ k: 'thought', q: c.q, r: c.r, oq: c.oq, or: c.or, why: c.why, kind: c.kind, t: -0.5 - list.length * 0.07 - i * 0.12, life: 3.0 }));
        if (!V.noCards) { const cd = { axis: e.axis, era: e.era, variant: e.variant }; setTimeout(() => openCard(cd), 900); }
      } else if (e.type === 'crown') { setTimeout(() => startFinale(e.crown), 1600); }
      else if (e.type === 'end') { setTimeout(() => { V.screen = 'end'; }, 1200); recordBest(); }
    }
    if (hearts !== undefined && ev.some((e) => e.type === 'place')) AU.S.place(hearts, district);
  }
  function flySun(x, y, pts, delay = 0) {
    V.floats.push({ k: 'pts', x, y, t: -delay, life: 1.4, pts });
    const n = Math.min(14, 2 + pts);
    for (let i = 0; i < n; i++) V.parts.push({ k: 'beam', x: x + (Math.random() - 0.5) * 20, y: y + (Math.random() - 0.5) * 10, sx: x, sy: y, t: -delay - 0.35 - i * 0.04, life: 0.9 });
  }
  function recordBest() { if (s.mode !== 'challenge') return; const k = BEST + '.' + s.seed; const sc = B.finalScore(s); const b = +(localStorage.getItem(k) || 0); if (sc > b) localStorage.setItem(k, sc); }

  // ---------- actions ----------
  function doPlace(q, r) {
    if (V.sel < 0 || !s.hand[V.sel]) return false;
    const ev = B.place(s, V.sel, q, r);
    if (!ev) { AU.S.deny(); return false; }
    markSeen('placed');
    if (V.guide === 'place') V.guide = s.turn >= 3 ? null : 'place';
    consume(ev); save();
    V.prev = null; V.sel = s.hand[V.sel] ? V.sel : s.hand.findIndex(Boolean);
    V.lastInput = V.t;
    return true;
  }
  function doUpgrade(axis, variant) {
    if (!B.canUpgrade(s, axis)) { AU.S.deny(); return; }
    if (s.era[axis] === 2 && !variant) { V.fork = { axis, t: V.t }; AU.S.pick(); return; }
    const ev = B.upgrade(s, axis, variant); V.fork = null; V.ideaT = null; V.nudging = false;
    consume(ev); markSeen('upgraded'); save();
  }
  function canUndo() { return s && s.mode === 'cozy' && !s.over && s.log.length && s.log[s.log.length - 1][0] === 'p'; }
  function doUndo() {
    if (!canUndo()) { AU.S.deny(); return; }
    const last = s.log[s.log.length - 1];
    s = B.replay({ mode: s.mode, seed: s.seed }, s.log.slice(0, -1));
    const k = B.key(last[2], last[3]);
    for (let i = 0; i < 10; i++) V.parts.push({ k: 'dust', x: hx(last[2], last[3]), y: hy(last[2], last[3]), vx: Math.cos(i) * 1.2, vy: -Math.abs(Math.sin(i)), life: 0.6, t: 0 });
    delete V.anim[k]; V.sel = last[1]; V.prev = null; V.hover = null; fitBoard(); AU.S.swap(); save();
  }
  function doSwap() { const ev = B.swap(s); if (!ev) { AU.S.deny(); return; } AU.S.swap(); V.handAnim = V.t; save(); }

  // ---------- finale ----------
  function startFinale(crown, instant) {
    V.finale = { crown, t: instant ? V.t - 9 : V.t, lanterns: [] };
    for (let i = 0; i < 60; i++) V.finale.lanterns.push({ x: Math.random(), y: 0.4 + Math.random() * 0.6, sp: 0.02 + Math.random() * 0.04, ph: Math.random() * TAU, c: Math.random() });
    AU.S.crown(crown); AU.update({ finale: crown }); markSeen('crown_' + crown); V.sel = -1; V.prev = null; fitBoard();
  }

  // ---------- input ----------
  function hitHUD(x, y) {
    // hand cards
    const cards = cardRects();
    for (let i = 0; i < cards.length; i++) { const c = cards[i]; if (x > c.x && x < c.x + c.w && y > c.y && y < c.y + c.h && s.hand[i]) return { k: 'card', i }; }
    const sw = swapRect(); if (Math.hypot(x - sw.x, y - sw.y) < sw.r) return { k: 'swap' };
    const rows = techRects(); for (let i = 0; i < rows.length; i++) { const r = rows[i]; if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) return { k: 'tech', axis: B.AXES[i] }; }
    const ur = undoRect(); if (Math.hypot(x - ur.x, y - ur.y) < ur.r && canUndo()) return { k: 'undo' };
    if (Math.hypot(x - (W - 30), y - (H - 30)) < V.hitR) return { k: 'mute' };
    if (Math.hypot(x - 30, y - (H - 30)) < V.hitR) return { k: 'home' };
    return null;
  }
  function onDown(e) {
    AU.init();
    const x = e.clientX, y = e.clientY; V.mouse = { x, y }; V.lastInput = V.t;
    if (V.screen === 'title') return titleClick(x, y);
    if (V.screen === 'end') { V.screen = 'title'; return; }
    if (V.finale) return finaleClick(x, y);
    if (V.card) return cardClick(x, y);
    if (V.fork) return forkClick(x, y);
    if (V.peek && V.peek.sticky) { V.peek = null; return; }
    const h = hitHUD(x, y);
    if (h) {
      if (h.k === 'card') { V.sel = h.i; V.drag = { i: h.i, x, y, moved: false }; AU.S.pick(); }
      else if (h.k === 'swap') doSwap();
      else if (h.k === 'undo') doUndo();
      else if (h.k === 'tech') V.press = { axis: h.axis, t: V.t, x, y, touch: e.pointerType !== 'mouse' }; // upgrade on pointerup, so a long-press can just show the card
      else if (h.k === 'mute') AU.setMute(AU.on);
      else if (h.k === 'home') { save(); V.screen = 'title'; AU.update({ finale: null }); }
      return;
    }
    const [q, r] = pick(x, y);
    if (V.sel >= 0) doPlace(q, r);
  }
  function onMove(e) {
    const x = e.clientX, y = e.clientY; V.mouse = { x, y };
    if (V.drag) V.drag.moved = V.drag.moved || Math.hypot(x - V.drag.x, y - V.drag.y) > 12;
    if (!s || V.screen !== 'play' || V.fork || V.finale || V.card) return;
    if (e.pointerType === 'mouse' || !e.pointerType) { const h = hitHUD(x, y); const ax = h && h.k === 'tech' ? h.axis : null; if (!ax) { if (V.peek && !V.peek.sticky) V.peek = null; V.hoverRow = null; } else if (!V.hoverRow || V.hoverRow.axis !== ax) { V.hoverRow = { axis: ax, t: V.t }; if (V.peek && !V.peek.sticky) V.peek = null; } }
    const [q, r] = pick(x, y);
    const hk = B.key(q, r);
    if (V.hover !== hk) {
      V.hover = hk;
      V.prev = V.sel >= 0 ? B.preview(s, s.hand[V.sel], q, r) : null;
      if (V.prev && V.prev.hearts) AU.S.hover(V.prev.hearts);
    }
  }
  function onUp(e) {
    AU.init(); // iOS Safari only unlocks audio on touchend/pointerup
    if (V.drag && V.drag.moved && V.screen === 'play') { const [q, r] = pick(e.clientX, e.clientY); doPlace(q, r); }
    V.drag = null;
    if (V.press) { const p = V.press; V.press = null; if (V.peek && V.peek.sticky && V.peek.fromPress) { V.peek.fromPress = false; return; } const h = hitHUD(e.clientX, e.clientY); if (h && h.k === 'tech' && h.axis === p.axis) { if (V.peek && !V.peek.sticky) V.peek = null; V.hoverRow = null; doUpgrade(p.axis); } }
  }
  cv.addEventListener('pointerdown', onDown); cv.addEventListener('pointermove', onMove); cv.addEventListener('pointerup', onUp);
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', (e) => {
    AU.init();
    if (e.key === 'm' || e.key === 'M') AU.setMute(AU.on);
    if (V.screen !== 'play') return;
    if (['1', '2', '3'].includes(e.key) && s.hand[+e.key - 1]) { V.sel = +e.key - 1; V.hover = null; AU.S.pick(); }
    if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey)) doUndo();
    if (V.card && (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter')) { closeCard(); return; }
    if (e.key === 'Escape') { V.sel = -1; V.prev = null; V.fork = null; V.peek = null; }
  });
  window.addEventListener('resize', resize);

  // ---------- rects ----------
  function cardRects() { const cw = cardH() / 1.12, ch = cw * 1.12, gap = 14, total = 3 * cw + 2 * gap, x0 = (W - panelW()) / 2 - total / 2; return [0, 1, 2].map((i) => ({ x: x0 + i * (cw + gap), y: H - ch - 14 + (V.sel === i ? -12 : 0), w: cw, h: ch })); }
  function swapRect() { const c = cardRects()[2]; return { x: c.x + c.w + 44, y: H - 14 - c.h / 2, r: 24 }; }
  function undoRect() { const c = cardRects()[0]; return { x: c.x - 44, y: H - 14 - c.h / 2, r: 22 }; }
  function techRects() { if (portrait()) { const top = techTop(), cw = Math.min(200, (W - 24) / 4), x0 = W / 2 - cw * 2; return B.AXES.map((a, i) => ({ x: x0 + (i % 4) * cw + 3, y: top + Math.floor(i / 4) * 74, w: cw - 6, h: 68 })); } const pw = panelW(), n = B.AXES.length, top = 76, rh = Math.min(74, (H - top - 20) / n); return B.AXES.map((a, i) => ({ x: W - pw - 8, y: top + i * rh, w: pw, h: rh - 6 })); }

  // ---------- gentle day / evening (follows placements, not the clock: ~28 tiles per day, never dark) ----------
  const DAY = 28;
  function dayPhase() { return s ? ((s.turn + 4) / DAY) % 1 : 0.2; }
  function eveTarget() {
    if (!s || V.finale || Q.get('eve') === '0') return 0;
    if (Q.get('eve')) return +Q.get('eve');
    const p = dayPhase(), sm = (a, b, x) => { const k = Math.max(0, Math.min(1, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
    return sm(0.55, 0.72, p) * (1 - sm(0.86, 1.0, p));
  }
  function evening() {
    const e = V.eve; if (e < 0.02) return;
    g.save(); g.globalCompositeOperation = 'multiply'; g.fillStyle = mix('#ffffff', '#f2c0a8', e * 0.75); g.fillRect(0, 0, W, H); g.restore();
    const c = 1 - V.smog;
    // warm windows and lamps switch on, fireflies over clean nature
    for (const k in s.tiles) {
      const t = s.tiles[k], x = hx(t.q, t.r), y = hy(t.q, t.r), er = s.era[t.type];
      if (['home', 'make', 'move', 'food'].includes(t.type) && er >= 1) { const fl = 0.85 + 0.15 * Math.sin(V.t * 3 + t.q * 5 + t.r); glowDot(g, x, y - V.u * 0.55, V.u * 0.9, er === 3 && s.variant[t.type] === 'star' ? '#bfe8ff' : '#ffd27a', e * 0.32 * fl); }
      if (t.type === 'wild' && c > 0.5) for (let i = 0; i < 2; i++) { const ph = t.q * 3.1 + t.r * 1.7 + i * 2.3; const fx = x + Math.sin(V.t * 0.7 + ph) * V.u * 0.5, fy = y - V.u * (0.6 + 0.3 * Math.sin(V.t * 0.9 + ph * 2)); g.globalAlpha = e * c * (0.5 + 0.5 * Math.sin(V.t * 4 + ph)); glowDot(g, fx, fy, 7, '#f6ff9a', 0.9); circle(g, fx, fy, 1.6, '#fbffd0'); g.globalAlpha = 1; }
    }
  }

  // ---------- drawing ----------
  function sky() {
    if (PIXEL_MODE) { window.PIXEL.sky(g, W, H, V.t, V.smog, V.vivid); return; }
    const c = 1 - V.smog, f = V.finale ? Math.min(1, (V.t - V.finale.t) / 4) : 0;
    let top = mix('#8b8070', '#4aa6e6', c), bot = mix('#cdb48c', '#d8f1ff', c);
    if (V.eve > 0.01 && !f) { top = mix(top, '#6f78c8', V.eve * 0.55); bot = mix(bot, '#ffc79a', V.eve * 0.75); }
    if (f > 0) { const lf = V.finale.crown === 'leaf'; top = mix(top, lf ? '#ff9e74' : '#151a46', f); bot = mix(bot, lf ? '#ffe2a6' : '#7d58b0', f); }
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, top); gr.addColorStop(0.62, bot); gr.addColorStop(1, bot); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // stars + aurora for star finale
    if (f > 0 && V.finale.crown === 'star') {
      for (let i = 0; i < 90; i++) { const x = (i * 97.3) % W, y = (i * 53.7) % (H * 0.55); g.globalAlpha = f * (0.4 + 0.6 * Math.abs(Math.sin(V.t * 1.5 + i))); circle(g, x, y, 1.1, '#fff'); }
      g.globalAlpha = 1;
      for (let k = 0; k < 3; k++) { g.globalAlpha = f * 0.22; g.fillStyle = ['#6fffd2', '#7fb6ff', '#d38bff'][k]; g.beginPath(); for (let x = 0; x <= W; x += 20) { const y = H * 0.16 + k * 26 + Math.sin(x * 0.006 + V.t * 0.5 + k) * 24; if (x === 0) g.moveTo(x, y); else g.lineTo(x, y); } for (let x = W; x >= 0; x -= 20) g.lineTo(x, H * 0.16 + k * 26 + 50 + Math.sin(x * 0.008 + V.t * 0.4 + k) * 20); g.fill(); }
      g.globalAlpha = 1;
    }
    // sun
    const sx = W * (0.2 - V.eve * 0.06), sy = H * 0.17 + V.smog * 30 + V.eve * H * 0.14;
    let sunC = f > 0 && V.finale.crown === 'star' ? '#e6ecff' : mix('#e6a46a', '#fff4b8', c);
    if (!f) sunC = mix(sunC, '#ff9a5a', V.eve * 0.8);
    glowDot(g, sx, sy, 120 + c * 60, sunC, 0.35 + c * 0.25); circle(g, sx, sy, 34, sunC);
    // clouds / smog banks
    for (let i = 0; i < 6; i++) {
      const x = ((i * 260 + V.t * (6 + i * 1.5)) % (W + 300)) - 150, y = H * (0.1 + (i % 3) * 0.08);
      const col = mix('#7a6e60', '#ffffff', c); g.globalAlpha = 0.55 + V.smog * 0.25;
      ell(g, x, y, 70, 18, col); ell(g, x + 40, y - 10, 46, 18, col); ell(g, x - 36, y - 6, 40, 14, col); g.globalAlpha = 1;
    }
    // hills
    const hill = (yb, amp, fr, ph, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(0, H); for (let x = 0; x <= W; x += 16) g.lineTo(x, yb + Math.sin(x * fr + ph) * amp + Math.sin(x * fr * 2.7 + ph) * amp * 0.3); g.lineTo(W, H); g.fill(); };
    const fz = f > 0 ? (V.finale.crown === 'star' ? '#2a2f5a' : '#e0a070') : null;
    let h1 = mix('#8d8a6a', '#7cb6a0', c), h2 = mix('#7c7550', '#6ab873', c), h3 = mix('#6f6a45', '#5ea862', c);
    if (fz) { h1 = mix(h1, fz, f * 0.6); h2 = mix(h2, fz, f * 0.45); h3 = mix(h3, fz, f * 0.3); }
    hill(H * 0.36, 18, 0.004, 1, h1); hill(H * 0.44, 22, 0.006, 3, h2); hill(H * 0.55, 16, 0.005, 5, h3);
    { const fg = g.createLinearGradient(0, H * 0.6, 0, H); fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(1, fz ? 'rgba(10,10,30,0.25)' : 'rgba(30,50,20,0.22)'); g.fillStyle = fg; g.fillRect(0, H * 0.6, W, H * 0.4); }
    // old smokestacks on the far hill while smoggy
    if (V.smog > 0.2) { g.globalAlpha = V.smog; for (let i = 0; i < 3; i++) { const x = W * (0.62 + i * 0.05), y = H * 0.37; g.fillStyle = '#5a5248'; g.fillRect(x, y - 30 - i * 6, 6, 32 + i * 6); for (let k = 0; k < 4; k++) { const p = (V.t * 0.15 + k / 4 + i * 0.3) % 1; g.globalAlpha = V.smog * (1 - p) * 0.5; circle(g, x + 3 + p * 30, y - 34 - i * 6 - p * 40, 6 + p * 14, '#6d6458'); } g.globalAlpha = V.smog; } g.globalAlpha = 1; }
  }

  function hexPath(x, y, u) { g.beginPath(); for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i + Math.PI / 6; const px = x + Math.cos(a) * u, py = y + Math.sin(a) * u * SQ; if (i) g.lineTo(px, py); else g.moveTo(px, py); } g.closePath(); }
  const GROUND = { home: '#f0b080', power: '#e8e0a0', food: '#e0c070', water: '#8fd0f0', move: '#c8c0b8', make: '#d0b0e0', waste: '#a8d8b0', wild: '#3f9a3a' };
  function groups() {
    if (V.grp && V.grp.turn === s.turn && V.grp.n === s.log.length) return V.grp.m;
    const m = {};
    for (const k in s.tiles) { if (m[k]) continue; const t = s.tiles[k]; const gt = B.groupTiles(s, t.q, t.r, t.type); for (const [a, b] of gt) m[B.key(a, b)] = gt.length; }
    V.grp = { turn: s.turn, n: s.log.length, m }; return m;
  }
  function bunting(x1, y1, x2, y2, seed) {
    const cols = ['#ff6b6b', '#ffd23f', '#4ecdc4', '#a78bfa', '#ff9f43'];
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 + V.u * 0.18 + Math.sin(V.t * 1.5 + seed) * 1.5;
    g.strokeStyle = 'rgba(90,70,50,0.6)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x1, y1); g.quadraticCurveTo(mx, my, x2, y2); g.stroke();
    for (let i = 1; i < 6; i++) { const k = i / 6, x = (1 - k) * (1 - k) * x1 + 2 * k * (1 - k) * mx + k * k * x2, y = (1 - k) * (1 - k) * y1 + 2 * k * (1 - k) * my + k * k * y2; const fs = V.u * 0.09; g.fillStyle = cols[(i + seed) % 5]; g.beginPath(); g.moveTo(x - fs, y); g.lineTo(x + fs, y); g.lineTo(x + Math.sin(V.t * 3 + i + seed) * 1.2, y + fs * 1.8); g.fill(); }
  }

  function tileEmits(t) {
    if (!t) return false;
    const era = s.era[t.type];
    return !!(B.EMIT[t.type] && B.EMIT[t.type][era] > 0);
  }
  function drawBoardPixel() {
    const PX = window.PIXEL, R = s.radius, u = V.u;
    const list = [];
    for (let q = -R; q <= R; q++) for (let r = -R; r <= R; r++) if (B.hexDist(q, r) <= R) list.push([q, r]);
    list.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    g.globalAlpha = 0.12; ell(g, V.cx, V.cy + u * 0.3, u * SQ3 * (R + 0.3), u * 1.5 * SQ * (R + 0.4), '#000'); g.globalAlpha = 1;
    for (const [q, r] of list) {
      const t = s.tiles[B.key(q, r)];
      PX.drawHex(g, hx(q, r), hy(q, r), u, { smog: PX.localSmog(V.smog, tileEmits(t)), vivid: V.vivid, seed: (q * 7 + r * 13) | 0 });
    }
    if (V.prev) { hexPath(hx(V.prev.q, V.prev.r), hy(V.prev.r), u * 0.97); g.fillStyle = 'rgba(255,250,210,0.28)'; g.fill(); g.strokeStyle = '#fff6c8'; g.lineWidth = 2.5; g.stroke(); }
    const hint = idleHint();
    if (hint) { hexPath(hx(hint.q, hint.r), hy(hint.r), u * 0.9); g.strokeStyle = 'rgba(255,240,150,0.85)'; g.lineWidth = 3; g.stroke(); }
    for (const [q, r] of list) {
      const k = B.key(q, r), t = s.tiles[k];
      if (!t) continue;
      const x = hx(q, r), y0 = hy(q, r);
      let y = y0, sc = 1;
      const a0 = V.anim[k];
      if (a0 !== undefined) { const p = (V.t - a0) / 0.45; if (p < 1) { const b = 1 - Math.pow(1 - Math.min(1, p * 1.6), 3); y = y0 - (1 - b) * 70; sc = p > 0.6 ? 1 + Math.sin((p - 0.6) / 0.4 * Math.PI) * 0.12 : 1; } }
      let era = s.era[t.type], variant = s.variant[t.type];
      const fl = V.flips[k];
      if (fl) { const p = (V.t - fl.t0) / 0.5; if (p < 0) { era = fl.from; variant = null; } else if (p < 0.5) { era = fl.from; variant = null; } else if (p >= 1) delete V.flips[k]; }
      g.save(); g.translate(x, y0); g.scale(sc, sc); g.translate(-x, -y0);
      PX.drawBuilding(g, t.type, era, variant, x, y, u, V.t + q * 0.3 + r * 0.7, { smog: PX.localSmog(V.smog, tileEmits(t)) });
      g.restore();
      if (t.critter) ART.drawCritter(g, t.critter, x, y + u * 0.1, u / 17, V.t, q * 1.7 + r * 3.1);
    }
  }

  function drawBoard() {
    if (PIXEL_MODE) { drawBoardPixel(); return; }
    const bubbles = [], gm = groups(), flags = [];
    const R = s.radius, u = V.u, c = 1 - V.smog, depth = u * 0.32;
    const grass = mix('#9b9561', '#7fcf5b', V.vivid), grassHi = mix('#a8a26c', '#97dc6e', V.vivid), side = mix('#7b6142', '#8a6a46', c);
    const list = [];
    for (let q = -R; q <= R; q++) for (let r = -R; r <= R; r++) if (B.hexDist(q, r) <= R) list.push([q, r]);
    list.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    // board shadow
    g.globalAlpha = 0.07; ell(g, V.cx, V.cy + depth + u * 0.45, u * SQ3 * (R + 0.35), u * 1.5 * SQ * (R + 0.45), '#2a2a1a'); g.globalAlpha = 1;
    const growing = V.t - V.growT < 1.2;
    // pass 1: ground tiles (sides first for outer ring, then tops)
    for (const [q, r] of list) {
      const x = hx(q, r); let y = hy(q, r);
      const d = B.hexDist(q, r);
      let a = 1; if (growing && d === R) { const k = Math.min(1, (V.t - V.growT - (Math.atan2(r, q) + Math.PI) / TAU * 0.4) / 0.5); a = Math.max(0, k); y += (1 - a) * 30; }
      if (a <= 0) continue;
      g.globalAlpha = a;
      hexPath(x, y + depth, u * 0.99); g.fillStyle = side; g.fill();
      g.fillRect(x - u * 0.86, y, u * 1.72, depth);
      const t = s.tiles[B.key(q, r)];
      const ls = t ? 0 : 0;
      hexPath(x, y, u * 0.97);
      const tg = g.createLinearGradient(x, y - u * SQ, x, y + u * SQ); tg.addColorStop(0, grassHi); tg.addColorStop(1, grass); g.fillStyle = tg; g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 1; g.stroke();
      if (t && gm[B.key(q, r)] >= 3) {
        // group cue on the world: a tinted patch of ground plus a crisp border around the whole group
        const big = gm[B.key(q, r)] >= B.TUNE.hoodAt[0];
        g.globalAlpha = a * (big ? 0.55 : 0.4); hexPath(x, y, u * 0.97); g.fillStyle = GROUND[t.type]; g.fill(); g.globalAlpha = a;
        g.strokeStyle = shade(GROUND[t.type], -0.35); g.lineWidth = Math.max(2, u * (big ? 0.11 : 0.075)); g.lineCap = 'round';
        for (const [nq, nr] of B.neighbors(q, r)) {
          const n = s.tiles[B.key(nq, nr)]; if (n && n.type === t.type) continue;
          const ang = Math.atan2((hy(nq, nr) - y) / SQ, hx(nq, nr) - x), i = (((Math.round((ang - Math.PI / 3) / (Math.PI / 3))) % 6) + 6) % 6;
          const a1 = (Math.PI / 3) * i + Math.PI / 6, a2 = a1 + Math.PI / 3, ru = u * 0.9;
          g.beginPath(); g.moveTo(x + Math.cos(a1) * ru, y + Math.sin(a1) * ru * SQ); g.lineTo(x + Math.cos(a2) * ru, y + Math.sin(a2) * ru * SQ); g.stroke();
        }
      }
      // tufts on empty tiles
      if (!t) { g.fillStyle = shade(grass, -0.12); for (let i = 0; i < 3; i++) { const ox = ((q * 7 + r * 13 + i * 5) % 9) - 4, oy = ((q * 3 + r * 5 + i * 7) % 5) - 2; g.fillRect(x + ox * u * 0.12, y + oy * u * 0.1, 1.5, 3); } }
      g.globalAlpha = 1;
    }
    // hover highlight + idle hint
    if (V.prev) { const x = hx(V.prev.q, V.prev.r), y = hy(V.prev.q, V.prev.r); hexPath(x, y, u * 0.97); g.fillStyle = 'rgba(255,250,210,0.45)'; g.fill(); g.strokeStyle = '#fff6c8'; g.lineWidth = 2.5; g.stroke(); }
    else if (V.sel >= 0 && V.hover) { const [q, r] = V.hover.split(',').map(Number); if (B.hexDist(q, r) <= R && s.tiles[V.hover]) { hexPath(hx(q, r), hy(q, r), u * 0.97); g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 2; g.stroke(); } }
    const hint = idleHint();
    if (hint) { const x = hx(hint.q, hint.r), y = hy(hint.q, hint.r), p = 0.5 + 0.5 * Math.sin(V.t * 4); hexPath(x, y, u * (0.8 + p * 0.15)); g.strokeStyle = `rgba(255,240,150,${0.5 + p * 0.4})`; g.lineWidth = 3; g.stroke(); }
    // pass 2: buildings + critters in depth order
    const night = V.finale && V.finale.crown === 'star' && V.t - V.finale.t > 2;
    for (const [q, r] of list) {
      const k = B.key(q, r), t = s.tiles[k];
      if (!t) continue;
      const x = hx(q, r), y0 = hy(q, r);
      let y = y0, sc = 1;
      const a0 = V.anim[k];
      if (a0 !== undefined) { const p = (V.t - a0) / 0.45; if (p < 1) { const b = 1 - Math.pow(1 - Math.min(1, p * 1.6), 3); y = y0 - (1 - b) * 70; sc = p > 0.6 ? 1 + Math.sin((p - 0.6) / 0.4 * Math.PI) * 0.12 : 1; } }
      let era = s.era[t.type], variant = s.variant[t.type];
      const fl = V.flips[k];
      let fy = 1;
      if (fl) { const p = (V.t - fl.t0) / 0.5; if (p < 0) { era = fl.from; variant = null; } else if (p < 1) { fy = Math.abs(Math.cos(p * Math.PI)); if (p < 0.5) { era = fl.from; variant = null; } if (p > 0.45 && !fl.sp) { fl.sp = 1; for (let i = 0; i < 10; i++) V.parts.push({ k: 'spark', x, y: y0 - u * 0.5, vx: (Math.random() - 0.5) * 3, vy: -Math.random() * 3, life: 1, t: 0, c: s.variant[t.type] === 'star' ? '#bfefff' : '#fff2a0' }); } } else delete V.flips[k]; }
      ell(g, x, y0 + u * 0.12, u * 0.62, u * 0.2, 'rgba(30,40,20,0.18)');
      g.save(); g.translate(x, y0); g.scale(sc * (fl ? 1 : 1), sc * fy); g.translate(-x, -y0);
      const em = ART.drawBuilding(g, t.type, era, variant, x, y + u * 0.18, u, V.t + q * 0.3 + r * 0.7, night);
      g.restore();
      if (era < 3 && !fl) for (const [ex, ey, kk] of em) if ((V.smokeN || 0) < 110 && Math.random() < kk * 3 * (V.dt || 1 / 60)) { V.smokeN = (V.smokeN || 0) + 1; V.parts.push({ k: 'smoke', x: ex, y: ey, vx: 0.18 + Math.random() * 0.15, vy: -0.75 - Math.random() * 0.25, life: 1.3 + kk * 0.15, t: 0, r: u * 0.05 * (0.8 + kk * 0.2), r0: u, kk }); }
      if (t.critter) ART.drawCritter(g, t.critter, x, y + u * 0.1, u / 17, V.t, q * 1.7 + r * 3.1);
      if (t.wish && !V.finale) bubbles.push([q, r, t.wish, x, y]);
    }
    if (!V.finale || true) for (const k in s.tiles) {
      const t = s.tiles[k]; if (gm[k] < B.TUNE.hoodAt[0]) continue;
      for (const [dq, dr] of [[1, 0], [0, 1], [-1, 1]]) { const n = s.tiles[B.key(t.q + dq, t.r + dr)]; if (n && n.type === t.type && (t.q * 3 + t.r * 5 + dq) % 2 === 0) bunting(hx(t.q, t.r), hy(t.q, t.r) - u * 0.95, hx(n.q, n.r), hy(n.q, n.r) - u * 0.95, (t.q * 7 + t.r * 3) & 7); }
    }
    for (const [q, r, w, x, y] of bubbles) {
      const lit = V.prev && V.sel >= 0 && V.prev.wishes && V.prev.wishes.some((o) => o.q === q && o.r === r);
      const bob = Math.sin(V.t * 2 + q + r * 2) * 2, br = u * 0.36 * (lit ? 1.15 : 1), bx = x + u * 0.42, by = y - u * 1.2 + bob;
      const dim = V.prev && V.sel >= 0 && !lit; if (dim) g.globalAlpha = 0.45;
      if (lit) glowDot(g, bx, by, br * 2.2, '#fff27a', 0.7);
      circle(g, x + u * 0.22, y - u * 0.62 + bob * 0.5, u * 0.06, 'rgba(255,255,255,0.9)');
      circle(g, x + u * 0.3, y - u * 0.78 + bob * 0.7, u * 0.09, 'rgba(255,255,255,0.9)');
      circle(g, bx, by, br, lit ? '#fffbe0' : 'rgba(255,255,255,0.93)');
      g.strokeStyle = lit ? '#f2b630' : 'rgba(120,140,110,0.5)'; g.lineWidth = lit ? 3 : 1.5; g.beginPath(); g.arc(bx, by, br, 0, TAU); g.stroke();
      g.save(); g.beginPath(); g.arc(bx, by, br - 1, 0, TAU); g.clip();
      ART.drawBuilding(g, w, s.era[w], s.variant[w], bx, by + br * 0.45, u * 0.42, V.t, false); g.restore(); g.globalAlpha = 1;
    }
    // ghost preview
    if (V.prev && V.sel >= 0) {
      const p = V.prev, x = hx(p.q, p.r), y = hy(p.q, p.r);
      g.globalAlpha = 0.62 + 0.15 * Math.sin(V.t * 5);
      ART.drawBuilding(g, p.type, s.era[p.type], s.variant[p.type], x, y + u * 0.18 - 6 - Math.sin(V.t * 4) * 2, u, V.t, false);
      g.globalAlpha = 1;
      for (const l of p.links) {
        g.strokeStyle = l.hearts ? 'rgba(255,120,150,0.85)' : 'rgba(110,115,125,0.8)'; g.lineWidth = 3; g.setLineDash([4, 4]); g.lineDashOffset = -V.t * 20; g.beginPath(); g.moveTo(x, y); g.lineTo(hx(l.q, l.r), hy(l.q, l.r)); g.stroke(); g.setLineDash([]);
      }
      // picture thought bubbles: who likes / dislikes whom, and why (smoke, noise, flies, apples...)
      const th = []; for (const l of p.links) for (const o of l.ops || []) { const self = o.by === 'self'; th.push({ q: self ? p.q : l.q, r: self ? p.r : l.r, oq: self ? l.q : p.q, or: self ? l.r : p.r, why: o.why, kind: o.v > 0 ? 'like' : 'frown' }); }
      { const bw = 54 + (p.district ? 24 : 0) + (p.hood ? 26 : 0); drawThoughts(th, 1, [{ x, y: y - u * 2.0, r: bw / 2 + 2 }, { x: x - bw / 4, y: y - u * 2.0, r: 16 }, { x: x + bw / 4, y: y - u * 2.0, r: 16 }, { x: x + bw / 2 + 14, y: y - u * 2.0, r: 12 }]); }
      bubble(x, y - u * 2.0, p.points, p.district, p.hood);
      { const bw = 54 + (p.district ? 24 : 0) + (p.hood ? 26 : 0); smogBadge(x + bw / 2 + 14, y - u * 2.0, B.EMIT[p.type][s.era[p.type]], 1); }
    }
  }
  // ---------- ambient travellers (UI only): carts -> sooty cars -> EVs -> trams / maglev pods ----------
  function travellers(dt) {
    V.trav = V.trav || [];
    const moves = Object.values(s.tiles).filter((t) => t.type === 'move');
    if (moves.length && V.trav.length < 4 + moves.length * 2 && Math.random() < dt * (0.6 + moves.length * 0.25)) {
      const m = moves[Math.floor(Math.random() * moves.length)];
      const dests = Object.values(s.tiles).filter((t) => (t.type === 'home' || t.type === 'make' || t.type === 'food') && B.hexDist(t.q - m.q, t.r - m.r) <= 3 && (t.q !== m.q || t.r !== m.r));
      if (dests.length) { const d = dests[Math.floor(Math.random() * dests.length)]; V.trav.push({ a: [m.q, m.r], b: [d.q, d.r], t: 0, dur: 2.5 + B.hexDist(d.q - m.q, d.r - m.r) * 1.2, back: Math.random() < 0.5 }); }
    }
    const era = s.era.move, v = s.variant.move;
    for (let i = V.trav.length - 1; i >= 0; i--) {
      const tr = V.trav[i]; tr.t += dt; const k = tr.t / tr.dur; if (k >= 1) { V.trav.splice(i, 1); continue; }
      const e = k * k * (3 - 2 * k), [a, b] = tr.back ? [tr.b, tr.a] : [tr.a, tr.b];
      const x = hx(a[0], a[1]) + (hx(b[0], b[1]) - hx(a[0], a[1])) * e, y = hy(a[0], a[1]) + (hy(b[0], b[1]) - hy(a[0], a[1])) * e + V.u * 0.3;
      const dir = hx(b[0], b[1]) >= hx(a[0], a[1]) ? 1 : -1, fade = Math.min(1, k * 8, (1 - k) * 8), sc = V.u / 30;
      g.globalAlpha = fade; g.save(); g.translate(x, y); g.scale(dir * sc, sc);
      ell(g, 0, 2, 6, 1.6, 'rgba(0,0,0,0.18)');
      if (era === 0) { g.fillStyle = '#8b5a3c'; ell(g, 4, -3, 3.5, 2, '#8b5a3c'); g.fillRect(6, -7, 1.6, 4); g.fillStyle = '#a0784a'; g.fillRect(-7, -5, 8, 3.5); circle(g, -5, 0, 1.8, '#4a3020'); circle(g, -1, 0, 1.8, '#4a3020'); }
      else if (era === 1) { ART.box(g, 0, 0, 10, 4, 5, '#c2453b'); ART.box(g, -1, -4, 5, 3, 4, '#d8635a'); circle(g, -3, 0, 1.5, '#222'); circle(g, 3, 0, 1.5, '#222'); if (Math.random() < 0.15) V.parts.push({ k: 'smoke', x: x - dir * 6 * sc, y: y - 2, vx: -dir * 0.2, vy: -0.3, life: 1.6, t: 0, r: 2 }); }
      else if (era === 2) { ART.box(g, 0, 0, 10, 4, 5, ['#4aa3d8', '#f2c14e', '#6fcf7a'][i % 3]); ART.box(g, -1, -4, 5, 3, 4, '#bfe6ff'); circle(g, -3, 0, 1.5, '#222'); circle(g, 3, 0, 1.5, '#222'); }
      else if (v === 'leaf') { if (i % 2) { ART.box(g, 0, 0, 16, 6, 5, '#f2c14e'); g.fillStyle = '#7fc96a'; g.fillRect(-8, -8, 16, 2); for (let w = 0; w < 3; w++) { g.fillStyle = '#ffe9a8'; g.fillRect(-6 + w * 4.5, -4.5, 3, 2.5); } } else { g.strokeStyle = '#3a6a8a'; g.lineWidth = 1; g.beginPath(); g.arc(-3, 0, 2, 0, TAU); g.arc(3, 0, 2, 0, TAU); g.stroke(); g.beginPath(); g.moveTo(-3, 0); g.lineTo(0, -3); g.lineTo(3, 0); g.stroke(); circle(g, 0, -6, 1.6, '#f0c8a0'); g.fillStyle = ['#e5533b', '#3b8de5', '#5bbf5b'][i % 3]; g.fillRect(-1, -5, 2, 3); } }
      else { g.translate(0, -8 - Math.sin(V.t * 3 + i) * 1.5); glowDot(g, 0, 0, 10, '#8fdcff', 0.5); ART.box(g, 0, 2, 12, 3.5, 5, '#ffffff'); g.fillStyle = '#4fb8ff'; g.fillRect(-5, -1, 10, 1.4); }
      g.restore(); g.globalAlpha = 1;
    }
  }
  function heart(x, y, r, c) { g.fillStyle = c; g.beginPath(); g.moveTo(x, y + r * 0.9); g.bezierCurveTo(x - r * 1.4, y - r * 0.1, x - r * 0.6, y - r * 1.2, x, y - r * 0.4); g.bezierCurveTo(x + r * 0.6, y - r * 1.2, x + r * 1.4, y - r * 0.1, x, y + r * 0.9); g.fill(); g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 1.2; g.stroke(); }
  function sunIcon(x, y, r, a = 1) { g.globalAlpha = a; g.strokeStyle = '#ffb627'; g.lineWidth = r * 0.22; for (let i = 0; i < 8; i++) { const an = i / 8 * TAU + V.t * 0.5; g.beginPath(); g.moveTo(x + Math.cos(an) * r * 1.05, y + Math.sin(an) * r * 1.05); g.lineTo(x + Math.cos(an) * r * 1.45, y + Math.sin(an) * r * 1.45); g.stroke(); } circle(g, x, y, r, '#ffd23f'); g.globalAlpha = 1; }
  function bubble(x, y, pts, district, hood) {
    const w = 54 + (district ? 24 : 0) + (hood ? 26 : 0), h = 30;
    g.fillStyle = 'rgba(255,255,255,0.92)'; rr(x - w / 2, y - h / 2, w, h, 14); g.fill();
    g.beginPath(); g.moveTo(x - 6, y + h / 2 - 1); g.lineTo(x, y + h / 2 + 8); g.lineTo(x + 6, y + h / 2 - 1); g.fill();
    sunIcon(x - w / 2 + 15, y, 6.5);
    g.fillStyle = '#7a4a10'; g.font = 'bold 18px "Trebuchet MS", system-ui, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('+' + pts, x - w / 2 + 27, y + 1);
    if (district) { const dx = hood ? -26 : 0; for (let i = 0; i < 3; i++) circle(g, x + w / 2 - 18 + dx + (i - 1) * 6, y - 4 + (i === 1 ? -3 : 0), 3.2, '#ffd23f'); }
    if (hood) { const cols = ['#ff6b6b', '#ffd23f', '#4ecdc4']; for (let i = 0; i < 3; i++) { const fx = x + w / 2 - 26 + i * 7, fy = y - 6 + Math.sin(V.t * 6 + i) * 1.5; g.fillStyle = cols[i]; g.beginPath(); g.moveTo(fx - 3, fy); g.lineTo(fx + 3, fy); g.lineTo(fx, fy + 8); g.fill(); } }
  }
  function rr(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  function drawParticles(dt) {
    const sm = V.parts, f60 = dt * 60; let smokeN = 0;
    for (let i = sm.length - 1; i >= 0; i--) {
      const p = sm[i]; p.t += dt; if (p.t < 0) continue;
      const k = p.t / p.life; if (k >= 1) { sm.splice(i, 1); continue; }
      if (p.k === 'smoke') { smokeN++; p.x += p.vx * f60; p.y += p.vy * f60; p.r = Math.min(p.r0 * 0.27, p.r + p.r0 * 0.11 * dt); g.globalAlpha = Math.min(1, k * 6) * (1 - k) * (0.36 + 0.18 * V.smog); circle(g, p.x, p.y, p.r, mix('#6e665e', '#b8b0a6', k)); }
      else if (p.k === 'dust') { p.x += p.vx * f60; p.y += p.vy * f60; g.globalAlpha = (1 - k) * 0.5; circle(g, p.x, p.y, 3 + k * 6, '#f3ecd0'); }
      else if (p.k === 'spark') { p.x += p.vx * f60; p.y += p.vy * f60; p.vy += 0.06 * f60; g.globalAlpha = 1 - k; circle(g, p.x, p.y, 2.2, p.c); }
      else if (p.k === 'beam') { const e = k * k * (3 - 2 * k); const tx = 62, ty = 58; const x = p.x + (tx - p.x) * e, y = p.y + (ty - p.y) * e - Math.sin(e * Math.PI) * 60; g.globalAlpha = 1; glowDot(g, x, y, 9, '#ffe680', 0.9); circle(g, x, y, 2.4, '#fff8d0'); if (k > 0.95 && !p.hit) { p.hit = 1; V.sunHit = V.t; } }
      else if (p.k === 'confetti') { p.x += (p.vx + Math.sin(V.t * 4 + p.ph) * 0.5) * f60; p.y += p.vy * f60; p.vy += 0.09 * f60; p.vx *= Math.pow(0.98, f60); g.globalAlpha = Math.min(1, (1 - k) * 2); g.save(); g.translate(p.x, p.y); g.rotate(V.t * 5 + p.ph); g.fillStyle = p.c; g.fillRect(-2.5, -1.5, 5, 3); g.restore(); }
      else if (p.k === 'beam2') { const e = k * k * (3 - 2 * k); const x = p.x + (p.tx - p.x) * e, y = p.y + (p.ty - p.y) * e - Math.sin(e * Math.PI) * 50; g.globalAlpha = 1 - k * 0.5; glowDot(g, x, y, 10, '#fff27a', 0.9); circle(g, x, y, 2.6, '#fffbe0'); }
      else if (p.k === 'leaf') { p.x += (p.vx + Math.sin(V.t * 2 + p.ph) * 0.4) * f60; p.y += p.vy * f60; g.globalAlpha = 1 - k; ell(g, p.x, p.y, 3, 1.5, p.c); }
    }
    g.globalAlpha = 1; V.smokeN = smokeN;
    if (sm.length > 900) sm.splice(0, sm.length - 900);
  }
  function drawFloats(dt) {
    { const th = []; for (const f of V.floats) if (f.k === 'thought' && f.t >= 0) { const k = f.t / f.life; th.push(Object.assign({}, f, { k, a: k > 0.75 ? (1 - k) / 0.25 : 1 })); } if (th.length) drawThoughts(th, 1, V.floats.filter((f) => (f.k === 'pts' || f.k === 'party' || f.k === 'district') && f.t >= 0).map((f) => f.k === 'pts' ? { x: f.x + 4, y: f.y - (f.t / f.life) * 34, r: 22 } : f.k === 'party' ? { x: f.x, y: f.y - V.u * 0.2, r: 44 } : { x: f.x, y: f.y, r: 26 })); }
    for (let i = V.floats.length - 1; i >= 0; i--) {
      const f = V.floats[i]; f.t += dt; if (f.t < 0) continue; const k = f.t / f.life; if (k >= 1) { V.floats.splice(i, 1); continue; }
      const a = k < 0.15 ? k / 0.15 : k > 0.7 ? (1 - k) / 0.3 : 1; g.globalAlpha = a;
      if (f.k === 'thought') { g.globalAlpha = 1; continue; }
      if (f.k === 'heart') heart(f.x, f.y - k * 30, 7 + Math.sin(k * 9) * 1, '#ff5c86');
      else if (f.k === 'pts') { sunIcon(f.x - 14, f.y - k * 34, 7, a); g.fillStyle = '#fff'; g.strokeStyle = '#8a5a10'; g.lineWidth = 4; g.font = 'bold 22px "Trebuchet MS", system-ui, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.strokeText('+' + f.pts, f.x - 2, f.y - k * 34); g.fillText('+' + f.pts, f.x - 2, f.y - k * 34); }
      else if (f.k === 'party') {
        // one compact pill above the group: garland on top, then a heart and the friend kinds inside
        const n = Math.min(3, f.friends.length), ic = 24, w = 34 + n * (ic + 6), h = 40, px = f.x, py = f.y - V.u * 0.2 - k * 14, sc = 1 + Math.sin(Math.min(1, k * 4) * Math.PI) * 0.12;
        g.save(); g.translate(px, py); g.scale(sc, sc); g.globalAlpha = a;
        g.fillStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); if (g.roundRect) g.roundRect(-w / 2, -h / 2, w, h, h / 2); else g.rect(-w / 2, -h / 2, w, h); g.fill();
        g.strokeStyle = '#ffcf3f'; g.lineWidth = 2.5; g.stroke();
        bunting(-w / 2 + 6, -h / 2 + 2, w / 2 - 6, -h / 2 + 2, 1);
        heart(-w / 2 + 17, 3, 8, '#ff5c86');
        for (let i = 0; i < n; i++) { const bx = -w / 2 + 34 + i * (ic + 6) + ic / 2; g.save(); g.beginPath(); g.arc(bx, 3, ic / 2 + 1, 0, TAU); g.clip(); ART.drawBuilding(g, f.friends[i], s.era[f.friends[i]], s.variant[f.friends[i]], bx, 3 + ic * 0.42, ic * 0.9, V.t, false); g.restore(); }
        g.restore(); g.globalAlpha = a;
      }
      else if (f.k === 'wish') { const r = 14 + k * 10; g.save(); g.translate(f.x + V.u * 0.4, f.y - k * 24); g.scale(1 + Math.sin(Math.min(1, k * 3) * Math.PI) * 0.3, 1); heart(0, 0, r, '#ff6b8a'); g.restore(); }
      else if (f.k === 'district') { const r = 18 + k * 30; g.strokeStyle = '#fff2a0'; g.lineWidth = 3; g.beginPath(); g.arc(f.x, f.y + 26, r, 0, TAU); g.stroke(); for (let j = 0; j < 3; j++) sunIcon(f.x + (j - 1) * 16, f.y - k * 20 - (j === 1 ? 6 : 0), 5, a); }
      else if (f.k === 'critter') { g.fillStyle = 'rgba(255,255,255,0.9)'; circle(g, f.x, f.y - k * 16, 22, 'rgba(255,255,255,0.88)'); ART.drawCritter(g, f.id, f.x, f.y - k * 16 + 12, 1.1, V.t, 0); if (f.first) { g.strokeStyle = '#ffcf3f'; g.lineWidth = 3; g.beginPath(); g.arc(f.x, f.y - k * 16, 22 + Math.sin(V.t * 8) * 2, 0, TAU); g.stroke(); } }
    }
    g.globalAlpha = 1;
    for (const rp of V.ripples) rp.t += dt;
    V.ripples = V.ripples.filter((rp) => rp.t < 1);
    for (const rp of V.ripples) { g.globalAlpha = 1 - rp.t; g.strokeStyle = rp.c; g.lineWidth = 3; g.beginPath(); g.ellipse(rp.x, rp.y, V.u * (1 + rp.t * 2.5), V.u * SQ * (1 + rp.t * 2.5), 0, 0, TAU); g.stroke(); }
    g.globalAlpha = 1;
  }
  function haze() {
    if (PIXEL_MODE) return; // dithered per-tile in PIXEL.drawHex
    // Smog lives in the sky: a brown tint up high and a soft bank along the far hills. Drawn before the board, so tiles stay crisp.
    if (V.smog < 0.02) return;
    const gr = g.createLinearGradient(0, 0, 0, H * 0.6); gr.addColorStop(0, `rgba(110,96,78,${V.smog * 0.3})`); gr.addColorStop(1, 'rgba(120,104,84,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H * 0.6);
    for (let i = 0; i < 7; i++) { const x = ((i * 233 + V.t * (4 + i)) % (W + 400)) - 200, y = H * (0.3 + (i % 3) * 0.035); g.globalAlpha = V.smog * 0.22; ell(g, x, y, 160, 26, '#7d7264'); ell(g, x + 90, y + 8, 110, 20, '#857a6c'); }
    g.globalAlpha = 1;
  }
  // ---------- HUD ----------
  function drawSunMeter() {
    const x = 62, y = 58, r = 30;
    const need0 = s.sunLevel ? B.sunNeed(s.sunLevel) : 0, need1 = B.sunNeed(s.sunLevel + 1);
    const p = Math.max(0, Math.min(1, (s.sun - need0) / (need1 - need0)));
    V.sunShow = V.sunShow === undefined ? p : V.sunShow + (p - V.sunShow) * 0.1;
    const hit = V.sunHit && V.t - V.sunHit < 0.2 ? 1 + (0.2 - (V.t - V.sunHit)) : 1;
    const lp = V.t - V.lvlPulse < 1 ? 1 + Math.sin((V.t - V.lvlPulse) * Math.PI) * 0.35 : 1;
    const R = r * hit * lp;
    glowDot(g, x, y, R * 2.4, '#fff1a0', 0.5);
    g.lineWidth = 8; g.strokeStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.arc(x, y, R + 12, 0, TAU); g.stroke();
    g.strokeStyle = '#ffb627'; g.lineCap = 'round'; g.beginPath(); g.arc(x, y, R + 12, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0.001, V.sunShow)); g.stroke(); g.lineCap = 'butt';
    for (let i = 0; i < 12; i++) { const an = i / 12 * TAU + V.t * 0.2; g.strokeStyle = '#ffcf3f'; g.lineWidth = 3; g.beginPath(); g.moveTo(x + Math.cos(an) * (R + 2), y + Math.sin(an) * (R + 2)); g.lineTo(x + Math.cos(an) * (R + 7), y + Math.sin(an) * (R + 7)); g.stroke(); }
    const sg = g.createRadialGradient(x - 8, y - 8, 2, x, y, R); sg.addColorStop(0, '#fff6b0'); sg.addColorStop(1, '#ffc93a'); g.fillStyle = sg; g.beginPath(); g.arc(x, y, R, 0, TAU); g.fill();
    // face: smile grows as the air clears
    const c = 1 - V.smog; g.fillStyle = '#7a4a10'; circle(g, x - 9, y - 4, 2.6, '#7a4a10'); circle(g, x + 9, y - 4, 2.6, '#7a4a10');
    g.strokeStyle = '#7a4a10'; g.lineWidth = 2.6; g.lineCap = 'round'; g.beginPath(); g.moveTo(x - 9, y + 7); g.quadraticCurveTo(x, y + 7 + c * 10, x + 9, y + 7); g.stroke(); g.lineCap = 'butt';
    circle(g, x - 15, y + 4, 3.5, 'rgba(255,120,100,0.35)'); circle(g, x + 15, y + 4, 3.5, 'rgba(255,120,100,0.35)');
    if (goalStage() === 'friends' && s.turn > 0) { const pp = (V.t * 0.8) % 1; g.globalAlpha = 1 - pp; g.strokeStyle = '#ffcf3f'; g.lineWidth = 3; g.beginPath(); g.arc(x, y, R + 16 + pp * 22, 0, TAU); g.stroke(); g.globalAlpha = 1; }
    if (s.ideas === 0 && !V.finale) { g.globalAlpha = 0.32; bulb(118, 58, 0.9, false); g.globalAlpha = 1; g.fillStyle = 'rgba(122,74,16,0.45)'; g.beginPath(); g.moveTo(98, 53); g.lineTo(104, 58); g.lineTo(98, 63); g.fill(); }
    // ideas (bulbs)
    for (let i = 0; i < Math.min(s.ideas, 8); i++) {
      const nb = V.nudging ? Math.abs(Math.sin(V.t * 5 + i * 0.5)) : 0;
      if (V.nudging) glowDot(g, 118 + i * 30, 56 - nb * 8, 30 + nb * 10, '#fff27a', 0.55);
      bulb(118 + i * 30, 58 - nb * 8, 1 + nb * 0.25 + (V.t - V.bulbPulse < 0.6 && i === s.ideas - 1 ? Math.sin((V.t - V.bulbPulse) / 0.6 * Math.PI) * 0.5 : 0), true);
    }
    if (s.ideas > 8) { g.fillStyle = '#5a3a00'; g.font = 'bold 16px system-ui'; g.textAlign = 'left'; g.fillText('+' + (s.ideas - 8), 118 + 8 * 30 - 6, 62); }
    if (s.mode === 'challenge') { // deck count + score
      const left = (s.deck ? s.deck.length : 0) + s.hand.filter(Boolean).length;
      g.fillStyle = 'rgba(255,255,255,0.85)'; rr(16, 108, 92, 30, 12); g.fill();
      for (let i = 0; i < 3; i++) { g.fillStyle = shade('#e9dcc0', -i * 0.06); rr(24 + i * 3, 114 - i * 2, 14, 18, 3); g.fill(); g.strokeStyle = '#b39b6e'; g.lineWidth = 1; g.stroke(); }
      g.fillStyle = '#5a3a00'; g.font = 'bold 17px system-ui'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(left, 50, 124);
      g.fillStyle = 'rgba(255,255,255,0.85)'; rr(16, 144, 92, 30, 12); g.fill(); sunIcon(32, 159, 6); g.fillStyle = '#5a3a00'; g.fillText(s.sun, 46, 160);
    }
  }
  function bulb(x, y, sc = 1, lit = true) {
    g.save(); g.translate(x, y); g.scale(sc, sc);
    if (lit) glowDot(g, 0, -3, 18, '#fff3a0', 0.6 + 0.2 * Math.sin(V.t * 3));
    circle(g, 0, -4, 9, lit ? '#fff6b8' : '#ccc'); g.fillStyle = '#9aa0a8'; g.fillRect(-4.5, 4, 9, 6); g.fillStyle = '#7d838a'; g.fillRect(-4.5, 6, 9, 1.2); g.fillRect(-4.5, 8.4, 9, 1.2);
    g.strokeStyle = '#e8a020'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(-3, 1); g.lineTo(-1.5, -5); g.lineTo(0, -1); g.lineTo(1.5, -5); g.lineTo(3, 1); g.stroke();
    g.restore();
  }
  function speciesPos(i) { const sz = 30; return { x: 30 + (i % 3) * (sz + 6), y: H - 30 - 50 - (1 - Math.floor(i / 3)) * (sz + 6), sz }; }
  function drawSpecies() {
    // The critter book: a small 3x2 album above the home button (moved off the top in v0.5 to make room for the goal).
    const ids = B.CRITTERS.map((c) => c.id);
    ids.forEach((id, i) => {
      const { x, y, sz } = speciesPos(i), met = s.species[id];
      const nb = V.newBadge[id] !== undefined && V.t - V.newBadge[id] < 2.5;
      const sc = nb ? 1 + Math.sin(Math.min(1, (V.t - V.newBadge[id]) / 0.5) * Math.PI) * 0.5 : 1;
      if (nb) glowDot(g, x, y, sz * 1.4, '#fff27a', 0.7);
      circle(g, x, y, (sz / 2) * sc, met ? '#e6f6ff' : 'rgba(255,255,255,0.3)'); if (met) { g.strokeStyle = '#8fc26a'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, (sz / 2) * sc, 0, TAU); g.stroke(); }
      const cs = 1.4 * sc;
      if (met) { ART.drawCritter(g, id, x, y + (id === 'bird' ? 39 : 7) * sc, cs, id === 'bird' ? 1.2 : V.t, 0); if (met > 1) { g.fillStyle = '#5a3a00'; g.font = 'bold 10px system-ui'; g.textAlign = 'center'; g.fillText(met, x + 11, y + 13); } }
      else { g.save(); g.globalAlpha = 0.4; g.filter = 'brightness(0)'; ART.drawCritter(g, id, x, y + (id === 'bird' ? 39 : 7), 1.4, 1.2, 0); g.restore(); g.filter = 'none'; }
    });
  }
  function drawTech() {
    const rows = techRects();
    const avail = s.ideas > 0 && !V.finale, nr = V.nudging ? nudgeRow() : -1;
    B.AXES.forEach((a, i) => {
      if (i === nr) { const rr0 = rows[i]; glowDot(g, rr0.x + rr0.w / 2, rr0.y + rr0.h / 2, rr0.w * 0.75, '#fff27a', 0.35 + 0.25 * Math.sin(V.t * 5)); }
      const r = rows[i], era = s.era[a], can = avail && era < 3;
      const fk = V.rowFlash[a] !== undefined ? (V.t - V.rowFlash[a]) / 1.2 : 1;
      if (fk < 1) glowDot(g, r.x + r.w / 2, r.y + r.h / 2, r.w * (0.6 + fk * 0.6), s.variant[a] === 'star' ? '#9fe4ff' : '#fff27a', (1 - fk) * 0.9);
      const pulse = can ? 0.5 + 0.5 * Math.sin(V.t * 4 + i * 0.6) : 0;
      g.fillStyle = can ? `rgba(255,248,210,${0.85 + pulse * 0.15})` : 'rgba(255,255,255,0.55)'; rr(r.x, r.y, r.w, r.h, 12); g.fill();
      if (can) { g.strokeStyle = `rgba(255,190,40,${0.5 + pulse * 0.5})`; g.lineWidth = 3; g.stroke(); }
      const iu = Math.min(r.h * 0.5, 30);
      // current building
      g.save(); rr(r.x + 4, r.y + 3, r.h - 6, r.h - 6, 9); g.clip(); g.fillStyle = mix('#cfc6a8', '#bfe8a8', era / 3); g.fillRect(r.x, r.y, r.h, r.h);
      ART.drawBuilding(g, a, era, s.variant[a], r.x + r.h / 2, r.y + r.h * 0.82, iu, V.t, false); g.restore();
      smogBadge(r.x + r.h - 10, r.y + 12, B.EMIT[a][era], 1.05);
      // era pips
      for (let k = 0; k < 4; k++) { const px = r.x + r.h + 6 + k * ((r.w - r.h - 14) / 3.6), py = r.y + r.h - 10; circle(g, px + 4, py, 4.2, k <= era ? (k === 3 ? (s.variant[a] === 'star' ? '#7fd0ff' : '#7ed957') : '#ffb627') : 'rgba(0,0,0,0.15)'); }
      // next building ghost (+ bulb when affordable)
      if (era < 3) {
        const nx = r.x + r.w - r.h * 0.55, ny = r.y + r.h * 0.62;
        g.save(); rr(r.x + 2, r.y + 2, r.w - 4, r.h - 4, 10); g.clip(); g.globalAlpha = can ? 0.95 : 0.35;
        if (era === 2) { ART.drawBuilding(g, a, 3, 'leaf', nx - iu * 0.55, ny, iu * 0.6, V.t, false); ART.drawBuilding(g, a, 3, 'star', nx + iu * 0.45, ny, iu * 0.6, V.t, false); }
        else ART.drawBuilding(g, a, era + 1, null, nx, ny, iu * 0.75, V.t, false);
        g.restore(); g.globalAlpha = 1;
        g.fillStyle = can ? '#e8a020' : 'rgba(0,0,0,0.25)'; g.beginPath(); const ax = r.x + r.h + 8, ay = r.y + r.h * 0.38; g.moveTo(ax, ay - 5); g.lineTo(ax + 9, ay); g.lineTo(ax, ay + 5); g.fill();
        if (can) bulb(ax + 22, ay + 2, 0.7 + pulse * 0.1, true);
      } else { g.fillStyle = s.variant[a] === 'star' ? '#4fb8ff' : '#55b84a'; crownGlyph(r.x + r.w - 24, r.y + r.h * 0.42, 9, s.variant[a]); }
    });
  }
  function crownGlyph(x, y, r, v) {
    if (v === 'star') { g.fillStyle = '#5fc4ff'; g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr2 = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); } g.fill(); }
    else { g.fillStyle = '#5cbf4a'; g.beginPath(); g.moveTo(x, y + r); g.quadraticCurveTo(x - r * 1.1, y, x, y - r); g.quadraticCurveTo(x + r * 1.1, y, x, y + r); g.fill(); g.strokeStyle = '#2f7a2a'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, y + r); g.lineTo(x, y - r * 0.6); g.stroke(); }
  }
  function drawHand() {
    const cards = cardRects();
    for (let i = 0; i < 3; i++) {
      const c = cards[i], type = s.hand[i];
      if (!type) { g.fillStyle = 'rgba(255,255,255,0.15)'; rr(c.x, c.y, c.w, c.h, 14); g.fill(); continue; }
      const sel = V.sel === i;
      const bob = V.handAnim && V.t - V.handAnim < 0.4 ? Math.sin((V.t - V.handAnim) / 0.4 * Math.PI) * 10 : 0;
      const y = c.y + bob;
      g.fillStyle = 'rgba(40,40,20,0.2)'; rr(c.x + 3, y + 5, c.w, c.h, 14); g.fill();
      g.fillStyle = sel ? '#fffbe8' : '#fbf5e4'; rr(c.x, y, c.w, c.h, 14); g.fill();
      g.strokeStyle = sel ? '#ffb627' : '#d9c9a0'; g.lineWidth = sel ? 4 : 2; g.stroke();
      // art window
      g.save(); rr(c.x + 7, y + 7, c.w - 14, c.h * 0.6, 10); g.clip();
      const sg = g.createLinearGradient(0, y, 0, y + c.h * 0.6); sg.addColorStop(0, mix('#cfe2ea', '#bfe6ff', V.vivid)); sg.addColorStop(1, mix('#d8d2a8', '#c8ecb0', V.vivid)); g.fillStyle = sg; g.fillRect(c.x, y, c.w, c.h);
      ell(g, c.x + c.w / 2, y + c.h * 0.54, c.w * 0.36, c.w * 0.1, mix('#a8a070', '#8fd46a', V.vivid));
      ART.drawBuilding(g, type, s.era[type], s.variant[type], c.x + c.w / 2, y + c.h * 0.55, c.w * 0.36, V.t, false);
      g.restore();
      smogBadge(c.x + c.w - 22, y + 22, B.EMIT[type][s.era[type]], 1);
      // friends row: heart + tiny friend buildings
      const fr = B.likedTypes(s, type), fo = B.dislikedTypes(s, type), two = fo.length > 0;
      const rowH = two ? c.h * 0.17 : c.h * 0.24, fy = y + c.h * (two ? 0.765 : 0.83);
      const step = Math.min(rowH, (c.w - 30) / Math.max(1, fr.length));
      if (goalStage() === 'friends') { const p = 0.5 + 0.5 * Math.sin(V.t * 4); g.fillStyle = `rgba(255,214,90,${0.25 + p * 0.3})`; rr(c.x + 4, fy - step * 0.5 - 3, c.w - 8, step + 4, 10); g.fill(); }
      heart(c.x + 15, fy, two ? 5 : 6, '#ff5c86');
      fr.forEach((f, j) => { const fx = c.x + 30 + step * (j + 0.5); circle(g, fx, fy - 2, step * 0.42, mix('#e8e2c8', '#d6f0c4', V.vivid)); ART.drawBuilding(g, f, s.era[f], s.variant[f], fx, fy + step * 0.18, step * 0.34, V.t, false); });
      if (two) { const oy = y + c.h * 0.915, st2 = Math.min(rowH, (c.w - 30) / fo.length); ART.frownBadge(g, c.x + 15, oy, 5.5); fo.forEach((f, j) => { const fx = c.x + 30 + st2 * (j + 0.5); circle(g, fx, oy - 2, st2 * 0.42, '#dcdcd6'); ART.drawBuilding(g, f, s.era[f], s.variant[f], fx, oy + st2 * 0.18, st2 * 0.34, V.t, false); }); }
      // key hint number
      g.fillStyle = 'rgba(90,60,0,0.35)'; g.font = 'bold 11px system-ui'; g.textAlign = 'left'; g.fillText(i + 1, c.x + 9, y + 18);
    }
    // swap button
    const sw = swapRect(); const can = s.swaps > 0 && !(s.deck && s.deck.length === 0);
    g.globalAlpha = can ? 1 : 0.35; circle(g, sw.x, sw.y, sw.r, '#fbf5e4'); g.strokeStyle = '#d9c9a0'; g.lineWidth = 2; g.stroke();
    g.strokeStyle = '#6aa84f'; g.lineWidth = 3.5; g.lineCap = 'round';
    for (let k = 0; k < 2; k++) { g.beginPath(); g.arc(sw.x, sw.y, 11, k * Math.PI + 0.3, k * Math.PI + 2.6); g.stroke(); const a = k * Math.PI + 2.6, ax = sw.x + Math.cos(a) * 11, ay = sw.y + Math.sin(a) * 11; g.fillStyle = '#6aa84f'; g.beginPath(); g.moveTo(ax + Math.cos(a + 0.9) * 6, ay + Math.sin(a + 0.9) * 6); g.lineTo(ax - Math.cos(a - 0.9) * 6 * 0.2 + Math.cos(a + 2.4) * 6, ay + Math.sin(a + 2.4) * 6); g.lineTo(ax + Math.cos(a - 0.5) * 6, ay + Math.sin(a - 0.5) * 6); g.fill(); }
    g.lineCap = 'butt';
    if (s.mode === 'challenge') { g.fillStyle = '#5a3a00'; g.font = 'bold 12px system-ui'; g.textAlign = 'center'; g.fillText(s.swaps, sw.x + sw.r - 2, sw.y - sw.r + 4); }
    g.globalAlpha = 1;
    if (canUndo()) { const ur = undoRect(); circle(g, ur.x, ur.y, ur.r, '#fbf5e4'); g.strokeStyle = '#d9c9a0'; g.lineWidth = 2; g.stroke(); g.strokeStyle = '#c0703a'; g.lineWidth = 3.5; g.lineCap = 'round'; g.beginPath(); g.arc(ur.x + 2, ur.y + 2, 9, Math.PI * 1.1, Math.PI * 2.3); g.stroke(); g.lineCap = 'butt'; g.fillStyle = '#c0703a'; g.beginPath(); g.moveTo(ur.x - 13, ur.y - 4); g.lineTo(ur.x - 3, ur.y - 4); g.lineTo(ur.x - 9, ur.y + 5); g.fill(); }
    // corner buttons
    circle(g, W - 30, H - 30, 18, 'rgba(255,255,255,0.7)'); speaker(W - 30, H - 30, AU.on);
    circle(g, 30, H - 30, 18, 'rgba(255,255,255,0.7)'); house(30, H - 30);
  }
  function speaker(x, y, on) { g.fillStyle = '#5a4a30'; g.beginPath(); g.moveTo(x - 9, y - 4); g.lineTo(x - 4, y - 4); g.lineTo(x + 2, y - 9); g.lineTo(x + 2, y + 9); g.lineTo(x - 4, y + 4); g.lineTo(x - 9, y + 4); g.fill(); g.strokeStyle = '#5a4a30'; g.lineWidth = 2; if (on) { g.beginPath(); g.arc(x + 3, y, 6, -0.9, 0.9); g.stroke(); g.beginPath(); g.arc(x + 3, y, 10, -0.9, 0.9); g.stroke(); } else { g.beginPath(); g.moveTo(x + 5, y - 5); g.lineTo(x + 11, y + 5); g.moveTo(x + 11, y - 5); g.lineTo(x + 5, y + 5); g.stroke(); } }
  function house(x, y) { g.fillStyle = '#5a4a30'; g.beginPath(); g.moveTo(x - 10, y); g.lineTo(x, y - 10); g.lineTo(x + 10, y); g.fill(); g.fillRect(x - 7, y, 14, 9); g.fillStyle = '#fff'; g.fillRect(x - 2, y + 3, 4, 6); }

  // ---------- guidance (no words: a pointing hand) ----------
  function bestMove() {
    let best = null;
    for (let i = 0; i < 3; i++) { const t = s.hand[i]; if (!t) continue; for (const [q, r] of B.legalHexes(s)) { const p = B.preview(s, t, q, r); if (p && (!best || p.points > best.p.points || (p.points === best.p.points && B.hexDist(q, r) < B.hexDist(best.p.q, best.p.r)))) best = { i, p }; } }
    return best;
  }
  function idleHint() {
    if (!s || V.finale || V.fork || s.over || V.screen !== 'play') return null;
    if (s.mode !== 'cozy' || V.t - V.lastInput < 9) return null;
    if (!V.hintCache || V.hintCache.turn !== s.turn || V.hintCache.sel !== V.sel) { const b = bestMove(); V.hintCache = { turn: s.turn, sel: V.sel, b: V.sel >= 0 && s.hand[V.sel] ? bestFor(V.sel) : b && b.p }; }
    return V.hintCache.b;
  }
  function bestFor(i) { let best = null; for (const [q, r] of B.legalHexes(s)) { const p = B.preview(s, s.hand[i], q, r); if (p && (!best || p.points > best.points)) best = p; } return best; }
  // An unused idea for a while (3 placements or 15 s): bulbs bounce, sparkles fly bulb -> panel, the hand comes back.
  function ideaNudge() {
    if (!s || s.ideas <= 0 || V.finale || s.over || !B.AXES.some((a) => B.canUpgrade(s, a))) { V.ideaT = null; V.nudging = false; return false; }
    if (V.ideaT == null) { V.ideaT = V.t; V.ideaTurn = s.turn; }
    const on = V.t - V.ideaT > 15 || s.turn - V.ideaTurn >= 3;
    if (on && !V.nudging) AU.S.idea();
    V.nudging = on; return on;
  }
  function nudgeRow() { const c = B.counts(s); const ok = B.AXES.map((a, i) => [a, i]).filter(([a]) => B.canUpgrade(s, a)).sort((x, y) => c[y[0]] - c[x[0]]); return ok.length ? ok[0][1] : -1; }
  function drawGuide() {
    if (V.finale || V.fork || V.screen !== 'play') return;
    const nudge = ideaNudge();
    let from = null, to = null;
    if (s.ideas > 0 && !V.seen.upgraded) {
      const rows = techRects(); const c = B.AXES.map((a, i) => [a, i]).filter(([a]) => B.canUpgrade(s, a)).sort((x, y) => B.EMIT[y[0]][s.era[y[0]]] * B.counts(s)[y[0]] - B.EMIT[x[0]][s.era[x[0]]] * B.counts(s)[x[0]])[0];
      if (!c) return; const r = rows[c[1]]; to = { x: r.x + 20, y: r.y + r.h / 2 }; from = { x: 118, y: 58 };
    } else if (V.guide === 'place' && s.turn < 3) {
      const b = bestMove(); if (!b) return;
      const c = cardRects()[V.sel >= 0 ? V.sel : b.i];
      const target = V.sel >= 0 ? bestFor(V.sel) : b.p;
      from = { x: c.x + c.w / 2, y: c.y + c.h / 2 }; to = { x: hx(target.q, target.r), y: hy(target.q, target.r) };
      if (V.sel >= 0) from = null;
    } else if (nudge) {
      const ri = nudgeRow(); if (ri < 0) return; const r = techRects()[ri];
      from = { x: 118, y: 58 }; to = { x: r.x + 20, y: r.y + r.h / 2 };
      if (Math.random() < 0.05) V.parts.push({ k: 'beam2', x: 118, y: 58, tx: r.x + 30, ty: r.y + r.h / 2, t: 0, life: 1.1 });
    } else if (!V.seen.wished && s.turn >= 3 && !(s.ideas > 0 && !V.seen.upgraded)) {
      if (!V.wishHint || V.wishHint.turn !== s.turn || V.wishHint.n !== s.hand.join()) {
        let w = null;
        for (let i = 0; i < s.hand.length && !w; i++) for (const [q, r] of B.legalHexes(s)) { const p = B.preview(s, s.hand[i], q, r); if (p && p.wish) { w = { i, p }; break; } }
        V.wishHint = { turn: s.turn, n: s.hand.join(), w };
      }
      const w = V.wishHint.w;
      if (!w) return;
      const c = cardRects()[w.i];
      to = { x: hx(w.p.q, w.p.r), y: hy(w.p.q, w.p.r) };
      from = V.sel === w.i ? null : { x: c.x + c.w / 2, y: c.y + c.h / 2 };
    } else if (s.ideas > 0 && !V.seen.upgraded) {
      const rows = techRects(); const c = B.AXES.map((a, i) => [a, i]).filter(([a]) => s.era[a] < 3).sort((x, y) => B.counts(s)[y[0]] - B.counts(s)[x[0]])[0];
      if (!c) return; const r = rows[c[1]]; to = { x: r.x + 20, y: r.y + r.h / 2 }; from = { x: 118, y: 58 };
    }
    if (!to) return;
    const cyc = (V.t % 2.2) / 2.2;
    let x, y;
    if (from) { const e = Math.min(1, cyc / 0.7); const k = e * e * (3 - 2 * e); x = from.x + (to.x - from.x) * k; y = from.y + (to.y - from.y) * k - Math.sin(k * Math.PI) * 60; }
    else { x = to.x + Math.sin(V.t * 5) * 4; y = to.y + Math.abs(Math.sin(V.t * 4)) * 8; }
    if (!from || cyc > 0.7) { g.globalAlpha = 0.6; g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.arc(to.x, to.y, 12 + ((V.t * 1.5) % 1) * 18, 0, TAU); g.stroke(); g.globalAlpha = 1; }
    pointer(x + 6, y + 8);
  }
  function pointer(x, y) {
    g.save(); g.translate(x, y); g.rotate(-0.35);
    g.fillStyle = 'rgba(0,0,0,0.2)'; rr(-7 + 3, 4, 18, 22, 7); g.fill();
    g.fillStyle = '#ffe0c2'; g.strokeStyle = '#8a5a3a'; g.lineWidth = 2;
    rr(-4, -18, 8, 26, 4); g.fill(); g.stroke();
    rr(-8, 0, 22, 22, 8); g.fill(); g.stroke();
    g.restore();
  }


  // ---------- v0.5: the current goal (picture + a few words + progress), one step at a time ----------
  function smokyKinds() { return B.AXES.filter((a) => B.EMIT[a][s.era[a]] > 0); }
  function goalStage() {
    if (!s || V.finale) return null;
    if (s.turn === 0) return 'place';
    if (!s.ideasSpent && s.ideas === 0) return 'friends';
    if (!s.ideasSpent) return 'idea';
    return smokyKinds().length ? 'clean' : 'crown';
  }
  function toast(text, pic) { (V.toastQ = V.toastQ || []).push({ text, pic }); if (V.toastQ.length > 3) V.toastQ.shift(); }
  function smogBadge(x, y, em, sc) {
    // Little in-world cue: grey puffs = this makes smoke; green leaf = this cleans the air.
    if (!em) return;
    g.save(); g.translate(x, y); g.scale(sc, sc);
    if (em > 0) { const n = Math.min(3, em); for (let i = 0; i < n; i++) { const dx = (i - (n - 1) / 2) * 7, dy = -Math.sin(V.t * 2 + i) * 1.2 - (i % 2) * 3; circle(g, dx, dy, 5.2, 'rgba(255,255,255,0.85)'); circle(g, dx, dy, 4.2, '#7d7468'); } }
    else { const n = Math.min(3, -em); for (let i = 0; i < n; i++) { g.save(); g.translate((i - (n - 1) / 2) * 9, 0); g.rotate(-0.5 + i * 0.4); circle(g, 0, 0, 6, 'rgba(255,255,255,0.85)'); crownGlyph(0, 0, 5, 'leaf'); g.restore(); } }
    g.restore();
  }
  function goalPic(pic, x, y) {
    // 54x40 picture, centred on (x, y)
    const k = pic.k;
    if (k === 'place') { g.fillStyle = '#fbf5e4'; rr(x - 26, y - 14, 20, 26, 4); g.fill(); g.strokeStyle = '#d9c9a0'; g.lineWidth = 1.5; g.stroke(); ART.drawBuilding(g, 'home', s.era.home, s.variant.home, x - 16, y + 4, 9, V.t, false); g.fillStyle = '#e8a020'; g.beginPath(); g.moveTo(x - 2, y - 4); g.lineTo(x + 5, y); g.lineTo(x - 2, y + 4); g.fill(); hexPath(x + 17, y + 2, 11); g.fillStyle = '#8fd66a'; g.fill(); g.strokeStyle = '#fff'; g.stroke(); }
    else if (k === 'friends') { ART.drawBuilding(g, 'home', s.era.home, s.variant.home, x - 14, y + 10, 13, V.t, false); ART.drawBuilding(g, 'wild', s.era.wild, s.variant.wild, x + 14, y + 10, 13, V.t, false); heart(x, y - 8 + Math.sin(V.t * 5) * 1.5, 7, '#ff5c86'); }
    else if (k === 'friends2') {}
    else if (k === 'sun') { sunIcon(x - 13, y, 8); g.fillStyle = '#e8a020'; g.beginPath(); g.moveTo(x - 1, y - 4); g.lineTo(x + 5, y); g.lineTo(x - 1, y + 4); g.fill(); bulb(x + 17, y + 1, 0.85, true); }
    else if (k === 'idea') { bulb(x - 16, y, 0.8, true); g.fillStyle = '#e8a020'; g.beginPath(); g.moveTo(x - 4, y - 4); g.lineTo(x + 2, y); g.lineTo(x - 4, y + 4); g.fill(); g.fillStyle = 'rgba(255,248,210,1)'; rr(x + 5, y - 11, 22, 22, 5); g.fill(); g.strokeStyle = '#ffbe28'; g.lineWidth = 2; g.stroke(); ART.drawBuilding(g, 'power', s.era.power, s.variant.power, x + 16, y + 8, 8, V.t, false); }
    else if (k === 'clean') { ART.drawBuilding(g, 'make', 0, null, x - 12, y + 12, 13, V.t, false); smogBadge(x - 10, y - 14, 3, 0.8); g.strokeStyle = '#e05050'; g.lineWidth = 3; g.beginPath(); g.moveTo(x - 20, y - 20); g.lineTo(x, y - 8); g.stroke(); g.fillStyle = '#e8a020'; g.beginPath(); g.moveTo(x + 4, y - 4); g.lineTo(x + 10, y); g.lineTo(x + 4, y + 4); g.fill(); ART.drawBuilding(g, 'power', 2, null, x + 20, y + 12, 12, V.t, false); }
    else if (k === 'crown') { crownGlyph(x - 10, y, 11, 'leaf'); crownGlyph(x + 12, y, 11, 'star'); }
    else if (k === 'bld') { glowDot(g, x, y, 30, pic.clean ? '#c8ff9a' : '#fff27a', 0.7); ART.drawBuilding(g, pic.axis, pic.era, pic.v, x, y + 12, 16, V.t, false); if (pic.clean) smogBadge(x + 18, y - 12, -1, 0.9); }
    else if (k === 'critter') { glowDot(g, x, y, 28, '#fff27a', 0.6); ART.drawCritter(g, pic.id, x, y + 10, 1.5, V.t, 0); }
  }
  function goalInfo() {
    const st = goalStage(); if (!st) return null;
    if (st === 'place') return { st, pic: { k: 'place' }, text: 'Pick a card, then tap the land' };
    if (st === 'friends') { const n0 = s.sunLevel ? B.sunNeed(s.sunLevel) : 0, n1 = B.sunNeed(s.sunLevel + 1); return { st, pic: { k: 'friends' }, text: 'Friends side by side \u2665 fill the sun \u2600 for an idea', sunbar: true, bar: Math.max(0, Math.min(1, (s.sun - n0) / (n1 - n0))) }; }
    if (st === 'idea') return { st, pic: { k: 'idea' }, text: 'Tap a glowing row: every one of that kind upgrades' };
    if (st === 'clean') { const n = smokyKinds().length; if (s.ideas > 0 && V.nudging) return { st, pic: { k: 'idea' }, text: 'You have an idea: tap a smoky row', smoke: true }; return { st, pic: { k: 'clean' }, text: n === 1 ? 'Clear the smoke: 1 smoky kind left' : 'Clear the smoke: ' + n + ' smoky kinds left', smoke: true }; }
    const n = B.AXES.filter((a) => s.era[a] === 3).length;
    if (s.ideas > 0 && V.nudging) return { st, pic: { k: 'idea' }, text: 'You have an idea: tap a row', crowns: n };
    return { st, pic: { k: 'crown' }, text: 'Sky is clear! Bring every row to the top for the crown', crowns: n };
  }
  function drawGoal(dt) {
    if (V.fork || V.screen !== 'play') return;
    const info = goalInfo(); if (!info) return;
    if (info.st !== V.goalStage) { if (V.goalStage) { V.goalPop = V.t; AU.S.goal(); } V.goalStage = info.st; }
    let pic = info.pic, text = info.text, tst = false;
    if (V.toast && V.t - V.toast.t >= 4) V.toast = null;
    const focus = info.st === 'idea' && !V.seen.upgraded; // never cover the first 'tap a row' instruction
    if (!V.toast && !focus && V.toastQ && V.toastQ.length) { V.toast = Object.assign({ t: V.t }, V.toastQ.shift()); AU.S.goal(); }
    if (V.toast) { pic = V.toast.pic; text = V.toast.text; tst = true; }
    const pop = Math.max(tst ? V.toast.t : 0, V.goalPop), pk = V.t - pop < 0.6 ? Math.sin((V.t - pop) / 0.6 * Math.PI) * 0.12 : 0;
    const hasProg = !tst && (info.pips || info.bar !== undefined || info.smoke || info.crowns !== undefined);
    const pw = hasProg ? (info.bar !== undefined ? 70 : 8 * 11 + 6) : 0, avail = W - 40 - 88 - (pw ? pw + 18 : 0);
    let fs = 15; g.font = `bold ${fs}px "Trebuchet MS", system-ui, sans-serif`; while (g.measureText(text).width > avail && fs > 12) { fs--; g.font = `bold ${fs}px "Trebuchet MS", system-ui, sans-serif`; }
    const lines = g.measureText(text).width > avail ? wrap(text, avail) : [text];
    const tw = Math.max(...lines.map((l) => g.measureText(l).width)), w = Math.min(W - 40, 70 + tw + (pw ? pw + 18 : 0) + 18), h = lines.length > 1 ? 58 : 48;
    const cx = (W - panelW()) / 2, cy = 34;
    g.save(); g.translate(cx, cy); g.scale(1 + pk, 1 + pk);
    g.fillStyle = 'rgba(40,40,20,0.16)'; rr(-w / 2 + 2, -h / 2 + 4, w, h, 24); g.fill();
    g.fillStyle = tst ? 'rgba(255,252,228,0.97)' : 'rgba(255,250,236,0.94)'; rr(-w / 2, -h / 2, w, h, 24); g.fill();
    g.strokeStyle = tst ? '#ffcf3f' : '#e6d4a6'; g.lineWidth = tst ? 3 : 2; g.stroke();
    goalPic(pic, -w / 2 + 36, 0);
    g.fillStyle = '#5a3a00'; g.textAlign = 'left'; g.textBaseline = 'middle'; lines.forEach((l, i) => g.fillText(l, -w / 2 + 70, 1 + (i - (lines.length - 1) / 2) * (fs + 3)));
    if (hasProg) {
      const px = w / 2 - pw - 16;
      if (info.bar !== undefined) { g.fillStyle = 'rgba(0,0,0,0.1)'; rr(px, -5, pw, 10, 5); g.fill(); g.fillStyle = '#ffb627'; rr(px, -5, Math.max(10, pw * info.bar), 10, 5); g.fill(); }
      else if (info.pips) { for (let i = 0; i < info.pips[1]; i++) circle(g, px + 10 + i * 16, 0, 5, i < info.pips[0] ? '#ff5c86' : 'rgba(0,0,0,0.13)'); }
      else if (info.smoke) { B.AXES.forEach((a, i) => { const sm = B.EMIT[a][s.era[a]] > 0; circle(g, px + 5 + i * 11, 0, 4.6, sm ? '#7d7468' : '#7ed957'); }); }
      else { B.AXES.forEach((a, i) => { const x0 = px + 5 + i * 11; if (s.era[a] === 3) crownGlyph(x0, 0, 5, s.variant[a]); else circle(g, x0, 0, 3.5, 'rgba(0,0,0,0.15)'); }); }
    }
    g.restore();
  }
  // First idea ever: dim the rest of the screen so the bulb and the tech rows are the only bright things.
  function spotlight() {
    if (goalStage() !== 'idea' || V.seen.upgraded || V.fork) return;
    const rows = techRects(), r0 = rows[0], rl = rows[rows.length - 1];
    const a = Math.min(1, (V.t - (V.spotT || (V.spotT = V.t))) / 0.6) * 0.32;
    g.save(); g.fillStyle = `rgba(30,28,20,${a})`; g.beginPath(); g.rect(0, 0, W, H);
    const hole = (x, y, w, h, rad) => { g.moveTo(x + rad, y); g.arcTo(x, y, x, y + h, rad); g.arcTo(x, y + h, x + w, y + h, rad); g.arcTo(x + w, y + h, x + w, y, rad); g.arcTo(x + w, y, x, y, rad); g.closePath(); };
    const minX = Math.min(...rows.map((r) => r.x)), maxX = Math.max(...rows.map((r) => r.x + r.w));
    hole(minX - 8, r0.y - 8, maxX - minX + 16, rl.y + rl.h - r0.y + 16, 14);
    hole(92, 28, 30 * Math.max(1, Math.min(8, s.ideas)) + 26, 60, 26);
    g.fill('evenodd'); g.restore();
  }

  // ---------- v0.6: picture thought bubbles (why neighbours like / dislike each other) ----------
  // items: {q, r (thinker), oq, or (the other tile), why, kind: 'like'|'frown'|'unfrown', a?, k?}
  function drawThoughts(items, alpha = 1, obstacles = []) {
    const u = V.u, R = Math.max(15, Math.min(21, u * 0.5));
    // busy spots: one bubble per (reason, like/frown) with a count, so a crowded town doesn't become a wall of bubbles
    if (items.length > 5) { const m = new Map(); for (const it of items) { const kk = it.why + '|' + it.kind; if (m.has(kk)) m.get(kk).n++; else m.set(kk, Object.assign({}, it, { n: 1 })); } items = [...m.values()]; }
    // 1) fan each thinker's bubbles over its roof, leaning toward the tile it is thinking about
    const by = {}; for (const it of items) (by[it.q + ',' + it.r] = by[it.q + ',' + it.r] || []).push(it);
    const bs = [];
    for (const k in by) {
      const list = by[k].slice().sort((p1, p2) => hx(p1.oq, p1.or) - hx(p2.oq, p2.or));
      list.forEach((it, j) => {
        const x0 = hx(it.q, it.r), y0 = hy(it.q, it.r) - u * 0.6, dx = hx(it.oq, it.or) - hx(it.q, it.r);
        const lean = Math.max(-1, Math.min(1, dx / (u * 1.7)));
        const n = list.length, ang = -Math.PI / 2 + (n > 1 ? (j - (n - 1) / 2) * 0.75 : lean * 0.55);
        const d = R * 2.3 + (n > 2 ? R * 0.4 : 0);
        bs.push({ it, x0, y0, x: x0 + Math.cos(ang) * d, y: y0 + Math.sin(ang) * d * 0.9 });
      });
    }
    // 2) push overlapping bubbles apart (and away from the points bubble)
    for (let iter = 0; iter < 14; iter++) {
      for (let i = 0; i < bs.length; i++) {
        for (let j = i + 1; j < bs.length; j++) { const A = bs[i], Bb = bs[j], dx = Bb.x - A.x, dy = Bb.y - A.y, dd = Math.hypot(dx, dy) || 0.01, m = 2 * R + 6; if (dd < m) { const push = (m - dd) / 2, ux = dx / dd, uy = dy / dd; A.x -= ux * push; A.y -= uy * push; Bb.x += ux * push; Bb.y += uy * push; } }
        for (const o of obstacles) { const A = bs[i], dx = A.x - o.x, dy = A.y - o.y, dd = Math.hypot(dx, dy) || 0.01, m = R + o.r + 4; if (dd < m) { A.x += dx / dd * (m - dd); A.y += dy / dd * (m - dd); } }
      }
    }
    // 3) draw: thought dots down to the thinker's roof, bubble, reason picture, heart / frown badge
    bs.forEach((bb, j) => {
      const it = bb.it, bx = bb.x, by0 = bb.y;
      const pop = it.k !== undefined ? Math.min(1, it.k * 7) : 1, sc = (0.6 + 0.4 * pop) * (pop < 1 ? 1 : 1 + 0.03 * Math.sin(V.t * 3 + j));
      g.globalAlpha = alpha * (it.a === undefined ? 1 : it.a);
      const like = it.kind !== 'frown';
      const fill = like ? 'rgba(255,255,255,0.97)' : 'rgba(228,229,233,0.97)', rim = it.kind === 'like' ? '#ff8fae' : it.kind === 'unfrown' ? '#7fd06a' : '#8f969e';
      const vx = bb.x0 - bx, vy = bb.y0 - by0, vl = Math.hypot(vx, vy) || 1;
      for (let d = 1; d <= 2; d++) { const f = (R + 4 + d * (vl - R - 4) / 3) / vl; circle(g, bx + vx * f, by0 + vy * f, R * (0.28 - d * 0.08), rim); }
      g.save(); g.translate(bx, by0); g.scale(sc, sc);
      g.fillStyle = 'rgba(40,40,20,0.18)'; g.beginPath(); g.arc(1.5, 3, R + 2, 0, TAU); g.fill();
      circle(g, 0, 0, R + 2, rim); circle(g, 0, 0, R, fill);
      ART.drawReason(g, it.why, 0, 0, R * 0.78, V.t);
      if (it.kind === 'unfrown') { g.strokeStyle = '#e0503a'; g.lineWidth = Math.max(2, R * 0.16); g.beginPath(); g.moveTo(-R * 0.6, -R * 0.6); g.lineTo(R * 0.6, R * 0.6); g.stroke(); }
      if (like) ART.heartBadge(g, R * 0.8, -R * 0.74, R * 0.42); else ART.frownBadge(g, R * 0.82, -R * 0.76, R * 0.42);
      if (it.n > 1) { circle(g, R * 0.78, R * 0.72, R * 0.42, rim); g.fillStyle = '#fff'; g.font = `bold ${Math.round(R * 0.5)}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('\u00d7' + it.n, R * 0.78, R * 0.74); }
      g.restore();
    });
    g.globalAlpha = 1;
  }

  // ---------- v0.6: tech cards ----------
  function wrap(text, maxW) { const out = []; let line = ''; for (const w of text.split(' ')) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; } if (line) out.push(line); return out; }
  function openCard(cd) {
    if (V.finale || V.screen !== 'play') return;
    if (V.card) { (V.cardQ = V.cardQ || []).push(cd); return; }
    V.card = Object.assign({}, cd, { t: V.t }); V.peek = null; V.press = null;
  }
  function closeCard() { V.card = null; if (V.cardQ && V.cardQ.length) openCard(V.cardQ.shift()); }
  function cardClick(x, y) {
    if (V.t - V.card.t < 0.35) return; // don't let a double tap skip the card
    closeCard();
  }
  // Who this tech is good / bad next to (at that tech step), with the reason picture.
  function neighbourItems(axis, era, variant) {
    const tmp = Object.assign({}, s, { era: Object.assign({}, s.era, { [axis]: era }), variant: Object.assign({}, s.variant, { [axis]: era === 3 ? variant : s.variant[axis] }) });
    const good = [], bad = [];
    for (const b of B.AXES) { const ops = B.linkOps(tmp, axis, b); const p = ops.find((o) => o.v > 0), m = ops.find((o) => o.v < 0); if (p) good.push({ b, why: p.why }); if (m) bad.push({ b, why: m.why }); }
    return { good, bad, tmp };
  }
  function drawTechCard(x, y, w, h, axis, era, variant, o = {}) {
    const tc = TECHS.tech(axis, era, variant), cmp = !!o.compact, em = B.EMIT[axis][era];
    g.fillStyle = 'rgba(40,40,20,0.25)'; rr(x + 4, y + 6, w, h, 18); g.fill();
    g.fillStyle = '#fffaf0'; rr(x, y, w, h, 18); g.fill(); g.strokeStyle = era === 3 ? (variant === 'star' ? '#7fd0ff' : '#8fd46a') : '#e8c76a'; g.lineWidth = cmp ? 3 : 5; g.stroke();
    const side = w >= (cmp ? 280 : 520), pad = cmp ? 10 : 16;
    const iw = side ? w * (cmp ? 0.32 : 0.4) : w - pad * 2, ih = side ? h - pad * 2 : h * 0.42;
    const ix = x + pad, iy = y + pad;
    // illustration: a little world for the building (smoky sky if it smokes)
    g.save(); rr(ix, iy, iw, ih, 12); g.clip();
    const smoky = em > 0, sg = g.createLinearGradient(0, iy, 0, iy + ih);
    sg.addColorStop(0, smoky ? '#c9c6b8' : '#9fd8ff'); sg.addColorStop(1, smoky ? '#e2dccb' : '#e6f7ff'); g.fillStyle = sg; g.fillRect(ix, iy, iw, ih);
    circle(g, ix + iw * 0.8, iy + ih * 0.2, Math.min(iw, ih) * 0.09, smoky ? 'rgba(255,230,160,0.6)' : '#ffe066');
    if (smoky) for (let i = 0; i < 3 + em * 2; i++) { const px = ix + ((i * 53 + V.t * 9) % iw), py = iy + ih * (0.15 + (i % 3) * 0.12); circle(g, px, py, ih * 0.07, 'rgba(110,102,92,0.25)'); }
    ell(g, ix + iw / 2, iy + ih * 0.98, iw * 0.75, ih * 0.3, smoky ? '#a9a77a' : '#8fd46a');
    ell(g, ix + iw * 0.15, iy + ih, iw * 0.4, ih * 0.18, smoky ? '#9a9870' : '#7cc65a');
    const bu = Math.min(iw * 0.36, ih * 0.42);
    ART.drawBuilding(g, axis, era, era === 3 ? variant : null, ix + iw / 2, iy + ih * 0.8, bu, V.t, false);
    g.restore();
    smogBadge(ix + iw - 18, iy + 18, em, cmp ? 1 : 1.3);
    if (o.ribbon) { g.font = `bold ${cmp ? 12 : 15}px "Trebuchet MS", system-ui`; const rw = g.measureText(o.ribbon).width + 20; g.fillStyle = '#ff7a59'; rr(ix + 6, iy + 6, rw, cmp ? 20 : 26, 10); g.fill(); g.fillStyle = '#fff'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(o.ribbon, ix + 16, iy + 6 + (cmp ? 10 : 13)); }
    // era pips
    for (let k2 = 0; k2 < 4; k2++) circle(g, ix + 12 + k2 * (cmp ? 11 : 14), iy + ih - 12, cmp ? 4 : 5, k2 <= era ? (k2 === 3 ? (variant === 'star' ? '#7fd0ff' : '#7ed957') : '#ffb627') : 'rgba(0,0,0,0.18)');
    // words
    let tx = side ? ix + iw + pad : x + pad, ty = side ? y + pad + 4 : iy + ih + 10; const tw = side ? x + w - pad - tx : w - pad * 2;
    g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillStyle = '#4a3510'; g.font = `bold ${cmp ? 17 : 26}px "Trebuchet MS", system-ui`; for (const ln of wrap(tc.name, tw)) { g.fillText(ln, tx, ty); ty += cmp ? 20 : 30; }
    ty += cmp ? 2 : 4;
    g.fillStyle = '#5a4a30'; g.font = `${cmp ? 13 : 17}px system-ui`; for (const ln of wrap(tc.line, tw)) { g.fillText(ln, tx, ty); ty += cmp ? 16 : 22; }
    ty += cmp ? 5 : 8;
    house(tx + 10, ty + (cmp ? 8 : 9)); g.fillStyle = '#7a5a20'; g.font = `bold ${cmp ? 12 : 15}px system-ui`; g.fillText('In your town', tx + 26, ty + 1); ty += cmp ? 17 : 21;
    g.fillStyle = '#5a4a30'; g.font = `${cmp ? 12 : 15}px system-ui`; for (const ln of wrap(tc.town, tw)) { g.fillText(ln, tx, ty); ty += cmp ? 15 : 20; }
    // good / bad neighbours with the reason picture
    const nb = neighbourItems(axis, era, variant), cr = cmp ? 13 : 20;
    ty += cmp ? 4 : 8;
    const row = (items, good) => {
      if (!items.length) return;
      if (good) heart(tx + 7, ty + (cmp ? 6 : 8), cmp ? 5 : 7, '#ff5c86'); else ART.frownBadge(g, tx + 7, ty + (cmp ? 6 : 8), cmp ? 5 : 7);
      g.fillStyle = good ? '#c0406a' : '#6a7078'; g.font = `bold ${cmp ? 11 : 14}px system-ui`; g.textBaseline = 'top'; g.fillText(good ? 'Happy next to' : 'Grumpy next to', tx + 18, ty);
      ty += cmp ? 14 : 19;
      const cy = ty + cr + 1, step = Math.min(cr * 2 + (cmp ? 8 : 14), (tw - 4) / items.length);
      items.forEach((it, j) => {
        const cx = tx + cr + 2 + j * step;
        circle(g, cx, cy, cr, good ? '#e3f4d6' : '#e6e6e2'); g.strokeStyle = good ? '#ffb3c6' : '#b8bcc2'; g.lineWidth = 1.5; g.beginPath(); g.arc(cx, cy, cr, 0, TAU); g.stroke();
        g.save(); g.beginPath(); g.arc(cx, cy, cr - 1, 0, TAU); g.clip(); ART.drawBuilding(g, it.b, nb.tmp.era[it.b], nb.tmp.variant[it.b], cx, cy + cr * 0.6, cr * 0.95, V.t, false); g.restore();
        const rx = cx + cr * 0.78, ry = cy + cr * 0.62, rR = cr * 0.56;
        circle(g, rx, ry, rR + 1.5, good ? '#ff8fae' : '#8f969e'); circle(g, rx, ry, rR, '#fff');
        ART.drawReason(g, it.why, rx, ry, rR * 0.8, V.t);
      });
      ty += cr * 2 + (cmp ? 6 : 10);
    };
    if (!o.noNeighbours) { row(nb.good, true); row(nb.bad, false); }
    return ty;
  }
  function drawCard() {
    const C = V.card; if (!C) return;
    const a = Math.min(1, (V.t - C.t) / 0.25), e = 1 - Math.pow(1 - a, 3);
    g.fillStyle = `rgba(30,30,50,${0.5 * a})`; g.fillRect(0, 0, W, H);
    const w = Math.min(640, W - 28), h = Math.min(W < 560 ? 540 : 380, H - 60), x = W / 2 - w / 2, y = H / 2 - h / 2 + (1 - e) * 40;
    g.save(); g.globalAlpha = a;
    drawTechCard(x, y, w, h - 40, C.axis, C.era, C.variant, { ribbon: 'New!' });
    const byy = y + h - 28;
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.font = 'bold 15px system-ui'; g.textAlign = 'center'; g.fillText('Tap anywhere to keep building \u2192', W / 2, byy);
    g.restore(); g.globalAlpha = 1;
  }
  // hover (mouse, 0.35 s) or long-press (touch, 0.45 s) on a tech row: what the NEXT step is
  function peekTick() {
    if (V.card) return;
    if (V.press && !V.peek && V.t - V.press.t > 0.45) { V.peek = { axis: V.press.axis, sticky: true, fromPress: true, t: V.t }; AU.S.pick(); }
    if (V.hoverRow && !V.peek && !V.press && V.t - V.hoverRow.t > 0.35) V.peek = { axis: V.hoverRow.axis, t: V.t };
  }
  function drawPeek() {
    const P = V.peek; if (!P || !s) return;
    const a = Math.min(1, (V.t - P.t) / 0.18), ax = P.axis, era = s.era[ax], ri = B.AXES.indexOf(ax), row = techRects()[ri];
    const cards = era === 2 ? [[3, 'leaf', 'Nature future'], [3, 'star', 'Tech future']] : era === 3 ? [[3, s.variant[ax], 'You have']] : [[era + 1, null, 'Next idea']];
    const cw = Math.min(310, (W - 40) / cards.length - 10), ch = 300, total = cards.length * cw + (cards.length - 1) * 10;
    let x0, y0;
    if (portrait()) { x0 = W / 2 - total / 2; y0 = Math.max(10, row.y - ch - 12); }
    else { x0 = row.x - total - 14; y0 = Math.max(70, Math.min(H - ch - cardH() - 30, row.y + row.h / 2 - ch / 2)); }
    g.save(); g.globalAlpha = a;
    cards.forEach(([e2, v2, lab], i) => drawTechCard(x0 + i * (cw + 10), y0, cw, ch, ax, e2, v2 || s.variant[ax], { compact: true, ribbon: lab }));
    if (!portrait()) { g.fillStyle = '#fffaf0'; g.beginPath(); g.moveTo(x0 + total, row.y + row.h / 2 - 9); g.lineTo(x0 + total + 12, row.y + row.h / 2); g.lineTo(x0 + total, row.y + row.h / 2 + 9); g.fill(); }
    g.restore(); g.globalAlpha = 1;
  }

  // ---------- fork chooser ----------
  function forkRects() { const r = Math.min(110, W * 0.14), cy = H * 0.48; return [{ v: 'leaf', x: W / 2 - r * 1.35, y: cy, r }, { v: 'star', x: W / 2 + r * 1.35, y: cy, r }]; }
  function drawFork() {
    if (!V.fork) return;
    const a = Math.min(1, (V.t - V.fork.t) / 0.3);
    g.fillStyle = `rgba(30,30,50,${0.5 * a})`; g.fillRect(0, 0, W, H);
    for (const f of forkRects()) {
      const hov = Math.hypot(V.mouse.x - f.x, V.mouse.y - f.y) < f.r, sc = (hov ? 1.06 : 1) * (0.7 + 0.3 * a);
      const leaf = f.v === 'leaf';
      g.save(); g.translate(f.x, f.y); g.scale(sc, sc);
      glowDot(g, 0, 0, f.r * 1.5, leaf ? '#c8ff9a' : '#9fe4ff', 0.5);
      const bg = g.createRadialGradient(0, -f.r * 0.3, 4, 0, 0, f.r); bg.addColorStop(0, leaf ? '#fff6d0' : '#e6f4ff'); bg.addColorStop(1, leaf ? '#9fd877' : '#6c8fd8'); g.fillStyle = bg; g.beginPath(); g.arc(0, 0, f.r, 0, TAU); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 5; g.stroke();
      ART.drawBuilding(g, V.fork.axis, 3, f.v, 0, f.r * 0.45, f.r * 0.62, V.t, !leaf);
      g.restore();
      crownGlyph(f.x, f.y - f.r - 26, 18 * sc, f.v);
      g.globalAlpha = a; g.font = 'bold 17px "Trebuchet MS", system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 5; g.strokeStyle = 'rgba(30,30,50,0.6)';
      const tc = TECHS.tech(V.fork.axis, 3, f.v), colW = Math.min(f.r * 2.4, W / 2 - 16); let ly = f.y + f.r + 26;
      for (const ln of wrap(tc.name, colW)) { g.strokeText(ln, f.x, ly); g.fillStyle = '#fff'; g.fillText(ln, f.x, ly); ly += 20; }
      g.font = 'bold 12px system-ui'; g.fillStyle = leaf ? '#d6ffbf' : '#cdeeff'; g.fillText(leaf ? 'nature future' : 'tech future', f.x, ly); ly += 20;
      g.font = '13px system-ui'; g.fillStyle = 'rgba(255,255,255,0.92)'; wrap(tc.line, colW).forEach((ln, j) => g.fillText(ln, f.x, ly + j * 17)); g.globalAlpha = 1;
    }
    g.globalAlpha = a; g.font = 'bold 15px system-ui'; g.fillStyle = 'rgba(255,255,255,0.85)'; g.textAlign = 'center'; wrap('Pick a future. The crown goes to the side you pick most.', W - 30).forEach((ln, j, arr) => g.fillText(ln, W / 2, H * 0.48 - Math.min(110, W * 0.14) - 70 - (arr.length - 1 - j) * 18)); g.globalAlpha = 1;
  }
  function forkClick(x, y) { for (const f of forkRects()) if (Math.hypot(x - f.x, y - f.y) < f.r) { doUpgrade(V.fork.axis, f.v); return; } V.fork = null; }

  // ---------- finale ----------
  function drawFinale(dt) {
    const F = V.finale; if (!F) return;
    const ft = V.t - F.t, leaf = F.crown === 'leaf';
    // lanterns / drones rising
    for (const l of F.lanterns) {
      const y = H * (l.y - ((ft * l.sp) % 1.4)), x = W * l.x + Math.sin(V.t + l.ph) * 12;
      if (ft < 2) continue;
      const a = Math.min(1, (ft - 2) / 2);
      if (leaf) { glowDot(g, x, y, 16, '#ffd27a', 0.5 * a); g.globalAlpha = a; g.fillStyle = mix('#ff9a4a', '#ffd25a', l.c); rr(x - 4, y - 6, 8, 11, 3); g.fill(); g.globalAlpha = 1; }
      else { glowDot(g, x, y, 12, ['#7fe8ff', '#c08bff', '#8bffc8'][Math.floor(l.c * 3)], 0.6 * a); circle(g, x, y, 1.8, '#fff'); }
    }
    if (ft > 1 && Math.random() < 0.3) V.parts.push({ k: leaf ? 'leaf' : 'spark', x: Math.random() * W, y: -10, vx: 0.4, vy: 0.9 + Math.random(), life: 6, t: 0, ph: Math.random() * 6, c: leaf ? ['#ff9ab8', '#ffd34d', '#9fe07a'][Math.floor(Math.random() * 3)] : '#cfefff' });
    if (ft > 6) {
      const a = Math.min(1, (ft - 6) / 1.5);
      g.globalAlpha = a;
      const cx = W / 2, cy = H - 190;
      g.fillStyle = 'rgba(255,255,255,0.88)'; rr(cx - 200, cy - 60, 400, 150, 26); g.fill();
      crownGlyph(cx, cy - 18, 30, F.crown);
      g.fillStyle = leaf ? '#3f7a2a' : '#2a4f8a'; g.font = 'bold 30px "Trebuchet MS", system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('BRIGHTFIELD', cx, cy + 26);
      // stats as icons
      const st = [[() => house(cx - 110, cy + 64), Object.keys(s.tiles).length], [() => ART.drawCritter(g, 'fox', cx - 10, cy + 70, 1.1, V.t, 0), s.critterCount], [() => sunIcon(cx + 90, cy + 64, 7), s.sun]];
      st.forEach(([fn, n], i) => { fn(); g.fillStyle = '#5a3a00'; g.font = 'bold 18px system-ui'; g.textAlign = 'left'; g.fillText(n, cx - 90 + i * 100 + (i === 2 ? 14 : 0), cy + 66); });
      // buttons: keep building (play) / new town
      const bx = finaleButtons();
      for (const b of bx) { circle(g, b.x, b.y, 26, b.k === 'keep' ? '#7ed957' : '#ffcf3f'); g.strokeStyle = '#fff'; g.lineWidth = 3; g.stroke(); if (b.k === 'keep') { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(b.x - 7, b.y - 11); g.lineTo(b.x + 11, b.y); g.lineTo(b.x - 7, b.y + 11); g.fill(); } else { g.strokeStyle = '#fff'; g.lineWidth = 4; g.beginPath(); g.arc(b.x, b.y, 11, 0.6, 5.6); g.stroke(); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(b.x + 14, b.y - 13); g.lineTo(b.x + 13, b.y - 2); g.lineTo(b.x + 3, b.y - 7); g.fill(); } }
      g.globalAlpha = 1;
    }
  }
  function finaleButtons() { const cx = W / 2; return [{ k: 'keep', x: cx - 40, y: H - 40 }, { k: 'new', x: cx + 40, y: H - 40 }]; }
  function finaleClick(x, y) {
    if (V.t - V.finale.t < 6) return;
    for (const b of finaleButtons()) if (Math.hypot(x - b.x, y - b.y) < 28) {
      if (b.k === 'keep') { s.over = false; V.finale = null; AU.update({ finale: null }); fitBoard(); }
      else { try { localStorage.removeItem(SAVE); } catch (e) {} V.finale = null; AU.update({ finale: null }); V.screen = 'title'; }
    }
  }

  // ---------- title ----------
  function titleButtons() { const cx = W / 2, cy = H * 0.62; const sv = loadSave(); const b = [{ k: 'cozy', x: cx - 90, y: cy, r: 52 }, { k: 'challenge', x: cx + 90, y: cy, r: 40 }]; if (sv) b.push({ k: 'new', x: cx - 90 + 56, y: cy + 50, r: 24 }); return b; }
  function titleClick(x, y) {
    for (const b of titleButtons()) if (Math.hypot(x - b.x, y - b.y) < b.r) {
      AU.S.pick();
      if (b.k === 'cozy') { const sv = loadSave(); if (sv && sv.mode === 'cozy') start({ mode: 'cozy', seed: sv.seed }, sv.log); else start({ mode: 'cozy', seed: (Date.now() % 1e9) | 0 }); }
      else if (b.k === 'new') { try { localStorage.removeItem(SAVE); } catch (e) {} start({ mode: 'cozy', seed: (Date.now() % 1e9) | 0 }); }
      else start({ mode: 'challenge', seed: dailySeed() });
      return;
    }
  }
  function dailySeed() { const d = new Date(); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }
  function drawTitle() {
    if (!V.titleTown) { V.titleTown = B.newGame({ mode: 'cozy', seed: 7 }); demoFill(V.titleTown, 40); }
    const keep = s; s = V.titleTown; fitBoard();
    V.smog += ((B.smogLevel(s)) - V.smog) * 0.02; V.vivid = 1 - V.smog;
    sky(); haze(); drawBoard(); travellers(1 / 60); drawParticles(1 / 60);
    s = keep; if (s) fitBoard();
    { const rg = g.createRadialGradient(W / 2, H * 0.48, 10, W / 2, H * 0.48, Math.max(W, H) * 0.55); rg.addColorStop(0, 'rgba(255,250,235,0.7)'); rg.addColorStop(0.6, 'rgba(255,250,235,0.35)'); rg.addColorStop(1, 'rgba(255,250,235,0)'); g.fillStyle = rg; g.fillRect(0, 0, W, H); }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `bold ${Math.min(72, W * 0.08)}px "Trebuchet MS", system-ui, sans-serif`;
    g.lineWidth = 10; g.strokeStyle = '#fff'; g.strokeText('BRIGHTFIELD', W / 2, H * 0.34); const tg = g.createLinearGradient(0, H * 0.3, 0, H * 0.38); tg.addColorStop(0, '#ffb627'); tg.addColorStop(1, '#5aa83c'); g.fillStyle = tg; g.fillText('BRIGHTFIELD', W / 2, H * 0.34);
    // smoky -> bright strip
    const sx = W / 2 - 150; ['#8b8070', '#a8a48a', '#8fcf6a', '#5fb0ff'].forEach((c, i) => { circle(g, sx + i * 100, H * 0.45, 8, c); if (i < 3) { g.strokeStyle = c; g.lineWidth = 3; g.beginPath(); g.moveTo(sx + i * 100 + 12, H * 0.45); g.lineTo(sx + i * 100 + 88, H * 0.45); g.stroke(); } });
    sunIcon(sx + 300, H * 0.45, 9);
    for (const b of titleButtons()) {
      const hov = Math.hypot(V.mouse.x - b.x, V.mouse.y - b.y) < b.r;
      const r = b.r * (hov ? 1.07 : 1) * (b.k === 'cozy' ? 1 + Math.sin(V.t * 2.5) * 0.03 : 1);
      if (b.k === 'cozy') { glowDot(g, b.x, b.y, r * 1.8, '#fff1a0', 0.7); circle(g, b.x, b.y, r, '#7ed957'); g.strokeStyle = '#fff'; g.lineWidth = 5; g.stroke(); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(b.x - r * 0.3, b.y - r * 0.42); g.lineTo(b.x + r * 0.46, b.y); g.lineTo(b.x - r * 0.3, b.y + r * 0.42); g.fill(); }
      else if (b.k === 'challenge') { circle(g, b.x, b.y, r, '#ffcf3f'); g.strokeStyle = '#fff'; g.lineWidth = 4; g.stroke(); for (let k = 3; k >= 1; k--) circle(g, b.x, b.y - 6, k * 7, k % 2 ? '#fff' : '#ff8a4a'); g.fillStyle = '#5a3a00'; g.font = 'bold 13px system-ui'; const best = +(localStorage.getItem(BEST + '.' + dailySeed()) || 0); g.fillText(best ? best : '\u2014', b.x, b.y + 22); }
      else { circle(g, b.x, b.y, r, '#fff'); g.strokeStyle = '#7ed957'; g.lineWidth = 3; g.stroke(); g.fillStyle = '#5aa83c'; g.fillRect(b.x - 8, b.y - 2, 16, 4); g.fillRect(b.x - 2, b.y - 8, 4, 16); }
    }
    howTo();
    g.fillStyle = 'rgba(90,60,0,0.45)'; g.font = '12px system-ui'; g.textAlign = 'center'; g.fillText('v' + B.VERSION, W - 30, H - 12);
  }
  // Wordless how-to loop on the title: place a friend -> hearts + sunbeams -> bulb -> tap the row -> smoke clears -> a bird arrives.
  function howTo() {
    const pw = Math.min(420, W * 0.9), ph = 128, px = W / 2 - pw / 2, py = Math.min(H - ph - 16, H * 0.62 + 90);
    if (py < H * 0.62 + 70) return;
    const L = 10, T = V.t % L, u = 26;
    g.fillStyle = 'rgba(255,255,255,0.78)'; rr(px, py, pw, ph, 20); g.fill(); g.strokeStyle = 'rgba(160,140,90,0.35)'; g.lineWidth = 2; g.stroke();
    const hx0 = px + 70, hy0 = py + 80, cols = [[hx0, hy0], [hx0 + u * SQ3, hy0], [hx0 + u * SQ3 * 2, hy0]];
    const cleared = T > 6.6 ? Math.min(1, (T - 6.6) / 0.8) : 0;
    for (const [x, y] of cols) { hexPath(x, y + 7, u * 0.98); g.fillStyle = '#8a6a46'; g.fill(); hexPath(x, y, u * 0.96); g.fillStyle = mix('#a8a26c', '#8fd66a', cleared); g.fill(); }
    // factory (becomes windmill), house, tree (dropped in)
    const flip = T > 6.0 && T < 6.6 ? Math.abs(Math.cos((T - 6.0) / 0.6 * Math.PI)) : 1;
    g.save(); g.translate(cols[0][0], cols[0][1]); g.scale(1, flip); ART.drawBuilding(g, 'power', T > 6.3 ? 2 : 0, null, 0, u * 0.18, u, V.t, false); g.restore();
    if (cleared < 1) for (let k = 0; k < 3; k++) { const p = (V.t * 0.4 + k / 3) % 1; g.globalAlpha = (1 - p) * 0.45 * (1 - cleared); circle(g, cols[0][0] - 4 + p * 16, cols[0][1] - u * 1.2 - p * 26, 5 + p * 9, '#6d6458'); } g.globalAlpha = 1;
    ART.drawBuilding(g, 'home', 1, null, cols[1][0], cols[1][1] + u * 0.18, u, V.t, false);
    const card = { x: px + pw * 0.5, y: py + ph + 30 };
    if (T < 1.4) { const e = Math.min(1, T / 1.2), k = e * e * (3 - 2 * e); const x = card.x + (cols[2][0] - card.x) * k, y = card.y + (cols[2][1] - card.y) * k - Math.sin(k * Math.PI) * 40; g.globalAlpha = 0.85; ART.drawBuilding(g, 'wild', 1, null, x, y, u, V.t, false); g.globalAlpha = 1; pointer(x + 8, y + 10); }
    else { const d = T < 1.8 ? (1 - (T - 1.4) / 0.4) * 14 : 0; ART.drawBuilding(g, 'wild', 1, null, cols[2][0], cols[2][1] + u * 0.18 - d, u, V.t, false); }
    // hearts between house and tree
    if (T > 1.5 && T < 3.2) { const k = (T - 1.5) / 1.7; g.globalAlpha = 1 - k; heart((cols[1][0] + cols[2][0]) / 2 - 6, cols[1][1] - 16 - k * 22, 7, '#ff5c86'); heart((cols[1][0] + cols[2][0]) / 2 + 6, cols[1][1] - 20 - k * 22, 7, '#ff5c86'); g.globalAlpha = 1; }
    // mini sun meter on the right fills, pops a bulb
    const sx = px + pw - 120, sy = py + 46, fill = T < 1.9 ? 0.25 : Math.min(1, 0.25 + (T - 1.9) / 1.2 * 0.75);
    for (let i = 0; i < 5; i++) if (T > 1.8 && T < 3.1) { const k = Math.min(1, Math.max(0, (T - 1.8 - i * 0.12) / 0.7)); if (k > 0 && k < 1) { const x = cols[2][0] + (sx - cols[2][0]) * k, y = cols[2][1] - 20 + (sy - cols[2][1] + 20) * k - Math.sin(k * Math.PI) * 30; glowDot(g, x, y, 8, '#ffe680', 0.9); } }
    g.strokeStyle = 'rgba(0,0,0,0.1)'; g.lineWidth = 5; g.beginPath(); g.arc(sx, sy, 22, 0, TAU); g.stroke();
    g.strokeStyle = '#ffb627'; g.lineCap = 'round'; g.beginPath(); g.arc(sx, sy, 22, -Math.PI / 2, -Math.PI / 2 + TAU * (T < 3.2 ? fill : 0.08)); g.stroke(); g.lineCap = 'butt';
    circle(g, sx, sy, 15, '#ffcf3f'); circle(g, sx - 5, sy - 3, 1.8, '#7a4a10'); circle(g, sx + 5, sy - 3, 1.8, '#7a4a10');
    g.strokeStyle = '#7a4a10'; g.lineWidth = 1.8; g.beginPath(); g.moveTo(sx - 5, sy + 4); g.quadraticCurveTo(sx, sy + 6 + cleared * 5, sx + 5, sy + 4); g.stroke();
    // bulb pops out and is tapped onto the tech row
    const row = { x: px + pw - 92, y: py + 78, w: 80, h: 34 };
    g.fillStyle = T > 3.2 && T < 6.2 ? 'rgba(255,240,180,0.95)' : 'rgba(240,235,220,0.9)'; rr(row.x, row.y, row.w, row.h, 9); g.fill();
    if (T > 3.2 && T < 6.2) { g.strokeStyle = 'rgba(255,190,40,0.9)'; g.lineWidth = 2.5; g.stroke(); }
    ART.drawBuilding(g, 'power', T > 6.3 ? 2 : 0, null, row.x + 18, row.y + row.h - 4, 13, V.t, false);
    g.fillStyle = '#e8a020'; g.beginPath(); g.moveTo(row.x + 36, row.y + 12); g.lineTo(row.x + 44, row.y + 17); g.lineTo(row.x + 36, row.y + 22); g.fill();
    ART.drawBuilding(g, 'power', T > 6.3 ? 3 : 2, T > 6.3 ? 'leaf' : null, row.x + 62, row.y + row.h - 4, 13, V.t, false);
    if (T > 3.2 && T < 5.4) { const b = Math.abs(Math.sin(T * 6)) * 4; bulb(sx + 34, sy - b, 0.8, true); }
    if (T > 4.2 && T < 6.0) { const e = Math.min(1, (T - 4.2) / 1.0), k = e * e * (3 - 2 * e); const x = sx + 34 + (row.x + 20 - sx - 34) * k, y = sy + (row.y + row.h / 2 - sy) * k - Math.sin(k * Math.PI) * 20; if (T > 5.4) bulb(row.x + 50, row.y + 6, 0.6, true); pointer(x + 4, y + 8); }
    // a bird and sparkles arrive once the air is clean
    if (T > 7.2) { const k = Math.min(1, (T - 7.2) / 0.8); ART.drawCritter(g, 'bird', cols[2][0] + (1 - k) * 60, cols[2][1] - u * 0.4 - (1 - k) * 40, 1.2, V.t, 0); if (T < 8.4) for (let i = 0; i < 6; i++) { const an = i / 6 * TAU + T; circle(g, cols[2][0] + Math.cos(an) * 22, cols[2][1] - 16 + Math.sin(an) * 12, 1.8, '#fff3a0'); } }
    // progress pips (loop position)
    for (let i = 0; i < 3; i++) circle(g, W / 2 - 14 + i * 14, py + ph - 10, 3.5, T / L * 3 >= i && T / L * 3 < i + 1 ? '#ffb627' : 'rgba(0,0,0,0.15)');
  }
  function demoFill(st, n) {
    // Quick greedy fill used for the title backdrop (and ?auto=N screenshots).
    for (let k = 0; k < n && !st.over; k++) {
      while (st.ideas > 0) { const ax = B.AXES.filter((a) => B.canUpgrade(st, a)).sort((a, b) => st.era[a] - st.era[b])[0]; if (!ax) break; B.upgrade(st, ax, st.era[ax] === 2 ? (V.forkPref || (k % 2 ? 'leaf' : 'star')) : undefined); }
      let best = null; for (let i = 0; i < 3; i++) { const t = st.hand[i]; if (!t) continue; for (const [q, r] of B.legalHexes(st)) { const p = B.preview(st, t, q, r); const v = p.points - B.hexDist(q, r) * 0.3; if (!best || v > best.v) best = { i, p, v }; } }
      if (!best) break; B.place(st, best.i, best.p.q, best.p.r);
    }
  }

  // ---------- main loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; V.t += dt; V.dt = dt;
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (V.screen === 'title') { drawTitle(); requestAnimationFrame(frame); return; }
    V.u += (V.uT - V.u) * 0.06;
    const target = B.smogLevel(s);
    V.smog += (target - V.smog) * Math.min(1, dt * 0.8);
    const avgEra = B.AXES.reduce((a, x) => a + s.era[x], 0) / (3 * B.AXES.length);
    V.vivid += ((1 - V.smog) * 0.55 + avgEra * 0.45 - V.vivid) * Math.min(1, dt * 0.8);
    if (V.finale) V.vivid = Math.min(1, V.vivid + dt * 0.2);
    V.eve += (eveTarget() - V.eve) * Math.min(1, dt * 0.35);
    AU.update({ eve: V.eve, progress: Math.min(1, s.sunLevel / 18), clean: 1 - V.smog, critters: s.critterCount });
    sky(); haze(); drawBoard(); travellers(dt); drawParticles(dt); evening(); drawFloats(dt); drawFinale(dt);
    if (!V.finale) { drawSunMeter(); drawSpecies(); drawTech(); drawHand(); spotlight(); drawGoal(dt); drawGuide(); }
    drawFork();
    if (!V.finale && !V.fork) { peekTick(); drawPeek(); }
    drawCard();
    if (V.screen === 'end') drawEnd();
    requestAnimationFrame(frame);
  }
  function drawEnd() {
    g.fillStyle = 'rgba(30,30,40,0.45)'; g.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2; g.fillStyle = '#fffaf0'; rr(cx - 170, cy - 110, 340, 220, 26); g.fill();
    sunIcon(cx - 60, cy - 40, 16); g.fillStyle = '#5a3a00'; g.font = 'bold 40px "Trebuchet MS", system-ui'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(B.finalScore(s), cx - 30, cy - 38);
    const crowns = B.AXES.filter((a) => s.era[a] === 3);
    crowns.forEach((a, i) => crownGlyph(cx - 120 + i * 34, cy + 22, 10, s.variant[a]));
    for (let i = crowns.length; i < 8; i++) circle(g, cx - 120 + i * 34, cy + 22, 5, 'rgba(0,0,0,0.15)');
    const best = +(localStorage.getItem(BEST + '.' + s.seed) || 0); g.font = 'bold 16px system-ui'; g.fillStyle = '#a07020'; g.textAlign = 'center'; g.fillText('\u2605 ' + best, cx, cy + 70);
  }

  // ---------- boot ----------
  resize();
  if (PIXEL_MODE) {
    const _db = ART.drawBuilding;
    ART.drawBuilding = function (g2, axis, era, variant, x, y, u, t, night) {
      return window.PIXEL.drawBuilding(g2, axis, era, variant, x, y, u, t, { night }) || [];
    };
    try { document.body.style.background = '#0e1220'; } catch (e) {}
  }
  window.__BF = { openCard, closeCard, drawThoughts, TECHS, goalStage, goalInfo, get s() { return s; }, get W() { return W; }, get H() { return H; }, cardRects, swapRect, undoRect, techRects, titleButtons, finaleButtons, forkRects, hx, hy, V, start, demoFill, consume, startFinale, B, doUpgrade, doPlace, bestMove, PIXEL_MODE };
  if (Q.get('mode') || Q.get('auto')) {
    V.forkPref = Q.get('fork') || null; V.noCards = Q.get('cards') === '0';
    start({ mode: Q.get('mode') || 'cozy', seed: +(Q.get('seed') || 3) });
    if (Q.get('auto')) { demoFill(s, +Q.get('auto')); V.smog = B.smogLevel(s); V.vivid = 1 - V.smog; fitBoard(); V.u = V.uT; }
    if (Q.get('finale')) { s.crowned = Q.get('finale'); startFinale(Q.get('finale')); V.finale.t -= +(Q.get('ft') || 8); }
  }
  requestAnimationFrame(frame);
})();
