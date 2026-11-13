// WAGGLE client: screens, input, rendering, juice. Sim lives in core.js.
(function () {
  'use strict';
  const WG = window.WG, A = window.WGArt, AU = window.WGAudio, Bot = window.WGBot, C = WG.C;
  const TAU = Math.PI * 2;
  const cv = document.getElementById('c'), g = cv.getContext('2d');
  const Q = new URLSearchParams(location.search);
  let VW = 0, VH = 0, DPR = 1;
  const G = { screen: 'title', W: null, diff: 'normal', t: 0, fx: [], hfx: [], keys: {}, ptr: { down: false, x: 0, y: 0, id: null }, cam: { x: 0, y: 40 }, menuI: 2,
    bees: [], bubbleT: 0, bot: null, comb: null, speed: 1, glow: {}, lastRun: null, hint: null, hintT: 0, flash: 0, best: {} };
  try { G.best = JSON.parse(localStorage.getItem('waggle.best') || '{}'); } catch (e) { G.best = {}; }
  try { G.ctrl = Q.get('ctrl') || localStorage.getItem('waggle.ctrl') || 'hold'; } catch (e) { G.ctrl = 'hold'; }
  G.scent = []; G.swipe = null; G.autoRun = null;
  const MENU = [['tut', 'First Flight', 'learn the dance'], ['easy', 'Easy', 'guide line'], ['normal', 'Normal', 'thought bubble'], ['hard', 'Hard', 'from memory'], ['ctrl', 'Controls', '']];
  function toggleCtrl() { G.ctrl = G.ctrl === 'swipe' ? 'hold' : 'swipe'; try { localStorage.setItem('waggle.ctrl', G.ctrl); } catch (e) {} AU.SFX.select(); }
  function choose(k) { if (k === 'ctrl') toggleCtrl(); else start(k); }

  function resize() { DPR = Math.min(2, window.devicePixelRatio || 1); VW = window.innerWidth; VH = window.innerHeight; cv.width = VW * DPR; cv.height = VH * DPR; cv.style.width = VW + 'px'; cv.style.height = VH + 'px'; G.comb = A.buildComb(VW, VH, Math.max(13, Math.min(20, VH / 42))); A.renderCombBase(G.comb, DPR); G.bees = []; }
  window.addEventListener('resize', resize); resize();
  A.buildMeadow(+(Q.get('mseed') || 3));

  // ---------------- game start ----------------
  function start(kind, seed) {
    AU.init();
    const tut = kind === 'tut';
    G.diff = tut ? 'easy' : kind;
    G.W = WG.create({ seed: seed != null ? seed : (Q.get('seed') != null ? +Q.get('seed') : Math.floor(Math.random() * 1e6)), diff: G.diff, tutorial: tut });
    G.screen = 'play'; G.fx = []; G.hfx = []; G.bees = []; G.lastRun = null; G.glow = {};
    G.cam.x = 0; G.cam.y = 40;
    if (tut) showHint('tut0'); else showHint(null);
    AU.setScene('meadow'); AU.SFX.dawn();
  }
  function showHint(h) { G.hint = h; G.hintT = 0; }

  // ---------------- input ----------------
  const KEYMAP = { ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd', Space: 'w', KeyZ: 'w' };
  window.addEventListener('keydown', (e) => {
    AU.init();
    if (KEYMAP[e.code]) { G.keys[KEYMAP[e.code]] = true; e.preventDefault(); }
    if (e.repeat) return;
    if (G.screen === 'title') {
      if (e.code === 'ArrowUp' || e.code === 'KeyW') { G.menuI = (G.menuI + MENU.length - 1) % MENU.length; AU.SFX.select(); }
      if (e.code === 'ArrowDown' || e.code === 'KeyS') { G.menuI = (G.menuI + 1) % MENU.length; AU.SFX.select(); }
      if (e.code === 'Enter' || e.code === 'Space') choose(MENU[G.menuI][0]);
      if ((e.code === 'ArrowLeft' || e.code === 'ArrowRight') && MENU[G.menuI][0] === 'ctrl') toggleCtrl();
      return;
    }
    if (e.code === 'KeyM') AU.mute(!AU.S.muted);
    if (G.screen === 'night' && (e.code === 'Space' || e.code === 'Enter')) toDawn();
    else if ((G.screen === 'end' || G.screen === 'tutEnd') && (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape')) G.screen = 'title';
    else if (G.screen === 'play') {
      if (['Digit1', 'Digit2', 'Digit3'].includes(e.code)) G.pendSel = +e.code.slice(5) - 1;
      if (e.code === 'Escape' || e.code === 'Enter' || e.code === 'KeyE' || e.code === 'KeyX') G.pendExit = true;
      if (e.code === 'KeyP') G.paused = !G.paused;
    }
  });
  window.addEventListener('keyup', (e) => { if (KEYMAP[e.code]) G.keys[KEYMAP[e.code]] = false; });
  cv.addEventListener('pointerdown', (e) => {
    AU.init(); cv.setPointerCapture(e.pointerId);
    const x = e.clientX, y = e.clientY;
    if (G.screen === 'title') { const i = menuHit(x, y); if (i >= 0) { G.menuI = i; choose(MENU[i][0]); } return; }
    if (G.screen === 'night') { toDawn(); return; }
    if (G.screen === 'end' || G.screen === 'tutEnd') { G.screen = 'title'; return; }
    if (G.screen === 'play' && G.W.scout.mode === 'hive') {
      const L = hiveLayout();
      if (Math.hypot(x - L.exit.x, y - L.exit.y) < L.exit.r) { G.pendExit = true; return; }
      for (let i = 0; i < G.W.memory.length; i++) { const m = L.mem[i]; if (Math.hypot(x - m.x, y - m.y) < m.r) { G.pendSel = i; AU.SFX.select(); return; } }
      if (G.ctrl === 'swipe') { if (!G.autoRun) G.swipe = { x0: x, y0: y, x, y }; return; }
    }
    G.ptr.down = true; G.ptr.x = x; G.ptr.y = y; G.ptr.id = e.pointerId;
  });
  cv.addEventListener('pointermove', (e) => { G.ptr.x = e.clientX; G.ptr.y = e.clientY; if (G.swipe) { G.swipe.x = e.clientX; G.swipe.y = e.clientY; } if (G.screen === 'title') { const i = menuHit(e.clientX, e.clientY); if (i >= 0 && i !== G.menuI) { G.menuI = i; } } });
  const up = () => { G.ptr.down = false; if (G.swipe) { const sw = swipeRun(G.swipe); G.swipe = null; if (sw) G.autoRun = sw; else AU.SFX.runShort(); } };
  // one swipe = one waggle run: direction of the swipe = run direction, length of the swipe = how far the bee walks (so: how many buzzes)
  function buzzPx() { return C.PULSE_SEC * C.WAGGLE_SPEED * hiveLayout().s; }
  function swipeRun(sw) {
    const dx = sw.x - sw.x0, dy = sw.y - sw.y0, len = Math.min(Math.hypot(dx, dy), 16 * buzzPx());
    const frames = Math.round(len / buzzPx() * C.PULSE_SEC * 60);
    if (frames < C.MIN_RUN * 60 + 2) return null;
    return { heading: WG.bearing(dx, dy), frames };
  }
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);

  function playerInput() {
    const W = G.W, s = W.scout, k = G.keys, inp = {};
    if (G.pendExit) { inp.exit = true; G.pendExit = false; }
    if (G.pendSel != null) { inp.sel = G.pendSel; G.pendSel = null; }
    if (s.mode === 'fly') {
      let ax = (k.r ? 1 : 0) - (k.l ? 1 : 0), ay = (k.d ? 1 : 0) - (k.u ? 1 : 0);
      if (G.ptr.down) { const sp = worldToScreen(s.x, s.y), dx = G.ptr.x - sp.x, dy = G.ptr.y - sp.y, m = Math.hypot(dx, dy); if (m > 12) { const f = Math.min(1, m / 90); ax = dx / m * f; ay = dy / m * f; } }
      inp.ax = ax; inp.ay = ay;
    } else {
      const L = hiveLayout(), d = W.dance;
      if (G.autoRun) { if (d.loop > 0) return inp; inp.heading = G.autoRun.heading; if (G.autoRun.frames-- > 0) inp.hold = true; else G.autoRun = null; return inp; }
      if (G.ptr.down && G.ctrl !== 'swipe') {
        const bx = L.cx + d.x * L.s, by = L.cy + d.y * L.s, dx = G.ptr.x - bx, dy = G.ptr.y - by;
        if (Math.hypot(dx, dy) > 18) inp.heading = WG.bearing(dx, dy);
        inp.hold = true;
      } else {
        inp.turn = (k.r ? 1 : 0) - (k.l ? 1 : 0);
        inp.hold = !!(k.w || k.u);
      }
    }
    return inp;
  }

  function toDawn() { if (G.W.state !== 'night') return; WG.nextDay(G.W); G.screen = 'play'; G.lastRun = null; AU.setScene('meadow'); AU.SFX.dawn(); }

  // ---------------- simulation tick ----------------
  function tick() {
    const W = G.W; if (!W || G.screen !== 'play' || G.paused) return;
    const inp = G.bot ? G.bot.input(W) : playerInput();
    const wasHive = W.scout.mode === 'hive';
    WG.step(W, inp);
    const d = W.dance;
    if (W.scout.mode === 'hive' && d.run) AU.startBuzz(); else AU.stopBuzz();
    for (const e of W.events) onEvent(e);
    W.events.length = 0;
    if (wasHive !== (W.scout.mode === 'hive')) AU.setScene(W.scout.mode === 'hive' ? 'hive' : 'meadow');
    if (W.state === 'night') { G.screen = 'night'; G.nightT = 0; AU.setScene('night'); AU.stopBuzz(); if (G.bot && Q.get('autonight') !== '0') { G.autoNight = 90; } }
    if (W.state === 'end') { G.screen = 'end'; G.nightT = 0; AU.setScene('night'); AU.stopBuzz(); const st = WG.stars(W), b = G.best[G.diff] || 0; if (!G.bot && st > b) { G.best[G.diff] = st; try { localStorage.setItem('waggle.best', JSON.stringify(G.best)); } catch (e) {} } if (st) AU.SFX.win(); }
    if (W.state === 'tutEnd') { G.screen = 'tutEnd'; G.nightT = 0; AU.SFX.win(); }
    stepScent(W);
    G.hintT++;
  }
  function hexRgb(h) { const n = parseInt(h.slice(1), 16); return `${n >> 16 & 255},${n >> 8 & 255},${n & 255}`; }
  function stepScent(W) {
    if (W.scout.mode === 'fly') {
      const w = WG.fromBearing(W.wind || 0, 1), z = zoom(), hw = VW / 2 / z + 500, hh = VH / 2 / z + 500;
      for (const p of W.patches) {
        if (p.seen || !WG.blooming(W, p) || Math.abs(p.x - G.cam.x) > hw || Math.abs(p.y - G.cam.y) > hh) continue;
        if ((W.frame + p.id) % 6) continue;
        const a = Math.random() * TAU, rr = Math.random() * p.r * 0.7;
        G.scent.push({ x: p.x + Math.cos(a) * rr, y: p.y + Math.sin(a) * rr, vx: w.x * 0.75 + (Math.random() - 0.5) * 0.25, vy: w.y * 0.75 + (Math.random() - 0.5) * 0.25, t: 0, life: Math.round(C.SCENT_LEN / 0.75), c: hexRgb(WG.SPECIES[p.species][1]), pid: p.id });
      }
      const sc = WG.scentAt(W, W.scout.x, W.scout.y), inP = sc ? sc.p.id : null;
      if (inP && inP !== G.lastPlume) AU.SFX.sniff ? AU.SFX.sniff() : AU.SFX.fFound();
      G.lastPlume = inP;
    }
    for (const sc of G.scent) { sc.t++; sc.x += sc.vx + Math.sin((sc.t + sc.pid * 50) * 0.03) * 0.25; sc.y += sc.vy + Math.cos((sc.t + sc.pid * 50) * 0.027) * 0.25; }
    G.scent = G.scent.filter((sc) => sc.t < sc.life && W.patches.some((p) => p.id === sc.pid && !p.seen));
  }

  function onEvent(e) {
    const W = G.W, S = AU.SFX;
    switch (e.type) {
      case 'found': S.found(e.buzzes); G.fx.push({ k: 'ring', x: e.x, y: e.y, t: 0, life: 60 }); for (let i = 0; i < 16; i++) G.fx.push({ k: 'spark', x: e.x, y: e.y, vx: Math.cos(i / 16 * TAU) * 2.5, vy: Math.sin(i / 16 * TAU) * 2.5, t: 0, life: 40 });
        if (W.tutorial) showHint('tutHome'); break;
      case 'buzz': S.buzz(e.n); G.hfx.push({ k: 'tick', t: 0, life: 18, n: e.n }); break;
      case 'run': S.run(e.recruits, e.combo); if (e.combo) G.hfx.push({ k: 'combo', t: 0, life: 40, n: e.combo }); G.lastRun = Object.assign({ shown: 0 }, e); G.bubbleT = 0; departBees(e.recruits); if (e.rain) G.hfx.push({ k: 'rainNo', t: 0, life: 70 }); break;
      case 'runShort': S.runShort(); break;
      case 'deposit': S.deposit(e.q); arriveBee(); break;
      case 'fFound': S.fFound(); G.fx.push({ k: 'spark', x: e.x, y: e.y, vx: 0, vy: -1, t: 0, life: 30 }); break;
      case 'fMiss': S.fMiss(); G.fx.push({ k: 'q', x: e.x, y: e.y, t: 0, life: 90 }); break;
      case 'stung': S.stung(); G.flash = 12; for (let i = 0; i < 10; i++) G.fx.push({ k: 'star', x: e.x, y: e.y, vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 6, t: 0, life: 35 }); break;
      case 'waspAlert': S.waspAlert(); G.fx.push({ k: 'bang', x: e.x, y: e.y, t: 0, life: 40 }); break;
      case 'scared': S.scared(); break;
      case 'reveal': S.fFound(); G.fx.push({ k: 'ring', x: e.x, y: e.y, t: 0, life: 60 }); for (let i = 0; i < 10; i++) G.fx.push({ k: 'spark', x: e.x, y: e.y, vx: Math.cos(i / 10 * TAU) * 2, vy: Math.sin(i / 10 * TAU) * 2, t: 0, life: 40 }); break;
      case 'enter': S.enter(); if (W.tutorial) showHint(W.tutStep === 0 ? 'tutDance0' : 'tutDance1'); break;
      case 'exit': S.exit(); break;
      case 'rain': AU.setRain(true); break;
      case 'rainEnd': AU.setRain(false); break;
      case 'night': S.night(); break;
      case 'tutDone': S.win(); if (e.step === 0) showHint('tutGood'); break;
    }
  }

  // ---------------- hive bees (decorative swarm reflecting idle foragers) ----------------
  function hiveLayout() {
    const s = Math.max(1.1, Math.min(1.7, VH / 470));
    const mem = [0, 1, 2].map((i) => ({ x: 46 + i * 92, y: 54, r: 38 }));
    return { cx: VW / 2, cy: VH * 0.52, s, exit: { x: VW / 2, y: VH - 8, r: 70 }, mem, bub: { x: VW - 130, y: 130, r: 110 } };
  }
  function syncBees() {
    const W = G.W, idle = W.foragers.filter((f) => f.state === 'idle').length, want = 22 + idle;
    while (G.bees.length < want) G.bees.push(newBee());
    let extra = G.bees.filter((b) => !b.leave).length - want;
    for (const b of G.bees) { if (extra <= 0) break; if (!b.leave && !b.ring) { b.leave = true; extra--; } }
  }
  function newBee(atExit) { const r = Math.random; return { x: atExit ? VW / 2 : r() * VW, y: atExit ? VH + 10 : VH * 0.2 + r() * VH * 0.75, h: r() * 360, tx: r() * VW, ty: r() * VH, sp: 0.4 + r() * 0.5, ph: r() * 10, ring: false, leave: false, arrive: !!atExit, cell: null }; }
  function departBees(k) {
    const ring = G.bees.filter((b) => b.ring && !b.leave);
    for (let i = 0; i < k; i++) { const b = ring[i] || G.bees.find((q) => !q.leave); if (b) { b.leave = true; b.fast = true; b.ring = false; } }
  }
  function arriveBee() { if (G.W.scout.mode !== 'hive') return; const b = newBee(true); const hc = Math.floor(G.W.honey / cellHoney()); const c = G.comb.order[Math.max(0, hc - 1 - Math.floor(Math.random() * 3))]; if (c) { b.tx = c.x; b.ty = c.y; b.cell = c.rank; } b.sp = 3; G.bees.push(b); }
  const cellHoney = () => G.W.target / 120;
  function stepBees() {
    const W = G.W, L = hiveLayout(), d = W.dance, bx = L.cx + d.x * L.s, by = L.cy + d.y * L.s;
    const dancing = !!d.run || d.loop > 0 || (G.lastRun && W.t - G.lastRun.t < 60);
    syncBees();
    // choose ring followers: nearest non-leaving bees
    let ringN = 0;
    if (dancing) { const cand = G.bees.filter((b) => !b.leave && !b.arrive).sort((a, b2) => Math.hypot(a.x - bx, a.y - by) - Math.hypot(b2.x - bx, b2.y - by)); ringN = 8 + 3 * (d.combo || 0); cand.forEach((b, i) => { b.ring = i < ringN; }); }
    else for (const b of G.bees) b.ring = false;
    let ri = 0;
    for (const b of G.bees) {
      let tx = b.tx, ty = b.ty, sp = b.sp;
      if (b.leave) { tx = L.exit.x + (b.ph % 1 - 0.5) * 40; ty = VH + 40; sp = b.fast ? 5 : 1.5; }
      else if (b.arrive) { sp = 3; if (Math.hypot(b.x - tx, b.y - ty) < 6) { b.arrive = false; if (b.cell != null) G.glow[b.cell] = 1; } }
      else if (b.ring) { const a = ri++ / ringN * TAU + G.t * 0.004, rr = 1 + (d.combo || 0) * 0.12; tx = bx + Math.cos(a) * 62 * rr; ty = by + Math.sin(a) * 54 * rr; sp = 2.2; }
      else if (Math.hypot(b.x - tx, b.y - ty) < 10 || Math.random() < 0.004) { b.tx = Math.random() * VW; b.ty = VH * 0.15 + Math.random() * VH * 0.8; }
      const dx = tx - b.x, dy = ty - b.y, m = Math.hypot(dx, dy);
      if (m > 1) { b.x += dx / m * Math.min(m, sp); b.y += dy / m * Math.min(m, sp); const hh = WG.bearing(dx, dy); b.h += WG.wrap(hh - b.h) * 0.15; }
      if (b.ring) { const hh = WG.bearing(bx - b.x, by - b.y); b.h += WG.wrap(hh - b.h) * 0.2; }
    }
    G.bees = G.bees.filter((b) => !(b.leave && b.y > VH + 30));
    for (const k in G.glow) { G.glow[k] -= 0.02; if (G.glow[k] <= 0) delete G.glow[k]; }
  }

  // ---------------- rendering ----------------
  function zoom() { return Math.min(VW, VH) / 640; }
  function worldToScreen(x, y) { const z = zoom(); return { x: (x - G.cam.x) * z + VW / 2, y: (y - G.cam.y) * z + VH / 2 }; }

  function drawMeadow(W, frac) {
    const z = zoom(), az = WG.sunAz(frac), L = A.light(frac), M = A.meadow;
    g.save(); g.translate(VW / 2, VH / 2); g.scale(z, z); g.translate(-G.cam.x, -G.cam.y);
    g.drawImage(M.cv, -M.R, -M.R, M.R * 2, M.R * 2);
    const t = G.t;
    // view culling bounds
    const hw = VW / 2 / z + 140, hh = VH / 2 / z + 140, vis = (o, r) => Math.abs(o.x - G.cam.x) < hw + (r || 0) && Math.abs(o.y - G.cam.y) < hh + (r || 0);
    if (W) {
      for (const n of W.nests) if (vis(n, 260)) { const tg = g.createRadialGradient(n.x, n.y, 30, n.x, n.y, 250); tg.addColorStop(0, 'rgba(160,40,20,0.30)'); tg.addColorStop(0.85, 'rgba(160,40,20,0.16)'); tg.addColorStop(1, 'rgba(150,40,20,0)'); g.fillStyle = tg; g.beginPath(); g.arc(n.x, n.y, 250, 0, TAU); g.fill(); A.drawNest(g, n.x, n.y, t); }
      // rival bee highways: faint purple trails from their skep to the patches they are working right now
      if (!W.rivalOff) { const work = {}; for (const b of W.rivals.slice(0, W.rivalCount)) if (b.state === 'out' || b.state === 'sip') work[b.patch] = (work[b.patch] || 0) + 1;
        for (const id in work) { const p = W.patches.find((q) => q.id === +id); if (!p || !p.seen) continue; g.strokeStyle = `rgba(90,60,160,${Math.min(0.6, 0.3 + work[id] * 0.08)})`; g.lineWidth = 3 + Math.min(4, work[id]); g.setLineDash([7, 9]); g.lineDashOffset = -t * 0.8; g.beginPath(); g.moveTo(W.rival.x, W.rival.y); g.lineTo(p.x, p.y); g.stroke(); g.setLineDash([]); } }
      // scent drifting downwind from flowers hidden in the long grass
      for (const sc of G.scent) { const k = sc.t / sc.life, a = 0.22 * Math.sin(Math.PI * k), rr = 6 + 14 * k; const gr = g.createRadialGradient(sc.x, sc.y, 0, sc.x, sc.y, rr); gr.addColorStop(0, `rgba(255,255,240,${a})`); gr.addColorStop(0.5, `rgba(${sc.c},${a * 0.6})`); gr.addColorStop(1, `rgba(${sc.c},0)`); g.fillStyle = gr; g.beginPath(); g.arc(sc.x, sc.y, rr, 0, TAU); g.fill();
        if (((sc.x * 7 | 0) + (sc.t >> 3)) % 7 === 0) drawStar(sc.x, sc.y, 2, `rgba(255,255,230,${a * 3})`); }
      for (const p of W.patches) if (p.bloom <= W.day && p.wilt >= W.day && p.seen && vis(p, p.r)) {
        A.drawPatch(g, p, t, az, L, W.day);
        if (p.rivalSips > 0 && W.rivals.some((b) => b.patch === p.id && (b.state === 'sip' || b.state === 'out'))) { g.strokeStyle = 'rgba(120,90,190,0.35)'; g.lineWidth = 3; g.beginPath(); g.arc(p.x, p.y, p.r + 6, 0, TAU); g.stroke(); }
        if (W.memory.some((m) => m.id === p.id)) { g.strokeStyle = `rgba(255,240,170,${0.35 + 0.2 * Math.sin(t * 0.08)})`; g.lineWidth = 2; g.setLineDash([4, 7]); g.beginPath(); g.arc(p.x, p.y, p.r + 14, 0, TAU); g.stroke(); g.setLineDash([]); }
      }
      if (!W.rivalOff) A.drawSkep(g, W.rival.x, W.rival.y, 30, az, L, true);
    }
    for (const tr of A.trees) if (vis(tr, tr.r)) A.drawTree(g, tr, az, L, t);
    A.drawSkep(g, 0, 0, 34, az, L, false);
    if (W) {
      // golden glow on the skep as honey grows
      const hg = Math.min(1, W.honey / W.target);
      const gr = g.createRadialGradient(0, 0, 10, 0, 0, 70); gr.addColorStop(0, `rgba(255,200,60,${0.15 + 0.35 * hg})`); gr.addColorStop(1, 'rgba(255,200,60,0)'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 70, 0, TAU); g.fill();
      const so = A.shadowOff(az, 10 * L.shadowLen);
      for (const f of W.foragers) if (f.state !== 'idle' && !(f.delay > 0) && vis(f)) {
        const hd = f.state === 'home' ? WG.bearing(-f.x, -f.y) : f.state === 'search' ? (f.sa * 57.3 + 90) : WG.bearing(f.tx - f.x, f.ty - f.y);
        A.drawBee(g, f.x, f.y, hd, 7.5, t + f.id, 'forager', { pollen: f.carry > 0, shadow: so });
        if (f.state === 'search') { g.fillStyle = 'rgba(255,255,255,0.55)'; g.font = 'bold 12px sans-serif'; g.textAlign = 'center'; g.fillText('?', f.x, f.y - 10 + Math.sin(t * 0.1 + f.id) * 2); }
      }
      for (const b of W.rivals.slice(0, W.rivalCount)) if (b.state !== 'home' && vis(b)) A.drawBee(g, b.x, b.y, b.state === 'back' ? WG.bearing(W.rival.x - b.x, W.rival.y - b.y) : 180, 7.5, t + 3, 'rival', { shadow: so });
      for (const w of W.wasps) if (vis(w)) { const jit = w.state === 'hover' ? Math.sin(t * 0.9) * 1.5 : 0; A.drawBee(g, w.x + jit + (w.state === 'alert' ? Math.sin(t * 2.5) * 2.5 : 0), w.y, w.state === 'chase' || w.state === 'alert' ? WG.bearing(W.scout.x - w.x, W.scout.y - w.y) : (t * 3 + w.nest * 90) % 360, 13, t * 1.5, 'wasp', { shadow: so }); if (w.state === 'alert') { g.fillStyle = 'rgba(255,70,30,0.95)'; g.font = 'bold 22px sans-serif'; g.textAlign = 'center'; g.fillText('!', w.x, w.y - 20); } if (w.state === 'chase') { g.strokeStyle = 'rgba(255,60,30,0.6)'; g.lineWidth = 2; g.beginPath(); g.arc(w.x, w.y, 16 + Math.sin(t * 0.5) * 2, 0, TAU); g.stroke(); } }
      const s = W.scout;
      if (s.mode === 'fly') {
        const blink = s.inv > 0 && s.stun <= 0 && (t >> 2) % 2;
        if (!blink) A.drawBee(g, s.x, s.y + Math.sin(t * 0.15) * 1.5, s.stun > 0 ? (t * 20) % 360 : s.dir, 15, t * 1.3, 'scout', { shadow: { x: so.x * 1.8, y: so.y * 1.8 } });
        if (s.stun > 0) for (let i = 0; i < 3; i++) { const a = t * 0.2 + i * 2.1; drawStar(s.x + Math.cos(a) * 16, s.y - 14 + Math.sin(a) * 5, 4, '#fff6a0'); }
      }
      // fx
      for (const f of G.fx) {
        const k = f.t / f.life;
        if (f.k === 'ring') { g.strokeStyle = `rgba(255,245,180,${1 - k})`; g.lineWidth = 4 * (1 - k); g.beginPath(); g.arc(f.x, f.y, 30 + k * 80, 0, TAU); g.stroke(); }
        else if (f.k === 'spark') { f.x += f.vx; f.y += f.vy; drawStar(f.x, f.y, 3 * (1 - k) + 1, `rgba(255,250,200,${1 - k})`); }
        else if (f.k === 'star') { f.x += f.vx; f.y += f.vy; f.vx *= 0.92; f.vy *= 0.92; drawStar(f.x, f.y, 5 * (1 - k) + 1, `rgba(255,255,255,${1 - k})`); }
        else if (f.k === 'q') { g.fillStyle = `rgba(255,255,255,${0.8 * (1 - k)})`; g.font = 'bold 24px sans-serif'; g.textAlign = 'center'; g.fillText('?', f.x, f.y - 14 - k * 18); }
        else if (f.k === 'bang') { g.fillStyle = `rgba(255,80,40,${1 - k})`; g.font = 'bold 22px sans-serif'; g.textAlign = 'center'; g.fillText('!', f.x, f.y - 16 - k * 8); }
      }
      // weather: approaching cloud shadows and rain
      const rainNow = WG.raining(W);
      const near = W.rain.find(([a, b]) => W.t > a - 40 * 60 && W.t < b + 10 * 60);
      if (near) {
        const k = Math.max(0, Math.min(1, (W.t - (near[0] - 40 * 60)) / (40 * 60))), out = W.t > near[1] ? Math.max(0, 1 - (W.t - near[1]) / 600) : 1;
        const r = WG.rng(near[0]);
        for (let i = 0; i < 9; i++) { const cx = -1400 + k * 1400 + r() * 900 + (W.t - near[0]) * 0.12, cy = -700 + r() * 1400; g.fillStyle = `rgba(20,30,50,${0.16 * out * Math.min(1, k * 2)})`; g.beginPath(); g.ellipse(cx, cy, 220 + r() * 180, 140 + r() * 80, 0.3, 0, TAU); g.fill(); }
      }
    }
    g.restore();
    // light grade
    g.fillStyle = L.tint; g.globalCompositeOperation = 'multiply'; g.fillRect(0, 0, VW, VH); g.globalCompositeOperation = 'source-over';
    // the sun: glow at the screen edge in the sun's compass direction
    const sv = WG.fromBearing(az, 1), ex = VW / 2 + sv.x * VW * 0.62, ey = VH / 2 + sv.y * VH * 0.62;
    const cx = Math.max(30, Math.min(VW - 30, ex)), cy = Math.max(30, Math.min(VH - 30, ey));
    const sg = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(VW, VH) * 0.55);
    sg.addColorStop(0, `rgba(255,${200 + 40 * L.elev},${120 + 80 * L.elev},0.45)`); sg.addColorStop(1, 'rgba(255,220,150,0)');
    g.globalCompositeOperation = 'screen'; g.fillStyle = sg; g.fillRect(0, 0, VW, VH); g.globalCompositeOperation = 'source-over';
    A.drawSun(g, cx, cy, 13, G.t);
    if (W && WG.raining(W)) drawRain();
    // vignette
    const vg = g.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.35, VW / 2, VH / 2, Math.max(VW, VH) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(20,10,0,0.45)'); g.fillStyle = vg; g.fillRect(0, 0, VW, VH);
  }
  const drops = Array.from({ length: 220 }, () => [Math.random(), Math.random(), 0.6 + Math.random() * 0.6]);
  function drawRain() {
    g.fillStyle = 'rgba(40,60,90,0.22)'; g.fillRect(0, 0, VW, VH);
    g.strokeStyle = 'rgba(210,225,255,0.45)'; g.lineWidth = 1.2; g.beginPath();
    for (const d of drops) { const x = ((d[0] * VW + G.t * 2 * d[2]) % VW), y = ((d[1] * VH + G.t * 14 * d[2]) % VH); g.moveTo(x, y); g.lineTo(x - 3, y - 14 * d[2]); }
    g.stroke();
  }
  function drawStar(x, y, r, col) { g.fillStyle = col; g.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, rr = i % 2 ? r * 0.4 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill(); }

  function drawHomeArrow(W) {
    const s = W.scout, sp = worldToScreen(0, 0);
    if (sp.x > 40 && sp.x < VW - 40 && sp.y > 40 && sp.y < VH - 40) return;
    const a = Math.atan2(sp.y - VH / 2, sp.x - VW / 2), R = Math.min(VW, VH) / 2 - 36;
    const x = VW / 2 + Math.cos(a) * Math.min(R / Math.abs(Math.cos(a) || 1e-6), R / Math.abs(Math.sin(a) || 1e-6), Math.max(VW, VH)), y = VH / 2 + Math.sin(a) * Math.min(R / Math.abs(Math.cos(a) || 1e-6), R / Math.abs(Math.sin(a) || 1e-6), Math.max(VW, VH));
    const px = Math.max(30, Math.min(VW - 30, VW / 2 + Math.cos(a) * (VW / 2 - 34))), py = Math.max(30, Math.min(VH - 30, VH / 2 + Math.sin(a) * (VH / 2 - 34)));
    g.save(); g.globalAlpha = 0.85; g.translate(px, py);
    g.fillStyle = 'rgba(60,35,10,0.45)'; g.beginPath(); g.arc(0, 0, 19, 0, TAU); g.fill();
    g.rotate(a); g.fillStyle = '#ffd36a'; g.beginPath(); g.moveTo(26, 0); g.lineTo(17, -7); g.lineTo(17, 7); g.fill(); g.rotate(-a);
    g.restore();
    A.drawSkep(g, px, py, 12, 180, { shadowLen: 0 }, false);
  }

  function drawHive(W) {
    const L = hiveLayout(), d = W.dance, D = W.D, az = WG.sunNow(W), t = G.t;
    const ch = W.honey / cellHoney(), tc = 120;
    A.drawComb(g, G.comb, ch, tc, t, G.glow);
    // the sun "up" mark stamped at the top of the comb
    g.save(); g.globalAlpha = 0.7; A.drawSun(g, VW / 2, 34, 10, t); g.restore();
    g.strokeStyle = 'rgba(255,230,150,0.10)'; g.lineWidth = 26; g.beginPath(); g.moveTo(VW / 2, 50); g.lineTo(VW / 2, VH); g.stroke();
    // exit arch
    const ex = L.exit; const eg = g.createRadialGradient(ex.x, ex.y + 30, 10, ex.x, ex.y + 30, ex.r + 30); eg.addColorStop(0, 'rgba(190,230,140,0.9)'); eg.addColorStop(0.6, 'rgba(120,170,80,0.5)'); eg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = eg; g.beginPath(); g.ellipse(ex.x, ex.y + 26, ex.r + 10, ex.r * 0.75, 0, Math.PI, TAU); g.fill();
    if (WG.raining(W)) { g.fillStyle = 'rgba(150,190,255,0.8)'; for (let i = 0; i < 6; i++) { const x = ex.x - 40 + i * 16, y = ex.y - 30 + ((t * 2 + i * 13) % 30); g.fillRect(x, y, 2, 7); } }
    const bx = L.cx + d.x * L.s, by = L.cy + d.y * L.s;
    const mem = W.memory[W.sel];
    // waggle trail of the current run
    if (d.run) { g.strokeStyle = 'rgba(255,220,120,0.5)'; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(L.cx + d.run.x0 * L.s, L.cy + d.run.y0 * L.s); g.lineTo(bx, by); g.stroke(); }
    // swarm
    stepBees();
    for (const b of G.bees) { const wob = b.ring ? Math.sin(t * 0.3 + b.ph) * 1.5 : 0; A.drawBee(g, b.x + wob, b.y, b.h, 15, t + b.ph * 10, 'forager'); }
    // easy guide line: the ideal run, from the run start, ticks every buzz
    if ((D.guide || W.tutorial) && mem) {
      const ideal = WG.danceFor(mem, az), len = ideal.dur * C.WAGGLE_SPEED * L.s;
      const ox = L.cx + (d.run ? d.run.x0 : d.loop > 0 ? d.sx : d.x) * L.s, oy = L.cy + (d.run ? d.run.y0 : d.loop > 0 ? d.sy : d.y) * L.s;
      const v = WG.fromBearing(ideal.angle, 1);
      g.lineCap = 'round'; g.strokeStyle = 'rgba(40,20,0,0.55)'; g.lineWidth = 14; g.beginPath(); g.moveTo(ox, oy); g.lineTo(ox + v.x * len, oy + v.y * len); g.stroke(); g.strokeStyle = `rgba(255,240,170,${0.75 + 0.2 * Math.sin(t * 0.12)})`; g.lineWidth = 5; g.setLineDash([10, 9]); g.lineDashOffset = -t * 0.6; g.beginPath(); g.moveTo(ox, oy); g.lineTo(ox + v.x * len, oy + v.y * len); g.stroke(); g.setLineDash([]);
      const nb = ideal.dur / C.PULSE_SEC, lit = d.run ? d.run.t / (C.PULSE_SEC * 60) : 0;
      for (let i = 1; i <= Math.round(nb); i++) { const k = i / nb, x = ox + v.x * len * k, y = oy + v.y * len * k; g.fillStyle = i <= lit ? '#ffe070' : 'rgba(255,245,200,0.55)'; g.strokeStyle = '#3a2008'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, i === Math.round(nb) ? 8 : 5.5, 0, TAU); g.fill(); g.stroke(); }
      A.drawFlower(g, ox + v.x * (len + 26), oy + v.y * (len + 26), mem.species, 22, t * 0.03, 1);
    }
    // swipe preview: the run you are drawing, from your bee, with a dot per buzz
    if (G.swipe) {
      const sw = G.swipe, dx = sw.x - sw.x0, dy = sw.y - sw.y0, m = Math.hypot(dx, dy), bp = C.PULSE_SEC * C.WAGGLE_SPEED * L.s, len = Math.min(m, 16 * bp);
      if (m > 4) { const ux = dx / m, uy = dy / m, nb = Math.floor(len / bp);
        g.strokeStyle = 'rgba(255,250,220,0.9)'; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + ux * len, by + uy * len); g.stroke(); g.lineCap = 'butt';
        for (let i = 1; i <= nb; i++) { g.fillStyle = '#ffd24a'; g.strokeStyle = '#3a2008'; g.lineWidth = 2; g.beginPath(); g.arc(bx + ux * bp * i, by + uy * bp * i, 5, 0, TAU); g.fill(); g.stroke(); }
        g.fillStyle = '#fff3cf'; g.font = '800 18px "Trebuchet MS", sans-serif'; g.textAlign = 'center'; g.fillText(String(nb), bx + ux * (len + 22), by + uy * (len + 22) + 6);
        g.strokeStyle = 'rgba(255,250,220,0.35)'; g.lineWidth = 2; g.beginPath(); g.arc(sw.x0, sw.y0, 8, 0, TAU); g.stroke(); }
    }
    // dancer (waggles side to side during a run)
    const wag = d.run ? Math.sin(t * 2.2) * 7 : 0, perp = WG.fromBearing(d.h + 90, wag);
    const sp = g.createRadialGradient(bx, by, 4, bx, by, 70); sp.addColorStop(0, `rgba(255,215,120,${d.run ? 0.38 : 0.22})`); sp.addColorStop(1, 'rgba(255,215,120,0)'); g.fillStyle = sp; g.beginPath(); g.arc(bx, by, 70, 0, TAU); g.fill();
    g.save(); g.shadowColor = 'rgba(255,220,120,0.9)'; g.shadowBlur = d.run ? 22 : 10;
    A.drawBee(g, bx + perp.x, by + perp.y, d.h + (d.run ? Math.sin(t * 2.2) * 14 : 0), 24, t * 1.4, 'scout');
    g.restore();
    for (const f of G.hfx) { if (f.k === 'combo') { const k = f.t / f.life; for (let i = 0; i < f.n; i++) { g.strokeStyle = `rgba(255,210,90,${(1 - k) * 0.8})`; g.lineWidth = 3; g.beginPath(); g.arc(bx, by, 40 + i * 12 + k * 40, 0, TAU); g.stroke(); } } if (f.k === 'tick') { const k = f.t / f.life; g.strokeStyle = `rgba(255,230,140,${1 - k})`; g.lineWidth = 2; g.beginPath(); g.arc(bx, by, 18 + k * 26, 0, TAU); g.stroke(); } }
    // memory cards
    for (let i = 0; i < W.memory.length; i++) {
      const m = W.memory[i], p = L.mem[i], sel = i === W.sel;
      g.fillStyle = 'rgba(40,22,6,0.75)'; g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.fill();
      g.strokeStyle = sel ? '#ffd65a' : 'rgba(255,220,150,0.35)'; g.lineWidth = sel ? 4 : 2; g.stroke();
      A.drawFlower(g, p.x, p.y - 6, m.species, 20, t * 0.02 + i, 1);
      if (D.counts || W.tutorial) { const nb = Math.round(Math.hypot(m.x, m.y) / C.PULSE_DIST); for (let j = 0; j < nb; j++) { const col = j % 5, row = Math.floor(j / 5); g.fillStyle = '#ffe070'; g.beginPath(); g.arc(p.x - 16 + col * 8, p.y + 20 + row * 7, 2.6, 0, TAU); g.fill(); } }
      const rv = W.rivals.slice(0, W.rivalCount).filter((b) => b.patch === m.id && (b.state === 'out' || b.state === 'sip')).length;
      if (rv) A.drawBee(g, p.x + p.r - 4, p.y + p.r - 8, 200, 13, t, 'rival');
      g.fillStyle = 'rgba(255,240,200,0.6)'; g.font = 'bold 12px sans-serif'; g.textAlign = 'center'; if (W.memory.length > 1) g.fillText(String(i + 1), p.x + p.r - 6, p.y - p.r + 10);
    }
    if (D.bubble || W.tutorial) drawBubble(W, L);
    if (G.hfx.some((f) => f.k === 'rainNo')) { g.fillStyle = 'rgba(30,40,70,0.7)'; g.beginPath(); g.arc(bx, by - 52, 20, 0, TAU); g.fill(); A.drawCloud(g, bx, by - 54, 14, 0.9); g.fillStyle = '#9cc4ff'; g.fillRect(bx - 6, by - 44, 2, 6); g.fillRect(bx + 3, by - 42, 2, 6); }
  }

  function drawBubble(W, L) {
    const b = L.bub, sc = b.r / (C.MEADOW_R * 1.02), az = WG.sunNow(W), t = G.t;
    g.save();
    g.fillStyle = 'rgba(255,250,235,0.18)'; g.beginPath(); g.arc(b.x - b.r * 0.85, b.y + b.r * 0.95, 10, 0, TAU); g.arc(b.x - b.r * 1.0, b.y + b.r * 1.15, 6, 0, TAU); g.fill();
    g.beginPath(); g.arc(b.x, b.y, b.r, 0, TAU); g.fillStyle = 'rgba(85,125,55,0.92)'; g.fill(); g.strokeStyle = 'rgba(255,250,230,0.7)'; g.lineWidth = 3; g.stroke(); g.clip();
    // sun ray from hive
    const sv = WG.fromBearing(az, 1);
    g.strokeStyle = 'rgba(255,230,120,0.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(b.x + sv.x * b.r, b.y + sv.y * b.r); g.stroke();
    for (const m of W.memory) { const x = b.x + m.x * sc, y = b.y + m.y * sc; g.fillStyle = WG.SPECIES[m.species][1]; g.beginPath(); g.arc(x, y, m === W.memory[W.sel] ? 6 : 4, 0, TAU); g.fill(); g.strokeStyle = '#3a2410'; g.lineWidth = 1; g.stroke(); }
    // live run preview (easy) or the last run's vector (normal)
    const d = W.dance, run = d.run;
    let vec = null;
    if (run && (W.D.guide || W.tutorial)) { const dx = d.x - run.x0, dy = d.y - run.y0; if (Math.hypot(dx, dy) > 0.5) vec = WG.decode({ angle: WG.wrap(WG.bearing(dx, dy)), dur: run.t / 60 }, az); }
    else if (G.lastRun && W.t - G.lastRun.t < 360) vec = { x: G.lastRun.tx, y: G.lastRun.ty };
    if (vec) { g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 2; g.setLineDash([5, 4]); g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(b.x + vec.x * sc, b.y + vec.y * sc); g.stroke(); g.setLineDash([]); g.strokeStyle = '#fff'; g.lineWidth = 2.5; const x = b.x + vec.x * sc, y = b.y + vec.y * sc; g.beginPath(); g.moveTo(x - 5, y - 5); g.lineTo(x + 5, y + 5); g.moveTo(x + 5, y - 5); g.lineTo(x - 5, y + 5); g.stroke(); }
    // live foragers
    for (const f of W.foragers) if (f.state !== 'idle' && !(f.delay > 0)) { g.fillStyle = f.carry ? '#ffb02e' : f.state === 'search' ? '#ffffff' : '#ffe27a'; g.fillRect(b.x + f.x * sc - 1, b.y + f.y * sc - 1, 2.4, 2.4); }
    g.restore();
    A.drawSkep(g, b.x, b.y, 7, 180, { shadowLen: 0 }, false);
    const sx = b.x + sv.x * (b.r - 12), sy = b.y + sv.y * (b.r - 12); A.drawSun(g, sx, sy, 6, t);
  }

  function hintText(W) {
    const h = G.hint; if (!h) return null;
    if (G.ctrl === 'swipe' && h === 'tutDance0') return 'The flowers are toward the SUN.  Up means sun.  Swipe UP from your bee, as long as the dotted line.';
    if (G.ctrl === 'swipe' && h === 'tutDance1') return 'These flowers are to the RIGHT of the sun.  Swipe to the RIGHT, as long as the dotted line.';
    return { tut0: 'Fly to the yellow flowers.  (arrow keys, or hold the mouse / finger)', tutHome: 'Found them!  Fly home to the hive.', tutDance0: 'The flowers are toward the SUN.  Up means sun.  Hold SPACE (or press and hold) to waggle UP until the last dot.', tutGood: 'Your sisters found them!  Now the next flowers…', tutDance1: 'These flowers are to the RIGHT of the sun.  Waggle to the right ( → then SPACE, or point right and hold).' }[h];
  }
  function drawHint(W) {
    const txt = hintText(W); if (!txt) return;
    g.font = '600 18px "Trebuchet MS", sans-serif'; const w = Math.min(VW - 40, g.measureText(txt).width + 40);
    const x = VW / 2, y = W.scout.mode === 'hive' ? VH - 110 : 40;
    g.fillStyle = 'rgba(40,22,6,0.78)'; roundRect(x - w / 2, y - 22, w, 44, 22); g.fill();
    g.fillStyle = '#fff3cf'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, x, y, VW - 60); g.textBaseline = 'alphabetic';
    // tutorial pointer arrows in the meadow
    if (W.scout.mode === 'fly' && W.patches[0]) {
      const goal = G.hint === 'tutHome' ? { x: 0, y: 0 } : W.patches[0], s = W.scout, a = Math.atan2(goal.y - s.y, goal.x - s.x), sp = worldToScreen(s.x, s.y);
      if (Math.hypot(goal.x - s.x, goal.y - s.y) > 90) { g.save(); g.translate(sp.x + Math.cos(a) * 52, sp.y + Math.sin(a) * 52); g.rotate(a); g.globalAlpha = 0.6 + 0.4 * Math.sin(G.t * 0.15); g.fillStyle = '#fff3cf'; g.beginPath(); g.moveTo(16, 0); g.lineTo(-6, -11); g.lineTo(-1, 0); g.lineTo(-6, 11); g.fill(); g.restore(); }
    }
  }
  function roundRect(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  function drawLogo(x, y, s) {
    g.save(); g.font = `900 ${s}px "Trebuchet MS", "Segoe UI", sans-serif`; g.textAlign = 'center';
    g.fillStyle = 'rgba(60,30,0,0.45)'; g.fillText('WAGGLE', x + 4, y + 6);
    const gr = g.createLinearGradient(0, y - s, 0, y); gr.addColorStop(0, '#fff2a8'); gr.addColorStop(0.5, '#ffc22e'); gr.addColorStop(1, '#d97a00');
    g.fillStyle = gr; g.fillText('WAGGLE', x, y); g.strokeStyle = '#6b3a00'; g.lineWidth = s * 0.03; g.strokeText('WAGGLE', x, y);
    // honey drips
    const w = g.measureText('WAGGLE').width;
    for (let i = 0; i < 6; i++) { const dx = x - w / 2 + w * (0.1 + i * 0.16), len = s * (0.12 + 0.18 * ((i * 37) % 5) / 5) * (0.8 + 0.2 * Math.sin(G.t * 0.02 + i)); g.fillStyle = '#e08e00'; g.beginPath(); g.moveTo(dx - 5, y - 2); g.lineTo(dx + 5, y - 2); g.lineTo(dx + 3, y + len); g.arc(dx, y + len, 4, 0, Math.PI); g.fill(); }
    g.restore();
  }
  function menuRects() { const w = Math.min(360, VW - 40), h = Math.min(54, (VH * 0.47 - 20) / MENU.length - 10), x = VW / 2 - w / 2, y0 = VH * 0.49; return MENU.map((m, i) => ({ x, y: y0 + i * (h + 10), w, h })); }
  function menuHit(x, y) { return menuRects().findIndex((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h); }
  function drawTitle() {
    G.cam.x = Math.sin(G.t * 0.0015) * 300; G.cam.y = Math.cos(G.t * 0.0011) * 200;
    drawMeadow(null, 0.35 + 0.1 * Math.sin(G.t * 0.001));
    g.fillStyle = 'rgba(30,15,0,0.25)'; g.fillRect(0, 0, VW, VH);
    drawLogo(VW / 2, VH * 0.24, Math.min(120, VW / 7));
    // demo dancer: figure eight
    const ph = (G.t % 180) / 180, cx = VW / 2, cy = VH * 0.36;
    let x, y, h;
    if (ph < 0.4) { const k = ph / 0.4; x = cx - 28 + 56 * k; y = cy + 26 - 52 * k; h = 48; x += Math.sin(G.t * 2.2) * 3; }
    else { const k = (ph - 0.4) / 0.6, side = Math.floor(G.t / 180) % 2 ? 1 : -1, a = -Math.PI / 4 + side * Math.PI * k; x = cx + Math.cos(a) * 38 * (side); y = cy + Math.sin(a) * 38; h = 48 + side * 180 * k; }
    A.drawBee(g, x, y, h, 22, G.t * 1.4, 'scout');
    g.font = '600 16px "Trebuchet MS", sans-serif'; g.textAlign = 'center'; g.fillStyle = '#fff3cf';
    g.fillText('Find flowers. Fly home. Dance to show your sisters the way.', VW / 2, VH * 0.44);
    menuRects().forEach((r, i) => {
      const sel = i === G.menuI; g.fillStyle = sel ? 'rgba(255,200,60,0.95)' : 'rgba(50,28,6,0.75)'; roundRect(r.x, r.y, r.w, r.h, r.h / 2); g.fill();
      g.strokeStyle = sel ? '#fff2b0' : 'rgba(255,220,150,0.4)'; g.lineWidth = 2; g.stroke();
      g.fillStyle = sel ? '#3a2008' : '#fff3cf'; g.font = '800 22px "Trebuchet MS", sans-serif'; g.textAlign = 'left'; g.fillText(MENU[i][1], r.x + 24, r.y + r.h / 2 + 8);
      g.font = '14px "Trebuchet MS", sans-serif'; g.textAlign = 'right'; g.fillStyle = sel ? '#5a3410' : 'rgba(255,230,180,0.7)';
      if (MENU[i][0] === 'ctrl') { g.fillText(G.ctrl === 'swipe' ? '‹ swipe the dance ›' : '‹ press and hold ›', r.x + r.w - 22, r.y + r.h / 2 + 6); return; }
      const st = G.best[MENU[i][0]]; g.fillText(MENU[i][2] + (st ? '  ' + '★'.repeat(st) : ''), r.x + r.w - 22, r.y + r.h / 2 + 6);
    });
    g.font = '13px sans-serif'; g.textAlign = 'center'; g.fillStyle = 'rgba(255,240,210,0.7)';
    g.fillText('v' + (window.WG_VERSION || '?') + '   ·   arrow keys + Enter, or tap   ·   M mutes sound', VW / 2, VH - 18);
  }

  function drawNight(W, end) {
    G.nightT = (G.nightT || 0) + 1;
    A.drawComb(g, G.comb, W.honey / cellHoney(), 120, G.t, null);
    g.fillStyle = end ? 'rgba(20,30,60,0.55)' : 'rgba(10,10,40,0.55)'; g.fillRect(0, 0, VW, VH);
    const cw = Math.min(520, VW - 30), ch = end ? 410 : 330, x = VW / 2 - cw / 2, y = VH / 2 - ch / 2;
    g.fillStyle = 'rgba(30,18,8,0.92)'; roundRect(x, y, cw, ch, 26); g.fill(); g.strokeStyle = 'rgba(255,210,120,0.5)'; g.lineWidth = 2; g.stroke();
    g.textAlign = 'center'; g.fillStyle = '#fff3cf';
    const st = WG.stars(W);
    if (end) {
      if (end === 'tut') { g.font = '800 30px "Trebuchet MS", sans-serif'; g.fillText('You can waggle!', VW / 2, y + 60); g.font = '17px "Trebuchet MS", sans-serif'; g.fillText('Up = toward the sun.  Longer waggle = farther away.', VW / 2, y + 100); g.fillText('The sun moves all day, so the same flower needs a new angle later.', VW / 2, y + 128); A.drawBee(g, VW / 2, y + 210, Math.sin(G.t * 0.05) * 30, 26, G.t * 1.4, 'scout'); g.font = '15px sans-serif'; g.fillStyle = 'rgba(255,240,210,0.7)'; g.fillText('tap / Space: back to the title', VW / 2, y + ch - 24); return; }
      g.font = '800 32px "Trebuchet MS", sans-serif'; g.fillText(st ? 'Ready for winter!' : 'A hungry winter…', VW / 2, y + 56);
      g.font = '42px sans-serif'; g.fillStyle = '#ffd24a'; g.fillText([0, 1, 2].map((i) => (i < st ? '★' : '☆')).join(' '), VW / 2, y + 112);
    } else {
      g.font = '800 30px "Trebuchet MS", sans-serif'; g.fillText(`Day ${W.day + 1} of ${C.DAYS} done`, VW / 2, y + 54);
      // day dots
      for (let i = 0; i < C.DAYS; i++) { g.fillStyle = i <= W.day ? '#ffc93c' : 'rgba(255,240,210,0.25)'; g.beginPath(); g.arc(VW / 2 - (C.DAYS - 1) * 14 + i * 28, y + 84, 8, 0, TAU); g.fill(); }
    }
    // honey jar vs winter line
    const jx = VW / 2 - 150, jy = y + (end ? 150 : 128), jw = 300, jh = 34, fr = Math.min(1.7, W.honey / W.target) / 1.7;
    g.fillStyle = 'rgba(255,240,210,0.12)'; roundRect(jx, jy, jw, jh, 17); g.fill();
    const hg = g.createLinearGradient(jx, 0, jx + jw, 0); hg.addColorStop(0, '#e08e00'); hg.addColorStop(1, '#ffd24a'); g.fillStyle = hg; roundRect(jx, jy, Math.max(jh, jw * fr), jh, 17); g.fill();
    for (const [k, lab] of [[1, '❄'], [1.3, '★★'], [1.6, '★★★']]) { const lx = jx + jw * k / 1.7; g.strokeStyle = 'rgba(220,240,255,0.9)'; g.lineWidth = 2; g.beginPath(); g.moveTo(lx, jy - 6); g.lineTo(lx, jy + jh + 6); g.stroke(); g.font = '12px sans-serif'; g.fillStyle = '#dfefff'; g.fillText(lab, lx, jy - 10); }
    g.font = '15px "Trebuchet MS", sans-serif'; g.fillStyle = '#fff3cf';
    const s = W.stats, hit = s.recruits ? Math.round(100 * (1 - s.misses / Math.max(1, s.recruits))) : 0;
    g.fillText(`${Math.round(W.honey)} honey  ·  ${s.runs} waggle runs  ·  ${Math.max(0, hit)}% of sisters found flowers`, VW / 2, jy + 60);
    if (s.rivalSips && !W.rivalOff) { g.fillStyle = '#c9b6f2'; g.fillText(`rival bees took ${s.rivalHoney || 0} honey  ·  ${s.reveals} hidden patches sniffed out`, VW / 2, jy + (end ? 96 : 82)); g.fillStyle = '#fff3cf'; }
    if (!end) {
      // tomorrow's forecast
      g.fillText('Tomorrow:', VW / 2 - 40, y + 230); const nx = VW / 2 + 30, ny = y + 224;
      const rainy = !!W.tomorrowRain;
      A.drawSun(g, nx, ny, 9, G.t); if (rainy) { A.drawCloud(g, nx + 22, ny + 4, 16, 0.95); g.fillStyle = '#9cc4ff'; g.fillRect(nx + 16, ny + 16, 2, 7); g.fillRect(nx + 26, ny + 18, 2, 7); }
      g.font = '14px sans-serif'; g.fillStyle = 'rgba(255,240,210,0.7)'; g.fillText('tap / Space: next morning', VW / 2, y + ch - 24);
    } else {
      g.font = '15px "Trebuchet MS", sans-serif'; g.fillStyle = '#fff3cf';
      const ae = s.angErr.length ? s.angErr.reduce((a, b) => a + b, 0) / s.angErr.length : 0;
      g.fillText(`average angle error ${ae.toFixed(0)}°  ·  wasp bumps ${s.stung}`, VW / 2, jy + 78);
      // snug winter skep
      const sx = VW / 2, sy = y + ch - 90;
      A.drawSkep(g, sx, sy, 40, 180, { shadowLen: 0 }, false);
      g.fillStyle = '#f4f8ff'; g.beginPath(); g.ellipse(sx, sy - 18, 34, 20, 0, Math.PI, TAU); g.fill();
      g.fillStyle = st ? 'rgba(255,200,80,0.9)' : 'rgba(120,90,60,0.9)'; g.beginPath(); g.ellipse(sx, sy + 22, 9, 6, 0, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.8)'; for (let i = 0; i < 30; i++) { const fx = x + 20 + ((i * 97 + G.t * 0.3 * (1 + i % 3)) % (cw - 40)), fy = y + 262 + ((i * 53 + G.t * (0.5 + (i % 4) * 0.2)) % (ch - 290)); if (Math.abs(fx - VW / 2) < 110 && fy > y + ch - 40) continue; g.beginPath(); g.arc(fx, fy, 1.5 + (i % 3), 0, TAU); g.fill(); }
      g.font = '14px sans-serif'; g.fillStyle = 'rgba(255,240,210,0.7)'; g.fillText('tap / Space: back to the title', VW / 2, y + ch - 24);
    }
    if (G.autoNight != null && G.screen === 'night' && --G.autoNight <= 0) { G.autoNight = null; toDawn(); }
  }

  function frame() {
    G.t++;
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    const W = G.W;
    if (G.screen === 'title' || !W) { AU.S.scene !== 'title' && AU.setScene('title'); drawTitle(); return; }
    if (G.screen === 'night') { drawNight(W, false); return; }
    if (G.screen === 'end') { drawNight(W, true); return; }
    if (G.screen === 'tutEnd') { drawNight(W, 'tut'); return; }
    if (W.scout.mode === 'hive') drawHive(W);
    else {
      const s = W.scout; G.cam.x += (s.x - G.cam.x) * 0.12; G.cam.y += (s.y - G.cam.y) * 0.12;
      drawMeadow(W, W.t / C.DAY_LEN);
      drawHomeArrow(W);
      // dusk warning: last 15 s the edges glow amber
      if (W.t > C.DAY_LEN - 15 * 60 && !W.tutorial) { const k = (W.t - (C.DAY_LEN - 15 * 60)) / (15 * 60); g.fillStyle = `rgba(80,30,60,${0.35 * k})`; g.fillRect(0, 0, VW, VH); }
    }
    if (G.flash > 0) { g.fillStyle = `rgba(255,255,255,${G.flash / 30})`; g.fillRect(0, 0, VW, VH); G.flash--; }
    G.fx = G.fx.filter((f) => ++f.t < f.life); G.hfx = G.hfx.filter((f) => ++f.t < f.life);
    drawHint(W);
    if (G.paused) { g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(0, 0, VW, VH); g.fillStyle = '#fff'; g.font = '800 40px sans-serif'; g.textAlign = 'center'; g.fillText('paused', VW / 2, VH / 2); }
  }

  // ---------------- main loop ----------------
  let acc = 0, last = performance.now();
  function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now; acc += dt * G.speed;
    let n = 0; while (acc >= 1 / 60 && n < 8) { tick(); acc -= 1 / 60; n++; }
    frame();
    requestAnimationFrame(loop);
  }

  // ---------------- test / demo hooks ----------------
  const auto = Q.get('auto');
  if (Q.get('speed')) G.speed = parseFloat(Q.get('speed')) || 1;
  if (Q.get('diff') || auto || Q.get('tut')) {
    start(Q.get('tut') ? 'tut' : (Q.get('diff') || 'normal'), Q.get('seed') != null ? +Q.get('seed') : 1);
    if (auto) G.bot = Bot.makeBot(auto, G.W.seed);
    const ff = +(Q.get('ff') || 0);
    for (let i = 0; i < ff; i++) { if (G.screen === 'night') toDawn(); tick(); if (i > ff - 400) { if (G.W.scout.mode === 'hive') stepBees(); } G.fx = G.fx.filter((f) => ++f.t < f.life); }
    if (Q.get('stop')) G.bot = null;
  }
  window.__WG = { G, tick, start, toDawn, showHint };
  requestAnimationFrame(loop);
})();
