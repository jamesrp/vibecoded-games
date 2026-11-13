// ORBIT GARDEN solver: brute-forces the shot grid, groups shots by the garden they produce, then BFSes gardens.
// Par = fewest seeds to green everything. Each solution step records its "window" (how many grid shots give that
// same result) so we can judge fairness: tiny windows = pixel-perfect shots.
(function (root) {
  'use strict';
  const OG = typeof module !== 'undefined' && module.exports ? require('./sim.js') : root.OG;

  function outcomes(level, s, opt) {
    opt = opt || {};
    const aStep = opt.aStep || 4, pStep = opt.pStep || 5, groups = new Map(), base = OG.key(Object.assign(OG.clone(s), { pouch: { T: 0, F: 0, V: 0 } }));
    const NA = OG.ANG_STEPS / aStep, NP = Math.floor(OG.PMAX / pStep) + 1;
    for (const seed of OG.SEEDS) {
      if (!(s.pouch[seed] > 0)) continue;
      const cell = new Array(NA * NP).fill(null);
      for (let ai = 0; ai < NA; ai++) for (let pi = 0; pi < NP; pi++) {
        const shot = { a: ai * aStep, p: Math.min(OG.PMAX, pi * pStep), s: seed };
        const r = OG.shoot(level, s, shot);
        const k = OG.key(r.state);
        if (OG.key(Object.assign(OG.clone(r.state), { pouch: { T: 0, F: 0, V: 0 } })) === base) continue; // no change
        cell[ai * NP + pi] = k;
        let g = groups.get(k);
        if (!g) { g = { key: k, state: r.state, events: r.events, count: 0, shots: [] }; groups.set(k, g); }
        g.count++; g.shots.push([ai, pi, shot]);
      }
      // Most robust representative: the shot with the most same-outcome neighbours (8-neighbourhood, angle wraps).
      for (const g of groups.values()) {
        if (g.rep || !g.shots || g.shots.length === 0 || g.shots[0][2].s !== seed) continue;
        let best = null, bn = -1;
        for (const [ai, pi, shot] of g.shots) {
          let n = 0;
          for (let da = -1; da <= 1; da++) for (let dp = -1; dp <= 1; dp++) {
            if (!da && !dp) continue; const a2 = (ai + da + NA) % NA, p2 = pi + dp;
            if (p2 >= 0 && p2 < NP && cell[a2 * NP + p2] === g.key) n++;
          }
          if (n > bn) { bn = n; best = shot; }
        }
        g.rep = best; g.repN = bn; if (!opt.keepShots) delete g.shots;
      }
    }
    return [...groups.values()];
  }

  // BFS over gardens. Returns { par, path:[{shot,count,repN,events}], minWin, states, solutions } or { par:null }.
  function solve(level, opt) {
    opt = opt || {};
    const start = opt.start || OG.init(level), beam = opt.beam || 300, minWin = opt.minWin || 1;
    if (OG.won(level, start)) return { par: 0, path: [], minWin: Infinity, states: 1 };
    let frontier = [{ s: start, path: [], mw: Infinity }];
    const seen = new Map([[OG.key(start), Infinity]]);
    let states = 1;
    for (let depth = 1; depth <= OG.remaining(start); depth++) {
      const next = new Map(); const sols = [];
      for (const node of frontier) {
        for (const g of outcomes(level, node.s, opt)) {
          if (g.count < minWin) continue;
          const mw = Math.min(node.mw, g.count);
          const prev = seen.get(g.key);
          if (prev !== undefined && prev >= mw) continue;
          seen.set(g.key, mw); states++;
          const n = { s: g.state, path: node.path.concat([{ shot: g.rep, count: g.count, repN: g.repN, events: g.events }]), mw };
          if (OG.won(level, g.state)) sols.push(n); else next.set(g.key, n);
        }
      }
      if (sols.length) { sols.sort((a, b) => b.mw - a.mw); return { par: depth, path: sols[0].path, minWin: sols[0].mw, states, solutions: sols.length }; }
      frontier = [...next.values()].sort((a, b) => b.mw - a.mw).slice(0, beam);
      if (!frontier.length) break;
    }
    return { par: null, states };
  }
  const api = { outcomes, solve };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.OGSolver = api;
})(typeof window !== 'undefined' ? window : globalThis);
