// BFS solver over (player, crates, filled tiles, tide phase). Used by tools/levels.js, tests and the in-game hint.
(function (root) {
  'use strict';
  const TB = (typeof module !== 'undefined' && module.exports) ? require('./core.js') : root.TB;

  function deadCorners(level, state) {
    // Cells where a crate can never move again (two orthogonal cliffs). Only safe to prune when crates == goals.
    const dead = new Uint8Array(level.w * level.h);
    const wallAt = (i, d) => { const n = TB.neighbor(level, i, d); return n < 0 || state.tiles[n] === TB.WALL; };
    for (let i = 0; i < dead.length; i++) {
      if (state.tiles[i] === TB.WALL || level.goal[i]) continue;
      if ((wallAt(i, 0) || wallAt(i, 2)) && (wallAt(i, 1) || wallAt(i, 3))) dead[i] = 1;
    }
    return dead;
  }

  // opts: { maxStates, tide: 'normal'|'low'|'high' }
  function solve(def, opts) {
    opts = opts || {};
    const maxStates = opts.maxStates || 3e6;
    const { level, state } = TB.parse(def);
    return solveState(level, state, opts);
  }
  function solveState(level, state, opts) {
    opts = opts || {};
    const maxStates = opts.maxStates || 3e6;
    if (opts.tide === 'low') { level.P = 1e9; level.offset = 0; level.fixed = true; }
    if (opts.tide === 'high') { level.P = 1e9; level.offset = 1e9; level.fixed = true; }
    let crates = 0, goals = 0;
    for (let i = 0; i < state.occ.length; i++) { if (state.occ[i]) crates++; if (level.goal[i]) goals++; }
    const dead = crates === goals ? deadCorners(level, state) : null;
    const seen = new Map();
    const k0 = TB.key(level, state);
    seen.set(k0, null);
    let frontier = [state], depth = 0;
    if (TB.isWon(level, state)) return { moves: 0, actions: [], states: 1 };
    while (frontier.length) {
      const next = [];
      for (const s of frontier) {
        const sk = TB.key(level, s);
        for (let a = 0; a < 5; a++) {
          const r = TB.step(level, s, a);
          if (!r.ok) continue;
          const ns = r.state;
          if (dead && r.ev.push && r.ev.push.type === TB.WOOD && dead[r.ev.push.end] && !TB.isWater(ns.tiles[r.ev.push.end], false)) continue;
          if (dead && r.ev.push && r.ev.push.type === TB.STONE && r.ev.fill < 0 && dead[r.ev.push.end]) continue;
          const k = TB.key(level, ns);
          if (seen.has(k)) continue;
          seen.set(k, [sk, a]);
          if (TB.isWon(level, ns)) {
            const actions = [];
            let cur = k;
            while (seen.get(cur)) { const [pk, pa] = seen.get(cur); actions.push(pa); cur = pk; }
            actions.reverse();
            return { moves: actions.length, actions, states: seen.size };
          }
          next.push(ns);
        }
        if (seen.size > maxStates) return { moves: -1, aborted: true, states: seen.size };
      }
      frontier = next; depth++;
    }
    return { moves: -1, states: seen.size };
  }

  const api = { solve, solveState };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TBSolver = api;
})(typeof window !== 'undefined' ? window : globalThis);
