// BRIGHTFIELD pixel-art MVP (?art=pixel). Procedural low-res sprites, nearest-neighbour upscale.
// file:// safe, no image assets. Five hero buildings aimed at Hexhaven-like density; others stay silhouettes.
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  const FPS = 8;
  // Higher-res sprites: hex ~45px wide, buildings fill it (~2× the first test).
  const SW = 108, SH = 176, HX = 54, HY = 126, HS = 26;
  const SQ = 0.86;
  const DEPTH = 8;
  const INK = '#141820';
  const FAM = {
    power: '#e8b43a', move: '#6a8ab8', food: '#e09030', water: '#3aa0d8',
    home: '#d06040', make: '#9060c0', waste: '#709448', wild: '#3d8a38',
  };
  const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];

  function hex2rgb(h) {
    if (Array.isArray(h)) return h;
    if (h[0] !== '#') return (h.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(Number);
    h = h.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function rgb(a) { return 'rgb(' + (a[0] | 0) + ',' + (a[1] | 0) + ',' + (a[2] | 0) + ')'; }
  function mix(a, b, t) { const A = hex2rgb(a), B = hex2rgb(b); return rgb([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]); }
  function shade(c, k) { const A = hex2rgb(c); return k >= 0 ? rgb(A.map((v) => v + (255 - v) * k)) : rgb(A.map((v) => v * (1 + k))); }
  function lit(c) { return shade(c, 0.28); }
  function dim(c) { return shade(c, -0.32); }
  function frameOf(t, n) { return ((Math.floor((t < 0 ? 0 : t) * FPS) % n) + n) % n; }

  function pix(ctx) {
    return {
      p(x, y, c) { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, 1, 1); },
      r(x, y, w, h, c) { if (w < 1 || h < 1) return; ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, w | 0, h | 0); },
    };
  }
  function line(p, x0, y0, x1, y1, c) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx - dy;
    for (;;) { p.p(x0, y0, c); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 > -dy) { err -= dy; x0 += sx; } if (e2 < dx) { err += dx; y0 += sy; } }
  }
  function disc(p, cx, cy, r, c) {
    r |= 0; for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) p.p(cx + x, cy + y, c);
  }
  function ellip(p, cx, cy, rx, ry, c) {
    rx |= 0; ry |= 0; if (rx < 1 || ry < 1) return;
    for (let y = -ry; y <= ry; y++) {
      const w = Math.max(1, Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry)))));
      p.r(cx - w, cy + y, w * 2, 1, c);
    }
  }
  function hexHalfW(y, rx, ry) {
    const ay = Math.abs(y);
    if (ay >= ry) return 0;
    if (ay <= ry * 0.5) return rx;
    return rx * (1 - (ay - ry * 0.5) / (ry * 0.5));
  }
  function fillHex(p, cx, cy, rx, ry, c) {
    rx = Math.round(rx); ry = Math.round(ry);
    for (let y = -ry; y <= ry; y++) {
      const w = Math.max(1, Math.round(hexHalfW(y, rx, ry)));
      p.r(cx - w, cy + y, w * 2, 1, c);
    }
  }
  function outlineHex(p, cx, cy, rx, ry, c) {
    rx = Math.round(rx); ry = Math.round(ry);
    const u = rx / (Math.sqrt(3) / 2);
    const vs = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i + Math.PI / 6;
      vs.push([Math.round(cx + Math.cos(a) * u), Math.round(cy + Math.sin(a) * ry)]);
    }
    for (let i = 0; i < 6; i++) line(p, vs[i][0], vs[i][1], vs[(i + 1) % 6][0], vs[(i + 1) % 6][1], c);
  }

  // 3-tone iso box, light from top-left.
  function box3(p, x, y, w, h, d, fill) {
    const x0 = Math.round(x - w / 2), y0 = Math.round(y - h);
    p.r(x0 - 1, y0 - d - 1, w + d + 2, h + d + 2, INK);
    p.r(x0, y0, w, h, fill);
    p.r(x0, y0, 2, h, lit(fill));
    for (let i = 0; i < d; i++) p.r(x0 + w + i, y0 - i - 1, 1, h + 1, dim(fill));
    p.r(x0 + 1, y0 - d, w, d, lit(fill));
    p.r(x0, y0 - d, Math.max(1, d - 1), d, fill);
  }
  function cyl(p, x, y, r, h, fill) {
    p.r(x - r - 1, y - h, (r + 1) * 2 + 1, h + 1, INK);
    p.r(x - r, y - h, r * 2, h, fill);
    p.r(x - r, y - h, 2, h, lit(fill));
    p.r(x + r - 2, y - h, 2, h, dim(fill));
    ellip(p, x, y - h, r, Math.max(2, Math.round(r * 0.4)), lit(fill));
    ellip(p, x, y - h, r, Math.max(1, Math.round(r * 0.4)), INK);
    ellip(p, x, y - h, r - 1, Math.max(1, Math.round(r * 0.4) - 1), lit(fill));
  }
  function pine(p, x, y, h, c) {
    c = c || '#2f7a3a';
    p.r(x, y - Math.max(2, (h * 0.3) | 0), 1, Math.max(2, (h * 0.35) | 0), '#5a3a22');
    for (let i = 0; i < 3; i++) {
      const yy = y - Math.round(h * (0.28 + i * 0.24));
      const ww = Math.max(1, Math.round((3 - i) * h * 0.16));
      p.r(x - ww, yy - 2, ww * 2 + 1, 3, i ? lit(c) : dim(c));
      p.r(x - ww + 1, yy - 2, 2, 2, lit(c));
    }
  }
  function bush(p, x, y) {
    disc(p, x, y - 2, 3, '#2e6a32'); disc(p, x - 2, y - 3, 2, '#3d8a3c'); disc(p, x + 2, y - 3, 2, '#4aa048');
  }
  function win(p, x, y, w, h, on) {
    p.r(x - 1, y - 1, w + 2, h + 2, INK);
    p.r(x, y, w, h, on ? '#f0c25a' : '#2a3038');
    if (on) p.p(x, y, '#fff4c0');
  }
  function rail(p, x, y, w) {
    p.r(x, y, w, 1, '#6a7380');
    for (let i = 0; i < w; i += 3) p.r(x + i, y + 1, 1, 2, '#5a6270');
  }

  function grassOf(vivid, smog) {
    const g = mix('#7a9a48', '#5ecb52', vivid);
    return mix(g, '#6a6840', smog * 0.35);
  }
  function dirtOf(smog) { return mix('#a86a3a', '#6a4a30', smog * 0.35); }

  function drawTile(p, cx, cy, smog, vivid, seed) {
    const rx = Math.round(HS * Math.sqrt(3) / 2), ry = Math.round(HS * SQ);
    const dirt = dirtOf(smog), dirtDk = dim(dirt), dirtLt = lit(dirt);
    for (let d = DEPTH; d >= 1; d--) fillHex(p, cx, cy + d, rx, ry, d > DEPTH - 2 ? dirtDk : (d === 1 ? dirtLt : dirt));
    for (let i = 0; i < 8; i++) {
      const k = (seed * 13 + i * 17) & 63;
      p.p(cx - rx + 5 + (k % (rx * 2 - 8)), cy + ry + 1 + (k % (DEPTH - 1)), (k & 1) ? dirtDk : shade(dirt, -0.1));
    }
    const gr = grassOf(vivid, smog);
    fillHex(p, cx, cy, rx, ry, gr);
    fillHex(p, cx - 1, cy - 1, rx - 3, ry - 3, lit(gr));
    // grass texture
    for (let i = 0; i < 18; i++) {
      const k = (seed * 9 + i * 11) & 63, gx = cx - rx + 4 + (k % (rx * 2 - 6)), gy = cy - ry + 4 + ((k * 3) % (ry * 2 - 6));
      if (Math.abs(gx - cx) < hexHalfW(gy - cy, rx - 2, ry - 2)) p.p(gx, gy, (i & 1) ? lit(gr) : dim(gr));
    }
    outlineHex(p, cx, cy, rx, ry, INK);
    if (smog > 0.18) {
      const haze = mix('#7a7060', '#3a342c', Math.min(1, smog));
      for (let y = -ry; y <= ry; y++) {
        const w = Math.round(hexHalfW(y, rx, ry));
        for (let x = -w; x <= w; x++) {
          if (BAYER[(cy + y) & 3][(cx + x) & 3] / 16 < smog * 0.35) p.p(cx + x, cy + y, haze);
        }
      }
    }
    pine(p, cx - rx + 4, cy - 1, 9, '#2f7a3a');
    pine(p, cx + rx - 5, cy, 8, '#3d8a3c');
    if ((seed & 1) === 0) pine(p, cx - 8, cy - ry + 4, 6, '#2f7a3a');
  }

  function plume(p, x, y, fr, n) {
    for (let i = 0; i < n; i++) {
      const ph = (fr + i * 3) % 8;
      const ox = i * 2 + (ph % 3) + (i > 2 ? 2 : 0);
      const oy = -3 - i * 5 - (ph % 3);
      const r = 2 + Math.min(4, (i / 1.2) | 0);
      const col = i < 2 ? '#2e2e2c' : (i < 4 ? '#4a4844' : '#6e6a64');
      disc(p, x + ox, y + oy, r, col);
      disc(p, x + ox - 1, y + oy - 1, Math.max(1, r - 2), shade(col, 0.12));
    }
  }

  // ----- five hero buildings (drawn to fill the hex) -----
  function coal(p, x, y, fr) {
    // landscaping
    pine(p, x - 22, y - 4, 14, '#1e5a28');
    pine(p, x - 16, y - 8, 11, '#2a6a30');
    pine(p, x + 22, y - 2, 12, '#245a2a');
    bush(p, x - 20, y + 6); bush(p, x + 20, y + 7);
    // coal heaps (front)
    ellip(p, x - 10, y + 7, 12, 5, '#141412');
    ellip(p, x - 10, y + 5, 10, 4, '#2a2a28');
    ellip(p, x - 6, y + 3, 6, 3, '#3a3a36');
    ellip(p, x + 8, y + 8, 10, 4, '#141412');
    ellip(p, x + 8, y + 6, 8, 3, '#2a2a28');
    p.p(x - 12, y + 2, '#4a4a44'); p.p(x - 4, y + 3, '#5a5a54'); p.p(x + 10, y + 4, '#3a3a38');
    // conveyor from heap into the building (animated bits)
    p.r(x - 14, y + 1, 18, 3, INK); p.r(x - 13, y + 2, 16, 1, '#5a5848');
    for (let i = 0; i < 5; i++) p.p(x - 12 + ((i * 3 + fr) % 16), y + 2, '#c8a040');
    p.r(x + 4, y - 2, 3, 5, '#4a4838');
    // left tank + pipes
    cyl(p, x - 20, y + 2, 5, 12, '#6a6860');
    p.r(x - 19, y - 4, 1, 1, '#8a8880'); p.r(x - 17, y - 2, 1, 1, '#8a8880');
    p.r(x - 15, y - 14, 14, 2, '#c4a040'); p.r(x - 15, y - 14, 2, 10, '#c4a040');
    p.r(x - 15, y - 15, 14, 1, '#e0c060');
    p.r(x + 10, y - 10, 10, 2, '#c4a040'); p.r(x + 10, y - 10, 2, 8, '#c4a040');
    // main brick hall
    box3(p, x - 2, y, 30, 16, 8, '#8a6a52');
    // brick rows
    for (let by = 0; by < 4; by++) p.r(x - 16, y - 3 - by * 4, 28, 1, '#7a5a44');
    for (let bx = 0; bx < 7; bx++) for (let by = 0; by < 3; by++) {
      if ((bx + by) & 1) p.p(x - 14 + bx * 4, y - 5 - by * 4, '#9a7a62');
    }
    // windows
    for (let i = 0; i < 5; i++) win(p, x - 14 + i * 5, y - 12, 3, 3, (i + fr) % 5 === 2);
    p.r(x - 3, y - 6, 5, 6, '#2a2018'); // door
    p.r(x - 2, y - 4, 1, 1, '#c4a040');
    // upper machine house
    box3(p, x + 2, y - 16, 16, 8, 5, '#6a5a4c');
    win(p, x - 2, y - 20, 3, 2, fr % 4 !== 1); win(p, x + 3, y - 20, 3, 2, true);
    // right scaffold / hopper
    box3(p, x + 18, y - 2, 10, 18, 4, '#4a453c');
    p.r(x + 15, y - 16, 8, 2, '#c4a040');
    for (let i = 0; i < 4; i++) p.r(x + 16, y - 6 - i * 3, 6, 1, '#3a3830');
    // two banded stacks
    function stack(sx, sy, h) {
      p.r(sx - 6, sy - h - 1, 13, h + 3, INK);
      for (let i = 0; i < h; i++) {
        const band = Math.floor((h - 1 - i) / 6) % 2;
        p.r(sx - 5, sy - h + i, 10, 1, band ? '#e0d0b8' : '#c04838');
      }
      p.r(sx - 5, sy - h, 2, h, '#fff4dc');
      p.r(sx + 4, sy - h, 1, h, '#6a3028');
      ellip(p, sx, sy - h, 5, 2, '#e8d8c0');
      p.r(sx - 4, sy - h - 2, 8, 2, '#5a4038');
    }
    stack(x - 2, y - 22, 40);
    stack(x + 12, y - 18, 34);
    plume(p, x + 2, y - 62, fr, 7);
    plume(p, x + 14, y - 54, (fr + 3) % 8, 6);
    // little worker walking the conveyor
    const wx = x - 12 + ((fr) % 8) * 2, wy = y + 1;
    p.p(wx, wy - 5, '#e8c0a0'); p.r(wx, wy - 4, 2, 3, '#c44a32'); p.r(wx, wy - 1, 1, 2, '#2a2a40');
  }

  function wind(p, x, y, fr) {
    // grassy mound
    fillHex(p, x, y - 2, 18, 8, '#4a9a40');
    fillHex(p, x - 1, y - 3, 14, 6, '#5cb050');
    // winding path
    for (let i = 0; i < 10; i++) p.r(x - 6 + i, y + 4 - (i > 5 ? (i - 5) : 0), 2, 1, '#c8b878');
    // pines
    [[-20, 2, 13], [-14, -6, 10], [18, 4, 12], [22, -2, 9], [-8, -10, 8], [10, -12, 7], [16, -8, 11]].forEach((t) => pine(p, x + t[0], y + t[1], t[2], '#246434'));
    bush(p, x - 10, y + 6); bush(p, x + 8, y + 8);
    // rocks
    p.r(x - 22, y + 6, 4, 3, '#6a6860'); p.r(x + 20, y + 8, 5, 3, '#5a5850');
    function tur(tx, ty, h, fo) {
      // concrete pad
      p.r(tx - 4, ty - 1, 8, 3, '#8a8880'); p.r(tx - 3, ty - 2, 6, 1, '#a8a8a0');
      // tapered tower (wider at base)
      for (let i = 0; i < h; i++) {
        const w = i < 4 ? 3 : (i < h * 0.3 ? 2 : 1);
        p.r(tx - w - 1, ty - i, w * 2 + 3, 1, INK);
        p.r(tx - w, ty - i, w * 2 + 1, 1, i % 7 === 0 ? '#d0d4d0' : '#e8ece8');
        p.p(tx - w, ty - i, '#ffffff');
        p.p(tx + w, ty - i, '#b0b4b0');
      }
      const hx = tx, hy = ty - h;
      disc(p, hx, hy, 3, INK); disc(p, hx, hy, 2, '#d8dcd8');
      const a0 = fo * TAU / 8;
      for (let i = 0; i < 3; i++) {
        const a = a0 + i * TAU / 3, len = Math.round(h * 0.52);
        const px = -Math.sin(a), py = Math.cos(a);
        for (let t = 1; t <= len; t++) {
          const thick = t < 4 ? 2 : (t < len * 0.45 ? 2 : 1);
          const bx = hx + Math.cos(a) * t, by = hy + Math.sin(a) * t;
          for (let k = -thick; k <= thick; k++) p.p(Math.round(bx + px * k * 0.45), Math.round(by + py * k * 0.45), t < 3 ? '#d0d4d0' : '#f4f6f4');
        }
      }
      disc(p, hx, hy, 2, '#c8ccc8'); disc(p, hx, hy, 1, '#889088');
    }
    tur(x - 10, y + 2, 48, fr);
    tur(x + 12, y + 4, 38, (fr + 3) % 8);
    tur(x + 2, y - 6, 32, (fr + 6) % 8);
    // small substation
    box3(p, x + 16, y + 8, 10, 7, 3, '#7a7e82');
    p.r(x + 14, y + 3, 3, 3, '#c4a040');
    win(p, x + 13, y + 4, 2, 2, true);
    rail(p, x + 10, y + 9, 14);
    p.r(x + 20, y + 2, 1, 6, '#6a6e72'); p.r(x + 21, y - 1, 3, 2, '#8a8e92'); // transformer
  }

  function agri(p, x, y, fr) {
    // fence around the plot
    for (let i = -22; i <= 22; i += 4) { p.r(x + i, y + 8, 1, 4, '#6a5a40'); p.r(x + i, y + 8, 3, 1, '#8a7a58'); }
    pine(p, x - 22, y - 6, 12, '#246434'); pine(p, x + 22, y - 4, 11, '#2a6a38');
    bush(p, x - 20, y + 6);
    // crop rows first (so they sit under the raised panels)
    const fl = ['#e8c040', '#d05090', '#f0e070', '#68b040', '#e07038'];
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 8; col++) {
        const fx = x - 20 + col * 5 + row, fy = y + 6 - row * 7 + ((col + fr) % 2);
        p.r(fx, fy - 7, 1, 7, '#2e7a30');
        p.p(fx, fy - 8 - ((fr + col) % 2), fl[(col + row) % 5]);
        p.p(fx, fy - 7, fl[(col + row + 1) % 5]);
        p.p(fx + 1, fy - 4, '#5caa48');
        p.p(fx - 1, fy - 3, '#4a9a38');
      }
    }
    // raised panel grid, receding
    const shine = fr % 8;
    for (let row = 3; row >= 0; row--) {
      for (let col = 0; col < 4; col++) {
        const px = x - 18 + col * 10 - row * 3, py = y - 4 - row * 7;
        // taller posts so panels sit clearly above the crop rows
        p.r(px + 2, py, 1, 8, '#5a6058'); p.r(px + 8, py, 1, 8, '#5a6058');
        p.r(px + 2, py + 7, 2, 1, '#4a5048'); p.r(px + 8, py + 7, 2, 1, '#4a5048');
        // tilted panel
        p.r(px, py - 6, 12, 7, INK);
        p.r(px + 1, py - 5, 10, 5, '#1e4a88');
        p.r(px + 1, py - 5, 10, 1, shine === (col + row * 2) % 8 ? '#c8e0ff' : '#3a78c0');
        p.r(px + 1, py - 4, 10, 1, '#2a62a8');
        // cell grid
        p.r(px + 1, py - 3, 10, 1, '#163868'); p.r(px + 4, py - 5, 1, 5, '#163868'); p.r(px + 7, py - 5, 1, 5, '#163868');
        p.p(px + 2, py - 4, '#8ab8e8');
      }
    }
    // front crop strip — sits in front of the shed so the rows stay readable
    for (let col = 0; col < 9; col++) {
      const fx = x - 20 + col * 5, fy = y + 9 + ((col + fr) % 2);
      p.r(fx, fy - 6, 1, 6, '#2e7a30');
      p.p(fx, fy - 7, '#e8c040');
      p.p(fx, fy - 8, '#f0e878');
      p.p(fx + 1, fy - 4, '#68b040');
    }
    // control shed
    box3(p, x - 6, y + 8, 12, 8, 4, '#d0d6d0');
    win(p, x - 9, y + 4, 3, 3, true); win(p, x - 4, y + 4, 3, 3, fr % 3 !== 1);
    p.r(x - 8, y - 1, 8, 2, '#6aaa70'); // green roof
    p.r(x - 2, y + 8, 3, 4, '#4a5048'); // door
  }

  function fusion(p, x, y, fr) {
    // paved platform
    fillHex(p, x, y + 1, 16, 7, '#8a929c');
    fillHex(p, x - 1, y, 13, 5, '#9aa2ac');
    for (let i = 0; i < 12; i++) p.p(x - 10 + (i * 3) % 20, y + 2 + (i % 3), '#7a828c');
    rail(p, x - 16, y + 8, 14); rail(p, x + 4, y + 8, 14);
    pine(p, x - 22, y + 2, 13, '#2a6a38'); pine(p, x + 22, y + 4, 12, '#246434');
    bush(p, x - 18, y + 8);
    // side cooling tanks
    function tank(tx, ty, h) {
      cyl(p, tx, ty, 7, h, '#c8d0da');
      p.r(tx - 5, ty - h + 4, 10, 1, '#8aa0b8');
      p.r(tx - 5, ty - 8, 10, 1, '#8aa0b8');
      win(p, tx - 2, ty - h + 8, 3, 3, true);
      win(p, tx - 2, ty - 10, 3, 3, fr % 4 !== 2);
      ellip(p, tx, ty - h, 7, 3, '#d8e0ea');
      p.r(tx - 1, ty - h - 4, 2, 4, '#9aacbc'); // vent
    }
    tank(x - 22, y + 2, 30);
    tank(x + 22, y + 4, 26);
    // arched pipes tank-to-dome
    p.r(x - 22, y - 30, 2, 8, '#9aacbc'); p.r(x - 22, y - 32, 20, 2, '#9aacbc'); p.r(x - 4, y - 32, 2, 8, '#9aacbc');
    p.r(x + 20, y - 26, 2, 6, '#9aacbc'); p.r(x + 2, y - 30, 20, 2, '#8aa0b4');
    p.r(x - 22, y - 33, 20, 1, '#c8d8e8');
    // central dome
    ellip(p, x, y - 22, 16, 14, INK);
    ellip(p, x, y - 22, 15, 13, '#c4ced8');
    ellip(p, x - 3, y - 24, 10, 9, '#d8e2ec');
    ellip(p, x + 6, y - 18, 6, 8, '#98a4b0');
    // coil rings
    ellip(p, x, y - 18, 12, 5, '#5a9cc8');
    for (let a = 0; a < 14; a++) {
      const an = a * TAU / 14 + fr * 0.15;
      p.p(x + Math.round(Math.cos(an) * 12), y - 18 + Math.round(Math.sin(an) * 5), '#8ad4f0');
    }
    ellip(p, x, y - 14, 9, 4, '#3a78a8');
    // glowing core + column
    const pulse = [5, 6, 7, 8, 7, 6, 5, 6][fr % 8];
    const cols = ['#1aa8d0', '#3ce8ff', '#e8ffff', '#7af0ff', '#3ce8ff', '#1aa8d0', '#0a88b8', '#3ce8ff'];
    ellip(p, x, y - 20, 8, 10, '#0a3048');
    disc(p, x, y - 20, pulse + 2, '#0a4060');
    disc(p, x, y - 20, pulse, cols[fr % 8]);
    p.r(x, y - 20 - pulse, 1, pulse * 2 + 4, '#e8ffff');
    disc(p, x, y - 20, 2, '#ffffff');
    p.p(x - 2, y - 22, '#ffffff');
    // base ring + lights
    ellip(p, x, y - 8, 14, 4, '#8a96a4');
    box3(p, x, y - 2, 18, 6, 5, '#b0bac4');
    for (let i = 0; i < 4; i++) p.p(x - 6 + i * 4, y - 6, (fr + i) % 4 ? '#3ce8ff' : '#146888');
    p.r(x - 3, y, 6, 4, '#4a5460'); // door
  }

  function arco(p, x, y, fr) {
    pine(p, x - 22, y + 2, 14, '#246434'); pine(p, x + 22, y + 4, 12, '#2a6a38');
    bush(p, x - 16, y + 8); bush(p, x + 16, y + 8);
    // path to door
    p.r(x - 3, y + 2, 6, 8, '#c8b878'); p.r(x - 2, y + 3, 4, 6, '#d8c888');
    const levels = [
      { w: 36, h: 10, d: 8 },
      { w: 30, h: 10, d: 7 },
      { w: 24, h: 10, d: 6 },
      { w: 20, h: 10, d: 5 },
      { w: 16, h: 10, d: 4 },
      { w: 12, h: 9, d: 4 },
    ];
    let yb = y;
    levels.forEach((L, li) => {
      const fill = li % 2 ? '#4e8a6c' : '#3f7a60';
      box3(p, x, yb, L.w, L.h, L.d, fill);
      // terrace garden on the lid
      p.r(x - L.w / 2 + 1, yb - L.h - L.d - 1, L.w + L.d - 2, 3, '#2e7a38');
      p.r(x - L.w / 2 + 2, yb - L.h - L.d - 2, L.w - 2, 1, '#5cbc50');
      for (let i = 0; i < 6; i++) p.p(x - L.w / 2 + 4 + i * (L.w / 7), yb - L.h - L.d - 3, '#3d8a3c');
      // hanging greenery
      for (let i = 0; i < 6; i++) {
        const hx = x - L.w / 2 + 3 + i * (L.w / 6);
        const drop = 4 + ((i + fr + li) % 4);
        p.r(hx, yb - L.h + 1, 1, drop, '#3d8a3c');
        p.r(hx - 1, yb - L.h + drop - 1, 2, 2, '#5cbc50');
      }
      // little roof trees / bushes
      if (li < 5) { p.p(x - L.w / 4, yb - L.h - L.d - 2, '#3d8a3c'); p.p(x + L.w / 5, yb - L.h - L.d - 3, '#4aa048'); }
      // windows
      const nw = Math.max(2, (L.w / 5) | 0);
      for (let w = 0; w < nw; w++) {
        const on = ((fr + li + w * 2) % 5) !== 2;
        win(p, x - L.w / 2 + 5 + w * 5, yb - L.h + 3, 3, 3, on);
      }
      yb -= L.h + 1;
    });
    // crown garden
    disc(p, x, yb - 8, 5, '#2e7a38'); disc(p, x - 2, yb - 10, 3, '#4aa048'); pine(p, x + 1, yb - 6, 8, '#2a6a38');
    p.r(x - 3, y - 4, 6, 6, '#2a4030'); // door
    p.p(x - 1, y - 2, '#f0c25a');
  }

  function generic(p, x, y, axis, era, variant, fr) {
    const c = FAM[axis] || '#888';
    if (axis === 'home') {
      box3(p, x, y, 22, 14, 5, era === 0 ? '#b07858' : '#d08060');
      p.r(x - 12, y - 22, 24, 9, INK);
      for (let i = 0; i < 24; i++) p.p(x - 12 + i, y - 14 - Math.round((1 - Math.abs(i - 12) / 12) * 8), '#8a4030');
      win(p, x - 6, y - 10, 4, 4, true); win(p, x + 2, y - 10, 4, 4, fr % 2 === 0);
      if (era === 0) { p.r(x + 6, y - 26, 4, 8, '#6a5048'); if (fr % 2) disc(p, x + 8, y - 28, 3, '#6e6860'); }
    } else if (axis === 'wild') {
      pine(p, x - 8, y, 16, '#2f7d45'); pine(p, x + 6, y + 2, 13, '#3f9a48'); pine(p, x + 1, y - 3, 11, '#5ab055');
    } else if (axis === 'water') {
      box3(p, x, y, 12, 20, 4, '#7aa0b8'); ellip(p, x, y - 22, 8, 4, '#6a98b0');
    } else if (axis === 'food') {
      box3(p, x, y, 24, 12, 5, '#c8a060'); p.r(x - 13, y - 20, 26, 8, '#8a5030');
    } else if (axis === 'waste') {
      p.r(x - 14, y - 10, 28, 10, INK); p.r(x - 13, y - 9, 26, 8, era === 0 ? '#5a5840' : '#68a070');
    } else if (axis === 'make') {
      box3(p, x, y, 22, 14, 5, '#8a80a0'); p.r(x + 6, y - 26, 5, 14, '#5a5068');
    } else if (axis === 'move') {
      box3(p, x - 4, y, 16, 10, 4, '#8a9098'); p.r(x + 6, y - 4, 12, 5, '#c04038');
    } else {
      box3(p, x, y, 20, 12, 4, c);
    }
  }

  function paintBuilding(p, axis, era, variant, fr) {
    const k = era === 3 ? (variant || 'leaf') : era;
    if (axis === 'power' && k === 0) coal(p, HX, HY, fr % 8);
    else if (axis === 'power' && k === 2) wind(p, HX, HY, fr % 8);
    else if (axis === 'power' && k === 'leaf') agri(p, HX, HY, fr % 8);
    else if (axis === 'power' && k === 'star') fusion(p, HX, HY, fr % 8);
    else if (axis === 'home' && k === 'star') arco(p, HX, HY, fr % 8);
    else generic(p, HX, HY, axis, era, variant, fr);
  }

  const cache = new Map();
  function makeCan(w, h) {
    const c = (typeof document !== 'undefined') ? document.createElement('canvas') : { width: w, height: h, getContext: () => ({ fillRect() {}, fillStyle: '' }) };
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    if (ctx) ctx.imageSmoothingEnabled = false;
    return { c, ctx };
  }
  function sprite(key, draw) {
    let s = cache.get(key);
    if (s) return s;
    const can = makeCan(SW, SH);
    draw(pix(can.ctx), can.ctx);
    cache.set(key, can.c);
    return can.c;
  }
  function blit(g, img, x, y, scale) {
    if (!img || !g) return;
    const prev = g.imageSmoothingEnabled;
    g.imageSmoothingEnabled = false;
    g.drawImage(img, x - HX * scale, y - HY * scale, SW * scale, SH * scale);
    g.imageSmoothingEnabled = prev;
  }

  function tileKey(smog, vivid, seed) { return 't|' + Math.round(smog * 4) + '|' + Math.round(vivid * 3) + '|' + (seed & 7); }
  function drawHex(g, x, y, u, o) {
    o = o || {};
    const smog = o.smog || 0, vivid = o.vivid == null ? 0.7 : o.vivid, seed = o.seed || 0;
    const img = sprite(tileKey(smog, vivid, seed), (p) => drawTile(p, HX, HY, Math.round(smog * 4) / 4, Math.round(vivid * 3) / 3, seed));
    blit(g, img, x, y, u / HS);
  }
  function drawHaze(g, x, y, u, smog) {
    if (!smog || smog < 0.22) return;
    const bucket = Math.round(smog * 5);
    const img = sprite('hz|' + bucket, (p) => {
      const dens = Math.min(0.28, bucket / 5 * 0.32);
      const col = mix('#6a6458', '#3a382e', 0.4);
      const rx = Math.round(HS * Math.sqrt(3) / 2), ry = Math.round(HS * SQ);
      for (let yy = 0; yy < SH; yy++) {
        for (let xx = 0; xx < SW; xx++) {
          const dx = xx - HX, dy = yy - HY;
          const inHex = Math.abs(dy) <= ry + 2 && Math.abs(dx) <= hexHalfW(dy, rx, ry) + 2;
          const above = dy < 0 && dy > -48 && Math.abs(dx) < 18 - dy * 0.12;
          if ((inHex || above) && BAYER[yy & 3][xx & 3] / 16 < dens) p.p(xx, yy, col);
        }
      }
    });
    blit(g, img, x, y, u / HS);
  }
  function drawBuilding(g, axis, era, variant, x, y, u, t, o) {
    o = o || {};
    const k = era === 3 ? (variant || 'leaf') : era;
    const fr = frameOf(t, 8);
    const img = sprite('b|' + axis + '|' + k + '|' + fr, (p) => paintBuilding(p, axis, era, variant, fr));
    blit(g, img, x, y, (u || 19) / HS);
    if (o.smog) drawHaze(g, x, y, u || 19, o.smog);
    return [];
  }
  function drawStack(g, axis, era, variant, x, y, u, t, o) {
    drawHex(g, x, y, u, o);
    if (axis) drawBuilding(g, axis, era, variant, x, y, u, t, o);
  }

  let skyCan = null;
  function sky(g, W, H, t, smog, vivid, opts) {
    opts = opts || {};
    if (opts.navy) { g.fillStyle = '#0b1220'; g.fillRect(0, 0, W, H); return; }
    const sw = Math.max(160, (W / 4) | 0), sh = Math.max(100, (H / 4) | 0);
    if (!skyCan || skyCan.c.width !== sw || skyCan.c.height !== sh) skyCan = makeCan(sw, sh);
    const ctx = skyCan.ctx, p = pix(ctx);
    const clean = 1 - smog;
    const top = mix('#2a2830', '#3a88c8', clean * 0.95);
    const bot = mix('#5a4a38', '#b8e0f8', clean);
    ctx.fillStyle = top; ctx.fillRect(0, 0, sw, sh);
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = mix(top, bot, i / 9);
      ctx.fillRect(0, ((sh * 0.15) + i * sh * 0.07) | 0, sw, (sh * 0.08) | 0);
    }
    const sx = (sw * 0.22) | 0, sy = (sh * 0.18 + smog * 8) | 0, sr = 7 + (clean * 3) | 0;
    disc(p, sx, sy, sr + 2, mix('#c07040', '#ffe08a', clean));
    disc(p, sx, sy, sr, mix('#e09050', '#fff4b0', clean));
    for (let i = 0; i < 5; i++) {
      const cx = ((i * 47 + t * (4 + i)) % (sw + 40) - 20) | 0, cy = (8 + (i % 3) * 7) | 0;
      const col = mix('#6a6058', '#f0f4f8', clean);
      p.r(cx, cy, 22, 6, col); p.r(cx + 6, cy - 4, 14, 5, col);
    }
    const h1 = mix('#5a5840', '#5a9a70', clean), h2 = mix('#4a4834', '#4a8a50', clean);
    for (let x = 0; x < sw; x++) {
      const y1 = (sh * 0.42 + Math.sin(x * 0.06) * 5) | 0;
      p.r(x, y1, 1, sh - y1, h1);
      const y2 = (sh * 0.52 + Math.sin(x * 0.09 + 2) * 6) | 0;
      p.r(x, y2, 1, sh - y2, h2);
    }
    if (smog > 0.12) {
      for (let y = 0; y < sh * 0.5; y++) for (let x = 0; x < sw; x++) {
        if (BAYER[y & 3][x & 3] / 16 < smog * 0.35) p.p(x, y, '#4a4638');
      }
    }
    const prev = g.imageSmoothingEnabled;
    g.imageSmoothingEnabled = false;
    g.drawImage(skyCan.c, 0, 0, W, H);
    g.imageSmoothingEnabled = prev;
  }

  function localSmog(globalSmog, emits) { return Math.min(1, globalSmog * 0.28 + (emits ? 0.32 : 0)); }

  const PIXEL = {
    SQ, FAM, FPS, HS, SW, SH, HX, HY, frameOf, drawHex, drawBuilding, drawStack, drawHaze, sky, localSmog,
    cacheSize: () => cache.size, clearCache: () => cache.clear(),
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = PIXEL;
  else root.PIXEL = PIXEL;
})(typeof window !== 'undefined' ? window : globalThis);
