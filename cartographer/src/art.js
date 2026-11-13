// CARTOGRAPHER art: procedural old-atlas parchment, inked terrain glyphs, landmarks, compass rose, sea monsters.
(function (root) {
  'use strict';
  const INK = '#3a2716', INK2 = 'rgba(58,39,22,0.55)';
  const WASH = ['rgba(92,140,160,0.55)', 'rgba(222,190,120,0.55)', 'rgba(160,180,95,0.5)', 'rgba(88,130,70,0.55)', 'rgba(150,115,80,0.5)'];
  const WASH_SOLVED = ['rgba(70,135,170,0.8)', 'rgba(236,200,120,0.8)', 'rgba(150,190,85,0.78)', 'rgba(70,135,65,0.8)', 'rgba(150,110,75,0.75)'];
  const SERIF = '"Palatino Linotype","Book Antiqua",Palatino,"Iowan Old Style",Georgia,serif';
  function hrand(a, b, c) { let h = (a * 374761393 + b * 668265263 + (c || 0) * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; h ^= h >>> 16; return ((h >>> 0) % 10000) / 10000; }

  // --- parchment ---
  const cache = {};
  function parchment(w, h, seed) {
    const key = w + 'x' + h + ':' + seed; if (cache[key]) return cache[key];
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    const grd = g.createRadialGradient(w * 0.5, h * 0.45, Math.min(w, h) * 0.1, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
    grd.addColorStop(0, '#f3e6c4'); grd.addColorStop(0.6, '#e6d1a1'); grd.addColorStop(1, '#b8945a');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    // mottling
    for (let i = 0; i < 70; i++) {
      const x = hrand(i, seed, 1) * w, y = hrand(i, seed, 2) * h, r = 20 + hrand(i, seed, 3) * Math.min(w, h) * 0.22;
      const rg = g.createRadialGradient(x, y, 0, x, y, r); const dark = hrand(i, seed, 4) < 0.55;
      rg.addColorStop(0, dark ? 'rgba(150,110,60,0.10)' : 'rgba(255,248,225,0.16)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // a coffee ring or two
    for (let k = 0; k < 2; k++) {
      const x = hrand(k, seed, 9) * w, y = hrand(k, seed, 10) * h, r = 40 + hrand(k, seed, 11) * 50;
      g.strokeStyle = 'rgba(120,80,40,0.10)'; g.lineWidth = 3 + k * 2; g.beginPath(); g.arc(x, y, r, 0.3, Math.PI * 1.8); g.stroke();
    }
    // fibres & speckle
    const img = g.getImageData(0, 0, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (hrand(i, seed, 7) - 0.5) * 18; d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.8; }
    g.putImageData(img, 0, 0);
    g.strokeStyle = 'rgba(110,80,40,0.07)'; g.lineWidth = 1;
    for (let i = 0; i < 260; i++) { const x = hrand(i, seed, 20) * w, y = hrand(i, seed, 21) * h, a = hrand(i, seed, 22) * 6.28, l = 4 + hrand(i, seed, 23) * 14; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
    // edge burn
    const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(90,55,20,0.45)'); g.fillStyle = vg; g.fillRect(0, 0, w, h);
    cache[key] = c; return c;
  }
  // torn/deckled sheet outline path
  function deckle(g, x, y, w, h, seed, amp) {
    amp = amp || 5; g.beginPath();
    const step = 9; let i = 0;
    for (let t = 0; t <= w; t += step) g.lineTo(x + t, y + (hrand(i++, seed, 1) - 0.5) * amp);
    for (let t = 0; t <= h; t += step) g.lineTo(x + w + (hrand(i++, seed, 1) - 0.5) * amp, y + t);
    for (let t = w; t >= 0; t -= step) g.lineTo(x + t, y + h + (hrand(i++, seed, 1) - 0.5) * amp);
    for (let t = h; t >= 0; t -= step) g.lineTo(x + (hrand(i++, seed, 1) - 0.5) * amp, y + t);
    g.closePath();
  }

  // --- terrain glyphs ---
  function wob(g, pts, close) { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); if (close) g.closePath(); }
  function tree(g, x, y, s, conifer) {
    g.lineWidth = Math.max(1, s * 0.07); g.strokeStyle = INK;
    g.beginPath(); g.moveTo(x, y + s * 0.45); g.lineTo(x, y + s * 0.1); g.stroke();
    if (conifer) { g.fillStyle = 'rgba(60,100,55,0.85)'; wob(g, [[x, y - s * 0.45], [x + s * 0.28, y + s * 0.15], [x - s * 0.28, y + s * 0.15]], true); g.fill(); g.stroke(); }
    else { g.fillStyle = 'rgba(80,125,60,0.85)'; g.beginPath(); g.arc(x, y - s * 0.08, s * 0.27, 0, 6.29); g.fill(); g.stroke();
      g.strokeStyle = 'rgba(40,60,30,0.5)'; g.beginPath(); g.arc(x - s * 0.06, y - s * 0.12, s * 0.12, 3.6, 5.2); g.stroke(); }
  }
  function mountain(g, x, y, s) {
    g.lineWidth = Math.max(1.2, s * 0.06); g.strokeStyle = INK; g.fillStyle = 'rgba(205,180,140,0.9)';
    wob(g, [[x - s * 0.42, y + s * 0.3], [x - s * 0.05, y - s * 0.38], [x + s * 0.12, y - s * 0.12], [x + s * 0.22, y - s * 0.24], [x + s * 0.44, y + s * 0.3]], false); g.fill(); g.stroke();
    // hatching on the shadow side
    g.lineWidth = Math.max(0.8, s * 0.03); g.strokeStyle = INK2;
    for (let k = 0; k < 5; k++) { const t = k / 5; g.beginPath(); g.moveTo(x - s * 0.05 + t * s * 0.12, y - s * 0.3 + t * s * 0.5); g.lineTo(x + s * 0.12 + t * s * 0.2, y + s * 0.28); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,0.75)'; wob(g, [[x - s * 0.05, y - s * 0.38], [x - s * 0.15, y - s * 0.2], [x - s * 0.03, y - s * 0.24], [x + s * 0.06, y - s * 0.2]], true); g.fill();
  }
  function tile(g, v, x, y, s, seed, solved) {
    g.save();
    // watercolour wash, slightly bleeding past the cell
    g.fillStyle = (solved ? WASH_SOLVED : WASH)[v];
    g.beginPath(); const j = s * 0.04;
    g.moveTo(x - j * hrand(seed, 1), y - j * hrand(seed, 2)); g.lineTo(x + s + j * hrand(seed, 3), y - j * hrand(seed, 4));
    g.lineTo(x + s + j * hrand(seed, 5), y + s + j * hrand(seed, 6)); g.lineTo(x - j * hrand(seed, 7), y + s + j * hrand(seed, 8)); g.closePath(); g.fill();
    const cx = x + s / 2, cy = y + s / 2;
    g.strokeStyle = INK; g.lineCap = 'round';
    if (v === 0) { // waves
      g.lineWidth = Math.max(1, s * 0.035); g.strokeStyle = 'rgba(40,70,90,0.6)';
      for (let k = 0; k < 3; k++) { const wx = x + s * (0.2 + hrand(seed, 10 + k) * 0.5), wy = y + s * (0.22 + k * 0.27);
        g.beginPath(); g.arc(wx, wy + s * 0.06, s * 0.08, 3.5, 5.9); g.arc(wx + s * 0.15, wy + s * 0.06, s * 0.08, 3.5, 5.9); g.stroke(); }
    } else if (v === 1) { // sand stipple
      g.fillStyle = 'rgba(120,85,40,0.55)';
      for (let k = 0; k < 16; k++) { g.beginPath(); g.arc(x + s * (0.12 + hrand(seed, k, 1) * 0.76), y + s * (0.12 + hrand(seed, k, 2) * 0.76), Math.max(0.8, s * 0.018), 0, 6.29); g.fill(); }
    } else if (v === 2) { // grass tufts
      g.lineWidth = Math.max(1, s * 0.03); g.strokeStyle = 'rgba(60,80,30,0.75)';
      for (let k = 0; k < 5; k++) { const tx = x + s * (0.18 + hrand(seed, k, 3) * 0.64), ty = y + s * (0.25 + hrand(seed, k, 4) * 0.55), h = s * 0.1;
        g.beginPath(); g.moveTo(tx - h * 0.5, ty - h); g.lineTo(tx, ty); g.lineTo(tx + h * 0.1, ty - h * 1.2); g.moveTo(tx, ty); g.lineTo(tx + h * 0.6, ty - h * 0.9); g.stroke(); }
    } else if (v === 3) { // forest
      const pts = [[0.3, 0.38], [0.68, 0.33], [0.48, 0.68], [0.22, 0.75], [0.78, 0.72]];
      for (let k = 0; k < pts.length; k++) tree(g, x + s * pts[k][0], y + s * pts[k][1], s * 0.36, hrand(seed, k, 9) < 0.45);
    } else if (v === 4) { mountain(g, cx - s * 0.08, cy + s * 0.05, s * 0.7); mountain(g, cx + s * 0.22, cy + s * 0.18, s * 0.42); }
    g.restore();
  }
  // coast: ink edge on land/sea borders with parallel ripple lines in the sea
  function coast(g, x, y, s, side) {
    g.save(); g.strokeStyle = INK; g.lineWidth = Math.max(1.5, s * 0.05); g.lineCap = 'round';
    const L = [[x, y, x + s, y], [x + s, y, x + s, y + s], [x, y + s, x + s, y + s], [x, y, x, y + s]][side];
    g.beginPath(); g.moveTo(L[0], L[1]); g.lineTo(L[2], L[3]); g.stroke();
    g.strokeStyle = 'rgba(40,70,90,0.35)'; g.lineWidth = Math.max(0.8, s * 0.02);
    const off = [[0, -1], [1, 0], [0, 1], [-1, 0]][side];
    for (let k = 1; k <= 2; k++) { const o = k * s * 0.09; g.beginPath(); g.moveTo(L[0] + off[0] * o, L[1] + off[1] * o); g.lineTo(L[2] + off[0] * o, L[3] + off[1] * o); g.stroke(); }
    g.restore();
  }

  // --- landmarks ---
  function landmark(g, L, x, y, s, t) {
    t = t || 0; g.save(); g.translate(x, y); g.lineJoin = 'round'; g.lineCap = 'round';
    g.strokeStyle = INK; g.lineWidth = Math.max(1.4, s * 0.05);
    // soft halo so it reads on any terrain
    g.fillStyle = 'rgba(250,240,215,0.75)'; g.beginPath(); g.ellipse(0, s * 0.05, s * 0.42, s * 0.38, 0, 0, 6.29); g.fill();
    if (L === 'village') {
      const house = (hx, hy, k, col) => { g.fillStyle = col; g.beginPath(); g.rect(hx - k * 0.5, hy - k * 0.35, k, k * 0.65); g.fill(); g.stroke();
        g.fillStyle = '#9a3b2a'; wob(g, [[hx - k * 0.65, hy - k * 0.3], [hx, hy - k * 0.85], [hx + k * 0.65, hy - k * 0.3]], true); g.fill(); g.stroke(); };
      house(-s * 0.15, s * 0.05, s * 0.28, '#e9d9b5'); house(s * 0.17, s * 0.15, s * 0.24, '#e2cfa5'); house(s * 0.02, s * 0.25, s * 0.2, '#efe2c2');
      g.strokeStyle = 'rgba(80,80,80,0.45)'; g.beginPath(); g.moveTo(-s * 0.08, -s * 0.2); g.bezierCurveTo(-s * 0.02, -s * 0.32 - Math.sin(t * 2) * 2, -s * 0.14, -s * 0.38, -s * 0.05, -s * 0.46); g.stroke();
    } else if (L === 'lighthouse') {
      g.fillStyle = 'rgba(255,220,120,' + (0.35 + 0.25 * Math.sin(t * 2.5)) + ')';
      g.beginPath(); g.moveTo(0, -s * 0.3); g.lineTo(s * 0.48, -s * 0.48); g.lineTo(s * 0.48, -s * 0.18); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(0, -s * 0.3); g.lineTo(-s * 0.48, -s * 0.48); g.lineTo(-s * 0.48, -s * 0.18); g.closePath(); g.fill();
      g.fillStyle = '#f2ead6'; wob(g, [[-s * 0.13, s * 0.38], [-s * 0.08, -s * 0.22], [s * 0.08, -s * 0.22], [s * 0.13, s * 0.38]], true); g.fill(); g.stroke();
      g.fillStyle = '#a8382a'; for (const yy of [-0.06, 0.18]) { wob(g, [[-s * 0.1 - yy * 0.05 * s, s * yy], [s * 0.1 + yy * 0.05 * s, s * yy], [s * 0.115, s * (yy + 0.1)], [-s * 0.115, s * (yy + 0.1)]], true); g.fill(); }
      g.fillStyle = '#ffd35a'; g.beginPath(); g.rect(-s * 0.08, -s * 0.36, s * 0.16, s * 0.14); g.fill(); g.stroke();
      g.fillStyle = INK; wob(g, [[-s * 0.11, -s * 0.36], [0, -s * 0.46], [s * 0.11, -s * 0.36]], true); g.fill();
    } else if (L === 'volcano') {
      g.fillStyle = '#7d5a3e'; wob(g, [[-s * 0.4, s * 0.35], [-s * 0.1, -s * 0.18], [s * 0.1, -s * 0.18], [s * 0.4, s * 0.35]], true); g.fill(); g.stroke();
      g.fillStyle = '#e0562a'; wob(g, [[-s * 0.1, -s * 0.18], [-s * 0.02, s * 0.05], [s * 0.04, -s * 0.06], [s * 0.1, -s * 0.18]], true); g.fill();
      g.fillStyle = 'rgba(90,80,75,0.5)';
      for (let k = 0; k < 3; k++) { const p = (t * 0.4 + k / 3) % 1; g.beginPath(); g.arc(Math.sin(p * 5) * s * 0.06, -s * 0.22 - p * s * 0.3, s * (0.06 + p * 0.07), 0, 6.29); g.fill(); }
    } else if (L === 'temple') {
      g.fillStyle = '#d9cfb4';
      for (let k = 0; k < 3; k++) { const w = s * (0.7 - k * 0.2), hh = s * 0.16; g.beginPath(); g.rect(-w / 2, s * 0.3 - (k + 1) * hh, w, hh); g.fill(); g.stroke(); }
      g.fillStyle = INK; g.beginPath(); g.rect(-s * 0.05, s * 0.3 - s * 0.48 + s * 0.04, s * 0.1, s * 0.12); g.fill();
      g.strokeStyle = 'rgba(70,110,50,0.8)'; g.beginPath(); g.moveTo(s * 0.3, s * 0.3); g.bezierCurveTo(s * 0.4, 0, s * 0.2, -s * 0.1, s * 0.3, -s * 0.25); g.stroke();
    } else if (L === 'treasure') {
      g.strokeStyle = '#a0281e'; g.lineWidth = Math.max(2, s * 0.1);
      g.beginPath(); g.moveTo(-s * 0.2, -s * 0.2); g.lineTo(s * 0.2, s * 0.2); g.moveTo(s * 0.2, -s * 0.2); g.lineTo(-s * 0.2, s * 0.2); g.stroke();
      g.setLineDash([s * 0.05, s * 0.07]); g.lineWidth = Math.max(1, s * 0.03); g.strokeStyle = INK;
      g.beginPath(); g.moveTo(-s * 0.42, s * 0.35); g.bezierCurveTo(-s * 0.3, s * 0.1, -s * 0.45, -s * 0.1, -s * 0.24, -s * 0.24); g.stroke(); g.setLineDash([]);
    }
    g.restore();
  }

  // --- compass rose ---
  function compass(g, x, y, r, t) {
    g.save(); g.translate(x, y); g.rotate(Math.sin((t || 0) * 0.3) * 0.015);
    g.strokeStyle = INK; g.lineWidth = 1.2;
    for (const rr of [r, r * 0.93, r * 0.55]) { g.beginPath(); g.arc(0, 0, rr, 0, 6.29); g.stroke(); }
    for (let k = 0; k < 32; k++) { const a = k / 32 * 6.283; g.beginPath(); g.moveTo(Math.cos(a) * r * 0.93, Math.sin(a) * r * 0.93); g.lineTo(Math.cos(a) * r * (k % 4 ? 0.88 : 0.82), Math.sin(a) * r * (k % 4 ? 0.88 : 0.82)); g.stroke(); }
    const pt = (a, len, wid, fillA, fillB) => {
      const ca = Math.cos(a), sa = Math.sin(a), px = -sa, py = ca;
      g.fillStyle = fillA; g.beginPath(); g.moveTo(0, 0); g.lineTo(ca * len, sa * len); g.lineTo(px * wid, py * wid); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = fillB; g.beginPath(); g.moveTo(0, 0); g.lineTo(ca * len, sa * len); g.lineTo(-px * wid, -py * wid); g.closePath(); g.fill(); g.stroke();
    };
    for (let k = 0; k < 8; k++) pt((k + 0.5) / 8 * 6.283 - 1.5708 - 0.3927 + 0.3927, r * 0.5, r * 0.07, '#efe3c3', '#8c6a43');
    for (let k = 0; k < 4; k++) pt(k / 4 * 6.283 - 1.5708 + 0.785, r * 0.62, r * 0.1, '#e6d6ae', '#5a3f26');
    for (let k = 0; k < 4; k++) pt(k / 4 * 6.283 - 1.5708, r * 0.9, r * 0.13, k === 0 ? '#b8392a' : '#f2e8cc', k === 0 ? '#7a2016' : '#3a2716');
    g.fillStyle = '#b8392a'; g.beginPath(); g.arc(0, 0, r * 0.06, 0, 6.29); g.fill(); g.stroke();
    g.fillStyle = INK; g.font = 'bold ' + Math.round(r * 0.28) + 'px ' + SERIF; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('N', 0, -r * 1.12);
    g.font = Math.round(r * 0.18) + 'px ' + SERIF; g.fillText('S', 0, r * 1.1); g.fillText('E', r * 1.1, 0); g.fillText('W', -r * 1.1, 0);
    g.restore();
  }

  // --- sea monsters ---
  function serpent(g, x, y, s, t, flip) {
    g.save(); g.translate(x, y); if (flip) g.scale(-1, 1);
    g.strokeStyle = INK; g.lineWidth = 1.6; g.lineJoin = 'round';
    const bob = Math.sin(t * 1.2) * s * 0.03;
    // humps
    for (let k = 0; k < 3; k++) {
      const hx = -s * 0.1 + k * s * 0.32, hw = s * 0.13 - k * s * 0.015, hh = s * (0.2 - k * 0.03) + bob * (k % 2 ? -1 : 1);
      g.fillStyle = '#6f8f6a'; g.beginPath(); g.moveTo(hx - hw, 0); g.bezierCurveTo(hx - hw, -hh * 1.3, hx + hw, -hh * 1.3, hx + hw, 0); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#b8392a'; for (let sp = -1; sp <= 1; sp++) { const sx = hx + sp * hw * 0.5, sy = -hh * 0.98 + Math.abs(sp) * hh * 0.25; wob(g, [[sx - 3, sy + 2], [sx, sy - s * 0.06], [sx + 3, sy + 2]], true); g.fill(); g.stroke(); }
      g.strokeStyle = 'rgba(58,39,22,0.5)'; g.beginPath(); g.arc(hx, -hh * 0.4, hw * 0.5, 3.6, 5.8); g.stroke(); g.strokeStyle = INK;
    }
    // head
    g.fillStyle = '#6f8f6a'; g.beginPath(); g.moveTo(-s * 0.3, 0); g.bezierCurveTo(-s * 0.32, -s * 0.35, -s * 0.48, -s * 0.42 + bob, -s * 0.6, -s * 0.32 + bob);
    g.bezierCurveTo(-s * 0.66, -s * 0.27 + bob, -s * 0.6, -s * 0.2 + bob, -s * 0.5, -s * 0.22 + bob); g.bezierCurveTo(-s * 0.42, -s * 0.2, -s * 0.38, -s * 0.1, -s * 0.38, 0); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#f5e7b8'; g.beginPath(); g.arc(-s * 0.52, -s * 0.33 + bob, s * 0.022, 0, 6.29); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(-s * 0.63, -s * 0.27 + bob); g.lineTo(-s * 0.72, -s * 0.24 + bob); g.lineTo(-s * 0.68, -s * 0.28 + bob); g.stroke();
    // tail
    g.fillStyle = '#6f8f6a'; g.beginPath(); g.moveTo(s * 0.75, 0); g.bezierCurveTo(s * 0.8, -s * 0.2, s * 0.92, -s * 0.15 - bob, s * 0.95, -s * 0.28 - bob); g.bezierCurveTo(s * 0.88, -s * 0.12, s * 0.86, -s * 0.05, s * 0.84, 0); g.closePath(); g.fill(); g.stroke();
    // water lines
    g.strokeStyle = 'rgba(40,70,90,0.5)'; g.lineWidth = 1.2;
    for (let k = 0; k < 3; k++) { g.beginPath(); for (let i = 0; i <= 24; i++) { const xx = -s * 0.8 + i * s * 0.075, yy = k * s * 0.07 + Math.sin(i * 0.9 + t * 1.5 + k) * s * 0.02; i ? g.lineTo(xx, yy) : g.moveTo(xx, yy); } g.stroke(); }
    g.restore();
  }
  function kraken(g, x, y, s, t) {
    g.save(); g.translate(x, y); g.strokeStyle = INK; g.lineWidth = 1.5;
    for (let k = 0; k < 4; k++) {
      const bx = (k - 1.5) * s * 0.22, ph = t * 0.9 + k * 1.3, sway = Math.sin(ph) * s * 0.12;
      g.fillStyle = '#9b5a6a'; g.beginPath();
      g.moveTo(bx - s * 0.06, 0); g.bezierCurveTo(bx - s * 0.06, -s * 0.3, bx + sway - s * 0.1, -s * 0.45, bx + sway + s * 0.06, -s * 0.55);
      g.bezierCurveTo(bx + sway + s * 0.16, -s * 0.5, bx + sway + s * 0.1, -s * 0.42, bx + sway + s * 0.04, -s * 0.46);
      g.bezierCurveTo(bx + sway * 0.5 + s * 0.02, -s * 0.35, bx + s * 0.05, -s * 0.2, bx + s * 0.06, 0); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#f0d6c0'; for (let q = 1; q < 4; q++) { g.beginPath(); g.arc(bx + sway * (q / 4) * 0.8 + s * 0.02, -q * s * 0.11, s * 0.014, 0, 6.29); g.fill(); }
    }
    g.strokeStyle = 'rgba(40,70,90,0.5)'; g.lineWidth = 1.2;
    for (let k = 0; k < 3; k++) { g.beginPath(); for (let i = 0; i <= 20; i++) { const xx = -s * 0.55 + i * s * 0.055, yy = k * s * 0.06 + Math.sin(i * 0.9 + t * 1.3 + k) * s * 0.018; i ? g.lineTo(xx, yy) : g.moveTo(xx, yy); } g.stroke(); }
    g.restore();
  }
  function ship(g, x, y, s, t) {
    g.save(); g.translate(x, y); g.rotate(Math.sin(t * 1.4) * 0.05); g.strokeStyle = INK; g.lineWidth = 1.4;
    g.fillStyle = '#7a5532'; wob(g, [[-s * 0.45, 0], [s * 0.45, 0], [s * 0.32, s * 0.18], [-s * 0.34, s * 0.18]], true); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -s * 0.7); g.stroke();
    g.fillStyle = '#f1e6c8'; g.beginPath(); g.moveTo(s * 0.03, -s * 0.65); g.quadraticCurveTo(s * 0.4, -s * 0.4, s * 0.03, -s * 0.08); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(-s * 0.03, -s * 0.55); g.quadraticCurveTo(-s * 0.3, -s * 0.35, -s * 0.03, -s * 0.12); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#b8392a'; wob(g, [[0, -s * 0.7], [s * 0.18, -s * 0.66], [0, -s * 0.62]], true); g.fill();
    g.restore();
  }
  function rhumbLines(g, x, y, R, n) { g.save(); g.strokeStyle = 'rgba(120,80,40,0.12)'; g.lineWidth = 1; for (let k = 0; k < n; k++) { const a = k / n * 6.283; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * R, y + Math.sin(a) * R); g.stroke(); } g.restore(); }
  function wax(g, x, y, r, col) {
    g.save(); g.fillStyle = col || '#a8281e'; g.beginPath();
    for (let k = 0; k < 14; k++) { const a = k / 14 * 6.283, rr = r * (0.88 + hrand(k, x | 0, y | 0) * 0.2); g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.closePath(); g.fill(); g.strokeStyle = 'rgba(255,220,200,0.35)'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, r * 0.62, 0, 6.29); g.stroke();
    g.strokeStyle = 'rgba(70,10,5,0.6)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x - r * 0.3, y); g.lineTo(x - r * 0.05, y + r * 0.28); g.lineTo(x + r * 0.35, y - r * 0.3); g.stroke(); g.restore();
  }
  function blot(g, x, y, r) {
    g.save(); g.fillStyle = 'rgba(160,30,20,0.75)'; g.beginPath();
    for (let k = 0; k < 18; k++) { const a = k / 18 * 6.283, rr = r * (0.6 + hrand(k, x | 0, 3) * 0.6); g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.closePath(); g.fill(); for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(x + (hrand(k, 1, x | 0) - 0.5) * r * 3, y + (hrand(k, 2, y | 0) - 0.5) * r * 3, r * 0.15, 0, 6.29); g.fill(); } g.restore();
  }

  root.CART = { INK, INK2, SERIF, WASH, hrand, parchment, deckle, tile, coast, landmark, compass, serpent, kraken, ship, rhumbLines, wax, blot, tree, mountain };
})(typeof window !== 'undefined' ? window : globalThis);
