// Timing solver: given a route skeleton (per-crew command lists), search for wait lengths that make the plan win,
// minimising the finish tick. Deterministic (seeded). Used by tests and tools to prove levels solvable and set par.
(function (root) {
  const S = (typeof module !== 'undefined' && module.exports) ? require('./sim.js') : root.CHSim;
  function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  function build(skel, W) {
    const plan = {};
    for (const role in skel) {
      plan[role] = [];
      skel[role].forEach((cmd, i) => { if (W[role][i] > 0) plan[role].push({ k: 'wait', n: W[role][i] }); plan[role].push(cmd); });
    }
    return plan;
  }
  function score(L, plan, want) {
    const r = S.run(L, plan, { real: true });
    let sc;
    if (r.result.ok) {
      sc = r.end;
      if (want) { const st = S.stamps(r, L); if (want.ghost && !st.ghost) sc += 1000; if (want.greedy && !st.greedy) sc += 1000; }
    } else {
      const prog = r.state.crew.reduce((a, c) => a + c.qi + (c.out ? 3 : 0), 0) + r.state.markOut * 5;
      sc = 100000 - r.end * 10 - prog * 200 + (r.alarmed ? 3000 : 0);
    }
    return { sc, r };
  }
  function solve(L, skel, opts) {
    opts = opts || {};
    const R = rng(opts.seed || 7), iters = opts.iters || 2500, maxW = opts.maxW || 30;
    const roles = Object.keys(skel);
    const zero = () => { const W = {}; roles.forEach((ro) => { W[ro] = skel[ro].map(() => 0); }); return W; };
    let W = opts.start || zero();
    let cur = score(L, build(skel, W), opts.want), best = { W, ...cur };
    let temp = 1;
    for (let it = 0; it < iters; it++) {
      const W2 = {}; roles.forEach((ro) => { W2[ro] = W[ro].slice(); });
      const nmut = 1 + (R() < 0.3 ? 1 : 0);
      for (let m = 0; m < nmut; m++) {
        const ro = roles[(R() * roles.length) | 0]; if (!W2[ro].length) continue;
        const i = (R() * W2[ro].length) | 0;
        const u = R();
        const d = u < 0.45 ? (R() < 0.5 ? 1 : -1) : u < 0.8 ? Math.round((R() - 0.5) * 12) : Math.round((R() - 0.5) * maxW);
        W2[ro][i] = Math.max(0, Math.min(maxW, W2[ro][i] + d));
        // shift: move time between this command and the next, keeping later timing
        if (R() < 0.25 && i + 1 < W2[ro].length) { const nd = Math.max(0, Math.min(maxW, W2[ro][i + 1] - d)); W2[ro][i + 1] = nd; }
      }
      const s2 = score(L, build(skel, W2), opts.want);
      if (s2.sc <= cur.sc || R() < Math.exp((cur.sc - s2.sc) / (temp * 40))) { W = W2; cur = s2; }
      if (s2.sc < best.sc) best = { W: W2, ...s2 };
      temp = Math.max(0.02, 1 - it / iters);
      if (it % 400 === 399 && !best.r.result.ok) {
        W = zero(); if ((it / 400 | 0) % 2) roles.forEach((ro) => { W[ro] = W[ro].map(() => (R() < 0.5 ? 0 : (R() * maxW) | 0)); });
        cur = score(L, build(skel, W), opts.want); temp = 1;
      }
    }
    return { ok: best.r.result.ok, end: best.r.end, plan: build(skel, best.W), W: best.W, r: best.r };
  }
  // Coordinate-descent over 'until' times: skeleton commands {k:'until'} without t are variables.
  // Works much better than wait-annealing on long levels where crews must hold for a specific moment.
  function solveUntil(L, skel, opts) {
    opts = opts || {};
    const R = rng(opts.seed || 7);
    const vars = [];
    for (const ro in skel) skel[ro].forEach((c, i) => { if (c.k === 'until' && c.t == null) vars.push([ro, i]); });
    const maxT = opts.maxT || 160, step = opts.step || 2;
    const mk = (Tv) => { const plan = {}; for (const ro in skel) plan[ro] = skel[ro].map((c) => Object.assign({}, c)); vars.forEach(([ro, i], k) => { plan[ro][i].t = Tv[k]; }); return plan; };
    let gbest = null;
    for (let rs = 0; rs < (opts.restarts || 12); rs++) {
      // per-crew untils must be non-decreasing to be meaningful; random sorted start
      const T = vars.map(() => (rs === 0 ? 0 : (R() * maxT * 0.6) | 0));
      vars.forEach(([ro], k) => { for (let j = k - 1; j >= 0; j--) if (vars[j][0] === ro) { if (T[k] < T[j]) T[k] = T[j]; break; } });
      let best = score(L, mk(T), opts.want);
      for (let pass = 0; pass < (opts.passes || 5); pass++) {
        let improved = false;
        for (let k = 0; k < vars.length; k++) {
          for (let t = 0; t <= maxT; t += step) {
            if (t === T[k]) continue;
            const T2 = T.slice(); T2[k] = t;
            const sc = score(L, mk(T2), opts.want);
            if (sc.sc < best.sc) { best = sc; T[k] = t; improved = true; }
          }
        }
        if (!improved) break;
      }
      // fine pass at step 1
      for (let k = 0; k < vars.length; k++) for (let d = -2; d <= 2; d++) {
        const T2 = T.slice(); T2[k] = Math.max(0, T[k] + d); const sc = score(L, mk(T2), opts.want);
        if (sc.sc < best.sc) { best = sc; T[k] = T2[k]; }
      }
      if (!gbest || best.sc < gbest.sc) gbest = { ...best, T: T.slice() };
    }
    return { ok: gbest.r.result.ok, end: gbest.r.end, plan: mk(gbest.T), T: gbest.T, r: gbest.r };
  }
  const API = { solve, build, solveUntil };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.CHSolver = API;
})(typeof window !== 'undefined' ? window : globalThis);
