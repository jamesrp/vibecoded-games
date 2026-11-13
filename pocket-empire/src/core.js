// POCKET EMPIRE — deterministic rules engine (no DOM). Classic script + Node require().
(function (root) {
'use strict';
const D = (typeof module !== 'undefined' && module.exports) ? require('./data.js') : root.PE_DATA;
const { TER, FOREST, RES, UNITS, BUILDINGS, WONDERS, PROJECTS, TECHS, CIVICS, PERS, LEADERS, BOONS, EVENTS, OMENS, DIFFICULTIES } = D;
const W = 20, H = 13, N = W * H;
const BARB = 4;

// ---------- RNG (state lives in the game object so saves/replays are exact)
function rnd(g) { let t = (g.rs = (g.rs + 0x6D2B79F5) | 0); t = Math.imul(t ^ (t >>> 15), 1 | t); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
function rint(g, n) { return Math.floor(rnd(g) * n); }
function pick(g, arr) { return arr[rint(g, arr.length)]; }
function shuffle(g, arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rint(g, i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ---------- hex geometry (odd-r offset, pointy-top)
const COL = (i) => i % W, ROW = (i) => (i / W) | 0;
function toCube(i) { const c = COL(i), r = ROW(i); const q = c - (r - (r & 1)) / 2; return [q, r, -q - r]; }
function dist(a, b) { const A = toCube(a), B = toCube(b); return Math.max(Math.abs(A[0] - B[0]), Math.abs(A[1] - B[1]), Math.abs(A[2] - B[2])); }
const NB = [];
(function () {
  const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  for (let i = 0; i < N; i++) {
    const [q, r] = toCube(i); const out = [];
    for (const [dq, dr] of dirs) { const nr = r + dr, nq = q + dq; if (nr < 0 || nr >= H) continue; const c = nq + (nr - (nr & 1)) / 2; if (c < 0 || c >= W) continue; out.push(nr * W + c); }
    NB.push(out);
  }
})();
function within(i, rad) { const out = []; for (let j = 0; j < N; j++) if (dist(i, j) <= rad) out.push(j); return out; }
const RING2 = []; for (let i = 0; i < N; i++) RING2.push(within(i, 2));

// ---------- map generation
function noiseField(g, cells) {
  const gw = cells + 2, gh = cells + 2, grid = []; for (let k = 0; k < gw * gh; k++) grid.push(rnd(g));
  return (x, y) => { // x,y in 0..1
    const fx = x * cells, fy = y * cells, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const s = (t) => t * t * (3 - 2 * t), a = grid[y0 * gw + x0], b = grid[y0 * gw + x0 + 1], c = grid[(y0 + 1) * gw + x0], d = grid[(y0 + 1) * gw + x0 + 1];
    return a + (b - a) * s(tx) + (c - a) * s(ty) + (a - b - c + d) * s(tx) * s(ty);
  };
}
function genMap(g) {
  const n1 = noiseField(g, 4), n2 = noiseField(g, 8), m1 = noiseField(g, 5);
  const elev = [], moist = [];
  for (let i = 0; i < N; i++) {
    const x = (COL(i) + (ROW(i) & 1) * 0.5) / W, y = ROW(i) / H;
    const dx = (x - 0.5) / 0.5, dy = (y - 0.5) / 0.5, fall = Math.sqrt(dx * dx * 0.8 + dy * dy * 1.0);
    elev.push(n1(x, y) * 0.65 + n2(x, y) * 0.35 - fall * 0.55);
    moist.push(m1(x, y));
  }
  const order = [...Array(N).keys()].sort((a, b) => elev[b] - elev[a]);
  const land = new Array(N).fill(false);
  const nLand = Math.round(N * (g.omen === 'crowded' ? 0.46 : 0.56));
  for (let k = 0; k < nLand; k++) land[order[k]] = true;
  for (let i = 0; i < N; i++) if (ROW(i) === 0 || ROW(i) === H - 1 || COL(i) === 0 || COL(i) === W - 1) land[i] = false;
  // keep the largest land mass
  const comp = new Array(N).fill(-1); let best = -1, bestSize = 0, cid = 0;
  for (let i = 0; i < N; i++) if (land[i] && comp[i] < 0) {
    const st = [i]; comp[i] = cid; let size = 0;
    while (st.length) { const t = st.pop(); size++; for (const nb of NB[t]) if (land[nb] && comp[nb] < 0) { comp[nb] = cid; st.push(nb); } }
    if (size > bestSize) { bestSize = size; best = cid; } cid++;
  }
  for (let i = 0; i < N; i++) if (land[i] && comp[i] !== best) land[i] = false;
  const landIdx = order.filter((i) => land[i]);
  const ter = new Array(N).fill('ocean'), forest = new Array(N).fill(false), res = new Array(N).fill(null);
  landIdx.forEach((i, k) => {
    const lat = Math.abs(ROW(i) - (H - 1) / 2) / ((H - 1) / 2);
    const m = moist[i];
    let t;
    if (k < landIdx.length * 0.07) t = 'mountain';
    else if (k < landIdx.length * 0.2) t = 'hills';
    else if (lat > 0.8) t = 'tundra';
    else if (m < 0.33 && lat < 0.6) t = 'desert';
    else if (m < 0.5) t = 'plains';
    else t = 'grass';
    ter[i] = t;
    if ((t === 'grass' || t === 'plains' || t === 'tundra') && m > 0.55 && rnd(g) < 0.55) forest[i] = true;
  });
  // break up mountain chains that wall off regions: no mountain with >3 mountain neighbours
  for (const i of landIdx) if (ter[i] === 'mountain' && NB[i].filter((n) => ter[n] === 'mountain').length > 2) ter[i] = 'hills';
  for (let i = 0; i < N; i++) if (!land[i] && NB[i].some((n) => land[n])) ter[i] = 'coast';
  // resources
  for (let i = 0; i < N; i++) {
    if (ter[i] === 'mountain' || ter[i] === 'ocean') continue;
    if (rnd(g) > (ter[i] === 'coast' ? 0.13 : 0.2)) continue;
    const key = forest[i] ? 'forest' : ter[i];
    const opts = Object.keys(RES).filter((r) => RES[r].on.includes(key));
    if (opts.length) res[i] = pick(g, opts);
  }
  g.ter = ter; g.forest = forest; g.res = res;
  g.owner = new Array(N).fill(-1); g.claim = new Array(N).fill(-1); g.camp = new Array(N).fill(false);
  g.decor = []; for (let i = 0; i < N; i++) g.decor.push(rint(g, 1000));
}
function tileYield(g, i, civ) {
  const t = TER[g.ter[i]]; let f = t.f, p = t.p, s = 0, c = 0;
  if (g.forest[i]) { f = FOREST.f; p = FOREST.p; }
  const r = g.res[i]; if (r) { f += RES[r].f || 0; p += RES[r].p || 0; s += RES[r].s || 0; c += RES[r].c || 0; }
  if (civ && g.ter[i] === 'coast') { if (civ.perk.coastP) p += civ.perk.coastP; if (civ.perk.coastS) s += civ.perk.coastS; }
  if (civ && g.ter[i] === 'hills' && civ.techs.includes('mining')) p += 0; // reserved
  return { f, p, s, c };
}
function passable(g, i) { const t = TER[g.ter[i]]; return !t.water && !t.block; }
function moveCost(g, i) { if (!passable(g, i)) return 99; return g.forest[i] ? FOREST.move : TER[g.ter[i]].move; }
function siteScore(g, i, civId) {
  if (!passable(g, i) || g.camp[i]) return -1;
  for (const c of g.cities) if (dist(c.tile, i) < 3) return -1;
  if (g.owner[i] >= 0 && g.owner[i] !== civId) return -1;
  let s = 0;
  for (const j of RING2[i]) {
    if (g.owner[j] >= 0 && g.owner[j] !== civId) continue;
    const y = tileYield(g, j, null); const d = dist(i, j) === 0 ? 1.5 : dist(i, j) === 1 ? 1 : 0.6;
    s += (y.f * 1.2 + y.p * 1.0 + y.s + y.c) * d;
    if (g.ter[j] === 'mountain') s -= 0.5;
  }
  if (NB[i].some((n) => g.ter[n] === 'coast')) s += 1.5;
  if (g.ter[i] === 'hills') s += 2;
  return s;
}

// ---------- game creation
function newGame(opts) {
  opts = opts || {};
  const g = { v: 1, seed: opts.seed >>> 0 || 1, rs: (opts.seed >>> 0 || 1) * 9301 + 49297, turn: 1, asc: opts.asc || 0, maxTurns: (opts.asc || 0) >= 4 ? 36 : 40,
    civs: [], cities: [], units: [], nextId: 1, log: [], events: [], over: null, pendingEvent: null, pendingDraft: null, wondersBuilt: {}, humanId: opts.allAI ? -1 : 0, allAI: !!opts.allAI, stats: { kills: 0 } };
  g.diff = DIFFICULTIES[opts.diff] ? opts.diff : 'standard';
  g.omen = OMENS[opts.omen] ? opts.omen : Object.keys(OMENS)[rint(g, Object.keys(OMENS).length)];
  genMap(g);
  const avail = Object.keys(LEADERS);
  const humanLeader = opts.leader && LEADERS[opts.leader] ? opts.leader : null;
  const rest = shuffle(g, avail.filter((k) => k !== humanLeader));
  const leaders = humanLeader ? [humanLeader, ...rest.slice(0, 3)] : rest.slice(0, 4);
  const starts = pickStarts(g, 4);
  leaders.forEach((lk, id) => {
    const L = LEADERS[lk];
    const civ = { id, leader: lk, name: L.civ, lname: L.name, color: D.CIV_COLORS[id], pers: L.pers, human: !g.allAI && id === 0, alive: true,
      perk: Object.assign({}, L.perk), boons: [], eff: {}, techs: [], civics: [], research: null, civic: null, sci: 0, cult: 0, sciStock: 0, cultStock: 0,
      war: {}, warSince: {}, era: 0, cityNames: D.CITY_NAMES[lk].slice(), score: 0, met: {}, kills: 0, lost: 0, peaceUntil: {} };
    if (L.perk.freeTech) civ.techs.push(L.perk.freeTech);
    for (const [k, v] of Object.entries(OMENS[g.omen].eff || {})) civ.eff[k] = (civ.eff[k] || 0) + v;
    g.civs.push(civ);
    const st = starts[id];
    addUnit(g, id, 'settler', st);
    const esc = NB[st].find((n) => passable(g, n)); addUnit(g, id, 'warrior', esc !== undefined ? esc : st);
    if (L.perk.extraSettler) { const t2 = NB[st].find((n) => passable(g, n) && !unitAt(g, n)); if (t2 !== undefined) addUnit(g, id, 'settler', t2); }
    if (!civ.human && g.asc >= 5) { const t3 = NB[st].find((n) => passable(g, n) && !unitAt(g, n)); if (t3 !== undefined) addUnit(g, id, 'warrior', t3); }
    if (!civ.human && g.asc >= 2) { const b = pick(g, ['harvest', 'forge', 'charts', 'muse', 'drill', 'bulwark', 'sages']); addBoon(g, civ, b); }
  });
  g.civs.push({ id: BARB, barb: true, name: 'Barbarians', color: D.CIV_COLORS[BARB], alive: true, perk: {}, eff: {}, boons: [], techs: [], civics: [], war: {}, met: {} });
  for (const c of g.civs) for (const d of g.civs) if (c !== d && (c.barb || d.barb)) c.war[d.id] = true;
  // barbarian camps
  const nCamps = (g.asc >= 1 ? 4 : 3) + (OMENS[g.omen].camps || 0), minD = g.asc >= 1 ? 4 : 5;
  const camps = shuffle(g, [...Array(N).keys()].filter((i) => passable(g, i) && starts.every((s) => dist(s, i) >= minD)));
  const placed = [];
  for (const i of camps) { if (placed.length >= nCamps) break; if (placed.every((p) => dist(p, i) >= 4)) { placed.push(i); g.camp[i] = true; addUnit(g, BARB, 'warrior', i); } }
  g.campTimer = {}; for (const p of placed) g.campTimer[p] = 3 + rint(g, 3);
  // ancient ruins: a gift for the first explorer to step on them
  g.ruin = new Array(N).fill(false);
  const nRuins = OMENS[g.omen].ruins || 3;
  const rc = shuffle(g, [...Array(N).keys()].filter((i) => passable(g, i) && !g.camp[i] && starts.every((s) => dist(s, i) >= 3)));
  const rp = []; for (const i of rc) { if (rp.length >= nRuins) break; if (rp.every((p) => dist(p, i) >= 3) && placed.every((p) => dist(p, i) >= 2)) { rp.push(i); g.ruin[i] = true; } }
  // Founding Charter: every empire opens the reign with one bold boon (the player drafts it)
  if (opts.charter !== false) for (const civ of g.civs) if (!civ.barb) {
    const opt = draftBoons(g, civ, true);
    if (civ.human) g.pendingDraft = { kind: 'charter', options: opt };
    else { const AI = root.PE_AI || require('./ai.js'); addBoon(g, civ, AI.aiPickBoon(g, civ, opt)); }
  }
  g.vis = new Array(N).fill(0); g.seen = new Array(N).fill(false);
  updateVision(g);
  return g;
}
function pickStarts(g, n) {
  const cands = [...Array(N).keys()].map((i) => ({ i, s: siteScore(g, i, -1) })).filter((o) => o.s > 0 && RING2[o.i].filter((j) => passable(g, j)).length >= 12);
  cands.sort((a, b) => b.s - a.s);
  for (let minD = 7; minD >= 3; minD--) {
    const pool = cands.slice(0, 60);
    let bestSet = null, bestVal = -1;
    for (let tries = 0; tries < 40; tries++) {
      const set = [pool[rint(g, Math.min(pool.length, 12))].i];
      for (const o of shuffle(g, pool)) { if (set.length >= n) break; if (set.every((s) => dist(s, o.i) >= minD)) set.push(o.i); }
      if (set.length < n) continue;
      const val = set.reduce((a, i) => a + siteScore(g, i, -1), 0);
      if (val > bestVal) { bestVal = val; bestSet = set; }
    }
    if (bestSet) return bestSet;
  }
  return cands.slice(0, n).map((o) => o.i);
}
function addUnit(g, owner, type, tile) {
  const civ = g.civs[owner];
  const u = { id: g.nextId++, owner, type, tile, hp: 100, mp: 0, fort: 0, sleep: false, acted: false, auto: false };
  u.mp = maxMp(g, u, civ);
  g.units.push(u); return u;
}
function addBoon(g, civ, key) {
  civ.boons.push(key);
  const B = BOONS[key];
  for (const [k, v] of Object.entries(B.eff)) civ.eff[k] = (civ.eff[k] || 0) + v;
  if (B.now === 'settler') { const cap = capitalOf(g, civ.id); if (cap) spawnNear(g, civ.id, 'settler', cap.tile); }
  if (B.now === 'windfall') { civ.sciStock += 40; civ.cultStock += 30; }
  if (B.now === 'levy') { const cap = capitalOf(g, civ.id); if (cap) { const t = bestMelee(civ); spawnNear(g, civ.id, t, cap.tile); spawnNear(g, civ.id, t, cap.tile); } }
  if (B.now === 'eureka' && civ.research) civ.sciStock += techCost(g, civ, civ.research);
}
function bestMelee(civ) { let best = 'warrior'; for (const k of ['spearman', 'swordsman', 'pikeman', 'musketeer']) if (canBuildUnit(civ, k)) best = k; return best; }
function unitAt(g, tile) { for (const u of g.units) if (u.tile === tile) return u; return null; }
function cityAt(g, tile) { for (const c of g.cities) if (c.tile === tile) return c; return null; }
function capitalOf(g, id) { return g.cities.find((c) => c.owner === id && c.capital === id) || g.cities.find((c) => c.owner === id); }
function spawnNear(g, owner, type, tile) {
  const cands = [tile, ...NB[tile], ...RING2[tile]];
  for (const t of cands) if (passable(g, t) && !unitAt(g, t) && !(cityAt(g, t) && cityAt(g, t).owner !== owner) && !g.camp[t] || (t === tile && !unitAt(g, t))) { if (!passable(g, t)) continue; const u = addUnit(g, owner, type, t); u.mp = 0; return u; }
  return null;
}

// ---------- civ-wide derived stats
function eff(civ, k) { return (civ.eff[k] || 0) + (civ.perk[k] || 0); }
function maxMp(g, u, civ) { const U = UNITS[u.type]; let m = U.mp; if (civ && !civ.barb) { if (U.cls === 'mounted') m += civ.perk.mountedMp || 0; if (!U.civilian) m += civ.eff.mp || 0; if (U.civilian) m += civ.eff.mp ? 1 : 0; } return m; }
function unitStr(g, u, ranged) {
  const U = UNITS[u.type], civ = g.civs[u.owner];
  let s = ranged ? U.rs : U.str;
  if (!civ.barb) { s += eff(civ, 'unitStr'); if (U.cls === 'mounted') s += civ.perk.mountedStr || 0; if (civ.wonderEff && civ.wonderEff.unitStr) s += civ.wonderEff.unitStr; }
  if (civ.barb) s += Math.floor((g.turn - 1) / 10) * 3; // barbarians keep up a little
  s -= Math.floor((100 - u.hp) / 10);
  return Math.max(1, s);
}
function defenseStr(g, u, attacker) {
  let s = unitStr(g, u, false);
  const t = TER[g.ter[u.tile]]; s += (g.forest[u.tile] ? FOREST.def : (t.def || 0));
  if (u.fort >= 1) s += 3;
  if (attacker) { const AU = UNITS[attacker.type]; if (AU.cls === 'mounted' && UNITS[u.type].vsMounted) s += UNITS[u.type].vsMounted; }
  if (UNITS[u.type].civilian) s = 1;
  return s;
}
function attackStr(g, a, target) {
  const U = UNITS[a.type]; let s = unitStr(g, a, !!U.rs);
  if (target && target.kind === 'unit' && UNITS[target.u.type].cls === 'mounted' && U.vsMounted) s += U.vsMounted;
  if (target && target.kind === 'city' && U.siege) s += U.siege;
  return s;
}
function cityStr(g, c) {
  const civ = g.civs[c.owner];
  let s = 8 + Math.round(c.pop * 1.0) + civ.era * 2 + (c.buildings.includes('walls') ? 8 : 0) + eff(civ, 'cityStr');
  const gar = unitAt(g, c.tile); if (gar && gar.owner === c.owner && !UNITS[gar.type].civilian) s += Math.floor(UNITS[gar.type].str / 3);
  return s;
}
// Standard: young towns (not a capital, size 1-2, no walls) have flimsy palisades, so early wars can take them.
function youngTown(g, c) { return g.diff !== 'gentle' && c.capital < 0 && c.pop <= 2 && !c.buildings.includes('walls'); }
function cityMaxHp(g, c) { const civ = g.civs[c.owner]; return (youngTown(g, c) ? 50 : 70) + (c.buildings.includes('walls') ? 80 : 0) + eff(civ, 'cityHp'); }
function dmg(a, d) { return Math.max(1, Math.round(30 * Math.exp((a - d) / 25))); }

// ---------- war & peace
function atWar(g, a, b) { if (a === b) return false; return !!g.civs[a].war[b]; }
function declareWar(g, a, b) {
  if (atWar(g, a, b) || a === b) return; g.civs[a].war[b] = true; g.civs[b].war[a] = true; g.civs[a].warSince[b] = g.turn; g.civs[b].warSince[a] = g.turn;
  note(g, 'war', `${g.civs[a].name} declares war on ${g.civs[b].name}!`, { a, b });
}
function makePeace(g, a, b) {
  g.civs[a].war[b] = false; g.civs[b].war[a] = false; g.civs[a].peaceUntil[b] = g.turn + 10; g.civs[b].peaceUntil[a] = g.turn + 10;
  note(g, 'peace', `${g.civs[a].name} and ${g.civs[b].name} make peace.`, { a, b });
  // push units out of foreign borders
  for (const u of g.units) { const o = g.owner[u.tile]; if ((u.owner === a && o === b) || (u.owner === b && o === a)) { const home = capitalOf(g, u.owner); if (home) { g.units = g.units.filter((x) => x !== u); const nu = spawnNear(g, u.owner, u.type, home.tile); if (nu) { nu.hp = u.hp; } } } }
}
function note(g, kind, text, extra) { const e = Object.assign({ kind, text, turn: g.turn }, extra || {}); g.log.push(e); g.events.push(e); if (g.log.length > 200) g.log.shift(); }

// ---------- research & civics
function techCost(g, civ, k) { return Math.round(TECHS[k].cost * (1 + 0.04 * Math.max(0, cityCount(g, civ.id) - 1)) * (1 + (OMENS[g.omen].techPct || 0) / 100)); }
function civicCost(g, civ, k) { return Math.round(CIVICS[k].cost * (1 + 0.04 * Math.max(0, cityCount(g, civ.id) - 1)) * (1 + (OMENS[g.omen].civicPct || 0) / 100)); }
// catch-up: civs with fewer cities than the widest empire get cheaper settlers and stronger cities (max 3 steps)
function behind(g, civ) { if (civ.barb) return 0; const counts = {}; for (const c of g.cities) counts[c.owner] = (counts[c.owner] || 0) + 1; const mx = Math.max(0, ...Object.values(counts)); return Math.max(0, Math.min(3, mx - (counts[civ.id] || 0))); }
function cityCount(g, id) { let n = 0; for (const c of g.cities) if (c.owner === id) n++; return n; }
function availTechs(civ) { return Object.keys(TECHS).filter((k) => !civ.techs.includes(k) && TECHS[k].req.every((r) => civ.techs.includes(r))); }
function availCivics(civ) { return Object.keys(CIVICS).filter((k) => !civ.civics.includes(k) && CIVICS[k].req.every((r) => civ.civics.includes(r))); }
function canBuildUnit(civ, k) { const U = UNITS[k]; if (!U.tech) return true; return U.civic ? civ.civics.includes(U.tech) : civ.techs.includes(U.tech); }
function canBuildBuilding(civ, c, k) { const B = BUILDINGS[k]; if (c.buildings.includes(k)) return false; if (B.tech && !civ.techs.includes(B.tech)) return false; if (B.civic && !civ.civics.includes(B.civic)) return false; return true; }
function canBuildWonder(g, civ, k) { const Wd = WONDERS[k]; if (g.wondersBuilt[k] !== undefined) return false; if (Wd.tech && !civ.techs.includes(Wd.tech)) return false; if (Wd.civic && !civ.civics.includes(Wd.civic)) return false; return true; }
function buildOptions(g, c) {
  const civ = g.civs[c.owner], out = [];
  for (const k of Object.keys(UNITS)) if (canBuildUnit(civ, k)) { out.push({ kind: 'unit', key: k, cost: itemCost(g, civ, { kind: 'unit', key: k }) }); }
  // hide obsolete units
  const has = (k) => out.some((o) => o.key === k);
  const obs = { warrior: 'swordsman', spearman: 'pikeman', archer: 'crossbow', horseman: 'knight', catapult: 'cannon', swordsman: 'musketeer' };
  for (const [a, b] of Object.entries(obs)) if (has(b)) { const ix = out.findIndex((o) => o.key === a); if (ix >= 0) out.splice(ix, 1); }
  for (const k of Object.keys(BUILDINGS)) if (canBuildBuilding(civ, c, k)) out.push({ kind: 'building', key: k, cost: itemCost(g, civ, { kind: 'building', key: k }) });
  for (const k of Object.keys(WONDERS)) if (canBuildWonder(g, civ, k)) out.push({ kind: 'wonder', key: k, cost: itemCost(g, civ, { kind: 'wonder', key: k }) });
  if (civ.techs.includes('navigation') && !civ.starward) out.push({ kind: 'project', key: 'starward', cost: itemCost(g, civ, { kind: 'project', key: 'starward' }) });
  return out;
}
function itemCost(g, civ, it) {
  if (it.kind === 'unit') { let c = UNITS[it.key].cost; if (it.key === 'settler') { if (civ.civics.includes('codeOfLaws')) c *= 0.75; c *= 1 - (eff(civ, 'settlerPct') / 100); c *= 1 + 0.15 * Math.max(0, cityCount(g, civ.id) - 1); c *= 1 - 0.12 * behind(g, civ); } return Math.round(c); }
  if (it.kind === 'building') return BUILDINGS[it.key].cost;
  if (it.kind === 'wonder') return Math.round(WONDERS[it.key].cost * (1 + (OMENS[g.omen].wonderPct || 0) / 100));
  return PROJECTS[it.key].cost;
}
function itemName(it) { return it.kind === 'unit' ? UNITS[it.key].name : it.kind === 'building' ? BUILDINGS[it.key].name : it.kind === 'wonder' ? WONDERS[it.key].name : PROJECTS[it.key].name; }

// ---------- cities
function foundCity(g, u) {
  if (!canFound(g, u)) return null;
  const civ = g.civs[u.owner];
  const isFirst = !g.cities.some((c) => c.owner === civ.id) && !g.cities.some((c) => c.capital === civ.id);
  const name = civ.cityNames.shift() || `${civ.name} ${g.cities.length + 1}`;
  const c = { id: g.nextId++, owner: civ.id, tile: u.tile, name, pop: 1 + (civ.perk.newCityPop || 0), food: 0, prod: 0, hp: 100, queue: null, buildings: [], capital: isFirst ? civ.id : -1,
    founded: g.turn, worked: [], hitThisTurn: false, wonders: [], origOwner: civ.id };
  if (isFirst) c.buildings.push('palace');
  g.cities.push(c);
  g.units = g.units.filter((x) => x !== u);
  claimTiles(g, c, 1);
  c.hp = cityMaxHp(g, c);
  autoWork(g, c);
  note(g, 'found', `${civ.name} founds ${name}.`, { civ: civ.id, tile: c.tile });
  return c;
}
function canFound(g, u) {
  if (u.type !== 'settler' || !passable(g, u.tile) || g.camp[u.tile]) return false;
  for (const c of g.cities) if (dist(c.tile, u.tile) < 3) return false;
  if (g.owner[u.tile] >= 0 && g.owner[u.tile] !== u.owner) return false;
  return true;
}
function claimTiles(g, c, rad) {
  let claimed = null;
  for (const j of RING2[c.tile]) if (dist(j, c.tile) <= rad && (g.owner[j] < 0 || (g.claim[j] === c.id))) {
    if (g.owner[j] >= 0) continue; g.owner[j] = c.owner; g.claim[j] = c.id; (claimed = claimed || []).push(j);
  }
  g.owner[c.tile] = c.owner; g.claim[c.tile] = c.id;
  if (claimed && rad > 1) g.events.push({ kind: 'border', tiles: claimed, civ: c.owner, city: c.id, turn: g.turn }); // view-only: borders swell
}
function cityYields(g, c) {
  const civ = g.civs[c.owner];
  const ct = tileYield(g, c.tile, civ);
  let f = Math.max(2, ct.f) + 1 + (civ.perk.centerF || 0), p = Math.max(2, ct.p) + 1, s = 1 + ct.s, cu = ct.c;
  for (const t of c.worked) { const y = tileYield(g, t, civ); f += y.f; p += y.p; s += y.s; cu += y.c; }
  for (const b of c.buildings) { const B = BUILDINGS[b]; if (!B) continue; f += B.f || 0; p += B.p || 0; s += B.s || 0; cu += B.c || 0; }
  for (const w of c.wonders) { const e = WONDERS[w].eff; s += e.s || 0; cu += e.c || 0; cu += OMENS[g.omen].wonderC || 0; }
  if (c.capital === c.owner) { s += 2; cu += 2 + (civ.perk.capC || 0); p += civ.capP || 0; }
  s += c.pop * 0.95; cu += c.pop * 0.3;
  f += eff(civ, 'allF') + (civ.wonderEff ? civ.wonderEff.allF || 0 : 0) + (civ.civics.includes('feudalism') ? 1 : 0);
  p += eff(civ, 'allP') + (civ.wonderEff ? civ.wonderEff.allP || 0 : 0) + (civ.civics.includes('craftsmanship') ? 1 : 0);
  s += eff(civ, 'cityS') + (civ.civics.includes('civilService') ? 1 : 0);
  cu += eff(civ, 'cityC');
  s *= 1 + eff(civ, 'sciPct') / 100; cu *= 1 + eff(civ, 'cultPct') / 100;
  if (civ.printing) s += c.buildings.includes('library') ? 2 : 0;
  const bh = behind(g, civ); if (bh) { const k = 1 + 0.08 * bh; p *= k; s *= k; cu *= k; }
  if (!civ.human && g.asc >= 3) { f *= 1.15; p *= 1.15; s *= 1.15; cu *= 1.15; }
  if (!civ.human && !g.allAI) { const ay = DIFFICULTIES[g.diff || 'standard'].aiYield; f *= ay; p *= ay; s *= ay; cu *= ay; }
  const surplus = f - c.pop * 2;
  return { f, p, s, c: cu, surplus };
}
function growCost(c) { return 7 + c.pop * 4; }
function autoWork(g, c) {
  const civ = g.civs[c.owner];
  const cands = RING2[c.tile].filter((j) => j !== c.tile && g.owner[j] === c.owner && g.claim[j] === c.id && TER[g.ter[j]] && !TER[g.ter[j]].block && !cityAt(g, j) && !(unitAt(g, j) && atWar(g, unitAt(g, j).owner, c.owner)));
  for (let fw of [1.6, 2.4, 3.5]) {
    if (c.pop < 4) fw += 0.5;
    const scored = cands.map((j) => { const y = tileYield(g, j, civ); return { j, v: y.f * fw + y.p * 1.5 + y.s * 1.2 + y.c * 1.1 }; }).sort((a, b) => b.v - a.v || a.j - b.j);
    c.worked = scored.slice(0, c.pop).map((o) => o.j);
    if (cityYields(g, c).surplus >= 1) break;
  }
}
function borderGrowth(g, c) { if (c.pop >= 3) claimTiles(g, c, 2); }

// ---------- movement & pathing
function enemyZoc(g, u, tile) {
  for (const n of NB[tile]) { const o = unitAt(g, n); if (o && atWar(g, o.owner, u.owner) && !UNITS[o.type].civilian) return true; const c = cityAt(g, n); if (c && atWar(g, c.owner, u.owner)) return true; }
  return false;
}
function canEnter(g, u, tile, transit) {
  if (!passable(g, tile)) return false;
  const o = unitAt(g, tile); if (o && (o.owner !== u.owner || !transit)) return false;
  const c = cityAt(g, tile); if (c && c.owner !== u.owner) return false;
  const own = g.owner[tile]; if (UNITS[u.type].civilian && own >= 0 && own !== u.owner && !atWar(g, own, u.owner)) return false; // settlers keep out of foreign land
  if (g.camp[tile] && UNITS[u.type].civilian) return false;
  return true;
}
// Dijkstra over turns: returns map tile -> cost (in mp) for reachable this turn
function reachable(g, u, keepTransit) {
  const res = new Map(); res.set(u.tile, { left: u.mp, prev: -1 });
  const open = [[u.tile, u.mp]];
  while (open.length) {
    open.sort((a, b) => b[1] - a[1]); const [t, left] = open.shift();
    if (left <= 0) continue;
    if (t !== u.tile && enemyZoc(g, u, t)) continue;
    for (const n of NB[t]) {
      if (!canEnter(g, u, n, true)) continue;
      const nl = Math.max(0, left - moveCost(g, n));
      const ex = res.get(n);
      if (!ex || ex.left < nl) { res.set(n, { left: nl, prev: t }); open.push([n, nl]); }
    }
  }
  res.delete(u.tile);
  if (!keepTransit) for (const t of [...res.keys()]) if (unitAt(g, t)) res.delete(t); // can pass through friends, not stop on them
  return res;
}
// multi-turn path (ignores units except at target-adjacency); returns array of tiles from start (exclusive) to goal
function findPath(g, u, goal, opts) {
  opts = opts || {};
  const distM = new Map(), prev = new Map(); distM.set(u.tile, 0);
  const open = [[u.tile, 0]]; const mp = maxMp(g, u, g.civs[u.owner]);
  let iter = 0;
  while (open.length && iter++ < 4000) {
    let bi = 0; for (let k = 1; k < open.length; k++) if (open[k][1] < open[bi][1]) bi = k;
    const [t, d] = open.splice(bi, 1)[0];
    if (t === goal) break;
    if (d > distM.get(t)) continue;
    for (const n of NB[t]) {
      if (n !== goal) { if (!passable(g, n)) continue; const o = unitAt(g, n); if (o && o.owner !== u.owner) continue; const c = cityAt(g, n); if (c && c.owner !== u.owner) continue;
        const own = g.owner[n]; if (UNITS[u.type].civilian && own >= 0 && own !== u.owner && !atWar(g, own, u.owner)) continue; if (g.camp[n] && UNITS[u.type].civilian) continue; }
      else if (!passable(g, n)) continue;
      const nd = d + Math.min(moveCost(g, n), mp) + (opts.avoid && enemyZoc(g, u, n) ? 2 : 0) + 0.001 * n % 1;
      if (!distM.has(n) || nd < distM.get(n)) { distM.set(n, nd); prev.set(n, t); open.push([n, nd]); }
    }
  }
  if (!prev.has(goal)) return null;
  const path = []; let t = goal; while (t !== u.tile) { path.unshift(t); t = prev.get(t); }
  return path;
}
function moveUnit(g, u, tile) {
  const r = reachable(g, u, true); const e = r.get(tile); if (!e || unitAt(g, tile)) return false;
  const steps = []; let t = tile; while (t !== u.tile && t !== -1) { steps.unshift(t); t = r.get(t) ? r.get(t).prev : -1; }
  for (const s of steps) { u.tile = s; if (g.camp[s] && !g.civs[u.owner].barb) clearCamp(g, u, s); if (g.ruin && g.ruin[s] && !g.civs[u.owner].barb) popRuin(g, u, s); }
  u.mp = e.left; if (enemyZoc(g, u, tile)) u.mp = 0; u.fort = 0; u.sleep = false; u.acted = true;
  if (g.civs[u.owner].human || g.allAI) updateVision(g);
  return true;
}
function stepToward(g, u, goal) {
  // follow multi-turn path as far as this turn allows
  const path = findPath(g, u, goal); if (!path) return false;
  const r = reachable(g, u, true); let best = null; // pass through friends, stop on the furthest free tile
  for (const t of path) { if (r.has(t)) { if (!unitAt(g, t)) best = t; } else break; }
  if (best === null) return false;
  return moveUnit(g, u, best);
}
function popRuin(g, u, tile) {
  g.ruin[tile] = false; const civ = g.civs[u.owner];
  const home = g.cities.filter((c) => c.owner === civ.id).sort((a, b) => dist(a.tile, tile) - dist(b.tile, tile))[0];
  let opts = D.RUIN_GIFTS.slice(); if (!home) opts = opts.filter((o) => o !== 'pop' && o !== 'gold');
  const gift = pick(g, opts); let text; const X = civ.perk.ruinX || 1;
  if (gift === 'sci') { const v = (20 + g.turn * 2) * X; civ.sciStock += v; text = `scrolls of lost lore (+${v} science)`; }
  else if (gift === 'cult') { const v = (16 + g.turn * 2) * X; civ.cultStock += v; text = `a buried shrine (+${v} culture)`; }
  else if (gift === 'pop') { home.pop += X; borderGrowth(g, home); autoWork(g, home); text = `survivors who join ${home.name} (+${X} population)`; }
  else if (gift === 'gold') { home.prod += 30 * X; text = `a hoard of tools (+${30 * X} production in ${home.name})`; }
  else if (gift === 'unit') { const t = bestMelee(civ); spawnNear(g, civ.id, t, tile); text = `a band of warriors who swear to you (free ${UNITS[t].name})`; }
  else { if (g.seen && (civ.human || (g.allAI && civ.id === 0))) for (const j of within(tile, 5)) g.seen[j] = true; civ.sciStock += 10 * X; text = `an old map of the island (+${10 * X} science)`; }
  note(g, 'ruin', `${civ.name} explores ancient ruins and finds ${text}.`, { civ: civ.id, tile });
}
function clearCamp(g, u, tile) {
  g.camp[tile] = false; const civ = g.civs[u.owner]; civ.camps = (civ.camps || 0) + 1;
  const bounty = (12 + g.turn) * (OMENS[g.omen].campPay || 1); civ.sciStock += bounty; civ.cultStock += Math.round(bounty * 0.6);
  note(g, 'camp', `${civ.name} clears a barbarian camp (+${bounty} science, +${Math.round(bounty * 0.6)} culture).`, { civ: civ.id, tile });
}

// ---------- combat
function attackTargets(g, u) {
  const U = UNITS[u.type]; const out = [];
  if (U.civilian || u.mp <= 0 || u.attacked) return out;
  const rad = U.rs ? U.range : 1;
  for (let t = 0; t < N; t++) {
    if (t === u.tile || dist(t, u.tile) > rad) continue;
    const c = cityAt(g, t); const o = unitAt(g, t);
    if (c && c.owner !== u.owner && (atWar(g, c.owner, u.owner))) out.push(t);
    else if (o && o.owner !== u.owner && atWar(g, o.owner, u.owner)) out.push(t);
  }
  return out;
}
function predict(g, u, tile) {
  const U = UNITS[u.type]; const c = cityAt(g, tile); const o = unitAt(g, tile);
  if (c && c.owner !== u.owner) {
    const a = attackStr(g, u, { kind: 'city' }); const d = cityStr(g, c);
    let toD = dmg(a, d); const toA = U.rs ? 0 : dmg(d, a);
    return { a, d, toD, toA: Math.min(toA, u.hp), kill: c.hp - toD <= 0, capture: !U.rs && c.hp - toD <= 0 && toA < u.hp, city: c, dies: toA >= u.hp };
  }
  if (o) {
    const a = attackStr(g, u, { kind: 'unit', u: o }); const d = defenseStr(g, o, u);
    let toD = UNITS[o.type].civilian ? 100 : dmg(a, d); const toA = U.rs || UNITS[o.type].civilian ? 0 : dmg(d, a);
    return { a, d, toD: Math.min(toD, o.hp), toA: Math.min(toA, u.hp), kill: o.hp - toD <= 0, dies: toA >= u.hp, unit: o };
  }
  return null;
}
function attack(g, u, tile) {
  const pr = predict(g, u, tile); if (!pr) return null;
  const targetOwner = pr.city ? pr.city.owner : pr.unit.owner;
  if (!atWar(g, u.owner, targetOwner)) return null;
  const U = UNITS[u.type];
  g.events.push({ kind: 'combat', from: u.tile, to: tile, toD: pr.toD, toA: pr.toA, ranged: !!U.rs, owner: u.owner });
  u.mp = 0; u.attacked = true; u.fort = 0; u.acted = true;
  if (pr.city) {
    pr.city.hp = Math.max(0, pr.city.hp - pr.toD); pr.city.hitThisTurn = true;
    if (pr.city.hp <= 0 && g.diff === 'gentle' && g.civs[pr.city.owner].human && pr.city.capital === pr.city.owner) { pr.city.hp = 1; if (!pr.city.held) note(g, 'event', `The old walls of ${pr.city.name} hold! (Gentle: your capital cannot fall.)`, { tile: pr.city.tile }); pr.city.held = g.turn; }
    u.hp -= pr.toA;
    if (u.hp <= 0) { killUnit(g, u, targetOwner); return pr; }
    if (pr.city.hp <= 0 && !U.rs) {
      const gar = unitAt(g, tile); if (gar) killUnit(g, gar, u.owner);
      if (g.civs[u.owner].barb) { captureCity(g, pr.city, u.owner); g.units = g.units.filter((x) => x !== u); } // raiders loot and leave
      else { captureCity(g, pr.city, u.owner); u.tile = tile; }
    }
  } else {
    const o = pr.unit;
    if (UNITS[o.type].civilian) { // capture civilian (settler)
      g.units = g.units.filter((x) => x !== o);
      let joined = null;
      if (!g.civs[u.owner].barb) { joined = g.cities.filter((c) => c.owner === u.owner).sort((a, b) => dist(a.tile, tile) - dist(b.tile, tile))[0]; if (joined) { joined.pop++; borderGrowth(g, joined); autoWork(g, joined); } }
      if (!U.rs && !unitAt(g, tile)) u.tile = tile;
      note(g, 'capture', `${g.civs[u.owner].name} seizes a ${g.civs[o.owner].name} Settler${joined ? ' (they join ' + joined.name + ')' : ''}!`, { tile, by: u.owner, from: o.owner });
    } else {
      o.hp -= pr.toD; u.hp -= pr.toA;
      if (o.hp <= 0) { killUnit(g, o, u.owner); if (!U.rs && u.hp > 0 && !cityAt(g, tile)) { u.tile = tile; if (g.camp[tile] && !g.civs[u.owner].barb) clearCamp(g, u, tile); } }
      if (u.hp <= 0) killUnit(g, u, o.owner);
    }
  }
  if (g.civs[u.owner] && (g.civs[u.owner].human)) updateVision(g);
  return pr;
}
function killUnit(g, u, by) {
  g.units = g.units.filter((x) => x !== u);
  g.events.push({ kind: 'death', tile: u.tile, owner: u.owner, type: u.type });
  const k = g.civs[by]; if (k && !k.barb) { k.kills = (k.kills || 0) + 1; const ky = eff(k, 'killYield'); if (ky) { k.sciStock += ky; k.cultStock += ky; } }
  const l = g.civs[u.owner]; if (l && !l.barb) l.lost = (l.lost || 0) + 1;
}
function captureCity(g, c, by) {
  const from = c.owner; const fromCiv = g.civs[from], byCiv = g.civs[by];
  if (byCiv.barb) { // barbarians sack: lose pop and production
    c.pop = Math.max(1, c.pop - 1); c.prod = 0; c.hp = 40; note(g, 'sack', `Barbarians sack ${c.name}!`, { tile: c.tile }); return; }
  c.owner = by; c.pop = Math.max(1, c.pop - 1); c.hp = 50; c.queue = null; c.prod = 0; c.food = 0;
  c.buildings = c.buildings.filter((b) => b !== 'walls');
  for (let j = 0; j < N; j++) if (g.claim[j] === c.id) g.owner[j] = by;
  autoWork(g, c);
  note(g, 'conquer', `${byCiv.name} captures ${c.name} from ${fromCiv.name}!`, { tile: c.tile, by, from });
  if (!g.cities.some((x) => x.owner === from)) { fromCiv.alive = false; g.units = g.units.filter((x) => x.owner !== from); note(g, 'fall', `${fromCiv.name} has fallen.`, { civ: from }); for (const d of g.civs) { d.war[from] = false; } }
}
function cityStrike(g, c) {
  // auto ranged strike at the weakest enemy within 2
  let best = null, bestV = -1;
  for (const u of g.units) if (atWar(g, u.owner, c.owner) && dist(u.tile, c.tile) <= 2) {
    const d = defenseStr(g, u, null); const toD = UNITS[u.type].civilian ? 0 : dmg(cityStr(g, c) - 2, d); const v = toD >= u.hp ? 1000 : toD; if (v > bestV) { bestV = v; best = u; }
  }
  if (!best || UNITS[best.type].civilian) return;
  const toD = dmg(cityStr(g, c) - 2, defenseStr(g, best, null));
  best.hp -= toD; g.events.push({ kind: 'combat', from: c.tile, to: best.tile, toD, toA: 0, ranged: true, owner: c.owner, city: true });
  if (best.hp <= 0) killUnit(g, best, c.owner);
}

// ---------- vision (human only)
function updateVision(g) {
  if (!g.vis) return;
  const id = g.allAI ? 0 : g.humanId; if (id < 0) return;
  g.vis.fill(0);
  const civ = g.civs[id]; const sight = 2 + (civ.perk.sight || 0);
  for (const u of g.units) if (u.owner === id) for (const j of within(u.tile, sight)) g.vis[j] = 1;
  for (const c of g.cities) if (c.owner === id) for (const j of within(c.tile, 3)) g.vis[j] = 1;
  for (let j = 0; j < N; j++) if (g.owner[j] === id) g.vis[j] = 1;
  for (let j = 0; j < N; j++) if (g.vis[j]) g.seen[j] = true;
  for (const c of g.cities) if (g.vis[c.tile] && c.owner !== id && !civ.met[c.owner]) { civ.met[c.owner] = true; g.civs[c.owner].met[id] = true; note(g, 'meet', `You meet ${g.civs[c.owner].lname} of ${g.civs[c.owner].name} (${PERS[g.civs[c.owner].pers].name}).`, { civ: c.owner }); }
  for (const u of g.units) if (g.vis[u.tile] && u.owner !== id && !g.civs[u.owner].barb && !civ.met[u.owner]) { civ.met[u.owner] = true; g.civs[u.owner].met[id] = true; note(g, 'meet', `You meet ${g.civs[u.owner].lname} of ${g.civs[u.owner].name} (${PERS[g.civs[u.owner].pers].name}).`, { civ: u.owner }); }
}

// ---------- end of a civ's turn: yields, growth, production
function civEndTurn(g, civ) {
  // drill: each city retrains one obsolete unit standing on its land per turn (free, keeps old armies relevant)
  for (const c of g.cities) if (c.owner === civ.id) {
    const u = g.units.find((x) => x.owner === civ.id && UNITS[x.type].up && canBuildUnit(civ, UNITS[x.type].up) && !x.attacked && g.claim[x.tile] === c.id);
    if (u) { const from = UNITS[u.type].name; u.type = UNITS[u.type].up; if (civ.human) note(g, 'upgrade', `${c.name} retrains a ${from} into a ${UNITS[u.type].name}.`, { tile: u.tile, civ: civ.id }); }
  }
  if (!civ.alive || civ.barb) return;
  civ.wonderEff = {}; for (const c of g.cities) if (c.owner === civ.id) for (const w of c.wonders) for (const [k, v] of Object.entries(WONDERS[w].eff)) if (k === 'allP' || k === 'allF' || k === 'unitStr') civ.wonderEff[k] = (civ.wonderEff[k] || 0) + v;
  let sci = 0, cul = 0;
  for (const c of g.cities.filter((x) => x.owner === civ.id)) {
    autoWork(g, c);
    const y = cityYields(g, c); sci += y.s; cul += y.c;
    c.food += y.surplus;
    if (c.food >= growCost(c)) { c.food -= growCost(c); c.pop++; borderGrowth(g, c); autoWork(g, c); g.events.push({ kind: 'grow', tile: c.tile, owner: civ.id }); }
    else if (c.food < 0) { if (c.pop > 1) { c.pop--; c.food = 0; autoWork(g, c); } else c.food = 0; }
    if (c.queue) {
      let p = y.p; const k = c.queue.kind;
      if (k === 'building' || k === 'wonder') p *= 1 + (civ.perk.buildPct || 0) / 100;
      if (k === 'wonder') p *= 1 + eff(civ, 'wonderPct') / 100;
      if (k === 'project') { // the Expedition is an empire-wide effort: every city adds to one pool
        civ.projProg = (civ.projProg || 0) + p;
        if (civ.projProg >= itemCost(g, civ, c.queue) && !civ.starward) { civ.starward = true; note(g, 'project', `${civ.name} launches the Starward Expedition!`, { civ: civ.id }); }
      } else c.prod += p;
      if (k === 'project') { /* pooled above */ }
      else if (k === 'wonder' && g.wondersBuilt[c.queue.key] !== undefined) { note(g, 'lostwonder', `${c.name} loses the race for the ${WONDERS[c.queue.key].name}. Production kept.`, { civ: civ.id, tile: c.tile }); c.queue = null; }
      else {
        const cost = itemCost(g, civ, c.queue);
        if (c.prod >= cost) {
          const it = c.queue; let done = true;
          if (it.kind === 'unit') { if (it.key === 'settler' && c.pop < 2) done = false; else { const u = spawnNear(g, civ.id, it.key, c.tile); if (!u) done = false; else if (it.key === 'settler') c.pop--; } }
          else if (it.kind === 'building') c.buildings.push(it.key);
          else if (it.kind === 'wonder') { c.wonders.push(it.key); g.wondersBuilt[it.key] = civ.id; note(g, 'wonder', `${civ.name} completes the ${WONDERS[it.key].name} in ${c.name}!`, { civ: civ.id, tile: c.tile }); }
          else if (it.kind === 'project') { civ.starward = true; note(g, 'project', `${civ.name} launches the Starward Expedition!`, { civ: civ.id }); }
          if (done) { c.prod -= cost; c.prod = Math.min(c.prod, 20); g.events.push({ kind: 'built', civ: civ.id, city: c.id, item: it }); if (it.kind !== 'unit' || civ.human) c.queue = null; if (it.kind === 'building' && it.key === 'walls') c.hp += 80; }
        }
      }
    } else c.prod = Math.min(c.prod + y.p * 0.5, 30); // idle production is half banked
    const besieged = NB[c.tile].some((n) => { const o = unitAt(g, n); return o && atWar(g, o.owner, c.owner) && !UNITS[o.type].civilian; });
    if (!c.hitThisTurn && !besieged) c.hp = Math.min(cityMaxHp(g, c), c.hp + 15);
    c.hitThisTurn = false;
  }
  civ.sci = sci; civ.cult = cul;
  civ.sciStock += sci; civ.cultStock += cul;
  // research
  if (civ.research) { const cost = techCost(g, civ, civ.research); if (civ.sciStock >= cost) { civ.sciStock -= cost; learnTech(g, civ, civ.research); civ.research = null; } }
  if (civ.civic) { const cost = civicCost(g, civ, civ.civic); if (civ.cultStock >= cost) { civ.cultStock -= cost; civ.civics.push(civ.civic); g.events.push({ kind: 'civic', civ: civ.id, key: civ.civic }); if (civ.human) note(g, 'civicnote', `Civic adopted: ${CIVICS[civ.civic].name}.`, { civ: civ.id }); civ.civic = null; } }
  // heal & refresh units
  for (const u of g.units) if (u.owner === civ.id) {
    if (!u.acted) { let h = 10; if (g.owner[u.tile] === civ.id) h = 18; if (cityAt(g, u.tile)) h = 25; h += eff(civ, 'heal') + (civ.civics.includes('militaryTradition') ? 10 : 0); u.hp = Math.min(100, u.hp + h); u.fort = Math.min(2, u.fort + 1); }
    u.mp = maxMp(g, u, civ); u.acted = false; u.attacked = false;
  }
}
function learnTech(g, civ, k) {
  civ.techs.push(k); g.events.push({ kind: 'tech', civ: civ.id, key: k });
  if (k === 'printing') civ.printing = true;
  const era = Math.max(...civ.techs.map((t) => TECHS[t].era));
  if (era > civ.era) {
    civ.era = era; note(g, 'era', `${civ.name} enters the ${D.ERAS[era]} Era.`, { civ: civ.id, era });
    if (civ.human) g.pendingDraft = { kind: 'boon', options: draftBoons(g, civ) };
    else { const AI = root.PE_AI || require('./ai.js'); addBoon(g, civ, AI.aiPickBoon(g, civ, draftBoons(g, civ))); }
  }
}
function draftBoons(g, civ, charter) {
  const free = Object.keys(BOONS).filter((b) => !civ.boons.includes(b)); const bold = shuffle(g, free.filter((b) => BOONS[b].bold));
  if (charter) return bold.slice(0, 3);
  const n = civ.human && g.asc >= 6 ? 2 : 3; return shuffle(g, free.filter((b) => !BOONS[b].bold)).slice(0, n - 1).concat(bold.slice(0, 1));
}

// ---------- scoring & victory
function score(g, civ) {
  if (civ.barb) return 0;
  const cs = g.cities.filter((c) => c.owner === civ.id);
  const pop = cs.reduce((a, c) => a + c.pop, 0);
  const wonders = cs.reduce((a, c) => a + c.wonders.length, 0);
  const caps = cs.filter((c) => c.capital >= 0 && c.capital !== civ.id).length;
  return pop * 4 + cs.length * 10 + civ.techs.length * 5 + civ.civics.length * 5 + wonders * 15 + caps * 25 + (civ.starward ? 50 : 0) + (civ.kills || 0) * 3 + (civ.camps || 0) * 8;
}
// Domination: keep your capital and either hold two rival capitals, or rule half of all cities (at least one taken by force); or be the last empire standing
function capsHeld(g, civ) { return g.cities.filter((c) => c.capital >= 0 && c.capital !== civ.id && c.owner === civ.id).length; }
function dominates(g, civ) {
  const rivals = g.civs.filter((c) => !c.barb && c.id !== civ.id);
  if (rivals.every((c) => !c.alive)) return true;
  const own = g.cities.find((c) => c.capital === civ.id); if (!own || own.owner !== civ.id) return false;
  if (capsHeld(g, civ) >= Math.min(2, rivals.length)) return true;
  const mine = g.cities.filter((c) => c.owner === civ.id);
  return mine.length >= 6 && mine.length * 2 >= g.cities.length && mine.some((c) => c.origOwner !== civ.id);
}
function checkVictory(g) {
  if (g.over) return g.over;
  const majors = g.civs.filter((c) => !c.barb);
  for (const civ of majors) {
    if (!civ.alive) continue;
    if (civ.starward) return (g.over = { winner: civ.id, type: 'science' });
    if (civ.civics.includes('magnumOpus') && g.cities.filter((c) => c.owner === civ.id).reduce((a, c) => a + c.wonders.length, 0) >= 2) return (g.over = { winner: civ.id, type: 'culture' });
    if (dominates(g, civ)) return (g.over = { winner: civ.id, type: 'conquest' });
  }
  if (!g.allAI && !g.civs[g.humanId].alive) return (g.over = { winner: -1, type: 'defeat' });
  if (g.turn > g.maxTurns) {
    let best = null; for (const c of majors) if (c.alive) { c.score = score(g, c); if (!best || c.score > best.score) best = c; }
    return (g.over = { winner: best.id, type: 'chronicle' });
  }
  return null;
}

// ---------- events (human only)
function rollEvent(g) {
  if (g.allAI) return;
  if (g.turn < 5 || g.turn % 5 !== 0 || g.turn >= g.maxTurns) return;
  g.usedEvents = g.usedEvents || [];
  const pool = EVENTS.filter((e) => !g.usedEvents.includes(e.id)); if (!pool.length) return;
  const e = pick(g, pool); g.usedEvents.push(e.id); g.pendingEvent = e.id;
}
function resolveEvent(g, choice) {
  const e = EVENTS.find((x) => x.id === g.pendingEvent); if (!e) return; g.pendingEvent = null;
  const fx = (choice === 'a' ? e.a : e.b).fx; const civ = g.civs[g.humanId]; const cs = g.cities.filter((c) => c.owner === civ.id); const cap = capitalOf(g, civ.id);
  if (fx.sci) civ.sciStock = Math.max(0, civ.sciStock + fx.sci);
  if (fx.cult) civ.cultStock = Math.max(0, civ.cultStock + fx.cult);
  if (fx.capPop && cap) { cap.pop += fx.capPop; borderGrowth(g, cap); autoWork(g, cap); }
  if (fx.capProd && cap) cap.prod += fx.capProd;
  if (fx.levy && cap) for (let k = 0; k < fx.levy; k++) spawnNear(g, civ.id, bestMelee(civ), cap.tile);
  if (fx.allFood) for (const c of cs) c.food += fx.allFood;
  if (fx.sciPctNow && civ.research) civ.sciStock += Math.round(techCost(g, civ, civ.research) * fx.sciPctNow / 100);
  const big = cs.slice().sort((a, b) => b.pop - a.pop)[0], small = cs.slice().sort((a, b) => a.pop - b.pop)[0];
  if (fx.bigPop && big) { big.pop = Math.max(1, big.pop + fx.bigPop); autoWork(g, big); }
  if (fx.bigProd && big) big.prod = Math.max(0, big.prod + fx.bigProd);
  if (fx.smallPop && small) { small.pop += fx.smallPop; borderGrowth(g, small); autoWork(g, small); }
  if (fx.heal) for (const u of g.units) if (u.owner === civ.id) u.hp = 100;
  if (fx.unitStr) civ.eff.unitStr = (civ.eff.unitStr || 0) + fx.unitStr;
  if (fx.capP) civ.capP = (civ.capP || 0) + fx.capP;
  if (fx.settler && cap) spawnNear(g, civ.id, 'settler', cap.tile);
  note(g, 'event', `${e.title}: ${(choice === 'a' ? e.a : e.b).label}`, { civ: civ.id });
}

// ---------- barbarians
function barbTurn(g) {
  const B = g.civs[BARB];
  const every = g.asc >= 1 ? 4 : 6;
  for (const t of Object.keys(g.campTimer)) {
    const tile = +t; if (!g.camp[tile]) continue;
    g.campTimer[t]--;
    if (g.campTimer[t] <= 0) { g.campTimer[t] = every; const type = g.turn > 24 ? 'swordsman' : g.turn > 14 ? pick(g, ['horseman', 'spearman', 'archer']) : pick(g, ['warrior', 'warrior', 'archer']); const nearby = g.units.filter((u) => u.owner === BARB && dist(u.tile, tile) <= 3).length; if (nearby < 3) spawnNear(g, BARB, type, tile); }
  }
  // new camp occasionally in empty land
  if (g.turn % 9 === 0 && Object.values(g.camp).filter(Boolean).length < 4) {
    const cands = [...Array(N).keys()].filter((i) => passable(g, i) && g.owner[i] < 0 && !unitAt(g, i) && g.units.every((u) => g.civs[u.owner].barb || dist(u.tile, i) > 2) && g.cities.every((c) => dist(c.tile, i) >= 4));
    if (cands.length) { const i = pick(g, cands); g.camp[i] = true; g.campTimer[i] = 2; addUnit(g, BARB, 'warrior', i); }
  }
  for (const u of g.units.filter((x) => x.owner === BARB)) {
    u.mp = maxMp(g, u, B);
    const gentleCity = (t) => !DIFFICULTIES[g.diff || 'standard'].barbCityRaid && cityAt(g, t) && g.civs[cityAt(g, t).owner].human;
    const tg = attackTargets(g, u).filter((t) => !gentleCity(t)).map((t) => ({ t, p: predict(g, u, t) })).filter((o) => o.p && !o.p.dies).sort((a, b) => (b.p.kill - a.p.kill) || (b.p.toD - b.p.toA) - (a.p.toD - a.p.toA));
    if (tg.length) { attack(g, u, tg[0].t); continue; }
    // wander toward nearest non-barb city/unit within 7
    let goal = null, gd = 8;
    for (const c of g.cities) { const d = dist(c.tile, u.tile); if (d < gd) { gd = d; goal = c.tile; } }
    for (const o of g.units) if (o.owner !== BARB) { const d = dist(o.tile, u.tile); if (d < gd - 1) { gd = d; goal = o.tile; } }
    if (goal !== null) { const ad = NB[goal].filter((n) => passable(g, n) && !unitAt(g, n)).sort((a, b) => dist(a, u.tile) - dist(b, u.tile))[0]; if (ad !== undefined) stepToward(g, u, ad); }
    const tg2 = attackTargets(g, u).filter((t) => !gentleCity(t)).map((t) => ({ t, p: predict(g, u, t) })).filter((o) => o.p && !o.p.dies && o.p.toD >= o.p.toA);
    if (tg2.length && u.mp > 0) attack(g, u, tg2[0].t);
    if (u.hp < 100 && !u.acted) u.hp = Math.min(100, u.hp + 10);
    u.acted = false; u.attacked = false;
  }
}

// ---------- the turn loop
function endTurn(g) {
  if (g.over) return g.over;
  const AI = root.PE_AI || (typeof require !== 'undefined' ? require('./ai.js') : null);
  for (const civ of g.civs) if (!civ.barb && civ.alive && !civ.human) AI.takeTurn(g, civ);
  barbTurn(g);
  for (const c of g.cities) cityStrike(g, c);
  for (const civ of g.civs) civEndTurn(g, civ);
  for (const civ of g.civs) if (!civ.barb) civ.score = score(g, civ);
  g.turn++;
  checkVictory(g);
  if (!g.over) rollEvent(g);
  updateVision(g);
  return g.over;
}

const API = { W, H, N, BARB, NB, RING2, rnd, rint, pick, shuffle, dist, toCube, COL, ROW, within, newGame, genMap, tileYield, passable, moveCost, siteScore, addUnit, addBoon, unitAt, cityAt, capitalOf,
  spawnNear, maxMp, unitStr, defenseStr, attackStr, cityStr, cityMaxHp, dmg, atWar, declareWar, makePeace, note, techCost, civicCost, cityCount, availTechs, availCivics, canBuildUnit,
  buildOptions, itemCost, itemName, foundCity, canFound, cityYields, growCost, autoWork, enemyZoc, canEnter, reachable, findPath, moveUnit, stepToward, attackTargets, predict, attack,
  killUnit, captureCity, behind, popRuin, dominates, capsHeld, updateVision, civEndTurn, learnTech, draftBoons, score, checkVictory, rollEvent, resolveEvent, barbTurn, endTurn, eff, bestMelee, D };
if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.PE = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
