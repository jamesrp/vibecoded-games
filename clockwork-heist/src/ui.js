// CLOCKWORK HEIST game client: screens, planning UI, timeline, playback.
(function () {
  'use strict';
  const S = window.CHSim, R = window.CHRender, A = window.CHAudio, LV = window.CHLevels.LEVELS, SOL = window.CHSolutions || {};
  const P = R.P, W = 1280, H = 800;
  LV.forEach((l) => { if (SOL[l.id]) l.par = SOL[l.id].par; });
  const Q = new URLSearchParams(location.search);
  const cv = document.getElementById('c'), ctx = cv.getContext('2d');
  let scale = 1, dpr = 1;
  function resize() {
    dpr = window.devicePixelRatio || 1;
    const sw = window.innerWidth, sh = window.innerHeight;
    scale = Math.min(sw / W, sh / H);
    cv.style.width = (W * scale) + 'px'; cv.style.height = (H * scale) + 'px';
    cv.width = Math.round(W * scale * dpr); cv.height = Math.round(H * scale * dpr);
  }
  window.addEventListener('resize', resize); resize();

  // ---------- save ----------
  const SAVE_KEY = 'clockwork-heist-v1';
  function loadSave() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch (e) { return {}; } }
  const save = Object.assign({ best: {}, plans: {}, opts: {} }, loadSave());
  function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } }
  const unlockAll = Q.get('unlock') === 'all';
  function unlocked(i) { if (unlockAll || i === 0) return true; return !!save.best[LV[i - 1].id]; }

  // ---------- game state ----------
  const G = {
    screen: 'title', li: 0, L: null, def: null, plan: null, ci: 0, sel: null, scrub: 0, pv: null, real: null, realKey: '',
    playing: false, pt: 0, speed: 1, hist: [], fx: [], toast: null, banner: null, fail: null, hover: null, drag: null,
    assist: !!save.opts.assist, skip: save.opts.skip !== false, slowMs: 0, ff: false, quiet: null, result: null, t0: performance.now(), lay: null, helpOpen: false, firstGo: true,
  };
  const TICK_MS = 300;

  function planKey() { return JSON.stringify(G.plan); }
  function clonePlan(p) { return JSON.parse(JSON.stringify(p)); }
  function emptyPlan(def) { const p = {}; def.crew.forEach((r) => { p[r] = []; }); return p; }

  function openLevel(i, screen) {
    G.li = i; G.def = LV[i]; G.L = S.parseLevel(G.def);
    G.plan = save.plans[G.def.id] ? clonePlan(save.plans[G.def.id]) : emptyPlan(G.def);
    if (Q.get('sol') != null && SOL[G.def.id]) G.plan = clonePlan(SOL[G.def.id].plans[+Q.get('sol') || 0].plan);
    G.def.crew.forEach((r) => { if (!G.plan[r]) G.plan[r] = []; });
    G.ci = 0; G.sel = null; G.scrub = 0; G.hist = []; G.fail = null; G.banner = null; G.result = null; G.playing = false; G.fx = [];
    G.screen = screen || 'brief';
    recompute();
    A.setMode(G.screen === 'brief' ? 'title' : 'plan');
  }
  function recompute() {
    G.pv = S.run(G.L, G.plan, { real: false, pad: 4 });
    G.snaps = snapPoints(G.pv);
    if (G.realKey !== planKey()) { G.real = null; G.fail = null; }
    G.lay = R.layout(G.L, W, H, 92, 236);
  }
  // B-15: moments worth holding for: a guard turns, stops or sets off, a chat ends, a laser flips, a loop runs out.
  function snapPoints(r) {
    const out = new Set(), F = r.frames;
    for (let t = 1; t < F.length; t++) {
      const a = F[t - 1], b = F[t];
      b.guards.forEach((g, i) => { const p = a.guards[i]; if (g.ko) return;
        if (g.x === p.x && g.y === p.y && Math.abs(S.angDiff(g.a, p.a)) > 0.3) out.add(t);
        if (t >= 3) { const q2 = F[t - 2].guards[i], q3 = F[t - 3].guards[i];
          const mv = g.x !== q2.x || g.y !== q2.y, pm = p.x !== q3.x || p.y !== q3.y;
          if (mv !== pm) out.add(mv ? t - 1 : t); }
        if (p.held > 0 && g.held === 0) out.add(t); });
      if (S.laserOn(G.L, t) !== S.laserOn(G.L, t - 1) && G.L.tiles.includes('x')) out.add(t);
      if (a.loopT > 0 && b.loopT === 0) out.add(t);
    }
    return [...out].sort((x, y) => x - y);
  }
  function snapT(t, tol) { let best = t, bd = (tol == null ? 1 : tol) + 0.5; for (const s of G.snaps || []) { const d = Math.abs(s - t); if (d < bd) { bd = d; best = s; } } return best; }
  function getReal() {
    const k = planKey();
    if (!G.real || G.realKey !== k) { G.real = S.run(G.L, G.plan, { real: true }); G.realKey = k; G.quiet = S.quietTicks(G.real); }
    return G.real;
  }
  function edit(fn) {
    G.hist.push(clonePlan(G.plan)); if (G.hist.length > 80) G.hist.shift();
    fn(); save.plans[G.def.id] = G.plan; persist(); recompute();
  }
  function undo() { if (!G.hist.length) return toast('Nothing to undo'); G.plan = G.hist.pop(); save.plans[G.def.id] = G.plan; persist(); G.sel = null; recompute(); A.sfx('remove'); }
  function role() { return G.def.crew[G.ci]; }
  function toast(s, ms) { G.toast = { s, until: performance.now() + (ms || 2200) }; }

  function addCmd(cmd) {
    const r = role();
    edit(() => {
      const q = G.plan[r];
      let at = q.length;
      if (G.sel && G.sel.ci === G.ci && G.sel.i < q.length) at = G.sel.i + 1;
      q.splice(at, 0, cmd);
      G.sel = { ci: G.ci, i: at };
    });
    A.sfx('place');
  }
  function span() { const e = Math.max(G.pv.end, G.real ? G.real.end : 0); return Math.max(60, Math.ceil((e + 14) / 10) * 10); }
  function frameAt(t) {
    const fr = G.playing ? getReal().frames : G.pv.frames;
    return fr[Math.max(0, Math.min(fr.length - 1, t))];
  }

  // ---------- input ----------
  let mouse = { x: 0, y: 0, down: false };
  function toLogical(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale }; }
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('mousedown', (e) => { A.resume(); const p = toLogical(e); mouse = { ...p, down: true }; onDown(p, e); });
  window.addEventListener('mousemove', (e) => { const p = toLogical(e); mouse.x = p.x; mouse.y = p.y; onMove(p, e); });
  window.addEventListener('mouseup', () => { mouse.down = false; G.drag = null; });
  cv.addEventListener('wheel', (e) => { const p = toLogical(e); onWheel(p, e); e.preventDefault(); }, { passive: false });
  cv.addEventListener('touchstart', (e) => { A.resume(); const t = e.touches[0]; const p = toLogical(t); mouse = { ...p, down: true }; onDown(p, { button: 0 }); e.preventDefault(); }, { passive: false });
  cv.addEventListener('touchmove', (e) => { const t = e.touches[0]; const p = toLogical(t); onMove(p, {}); e.preventDefault(); }, { passive: false });
  cv.addEventListener('touchend', () => { mouse.down = false; G.drag = null; });

  const buttons = []; // rebuilt each frame: {x,y,w,h,fn,key}
  function hitButton(p) { for (let i = buttons.length - 1; i >= 0; i--) { const b = buttons[i]; if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return b; } return null; }

  // timeline geometry
  const TL = { x: 214, y: 600, w: 920, rulerH: 22 };
  function tlRows() { const n = G.def.crew.length; const rh = Math.min(40, Math.floor(136 / n)); return { y0: TL.y + TL.rulerH + 6, rh }; }
  function tx(t) { return TL.x + t * TL.w / span(); }
  function tAt(x) { return Math.max(0, Math.min(span(), Math.round((x - TL.x) * span() / TL.w))); }

  function onDown(p, e) {
    const b = hitButton(p);
    if (b) { A.sfx('click'); b.fn(); return; }
    if (G.screen === 'title') { goSelect(); return; }
    if (G.screen === 'select') return;
    if (G.screen === 'brief') { G.screen = 'plan'; A.setMode('plan'); return; }
    if (G.screen === 'result') return;
    if (G.screen !== 'plan') return;
    if (G.helpOpen) { G.helpOpen = false; return; }
    // timeline
    if (p.x >= TL.x - 6 && p.x <= TL.x + TL.w + 6 && p.y >= TL.y && p.y <= TL.y + 190) {
      if (G.playing) stopPlay();
      const blk = blockAt(p);
      if (blk && !(e && e.shiftKey)) { G.ci = blk.ci; G.sel = { ci: blk.ci, i: blk.i }; A.sfx('click');
        if (blk.cmd.k === 'wait' || blk.cmd.k === 'until') G.drag = { kind: 'wait', blk, x0: p.x, n0: blk.cmd.k === 'wait' ? blk.cmd.n : blk.cmd.t, pushed: false };
        else G.drag = { kind: 'move', blk, x0: p.x, a0: blk.a, ui: -1, pushed: false };
        return; }
      // empty part of a crew row: pick that crew; shift-click = HOLD that crew until here
      const { y0, rh } = tlRows(), row = Math.floor((p.y - y0) / rh);
      if (row >= 0 && row < G.def.crew.length) {
        if (G.ci !== row) { G.ci = row; G.sel = null; }
        if (e && e.shiftKey) {
          const t = snapT(tAt(p.x)); setScrub(t);
          const before = blocks().filter((b) => b.ci === row && !b.ghost && b.a <= t);
          G.sel = before.length ? { ci: row, i: before[before.length - 1].i } : null;
          if (!G.sel) { edit(() => { G.plan[G.def.crew[row]].unshift({ k: 'until', t }); }); G.sel = { ci: row, i: 0 }; toast('Holds until ' + S.fmtT(t)); }
          else addHold();
          return; }
      }
      G.drag = { kind: 'scrub' }; setScrub(tAt(p.x)); return;
    }
    // crew cards
    for (let i = 0; i < G.def.crew.length; i++) {
      const { y0, rh } = tlRows();
      if (p.x >= 20 && p.x <= 204 && p.y >= y0 + i * rh && p.y < y0 + (i + 1) * rh) { selectCrew(i); return; }
    }
    // map
    const { T, ox, oy } = G.lay;
    const mx = Math.floor((p.x - ox) / T), my = Math.floor((p.y - oy) / T);
    if (mx >= 0 && my >= 0 && mx < G.L.w && my < G.L.h) {
      if (G.playing) stopPlay();
      mapClick(mx, my, e.button === 2 || e.shiftKey);
    }
  }
  function onMove(p) {
    if (G.screen === 'plan' && G.lay) {
      const { T, ox, oy } = G.lay; const mx = Math.floor((p.x - ox) / T), my = Math.floor((p.y - oy) / T);
      G.hover = (mx >= 0 && my >= 0 && mx < G.L.w && my < G.L.h) ? [mx, my] : null;
    }
    if (!mouse.down || !G.drag) return;
    if (G.drag.kind === 'scrub') setScrub(tAt(p.x));
    else if (G.drag.kind === 'move') { // drag an action in time = edit (or create) the HOLD in front of it
      const D = G.drag, ro = G.def.crew[D.blk.ci], q = G.plan[ro];
      if (D.ui < 0 && Math.abs(p.x - D.x0) < 5) return;
      const nt = Math.max(0, snapT(D.a0 + Math.round((p.x - D.x0) * span() / TL.w)));
      if (D.ui < 0) {
        G.hist.push(clonePlan(G.plan)); D.pushed = true;
        if (D.blk.i > 0 && q[D.blk.i - 1].k === 'until') D.ui = D.blk.i - 1;
        else { q.splice(D.blk.i, 0, { k: 'until', t: D.a0 }); D.ui = D.blk.i; }
        G.sel = { ci: D.blk.ci, i: D.ui + 1 };
      }
      if (q[D.ui] && q[D.ui].t !== nt) { q[D.ui].t = nt; save.plans[G.def.id] = G.plan; persist(); recompute(); G.scrub = nt; A.sfx('scrub'); }
    }
    else if (G.drag.kind === 'wait') {
      const d = Math.round((p.x - G.drag.x0) * span() / TL.w);
      const cmd = G.plan[G.def.crew[G.drag.blk.ci]][G.drag.blk.i];
      if (!cmd) return;
      let nv = Math.max(cmd.k === 'wait' ? 1 : 0, G.drag.n0 + d);
      if (cmd.k === 'until') nv = snapT(nv);
      const cur = cmd.k === 'wait' ? cmd.n : cmd.t;
      if (nv !== cur) {
        if (!G.drag.pushed) { G.hist.push(clonePlan(G.plan)); G.drag.pushed = true; }
        if (cmd.k === 'wait') cmd.n = nv; else cmd.t = nv;
        save.plans[G.def.id] = G.plan; persist(); recompute(); A.sfx('scrub');
      }
    }
  }
  function onWheel(p, e) {
    if (G.screen !== 'plan') return;
    const blk = blockAt(p);
    const d = e.deltaY < 0 ? 1 : -1;
    if (blk && (blk.cmd.k === 'wait' || blk.cmd.k === 'until')) { G.sel = { ci: blk.ci, i: blk.i }; adjustWait(d); return; }
    if (G.sel) { const c = G.plan[G.def.crew[G.sel.ci]][G.sel.i]; if (c && (c.k === 'wait' || c.k === 'until')) { adjustWait(d); return; } }
    setScrub(G.scrub - d);
  }
  function setScrub(t) {
    t = Math.max(0, Math.min(span(), t));
    if (t !== G.scrub) { G.scrub = t; A.sfx('scrub'); }
  }
  function selectCrew(i) { if (i >= G.def.crew.length) return; if (G.ci !== i) G.sel = null; G.ci = i; A.sfx('click'); }

  function guardAt(f, x, y) { return f.guards.findIndex((g) => !g.ko && g.x === x && g.y === y); }
  function mapClick(x, y, alt) {
    const f = frameAt(G.scrub), r = role(), tile = f.tiles[y * G.L.w + x];
    if (alt) {
      if (r !== 'charm') return toast('Right-click tosses a coin, and only CHARM carries coins.');
      if (!S.crewPass({ tiles: f.tiles }, G.L, x, y) && tile !== '#') { /* allow tossing near objects */ }
      return addCmd({ k: 'toss', x, y });
    }
    let gi = guardAt(f, x, y);
    if (gi < 0) gi = guardAt(G.pv.frames[0], x, y);
    if (gi >= 0) {
      if (r === 'charm') return addCmd({ k: 'chat', g: gi });
      if (r === 'muscle') return addCmd({ k: 'ko', g: gi });
      return toast('Only CHARM can chat a guard up, and only MUSCLE can knock one out.');
    }
    switch (tile) {
      case 'L': return r === 'pick' ? addCmd({ k: 'pick', x, y }) : toast('Locked. Only PICK can open it.');
      case 'S': case 's': return r === 'pick' ? addCmd({ k: 'pick', x, y }) : toast('A safe. Only PICK can crack it.');
      case '%': return r === 'muscle' ? addCmd({ k: 'smash', x, y }) : toast('A cracked wall. MUSCLE can smash through it, loudly.');
      case 'P': return r === 'eye' ? addCmd({ k: 'loop', x, y }) : toast('A camera panel. Only EYE can loop it.');
      case 'g': return r === 'muscle' ? addCmd({ k: 'grab', x, y }) : toast('Gold bars are heavy. Only MUSCLE can carry them.');
      case '$': case '*': return addCmd({ k: 'grab', x, y });
      case '#': case 'C': case 'o': case 'O': return;
      default: return addCmd({ k: 'go', x, y });
    }
  }
  function adjustWait(d) {
    if (!G.sel) return;
    const cmd = G.plan[G.def.crew[G.sel.ci]][G.sel.i];
    if (!cmd || (cmd.k !== 'wait' && cmd.k !== 'until')) return;
    edit(() => { if (cmd.k === 'wait') cmd.n = Math.max(1, cmd.n + d); else cmd.t = Math.max(0, cmd.t + d); });
    A.sfx('scrub');
  }
  function addWait() { addCmd({ k: 'wait', n: 2 }); }
  function addHold() { addCmd({ k: 'until', t: G.scrub }); toast('Holds until ' + S.fmtT(G.scrub)); }
  function delSel() {
    if (!G.sel) return toast('Click a step on the timeline first.');
    const r = G.def.crew[G.sel.ci];
    edit(() => { G.plan[r].splice(G.sel.i, 1); G.sel = G.plan[r].length ? { ci: G.sel.ci, i: Math.max(0, G.sel.i - 1) } : null; });
    A.sfx('remove');
  }
  function clearTrack() { edit(() => { G.plan[role()] = []; G.sel = null; }); A.sfx('remove'); toast(S.ROLES[role()].name + "'s track cleared. Z undoes."); }

  window.addEventListener('keydown', (e) => {
    A.resume();
    const k = e.key;
    if (k === 'm' || k === 'M') { A.setMuted(!A.isMuted()); return; }
    if (G.screen === 'title') { if (k === 'Enter' || k === ' ') goSelect(); return; }
    if (G.screen === 'select') {
      if (k === 'Escape') { G.screen = 'title'; A.setMode('title'); }
      if (k === 'Enter') openLevel(firstOpen());
      return;
    }
    if (G.screen === 'brief') { if (k === 'Enter' || k === ' ') { G.screen = 'plan'; A.setMode('plan'); } if (k === 'Escape') goSelect(); e.preventDefault(); return; }
    if (G.screen === 'result') {
      if (k === 'Enter' || k === 'n' || k === 'N') nextLevel();
      if (k === 'Escape') { G.screen = 'plan'; A.setMode('plan'); }
      if (k === 'r' || k === 'R') { G.screen = 'plan'; startPlay(0); }
      return;
    }
    if (G.screen !== 'plan') return;
    if (G.helpOpen && k !== '?') { G.helpOpen = false; }
    if (k >= '1' && k <= '4') selectCrew(+k - 1);
    else if (k === ' ') { e.preventDefault(); G.playing ? stopPlay() : startPlay(); }
    else if (k === 'r' || k === 'R') startPlay(0);
    else if (k === 'ArrowLeft') { if (G.playing) stopPlay(); setScrub(G.scrub - (e.shiftKey ? 10 : 1)); }
    else if (k === 'ArrowRight') { if (G.playing) stopPlay(); setScrub(G.scrub + (e.shiftKey ? 10 : 1)); }
    else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); delSel(); }
    else if (k === 'w' || k === 'W') addWait();
    else if (k === 'h' || k === 'H') addHold();
    else if (k === 'f' || k === 'F') toggleSkip();
    else if (k === '[') adjustWait(-1);
    else if (k === ']') adjustWait(1);
    else if ((k === 'z' || k === 'Z') || (k === 'u')) undo();
    else if (k === 'c' || k === 'C') clearTrack();
    else if (k === 'a' || k === 'A') { G.assist = !G.assist; save.opts.assist = G.assist; persist(); toast(G.assist ? 'Rehearsal marks ON: the timeline shows where someone would be seen.' : 'Rehearsal marks OFF'); }
    else if (k === 's' || k === 'S') cycleSpeed();
    else if (k === '?' || k === '/') G.helpOpen = !G.helpOpen;
    else if (k === 'Escape') { if (G.playing) stopPlay(); else if (G.sel) G.sel = null; else goSelect(); }
    else if (k === 'Tab') { e.preventDefault(); selectCrew((G.ci + 1) % G.def.crew.length); }
  });
  function toggleSkip() { G.skip = !G.skip; save.opts.skip = G.skip; persist(); toast(G.skip ? 'Quiet stretches fast-forward' : 'Playback at a steady pace', 1100); }
  function cycleSpeed() { G.speed = G.speed === 1 ? 2 : G.speed === 2 ? 4 : 1; toast('Playback ' + G.speed + '×', 900); }
  function goSelect() { G.screen = 'select'; G.playing = false; A.setMode('title'); }
  function firstOpen() { for (let i = 0; i < LV.length; i++) if (!save.best[LV[i].id] && unlocked(i)) return i; return 0; }
  function nextLevel() { if (G.li + 1 < LV.length) openLevel(G.li + 1); else goSelect(); }

  // ---------- playback ----------
  function startPlay(from) {
    const r = getReal();
    let t0 = from != null ? from : G.scrub;
    if (t0 >= r.end - 1) t0 = 0;
    G.playing = true; G.pt = t0; G.lastTick = t0; G.banner = null; G.fail = null; G.sel = G.sel;
    A.setMode(r.alarmT != null && t0 > r.alarmT ? 'alarm' : 'run'); A.sfx('go');
    G.firstGo = false;
  }
  function stopPlay() {
    G.playing = false; G.scrub = Math.floor(G.pt); A.setMode('plan');
  }
  function playStep(dt) {
    const r = getReal();
    // B-13 slow-mo on near-misses/close calls; B-14 auto fast-forward through quiet stretches
    let rate = 1;
    if (G.slowMs > 0) { rate = 0.3; G.slowMs -= dt; }
    G.ff = false;
    if (rate === 1 && G.skip && G.quiet && G.quiet[Math.floor(G.pt)] && G.quiet[Math.min(G.quiet.length - 1, Math.floor(G.pt) + 1)]) { rate = 3; G.ff = true; }
    G.pt += dt * rate * G.speed / TICK_MS;
    const n = Math.floor(G.pt);
    while (G.lastTick < n && G.lastTick < r.end) { G.lastTick++; tickEvents(r.frames[G.lastTick]); }
    if (G.pt >= r.end) {
      G.pt = r.end; G.playing = false; G.scrub = r.end;
      finish(r);
    }
    G.scrub = Math.min(Math.floor(G.pt), r.end);
  }
  function tileC(x, y) { const { T, ox, oy } = G.lay; return [ox + (x + 0.5) * T, oy + (y + 0.5) * T]; }
  function addFx(kind, x, y, extra) { G.fx.push(Object.assign({ kind, x, y, t0: performance.now() }, extra || {})); }
  function tickEvents(f) {
    let stepSound = false;
    f.crew.forEach((c) => { if (c.busy === 'walk') stepSound = true; if (c.busy === 'pick' || c.busy === 'smash') A.sfx('pick'); });
    if (stepSound) A.sfx('step');
    for (const ev of f.events) {
      switch (ev.e) {
        case 'glance': { const g = f.guards[ev.g]; addFx('q', g.x, g.y); A.sfx('glance'); G.slowMs = 900; break; }
        case 'near': { const c = f.crew[ev.c]; addFx('near', c.x, c.y, { sx: ev.x, sy: ev.y }); A.sfx('near'); G.slowMs = Math.max(G.slowMs, 650); break; }
        case 'bust': case 'bark': { const g = (ev.e === 'bark' ? f.dogs : f.guards)[ev.g]; addFx('bang', g.x, g.y); const c = f.crew[ev.c]; addFx('ring', c.x, c.y); A.sfx('bust'); break; }
        case 'alarm': addFx('alarm', ev.x, ev.y); A.sfx('alarm'); A.setMode('alarm'); break;
        case 'unlock': addFx('word', ev.x, ev.y, { s: 'CLICK' }); A.sfx('unlock'); break;
        case 'safe': addFx('word', ev.x, ev.y, { s: 'CRACKED' }); A.sfx('safe'); break;
        case 'grab': addFx('spark', ev.x, ev.y); A.sfx('grab'); break;
        case 'toss': addFx('coin', ev.x, ev.y, { fx: ev.fx, fy: ev.fy }); A.sfx('toss'); break;
        case 'noise': addFx('ripple', ev.x, ev.y); break;
        case 'hear': { const g = f.guards[ev.g]; addFx('q', g.x, g.y, { col: P.mustard }); A.sfx('hear'); break; }
        case 'chat': { A.sfx('chat'); const g = f.guards[ev.g]; addFx('word', g.x, g.y, { s: '“Evening!”', col: P.red }); break; }
        case 'ko': addFx('word', ev.x, ev.y, { s: 'KO' }); A.sfx('ko'); break;
        case 'smash': addFx('word', ev.x, ev.y, { s: 'CRASH' }); addFx('ripple', ev.x, ev.y); A.sfx('smash'); break;
        case 'loop': addFx('word', ev.x, ev.y, { s: 'LOOPED', col: P.blue }); A.sfx('loop'); break;
        case 'out': A.sfx('out'); break;
      }
    }
  }
  const WHY = {
    busted: ['BUSTED', 'Spotted. Drag the clock back to just before it went wrong, tweak, and press GO.'],
    lockdown: ['LOCKDOWN', 'The alarm sealed the doors before the crew got out.'],
    nomark: ['NO PRIZE', 'Everyone got out, but nobody brought the ★ mark.'],
    time: ['OUT OF TIME', 'Somebody never made it back to the exit. End every track on an exit tile.'],
  };
  function finish(r) {
    if (r.result.ok) {
      const st = S.stamps(r, G.L);
      const b = save.best[G.def.id] || {};
      save.best[G.def.id] = { t: Math.min(b.t || 1e9, r.end), ghost: b.ghost || st.ghost, greedy: b.greedy || st.greedy, swift: b.swift || st.swift };
      persist();
      G.result = { r, st, prevBest: b };
      A.sfx('win'); A.setMode('title');
      G.banner = { s: 'CLEAN GETAWAY', until: performance.now() + 1400, col: P.teal };
      setTimeout(() => { if (G.result && G.screen === 'plan') G.screen = 'result'; }, 1300);
    } else {
      const w = WHY[r.result.why] || ['FAILED', ''];
      G.fail = r.result; G.banner = { s: w[0], sub: w[1], until: performance.now() + 4200, col: P.red };
      if (r.result.why === 'time') { G.scrub = Math.min(G.scrub, Math.max(G.pv.end, 0)); }
      A.setMode('plan');
    }
  }

  // ---------- blocks ----------
  const KIND = {
    go: ['WALK', null], wait: ['WAIT', P.grey], until: ['HOLD', P.grey], pick: ['PICK', P.teal], grab: ['GRAB', P.mustard], chat: ['CHAT', P.red],
    toss: ['COIN', P.red], ko: ['KO', P.mustard], smash: ['SMASH', P.mustard], loop: ['LOOP', P.blue],
  };
  let blockCache = { key: '', list: [] };
  function blocks() {
    const key = planKey() + G.pv.end;
    if (blockCache.key === key) return blockCache.list;
    const out = [], fr = G.pv.frames, { y0, rh } = tlRows();
    G.def.crew.forEach((ro, ci) => {
      const q = G.plan[ro];
      let lastEnd = 0;
      q.forEach((cmd, i) => {
        let a = -1, b = -1;
        for (let t = 1; t < fr.length; t++) if (fr[t].crew[ci].act === i) { if (a < 0) a = t - 1; b = t; }
        let ghost = false;
        if (a < 0) {
          let passed = -1; for (let t = 0; t < fr.length; t++) if (fr[t].crew[ci].qi > i) { passed = t; break; }
          if (passed >= 0) { a = b = passed; } else { ghost = true; a = lastEnd; b = lastEnd + 3; }
        }
        lastEnd = Math.max(lastEnd, b);
        out.push({ ci, i, cmd, a, b, ghost, y: y0 + ci * rh + 3, h: rh - 6 });
      });
    });
    blockCache = { key, list: out };
    return out;
  }
  function blockAt(p) {
    const bl = blocks();
    for (const b of bl) { const x0 = tx(b.a), x1 = Math.max(tx(b.b), x0 + 10); if (p.x >= x0 - 2 && p.x <= x1 + 2 && p.y >= b.y && p.y <= b.y + b.h) return b; }
    return null;
  }

  // ---------- drawing ----------
  function btn(x, y, w, h, label, fn, opts) {
    opts = opts || {};
    const hov = mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h;
    ctx.fillStyle = opts.bg || (hov ? P.ink : P.ink2); R.roundRect(ctx, x, y, w, h, 4); ctx.fill();
    if (opts.on) { ctx.strokeStyle = P.orange; ctx.lineWidth = 2; ctx.stroke(); }
    R.text(ctx, label, x + w / 2, y + h / 2 + 1, opts.sz || 12, opts.fg || P.cream, { align: 'center', base: 'middle', w: 800, track: 1 });
    buttons.push({ x, y, w, h, fn });
  }
  function paper() {
    ctx.fillStyle = P.paper; ctx.fillRect(0, 0, W, H);
    const g = R.grain(); for (let y = 0; y < H; y += 256) for (let x = 0; x < W; x += 256) ctx.drawImage(g, x, y);
  }

  function drawTitle(now) {
    paper();
    const t = now / 1000;
    // big slabs sliding in
    ctx.fillStyle = P.ink; ctx.fillRect(0, 0, W, 120 + Math.sin(t * 0.7) * 6);
    ctx.save(); ctx.translate(W * 0.7, H * 0.52); ctx.rotate(-0.12);
    ctx.fillStyle = P.orange; ctx.fillRect(-520, -60, 1100, 120); ctx.restore();
    // gear
    ctx.save(); ctx.translate(980, 300); ctx.rotate(t * 0.4);
    ctx.fillStyle = P.ink; ctx.beginPath();
    for (let i = 0; i < 24; i++) { const a = i * Math.PI / 12, rr = i % 2 ? 150 : 175; ctx.lineTo(Math.cos(a - 0.1) * rr, Math.sin(a - 0.1) * rr); ctx.lineTo(Math.cos(a + 0.1) * rr, Math.sin(a + 0.1) * rr); }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = P.paper; ctx.beginPath(); ctx.arc(0, 0, 70, 0, 7); ctx.fill();
    ctx.restore();
    // keyhole in gear
    ctx.fillStyle = P.red; ctx.beginPath(); ctx.arc(980, 285, 26, 0, 7); ctx.fill(); ctx.beginPath(); ctx.moveTo(966, 295); ctx.lineTo(994, 295); ctx.lineTo(1004, 345); ctx.lineTo(956, 345); ctx.closePath(); ctx.fill();
    R.text(ctx, 'CLOCKWORK', 70, 300, 132, P.ink, { w: 900, squash: 0.82 });
    R.text(ctx, 'HEIST', 76, 448, 168, P.red, { w: 900, squash: 0.86 });
    R.text(ctx, 'A CAPER IN FIFTEEN JOBS', 82, 82, 22, P.paper, { track: 8 });
    // silhouettes walking along the orange bar
    const cols = [P.teal, P.red, P.mustard, P.blue];
    for (let i = 0; i < 4; i++) {
      const x = ((t * 60 + i * 70) % 1500) - 120, y = 560 - (x - 300) * Math.tan(0.12) * 0;
      ctx.save(); ctx.translate(x, 600 - x * 0.12 + 40); ctx.fillStyle = cols[i];
      ctx.beginPath(); ctx.arc(0, -64, 14, 0, 7); ctx.fill(); ctx.fillRect(-12, -50, 24, 44);
      const sw = Math.sin(t * 8 + i) * 8; ctx.fillRect(-10 + sw, -8, 8, 30); ctx.fillRect(2 - sw, -8, 8, 30); ctx.restore();
    }
    ctx.fillStyle = P.ink; ctx.fillRect(0, H - 90, W, 90);
    const blink = Math.floor(t * 2) % 2;
    R.text(ctx, blink ? 'CLICK OR PRESS ENTER' : '', W / 2, H - 38, 24, P.paper, { align: 'center', track: 6 });
    R.text(ctx, 'v' + (window.CH_VERSION || 'dev'), W - 20, H - 14, 12, P.grey, { align: 'right' });
  }

  function drawSelect(now) {
    paper();
    ctx.fillStyle = P.ink; ctx.fillRect(0, 0, W, 110);
    R.text(ctx, 'THE JOBS', 60, 82, 64, P.paper, { w: 900, squash: 0.85 });
    const done = LV.filter((l) => save.best[l.id]).length;
    R.text(ctx, done + ' / ' + LV.length + ' PULLED', W - 60, 76, 22, P.orange, { align: 'right', track: 4 });
    const cols = 5, cw = 220, ch = 172, gx = 30, gy = 18, x0 = (W - (cols * cw + (cols - 1) * gx)) / 2, y0 = 140;
    LV.forEach((l, i) => {
      const x = x0 + (i % cols) * (cw + gx), y = y0 + Math.floor(i / cols) * (ch + gy);
      const ok = unlocked(i), b = save.best[l.id];
      const hov = mouse.x >= x && mouse.x <= x + cw && mouse.y >= y && mouse.y <= y + ch;
      ctx.fillStyle = P.ink; ctx.fillRect(x + 6, y + 6, cw, ch);
      ctx.fillStyle = ok ? (hov ? P.cream : '#f7eedb') : P.paper2; ctx.fillRect(x, y, cw, ch);
      ctx.fillStyle = [P.orange, P.red, P.teal, P.mustard, P.blue][i % 5]; ctx.fillRect(x, y, 56, ch);
      R.text(ctx, String(i + 1).padStart(2, '0'), x + 28, y + 52, 34, P.cream, { align: 'center', w: 900 });
      if (!ok) { R.text(ctx, 'LOCKED', x + 138, y + 100, 18, P.grey, { align: 'center', track: 4 }); return; }
      wrap(l.name.toUpperCase(), x + 68, y + 36, cw - 76, 20, P.ink, 22);
      R.text(ctx, l.city, x + 68, y + 100, 13, P.grey, {});
      // crew dots
      l.crew.forEach((r, k) => { R.drawCrew(ctx, r, x + 80 + k * 30, y + 124, 26, null, now); });
      // stamps
      ['ghost', 'greedy', 'swift'].forEach((s, k) => stamp(ctx, x + 82 + k * 46, y + 154, s, b && b[s], 0.7));
      if (b) R.text(ctx, '✓', x + 28, y + 146, 30, P.cream, { align: 'center' });
      if (ok) buttons.push({ x, y, w: cw, h: ch, fn: () => openLevel(i) });
    });
    btn(30, H - 50, 140, 34, '◂ TITLE', () => { G.screen = 'title'; });
    R.text(ctx, 'Stamps: GHOST no alarm, no KO · GREEDY all loot · SWIFT beat par', W / 2, H - 28, 15, P.ink2, { align: 'center' });
    muteBtn();
  }
  function wrap(s, x, y, w, lh, col, sz) {
    const words = s.split(' '); let line = '', yy = y;
    ctx.font = R.font(sz, 900);
    for (const wd of words) { const tst = line ? line + ' ' + wd : wd; if (ctx.measureText(tst).width > w && line) { R.text(ctx, line, x, yy, sz, col, { w: 900 }); line = wd; yy += lh + 4; } else line = tst; }
    if (line) R.text(ctx, line, x, yy, sz, col, { w: 900 });
    return yy;
  }
  function wrapPlain(s, x, y, w, lh, col, sz, wt) {
    const words = s.split(' '); let line = '', yy = y;
    ctx.font = R.font(sz, wt || 500);
    for (const wd of words) { const tst = line ? line + ' ' + wd : wd; if (ctx.measureText(tst).width > w && line) { R.text(ctx, line, x, yy, sz, col, { w: wt || 500 }); line = wd; yy += lh; } else line = tst; }
    if (line) R.text(ctx, line, x, yy, sz, col, { w: wt || 500 });
    return yy;
  }
  const STAMP = { ghost: ['GHOST', P.blue], greedy: ['GREEDY', P.mustard], swift: ['SWIFT', P.red] };
  function stamp(c, x, y, s, got, k, dark) {
    k = k || 1; const [lbl, col] = STAMP[s];
    const off = dark ? 'rgba(239,228,204,0.3)' : 'rgba(23,20,18,0.25)';
    c.save(); c.translate(x, y); c.rotate(-0.12); c.scale(k, k);
    c.strokeStyle = got ? col : off; c.lineWidth = 3;
    c.strokeRect(-28, -12, 56, 24);
    if (got) { c.fillStyle = col; c.globalAlpha = 0.15; c.fillRect(-28, -12, 56, 24); c.globalAlpha = 1; }
    R.text(c, lbl, 0, 1, 12, got ? (dark ? '#fbf4e2' : col) : off, { align: 'center', base: 'middle', w: 900, track: 1 });
    c.restore();
  }

  function drawBrief(now) {
    paper();
    const d = G.def;
    ctx.fillStyle = P.ink; ctx.fillRect(0, 0, W, 300);
    ctx.save(); ctx.translate(0, 300); ctx.rotate(-0.04); ctx.fillStyle = P.orange; ctx.fillRect(-20, -30, W + 60, 52); ctx.restore();
    R.text(ctx, 'JOB ' + String(G.li + 1).padStart(2, '0'), 70, 90, 26, P.orange, { track: 10 });
    R.text(ctx, d.name.toUpperCase(), 66, 200, 86, P.paper, { w: 900, squash: 0.8 });
    R.text(ctx, d.city.toUpperCase(), 72, 250, 20, P.grey, { track: 8 });
    wrapPlain(d.blurb, 72, 380, 640, 34, P.ink, 26, 600);
    R.text(ctx, 'THE CREW', 800, 380, 20, P.red, { track: 6 });
    d.crew.forEach((r, i) => {
      const y = 420 + i * 62;
      R.drawCrew(ctx, r, 826, y, 46, null, now);
      R.text(ctx, S.ROLES[r].name, 866, y - 4, 22, P.ink, { w: 900 });
      R.text(ctx, ROLE_LINE[r], 866, y + 18, 14, P.ink2, {});
    });
    const b = save.best[d.id];
    ['ghost', 'greedy', 'swift'].forEach((s, k) => stamp(ctx, 110 + k * 76, 560, s, b && b[s]));
    R.text(ctx, 'PAR ' + (d.par ? S.fmtT(d.par) : '—'), 72, 620, 18, P.ink2, { track: 4 });
    btn(W - 300, H - 90, 240, 54, 'PLAN THE JOB ▸', () => { G.screen = 'plan'; A.setMode('plan'); }, { bg: P.red, sz: 18 });
    btn(60, H - 80, 140, 34, '◂ JOBS', goSelect);
    muteBtn();
  }
  const ROLE_LINE = {
    pick: 'Picks locks (3 s) and cracks safes (6 s).',
    charm: 'Disguised outside red zones. Chats up guards. Right-click: toss a coin.',
    muscle: 'KOs a guard from behind. Smashes cracked walls. Carries gold.',
    eye: 'Loops cameras and lasers at a blue panel (10 s).',
  };

  function muteBtn() { btn(W - 54, H - 44, 40, 30, A.isMuted() ? '♪×' : '♪', () => A.setMuted(!A.isMuted())); }

  function drawPlan(now) {
    paper();
    const L = G.L, lay = G.lay, { T, ox, oy } = lay;
    const r = G.playing ? getReal() : null;
    const ti = G.playing ? Math.floor(G.pt) : G.scrub;
    const fr = G.playing ? r.frames : G.pv.frames;
    const idx = Math.min(ti, fr.length - 1);
    const f = fr[idx], prev = fr[Math.max(0, idx - 1)];
    const k = G.playing ? Math.min(1, G.pt - Math.floor(G.pt)) : 1;
    const fNext = G.playing ? fr[Math.min(fr.length - 1, idx + 1)] : f;
    // header
    ctx.fillStyle = P.ink; ctx.fillRect(0, 0, W, 64);
    R.text(ctx, String(G.li + 1).padStart(2, '0'), 24, 46, 34, P.orange, { w: 900 });
    R.text(ctx, G.def.name.toUpperCase(), 76, 44, 30, P.paper, { w: 900, squash: 0.86 });
    const b = save.best[G.def.id];
    ['ghost', 'greedy', 'swift'].forEach((s, i) => stamp(ctx, W - 330 + i * 64, 32, s, b && b[s], 0.85, true));
    R.text(ctx, 'PAR ' + (G.def.par ? S.fmtT(G.def.par) : '—'), W - 24, 38, 13, P.grey, { align: 'right', track: 2 });
    // hint strip
    if (G.def.hint && !G.playing) { wrapPlain(G.def.hint, 24, 84, W - 48, 18, P.ink2, 15, 600); }
    // map (interpolated during play)
    const drawF = G.playing ? fNext : f;
    R.drawMap(ctx, L, drawF, lay, now, {});
    // guard routes (faint)
    if (!G.playing) {
      ctx.save(); ctx.setLineDash([2, 6]); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(23,20,18,0.28)';
      G.pv.frames[0].guards.forEach((g0, gi) => { ctx.beginPath(); G.pv.frames.forEach((fr2, j) => { const g = fr2.guards[gi]; const [x, y] = tileC(g.x, g.y); j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); });
      G.pv.frames[0].dogs.forEach((g0, gi) => { ctx.beginPath(); G.pv.frames.forEach((fr2, j) => { const g = fr2.dogs[gi]; const [x, y] = tileC(g.x, g.y); j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); });
      ctx.restore();
    }
    // cones
    const hot = G.fail && G.fail.by === 'guard' && !G.playing && G.scrub >= G.fail.t - 1 && G.scrub <= G.fail.t ? G.fail.g : -1;
    R.drawCones(ctx, L, G.playing ? fNext : f, lay, G.playing ? k : 1, { prev: G.playing ? f : null, hotGuard: hot });
    // planned paths
    const pf = G.pv.frames;
    G.def.crew.forEach((ro, ci) => {
      ctx.save(); ctx.strokeStyle = R.ROLE_COL[ro]; ctx.lineWidth = ci === G.ci ? 4 : 2.5; ctx.globalAlpha = G.playing ? 0.25 : (ci === G.ci ? 0.9 : 0.5);
      ctx.setLineDash(ci === G.ci ? [] : [8, 6]); ctx.lineJoin = 'round';
      ctx.beginPath(); let lx = null, ly = null;
      const off = (ci - (G.def.crew.length - 1) / 2) * 3;
      pf.forEach((fr2, j) => { const c = fr2.crew[ci]; if (c.out && j > 0 && pf[j - 1].crew[ci].out) return; const [x, y] = tileC(c.x, c.y); if (x === lx && y === ly) return; if (lx == null) ctx.moveTo(x + off, y + off); else ctx.lineTo(x + off, y + off); lx = x; ly = y; });
      ctx.stroke(); ctx.restore();
    });
    // action markers from plan
    if (!G.playing) drawActionMarkers();
    // actors
    const now2 = now;
    const IP = (a, b2) => R.lerp(a, b2, R.ease(k));
    const fa = G.playing ? f : f, fb = G.playing ? fNext : f;
    fb.dogs.forEach((g, i) => { const pg = fa.dogs[i]; const [x, y] = tileC(IP(pg.x, g.x), IP(pg.y, g.y)); R.drawDog(ctx, x, y, R.lerpA(pg.a, g.a, Math.min(1, k * 2)), T, now2); });
    fb.guards.forEach((g, i) => {
      const pg = fa.guards[i]; const [x, y] = tileC(IP(pg.x, g.x), IP(pg.y, g.y));
      R.drawGuard(ctx, x, y, R.lerpA(pg.a, g.a, Math.min(1, k * 2)), T, g, now2);
      if (g.held > 0) { R.text(ctx, '♥', x + T * 0.3, y - T * 0.35, T * 0.4, P.red, { align: 'center' }); }
      else if (g.mode === 'inv' || g.mode === 'look' || g.mode === 'look2') R.text(ctx, '?', x + T * 0.32, y - T * 0.3, T * 0.5, P.mustard, { align: 'center', w: 900 });
    });
    fb.crew.forEach((c, i) => {
      const pc = fa.crew[i];
      if (c.out && pc.out) return;
      const [x, y] = tileC(IP(pc.x, c.x), IP(pc.y, c.y));
      if (!G.playing && c.out) return;
      const disg = G.def.crew[i] === 'charm' && !S.inZone(L, c.x, c.y);
      if (disg) { ctx.save(); ctx.strokeStyle = P.red; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.5; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.arc(x, y, T * 0.45, 0, 7); ctx.stroke(); ctx.restore(); }
      R.drawCrew(ctx, G.def.crew[i], x, y, T, c, now2, !G.playing && i === G.ci);
      R.drawWork(ctx, x, y, T, c);
    });
    // fail marker
    if (G.fail && !G.playing && G.fail.c != null && Math.abs(G.scrub - G.fail.t) <= 2) {
      const c = f.crew[G.fail.c]; const [x, y] = tileC(c.x, c.y);
      ctx.strokeStyle = P.red; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, T * 0.62 + Math.sin(now / 100) * 3, 0, 7); ctx.stroke();
    }
    drawFx(now);
    // hover tip
    if (G.hover && !G.playing) hoverTip(f);
    // alarm vignette
    if (G.playing && r.alarmT != null && G.pt >= r.alarmT) {
      const a = 0.25 + 0.15 * Math.sin(now / 120);
      ctx.strokeStyle = `rgba(200,49,43,${a})`; ctx.lineWidth = 18; ctx.strokeRect(9, 9, W - 18, H - 18);
      const left = Math.max(0, S.K.LOCKDOWN - (Math.floor(G.pt) - r.alarmT));
      R.text(ctx, 'LOCKDOWN ' + S.fmtT(left), W / 2, oy - 8, 22, P.red, { align: 'center', w: 900, track: 4 });
    }
    if (G.playing) { // letterbox feel
      ctx.fillStyle = 'rgba(23,20,18,0.85)'; ctx.fillRect(0, 64, W, 6);
    }
    drawTimeline(now);
    drawBanner(now);
    if (G.toast && now < G.toast.until) {
      ctx.font = R.font(16, 700); const w2 = ctx.measureText(G.toast.s).width + 40;
      ctx.fillStyle = P.ink; R.roundRect(ctx, (W - w2) / 2, 548, w2, 36, 6); ctx.fill();
      R.text(ctx, G.toast.s, W / 2, 567, 16, P.paper, { align: 'center', base: 'middle', w: 700 });
    }
    if (G.helpOpen) drawHelp();
  }
  function drawActionMarkers() {
    const bl = blocks();
    for (const b of bl) {
      const c = b.cmd; if (b.ghost) continue;
      let x = c.x, y = c.y;
      if (c.k === 'chat' || c.k === 'ko') { const g = G.pv.frames[Math.min(b.b, G.pv.frames.length - 1)].guards[c.g]; x = g.x; y = g.y; }
      if (x == null) continue;
      const [px, py] = tileC(x, y), T = G.lay.T, col = R.ROLE_COL[G.def.crew[b.ci]];
      const sel = G.sel && G.sel.ci === b.ci && G.sel.i === b.i;
      ctx.save(); ctx.globalAlpha = b.ci === G.ci ? 1 : 0.55;
      if (c.k === 'go') { ctx.strokeStyle = col; ctx.lineWidth = sel ? 4 : 2.5; ctx.beginPath(); ctx.moveTo(px - T * 0.18, py - T * 0.18); ctx.lineTo(px + T * 0.18, py + T * 0.18); ctx.moveTo(px + T * 0.18, py - T * 0.18); ctx.lineTo(px - T * 0.18, py + T * 0.18); ctx.stroke(); }
      else if (c.k === 'toss') { ctx.strokeStyle = P.red; ctx.lineWidth = 2; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(px, py, T * 0.3, 0, 7); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = P.mustard; ctx.beginPath(); ctx.arc(px, py, T * 0.1, 0, 7); ctx.fill(); }
      else { ctx.strokeStyle = col; ctx.lineWidth = sel ? 4 : 2.5; ctx.strokeRect(px - T * 0.5 + 2, py - T * 0.5 + 2, T - 4, T - 4); }
      ctx.restore();
    }
  }
  function hoverTip(f) {
    const [x, y] = G.hover, c = f.tiles[y * G.L.w + x];
    const gi = f.guards.findIndex((g) => g.x === x && g.y === y && !g.ko);
    const di = f.dogs.findIndex((g) => g.x === x && g.y === y);
    let s = null;
    if (gi >= 0) s = role() === 'charm' ? 'Guard: click to chat him up (6 s)' : role() === 'muscle' ? 'Guard: click to knock him out (from behind)' : 'Guard: 2 looks = busted. 1 look = a close call.';
    else if (di >= 0) s = 'Dog: smells anyone within 2 tiles, disguise or not.';
    else s = ({ L: 'Locked door: PICK opens it (3 s). Guards have keys.', D: 'Door: blocks sight unless someone is in it.', S: 'Safe with the ★ mark: PICK cracks it (6 s).', s: 'Safe with cash: PICK cracks it (6 s).', '$': 'Cash (optional loot)', '*': 'The ★ mark. Get it out.', g: 'Gold: only MUSCLE can carry it, at half speed.', E: 'Exit. Every track must end here.', P: 'Panel: EYE loops cameras and lasers for 10 s.', '%': 'Cracked wall: MUSCLE smashes it (2 s). Loud.', x: 'Laser: on/off cycle. Crossing a live beam = alarm.', o: 'Furniture: blocks walking, not sight.' })[c];
    if (!s && S.inZone(G.L, x, y)) s = 'Red zone: CHARM\'s disguise does not work here.';
    if (!s) return;
    R.text(ctx, s, W / 2, 586, 14, P.ink2, { align: 'center', w: 700 });
  }
  function drawFx(now) {
    const T = G.lay.T;
    if (G.playing && G.slowMs > 0) { // slow-mo letterbox
      const k = Math.min(1, G.slowMs / 200); ctx.fillStyle = 'rgba(23,20,18,' + (0.85 * k) + ')';
      ctx.fillRect(0, 54, W, 14 * k); ctx.fillRect(0, TL.y - 22 - 14 * k, W, 14 * k);
    }
    if (G.playing && G.ff) R.text(ctx, '▸▸ quiet: skipping ahead', W / 2, TL.y - 16, 13, P.ink2, { align: 'center', w: 800, track: 2 });
    G.fx = G.fx.filter((e) => now - e.t0 < 1400);
    for (const e of G.fx) {
      const a = (now - e.t0) / 1400, [x, y] = tileC(e.x, e.y);
      ctx.save(); ctx.globalAlpha = 1 - a;
      switch (e.kind) {
        case 'q': R.text(ctx, '?', x, y - T * 0.6 - a * 20, T * 0.9, e.col || P.orange, { align: 'center', w: 900 }); break;
        case 'bang': R.text(ctx, '!', x, y - T * 0.6 - a * 10, T * 1.2, P.red, { align: 'center', w: 900 }); break;
        case 'ring': ctx.strokeStyle = P.red; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, T * (0.5 + a), 0, 7); ctx.stroke(); break;
        case 'ripple': ctx.strokeStyle = P.ink; ctx.lineWidth = 2; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x, y, T * (0.3 + a * 2.5 + i * 0.5), 0, 7); ctx.stroke(); } break;
        case 'word': { const fs = Math.max(14, T * 0.4), wy = y - T * 0.95 - a * 16; ctx.font = R.font(fs, 900); const tw = ctx.measureText(e.s).width + e.s.length * 2 + 12;
          ctx.fillStyle = e.col || P.ink; ctx.fillRect(x - tw / 2, wy - fs * 0.95, tw, fs * 1.25);
          R.text(ctx, e.s, x, wy, fs, P.paper, { align: 'center', w: 900, track: 2 }); break; }
        case 'spark': ctx.strokeStyle = P.mustard; ctx.lineWidth = 3; for (let i = 0; i < 8; i++) { const an = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(x + Math.cos(an) * T * 0.3 * (1 + a), y + Math.sin(an) * T * 0.3 * (1 + a)); ctx.lineTo(x + Math.cos(an) * T * 0.6 * (1 + a), y + Math.sin(an) * T * 0.6 * (1 + a)); ctx.stroke(); } break;
        case 'coin': { const [fx, fy] = tileC(e.fx, e.fy), q = Math.min(1, a * 3); const cx = R.lerp(fx, x, q), cy = R.lerp(fy, y, q) - Math.sin(q * Math.PI) * T * 1.5; ctx.fillStyle = P.mustard; ctx.beginPath(); ctx.arc(cx, cy, T * 0.12, 0, 7); ctx.fill(); break; }
        case 'near': { const [sx, sy] = tileC(e.sx, e.sy); ctx.strokeStyle = P.orange; ctx.lineWidth = 3; ctx.setLineDash([6, 5]);
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(R.lerp(sx, x, 0.85), R.lerp(sy, y, 0.85)); ctx.stroke(); ctx.setLineDash([]);
          ctx.beginPath(); ctx.arc(x, y, T * (0.55 + a * 0.3), 0, 7); ctx.stroke(); break; }
        case 'alarm': ctx.strokeStyle = P.red; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(x, y, T * (0.5 + a * 4), 0, 7); ctx.stroke(); break;
      }
      ctx.restore();
    }
  }
  function drawBanner(now) {
    const b = G.banner; if (!b || now > b.until) return;
    const a = Math.min(1, (b.until - now) / 300);
    ctx.save(); ctx.globalAlpha = a;
    ctx.save(); ctx.translate(W / 2, 300); ctx.rotate(-0.05);
    ctx.fillStyle = b.col; ctx.fillRect(-W, -64, W * 2, 128);
    R.text(ctx, b.s, 0, 26, 92, P.cream, { align: 'center', w: 900, squash: 0.85 });
    ctx.restore();
    if (b.sub) { ctx.fillStyle = P.ink; const w2 = 760; ctx.fillRect((W - w2) / 2, 390, w2, 40); R.text(ctx, b.sub, W / 2, 411, 16, P.paper, { align: 'center', base: 'middle', w: 600 }); }
    ctx.restore();
  }
  function drawHelp() {
    ctx.fillStyle = 'rgba(23,20,18,0.92)'; ctx.fillRect(160, 90, W - 320, 470);
    const lines = [
      ['1–4 / Tab', 'pick a crew member'], ['Click floor', 'walk there'], ['Click object/guard', 'act on it (pick, grab, chat, KO, smash, loop)'],
      ['Right-click', 'CHARM tosses a coin: nearby guards come to look'], ['W', 'add a 1 s wait'], ['H / Shift-click a track', 'hold until that time (snaps to orange ticks: guard turns, laser flips)'], ['Drag a step', 'slide it later or earlier (adds a hold)'], ['F', 'auto fast-forward quiet stretches'],
      ['[ ] / scroll / drag', 'shorten or lengthen the selected wait'], ['Del', 'delete the selected step   ·   Z undo   ·   C clear track'],
      ['← → / drag clock', 'scrub time'], ['Space', 'GO from the clock (or pause)   ·   R replay from the start'], ['S', 'playback speed   ·   A rehearsal marks   ·   M mute'],
    ];
    R.text(ctx, 'HOW TO PLAN A HEIST', W / 2, 140, 30, P.orange, { align: 'center', w: 900, track: 4 });
    lines.forEach(([k, v], i) => { R.text(ctx, k, 420, 184 + i * 26, 15, P.paper, { align: 'right', w: 800 }); R.text(ctx, v, 440, 184 + i * 26, 15, P.paper2, { w: 500 }); });
  }

  function drawTimeline(now) {
    const { y0, rh } = tlRows(), n = G.def.crew.length, sp = span();
    ctx.fillStyle = P.ink; ctx.fillRect(0, TL.y - 8, W, H - TL.y + 8);
    // ruler
    ctx.fillStyle = P.ink2; ctx.fillRect(TL.x, TL.y, TL.w, TL.rulerH);
    for (let t = 0; t <= sp; t += 2) {
      const x = tx(t), major = t % 10 === 0;
      ctx.fillStyle = major ? P.paper2 : 'rgba(239,228,204,0.35)'; ctx.fillRect(x, TL.y + (major ? 4 : 12), 1.5, major ? 18 : 10);
      if (major) R.text(ctx, S.fmtT(t).replace('.5', ''), x + 4, TL.y + 15, 11, P.paper2, {});
    }
    // rows
    G.def.crew.forEach((ro, ci) => {
      const y = y0 + ci * rh, sel = ci === G.ci;
      ctx.fillStyle = sel ? '#3a332e' : '#26211e'; ctx.fillRect(TL.x, y, TL.w, rh - 2);
      // card
      ctx.fillStyle = sel ? R.ROLE_COL[ro] : '#2f2a26'; ctx.fillRect(20, y, 184, rh - 2);
      R.drawCrew(ctx, ro, 40, y + rh / 2 - 1, Math.min(30, rh * 0.8), null, now);
      R.text(ctx, (ci + 1) + ' ' + S.ROLES[ro].name, 62, y + rh / 2 + 1, 15, P.cream, { w: 900, track: 2 });
      const c = G.pv.frames[G.pv.frames.length - 1].crew[ci];
      if (!G.plan[ro].length) R.text(ctx, 'no plan yet', 62, y + rh / 2 + 13, 10, P.paper2, {});
      else if (!c.out) R.text(ctx, '⚑ not out', 62, y + rh / 2 + 13, 10, P.mustard, { w: 700 });
    });
    // blocks
    for (const b of blocks()) {
      const x0 = tx(b.a), x1 = tx(b.b), w = Math.max(x1 - x0, 6);
      const [lbl, col0] = KIND[b.cmd.k] || ['?', P.grey];
      const col = col0 || R.ROLE_COL[G.def.crew[b.ci]];
      const sel = G.sel && G.sel.ci === b.ci && G.sel.i === b.i;
      ctx.save(); ctx.globalAlpha = b.ghost ? 0.35 : 1;
      if (b.cmd.k === 'go') { ctx.fillStyle = col; ctx.globalAlpha *= 0.55; ctx.fillRect(x0, b.y + b.h * 0.3, w, b.h * 0.4); ctx.globalAlpha = b.ghost ? 0.35 : 1; }
      else if (b.cmd.k === 'wait' || b.cmd.k === 'until') { ctx.strokeStyle = P.paper2; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]); ctx.strokeRect(x0 + 0.5, b.y + 0.5, w - 1, b.h - 1); ctx.setLineDash([]); }
      else { ctx.fillStyle = col; ctx.fillRect(x0, b.y, w, b.h); }
      if (sel) { ctx.strokeStyle = P.orange; ctx.lineWidth = 3; ctx.strokeRect(x0 - 1.5, b.y - 1.5, w + 3, b.h + 3); }
      ctx.save(); ctx.beginPath(); ctx.rect(x0, b.y, Math.max(w, 40), b.h); ctx.clip();
      if (w > 26 || b.cmd.k !== 'go') R.text(ctx, lbl, x0 + 4, b.y + b.h / 2 + 4, 10, b.cmd.k === 'wait' || b.cmd.k === 'until' ? P.paper2 : P.cream, { w: 900, track: 1 });
      ctx.restore();
      ctx.restore();
    }
    // rehearsal marks (assist) and real-run fail
    if (G.assist) {
      for (const m of G.pv.marks) { const x = tx(m.t); ctx.fillStyle = m.e === 'bust' ? P.red : P.mustard; ctx.fillRect(x - 1, TL.y, 3, TL.rulerH); }
    }
    if (G.fail) { const x = tx(G.fail.t); ctx.fillStyle = P.red; ctx.beginPath(); ctx.moveTo(x, TL.y + TL.rulerH); ctx.lineTo(x - 7, TL.y); ctx.lineTo(x + 7, TL.y); ctx.fill(); ctx.fillRect(x - 1, y0, 2, n * rh); }
    if (G.real && G.real.alarmT != null && G.realKey === planKey()) { const x = tx(G.real.alarmT); ctx.fillStyle = P.mustard; ctx.fillRect(x - 1, TL.y, 3, TL.rulerH + n * rh + 6); }
    const showSnaps = (G.drag && G.drag.kind !== 'scrub') || (mouse.y >= TL.y && mouse.y <= TL.y + 190 && mouse.x >= TL.x && mouse.x <= TL.x + TL.w && !G.playing) || Q.get('snaps');
    if (showSnaps) for (const t of G.snaps || []) { const x = tx(t); if (x > TL.x + TL.w) break; ctx.fillStyle = P.paper; ctx.beginPath(); ctx.moveTo(x - 5, TL.y + TL.rulerH - 1); ctx.lineTo(x + 5, TL.y + TL.rulerH - 1); ctx.lineTo(x, TL.y + TL.rulerH + 6); ctx.fill(); }
    // scrubber
    const sx = tx(G.playing ? G.pt : G.scrub);
    ctx.fillStyle = P.orange; ctx.fillRect(sx - 1.5, TL.y - 4, 3, TL.rulerH + 10 + n * rh);
    ctx.beginPath(); ctx.moveTo(sx - 8, TL.y - 6); ctx.lineTo(sx + 8, TL.y - 6); ctx.lineTo(sx, TL.y + 6); ctx.fill();
    // clock + GO
    const t = G.playing ? Math.floor(G.pt) : G.scrub;
    R.text(ctx, S.fmtT(t), 1208, TL.y + 30, 30, P.paper, { align: 'center', w: 900 });
    const goLabel = G.playing ? 'PAUSE' : (G.scrub > 0 && G.scrub < getRealEnd() - 1 ? 'GO ▸' : 'GO');
    const gx = 1208, gy = TL.y + 92, rr = 44;
    const hov = Math.hypot(mouse.x - gx, mouse.y - gy) < rr;
    ctx.fillStyle = G.playing ? P.grey : (hov ? P.red : P.orange); ctx.beginPath(); ctx.arc(gx, gy, rr, 0, 7); ctx.fill();
    R.text(ctx, goLabel, gx, gy + 1, goLabel.length > 3 ? 18 : 26, P.cream, { align: 'center', base: 'middle', w: 900 });
    buttons.push({ x: gx - rr, y: gy - rr, w: rr * 2, h: rr * 2, fn: () => (G.playing ? stopPlay() : startPlay()) });
    if (!G.playing && G.scrub > 0) R.text(ctx, 'from ' + S.fmtT(G.scrub), gx, gy + rr + 16, 11, P.paper2, { align: 'center' });
    // toolbar
    const ty = H - 26;
    const tb = [['W WAIT', addWait], ['H HOLD', addHold], ['DEL', delSel], ['Z UNDO', undo], ['C CLEAR', clearTrack], [G.speed + '× SPEED', cycleSpeed], ['A MARKS' + (G.assist ? ' ●' : ''), () => { G.assist = !G.assist; save.opts.assist = G.assist; persist(); }], ['F SKIP' + (G.skip ? ' ●' : ''), toggleSkip], ['? HELP', () => { G.helpOpen = !G.helpOpen; }], ['◂ JOBS', goSelect]];
    let bx = TL.x;
    tb.forEach(([l, fn]) => { ctx.font = R.font(11, 800); const w = ctx.measureText(l).width + 18; btn(bx, ty - 10, w, 22, l, fn, { sz: 11, bg: '#2f2a26' }); bx += w + 6; });
    R.text(ctx, G.playing ? 'Space: pause and tweak.' : 'Click the map to plan for ' + S.ROLES[role()].name + '.', TL.x + TL.w, ty + 4, 12, P.paper2, { align: 'right' });
    muteBtn();
  }
  function getRealEnd() { return G.real && G.realKey === planKey() ? G.real.end : G.pv.end; }

  function drawResult(now) {
    drawPlan(now);
    const res = G.result; if (!res) return;
    G.banner = null;
    ctx.fillStyle = 'rgba(23,20,18,0.78)'; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.translate(W / 2, 250); ctx.rotate(-0.04);
    ctx.fillStyle = P.orange; ctx.fillRect(-W, -80, W * 2, 160);
    R.text(ctx, 'THE JOB IS DONE', 0, 34, 104, P.ink, { align: 'center', w: 900, squash: 0.8 });
    ctx.restore();
    R.text(ctx, 'OUT IN ' + S.fmtT(res.r.end) + (G.def.par ? '   ·   PAR ' + S.fmtT(G.def.par) : ''), W / 2, 390, 26, P.paper, { align: 'center', track: 4, w: 800 });
    R.text(ctx, `loot ${res.r.loot}/${res.r.lootTotal}   ·   close calls ${res.r.glances}   ·   near misses ${res.r.nears}   ·   ${res.r.alarmed ? 'alarm raised' : 'no alarm'}   ·   ${res.r.kos} KO`, W / 2, 426, 17, P.paper2, { align: 'center' });
    ['ghost', 'greedy', 'swift'].forEach((s, i) => {
      const x = W / 2 - 170 + i * 170, y = 500, got = res.st[s];
      const pop = got ? 1 + 0.15 * Math.max(0, 1 - (now - G.t0r) / 300 + i * 0.4) : 1;
      stamp(ctx, x, y, s, got, 1.8 * pop);
    });
    R.text(ctx, 'GHOST: no alarm, no KO     GREEDY: all loot     SWIFT: out by par', W / 2, 560, 14, P.grey, { align: 'center' });
    btn(W / 2 - 330, 610, 200, 50, '↺ WATCH AGAIN', () => { G.screen = 'plan'; startPlay(0); }, { bg: P.ink2, sz: 15 });
    btn(W / 2 - 100, 610, 200, 50, '✎ REPLAN', () => { G.screen = 'plan'; A.setMode('plan'); }, { bg: P.ink2, sz: 15 });
    btn(W / 2 + 130, 610, 200, 50, G.li + 1 < LV.length ? 'NEXT JOB ▸' : 'ALL JOBS ▸', nextLevel, { bg: P.red, sz: 16 });
  }

  // ---------- loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(100, now - last); last = now;
    if (G.playing && G.screen === 'plan') playStep(dt);
    if (G.screen === 'result' && !G.t0r) G.t0r = now; if (G.screen !== 'result') G.t0r = 0;
    buttons.length = 0;
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    if (G.screen === 'title') drawTitle(now);
    else if (G.screen === 'select') drawSelect(now);
    else if (G.screen === 'brief') drawBrief(now);
    else if (G.screen === 'plan') drawPlan(now);
    else if (G.screen === 'result') drawResult(now);
    requestAnimationFrame(frame);
  }

  // ---------- boot (query params for testing/screenshots) ----------
  if (Q.get('mute') === '1') A.setMuted(true);
  const lvq = Q.get('level');
  if (lvq) {
    const i = LV.findIndex((l) => l.id === lvq || String(LV.indexOf(l) + 1) === lvq);
    openLevel(Math.max(0, i), Q.get('screen') || 'plan');
    if (Q.get('ci')) G.ci = +Q.get('ci');
    if (Q.get('scrub')) G.scrub = +Q.get('scrub');
    if (Q.get('assist')) G.assist = Q.get('assist') === '1';
    if (Q.get('help')) G.helpOpen = true;
    if (Q.get('play') != null) {
      startPlay(0); const target = +Q.get('play');
      const r = getReal();
      while (G.playing && G.pt < target) { playStep(TICK_MS / G.speed / 4); }
      if (Q.get('pause') === '1' && G.playing) { G.playing = false; }
      else if (G.playing) { G.pt = Math.min(G.pt, r.end); }
    }
    if (Q.get('screen') === 'result') { startPlay(0); while (G.playing) playStep(TICK_MS); G.screen = 'result'; }
  } else if (Q.get('screen') === 'select') goSelect();
  window.__CH = { G, S, openLevel, startPlay, stopPlay, getReal, recompute, save,
    blockXY: (ro, k) => { const ci = G.def.crew.indexOf(ro); const b = blocks().find((b) => b.ci === ci && b.cmd.k === (k || 'pick')); return b && { x: tx(b.a), y: b.y + b.h / 2, t: b.a }; },
    rowY: (ci) => { const { y0, rh } = tlRows(); return y0 + ci * rh + rh / 2; } };
  requestAnimationFrame(frame);
})();
