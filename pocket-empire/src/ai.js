// POCKET EMPIRE — rival AI. Personalities steer research, production, settling and war.
(function (root) {
'use strict';
const P = (typeof module !== 'undefined' && module.exports) ? require('./core.js') : root.PE;
const D = P.D; const { UNITS, BUILDINGS, WONDERS, TECHS, CIVICS, PERS, BOONS } = D;

const STATS = { target: 0, go: 0, army: 0, near: 0 };
function milStrength(g, id) {
  let s = 0; for (const u of g.units) if (u.owner === id && !UNITS[u.type].civilian) s += (Math.max(UNITS[u.type].str, UNITS[u.type].rs || 0) + P.eff(g.civs[id], 'unitStr')) * u.hp / 100;
  for (const c of g.cities) if (c.owner === id) s += 6 + c.pop;
  return s;
}
function nearestCityDist(g, a, b) { let best = 99; for (const c of g.cities) if (c.owner === a) for (const d of g.cities) if (d.owner === b) best = Math.min(best, P.dist(c.tile, d.tile)); return best; }
// Second ambition (v0.3.1): each rival leans 40% toward a second personality, set by its charter if that
// points elsewhere, else by a hash of the island seed. Pure function of (seed, civ, charter): no RNG draw.
const CHARTER_LEAN = { ironOath: 'warlord', horseLords: 'warlord', scholarK: 'scholar', festival: 'builder', quarries: 'builder', tallCrown: 'scholar', frontier: 'expander', walled: 'builder' };
function goal2(g, civ) {
  if (civ.goal2) return civ.goal2;
  const keys = Object.keys(PERS).filter((k) => k !== civ.pers);
  const lean = CHARTER_LEAN[(civ.boons || [])[0]];
  let pick = lean && lean !== civ.pers ? lean : null;
  if (!pick) { let h = (((g.seed || 0) | 0) * 2654435761 + civ.id * 40503 + 977) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13; pick = keys[(h >>> 0) % keys.length]; }
  if ((civ.boons || []).length) civ.goal2 = pick; return pick;
}
const _pc = new WeakMap();
function persOf(g, civ) {
  if (civ.barb || civ.human || !PERS[civ.pers]) return PERS[civ.pers] || PERS.builder; // the player's ★ advice follows their own leader
  const k2 = goal2(g, civ), hit = _pc.get(civ); if (hit && hit.k === civ.pers + k2) return hit.v;
  const a = PERS[civ.pers], b = PERS[k2], v = { name: a.name };
  for (const f of ['aggr', 'expand', 'sci', 'cult', 'wonder']) v[f] = a[f] * 0.72 + b[f] * 0.28;
  _pc.set(civ, { k: civ.pers + k2, v }); return v;
}
function isWarlike(g, civ) { return civ.pers === 'warlord' || goal2(g, civ) === 'warlord'; }
function majorWars(g, civ) { return g.civs.filter((o) => !o.barb && o.alive && o.id !== civ.id && P.atWar(g, civ.id, o.id)); }

function diplomacy(g, civ) {
  const pers = persOf(g, civ); const my = milStrength(g, civ.id);
  const wars = majorWars(g, civ);
  for (const o of g.civs) {
    if (o.barb || !o.alive || o.id === civ.id) continue;
    const their = milStrength(g, o.id); const ratio = my / Math.max(1, their); const d = nearestCityDist(g, civ.id, o.id);
    if (!P.atWar(g, civ.id, o.id)) {
      const gentle = g.diff === 'gentle', wl = isWarlike(g, civ);
      const minTurn = g.asc >= 5 ? 6 : gentle ? 9 : wl ? 6 : 8;
      if (g.turn < minTurn || (civ.peaceUntil[o.id] || 0) > g.turn || d > (wl ? 8 : 7)) continue;
      if (wars.length >= (civ.pers === 'warlord' ? 2 : 1)) continue;
      if (o.human && g.diff === 'gentle' && g.civs.some((x) => x !== civ && !x.barb && P.atWar(g, x.id, o.id))) continue; // Gentle: one enemy at a time
      let want = pers.aggr * (gentle ? 0.22 : 0.3) * (ratio - (gentle ? 1.15 : 1.05)) * (g.asc >= 5 ? 1.5 : 1);
      const DF = D.DIFFICULTIES[g.diff || 'standard'];
      if (o.human && g.turn < DF.peaceTurn) continue; // Gentle: nobody attacks the player early
      if (o.human) want *= g.diff === 'gentle' ? 0.45 : 0.9;
      if (ratio > (gentle ? 1.25 : 1.15) && P.rnd(g) < want) { P.declareWar(g, civ.id, o.id); wars.push(o); }
    } else {
      const since = g.turn - (civ.warSince[o.id] || 0);
      const losing = ratio < 0.75 || g.cities.filter((c) => c.owner === civ.id).some((c) => c.hp < 50);
      if (since >= 8 && (losing || (since >= 12 && P.rnd(g) < 0.25))) {
        if (o.human) { if (!g.peaceOffer) g.peaceOffer = { from: civ.id, turn: g.turn }; }
        else if (acceptsPeace(g, o, civ.id)) P.makePeace(g, civ.id, o.id);
      }
    }
  }
}
function acceptsPeace(g, civ, otherId) {
  if (!P.atWar(g, civ.id, otherId)) return false;
  const since = g.turn - (civ.warSince[otherId] || 0);
  const ratio = milStrength(g, civ.id) / Math.max(1, milStrength(g, otherId));
  if (g.diff === 'gentle' && g.civs[otherId].human && since >= 3) return true; // Gentle: rivals always take a peace offer
  if (since < 4) return false;
  if (ratio > 1.6 && persOf(g, civ).aggr > 0.6) return false;
  return ratio < 1.4 || since > 10;
}

function pickResearch(g, civ) {
  const pers = persOf(g, civ); const av = P.availTechs(civ); if (!av.length) return null;
  const sciPath = ['pottery', 'writing', 'masonry', 'mining', 'mathematics', 'currency', 'education', 'astronomy', 'printing', 'navigation'];
  let best = null, bv = -1e9;
  for (const k of av) {
    let v = 60 / P.techCost(g, civ, k);
    const units = Object.keys(UNITS).filter((u) => UNITS[u].tech === k && !UNITS[u].civic);
    if (units.length) v += pers.aggr * 1.2 + (majorWars(g, civ).length ? 1 : 0);
    const bl = Object.keys(BUILDINGS).filter((b) => BUILDINGS[b].tech === k);
    for (const b of bl) v += ((BUILDINGS[b].s || 0) * pers.sci + (BUILDINGS[b].c || 0) * pers.cult + (BUILDINGS[b].p || 0) * 0.6 + (BUILDINGS[b].f || 0) * 0.5) * 0.35;
    if (Object.values(WONDERS).some((w) => w.tech === k)) v += pers.wonder * 0.8;
    if (sciPath.includes(k)) v += pers.sci * 0.9;
    if (k === 'navigation') v += 3;
    v += P.rnd(g) * 0.4;
    if (v > bv) { bv = v; best = k; }
  }
  return best;
}
function pickCivic(g, civ) {
  const pers = persOf(g, civ); const av = P.availCivics(civ); if (!av.length) return null;
  const cultPath = ['codeOfLaws', 'mysticism', 'drama', 'humanism', 'craftsmanship', 'civilService', 'magnumOpus'];
  let best = null, bv = -1e9;
  for (const k of av) { let v = 40 / P.civicCost(g, civ, k) + (cultPath.includes(k) ? pers.cult : 0) + (k === 'militaryTradition' ? pers.aggr : 0) + (k === 'magnumOpus' ? 3 : 0) + P.rnd(g) * 0.3; if (v > bv) { bv = v; best = k; } }
  return best;
}
function aiPickBoon(g, civ, opts) {
  const pers = persOf(g, civ);
  const w = { harvest: 1 + pers.expand, forge: 1.2, charts: 0.6 + pers.sci, muse: 0.4 + pers.cult, drill: 0.4 + pers.aggr, roads: 0.6, bulwark: 0.5, pioneers: pers.expand, windfall: 0.8, levy: pers.aggr, eureka: 0.7, masons: pers.wonder, sages: 0.5 + pers.sci, bards: 0.4 + pers.cult,
    ironOath: 0.3 + pers.aggr * 1.2, tallCrown: 0.9 - pers.expand * 0.5 + pers.sci * 0.3, frontier: 0.3 + pers.expand, scholarK: 0.3 + pers.sci, festival: 0.3 + pers.cult, quarries: 0.2 + pers.wonder, horseLords: 0.2 + pers.aggr, walled: 0.5 - pers.aggr * 0.3 };
  let best = opts[0], bv = -1; for (const o of opts) { const v = (w[o] || 0.5) + P.rnd(g) * 0.5; if (v > bv) { bv = v; best = o; } } return best;
}

function bestSites(g, civ, n) {
  const cap = P.capitalOf(g, civ.id);
  const out = [];
  for (let i = 0; i < P.N; i++) {
    const s = P.siteScore(g, i, civ.id); if (s <= 0) continue;
    const d = cap ? P.dist(cap.tile, i) : 0; if (cap && d > 9) continue;
    out.push({ i, s: s - d * 0.8 });
  }
  return out.sort((a, b) => b.s - a.s).slice(0, n);
}
function chooseMilitary(g, civ, c) {
  const opts = P.buildOptions(g, c).filter((o) => o.kind === 'unit' && o.key !== 'settler');
  const pers = persOf(g, civ); const mine = g.units.filter((u) => u.owner === civ.id);
  const n = (cls) => mine.filter((u) => UNITS[u.type].cls === cls).length;
  const wars = majorWars(g, civ).length > 0;
  let want = 'melee';
  const r = P.rnd(g);
  if (wars && n('siege') < 2 && opts.some((o) => UNITS[o.key].cls === 'siege')) want = 'siege';
  else if (n('ranged') < mine.length * 0.35 && r < 0.6) want = 'ranged';
  else if (r < 0.3 + pers.aggr * 0.3 && opts.some((o) => UNITS[o.key].cls === 'mounted')) want = 'mounted';
  let best = null, bv = -1;
  for (const o of opts) { const U = UNITS[o.key]; let v = Math.pow(Math.max(U.str, U.rs || 0) + 4, 2) / o.cost / 20 * (U.cls === want ? 2 : 1) + (U.cls === 'anti' && want === 'melee' ? 0.15 : 0); if (v > bv) { bv = v; best = o; } }
  return best;
}
function chooseProduction(g, civ, c) {
  const pers = persOf(g, civ); const opts = P.buildOptions(g, c);
  const cities = g.cities.filter((x) => x.owner === civ.id);
  const mil = g.units.filter((u) => u.owner === civ.id && !UNITS[u.type].civilian);
  const settlers = g.units.filter((u) => u.owner === civ.id && u.type === 'settler').length + cities.filter((x) => x.queue && x.queue.key === 'settler').length;
  const threat = g.units.filter((u) => P.atWar(g, u.owner, civ.id) && !UNITS[u.type].civilian && P.dist(u.tile, c.tile) <= 4).length;
  const near = mil.filter((u) => P.dist(u.tile, c.tile) <= 2).length;
  const wars = majorWars(g, civ).length;
  if (threat > near) return chooseMilitary(g, civ, c);
  if (!P.unitAt(g, c.tile) && mil.length < cities.length && g.turn > 2) return chooseMilitary(g, civ, c);
  const target = 3 + Math.round(pers.expand * 3);
  const y0 = P.cityYields(g, c); const growIn = c.pop >= 2 ? 0 : (y0.surplus > 0 ? (P.growCost(c) - c.food) / y0.surplus : 99);
  if (cities.length + settlers < target && growIn <= P.itemCost(g, civ, { kind: 'unit', key: 'settler' }) / Math.max(1, y0.p) + 1 && g.turn < 30 && settlers < 2 && bestSites(g, civ, 1).length) { const s = opts.find((o) => o.key === 'settler'); if (s) return s; }
  const desired = Math.round(cities.length * (1 + pers.aggr * 1.2) + wars * cities.length * 1.2 + (g.turn > 20 ? 1 : 0));
  if (mil.length < desired) return chooseMilitary(g, civ, c);
  const proj = opts.find((o) => o.kind === 'project'); if (proj) return proj;
  let best = null, bv = -1;
  const y = P.cityYields(g, c);
  for (const o of opts) {
    let v = -1;
    if (o.kind === 'building') { const B = BUILDINGS[o.key]; v = ((B.f || 0) * 1.0 + (B.p || 0) * 1.1 + (B.s || 0) * (0.6 + pers.sci) + (B.c || 0) * (0.5 + pers.cult) + (B.walls ? (wars ? 3 : 0.6) : 0)) * 30 / o.cost; }
    if (o.kind === 'wonder') { const others = cities.some((x) => x !== c && x.queue && x.queue.key === o.key); if (others) continue; v = (pers.wonder * 1.8 + 0.4) * (y.p >= 6 ? 1.2 : 0.6) * (o.key === 'terracotta' ? 0.5 + pers.aggr : 1); }
    v += P.rnd(g) * 0.2;
    if (v > bv) { bv = v; best = o; }
  }
  if (best && bv > 0.35) return best;
  return chooseMilitary(g, civ, c);
}

function targetCity(g, civ) {
  const wars = majorWars(g, civ); if (!wars.length) return null;
  const cap = P.capitalOf(g, civ.id); if (!cap) return null;
  let best = null, bd = 99;
  const pers = persOf(g, civ);
  for (const c of g.cities) if (wars.some((w) => w.id === c.owner)) { const d = P.dist(cap.tile, c.tile) + c.hp / 50 + P.cityStr(g, c) / 8 - (c.capital >= 0 && c.capital !== civ.id ? 1 + 3 * pers.aggr : 0); if (d < bd) { bd = d; best = c; } }
  if (civ.lastTarget && best && civ.lastTarget !== best.id) { const prev = g.cities.find((c) => c.id === civ.lastTarget && wars.some((w) => w.id === c.owner)); if (prev && prev.hp < 70) best = prev; } // finish what you started
  if (best) civ.lastTarget = best.id;
  return best;
}
function tryAttack(g, u, aggressive) {
  const ts = P.attackTargets(g, u); let best = null, bv = -1e9;
  for (const t of ts) {
    const p = P.predict(g, u, t); if (!p) continue;
    if (p.dies) continue;
    let v = p.toD - p.toA * 1.1 + (p.kill ? 50 : 0) + (p.capture ? 300 : 0);
    if (p.city && !UNITS[u.type].rs && !p.capture) v += (u.hp >= 70 && p.city.hp - p.toD <= 45) ? 30 : (p.toA > 25 && p.city.hp > 45 ? -40 : 0);
    if (!UNITS[u.type].rs && p.toA > u.hp * 0.6 && !p.kill) v -= 60;
    if (v > bv) { bv = v; best = t; }
  }
  if (best !== null && (bv > (aggressive ? -5 : 5) || UNITS[u.type].rs)) { P.attack(g, u, best); return true; }
  return false;
}
function adjacentFree(g, u, tile) { return P.NB[tile].filter((n) => P.passable(g, n) && (!P.unitAt(g, n) || P.unitAt(g, n) === u)).sort((a, b) => P.dist(a, u.tile) - P.dist(b, u.tile)); }

function moveMilitary(g, civ, u, ctx) {
  const DBG = typeof process !== 'undefined' && process.env.DBG; const why = (w) => { if (DBG) console.log('  ', u.type, u.tile, w, ctx.target && ctx.target.name, ctx.go); };
  if (tryAttack(g, u, !!ctx.target)) return why('attack');
  const myCities = g.cities.filter((c) => c.owner === civ.id);
  const inCity = P.cityAt(g, u.tile);
  // wounded: go home
  if (u.hp < 45 && !inCity) { why('wounded'); const home = myCities.slice().sort((a, b) => P.dist(a.tile, u.tile) - P.dist(b.tile, u.tile))[0]; if (home && !P.unitAt(g, home.tile)) { P.stepToward(g, u, home.tile); return; } u.fort = u.fort; return; }
  // garrison duty
  if (inCity && ctx.garrisons.has(inCity.id) && ctx.garrisons.get(inCity.id) === u.id) return why('garrison');
  ctx.resp = ctx.resp || new Map();
  const threatened = myCities.find((c) => { const nf = g.units.filter((e) => P.atWar(g, e.owner, civ.id) && !UNITS[e.type].civilian && !P.cityAt(g, e.tile) && (P.dist(e.tile, c.tile) <= 2 || (P.dist(e.tile, c.tile) <= 3 && g.owner[e.tile] === civ.id))).length; return nf && P.dist(c.tile, u.tile) <= 4 && (ctx.resp.get(c.id) || 0) < nf * 2; });
  if (threatened) { why('threat ' + threatened.name);
    ctx.resp.set(threatened.id, (ctx.resp.get(threatened.id) || 0) + 1);
    const foes = g.units.filter((e) => P.atWar(g, e.owner, civ.id) && !UNITS[e.type].civilian && !P.cityAt(g, e.tile) && P.dist(e.tile, threatened.tile) <= 3).sort((a, b) => P.dist(a.tile, u.tile) - P.dist(b.tile, u.tile));
    if (foes.length) { const adj = adjacentFree(g, u, foes[0].tile)[0]; if (adj !== undefined && adj !== u.tile) P.stepToward(g, u, adj); if (u.mp > 0) tryAttack(g, u, true); return; }
  }
  if (ctx.target && (!UNITS[u.type].rs || true)) {
    const t = ctx.target; const want = UNITS[u.type].rs ? 2 : 1;
    why('target'); if (!ctx.go) { // gather at a staging ring 3-4 tiles out
      if (P.dist(u.tile, t.tile) > 4) { const st = []; for (let i = 0; i < P.N; i++) { const d = P.dist(i, t.tile); const ow = g.owner[i]; if (d >= 3 && d <= 4 && P.passable(g, i) && !P.unitAt(g, i) && (ow < 0 || ow === civ.id || P.atWar(g, ow, civ.id))) st.push(i); } st.sort((a, b) => P.dist(a, u.tile) - P.dist(b, u.tile)); if (st.length) P.stepToward(g, u, st[0]); }
      else u.fort = true;
      return;
    }
    if (P.dist(u.tile, t.tile) > want) {
      const ring = P.RING2[t.tile].filter((n) => P.dist(n, t.tile) === want && P.passable(g, n) && !P.unitAt(g, n)).sort((a, b) => P.dist(a, u.tile) - P.dist(b, u.tile));
      let moved = false;
      if (ring.length) { const before = u.tile; P.stepToward(g, u, ring[0]); moved = u.tile !== before; }
      if (!moved && u.mp > 0) { // ring blocked: cut through the defenders standing around the city
        const foes = g.units.filter((e) => P.atWar(g, e.owner, civ.id) && !UNITS[e.type].civilian && P.dist(e.tile, t.tile) <= 2).sort((a, b) => P.dist(a.tile, u.tile) - P.dist(b.tile, u.tile));
        if (foes.length) { const adj = adjacentFree(g, u, foes[0].tile)[0]; if (adj !== undefined && adj !== u.tile) P.stepToward(g, u, adj); }
        else P.stepToward(g, u, t.tile);
      }
    }
    if (u.mp > 0) tryAttack(g, u, true);
    return;
  }
  // barbarian camps near home
  let camp = null, cd = 7;
  for (let i = 0; i < P.N; i++) if (g.camp[i] && myCities.some((c) => P.dist(c.tile, i) <= 6)) { const d = P.dist(i, u.tile); if (d < cd) { cd = d; camp = i; } }
  if (camp !== null && u.hp > 70 && UNITS[u.type].str >= 9) { const guard = P.unitAt(g, camp); if (!guard) P.stepToward(g, u, camp); else { const adj = adjacentFree(g, u, camp)[0]; if (adj !== undefined) P.stepToward(g, u, adj); if (u.mp > 0) tryAttack(g, u, false); } return; }
  // idle: drift to an ungarrisoned city or stay near cities
  const need = myCities.find((c) => !P.unitAt(g, c.tile) && !ctx.claimed.has(c.id));
  if (need && !inCity) { ctx.claimed.add(need.id); P.stepToward(g, u, need.tile); return; }
  if (!inCity) { const home = myCities.slice().sort((a, b) => P.dist(a.tile, u.tile) - P.dist(b.tile, u.tile))[0]; if (home && P.dist(home.tile, u.tile) > 2) { const spot = P.RING2[home.tile].filter((n) => P.dist(n, home.tile) === 1 && P.passable(g, n) && !P.unitAt(g, n))[0]; if (spot !== undefined) P.stepToward(g, u, spot); } }
}
function moveSettler(g, civ, u, taken) {
  const hasCity = g.cities.some((c) => c.owner === civ.id);
  if (!hasCity) {
    if (P.canFound(g, u) && (g.turn > 1 || P.siteScore(g, u.tile, civ.id) > 0)) { P.foundCity(g, u); return; }
    const r = [...P.reachable(g, u).keys()].filter((t) => P.siteScore(g, t, civ.id) > 0).sort((a, b) => P.siteScore(g, b, civ.id) - P.siteScore(g, a, civ.id));
    if (r.length) { P.moveUnit(g, u, r[0]); if (P.canFound(g, u)) P.foundCity(g, u); }
    return;
  }
  const sites = bestSites(g, civ, 8).filter((s) => !taken.has(s.i));
  if (!sites.length) {
    if (P.canFound(g, u)) { P.foundCity(g, u); return; }
    const spot = [...P.reachable(g, u).keys()].find((t) => { const o = u.tile; u.tile = t; const ok = P.canFound(g, u); u.tile = o; return ok; });
    if (spot !== undefined) { P.moveUnit(g, u, spot); if (P.canFound(g, u)) P.foundCity(g, u); return; }
    const home = g.cities.filter((c) => c.owner === civ.id).sort((a, b) => P.dist(a.tile, u.tile) - P.dist(b.tile, u.tile))[0]; // nowhere to go: join a city
    if (home) { home.pop++; g.units = g.units.filter((x) => x !== u); }
    return;
  }
  let goal = u.goal !== undefined && sites.some((s) => s.i === u.goal) ? u.goal : null;
  if (goal === null) { const byDist = sites.map((s) => ({ i: s.i, v: s.s - P.dist(s.i, u.tile) * 0.7 })).sort((a, b) => b.v - a.v); goal = byDist[0].i; u.goal = goal; }
  taken.add(goal);
  if (u.tile === goal) { P.foundCity(g, u); return; }
  // danger: enemy adjacent → step back toward capital
  P.stepToward(g, u, goal);
  if (u.tile === goal && P.canFound(g, u)) P.foundCity(g, u);
}

function takeTurn(g, civ) {
  diplomacy(g, civ);
  if (!civ.research) civ.research = pickResearch(g, civ);
  if (!civ.civic) civ.civic = pickCivic(g, civ);
  for (const c of g.cities.filter((x) => x.owner === civ.id)) {
    if (c.queue && c.queue.kind === 'unit' && c.queue.key !== 'settler' && P.rnd(g) < 0.5) c.queue = null; // re-evaluate military builds
    if (c.queue && c.queue.key === 'settler' && !bestSites(g, civ, 1).length) c.queue = null;
    if (!c.queue) { const ch = chooseProduction(g, civ, c); c.queue = ch ? { kind: ch.kind, key: ch.key } : null; }
  }
  const ctx = { target: targetCity(g, civ), garrisons: new Map(), claimed: new Set() };
  const foesNear = (c, r) => g.units.some((e) => P.atWar(g, e.owner, civ.id) && !UNITS[e.type].civilian && P.dist(e.tile, c.tile) <= r);
  for (const c of g.cities) if (c.owner === civ.id) { const u = P.unitAt(g, c.tile); if (!u || u.owner !== civ.id || UNITS[u.type].civilian) continue;
    // interior cities far from any foe lend their garrison to the field army (the capital always keeps one)
    if (ctx.target && c.capital !== civ.id && !foesNear(c, 5) && P.dist(c.tile, ctx.target.tile) <= 8) continue;
    ctx.garrisons.set(c.id, u.id); }
  const mine = g.units.filter((u) => u.owner === civ.id);
  if (ctx.target) { // muster: march together, not one at a time
    const gar = new Set(ctx.garrisons.values());
    const army = mine.filter((u) => !UNITS[u.type].civilian && !gar.has(u.id) && u.hp >= 45);
    const near = army.filter((u) => P.dist(u.tile, ctx.target.tile) <= 4);
    ctx.go = near.length >= 3 || (army.length >= 2 && near.length >= army.length * 0.6) || ctx.target.hp < 60;
    STATS.target++; if (ctx.go) STATS.go++; STATS.army += army.length; STATS.near += near.length;
  }
  const taken = new Set();
  mine.sort((a, b) => (UNITS[b.type].rs ? 1 : 0) - (UNITS[a.type].rs ? 1 : 0));
  for (const u of mine) {
    if (!g.units.includes(u)) continue;
    if (u.type === 'settler') moveSettler(g, civ, u, taken);
    else moveMilitary(g, civ, u, ctx);
  }
}
// human-side helpers that reuse AI brains
function autoExplore(g, u) {
  let best = null, bd = 99;
  if (g.ruin) for (let i = 0; i < P.N; i++) if (g.ruin[i] && (!g.seen || g.seen[i]) && !P.unitAt(g, i) && P.dist(i, u.tile) <= 6) { const d = P.dist(i, u.tile); if (d < bd) { bd = d; best = i; } } // explorers love ruins
  if (best !== null) return P.stepToward(g, u, best);
  for (let i = 0; i < P.N; i++) if (!g.seen[i] && P.passable(g, i)) { const d = P.dist(i, u.tile); if (d < bd) { bd = d; best = i; } }
  if (best === null) { u.auto = false; return false; }
  const adj = P.NB[best].concat([best]).filter((n) => P.passable(g, n) && !P.unitAt(g, n)).sort((a, b) => P.dist(a, u.tile) - P.dist(b, u.tile))[0];
  return P.stepToward(g, u, adj !== undefined ? adj : best);
}
const AI = { goal2, persOf, STATS, targetCity, takeTurn, pickResearch, pickCivic, chooseProduction, aiPickBoon, milStrength, acceptsPeace, bestSites, autoExplore, tryAttack };
if (typeof module !== 'undefined' && module.exports) module.exports = AI; else root.PE_AI = AI;
})(typeof globalThis !== 'undefined' ? globalThis : this);
