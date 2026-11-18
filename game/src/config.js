// Solmar Bay — tuning constants and the city palette.
// Every number the simulation and the renderer share lives here, so one edit
// retunes the whole game. Nothing in this file knows about the DOM.

export const CFG = {
  viewW: 1280,
  viewH: 720,
  worldW: 3200,
  worldH: 2400,

  // City grid: a road centre line every 400 px, each road 96 px wide.
  roadGap: 400,
  roadW: 96,
  lane: 24,

  step: 1 / 60,

  player: {
    walk: 175,
    run: 265,
    radius: 14,
    hp: 100,
    punchReach: 36,
    punchDamage: 25,
    punchCooldown: 0.45,
    shootCooldown: 0.28,
    ammo: 12,
    reloadTime: 1.4,
    bulletSpeed: 920,
    bulletDamage: 34,
  },

  car: {
    topSpeed: 560,
    accel: 430,
    brake: 780,
    reverseTop: 230,
    steerRate: 2.7,
    radius: 20,
    policeTop: 505,
    trafficSpeed: 150,
    trafficAccel: 120,
  },

  traffic: { count: 22, parked: 14 },
  peds: { count: 34, walk: 55, flee: 138 },

  police: {
    maxPursuit: 6,
    sight: 650,
    shootRange: 520,
    shootCooldown: 1.15,
    bulletDamage: 7,
    bustRange: 44,
    bustTime: 1.2,
    ramDamage: 9,
  },

  wanted: { loseSight: 9, decayEvery: 4, witnessRange: 360 },

  missions: [
    { id: 'hot-wheels', name: 'Hot Wheels', pay: 500 },
    { id: 'the-drop', name: 'The Drop', pay: 800 },
    { id: 'heat-wave', name: 'Heat Wave', pay: 1200 },
  ],

  cash: { count: 10, min: 25, max: 100 },

  clock: { startH: 9.0, hoursPerSecond: 1 / 90 },

  saveKey: 'solmar-bay-save-v1',
};

export const PALETTE = {
  grass: '#79a854',
  grassDark: '#6b9a48',
  sidewalk: '#b7b1a2',
  asphalt: '#3b3d44',
  asphaltLight: '#46484f',
  laneMark: '#e6e1cd',
  curb: '#8f887a',
  sand: '#e6cf96',
  water: '#2e7fb5',
  waterDeep: '#256a99',
  park: '#5d9b4a',
  tree: '#3c7a30',
  treeLight: '#4f9440',
  building: ['#c96f4a', '#d9a441', '#7d9bb5', '#b56a7d', '#8a7fb5', '#6fae8e', '#c98a5a', '#9aa5b1'],
  roof: ['#5a4a3a', '#7a3b2e', '#3f5a6e', '#6e4a5a', '#4a4a52'],
  hotel: '#e8c46a',
  hotelRoof: '#2e5f8a',
  garage: '#ffd23f',
  docks: '#3f8cff',
  package: '#ffcf3f',
  player: '#ff7a1a',
  playerDark: '#c85a10',
  policeBody: '#eef1f4',
  policeStripe: '#1c2f4a',
  cash: '#37d67a',
  blood: '#a01818',
};
