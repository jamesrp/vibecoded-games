// GHOST CHOIR solver: finds the minimum number of placed pieces (par) that makes the board sing the target loop.
// Complete for the piece set: beam-driven DFS decides each tile the first time light reaches it (a tile light never
// reaches cannot matter). Turning fixed candles / flipping fixed mirrors is free; placing a piece costs 1.
(function (root) {
  const S = typeof module !== 'undefined' ? require('./sim.js') : root.GC;
  const { DX, DY, MIR, key } = S;
  function targetOf(level) { return level._target || (level._target = S.tuneEvents(level.tune, level.L)); }
  function solve(level, opts = {}) {
    const { w, h, L } = level, target = targetOf(level).map((a) => new Set(a));
    const maxPieces = opts.maxPieces ?? 20, cap = opts.cap ?? 200, nodeCap = opts.nodeCap ?? 5e6;
    const base = new Map(); for (const p of level.fixed) { const q = Object.assign({}, p); delete q.x; delete q.y; base.set(key(p.x, p.y), q); }
    const inv0 = level.inv || {};
    const pitches = Object.keys(inv0.ghosts || {}).map(Number);
    const turnables = [...base.entries()].filter(([, p]) => p.turn);
    let failT = 0; const kid = opts.kid; let nodes = 0, found = [], count = 0, budget = 0, firstOnly = true;
    const board = new Map(base), decided = new Set(), placed = [], turned = [];
    const inv = { ghosts: Object.assign({}, inv0.ghosts || {}), mirror: inv0.mirror || 0, prism: inv0.prism || 0 };
    const lit = new Set();
    function beat(t, heads) {
      if (++nodes > nodeCap) throw new Error('nodeCap');
      if (t === L) { count++; if (found.length < cap) found.push(placed.concat(turned).map((p) => Object.assign({}, p))); return firstOnly || count >= cap; }
      if (!heads.length) { for (let u = t; u < L; u++) if (target[u].size) { failT = u; return false; } return beat(L, heads); }
      return proc(t, heads, 0, [], new Set(), new Set());
    }
    function proc(t, heads, i, next, ev, seen) {
      if (i === heads.length) {
        if (ev.size !== target[t].size) { failT = t; return false; }
        for (const e of ev) if (!target[t].has(e)) { failT = t; return false; }
        return beat(t + 1, next);
      }
      const hd = heads[i], hk = hd.x + ',' + hd.y + ',' + hd.d + ',' + hd.c;
      if (seen.has(hk) || hd.x < 0 || hd.y < 0 || hd.x >= w || hd.y >= h) return proc(t, heads, i + 1, next, ev, seen);
      const s2 = new Set(seen); s2.add(hk);
      const k = key(hd.x, hd.y), p = board.get(k);
      const mv = (d, c) => ({ x: hd.x + DX[d], y: hd.y + DY[d], d, c });
      const apply = (piece) => {
        if (!piece) return proc(t, heads, i + 1, next.concat([mv(hd.d, hd.c)]), ev, s2);
        if (piece.t === 'ghost') { const e = piece.n + ':' + hd.c; if (!target[t].has(e)) { failT = t; return false; } const e2 = new Set(ev); e2.add(e); return proc(t, heads, i + 1, next.concat([mv(hd.d, hd.c)]), e2, s2); }
        if (piece.t === 'mirror') return proc(t, heads, i + 1, next.concat([mv(MIR[piece.m][hd.d], hd.c)]), ev, s2);
        if (piece.t === 'prism') return proc(t, heads, i + 1, next.concat([mv((hd.d + 1) % 4, hd.c), mv((hd.d + 3) % 4, hd.c)]), ev, s2);
        if (piece.t === 'wick') {
          if (lit.has(k)) return proc(t, heads, i + 1, next, ev, s2);
          lit.add(k); const r = proc(t, heads, i + 1, next.concat([{ x: hd.x + DX[piece.d], y: hd.y + DY[piece.d], d: piece.d, c: piece.c }]), ev, s2); lit.delete(k); return r;
        }
        return proc(t, heads, i + 1, next, ev, s2); // candle / pillar end the light
      };
      if (p || decided.has(k)) return apply(p);
      // undecided empty tile: branch
      if (kid) return kidChoice(t, k, hd, ev, apply);
      decided.add(k);
      let stop = apply(null);
      if (!stop && placed.length < budget) {
        const opts2 = [];
        for (const n of pitches) if (inv.ghosts[n] > 0 && target[t].has(n + ':' + hd.c) && !ev.has(n + ':' + hd.c)) opts2.push({ t: 'ghost', n });
        if (inv.mirror > 0) opts2.push({ t: 'mirror', m: 0 }, { t: 'mirror', m: 1 });
        if (inv.prism > 0) opts2.push({ t: 'prism' });
        for (const q of opts2) {
          if (q.t === 'ghost') inv.ghosts[q.n]--; else inv[q.t]--;
          board.set(k, q); placed.push(Object.assign({ x: hd.x, y: hd.y }, q));
          stop = apply(q);
          placed.pop(); board.delete(k);
          if (q.t === 'ghost') inv.ghosts[q.n]++; else inv[q.t]++;
          if (stop) break;
        }
      }
      decided.delete(k);
      return stop;
    }
    // "kid" mode: a player who tries pieces in random order, notices a mistake only if it shows within kid.K beats,
    // and never rethinks older choices. Throws 'lost' if an unnoticed mistake dooms the board.
    function kidChoice(t, k, hd, ev, apply) {
      decided.add(k);
      const opts2 = [null];
      for (const n of pitches) if (inv.ghosts[n] > 0 && target[t].has(n + ':' + hd.c) && !ev.has(n + ':' + hd.c)) opts2.push({ t: 'ghost', n });
      if (inv.mirror > 0) opts2.push({ t: 'mirror', m: 0 }, { t: 'mirror', m: 1 });
      if (inv.prism > 0) opts2.push({ t: 'prism' });
      for (let i = opts2.length - 1; i > 0; i--) { const j = Math.floor(kid.rng() * (i + 1)); [opts2[i], opts2[j]] = [opts2[j], opts2[i]]; }
      let stop = false;
      for (const q of opts2) {
        if (q) { if (q.t === 'ghost') inv.ghosts[q.n]--; else inv[q.t]--; board.set(k, q); placed.push(Object.assign({ x: hd.x, y: hd.y }, q)); }
        failT = -1; stop = apply(q);
        if (q) { placed.pop(); board.delete(k); if (q.t === 'ghost') inv.ghosts[q.n]++; else inv[q.t]++; }
        if (stop) break;
        if (failT > t + kid.K) { decided.delete(k); throw new Error('lost'); }
        kid.tries++;
      }
      decided.delete(k);
      return stop;
    }
    if (kid) { // play once; turnables in random orientation order count as choices too
      budget = 99; kid.tries = 0;
      try { const ok = turnRec(0); return { ok: !!ok || found.length > 0, tries: kid.tries }; } catch (e) { if (e.message === 'lost') return { ok: false, tries: kid.tries }; throw e; }
    }
    function startHeads() { const hs = []; for (const [k, p] of board) if (p.t === 'candle') { const [x, y] = k.split(',').map(Number); hs.push({ x: x + DX[p.d], y: y + DY[p.d], d: p.d, c: p.c }); } return hs; }
    // enumerate free orientations of turnable pieces
    function turnRec(j) {
      if (j === turnables.length) return beat(0, startHeads());
      const [k, p] = turnables[j], orig = Object.assign({}, p);
      const choices = p.t === 'candle' || p.t === 'wick' ? [0, 1, 2, 3].map((d) => Object.assign({}, orig, { d })) : p.t === 'mirror' ? [0, 1].map((m) => Object.assign({}, orig, { m })) : [orig];
      for (const c of choices) { board.set(k, c); const extra = (c.d !== undefined && c.d !== orig.d) || (c.m !== undefined && c.m !== orig.m) ? { x: +k.split(',')[0], y: +k.split(',')[1], turn: c } : null; if (extra) turned.push(extra); const r = turnRec(j + 1); if (extra) turned.pop(); if (r) { board.set(k, orig); return r; } }
      board.set(k, orig); return false;
    }
    let par = null;
    for (budget = 0; budget <= maxPieces; budget++) { found = []; count = 0; turnRec(0); if (found.length) { par = budget; break; } }
    if (par === null) return { par: null, nodes };
    if (opts.parOnly) return { par, solutions: found, nodes };
    firstOnly = false; found = []; count = 0; turnRec(0); // budget == par: every leaf uses <= par pieces; < par impossible, so all are par
    return { par, count, capped: count >= cap, solutions: found, nodes };
  }
  const api = { solve, targetOf };
  if (typeof module !== 'undefined') module.exports = api; else root.GC = Object.assign(root.GC || {}, api);
})(this);
