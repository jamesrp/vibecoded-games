// CLOCKWORK HEIST deterministic simulation. Works in the browser (window.CH) and Node (module.exports).
(function (root) {
  'use strict';
  const TICK_SEC = 0.5;
  const ROLES = {
    pick: { name: 'PICK', full: 'The Lockpick', col: '#1f7a74' },
    charm: { name: 'CHARM', full: 'The Charmer', col: '#c8312b' },
    muscle: { name: 'MUSCLE', full: 'The Muscle', col: '#d99a1e' },
    eye: { name: 'EYE', full: 'The Lookout', col: '#2b4f9e' },
  };
  const K = {
    PICK_DOOR: 6, PICK_SAFE: 12, GRAB: 1, CHAT: 12, SMASH: 4, LOOP_WORK: 2, LOOP: 20,
    GUARD_RANGE: 5, GUARD_HALF: 50 * Math.PI / 180, CAM_RANGE: 6, CAM_HALF: 30 * Math.PI / 180,
    DOG_RANGE: 2, NEAR_PAD: 1.6, NEAR_ANG: 30 * Math.PI / 180, HEAR: 6, TOSS: 6, LOOK: 6, LOCKDOWN: 20, MAXT: 360, CLOSE: 1.5,
  };
  // tiles: '#' wall, '.' floor, 'D' door, 'L' locked door, 'S' safe(mark) 's' safe(cash), '$' cash, '*' mark,
  // 'g' gold, 'E' exit, 'P' panel, 'C' camera mount, 'x' laser, '%' cracked wall, 'o' furniture, '1'-'4' starts
  const SOLID_CREW = new Set(['#', 'S', 's', 'P', 'C', 'o', 'L', '%', 'O']);
  const SIGHT_BLOCK = new Set(['#', 'S', 's', 'P', 'C', '%', 'D', 'L', 'O']);
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

  function parseLevel(def) {
    const h = def.map.length, w = Math.max(...def.map.map((r) => r.length));
    const tiles = [];
    const starts = {};
    let markCount = 0, lootTotal = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let c = def.map[y][x] || '#';
      if (c >= '1' && c <= '4') { starts[+c] = [x, y]; c = 'E'; }
      if (c === '*' || c === 'S') markCount++;
      if (c === '$' || c === 's' || c === 'g') lootTotal++;
      tiles.push(c);
    }
    const cams = (def.cams || []).map((c, i) => ({ id: i, x: c[0], y: c[1], dir: c[2] * Math.PI / 180, amp: (c[3] || 0) * Math.PI / 180, per: c[4] || 16, ph: c[5] || 0, range: c[6] || K.CAM_RANGE }));
    const panels = [];
    tiles.forEach((c, i) => { if (c === 'P') panels.push({ x: i % w, y: (i / w) | 0 }); });
    return { def, id: def.id, w, h, tiles, starts, cams, panels, markCount, lootTotal, zones: def.zones || [],
      laser: def.laser || { on: 6, off: 6, ph: 0 }, crew: def.crew };
  }

  function inZone(L, x, y) {
    for (const z of L.zones) if (x >= z[0] && x <= z[2] && y >= z[1] && y <= z[3]) return true;
    return false;
  }

  function camAngle(c, t) {
    if (!c.amp) return c.dir;
    // triangle sweep, deterministic, period c.per ticks for a full back-and-forth
    const p = ((t + c.ph) % c.per) / c.per;
    const tri = p < 0.5 ? (p * 4 - 1) : (3 - p * 4);
    return c.dir + c.amp * tri;
  }
  function laserOn(L, t) { const { on, off, ph } = L.laser; return ((t + (ph || 0)) % (on + off)) < on; }

  function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d); }

  // ---------- state ----------
  function initState(L, plan) {
    const crew = L.crew.map((role, i) => {
      const s = L.starts[i + 1] || [0, 0];
      return { role, x: s[0], y: s[1], px: s[0], py: s[1], q: (plan[role] || []).map((c) => Object.assign({}, c)), qi: 0,
        prog: 0, out: false, carry: [], busy: null, slow: 0, stuck: 0, gone: false };
    });
    const guards = (L.def.guards || []).map((g, i) => mkGuard(g, i, false));
    const dogs = (L.def.dogs || []).map((g, i) => mkGuard(g, i, true));
    return { t: 0, tiles: L.tiles.slice(), crew, guards, dogs, loopT: 0, alarm: -1, alarmSrc: null, result: null,
      events: [], noises: [], seen: {}, marks: [], glances: 0, kos: 0, markOut: 0, lootOut: 0, bodiesSeen: {} };
  }
  function mkGuard(g, i, dog) {
    const r = g.route;
    return { id: i, dog, route: r, x: r[0][0], y: r[0][1], px: r[0][0], py: r[0][1], idx: 0, wait: r[0][2] || 0,
      a: (r[0][3] != null ? r[0][3] : (g.face || 0)) * Math.PI / 180, speed: dog ? 1 : (g.speed || 2), cd: 0,
      mode: 'patrol', held: 0, heldBy: -1, ko: false, inv: null, look: 0, home: null, sus: 0 };
  }

  // ---------- map queries ----------
  function tileAt(st, L, x, y) { return (x < 0 || y < 0 || x >= L.w || y >= L.h) ? '#' : st.tiles[y * L.w + x]; }
  function occupied(st, x, y) {
    for (const c of st.crew) if (!c.out && c.x === x && c.y === y) return true;
    for (const g of st.guards) if (g.x === x && g.y === y) return true;
    for (const g of st.dogs) if (g.x === x && g.y === y) return true;
    return false;
  }
  function guardOn(st, x, y) {
    for (const g of st.guards) if (g.x === x && g.y === y) return true;
    for (const g of st.dogs) if (g.x === x && g.y === y) return true;
    return false;
  }
  function blocksSight(st, L, x, y) {
    const c = tileAt(st, L, x, y);
    if (!SIGHT_BLOCK.has(c)) return false;
    if ((c === 'D' || c === 'L') && occupied(st, x, y)) return false;
    return true;
  }
  function los(st, L, x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0, n = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 4);
    for (let i = 1; i < n; i++) {
      const fx = x0 + dx * i / n, fy = y0 + dy * i / n;
      const tx = Math.round(fx), ty = Math.round(fy);
      if ((tx === x0 && ty === y0) || (tx === x1 && ty === y1)) continue;
      if (blocksSight(st, L, tx, ty)) return false;
    }
    return true;
  }
  function crewPass(st, L, x, y) { return !SOLID_CREW.has(tileAt(st, L, x, y)); }
  function guardPass(st, L, x, y) { const c = tileAt(st, L, x, y); return c === 'L' || !SOLID_CREW.has(c); }

  // BFS from (sx,sy) to any goal cell; returns the first step [x,y] or null. goal(x,y)->bool
  function bfsStep(L, pass, sx, sy, goal) {
    if (goal(sx, sy)) return [sx, sy];
    const W = L.w, H = L.h, prev = new Int32Array(W * H).fill(-1);
    const start = sy * W + sx; prev[start] = start;
    const qx = [start]; let head = 0;
    while (head < qx.length) {
      const cur = qx[head++], cx = cur % W, cy = (cur / W) | 0;
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (prev[ni] !== -1 || !pass(nx, ny)) continue;
        prev[ni] = cur;
        if (goal(nx, ny)) { let p = ni; while (prev[p] !== start) p = prev[p]; return [p % W, (p / W) | 0]; }
        qx.push(ni);
      }
    }
    return null;
  }
  function pathLen(L, pass, sx, sy, goal) { // full path for drawing
    const W = L.w, H = L.h, prev = new Int32Array(W * H).fill(-1);
    const start = sy * W + sx; prev[start] = start;
    if (goal(sx, sy)) return [[sx, sy]];
    const qx = [start]; let head = 0;
    while (head < qx.length) {
      const cur = qx[head++], cx = cur % W, cy = (cur / W) | 0;
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (prev[ni] !== -1 || !pass(nx, ny)) continue;
        prev[ni] = cur;
        if (goal(nx, ny)) { const out = []; let p = ni; while (p !== start) { out.push([p % W, (p / W) | 0]); p = prev[p]; } out.push([sx, sy]); return out.reverse(); }
        qx.push(ni);
      }
    }
    return null;
  }
  const adj4 = (tx, ty) => (x, y) => Math.abs(x - tx) + Math.abs(y - ty) === 1;
  const adj8 = (tx, ty) => (x, y) => Math.max(Math.abs(x - tx), Math.abs(y - ty)) === 1;

  // ---------- crew ----------
  function stepToward(st, L, c, goal) {
    const p = bfsStep(L, (x, y) => crewPass(st, L, x, y) && !guardOn(st, x, y), c.x, c.y, goal);
    if (!p) { c.stuck++; return false; }
    if (p[0] === c.x && p[1] === c.y) return true; // already there
    if (c.slow && (st.t % 2)) { c.busy = 'heavy'; return false; } // gold: half speed
    c.x = p[0]; c.y = p[1]; c.stuck = 0;
    return false;
  }

  function crewTick(st, L, c, ci) {
    c.busy = null; c.act = -1;
    if (c.out || c.gone) return;
    for (let guard = 0; guard < 8; guard++) {
      const cmd = c.q[c.qi];
      c.act = cmd ? c.qi : -1;
      if (!cmd) return;
      const done = () => { c.qi++; c.prog = 0; };
      switch (cmd.k) {
        case 'go': {
          if (c.x === cmd.x && c.y === cmd.y) { done(); continue; }
          stepToward(st, L, c, (x, y) => x === cmd.x && y === cmd.y);
          c.busy = 'walk';
          if (c.x === cmd.x && c.y === cmd.y) done();
          return;
        }
        case 'wait': {
          if (c.prog >= cmd.n) { done(); continue; }
          c.prog++; c.busy = 'wait';
          if (c.prog >= cmd.n) done();
          return;
        }
        case 'until': {
          if (st.t >= cmd.t) { done(); continue; }
          c.busy = 'wait';
          if (st.t + 1 >= cmd.t) done();
          return;
        }
        case 'pick': case 'smash': case 'loop': {
          const tc = tileAt(st, L, cmd.x, cmd.y);
          const valid = (cmd.k === 'pick' && (tc === 'L' || tc === 'S' || tc === 's')) || (cmd.k === 'smash' && tc === '%') || (cmd.k === 'loop' && tc === 'P');
          if (!valid) { done(); continue; }
          if (Math.abs(c.x - cmd.x) + Math.abs(c.y - cmd.y) !== 1) {
            stepToward(st, L, c, adj4(cmd.x, cmd.y)); c.busy = 'walk'; return;
          }
          const need = cmd.k === 'pick' ? (tc === 'L' ? K.PICK_DOOR : K.PICK_SAFE) : cmd.k === 'smash' ? K.SMASH : K.LOOP_WORK;
          c.prog++; c.busy = cmd.k; c.need = need;
          if (c.prog >= need) {
            const i = cmd.y * L.w + cmd.x;
            if (cmd.k === 'pick') {
              if (tc === 'L') { st.tiles[i] = 'D'; st.events.push({ e: 'unlock', x: cmd.x, y: cmd.y, c: ci }); }
              else { st.tiles[i] = 'O'; c.carry.push(tc === 'S' ? 'mark' : 'cash'); st.events.push({ e: 'safe', x: cmd.x, y: cmd.y, c: ci, what: tc === 'S' ? 'mark' : 'cash' }); }
            } else if (cmd.k === 'smash') {
              st.tiles[i] = '.'; st.noises.push([cmd.x, cmd.y]); st.events.push({ e: 'smash', x: cmd.x, y: cmd.y, c: ci });
            } else { st.loopT = K.LOOP; st.events.push({ e: 'loop', x: cmd.x, y: cmd.y, c: ci }); }
            done();
          }
          return;
        }
        case 'grab': {
          const tc = tileAt(st, L, cmd.x, cmd.y);
          if (!(tc === '$' || tc === '*' || (tc === 'g' && c.role === 'muscle'))) { done(); continue; }
          if (c.x !== cmd.x || c.y !== cmd.y) { stepToward(st, L, c, (x, y) => x === cmd.x && y === cmd.y); c.busy = 'walk'; return; }
          st.tiles[cmd.y * L.w + cmd.x] = '.';
          c.carry.push(tc === '*' ? 'mark' : tc === 'g' ? 'gold' : 'cash');
          if (tc === 'g') c.slow = 1;
          st.events.push({ e: 'grab', x: cmd.x, y: cmd.y, c: ci, what: tc });
          c.busy = 'grab'; done();
          return;
        }
        case 'toss': {
          const d = Math.hypot(c.x - cmd.x, c.y - cmd.y);
          if (d > K.TOSS) { stepToward(st, L, c, (x, y) => Math.hypot(x - cmd.x, y - cmd.y) <= K.TOSS); c.busy = 'walk'; return; }
          st.noises.push([cmd.x, cmd.y]); st.events.push({ e: 'toss', x: cmd.x, y: cmd.y, fx: c.x, fy: c.y, c: ci });
          c.busy = 'toss'; done();
          return;
        }
        case 'chat': case 'ko': {
          const g = st.guards[cmd.g];
          if (!g || g.ko || (cmd.k === 'chat' && c.prog === 0 && g.held > 0)) { done(); continue; }
          if (c.prog > 0) { // chatting in progress
            c.prog++; c.busy = 'chat'; if (c.prog > K.CHAT) done();
            return;
          }
          if (Math.max(Math.abs(c.x - g.x), Math.abs(c.y - g.y)) > 1) { stepToward(st, L, c, adj8(g.x, g.y)); c.busy = 'walk'; return; }
          if (cmd.k === 'ko') {
            g.ko = true; g.mode = 'ko'; st.kos++; st.events.push({ e: 'ko', g: g.id, c: ci, x: g.x, y: g.y }); c.busy = 'ko'; done();
          } else {
            g.held = K.CHAT; g.heldBy = ci; g.a = Math.atan2(c.y - g.y, c.x - g.x);
            st.events.push({ e: 'chat', g: g.id, c: ci }); c.prog = 1; c.busy = 'chat';
          }
          return;
        }
        default: done(); continue;
      }
    }
  }

  // ---------- guards ----------
  function moveGuard(st, L, g, tx, ty, fast) {
    if (g.x === tx && g.y === ty) return true;
    if (!fast) { g.cd++; if (g.cd < g.speed) return false; g.cd = 0; }
    const p = bfsStep(L, (x, y) => guardPass(st, L, x, y), g.x, g.y, (x, y) => x === tx && y === ty);
    if (!p) return true;
    g.a = Math.atan2(p[1] - g.y, p[0] - g.x);
    g.x = p[0]; g.y = p[1];
    return g.x === tx && g.y === ty;
  }
  function guardTick(st, L, g) {
    if (g.ko) return;
    if (g.held > 0) { g.held--; const c = st.crew[g.heldBy]; if (c) g.a = Math.atan2(c.y - g.y, c.x - g.x); return; }
    if (g.mode === 'inv') {
      if (moveGuard(st, L, g, g.inv[0], g.inv[1], true)) { g.mode = 'look'; g.look = K.LOOK; }
      return;
    }
    if (g.mode === 'look') {
      g.look--; if (g.look % 2 === 0) g.a += Math.PI / 2;
      if (g.look <= 0) g.mode = st.alarm >= 0 ? 'look2' : 'back';
      return;
    }
    if (g.mode === 'look2') { if (st.t % 3 === 0) g.a += Math.PI / 2; return; }
    if (g.mode === 'back') {
      if (moveGuard(st, L, g, g.home[0], g.home[1], false)) { g.mode = 'patrol'; }
      return;
    }
    // patrol
    const r = g.route, wp = r[g.idx];
    if (g.x === wp[0] && g.y === wp[1]) {
      if (wp[3] != null) g.a = wp[3] * Math.PI / 180;
      if (g.wait > 0) { g.wait--; return; }
      g.idx = (g.idx + 1) % r.length; g.wait = r[g.idx][2] || 0; g.cd = g.speed - 1;
      if (r.length === 1) return;
    }
    const n = r[g.idx];
    if (moveGuard(st, L, g, n[0], n[1], false) && n[3] != null) g.a = n[3] * Math.PI / 180;
  }

  function hearNoises(st, L) {
    for (const [nx, ny] of st.noises) {
      st.events.push({ e: 'noise', x: nx, y: ny });
      for (const g of st.guards) {
        if (g.ko || g.held > 0) continue;
        if (Math.hypot(g.x - nx, g.y - ny) > K.HEAR) continue;
        if (g.mode === 'patrol') g.home = [g.x, g.y];
        // nearest guard-passable cell to the noise
        let tx = nx, ty = ny;
        if (!guardPass(st, L, nx, ny)) {
          for (const [dx, dy] of DIRS) if (guardPass(st, L, nx + dx, ny + dy)) { tx = nx + dx; ty = ny + dy; break; }
        }
        g.mode = 'inv'; g.inv = [tx, ty]; g.sus = 1;
        st.events.push({ e: 'hear', g: g.id });
      }
    }
    st.noises = [];
  }

  function sees(st, L, g, x, y, half, range) {
    const dx = x - g.x, dy = y - g.y, d = Math.hypot(dx, dy);
    if (d > range + 0.01) return false;
    if (d > 0 && angDiff(Math.atan2(dy, dx), g.a) > half + 1e-9) return false;
    return los(st, L, g.x, g.y, x, y);
  }

  function raise(st, why, x, y, real) {
    if (!real) { st.marks.push({ t: st.t, e: 'alarm', why, x, y }); return; }
    if (st.alarm >= 0) return;
    st.alarm = K.LOCKDOWN; st.alarmSrc = [x, y]; st.alarmT = st.t;
    st.events.push({ e: 'alarm', why, x, y });
    for (const g of st.guards) if (!g.ko && g.held <= 0) { if (g.mode === 'patrol') g.home = [g.x, g.y]; g.mode = 'inv'; g.inv = [x, y]; }
  }

  function detect(st, L, real) {
    const seenNow = {};
    st.crew.forEach((c, ci) => {
      if (c.out) return;
      const disguised = c.role === 'charm' && !inZone(L, c.x, c.y);
      for (const g of st.guards) {
        if (g.ko || disguised) continue;
        if (!sees(st, L, g, c.x, c.y, K.GUARD_HALF, K.GUARD_RANGE)) continue;
        const key = g.id + ':' + ci, d = Math.hypot(c.x - g.x, c.y - g.y);
        const n = (st.seen[key] || 0) + 1; seenNow[key] = n;
        if (n >= 2 || d <= K.CLOSE) {
          if (real) { st.result = st.result || { ok: false, why: 'busted', by: 'guard', g: g.id, c: ci, t: st.t }; st.events.push({ e: 'bust', g: g.id, c: ci }); }
          else st.marks.push({ t: st.t, e: 'bust', g: g.id, c: ci });
        } else { st.glances++; st.events.push({ e: 'glance', g: g.id, c: ci }); g.sus = 4; }
      }
      for (const g of st.dogs) {
        const d = Math.hypot(c.x - g.x, c.y - g.y);
        if (d <= K.DOG_RANGE + 0.01 && los(st, L, g.x, g.y, c.x, c.y)) {
          if (real) { st.result = st.result || { ok: false, why: 'busted', by: 'dog', g: g.id, c: ci, t: st.t }; st.events.push({ e: 'bark', g: g.id, c: ci }); }
          else st.marks.push({ t: st.t, e: 'bust', dog: g.id, c: ci });
        }
      }
      if (st.loopT <= 0 && !disguised) {
        for (const cam of L.cams) {
          const v = { x: cam.x, y: cam.y, a: camAngle(cam, st.t) };
          if (sees(st, L, v, c.x, c.y, K.CAM_HALF, cam.range)) raise(st, 'camera', c.x, c.y, real);
        }
        if (tileAt(st, L, c.x, c.y) === 'x' && laserOn(L, st.t)) raise(st, 'laser', c.x, c.y, real);
      }
    });
    st.seen = seenNow;
    nearMisses(st, L);
    // bodies
    for (const b of st.guards) if (b.ko) for (const g of st.guards) {
      if (g.ko || g === b || st.bodiesSeen[b.id]) continue;
      if (sees(st, L, g, b.x, b.y, K.GUARD_HALF, K.GUARD_RANGE)) { st.bodiesSeen[b.id] = 1; raise(st, 'body', b.x, b.y, real); }
    }
  }

  // Cosmetic only (never changes the outcome): a guard, dog or camera almost had someone. Drives slow-mo + sting.
  const NEAR_CD = 8;
  function nearMisses(st, L) {
    const cd = st.nearCd || (st.nearCd = {});
    st.threat = 0;
    const seen = (k) => st.seen[k] || st.events.some((e) => e.e === 'glance' || e.e === 'bust' || e.e === 'bark' || e.e === 'alarm');
    const fire = (key, src, ci, x, y) => {
      if (cd[key] != null && st.t - cd[key] < NEAR_CD) return;
      cd[key] = st.t; st.nears = (st.nears || 0) + 1; st.events.push({ e: 'near', src, c: ci, x, y });
    };
    st.crew.forEach((c, ci) => {
      if (c.out) return;
      const disguised = c.role === 'charm' && !inZone(L, c.x, c.y);
      for (const g of st.guards) {
        if (g.ko || disguised || g.held > 0) continue;
        const key = g.id + ':' + ci; if (seen(key)) continue;
        const d = Math.hypot(c.x - g.x, c.y - g.y);
        if (d <= K.GUARD_RANGE + 2 && los(st, L, g.x, g.y, c.x, c.y)) st.threat = 1;
        if (d > K.GUARD_RANGE + K.NEAR_PAD) continue;
        const ad = d > 0 ? angDiff(Math.atan2(c.y - g.y, c.x - g.x), g.a) : 0;
        if ((ad <= K.GUARD_HALF + K.NEAR_ANG || d <= 2.3) && los(st, L, g.x, g.y, c.x, c.y)) fire('g' + key, 'guard', ci, g.x, g.y);
      }
      for (const g of st.dogs) {
        const d = Math.hypot(c.x - g.x, c.y - g.y);
        if (d <= K.DOG_RANGE + 2.5 && los(st, L, g.x, g.y, c.x, c.y)) st.threat = 1;
        if (d > K.DOG_RANGE + 0.01 && d <= K.DOG_RANGE + K.NEAR_PAD && los(st, L, g.x, g.y, c.x, c.y)) fire('d' + g.id + ':' + ci, 'dog', ci, g.x, g.y);
      }
      if (disguised || st.loopT > 0) return;
      for (const cam of L.cams) {
        const v = { x: cam.x, y: cam.y, a: camAngle(cam, st.t) };
        const d = Math.hypot(c.x - v.x, c.y - v.y);
        if (d <= cam.range + 1 && los(st, L, v.x, v.y, c.x, c.y)) st.threat = 1;
        if (d > cam.range + 1 || sees(st, L, v, c.x, c.y, K.CAM_HALF, cam.range)) continue;
        if (angDiff(Math.atan2(c.y - v.y, c.x - v.x), v.a) <= K.CAM_HALF + K.NEAR_ANG && los(st, L, v.x, v.y, c.x, c.y)) fire('c' + cam.id + ':' + ci, 'cam', ci, cam.x, cam.y);
      }
    });
  }
  // Per-tick "nothing is happening" flags for auto fast-forward: no event nearby in time and no threat near any crew.
  function quietTicks(r, opts) {
    opts = opts || {};
    const F = r.frames, n = F.length, busy = new Uint8Array(n), q = new Uint8Array(n);
    const back = opts.back || 2, ahead = opts.ahead || 4, minRun = opts.minRun || 6;
    for (let t = 0; t < n; t++) {
      const f = F[t];
      if (f.events.some((e) => e.e !== 'noise' && e.e !== 'out')) for (let k = Math.max(0, t - ahead); k <= Math.min(n - 1, t + back); k++) busy[k] = 1;
      for (const c of f.crew) {
        if (c.out) continue;
        if (c.busy === 'chat' && f.th) busy[t] = 1;
      }
      if (f.alarm >= 0 || f.th) busy[t] = 1;
    }
    busy[0] = 1; busy[n - 1] = 1;
    let t = 0;
    while (t < n) {
      if (busy[t]) { t++; continue; }
      let e = t; while (e < n && !busy[e]) e++;
      if (e - t >= minRun) for (let k = t + 1; k < e - 1; k++) q[k] = 1;
      t = e;
    }
    return q;
  }

  function step(st, L, real) {
    st.events = [];
    st.crew.forEach((c) => { c.px = c.x; c.py = c.y; });
    st.guards.concat(st.dogs).forEach((g) => { g.px = g.x; g.py = g.y; g.pa = g.a; });
    st.crew.forEach((c, i) => crewTick(st, L, c, i));
    for (const g of st.guards) guardTick(st, L, g);
    for (const g of st.dogs) guardTick(st, L, g);
    hearNoises(st, L);
    st.t++;
    if (st.loopT > 0) st.loopT--;
    for (const g of st.guards) if (g.sus > 0 && g.mode === 'patrol') g.sus--;
    detect(st, L, real);
    // exits
    st.crew.forEach((c, ci) => {
      if (c.out) return;
      if (c.qi >= c.q.length && tileAt(st, L, c.x, c.y) === 'E') {
        c.out = true; c.outT = st.t; st.events.push({ e: 'out', c: ci });
        for (const it of c.carry) { if (it === 'mark') st.markOut++; else st.lootOut++; }
      }
    });
    if (st.alarm >= 0 && !st.result) {
      st.alarm--;
      if (st.alarm < 0) { st.result = { ok: false, why: 'lockdown', t: st.t }; st.events.push({ e: 'lockdown' }); }
    }
    if (!st.result && st.crew.every((c) => c.out)) {
      if (st.markOut >= Math.max(1, L.markCount)) st.result = { ok: true, t: st.t };
      else st.result = { ok: false, why: 'nomark', t: st.t };
    }
    if (!st.result && st.t >= K.MAXT) st.result = { ok: false, why: 'time', t: st.t };
  }

  function snap(st) {
    return {
      t: st.t, tiles: st.tiles.join(''), loopT: st.loopT, alarm: st.alarm, th: st.threat || 0,
      crew: st.crew.map((c) => ({ x: c.x, y: c.y, px: c.px, py: c.py, out: c.out, carry: c.carry.slice(), busy: c.busy, prog: c.prog, need: c.need, qi: c.qi, act: c.act == null ? -1 : c.act })),
      guards: st.guards.map((g) => ({ x: g.x, y: g.y, px: g.px, py: g.py, a: g.a, pa: g.pa == null ? g.a : g.pa, ko: g.ko, held: g.held, mode: g.mode, sus: g.sus })),
      dogs: st.dogs.map((g) => ({ x: g.x, y: g.y, px: g.px, py: g.py, a: g.a, pa: g.pa == null ? g.a : g.pa })),
      events: st.events.slice(),
    };
  }

  // Run a plan to the end. real=false: the planning preview (detection recorded as marks, no consequences).
  function run(L, plan, opts) {
    opts = opts || {};
    const real = opts.real !== false;
    const st = initState(L, plan);
    const frames = [snap(st)];
    while (!st.result) {
      step(st, L, real);
      frames.push(snap(st));
      if (!real && !st.result && st.crew.every((c) => c.out || c.qi >= c.q.length)) {
        for (let i = 0; i < (opts.pad || 0) && st.t < K.MAXT; i++) { step(st, L, real); frames.push(snap(st)); }
        break;
      }
    }
    const res = st.result || { ok: false, why: 'unfinished', t: st.t };
    return { L, frames, result: res, marks: st.marks, glances: st.glances, nears: st.nears || 0, kos: st.kos, alarmed: st.alarmT != null, alarmT: st.alarmT,
      loot: st.lootOut, lootTotal: L.lootTotal, end: st.t, state: st };
  }

  function stamps(r, L) {
    const par = L.def.par;
    return {
      ghost: r.result.ok && !r.alarmed && r.kos === 0,
      greedy: r.result.ok && r.loot >= L.lootTotal,
      swift: r.result.ok && par != null && r.end <= par,
    };
  }

  function fmtT(t) { const s = t * TICK_SEC; return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0') + (s % 1 ? '.5' : ''); }

  const API = { TICK_SEC, ROLES, K, parseLevel, run, stamps, camAngle, laserOn, inZone, tileAt, crewPass, pathLen, adj4, adj8, fmtT, los, angDiff, quietTicks };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.CHSim = API;
})(typeof window !== 'undefined' ? window : globalThis);
