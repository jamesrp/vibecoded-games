// TIDEBOUND rules engine. Pure, deterministic, shared by the browser and Node (tests, solver).
(function (root) {
  'use strict';
  const WALL = 0, ROCK = 1, SAND = 2, DEEP = 3;
  const NONE = 0, WOOD = 1, STONE = 2;
  const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
  const DIRS = { up: 0, right: 1, down: 2, left: 3 };

  // Legend. Each char -> [tile, goal, thing, current]; thing: 'P' player, 'W' wood, 'S' stone.
  const LEGEND = {
    '#': [WALL, 0, 0, 0], ' ': [WALL, 0, 0, 0],
    '.': [ROCK, 0, 0, 0], ',': [SAND, 0, 0, 0], '~': [DEEP, 0, 0, 0],
    '^': [DEEP, 0, 0, 1], '>': [DEEP, 0, 0, 2], 'v': [DEEP, 0, 0, 3], '<': [DEEP, 0, 0, 4],
    '1': [SAND, 0, 0, 1], '2': [SAND, 0, 0, 2], '3': [SAND, 0, 0, 3], '4': [SAND, 0, 0, 4],
    'o': [ROCK, 1, 0, 0], 'u': [SAND, 1, 0, 0],
    '@': [ROCK, 0, 'P', 0], 'p': [SAND, 0, 'P', 0], '&': [ROCK, 1, 'P', 0],
    'B': [ROCK, 0, 'W', 0], 'b': [SAND, 0, 'W', 0], 'w': [DEEP, 0, 'W', 0],
    '*': [ROCK, 1, 'W', 0], 'x': [SAND, 1, 'W', 0],
    'S': [ROCK, 0, 'S', 0], 's': [SAND, 0, 'S', 0], '$': [ROCK, 1, 'S', 0],
  };

  function parse(def) {
    const rows = def.map.slice();
    const h = rows.length, w = Math.max(...rows.map((r) => r.length));
    if (rows.some((r) => r.length !== w)) throw new Error('ragged map in ' + (def.id || '?') + ': rows must all be ' + w + ' wide');
    const n = w * h;
    const tiles = new Uint8Array(n), goal = new Uint8Array(n), cur = new Uint8Array(n), occ = new Uint8Array(n);
    let p = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const ch = rows[y][x] === undefined ? ' ' : rows[y][x];
      const L = LEGEND[ch];
      if (!L) throw new Error(`level ${def.id}: bad char '${ch}' at ${x},${y}`);
      const i = y * w + x;
      tiles[i] = L[0]; goal[i] = L[1]; cur[i] = L[3];
      if (L[2] === 'P') { if (p >= 0) throw new Error(`level ${def.id}: two players`); p = i; }
      else if (L[2] === 'W') occ[i] = WOOD;
      else if (L[2] === 'S') occ[i] = STONE;
    }
    if (p < 0) throw new Error(`level ${def.id}: no player`);
    const level = { base: tiles.slice(), id: def.id, name: def.name || def.id, w, h, goal, cur, P: def.period || 3, offset: def.offset || 0, def };
    const state = { tiles, occ, p, t: 0 };
    return { level, state };
  }

  // Tide phase for a move counter t: high if floor((t+offset)/P) is odd.
  function isHigh(level, t) { return Math.floor((t + level.offset) / level.P) % 2 === 1; }
  // Moves until the tide flips (1..P).
  function movesToTurn(level, t) { return level.P - ((t + level.offset) % level.P); }

  function isWater(tile, high) { return tile === DEEP || (tile === SAND && high); }

  function clone(s) { return { tiles: s.tiles.slice(), occ: s.occ.slice(), p: s.p, t: s.t }; }

  function neighbor(level, i, d) {
    const x = i % level.w + DX[d], y = (i / level.w | 0) + DY[d];
    if (x < 0 || y < 0 || x >= level.w || y >= level.h) return -1;
    return y * level.w + x;
  }

  // Drift a wooden crate starting at i heading d. Returns final index and path (list of indices).
  function drift(level, s, i, d, high) {
    const path = [i];
    const seen = new Set();
    let pos = i, dir = d;
    while (isWater(s.tiles[pos], high)) {
      const c = level.cur[pos];
      if (c && (s.tiles[pos] === DEEP || high)) dir = c - 1;
      const key = pos * 4 + dir;
      if (seen.has(key)) break; seen.add(key);
      const nx = neighbor(level, pos, dir);
      if (nx < 0 || s.occ[nx] || !isWater(s.tiles[nx], high)) break;
      pos = nx; path.push(pos);
    }
    return { end: pos, path };
  }

  // Apply one action. a = 0..3 direction, or 4 = wait.
  // Returns { ok, state, ev } ; ev describes what happened (for juice/audio). Never mutates s.
  function step(level, s, a) {
    const high = isHigh(level, s.t);
    const ns = clone(s);
    const ev = { kind: 'move', push: null, fill: -1, tideTurn: false, from: s.p };
    if (a === 4) {
      ev.kind = 'wait';
    } else {
      const tgt = neighbor(level, s.p, a);
      if (tgt < 0 || s.tiles[tgt] === WALL) return { ok: false, why: 'wall' };
      const thing = s.occ[tgt];
      if (thing) {
        const nx = neighbor(level, tgt, a);
        if (nx < 0 || s.tiles[nx] === WALL || s.occ[nx]) return { ok: false, why: 'stuck' };
        ns.occ[tgt] = NONE;
        if (thing === STONE) {
          if (s.tiles[nx] === DEEP) { ns.tiles[nx] = ROCK; ev.fill = nx; }
          else ns.occ[nx] = STONE;
          ev.push = { type: STONE, from: tgt, path: [tgt, nx], end: nx };
        } else {
          const dr = drift(level, ns, nx, a, high);
          ns.occ[dr.end] = WOOD;
          ev.push = { type: WOOD, from: tgt, path: [tgt].concat(dr.path), end: dr.end, floating: isWater(ns.tiles[dr.end], high) };
        }
        // You follow the crate only if the tile it left is dry ground.
        if (!isWater(ns.tiles[tgt], high)) ns.p = tgt; else ev.kind = 'shove';
      } else {
        if (isWater(s.tiles[tgt], high)) return { ok: false, why: 'water' };
        ns.p = tgt;
      }
    }
    ns.t = s.t + 1;
    const nhigh = isHigh(level, ns.t);
    ev.tideTurn = nhigh !== high;
    if (isWater(ns.tiles[ns.p], nhigh)) return { ok: false, why: 'tide', tideTurn: true };
    return { ok: true, state: ns, ev };
  }

  function settledOn(level, s, i, high) {
    const o = s.occ[i];
    return o === STONE || (o === WOOD && !isWater(s.tiles[i], high));
  }

  function isWon(level, s) {
    const high = isHigh(level, s.t);
    let any = false;
    for (let i = 0; i < level.goal.length; i++) if (level.goal[i]) { any = true; if (!settledOn(level, s, i, high)) return false; }
    return any;
  }

  // Compact state key for search. Tide phase only matters mod 2P.
  function key(level, s) {
    let k = s.p + ':' + (level.fixed ? 0 : (s.t + level.offset) % (2 * level.P)) + ':';
    for (let i = 0; i < s.occ.length; i++) if (s.occ[i]) k += i + (s.occ[i] === STONE ? 's' : 'w');
    k += ':';
    const base = level.base;
    if (base) for (let i = 0; i < s.tiles.length; i++) if (s.tiles[i] !== base[i]) k += i + ',';
    return k;
  }

  const api = { WALL, ROCK, SAND, DEEP, NONE, WOOD, STONE, DX, DY, DIRS, LEGEND, parse, isHigh, movesToTurn, isWater, step, isWon, key, neighbor, drift, clone, settledOn };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TB = api;
})(typeof window !== 'undefined' ? window : globalThis);
