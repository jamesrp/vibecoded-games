// GHOST CHOIR sequencer: deterministic, pure. Space = time: light moves one tile per beat.
(function (root) {
  const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0]; // 0 N, 1 E, 2 S, 3 W
  const MIR = [[1, 0, 3, 2], [3, 2, 1, 0]]; // m=0 '/', m=1 '\'
  const key = (x, y) => x + ',' + y;
  // board: Map key -> piece. piece: {t:'ghost',n} {t:'mirror',m} {t:'prism'} {t:'candle',d,c} {t:'wick',d,c} {t:'pillar'}
  // returns {events:[[ 'n:c', ...sorted ]...L], trail:[[{x,y,d,c,kind}]...L], lit:{key:beat}}
  function simulate(board, w, h, L) {
    let heads = [];
    for (const [k, p] of board) if (p.t === 'candle') { const [x, y] = k.split(',').map(Number); heads.push({ x: x + DX[p.d], y: y + DY[p.d], d: p.d, c: p.c, src: k }); }
    const events = [], trail = [], lit = {}, sung = [];
    for (let t = 0; t < L; t++) {
      const ev = new Set(), tr = [], next = [], seen = new Set(), sg = [];
      for (const hd of heads) {
        const hk = hd.x + ',' + hd.y + ',' + hd.d + ',' + hd.c; if (seen.has(hk)) continue; seen.add(hk);
        if (hd.x < 0 || hd.y < 0 || hd.x >= w || hd.y >= h) continue;
        const k = key(hd.x, hd.y), p = board.get(k);
        const go = (d, c) => next.push({ x: hd.x + DX[d], y: hd.y + DY[d], d, c, src: hd.src });
        if (!p) { tr.push({ x: hd.x, y: hd.y, d: hd.d, c: hd.c, kind: 'rest' }); go(hd.d, hd.c); continue; }
        if (p.t === 'ghost') { ev.add(p.n + ':' + hd.c); sg.push({ x: hd.x, y: hd.y, n: p.n, c: hd.c }); tr.push({ x: hd.x, y: hd.y, d: hd.d, c: hd.c, kind: 'sing' }); go(hd.d, hd.c); }
        else if (p.t === 'mirror') { tr.push({ x: hd.x, y: hd.y, d: hd.d, c: hd.c, kind: 'turn' }); go(MIR[p.m][hd.d], hd.c); }
        else if (p.t === 'prism') { tr.push({ x: hd.x, y: hd.y, d: hd.d, c: hd.c, kind: 'split' }); go((hd.d + 1) % 4, hd.c); go((hd.d + 3) % 4, hd.c); }
        else if (p.t === 'wick') {
          if (!(k in lit)) { lit[k] = t; tr.push({ x: hd.x, y: hd.y, d: hd.d, c: hd.c, kind: 'wick' }); next.push({ x: hd.x + DX[p.d], y: hd.y + DY[p.d], d: p.d, c: p.c, src: k }); }
        } // candle, pillar: light ends
      }
      events.push([...ev].sort()); trail.push(tr); sung.push(sg); heads = next;
    }
    return { events, trail, lit, sung };
  }
  function boardFrom(list) { const m = new Map(); for (const p of list) { const q = Object.assign({}, p); delete q.x; delete q.y; m.set(key(p.x, p.y), q); } return m; }
  function sameEvents(a, b) { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) { if (a[i].length !== b[i].length) return false; for (let j = 0; j < a[i].length; j++) if (a[i][j] !== b[i][j]) return false; } return true; }
  // Tune notation: per voice a string of tokens, one per beat: note names (C4, D#4) or '.' rest; voice colour g|b.
  const NAMES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function midi(s) { const m = /^([A-G])(#|b)?(\d)$/.exec(s); if (!m) throw new Error('bad note ' + s); return 12 * (+m[3] + 1) + NAMES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); }
  function tuneEvents(voices, L) { // voices: [{c:'g', notes:'C4 . E4'}]
    const ev = Array.from({ length: L }, () => new Set());
    for (const v of voices) { const toks = v.notes.trim().split(/\s+/); if (toks.length !== L) throw new Error('voice length ' + toks.length + ' != ' + L); toks.forEach((tk, i) => { if (tk !== '.') for (const n of tk.split('+')) ev[i].add(midi(n) + ':' + v.c); }); }
    return ev.map((s) => [...s].sort());
  }
  const api = { DX, DY, MIR, key, simulate, boardFrom, sameEvents, midi, tuneEvents };
  if (typeof module !== 'undefined') module.exports = api; else root.GC = Object.assign(root.GC || {}, api);
})(this);
