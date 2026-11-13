// WAGGLE procedural art: painterly meadow, flowers, bees, hive, comb. No assets.
(function (root) {
  'use strict';
  const WG = root.WG;
  const TAU = Math.PI * 2;
  const A = {};
  function hsl(h, s, l, a) { return `hsla(${h},${s}%,${l}%,${a == null ? 1 : a})`; }
  A.hsl = hsl;

  // ---------- meadow ground: pre-rendered painterly texture ----------
  A.buildMeadow = function (seed) {
    const S = 0.7, R = WG.C.MEADOW_R + 260, size = Math.ceil(R * 2 * S);
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    const g = cv.getContext('2d'), r = WG.rng(seed * 101 + 5);
    g.fillStyle = '#5d8a3a'; g.fillRect(0, 0, size, size);
    const toC = (x) => (x + R) * S;
    // big soft colour fields
    for (let i = 0; i < 260; i++) {
      const x = r() * size, y = r() * size, rr = (60 + r() * 220) * S;
      const h = 70 + r() * 45, l = 30 + r() * 22, gr = g.createRadialGradient(x, y, 0, x, y, rr);
      gr.addColorStop(0, hsl(h, 45 + r() * 20, l, 0.28)); gr.addColorStop(1, hsl(h, 45, l, 0));
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill();
    }
    // sunlit patches
    for (let i = 0; i < 90; i++) {
      const x = r() * size, y = r() * size, rr = (40 + r() * 120) * S, gr = g.createRadialGradient(x, y, 0, x, y, rr);
      gr.addColorStop(0, 'rgba(255,236,150,0.16)'); gr.addColorStop(1, 'rgba(255,236,150,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill();
    }
    // brush-stroke grass
    g.lineCap = 'round';
    for (let i = 0; i < 26000; i++) {
      const x = r() * size, y = r() * size, len = (5 + r() * 11) * S, a = -Math.PI / 2 + (r() - 0.5) * 0.9;
      g.strokeStyle = hsl(75 + r() * 40, 40 + r() * 30, 22 + r() * 34, 0.35 + r() * 0.35); g.lineWidth = (1 + r() * 2.2) * S;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + (r() - 0.5) * 3, y + Math.sin(a) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
    }
    // wildflower specks
    const speck = ['#fff7e0', '#ffe066', '#f7b2d0', '#c9b8ff', '#ffffff'];
    for (let i = 0; i < 2600; i++) { g.fillStyle = speck[Math.floor(r() * speck.length)]; g.globalAlpha = 0.35 + r() * 0.4; g.beginPath(); g.arc(r() * size, r() * size, (0.8 + r() * 1.6) * S, 0, TAU); g.fill(); }
    g.globalAlpha = 1;
    // trampled path from hive (lighter worn earth ring around hive)
    const hg = g.createRadialGradient(toC(0), toC(0), 0, toC(0), toC(0), 90 * S);
    hg.addColorStop(0, 'rgba(150,120,70,0.55)'); hg.addColorStop(1, 'rgba(150,120,70,0)'); g.fillStyle = hg; g.beginPath(); g.arc(toC(0), toC(0), 90 * S, 0, TAU); g.fill();
    // hedge / wood edge outside the meadow
    for (let i = 0; i < 1400; i++) {
      const a = r() * TAU, d = WG.C.MEADOW_R + 40 + r() * 240, x = toC(Math.cos(a) * d), y = toC(Math.sin(a) * d), rr = (18 + r() * 40) * S;
      g.fillStyle = hsl(95 + r() * 40, 35 + r() * 20, 14 + r() * 14, 0.8); g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill();
    }
    // a pond
    const pa = r() * TAU, pd = 500 + r() * 300, px = toC(Math.cos(pa) * pd), py = toC(Math.sin(pa) * pd);
    A.pond = { x: Math.cos(pa) * pd, y: Math.sin(pa) * pd };
    const pg = g.createRadialGradient(px - 10, py - 10, 4, px, py, 70 * S);
    pg.addColorStop(0, '#9fd4e0'); pg.addColorStop(0.7, '#4f8fa4'); pg.addColorStop(1, 'rgba(60,90,60,0.0)');
    g.fillStyle = pg; g.beginPath(); g.ellipse(px, py, 80 * S, 55 * S, pa, 0, TAU); g.fill();
    // trees (positions; drawn live so their shadows follow the sun)
    A.trees = [];
    for (let i = 0; i < 16; i++) { const a = r() * TAU, d = 250 + r() * 820; A.trees.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: 34 + r() * 30, h: 90 + r() * 70, s: Math.floor(r() * 1e6) }); }
    for (let i = 0; i < 26; i++) { const a = r() * TAU, d = WG.C.MEADOW_R + 20 + r() * 120; A.trees.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: 45 + r() * 35, h: 130 + r() * 60, s: Math.floor(r() * 1e6) }); }
    A.meadow = { cv, S, R };
  };

  // light colour by time of day: returns tint and sun elevation
  A.light = function (frac) {
    const elev = Math.sin(Math.PI * Math.max(0, Math.min(1, frac))); // 0 at dawn/dusk, 1 at noon
    const warm = 1 - elev;
    return { elev, tint: `rgba(${255},${Math.round(150 + 80 * elev)},${Math.round(90 + 110 * elev)},${0.10 + 0.22 * warm})`, shadowLen: 0.35 + 2.4 * (1 - elev) * (1 - elev) + 0.2 };
  };

  function shadowOff(az, len) { const v = WG.fromBearing(az + 180, 1); return { x: v.x * len, y: v.y * len }; }
  A.shadowOff = shadowOff;

  A.drawTree = function (g, t, az, L, time) {
    const o = shadowOff(az, t.h * L.shadowLen * 0.35);
    g.fillStyle = 'rgba(20,40,10,0.3)'; g.beginPath();
    for (let k = 0; k <= 6; k++) { const f = k / 6; g.moveTo(t.x + o.x * f + t.r * (0.9 - 0.25 * f), t.y + o.y * f); g.ellipse(t.x + o.x * f, t.y + o.y * f, t.r * (0.9 - 0.25 * f), t.r * (0.75 - 0.2 * f), 0, 0, TAU); }
    g.fill();
    const r = WG.rng(t.s);
    for (let i = 0; i < 9; i++) {
      const a = r() * TAU, d = r() * t.r * 0.55, rr = t.r * (0.45 + r() * 0.35), sw = Math.sin(time * 0.02 + i) * 1.2;
      const x = t.x + Math.cos(a) * d + sw, y = t.y + Math.sin(a) * d;
      const gr = g.createRadialGradient(x - rr * 0.3, y - rr * 0.35, rr * 0.1, x, y, rr);
      gr.addColorStop(0, hsl(85 + r() * 30, 45, 42 + L.elev * 8)); gr.addColorStop(1, hsl(110 + r() * 20, 45, 18));
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill();
    }
  };

  // ---------- flowers ----------
  A.drawFlower = function (g, x, y, sp, size, t, fresh) {
    const [name, pet, cen] = WG.SPECIES[sp];
    g.save(); g.translate(x, y); g.rotate(Math.sin(t) * 0.12);
    const s = size;
    g.globalAlpha = 0.45 + 0.55 * fresh;
    if (name === 'lavender' || name === 'heather' || name === 'bluebell') {
      g.fillStyle = 'rgba(40,80,30,0.8)'; g.fillRect(-0.6, -s * 1.6, 1.2, s * 1.6);
      for (let i = 0; i < 5; i++) { g.fillStyle = i % 2 ? pet : cen; g.beginPath(); g.ellipse((i % 2 ? 1 : -1) * s * 0.18, -s * 1.5 + i * s * 0.3, s * 0.32, s * 0.24, 0, 0, TAU); g.fill(); }
    } else {
      const n = name === 'sunflower' ? 12 : name === 'aster' ? 14 : name === 'dandelion' ? 16 : name === 'clover' ? 10 : 5;
      const pl = name === 'poppy' ? s * 0.62 : s * 0.55, pw = name === 'poppy' ? s * 0.5 : name === 'dandelion' || name === 'aster' ? s * 0.13 : s * 0.22;
      g.fillStyle = pet;
      for (let i = 0; i < n; i++) { const a = i / n * TAU; g.beginPath(); g.ellipse(Math.cos(a) * pl * 0.55, Math.sin(a) * pl * 0.55, pl * 0.5, pw, a, 0, TAU); g.fill(); }
      g.fillStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.arc(-s * 0.1, -s * 0.1, pl * 0.5, 0, TAU); g.fill();
      g.fillStyle = cen; g.beginPath(); g.arc(0, 0, name === 'sunflower' ? s * 0.32 : s * 0.18, 0, TAU); g.fill();
    }
    g.restore(); g.globalAlpha = 1;
  };
  A.drawPatch = function (g, p, time, az, L, day) {
    const r = WG.rng(p.seed), fresh = p.max ? Math.max(0.15, p.nectar / p.max) : 0;
    const wiltT = p.wilt > day ? 1 : 0.85;
    const o = shadowOff(az, 6 * L.shadowLen);
    const n = 16 + Math.floor(p.r / 3);
    const pts = [];
    for (let i = 0; i < n; i++) { const a = r() * TAU, d = Math.sqrt(r()) * p.r; pts.push([p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 7 + r() * 5, r() * 6]); }
    pts.sort((a, b) => a[1] - b[1]);
    // soft leafy base
    const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 1.25);
    gr.addColorStop(0, 'rgba(40,90,30,0.5)'); gr.addColorStop(1, 'rgba(40,90,30,0)'); g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, p.r * 1.25, 0, TAU); g.fill();
    g.fillStyle = 'rgba(20,40,10,0.22)';
    for (const q of pts) { g.beginPath(); g.ellipse(q[0] + o.x, q[1] + o.y, q[2] * 0.5, q[2] * 0.35, 0, 0, TAU); g.fill(); }
    for (const q of pts) A.drawFlower(g, q[0], q[1], p.species, q[2] * wiltT * (0.75 + 0.25 * fresh), time * 0.03 + q[3], fresh);
  };

  // ---------- bees ----------
  // kind: 'scout' | 'forager' | 'rival' | 'wasp'
  A.drawBee = function (g, x, y, hdg, size, t, kind, opt) {
    opt = opt || {};
    g.save(); g.translate(x, y); g.rotate(hdg * Math.PI / 180);
    const s = size, flap = Math.sin(t * 1.9) * 0.5 + 0.5;
    if (opt.shadow) { g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.ellipse(opt.shadow.x, opt.shadow.y, s * 0.6, s * 0.9, 0, 0, TAU); g.fill(); }
    // wings
    g.fillStyle = kind === 'wasp' ? 'rgba(220,230,255,0.55)' : 'rgba(235,245,255,0.6)';
    for (const sd of [-1, 1]) { g.save(); g.rotate(sd * (0.5 + flap * 0.6)); g.beginPath(); g.ellipse(sd * s * 0.55, -s * 0.15, s * 0.55, s * 0.28, sd * 0.3, 0, TAU); g.fill(); g.restore(); }
    const body = kind === 'rival' ? ['#4a3d6b', '#1c1530'] : kind === 'wasp' ? ['#ffe100', '#111'] : ['#ffc93c', '#3a2410'];
    // abdomen with stripes
    g.fillStyle = body[0]; g.beginPath(); g.ellipse(0, s * 0.35, s * 0.42, s * (kind === 'wasp' ? 0.75 : 0.62), 0, 0, TAU); g.fill();
    g.fillStyle = body[1];
    for (let i = 0; i < 3; i++) { g.fillRect(-s * 0.42, s * (0.12 + i * 0.27), s * 0.84, s * 0.1); }
    if (kind === 'wasp') { g.fillStyle = '#c0281b'; g.beginPath(); g.arc(-s * 0.14, -s * 0.66, s * 0.09, 0, TAU); g.arc(s * 0.14, -s * 0.66, s * 0.09, 0, TAU); g.fill(); g.fillStyle = '#111'; g.beginPath(); g.moveTo(-s * 0.12, s * 0.95); g.lineTo(0, s * 1.25); g.lineTo(s * 0.12, s * 0.95); g.fill(); }
    // thorax + head
    g.fillStyle = kind === 'rival' ? '#2b2340' : kind === 'wasp' ? '#2a2a00' : '#6b4214'; g.beginPath(); g.arc(0, -s * 0.28, s * 0.32, 0, TAU); g.fill();
    if (kind !== 'wasp' && kind !== 'rival') { g.fillStyle = 'rgba(255,220,140,0.7)'; g.beginPath(); g.arc(-s * 0.08, -s * 0.36, s * 0.14, 0, TAU); g.fill(); }
    g.fillStyle = '#1a1208'; g.beginPath(); g.arc(0, -s * 0.62, s * 0.22, 0, TAU); g.fill();
    if (opt.pollen) { g.fillStyle = '#ff9d1c'; g.beginPath(); g.arc(-s * 0.38, s * 0.05, s * 0.16, 0, TAU); g.arc(s * 0.38, s * 0.05, s * 0.16, 0, TAU); g.fill(); }
    if (kind === 'scout') { g.strokeStyle = '#1a1208'; g.lineWidth = Math.max(1, s * 0.07); g.beginPath(); g.moveTo(-s * 0.08, -s * 0.78); g.quadraticCurveTo(-s * 0.3, -s * 1.1, -s * 0.35, -s * 1.15); g.moveTo(s * 0.08, -s * 0.78); g.quadraticCurveTo(s * 0.3, -s * 1.1, s * 0.35, -s * 1.15); g.stroke(); }
    g.restore();
  };

  A.drawSkep = function (g, x, y, r, az, L, rival) {
    const o = shadowOff(az, r * 1.1 * L.shadowLen);
    g.fillStyle = 'rgba(30,30,10,0.32)'; g.beginPath();
    for (let k = 0; k <= 5; k++) { const f = k / 5; g.moveTo(x + o.x * f + r, y + o.y * f); g.ellipse(x + o.x * f, y + o.y * f, r * (1 - 0.15 * f), r * (0.95 - 0.15 * f), 0, 0, TAU); }
    g.fill();
    if (rival) {
      // hollow log
      g.fillStyle = '#4b3524'; g.beginPath(); g.ellipse(x, y, r * 1.1, r * 0.75, 0.4, 0, TAU); g.fill();
      g.strokeStyle = '#2d1f15'; g.lineWidth = 3; for (let i = 1; i < 4; i++) { g.beginPath(); g.ellipse(x, y, r * 1.1 * i / 4, r * 0.75 * i / 4, 0.4, 0, TAU); g.stroke(); }
      g.fillStyle = '#120c08'; g.beginPath(); g.ellipse(x, y, r * 0.25, r * 0.18, 0.4, 0, TAU); g.fill();
      return;
    }
    for (let i = 6; i >= 0; i--) {
      const rr = r * (0.3 + i * 0.11);
      const gr = g.createRadialGradient(x - rr * 0.3, y - rr * 0.4, rr * 0.1, x, y, rr);
      gr.addColorStop(0, i % 2 ? '#f2c66d' : '#e3ad4e'); gr.addColorStop(1, i % 2 ? '#a8742a' : '#94621f');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(90,55,15,0.5)'; g.lineWidth = 1.5; g.stroke();
    }
    g.fillStyle = 'rgba(255,240,190,0.5)'; g.beginPath(); g.arc(x - r * 0.2, y - r * 0.25, r * 0.16, 0, TAU); g.fill();
  };

  A.drawNest = function (g, x, y, t) {
    g.fillStyle = 'rgba(20,20,10,0.3)'; g.beginPath(); g.ellipse(x + 10, y + 12, 26, 20, 0, 0, TAU); g.fill();
    const gr = g.createRadialGradient(x - 6, y - 8, 2, x, y, 26); gr.addColorStop(0, '#d9d2c2'); gr.addColorStop(1, '#7d7464');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, 24, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(80,70,55,0.6)'; g.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(x, y, 6 + i * 5, t * 0.01 + i, t * 0.01 + i + 4); g.stroke(); }
    g.fillStyle = '#231d14'; g.beginPath(); g.arc(x + 3, y + 4, 5, 0, TAU); g.fill();
  };

  // ---------- comb ----------
  A.buildComb = function (w, h, hex) {
    const cells = [], dx = hex * Math.sqrt(3), dy = hex * 1.5;
    for (let row = -1, y = -hex; y < h + hex; row++, y += dy) for (let x = (row & 1 ? dx / 2 : 0) - dx; x < w + dx; x += dx) cells.push({ x, y });
    const cx = w / 2, cy = h * 0.1;
    for (const c of cells) c.d = Math.hypot((c.x - cx) * 0.75, c.y - cy);
    const order = cells.slice().sort((a, b) => a.d - b.d);
    order.forEach((c, i) => { c.rank = i; });
    const r = WG.rng(99);
    for (const c of cells) { c.n = r(); }
    return { cells, order, hex, w, h };
  };
  function hexPath(g, x, y, r) { g.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; i ? g.lineTo(px, py) : g.moveTo(px, py); } g.closePath(); }
  A.hexPath = hexPath;
  // base comb pre-rendered once per size: dark cells with wax walls, a patch of capped brood low down
  A.renderCombBase = function (comb, dpr) {
    const cv = document.createElement('canvas'); cv.width = Math.ceil(comb.w * dpr); cv.height = Math.ceil(comb.h * dpr);
    const g = cv.getContext('2d'); g.scale(dpr, dpr);
    const { hex } = comb;
    g.fillStyle = '#2a1504'; g.fillRect(0, 0, comb.w, comb.h);
    for (const c of comb.cells) {
      hexPath(g, c.x, c.y, hex * 0.98); g.fillStyle = `hsl(${34 + c.n * 6},52%,${27 + c.n * 7}%)`; g.fill(); // wax wall
      hexPath(g, c.x, c.y, hex * 0.8);
      const brood = c.rank > 380 && c.y > comb.h * 0.6 && c.n < 0.45;
      if (brood) { const gr = g.createRadialGradient(c.x - hex * 0.2, c.y - hex * 0.25, 1, c.x, c.y, hex * 0.85); gr.addColorStop(0, '#7a5a30'); gr.addColorStop(1, '#4a3014'); g.fillStyle = gr; }
      else { const gr = g.createRadialGradient(c.x, c.y + hex * 0.12, hex * 0.05, c.x, c.y, hex * 0.85); gr.addColorStop(0, `hsl(28,60%,${7 + c.n * 4}%)`); gr.addColorStop(1, `hsl(32,58%,${22 + c.n * 6}%)`); g.fillStyle = gr; }
      g.fill();
      g.strokeStyle = 'rgba(255,225,150,0.12)'; g.lineWidth = 1; g.beginPath(); g.moveTo(c.x - hex * 0.7, c.y - hex * 0.4); g.lineTo(c.x, c.y - hex * 0.8); g.lineTo(c.x + hex * 0.7, c.y - hex * 0.4); g.stroke();
    }
    const vg = g.createRadialGradient(comb.w / 2, comb.h * 0.45, comb.h * 0.15, comb.w / 2, comb.h * 0.5, comb.h * 0.95);
    vg.addColorStop(0, 'rgba(255,190,90,0.06)'); vg.addColorStop(1, 'rgba(15,6,0,0.75)');
    g.fillStyle = vg; g.fillRect(0, 0, comb.w, comb.h);
    comb.base = cv;
  };
  A.drawComb = function (g, comb, honeyCells, targetCells, t, glow) {
    const { hex } = comb;
    g.drawImage(comb.base, 0, 0, comb.w, comb.h);
    const n = Math.min(comb.order.length, Math.max(Math.ceil(honeyCells), targetCells));
    for (let i = 0; i < n; i++) {
      const c = comb.order[i], vis = 1 - Math.min(0.55, Math.max(0, (Math.hypot(c.x - comb.w / 2, c.y - comb.h * 0.48) / comb.h - 0.35)));
      if (i < honeyCells) {
        const capped = i < honeyCells - 18, gl = glow && glow[i] ? glow[i] : 0, part = Math.min(1, honeyCells - i);
        hexPath(g, c.x, c.y, hex * 0.8 * (0.6 + 0.4 * part));
        if (capped) { const gr = g.createRadialGradient(c.x - hex * 0.25, c.y - hex * 0.3, 1, c.x, c.y, hex * 0.85); gr.addColorStop(0, `hsl(46,85%,${(78 + gl * 15) * vis}%)`); gr.addColorStop(1, `hsl(38,70%,${50 * vis}%)`); g.fillStyle = gr; }
        else { const gr = g.createRadialGradient(c.x - hex * 0.3, c.y - hex * 0.35, 1, c.x, c.y, hex * 0.85); gr.addColorStop(0, `hsl(${44 + c.n * 6},100%,${(66 + gl * 25) * vis}%)`); gr.addColorStop(0.5, `hsl(${34 + c.n * 6},95%,${42 * vis}%)`); gr.addColorStop(1, `hsl(${26 + c.n * 4},90%,${24 * vis}%)`); g.fillStyle = gr; }
        g.fill();
        if (!capped) { g.fillStyle = `rgba(255,255,230,${0.55 * vis})`; g.beginPath(); g.ellipse(c.x - hex * 0.28, c.y - hex * 0.32, hex * 0.18, hex * 0.09, -0.6, 0, TAU); g.fill(); }
      } else if (i < targetCells) {
        // the winter line: cells the colony still needs, rimmed with frost
        hexPath(g, c.x, c.y, hex * 0.72); g.strokeStyle = `rgba(200,230,255,${(0.22 + 0.06 * Math.sin(t * 0.03 + c.n * 6)) * vis})`; g.lineWidth = 1.6; g.stroke();
      }
    }
  };
  A.drawSun = function (g, x, y, r, t) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r * 3);
    gr.addColorStop(0, 'rgba(255,240,170,0.95)'); gr.addColorStop(0.3, 'rgba(255,210,90,0.5)'); gr.addColorStop(1, 'rgba(255,200,80,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * 3, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,230,140,0.9)'; g.lineWidth = r * 0.18; g.lineCap = 'round';
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + t * 0.01; g.beginPath(); g.moveTo(x + Math.cos(a) * r * 1.3, y + Math.sin(a) * r * 1.3); g.lineTo(x + Math.cos(a) * r * 1.8, y + Math.sin(a) * r * 1.8); g.stroke(); }
    g.fillStyle = '#fff1b0'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  };
  A.drawCloud = function (g, x, y, s, a) {
    g.fillStyle = `rgba(235,240,250,${a})`;
    for (const [dx, dy, r] of [[-0.6, 0.1, 0.5], [0, -0.15, 0.65], [0.6, 0.05, 0.5], [0.2, 0.25, 0.45], [-0.25, 0.25, 0.45]]) { g.beginPath(); g.arc(x + dx * s, y + dy * s, r * s, 0, TAU); g.fill(); }
  };
  root.WGArt = A;
})(window);
