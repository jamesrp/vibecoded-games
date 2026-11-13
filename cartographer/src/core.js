// CARTOGRAPHER core: puzzle model, clue semantics, human-like deduction solver, brute-force uniqueness check.
// UMD: window.CG in the browser, module.exports in Node.
(function (root) {
  'use strict';
  const SEA = 0, SAND = 1, GRASS = 2, FOREST = 3, MOUNT = 4;
  const TERR = ['sea', 'sand', 'grass', 'forest', 'mountain'];
  const TNAME = ['sea', 'sand', 'grass', 'forest', 'mountain'];
  const TPLUR = ['sea tiles', 'sand tiles', 'grass tiles', 'forests', 'mountains'];
  const LAND = 0b11110;
  const LMS = ['village', 'temple', 'volcano', 'treasure', 'lighthouse'];
  const HOME = { village: 1 << GRASS, temple: 1 << FOREST, volcano: 1 << MOUNT, treasure: 1 << SAND, lighthouse: LAND };
  const DIRS = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
  const DNAME = { n: 'north', s: 'south', e: 'east', w: 'west' };
  const bit = (v) => 1 << v;
  const pop = (m) => { let c = 0; while (m) { m &= m - 1; c++; } return c; };
  const only = (m) => (m && !(m & (m - 1))) ? 31 - Math.clz32(m) : -1;

  class Contra extends Error { constructor(w) { super(w || 'contradiction'); } }

  // ---------- state ----------
  function palMask(P) { let m = 0; for (const v of P.pal) m |= bit(v); return m; }
  function init(P) {
    const N = P.W * P.H, pm = palMask(P);
    const st = { W: P.W, H: P.H, N, dom: new Uint8Array(N).fill(pm), lm: {} };
    for (const L of P.lms) st.lm[L] = new Uint8Array(N).fill(1);
    return st;
  }
  function clone(st) {
    const c = { W: st.W, H: st.H, N: st.N, dom: st.dom.slice(), lm: {} };
    for (const k in st.lm) c.lm[k] = st.lm[k].slice();
    return c;
  }
  function sig(st) { let s = Array.from(st.dom).join(''); for (const k in st.lm) s += '|' + Array.from(st.lm[k]).join(''); return s; }
  function cands(st, L) { const a = st.lm[L], r = []; for (let i = 0; i < a.length; i++) if (a[i]) r.push(i); return r; }
  function lmFixed(st, L) { const c = cands(st, L); return c.length === 1 ? c[0] : -1; }
  function solved(st) { for (let i = 0; i < st.N; i++) if (only(st.dom[i]) < 0) return false; for (const k in st.lm) if (lmFixed(st, k) < 0) return false; return true; }

  // mutators: return true if changed; throw on empty domain
  function keep(st, i, mask) {
    const o = st.dom[i], n = o & mask; if (n === o) return false;
    if (!n) throw new Contra('tile empty'); st.dom[i] = n; return true;
  }
  function lmKeep(st, L, pred) {
    const a = st.lm[L]; let ch = false, any = false;
    for (let i = 0; i < a.length; i++) if (a[i]) { if (!pred(i)) { a[i] = 0; ch = true; } else any = true; }
    if (!any) throw new Contra('no spot for ' + L); return ch;
  }
  const xy = (st, i) => [i % st.W, (i / st.W) | 0];
  const at = (st, x, y) => (x < 0 || y < 0 || x >= st.W || y >= st.H) ? -1 : y * st.W + x;
  function nbrs(st, i) { const [x, y] = xy(st, i), r = []; for (const d of 'nesw') { const j = at(st, x + DIRS[d][0], y + DIRS[d][1]); if (j >= 0) r.push(j); } return r; }

  // ---------- clue scope (cells a clue talks about, for highlights) ----------
  function lineCells(st, c) {
    const r = [];
    if (c.ax === 'r') for (let x = 0; x < st.W; x++) r.push(c.k * st.W + x);
    else if (c.ax === 'c') for (let y = 0; y < st.H; y++) r.push(y * st.W + c.k);
    else for (let i = 0; i < st.N; i++) r.push(i);
    return r;
  }
  function inZone(st, i, z) {
    const [x, y] = xy(st, i);
    if (z === 'n') return y * 2 < st.H - 1; if (z === 's') return y * 2 > st.H - 1;
    if (z === 'w') return x * 2 < st.W - 1; return x * 2 > st.W - 1;
  }
  function walkCells(st, p, c) {
    const [x, y] = xy(st, p), d = DIRS[c.d], r = [];
    for (let k = 1; k <= c.n; k++) { const j = at(st, x + d[0] * k, y + d[1] * k); if (j < 0) return null; r.push(j); }
    return r;
  }
  function relSrc(st, p, c) { const [x, y] = xy(st, p); return at(st, x - c.dx, y - c.dy); } // b from a
  function relDst(st, q, c) { const [x, y] = xy(st, q); return at(st, x + c.dx, y + c.dy); } // a from b

  // ---------- techniques ----------
  // Each returns true if it changed st. lvl 1 = look, 2 = narrow.
  function applyRule(st, P, L, lvl) {
    let ch = false; const H = HOME[L];
    if (lvl === 1) {
      ch = lmKeep(st, L, (i) => st.dom[i] & H) || ch;
      if (L === 'lighthouse') ch = lmKeep(st, L, (i) => nbrs(st, i).some((q) => st.dom[q] & 1)) || ch;
      const f = lmFixed(st, L);
      if (f >= 0) {
        ch = keep(st, f, H) || ch;
        for (const K of P.lms) if (K !== L && st.lm[K][f]) { ch = lmKeep(st, K, (i) => i !== f) || ch; }
        if (L === 'lighthouse') {
          const ns = nbrs(st, f).filter((q) => st.dom[q] & 1);
          if (ns.length === 1) ch = keep(st, ns[0], 1) || ch;
        }
      }
    }
    return ch;
  }
  function applyClue(st, P, c, lvl) {
    let ch = false;
    switch (c.t) {
      case 'sketch':
        if (lvl === 1) for (const [i, v] of c.cells) ch = keep(st, i, bit(v)) || ch;
        return ch;
      case 'zone':
        if (lvl === 1) ch = lmKeep(st, c.lm, (i) => inZone(st, i, c.z));
        return ch;
      case 'count': {
        if (lvl !== 1) return false;
        const cells = lineCells(st, c), b = bit(c.v);
        let mn = 0, mx = 0;
        for (const i of cells) { if (st.dom[i] === b) mn++; if (st.dom[i] & b) mx++; }
        if (mn > c.n || mx < c.n) throw new Contra('count');
        if (mn === c.n) { for (const i of cells) if (st.dom[i] !== b) ch = keep(st, i, ~b) || ch; }
        else if (mx === c.n) { for (const i of cells) if (st.dom[i] & b) ch = keep(st, i, b) || ch; }
        return ch;
      }
      case 'rel': {
        const fa = lmFixed(st, c.a), fb = lmFixed(st, c.b);
        if (lvl === 1) {
          if (fb >= 0 && fa < 0) { const t = relDst(st, fb, c); ch = lmKeep(st, c.a, (i) => i === t); }
          else if (fa >= 0 && fb < 0) { const s = relSrc(st, fa, c); ch = lmKeep(st, c.b, (i) => i === s); }
          else if (fa >= 0 && fb >= 0 && relDst(st, fb, c) !== fa) throw new Contra('rel');
        } else {
          ch = lmKeep(st, c.a, (i) => { const s = relSrc(st, i, c); return s >= 0 && st.lm[c.b][s]; }) || ch;
          ch = lmKeep(st, c.b, (i) => { const t = relDst(st, i, c); return t >= 0 && st.lm[c.a][t]; }) || ch;
        }
        return ch;
      }
      case 'touch': {
        const b = bit(c.v);
        const ok = c.neg ? (i) => nbrs(st, i).every((q) => st.dom[q] & ~b) : (i) => nbrs(st, i).some((q) => st.dom[q] & b);
        const f = lmFixed(st, c.lm);
        if (lvl === 1) {
          if (f < 0) return false;
          if (!ok(f)) throw new Contra('touch');
          if (c.neg) for (const q of nbrs(st, f)) ch = keep(st, q, ~b) || ch;
          else { const ns = nbrs(st, f).filter((q) => st.dom[q] & b); if (ns.length === 1) ch = keep(st, ns[0], b) || ch; }
        } else ch = lmKeep(st, c.lm, ok);
        return ch;
      }
      case 'path': {
        const b = bit(c.v);
        const ok = (p) => { const w = walkCells(st, p, c); return !!w && w.every((q) => st.dom[q] & b); };
        const f = lmFixed(st, c.lm);
        if (lvl === 1) {
          if (f < 0) return false;
          if (!ok(f)) throw new Contra('path');
          for (const q of walkCells(st, f, c)) ch = keep(st, q, b) || ch;
        } else ch = lmKeep(st, c.lm, ok);
        return ch;
      }
      case 'ntouch': {
        const b = bit(c.v);
        const mm = (p) => { let mn = 0, mx = 0; for (const q of nbrs(st, p)) { if (st.dom[q] === b) mn++; if (st.dom[q] & b) mx++; } return [mn, mx]; };
        const f = lmFixed(st, c.lm);
        if (lvl === 1) {
          if (f < 0) return false;
          const [mn, mx] = mm(f);
          if (mn > c.n || mx < c.n) throw new Contra('ntouch');
          if (mn === c.n) { for (const q of nbrs(st, f)) if (st.dom[q] !== b) ch = keep(st, q, ~b) || ch; }
          else if (mx === c.n) { for (const q of nbrs(st, f)) if (st.dom[q] & b) ch = keep(st, q, b) || ch; }
        } else ch = lmKeep(st, c.lm, (p) => { const [mn, mx] = mm(p); return mn <= c.n && c.n <= mx; });
        return ch;
      }
      case 'walk': {
        const ok = (p) => {
          const w = walkCells(st, p, c); if (!w) return false;
          for (let k = 0; k < w.length; k++) {
            const last = k === w.length - 1;
            if (c.reach && last) { if (!(st.dom[w[k]] & 1)) return false; } else if (!(st.dom[w[k]] & ~1)) return false;
          }
          return true;
        };
        const f = lmFixed(st, c.lm);
        if (lvl === 1) {
          if (f < 0) return false;
          if (!ok(f)) throw new Contra('walk');
          const w = walkCells(st, f, c);
          for (let k = 0; k < w.length; k++) ch = keep(st, w[k], (c.reach && k === w.length - 1) ? 1 : ~1) || ch;
        } else ch = lmKeep(st, c.lm, ok);
        return ch;
      }
    }
    return false;
  }

  // All lvl-1/2 techniques as a list of [lvl, clueIndex(-1 rule), fn]
  function techniques(P) {
    const T = [];
    for (const lvl of [1, 2]) {
      for (const L of P.lms) T.push([lvl, 'rule:' + L, (st) => applyRule(st, P, L, lvl)]);
      P.clues.forEach((c, ci) => T.push([lvl, ci, (st) => applyClue(st, P, c, lvl)]));
    }
    return T;
  }
  // Propagate lvl<=maxLvl (1 or 2) to fixpoint. Throws Contra.
  function propagate(st, P, maxLvl, T) {
    T = T || techniques(P);
    let any = false;
    for (;;) {
      let ch = false;
      for (const [lvl, , fn] of T) { if (lvl > maxLvl) continue; if (fn(st)) { ch = true; any = true; if (lvl > 1) break; } }
      if (!ch) return any;
    }
  }
  function diff(a, b) { // cells/landmarks that changed from a to b
    const cells = [], lms = [], gone = [];
    for (let i = 0; i < a.N; i++) if (a.dom[i] !== b.dom[i]) cells.push(i);
    for (const k in a.lm) { let any = false; for (let i = 0; i < a.N; i++) if (a.lm[k][i] !== b.lm[k][i]) { any = true; gone.push([k, i]); } if (any) lms.push(k); }
    return { cells, lms, gone };
  }

  // One human-like step: the lowest-level deduction available. Returns {lvl, src, kind, before, after} or null.
  function step(st, P, maxLvl, T) {
    T = T || techniques(P);
    for (const lv of [1, 2]) {
      if (lv > maxLvl) break;
      for (const [lvl, src, fn] of T) {
        if (lvl !== lv) continue;
        const b = clone(st);
        if (fn(st)) return { lvl, src, kind: lvl === 1 ? 'look' : 'narrow', ...diff(b, st) };
      }
    }
    if (maxLvl >= 3) {
      // What-if on a landmark: try each spot, propagate L1-2.
      const order = P.lms.map((L) => [L, cands(st, L).length]).filter((x) => x[1] > 1).sort((a, b) => a[1] - b[1]);
      for (const [L, n] of order) {
        if (n > 8) continue;
        const cs = cands(st, L), alive = [];
        for (const p of cs) {
          const t = clone(st); t.lm[L].fill(0); t.lm[L][p] = 1;
          try { propagate(t, P, 2, T); alive.push(t); } catch (e) { if (!(e instanceof Contra)) throw e; }
        }
        if (!alive.length) throw new Contra('no spot works for ' + L);
        const b = clone(st);
        if (alive.length < cs.length) {
          for (const p of cs) if (!alive.some((t) => t.lm[L][p])) st.lm[L][p] = 0;
          return { lvl: 3, src: 'whatif:' + L, kind: 'whatif-lm', L, ...diff(b, st) };
        }
        // all roads: every surviving spot agrees on something
        let ch = false;
        for (let i = 0; i < st.N; i++) { let u = 0; for (const t of alive) u |= t.dom[i]; if (u !== st.dom[i]) { st.dom[i] &= u; ch = true; } }
        for (const K of P.lms) if (K !== L) for (let i = 0; i < st.N; i++) if (st.lm[K][i] && !alive.some((t) => t.lm[K][i])) { st.lm[K][i] = 0; ch = true; }
        if (ch) return { lvl: 3, src: 'allroads:' + L, kind: 'allroads', L, ...diff(b, st) };
      }
    }
    if (maxLvl >= 4) {
      for (let i = 0; i < st.N; i++) {
        const d = st.dom[i]; if (only(d) >= 0) continue;
        for (let v = 0; v < 5; v++) if (d & bit(v)) {
          const t = clone(st); t.dom[i] = bit(v);
          try { propagate(t, P, 2, T); } catch (e) {
            if (!(e instanceof Contra)) throw e;
            const b = clone(st); keep(st, i, ~bit(v));
            return { lvl: 4, src: 'tile:' + i, kind: 'whatif-tile', cell: i, v, ...diff(b, st) };
          }
        }
      }
    }
    return null;
  }

  // Full human-like solve. Returns {ok, st, steps, maxLvl, counts:{1,2,3,4}, contra}
  function solve(P, opts) {
    opts = opts || {}; const maxLvl = opts.maxLvl || 4; const T = techniques(P);
    let st = opts.from ? clone(opts.from) : init(P);
    const steps = [], counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
    let used = 0;
    try {
      for (let guard = 0; guard < 5000; guard++) {
        // fast path: fold L1 to fixpoint, counting as L1 steps
        const s = step(st, P, maxLvl, T);
        if (!s) break;
        counts[s.lvl]++; used = Math.max(used, s.lvl);
        if (opts.trace) steps.push(s);
      }
    } catch (e) { if (e instanceof Contra) return { ok: false, contra: true, st, steps, counts, maxLvl: used }; throw e; }
    return { ok: solved(st), st, steps, counts, maxLvl: used };
  }

  // Brute force: count solutions up to `limit` (DFS with L1-2 propagation).
  function countSolutions(P, limit) {
    limit = limit || 2; const T = techniques(P); let n = 0; const sols = [];
    function rec(st) {
      try { propagate(st, P, 2, T); } catch (e) { if (e instanceof Contra) return; throw e; }
      if (solved(st)) { if (checkFull(P, toMap(st))) { n++; sols.push(toMap(st)); } return; }
      // branch on landmark with fewest cands, else tile with fewest values
      let best = null, bn = 99;
      for (const L of P.lms) { const c = cands(st, L); if (c.length > 1 && c.length < bn) { bn = c.length; best = ['L', L, c]; } }
      if (!best) for (let i = 0; i < st.N; i++) { const p = pop(st.dom[i]); if (p > 1 && p < bn) { bn = p; best = ['T', i]; } }
      if (best[0] === 'L') { for (const p of best[2]) { if (n >= limit) return; const t = clone(st); t.lm[best[1]].fill(0); t.lm[best[1]][p] = 1; rec(t); } }
      else { const i = best[1], d = st.dom[i]; for (let v = 0; v < 5; v++) if (d & bit(v)) { if (n >= limit) return; const t = clone(st); t.dom[i] = bit(v); rec(t); } }
    }
    rec(init(P));
    return { n, sols };
  }
  function toMap(st) { const t = Array.from(st.dom, only), lm = {}; for (const k in st.lm) lm[k] = lmFixed(st, k); return { t, lm }; }

  // ---------- evaluate against a (partial) player map ----------
  // map: {t:[-1|terr], lm:{L: -1|i}}
  function stateFromMap(P, m) {
    const st = init(P);
    for (let i = 0; i < st.N; i++) if (m.t[i] >= 0) st.dom[i] = bit(m.t[i]);
    for (const L of P.lms) if (m.lm[L] >= 0) { st.lm[L].fill(0); st.lm[L][m.lm[L]] = 1; }
    return st;
  }
  // Tiles that the row/column margin counts alone force, given the inked map. Returns [[i, v]]; [] on contradiction.
  function forcedByCounts(P, clues, m) {
    const counts = clues.filter((c) => c.t === 'count' && c.ax !== 'a'); if (!counts.length) return [];
    const Pa = { ...P, clues: counts }, st = init(Pa);
    for (let i = 0; i < st.N; i++) if (m.t[i] >= 0) st.dom[i] = bit(m.t[i]);
    try { for (let k = 0; k < 60; k++) { let ch = false; for (const c of counts) ch = applyClue(st, Pa, c, 1) || ch; if (!ch) break; } } catch (e) { if (e instanceof Contra) return []; throw e; }
    const out = []; for (let i = 0; i < st.N; i++) { const v = only(st.dom[i]); if (m.t[i] < 0 && v >= 0) out.push([i, v]); }
    return out;
  }
  function clueScope(P, c, m) { // cells relevant given player map (for highlight), plus whether fully determined
    const st = init(P);
    switch (c.t) {
      case 'sketch': return c.cells.map((x) => x[0]);
      case 'count': return lineCells(st, c);
      case 'zone': { const r = []; for (let i = 0; i < st.N; i++) if (inZone(st, i, c.z)) r.push(i); return r; }
      case 'rel': return [m && m.lm[c.a], m && m.lm[c.b]].filter((x) => x >= 0);
      case 'touch': { const p = m && m.lm[c.lm]; return p >= 0 ? [p, ...nbrs(st, p)] : []; }
      case 'walk': case 'path': { const p = m && m.lm[c.lm]; if (!(p >= 0)) return []; return [p, ...(walkCells(st, p, c) || [])]; }
      case 'ntouch': { const p = m && m.lm[c.lm]; return p >= 0 ? [p, ...nbrs(st, p)] : []; }
    }
    return [];
  }
  // 'broken' | 'ok' | 'open'
  function clueStatus(P, c, m) {
    const st = stateFromMap(P, m);
    try {
      for (let k = 0; k < 20; k++) {
        let ch = false;
        ch = applyClue(st, P, c, 1) || ch; ch = applyClue(st, P, c, 2) || ch;
        if (!ch) break;
      }
    } catch (e) { if (e instanceof Contra) return 'broken'; throw e; }
    // determined?
    const need = [];
    if (c.t === 'rel') { if (!(m.lm[c.a] >= 0 && m.lm[c.b] >= 0)) return 'open'; return 'ok'; }
    if (c.t === 'zone') return m.lm[c.lm] >= 0 ? 'ok' : 'open';
    if (['touch', 'walk', 'path', 'ntouch'].includes(c.t) && !(m.lm[c.lm] >= 0)) return 'open';
    for (const i of clueScope(P, c, m)) need.push(i);
    for (const i of need) if (m.t[i] < 0) return 'open';
    return 'ok';
  }
  function checkFull(P, m) {
    for (const L of P.lms) if (!(m.lm[L] >= 0)) return false;
    const seen = new Set(); for (const L of P.lms) { if (seen.has(m.lm[L])) return false; seen.add(m.lm[L]); }
    for (let i = 0; i < m.t.length; i++) if (m.t[i] < 0 || !P.pal.includes(m.t[i])) return false;
    for (const L of P.lms) {
      const p = m.lm[L]; if (!(HOME[L] & bit(m.t[p]))) return false;
      if (L === 'lighthouse') { const st = init(P); if (!nbrs(st, p).some((q) => m.t[q] === SEA)) return false; }
    }
    for (const c of P.clues) if (clueStatus(P, c, m) !== 'ok') return false;
    return true;
  }
  function sameMap(a, b) { for (let i = 0; i < a.t.length; i++) if (a.t[i] !== b.t[i]) return false; for (const k in a.lm) if (a.lm[k] !== b.lm[k]) return false; return true; }


  // ---------- what the player can see (v0.4) ----------
  // Every constraint the solver uses must be on screen. This is the single source for what the play screen renders:
  // the island card (landmarks, each exactly once, with its home), the palette (the only terrains), the margins
  // (fixed terrain slots per axis; a slot with no number shows a faint "?" = not counted), the report cards, and
  // the pre-inked sketch tiles. puzzleFromVisible() rebuilds a puzzle from this model alone; tests check that every
  // island is still unique and guess-free from it.
  const RULES = { lmOnce: true, onePerTile: true, edge: 'uncharted' }; // shown in the island card's rule line
  function visibleModel(P, clues, sketchCells) {
    const counts = clues.filter((c) => c.t === 'count' && c.ax !== 'a');
    const margins = {};
    for (const ax of ['r', 'c']) {
      const slots = P.pal.filter((v) => counts.some((c) => c.ax === ax && c.v === v));
      const n = ax === 'r' ? P.H : P.W, lines = [];
      for (let k = 0; k < n; k++) lines.push(slots.map((v) => { const c = counts.find((d) => d.ax === ax && d.k === k && d.v === v); return c ? c.n : null; }));
      margins[ax] = { slots, lines };
    }
    const cards = clues.filter((c) => c.t !== 'sketch' && !(c.t === 'count' && c.ax !== 'a'));
    const legend = P.lms.map((L) => ({ L, n: 1, home: L === 'lighthouse' ? 'by-sea' : only(HOME[L]) }));
    let sketch = sketchCells;
    if (!sketch) { sketch = []; for (const c of clues) if (c.t === 'sketch') sketch.push(...c.cells); }
    return { W: P.W, H: P.H, pal: P.pal.slice(), legend, rules: RULES, margins, cards, sketch };
  }
  function puzzleFromVisible(V) {
    const clues = [];
    if (V.sketch.length) clues.push({ t: 'sketch', cells: V.sketch.map((x) => x.slice()) });
    for (const ax of ['r', 'c']) V.margins[ax].lines.forEach((line, k) => line.forEach((n, j) => { if (n !== null) clues.push({ t: 'count', ax, k, v: V.margins[ax].slots[j], n }); }));
    for (const c of V.cards) clues.push(JSON.parse(JSON.stringify(c)));
    const lms = V.legend.filter((e) => e.n === 1).map((e) => e.L);
    for (const e of V.legend) if (e.home !== (e.L === 'lighthouse' ? 'by-sea' : only(HOME[e.L]))) throw new Error('legend home differs from the rules for ' + e.L);
    return { W: V.W, H: V.H, pal: V.pal.slice(), lms, clues };
  }
  function marginWords(ax, k, v, n) {
    const where = (ax === 'r' ? 'Row ' : 'Column ') + (k + 1);
    if (n === null || n === undefined) return where + ': nobody counted the ' + TPLUR[v] + ' here. It could be any number.';
    return where + ': exactly ' + n + ' ' + (n === 1 ? (v === SEA ? 'sea tile' : TNAME[v]) : TPLUR[v]) + '.';
  }

  // ---------- words ----------
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  function relWords(dx, dy) {
    const p = [];
    if (dy) p.push(Math.abs(dy) + ' ' + (Math.abs(dy) === 1 ? 'tile' : 'tiles') + ' ' + (dy < 0 ? 'north' : 'south'));
    if (dx) p.push(Math.abs(dx) + ' ' + (Math.abs(dx) === 1 ? 'tile' : 'tiles') + ' ' + (dx > 0 ? 'east' : 'west'));
    return p.join(' and ');
  }
  function ordinal(n) { return ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth'][n] || (n + 1) + 'th'; }
  function clueText(P, c) {
    switch (c.t) {
      case 'sketch': return 'A torn sketch of part of the island.';
      case 'count': {
        const what = c.n === 1 ? 'one ' + (c.v === SEA ? 'sea tile' : TNAME[c.v]) : (c.n === 0 ? 'no ' + TPLUR[c.v] : c.n + ' ' + TPLUR[c.v]);
        if (c.ax === 'a') return 'The island has ' + what + ' in all.';
        return (c.ax === 'r' ? 'Along the ' + ordinal(c.k) + ' row' : 'Down the ' + ordinal(c.k) + ' column') + ': ' + what + '.';
      }
      case 'zone': { const odd = (c.z === 'n' || c.z === 's') ? P.H % 2 : P.W % 2;
        return odd ? 'The ' + c.lm + ' is ' + DNAME[c.z] + ' of the middle ' + (c.z === 'n' || c.z === 's' ? 'row' : 'column') + '.' : 'The ' + c.lm + ' is in the ' + DNAME[c.z] + 'ern half.'; }
      case 'rel': return 'The ' + c.a + ' is ' + relWords(c.dx, c.dy) + ' of the ' + c.b + '.';
      case 'touch': return c.neg ? 'No ' + TNAME[c.v] + ' touches the ' + c.lm + '.' : 'The ' + c.lm + ' touches ' + ['the sea', 'sand', 'grass', 'a forest', 'a mountain'][c.v] + '.';
      case 'path': return 'I walked ' + DNAME[c.d] + ' from the ' + c.lm + (c.n === 1 ? ' for a day' : ' for ' + c.n + ' days') + ', ' + (c.n === 1 ? 'into ' : 'all through ') + ['sea', 'sand', 'grassland', 'forest', 'the mountains'][c.v] + '.';
      case 'ntouch': return 'The ' + c.lm + ' touches exactly ' + c.n + ' ' + ['sea', 'sand', 'grass', 'forest', 'mountain'][c.v] + ' tile' + (c.n === 1 ? '' : 's') + '.';
      case 'walk': return c.reach
        ? 'I walked ' + DNAME[c.d] + ' from the ' + c.lm + ' and reached the sea on day ' + c.n + '.'
        : 'I walked ' + DNAME[c.d] + ' from the ' + c.lm + ' for ' + c.n + ' day' + (c.n > 1 ? 's' : '') + ' and never saw water.';
    }
    return '?';
  }
  function stepText(P, s) {
    if (!s) return 'Nothing more can be deduced yet.';
    if (typeof s.src === 'number') {
      const c = P.clues[s.src];
      return (s.lvl === 1 ? 'Look: ' : 'Narrow it down: ') + clueText(P, c);
    }
    if (s.src.startsWith('rule:') && s.pinsLm) { const L = s.src.slice(5); return 'This island has one ' + L + (L === 'lighthouse' ? ', on land next to a sea tile.' : ', and it stands on ' + TNAME[only(HOME[L])] + '.') + ' Only one spot is left where it can go.'; }
    if (s.src.startsWith('rule:')) { const L = s.src.slice(5); return 'Remember: this island has one ' + L + ', and it' + (L === 'lighthouse' ? ' stands on land touching a sea tile.' : ' stands on ' + TNAME[only(HOME[L])] + '.'); }
    if (s.kind === 'whatif-lm') return 'What if the ' + s.L + ' stood on a crossed tile? Some report would break every time. So it can\'t be there.';
    if (s.kind === 'allroads') return 'Wherever the ' + s.L + ' goes, this tile turns out the same.';
    if (s.kind === 'whatif-tile') return 'What if this tile were ' + TNAME[s.v] + '? A clue breaks, so it isn\'t.';
    return '';
  }

  // ---------- v0.4.1: "Where can the X stand?" ----------
  // Explain a landmark placement as frames: ask, then cross out spots one reason at a time, then the last spot.
  // st0 = the player's state. Returns null when the landmark can't be pinned by L1-2 reasoning alone.
  const TWORD = ['sea', 'sand', 'grass', 'forest', 'mountain'];
  function knownNames(st, cells, okMask) { const s = new Set(); for (const q of cells) { const v = only(st.dom[q]); if (v >= 0 && !(bit(v) & okMask)) s.add(TWORD[v]); } return [...s]; }
  function orList(a) { return a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' or ' + a[a.length - 1]; }
  function placeReasons(S, P, src, K, removed) {
    // split one technique's crossed spots into plain-language groups: [{text, spots}]
    const groups = [], add = (text, spots) => { if (spots.length) groups.push({ text, spots }); };
    if (typeof src === 'string') {
      if (K === 'lighthouse') {
        const sea = removed.filter((p) => !(S.dom[p] & LAND)), dry = removed.filter((p) => S.dom[p] & LAND);
        add('A lighthouse stands on land, so not on the sea.', sea);
        add('A lighthouse must touch the sea. Nothing next to these spots can be sea.', dry);
      } else add('The ' + K + ' stands on ' + TNAME[only(HOME[K])] + '. These spots can\'t be ' + TNAME[only(HOME[K])] + '.', removed);
      return groups;
    }
    const c = P.clues[src], say = '"' + clueText(P, c) + '"';
    if (c.t === 'path' || c.t === 'walk') {
      const room = removed.filter((p) => !walkCells(S, p, c)), rest = removed.filter((p) => walkCells(S, p, c));
      const days = c.n + ' day' + (c.n > 1 ? 's' : '');
      add(say + ' These spots have no room for ' + days + ' ' + DNAME[c.d] + ' before the map ends.', room);
      if (rest.length) {
        let bad = []; const okM = c.t === 'path' ? bit(c.v) : (c.reach ? 0b11111 : ~1), mark = new Set();
        for (const p of rest) { const w = walkCells(S, p, c); bad = bad.concat(knownNames(S, w, okM)); if (c.t === 'path') for (const q of w) if (!(S.dom[q] & okM)) { mark.add(q); break; } }
        bad = [...new Set(bad)];
        if (c.t === 'path') { add(say + ' From these spots the walk would cross ' + (bad.length ? orList(bad) : 'land that isn\'t ' + TWORD[c.v]) + ' (ringed).', rest); groups[groups.length - 1].mark = [...mark]; }
        else if (c.reach) add(say + ' From these spots the walk would hit water too soon, or find none on day ' + c.n + '.', rest);
        else add(say + ' From these spots the walk would hit water.', rest);
      }
      return groups;
    }
    if (c.t === 'rel') {
      const other = c.a === K ? c.b : c.a;
      const off = removed.filter((p) => (c.a === K ? relSrc(S, p, c) : relDst(S, p, c)) < 0), rest = removed.filter((p) => (c.a === K ? relSrc(S, p, c) : relDst(S, p, c)) >= 0);
      add(say + ' From these spots the ' + other + ' would be off the map.', off);
      add(say + ' From these spots the ' + other + ' would land where it can\'t stand.', rest);
      return groups;
    }
    if (c.t === 'zone') { add(say + ' So not these spots.', removed); return groups; }
    if (c.t === 'touch' || c.t === 'ntouch') { add(say + ' These spots can\'t match that.', removed); return groups; }
    add(say + ' So not these spots.', removed);
    return groups;
  }
  function placeStory(st0, P, L, T) {
    T = T || techniques(P);
    const S = clone(st0); const frames = [];
    try { propagate(S, P, 1, T.filter((t) => typeof t[1] === 'number' && (P.clues[t[1]].t === 'count' || P.clues[t[1]].t === 'sketch'))); } catch (e) { if (e instanceof Contra) return null; throw e; }
    const start = cands(S, L);
    if (start.length <= 1) return null;
    frames.push({ text: 'Where can the ' + L + ' stand? It could be on any of these ' + start.length + ' spots. Let\'s cross out the ones that break a rule or a report.', lm: L, spots: start.slice(), cross: [] });
    for (let guard = 0; guard < 40 && lmFixed(S, L) < 0; guard++) {
      let pick = null;
      for (const [lvl, src, fn] of T) {
        if (lvl > 2) continue;
        const t = clone(S); let ch;
        try { ch = fn(t); } catch (e) { if (e instanceof Contra) continue; throw e; }
        if (!ch) continue;
        const rem = {}; let n = 0;
        for (const K of P.lms) { const r = []; for (let i = 0; i < S.N; i++) if (S.lm[K][i] && !t.lm[K][i]) r.push(i); if (r.length) { rem[K] = r; n++; } }
        if (!n) { for (let i = 0; i < S.N; i++) S.dom[i] = t.dom[i]; pick = 'dom'; break; } // plain tile narrowing: apply silently
        const mine = rem[L] ? rem[L].length : 0;
        const rank = mine ? (src === 'rule:' + L ? 1000 : 100 + mine) : (rem[Object.keys(rem)[0]].length);
        if (!pick || rank > pick.rank) pick = { rank, src, t, rem, K: mine ? L : Object.keys(rem)[0] };
      }
      if (!pick) {
        // nothing simple left: try each remaining spot ("what if it stood here?") for this landmark, then the others
        let done = false;
        for (const K of [L].concat(P.lms.filter((x) => x !== L))) {
          const cs = cands(S, K); if (cs.length < 2 || cs.length > 8) continue;
          const bad = cs.filter((p) => { const t = clone(S); t.lm[K].fill(0); t.lm[K][p] = 1; try { propagate(t, P, 2, T); return false; } catch (e) { if (e instanceof Contra) return true; throw e; } });
          if (!bad.length || bad.length === cs.length) continue;
          for (const p of bad) S.lm[K][p] = 0;
          frames.push({ text: (K !== L ? 'Now look at the ' + K + '. ' : '') + 'What if the ' + K + ' stood on one of these? Follow the reports from there: one always breaks. So not here.', lm: K, cross: bad, spots: cands(S, K), clue: -1, whatif: true });
          done = true; break;
        }
        if (!done) break; continue;
      }
      if (pick === 'dom') continue;
      const K = pick.K, removed = pick.rem[K];
      const groups = placeReasons(S, P, pick.src, K, removed);
      for (const k in pick.t.lm) S.lm[k] = pick.t.lm[k];
      for (let i = 0; i < S.N; i++) S.dom[i] = pick.t.dom[i];
      const ci = typeof pick.src === 'number' ? pick.src : -1;
      groups.forEach((gr, gi) => {
        const left = cands(S, K).concat(gi < groups.length - 1 ? groups.slice(gi + 1).flatMap((x) => x.spots) : []);
        frames.push({ text: (K !== L ? 'Now look at the ' + K + '. ' : '') + gr.text, lm: K, cross: gr.spots, spots: left, clue: ci, mark: gr.mark || [] });
      });
    }
    const f = lmFixed(S, L);
    if (f < 0) return null;
    frames.push({ text: 'Only one spot is left. The ' + L + ' stands here.', lm: L, cross: [], spots: [f], pin: f });
    return frames;
  }

  const CG = { SEA, SAND, GRASS, FOREST, MOUNT, TERR, TNAME, LMS, HOME, DIRS, LAND, bit, pop, only, Contra,
    init, clone, sig, cands, lmFixed, solved, propagate, techniques, step, solve, countSolutions, toMap, stateFromMap,
    forcedByCounts, clueScope, clueStatus, checkFull, sameMap, clueText, stepText, visibleModel, puzzleFromVisible, marginWords, RULES, nbrs, xy, at, inZone, lineCells, walkCells, applyClue, applyRule, placeStory };
  if (typeof module !== 'undefined' && module.exports) module.exports = CG; else root.CG = CG;
})(typeof window !== 'undefined' ? window : globalThis);
