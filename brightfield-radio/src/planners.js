// BRIGHTFIELD RADIO planners: pure, seeded, testable in Node. No audio I/O.
(function (root) {
  'use strict';

  const PENTA = [0, 2, 4, 7, 9];
  // Copied faithfully from Brightfield so the victory loops match the game.
  const PROG = {
    leaf: [[41, 48, 57, 60, 64], [48, 55, 60, 64, 67], [43, 50, 55, 59, 62], [45, 52, 57, 60, 64], [41, 48, 53, 57, 60], [48, 55, 59, 64, 67], [38, 50, 53, 57, 60], [43, 50, 55, 59, 65]],
    star: [[48, 55, 62, 64, 71], [43, 50, 57, 59, 66], [45, 52, 59, 60, 67], [41, 48, 55, 57, 64], [48, 55, 62, 64, 71], [43, 50, 57, 59, 66], [41, 48, 55, 57, 64], [43, 50, 55, 62, 65]],
  };
  const MEL = {
    leaf: [72, null, 69, 72, 74, null, 76, null, 72, null, null, 67, 69, null, 72, null, 74, null, 71, 74, 76, null, 79, null, 76, null, 74, null, 72, null, null, null,
      77, null, 76, 74, 72, null, 69, null, 76, null, 74, 72, 71, null, 67, null, 74, null, 72, 69, 72, null, 74, null, 72, null, null, null, null, null, null, null],
    star: [76, 79, 83, null, 81, 79, 76, null, 74, 78, 81, null, 79, 78, 74, null, 76, 79, 84, null, 83, 81, 79, null, 77, 81, 84, null, 83, null, 79, null,
      76, 79, 83, null, 86, null, 83, null, 81, 79, 78, null, 74, null, 78, null, 77, 79, 81, null, 84, null, 83, null, 79, null, null, null, null, null, null, null],
  };
  const ARPS = [
    [1, 2, 3, 4, 3, 2, 3, 4],
    [1, 3, 2, 4, 1, 3, 2, 4],
    [4, 3, 2, 1, 2, 3, 4, 3],
    [1, 2, 4, 2, 3, 2, 4, 2],
    [2, 1, 3, 1, 4, 2, 3, 4],
    [1, 4, 2, 3, 1, 2, 4, 3],
  ];

  const GH = {
    bpm: 58,
    form: 'AABACD',
    sec: {
      A: [[41, 48, 53, 57, 60], [48, 55, 60, 64, 67], [45, 52, 57, 60, 64], [43, 50, 55, 60, 62]],
      B: [[38, 45, 50, 53, 57], [46, 53, 58, 62, 65], [41, 48, 53, 57, 64], [48, 55, 60, 64, 67]],
      C: [[45, 52, 57, 60, 64], [41, 48, 53, 57, 60], [48, 55, 59, 64, 67], [43, 50, 55, 59, 62]],
      D: [[46, 53, 58, 62, 65], [41, 48, 57, 60, 64], [43, 50, 55, 60, 65], [48, 55, 60, 64, 71]],
    },
  };
  const NG = {
    bpm: 52,
    form: 'AABCAB',
    sec: {
      A: [[45, 52, 57, 60, 64], [41, 48, 53, 57, 60], [48, 55, 59, 64, 67], [40, 47, 52, 55, 59]],
      B: [[38, 45, 50, 53, 57], [45, 52, 57, 61, 64], [43, 50, 55, 60, 62], [45, 52, 57, 60, 64]],
      C: [[41, 48, 53, 57, 64], [43, 50, 55, 59, 64], [40, 47, 52, 55, 59], [45, 52, 57, 60, 67]],
    },
  };
  const FD = {
    bpm0: 64,
    bpm1: 88,
    form: 'ABC',
    buildSecs: 600,
  };

  function phraseRng(phrase, seed, lane) {
    let h = (((phrase + 1) * 2654435761) ^ ((seed + 1) * 1597334677) ^ ((lane + 13) * 2246822519)) >>> 0;
    return function () {
      h = (h * 1103515245 + 12345) >>> 0;
      return (h >>> 8) / 16777216;
    };
  }

  function evPush(ev, v, m, vol, len, off) {
    ev.push({ v: v, m: m, vol: vol, len: len || 0, off: off || 0 });
  }

  function planVictory(variant, s) {
    const ev = [];
    const pr = PROG[variant];
    const ch = pr[Math.floor(s / 8) % pr.length];
    const i8 = s % 8;
    const bar = Math.floor(s / 8);
    const phrase = Math.floor(bar / 8);
    const bpm = variant === 'star' ? 100 : 88;
    const e8 = 60 / bpm / 2;
    const P = (v, m, vol, len, off) => evPush(ev, v, m, vol, len, off);
    const part = phrase % 3;
    if (i8 === 0) for (const m of ch.slice(1)) P('pad', m + 12, part === 2 ? 0.09 : 0.075, e8 * 8 - 0.2);
    if (part !== 2 && (i8 === 0 || i8 === 5)) P('bass', ch[0], 0.2, e8 * (i8 ? 3 : 5));
    const mel = MEL[variant][s % MEL[variant].length];
    if (variant === 'leaf') {
      const arp = [ch[1], ch[2], ch[3], ch[4], ch[3] + 12, ch[4], ch[2] + 12, ch[3]];
      if (part !== 2 || i8 % 2 === 0) P('marimba', arp[i8] + 12, 0.09 + (i8 % 2 ? 0 : 0.03));
      if (mel && (part !== 2 || i8 % 4 === 0)) P('bell', mel + (part === 1 ? 12 : 0), part === 1 ? 0.05 : 0.07);
      if (part === 0 && i8 % 2 === 0) P('hat', 7000, 0.03);
    } else {
      const arp = [ch[1], ch[2] + 12, ch[3], ch[4] + 12, ch[2], ch[3] + 12, ch[4], ch[2] + 24];
      P('pluck', arp[i8] + 12, part === 2 ? 0.04 : 0.07, 1.2);
      if (part === 0) P('pluck', arp[(i8 + 4) % 8] + 12, 0.035, 1.2, e8 / 2);
      if (mel && (part !== 2 || i8 % 4 === 0)) P('bell', mel - 12 + (part === 1 ? 12 : 0), part === 1 ? 0.05 : 0.07);
      if (part === 0 && i8 % 2 === 0) P('hat', 9000, i8 % 4 === 0 ? 0.05 : 0.025);
      if (part === 0 && (i8 === 0 || i8 === 4)) P('kick', 0, 0.25);
    }
    return ev;
  }

  function chordFromForm(spec, step) {
    const bar = Math.floor(step / 8);
    const phrase = Math.floor(bar / 8);
    const sec = spec.form[phrase % spec.form.length];
    return spec.sec[sec][Math.floor((bar % 8) / 2) % spec.sec[sec].length];
  }

  function planGreenhouse(st, s) {
    const ev = [];
    const seed = (st && st.seed) || 1;
    const ch = chordFromForm(GH, s);
    const i8 = s % 8;
    const bar = Math.floor(s / 8);
    const phrase = Math.floor(bar / 8);
    const e8 = 60 / GH.bpm / 2;
    const P = (v, m, vol, len, off) => evPush(ev, v, m, vol, len, off);
    const pr = phraseRng(phrase, seed, 0);
    const arp = ARPS[Math.floor(pr() * ARPS.length)];
    const dens = pr() < 0.35 ? 4 : 2;
    const dripChance = 0.07 + pr() * 0.08;
    const motifOn = pr() < 0.7;
    const motif = [0, 1, 2, 3].map(() => Math.floor(pr() * 4));

    if (i8 === 0) {
      const hold = e8 * (bar % 4 === 0 ? 16 : 8) - 0.15;
      for (const m of ch.slice(1)) P('pad', m + 12, 0.055, hold);
    }
    if (i8 === 0 && bar % 2 === 0) P('bass', ch[0], 0.1, e8 * 6);
    if (i8 % dens === 0) P('marimba', ch[arp[i8] % ch.length] + 12, 0.055 + (i8 === 0 ? 0.025 : 0));
    if (motifOn && bar % 2 === 1 && i8 % 2 === 0) {
      const tones = ch.slice(1).map((m) => 72 + (((m - 72) % 12) + 12) % 12).sort((a, b) => a - b);
      P('bell', tones[motif[i8 / 2] % tones.length], 0.03);
    }
    const dr = phraseRng(phrase, seed, s + 99);
    if (dr() < dripChance) {
      const freq = 1400 + dr() * 1600;
      P('drip', freq, 0.035 + dr() * 0.02, 0, dr() * e8 * 0.4);
    }
    return ev;
  }

  function planNight(st, s) {
    const ev = [];
    const seed = (st && st.seed) || 2;
    const ch = chordFromForm(NG, s);
    const i8 = s % 8;
    const bar = Math.floor(s / 8);
    const phrase = Math.floor(bar / 8);
    const e8 = 60 / NG.bpm / 2;
    const P = (v, m, vol, len, off) => evPush(ev, v, m, vol, len, off);
    const pr = phraseRng(phrase, seed, 1);
    const boxPat = ARPS[Math.floor(pr() * ARPS.length)];
    const rests = [pr() < 0.45, pr() < 0.3, pr() < 0.5, pr() < 0.35, pr() < 0.45, pr() < 0.4, pr() < 0.55, pr() < 0.3];
    const fireflyN = 2 + Math.floor(pr() * 3);
    const fireflySlots = [0, 1, 2, 3, 4, 5, 6, 7].filter(() => pr() < 0.35).slice(0, fireflyN);
    if (!fireflySlots.length) fireflySlots.push(3 + (phrase % 4));

    if (i8 === 0 && bar % 2 === 0) {
      for (const m of ch.slice(0, 4)) P('pad', m, 0.05, e8 * 16 - 0.2);
    }
    if (i8 === 0 && bar % 4 === 0) P('bass', ch[0] - 12, 0.07, e8 * 8);

    if (!rests[i8] && i8 % 2 === 0) {
      const idx = boxPat[i8] % ch.length;
      P('musicbox', ch[idx] + 12, 0.045 + (i8 === 0 ? 0.015 : 0));
    }

    const fr = phraseRng(phrase, seed, s + 7);
    if (fireflySlots.indexOf(i8) >= 0) {
      const deg = PENTA[Math.floor(fr() * PENTA.length)];
      const oct = fr() < 0.4 ? 84 : 96;
      P('bell', oct + deg, 0.022 + fr() * 0.012, 0, fr() * e8 * 0.5);
    }
    if (i8 % 2 === 1 && fr() < 0.28) P('cricket', 4200 + fr() * 700, 0.01 + fr() * 0.006);
    return ev;
  }

  function fusionProgress(st) {
    if (st && typeof st.progress === 'number') return st.progress;
    return 0;
  }

  function fusionBpm(p) {
    const t = Math.max(0, Math.min(1, p));
    return FD.bpm0 + (FD.bpm1 - FD.bpm0) * t;
  }

  function fusionChord(p, s) {
    if (p < 1) {
      if (p < 0.12) return [36];
      if (p < 0.28) return [36, 48];
      if (p < 0.42) return [36, 48, 55];
      if (p < 0.58) return [36, 48, 55, 64];
      if (p < 0.75) return [36, 48, 55, 62, 64];
      return [36, 48, 55, 62, 64, 71];
    }
    const pr = PROG.star;
    return pr[Math.floor(s / 8) % pr.length];
  }

  function planFusion(st, s) {
    const ev = [];
    const seed = (st && st.seed) || 3;
    const p = fusionProgress(st);
    const ch = fusionChord(p, s);
    const i8 = s % 8;
    const bar = Math.floor(s / 8);
    const phrase = Math.floor(bar / 8);
    const bpm = fusionBpm(Math.min(1, p));
    const e8 = 60 / bpm / 2;
    const P = (v, m, vol, len, off) => evPush(ev, v, m, vol, len, off);
    const pr = phraseRng(phrase, seed, 2);
    const cycling = p >= 1;
    const part = cycling ? phrase % 3 : (p < 0.62 ? 2 : p < 0.82 ? 1 : 0);
    const dens = Math.max(0, Math.min(1, cycling ? (part === 2 ? 0.45 : 1) : (p - 0.5) / 0.5));

    if (i8 === 0) {
      const padVol = 0.04 + Math.min(0.05, (cycling ? 0.05 : p * 0.05));
      const tones = ch.length === 1 ? ch : ch.slice(1);
      for (const m of tones) P('pad', m + (m < 48 ? 12 : 0), part === 2 ? padVol * 0.85 : padVol, e8 * 8 - 0.15);
    }
    if (ch[0] && (i8 === 0 || (i8 === 5 && dens > 0.35 && part !== 2))) {
      P('bass', ch[0] > 40 ? ch[0] - 12 : ch[0], 0.08 + dens * 0.08, e8 * (i8 ? 3 : 6));
    }

    if (dens > 0.15) {
      const arpSrc = ch.length > 4 ? ch : [ch[0], ch[Math.min(1, ch.length - 1)], ch[Math.min(2, ch.length - 1)], ch[ch.length - 1], ch[0]];
      const arp = [
        arpSrc[1 % arpSrc.length],
        arpSrc[2 % arpSrc.length] + 12,
        arpSrc[Math.min(3, arpSrc.length - 1)],
        arpSrc[arpSrc.length - 1] + 12,
        arpSrc[2 % arpSrc.length],
        arpSrc[Math.min(3, arpSrc.length - 1)] + 12,
        arpSrc[arpSrc.length - 1],
        arpSrc[2 % arpSrc.length] + 24,
      ];
      const extra = phraseRng(phrase, seed, 21);
      const shift = Math.floor(extra() * 4);
      const note = arp[(i8 + shift) % 8];
      if (note && (part !== 2 || i8 % 2 === 0)) {
        P('pluck', note + 12, (part === 2 ? 0.03 : 0.05) * (0.6 + dens), 1.15);
        if (part === 0 && dens > 0.55) P('pluck', arp[(i8 + 4) % 8] + 12, 0.028 * dens, 1.1, e8 / 2);
      }
    }
    if (dens > 0.4 && i8 % 2 === 0) {
      const extra = phraseRng(phrase, seed, 33);
      if (extra() < 0.4 + dens * 0.3) {
        const deg = PENTA[Math.floor(extra() * 5)];
        P('bell', 76 + deg + (part === 1 ? 12 : 0), part === 1 ? 0.04 : 0.032);
      }
    }
    if (part === 0 && dens > 0.7 && i8 % 2 === 0) P('hat', 8800, i8 % 4 === 0 ? 0.03 : 0.016);
    return ev;
  }


  const AQUA = {
    bpm: 96,
    form: 'AABAC',
    sec: {
      A: [[48, 55, 62, 64, 71], [41, 48, 55, 57, 64], [45, 52, 59, 60, 67], [43, 50, 55, 60, 65]],
      B: [[41, 48, 55, 57, 64], [38, 45, 53, 57, 62], [43, 50, 57, 60, 65], [48, 55, 62, 64, 71]],
      C: [[45, 52, 57, 60, 67], [41, 48, 53, 57, 64], [46, 53, 57, 62, 65], [48, 55, 60, 64, 71]],
    },
  };
  const GLASS = {
    bpm: 104,
    form: 'AABAC',
    sec: {
      A: [[48, 55, 62, 64, 71], [40, 47, 54, 55, 62], [41, 48, 55, 57, 64], [43, 50, 57, 60, 65]],
      B: [[45, 52, 59, 60, 67], [50, 57, 60, 64, 69], [43, 50, 55, 60, 65], [48, 55, 62, 64, 71]],
      C: [[41, 48, 55, 57, 64], [40, 47, 52, 55, 59], [38, 45, 53, 57, 62], [43, 50, 57, 60, 67]],
    },
  };
  const ECO = {
    bpm: 90,
    form: 'AABCAB',
    sec: {
      A: [[41, 48, 55, 57, 64], [48, 55, 62, 64, 71], [38, 45, 53, 57, 62], [45, 52, 57, 60, 67]],
      B: [[46, 53, 57, 62, 65], [41, 48, 55, 57, 64], [48, 55, 60, 64, 71], [43, 50, 55, 60, 65]],
      C: [[45, 52, 59, 60, 67], [40, 47, 54, 55, 62], [41, 48, 53, 57, 64], [48, 55, 62, 64, 67]],
    },
  };

  function planAqua(st, s) {
    const ev = [];
    const seed = (st && st.seed) || 11;
    const ch = chordFromForm(AQUA, s);
    const i8 = s % 8;
    const bar = Math.floor(s / 8);
    const phrase = Math.floor(bar / 8);
    const e8 = 60 / AQUA.bpm / 2;
    const P = (v, m, vol, len, off) => evPush(ev, v, m, vol, len, off);
    const pr = phraseRng(phrase, seed, 40);
    const arp = ARPS[Math.floor(pr() * ARPS.length)];
    const part = phrase % 3;
    const bubbly = 0.1 + pr() * 0.12;
    const dens = part === 2 ? 2 : 1;
    if (i8 === 0) {
      for (const m of ch.slice(1, 4)) P('ooh', m, 0.045, e8 * 8 - 0.15);
      P('pad', ch[2] + 12, 0.04, e8 * 8 - 0.15);
    }
    if (i8 === 0 && bar % 2 === 0) P('bass', ch[0], 0.09, e8 * 6);
    if (i8 % dens === 0) P('glass', ch[arp[i8] % ch.length] + 24, 0.04 + (i8 === 0 ? 0.015 : 0));
    if (part !== 2 && i8 % 2 === 0) P('hat', 9000, i8 === 0 ? 0.028 : 0.016);
    if (part === 0 && i8 === 0 && bar % 2 === 0) P('kick', 0, 0.12);
    const br = phraseRng(phrase, seed, s + 140);
    if (br() < bubbly) P('bubble', 520 + br() * 1500, 0.05 + br() * 0.03, 0, br() * e8 * 0.45);
    if (br() < 0.06) P('drip', 1400 + br() * 1200, 0.03, 0, br() * 0.1);
    if (motifOn(pr) && bar % 2 === 1 && i8 === 0) P('rhodes', ch[2] + 12, 0.05, e8 * 3);
    return ev;
  }
  function motifOn(pr) { return pr() < 0.72; }

  function planSkyline(st, s) {
    const ev = [];
    const seed = (st && st.seed) || 13;
    const ch = chordFromForm(GLASS, s);
    const i8 = s % 8;
    const bar = Math.floor(s / 8);
    const phrase = Math.floor(bar / 8);
    const e8 = 60 / GLASS.bpm / 2;
    const P = (v, m, vol, len, off) => evPush(ev, v, m, vol, len, off);
    const pr = phraseRng(phrase, seed, 41);
    const arp = ARPS[Math.floor(pr() * ARPS.length)];
    const part = phrase % 3;
    const kickB = pr() < 0.55;
    if (i8 === 0) {
      for (const m of ch.slice(1, 4)) P('ooh', m, part === 2 ? 0.05 : 0.038, e8 * 8 - 0.12);
    }
    if (i8 === 0) {
      const voicing = [ch[1], ch[2], ch[3]].slice(0, part === 2 ? 2 : 3);
      voicing.forEach((m, i) => P('rhodes', m + 12, 0.055 + (i === 0 ? 0.015 : 0), e8 * 4, i * 0.025));
    }
    if (part !== 2 && i8 % 2 === 0 && i8 !== 0) {
      const idx = arp[i8] % ch.length;
      P('rhodes', ch[idx] + 12, 0.042, e8 * 2);
    }
    if (part === 0 && i8 % 2 === 0) P('glass', ch[arp[i8] % ch.length] + 24, 0.03);
    if (i8 === 0 || (i8 === 5 && part !== 2)) P('bass', ch[0], 0.13, e8 * (i8 ? 3 : 5));
    if (part !== 2) {
      if (i8 === 0) P('kick', 0, 0.16);
      if (kickB && i8 === 3) P('kick', 0, 0.11);
      if (i8 === 4) P('snare', 0, 0.07);
      if (i8 % 2 === 0) P('hat', 8800, i8 % 4 === 0 ? 0.03 : 0.018);
    } else if (i8 === 0 || i8 === 4) P('hat', 8000, 0.016);
    const gr = phraseRng(phrase, seed, s + 77);
    if (gr() < 0.05) P('bubble', 700 + gr() * 900, 0.03);
    return ev;
  }

  function planEco(st, s) {
    const ev = [];
    const seed = (st && st.seed) || 17;
    const ch = chordFromForm(ECO, s);
    const i8 = s % 8;
    const bar = Math.floor(s / 8);
    const phrase = Math.floor(bar / 8);
    const e8 = 60 / ECO.bpm / 2;
    const P = (v, m, vol, len, off) => evPush(ev, v, m, vol, len, off);
    const pr = phraseRng(phrase, seed, 42);
    const arp = ARPS[Math.floor(pr() * ARPS.length)];
    const part = phrase % 3;
    if (i8 === 0 && bar % 2 === 0) {
      for (const m of ch.slice(0, 4)) P('ooh', m, 0.05, e8 * 16 - 0.2);
      P('pad', ch[3] + 12, 0.035, e8 * 16 - 0.2);
    }
    if (i8 === 0 && bar % 4 === 0) P('bass', ch[0], 0.08, e8 * 8);
    if (part !== 2 && i8 === 0) P('rhodes', ch[2] + 12, 0.048, e8 * 5);
    if (part !== 2 && bar % 2 === 1 && i8 === 4) P('rhodes', ch[3] + 12, 0.04, e8 * 3);
    if (i8 === 0 || (i8 === 4 && part === 0)) P('glass', ch[arp[i8] % ch.length] + 12, 0.032);
    const er = phraseRng(phrase, seed, s + 9);
    if (er() < 0.09) P('bird', 1700 + er() * 1400, 0.028 + er() * 0.015, 0, er() * e8 * 0.4);
    if (er() < 0.04) P('bubble', 600 + er() * 800, 0.025);
    if (part === 0 && i8 === 6 && er() < 0.5) P('bell', 84 + PENTA[Math.floor(er() * 5)], 0.03);
    if (i8 === 0 && bar % 4 === 2) P('hat', 7000, 0.014);
    return ev;
  }

  const TRACKS = [
    {
      id: 'victory',
      name: 'Brightfield Victory',
      blurb: 'The leaf and star finale loops from the game.',
      variants: ['leaf', 'star'],
      defaultVariant: 'leaf',
      scene: 'victory',
      gain: 1,
    },
    {
      id: 'greenhouse',
      name: 'Greenhouse Rain',
      blurb: 'Soft marimba and long pads under rain on the glass.',
      scene: 'greenhouse',
      gain: 1.55,
    },
    {
      id: 'night',
      name: 'Night Garden',
      blurb: 'Quieter and lower: crickets, a music box, and firefly bells.',
      scene: 'night',
      gain: 1.65,
    },
    {
      id: 'dawn',
      name: 'Fusion Dawn',
      blurb: 'A ten-minute rise from one drone to a bright star-ending chord.',
      scene: 'dawn',
      gain: 0.95,
    },
    {
      id: 'aqua',
      name: 'Aqua Bubble',
      blurb: 'Glassy arps, rising bubbles, and water over bright major-ninth pads.',
      scene: 'aqua',
      gain: 1.12,
      group: 'aero',
    },
    {
      id: 'skyline',
      name: 'Skyline Glass',
      blurb: 'A glossy Rhodes and a soft 2-step groove under shimmering chorus pads.',
      scene: 'skyline',
      gain: 1.0,
      group: 'aero',
    },
    {
      id: 'eco',
      name: 'Eco Dream',
      blurb: 'Lush ooh pads, birds, and a slow blissed-out electric piano.',
      scene: 'eco',
      gain: 1.18,
      group: 'aero',
    },
  ];

  function bpmOf(id, st) {
    if (id === 'victory') return (st && st.variant) === 'star' ? 100 : 88;
    if (id === 'greenhouse') return GH.bpm;
    if (id === 'night') return NG.bpm;
    if (id === 'dawn') return fusionBpm(fusionProgress(st));
    if (id === 'aqua') return AQUA.bpm;
    if (id === 'skyline') return GLASS.bpm;
    if (id === 'eco') return ECO.bpm;
    return 80;
  }

  function plan(id, st, s) {
    if (id === 'victory') return planVictory((st && st.variant) || 'leaf', s);
    if (id === 'greenhouse') return planGreenhouse(st, s);
    if (id === 'night') return planNight(st, s);
    if (id === 'dawn') return planFusion(st, s);
    if (id === 'aqua') return planAqua(st, s);
    if (id === 'skyline') return planSkyline(st, s);
    if (id === 'eco') return planEco(st, s);
    return [];
  }

  function padFilterHz(id, st) {
    if (id === 'victory') return 3600;
    if (id === 'greenhouse') return 1600;
    if (id === 'night') return 1100;
    if (id === 'dawn') return 420 + Math.min(1, fusionProgress(st)) * 3000;
    if (id === 'aqua' || id === 'skyline' || id === 'eco') return 3200;
    return 1800;
  }

  function groupOf(id) {
    const t = TRACKS.find((x) => x.id === id);
    return (t && t.group) || 'classic';
  }

  const api = {
    PENTA, PROG, MEL, ARPS, GH, NG, FD, AQUA, GLASS, ECO, TRACKS,
    phraseRng, planVictory, planGreenhouse, planNight, planFusion,
    planAqua, planSkyline, planEco,
    plan, bpmOf, padFilterHz, fusionProgress, fusionBpm, fusionChord, chordFromForm,
    groupOf,
  };
  root.RADIO_PLAN = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
