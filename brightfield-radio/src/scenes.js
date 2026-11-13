// Procedural animated scenes for each radio track. Soft Brightfield palette.
(function (root) {
  'use strict';

  function lerp(a, b, t) { return a + (b - a) * t; }
  function hex(h, a) {
    const n = parseInt(h.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + (a == null ? 1 : a) + ')';
  }
  function seeded(n) {
    let x = (n * 1103515245 + 12345) & 0x7fffffff;
    return function () { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
  }

  const drops = [];
  const flies = [];
  const motes = [];
  const orbs = [];
  const bokehs = [];
  let inited = '';

  function init(kind, w, h) {
    if (inited === kind + w + 'x' + h) return;
    inited = kind + w + 'x' + h;
    const rnd = seeded(kind === 'night' ? 19 : kind === 'greenhouse' ? 7 : kind === 'dawn' ? 31 : 11);
    drops.length = 0; flies.length = 0; motes.length = 0;
    for (let i = 0; i < 42; i++) {
      drops.push({
        x: rnd() * w,
        y: rnd() * h * 0.85,
        r: 2 + rnd() * 5.5,
        stuck: rnd() < 0.55,
        vy: 30 + rnd() * 90,
        wob: rnd() * Math.PI * 2,
      });
    }
    for (let i = 0; i < 16; i++) {
      flies.push({
        x: rnd() * w,
        y: h * 0.35 + rnd() * h * 0.5,
        p: rnd() * Math.PI * 2,
        q: rnd() * Math.PI * 2,
        s: 0.4 + rnd() * 0.8,
        blink: rnd() * 8,
        hue: rnd() < 0.2 ? '#f6f1c2' : '#e7f39a',
      });
    }
    for (let i = 0; i < 28; i++) {
      motes.push({
        x: rnd() * w,
        y: rnd() * h,
        r: 1 + rnd() * 2.4,
        v: 6 + rnd() * 16,
        a: 0.15 + rnd() * 0.4,
        ph: rnd() * 6.28,
      });
    }
    orbs.length = 0; bokehs.length = 0;
    for (let i = 0; i < 22; i++) {
      orbs.push({
        x: rnd() * w,
        y: rnd() * h,
        r: 6 + rnd() * 22,
        v: 8 + rnd() * 28,
        drift: rnd() * 6.28,
        tint: rnd() < 0.45 ? '#7fe3ff' : (rnd() < 0.5 ? '#b6f38c' : '#ffffff'),
      });
    }
    for (let i = 0; i < 16; i++) {
      bokehs.push({
        x: rnd() * w,
        y: rnd() * h,
        r: 10 + rnd() * 36,
        a: 0.08 + rnd() * 0.14,
        ph: rnd() * 6.28,
        tint: rnd() < 0.5 ? '#9adfff' : '#d4f7a8',
      });
    }
  }

  function sky(ctx, w, h, c1, c2, c3) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, c1);
    g.addColorStop(0.55, c2);
    g.addColorStop(1, c3);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  function hill(ctx, w, h, y, amp, color, t, phase) {
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) {
      const yy = y + Math.sin(x * 0.008 + phase) * amp + Math.sin(x * 0.02 + t * 0.05 + phase) * amp * 0.15;
      ctx.lineTo(x, yy);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  function sun(ctx, x, y, r, color, glow) {
    const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 3.2);
    g.addColorStop(0, hex(color, 0.95));
    g.addColorStop(0.18, hex(color, 0.55));
    g.addColorStop(0.45, hex(glow, 0.16));
    g.addColorStop(1, hex(glow, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = hex(color, 0.95);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawVictory(ctx, w, h, t, variant) {
    const warm = variant === 'star';
    sky(ctx, w, h, warm ? '#9ad4ef' : '#b7dce8', warm ? '#ffe3a6' : '#e7f0c9', warm ? '#f3c27a' : '#d4e39a');
    sun(ctx, w * (warm ? 0.74 : 0.7), h * (warm ? 0.28 : 0.32), warm ? 42 : 36, warm ? '#fff4c8' : '#ffe9a0', warm ? '#ffd18a' : '#f0e080');
    hill(ctx, w, h, h * 0.62, 18, hex('#8fbf7a', 0.95), t, 0.2);
    hill(ctx, w, h, h * 0.72, 22, hex('#6ea36a', 0.96), t, 1.4);
    hill(ctx, w, h, h * 0.84, 14, hex('#4f8a5c', 0.98), t, 2.1);
    ctx.fillStyle = hex('#f7f1a8', 0.85);
    for (let i = 0; i < 40; i++) {
      const rnd = seeded(200 + i)();
      const rnd2 = seeded(800 + i)();
      const x = (i * 97.3 % w);
      const y = h * 0.7 + rnd * h * 0.25;
      ctx.beginPath();
      ctx.arc(x, y, 1.6 + rnd2 * 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const m of motes) {
      const y = (m.y - (t * m.v) % (h + 40) + h + 40) % (h + 40) - 20;
      const x = m.x + Math.sin(t * 0.4 + m.ph) * 18;
      ctx.fillStyle = hex(warm ? '#fff3c4' : '#f5f0c2', m.a * (0.6 + 0.4 * Math.sin(t + m.ph)));
      ctx.beginPath();
      ctx.arc(x, y, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function plantBlob(ctx, x, y, s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, s * 0.8, s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x - s * 0.55, y + s * 0.1, s * 0.5, s * 0.7, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + s * 0.5, y - s * 0.15, s * 0.45, s * 0.65, 0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawGreenhouse(ctx, w, h, t) {
    sky(ctx, w, h, '#1b3a2c', '#2d5a3c', '#163326');
    plantBlob(ctx, w * 0.22, h * 0.62, 90, '#2f6a3e');
    plantBlob(ctx, w * 0.48, h * 0.55, 120, '#3a7c48');
    plantBlob(ctx, w * 0.78, h * 0.64, 100, '#2a6238');
    plantBlob(ctx, w * 0.62, h * 0.72, 70, '#4a8f55');
    // hanging ferns
    ctx.strokeStyle = hex('#7dcc7a', 0.55);
    ctx.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      const x = w * (0.12 + i * 0.12);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      for (let k = 0; k < 8; k++) {
        ctx.quadraticCurveTo(x + Math.sin(t * 0.4 + i) * 6, k * 14, x + Math.sin(i + k) * 10, (k + 1) * 12);
      }
      ctx.stroke();
    }
    // window panes
    ctx.fillStyle = hex('#d7f3e4', 0.07);
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = hex('#14261c', 0.72);
    ctx.lineWidth = Math.max(10, w * 0.018);
    const cols = 3, rows = 2;
    const mw = w / cols, mh = h / rows;
    for (let c = 0; c <= cols; c++) {
      ctx.beginPath(); ctx.moveTo(c * mw, 0); ctx.lineTo(c * mw, h); ctx.stroke();
    }
    for (let r = 0; r <= rows; r++) {
      ctx.beginPath(); ctx.moveTo(0, r * mh); ctx.lineTo(w, r * mh); ctx.stroke();
    }
    // rain streaks
    ctx.strokeStyle = hex('#cfeee0', 0.18);
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 50; i++) {
      const x = (i * 73 + t * 18) % (w + 20) - 10;
      const y = (i * 51 + t * (90 + (i % 7) * 20)) % (h + 30) - 15;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 2, y + 16);
      ctx.stroke();
    }
    for (const d of drops) {
      let x = d.x, y = d.y;
      if (!d.stuck) {
        y = (d.y + t * d.vy) % (h + 20) - 10;
        x = d.x + Math.sin(t * 0.8 + d.wob) * 6;
      }
      ctx.fillStyle = hex('#e8fff4', 0.55);
      ctx.beginPath();
      ctx.ellipse(x, y, d.r * 0.7, d.r, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = hex('#ffffff', 0.7);
      ctx.beginPath();
      ctx.ellipse(x - d.r * 0.22, y - d.r * 0.28, d.r * 0.22, d.r * 0.28, -0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawNight(ctx, w, h, t) {
    sky(ctx, w, h, '#08101c', '#13243a', '#1c3344');
    // moon
    sun(ctx, w * 0.82, h * 0.18, 22, '#f3f0d8', '#c9d4ff');
    // stars
    for (let i = 0; i < 70; i++) {
      const r = seeded(40 + i);
      const x = r() * w, y = r() * h * 0.55, tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * (0.6 + r()) + i));
      ctx.fillStyle = hex('#eef4ff', 0.15 + tw * 0.6);
      ctx.beginPath();
      ctx.arc(x, y, 0.7 + r() * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    hill(ctx, w, h, h * 0.7, 16, hex('#102318', 1), t, 0.6);
    hill(ctx, w, h, h * 0.82, 20, hex('#0b1a12', 1), t, 1.9);
    // flower stems
    ctx.strokeStyle = hex('#1d3a28', 0.9);
    ctx.lineWidth = 2;
    for (let i = 0; i < 18; i++) {
      const x = (i + 0.6) * (w / 18);
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.quadraticCurveTo(x + Math.sin(t * 0.3 + i) * 8, h * 0.88, x + 4, h * 0.76);
      ctx.stroke();
    }
    for (const f of flies) {
      const x = f.x + Math.sin(t * 0.35 * f.s + f.p) * 70 + Math.sin(t * 0.11 + f.q) * 30;
      const y = f.y + Math.cos(t * 0.28 * f.s + f.q) * 36;
      const blink = 0.25 + 0.75 * Math.max(0, Math.sin(t * 1.4 + f.blink));
      const g = ctx.createRadialGradient(x, y, 0, x, y, 16);
      g.addColorStop(0, hex(f.hue, 0.85 * blink));
      g.addColorStop(0.4, hex(f.hue, 0.22 * blink));
      g.addColorStop(1, hex(f.hue, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = hex('#fff7c2', 0.9 * blink);
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawDawn(ctx, w, h, t, progress) {
    const p = Math.max(0, Math.min(1.15, progress == null ? (0.15 + 0.5 + 0.5 * Math.sin(t * 0.03)) : progress));
    const vis = Math.min(1, p);
    const top = vis < 0.4 ? '#080612' : vis < 0.7 ? '#2a1840' : '#6ea7d8';
    const mid = vis < 0.4 ? '#1a0e22' : vis < 0.7 ? '#c45a4a' : '#f3c27a';
    const bot = vis < 0.4 ? '#120c18' : vis < 0.7 ? '#6a3040' : '#f6d9a4';
    sky(ctx, w, h, top, mid, bot);
    const sunY = lerp(h * 0.82, h * 0.32, vis);
    const sunR = lerp(16, 40, vis);
    sun(ctx, w * 0.5, sunY, sunR, vis > 0.6 ? '#fff1c0' : '#ffb070', vis > 0.6 ? '#ffd18a' : '#ff7a4a');
    if (vis > 0.55) {
      ctx.save();
      ctx.globalAlpha = (vis - 0.55) * 1.4;
      ctx.strokeStyle = hex('#ffe7b0', 0.18);
      ctx.lineWidth = 2;
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI + i * 0.22 + Math.sin(t * 0.05) * 0.02;
        ctx.beginPath();
        ctx.moveTo(w * 0.5 + Math.cos(a) * sunR * 1.4, sunY + Math.sin(a) * sunR * 1.4);
        ctx.lineTo(w * 0.5 + Math.cos(a) * w * 0.55, sunY + Math.sin(a) * h * 0.55);
        ctx.stroke();
      }
      ctx.restore();
    }
    // fading stars
    ctx.globalAlpha = Math.max(0, 1 - vis * 1.3);
    for (let i = 0; i < 40; i++) {
      const r = seeded(90 + i);
      ctx.fillStyle = '#eef4ff';
      ctx.beginPath();
      ctx.arc(r() * w, r() * h * 0.5, 1 + r(), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    hill(ctx, w, h, h * 0.78, 18, hex(vis > 0.65 ? '#3d5a48' : '#16141f', 1), t, 0.4);
    hill(ctx, w, h, h * 0.88, 12, hex(vis > 0.65 ? '#2a4033' : '#0d0b14', 1), t, 1.6);
    if (vis > 0.8) {
      ctx.strokeStyle = hex('#fff4c0', 0.12 + 0.08 * Math.sin(t * 0.8));
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(w * 0.5, sunY, sunR * 2.4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }


  function glossyOrb(ctx, x, y, r, color) {
    const g = ctx.createRadialGradient(x - r * 0.32, y - r * 0.38, r * 0.08, x, y + r * 0.1, r);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.18, hex(color, 0.65));
    g.addColorStop(0.62, hex(color, 0.28));
    g.addColorStop(1, hex(color, 0.04));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(x - r * 0.28, y - r * 0.32, r * 0.28, r * 0.16, -0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBokeh(ctx, t) {
    for (const b of bokehs) {
      const x = b.x + Math.sin(t * 0.12 + b.ph) * 18;
      const y = b.y + Math.cos(t * 0.09 + b.ph) * 10;
      ctx.fillStyle = hex(b.tint, b.a);
      ctx.beginPath();
      ctx.arc(x, y, b.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawFlare(ctx, w, h, x, y, t) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const cx = w * 0.5, cy = h * 0.48;
    for (let i = 0; i < 6; i++) {
      const k = 0.25 + i * 0.28;
      const px = x + (cx - x) * k;
      const py = y + (cy - y) * k;
      const r = 8 + i * 7;
      const col = i % 2 ? '#7fe3ff' : '#ffe9a0';
      ctx.fillStyle = hex(col, 0.12 + 0.04 * Math.sin(t + i));
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = hex('#ffffff', 0.18);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x - 90, y); ctx.lineTo(x + 90, y);
    ctx.moveTo(x, y - 50); ctx.lineTo(x, y + 50);
    ctx.stroke();
    ctx.restore();
  }

  function drawCloud(ctx, x, y, s) {
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.beginPath();
    ctx.ellipse(x, y, s, s * 0.55, 0, 0, Math.PI * 2);
    ctx.ellipse(x - s * 0.7, y + s * 0.08, s * 0.7, s * 0.42, 0, 0, Math.PI * 2);
    ctx.ellipse(x + s * 0.65, y + s * 0.1, s * 0.62, s * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function risingOrbs(ctx, w, h, t) {
    for (const o of orbs) {
      const y = (o.y - t * o.v) % (h + 80);
      const yy = y < 0 ? y + h + 80 : y;
      const x = o.x + Math.sin(t * 0.35 + o.drift) * 16;
      glossyOrb(ctx, x, yy - 40, o.r, o.tint);
    }
  }

  function drawAqua(ctx, w, h, t) {
    sky(ctx, w, h, '#8fe8ff', '#5ec7f2', '#9be08a');
    sun(ctx, w * 0.78, h * 0.2, 38, '#fff7c8', '#b8f0ff');
    drawFlare(ctx, w, h, w * 0.78, h * 0.2, t);
    drawCloud(ctx, w * 0.22, h * 0.2, 50);
    drawCloud(ctx, w * 0.48, h * 0.14, 36);
    drawBokeh(ctx, t);
    hill(ctx, w, h, h * 0.7, 16, hex('#7edc6a', 0.95), t, 0.4);
    // water
    const wg = ctx.createLinearGradient(0, h * 0.72, 0, h);
    wg.addColorStop(0, hex('#4ec4e8', 0.55));
    wg.addColorStop(1, hex('#1a7fb0', 0.85));
    ctx.fillStyle = wg;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 10) {
      ctx.lineTo(x, h * 0.74 + Math.sin(x * 0.02 + t * 1.4) * 7 + Math.sin(x * 0.05 + t * 0.7) * 3);
    }
    ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
    risingOrbs(ctx, w, h, t);
  }

  function drawSkyline(ctx, w, h, t) {
    sky(ctx, w, h, '#7ad4ff', '#c8eefc', '#e8f7ff');
    sun(ctx, w * 0.18, h * 0.22, 34, '#fff4c2', '#ffe09a');
    drawFlare(ctx, w, h, w * 0.18, h * 0.22, t);
    drawCloud(ctx, w * 0.55, h * 0.18, 44);
    drawCloud(ctx, w * 0.82, h * 0.26, 32);
    drawBokeh(ctx, t);
    // glass towers
    const towers = [
      [0.12, 0.42, 0.1], [0.26, 0.34, 0.12], [0.42, 0.28, 0.14],
      [0.58, 0.38, 0.11], [0.72, 0.32, 0.13], [0.88, 0.46, 0.1],
    ];
    towers.forEach((tw, i) => {
      const x = w * tw[0], top = h * tw[1], bw = w * tw[2], bh = h - top;
      const g = ctx.createLinearGradient(x, top, x + bw, top + bh);
      g.addColorStop(0, 'rgba(220,250,255,0.55)');
      g.addColorStop(0.45, 'rgba(120,200,230,0.42)');
      g.addColorStop(1, 'rgba(40,110,150,0.55)');
      ctx.fillStyle = g;
      ctx.fillRect(x - bw / 2, top, bw, bh);
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillRect(x - bw / 2, top, bw * 0.28, bh);
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1;
      for (let wy = top + 12; wy < h; wy += 16) {
        ctx.beginPath(); ctx.moveTo(x - bw / 2 + 4, wy); ctx.lineTo(x + bw / 2 - 4, wy); ctx.stroke();
      }
      // roof highlight
      ctx.fillStyle = hex('#b6ff7a', 0.35 + 0.1 * Math.sin(t + i));
      ctx.fillRect(x - bw / 2, top, bw, 6);
    });
    hill(ctx, w, h, h * 0.86, 10, hex('#8fe07a', 0.95), t, 0.8);
    risingOrbs(ctx, w, h, t * 0.45);
  }

  function drawEco(ctx, w, h, t) {
    sky(ctx, w, h, '#6ec8ff', '#bfe9ff', '#dff6c8');
    sun(ctx, w * 0.72, h * 0.24, 40, '#fff6c8', '#c6f08a');
    drawFlare(ctx, w, h, w * 0.72, h * 0.24, t);
    drawCloud(ctx, w * 0.2, h * 0.22, 48);
    drawCloud(ctx, w * 0.4, h * 0.16, 30);
    drawBokeh(ctx, t);
    hill(ctx, w, h, h * 0.58, 22, hex('#8edc6e', 1), t, 0.2);
    hill(ctx, w, h, h * 0.7, 18, hex('#6fc85a', 1), t, 1.3);
    hill(ctx, w, h, h * 0.82, 14, hex('#4ea848', 1), t, 2.0);
    // lake
    ctx.fillStyle = hex('#5ec8e0', 0.55);
    ctx.beginPath();
    ctx.ellipse(w * 0.45, h * 0.84, w * 0.28, h * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = hex('#ffffff', 0.25);
    ctx.beginPath();
    ctx.ellipse(w * 0.4, h * 0.825, w * 0.12, h * 0.015, -0.2, 0, Math.PI * 2);
    ctx.fill();
    risingOrbs(ctx, w, h, t * 0.35);
    // foreground glossy sphere
    glossyOrb(ctx, w * 0.16, h * 0.78, 46, '#7fe3ff');
    glossyOrb(ctx, w * 0.86, h * 0.72, 32, '#c6f56a');
  }

  function draw(ctx, scene, w, h, t, extra) {
    extra = extra || {};
    init(scene, w, h);
    if (scene === 'greenhouse') drawGreenhouse(ctx, w, h, t);
    else if (scene === 'night') drawNight(ctx, w, h, t);
    else if (scene === 'dawn') drawDawn(ctx, w, h, t, extra.progress);
    else if (scene === 'aqua') drawAqua(ctx, w, h, t);
    else if (scene === 'skyline') drawSkyline(ctx, w, h, t);
    else if (scene === 'eco') drawEco(ctx, w, h, t);
    else drawVictory(ctx, w, h, t, extra.variant || 'leaf');
  }

  const api = { draw: draw, init: init };
  root.RADIO_SCENES = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
