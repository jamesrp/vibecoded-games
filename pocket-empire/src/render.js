// POCKET EMPIRE — map renderer (canvas). All art is procedural.
(function (root) {
'use strict';
const P = root.PE, D = root.PE_DATA;
const S3 = Math.sqrt(3);
const COLORS = { ocean: ['#16406a', '#1b4c7a'], coast: ['#2f84a6', '#3a93b3'], grass: ['#5f9a44', '#6ea84d'], plains: ['#a9a04e', '#b9ad5a'], desert: ['#d8b872', '#e4c784'],
  tundra: ['#98a39b', '#a9b3aa'], hills: ['#8e8a55', '#9c9660'], mountain: ['#6f6a66', '#7c7773'] };
const R = { s: 30, ox: 0, oy: 0, fx: [], layer: null, t: 0 };
function hrand(seed) { let x = seed * 2654435761 >>> 0; return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }
function center(i) { const c = P.COL(i), r = P.ROW(i); return [R.ox + R.s * S3 * (c + 0.5 * (r & 1)) + R.s * S3 / 2, R.oy + R.s * 1.5 * r + R.s]; }
function corners(x, y, s) { const out = []; for (let k = 0; k < 6; k++) { const a = Math.PI / 180 * (60 * k - 30); out.push([x + s * Math.cos(a), y + s * Math.sin(a)]); } return out; }
function hexPath(ctx, x, y, s) { const cs = corners(x, y, s); ctx.beginPath(); ctx.moveTo(cs[0][0], cs[0][1]); for (let k = 1; k < 6; k++) ctx.lineTo(cs[k][0], cs[k][1]); ctx.closePath(); }
function sharedEdge(i, j) { const [x, y] = center(i), [nx, ny] = center(j); const cs = corners(x, y, R.s); const mx = (x + nx) / 2, my = (y + ny) / 2; return cs.map((c, k) => [k, Math.hypot(c[0] - mx, c[1] - my)]).sort((a, b) => a[1] - b[1]).slice(0, 2).map((o) => cs[o[0]]); }
function layout(w, h) {
  const s = Math.min((w - 20) / (P.W * S3 + S3 / 2), (h - 60) / (P.H * 1.5 + 0.5));
  R.s = Math.max(16, s); const mw = R.s * (P.W * S3 + S3 / 2), mh = R.s * (P.H * 1.5 + 0.5);
  R.ox = (w - mw) / 2; R.oy = Math.max(44, (h - mh) / 2 + 16); R.layer = null;
}
function pickTile(px, py) { let best = -1, bd = 1e9; for (let i = 0; i < P.N; i++) { const [x, y] = center(i); const d = (x - px) ** 2 + (y - py) ** 2; if (d < bd) { bd = d; best = i; } } return bd < R.s * R.s ? best : -1; }
function mix(a, b, t) { const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16); const r = (pa >> 16) + ((pb >> 16) - (pa >> 16)) * t, gg = ((pa >> 8) & 255) + (((pb >> 8) & 255) - ((pa >> 8) & 255)) * t, bb = (pa & 255) + ((pb & 255) - (pa & 255)) * t; return `rgb(${r | 0},${gg | 0},${bb | 0})`; }

// ---------- static terrain layer
function buildTerrain(g, w, h) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const ctx = cv.getContext('2d');
  // sea background with soft vignette
  const bg = ctx.createRadialGradient(w / 2, h / 2, 50, w / 2, h / 2, Math.max(w, h) * 0.7); bg.addColorStop(0, '#174870'); bg.addColorStop(1, '#0a1c30'); ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  const s = R.s;
  for (let i = 0; i < P.N; i++) {
    const t = g.ter[i]; const [x, y] = center(i); const rr = hrand(g.decor[i] + 7);
    const [c0, c1] = COLORS[t]; hexPath(ctx, x, y, s + 0.6);
    const gr = ctx.createLinearGradient(x - s, y - s, x + s, y + s); gr.addColorStop(0, mix(c1, '#ffffff', 0.06)); gr.addColorStop(1, mix(c0, '#000000', 0.08));
    ctx.fillStyle = gr; ctx.fill();
    // texture speckles
    for (let k = 0; k < 10; k++) { const a = rr() * 6.283, d = rr() * s * 0.8; ctx.fillStyle = rr() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)'; ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, s * (0.05 + rr() * 0.1), 0, 6.283); ctx.fill(); }
  }
  // shorelines: foam on water side, sand lip on land side
  for (let i = 0; i < P.N; i++) {
    const land = !D.TER[g.ter[i]].water; if (!land) continue;
    for (const n of P.NB[i]) if (D.TER[g.ter[n]].water) {
      const [a, b] = sharedEdge(i, n);
      ctx.strokeStyle = 'rgba(236,222,170,0.55)'; ctx.lineWidth = s * 0.14; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      const [nx, ny] = center(n); const ox = (nx - (a[0] + b[0]) / 2) * 0.18, oy = (ny - (a[1] + b[1]) / 2) * 0.18;
      ctx.strokeStyle = 'rgba(230,245,250,0.35)'; ctx.lineWidth = s * 0.06; ctx.beginPath(); ctx.moveTo(a[0] + ox, a[1] + oy); ctx.lineTo(b[0] + ox, b[1] + oy); ctx.stroke();
    }
  }
  for (let i = 0; i < P.N; i++) drawFeatures(ctx, g, i);
  return cv;
}
function tree(ctx, x, y, s, conifer, rr) {
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(x + s * 0.05, y + s * 0.02, s * 0.16, s * 0.06, 0, 0, 6.283); ctx.fill();
  ctx.fillStyle = '#4a3423'; ctx.fillRect(x - s * 0.02, y - s * 0.1, s * 0.04, s * 0.1);
  if (conifer) { const cols = ['#2c5a46', '#356b52']; for (let k = 0; k < 2; k++) { ctx.fillStyle = cols[k]; ctx.beginPath(); ctx.moveTo(x, y - s * (0.42 - k * 0.1)); ctx.lineTo(x - s * 0.15, y - s * (0.1 + k * 0.04)); ctx.lineTo(x + s * 0.15, y - s * (0.1 + k * 0.04)); ctx.closePath(); ctx.fill(); } }
  else { const c = rr() < 0.5 ? '#2f6b34' : '#3b7a3a'; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y - s * 0.22, s * 0.15, 0, 6.283); ctx.fill(); ctx.fillStyle = 'rgba(255,255,220,0.14)'; ctx.beginPath(); ctx.arc(x - s * 0.05, y - s * 0.27, s * 0.07, 0, 6.283); ctx.fill(); }
}
function drawFeatures(ctx, g, i) {
  const t = g.ter[i]; const [x, y] = center(i); const s = R.s; const rr = hrand(g.decor[i] + 99);
  if (t === 'ocean' || t === 'coast') {
    ctx.strokeStyle = t === 'coast' ? 'rgba(220,250,255,0.22)' : 'rgba(180,220,255,0.12)'; ctx.lineWidth = 1.2;
    for (let k = 0; k < 2; k++) { const wx = x + (rr() - 0.5) * s, wy = y + (rr() - 0.5) * s * 0.9; ctx.beginPath(); ctx.arc(wx, wy, s * 0.14, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); ctx.beginPath(); ctx.arc(wx + s * 0.25, wy, s * 0.14, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
  } else if (t === 'grass' && !g.forest[i]) {
    ctx.strokeStyle = 'rgba(40,80,25,0.5)'; ctx.lineWidth = 1;
    for (let k = 0; k < 5; k++) { const gx = x + (rr() - 0.5) * s * 1.2, gy = y + (rr() - 0.5) * s; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx - 2, gy - s * 0.12); ctx.moveTo(gx, gy); ctx.lineTo(gx + 2, gy - s * 0.12); ctx.stroke(); }
  } else if (t === 'plains' && !g.forest[i]) {
    ctx.strokeStyle = 'rgba(120,95,30,0.45)'; ctx.lineWidth = 1.3;
    for (let k = 0; k < 4; k++) { const gx = x + (rr() - 0.5) * s * 1.1, gy = y + (rr() - 0.5) * s * 0.9; ctx.beginPath(); ctx.moveTo(gx - s * 0.15, gy); ctx.quadraticCurveTo(gx, gy - s * 0.06, gx + s * 0.15, gy); ctx.stroke(); }
  } else if (t === 'desert') {
    ctx.strokeStyle = 'rgba(160,110,50,0.35)'; ctx.lineWidth = 1.5;
    for (let k = 0; k < 3; k++) { const gx = x + (rr() - 0.5) * s, gy = y + (rr() - 0.5) * s * 0.8; ctx.beginPath(); ctx.moveTo(gx - s * 0.25, gy); ctx.quadraticCurveTo(gx, gy - s * 0.16, gx + s * 0.25, gy); ctx.stroke(); }
  } else if (t === 'tundra' && !g.forest[i]) {
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; for (let k = 0; k < 7; k++) { ctx.beginPath(); ctx.arc(x + (rr() - 0.5) * s * 1.2, y + (rr() - 0.5) * s, 1.3, 0, 6.283); ctx.fill(); }
  } else if (t === 'hills') {
    for (let k = 0; k < 2; k++) { const hx = x + (k ? s * 0.22 : -s * 0.2), hy = y + (k ? s * 0.12 : -s * 0.05), hw = s * (0.34 - k * 0.06);
      ctx.fillStyle = '#7b7445'; ctx.beginPath(); ctx.moveTo(hx - hw, hy + s * 0.1); ctx.quadraticCurveTo(hx, hy - s * 0.42, hx + hw, hy + s * 0.1); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,250,210,0.2)'; ctx.beginPath(); ctx.moveTo(hx - hw, hy + s * 0.1); ctx.quadraticCurveTo(hx - hw * 0.3, hy - s * 0.36, hx, hy - s * 0.16); ctx.lineTo(hx - hw * 0.2, hy + s * 0.1); ctx.closePath(); ctx.fill(); }
  } else if (t === 'mountain') {
    const peaks = [[-0.28, 0.12, 0.5], [0.05, -0.02, 0.72], [0.32, 0.16, 0.45]];
    for (const [dx, dy, hgt] of peaks) { const px = x + dx * s, py = y + dy * s + s * 0.25, hw = s * 0.32, top = py - s * hgt;
      ctx.fillStyle = '#5f5a57'; ctx.beginPath(); ctx.moveTo(px - hw, py); ctx.lineTo(px, top); ctx.lineTo(px + hw, py); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#86807a'; ctx.beginPath(); ctx.moveTo(px - hw, py); ctx.lineTo(px, top); ctx.lineTo(px + hw * 0.1, py); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#f2f2f0'; ctx.beginPath(); ctx.moveTo(px, top); ctx.lineTo(px - hw * 0.32, top + s * hgt * 0.32); ctx.lineTo(px - hw * 0.05, top + s * hgt * 0.25); ctx.lineTo(px + hw * 0.3, top + s * hgt * 0.32); ctx.closePath(); ctx.fill(); }
  }
  if (g.forest[i]) { const pts = [[-0.32, -0.05], [0.0, -0.25], [0.3, -0.05], [-0.15, 0.3], [0.18, 0.32], [0.45, 0.25], [-0.45, 0.25]]; for (const [dx, dy] of pts) if (rr() < 0.85) tree(ctx, x + dx * s + (rr() - 0.5) * 3, y + dy * s + s * 0.12, s, t === 'tundra' || t === 'hills', rr); }
  if (g.res[i]) drawRes(ctx, g.res[i], x + s * 0.42, y + s * 0.36, s * 0.2);
}
function drawRes(ctx, r, x, y, rad) {
  ctx.fillStyle = 'rgba(20,18,14,0.7)'; ctx.beginPath(); ctx.arc(x, y, rad, 0, 6.283); ctx.fill(); ctx.strokeStyle = 'rgba(255,240,200,0.6)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.save(); ctx.translate(x, y); const k = rad;
  const f = (c) => { ctx.fillStyle = c; ctx.fill(); };
  switch (r) {
    case 'wheat': ctx.strokeStyle = '#f0c850'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(0, k * 0.7); ctx.lineTo(0, -k * 0.6); ctx.stroke(); for (let j = 0; j < 3; j++) { ctx.beginPath(); ctx.ellipse(-k * 0.2, -k * 0.4 + j * k * 0.35, k * 0.12, k * 0.22, -0.6, 0, 6.283); f('#f0c850'); ctx.beginPath(); ctx.ellipse(k * 0.2, -k * 0.4 + j * k * 0.35, k * 0.12, k * 0.22, 0.6, 0, 6.283); f('#f0c850'); } break;
    case 'fish': ctx.beginPath(); ctx.ellipse(-k * 0.1, 0, k * 0.45, k * 0.25, 0, 0, 6.283); f('#9fd6ef'); ctx.beginPath(); ctx.moveTo(k * 0.3, 0); ctx.lineTo(k * 0.65, -k * 0.3); ctx.lineTo(k * 0.65, k * 0.3); ctx.closePath(); f('#9fd6ef'); break;
    case 'stone': ctx.fillStyle = '#c9c4bb'; ctx.fillRect(-k * 0.55, 0, k * 0.5, k * 0.35); ctx.fillRect(k * 0.05, 0, k * 0.5, k * 0.35); ctx.fillRect(-k * 0.25, -k * 0.4, k * 0.5, k * 0.35); break;
    case 'horses': ctx.beginPath(); ctx.moveTo(-k * 0.3, k * 0.6); ctx.lineTo(-k * 0.2, -k * 0.2); ctx.lineTo(k * 0.15, -k * 0.6); ctx.lineTo(k * 0.55, -k * 0.2); ctx.lineTo(k * 0.35, -k * 0.05); ctx.lineTo(k * 0.15, -k * 0.2); ctx.lineTo(k * 0.25, k * 0.6); ctx.closePath(); f('#c98a52'); break;
    case 'iron': ctx.beginPath(); ctx.moveTo(-k * 0.55, k * 0.3); ctx.lineTo(-k * 0.3, -k * 0.2); ctx.lineTo(k * 0.3, -k * 0.2); ctx.lineTo(k * 0.55, k * 0.3); ctx.closePath(); f('#9aa6b2'); break;
    case 'gems': ctx.beginPath(); ctx.moveTo(0, -k * 0.6); ctx.lineTo(k * 0.5, -k * 0.1); ctx.lineTo(0, k * 0.6); ctx.lineTo(-k * 0.5, -k * 0.1); ctx.closePath(); f('#c58cf0'); break;
    case 'incense': ctx.strokeStyle = '#e6d7ff'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(0, k * 0.6); ctx.bezierCurveTo(-k * 0.6, k * 0.1, k * 0.6, -k * 0.2, 0, -k * 0.65); ctx.stroke(); break;
    case 'deer': ctx.strokeStyle = '#d9b38a'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(0, k * 0.5); ctx.lineTo(0, -k * 0.1); ctx.lineTo(-k * 0.45, -k * 0.55); ctx.moveTo(0, -k * 0.1); ctx.lineTo(k * 0.45, -k * 0.55); ctx.moveTo(-k * 0.25, -k * 0.33); ctx.lineTo(-k * 0.45, -k * 0.2); ctx.moveTo(k * 0.25, -k * 0.33); ctx.lineTo(k * 0.45, -k * 0.2); ctx.stroke(); break;
    case 'pearls': for (const [dx, dy] of [[-0.25, 0.15], [0.25, 0.15], [0, -0.25]]) { ctx.beginPath(); ctx.arc(dx * k, dy * k, k * 0.24, 0, 6.283); f('#f4f0ea'); } break;
  }
  ctx.restore();
}
// ---------- unit glyphs
function glyph(ctx, type, s) {
  ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff'; ctx.lineWidth = Math.max(1.6, s * 0.11); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const L = (a, b, c, d) => { ctx.beginPath(); ctx.moveTo(a * s, b * s); ctx.lineTo(c * s, d * s); ctx.stroke(); };
  const horse = () => { ctx.beginPath(); ctx.moveTo(-0.35 * s, 0.55 * s); ctx.lineTo(-0.25 * s, -0.1 * s); ctx.lineTo(0.1 * s, -0.55 * s); ctx.lineTo(0.25 * s, -0.45 * s); ctx.lineTo(0.55 * s, -0.1 * s); ctx.lineTo(0.4 * s, 0.05 * s); ctx.lineTo(0.12 * s, -0.08 * s); ctx.lineTo(0.2 * s, 0.55 * s); ctx.closePath(); ctx.fill(); };
  switch (type) {
    case 'warrior': ctx.save(); ctx.lineWidth *= 1.5; L(-0.4, 0.5, 0.15, -0.15); ctx.restore(); ctx.beginPath(); ctx.ellipse(0.25 * s, -0.27 * s, 0.26 * s, 0.2 * s, -0.8, 0, 6.283); ctx.fill(); break;
    case 'archer': ctx.beginPath(); ctx.arc(-0.1 * s, 0, 0.5 * s, -1.2, 1.2); ctx.stroke(); L(-0.45, 0, 0.5, 0); L(0.5, 0, 0.32, -0.14); L(0.5, 0, 0.32, 0.14); break;
    case 'spearman': L(0, 0.6, 0, -0.45); ctx.beginPath(); ctx.moveTo(0, -0.65 * s); ctx.lineTo(-0.13 * s, -0.4 * s); ctx.lineTo(0.13 * s, -0.4 * s); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.arc(-0.2 * s, 0.15 * s, 0.22 * s, 0, 6.283); ctx.fill(); break;
    case 'pikeman': L(-0.45, 0.55, 0.4, -0.5); L(0.45, 0.55, -0.4, -0.5); ctx.beginPath(); ctx.arc(0, 0.12 * s, 0.17 * s, 0, 6.283); ctx.fill(); break;
    case 'horseman': horse(); break;
    case 'knight': horse(); L(-0.6, 0.2, 0.35, -0.65); break;
    case 'swordsman': ctx.beginPath(); ctx.moveTo(-0.09 * s, 0.2 * s); ctx.lineTo(-0.09 * s, -0.5 * s); ctx.lineTo(0, -0.68 * s); ctx.lineTo(0.09 * s, -0.5 * s); ctx.lineTo(0.09 * s, 0.2 * s); ctx.closePath(); ctx.fill(); L(-0.32, 0.25, 0.32, 0.25); L(0, 0.25, 0, 0.5); ctx.beginPath(); ctx.arc(0, 0.58 * s, 0.08 * s, 0, 6.283); ctx.fill(); break;
    case 'catapult': ctx.beginPath(); ctx.arc(-0.25 * s, 0.35 * s, 0.17 * s, 0, 6.283); ctx.stroke(); ctx.beginPath(); ctx.arc(0.3 * s, 0.35 * s, 0.17 * s, 0, 6.283); ctx.stroke(); L(-0.4, 0.15, 0.45, 0.15); L(-0.1, 0.15, 0.4, -0.5); ctx.beginPath(); ctx.arc(0.42 * s, -0.55 * s, 0.11 * s, 0, 6.283); ctx.fill(); break;
    case 'crossbow': L(-0.55, 0.1, 0.5, 0.1); ctx.beginPath(); ctx.arc(0.2 * s, 0.1 * s, 0.45 * s, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); L(-0.55, 0.1, -0.55, 0.35); break;
    case 'musketeer': L(-0.5, 0.45, 0.5, -0.45); L(-0.5, 0.45, -0.3, 0.6); ctx.beginPath(); ctx.arc(-0.05 * s, -0.1 * s, 0.1 * s, 0, 6.283); ctx.fill(); break;
    case 'cannon': ctx.save(); ctx.lineWidth = s * 0.26; L(-0.45, 0.05, 0.45, -0.25); ctx.restore(); ctx.beginPath(); ctx.arc(-0.1 * s, 0.3 * s, 0.22 * s, 0, 6.283); ctx.stroke(); break;
    case 'settler': ctx.beginPath(); ctx.moveTo(-0.5 * s, 0.2 * s); ctx.quadraticCurveTo(0, -0.65 * s, 0.5 * s, 0.2 * s); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.arc(-0.28 * s, 0.38 * s, 0.13 * s, 0, 6.283); ctx.stroke(); ctx.beginPath(); ctx.arc(0.28 * s, 0.38 * s, 0.13 * s, 0, 6.283); ctx.stroke(); break;
  }
}
// token silhouette by class so roles read at a glance (no text needed)
function tokenPath(ctx, cls, x, y, r) {
  ctx.beginPath();
  if (cls === 'ranged') { for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; ctx.lineTo(x + Math.cos(a) * r * 1.05, y + Math.sin(a) * r * 1.05); } ctx.closePath(); }
  else if (cls === 'anti') { const q = r * 0.92, k = r * 0.3; ctx.moveTo(x - q + k, y - q); ctx.lineTo(x + q - k, y - q); ctx.quadraticCurveTo(x + q, y - q, x + q, y - q + k); ctx.lineTo(x + q, y + q - k); ctx.quadraticCurveTo(x + q, y + q, x + q - k, y + q); ctx.lineTo(x - q + k, y + q); ctx.quadraticCurveTo(x - q, y + q, x - q, y + q - k); ctx.lineTo(x - q, y - q + k); ctx.quadraticCurveTo(x - q, y - q, x - q + k, y - q); ctx.closePath(); }
  else if (cls === 'mounted') { ctx.moveTo(x, y - r * 1.15); ctx.lineTo(x + r * 1.1, y - r * 0.1); ctx.lineTo(x + r * 0.55, y + r * 0.95); ctx.lineTo(x - r * 0.55, y + r * 0.95); ctx.lineTo(x - r * 1.1, y - r * 0.1); ctx.closePath(); }
  else if (cls === 'siege') { ctx.ellipse(x, y, r * 1.2, r * 0.85, 0, 0, 6.283); }
  else ctx.arc(x, y, r, 0, 6.283);
}
function drawUnit(ctx, g, u, x, y, opts) {
  const s = R.s, civ = g.civs[u.owner], rad = s * 0.42;
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(x, y + rad * 0.9, rad * 0.9, rad * 0.3, 0, 0, 6.283); ctx.fill();
  const gr = ctx.createRadialGradient(x - rad * 0.3, y - rad * 0.4, 1, x, y, rad); gr.addColorStop(0, mix(civ.color, '#ffffff', 0.35)); gr.addColorStop(1, mix(civ.color, '#000000', 0.25));
  ctx.fillStyle = gr; tokenPath(ctx, D.UNITS[u.type].cls, x, y, rad); ctx.fill();
  ctx.strokeStyle = opts.sel ? '#fff4c2' : 'rgba(20,14,8,0.8)'; ctx.lineWidth = opts.sel ? 3 : 1.5; ctx.stroke();
  if (D.UNITS[u.type].civilian) { ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(x, y, rad + 3, 0, 6.283); ctx.stroke(); ctx.restore(); }
  if (opts.ready) { ctx.strokeStyle = `rgba(255,236,170,${0.35 + 0.35 * Math.sin(R.t / 200)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, rad + 4, 0, 6.283); ctx.stroke(); }
  ctx.save(); ctx.translate(x, y); glyph(ctx, u.type, rad * 0.75); ctx.restore();
  if (u.fort >= 1 && !D.UNITS[u.type].civilian) { ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, rad + 2, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke(); }
  if (u.hp < 100) { const bw = rad * 1.6; ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - bw / 2, y + rad + 2, bw, 4); ctx.fillStyle = u.hp > 60 ? '#7ddc6a' : u.hp > 30 ? '#f0c24a' : '#ee5544'; ctx.fillRect(x - bw / 2, y + rad + 2, bw * u.hp / 100, 4); }
}
function drawCity(ctx, g, c, x, y, human) {
  const s = R.s, civ = g.civs[c.owner]; const rr = hrand(c.id * 31 + 5);
  // houses
  const n = Math.min(7, 2 + c.pop);
  const spots = [[-0.35, 0.1], [0.3, 0.15], [0, -0.15], [-0.1, 0.35], [0.4, -0.2], [-0.45, -0.25], [0.15, 0.42]];
  for (let k = 0; k < n; k++) { const [dx, dy] = spots[k]; const hx = x + dx * s, hy = y + dy * s, hw = s * 0.17;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(hx - hw + 2, hy - hw * 0.4 + 2, hw * 2, hw * 1.2);
    ctx.fillStyle = ['#efe2c4', '#e6d3ad', '#f4ead6'][k % 3]; ctx.fillRect(hx - hw, hy - hw * 0.4, hw * 2, hw * 1.2);
    ctx.fillStyle = mix(civ.color, '#5a2a1a', 0.45); ctx.beginPath(); ctx.moveTo(hx - hw * 1.15, hy - hw * 0.4); ctx.lineTo(hx, hy - hw * 1.3); ctx.lineTo(hx + hw * 1.15, hy - hw * 0.4); ctx.closePath(); ctx.fill(); }
  if (c.buildings.includes('walls')) { ctx.strokeStyle = '#d8d0c0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y + s * 0.05, s * 0.72, 0, 6.283); ctx.stroke(); }
  if (c.wonders.length) { ctx.fillStyle = '#f3d27a'; ctx.beginPath(); ctx.moveTo(x - s * 0.15, y - s * 0.1); ctx.lineTo(x, y - s * 0.6); ctx.lineTo(x + s * 0.15, y - s * 0.1); ctx.closePath(); ctx.fill(); }
  // banner
  const label = c.name; ctx.font = `bold ${Math.round(s * 0.36)}px Georgia, serif`; const tw = ctx.measureText(label).width;
  const bw = tw + s * 0.9, bh = s * 0.5, bx = x - bw / 2, by = y - s * 1.12;
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; roundRect(ctx, bx + 2, by + 2, bw, bh, bh / 2); ctx.fill();
  ctx.fillStyle = mix(civ.color, '#101010', 0.35); roundRect(ctx, bx, by, bw, bh, bh / 2); ctx.fill(); ctx.strokeStyle = mix(civ.color, '#ffffff', 0.4); ctx.lineWidth = 1.2; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(bx + bh / 2, by + bh / 2, bh * 0.38, 0, 6.283); ctx.fill();
  ctx.fillStyle = '#222'; ctx.font = `bold ${Math.round(s * 0.3)}px Georgia, serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(c.pop), bx + bh / 2, by + bh / 2 + 1);
  ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(s * 0.34)}px Georgia, serif`; ctx.fillText((c.capital === c.owner ? '★ ' : '') + label, x + bh * 0.35, by + bh / 2 + 1);
  if (c.hp < P.cityMaxHp(g, c)) { const w2 = bw * 0.8; ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - w2 / 2, by + bh + 2, w2, 4); ctx.fillStyle = '#ee7755'; ctx.fillRect(x - w2 / 2, by + bh + 2, w2 * c.hp / P.cityMaxHp(g, c), 4); }
  if (human && c.owner === human.id && !c.queue) { ctx.fillStyle = `rgba(255,220,120,${0.6 + 0.4 * Math.sin(R.t / 220)})`; ctx.font = `bold ${Math.round(s * 0.4)}px Georgia`; ctx.fillText('⚒?', x + bw / 2 + s * 0.25, by + bh / 2); }
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function drawCamp(ctx, x, y, s) {
  ctx.fillStyle = '#5b3a25'; ctx.beginPath(); ctx.moveTo(x - s * 0.4, y + s * 0.25); ctx.lineTo(x - s * 0.1, y - s * 0.35); ctx.lineTo(x + s * 0.2, y + s * 0.25); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#8a5a3a'; ctx.beginPath(); ctx.moveTo(x - s * 0.1, y - s * 0.35); ctx.lineTo(x + s * 0.2, y + s * 0.25); ctx.lineTo(x + s * 0.02, y + s * 0.25); ctx.closePath(); ctx.fill();
  const fl = 0.8 + 0.2 * Math.sin(R.t / 90); ctx.fillStyle = `rgba(255,140,40,${0.9 * fl})`; ctx.beginPath(); ctx.ellipse(x + s * 0.38, y + s * 0.15, s * 0.09, s * 0.17 * fl, 0, 0, 6.283); ctx.fill();
  ctx.fillStyle = 'rgba(255,230,120,0.9)'; ctx.beginPath(); ctx.ellipse(x + s * 0.38, y + s * 0.2, s * 0.04, s * 0.08 * fl, 0, 0, 6.283); ctx.fill();
}
function draw(ctx, g, ui) {
  R.t = performance.now();
  const w = ctx.canvas.width, h = ctx.canvas.height, s = R.s;
  if (!R.layer || R.layer.width !== w || R.layer.height !== h || R.layerFor !== g) { R.layer = buildTerrain(g, w, h); R.layerFor = g; }
  ctx.drawImage(R.layer, 0, 0);
  const hid = g.humanId >= 0 ? g.humanId : 0, human = g.civs[hid];
  const reveal = ui.reveal;
  const vis = (i) => reveal || g.vis[i]; const seen = (i) => reveal || g.seen[i];
  // shimmer on water
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1;
  for (let i = 0; i < P.N; i += 3) if (D.TER[g.ter[i]].water && seen(i)) { const [x, y] = center(i); const ph = (R.t / 1400 + g.decor[i]) % 1; ctx.globalAlpha = Math.sin(ph * Math.PI); ctx.beginPath(); ctx.arc(x - s * 0.2 + ph * s * 0.4, y + s * 0.3, s * 0.12, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); } ctx.globalAlpha = 1;
  // territory fill + borders
  for (let i = 0; i < P.N; i++) { const o = g.owner[i]; if (o < 0 || !seen(i)) continue; const [x, y] = center(i); hexPath(ctx, x, y, s); ctx.fillStyle = g.civs[o].color + '22'; ctx.fill(); }
  for (let i = 0; i < P.N; i++) { const o = g.owner[i]; if (o < 0 || !seen(i)) continue; for (const n of P.NB[i]) if (g.owner[n] !== o) { const [a, b] = sharedEdge(i, n); const [x, y] = center(i); const k = 0.1; const ax = a[0] + (x - a[0]) * k, ay = a[1] + (y - a[1]) * k, bx = b[0] + (x - b[0]) * k, by = b[1] + (y - b[1]) * k;
    ctx.strokeStyle = g.civs[o].color; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.stroke(); } }
  // selected city worked tiles
  if (ui.selCity) { for (const t of ui.selCity.worked) { const [x, y] = center(t); ctx.fillStyle = 'rgba(255,240,190,0.85)'; ctx.beginPath(); ctx.arc(x, y - s * 0.5, 3, 0, 6.283); ctx.fill(); const yy = P.tileYield(g, t, g.civs[ui.selCity.owner]); yieldPips(ctx, x, y - s * 0.05, yy); } }
  // camps
  for (let i = 0; i < P.N; i++) if (g.camp[i] && seen(i)) { const [x, y] = center(i); drawCamp(ctx, x, y, s); }
  // ancient ruins: a broken arch with a slow glint
  if (g.ruin) for (let i = 0; i < P.N; i++) if (g.ruin[i] && seen(i)) { const [x, y] = center(i); drawRuin(ctx, x, y, s, R.t + g.decor[i] * 3000); }
  // highlights
  if (ui.sites) for (const t of ui.sites) { const [x, y] = center(t); const p = 0.6 + 0.4 * Math.sin(R.t / 260); ctx.strokeStyle = `rgba(255,215,110,${p})`; ctx.lineWidth = 3; ctx.setLineDash([6, 5]); hexPath(ctx, x, y, s * 0.8); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = `rgba(255,215,110,${p})`; ctx.font = `bold ${Math.round(s * 0.5)}px Georgia`; ctx.textAlign = 'center'; ctx.fillText('★', x, y + s * 0.18); }
  if (ui.reach) for (const [t] of ui.reach) { const [x, y] = center(t); hexPath(ctx, x, y, s * 0.92); ctx.fillStyle = 'rgba(255,250,225,0.16)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,250,225,0.35)'; ctx.lineWidth = 1; ctx.stroke(); }
  if (ui.targets) for (const t of ui.targets) { const [x, y] = center(t); hexPath(ctx, x, y, s * 0.9); ctx.strokeStyle = `rgba(255,80,60,${0.6 + 0.3 * Math.sin(R.t / 150)})`; ctx.lineWidth = 3; ctx.stroke(); }
  if (ui.hover >= 0) { const [x, y] = center(ui.hover); hexPath(ctx, x, y, s * 0.96); ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5; ctx.stroke(); }
  if (ui.path) { ctx.strokeStyle = 'rgba(255,245,200,0.75)'; ctx.setLineDash([4, 5]); ctx.lineWidth = 2; ctx.beginPath(); const [sx, sy] = center(ui.sel.tile); ctx.moveTo(sx, sy); for (const t of ui.path) { const [x, y] = center(t); ctx.lineTo(x, y); } ctx.stroke(); ctx.setLineDash([]); }
  // cities
  for (const c of g.cities) if (seen(c.tile)) { const [x, y] = center(c.tile); drawCity(ctx, g, c, x, y, g.allAI ? null : human); }
  // units
  for (const u of g.units) { if (!vis(u.tile)) continue; let [x, y] = center(u.tile); const an = ui.anim && ui.anim.get(u.id); if (an) { const k = Math.min(1, (R.t - an.t0) / 220); const [fx, fy] = center(an.from); x = fx + (x - fx) * k; y = fy + (y - fy) * k; if (k >= 1) ui.anim.delete(u.id); }
    const ready = !g.allAI && u.owner === hid && u.mp > 0 && !u.fort && !u.sleep && !u.auto && !u.acted;
    drawUnit(ctx, g, u, x, y - (P.cityAt(g, u.tile) ? -s * 0.28 : 0), { sel: ui.sel === u, ready }); }
  // fog
  for (let i = 0; i < P.N; i++) { if (vis(i)) continue; const [x, y] = center(i); hexPath(ctx, x, y, s + 0.8);
    if (!seen(i)) { const rr = hrand(g.decor[i] + 3); ctx.fillStyle = mix('#17181d', '#22232a', rr()); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.025)'; ctx.lineWidth = 1; ctx.stroke(); }
    else { ctx.fillStyle = 'rgba(12,14,22,0.42)'; ctx.fill(); } }
  // soft fog edge
  // fx
  R.fx = R.fx.filter((f) => R.t - f.t0 < f.dur);
  for (const f of R.fx) { const k = (R.t - f.t0) / f.dur; if (k < 0 || k > 1) continue;
    if (f.kind === 'text') { ctx.globalAlpha = 1 - k; ctx.font = `bold ${Math.round(s * 0.45)}px Georgia`; ctx.textAlign = 'center'; ctx.fillStyle = '#000'; ctx.fillText(f.text, f.x + 1, f.y - k * s + 1); ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y - k * s); ctx.textAlign = 'left'; ctx.globalAlpha = 1; }
    if (f.kind === 'shot') { const p = Math.min(1, k * 1.6); const x = f.x0 + (f.x1 - f.x0) * p, y = f.y0 + (f.y1 - f.y0) * p - Math.sin(p * Math.PI) * s * (f.arc ? 0.8 : 0); ctx.fillStyle = '#ffe9a8'; ctx.beginPath(); ctx.arc(x, y, 3, 0, 6.283); ctx.fill(); }
    if (f.kind === 'clash') { ctx.strokeStyle = `rgba(255,230,160,${1 - k})`; ctx.lineWidth = 2; for (let a = 0; a < 6; a++) { const an = a * 1.047 + f.x; ctx.beginPath(); ctx.moveTo(f.x + Math.cos(an) * s * 0.2 * (1 + k), f.y + Math.sin(an) * s * 0.2 * (1 + k)); ctx.lineTo(f.x + Math.cos(an) * s * 0.5 * (1 + k), f.y + Math.sin(an) * s * 0.5 * (1 + k)); ctx.stroke(); } }
    if (f.kind === 'swell') { const a = Math.sin(k * Math.PI); hexPath(ctx, f.x, f.y, s * (0.6 + 0.4 * k)); ctx.fillStyle = f.color; ctx.globalAlpha = 0.45 * a; ctx.fill(); ctx.globalAlpha = 1; }
    if (f.kind === 'flash') { for (let r = 0; r < 3; r++) { const kk = k - r * 0.15; if (kk < 0) continue; ctx.strokeStyle = r === 1 ? '#ffe08a' : f.color; ctx.globalAlpha = Math.max(0, 1 - kk); ctx.lineWidth = 5 - r; ctx.beginPath(); ctx.arc(f.x, f.y, s * (0.4 + kk * 2.2), 0, 6.283); ctx.stroke(); } ctx.globalAlpha = 1; }
    if (f.kind === 'rays') { ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(k * 0.8); ctx.globalAlpha = Math.sin(k * Math.PI) * 0.7; ctx.fillStyle = '#ffe9a8'; for (let a = 0; a < 12; a++) { ctx.rotate(Math.PI / 6); ctx.beginPath(); ctx.moveTo(0, -s * 0.3); ctx.lineTo(s * 0.08, -s * (0.9 + k)); ctx.lineTo(-s * 0.08, -s * (0.9 + k)); ctx.fill(); } ctx.restore(); ctx.globalAlpha = 1; }
    if (f.kind === 'ring') { ctx.strokeStyle = f.color; ctx.globalAlpha = 1 - k; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(f.x, f.y, s * (0.3 + k * 1.2), 0, 6.283); ctx.stroke(); ctx.globalAlpha = 1; }
  }
}
function drawRuin(ctx, x, y, s, t) {
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(x, y + s * 0.32, s * 0.42, s * 0.12, 0, 0, 6.283); ctx.fill();
  ctx.fillStyle = '#cfc4a8'; ctx.strokeStyle = '#6d6450'; ctx.lineWidth = 1.2;
  const col = (cx, h) => { ctx.beginPath(); ctx.rect(cx - s * 0.07, y + s * 0.3 - h, s * 0.14, h); ctx.fill(); ctx.stroke(); };
  col(x - s * 0.26, s * 0.55); col(x + s * 0.26, s * 0.38);
  ctx.beginPath(); ctx.arc(x, y - s * 0.25, s * 0.26, Math.PI, Math.PI * 1.55); ctx.lineWidth = s * 0.1; ctx.strokeStyle = '#cfc4a8'; ctx.stroke(); ctx.lineWidth = 1;
  ctx.fillStyle = '#b3a888'; ctx.fillRect(x + s * 0.05, y + s * 0.2, s * 0.16, s * 0.1);
  const k = (t / 1800) % 1; if (k < 0.35) { const a = Math.sin(k / 0.35 * Math.PI); ctx.fillStyle = `rgba(255,240,170,${a})`; const gx = x - s * 0.26, gy = y - s * 0.3; ctx.beginPath(); ctx.moveTo(gx, gy - s * 0.16 * a); ctx.lineTo(gx + s * 0.04, gy); ctx.lineTo(gx, gy + s * 0.16 * a); ctx.lineTo(gx - s * 0.04, gy); ctx.fill(); ctx.beginPath(); ctx.moveTo(gx - s * 0.16 * a, gy); ctx.lineTo(gx, gy + s * 0.04); ctx.lineTo(gx + s * 0.16 * a, gy); ctx.lineTo(gx, gy - s * 0.04); ctx.fill(); }
}
function yieldPips(ctx, x, y, yy) {
  const items = []; for (let k = 0; k < yy.f; k++) items.push('#8fd86a'); for (let k = 0; k < yy.p; k++) items.push('#e0a35a'); for (let k = 0; k < yy.s; k++) items.push('#6ab8f0'); for (let k = 0; k < yy.c; k++) items.push('#d48af0');
  const w = items.length * 7; items.forEach((c, k) => { ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.arc(x - w / 2 + k * 7 + 3.5, y, 3.6, 0, 6.283); ctx.fill(); ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x - w / 2 + k * 7 + 3.5, y, 2.6, 0, 6.283); ctx.fill(); });
}
function pushText(f) { const near = R.fx.filter((o) => o.kind === 'text' && Math.abs(o.x - f.x) < R.s * 0.6 && Math.abs(o.y0 - f.y) < R.s * 1.6 && Math.abs(o.t0 - f.t0) < 700).length; f.y0 = f.y; f.y -= near * R.s * 0.42; f.t0 += near * 120; R.fx.push(f); }
function consume(g, evs, viewer) {
  const s = R.s; const t0 = performance.now();
  for (const e of evs) {
    if (e.kind === 'combat') { const [x0, y0] = center(e.from), [x1, y1] = center(e.to); if (!(viewer(e.from) || viewer(e.to))) continue;
      if (e.ranged) R.fx.push({ kind: 'shot', x0, y0, x1, y1, t0, dur: 600, arc: true }); else R.fx.push({ kind: 'clash', x: (x0 + x1) / 2, y: (y0 + y1) / 2, t0, dur: 450 });
      pushText({ kind: 'text', text: '-' + e.toD, x: x1, y: y1 - s * 0.3, color: '#ff8a70', t0: t0 + (e.ranged ? 350 : 100), dur: 1300 });
      if (e.toA) pushText({ kind: 'text', text: '-' + e.toA, x: x0, y: y0 - s * 0.3, color: '#ffb070', t0: t0 + 150, dur: 1300 }); }
    if (e.kind === 'death' && viewer(e.tile)) { const [x, y] = center(e.tile); R.fx.push({ kind: 'ring', x, y, color: '#ff6650', t0: t0 + 250, dur: 700 }); }
    if (e.kind === 'grow' && viewer(e.tile)) { const [x, y] = center(e.tile); pushText({ kind: 'text', text: '+1 ☺', x, y: y - s * 1.3, color: '#a6f08a', t0, dur: 1600 }); }
    if (e.kind === 'border' && viewer(g.cities.find((c) => c.id === e.city) ? g.cities.find((c) => c.id === e.city).tile : e.tiles[0])) e.tiles.forEach((t, k) => { const [x, y] = center(t); R.fx.push({ kind: 'swell', x, y, color: g.civs[e.civ].color, t0: t0 + k * 70, dur: 900 }); });
    if (e.kind === 'conquer' && viewer(e.tile)) { const [x, y] = center(e.tile); R.fx.push({ kind: 'flash', x, y, color: g.civs[e.by] ? g.civs[e.by].color : '#fff', t0, dur: 1400 }); pushText({ kind: 'text', text: 'CAPTURED', x, y: y - s * 1.1, color: '#ffe08a', t0: t0 + 200, dur: 1800 }); }
    if (e.kind === 'wonder' && viewer(e.tile)) { const [x, y] = center(e.tile); R.fx.push({ kind: 'rays', x, y, t0, dur: 2200 }); }
    if (e.kind === 'ruin' && viewer(e.tile)) { const [x, y] = center(e.tile); if (e.civ === g.humanId) { R.fx.push({ kind: 'rays', x, y, t0, dur: 1400 }); pushText({ kind: 'text', text: 'Ruins!', x, y: y - s * 1.0, color: '#ffe9a8', t0, dur: 1600 }); } else R.fx.push({ kind: 'ring', x, y, color: '#cfc4a8', t0, dur: 900 }); }
    if ((e.kind === 'found' || e.kind === 'wonder' || e.kind === 'conquer') && e.tile !== undefined && viewer(e.tile)) { const [x, y] = center(e.tile); R.fx.push({ kind: 'ring', x, y, color: '#ffe08a', t0, dur: 1200 }); }
  }
}
R.layout = layout; R.draw = draw; R.pickTile = pickTile; R.center = center; R.consume = consume; R.glyph = glyph; R.drawUnit = drawUnit; R.mix = mix;
root.PE_R = R;
})(typeof globalThis !== 'undefined' ? globalThis : this);
