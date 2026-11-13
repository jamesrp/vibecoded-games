// POCKET EMPIRE — UI controller: input, panels, turn flow
(function (root) {
'use strict';
const P = root.PE, AI = root.PE_AI, R = root.PE_R, A = root.PE_AUDIO, D = root.PE_DATA;
const { UNITS, BUILDINGS, WONDERS, TECHS, CIVICS, LEADERS, BOONS, ASCENSIONS, PERS, EVENTS, ERAS, OMENS, DIFFICULTIES } = D;
const CONQ = 'hold two rival capitals, or half of all cities';
function gentle() { return g && g.diff === 'gentle'; }
const $ = (id) => document.getElementById(id);
const cv = $('map'), ctx = cv.getContext('2d');
const Q = new URLSearchParams(location.search);
const KEY = 'pocketempire.v1.';
const store = { get: (k, d) => { try { const v = localStorage.getItem(KEY + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(KEY + k, JSON.stringify(v)); } catch (e) { /* */ } } };
const ui = { g: null, sel: null, selCity: null, reach: null, targets: null, hover: -1, path: null, anim: new Map(), screen: 'title', reveal: Q.has('reveal'), modal: null };
let g = null;
function human() { return g.civs[g.humanId]; }
function fmt(n) { return Math.round(n); }
function resize() { cv.width = innerWidth; cv.height = innerHeight; R.layout(cv.width, cv.height); }
addEventListener('resize', resize);

// ---------- toasts & tips
function toast(text, color) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = text; if (color) d.style.borderColor = color; $('toasts').appendChild(d); setTimeout(() => d.remove(), 4500); while ($('toasts').children.length > 3) $('toasts').firstChild.remove(); }
function showModal(html, onclick) { const m = $('modal'); m.style.display = 'flex'; const nb = $('next'); if (nb) nb.style.display = 'none'; m.firstElementChild.innerHTML = html; ui.modal = onclick || true; m.onclick = (e) => { const t = e.target.closest('[data-act]'); if (t && onclick) onclick(t.dataset.act, t); }; }
// ask the AI brain for a suggestion without disturbing the seeded RNG
function peek(fn) { const rs = JSON.stringify(g.rs); try { return fn(); } finally { g.rs = JSON.parse(rs); } }
function hideModal() { $('modal').style.display = 'none'; ui.modal = null; if (ui.screen === 'play' && g && !g.over) updateNext(); }

// ---------- top bar
function topBar() {
  const c = human(); const t = $('top'); t.style.display = 'flex';
  const rc = c.research ? P.techCost(g, c, c.research) : 0, cc = c.civic ? P.civicCost(g, c, c.civic) : 0;
  const turnsLeft = g.maxTurns - g.turn + 1;
  t.innerHTML = `<span><span class="k">Turn</span> <b>${g.turn}</b>/${g.maxTurns}</span><span class="k" style="color:var(--gold)">${ERAS[c.era]}</span>
  <span class="pill" data-open="council" title="Research"><span style="color:#6ab8f0">⚗ ${fmt(c.sci)}</span> ${c.research ? TECHS[c.research].name : '<i style="color:#f0c24a">choose research</i>'} <span class="bar"><i style="width:${rc ? Math.min(100, 100 * c.sciStock / rc) : 0}%;background:#6ab8f0"></i></span></span>
  <span class="pill" data-open="council" title="Civics"><span style="color:#d48af0">✦ ${fmt(c.cult)}</span> ${c.civic ? CIVICS[c.civic].name : '<i style="color:#f0c24a">choose civic</i>'} <span class="bar"><i style="width:${cc ? Math.min(100, 100 * c.cultStock / cc) : 0}%;background:#d48af0"></i></span></span>
  <span class="pill" data-open="rivals" title="Rivals & score"><span class="k">Score</span> <b>${P.score(g, c)}</b></span>`;
  t.onclick = (e) => { const p = e.target.closest('[data-open]'); if (!p) return; if (p.dataset.open === 'council') openCouncil(); else openRivals(); };
  A.finale = turnsLeft <= 5;
  if (turnsLeft <= 5 && !ui.warnedEnd) { ui.warnedEnd = true; toast(`${turnsLeft} turns remain. The Chronicle closes at turn ${g.maxTurns}.`, '#e9c46a'); }
}
// ---------- selection panel
function selPanel() {
  const el = $('sel'); const u = ui.sel, c = ui.selCity;
  if (!u && !c) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  if (u) {
    const U = UNITS[u.type]; const mine = u.owner === g.humanId;
    let s = `<h3>${U.name}</h3><div class="sub">${g.civs[u.owner].name} · HP ${u.hp} · Moves ${u.mp}/${P.maxMp(g, u, g.civs[u.owner])}${U.str ? ` · Strength ${P.unitStr(g, u, false)}` : ''}${U.rs ? ` · Ranged ${P.unitStr(g, u, true)} (range ${U.range})` : ''}</div>`;
    s += `<div class="sub">${unitBlurb(u.type)}</div>`;
    if (mine) {
      if (u.type === 'settler') s += `<span class="btn" data-a="found">Found city<kbd>B</kbd></span>`;
      if (!U.civilian) s += `<span class="btn" data-a="fort">Fortify<kbd>F</kbd></span>`;
      s += `<span class="btn" data-a="skip">Skip<kbd>S</kbd></span>`;
      if (!U.civilian) s += `<span class="btn" data-a="explore">Explore<kbd>E</kbd></span>`;
      if (u.type === 'settler') { const sc = P.siteScore(g, u.tile, g.humanId); s += `<div class="sub" style="margin-top:6px">${P.canFound(g, u) ? `Site quality here: <b>${siteWord(sc)}</b>` : 'Cannot found here (too close to a city or foreign land). Gold ★ tiles are good spots.'}</div>`; }
    }
    el.innerHTML = s;
  } else {
    const civ = g.civs[c.owner]; const y = P.cityYields(g, c); const mine = c.owner === g.humanId;
    let s = `<h3>${c.capital === c.owner ? '★ ' : ''}${c.name} <span style="font-size:13px;color:var(--dim)">size ${c.pop}</span></h3>`;
    s += `<div class="sub"><span style="color:#8fd86a">● ${fmt(y.surplus >= 0 ? '+' + fmt(y.surplus) : fmt(y.surplus))} food</span> (grows in ${y.surplus > 0 ? Math.ceil((P.growCost(c) - c.food) / y.surplus) : '—'}) · <span style="color:#e0a35a">● ${fmt(y.p)} prod</span> · <span style="color:#6ab8f0">● ${fmt(y.s)}</span> · <span style="color:#d48af0">● ${fmt(y.c)}</span> · HP ${c.hp}/${P.cityMaxHp(g, c)} · Str ${P.cityStr(g, c)}</div>`;
    if (c.buildings.length || c.wonders.length) s += `<div class="sub">${c.buildings.filter((b) => BUILDINGS[b]).map((b) => BUILDINGS[b].name).concat(c.wonders.map((w) => '✧ ' + WONDERS[w].name)).join(' · ')}</div>`;
    if (mine) {
      const opts = P.buildOptions(g, c);
      s += `<div class="sub" style="margin-top:6px;color:var(--ink)">${c.queue ? `Building <b>${P.itemName(c.queue)}</b> — ${fmt(c.prod)}/${P.itemCost(g, civ, c.queue)}, ${turnsFor(c, c.queue)} turns` : '<b style="color:#f0c24a">Choose what to build:</b>'}</div><div class="opts">`;
      const sug = !c.queue && peek(() => AI.chooseProduction(g, civ, c));
      for (const o of opts) s += `<div class="opt ${c.queue && c.queue.key === o.key ? 'cur' : ''}" data-b="${o.kind}:${o.key}"><span class="t">${turnsFor(c, o)}t</span>${sug && sug.key === o.key ? '★ ' : ''}${P.itemName(o)}<span class="x">${itemBlurb(o)}</span></div>`;
      s += '</div>';
      el.style.width = '440px';
    } else el.style.width = '300px';
    el.innerHTML = s;
  }
  if (u) el.style.width = '300px';
  el.onclick = (e) => {
    const a = e.target.closest('[data-a]'); if (a) { order(a.dataset.a); return; }
    const b = e.target.closest('[data-b]'); if (b && ui.selCity) { const [kind, key] = b.dataset.b.split(':'); if (!ui.selCity.queue || ui.selCity.queue.key !== key) { ui.selCity.queue = { kind, key }; } A.play('click'); const cc = ui.selCity; refresh(); if (!g.cities.some((x) => x.owner === g.humanId && !x.queue)) { /* stay */ } ui.selCity = cc; selPanel(); updateNext(); }
  };
}
function siteWord(s) { return s > 30 ? 'excellent' : s > 24 ? 'good' : s > 17 ? 'fair' : 'poor'; }
function turnsFor(c, it) { const civ = g.civs[c.owner]; let p = P.cityYields(g, c).p; if (it.kind === 'building' || it.kind === 'wonder') p *= 1 + (civ.perk.buildPct || 0) / 100; if (it.kind === 'wonder') p *= 1 + P.eff(civ, 'wonderPct') / 100; const have = c.queue && c.queue.key === it.key ? c.prod : c.prod; return Math.max(1, Math.ceil((P.itemCost(g, civ, it) - have) / Math.max(0.5, p))); }
function unitBlurb(k) { const U = UNITS[k]; return { settler: 'Founds a new city. Costs 1 population.', warrior: 'Cheap early melee.', archer: 'Ranged: attacks 2 tiles away without taking damage.', spearman: `Anti-cavalry: +${U.vsMounted} vs mounted.`, horseman: 'Fast raider (4 moves).', swordsman: 'Strong melee infantry.', catapult: `Siege: +${U.siege} vs cities.`, crossbow: 'Strong ranged unit.', knight: 'Heavy cavalry, 4 moves.', pikeman: `Anti-cavalry: +${U.vsMounted} vs mounted.`, musketeer: 'Gunpowder infantry.', cannon: `Siege: +${U.siege} vs cities.` }[k] || ''; }
function itemBlurb(o) {
  if (o.kind === 'unit') { const U = UNITS[o.key]; return U.civilian ? 'found a new city' : `${U.rs ? 'ranged ' + U.rs : 'str ' + U.str} · ${U.mp} moves`; }
  if (o.kind === 'building') { const B = BUILDINGS[o.key]; return B.walls ? '+80 HP, +8 strength' : ['f', 'p', 's', 'c'].filter((k) => B[k]).map((k) => `+${B[k]} ${{ f: 'food', p: 'prod', s: 'science', c: 'culture' }[k]}`).join(', '); }
  if (o.kind === 'wonder') return '✧ wonder: ' + WONDERS[o.key].desc;
  return 'launch it to win by Science';
}
// ---------- council (research + civics)
function openCouncil(auto) {
  if (auto && typeof auto !== 'boolean') auto = false;
  if (gentle() && !ui.fullCouncil) return openSimpleCouncil();
  const c = human(); const sugT = !c.research && peek(() => AI.pickResearch(g, c)), sugC = !c.civic && peek(() => AI.pickCivic(g, c));
  let s = `<h2>The Council</h2><p>Pick a research and a civic. Science victory: research <b>Navigation</b>, then build the <b>Starward Expedition</b>. Culture victory: adopt <b>Magnum Opus</b> while owning 2 wonders. <span style="color:var(--gold)">★ = a good pick if unsure.</span></p><div class="tree">`;
  for (let e = 0; e < 4; e++) {
    s += `<div class="era"><h5>${ERAS[e]}</h5>`;
    for (const [k, T] of Object.entries(TECHS)) if (T.era === e) {
      const have = c.techs.includes(k), av = P.availTechs(c).includes(k);
      const unl = [...Object.keys(UNITS).filter((u) => UNITS[u].tech === k && !UNITS[u].civic).map((u) => UNITS[u].name), ...Object.keys(BUILDINGS).filter((b) => BUILDINGS[b].tech === k).map((b) => BUILDINGS[b].name), ...Object.keys(WONDERS).filter((w) => WONDERS[w].tech === k).map((w) => '✧' + WONDERS[w].name), ...(k === 'navigation' ? ['Starward Expedition'] : []), ...(k === 'printing' ? ['Libraries +2 science'] : [])];
      const turns = av ? Math.max(1, Math.ceil((P.techCost(g, c, k) - (c.research === k ? c.sciStock : c.sciStock)) / Math.max(1, c.sci))) : '';
      s += `<div class="node ${have ? 'have' : av ? 'avail' : 'lock'} ${c.research === k ? 'cur' : ''}" data-act="${av ? 't:' + k : ''}"><b>${sugT === k ? '★ ' : ''}${T.name}</b>${av ? ` <span style="float:right;color:var(--gold)">${turns}t</span>` : ''}<div class="u">${unl.join(', ') || '—'}</div></div>`;
    }
    s += '</div>';
  }
  s += `</div><h2 style="margin-top:14px;font-size:18px">Civics</h2><div class="tree" style="grid-template-columns:repeat(3,1fr)">`;
  const cols = [['codeOfLaws', 'craftsmanship', 'mysticism'], ['militaryTradition', 'drama', 'feudalism', 'civilService'], ['humanism', 'magnumOpus']];
  for (const col of cols) { s += '<div>'; for (const k of col) { const C = CIVICS[k]; const have = c.civics.includes(k), av = P.availCivics(c).includes(k); const turns = av ? Math.max(1, Math.ceil((P.civicCost(g, c, k) - c.cultStock) / Math.max(1, c.cult))) : ''; s += `<div class="node ${have ? 'have' : av ? 'avail' : 'lock'} ${c.civic === k ? 'cur' : ''}" data-act="${av ? 'c:' + k : ''}"><b>${sugC === k ? '★ ' : ''}${C.name}</b>${av ? ` <span style="float:right;color:var(--gold)">${turns}t</span>` : ''}<div class="u">${C.desc}</div></div>`; } s += '</div>'; }
  s += `</div><div style="text-align:right;margin-top:10px"><span class="btn" data-act="close">Done<kbd>Esc</kbd></span></div>`;
  showModal(s, (act) => { if (act === 'close') { hideModal(); refresh(); return; } const [t, k] = act.split(':'); if (t === 't') c.research = k; if (t === 'c') c.civic = k; A.play('click'); const done = (c.research || !P.availTechs(c).length) && (c.civic || !P.availCivics(c).length); if (auto && done) { hideModal(); refresh(); } else openCouncil(auto); });
}
function openRivals() {
  let s = `<h2>Rivals</h2><p>Victory: Conquest (${CONQ}) · Science · Culture · or the best score when the Chronicle closes on turn ${g.maxTurns}.</p><p>Omen of this island: <b style="color:var(--gold)">${OMENS[g.omen].name}</b> — ${OMENS[g.omen].desc}</p><table class="sc"><tr><th></th><th>Leader</th><th>Temper</th><th>Cities</th><th>Techs</th><th>Civics</th><th>Wonders</th><th>Score</th><th></th></tr>`;
  for (const c of g.civs.filter((x) => !x.barb)) {
    const known = c.id === g.humanId || human().met[c.id];
    const cs = g.cities.filter((x) => x.owner === c.id);
    s += `<tr><td><span style="display:inline-block;width:12px;height:12px;border-radius:6px;background:${c.color}"></span></td><td>${known ? c.lname + ' of ' + c.name : '<i>unmet</i>'}${c.alive ? '' : ' (fallen)'}</td><td>${known ? PERS[c.pers].name + (c.human || !AI.goal2 ? '' : `<small style="opacity:.7"> · leaning ${PERS[peek(() => AI.goal2(g, c))].name}</small>`) : '?'}</td><td>${known ? cs.length : '?'}</td><td>${known ? c.techs.length : '?'}</td><td>${known ? c.civics.length : '?'}</td><td>${known ? cs.reduce((a, x) => a + x.wonders.length, 0) : '?'}</td><td>${known ? P.score(g, c) : '?'}</td><td>${c.id !== g.humanId && known && c.alive ? (P.atWar(g, g.humanId, c.id) ? `<span class="btn" data-act="peace:${c.id}">Propose peace</span>` : `<span class="btn" data-act="war:${c.id}">Declare war</span>`) : ''}</td></tr>`;
  }
  s += `</table><p>Your boons: ${human().boons.map((b) => BOONS[b].name).join(', ') || 'none yet'} · Leader perk: ${LEADERS[human().leader].desc}</p><div style="text-align:right"><span class="btn" data-act="close">Close<kbd>Esc</kbd></span></div>`;
  showModal(s, (act) => {
    if (act === 'close') { hideModal(); return; }
    const [k, id] = act.split(':');
    if (k === 'war') { P.declareWar(g, g.humanId, +id); A.play('war'); flushEvents(); openRivals(); }
    if (k === 'peace') { if (AI.acceptsPeace(g, g.civs[+id], g.humanId)) { P.makePeace(g, g.humanId, +id); toast(`${g.civs[+id].lname} accepts peace.`); } else toast(`${g.civs[+id].lname} refuses. ("Not while we are winning.")`, '#e5484d'); flushEvents(); openRivals(); }
  });
}
// ---------- drafts, events, peace
function openBoonDraft() {
  const d = g.pendingDraft; const c = human();
  const ch = d.kind === 'charter';
  let s = ch ? `<h2>Founding Charter</h2><p>Every empire begins with a promise. Choose one. Each has a price, and it lasts the whole reign.</p><div class="cards">` : `<h2>A New Era: ${ERAS[c.era]}</h2><p>Your people look to you. Choose one boon for the rest of this reign.</p><div class="cards">`;
  const sug = peek(() => AI.aiPickBoon(g, c, d.options));
  for (const b of d.options) s += `<div class="card" data-act="${b}"><div class="tag">${b === sug ? '★ ' : ''}${ch ? 'Charter' : BOONS[b].bold ? 'Bold boon' : 'Era boon'}</div><h4>${BOONS[b].name}</h4><div class="d">${BOONS[b].desc}</div>${BOONS[b].cost ? `<div class="d" style="color:#f08a7a">Price: ${BOONS[b].cost}</div>` : ''}</div>`;
  showModal(s + '</div>', (act) => { P.addBoon(g, c, act); g.pendingDraft = null; A.play('tech'); hideModal(); toast(`${ch ? 'Charter' : 'Boon'}: ${BOONS[act].name}`, '#e9c46a'); refresh(); });
}
function openEvent() {
  const e = EVENTS.find((x) => x.id === g.pendingEvent);
  showModal(`<h2>${e.title}</h2><p style="color:var(--ink);font-size:15px">${e.text}</p><div class="cards"><div class="card" data-act="a"><div class="d">${e.a.label}</div></div><div class="card" data-act="b"><div class="d">${e.b.label}</div></div></div>`, (act) => { P.resolveEvent(g, act); A.play('click'); hideModal(); flushEvents(); refresh(); });
}
function openPeaceOffer() {
  const o = g.civs[g.peaceOffer.from];
  showModal(`<h2>Envoy from ${o.name}</h2><p style="color:var(--ink)">${o.lname} offers peace. Ten turns of truce would follow.</p><div class="cards"><div class="card" data-act="y"><h4>Accept</h4><div class="d">End the war.</div></div><div class="card" data-act="n"><h4>Refuse</h4><div class="d">Fight on.</div></div></div>`, (act) => { if (act === 'y') P.makePeace(g, o.id, g.humanId); g.peaceOffer = null; hideModal(); flushEvents(); refresh(); });
}
// ---------- turn flow
function pendingUnits() { return g.units.filter((u) => u.owner === g.humanId && u.mp > 0 && !u.fort && !u.sleep && !u.auto && !u.acted); }
// Gentle mode: the Council as a few big cards, with the suggestion first
function techUnlocks(k) { return [...Object.keys(UNITS).filter((u) => UNITS[u].tech === k && !UNITS[u].civic).map((u) => UNITS[u].name), ...Object.keys(BUILDINGS).filter((b) => BUILDINGS[b].tech === k).map((b) => BUILDINGS[b].name), ...Object.keys(WONDERS).filter((w) => WONDERS[w].tech === k).map((w) => '✧' + WONDERS[w].name), ...(k === 'navigation' ? ['Starward Expedition'] : [])]; }
function openSimpleCouncil() {
  const c = human(); const sT = peek(() => AI.pickResearch(g, c)), sC = peek(() => AI.pickCivic(g, c));
  const ts = P.availTechs(c).sort((a, b) => (b === sT) - (a === sT)).slice(0, 3), cs = P.availCivics(c).sort((a, b) => (b === sC) - (a === sC)).slice(0, 3);
  let s = `<h2>The Council</h2><p>What should your wise people study next? <span style="color:var(--gold)">★ is a good pick.</span></p><div class="cards">`;
  for (const k of ts) s += `<div class="card ${c.research === k ? 'sel' : ''}" data-act="t:${k}"><div class="tag">${k === sT ? '★ ' : ''}Research · ${Math.max(1, Math.ceil((P.techCost(g, c, k) - c.sciStock) / Math.max(1, c.sci)))} turns</div><h4>${TECHS[k].name}</h4><div class="d">${techUnlocks(k).join(', ') || 'Leads to new ideas'}</div></div>`;
  s += `</div><div class="cards" style="margin-top:10px">`;
  for (const k of cs) s += `<div class="card ${c.civic === k ? 'sel' : ''}" data-act="c:${k}"><div class="tag">${k === sC ? '★ ' : ''}Civic · ${Math.max(1, Math.ceil((P.civicCost(g, c, k) - c.cultStock) / Math.max(1, c.cult)))} turns</div><h4>${CIVICS[k].name}</h4><div class="d">${CIVICS[k].desc}</div></div>`;
  s += `</div><div style="text-align:right;margin-top:10px"><span class="btn" data-act="full">Show the whole tree</span><span class="btn" data-act="close">Done<kbd>Esc</kbd></span></div>`;
  showModal(s, (act) => { if (act === 'close') { hideModal(); refresh(); return; } if (act === 'full') { ui.fullCouncil = true; openCouncil(); ui.fullCouncil = false; return; } const [t, k] = act.split(':'); if (t === 't') c.research = k; if (t === 'c') c.civic = k; A.play('click'); openSimpleCouncil(); });
}
function eraCard(era) { const el = $('era'); el.querySelector('.t').textContent = ERAS[era].toUpperCase(); el.querySelector('.s').textContent = 'A new age dawns'; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); A.play('wonder'); }
function nextStep() {
  const c = human();
  if (g.over) return { label: 'RESULTS', act: () => endScreen() };
  if (g.pendingDraft) return { label: g.pendingDraft.kind === 'charter' ? 'FOUNDING CHARTER' : 'CHOOSE A BOON', act: openBoonDraft };
  if (g.pendingEvent) return { label: 'AN EVENT', act: openEvent };
  if (g.peaceOffer) return { label: 'ENVOY', act: openPeaceOffer };
  if (gentle() && !c.research && P.availTechs(c).length) { c.research = peek(() => AI.pickResearch(g, c)); toast(`The Council begins studying ${TECHS[c.research].name}. (T to change)`, '#6ab8f0'); }
  if (gentle() && !c.civic && P.availCivics(c).length && g.cities.some((x) => x.owner === c.id)) { c.civic = peek(() => AI.pickCivic(g, c)); toast(`The Council takes up ${CIVICS[c.civic].name}. (T to change)`, '#d48af0'); }
  if (!c.research && P.availTechs(c).length) return { label: 'CHOOSE RESEARCH', act: () => openCouncil(true) };
  if (!c.civic && P.availCivics(c).length && g.cities.some((x) => x.owner === c.id)) return { label: 'CHOOSE CIVIC', act: () => openCouncil(true) };
  const city = g.cities.find((x) => x.owner === c.id && !x.queue); if (city) return { label: 'CHOOSE PRODUCTION', sub: city.name, act: () => selectCity(city) };
  const u = pendingUnits().sort((a, b) => (ui.sel === a ? -1 : 0) || (b.type === 'settler') - (a.type === 'settler'))[0];
  if (u) return { label: 'NEXT UNIT', sub: `${UNITS[u.type].name} needs orders`, act: () => selectUnit(u) };
  return { label: 'END TURN', sub: `Turn ${g.turn} → ${g.turn + 1}`, act: doEndTurn };
}
function updateNext() { const b = $('next'); if ($('modal').style.display === 'flex') { b.style.display = 'none'; return; } const n = nextStep(); b.style.display = 'block'; b.innerHTML = n.label + (n.sub ? `<small>${n.sub}</small>` : '<small>Space / Enter</small>'); b.onclick = () => { A.init(); n.act(); }; }
function doEndTurn() {
  deselect();
  for (const u of g.units.filter((x) => x.owner === g.humanId && x.auto)) AI.autoExplore(g, u);
  const prevEra = human().era;
  P.endTurn(g); A.play('turn');
  flushEvents();
  // auto explorers and wake fortified units if enemies adjacent
  for (const u of g.units.filter((x) => x.owner === g.humanId)) if ((u.fort || u.sleep || u.auto) && P.NB[u.tile].some((n) => { const o = P.unitAt(g, n); return o && P.atWar(g, o.owner, g.humanId) && !UNITS[o.type].civilian; })) { u.fort = 0; u.sleep = false; u.auto = false; }
  for (const u of g.units.filter((x) => x.owner === g.humanId)) if (u.sleep) u.sleep = false;
  if (human().era !== prevEra) { A.setEra(human().era); eraCard(human().era); }
  A.tension = P.civsAtWarWithHuman ? 0 : (g.civs.some((c) => !c.barb && c.id !== g.humanId && P.atWar(g, c.id, g.humanId)) ? 1 : 0);
  save();
  refresh();
  if (g.over) setTimeout(endScreen, 700);
}
function flushEvents() {
  const vis = (t) => ui.reveal || g.vis[t];
  R.consume(g, g.events, vis);
  for (const e of g.events) try { eventToast(e); } catch (err) { console.error("event", JSON.stringify(e), err.message); }
  g.events.length = 0;
}
function eventToast(e) { const vis = (t) => ui.reveal || g.vis[t]; {
    if (e.kind === 'combat' && (vis(e.from) || vis(e.to))) A.play(e.ranged ? 'ranged' : 'melee');
    if (e.kind === 'war' && (e.a === g.humanId || e.b === g.humanId)) { toast(e.text, '#e5484d'); A.play('war'); }
    else if (e.kind === 'war' && (human().met[e.a] || human().met[e.b])) toast(e.text);
    if (e.kind === 'peace' || e.kind === 'meet' || e.kind === 'camp' || e.kind === 'event' || e.kind === 'lostwonder' && e.civ === g.humanId || e.kind === 'fall' || e.kind === 'sack') toast(e.text);
    if (e.kind === 'wonder') { toast(e.text, '#e9c46a'); if (e.civ === g.humanId) A.play('wonder'); }
    if (e.kind === 'conquer' && (e.by === g.humanId || e.from === g.humanId || human().met[e.by])) { toast(e.text, e.by === g.humanId ? '#7ddc6a' : '#e5484d'); A.play(e.by === g.humanId ? 'found' : 'bad'); }
    if (e.kind === 'found' && e.civ === g.humanId) A.play('found');
    if (e.kind === 'tech' && e.civ === g.humanId) { toast(`Researched ${TECHS[e.key].name}.`, '#6ab8f0'); A.play('tech'); }
    if (e.kind === 'civic' && e.civ === g.humanId) { toast(`Adopted ${CIVICS[e.key].name}.`, '#d48af0'); A.play('tech'); }
    if (e.kind === 'built' && e.civ === g.humanId && e.item.kind !== 'wonder') toast(`${g.cities.find((c) => c.id === e.city).name} built ${P.itemName(e.item)}.`);
    if (e.kind === 'project') toast(e.text, '#e9c46a');
    if (e.kind === 'ruin' && (e.civ === g.humanId || vis(e.tile))) { toast(e.text, '#e9c46a'); if (e.civ === g.humanId) A.play('tech'); }
  }
}
function refresh() { if (!g) return; topBar(); selPanel(); updateNext(); }
// ---------- selection & orders
function deselect() { ui.sites = null; ui.sel = null; ui.selCity = null; ui.reach = null; ui.targets = null; ui.path = null; selPanel(); }
function selectUnit(u) { ui.selCity = null; ui.sel = u; ui.sites = null; if (u.owner === g.humanId) { ui.reach = P.reachable(g, u); ui.targets = P.attackTargets(g, u); if (u.type === 'settler' && g.cities.some((c) => c.owner === g.humanId)) ui.sites = peek(() => AI.bestSites(g, human(), 3)).filter((x) => g.seen[x.i]).map((x) => x.i); } else { ui.reach = null; ui.targets = null; } selPanel(); updateNext(); }
function selectCity(c) { ui.sel = null; ui.reach = null; ui.targets = null; ui.selCity = c; selPanel(); updateNext(); }
function order(a) {
  const u = ui.sel; if (!u || u.owner !== g.humanId) return;
  if (a === 'found') { if (P.canFound(g, u)) { const c = P.foundCity(g, u); P.updateVision(g); flushEvents(); A.play('found'); deselect(); if (c) selectCity(c); refresh(); } else { toast('A city cannot be founded here.', '#e5484d'); A.play('bad'); } return; }
  if (a === 'fort') { u.fort = 1; u.acted = false; u.mp = 0; }
  if (a === 'skip') { u.sleep = true; }
  if (a === 'explore') { u.auto = true; const moved = AI.autoExplore(g, u); if (!moved && !u.auto) { u.fort = 1; u.mp = 0; toast('Nothing left to explore here, so it stands guard.'); } flushEvents(); }
  A.play('click'); deselect(); refresh(); autoAdvance();
}
function autoAdvance() { const n = nextStep(); if (n.label === 'NEXT UNIT') n.act(); }
function clickTile(t) {
  if (t < 0) { deselect(); refresh(); return; }
  const u = ui.sel;
  if (u && u.owner === g.humanId) {
    if (ui.targets && ui.targets.includes(t)) { doAttack(u, t); return; }
    const other = P.unitAt(g, t) || P.cityAt(g, t);
    const tgOwner = other ? other.owner : -1;
    if (other && tgOwner !== g.humanId && !P.atWar(g, g.humanId, tgOwner) && P.dist(u.tile, t) <= (UNITS[u.type].rs ? UNITS[u.type].range : 1) && !UNITS[u.type].civilian && u.mp > 0) {
      const o = g.civs[tgOwner]; showModal(`<h2>Declare war on ${o.name}?</h2><p>${o.lname} (${PERS[o.pers].name}) will remember this.</p><div class="cards"><div class="card" data-act="y"><h4>War</h4></div><div class="card" data-act="n"><h4>Not yet</h4></div></div>`, (act) => { hideModal(); if (act === 'y') { P.declareWar(g, g.humanId, tgOwner); A.play('war'); flushEvents(); selectUnit(u); doAttack(u, t); } }); return; }
    if (ui.reach && ui.reach.has(t)) { const from = u.tile; P.moveUnit(g, u, t); ui.anim.set(u.id, { from, t0: performance.now() }); A.play('move'); flushEvents(); if (u.mp > 0) selectUnit(u); else { deselect(); autoAdvance(); } refresh(); return; }
    if (!P.unitAt(g, t) && !P.cityAt(g, t) && P.passable(g, t) && u.mp > 0) { // multi-turn: step along path
      const from = u.tile; if (P.stepToward(g, u, t)) { ui.anim.set(u.id, { from, t0: performance.now() }); A.play('move'); flushEvents(); deselect(); autoAdvance(); refresh(); return; } }
  }
  const un = P.unitAt(g, t), ci = P.cityAt(g, t);
  if (un && (ui.reveal || g.vis[t]) && !(ci && ci.owner === g.humanId && ui.sel === un)) { selectUnit(un); A.play('click'); refresh(); return; }
  if (ci && (ui.reveal || g.seen[t])) { selectCity(ci); A.play('click'); refresh(); return; }
  deselect(); refresh();
}
function doAttack(u, t) {
  const pr = P.attack(g, u, t); if (!pr) return;
  flushEvents(); g.stats.kills = human().kills;
  if (g.units.includes(u) && u.mp > 0) selectUnit(u); else { deselect(); }
  P.checkVictory(g); refresh(); if (g.over) setTimeout(endScreen, 900);
}
function tipFor(t) {
  if (t < 0 || !(ui.reveal || g.seen[t])) return null;
  const u = ui.sel;
  if (u && ui.targets && ui.targets.includes(t)) {
    const p = P.predict(g, u, t); if (!p) return null;
    const tname = p.city ? p.city.name : UNITS[p.unit.type].name; const thp = p.city ? p.city.hp : p.unit.hp;
    return `<b>Attack ${tname}</b><br>Your ${p.a} vs their ${p.d}<br>They take <b style="color:#ff8a70">${p.toD}</b> (${thp} → ${Math.max(0, thp - p.toD)} HP)${p.toA ? `<br>You take <b style="color:#ffb070">${p.toA}</b> (${u.hp} → ${Math.max(0, u.hp - p.toA)} HP)` : '<br>No return damage (ranged)'}${p.capture ? '<br><b style="color:#7ddc6a">Captures the city!</b>' : p.kill ? '<br><b style="color:#7ddc6a">Destroys it</b>' : ''}${p.dies ? '<br><b style="color:#ee5544">Your unit dies!</b>' : ''}`;
  }
  const T = D.TER[g.ter[t]]; const y = P.tileYield(g, t, human());
  let s = `<b>${g.forest[t] ? 'Forest' : ''}${g.forest[t] && g.ter[t] !== 'grass' && g.ter[t] !== 'plains' ? ' ' + T.name : g.forest[t] ? '' : T.name}</b>${g.res[t] ? ' · ' + D.RES[g.res[t]].name : ''}${g.camp[t] ? ' · <b style="color:#f08a4a">Barbarian camp</b>' : ''}<br>`;
  if (T.block) s += 'Impassable'; else s += `<span style="color:#8fd86a">${y.f} food</span> · <span style="color:#e0a35a">${y.p} prod</span>${y.s ? ` · <span style="color:#6ab8f0">${y.s} sci</span>` : ''}${y.c ? ` · <span style="color:#d48af0">${y.c} cult</span>` : ''}${T.def || g.forest[t] ? ' · +3 defense' : ''}${!T.water && P.moveCost(g, t) > 1 ? ' · 2 moves' : ''}`;
  if (g.owner[t] >= 0) s += `<br><span style="color:${g.civs[g.owner[t]].color}">${g.civs[g.owner[t]].name}</span>`;
  const un = P.unitAt(g, t); if (un && (ui.reveal || g.vis[t])) s += `<br>${g.civs[un.owner].name} ${UNITS[un.type].name} · HP ${un.hp}`;
  return s;
}
cv.addEventListener('mousemove', (e) => {
  if (!g || ui.screen !== 'play') return; ui.hover = R.pickTile(e.clientX, e.clientY);
  ui.path = null;
  if (ui.sel && ui.sel.owner === g.humanId && ui.hover >= 0 && ui.reach && !ui.reach.has(ui.hover) && !(ui.targets && ui.targets.includes(ui.hover)) && P.passable(g, ui.hover) && ui.hover !== ui.sel.tile) { const p = P.findPath(g, ui.sel, ui.hover); if (p && p.length < 16) ui.path = p; }
  const tip = $('tip'); const html = tipFor(ui.hover);
  if (html && !ui.modal) { tip.style.display = 'block'; tip.innerHTML = html; tip.style.left = Math.min(innerWidth - 270, e.clientX + 16) + 'px'; tip.style.top = Math.min(innerHeight - 120, e.clientY + 16) + 'px'; } else tip.style.display = 'none';
});
cv.addEventListener('mouseleave', () => { $('tip').style.display = 'none'; ui.hover = -1; });
cv.addEventListener('click', (e) => { A.init(); if (!g || ui.screen !== 'play' || ui.modal) return; clickTile(R.pickTile(e.clientX, e.clientY)); });
cv.addEventListener('contextmenu', (e) => { e.preventDefault(); deselect(); refresh(); });
addEventListener('keydown', (e) => {
  A.init();
  if (e.code === 'KeyM') { const on = A.toggle(); toast(on ? 'Music on' : 'Music muted'); return; }
  if (ui.screen !== 'play') return;
  if (e.code === 'Escape') { if (!ui.modal && dismissCoach(false)) return; if (ui.modal && !g.pendingDraft && !g.pendingEvent && !g.peaceOffer) { hideModal(); refresh(); } else deselect(); return; }
  if (ui.modal) return;
  if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); nextStep().act(); return; }
  if (e.code === 'KeyB') order('found'); if (e.code === 'KeyF') order('fort'); if (e.code === 'KeyS') order('skip'); if (e.code === 'KeyE') order('explore');
  if (e.code === 'KeyT') openCouncil(); if (e.code === 'KeyR') openRivals();
});
$('help').onclick = () => { if (ui.screen !== 'play') return; showModal(`<h2>How to play</h2><p style="color:var(--ink)">You have ${g ? g.maxTurns : 40} turns to build the greatest empire on the island.</p>
<p><b>Space / Enter</b> — NEXT: walks you through every decision (boons, events, research, production, units), then ends the turn.<br><b>Click</b> a unit, then a lit tile to move or a red-ringed tile to attack. Hover a target to see the exact result: combat has no dice.<br><b>B</b> found city · <b>F</b> fortify · <b>S</b> skip · <b>E</b> explore · <b>T</b> council · <b>R</b> rivals · <b>M</b> music · right-click deselect.</p>
<p>Cities work their best tiles on their own. Borders grow at size 3. Units in forest or hills get +3 defense; fortified units +3.<br>Win by <b>Conquest</b> (${CONQ}), <b>Science</b> (Navigation → Starward Expedition), <b>Culture</b> (Magnum Opus + 2 wonders), or have the best <b>score</b> at the end.</p>${g ? `<p>Omen: <b style="color:var(--gold)">${OMENS[g.omen].name}</b> — ${OMENS[g.omen].desc}${gentle() ? '<br><b>Gentle</b>: rivals stay peaceful for the first ' + DIFFICULTIES.gentle.peaceTurn + ' turns, barbarians leave your cities alone, and the Council picks research for you (press T to change it).' : ''}</p>` : ''}<div style="text-align:right">${store.get('reigns', 0) < 2 ? '<span class="btn" data-act="tips">Show beginner tips again</span> ' : ''}<span class="btn" data-act="x">Got it</span></div>`, (act) => { if (act === 'tips') { resetCoach(); toast('Beginner tips are back on.'); } hideModal(); }); };
// ---------- save
function save() { try { store.set('save', g); } catch (e) { /* */ } }
// ---------- title & end
function titleScreen() {
  ui.screen = 'title'; $('top').style.display = 'none'; $('next').style.display = 'none'; $('sel').style.display = 'none';
  const maxAsc = store.get('ascUnlocked', 0); ui.asc = Math.min(ui.asc === undefined ? store.get('ascLast', 0) : ui.asc, maxAsc);
  const seed = ui.seed || (+Q.get('seed') || (Date.now() % 1e9));
  ui.seed = seed;
  ui.diff = ui.diff || store.get('diff', 'standard');
  g = P.newGame({ seed, asc: ui.asc, diff: ui.diff }); ui.g = g; ui.reveal = true; // background preview
  const tmp = { g: P.newGame({ seed: seed + 1 }) }; const pool = P.shuffle(tmp.g, Object.keys(LEADERS)).slice(0, ui.asc >= 6 ? 2 : 3);
  ui.offer = pool;
  const saved = store.get('save', null);
  let s = `<div style="text-align:center"><p class="big">POCKET EMPIRE</p><p style="color:var(--ink);font-size:15px;margin-top:2px">A whole empire in forty turns. Choose who leads it.</p><p style="color:#8a8170;font-size:11px">v${D.VERSION}</p></div><div class="cards" style="margin-top:12px">`;
  for (const k of pool) { const L = LEADERS[k]; s += `<div class="card" data-act="L:${k}"><div class="tag">${PERS[L.pers].name} · ${L.civ}</div><h4>${L.name}</h4><div class="d">${L.desc}</div></div>`; }
  s += `</div><div style="text-align:center"><span class="omen" title="${OMENS[g.omen].desc}">Omen of this island: <b style="color:var(--gold)">${OMENS[g.omen].name}</b> — ${OMENS[g.omen].desc}</span></div>
  <div style="text-align:center;margin-top:10px"><span class="seg"><span data-act="diff:gentle" class="${ui.diff === 'gentle' ? 'on' : ''}">Gentle (for young rulers)</span><span data-act="diff:standard" class="${ui.diff === 'standard' ? 'on' : ''}">Standard</span></span></div>
  <div style="text-align:center;margin-top:10px"><span class="btn" data-act="asc-">◀</span> <b>${ASCENSIONS[ui.asc].name}</b> <span class="btn" data-act="asc+">▶</span><div style="color:var(--dim);font-size:13px;margin-top:4px">${ASCENSIONS[ui.asc].desc}${ui.asc ? ' (includes all lower ascensions)' : ''} · Win to unlock the next. Unlocked: ${maxAsc}/${ASCENSIONS.length - 1}</div>
  <div style="margin-top:10px">${saved && !saved.over ? `<span class="btn" data-act="cont">Continue saved reign (turn ${saved.turn})</span>` : ''}<span class="btn" data-act="reroll">New island</span></div><div style="color:var(--dim);font-size:12px;margin-top:8px">Island #${seed} · Space/Enter is your only key: NEXT · M music</div></div>`;
  showModal(s, (act) => {
    A.init();
    if (act === 'asc-') { ui.asc = Math.max(0, ui.asc - 1); titleScreen(); return; }
    if (act === 'asc+') { ui.asc = Math.min(maxAsc, ui.asc + 1); titleScreen(); return; }
    if (act.startsWith('diff:')) { ui.diff = act.slice(5); store.set('diff', ui.diff); titleScreen(); return; }
    if (act === 'reroll') { ui.seed = Date.now() % 1e9; titleScreen(); return; }
    if (act === 'cont') { g = saved; startPlay(); return; }
    if (act.startsWith('L:')) { store.set('ascLast', ui.asc); g = P.newGame({ seed, asc: ui.asc, leader: act.slice(2), diff: ui.diff }); startPlay(true); }
  });
}
function startPlay(fresh) {
  ui.g = g; ui.reveal = Q.has('reveal'); ui.warnedEnd = false; hideModal(); ui.screen = 'play'; R.layer = null; if (A.setSeed) A.setSeed(g.seed); A.setEra(human().era);
  P.updateVision(g);
  if (fresh && !Q.has('autoplay')) { const L = LEADERS[human().leader]; toast(`${L.name} of ${L.civ}: ${L.desc}`, '#e9c46a'); if (store.get('reigns', 0) >= 2) toast('Found your capital: select the Settler and press B.', '#e9c46a'); toast(`Omen: ${OMENS[g.omen].name} — ${OMENS[g.omen].desc}`); const st = g.units.find((u) => u.owner === g.humanId && u.type === 'settler'); if (st) selectUnit(st); g.events.length = 0; }
  refresh();
  if (fresh && !Q.has('autoplay') && g.pendingDraft && g.pendingDraft.kind === 'charter') openBoonDraft();
}
function endScreen() {
  ui.screen = 'over'; const o = g.over; const me = g.humanId; const won = o.winner === me;
  const typeName = { science: 'a Science victory', culture: 'a Culture victory', conquest: 'a Conquest victory', chronicle: 'the Chronicle (best score)', defeat: 'defeat' }[o.type];
  if (won) { const maxAsc = store.get('ascUnlocked', 0); if (g.asc >= maxAsc && maxAsc < ASCENSIONS.length - 1) { store.set('ascUnlocked', g.asc + 1); } A.play('victory'); } else A.play('bad');
  store.set('reigns', store.get('reigns', 0) + 1); const hist = store.get('history', []); hist.push({ seed: g.seed, asc: g.asc, leader: human().leader, won, type: o.type, turn: g.turn - 1, score: P.score(g, human()) }); store.set('history', hist.slice(-50)); store.set('save', null);
  let s = `<div style="text-align:center"><p class="big" style="font-size:36px">${won ? 'VICTORY' : o.type === 'defeat' ? 'YOUR EMPIRE FALLS' : 'THE CHRONICLE CLOSES'}</p><p style="color:var(--ink);font-size:16px">${won ? `You win by ${typeName}.` : o.winner >= 0 ? `${g.civs[o.winner].lname} of ${g.civs[o.winner].name} wins by ${typeName}.` : 'Your last city has fallen.'}</p></div><table class="sc"><tr><th></th><th>Civ</th><th>Cities</th><th>Pop</th><th>Techs</th><th>Civics</th><th>Wonders</th><th>Score</th></tr>`;
  for (const c of g.civs.filter((x) => !x.barb).sort((a, b) => P.score(g, b) - P.score(g, a))) { const cs = g.cities.filter((x) => x.owner === c.id); s += `<tr style="${c.id === me ? 'color:var(--gold)' : ''}"><td><span style="display:inline-block;width:12px;height:12px;border-radius:6px;background:${c.color}"></span></td><td>${c.lname} of ${c.name}${c.alive ? '' : ' (fallen)'}</td><td>${cs.length}</td><td>${cs.reduce((a, x) => a + x.pop, 0)}</td><td>${c.techs.length}</td><td>${c.civics.length}</td><td>${cs.reduce((a, x) => a + x.wonders.length, 0)}</td><td>${P.score(g, c)}</td></tr>`; }
  s += `</table><p style="text-align:center">${won && g.asc < ASCENSIONS.length - 1 ? `<b style="color:var(--gold)">Unlocked: ${ASCENSIONS[Math.min(ASCENSIONS.length - 1, g.asc + 1)].name}</b><br>` : ''}Island #${g.seed} · ${ASCENSIONS[g.asc].name}</p><div style="text-align:center"><span class="btn" data-act="again">New reign</span> <span class="btn" data-act="look">Look at the map</span></div>`;
  ui.reveal = true;
  showModal(s, (act) => { if (act === 'again') { ui.seed = Date.now() % 1e9; titleScreen(); } if (act === 'look') { hideModal(); ui.screen = 'play'; } });
}
// ---------- main loop
// gentle coach: a speech bubble that points at the thing to do (first reigns only).
// v0.3.2: dismissable. The × button, Esc, or a click anywhere except the thing it points at hides that tip for
// good (remembered in localStorage); "hide all tips" turns the coach off. Help (?) can bring the tips back.
function coachOff() { return store.get('coachOff', false); }
function coachStep() {
  if (ui.screen !== 'play' || !g || g.over || $('modal').style.display === 'flex' || store.get('reigns', 0) >= 2 || Q.has('autoplay') || coachOff()) return null;
  const st = coachRaw(); if (!st) return null;
  if (store.get('coachSeen', []).includes(st.id)) return null;
  return st;
}
function coachRaw() {
  const me = g.humanId; const mine = g.units.filter((u) => u.owner === me);
  if (!g.cities.some((c) => c.owner === me)) { const st = mine.find((u) => u.type === 'settler'); return st && { id: 'found', tile: st.tile, text: 'This is your Settler. Press <b>B</b> (or “Found city”) to build your capital right here.' }; }
  if (g.turn === 1) { const w = mine.find((u) => u.type === 'warrior' && !u.acted); if (w) return { id: 'explore', tile: w.tile, text: 'Your Warrior can explore. Click it, then click a glowing tile. Or press <b>E</b> to explore by itself.' }; }
  if (g.turn <= 3) return { id: 'next', el: 'next', text: 'Whenever you are unsure, press <b>NEXT</b> (or Space). It always takes you to the next thing that needs you.' };
  if (g.turn <= 5 && g.cities.filter((c) => c.owner === me).length === 1) { const c = g.cities.find((x) => x.owner === me); return { id: 'settler', tile: c.tile, text: 'Cities grow by themselves. Build a <b>Settler</b> when your capital is size 2 to found a second city.' }; }
  return null;
}
function dismissCoach(all) {
  const st = ui.coach; if (!st) return false;
  const seen = store.get('coachSeen', []); if (!seen.includes(st.id)) { seen.push(st.id); store.set('coachSeen', seen); }
  if (all) store.set('coachOff', true);
  ui.coach = null; $('coach').style.display = 'none'; return true;
}
function resetCoach() { store.set('coachSeen', []); store.set('coachOff', false); }
// click-away: any press that is not on the bubble's own buttons and not on the thing it points at dismisses the tip
addEventListener('pointerdown', (e) => {
  const st = ui.coach; if (!st) return;
  const el = $('coach');
  if (e.target.closest && e.target.closest('#coach')) { const b = e.target.closest('[data-coach]'); if (b) { e.preventDefault(); dismissCoach(b.dataset.coach === 'all'); } return; }
  if (st.el && e.target.closest && e.target.closest('#' + st.el)) return;
  if (e.target.closest && e.target.closest('#help')) return;
  if (st.tile !== undefined && e.target === cv && R.pickTile(e.clientX, e.clientY) === st.tile) return;
  if (el.style.display === 'block') dismissCoach(false);
}, true);
$('coach').addEventListener('mouseenter', () => { ui.coachHover = true; }); $('coach').addEventListener('mouseleave', () => { ui.coachHover = false; });
function placeCoach() {
  const el = $('coach'); if (!el) return; const st = coachStep(); ui.coach = st;
  if (!st) { el.style.display = 'none'; return; }
  if (el.dataset.text !== st.text) { el.innerHTML = `<span class="cx" data-coach="one" title="Hide this tip (Esc)">×</span>${st.text}<span class="ca" data-coach="all">hide all tips</span>`; el.dataset.text = st.text; }
  el.style.display = 'block';
  let x, y;
  if (st.el) { const r = $(st.el).getBoundingClientRect(); x = r.left + r.width / 2; y = r.top - 8; el.className = 'coach up'; el.style.left = Math.min(innerWidth - 270, x - 130) + 'px'; el.style.top = (y - el.offsetHeight - 6) + 'px'; return; }
  [x, y] = R.center(st.tile); const bob = ui.coachHover ? 0 : Math.sin(performance.now() / 300) * 3; // holds still under the mouse so × is easy to hit
  el.className = 'coach'; el.style.left = Math.max(6, Math.min(innerWidth - 266, x - 130)) + 'px'; el.style.top = Math.max(50, y - R.s * 0.9 - el.offsetHeight - 10 + bob) + 'px';
}
function frame() { if (g) R.draw(ctx, g, ui); placeCoach(); requestAnimationFrame(frame); }
resize();
root.__PE = { ui, dismissCoach, resetCoach, coachStep, get g() { return g; }, set g(v) { g = v; ui.g = v; }, refresh, startPlay, titleScreen, endScreen, doEndTurn, flushEvents, openCouncil, openRivals, openBoonDraft, openEvent, selectCity, selectUnit, toast };
// test hooks: ?autoplay=N lets the AI play your civ for N turns (screenshots / smoke tests)
if (Q.has('autoplay') || Q.has('leader')) {
  g = P.newGame({ seed: +Q.get('seed') || 7, asc: +Q.get('asc') || 0, leader: Q.get('leader') || 'mireille', diff: Q.get('diff') || 'standard', omen: Q.get('omen') || undefined }); startPlay(true);
  const n = +Q.get('autoplay') || 0;
  for (let k = 0; k < n && !g.over; k++) { const c = human(); c.human = false; AI.takeTurn(g, c); c.human = true; if (g.pendingDraft) { P.addBoon(g, c, g.pendingDraft.options[0]); g.pendingDraft = null; } P.endTurn(g); if (g.pendingDraft) { P.addBoon(g, c, g.pendingDraft.options[0]); g.pendingDraft = null; } if (g.pendingEvent) P.resolveEvent(g, 'a'); g.peaceOffer = null; g.events.length = 0; }
  A.setEra(human().era); R.layer = null; refresh();
} else titleScreen();
requestAnimationFrame(frame);
})(typeof globalThis !== 'undefined' ? globalThis : this);
