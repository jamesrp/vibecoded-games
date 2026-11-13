// CLOCKWORK HEIST renderer: flat 1960s title-sequence look, all procedural.
(function (root) {
  'use strict';
  const S = root.CHSim;
  const P = {
    paper: '#efe4cc', paper2: '#e6d8b9', ink: '#171412', ink2: '#2a2522', orange: '#e8601c', red: '#c8312b',
    mustard: '#e2a72e', teal: '#1f7a74', blue: '#2b4f9e', cream: '#fbf4e2', grey: '#9a9184',
  };
  const FONT = "'Futura','Avenir Next Condensed','Franklin Gothic Medium','Arial Black','Helvetica Neue',Arial,sans-serif";
  const ROLE_COL = { pick: P.teal, charm: P.red, muscle: P.mustard, eye: P.blue };
  let grain = null;
  function makeGrain(w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'), d = x.createImageData(w, h);
    let s = 1234567;
    for (let i = 0; i < d.data.length; i += 4) {
      s = (s * 1103515245 + 12345) & 0x7fffffff; const v = (s >> 16) & 255;
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v < 128 ? 0 : 255; d.data[i + 3] = (v % 23 === 0) ? 22 : 7;
    }
    x.putImageData(d, 0, 0); return c;
  }
  function font(sz, w) { return `${w || 800} ${sz}px ${FONT}`; }
  // condensed bold text with optional tracking
  function text(ctx, s, x, y, sz, col, opts) {
    opts = opts || {};
    ctx.save(); ctx.font = font(sz, opts.w); ctx.fillStyle = col; ctx.textBaseline = opts.base || 'alphabetic';
    ctx.textAlign = opts.align || 'left';
    if (opts.rot) { ctx.translate(x, y); ctx.rotate(opts.rot); x = 0; y = 0; }
    if (opts.squash) { ctx.translate(x, y); ctx.scale(opts.squash, 1); x = 0; y = 0; }
    if (opts.track && 'letterSpacing' in ctx) ctx.letterSpacing = opts.track + 'px';
    ctx.fillText(s, x, y); ctx.restore();
  }
  function wob(i, j) { return Math.sin(i * 12.9898 + j * 78.233) * 43758.5453 % 1; }

  // ---------- map geometry ----------
  function layout(L, W, H, top, bottom) {
    const availW = W - 48, availH = H - top - bottom;
    const T = Math.floor(Math.min(availW / L.w, availH / L.h, 56));
    return { T, ox: Math.round((W - L.w * T) / 2), oy: Math.round(top + (availH - L.h * T) / 2) };
  }

  function occupiedF(f, x, y) {
    for (const c of f.crew) if (!c.out && c.x === x && c.y === y) return true;
    for (const g of f.guards) if (g.x === x && g.y === y) return true;
    for (const g of f.dogs) if (g.x === x && g.y === y) return true;
    return false;
  }
  const SB = new Set(['#', 'S', 's', 'P', 'C', '%', 'D', 'L', 'O']);
  function blockF(L, f, x, y) {
    if (x < 0 || y < 0 || x >= L.w || y >= L.h) return true;
    const c = f.tiles[y * L.w + x];
    if (!SB.has(c)) return false;
    if ((c === 'D' || c === 'L') && occupiedF(f, x, y)) return false;
    return true;
  }
  // visibility polygon (tile units) for a cone
  function cone(L, f, gx, gy, a, half, range) {
    const pts = [[gx, gy]], n = Math.max(8, Math.round(half * 2 / 0.04));
    const sx = Math.round(gx), sy = Math.round(gy);
    for (let i = 0; i <= n; i++) {
      const an = a - half + (2 * half) * i / n, ca = Math.cos(an), sa = Math.sin(an);
      let r = 0;
      for (; r < range + 0.45; r += 0.05) {
        const tx = Math.round(gx + ca * r), ty = Math.round(gy + sa * r);
        if (tx === sx && ty === sy) continue;
        if (blockF(L, f, tx, ty)) { break; }
      }
      r = Math.min(r, range + 0.45);
      pts.push([gx + ca * r, gy + sa * r]);
    }
    return pts;
  }

  // ---------- tiles ----------
  function drawMap(ctx, L, f, lay, t, opts) {
    const { T, ox, oy } = lay;
    const X = (x) => ox + x * T, Y = (y) => oy + y * T;
    // floor slab with offset shadow
    ctx.fillStyle = P.ink; ctx.fillRect(X(0) + 6, Y(0) + 6, L.w * T, L.h * T);
    ctx.fillStyle = P.cream; ctx.fillRect(X(0), Y(0), L.w * T, L.h * T);
    // checker floor tint, hatched restricted zones
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
      if ((x + y) % 2) { ctx.fillStyle = 'rgba(120,96,60,0.06)'; ctx.fillRect(X(x), Y(y), T, T); }
    }
    ctx.save();
    for (const z of L.zones) {
      const zx = X(z[0]), zy = Y(z[1]), zw = (z[2] - z[0] + 1) * T, zh = (z[3] - z[1] + 1) * T;
      ctx.fillStyle = 'rgba(200,49,43,0.10)'; ctx.fillRect(zx, zy, zw, zh);
      ctx.save(); ctx.beginPath(); ctx.rect(zx, zy, zw, zh); ctx.clip();
      ctx.strokeStyle = 'rgba(200,49,43,0.28)'; ctx.lineWidth = Math.max(2, T * 0.07);
      for (let k = -zh; k < zw; k += T * 0.42) { ctx.beginPath(); ctx.moveTo(zx + k, zy + zh); ctx.lineTo(zx + k + zh, zy); ctx.stroke(); }
      ctx.restore();
    }
    ctx.restore();
    const tiles = f.tiles;
    const at = (x, y) => (x < 0 || y < 0 || x >= L.w || y >= L.h) ? '#' : tiles[y * L.w + x];
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
      const c = at(x, y), px = X(x), py = Y(y), cx = px + T / 2, cy = py + T / 2;
      switch (c) {
        case 'E': {
          ctx.fillStyle = P.paper2; ctx.fillRect(px, py, T, T);
          ctx.strokeStyle = 'rgba(232,96,28,0.55)'; ctx.lineWidth = T * 0.08;
          for (let k = 0; k < 2; k++) { ctx.beginPath(); const yy = py + T * (0.3 + k * 0.35); ctx.moveTo(px + T * 0.62, yy - T * 0.12); ctx.lineTo(px + T * 0.38, yy); ctx.lineTo(px + T * 0.62, yy + T * 0.12); ctx.stroke(); }
          break;
        }
        case 'o': {
          ctx.fillStyle = '#c9b48d'; roundRect(ctx, px + T * 0.1, py + T * 0.1, T * 0.8, T * 0.8, T * 0.12); ctx.fill();
          ctx.fillStyle = 'rgba(23,20,18,0.18)'; ctx.fillRect(px + T * 0.1, py + T * 0.78, T * 0.8, T * 0.12);
          break;
        }
        case 'x': {
          const on = S.laserOn(L, f.t) && f.loopT <= 0;
          const vert = at(x - 1, y) === '#' || at(x + 1, y) === '#' ? false : (at(x, y - 1) === '#' || at(x, y + 1) === '#');
          ctx.strokeStyle = on ? P.red : 'rgba(200,49,43,0.25)'; ctx.lineWidth = on ? T * 0.1 : T * 0.04;
          ctx.setLineDash(on ? [] : [T * 0.1, T * 0.1]);
          ctx.beginPath();
          if (vert) { ctx.moveTo(px, cy); ctx.lineTo(px + T, cy); } else { ctx.moveTo(cx, py); ctx.lineTo(cx, py + T); }
          ctx.stroke(); ctx.setLineDash([]);
          if (on) { ctx.fillStyle = 'rgba(200,49,43,0.12)'; ctx.fillRect(px, py, T, T); }
          break;
        }
      }
    }
    // walls as merged black slabs
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
      const c = at(x, y), px = X(x), py = Y(y);
      if (c === '#' || c === 'C' || c === 'P') { ctx.fillStyle = P.ink; ctx.fillRect(px - 0.5, py - 0.5, T + 1, T + 1); }
    }
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
      const c = at(x, y), px = X(x), py = Y(y), cx = px + T / 2, cy = py + T / 2;
      switch (c) {
        case 'D': case 'L': {
          const horiz = at(x - 1, y) === '#' || at(x + 1, y) === '#';
          const open = occupiedF(f, x, y);
          ctx.fillStyle = P.cream; ctx.fillRect(px, py, T, T);
          ctx.fillStyle = c === 'L' ? P.red : P.orange;
          const th = T * 0.22;
          if (open) {
            ctx.globalAlpha = 0.5;
            if (horiz) ctx.fillRect(px, py, T * 0.18, T); else ctx.fillRect(px, py, T, T * 0.18);
            ctx.globalAlpha = 1;
          } else if (horiz) ctx.fillRect(px, cy - th / 2, T, th); else ctx.fillRect(cx - th / 2, py, th, T);
          if (c === 'L' && !open) { // keyhole
            ctx.fillStyle = P.cream; ctx.beginPath(); ctx.arc(cx, cy - T * 0.04, T * 0.07, 0, 7); ctx.fill();
            ctx.fillRect(cx - T * 0.03, cy - T * 0.02, T * 0.06, T * 0.12);
          }
          break;
        }
        case 'S': case 's': case 'O': {
          ctx.fillStyle = P.ink2; roundRect(ctx, px + T * 0.08, py + T * 0.08, T * 0.84, T * 0.84, T * 0.08); ctx.fill();
          ctx.strokeStyle = c === 'S' ? P.orange : P.mustard; ctx.lineWidth = T * 0.06;
          ctx.beginPath(); ctx.arc(cx, cy, T * 0.22, 0, 7); ctx.stroke();
          if (c === 'O') { ctx.fillStyle = P.cream; ctx.fillRect(px + T * 0.14, py + T * 0.14, T * 0.72, T * 0.72); ctx.strokeStyle = P.ink; ctx.lineWidth = 2; ctx.strokeRect(px + T * 0.14, py + T * 0.14, T * 0.72, T * 0.72); }
          else { ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 0.0 + 0.6); ctx.fillStyle = P.cream; ctx.fillRect(-T * 0.02, -T * 0.2, T * 0.04, T * 0.14); ctx.restore(); }
          break;
        }
        case '$': drawCash(ctx, cx, cy, T); break;
        case 'g': drawGold(ctx, cx, cy, T); break;
        case '*': drawMark(ctx, cx, cy, T, t); break;
        case '%': {
          ctx.fillStyle = '#3a332e'; ctx.fillRect(px, py, T, T);
          ctx.strokeStyle = P.paper2; ctx.lineWidth = 2; ctx.beginPath();
          ctx.moveTo(px + T * 0.2, py + T * 0.1); ctx.lineTo(px + T * 0.45, py + T * 0.45); ctx.lineTo(px + T * 0.3, py + T * 0.7); ctx.lineTo(px + T * 0.55, py + T * 0.92);
          ctx.moveTo(px + T * 0.45, py + T * 0.45); ctx.lineTo(px + T * 0.8, py + T * 0.35); ctx.stroke();
          break;
        }
        case 'P': {
          const looped = f.loopT > 0;
          ctx.fillStyle = P.blue; roundRect(ctx, px + T * 0.14, py + T * 0.14, T * 0.72, T * 0.72, T * 0.08); ctx.fill();
          for (let k = 0; k < 3; k++) { ctx.fillStyle = looped ? (k === ((t / 120) | 0) % 3 ? P.mustard : P.cream) : P.cream; ctx.beginPath(); ctx.arc(px + T * (0.32 + k * 0.18), py + T * 0.36, T * 0.05, 0, 7); ctx.fill(); }
          ctx.fillStyle = looped ? P.mustard : 'rgba(251,244,226,0.5)'; ctx.fillRect(px + T * 0.26, py + T * 0.55, T * 0.48, T * 0.12);
          break;
        }
      }
    }
  }
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function drawCash(ctx, cx, cy, T) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.25);
    for (let k = 0; k < 3; k++) { ctx.fillStyle = k === 2 ? '#7aa35a' : '#5f8a45'; ctx.fillRect(-T * 0.26, -T * 0.14 + k * T * 0.07 - T * 0.07, T * 0.52, T * 0.22); }
    ctx.fillStyle = P.mustard; ctx.fillRect(-T * 0.05, -T * 0.08, T * 0.1, T * 0.3);
    ctx.restore();
  }
  function drawGold(ctx, cx, cy, T) {
    ctx.fillStyle = P.mustard; ctx.strokeStyle = P.ink; ctx.lineWidth = 1.5;
    const bar = (x, y) => { ctx.beginPath(); ctx.moveTo(x - T * 0.17, y + T * 0.08); ctx.lineTo(x + T * 0.17, y + T * 0.08); ctx.lineTo(x + T * 0.12, y - T * 0.06); ctx.lineTo(x - T * 0.12, y - T * 0.06); ctx.closePath(); ctx.fill(); ctx.stroke(); };
    bar(cx - T * 0.16, cy + T * 0.12); bar(cx + T * 0.16, cy + T * 0.12); bar(cx, cy - T * 0.04);
  }
  function drawMark(ctx, cx, cy, T, t) {
    const s = T * 0.3, pul = 1 + 0.06 * Math.sin(t / 220);
    ctx.save(); ctx.translate(cx, cy); ctx.scale(pul, pul);
    ctx.fillStyle = P.ink; ctx.fillRect(-T * 0.3, T * 0.18, T * 0.6, T * 0.12);
    ctx.fillStyle = P.orange; ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.85, -s * 0.2); ctx.lineTo(0, s * 0.6); ctx.lineTo(-s * 0.85, -s * 0.2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = P.red; ctx.beginPath(); ctx.moveTo(0, -s * 0.2); ctx.lineTo(s * 0.85, -s * 0.2); ctx.lineTo(0, s * 0.6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = P.cream; ctx.beginPath(); ctx.moveTo(-s * 0.3, -s * 0.7); ctx.lineTo(-s * 0.12, -s * 0.7); ctx.lineTo(-s * 0.4, -s * 0.2); ctx.lineTo(-s * 0.58, -s * 0.2); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // ---------- actors ----------
  function lerp(a, b, k) { return a + (b - a) * k; }
  function lerpA(a, b, k) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * k; }
  function ease(k) { return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; }

  function drawCones(ctx, L, f, lay, k, opts) {
    const { T, ox, oy } = lay;
    const toPx = (p) => [ox + (p[0] + 0.5) * T, oy + (p[1] + 0.5) * T];
    // cameras
    L.cams.forEach((cam) => {
      const a = lerpA(S.camAngle(cam, Math.max(0, f.t - 1)), S.camAngle(cam, f.t), k);
      const looped = f.loopT > 0;
      const poly = cone(L, f, cam.x, cam.y, a, S.K.CAM_HALF, cam.range);
      ctx.beginPath(); poly.forEach((p, i) => { const q = toPx(p); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.closePath();
      if (looped) { ctx.fillStyle = 'rgba(120,120,120,0.10)'; ctx.fill(); }
      else { ctx.fillStyle = 'rgba(200,49,43,0.20)'; ctx.fill(); ctx.strokeStyle = 'rgba(200,49,43,0.55)'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]); }
    });
    f.guards.forEach((g, i) => {
      if (g.ko) return;
      const pg = opts.prev ? opts.prev.guards[i] : g;
      const gx = lerp(pg.x, g.x, ease(k)), gy = lerp(pg.y, g.y, ease(k)), a = lerpA(pg.a, g.a, Math.min(1, k * 2));
      const poly = cone(L, f, gx, gy, a, S.K.GUARD_HALF, S.K.GUARD_RANGE);
      ctx.beginPath(); poly.forEach((p, j) => { const q = toPx(p); j ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.closePath();
      const hot = opts.hotGuard === i;
      ctx.fillStyle = hot ? 'rgba(200,49,43,0.38)' : (g.held > 0 ? 'rgba(232,96,28,0.14)' : 'rgba(232,96,28,0.26)'); ctx.fill();
    });
    f.dogs.forEach((g, i) => {
      const pg = opts.prev ? opts.prev.dogs[i] : g;
      const gx = lerp(pg.x, g.x, ease(k)), gy = lerp(pg.y, g.y, ease(k));
      const [px, py] = toPx([gx, gy]);
      ctx.strokeStyle = 'rgba(23,20,18,0.35)'; ctx.setLineDash([3, 5]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, py, (S.K.DOG_RANGE + 0.5) * T, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(23,20,18,0.05)'; ctx.fill();
    });
  }

  function drawGuard(ctx, x, y, a, T, g, now) {
    ctx.save(); ctx.translate(x, y);
    if (g.ko) {
      ctx.rotate(0.4); ctx.fillStyle = P.ink; ctx.beginPath(); ctx.ellipse(0, 0, T * 0.36, T * 0.2, 0, 0, 7); ctx.fill();
      ctx.fillStyle = P.mustard; for (let k = 0; k < 3; k++) { const an = now / 300 + k * 2.1; ctx.beginPath(); ctx.arc(Math.cos(an) * T * 0.3, -T * 0.3 + Math.sin(an) * T * 0.08, T * 0.05, 0, 7); ctx.fill(); }
      ctx.restore(); return;
    }
    ctx.fillStyle = 'rgba(23,20,18,0.2)'; ctx.beginPath(); ctx.ellipse(T * 0.06, T * 0.08, T * 0.34, T * 0.3, 0, 0, 7); ctx.fill();
    ctx.rotate(a);
    // shoulders
    ctx.fillStyle = P.ink; ctx.beginPath(); ctx.ellipse(0, 0, T * 0.22, T * 0.36, 0, 0, 7); ctx.fill();
    // hat brim + crown
    ctx.fillStyle = P.ink2; ctx.beginPath(); ctx.arc(T * 0.02, 0, T * 0.2, 0, 7); ctx.fill();
    ctx.fillStyle = P.ink; ctx.beginPath(); ctx.arc(T * 0.02, 0, T * 0.12, 0, 7); ctx.fill();
    ctx.fillStyle = P.ink2; ctx.fillRect(T * 0.16, -T * 0.13, T * 0.1, T * 0.26); // peak
    // torch
    ctx.fillStyle = P.mustard; ctx.fillRect(T * 0.22, T * 0.2, T * 0.16, T * 0.06);
    ctx.restore();
  }
  function drawDog(ctx, x, y, a, T, now) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = 'rgba(23,20,18,0.2)'; ctx.beginPath(); ctx.ellipse(T * 0.05, T * 0.08, T * 0.34, T * 0.2, 0, 0, 7); ctx.fill();
    ctx.rotate(a); ctx.fillStyle = P.ink;
    ctx.beginPath(); ctx.ellipse(-T * 0.04, 0, T * 0.3, T * 0.15, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(T * 0.26, 0, T * 0.12, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(T * 0.3, 0); ctx.lineTo(T * 0.46, -T * 0.04); ctx.lineTo(T * 0.46, T * 0.04); ctx.fill();
    ctx.beginPath(); ctx.moveTo(T * 0.2, -T * 0.08); ctx.lineTo(T * 0.16, -T * 0.22); ctx.lineTo(T * 0.28, -T * 0.1); ctx.fill();
    ctx.beginPath(); ctx.moveTo(T * 0.2, T * 0.08); ctx.lineTo(T * 0.16, T * 0.22); ctx.lineTo(T * 0.28, T * 0.1); ctx.fill();
    ctx.lineWidth = T * 0.06; ctx.strokeStyle = P.ink; ctx.beginPath(); ctx.moveTo(-T * 0.32, 0); ctx.lineTo(-T * 0.46, Math.sin(now / 90) * T * 0.1); ctx.stroke();
    ctx.restore();
  }
  function drawCrew(ctx, role, x, y, T, c, now, sel) {
    const col = ROLE_COL[role], r = T * 0.32;
    ctx.save(); ctx.translate(x, y);
    if (sel) { ctx.strokeStyle = P.ink; ctx.lineWidth = 2; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.arc(0, 0, r + T * 0.12, now / 400, now / 400 + 6.2); ctx.stroke(); ctx.setLineDash([]); }
    ctx.fillStyle = 'rgba(23,20,18,0.25)'; ctx.beginPath(); ctx.arc(T * 0.06, T * 0.08, r, 0, 7); ctx.fill();
    ctx.fillStyle = col;
    if (role === 'muscle') { roundRect(ctx, -r, -r, r * 2, r * 2, r * 0.25); ctx.fill(); }
    else if (role === 'eye') { ctx.beginPath(); ctx.moveTo(0, -r * 1.1); ctx.lineTo(r * 1.05, r * 0.8); ctx.lineTo(-r * 1.05, r * 0.8); ctx.closePath(); ctx.fill(); }
    else { ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); }
    ctx.fillStyle = P.cream; ctx.strokeStyle = P.cream; ctx.lineWidth = T * 0.06;
    if (role === 'pick') { ctx.beginPath(); ctx.arc(0, -r * 0.2, r * 0.28, 0, 7); ctx.fill(); ctx.beginPath(); ctx.moveTo(-r * 0.18, -r * 0.1); ctx.lineTo(r * 0.18, -r * 0.1); ctx.lineTo(r * 0.12, r * 0.55); ctx.lineTo(-r * 0.12, r * 0.55); ctx.fill(); }
    else if (role === 'charm') { ctx.beginPath(); ctx.moveTo(0, -r * 0.5); ctx.lineTo(r * 0.42, 0); ctx.lineTo(0, r * 0.5); ctx.lineTo(-r * 0.42, 0); ctx.closePath(); ctx.fill(); }
    else if (role === 'muscle') { ctx.fillRect(-r * 0.5, -r * 0.18, r, r * 0.36); ctx.fillRect(-r * 0.5, -r * 0.42, r * 0.28, r * 0.84); ctx.fillRect(r * 0.22, -r * 0.42, r * 0.28, r * 0.84); }
    else if (role === 'eye') { ctx.beginPath(); ctx.ellipse(0, r * 0.18, r * 0.5, r * 0.26, 0, 0, 7); ctx.fill(); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, r * 0.18, r * 0.15, 0, 7); ctx.fill(); }
    if (c && c.carry && c.carry.length) {
      c.carry.forEach((it, i) => {
        const bx = r * 0.8 + i * T * 0.18, by = -r * 0.9;
        if (it === 'mark') drawMark(ctx, bx, by, T * 0.55, now); else if (it === 'gold') drawGold(ctx, bx, by, T * 0.6); else drawCash(ctx, bx, by, T * 0.6);
      });
    }
    ctx.restore();
  }

  function drawWork(ctx, x, y, T, c) { // progress ring for pick/smash/loop/chat
    if (!c || !c.busy || !c.need || !['pick', 'smash', 'loop'].includes(c.busy)) return;
    const k = Math.min(1, c.prog / c.need);
    ctx.strokeStyle = P.ink; ctx.lineWidth = T * 0.09;
    ctx.beginPath(); ctx.arc(x, y, T * 0.5, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); ctx.stroke();
  }

  const API = { P, FONT, ROLE_COL, layout, drawMap, drawCones, drawGuard, drawDog, drawCrew, drawWork, drawMark, drawCash, drawGold, text, font, roundRect, makeGrain, lerp, lerpA, ease, cone,
    grain: () => grain || (grain = makeGrain(256, 256)) };
  root.CHRender = API;
})(window);
