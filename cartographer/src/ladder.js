// CARTOGRAPHER v0.5: the teaching ladder. Every solver step is one of a small set of STEP TYPES; each lesson teaches
// one new type. solveTaught() only uses the types taught so far, so a test can fail when an island needs a step the
// player hasn't been shown yet. UMD: window.CG_LADDER in the browser, module.exports in Node.
(function (root) {
  'use strict';
  const CG = (typeof module !== 'undefined' && module.exports) ? require('./core.js') : root.CG;
  const { only, bit, clone, cands, lmFixed, Contra } = CG;
  // id, short name (badge), what the player learns (one plain line), the picture shown on the badge
  const STEPS = [
    { id: 'look', name: 'Copy the sketch', line: 'Tiles the explorer sketched are already inked.', pic: 'sketch' },
    { id: 'count', name: 'Count a row', line: 'A margin number says exactly how many. When the row has them all, the rest is something else. When it needs every open tile, fill them.', pic: 'count' },
    { id: 'twoinks', name: 'Two inks', line: 'Every tile is one thing. If it can\'t be sea and can\'t be grass, it must be forest.', pic: 'twoinks' },
    { id: 'home', name: 'Landmark home', line: 'Each landmark on the island card is on the map exactly once, standing on its own land. If only one tile can be that land, the landmark goes there.', pic: 'home' },
    { id: 'walk', name: 'Follow a walk', line: 'Start at the landmark and step the days out. Every tile you pass matches the report.', pic: 'walk' },
    { id: 'touch', name: 'Touching', line: '"Touches" means shares a side. Check the four tiles around the landmark.', pic: 'touch' },
    { id: 'rel', name: 'Count steps between', line: 'If you know one landmark, count the tiles to find the other.', pic: 'rel' },
    { id: 'total', name: 'Island totals', line: 'The island card counts some land over the whole map. Add up what you have.', pic: 'total' },
    { id: 'zone', name: 'Half the map', line: 'Some reports say which half the landmark is in. Cross out the other half.', pic: 'zone' },
    { id: 'narrow', name: 'Where can it stand?', line: 'Before you ink anything, find the landmark: cross out every spot where a report would break. The last spot left is it.', pic: 'narrow' },
    { id: 'whatif', name: 'What if?', line: 'Pick a spot and pretend. If a report breaks, the landmark is not there.', pic: 'whatif' },
    { id: 'allroads', name: 'Every way agrees', line: 'Try every spot that is left. If each one makes a tile the same, ink that tile.', pic: 'allroads' },
    { id: 'whatiftile', name: 'What if this tile?', line: 'Pretend one tile is a land. If a report breaks, it isn\'t that land.', pic: 'whatiftile' },
  ];
  const BY = {}; STEPS.forEach((s, i) => { BY[s.id] = s; s.rank = i; });

  // What kind of step was this? Pass the state before and after a technique was applied.
  function classify(P, src, lvl, b, a) {
    if (typeof src === 'number') {
      const c = P.clues[src];
      if (c.t === 'sketch') return 'look';
      if (c.t === 'count') {
        if (c.ax === 'a') return 'total';
        // "two inks": a tile is pinned to a terrain the margin didn't count, by ruling out the counted one (3+ inks possible)
        if (P.pal.length >= 3) for (let i = 0; i < b.N; i++) if (b.dom[i] !== a.dom[i] && only(a.dom[i]) >= 0 && only(a.dom[i]) !== c.v) return 'twoinks';
        return 'count';
      }
      if (c.t === 'zone') return 'zone';
      if (lvl === 2) return 'narrow';
      if (c.t === 'walk' || c.t === 'path') return 'walk';
      if (c.t === 'touch' || c.t === 'ntouch') return 'touch';
      if (c.t === 'rel') return 'rel';
      return 'look';
    }
    if (src.startsWith('rule:')) return 'home';
    if (src.startsWith('whatif:')) return 'whatif';
    if (src.startsWith('allroads:')) return 'allroads';
    if (src.startsWith('tile:')) return 'whatiftile';
    return 'look';
  }
  // the technique's "base" type, for gating propagation inside a what-if
  function baseType(P, src, lvl) {
    if (typeof src !== 'number') return 'home';
    const c = P.clues[src];
    if (c.t === 'sketch') return 'look'; if (c.t === 'count') return c.ax === 'a' ? 'total' : 'count'; if (c.t === 'zone') return 'zone';
    if (lvl === 2) return 'narrow';
    return { walk: 'walk', path: 'walk', touch: 'touch', ntouch: 'touch', rel: 'rel' }[c.t] || 'look';
  }

  // Human-like solve using only the allowed step types. Returns {ok, used:Set, steps:[{type,...}], stuck}
  function solveTaught(P, allowed, opts) {
    opts = opts || {};
    const ok = (t) => allowed.has(t);
    const T = CG.techniques(P);
    const TT = T.filter(([lvl, src]) => ok(baseType(P, src, lvl)));
    const st = opts.from ? clone(opts.from) : CG.init(P);
    const used = new Set(), steps = [];
    const tryT = (lv) => {
      for (const [lvl, src, fn] of T) {
        if (lvl !== lv) continue;
        const t = clone(st); let ch;
        try { ch = fn(t); } catch (e) { if (e instanceof Contra) return { contra: true }; throw e; }
        if (!ch) continue;
        const ty = classify(P, src, lvl, st, t);
        if (!ok(ty)) continue;
        return { t, ty, src, lvl };
      }
      return null;
    };
    for (let guard = 0; guard < 5000; guard++) {
      let r = tryT(1) || tryT(2);
      if (r && r.contra) return { ok: false, contra: true, used, steps };
      if (!r) r = deep();
      if (!r) break;
      for (let i = 0; i < st.N; i++) st.dom[i] = r.t.dom[i];
      for (const k in st.lm) st.lm[k] = r.t.lm[k];
      used.add(r.ty); steps.push({ type: r.ty, src: r.src });
    }
    return { ok: CG.solved(st), used, steps, st };
    function prop(t) { CG.propagate(t, P, 2, TT); }
    function deep() {
      if (ok('whatif') || ok('allroads')) {
        const order = P.lms.map((L) => [L, cands(st, L).length]).filter((x) => x[1] > 1).sort((a, b) => a[1] - b[1]);
        for (const [L, n] of order) {
          if (n > 8) continue;
          const cs = cands(st, L), alive = [];
          for (const p of cs) { const t = clone(st); t.lm[L].fill(0); t.lm[L][p] = 1; try { prop(t); alive.push(t); } catch (e) { if (!(e instanceof Contra)) throw e; } }
          if (!alive.length) return null;
          if (alive.length < cs.length && ok('whatif')) { const t = clone(st); for (const p of cs) if (!alive.some((a) => a.lm[L][p])) t.lm[L][p] = 0; return { t, ty: 'whatif', src: 'whatif:' + L }; }
          if (alive.length === cs.length && ok('allroads')) {
            const t = clone(st); let ch = false;
            for (let i = 0; i < t.N; i++) { let u = 0; for (const a of alive) u |= a.dom[i]; if ((t.dom[i] & u) !== t.dom[i]) { t.dom[i] &= u; ch = true; } }
            for (const K of P.lms) if (K !== L) for (let i = 0; i < t.N; i++) if (t.lm[K][i] && !alive.some((a) => a.lm[K][i])) { t.lm[K][i] = 0; ch = true; }
            if (ch) return { t, ty: 'allroads', src: 'allroads:' + L };
          }
        }
      }
      if (ok('whatiftile')) {
        for (let i = 0; i < st.N; i++) {
          const d = st.dom[i]; if (only(d) >= 0) continue;
          for (let v = 0; v < 5; v++) if (d & bit(v)) {
            const t = clone(st); t.dom[i] = bit(v);
            try { prop(t); } catch (e) { if (!(e instanceof Contra)) throw e; const u = clone(st); u.dom[i] &= ~bit(v); return { t: u, ty: 'whatiftile', src: 'tile:' + i }; }
          }
        }
      }
      return null;
    }
  }
  // The new step a lesson teaches, in voyage order. Lessons not listed teach nothing new.
  const LESSONS = { t1: ['look', 'count'], t2: ['twoinks'], t3: ['home'], t4: ['walk'], t5: ['touch', 'rel'], t6: ['total'], t7: ['narrow'], m1: ['whatif', 'allroads'], m2: ['zone'], d1: ['whatiftile'] };
  // allowed set before island k in the voyage list (lessons add their own types)
  function taughtBefore(list, k) {
    const s = new Set();
    for (let j = 0; j <= k; j++) { const t = list[j].teaches || (list[j].tutorial ? LESSONS[list[j].id] : null); if (t && (j < k || list[j].tutorial)) t.forEach((x) => s.add(x)); }
    return s;
  }
  // the step types an island needs, in ladder order, with the smallest set that still solves it (greedy from the full ladder)
  function needs(P) {
    const all = new Set(STEPS.map((s) => s.id));
    const r = solveTaught(P, all); if (!r.ok) return null;
    const need = new Set(r.used);
    for (const t of [...need].sort((a, b) => BY[b].rank - BY[a].rank)) { const s = new Set(need); s.delete(t); if (solveTaught(P, s).ok) need.delete(t); }
    return STEPS.filter((s) => need.has(s.id)).map((s) => s.id);
  }
  const API = { STEPS, BY, LESSONS, classify, solveTaught, taughtBefore, needs };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.CG_LADDER = API;
})(typeof window !== 'undefined' ? window : globalThis);
