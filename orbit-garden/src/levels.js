// ORBIT GARDEN levels. World 1200x800. planets: {x,y,r,f?,rock?}; suns: {x,y,r}; pouch: seeds by type.
(function (root) {
  'use strict';
  const WORLDS = [
    { n: 1, name: 'Meadow', hue: 140 },
    { n: 2, name: 'Blossom', hue: 330 },
    { n: 3, name: 'Tangle', hue: 175 },
  ];
  const P = (x, y, r, extra) => Object.assign({ x, y, r }, extra || {});
  const K = (x, y, r) => ({ x, y, r: r || 18, rock: 1 });
  const LEVELS = [
    // ---- World 1: Meadow (tree seeds; learn the fling, gravity bends, heavy trees) ----
    { id: '1-1', name: 'Hello, Planet', launch: [220, 430], planets: [P(760, 430, 72)], pouch: { T: 3 } },
    { id: '1-2', name: 'Two Friends', launch: [200, 600], planets: [P(620, 290, 52), P(950, 560, 58)], pouch: { T: 3 } },
    { id: '1-3', name: 'Peekaboo', launch: [150, 560], planets: [P(560, 520, 78), P(980, 470, 30), P(400, 210, 36)], pouch: { T: 4 } },
    { id: '1-4', name: 'Pebble Fence', launch: [160, 420], planets: [P(900, 430, 52), P(950, 190, 30)],
      rocksAt: [[560, 170], [560, 290], [560, 410], [560, 530], [560, 650]], pouch: { T: 3 } },
    { id: '1-5', name: 'Swing Around', launch: [1040, 650], planets: [P(600, 400, 72), P(1040, 190, 32), P(240, 640, 32)],
      rocksAt: [[930, 420], [1010, 420], [1090, 420]], pouch: { T: 3 } },
    { id: '1-6', name: 'Heavy Heart', launch: [150, 690], planets: [P(620, 410, 64), P(620, 190, 26), P(850, 410, 26), P(620, 630, 26), P(390, 410, 26)], pouch: { T: 6 } },
    { id: '1-7', name: 'Cozy Nook', launch: [150, 400], planets: [P(900, 400, 40), P(420, 640, 40)],
      rocksAt: [[820, 280], [880, 260], [940, 270], [990, 310], [1020, 370], [1020, 430], [990, 490], [940, 530], [880, 540], [820, 520]], pouch: { T: 3 } },
    { id: '1-8', name: 'Pinwheel', launch: [600, 700], planets: [P(600, 380, 56), P(330, 250, 34), P(870, 250, 34), P(600, 140, 28)],
      rocksAt: [[470, 520], [730, 520]], pouch: { T: 5 } },
    { id: '1-9', name: 'Crowded Sky', launch: [130, 420], planets: [P(400, 230, 40), P(430, 600, 46), P(700, 410, 54), P(980, 220, 36), P(1000, 600, 40), P(1080, 410, 24)], pouch: { T: 7 } },
    { id: '1-10', name: 'Grandmother Tree', launch: [150, 690], planets: [P(640, 400, 92), P(640, 150, 26), P(900, 330, 26), P(860, 620, 26), P(410, 620, 26), P(380, 300, 26)],
      rocksAt: [[640, 260], [790, 440], [500, 470]], pouch: { T: 6 } },
    // ---- World 2: Blossom (flower seeds bounce, planets make wishes) ----
    { id: '2-1', name: 'Boing!', launch: [150, 560], planets: [P(560, 470, 66, { f: 'F' }), P(330, 200, 40), P(960, 300, 44)], pouch: { T: 3 } },
    { id: '2-2', name: 'What Do You Wish?', launch: [150, 420], planets: [P(560, 230, 48, { w: 'F' }), P(820, 560, 50, { w: 'T' })], pouch: { T: 1, F: 1 } },
    { id: '2-3', name: "Pink and Green", launch: [672, 150], planets: [{"x":712,"y":385,"r":43,"w":"F"}, {"x":958,"y":366,"r":41,"w":"F"}, {"x":265,"y":278,"r":49,"w":"T"}], pouch: {"T": 1, "F": 2} },
    { id: '2-4', name: "Petal Hill", launch: [285, 150], planets: [{"x":456,"y":473,"r":57,"w":"F"}, {"x":611,"y":243,"r":56,"w":"F"}, {"x":123,"y":612,"r":32,"w":"T"}], pouch: {"T": 1, "F": 2} },
    { id: '2-5', name: "Far Apart", launch: [478, 150], planets: [{"x":1064,"y":294,"r":42,"w":"T"}, {"x":326,"y":496,"r":41,"w":"F"}, {"x":175,"y":562,"r":22}], pouch: {"T": 1, "F": 2} },
    { id: '2-6', name: "Bumper Garden", launch: [256, 150], planets: [{"x":867,"y":182,"r":37,"f":"F"}, {"x":417,"y":352,"r":26}, {"x":538,"y":390,"r":47,"w":"F"}, {"x":895,"y":484,"r":49,"w":"T"}, {"x":278,"y":657,"r":19,"rock":1}], pouch: {"T": 2, "F": 1} },
    { id: '2-7', name: "Rosebud Corner", launch: [1090, 234], planets: [{"x":183,"y":672,"r":49}, {"x":479,"y":544,"r":59,"w":"T"}, {"x":541,"y":247,"r":45,"w":"F"}, {"x":824,"y":539,"r":35,"f":"F"}], pouch: {"T": 2, "F": 1} },
    { id: '2-8', name: "Big Twins", launch: [110, 328], planets: [{"x":773,"y":403,"r":59,"w":"T"}, {"x":555,"y":355,"r":61,"w":"T"}, {"x":590,"y":691,"r":31,"w":"F"}, {"x":301,"y":141,"r":17,"rock":1}], pouch: {"T": 2, "F": 2} },
    { id: '2-9', name: "Pebble Path", launch: [110, 515], planets: [{"x":384,"y":161,"r":56,"w":"T"}, {"x":1014,"y":275,"r":34,"f":"F"}, {"x":277,"y":451,"r":35}, {"x":791,"y":359,"r":43,"w":"F"}, {"x":608,"y":282,"r":17,"rock":1}], pouch: {"T": 2, "F": 1} },
    { id: '2-10', name: "Bouquet", launch: [664, 700], planets: [{"x":419,"y":424,"r":48,"w":"T"}, {"x":759,"y":434,"r":52,"w":"T"}, {"x":397,"y":654,"r":54,"f":"F"}, {"x":526,"y":253,"r":37,"w":"F"}, {"x":496,"y":143,"r":27,"w":"F"}], pouch: {"T": 2, "F": 2} },
    // ---- World 3: Tangle (vine seeds reach the nearest neighbour; suns burn pods) ----
    { id: '3-1', name: 'Vine Hug', launch: [150, 400], planets: [P(600, 290, 46), P(730, 560, 46)], pouch: { V: 1, T: 1 } },
    { id: '3-2', name: 'Sunny Day', launch: [150, 400], planets: [P(960, 240, 42), P(960, 580, 42), P(330, 660, 34)], suns: [{ x: 600, y: 400, r: 46 }], pouch: { T: 3 } },
    { id: '3-3', name: "Sunflower Ring", launch: [110, 424], planets: [{"x":819,"y":192,"r":48,"w":"V"}, {"x":437,"y":675,"r":27,"w":"F"}, {"x":871,"y":509,"r":37,"f":"F"}, {"x":378,"y":515,"r":24,"w":"F"}], suns: [{"x":676,"y":407,"r":43}], pouch: {"T": 1, "F": 2, "V": 1} },
    { id: '3-4', name: "Warm Hands", launch: [1090, 541], planets: [{"x":146,"y":161,"r":55,"f":"F"}, {"x":717,"y":540,"r":62,"w":"F"}, {"x":514,"y":553,"r":56,"w":"V"}, {"x":389,"y":382,"r":38,"w":"V"}], suns: [{"x":596,"y":410,"r":45}], pouch: {"T": 1, "F": 1, "V": 1} },
    { id: '3-5', name: "Hot Corner", launch: [110, 348], planets: [{"x":306,"y":629,"r":27,"w":"F"}, {"x":216,"y":150,"r":28,"w":"T"}, {"x":473,"y":416,"r":56,"w":"T"}, {"x":983,"y":667,"r":22,"f":"T"}], suns: [{"x":731,"y":210,"r":48}], pouch: {"T": 2, "F": 2} },
    { id: '3-6', name: "Jungle Gym", launch: [502, 150], planets: [{"x":1037,"y":667,"r":43,"w":"V"}, {"x":1013,"y":344,"r":27,"w":"T"}, {"x":673,"y":588,"r":51,"w":"T"}, {"x":413,"y":546,"r":61,"w":"T"}, {"x":527,"y":689,"r":14,"rock":1}], suns: [{"x":819,"y":161,"r":40}], pouch: {"T": 4, "V": 1} },
    { id: '3-7', name: "Island Hopping", launch: [236, 150], planets: [{"x":843,"y":366,"r":23,"f":"F"}, {"x":442,"y":624,"r":53,"w":"F"}, {"x":203,"y":495,"r":28,"w":"V"}, {"x":210,"y":335,"r":47,"w":"T"}, {"x":1055,"y":631,"r":37}, {"x":1036,"y":468,"r":17,"rock":1}], suns: [{"x":525,"y":394,"r":48}], pouch: {"T": 1, "F": 3, "V": 1} },
    { id: '3-8', name: "Green Web", launch: [1090, 457], planets: [{"x":553,"y":626,"r":59}, {"x":879,"y":151,"r":49}, {"x":194,"y":165,"r":33}, {"x":843,"y":440,"r":36}, {"x":136,"y":409,"r":61}, {"x":398,"y":481,"r":29}], suns: [{"x":257,"y":561,"r":41}], pouch: {"T": 2, "V": 2} },
    { id: '3-9', name: "Solar Picnic", launch: [672, 150], planets: [{"x":958,"y":366,"r":41,"w":"T"}, {"x":265,"y":278,"r":49}, {"x":472,"y":465,"r":38}, {"x":515,"y":625,"r":27,"w":"F"}, {"x":138,"y":562,"r":55,"w":"T"}, {"x":680,"y":626,"r":16,"rock":1}], suns: [{"x":632,"y":481,"r":37}], pouch: {"T": 4, "F": 2} },
    { id: '3-10', name: "The Whole Tangle", launch: [1090, 271], planets: [{"x":949,"y":344,"r":44,"w":"V"}, {"x":450,"y":676,"r":39,"w":"T"}, {"x":910,"y":578,"r":34,"w":"T"}, {"x":673,"y":530,"r":24,"f":"F"}, {"x":409,"y":494,"r":29,"w":"T"}, {"x":877,"y":454,"r":42,"w":"T"}], suns: [{"x":575,"y":197,"r":36}], pouch: {"T": 4, "V": 1} },
  ];
  for (const l of LEVELS) { if (l.rocksAt) { for (const [x, y, r] of l.rocksAt) l.planets.push(K(x, y, r)); delete l.rocksAt; } }
  const api = { WORLDS, LEVELS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.OG_LEVELS = api;
})(typeof window !== 'undefined' ? window : globalThis);
