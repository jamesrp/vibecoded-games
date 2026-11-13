// CARTOGRAPHER generator: seeded island maps, clue pools, and puzzle search verified by the human-like solver.
(function (root) {
  'use strict';
  const CG = (typeof module !== 'undefined' && module.exports) ? require('./core.js') : root.CG;
  const { SEA, SAND, GRASS, FOREST, MOUNT, HOME, bit } = CG;

  function rng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  function hashStr(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  const pick = (r, a) => a[(r() * a.length) | 0];
  function shuffle(r, a) { for (let i = a.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }

  // Smooth value noise on the grid.
  function noise(r, W, H, scale) {
    const gw = Math.ceil(W / scale) + 2, gh = Math.ceil(H / scale) + 2, g = [];
    for (let i = 0; i < gw * gh; i++) g.push(r());
    const sm = (t) => t * t * (3 - 2 * t);
    return (x, y) => {
      const fx = x / scale, fy = y / scale, ix = fx | 0, iy = fy | 0, tx = sm(fx - ix), ty = sm(fy - iy);
      const v = (a, b) => g[b * gw + a];
      return (v(ix, iy) * (1 - tx) + v(ix + 1, iy) * tx) * (1 - ty) + (v(ix, iy + 1) * (1 - tx) + v(ix + 1, iy + 1) * tx) * ty;
    };
  }

  // Make a believable island map using the palette. Returns terrain array.
  function makeMap(r, W, H, pal) {
    const has = (v) => pal.includes(v);
    for (let tries = 0; tries < 200; tries++) {
      const e = noise(r, W, H, 2.2 + r() * 1.5), m = noise(r, W, H, 1.6 + r());
      const cx = (W - 1) / 2 + (r() - 0.5), cy = (H - 1) / 2 + (r() - 0.5);
      const t = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const d = Math.hypot((x - cx) / (W / 2), (y - cy) / (H / 2));
        const h = e(x, y) * 0.9 + 0.55 - d * 0.75;
        let v;
        if (h < 0.18) v = SEA;
        else if (h < 0.3 && has(SAND)) v = SAND;
        else if (h > 0.62 && has(MOUNT)) v = MOUNT;
        else if (has(FOREST) && m(x, y) > 0.55) v = FOREST;
        else v = has(GRASS) ? GRASS : (has(FOREST) ? FOREST : SAND);
        t.push(v);
      }
      // require every palette terrain present and a sane sea share
      const cnt = [0, 0, 0, 0, 0]; t.forEach((v) => cnt[v]++);
      const N = W * H;
      if (pal.every((v) => cnt[v] >= (v === SEA ? Math.max(3, N * 0.18) : 2)) && cnt[SEA] < N * 0.5) return t;
    }
    return null;
  }

  function placeLandmarks(r, W, H, t, lms) {
    const st = { W, H, N: W * H };
    for (let tries = 0; tries < 100; tries++) {
      const lm = {}, used = new Set(); let ok = true;
      for (const L of lms) {
        const opts = [];
        for (let i = 0; i < W * H; i++) {
          if (used.has(i) || !(HOME[L] & bit(t[i]))) continue;
          if (L === 'lighthouse' && !CG.nbrs(st, i).some((q) => t[q] === SEA)) continue;
          opts.push(i);
        }
        if (!opts.length) { ok = false; break; }
        lm[L] = pick(r, opts); used.add(lm[L]);
      }
      if (ok) return lm;
    }
    return null;
  }

  // Every true clue we could give about this map.
  function cluePool(W, H, sol, pal, lms) {
    const st = { W, H, N: W * H }, pool = [];
    const t = sol.t;
    for (const v of pal) {
      for (let k = 0; k < H; k++) { let n = 0; for (let x = 0; x < W; x++) if (t[k * W + x] === v) n++; pool.push({ t: 'count', ax: 'r', k, v, n }); }
      for (let k = 0; k < W; k++) { let n = 0; for (let y = 0; y < H; y++) if (t[y * W + k] === v) n++; pool.push({ t: 'count', ax: 'c', k, v, n }); }
      let n = 0; for (const x of t) if (x === v) n++; pool.push({ t: 'count', ax: 'a', k: 0, v, n });
    }
    for (const L of lms) {
      const p = sol.lm[L];
      for (const z of 'nsew') if (CG.inZone(st, p, z)) pool.push({ t: 'zone', lm: L, z });
      for (const v of pal) {
        if (HOME[L] === bit(v)) continue;
        const ns = CG.nbrs(st, p), touches = ns.some((q) => t[q] === v);
        pool.push({ t: 'touch', lm: L, v, neg: !touches });
      }
      for (const d of 'nsew') {
        const [dx, dy] = CG.DIRS[d]; const [x, y] = CG.xy(st, p);
        for (let n = 1; n <= Math.max(W, H); n++) {
          const j = CG.at(st, x + dx * n, y + dy * n); if (j < 0) break;
          if (t[j] === SEA) { pool.push({ t: 'walk', lm: L, d, n, reach: true }); break; }
          if (n >= 2) pool.push({ t: 'walk', lm: L, d, n, reach: false });
        }
      }
      for (const d of 'nsew') {
        const [dx, dy] = CG.DIRS[d]; const [x, y] = CG.xy(st, p);
        const j1 = CG.at(st, x + dx, y + dy); if (j1 < 0 || t[j1] === SEA) continue;
        const v = t[j1];
        for (let n = 1; n <= 3; n++) { const j = CG.at(st, x + dx * n, y + dy * n); if (j < 0 || t[j] !== v) break; pool.push({ t: 'path', lm: L, d, n, v }); }
      }
      for (const v of pal) {
        const n = CG.nbrs(st, p).filter((q) => t[q] === v).length;
        if (n >= 2 || (v === SEA && n >= 1)) pool.push({ t: 'ntouch', lm: L, v, n });
      }
      for (const K of lms) if (K !== L) {
        const [ax, ay] = CG.xy(st, p), [bx, by] = CG.xy(st, sol.lm[K]);
        const dx = ax - bx, dy = ay - by;
        if (Math.abs(dx) + Math.abs(dy) <= 5) pool.push({ t: 'rel', a: L, b: K, dx, dy });
      }
    }
    return pool;
  }
  function sketchClue(r, W, H, sol, size) {
    // a torn fragment: a small blob of adjacent tiles
    const st = { W, H, N: W * H };
    const start = (r() * W * H) | 0, cells = [start];
    while (cells.length < size) { const q = pick(r, CG.nbrs(st, pick(r, cells))); if (!cells.includes(q)) cells.push(q); }
    return { t: 'sketch', cells: cells.map((i) => [i, sol.t[i]]) };
  }

  // Weights shape the "feel": landmark clues are the interesting ones; counts are the scaffold.
  const WEIGHT = { count: 0.45, rel: 3, touch: 2.2, walk: 2.6, path: 2.8, ntouch: 2.6, zone: 1.2, sketch: 0.8 };

  // spec: {W,H,pal,lms,seed,maxLvl,minLvl,reveal(0..1),max4,maxClues,attempts}
  function progress(st0, st1, P) {
    let g = 0; for (let k = 0; k < st0.N; k++) g += CG.pop(st0.dom[k]) - CG.pop(st1.dom[k]);
    for (const L of P.lms) g += (CG.cands(st0, L).length - CG.cands(st1, L).length) * 0.25;
    return g;
  }
  function generate(spec) {
    const r = rng(spec.seed);
    const W = spec.W, H = spec.H, N = W * H;
    for (let attempt = 0; attempt < (spec.attempts || 40); attempt++) {
      const t = makeMap(r, W, H, spec.pal); if (!t) continue;
      const lm = placeLandmarks(r, W, H, t, spec.lms); if (!lm) continue;
      const sol = { t, lm };
      const pool = cluePool(W, H, sol, spec.pal, spec.lms).filter((c) => !(c.t === 'count' && c.ax === 'a' && c.v === SEA));
      const clues = [];
      // torn sketch: blobs until `reveal` of the map is shown
      const sk = { t: 'sketch', cells: [] }, inSk = new Set();
      const stg = { W, H, N };
      while (inSk.size < N * (spec.reveal || 0)) {
        let q = (r() * N) | 0; const blob = [q];
        for (let k = 0; k < 2 + r() * 4; k++) { q = pick(r, CG.nbrs(stg, pick(r, blob))); blob.push(q); }
        for (const i of blob) inSk.add(i);
      }
      for (const i of inSk) sk.cells.push([i, t[i]]);
      if (sk.cells.length) clues.push(sk);
      const P = { W, H, pal: spec.pal, lms: spec.lms, clues, sol };
      const mx = spec.maxLvl;
      const used = new Set();
      let cur = CG.solve(P, { maxLvl: Math.min(mx, 2) }).st, ok = false;
      for (let it = 0; it < 60; it++) {
        // sample candidate clues, take the one with best weighted progress
        let best = null, bs = -1;
        for (let k = 0; k < 14; k++) {
          const c = pick(r, pool); if (used.has(c)) continue;
          const lineCnt = (c.t === 'count' && c.ax !== 'a') ? clues.filter((d) => d.t === 'count' && d.ax === c.ax && d.k === c.k).length : 0;
          if (lineCnt >= 2) continue;
          const Q = { ...P, clues: clues.concat([c]) };
          const rr = CG.solve(Q, { maxLvl: Math.min(mx, 2), from: cur });
          const g = progress(cur, rr.st, P) * WEIGHT[c.t] * (0.7 + r() * 0.6);
          if (g > bs) { bs = g; best = [c, rr.st]; }
        }
        if (!best) continue;
        used.add(best[0]); clues.push(best[0]); cur = best[1];
        if (CG.solved(cur)) { ok = true; break; }
        if (mx > 2 && clues.length >= 4) { const rr = CG.solve(P, { maxLvl: mx }); if (rr.ok) { ok = true; break; } }
      }
      if (!ok) continue;
      // minimise clues (cheap ones first), then thin the sketch
      const order = clues.filter((c) => c.t !== 'sketch').map((c) => [c, WEIGHT[c.t] + r() * 0.8]).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
      const good = () => { const rr = CG.solve(P, { maxLvl: mx }); return rr.ok && (!spec.max4 || rr.counts[4] <= spec.max4); };
      for (const c of order) { const j = clues.indexOf(c); clues.splice(j, 1); if (!good()) clues.splice(j, 0, c); }
      if (sk.cells.length) {
        const cs = shuffle(r, sk.cells.slice());
        for (const cell of cs) { const j = sk.cells.indexOf(cell); sk.cells.splice(j, 1); if (!good()) sk.cells.splice(j, 0, cell); }
        if (!sk.cells.length) clues.splice(clues.indexOf(sk), 1);
      }
      const res = CG.solve(P, { maxLvl: mx });
      if (!res.ok) continue;
      if (spec.max4 !== undefined && res.counts[4] > spec.max4) continue;
      if (spec.minLvl && res.maxLvl < spec.minLvl) continue;
      if (clues.length > (spec.maxClues || 99)) continue;
      if (!CG.sameMap(CG.toMap(res.st), sol)) continue;
      return { W, H, pal: spec.pal, lms: spec.lms, clues: sortClues(clues), sol, rating: rate(res), seed: spec.seed, attempt };
    }
    return null;
  }
  function sortClues(cl) { const o = { sketch: 0, zone: 1, rel: 2, walk: 3, path: 3.5, touch: 4, ntouch: 4.5, count: 5 }; return cl.slice().sort((a, b) => o[a.t] - o[b.t]); }
  function rate(res) {
    const c = res.counts;
    const score = c[1] * 0.2 + c[2] * 1 + c[3] * 4 + c[4] * 7;
    return { maxLvl: res.maxLvl, counts: c, score: Math.round(score * 10) / 10 };
  }

  // Chart mode: order clues into waves; each wave lets the solver make progress.
  function waves(P, maxLvl) {
    const remaining = P.clues.slice(), have = [], out = [];
    let st = CG.init(P);
    const base = { ...P, clues: have };
    while (remaining.length) {
      // pick the clue that alone yields the most progress
      let best = -1, bestGain = -1, bestSt = null;
      for (let i = 0; i < remaining.length; i++) {
        const Q = { ...P, clues: have.concat([remaining[i]]) };
        const r = CG.solve(Q, { maxLvl, from: st });
        if (r.contra) continue;
        let gain = 0; for (let k = 0; k < st.N; k++) if (r.st.dom[k] !== st.dom[k]) gain += 2; for (const L of P.lms) gain += CG.cands(st, L).length - CG.cands(r.st, L).length > 0 ? 1 : 0;
        if (gain > bestGain) { bestGain = gain; best = i; bestSt = r.st; }
      }
      if (best < 0) best = 0;
      const c = remaining.splice(best, 1)[0]; have.push(c);
      if (bestSt) st = bestSt;
      if (!out.length || bestGain > 0 || out[out.length - 1].length >= 2) out.push([c]); else out[out.length - 1].push(c);
    }
    void base;
    return out;
  }

  const GEN = { rng, hashStr, makeMap, placeLandmarks, cluePool, generate, rate, waves, shuffle };
  if (typeof module !== 'undefined' && module.exports) module.exports = GEN; else root.CGEN = GEN;
})(typeof window !== 'undefined' ? window : globalThis);
