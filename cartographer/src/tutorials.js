// Hand-tuned tutorial islands. Each teaches one idea with one short line of text.
// map legend: ~ sea, . sand, g grass, f forest, ^ mountain. lm: {name:[x,y]}. Verified by test/tutorials.test.js.
(function (root) {
  'use strict';
  const T = [
    { id: 't1', teaches: ['look', 'count'], name: 'First Landing', teach: 'Paint each tile. A margin number counts the grass in that row or column. No number means nobody counted it.',
      map: ['~~~~', '~gg~', '~gg~', '~~g~'], pal: [0, 2], lm: {},
      clues: [{ t: 'count', ax: 'r', k: 0, v: 2, n: 0 }, { t: 'count', ax: 'r', k: 2, v: 2, n: 2 }, { t: 'count', ax: 'r', k: 3, v: 2, n: 1 },
        { t: 'count', ax: 'c', k: 0, v: 2, n: 0 }, { t: 'count', ax: 'c', k: 3, v: 2, n: 0 }, { t: 'count', ax: 'c', k: 2, v: 2, n: 3 },
        { t: 'sketch', cells: [[5, 2]] }] },
    { id: 't2', ring: 1, teaches: ['twoinks'], name: 'Two Inks', teach: 'Some margins count forests too. Every tile is one thing. Point at a gap in the margin: nobody counted that.',
      map: ['~~~~~', '~gff~', '~ggf~', '~~g~~', '~~~~~'], pal: [0, 2, 3], lm: {},
      clues: [{t:  'count',  ax:  'c',  k:  3,  v:  2,  n:  0}, {t:  'count',  ax:  'r',  k:  2,  v:  2,  n:  2}, {t:  'count',  ax:  'r',  k:  3,  v:  3,  n:  0}, {t:  'count',  ax:  'c',  k:  2,  v:  3,  n:  1}, {t:  'count',  ax:  'r',  k:  1,  v:  2,  n:  1}, {t:  'count',  ax:  'c',  k:  3,  v:  3,  n:  2}, {t:  'count',  ax:  'c',  k:  1,  v:  2,  n:  2}, {t:  'count',  ax:  'r',  k:  3,  v:  2,  n:  1}] },
    { id: 't3', ring: 1, teaches: ['home'], name: 'Smoke on the Hill', teachCard: true, teach: 'The island card says: one village, standing on grass. Only one tile here can still be grass. Find it and put the village there.',
      map: ['~~~~~', '~ff~~', '~fgf~', '~~f~~', '~~~~~'], pal: [0, 2, 3], lm: { village: [2, 2] },
      clues: [{t:  'count',  ax:  'r',  k:  1,  v:  2,  n:  0}, {t:  'count',  ax:  'r',  k:  3,  v:  2,  n:  0}, {t:  'count',  ax:  'c',  k:  1,  v:  2,  n:  0}, {t:  'count',  ax:  'c',  k:  3,  v:  2,  n:  0}, {t:  'count',  ax:  'r',  k:  2,  v:  3,  n:  2}, {t:  'count',  ax:  'c',  k:  2,  v:  3,  n:  2}, {t:  'count',  ax:  'r',  k:  3,  v:  3,  n:  1}, {t:  'count',  ax:  'c',  k:  1,  v:  3,  n:  2}, {t:  'count',  ax:  'r',  k:  1,  v:  3,  n:  2}] },
    { id: 't4', ring: 1, name: 'Footprints', teaches: ['walk'], teach: 'Find the village first (it\'s the only grass). Then follow the footprints from it, one tile per day.',
      map: ['~~~~~', '~gf.~', '~ff.~', '~f..~', '~~~~~'], pal: [0, 1, 2, 3], lm: { village: [1, 1] },
      clues: [{ t: 'path', lm: 'village', d: 's', n: 2, v: 3 }, { t: 'walk', lm: 'village', d: 'e', n: 3, reach: true }, {"t":"count","ax":"r","k":3,"v":2,"n":0},{"t":"count","ax":"r","k":1,"v":3,"n":1},{"t":"count","ax":"r","k":3,"v":1,"n":2},{"t":"count","ax":"c","k":3,"v":1,"n":3},{"t":"count","ax":"c","k":1,"v":2,"n":1},{"t":"count","ax":"r","k":2,"v":3,"n":2}] },
    { id: 't5', ring: 1, name: 'The Volcano\'s Neighbours', teaches: ['touch'], teach: 'A volcano stands on a mountain. "Touches" means shares a side: look at the 4 tiles around it.',
      map: ['~~~~~', '~g^g~', '~gfg~', '~ffg~', '~~~~~'], pal: [0, 2, 3, 4], lm: { volcano: [2, 1] },
      clues: [{ t: 'ntouch', lm: 'volcano', v: 2, n: 2 }, {"t":"count","ax":"c","k":1,"v":4,"n":0},{"t":"count","ax":"c","k":2,"v":3,"n":2},{"t":"count","ax":"r","k":3,"v":3,"n":2},{"t":"count","ax":"r","k":2,"v":2,"n":2},{"t":"count","ax":"r","k":2,"v":4,"n":0},{"t":"count","ax":"c","k":3,"v":2,"n":3}] },
    { id: 't8', ring: 1, name: 'Two Steps South', teaches: ['rel'], teach: 'The temple is the only forest. Count 2 tiles south from it: that\'s where the village is.',
      map: ['~~~~~', '~f.g~', '~.gg~', '~g..~', '~~~~~'], pal: [0, 1, 2, 3], lm: { temple: [1, 1], village: [1, 3] },
      clues: [{ t: 'rel', a: 'village', b: 'temple', dx: 0, dy: 2 }, {"t":"count","ax":"r","k":1,"v":3,"n":1},{"t":"count","ax":"c","k":3,"v":3,"n":0},{"t":"count","ax":"c","k":3,"v":2,"n":2},{"t":"count","ax":"c","k":1,"v":3,"n":1},{"t":"count","ax":"c","k":2,"v":3,"n":0},{"t":"count","ax":"r","k":1,"v":1,"n":1},{"t":"count","ax":"r","k":2,"v":1,"n":1},{"t":"count","ax":"r","k":3,"v":1,"n":2},{"t":"count","ax":"c","k":2,"v":2,"n":1}] },
    { id: 't6', ring: 1, name: 'Counting Trees', teaches: ['total'], teach: 'The island card counts the forests on the whole island. Count the ones you know: the last ones must go where there\'s room.',
      map: ['~~~~~', '~fff~', '~ffg~', '~fgg~', '~~~~~'], pal: [0, 2, 3], lm: {},
      clues: [{"t":"count","ax":"r","k":3,"v":2,"n":2},{"t":"count","ax":"a","k":0,"v":3,"n":6},{"t":"count","ax":"c","k":1,"v":2,"n":0},{"t":"count","ax":"c","k":3,"v":2,"n":2},{"t":"count","ax":"r","k":1,"v":3,"n":3}] },
    { id: 't9', ring: 1, name: 'The Northern Half', teaches: ['zone'], teach: 'The treasure is buried in sand. Cross out the south and the west: one sand spot is left.',
      map: ['~~~~~', '~.g.~', '~gfg~', '~.g.~', '~~~~~'], pal: [0, 1, 2, 3], lm: { treasure: [3, 1] },
      clues: [{ t: 'zone', lm: 'treasure', z: 'n' }, { t: 'zone', lm: 'treasure', z: 'e' }, {"t":"count","ax":"r","k":1,"v":2,"n":1},{"t":"count","ax":"c","k":1,"v":1,"n":2},{"t":"count","ax":"r","k":3,"v":2,"n":1},{"t":"count","ax":"c","k":3,"v":1,"n":2},{"t":"count","ax":"r","k":2,"v":1,"n":0},{"t":"count","ax":"c","k":2,"v":3,"n":1},{"t":"count","ax":"r","k":2,"v":2,"n":2}] },
    { id: 't7', ring: 1, teaches: ['narrow'], name: 'The Lost Light', teach: 'Where can the lighthouse stand? Cross out every spot that breaks a report: sea, no room to walk, the wrong land. Stuck? The Lantern shows how.',
      map: ['~~~~~', '~ggg~', '~ffg~', '~g.g~', '~~~~~'], pal: [0, 1, 2, 3], lm: { lighthouse: [3, 2] },
      clues: [{ t: 'sketch', cells: [[17, 1]] }, { t: 'path', lm: 'lighthouse', d: 'w', n: 2, v: 3 }, { t: 'count', ax: 'r', k: 1, v: 2, n: 3 }, { t: 'count', ax: 'c', k: 3, v: 2, n: 3 }, { t: 'count', ax: 'r', k: 3, v: 2, n: 2 }] },
    { id: 'm1', region: 1, teaches: ['whatif'], lvl: 3, name: 'The Fork', teach: 'Stuck? Pick a spot and ask "what if?" If a report breaks, that spot is wrong. The Lantern shows how.',
      map: ['~ggff', '~g^gg', '~g^gg', '~gfff', '~~fff'], pal: [0, 2, 3, 4], lm: { village: [1, 2], volcano: [2, 2] },
      clues: [{ t: 'sketch', cells: [[8, 2], [3, 3], [4, 3], [16, 2], [21, 0]] }, { t: 'rel', a: 'volcano', b: 'village', dx: 1, dy: 0 }, { t: 'path', lm: 'volcano', d: 'n', n: 1, v: 4 }, { t: 'path', lm: 'volcano', d: 'e', n: 1, v: 2 }, { t: 'path', lm: 'volcano', d: 's', n: 2, v: 3 }, { t: 'count', ax: 'c', k: 0, v: 0, n: 5 }, { t: 'count', ax: 'r', k: 3, v: 3, n: 3 }, { t: 'count', ax: 'r', k: 4, v: 3, n: 3 }, { t: 'count', ax: 'a', k: 0, v: 2, n: 9 }] },
    { id: 'm2', region: 1, lvl: 3, teaches: ['allroads'], name: 'Every Way Agrees', teach: 'A landmark has only a few spots left. Try each one in your head: if every spot makes the same tile, ink that tile. The Lantern shows how.',
      map: ["~~~~~", "~.ff.", "~f^^g", "~ffgg", "~.gg."], pal: [0, 1, 2, 3, 4], lm: {"village": [4, 2], "volcano": [2, 2]}, clues: [{"t": "sketch", "cells": [[9, 1], [14, 2], [19, 2], [2, 0], [8, 3], [6, 1], [1, 0]]}, {"t": "walk", "lm": "village", "d": "n", "n": 2, "reach": true}, {"t": "path", "lm": "village", "d": "w", "n": 2, "v": 4}, {"t": "path", "lm": "volcano", "d": "w", "n": 1, "v": 3}, {"t": "count", "ax": "c", "k": 0, "v": 0, "n": 5}, {"t": "count", "ax": "c", "k": 3, "v": 3, "n": 1}, {"t": "count", "ax": "c", "k": 4, "v": 1, "n": 2}, {"t": "count", "ax": "r", "k": 4, "v": 3, "n": 0}, {"t": "count", "ax": "r", "k": 3, "v": 2, "n": 2}, {"t": "count", "ax": "r", "k": 4, "v": 2, "n": 2}, {"t": "count", "ax": "c", "k": 3, "v": 0, "n": 1}, {"t": "count", "ax": "a", "k": 0, "v": 3, "n": 5}, {"t": "count", "ax": "c", "k": 1, "v": 1, "n": 2}] },
    { id: 'd1', region: 2, lvl: 4, teaches: ['whatiftile'], name: 'The Doubting Tile', teach: 'Stuck on a tile? Pretend it is one land and follow the reports. If one breaks, it isn\'t that land. The Lantern shows how.',
      map: ["~~~~~~", "~.ggg~", "gg^^^g", "f^^^^^", "f^^^^f", ".fffff"], pal: [0, 1, 2, 3, 4], lm: {"village": [4, 1], "lighthouse": [1, 1], "volcano": [4, 3]}, clues: [{"t": "sketch", "cells": [[6, 0], [12, 2], [13, 2], [7, 1], [30, 1]]}, {"t": "rel", "a": "volcano", "b": "village", "dx": 0, "dy": 2}, {"t": "walk", "lm": "lighthouse", "d": "e", "n": 4, "reach": true}, {"t": "path", "lm": "village", "d": "w", "n": 2, "v": 2}, {"t": "ntouch", "lm": "volcano", "v": 4, "n": 4}, {"t": "count", "ax": "r", "k": 5, "v": 3, "n": 5}, {"t": "count", "ax": "c", "k": 3, "v": 3, "n": 1}, {"t": "count", "ax": "r", "k": 0, "v": 0, "n": 6}, {"t": "count", "ax": "c", "k": 1, "v": 3, "n": 1}, {"t": "count", "ax": "r", "k": 4, "v": 2, "n": 0}, {"t": "count", "ax": "c", "k": 5, "v": 2, "n": 1}, {"t": "count", "ax": "c", "k": 2, "v": 3, "n": 1}, {"t": "count", "ax": "a", "k": 0, "v": 4, "n": 12}, {"t": "count", "ax": "a", "k": 0, "v": 3, "n": 8}] },
  ];
  const CH = { '~': 0, '.': 1, g: 2, f: 3, '^': 4 };
  function build(d) {
    const H = d.map.length, W = d.map[0].length, t = [];
    for (const row of d.map) for (const ch of row) t.push(CH[ch]);
    const clues = d.clues.slice();
    if (d.ring) { const cells = []; for (let i = 0; i < W * H; i++) { const x = i % W, y = (i / W) | 0; if (x === 0 || y === 0 || x === W - 1 || y === H - 1) cells.push([i, t[i]]); } clues.unshift({ t: 'sketch', cells }); }
    const lm = {}; for (const k in d.lm) lm[k] = d.lm[k][1] * W + d.lm[k][0];
    return { id: d.id, name: d.name, teach: d.teach, teaches: d.teaches, teachCard: d.teachCard, region: d.region || 0, lvl: d.lvl || 2, W, H, pal: d.pal, lms: Object.keys(d.lm), clues, sol: { t, lm }, tutorial: true };
  }
  const TUT = T.map(build);
  if (typeof module !== 'undefined' && module.exports) module.exports = TUT; else root.CG_TUT = TUT;
})(typeof window !== 'undefined' ? window : globalThis);
