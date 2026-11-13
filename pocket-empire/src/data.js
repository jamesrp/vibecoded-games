// POCKET EMPIRE — static game data (classic script; also require()-able in Node)
(function (root) {
'use strict';
const TER = {
  ocean:    { name: 'Ocean',    f: 1, p: 0, move: 99, water: true },
  coast:    { name: 'Coast',    f: 2, p: 0, move: 99, water: true },
  grass:    { name: 'Grassland', f: 2, p: 0, move: 1 },
  plains:   { name: 'Plains',   f: 1, p: 1, move: 1 },
  desert:   { name: 'Desert',   f: 0, p: 1, move: 1 },
  tundra:   { name: 'Tundra',   f: 1, p: 0, move: 1 },
  hills:    { name: 'Hills',    f: 0, p: 2, move: 2, def: 3 },
  mountain: { name: 'Mountains', f: 0, p: 0, move: 99, block: true },
};
const FOREST = { f: 1, p: 2, move: 2, def: 3 };
const RES = {
  wheat:   { name: 'Wheat',   on: ['grass', 'plains'], f: 2 },
  fish:    { name: 'Fish',    on: ['coast'], f: 2 },
  stone:   { name: 'Stone',   on: ['hills', 'desert', 'plains'], p: 2 },
  horses:  { name: 'Horses',  on: ['grass', 'plains'], f: 1, p: 1 },
  iron:    { name: 'Iron',    on: ['hills'], p: 2 },
  gems:    { name: 'Gems',    on: ['hills', 'forest'], c: 2 },
  incense: { name: 'Incense', on: ['desert', 'plains'], s: 1, c: 1 },
  deer:    { name: 'Deer',    on: ['forest', 'tundra'], f: 1, p: 1 },
  pearls:  { name: 'Pearls',  on: ['coast'], s: 2 },
};
// str = melee strength, rs = ranged strength
const VERSION = '0.3.2';
const UNITS = {
  settler:   { name: 'Settler',   cost: 26, str: 0, mp: 2, civilian: true },
  warrior:   { name: 'Warrior',   cost: 12, str: 9, mp: 2, cls: 'melee', up: 'swordsman' },
  archer:    { name: 'Archer',    cost: 22, str: 5, rs: 10, range: 2, mp: 2, cls: 'ranged', tech: 'archery', up: 'crossbow' },
  spearman:  { name: 'Spearman',  cost: 20, str: 11, mp: 2, cls: 'anti', vsMounted: 8, tech: 'bronze', up: 'pikeman' },
  horseman:  { name: 'Horseman',  cost: 26, str: 13, mp: 4, cls: 'mounted', tech: 'horses', up: 'knight' },
  swordsman: { name: 'Swordsman', cost: 34, str: 17, mp: 2, cls: 'melee', tech: 'iron', up: 'musketeer' },
  catapult:  { name: 'Catapult',  cost: 34, str: 5, rs: 14, range: 2, mp: 2, cls: 'siege', siege: 12, tech: 'mathematics', up: 'cannon' },
  crossbow:  { name: 'Crossbow',  cost: 40, str: 10, rs: 18, range: 2, mp: 2, cls: 'ranged', tech: 'machinery' },
  knight:    { name: 'Knight',    cost: 46, str: 23, mp: 4, cls: 'mounted', tech: 'chivalry' },
  pikeman:   { name: 'Pikeman',   cost: 38, str: 19, mp: 2, cls: 'anti', vsMounted: 10, tech: 'feudalism', civic: true },
  musketeer: { name: 'Musketeer', cost: 54, str: 30, mp: 2, cls: 'melee', tech: 'gunpowder' },
  cannon:    { name: 'Cannon',    cost: 58, str: 9, rs: 27, range: 2, mp: 2, cls: 'siege', siege: 14, tech: 'metallurgy' },
};
const BUILDINGS = {
  monument:    { name: 'Monument',    cost: 24, c: 2 },
  granary:     { name: 'Granary',     cost: 30, f: 2, tech: 'pottery' },
  smithy:      { name: 'Smithy',      cost: 34, p: 2, tech: 'mining' },
  library:     { name: 'Library',     cost: 34, s: 2, tech: 'writing' },
  walls:       { name: 'Walls',       cost: 38, walls: true, tech: 'masonry' },
  market:      { name: 'Market',      cost: 44, f: 1, p: 1, s: 1, c: 1, tech: 'currency' },
  amphitheater:{ name: 'Amphitheater',cost: 48, c: 3, civic: 'drama' },
  university:  { name: 'University',  cost: 60, s: 4, tech: 'education' },
  workshop:    { name: 'Workshop',    cost: 60, p: 3, tech: 'engineering' },
};
// wonders: one per world. eff = civ-wide effect
const WONDERS = {
  pyramids:   { name: 'Pyramids',        cost: 90,  tech: 'masonry', eff: { allP: 1 }, desc: '+1 production in every city' },
  gardens:    { name: 'Hanging Gardens', cost: 90,  tech: 'pottery', eff: { allF: 1 }, desc: '+1 food in every city' },
  oracle:     { name: 'Oracle',          cost: 90,  civic: 'mysticism', eff: { c: 4 }, desc: '+4 culture here' },
  greatlib:   { name: 'Great Library',   cost: 110, tech: 'writing', eff: { s: 5 }, desc: '+5 science here' },
  terracotta: { name: 'Terracotta Army', cost: 120, civic: 'militaryTradition', eff: { unitStr: 2 }, desc: 'all your units +2 strength' },
  observatory:{ name: 'Star Observatory',cost: 150, tech: 'astronomy', eff: { s: 6 }, desc: '+6 science here' },
  chapel:     { name: 'Sistine Chapel',  cost: 150, civic: 'humanism', eff: { c: 7 }, desc: '+7 culture here' },
};
const PROJECTS = {
  starward: { name: 'Starward Expedition', cost: 170, tech: 'navigation', desc: 'Science victory' },
};
// era 0..3
const TECHS = {
  mining:      { name: 'Mining',        era: 0, cost: 18, req: [] },
  pottery:     { name: 'Pottery',       era: 0, cost: 18, req: [] },
  archery:     { name: 'Archery',       era: 0, cost: 22, req: [] },
  bronze:      { name: 'Bronze Working',era: 0, cost: 24, req: ['mining'] },
  horses:      { name: 'Horseback Riding', era: 0, cost: 24, req: [] },
  writing:     { name: 'Writing',       era: 0, cost: 24, req: ['pottery'] },
  masonry:     { name: 'Masonry',       era: 0, cost: 24, req: ['mining'] },
  mathematics: { name: 'Mathematics',   era: 1, cost: 48, req: ['writing', 'masonry'] },
  iron:        { name: 'Iron Working',  era: 1, cost: 48, req: ['bronze'] },
  currency:    { name: 'Currency',      era: 1, cost: 46, req: ['writing'] },
  machinery:   { name: 'Machinery',     era: 2, cost: 68, req: ['mathematics', 'archery'] },
  engineering: { name: 'Engineering',   era: 2, cost: 68, req: ['mathematics', 'iron'] },
  chivalry:    { name: 'Chivalry',      era: 2, cost: 71, req: ['horses', 'iron'] },
  education:   { name: 'Education',     era: 2, cost: 71, req: ['currency', 'mathematics'] },
  astronomy:   { name: 'Astronomy',     era: 2, cost: 82, req: ['education'] },
  gunpowder:   { name: 'Gunpowder',     era: 3, cost: 94, req: ['machinery', 'engineering'] },
  metallurgy:  { name: 'Metallurgy',    era: 3, cost: 101, req: ['gunpowder'] },
  printing:    { name: 'Printing Press',era: 3, cost: 94, req: ['education'] },
  navigation:  { name: 'Navigation',    era: 3, cost: 109, req: ['astronomy', 'printing'] },
};
const CIVICS = {
  codeOfLaws:  { name: 'Code of Laws',  cost: 14, req: [], desc: 'Settlers cost 25% less' },
  craftsmanship:{ name: 'Craftsmanship', cost: 26, req: ['codeOfLaws'], desc: '+1 production in every city' },
  mysticism:   { name: 'Mysticism',     cost: 26, req: ['codeOfLaws'], desc: 'Unlocks the Oracle' },
  militaryTradition: { name: 'Military Tradition', cost: 30, req: ['codeOfLaws'], desc: 'Units heal +10 · Terracotta Army' },
  drama:       { name: 'Drama & Poetry',cost: 42, req: ['mysticism'], desc: 'Unlocks the Amphitheater' },
  feudalism:   { name: 'Feudalism',     cost: 56, req: ['craftsmanship', 'militaryTradition'], desc: '+1 food in every city · Pikeman' },
  civilService:{ name: 'Civil Service', cost: 60, req: ['craftsmanship'], desc: '+1 science per city' },
  humanism:    { name: 'Humanism',      cost: 80, req: ['drama'], desc: 'Unlocks the Sistine Chapel' },
  magnumOpus:  { name: 'Magnum Opus',   cost: 130, req: ['humanism', 'civilService'], desc: 'Culture victory with 2 wonders' },
};
const ERAS = ['Ancient', 'Classical', 'Medieval', 'Renaissance'];
// personalities: weights used by the AI
const PERS = {
  warlord:   { name: 'Warlord',   aggr: 1.0, expand: 0.5, sci: 0.4, cult: 0.3, wonder: 0.2 },
  builder:   { name: 'Builder',   aggr: 0.25, expand: 0.5, sci: 0.6, cult: 0.7, wonder: 1.0 },
  expander:  { name: 'Expansionist', aggr: 0.5, expand: 1.0, sci: 0.5, cult: 0.4, wonder: 0.3 },
  scholar:   { name: 'Scholar',   aggr: 0.3, expand: 0.6, sci: 1.0, cult: 0.5, wonder: 0.5 },
};
const LEADERS = {
  ilsa:    { name: 'Ilsa',    civ: 'Tidelands',   pers: 'expander', perk: { coastP: 1, coastS: 1, settlerPct: 15 }, desc: 'Coast tiles +1 production and +1 science. Settlers 15% cheaper.' },
  borte:   { name: 'Borte',   civ: 'Steppe Khanate', pers: 'warlord', perk: { mountedMp: 1, mountedStr: 4, freeTech: 'horses', killYield: 8, allF: 1 }, desc: 'Starts with Horseback Riding. Herds: +1 food in every city. Mounted +1 move, +4 strength. Each foe defeated: +8 science and culture.' },
  mireille:{ name: 'Mireille',civ: 'Lumen',       pers: 'scholar', perk: { sciPct: 35 }, desc: '+35% science.' },
  pell:    { name: 'Pell',    civ: 'Ostrava',     pers: 'builder', perk: { buildPct: 25, cityHp: 20 }, desc: '+25% production on buildings and wonders. Cities +20 HP.' },
  oduya:   { name: 'Oduya',   civ: 'Hearthland',  pers: 'expander', perk: { centerF: 1, newCityPop: 1 }, desc: 'City centres +1 food. New cities start at size 2.' },
  kest:    { name: 'Kest',    civ: 'Bastion',     pers: 'warlord', perk: { cityStr: 6, cityHp: 50, heal: 10, unitStr: 3 }, desc: 'Cities +6 strength, +50 HP. Units +3 strength and heal +10.' },
  tamsin:  { name: 'Tamsin',  civ: 'Verse',       pers: 'builder', perk: { cultPct: 20, capC: 1 }, desc: '+20% culture. Capital +1 culture.' },
  ro:      { name: 'Ro',      civ: 'Wayfarers',   pers: 'scholar', perk: { sight: 1, ruinX: 2, settlerPct: 30, sciPct: 15 }, desc: 'Settlers 30% cheaper. +15% science. Ruins give double. Units see 1 tile further.' },
};
const BOONS = {
  harvest:   { name: 'Bountiful Harvest', desc: '+1 food in every city', eff: { allF: 1 } },
  forge:     { name: 'Forge Masters',     desc: '+1 production in every city', eff: { allP: 1 } },
  charts:    { name: 'Star Charts',       desc: '+20% science', eff: { sciPct: 20 } },
  muse:      { name: 'The Muse',          desc: '+25% culture', eff: { cultPct: 25 } },
  drill:     { name: 'Veteran Drill',     desc: 'All units +3 strength', eff: { unitStr: 3 } },
  roads:     { name: 'Old Roads',         desc: 'Land units +1 move', eff: { mp: 1 } },
  bulwark:   { name: 'Bulwark',           desc: 'Cities +6 strength and +60 HP', eff: { cityStr: 6, cityHp: 60 } },
  pioneers:  { name: 'Pioneers',          desc: 'A free Settler now; settlers 40% cheaper', eff: { settlerPct: 40 }, now: 'settler' },
  windfall:  { name: 'Windfall',          desc: '+40 science and +30 culture now', eff: {}, now: 'windfall' },
  levy:      { name: 'Levy',              desc: 'Two free units of your best melee type now', eff: {}, now: 'levy' },
  eureka:    { name: 'Eureka',            desc: 'Finish your current research now', eff: {}, now: 'eureka' },
  masons:    { name: 'Master Masons',     desc: '+40% production on wonders', eff: { wonderPct: 40 } },
  sages:     { name: 'Wandering Sages',   desc: '+2 science in every city', eff: { cityS: 2 } },
  bards:     { name: 'Bards',             desc: '+1 culture in every city', eff: { cityC: 1 } },
  // bold boons: a big upside with a real cost. Every reign opens with a draft of three (the Founding Charter), and each era draft offers one.
  ironOath:  { bold: true, name: 'Iron Oath',        desc: 'Units +4 strength', cost: 'Science −15%', eff: { unitStr: 4, sciPct: -15 } },
  tallCrown: { bold: true, name: 'Tall Crown',       desc: '+2 science and +1 culture in every city', cost: 'Settlers cost 50% more', eff: { cityS: 2, cityC: 1, settlerPct: -50 } },
  frontier:  { bold: true, name: 'Open Frontier',    desc: 'Settlers 40% cheaper, +1 food in every city', cost: 'Cities −5 strength', eff: { settlerPct: 40, allF: 1, cityStr: -5 } },
  scholarK:  { bold: true, name: 'Scholar Kings',    desc: '+35% science', cost: 'Units −3 strength', eff: { sciPct: 35, unitStr: -3 } },
  festival:  { bold: true, name: 'Festival Calendar', desc: '+45% culture', cost: 'Science −15%', eff: { cultPct: 45, sciPct: -15 } },
  quarries:  { bold: true, name: 'Marble Quarries',  desc: '+60% production on wonders', cost: 'Settlers cost 30% more', eff: { wonderPct: 60, settlerPct: -30 } },
  horseLords:{ bold: true, name: 'Horse Lords',      desc: 'Land units +1 move; each foe defeated gives +6 science and culture', cost: 'Culture −20%', eff: { mp: 1, killYield: 6, cultPct: -20 } },
  walled:    { bold: true, name: 'Walled Towns',     desc: 'Cities +10 strength and +80 HP', cost: 'Science −10%, culture −10%', eff: { cityStr: 10, cityHp: 80, sciPct: -10, cultPct: -10 } },
};
const ASCENSIONS = [
  { name: 'Ascension 0', desc: 'The standard game.' },
  { name: 'Ascension 1 · Restless Wilds', desc: 'Barbarians spawn more often and camps start closer.' },
  { name: 'Ascension 2 · Gifted Rivals', desc: 'Every rival starts with an era boon.' },
  { name: 'Ascension 3 · Hungry Rivals', desc: 'Rivals get +15% to all yields.' },
  { name: 'Ascension 4 · Short Reign', desc: 'Only 36 turns.' },
  { name: 'Ascension 5 · Iron Age', desc: 'Rivals start with an extra Warrior and declare war sooner.' },
  { name: 'Ascension 6 · Thin Court', desc: 'Your leader and boon drafts offer 2 choices, not 3.' },
];
const CIV_COLORS = ['#3aa0ff', '#e5484d', '#f2b134', '#a46cf0', '#6f6f6f'];
const CITY_NAMES = {
  ilsa: ['Saltmere', 'Gullhaven', 'Brinewick', 'Kelport', 'Shellby', 'Tidecross', 'Foamreach', 'Wavecrest'],
  borte: ['Karaqor', 'Tengri', 'Ulaan', 'Khuduu', 'Altan', 'Bayan', 'Sartaq', 'Orkhon'],
  mireille: ['Lumière', 'Candelle', 'Prisme', 'Aurore', 'Clairvaux', 'Étoile', 'Vesper', 'Solenne'],
  pell: ['Ostrava', 'Kamenice', 'Hradek', 'Brana', 'Most', 'Vezna', 'Koruna', 'Stavba'],
  oduya: ['Ile-Ina', 'Ojà', 'Odò', 'Igbo', 'Orun', 'Ayo', 'Ilé', 'Omi'],
  kest: ['Bastion', 'Holdfast', 'Rampart', 'Keepwatch', 'Stonegard', 'Bulwick', 'Gatesend', 'Tor'],
  tamsin: ['Verse', 'Sonnet', 'Rhyme', 'Canto', 'Ode', 'Stanza', 'Ballad', 'Elegy'],
  ro: ['Waypoint', 'Farstep', 'Compass', 'Lodestar', 'Trailhead', 'Cairn', 'Roam', 'Horizon'],
};
const EVENTS = [
  { id: 'scholars', title: 'Wandering Scholars', text: 'A caravan of scholars asks to settle in your capital.',
    a: { label: 'Welcome them (+30 science)', fx: { sci: 30 } }, b: { label: 'Put them to work (+1 population in capital)', fx: { capPop: 1 } } },
  { id: 'comet', title: 'A Comet Overhead', text: 'A blazing comet crosses the sky. Your people look to you for its meaning.',
    a: { label: 'An omen of art (+30 culture)', fx: { cult: 30 } }, b: { label: 'A puzzle for astronomers (+30 science)', fx: { sci: 30 } } },
  { id: 'mercs', title: 'Mercenary Band', text: 'Hard-eyed mercenaries offer their spears.',
    a: { label: 'Hire them (2 free melee units, -20 culture)', fx: { levy: 2, cult: -20 } }, b: { label: 'Send them away (+20 production in capital)', fx: { capProd: 20 } } },
  { id: 'harvest', title: 'Golden Harvest', text: 'The fields have never been so full.',
    a: { label: 'Feast! (+15 food in every city)', fx: { allFood: 15 } }, b: { label: 'Store and trade it (+35 culture)', fx: { cult: 35 } } },
  { id: 'ruins', title: 'Ancient Ruins', text: 'Your explorers find a buried city older than any record.',
    a: { label: 'Study the inscriptions (+40% of current research)', fx: { sciPctNow: 40 } }, b: { label: 'Salvage the stone (+30 production in capital)', fx: { capProd: 30 } } },
  { id: 'plague', title: 'Fever in the Streets', text: 'A fever spreads through your largest city.',
    a: { label: 'Quarantine (-1 population there)', fx: { bigPop: -1 } }, b: { label: 'Burn the old quarter (-25 production there, -15 culture)', fx: { bigProd: -25, cult: -15 } } },
  { id: 'festival', title: 'Midsummer Festival', text: 'Musicians and dancers fill the plazas.',
    a: { label: 'Fund it lavishly (+45 culture, -15 science)', fx: { cult: 45, sci: -15 } }, b: { label: 'A modest fair (+15 culture)', fx: { cult: 15 } } },
  { id: 'smith', title: 'A Master Smith', text: 'A smith of legend offers to train your soldiers.',
    a: { label: 'Train the army (all units healed, +1 strength forever)', fx: { heal: 1, unitStr: 1 } }, b: { label: 'Open a forge (+1 production in capital forever)', fx: { capP: 1 } } },
  { id: 'migrants', title: 'Migrants at the Border', text: 'Families fleeing a far-off war ask for land.',
    a: { label: 'Take them in (+1 population in your smallest city)', fx: { smallPop: 1 } }, b: { label: 'Recruit them (+1 free Settler, -20 culture)', fx: { settler: 1, cult: -20 } } },
  { id: 'library', title: 'Burned Library', text: 'A rival\'s library burned; its scrolls wash up on your shore.',
    a: { label: 'Copy them (+45 science, -15 culture)', fx: { sci: 45, cult: -15 } }, b: { label: 'Return them (+25 culture)', fx: { cult: 25 } } },
];
// world omens: one per island (seeded). They bend the rules for everyone, so each run asks for a different plan.
const OMENS = {
  iron:     { name: 'Age of Iron',      desc: 'All units +2 strength. War pays: +4 science and culture per foe defeated.', eff: { unitStr: 2, killYield: 4 } },
  fertile:  { name: 'Fertile Isle',     desc: 'Every city +1 food. Wide empires thrive.', eff: { allF: 1 } },
  scholars: { name: 'Age of Scholars',  desc: 'Research costs 15% less. The stars are closer.', techPct: -15 },
  muses:    { name: 'Age of Muses',     desc: 'Civics cost 15% less. Wonders give +2 culture.', civicPct: -15, wonderC: 2 },
  wild:     { name: 'Wild Frontier',    desc: 'Two extra barbarian camps. Clearing a camp pays double.', camps: 2, campPay: 2 },
  ruins:    { name: 'Land of Ruins',    desc: 'Six ancient ruins hide gifts for the first explorer.', ruins: 6 },
  wonders:  { name: 'Age of Marvels',   desc: 'Wonders cost 20% less.', wonderPct: -20 },
  crowded:  { name: 'Crowded Isle',     desc: 'A smaller island: rivals start closer, and borders touch early.', crowded: true },
};
const RUIN_GIFTS = ['sci', 'cult', 'pop', 'unit', 'map', 'gold'];
const DIFFICULTIES = {
  gentle: { name: 'Gentle', desc: 'For new and young rulers: rivals are calmer, no wars on you before turn 20, and your advisors pick research for you.', aiYield: 0.85, peaceTurn: 20, autoCouncil: true, barbCityRaid: false },
  standard: { name: 'Standard', desc: 'The full game.', aiYield: 1, peaceTurn: 0, autoCouncil: false, barbCityRaid: true },
};
const D = { VERSION, OMENS, RUIN_GIFTS, DIFFICULTIES, TER, FOREST, RES, UNITS, BUILDINGS, WONDERS, PROJECTS, TECHS, CIVICS, ERAS, PERS, LEADERS, BOONS, ASCENSIONS, CIV_COLORS, CITY_NAMES, EVENTS };
if (typeof module !== 'undefined' && module.exports) module.exports = D; else root.PE_DATA = D;
})(typeof globalThis !== 'undefined' ? globalThis : this);
