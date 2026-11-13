// BRIGHTFIELD core rules. Pure, deterministic, seeded. Runs in the browser (window.BF) and Node (require).
(function (root) {
  'use strict';
  const VERSION = '0.6.2';
  const AXES = ['power', 'move', 'food', 'water', 'home', 'make', 'waste', 'wild'];
  // v0.6: adjacency OPINIONS with real-world reasons (the son's wish #2: "why do things go next to each other?").
  // Each rule is directed: tile type `a` (the one who thinks) has an opinion about a neighbouring `b`.
  // `when(eraA, eraB)` makes rules change as the town changes (the dump becomes compost -> farms start loving it).
  // v = +1 (a heart, a like) or -1 (a frown, a dislike). Reason ids map to a picture (art.js) and a sentence (REASONS).
  const RULES = [
    { a: 'home', b: 'wild', v: 1, why: 'park' },
    { a: 'home', b: 'food', v: 1, why: 'apple', when: (ea, eb) => eb >= 1 },
    { a: 'home', b: 'move', v: 1, why: 'bus' },
    { a: 'move', b: 'home', v: 1, why: 'riders' },
    { a: 'home', b: 'power', v: 1, why: 'quiet', when: (ea, eb) => eb >= 3 },
    { a: 'home', b: 'power', v: -1, why: 'smoke', when: (ea, eb) => eb <= 1 },
    { a: 'home', b: 'power', v: -1, why: 'noise', when: (ea, eb) => eb === 2 },
    { a: 'home', b: 'make', v: -1, why: 'smoke', when: (ea, eb) => eb === 0 },
    { a: 'home', b: 'waste', v: -1, why: 'smell', when: (ea, eb) => eb === 0 },
    { a: 'power', b: 'make', v: 1, why: 'bolt' },
    { a: 'make', b: 'power', v: 1, why: 'bolt' },
    { a: 'power', b: 'wild', v: 1, why: 'wind', when: (ea) => ea === 2 },
    { a: 'power', b: 'food', v: 1, why: 'wind', when: (ea) => ea === 2 },
    { a: 'food', b: 'water', v: 1, why: 'drop' },
    { a: 'water', b: 'food', v: 1, why: 'drop' },
    { a: 'food', b: 'waste', v: 1, why: 'compost', when: (ea, eb) => eb >= 2 },
    { a: 'waste', b: 'food', v: 1, why: 'scraps', when: (ea) => ea >= 2 },
    { a: 'food', b: 'waste', v: -1, why: 'flies', when: (ea, eb) => eb === 0 },
    { a: 'food', b: 'home', v: 1, why: 'market', when: (ea) => ea >= 1 },
    { a: 'water', b: 'wild', v: 1, why: 'drink' },
    { a: 'wild', b: 'water', v: 1, why: 'drink' },
    { a: 'move', b: 'make', v: 1, why: 'truck' },
    { a: 'make', b: 'move', v: 1, why: 'truck' },
    { a: 'make', b: 'waste', v: 1, why: 'recycle', when: (ea, eb) => eb >= 1 },
    { a: 'waste', b: 'make', v: 1, why: 'recycle', when: (ea) => ea >= 1 },
    { a: 'wild', b: 'wild', v: 1, why: 'forest' },
  ];
  // One short sentence per reason, said from the thinker's point of view (cards, read-aloud, parents).
  const REASONS = {
    park: 'A park next door to play in', apple: 'Fresh fruit right outside the window', bus: 'The bus stop is right outside',
    riders: 'Lots of riders live here', quiet: 'Quiet, clean power next door', smoke: 'Smoke makes people cough',
    noise: 'Turbines whoosh all night, too noisy to sleep', smell: 'The dump smells yucky', bolt: 'Factories need lots of electricity',
    wind: 'Open land, nothing blocks the wind', drop: 'Plants need water to grow', compost: 'Compost feeds the soil so food grows',
    scraps: 'Farm scraps turn into compost', flies: 'Flies from the dump bug the crops', market: 'Neighbours come to buy fresh food',
    drink: 'Animals come to drink', truck: 'Trucks bring parts to the workshop', recycle: 'Old stuff gets made into new stuff',
    forest: 'Animals need big, joined-up wild places',
  };
  // Smog emitted per tile, by era (era 3 cleans the air). Sooty cars (move era 1) are worse than horses.
  const EMIT = {
    power: [3, 2, 0, -1], move: [1, 2, 0, -1], food: [2, 1, 0, -1], water: [1, 0, 0, -1],
    home: [2, 1, 0, -1], make: [3, 1, 0, -1], waste: [2, 1, 0, -1], wild: [-1, -1, -2, -3],
  };
  // Short lower-case names used in toasts (full cards live in src/techs.js).
  const ERA_NAMES = {
    power: ['coal plant', 'gas turbine', 'wind turbines', ['agrivoltaic fields', 'fusion collectors']],
    move: ['horse stable', 'motor garage', 'charging hub', ['garden tram', 'maglev express']],
    food: ['tractor farm', 'orchard', 'glasshouse', ['food forest', 'aeroponic stack']],
    water: ['deep well', 'water tower', 'rain garden', ['living wetland', 'kelp bioreactors']],
    home: ['chimney cottage', 'terrace houses', 'living-roof flats', ['canopy village', 'arcology spire']],
    make: ['smokestack mill', 'workshop', 'robot foundry', ['repair guild', 'nanoforge']],
    waste: ['landfill', 'recycling depot', 'compost yard', ['mycelium grid', 'matter reclaimer']],
    wild: ['meadow', 'city park', 'old growth', ['wildflower expanse', 'biosphere dome']],
  };
  const MAX_ERA = 3;
  // Critters: arrive on a nature tile with clean local air (sum of smog in radius 1 <= 0).
  const CRITTERS = [
    { id: 'bird', need: () => true },
    { id: 'bee', need: (s, t, n) => n.food >= 1 },
    { id: 'duck', need: (s, t, n) => n.water >= 1 },
    { id: 'butterfly', need: (s, t, n) => n.wild >= 2 && t.eraOf >= 1 },
    { id: 'fox', need: (s, t, n) => n.home >= 1 && t.eraOf >= 2 },
    { id: 'deer', need: (s, t, n) => t.group >= 4 && t.eraOf >= 2 },
  ];
  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const key = (q, r) => q + ',' + r;
  const hexDist = (q, r) => (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;

  // ---- RNG (mulberry32, state is a uint32 stored in the game state) ----
  function rnd(s) {
    let t = (s.rng = (s.rng + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Sun level thresholds (cumulative sunbeams needed to reach level L, L>=1).
  const TUNE = {
    sunBase: 7, sunGrow: 1.48, // need(L) = round(sunBase * L^sunGrow). v0.6: 8 -> 7 so frowns don't slow the kid curve (docs/BALANCE-v06.md)
    growAt: { 3: 3, 8: 4, 14: 5 }, // sun level -> board radius
    startRadius: 2,
    districtAt: 3, districtBonus: 3, districtExtra: 1,
    critterAir: 1, critterFirst: 6,
    hoodAt: [5, 9], hoodOn: true,
    wishBonus: 5, maxWishes: 3, wishers: ['home', 'make', 'food'], critterAgain: 3,
    upgradePerTile: 2,
    challengeDeck: 80, challengeSwaps: 3,
    maxRadius: 10,
  };
  function sunNeed(L) { return Math.round(TUNE.sunBase * Math.pow(L, TUNE.sunGrow)); }

  function newGame(opts = {}) {
    const mode = opts.mode || 'cozy';
    const seed = (opts.seed >>> 0) || 1;
    const s = {
      v: VERSION, mode, seed, rng: seed, turn: 0,
      radius: TUNE.startRadius,
      tiles: {}, // key -> {q,r,type,critter}
      era: Object.fromEntries(AXES.map((a) => [a, 0])),
      variant: Object.fromEntries(AXES.map((a) => [a, null])), // 'leaf' | 'star' at era 3
      sun: 0, sunLevel: 0, ideas: 0, ideasSpent: 0,
      hand: [], deck: null, swaps: mode === 'challenge' ? TUNE.challengeSwaps : Infinity,
      species: {}, critterCount: 0,
      crowned: null, over: false,
      log: [],
    };
    if (mode === 'challenge') {
      // Fixed deck: equal-ish share of every type, shuffled with the seed.
      const deck = [];
      for (let i = 0; i < TUNE.challengeDeck; i++) deck.push(AXES[i % AXES.length]);
      for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rnd(s) * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
      s.deck = deck;
    }
    // First hand teaches: a home, a nature tile, and food (all friends).
    s.hand = mode === 'cozy' ? ['home', 'wild', 'food'] : [draw(s), draw(s), draw(s)];
    return s;
  }

  function counts(s) {
    const c = Object.fromEntries(AXES.map((a) => [a, 0]));
    for (const k in s.tiles) c[s.tiles[k].type]++;
    return c;
  }

  function draw(s) {
    if (s.deck) return s.deck.length ? s.deck.pop() : null;
    // Cozy: weighted so rarely-seen types come up more; never 3 of the same in hand.
    const c = counts(s);
    const inHand = {};
    for (const h of s.hand) if (h) inHand[h] = (inHand[h] || 0) + 1;
    const w = AXES.map((a) => (inHand[a] >= 2 ? 0 : 1 / (1 + c[a] * 0.35 + (inHand[a] || 0) * 1.5)));
    let tot = w.reduce((a, b) => a + b, 0), x = rnd(s) * tot;
    for (let i = 0; i < AXES.length; i++) { x -= w[i]; if (x <= 0) return AXES[i]; }
    return AXES[AXES.length - 1];
  }

  function inBoard(s, q, r) { return hexDist(q, r) <= s.radius; }
  function neighbors(q, r) { return DIRS.map(([dq, dr]) => [q + dq, r + dr]); }
  function emitOf(s, t) { return EMIT[t.type][s.era[t.type]]; }
  function localSmog(s, q, r) {
    let sum = 0;
    const t0 = s.tiles[key(q, r)];
    if (t0) sum += emitOf(s, t0);
    for (const [nq, nr] of neighbors(q, r)) { const t = s.tiles[key(nq, nr)]; if (t) sum += emitOf(s, t); }
    return sum;
  }
  // 0 = clear sky, 1 = thick smog.
  function smogLevel(s) {
    let sum = 0, n = 0;
    for (const k in s.tiles) { sum += emitOf(s, s.tiles[k]); n++; }
    if (n === 0) return 0.55; // the starting valley is a little hazy from the old town over the hill
    return Math.max(0, Math.min(1, sum / (6 + 0.9 * n)));
  }
  // Opinions `a` has about a neighbouring `b` in this town (eras matter). [{a, b, v, why}]
  function opinions(s, a, b) {
    const ea = s.era[a], eb = s.era[b], out = [];
    for (const R of RULES) if (R.a === a && R.b === b && (!R.when || R.when(ea, eb))) out.push(R);
    return out;
  }
  function likes(s, a, b) { return opinions(s, a, b).reduce((t, o) => t + o.v, 0); }
  // Net value of a link: hearts minus frowns, both directions. Symmetric.
  function hearts(s, a, b) { return likes(s, a, b) + likes(s, b, a); }
  // Types `a` currently likes (net > 0) / dislikes (net < 0).
  function likedTypes(s, a) { return AXES.filter((b) => likes(s, a, b) > 0); }
  function dislikedTypes(s, a) { return AXES.filter((b) => likes(s, a, b) < 0); }
  // Both directions of opinion between a tile of type `a` (placed or hypothetical) and neighbour `b`.
  function linkOps(s, a, b) {
    return [...opinions(s, a, b).map((o) => ({ by: 'self', v: o.v, why: o.why })), ...opinions(s, b, a).map((o) => ({ by: 'nb', v: o.v, why: o.why }))];
  }

  function legalHexes(s) {
    const out = [];
    const R = s.radius;
    for (let q = -R; q <= R; q++) for (let r = -R; r <= R; r++) if (inBoard(s, q, r) && !s.tiles[key(q, r)]) out.push([q, r]);
    return out;
  }

  function groupOf(s, q, r, type, extra) {
    // Connected component of `type` containing (q,r); `extra` is a hypothetical tile key.
    const seen = new Set([key(q, r)]), st = [[q, r]];
    while (st.length) {
      const [cq, cr] = st.pop();
      for (const [nq, nr] of neighbors(cq, cr)) {
        const k = key(nq, nr);
        if (seen.has(k)) continue;
        const t = s.tiles[k];
        if ((t && t.type === type) || k === extra) { seen.add(k); st.push([nq, nr]); }
      }
    }
    return seen.size;
  }

  // Tiles of the connected `type` group through (q,r), counting (q,r) itself as `type`.
  function groupTiles(s, q, r, type) {
    const seen = new Set([key(q, r)]), st = [[q, r]], out = [[q, r]];
    while (st.length) {
      const [cq, cr] = st.pop();
      for (const [nq, nr] of neighbors(cq, cr)) { const k = key(nq, nr); if (seen.has(k)) continue; const t = s.tiles[k]; if (t && t.type === type) { seen.add(k); st.push([nq, nr]); out.push([nq, nr]); } }
    }
    return out;
  }
  // Neighbourhood: when a same-type group grows past 5 or 9 tiles it throws a party.
  // The party is bigger for every different friend type touching the group (served neighbourhoods).
  function hoodOf(s, q, r, type) {
    const tiles = groupTiles(s, q, r, type), g = tiles.length;
    const m = TUNE.hoodOn ? TUNE.hoodAt.filter((x) => g - 1 < x && x <= g) : [];
    if (!m.length) return null;
    const inG = new Set(tiles.map(([a, b]) => key(a, b))), touch = new Set();
    for (const [a, b] of tiles) for (const [nq, nr] of neighbors(a, b)) { const k = key(nq, nr); if (inG.has(k)) continue; const t = s.tiles[k]; if (t && t.type !== type && likes(s, type, t.type) > 0) touch.add(t.type); }
    return { size: g, friends: [...touch], points: m.length * g * (1 + touch.size) };
  }

  // What would placing `type` at (q,r) score? Pure.
  function preview(s, type, q, r) {
    if (!type || !inBoard(s, q, r) || s.tiles[key(q, r)]) return null;
    const mult = 1 + s.era[type];
    const links = [];
    let plus = 0, minus = 0;
    for (const [nq, nr] of neighbors(q, r)) {
      const t = s.tiles[key(nq, nr)];
      if (!t) continue;
      const ops = linkOps(s, type, t.type);
      if (!ops.length) continue;
      const lp = ops.filter((o) => o.v > 0).length, lm = ops.filter((o) => o.v < 0).length;
      links.push({ q: nq, r: nr, hearts: lp, frowns: lm, ops });
      plus += lp; minus += lm;
    }
    // Hearts minus frowns; a frown costs a heart but a placement never pays less than +1 (no punishment, pillar 2).
    const h = Math.max(0, plus - minus);
    const wishes = [];
    for (const [nq, nr] of neighbors(q, r)) { const t = s.tiles[key(nq, nr)]; if (t && t.wish === type) wishes.push({ q: nq, r: nr }); }
    const g = groupOf(s, q, r, type, null);
    let district = 0;
    if (g === TUNE.districtAt) district = TUNE.districtBonus;
    else if (g > TUNE.districtAt) district = TUNE.districtExtra;
    const wish = wishes.length * TUNE.wishBonus;
    const hood = hoodOf(s, q, r, type);
    const points = 1 + h * mult + district + wish + (hood ? hood.points : 0);
    return { type, q, r, links, hearts: h, likes: plus, frowns: minus, mult, district, group: g, wishes, wish, hood, points };
  }

  function nbCounts(s, q, r) {
    const n = Object.fromEntries(AXES.map((a) => [a, 0]));
    for (const [nq, nr] of neighbors(q, r)) { const t = s.tiles[key(nq, nr)]; if (t) n[t.type]++; }
    return n;
  }

  // Check every nature tile without a critter; arrivals pay sunbeams. Returns events.
  function settleCritters(s) {
    const ev = [];
    const keys = Object.keys(s.tiles).sort();
    for (const k of keys) {
      const t = s.tiles[k];
      if (t.type !== 'wild' || t.critter) continue;
      if (localSmog(s, t.q, t.r) > TUNE.critterAir) continue;
      const n = nbCounts(s, t.q, t.r);
      const info = { eraOf: s.era.wild, group: groupOf(s, t.q, t.r, 'wild', null) };
      // Prefer a species the town has not met yet, then the rarest.
      const ok = CRITTERS.filter((c) => c.need(s, info, n));
      if (!ok.length) continue;
      ok.sort((a, b) => (s.species[a.id] || 0) - (s.species[b.id] || 0) || CRITTERS.indexOf(b) - CRITTERS.indexOf(a));
      const c = ok[0];
      const first = !s.species[c.id];
      s.species[c.id] = (s.species[c.id] || 0) + 1;
      s.critterCount++;
      t.critter = c.id;
      const pts = first ? TUNE.critterFirst : TUNE.critterAgain;
      ev.push({ type: 'critter', q: t.q, r: t.r, critter: c.id, first, points: pts });
      ev.push(...addSun(s, pts, t.q, t.r));
    }
    return ev;
  }

  function addSun(s, pts, q, r) {
    const ev = [];
    s.sun += pts;
    while (s.sun >= sunNeed(s.sunLevel + 1)) {
      s.sunLevel++;
      s.ideas++;
      ev.push({ type: 'level', level: s.sunLevel });
      const grow = TUNE.growAt[s.sunLevel];
      if (grow && grow > s.radius) { s.radius = grow; ev.push({ type: 'grow', radius: grow }); }
    }
    return ev;
  }

  function boardFull(s) { return legalHexes(s).length === 0; }

  function place(s, handIdx, q, r) {
    if (s.over) return null;
    const type = s.hand[handIdx];
    const p = preview(s, type, q, r);
    if (!p) return null;
    s.turn++;
    for (const w of p.wishes) s.tiles[key(w.q, w.r)].wish = null;
    s.wishesMet = (s.wishesMet || 0) + p.wishes.length;
    // A newly placed home/workshop/farm wishes for one friend it does not have next door yet.
    let wish = null;
    if (TUNE.wishers.includes(type)) {
      const nb = nbCounts(s, q, r);
      const want = likedTypes(s, type).filter((f) => !nb[f]);
      if (want.length) wish = want[Math.floor(rnd(s) * want.length)];
    }
    s.tiles[key(q, r)] = { q, r, type, critter: null, born: s.turn, wish };
    // Keep the board calm: only the newest few wishes stay; older ones quietly drift away (no penalty).
    if (wish) { const w = Object.values(s.tiles).filter((x) => x.wish).sort((a, b) => a.born - b.born); while (w.length > TUNE.maxWishes) w.shift().wish = null; }
    const ev = [{ type: 'place', tile: type, q, r, points: p.points, links: p.links, district: p.district, group: p.group, hood: p.hood, wishes: p.wishes, wish: p.wish, newWish: wish }];
    ev.push(...addSun(s, p.points, q, r));
    ev.push(...settleCritters(s));
    s.hand[handIdx] = draw(s);
    s.log.push(['p', handIdx, q, r]);
    ev.push(...endCheck(s));
    return ev;
  }

  // Every opinion on links that touch a tile of `axis`: key 'q,r>q2,r2:why' -> v (thinker at q,r).
  function pairOps(s, axis) {
    const m = new Map();
    for (const k in s.tiles) {
      const t = s.tiles[k]; if (t.type !== axis) continue;
      for (const [nq, nr] of neighbors(t.q, t.r)) {
        const n = s.tiles[key(nq, nr)]; if (!n) continue;
        for (const o of opinions(s, t.type, n.type)) m.set(key(t.q, t.r) + '>' + key(nq, nr) + ':' + o.why, o.v);
        for (const o of opinions(s, n.type, t.type)) m.set(key(nq, nr) + '>' + key(t.q, t.r) + ':' + o.why, o.v);
      }
    }
    return m;
  }
  // What an upgrade changed between neighbours: new likes, new dislikes, dislikes that went away.
  function diffOps(a, b) {
    const out = [];
    const parse = (k) => { const [ab, why] = k.split(':'); const [p, o] = ab.split('>'); const [q, r] = p.split(',').map(Number), [oq, or] = o.split(',').map(Number); return { q, r, oq, or, why }; };
    for (const [k, v] of b) if (!a.has(k)) out.push(Object.assign(parse(k), { kind: v > 0 ? 'like' : 'frown' }));
    for (const [k, v] of a) if (!b.has(k) && v < 0) out.push(Object.assign(parse(k), { kind: 'unfrown' }));
    return out;
  }

  function canUpgrade(s, axis) { return s.ideas > 0 && s.era[axis] < MAX_ERA && !s.over; }

  function upgrade(s, axis, variant) {
    if (!canUpgrade(s, axis)) return null;
    const next = s.era[axis] + 1;
    if (next === MAX_ERA && variant !== 'leaf' && variant !== 'star') return null;
    s.ideas--; s.ideasSpent++;
    const before = pairOps(s, axis);
    s.era[axis] = next;
    if (next === MAX_ERA) s.variant[axis] = variant;
    const changed = diffOps(before, pairOps(s, axis));
    let n = 0;
    for (const k in s.tiles) if (s.tiles[k].type === axis) n++;
    const pts = n * TUNE.upgradePerTile;
    const ev = [{ type: 'upgrade', axis, era: next, variant: s.variant[axis], points: pts, tiles: n, changed }];
    ev.push(...addSun(s, pts));
    ev.push(...settleCritters(s));
    s.log.push(['u', axis, variant || null]);
    ev.push(...endCheck(s));
    return ev;
  }

  function swap(s) {
    if (s.over || s.swaps <= 0) return null;
    if (s.deck && s.deck.length === 0) return null;
    s.swaps--;
    const old = s.hand.slice();
    // Put the old hand back (challenge: under the deck) and draw fresh.
    if (s.deck) { for (const h of old) if (h) s.deck.unshift(h); }
    s.hand = [null, null, null];
    for (let i = 0; i < 3; i++) s.hand[i] = draw(s);
    s.log.push(['s']);
    return [{ type: 'swap' }];
  }

  function crownOf(s) {
    let leaf = 0, star = 0, last = null;
    for (const a of AXES) { if (s.variant[a] === 'leaf') leaf++; if (s.variant[a] === 'star') star++; }
    if (leaf === star) {
      for (let i = s.log.length - 1; i >= 0; i--) if (s.log[i][0] === 'u' && s.log[i][2]) { last = s.log[i][2]; break; }
      return last || 'leaf';
    }
    return leaf > star ? 'leaf' : 'star';
  }
  function allCrowned(s) { return AXES.every((a) => s.era[a] === MAX_ERA); }

  function endCheck(s) {
    const ev = [];
    if (!s.crowned && allCrowned(s)) {
      s.crowned = crownOf(s);
      ev.push({ type: 'crown', crown: s.crowned });
      if (s.mode === 'cozy') s.over = true;
    }
    // Cozy never dead-ends: if the land is full, it grows.
    if (s.mode === 'cozy' && !s.over && boardFull(s) && s.radius < TUNE.maxRadius) {
      s.radius++; ev.push({ type: 'grow', radius: s.radius });
    }
    if (s.mode === 'challenge' && !s.over) {
      const noTiles = s.hand.every((h) => !h);
      if (noTiles || boardFull(s)) { s.over = true; ev.push({ type: 'end', score: finalScore(s) }); }
    }
    return ev;
  }

  // Challenge score: sunbeams + 25 per crown-era axis + 10 per species met + 40 if crowned.
  function finalScore(s) {
    let crowns = 0; for (const a of AXES) if (s.era[a] === MAX_ERA) crowns++;
    return s.sun + crowns * 25 + Object.keys(s.species).length * 10 + (s.crowned ? 40 : 0);
  }

  // Replay a log on a fresh state (used by tests + saves).
  function replay(opts, log) {
    const s = newGame(opts);
    for (const a of log) {
      if (a[0] === 'p') place(s, a[1], a[2], a[3]);
      else if (a[0] === 'u') upgrade(s, a[1], a[2]);
      else if (a[0] === 's') swap(s);
    }
    return s;
  }
  function serialize(s) { return JSON.stringify({ mode: s.mode, seed: s.seed, log: s.log }); }
  function deserialize(str) { const o = JSON.parse(str); return replay({ mode: o.mode, seed: o.seed }, o.log); }

  const BF = {
    VERSION, AXES, RULES, REASONS, EMIT, ERA_NAMES, MAX_ERA, CRITTERS, DIRS, TUNE,
    key, hexDist, newGame, preview, place, upgrade, canUpgrade, swap, legalHexes, smogLevel, localSmog,
    sunNeed, counts, hearts, likes, opinions, linkOps, likedTypes, dislikedTypes, crownOf, finalScore, replay, serialize, deserialize, groupOf, groupTiles, hoodOf, boardFull, nbCounts, neighbors,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = BF;
  else root.BF = BF;
})(typeof window !== 'undefined' ? window : globalThis);
