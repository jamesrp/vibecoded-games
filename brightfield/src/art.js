// BRIGHTFIELD procedural art: buildings, critters, icons. Pure canvas, no assets.
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  function hex2rgb(h) { if (Array.isArray(h)) return h; if (h[0] !== '#') return h.match(/[\d.]+/g).slice(0, 3).map(Number); h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  function rgb(a) { return `rgb(${a[0] | 0},${a[1] | 0},${a[2] | 0})`; }
  function mix(a, b, t) { const A = hex2rgb(a), Bc = hex2rgb(b); return rgb([A[0] + (Bc[0] - A[0]) * t, A[1] + (Bc[1] - A[1]) * t, A[2] + (Bc[2] - A[2]) * t]); }
  function shade(c, k) { const A = hex2rgb(c); return k >= 0 ? rgb(A.map((v) => v + (255 - v) * k)) : rgb(A.map((v) => v * (1 + k))); }

  // ---------- primitives (x,y = ground point of the object's front-center) ----------
  function box(g, x, y, w, h, d, c) {
    // front face + top face + right side, simple 3/4 view.
    const dd = d * 0.5;
    g.fillStyle = shade(c, -0.25);
    g.beginPath(); g.moveTo(x + w / 2, y); g.lineTo(x + w / 2 + dd * 0.6, y - dd); g.lineTo(x + w / 2 + dd * 0.6, y - h - dd); g.lineTo(x + w / 2, y - h); g.closePath(); g.fill();
    g.fillStyle = c; g.fillRect(x - w / 2, y - h, w, h);
    g.fillStyle = shade(c, 0.28);
    g.beginPath(); g.moveTo(x - w / 2, y - h); g.lineTo(x - w / 2 + dd * 0.6, y - h - dd); g.lineTo(x + w / 2 + dd * 0.6, y - h - dd); g.lineTo(x + w / 2, y - h); g.closePath(); g.fill();
  }
  function gable(g, x, y, w, h, c, d = 8) {
    const dd = d * 0.5;
    g.fillStyle = shade(c, -0.2);
    g.beginPath(); g.moveTo(x, y - h); g.lineTo(x + dd * 0.6, y - h - dd); g.lineTo(x + w / 2 + dd * 0.6 + 2, y - dd + 1); g.lineTo(x + w / 2 + 2, y + 1); g.closePath(); g.fill();
    g.fillStyle = c;
    g.beginPath(); g.moveTo(x - w / 2 - 2, y + 1); g.lineTo(x, y - h); g.lineTo(x + w / 2 + 2, y + 1); g.closePath(); g.fill();
  }
  function win(g, x, y, w, h, lit) { g.fillStyle = lit ? '#ffe9a8' : '#3d4a5c'; g.fillRect(x, y, w, h); }
  function circle(g, x, y, r, c) { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
  function ell(g, x, y, rx, ry, c) { g.fillStyle = c; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill(); }
  function tree(g, x, y, s, c, t = 0, sway = 1) {
    const w = Math.sin(t * 1.3 + x * 0.05) * 1.2 * sway;
    g.fillStyle = '#7a5434'; g.fillRect(x - s * 0.12, y - s * 0.9, s * 0.24, s * 0.9);
    circle(g, x + w * 0.6, y - s * 1.25, s * 0.62, shade(c, -0.18));
    circle(g, x - s * 0.25 + w, y - s * 1.45, s * 0.48, c);
    circle(g, x + s * 0.22 + w, y - s * 1.6, s * 0.4, shade(c, 0.15));
  }
  function pine(g, x, y, s, c) {
    g.fillStyle = '#6b4a2e'; g.fillRect(x - s * 0.1, y - s * 0.5, s * 0.2, s * 0.5);
    for (let i = 0; i < 3; i++) { g.fillStyle = shade(c, i * 0.08 - 0.1); g.beginPath(); g.moveTo(x - s * (0.7 - i * 0.15), y - s * (0.4 + i * 0.5)); g.lineTo(x, y - s * (1.3 + i * 0.5)); g.lineTo(x + s * (0.7 - i * 0.15), y - s * (0.4 + i * 0.5)); g.fill(); }
  }
  function flower(g, x, y, c) { circle(g, x, y, 1.6, c); circle(g, x, y, 0.7, '#fff6c2'); }
  function panel(g, x, y, w, h, tilt) {
    g.fillStyle = '#2b4e86';
    g.beginPath(); g.moveTo(x - w / 2, y); g.lineTo(x + w / 2, y); g.lineTo(x + w / 2 - tilt, y - h); g.lineTo(x - w / 2 - tilt, y - h); g.closePath(); g.fill();
    g.strokeStyle = '#8fc4ff'; g.lineWidth = 0.6; g.beginPath();
    for (let i = 1; i < 3; i++) { const fx = x - w / 2 + (w * i) / 3; g.moveTo(fx, y); g.lineTo(fx - tilt, y - h); }
    g.moveTo(x - w / 2 - tilt / 2, y - h / 2); g.lineTo(x + w / 2 - tilt / 2, y - h / 2); g.stroke();
    g.fillStyle = '#8a8f96'; g.fillRect(x - 0.6, y, 1.2, 3);
  }
  function turbine(g, x, y, h, t, c = '#f4f6f8') {
    g.fillStyle = c; g.beginPath(); g.moveTo(x - 1.4, y); g.lineTo(x - 0.6, y - h); g.lineTo(x + 0.6, y - h); g.lineTo(x + 1.4, y); g.fill();
    const a = t * 2.2 + x;
    g.save(); g.translate(x, y - h);
    for (let i = 0; i < 3; i++) { g.rotate(TAU / 3); g.fillStyle = c; g.beginPath(); g.ellipse(0, -h * 0.28, 1.4, h * 0.3, 0, 0, TAU); g.fill(); }
    g.restore();
    g.save(); g.translate(x, y - h); g.rotate(a);
    for (let i = 0; i < 3; i++) { g.rotate(TAU / 3); g.fillStyle = shade(c, -0.08); g.beginPath(); g.ellipse(0, -h * 0.3, 1.5, h * 0.32, 0, 0, TAU); g.fill(); }
    g.restore(); circle(g, x, y - h, 1.8, '#d9dde2');
  }
  function glowDot(g, x, y, r, c, a) { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.globalAlpha = a; g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.globalAlpha = 1; }

  // ---------- buildings: DRAW[axis][era|leaf|star](g, x, y, u, t, night) -> smoke emitters [[dx,dy,k]] ----------
  const D = {};
  D.power = {
    0(g, x, y, u, t) { box(g, x - 4, y, 22, 14, 14, '#7b6a5e'); box(g, x + 9, y - 2, 6, 30, 6, '#5d4c43'); g.fillStyle = '#a33'; g.fillRect(x + 6, y - 28, 6, 2.5); ell(g, x - 10, y + 2, 6, 2.5, '#26201c'); circle(g, x - 12, y, 3, '#2f2723'); circle(g, x - 8, y + 1, 2.5, '#3a302a'); return [[10, -34, 3]]; },
    1(g, x, y, u, t) { box(g, x - 3, y, 24, 12, 14, '#a39a8f'); box(g, x - 8, y - 12, 8, 8, 8, '#8a8178'); g.fillStyle = '#d6cfc4'; g.beginPath(); g.moveTo(x + 4, y); g.lineTo(x + 7, y - 24); g.lineTo(x + 15, y - 24); g.lineTo(x + 18, y); g.fill(); g.fillStyle = '#e7a23a'; g.fillRect(x - 12, y - 6, 4, 4); return [[11, -27, 1.6]]; },
    2(g, x, y, u, t) { ell(g, x, y - 2, 14, 5, '#7fbf5a'); turbine(g, x - 8, y + 2, 30, t); turbine(g, x + 9, y - 2, 25, t + 0.7); return []; },
    leaf(g, x, y, u, t) { ell(g, x, y - 1, 16, 7, '#8fd05c'); for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) panel(g, x - 9 + i * 9 - j * 3, y + 3 - j * 7, 8, 5, 2); for (let i = 0; i < 6; i++) flower(g, x - 14 + i * 5.5, y + 4 + (i % 2) * 2, ['#ff8fb1', '#ffd34d', '#c58bff'][i % 3]); return []; },
    star(g, x, y, u, t) { box(g, x, y, 22, 8, 16, '#dfe7f1'); const p = 0.6 + 0.4 * Math.sin(t * 3); glowDot(g, x, y - 20, 18, '#9ff3ff', 0.5 + 0.3 * p); g.strokeStyle = '#bfe6ff'; g.lineWidth = 3; g.beginPath(); g.ellipse(x, y - 20, 12, 5, 0, 0, TAU); g.stroke(); g.strokeStyle = '#ffffff'; g.lineWidth = 1.2; g.beginPath(); g.ellipse(x, y - 20, 12, 5, 0, 0, TAU); g.stroke(); circle(g, x, y - 20, 3.5 + p, '#eaffff'); return []; },
  };
  D.move = {
    0(g, x, y, u, t) { box(g, x - 5, y, 18, 12, 12, '#9a6b45'); gable(g, x - 5, y - 12, 18, 8, '#7d4f33'); g.fillStyle = '#4d3424'; g.fillRect(x - 8, y - 8, 6, 8); // horse
      const b = Math.sin(t * 2) * 0.6; ell(g, x + 11, y - 6 + b, 5, 3, '#8b5a3c'); g.fillRect(x + 7, y - 4, 1.4, 5); g.fillRect(x + 14, y - 4, 1.4, 5); g.fillStyle = '#8b5a3c'; g.beginPath(); g.moveTo(x + 14, y - 7 + b); g.lineTo(x + 18, y - 12 + b); g.lineTo(x + 19, y - 10 + b); g.lineTo(x + 16, y - 5 + b); g.fill(); g.fillStyle = '#3b2a1e'; g.fillRect(x + 15, y - 12 + b, 1.5, 4); return [[0, -14, 0.5]]; },
    1(g, x, y, u, t) { g.fillStyle = '#5c5a58'; g.fillRect(x - 15, y - 2, 30, 5); box(g, x - 3, y - 1, 18, 11, 10, '#b9b2a6'); g.fillStyle = '#3d3a37'; g.fillRect(x - 9, y - 9, 12, 8); // car
      const cx = x + 9 + Math.sin(t * 0.8) * 1.5; box(g, cx, y + 4, 11, 4, 6, '#c2453b'); box(g, cx - 1, y, 6, 3, 5, '#d8635a'); circle(g, cx - 3.5, y + 4, 1.6, '#222'); circle(g, cx + 3.5, y + 4, 1.6, '#222'); return [[cx - x - 7, 2, 1.8], [-6, -16, 0.6]]; },
    2(g, x, y, u, t) { g.fillStyle = '#6f7c86'; g.fillRect(x - 14, y - 1, 28, 4); box(g, x - 6, y, 5, 12, 5, '#e8eef2'); g.fillStyle = '#39d17f'; g.fillRect(x - 7.5, y - 10, 3, 3); g.strokeStyle = '#2b2b2b'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x - 4, y - 6); g.quadraticCurveTo(x, y - 2, x + 3, y - 3); g.stroke();
      box(g, x + 7, y + 3, 12, 4, 6, '#4aa3d8'); box(g, x + 6, y - 1, 7, 3, 5, '#7cc4ee'); circle(g, x + 3, y + 3, 1.6, '#222'); circle(g, x + 11, y + 3, 1.6, '#222'); const p = (t * 1.5) % 1; g.globalAlpha = 1 - p; circle(g, x - 6, y - 15 - p * 6, 1.5, '#5cf09c'); g.globalAlpha = 1; return []; },
    leaf(g, x, y, u, t) { g.fillStyle = '#7a8c63'; g.fillRect(x - 16, y + 1, 32, 1.2); g.fillRect(x - 16, y + 4, 32, 1.2); for (let i = -14; i < 16; i += 4) { g.fillStyle = '#9fd36d'; g.fillRect(x + i, y + 1, 2, 4); }
      const tx = x + Math.sin(t * 0.6) * 4; box(g, tx, y + 1, 22, 9, 8, '#f2c14e'); g.fillStyle = '#7fc96a'; g.fillRect(tx - 11, y - 12, 22, 3); for (let i = 0; i < 4; i++) win(g, tx - 9 + i * 5, y - 6, 3.5, 3.5, true); g.strokeStyle = '#555'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(tx, y - 12); g.lineTo(tx - 3, y - 20); g.lineTo(x - 16, y - 20); g.stroke(); flower(g, tx - 6, y - 13, '#ff7aa8'); flower(g, tx + 4, y - 13, '#ffd34d'); return []; },
    star(g, x, y, u, t) { g.fillStyle = '#c9d6e6'; for (const px of [-11, 11]) box(g, x + px, y + 2, 4, 10, 4, '#c9d6e6'); g.fillStyle = '#e9f1fb'; g.fillRect(x - 17, y - 11, 34, 3); const s = ((t * 0.7) % 2) - 1; const mx = x + s * 26; if (Math.abs(s) < 0.8) { box(g, mx, y - 12, 18, 6, 7, '#ffffff'); g.fillStyle = '#4fb8ff'; g.fillRect(mx - 8, y - 16, 16, 2); glowDot(g, mx, y - 10, 10, '#7fd8ff', 0.4); } return []; },
  };
  D.food = {
    0(g, x, y, u, t) { ell(g, x, y, 16, 7, '#b59a5e'); g.strokeStyle = '#8d7443'; g.lineWidth = 1; for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(x - 14 + i, y - 4 + Math.abs(i)); g.lineTo(x + 14 + i, y + 3 - Math.abs(i)); g.stroke(); }
      const tx = x + 4 + Math.sin(t * 0.5) * 4; box(g, tx, y, 9, 5, 6, '#c9632c'); box(g, tx - 2, y - 5, 4, 4, 4, '#a84f22'); g.fillStyle = '#333'; g.fillRect(tx + 2, y - 10, 1.4, 5); circle(g, tx - 3, y + 1, 2.4, '#222'); circle(g, tx + 3, y + 1, 1.6, '#222'); return [[tx - x + 2.7, -11, 1.4]]; },
    1(g, x, y, u, t) { ell(g, x, y, 16, 7, '#8fbf55'); for (const [dx, dy] of [[-9, -1], [0, 2], [9, -1], [-4, -5], [5, -5]]) { tree(g, x + dx, y + dy, 6, '#5fa34a', t); circle(g, x + dx - 2, y + dy - 7, 1.2, '#e8473c'); circle(g, x + dx + 2, y + dy - 9, 1.2, '#e8473c'); } return []; },
    2(g, x, y, u, t) { ell(g, x, y, 15, 6, '#7cb85a'); g.fillStyle = 'rgba(200,240,255,0.55)'; g.beginPath(); g.moveTo(x - 13, y + 2); g.lineTo(x - 13, y - 9); g.quadraticCurveTo(x, y - 22, x + 13, y - 9); g.lineTo(x + 13, y + 2); g.fill(); g.strokeStyle = '#eaf7ff'; g.lineWidth = 0.8; for (let i = -9; i <= 9; i += 6) { g.beginPath(); g.moveTo(x + i, y + 2); g.lineTo(x + i, y - 14 + Math.abs(i) * 0.4); g.stroke(); } for (let i = -10; i <= 10; i += 4) { circle(g, x + i, y - 2, 2, '#3f9f45'); circle(g, x + i + 1, y - 3, 0.9, '#ff6b5a'); } return []; },
    leaf(g, x, y, u, t) { ell(g, x, y, 16, 7, '#6db05a'); tree(g, x - 9, y - 1, 8, '#4e9a45', t); tree(g, x + 8, y - 2, 9, '#5aa84a', t); tree(g, x, y + 3, 6, '#78c25a', t); for (let i = 0; i < 5; i++) circle(g, x - 10 + i * 5, y - 10 - (i % 2) * 3, 1.3, ['#ffb43a', '#ff5a5a', '#c66bff'][i % 3]); for (let i = 0; i < 6; i++) circle(g, x - 13 + i * 5, y + 4, 1.6, '#3f8f3f'); return []; },
    star(g, x, y, u, t) { box(g, x, y, 14, 34, 12, '#e7f0f6'); for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#4fc36a' : '#72dd6a'; g.fillRect(x - 6, y - 5 - i * 5, 12, 3); g.fillStyle = 'rgba(255,120,220,0.35)'; g.fillRect(x - 6, y - 6 - i * 5, 12, 1); } glowDot(g, x, y - 36, 8, '#ffb3f0', 0.6); return []; },
  };
  D.water = {
    0(g, x, y, u, t) { box(g, x, y, 12, 6, 12, '#8d877d'); ell(g, x + 1.5, y - 8, 5, 2, '#4a6f86'); g.strokeStyle = '#6b4a2e'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x - 6, y - 6); g.lineTo(x - 6, y - 18); g.lineTo(x + 8, y - 18); g.lineTo(x + 8, y - 6); g.stroke(); gable(g, x + 1, y - 17, 18, 6, '#8a5a3a'); box(g, x + 12, y + 3, 4, 4, 4, '#7a6a55'); return []; },
    1(g, x, y, u, t) { for (const dx of [-6, 6]) { g.fillStyle = '#8b96a0'; g.fillRect(x + dx - 0.8, y - 18, 1.6, 18); } box(g, x, y - 17, 18, 9, 14, '#6ea6c9'); gable(g, x, y - 26, 18, 5, '#5a8aa8'); ell(g, x - 10, y + 2, 5, 2, '#5aa0cf'); return []; },
    2(g, x, y, u, t) { ell(g, x, y, 15, 7, '#7cbf5f'); ell(g, x, y + 1, 10, 4.5, '#5fb2e0'); ell(g, x - 2, y, 5, 1.6, '#a6dcff'); for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU; g.fillStyle = '#3f9a4a'; g.fillRect(x + Math.cos(a) * 13, y + Math.sin(a) * 5.5 - 5, 1.2, 5); flower(g, x + Math.cos(a) * 13 + 0.6, y + Math.sin(a) * 5.5 - 5, ['#ff8fb1', '#8fd3ff', '#fff07a'][i % 3]); } return []; },
    leaf(g, x, y, u, t) { ell(g, x, y, 17, 7.5, '#69b85b'); ell(g, x - 2, y + 1, 12, 5, '#4fa6d8'); ell(g, x + 6, y - 1, 6, 2.5, '#6cc4f0'); for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU; g.fillStyle = '#5a8f3a'; g.fillRect(x + Math.cos(a) * 14, y + Math.sin(a) * 6 - 7, 1, 7); ell(g, x + Math.cos(a) * 14 + 0.5, y + Math.sin(a) * 6 - 8, 1.2, 2.5, '#7a4a2a'); } ell(g, x - 4, y + 1, 2.5, 1, '#9fd86a'); ell(g, x + 3, y + 2, 2, 0.9, '#9fd86a'); return []; },
    star(g, x, y, u, t) { ell(g, x, y + 1, 14, 6, '#5ab8e8'); for (let i = 0; i < 3; i++) { const cx = x - 8 + i * 8, h = 14 + (i % 2) * 8; g.fillStyle = 'rgba(190,240,255,0.85)'; g.beginPath(); g.moveTo(cx, y - h); g.lineTo(cx + 4, y - h * 0.5); g.lineTo(cx, y); g.lineTo(cx - 4, y - h * 0.5); g.fill(); g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.moveTo(cx, y - h); g.lineTo(cx + 1.5, y - h * 0.5); g.lineTo(cx, y - 2); g.fill(); } glowDot(g, x, y - 14, 14, '#bff4ff', 0.35 + 0.15 * Math.sin(t * 2)); return []; },
  };
  D.home = {
    0(g, x, y, u, t) { box(g, x - 4, y, 16, 10, 12, '#8f7b66'); gable(g, x - 4, y - 10, 16, 8, '#5e5249'); box(g, x + 1, y - 13, 3, 7, 3, '#6b5a4c'); win(g, x - 8, y - 7, 3, 3, false); box(g, x + 10, y + 3, 8, 6, 8, '#7d6b58'); gable(g, x + 10, y - 3, 8, 5, '#55493f'); return [[2.5, -22, 1.4]]; },
    1(g, x, y, u, t, n) { for (let i = 0; i < 3; i++) { const bx = x - 10 + i * 9, c = ['#c97b5a', '#d9a066', '#b86a52'][i]; box(g, bx, y + i * 0.5, 9, 13, 10, c); gable(g, bx, y - 13 + i * 0.5, 9, 6, '#6b4f45'); win(g, bx - 2.5, y - 9, 2.4, 3, n); win(g, bx + 0.8, y - 9, 2.4, 3, n); } box(g, x + 4, y - 18, 2, 4, 2, '#7a5f50'); return [[5, -24, 0.7]]; },
    2(g, x, y, u, t, n) { box(g, x - 2, y, 22, 22, 14, '#eae3d6'); g.fillStyle = '#6fc25a'; g.fillRect(x - 13, y - 24, 22, 3); for (let i = 0; i < 4; i++) circle(g, x - 11 + i * 6, y - 25, 2, '#55a845'); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) { win(g, x - 10 + c * 6, y - 19 + r * 6, 3.5, 3.5, n || (r + c) % 3 === 0); g.fillStyle = '#5fb04a'; g.fillRect(x - 10.5 + c * 6, y - 15.2 + r * 6, 4.5, 1.2); } panel(g, x + 7, y - 25, 6, 3, 1); return []; },
    leaf(g, x, y, u, t, n) { tree(g, x, y, 16, '#4f9c48', t, 0.5); box(g, x - 6, y - 14, 10, 7, 8, '#d7a46a'); gable(g, x - 6, y - 21, 10, 5, '#a8613a'); win(g, x - 8, y - 11, 3, 3, true); box(g, x + 7, y - 20, 8, 6, 7, '#e5b97c'); gable(g, x + 7, y - 26, 8, 4, '#b5703f'); g.strokeStyle = '#7a5434'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x - 1, y - 16); g.lineTo(x + 3, y - 22); g.stroke(); g.strokeStyle = 'rgba(255,220,130,0.9)'; g.beginPath(); g.moveTo(x - 14, y - 8); g.quadraticCurveTo(x, y - 3, x + 14, y - 10); g.stroke(); for (let i = 0; i < 5; i++) circle(g, x - 12 + i * 6, y - 7 + Math.sin(i) * 1.5, 1, '#ffd36a'); box(g, x - 12, y + 3, 7, 5, 6, '#c99760'); gable(g, x - 12, y - 2, 7, 4, '#9d5a33'); return []; },
    star(g, x, y, u, t, n) { g.fillStyle = '#e9f0f7'; g.beginPath(); g.moveTo(x - 15, y + 2); g.lineTo(x - 6, y - 44); g.lineTo(x + 6, y - 44); g.lineTo(x + 15, y + 2); g.fill(); g.fillStyle = '#c9d6e6'; g.beginPath(); g.moveTo(x + 6, y - 44); g.lineTo(x + 10, y - 42); g.lineTo(x + 19, y); g.lineTo(x + 15, y + 2); g.fill(); for (let r = 0; r < 7; r++) { const yy = y - 4 - r * 6, hw = 13 - r * 1.25; g.fillStyle = '#5bb85a'; g.fillRect(x - hw, yy, hw * 2, 1.5); for (let c = -2; c <= 2; c++) win(g, x + c * hw * 0.38 - 1, yy - 3.5, 2, 2.5, n || (r * 3 + c) % 4 === 0); } glowDot(g, x, y - 46, 8, '#aef', 0.7); return []; },
  };
  D.make = {
    0(g, x, y, u, t) { box(g, x - 2, y, 24, 12, 14, '#8a6f5e'); for (let i = 0; i < 3; i++) { g.fillStyle = '#6d564a'; g.beginPath(); g.moveTo(x - 14 + i * 8, y - 12); g.lineTo(x - 6 + i * 8, y - 18); g.lineTo(x - 6 + i * 8, y - 12); g.fill(); } box(g, x - 9, y - 12, 4, 20, 4, '#5a4840'); box(g, x + 7, y - 12, 4, 16, 4, '#5a4840'); return [[-8, -34, 2.5], [8, -30, 2]]; },
    1(g, x, y, u, t, n) { box(g, x, y, 22, 13, 14, '#b88b62'); gable(g, x, y - 13, 22, 7, '#7c5a44'); g.fillStyle = '#4a3a30'; g.fillRect(x - 4, y - 8, 8, 8); win(g, x - 9, y - 9, 3, 3, n); win(g, x + 6, y - 9, 3, 3, n); const a = t * 1.5; g.save(); g.translate(x + 12, y - 16); g.rotate(a); g.fillStyle = '#999'; for (let i = 0; i < 6; i++) { g.rotate(TAU / 6); g.fillRect(-1, -4.5, 2, 2); } circle(g, 0, 0, 3, '#aaa'); circle(g, 0, 0, 1, '#666'); g.restore(); return [[3, -22, 0.6]]; },
    2(g, x, y, u, t, n) { box(g, x, y, 24, 14, 14, '#dfe5ea'); g.fillStyle = '#5fc0ff'; g.fillRect(x - 12, y - 14, 24, 2); win(g, x - 9, y - 10, 6, 5, true); win(g, x + 2, y - 10, 6, 5, true); const a = Math.sin(t * 2) * 0.6; g.save(); g.translate(x - 4, y - 17); g.strokeStyle = '#ff9a3c'; g.lineWidth = 2.2; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(-1.2 + a) * 7, Math.sin(-1.2 + a) * 7); g.lineTo(Math.cos(-1.2 + a) * 7 + 5, Math.sin(-1.2 + a) * 7 + 2); g.stroke(); g.restore(); panel(g, x + 8, y - 16, 7, 3, 1); return []; },
    leaf(g, x, y, u, t, n) { box(g, x, y, 22, 12, 14, '#d9b07a'); gable(g, x, y - 12, 22, 8, '#6aa84f'); for (let i = 0; i < 4; i++) circle(g, x - 8 + i * 5, y - 15 + Math.abs(i - 1.5), 1.6, '#4f9a3c'); g.fillStyle = '#fbe9c8'; g.fillRect(x - 10, y - 9, 20, 6); for (let i = 0; i < 4; i++) { g.fillStyle = ['#e5533b', '#3b8de5', '#e5b13b', '#5bbf5b'][i]; g.fillRect(x - 9 + i * 5, y - 8, 3, 4); } g.strokeStyle = 'rgba(255,210,120,0.95)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x - 12, y - 4); g.lineTo(x + 12, y - 4); g.stroke(); circle(g, x + 15, y + 2, 2.6, '#c84'); g.strokeStyle = '#333'; g.beginPath(); g.arc(x + 15, y + 2, 2.6, 0, TAU); g.stroke(); return []; },
    star(g, x, y, u, t, n) { g.fillStyle = '#eef3fa'; g.beginPath(); g.moveTo(x - 8, y + 2); g.lineTo(x, y - 40); g.lineTo(x + 8, y + 2); g.fill(); g.fillStyle = '#c8d4e4'; g.beginPath(); g.moveTo(x, y - 40); g.lineTo(x + 8, y + 2); g.lineTo(x + 11, y); g.fill(); for (let i = 0; i < 3; i++) { const r = 8 + i * 4, yy = y - 12 - i * 9, a = t * (1 + i * 0.4); g.strokeStyle = `rgba(160,220,255,${0.8 - i * 0.2})`; g.lineWidth = 1; g.beginPath(); g.ellipse(x, yy, r, r * 0.3, 0, 0, TAU); g.stroke(); circle(g, x + Math.cos(a) * r, yy + Math.sin(a) * r * 0.3, 1.4, '#e8fbff'); } glowDot(g, x, y - 40, 7, '#cdf', 0.8); return []; },
  };
  D.waste = {
    0(g, x, y, u, t) { ell(g, x, y, 15, 6.5, '#8b7d62'); for (let i = 0; i < 12; i++) { const a = i * 2.4, r = (i % 4) * 2.6; box(g, x + Math.cos(a) * r * 1.6, y + 1 - (3 - (i % 4)) * 2.2 + Math.sin(a) * r * 0.5, 4, 3, 3, ['#6e6658', '#7c5a3e', '#556070', '#8a7650'][i % 4]); } circle(g, x + 9, y - 3, 1.5, '#c33'); return [[0, -12, 1.2]]; },
    1(g, x, y, u, t, n) { box(g, x - 4, y, 18, 12, 12, '#5c9fd1'); g.fillStyle = '#fff'; g.font = 'bold 9px sans-serif'; g.textAlign = 'center'; g.fillText('\u267B', x - 4, y - 3); for (let i = 0; i < 3; i++) box(g, x + 7 + i * 4, y + 3 - i, 3.5, 5, 3, ['#3fae55', '#e8c33f', '#4a8ad8'][i]); return []; },
    2(g, x, y, u, t) { ell(g, x, y, 15, 6.5, '#7aa84f'); for (let i = 0; i < 3; i++) box(g, x - 9 + i * 8, y + 1, 7, 6, 6, '#8b5e3c'); for (let i = 0; i < 3; i++) circle(g, x - 9 + i * 8, y - 7, 2.5, '#5f3d24'); for (let i = 0; i < 5; i++) { g.fillStyle = '#5fbf4a'; g.beginPath(); g.ellipse(x - 10 + i * 5, y - 9, 1.2, 2.6, (i - 2) * 0.3, 0, TAU); g.fill(); } return []; },
    leaf(g, x, y, u, t) { ell(g, x, y, 15, 6.5, '#6f9f48'); g.fillStyle = '#7a5a3c'; g.beginPath(); g.ellipse(x - 2, y - 1, 9, 4, 0, 0, TAU); g.fill(); const shroom = (sx, sy, s, c) => { g.fillStyle = '#f4ead8'; g.fillRect(sx - s * 0.25, sy - s, s * 0.5, s); g.fillStyle = c; g.beginPath(); g.ellipse(sx, sy - s, s * 0.8, s * 0.5, 0, Math.PI, TAU); g.fill(); circle(g, sx - s * 0.3, sy - s * 1.15, s * 0.12, '#fff'); };
      shroom(x - 6, y - 1, 7, '#e2553b'); shroom(x + 3, y, 5, '#e2953b'); shroom(x + 9, y + 2, 6, '#c9553b'); shroom(x - 1, y + 3, 4, '#f2b84b'); glowDot(g, x, y - 4, 12, '#b6ff9a', 0.18 + 0.08 * Math.sin(t * 2)); return []; },
    star(g, x, y, u, t) { box(g, x, y, 18, 8, 14, '#e1e8f2'); const a = t * 1.2; g.strokeStyle = '#8be0ff'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y - 18, 7, a, a + 4.5); g.stroke(); g.strokeStyle = '#ffc56b'; g.beginPath(); g.arc(x, y - 18, 4, -a, -a + 4); g.stroke(); circle(g, x, y - 18, 2, '#fff'); for (let i = 0; i < 4; i++) { const p = ((t * 0.8 + i / 4) % 1); g.globalAlpha = 1 - p; box(g, x - 7 + p * 7, y - 10 - p * 8, 2.5, 2, 2, ['#6e6658', '#7c5a3e', '#556070', '#8a7650'][i]); } g.globalAlpha = 1; glowDot(g, x, y - 18, 14, '#9ff', 0.35); return []; },
  };
  D.wild = {
    0(g, x, y, u, t) { ell(g, x, y, 14, 6, '#a7b26a'); for (const [dx, dy, s2] of [[-7, 0, 4], [6, 2, 3.4], [1, -3, 3]]) tree(g, x + dx, y + dy, s2, '#7fa04a', t); for (let i = 0; i < 6; i++) { g.fillStyle = '#86a04a'; g.fillRect(x - 11 + i * 4.4, y + 3 - (i % 3) * 2.4, 1, 3); } flower(g, x - 3, y + 3, '#f2e27a'); flower(g, x + 9, y - 1, '#f2e27a'); return []; },
    1(g, x, y, u, t) { ell(g, x, y, 15, 6.5, '#7fc463'); tree(g, x - 6, y - 1, 7, '#5aa84d', t); tree(g, x + 7, y + 2, 6, '#68b856', t); g.fillStyle = '#9a6b45'; g.fillRect(x - 2, y + 2, 8, 1.4); g.fillRect(x - 1, y + 3, 1, 2); g.fillRect(x + 4, y + 3, 1, 2); for (let i = 0; i < 4; i++) flower(g, x - 10 + i * 6, y + 4 - (i % 2) * 3, ['#ff8fb1', '#ffd34d'][i % 2]); return []; },
    2(g, x, y, u, t) { ell(g, x, y, 15, 6.5, '#4f9f4a'); pine(g, x - 8, y, 9, '#2f7d45'); tree(g, x + 1, y - 3, 9, '#3f9a48', t); pine(g, x + 9, y + 2, 8, '#2d7342'); tree(g, x - 2, y + 4, 6, '#5ab055', t); return []; },
    leaf(g, x, y, u, t) { ell(g, x, y, 15, 6.5, '#7fcf5f'); for (let i = 0; i < 22; i++) { const a = i * 2.39996, r = Math.sqrt(i / 22) * 12; const fx = x + Math.cos(a) * r, fy = y + Math.sin(a) * r * 0.42; g.fillStyle = '#4f9f3a'; g.fillRect(fx, fy - 4, 0.8, 4); flower(g, fx + 0.4, fy - 4 - Math.sin(t * 2 + i) * 0.4, ['#ff7aa8', '#ffd34d', '#b88bff', '#ffffff', '#ff9a4a'][i % 5]); } tree(g, x + 9, y - 2, 6, '#5ab055', t); return []; },
    star(g, x, y, u, t) { ell(g, x, y, 15, 6.5, '#79c86a'); tree(g, x - 4, y + 1, 8, '#4fae5a', t); tree(g, x + 5, y - 1, 7, '#5fc26a', t); g.fillStyle = 'rgba(200,245,255,0.28)'; g.beginPath(); g.ellipse(x, y, 15, 26, 0, Math.PI, TAU); g.fill(); g.strokeStyle = 'rgba(230,255,255,0.8)'; g.lineWidth = 1; g.beginPath(); g.ellipse(x, y, 15, 26, 0, Math.PI, TAU); g.stroke(); g.beginPath(); g.ellipse(x, y, 7, 26, 0, Math.PI, TAU); g.stroke(); g.beginPath(); g.ellipse(x, y - 13, 13, 4, 0, Math.PI, TAU); g.stroke(); glowDot(g, x - 6, y - 20, 4, '#fff', 0.8); return []; },
  };

  function drawBuilding(g, axis, era, variant, x, y, u, t, night) {
    const k = era === 3 ? variant || 'leaf' : era;
    const s = u / 19;
    g.save(); g.translate(x, y); g.scale(s, s);
    const em = D[axis][k](g, 0, 0, u, t, night) || [];
    g.restore();
    return em.map(([dx, dy, k2]) => [x + dx * s, y + dy * s, k2]);
  }

  // ---------- critters ----------
  function drawCritter(g, id, x, y, s, t, seed = 0) {
    g.save(); g.translate(x, y); g.scale(s, s);
    const ph = t * 1 + seed;
    if (id === 'bird') { const bx = Math.cos(ph * 0.9) * 10, by = -26 + Math.sin(ph * 1.8) * 3, f = Math.sin(t * 12 + seed) * 3; g.strokeStyle = '#3a3a4a'; g.lineWidth = 1.4; g.lineCap = 'round'; g.beginPath(); g.moveTo(bx - 4, by - f); g.quadraticCurveTo(bx - 2, by - 1, bx, by); g.quadraticCurveTo(bx + 2, by - 1, bx + 4, by - f); g.stroke(); }
    else if (id === 'bee') { for (let i = 0; i < 2; i++) { const bx = Math.sin(ph * 2.3 + i * 2) * 9, by = -10 + Math.sin(ph * 3.7 + i) * 4; circle(g, bx, by, 1.8, '#ffcc2a'); g.fillStyle = '#222'; g.fillRect(bx - 0.4, by - 1.8, 0.8, 3.6); g.globalAlpha = 0.7; circle(g, bx - 0.5, by - 2, 1.2, '#fff'); g.globalAlpha = 1; } }
    else if (id === 'duck') { const dx = Math.sin(ph * 0.5) * 6; ell(g, dx, 2, 4, 2.3, '#f6f1e2'); circle(g, dx + 3, -0.8, 1.9, '#2f7d4a'); g.fillStyle = '#f3a23a'; g.fillRect(dx + 4.6, -0.9, 1.8, 0.9); ell(g, dx - 1, 4.2, 5, 0.9, 'rgba(120,200,255,0.5)'); }
    else if (id === 'butterfly') { for (let i = 0; i < 2; i++) { const bx = Math.cos(ph * 1.1 + i * 3) * 10, by = -14 + Math.sin(ph * 1.7 + i) * 5, f = Math.abs(Math.sin(t * 10 + i)) * 2.4 + 0.4, c = i ? '#ff8ad1' : '#7ec6ff'; g.fillStyle = c; g.beginPath(); g.ellipse(bx - f / 2, by, f, 2.2, -0.4, 0, TAU); g.ellipse(bx + f / 2, by, f, 2.2, 0.4, 0, TAU); g.fill(); } }
    else if (id === 'fox') { const fx = Math.sin(ph * 0.35) * 7, dir = Math.cos(ph * 0.35) > 0 ? 1 : -1; g.scale(dir, 1); ell(g, fx * dir, 0, 5, 2.6, '#e8742a'); circle(g, fx * dir + 5, -2, 2.3, '#e8742a'); g.fillStyle = '#e8742a'; g.beginPath(); g.moveTo(fx * dir + 4, -3.5); g.lineTo(fx * dir + 4.6, -6.5); g.lineTo(fx * dir + 6, -3.8); g.fill(); g.fillStyle = '#e8742a'; g.beginPath(); g.ellipse(fx * dir - 6, -1.5, 3.6, 1.6, -0.5, 0, TAU); g.fill(); circle(g, fx * dir - 8.5, -2.8, 1.2, '#fff'); g.fillStyle = '#5a2a10'; g.fillRect(fx * dir - 3, 2, 1, 2.5); g.fillRect(fx * dir + 3, 2, 1, 2.5); }
    else if (id === 'deer') { const gz = Math.sin(ph * 0.4) > 0.3; ell(g, 0, -4, 6, 3.2, '#b7804a'); g.fillStyle = '#9a6a3a'; for (const lx of [-4, -2, 2.5, 4.5]) g.fillRect(lx, -2, 1, 6); const hx = 6, hy = gz ? 0 : -10; g.strokeStyle = '#b7804a'; g.lineWidth = 2; g.beginPath(); g.moveTo(4, -5); g.lineTo(hx, hy + 1); g.stroke(); circle(g, hx + 0.5, hy, 2.1, '#b7804a'); g.strokeStyle = '#6b4a2e'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(hx, hy - 1.5); g.lineTo(hx - 1, hy - 5); g.lineTo(hx - 2.5, hy - 6); g.moveTo(hx - 1, hy - 4); g.lineTo(hx + 1, hy - 6); g.stroke(); circle(g, -5.5, -5, 1, '#fff'); }
    g.restore();
  }


  // ---------- v0.6 reason pictograms (thought bubbles): drawn centred on (x, y) inside radius r ----------
  function bolt(g, x, y, k, c) { g.fillStyle = c; g.beginPath(); g.moveTo(x + 2 * k, y - 9 * k); g.lineTo(x - 5 * k, y + 1 * k); g.lineTo(x - 0.5 * k, y + 1 * k); g.lineTo(x - 2 * k, y + 9 * k); g.lineTo(x + 5 * k, y - 2 * k); g.lineTo(x + 0.5 * k, y - 2 * k); g.closePath(); g.fill(); }
  function drawReason(g, why, x, y, r, t = 0) {
    const k = r / 12;
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    if (why === 'park') { g.fillStyle = '#7a5434'; g.fillRect(x - 6 * k, y - 1 * k, 2 * k, 7 * k); circle(g, x - 5 * k, y - 4 * k, 5 * k, '#4f9c48'); circle(g, x - 3 * k, y - 6 * k, 3.4 * k, '#6cc25a'); g.fillStyle = '#b07a48'; g.fillRect(x + 0 * k, y + 2 * k, 9 * k, 2 * k); g.fillRect(x + 0.5 * k, y - 1.5 * k, 8 * k, 1.5 * k); g.fillRect(x + 1 * k, y + 3 * k, 1.4 * k, 4 * k); g.fillRect(x + 6.6 * k, y + 3 * k, 1.4 * k, 4 * k); }
    else if (why === 'apple' || why === 'scraps') {
      if (why === 'apple') { circle(g, x - 2.4 * k, y + 1 * k, 5.4 * k, '#e8473c'); circle(g, x + 2.4 * k, y + 1 * k, 5.4 * k, '#e8473c'); circle(g, x - 3 * k, y - 1 * k, 1.6 * k, '#ff9a8a'); }
      else { g.fillStyle = '#f6e7b0'; g.beginPath(); g.ellipse(x, y + 1 * k, 3 * k, 6 * k, 0, 0, TAU); g.fill(); circle(g, x, y - 5 * k, 3.4 * k, '#e8473c'); circle(g, x, y + 7 * k, 3.4 * k, '#e8473c'); circle(g, x, y + 1 * k, 1 * k, '#5a3a20'); }
      g.strokeStyle = '#6b4a2e'; g.lineWidth = 1.4 * k; g.beginPath(); g.moveTo(x, y - (why === 'apple' ? 4 : 8) * k); g.lineTo(x + 1 * k, y - (why === 'apple' ? 8 : 10.5) * k); g.stroke();
      g.fillStyle = '#5fbf4a'; g.beginPath(); g.ellipse(x + 3.5 * k, y - (why === 'apple' ? 7.5 : 10) * k, 3 * k, 1.5 * k, -0.4, 0, TAU); g.fill();
    }
    else if (why === 'bus' || why === 'riders') { g.fillStyle = '#f2b72e'; g.beginPath(); if (g.roundRect) g.roundRect(x - 9 * k, y - 6 * k, 18 * k, 10 * k, 2.5 * k); else g.rect(x - 9 * k, y - 6 * k, 18 * k, 10 * k); g.fill(); g.fillStyle = '#bfe6ff'; for (let i = 0; i < 4; i++) g.fillRect(x - 7.5 * k + i * 4 * k, y - 4.5 * k, 3 * k, 3.5 * k); if (why === 'riders') for (let i = 0; i < 3; i++) circle(g, x - 6 * k + i * 4 * k, y - 2.6 * k, 1.1 * k, '#8a5a3a'); circle(g, x - 5 * k, y + 4.5 * k, 2.2 * k, '#333'); circle(g, x + 5 * k, y + 4.5 * k, 2.2 * k, '#333'); }
    else if (why === 'bolt') bolt(g, x, y, k, '#ffc21a');
    else if (why === 'quiet') { // a sleeping moon: quiet enough to sleep
      circle(g, x - 1 * k, y + 1 * k, 7 * k, '#ffe27a'); circle(g, x + 2.5 * k, y - 1.5 * k, 6 * k, 'rgba(255,255,255,1)');
      g.strokeStyle = '#7a8ab0'; g.lineWidth = 1.4 * k; g.beginPath(); g.moveTo(x + 4 * k, y - 8 * k); g.lineTo(x + 8 * k, y - 8 * k); g.lineTo(x + 4 * k, y - 4 * k); g.lineTo(x + 8 * k, y - 4 * k); g.stroke();
    }
    else if (why === 'noise') { // spinning blades + loud zig-zags
      g.save(); g.translate(x - 3 * k, y + 1 * k); g.rotate(t * 6); g.fillStyle = '#8a96a4'; for (let i = 0; i < 3; i++) { g.rotate(TAU / 3); g.beginPath(); g.ellipse(0, -3.4 * k, 1.4 * k, 3.6 * k, 0, 0, TAU); g.fill(); } g.restore(); circle(g, x - 3 * k, y + 1 * k, 1.4 * k, '#5d6670');
      g.strokeStyle = '#e0604a'; g.lineWidth = 1.5 * k; for (let i = 0; i < 2; i++) { const ox = x + (4 + i * 3.5) * k; g.beginPath(); g.moveTo(ox, y - 6 * k); g.lineTo(ox + 1.6 * k, y - 3 * k); g.lineTo(ox - 0.4 * k, y - 0 * k); g.lineTo(ox + 1.6 * k, y + 3 * k); g.lineTo(ox, y + 6 * k); g.stroke(); }
    }
    else if (why === 'smoke') { const b = Math.sin(t * 2) * 0.8 * k; circle(g, x - 4 * k, y + 2 * k + b, 4.6 * k, '#6e665e'); circle(g, x + 1 * k, y - 2 * k - b, 5.4 * k, '#7d7468'); circle(g, x + 5 * k, y + 2.5 * k + b, 4 * k, '#5f5850'); circle(g, x - 1 * k, y - 3.4 * k - b, 1.4 * k, '#9a9288'); }
    else if (why === 'smell') { g.fillStyle = '#6b6a5a'; g.beginPath(); g.moveTo(x - 6 * k, y + 7 * k); g.quadraticCurveTo(x - 8 * k, y - 1 * k, x - 2 * k, y - 1 * k); g.lineTo(x + 2 * k, y - 1 * k); g.quadraticCurveTo(x + 8 * k, y - 1 * k, x + 6 * k, y + 7 * k); g.fill(); g.strokeStyle = '#8ac43a'; g.lineWidth = 1.5 * k; for (let i = -1; i <= 1; i++) { const ox = x + i * 4 * k, ph = Math.sin(t * 3 + i) * k; g.beginPath(); g.moveTo(ox, y - 2.5 * k); g.quadraticCurveTo(ox - 2 * k + ph, y - 5.5 * k, ox, y - 8 * k); g.quadraticCurveTo(ox + 2 * k + ph, y - 10 * k, ox, y - 11.5 * k); g.stroke(); } }
    else if (why === 'wind') { g.strokeStyle = '#5aa6d8'; g.lineWidth = 1.8 * k; for (let i = 0; i < 3; i++) { const oy = y - 5 * k + i * 5 * k, ox = x - 8 * k + ((t * 6 + i * 3) % 4) * k * 0.6; g.beginPath(); g.moveTo(ox, oy); g.lineTo(ox + (9 + i * 2) * k, oy); g.arc(ox + (9 + i * 2) * k, oy - 2.2 * k, 2.2 * k, Math.PI / 2, -Math.PI * 0.9, true); g.stroke(); } }
    else if (why === 'drop') { g.fillStyle = '#3f9be0'; g.beginPath(); g.moveTo(x, y - 9 * k); g.quadraticCurveTo(x + 7 * k, y + 0 * k, x + 6 * k, y + 3 * k); g.arc(x, y + 3 * k, 6 * k, 0, Math.PI); g.quadraticCurveTo(x - 7 * k, y, x, y - 9 * k); g.fill(); circle(g, x - 2.4 * k, y + 2 * k, 1.6 * k, '#bfe6ff'); }
    else if (why === 'compost') { g.fillStyle = '#6b4a2e'; g.beginPath(); g.ellipse(x, y + 5 * k, 9 * k, 4 * k, 0, Math.PI, TAU); g.fill(); g.fillRect(x - 9 * k, y + 5 * k, 18 * k, 1.5 * k); g.strokeStyle = '#3f9a3a'; g.lineWidth = 1.6 * k; g.beginPath(); g.moveTo(x, y + 2 * k); g.lineTo(x, y - 5 * k); g.stroke(); g.fillStyle = '#6cc25a'; g.beginPath(); g.ellipse(x - 3 * k, y - 5 * k, 3.4 * k, 1.8 * k, 0.5, 0, TAU); g.fill(); g.beginPath(); g.ellipse(x + 3 * k, y - 6.5 * k, 3.4 * k, 1.8 * k, -0.5, 0, TAU); g.fill(); for (let i = 0; i < 3; i++) circle(g, x - 5 * k + i * 5 * k, y + 3.5 * k, 0.9 * k, '#a07850'); }
    else if (why === 'flies') { for (let i = 0; i < 3; i++) { const a = t * 3 + i * 2.1, fx = x + Math.cos(a) * 5.5 * k, fy = y + Math.sin(a * 1.3) * 4.5 * k; g.globalAlpha = 0.85; ell(g, fx - 1.3 * k, fy - 1.6 * k, 1.5 * k, 1 * k, '#dfe9f0'); ell(g, fx + 1.3 * k, fy - 1.6 * k, 1.5 * k, 1 * k, '#dfe9f0'); g.globalAlpha = 1; circle(g, fx, fy, 1.6 * k, '#222'); } }
    else if (why === 'market') { g.strokeStyle = '#a0703a'; g.lineWidth = 1.6 * k; g.beginPath(); g.arc(x, y - 1 * k, 6 * k, Math.PI, TAU); g.stroke(); circle(g, x - 3 * k, y - 0.5 * k, 2.6 * k, '#e8473c'); circle(g, x + 2.5 * k, y - 0.5 * k, 2.6 * k, '#ffb43a'); circle(g, x, y - 2 * k, 2.4 * k, '#7ac25a'); g.fillStyle = '#c8924e'; g.beginPath(); g.moveTo(x - 8 * k, y + 0.5 * k); g.lineTo(x + 8 * k, y + 0.5 * k); g.lineTo(x + 6 * k, y + 7 * k); g.lineTo(x - 6 * k, y + 7 * k); g.closePath(); g.fill(); g.strokeStyle = '#a0703a'; g.lineWidth = 0.8 * k; g.beginPath(); g.moveTo(x - 7 * k, y + 3.5 * k); g.lineTo(x + 7 * k, y + 3.5 * k); g.stroke(); }
    else if (why === 'drink') { ell(g, x, y + 5 * k, 9 * k, 2.6 * k, '#6cc4f0'); const b = Math.sin(t * 2) * 0.6 * k; ell(g, x - 1 * k, y + 1.5 * k + b, 5 * k, 3 * k, '#f6f1e2'); circle(g, x + 3.5 * k, y - 2.5 * k + b, 2.6 * k, '#2f7d4a'); g.fillStyle = '#f3a23a'; g.fillRect(x + 5.5 * k, y - 2.8 * k + b, 2.6 * k, 1.3 * k); circle(g, x + 4 * k, y - 3 * k + b, 0.6 * k, '#111'); }
    else if (why === 'truck') { g.fillStyle = '#4a8ad8'; g.fillRect(x - 9 * k, y - 5 * k, 11 * k, 8 * k); g.fillStyle = '#e5533b'; g.fillRect(x + 2 * k, y - 2 * k, 6 * k, 5 * k); g.fillStyle = '#bfe6ff'; g.fillRect(x + 4 * k, y - 1 * k, 3 * k, 2 * k); circle(g, x - 5 * k, y + 4 * k, 2 * k, '#333'); circle(g, x + 5 * k, y + 4 * k, 2 * k, '#333'); g.fillStyle = '#f6d77a'; g.fillRect(x - 7 * k, y - 3 * k, 3 * k, 3 * k); g.fillRect(x - 3 * k, y - 3 * k, 3 * k, 3 * k); }
    else if (why === 'recycle') { g.strokeStyle = '#3fae55'; g.lineWidth = 2.2 * k; for (let i = 0; i < 3; i++) { const a0 = t * 1.2 + i * TAU / 3; g.beginPath(); g.arc(x, y, 6 * k, a0, a0 + 1.5); g.stroke(); const ax = x + Math.cos(a0 + 1.5) * 6 * k, ay = y + Math.sin(a0 + 1.5) * 6 * k, d = a0 + 1.5 + Math.PI / 2; g.fillStyle = '#3fae55'; g.beginPath(); g.moveTo(ax + Math.cos(d) * 3 * k, ay + Math.sin(d) * 3 * k); g.lineTo(ax + Math.cos(d + 2.3) * 2.6 * k, ay + Math.sin(d + 2.3) * 2.6 * k); g.lineTo(ax + Math.cos(d - 2.3) * 2.6 * k, ay + Math.sin(d - 2.3) * 2.6 * k); g.fill(); } }
    else if (why === 'forest') { pine(g, x - 4 * k, y + 7 * k, 6 * k, '#2f7d45'); pine(g, x + 4 * k, y + 7 * k, 5 * k, '#3f9a48'); }
    g.restore();
  }
  // small heart (like) / frown face (dislike) badges for bubbles
  function heartBadge(g, x, y, r, c = '#ff5c86') { g.fillStyle = c; g.beginPath(); g.moveTo(x, y + r * 0.9); g.bezierCurveTo(x - r * 1.4, y - r * 0.1, x - r * 0.6, y - r * 1.2, x, y - r * 0.4); g.bezierCurveTo(x + r * 0.6, y - r * 1.2, x + r * 1.4, y - r * 0.1, x, y + r * 0.9); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = Math.max(1, r * 0.22); g.stroke(); }
  function frownBadge(g, x, y, r) { circle(g, x, y, r + 1.2, '#fff'); circle(g, x, y, r, '#9aa3ad'); circle(g, x - r * 0.35, y - r * 0.2, r * 0.13, '#fff'); circle(g, x + r * 0.35, y - r * 0.2, r * 0.13, '#fff'); g.strokeStyle = '#fff'; g.lineWidth = Math.max(1, r * 0.16); g.beginPath(); g.arc(x, y + r * 0.55, r * 0.38, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); }

  root.ART = { drawBuilding, drawCritter, mix, shade, rgb, hex2rgb, box, tree, pine, circle, ell, glowDot, flower, turbine, panel, TAU, drawReason, heartBadge, frownBadge, bolt };
})(typeof window !== 'undefined' ? window : globalThis);
