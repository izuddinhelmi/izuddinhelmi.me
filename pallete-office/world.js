// The island: terrain, objects and zones, plus all the pixel drawing for them.
// Environment PNGs and remaining procedural props share the same base pixel grid.
// Style: broad flat colours, egg-shaped trees and sparse accents, like the original reference.

import { OFFICE_ROOMS, officeWalls } from './campus.js';
import { ISLAND_WIDTH, ISLAND_HEIGHT, WATERFALL_TILE, isIslandTile, exposedEdges } from './island-shape.js';

export const W = ISLAND_WIDTH, H = ISLAND_HEIGHT; // bounding grid, including small ledges
export const HW = 24, HH = 12;          // half tile width / height in base pixels
export const SIDE = 28;                 // exposed earth and rock below the grass
const MARGIN_TOP = 100, MARGIN_X = 44, MARGIN_BOTTOM = 32;
export const BASE_W = (W + H) * HW + MARGIN_X * 2;
export const BASE_H = MARGIN_TOP + (W + H) * HH + SIDE + MARGIN_BOTTOM;
const OX = MARGIN_X + H * HW, OY = MARGIN_TOP;

// (fx, fy) in tile units -> base pixels. A tile's centre is (x + .5, y + .5).
export const toScreen = (fx, fy) => [OX + (fx - fy) * HW, OY + (fx + fy) * HH];
const shift = (x, y, dx, dy) => { const [sx, sy] = toScreen(x + 0.5, y + 0.5); return [sx + dx, sy + dy]; };

// ---------------------------------------------------------------- layout

// Five rooms wrap around the garden: two project rooms and three shared rooms.
// A grass corridor connects their entrances to the open courtyard.
export const PRODUCT_OPERATOR = [5, 12];
export const PRODUCT_MACHINE = [6, 11];
export const ZONES = {
  library:  { label: 'RESEARCH', seats: [[1, 2]], stand: [[2, 3], [1, 3], [1, 4], [2, 4]], overflow: 'design' },
  design:   { label: 'DESIGN', seats: [], stand: [[11, 10], [10, 10], [10, 11]], overflow: 'meeting' },
  workshop: { label: 'WORK', seats: [], stand: [[13, 12], [14, 12], [14, 11]], overflow: 'library' },
  product:  { label: 'PRODUCT', seats: [], stand: [PRODUCT_OPERATOR, [5, 13], [6, 13]], overflow: 'meeting' },
  board:    { label: null, spots: [[18, 3]], overflow: 'design' },
  meeting:  { label: 'COMMONS', spots: [[11, 11], [13, 11], [11, 12], [12, 12], [13, 12], [12, 10], [13, 10]] },
  campfire: { label: 'SERVERS', seats: [], stand: [[19, 10], [20, 11], [18, 12]], overflow: 'workshop' },
  center:   { label: 'WELCOME', spots: [[18, 20], [18, 21], [18, 22], [19, 22], [21, 21], [21, 22], [17, 20], [17, 21]] },
  pond:     { label: 'RIVER CAFE', sign: [2, 8], spots: [[3, 10], [4, 10], [2, 11], [4, 11], [3, 12], [4, 12], [3, 11]],
              water: [[1, 9], [0, 10], [1, 11], [1, 12], [3, 14], [4, 15]] },
  // Where Pokémon go when they aren't working: lounge on the picnic rug, or spar in the arena.
  // The picnic sits on the riverbank; water types can lounge in the river beside it.
  chill:    { label: 'CHILL', spots: [[3, 10], [4, 10], [2, 11], [4, 11], [3, 12], [4, 12], [2, 12], [5, 11], [5, 12], [4, 13]],
              water: [[1, 10], [1, 11], [1, 12], [1, 9]] },
  arena:    { label: 'ARENA', spots: [[13, 20], [14, 19]] },
  // After three minutes of waiting, a Pokémon comes to the front of the map to wave at you.
  front:    { label: null, spots: [[10, 22], [12, 22], [9, 22], [13, 22], [11, 21], [8, 21]] },
  gate:     { label: null, spots: [[10, 23]] },
};
for (const room of OFFICE_ROOMS) ZONES[room.key] = { label: room.name, seats: room.seats, stand: room.stand };
for (const z of Object.values(ZONES)) z.spots = [...(z.seats ?? []), ...(z.stand ?? []), ...(z.spots ?? [])];
export const GATE = [10, 23];
export const OUTBOX = [3, 8];
export const BOARD_SPOT = [18, 3];

// Public metadata also drives the campus guide, keeping names and locations in sync.
export const CAMPUS_AREAS = [
  { key: 'library', label: 'Research grove', subtitle: 'Read, investigate & focus', color: '#a5b795', at: [1, 3] },
  ...OFFICE_ROOMS.map(room => ({key:room.key, label:room.name, subtitle:room.match ? 'Dedicated project room' : 'Shared team room', color:room.color, at:room.seats[0]})),
  { key: 'product', label: 'Product machine', subtitle: 'Turn an idea into something useful', color: '#d0bd8c', at: PRODUCT_MACHINE },
  { key: 'campfire', label: 'Systems corner', subtitle: 'Run, test & deploy', color: '#b7c1cd', at: [20, 10] },
  { key: 'pond', label: 'Riverside cafe', subtitle: 'Coffee, breaks & conversation', color: '#93bccc', at: [3, 11] },
  { key: 'chill', label: 'Chill area', subtitle: 'Off-duty lounging by the river', color: '#d98a7c', at: [3, 11] },
  { key: 'arena', label: 'Arena', subtitle: 'Friendly sparring', color: '#d8b47a', at: [13, 19] },
  { key: 'center', label: 'Welcome center', subtitle: 'Arrivals & a little recharge', color: '#d18b7c', at: [20, 21] },
];

// A calm river bends along the left edge and opens out beside the entrance.
export const WATER = [];
for (let y = 7; y <= 12; y++) for (let x = 0; x <= 1; x++) WATER.push([x, y]);
for (let x = 0; x <= 2; x++) WATER.push([x, 13]);
for (let y = 14; y <= 22; y++) for (let x = 0; x <= 5; x++) if (isIslandTile(x, y)) WATER.push([x, y]);
const BUILDING = [[19, 20], [20, 20], [19, 21], [20, 21]];

// Uneven little groves replace the regimented border. Keep the machine's
// foreground and the guest clearing open, with taller planting toward the rear.
const TALL_TREES = [[0, 0], [5, 0], [11, 0], [17, 0], [22, 0], [23, 5], [25, 11], [0, 3], [24, 18]];
const ROUND_TREES = [[2, 0], [0, 5], [23, 2], [7, 20], [8, 15], [23, 21]];
const BUSHES = [[1, 0], [10, 0], [16, 0], [1, 5], [1, 6], [24, 9], [25, 14], [6, 15], [8, 22], [16, 24], [22, 22]];
const ROCKS = [[0, 6], [0, 13], [15, 22], [24, 16]];

// ---------------------------------------------------------------- tiny pixel helpers

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const noise = (a, b, seed) => {
  let n = Math.imul(a + 1013, 374761393) ^ Math.imul(b + 7919, 668265263) ^ Math.imul(seed + 31, 2246822519);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};
const R = (c, color, x, y, w = 1, h = 1) => { c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), w, h); };

function diamond(c, cx, ty, color, hw = HW, hh = HH) {
  c.fillStyle = color;
  for (let r = 0; r < hh * 2; r++) {
    const w = Math.round((r < hh ? r + 1 : hh * 2 - r) * hw / hh);
    c.fillRect(Math.round(cx - w), Math.round(ty + r), w * 2, 1);
  }
}

export function ellipse(c, cx, cy, rx, ry, color) {
  c.fillStyle = color;
  for (let dy = -ry; dy <= ry; dy++) {
    const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy / (ry + 0.5)) ** 2)));
    if (half > 0) c.fillRect(Math.round(cx - half), Math.round(cy + dy), half * 2, 1);
  }
}

// Columns of a wall face that runs down-right (slope +.5) or up-right (slope -.5).
function face(c, x0, y0, len, slope, top, bottom, color) {
  c.fillStyle = color;
  for (let i = 0; i < len; i++) {
    const g = Math.floor(y0 + i * slope);
    c.fillRect(x0 + i, g - top, 1, top - bottom);
  }
}

// A leafy, clumpy canopy lit from the top-left, like the reference art.
// taper > 0 narrows the top into an egg shape.
const LEAF = ['#d3e58c', '#aecb66', '#86b153', '#66953f', '#4d7936'];
const LEAF_OUT = '#2e4a2a';
function leafy(c, cx, cy, rx, ry, seed, taper = 0) {
  const rows = [];
  for (let dy = -ry; dy <= ry; dy++) {
    const v = dy / ry;
    let half = rx * Math.sqrt(Math.max(0, 1 - v * v));
    if (v < 0) half *= 1 + v * taper;
    rows.push([dy, Math.round(half)]);
  }
  for (const [dy, half] of rows) if (half > 0) { R(c, LEAF_OUT, cx - half - 1, cy + dy, half * 2 + 2, 1); R(c, LEAF_OUT, cx - half, cy + dy - 1, half * 2, 1); R(c, LEAF_OUT, cx - half, cy + dy + 1, half * 2, 1); }
  for (const [dy, half] of rows) {
    for (let dx = -half; dx < half; dx++) {
      const clump = noise(Math.floor((dx + 64) / 3), Math.floor((dy + 64) / 3), seed) - 0.5;
      const s = (dx / rx) * 0.55 + (dy / ry) * 0.9 + clump * 0.6 + (noise(dx, dy, seed + 1) - 0.5) * 0.15;
      R(c, LEAF[s < -0.8 ? 0 : s < -0.3 ? 1 : s < 0.15 ? 2 : s < 0.6 ? 3 : 4], cx + dx, cy + dy);
    }
  }
}

const sprite = (w, h, ax, ay, draw) => {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d');
  draw(c, ax, ay);
  return { cv, ax, ay };
};

const environment = new Map();
// Every PNG is exported at 8x; anchors are the bottom centre of its logical canvas.
export const OBJECT_ASSETS = {
  tree: 'tree-tall', roundtree: 'tree-round', pine: 'pine', bush: 'bush', rock: 'rock', flowers: 'flowers',
  workdesk: 'desk-monitor', readdesk: 'desk-reading', chair: 'office-chair', stool: 'stool',
  table: 'round-table', whiteboard: 'whiteboard', pinboard: 'whiteboard', shelf: 'bookshelf',
  rack: 'server-rack', cabinet: 'filing-cabinet', cooler: 'water-cooler', printer: 'printer',
  coffee: 'coffee-cart', cafebench: 'bench', plant: 'potted-plant', sign: 'signpost',
  gate: 'entrance-gate', center: 'pokemon-center', productmachine: 'product-machine',
  cliffleft: 'cliff-left', cliffright: 'cliff-right', waterfall: 'waterfall',
};
export const TILE_ASSETS = {
  g: 'tile-grass', d: 'tile-dirt', w: 'tile-water', p: 'tile-planks', k: 'tile-carpet', c: 'tile-stone',
};

export async function loadEnvironmentAssets() {
  const assets = [
    ...[...new Set([...Object.values(OBJECT_ASSETS), ...Object.values(TILE_ASSETS)])].map((name) => ({ name, directory: 'environment', pixelScale: 1 / 8 })),
  ];
  await Promise.all(assets.map(async ({ name, directory, pixelScale }) => {
    try {
      const image = new Image();
      // onload rather than decode(): decode() can stall in a background tab and hold up the whole app.
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
        image.src = new URL(`./assets/${directory}/${name}.png`, import.meta.url).href;
      });
      // Restore the environment's base pixel grid without smoothing.
      const cv = document.createElement('canvas');
      if (image.naturalWidth % 8 || image.naturalHeight % 8) throw new Error(`${name} must use the 8x pixel grid`);
      cv.width = image.naturalWidth * pixelScale;
      cv.height = image.naturalHeight * pixelScale;
      const c = cv.getContext('2d');
      c.imageSmoothingEnabled = false;
      c.drawImage(image, 0, 0, cv.width, cv.height);
      environment.set(name, { cv, ax: cv.width / 2, ay: cv.height, asset: name });
    } catch (error) {
      console.warn(`Could not load environment asset ${name}; using procedural fallback.`, error);
    }
  }));
}

// ---------------------------------------------------------------- palette (muted, like the reference)

const PAL = { r: '#cf5b52', a: '#d8b47a', g: '#6f9b49', d: '#c7a26a', p: '#b48a5a', c: '#c4beb0', w: '#4a7ec4', k: '#8192a5', n: '#8e9f80', f: '#bdc7cd', s: '#c6b38e', h: '#8da669' };
const SLAB_L = '#25303b', SLAB_R = '#1a222b', SLAB_EDGE = '#141a21';

// ---------------------------------------------------------------- world

export function buildWorld() {
  const t = Array.from({ length: W }, (_, x) => Array.from({ length: H }, (_, y) => isIslandTile(x, y) ? 'g' : null));
  const set = (x, y, v, only) => { if (isIslandTile(x, y) && (!only || only.includes(t[x][y]))) t[x][y] = v; };

  const floor = (x0, y0, x1, y1, kind) => {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) set(x, y, kind);
  };
  // Reuse the floor palette to give each real room a quiet, readable identity.
  for (const room of OFFICE_ROOMS) {
    const [x0,y0,x1,y1] = room.bounds;
    floor(x0-1,y0-1,x1+1,y1+1,room.floor);
  }
  set(20, 22, 'c');
  for (const [x, y] of WATER) set(x, y, 'w');

  floor(2, 10, 4, 12, 'r'); // chill: a picnic rug on the riverbank
  floor(13, 19, 14, 20, 'a'); // arena sits across the open lawn from the office

  const objects = [];
  const seats = new Map();
  const add = (kind, x, y, extra = {}) => { const o = { kind, x, y, block: true, depth: x + y + 1, ...extra }; objects.push(o); return o; };
  TALL_TREES.forEach(([x, y]) => add('tree', x, y));
  ROUND_TREES.forEach(([x, y]) => add('roundtree', x, y));
  BUSHES.forEach(([x, y]) => add('bush', x, y));
  ROCKS.forEach(([x, y]) => add('rock', x, y));
  for (const wall of officeWalls()) add('officewall', wall.x, wall.y, { ...wall });

  add('shelf', 1, 1);
  // Desks keep their established depth split: chair, worker, then the tabletop.
  for (const [zone, kind] of [['taubat', 'workdesk'], ['keluar', 'workdesk'], ['design', 'readdesk'], ['workshop', 'workdesk'], ['library', 'readdesk']]) {
    for (const [x, y] of ZONES[zone].seats) {
      add('chair', x, y, { block: false, depth: x + y + 0.7, at: shift(x, y, 0, -3) });
      seats.set(`${x},${y}`, add(kind, x, y, { block: false, depth: x + y + 1.3, at: shift(x, y, 0, 8) }));
    }
  }
  add('shelf', 8, 2);
  add('shelf', 14, 2);
  add('productmachine', ...PRODUCT_MACHINE, { at: toScreen(PRODUCT_MACHINE[0]+.5, PRODUCT_MACHINE[1]+.5), depth: PRODUCT_MACHINE[0]+PRODUCT_MACHINE[1]+.6 });
  for (const [x, y] of ZONES.meeting.seats) {
    seats.set(`${x},${y}`, add('stool', x, y, { block: false, depth: x + y + 0.7, at: shift(x, y, 0, -3) }));
  }
  add('table', 12, 11);
  add('whiteboard', 19, 2);
  add('rack', 20, 10);
  add('cabinet', ...OUTBOX);
  add('coffee', 3, 9);
  add('cooler', 20, 13);
  add('printer', 16, 2);
  for (const [x, y] of [[2, 5], [8, 10], [8, 14], [11, 18], [22, 17]]) add('flowers', x, y, { block: false });
  // Chill area: beanbags on the rug under a parasol; the benches double as arena seating.
  for (const [[x, y], variant] of [[[2, 11], 0], [[4, 11], 1], [[3, 12], 2]]) add('beanbag', x, y, { block: false, variant, depth: x + y + 0.6 });
  add('parasol', 3, 11, { block: false });
  add('arena', 14, 20, { block: false, depth: 0, at: toScreen(14, 20) });
  add('cafebench', 9, 19);
  add('cafebench', 23, 15);

  for (const [x, y] of [[4, 2], [10, 2], [16, 6], [21, 8], [18, 21]]) add('plant', x, y, { block: false });
  // Furniture identifies each clearing; a plain timber arch marks the entrance.
  add('gate', 11, 23);
  add('center', 20, 21, { block: false, depth: 42.2, at: toScreen(21, 22) });

  for (const o of objects) o.at ??= toScreen(o.x + 0.5, o.y + 0.5);
  const blocked = new Set(objects.filter((o) => o.block).map((o) => `${o.x},${o.y}`));
  BUILDING.forEach(([x, y]) => blocked.add(`${x},${y}`));
  for (const dx of [0, 1]) for (const dy of [-1, 0]) blocked.add(`${PRODUCT_MACHINE[0]+dx},${PRODUCT_MACHINE[1]+dy}`);
  const walkable = (x, y, swim = false) =>
    isIslandTile(x, y) && !blocked.has(`${x},${y}`) && (t[x][y] !== 'w' || swim);

  // Lounging spots all over the campus, not just the picnic: open grass a couple of tiles apart,
  // clear of desks, paths, buildings and other areas' spots.
  const used = new Set(Object.values(ZONES).flatMap((z) => [...(z.spots ?? []), ...(z.water ?? [])]).map((s) => s.join(',')));
  const lounge = [];
  for (let x = 1; x < W - 1; x++) for (let y = 1; y < H - 1; y++) {
    const k = `${x},${y}`;
    if (t[x][y] !== 'g' || !walkable(x, y) || seats.has(k) || used.has(k)) continue;
    if (lounge.some(([lx, ly]) => Math.abs(lx - x) < 2 && Math.abs(ly - y) < 2)) continue;
    lounge.push([x, y]);
  }
  ZONES.chill.picnic = ZONES.chill.spots.length; // the first spots are the picnic itself
  ZONES.chill.spots = [...ZONES.chill.spots, ...lounge];
  ZONES.chill.scatter = true;
  const world = { terrain: t, objects, seats, walkable, isWater: (x, y) => t[x]?.[y] === 'w' };
  world.terrainCanvas = drawTerrain(t, objects);
  for (const o of objects) o.spr = objectSprite(o);
  checkReachable(world);
  return world;
}

function checkReachable(world) {
  const seen = new Set([GATE.join(',')]);
  const q = [GATE];
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = `${x + dx},${y + dy}`;
      if (!seen.has(k) && world.walkable(x + dx, y + dy)) { seen.add(k); q.push([x + dx, y + dy]); }
    }
  }
  for (const [name, z] of Object.entries(ZONES)) {
    for (const s of z.spots) if (!seen.has(s.join(','))) console.warn(`Spot ${s} in ${name} is unreachable`);
  }
}

// ---------------------------------------------------------------- terrain layer (drawn once)

function drawTerrain(t, objects) {
  const cv = document.createElement('canvas');
  cv.width = BASE_W; cv.height = BASE_H;
  const c = cv.getContext('2d');
  c.imageSmoothingEnabled = false;
  const rand = rng(7);

  // Every exposed contour segment gets its own cliff face, including inlets.
  for (const edge of exposedEdges(t)) slab(c, edge.x, edge.y, edge.side, edge.tile);

  // Exact 48x24 masks tessellate on the same 2:1 grid as every prop.
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
    if (!t[x][y]) continue;
    const [cx, ty] = toScreen(x, y);
    const tile = environment.get(TILE_ASSETS[t[x][y]]);
    if (tile && !['g', 'd', 'w'].includes(t[x][y])) c.drawImage(tile.cv, cx - HW, ty);
    else diamond(c, cx, ty, PAL[t[x][y]]);
  }
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if (t[x][y]) tileDetail(c, t, x, y, rand);

  // The river drops over one front-left edge segment. Its top follows that edge;
  // the bottom anchor includes the foam below the cliff, rather than floating on grass.
  const waterfall = environment.get(OBJECT_ASSETS.waterfall);
  if (waterfall) {
    const [cx, ty] = toScreen(...WATERFALL_TILE);
    // A shallow lip on the river surface connects the falling sheet to the water.
    for (let i = 0; i < HW; i++) {
      const y = ty + HH + Math.floor(i / 2);
      R(c, '#6c9bd4', cx - HW + i, y - 3, 1, 3);
      if (i < 6 || (i > 9 && i < 17)) R(c, '#8bbcf0', cx - HW + i, y - 1, 1, 2);
    }
    c.drawImage(waterfall.cv, cx - HW, ty + HH);
  }

  // Low-contrast footprints share the top-left light of the sprites. Use each
  // prop's actual anchor, including the seating offsets, so feet stay grounded.
  const footprints = {
    workdesk: [19, 6, -5], readdesk: [19, 6, -5], chair: [9, 3, -2],
    stool: [9, 3, -2], table: [18, 6, -4], shelf: [13, 4, -3],
    whiteboard: [15, 4, -3], pinboard: [15, 4, -3], rack: [13, 5, -4],
    cabinet: [10, 4, -3], cooler: [6, 3, -2], printer: [10, 3, -2],
    coffee: [17, 5, -4], cafebench: [17, 4, -3], plant: [6, 3, -2],
    bag: [7, 2, -1], rock: [9, 3, -2], productmachine: [48, 10, -9],
    center: [43, 12, -12], beanbag: [10, 4, -2],
  };
  for (const o of objects) {
    const [sx, sy] = o.at ?? toScreen(o.x + 0.5, o.y + 0.5);
    if (['tree', 'roundtree', 'pine'].includes(o.kind)) ellipse(c, sx + 3, sy + 1, 16, 7, 'rgba(30,60,25,.35)');
    if (o.kind === 'bush') ellipse(c, sx + 2, sy, 11, 4, 'rgba(30,60,25,.3)');
    const foot = footprints[o.kind];
    if (foot) ellipse(c, sx + 3, sy + foot[2] + 2, foot[0], foot[1], 'rgba(30,48,35,.18)');
  }
  return cv;
}

const inDiamond = (cx, ty, rand, pad = 0.15) => {
  const u = pad + rand() * (1 - 2 * pad), v = pad + rand() * (1 - 2 * pad);
  return [cx + (u - v) * HW, ty + (u + v) * HH];
};

// Points along one edge of a tile's diamond; side is the neighbour's direction.
function edge(cx, ty, side, i) {
  const k = i / HW;
  const T = [cx, ty], Rt = [cx + HW, ty + HH], B = [cx, ty + 2 * HH], L = [cx - HW, ty + HH];
  const [a, b] = { up: [T, Rt], left: [L, T], right: [Rt, B], down: [B, L] }[side];
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
}

function tileDetail(c, t, x, y, rand) {
  const type = t[x][y];
  // Ground details are sparse and varied across the whole garden, without a repeating tile stamp.
  if (!['g', 'd', 'w', 'p'].includes(type) && environment.has(TILE_ASSETS[type])) return;
  const [cx, ty] = toScreen(x, y);
  if (type === 'r') { // picnic rug: white checks on red
    for (const [u, v] of [[0.25, 0.25], [0.75, 0.75], [0.25, 0.75], [0.75, 0.25]]) {
      if ((u + v) % 1 === 0) diamond(c, cx + (u - v) * HW, ty + (u + v) * HH - 6, '#f4ece0', 12, 6);
    }
    return;
  }
  if (type === 'a') { // arena sand
    for (let i = 0; i < 5; i++) { const [px, py] = inDiamond(cx, ty, rand, 0.1); R(c, rand() < 0.5 ? '#c49d63' : '#e6c792', px, py, 2, 1); }
    return;
  }
  if (type === 'k' || type === 'n') {
    // Quiet woven flecks read as one floor, without outlining every tile.
    const shade = type === 'k' ? '#7b8c9f' : '#869778';
    const light = type === 'k' ? '#8c9db0' : '#9aaa8c';
    for (let i = 0; i < 4; i++) { const [px, py] = inDiamond(cx, ty, rand, 0.15); R(c, rand() < 0.5 ? shade : light, px, py); }
    return;
  }
  if (type === 's') {
    // Broad limestone pavers use restrained joints and occasional warm flecks.
    if (x % 2 === 0) for (let i = 0; i < HW; i++) R(c, '#b9a881', cx + i, ty + i / 2);
    for (let i = 0; i < 3; i++) { const [px, py] = inDiamond(cx, ty, rand, 0.2); R(c, '#d2c09b', px, py, 2, 1); }
    return;
  }
  if (type === 'h') {
    for (let i = 0; i < 2; i++) {
      const [px, py] = inDiamond(cx, ty, rand, 0.25);
      R(c, '#a5bf7d', px, py, 1, 2); R(c, '#a5bf7d', px + 2, py + 1, 1, 1);
    }
    return;
  }
  if (type === 'f') {
    for (let i = 0; i < HW; i++) { R(c, '#a9afb6', cx - HW + i, ty + HH - i / 2); R(c, '#a9afb6', cx + i, ty + i / 2); }
    for (const [u, v] of [[0.35, 0.35], [0.65, 0.35], [0.35, 0.65], [0.65, 0.65]]) R(c, '#b4bac1', cx + (u - v) * HW, ty + (u + v) * HH);
    return;
  }
  if (type === 'g') {
    for (let i = 0; i < 2; i++) {
      if (rand() < 0.5) continue;
      const [px, py] = inDiamond(cx, ty, rand, 0.23);
      // Small readable blades, with plenty of untouched colour between clumps.
      const color = rand() < 0.6 ? '#94bd5f' : '#527e3e';
      R(c, color, px - 2, py, 1, 2);
      R(c, color, px, py - 1, 1, 3);
      R(c, color, px + 2, py + 1, 1, 1);
    }
    if (rand() < 0.06) {
      const [px, py] = inDiamond(cx, ty, rand, 0.3);
      R(c, '#3f6e33', px, py + 1, 1, 2);
      const petal = ['#e2553f', '#f2c14e', '#f4efe2'][Math.floor(rand() * 3)];
      R(c, petal, px - 1, py - 1, 3, 2); R(c, petal, px, py - 2); R(c, '#ffd36b', px, py - 1);
    }
  } else if (type === 'd') {
    for (let i = 0; i < 2; i++) { const [px, py] = inDiamond(cx, ty, rand, 0.18); R(c, rand() < 0.6 ? '#a8854f' : '#dcbd86', px, py, 2, 1); }
    if (rand() < 0.28) {
      const [px, py] = inDiamond(cx, ty, rand, 0.3);
      R(c, '#a8854f', px, py, 3, 2);
      R(c, '#dcbd86', px, py, 2, 1);
      R(c, '#a8854f', px + 5, py + 2, 1, 1);
    }
  } else if (type === 'p') {
    if (environment.has(TILE_ASSETS.p)) {
      if (rand() < 0.3) {
        const [px, py] = inDiamond(cx, ty, rand, 0.3);
        R(c, '#a37c50', px, py, 3, 1);
        R(c, '#c69b68', px + 2, py + 1, 2, 1);
      }
      return;
    }
    for (const v of [0, 0.34, 0.67]) {
      const x0 = cx - v * HW, y0 = ty + v * HH;
      for (let i = 0; i < HW; i++) R(c, '#a37c50', x0 + i, y0 + i / 2);
    }
  } else if (type === 'c') {
    for (const [u, v] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
      const px = cx + (u - v) * HW, py = ty + (u + v) * HH;
      diamond(c, px, py - 5, '#a39d90', 10, 5);
      diamond(c, px, py - 4, rand() < 0.5 ? '#d2ccbe' : '#c8c1b2', 9, 4);
    }
  } else if (type === 'w') {
    // Wave dashes belong to the animated layer; keep the riverbed calm and flat.
    // A brown bank where the river meets land, deeper water just inside it.
    const land = (nx, ny) => !!t[nx]?.[ny] && t[nx][ny] !== 'w';
    const sides = { up: [x, y - 1], left: [x - 1, y], right: [x + 1, y], down: [x, y + 1] };
    for (const [side, [nx, ny]] of Object.entries(sides)) {
      if (!land(nx, ny)) continue;
      const back = side === 'up' || side === 'left';
      for (let i = 0; i < HW; i++) {
        const [px, py] = edge(cx, ty, side, i);
        R(c, '#7d5a35', px, py, 1, back ? 2 : 1);
        if (back) R(c, '#3f6db0', px, py + 2, 1, 2);
        // A restrained waterline gives the bank thickness without a bright outline.
        else R(c, '#6c9bd4', px, py - 1, 1, 1);
      }
    }
  }
}

function slab(c, x, y, side, type) {
  const [cx, ty] = toScreen(x, y);
  const x0 = side === 'left' ? cx - HW : cx;
  const y0 = side === 'left' ? ty + HH : ty + HH * 2;
  const slope = side === 'left' ? 0.5 : -0.5;
  const cliff = environment.get(OBJECT_ASSETS[side === 'left' ? 'cliffleft' : 'cliffright']);
  if (cliff) {
    c.drawImage(cliff.cv, x0, ty + HH);
    // The water lip replaces the grassy overhang only on river edge segments.
    if (type === 'w') for (let i = 0; i < HW; i++) R(c, '#4a7ec4', x0 + i, Math.floor(y0 + i * slope), 1, 2);
    return;
  }
  for (let i = 0; i < HW; i++) {
    const g = Math.floor(y0 + i * slope);
    R(c, side === 'left' ? SLAB_L : SLAB_R, x0 + i, g, 1, SIDE);
    if (type === 'w') R(c, '#3a669f', x0 + i, g, 1, 3);
    R(c, SLAB_EDGE, x0 + i, g + SIDE - 1, 1, 1);
  }
}

// ---------------------------------------------------------------- object sprites (cached)

const BOOKS = ['#d64545', '#3f7fd6', '#e8c547', '#4fae5a', '#9b59b6', '#e67e22', '#ecf0f1'];
const BINDERS = ['#2f5f9e', '#d64545', '#4fae5a', '#e0a832', '#5d6670', '#7a5aa8'];
const WOOD = { dark: '#4f2f19', mid: '#7b4a2b', light: '#a06a3c', top: '#c08a52', topLight: '#d6a46a' };

// Plain timber surfaces share the floor's exact 2:1 diamond and the reference desks' palette.
function woodenTable(c, ax, ay, hw) {
  const hh = hw / 2, top = ay - 12 - hw;
  for (const [dx, dy] of [[-hw + 3, -hh], [hw - 6, -hh], [-2, 0]]) {
    R(c, '#293238', ax + dx, ay + dy - 14, 5, 14);
    R(c, '#94613d', ax + dx + 1, ay + dy - 13, 3, 12);
    R(c, '#bb8955', ax + dx + 1, ay + dy - 13, 1, 11);
  }
  diamond(c, ax, top, '#293238', hw, hh);
  diamond(c, ax, top + 1, '#c7a26a', hw - 2, hh - 1);
  face(c, ax - hw, top + hh, hw, 0.5, 0, -3, '#94613d');
  face(c, ax, top + hw, hw, -0.5, 0, -3, '#70492e');
  for (let i = 2; i < hw - 1; i++) R(c, '#dfbd86', ax - hw + i, top + hh - Math.floor(i / 2), 1, 1);
}

function objectSprite(o) {
  const replacement = environment.get(OBJECT_ASSETS[o.kind]);
  if (replacement) return replacement;
  const r = rng(o.x * 31 + o.y * 17 + 3);
  const seed = o.x * 97 + o.y * 13;
  switch (o.kind) {
    case 'tree': return sprite(48, 84, 24, 78, (c, ax, ay) => {
      R(c, '#5c3a22', ax - 4, ay - 11, 8, 11); R(c, '#7a5032', ax - 4, ay - 11, 4, 11);
      R(c, '#5c3a22', ax - 7, ay - 2, 3, 2); R(c, '#5c3a22', ax + 4, ay - 2, 3, 2);
      leafy(c, ax, ay - 38, 17, 27, seed, 0.38);
    });
    case 'roundtree': return sprite(50, 66, 25, 60, (c, ax, ay) => {
      R(c, '#5c3a22', ax - 4, ay - 13, 8, 13); R(c, '#7a5032', ax - 4, ay - 13, 4, 13);
      R(c, '#5c3a22', ax - 7, ay - 2, 3, 2); R(c, '#5c3a22', ax + 4, ay - 2, 3, 2);
      leafy(c, ax, ay - 33, 19, 19, seed, 0.12);
    });
    case 'bush': return sprite(28, 24, 14, 21, (c, ax, ay) => {
      leafy(c, ax, ay - 8, 11, 8, seed, 0);
      for (const [dx, dy] of [[-5, -10], [3, -12], [5, -6], [-2, -5]]) { R(c, '#c8384a', ax + dx, ay + dy, 2, 2); R(c, '#ffc9cf', ax + dx, ay + dy); }
    });
    case 'rock': return sprite(24, 16, 12, 14, (c, ax, ay) => {
      ellipse(c, ax, ay - 5, 9, 5, '#4f565c'); ellipse(c, ax, ay - 6, 8, 4, '#8d949a'); ellipse(c, ax - 2, ay - 8, 4, 2, '#b7bdc2');
    });
    case 'shelf': return sprite(32, 46, 16, 42, (c, ax, ay) => {
      // A shallow timber bookcase, with the shelves following the island's diagonal.
      for (let u = 0; u < 5; u++) {
        const top = ay - 30 - Math.floor(u / 2);
        R(c, '#25303b', ax + 9 + u, top, 1, 31);
        R(c, '#7b4a2b', ax + 9 + u, top + 1, 1, 29);
      }
      for (let u = 0; u < 23; u++) {
        const top = ay - 41 + Math.floor(u / 2);
        R(c, '#25303b', ax - 13 + u, top, 1, 31);
        R(c, '#c08a52', ax - 13 + u, top + 1, 1, 29);
        if (u > 1 && u < 21) R(c, '#7b4a2b', ax - 13 + u, top + 3, 1, 25);
        R(c, '#d6b17c', ax - 13 + u, top + 1);
      }
      const spines = ['#a36154', '#607f8b', '#91a164', '#c7a45e', '#82758d'];
      for (let s = 0; s < 3; s++) {
        for (let u = 3; u < 20; u += 3) {
          const col = spines[Math.floor(r() * spines.length)];
          for (let v = 0; v < 2; v++) R(c, col, ax - 13 + u + v, ay - 38 + s * 9 + Math.floor((u + v) / 2), 1, 6);
          R(c, '#e6d9b9', ax - 13 + u, ay - 35 + s * 9 + Math.floor(u / 2));
        }
        for (let u = 2; u < 21; u++) R(c, '#c08a52', ax - 13 + u, ay - 32 + s * 9 + Math.floor(u / 2), 1, 2);
      }
    });
    case 'workdesk': case 'readdesk': return sprite(48, 50, 24, 46, (c, ax, ay) => {
      woodenTable(c, ax, ay, 18);
      if (o.kind === 'workdesk') {
        // Monitor seen from behind, off to the left so the worker's face stays visible.
        R(c, '#4a5058', ax - 12, ay - 31, 2, 4); R(c, '#4a5058', ax - 15, ay - 27, 8, 1);
        R(c, '#1f242b', ax - 18, ay - 42, 14, 12); R(c, '#363d47', ax - 17, ay - 41, 12, 10); R(c, '#4a525d', ax - 17, ay - 41, 12, 1);
        R(c, '#ffffff', ax + 10, ay - 28, 4, 4); R(c, '#7a4a2b', ax + 10, ay - 28, 4, 1); R(c, '#ffffff', ax + 14, ay - 27, 1, 2); // mug
      } else {
        // A small open book at the left edge keeps the sitter's middle clear.
        diamond(c, ax - 8, ay - 28, '#7b4a2b', 8, 4);
        diamond(c, ax - 8, ay - 29, '#eee9d7', 7, 3);
        for (let i = 0; i < 5; i++) R(c, '#c4beb0', ax - 10 + i, ay - 27 + Math.floor(i / 2));
      }
    });
    case 'chair': return sprite(26, 34, 13, 30, (c, ax, ay) => {
      // Black swivel chair: it peeks out around whoever sits in it.
      R(c, '#2a2f36', ax - 9, ay - 2, 18, 2); R(c, '#1b1f24', ax - 9, ay, 2, 1); R(c, '#1b1f24', ax + 7, ay, 2, 1);
      R(c, '#7d8691', ax - 1, ay - 10, 2, 8);
      R(c, '#2f3640', ax - 9, ay - 13, 18, 4);
      R(c, '#2a2f36', ax - 9, ay - 31, 18, 18); R(c, '#3a434f', ax - 8, ay - 30, 16, 16); R(c, '#4f5a68', ax - 7, ay - 29, 14, 2);
      R(c, '#1b1f24', ax - 11, ay - 17, 2, 6); R(c, '#1b1f24', ax + 9, ay - 17, 2, 6);
    });
    case 'stool': return sprite(24, 16, 12, 12, (c, ax, ay) => {
      // A low office chair in front of the sitter: seat, gas lift and star base.
      R(c, '#2a2f36', ax - 9, ay - 11, 18, 5); R(c, '#3a434f', ax - 8, ay - 10, 16, 2);
      R(c, '#7d8691', ax - 1, ay - 6, 2, 4); R(c, '#2a2f36', ax - 8, ay - 2, 16, 2);
    });
    case 'table': return sprite(44, 38, 22, 36, (c, ax, ay) => woodenTable(c, ax, ay, 18));
    case 'collabtable': return sprite(72, 48, 36, 44, (c, ax, ay) => {
      woodenTable(c, ax, ay, 30);
    });
    case 'pinboard': return sprite(46, 58, 23, 54, (c, ax, ay) => {
      R(c, '#25303b', ax - 15, ay - 28, 4, 22); R(c, '#25303b', ax + 13, ay - 14, 4, 17);
      R(c, '#c08a52', ax - 14, ay - 27, 2, 20); R(c, '#a06a3c', ax + 14, ay - 13, 2, 15);
      // The easel's visible face runs down-right at one pixel per two columns.
      for (let u = 0; u < 40; u++) {
        const top = ay - 54 + Math.floor(u / 2);
        R(c, '#25303b', ax - 20 + u, top, 1, 30);
        if (u > 0 && u < 39) {
          R(c, '#a06a3c', ax - 20 + u, top + 1, 1, 28);
          R(c, '#d6b17c', ax - 20 + u, top + 1, 1, 2);
        }
        if (u > 2 && u < 37) R(c, '#ddc79e', ax - 20 + u, top + 4, 1, 22);
      }
      const swatches = o.variant === 1 ? ['#d9bb73', '#bbcb9a', '#a8bfd1', '#d9bb73', '#c3b0cb', '#d29583'] : ['#c5afcf', '#93b8c5', '#c1d092', '#dba58b', '#e0c981', '#a4bea1'];
      for (let i = 0; i < 6; i++) {
        const u = 5 + (i % 3) * 11, v = 7 + Math.floor(i / 3) * 10;
        for (let j = 0; j < 8; j++) {
          const py = ay - 54 + Math.floor((u + j) / 2) + v;
          R(c, '#b89a71', ax - 19 + u + j, py + 1, 1, 7);
          R(c, swatches[i], ax - 20 + u + j, py, 1, 6);
        }
        R(c, '#f1e6cf', ax - 17 + u, ay - 54 + Math.floor((u + 3) / 2) + v);
      }
    });
    case 'planter': return sprite(44, 29, 22, 25, (c, ax, ay) => {
      diamond(c, ax, ay - 18, '#bf9870', 18, 7);
      face(c, ax - 18, ay - 11, 18, 7 / 18, 0, -7, '#99734f');
      face(c, ax, ay - 4, 18, -7 / 18, 0, -7, '#77563c');
      diamond(c, ax, ay - 16, '#665438', 15, 5);
      leafy(c, ax - 8, ay - 16, 7, 4, seed, 0);
      leafy(c, ax + 6, ay - 17, 8, 5, seed + 1, 0);
      R(c, '#d3e58c', ax - 10, ay - 18, 3, 1); R(c, '#aecb66', ax + 3, ay - 20, 4, 1);
    });
    case 'cafebench': return sprite(56, 38, 28, 34, (c, ax, ay) => {
      R(c, WOOD.dark, ax - 18, ay - 13, 3, 13); R(c, WOOD.dark, ax + 15, ay - 13, 3, 13);
      R(c, WOOD.dark, ax - 2, ay - 7, 3, 10);
      diamond(c, ax, ay - 24, '#c7a26a', 20, 10);
      face(c, ax - 20, ay - 14, 20, 0.5, 0, -3, '#946139');
      face(c, ax, ay - 4, 20, -0.5, 0, -3, '#704528');
      for (let i = 0; i < 20; i++) { const py = ay - 14 - i * 0.5; R(c, WOOD.dark, ax - 20 + i, py - 10, 1, 7); R(c, '#bb8955', ax - 20 + i, py - 9, 1, 5); }
      R(c, WOOD.dark, ax - 20, ay - 24, 2, 10); R(c, WOOD.dark, ax - 1, ay - 33, 2, 10);
    });
    case 'whiteboard': return sprite(48, 62, 24, 58, (c, ax, ay) => {
      // Whiteboard on a wheeled metal frame.
      R(c, '#8d96a0', ax - 19, ay - 30, 2, 27); R(c, '#8d96a0', ax + 17, ay - 30, 2, 27);
      R(c, '#4a5058', ax - 23, ay - 4, 10, 2); R(c, '#4a5058', ax + 13, ay - 4, 10, 2);
      for (const wx of [-22, -14, 14, 22]) R(c, '#1b1f24', ax + wx - 1, ay - 2, 2, 2);
      R(c, '#9aa3ad', ax - 21, ay - 57, 42, 31); R(c, '#fbfbf8', ax - 20, ay - 56, 40, 28);
      R(c, '#8d96a0', ax - 20, ay - 28, 40, 2); R(c, '#e2553f', ax - 14, ay - 29, 4, 1); R(c, '#3f7fd6', ax - 8, ay - 29, 4, 1);
      R(c, '#f2d25a', ax - 17, ay - 53, 7, 6); R(c, '#f39ac0', ax - 8, ay - 53, 7, 6); R(c, '#9ad0ff', ax + 1, ay - 53, 7, 6);
      R(c, '#4fae5a', ax - 16, ay - 37, 3, 5); R(c, '#3f7fd6', ax - 12, ay - 40, 3, 8); R(c, '#e2553f', ax - 8, ay - 35, 3, 3);
      for (let i = 0; i < 3; i++) R(c, '#b8bec4', ax + 2, ay - 42 + i * 3, 14 - i * 3, 1);
    });
    case 'rack': return sprite(32, 66, 16, 60, (c, ax, ay) => {
      // Server rack: dark cabinet, a side panel, and slots for blinking lights.
      R(c, '#0f1215', ax - 12, ay - 56, 24, 56); R(c, '#232931', ax - 11, ay - 55, 18, 54); R(c, '#181c22', ax + 7, ay - 55, 4, 54);
      R(c, '#3a424c', ax - 12, ay - 58, 24, 3);
      for (let i = 0; i < 9; i++) { R(c, '#2e3540', ax - 10, ay - 52 + i * 5, 16, 4); R(c, '#3b4350', ax - 10, ay - 52 + i * 5, 16, 1); }
      R(c, '#0f1215', ax - 11, ay - 2, 3, 2); R(c, '#0f1215', ax + 8, ay - 2, 3, 2);
    });
    case 'cabinet': return sprite(24, 36, 12, 32, (c, ax, ay) => {
      // Warm wooden drawers; preserve the delivery tray and drawer animation anchors.
      R(c, '#25303b', ax - 9, ay - 27, 18, 27); R(c, '#c08a52', ax - 8, ay - 26, 16, 25);
      R(c, '#d6b17c', ax - 8, ay - 26, 16, 1); R(c, '#7b4a2b', ax + 6, ay - 25, 2, 24);
      for (const dy of [-18, -9]) R(c, '#7b4a2b', ax - 8, ay + dy, 16, 1);
      for (const dy of [-23, -14, -5]) { R(c, '#4f392b', ax - 2, ay + dy, 4, 1); R(c, '#e1bc77', ax - 1, ay + dy, 2, 1); }
      R(c, '#25303b', ax - 9, ay - 30, 18, 3); R(c, '#a06a3c', ax - 8, ay - 30, 16, 1);
    });
    case 'bag': return sprite(18, 14, 9, 12, (c, ax, ay) => {
      const [dark, mid] = [['#1b1f24', '#2f3640'], ['#4f2f19', '#8a5a35'], ['#1d2c4a', '#2f4a7a']][o.variant ?? 0];
      R(c, dark, ax - 7, ay - 9, 14, 9); R(c, mid, ax - 6, ay - 8, 12, 7); R(c, dark, ax - 6, ay - 5, 12, 1);
      R(c, dark, ax - 3, ay - 11, 6, 2); R(c, '#e3b64a', ax - 1, ay - 6, 2, 2);
    });
    case 'plant': return sprite(22, 30, 11, 26, (c, ax, ay) => {
      R(c, '#9a9488', ax - 5, ay - 9, 10, 9); R(c, '#f1ede5', ax - 4, ay - 9, 8, 8); R(c, '#d8d2c5', ax + 1, ay - 9, 3, 8);
      leafy(c, ax, ay - 17, 8, 8, o.x * 7 + o.y, 0.25);
    });
    case 'cooler': return sprite(16, 36, 8, 32, (c, ax, ay) => {
      R(c, '#9aa3ad', ax - 5, ay - 20, 10, 20); R(c, '#eef0f2', ax - 4, ay - 19, 8, 18);
      R(c, '#e2553f', ax - 3, ay - 15, 2, 2); R(c, '#3f7fd6', ax + 1, ay - 15, 2, 2);
      R(c, '#4a7ec4', ax - 4, ay - 31, 8, 11); R(c, '#8bc0ee', ax - 3, ay - 30, 3, 9); R(c, '#4a7ec4', ax - 2, ay - 33, 4, 2);
    });
    case 'printer': return sprite(26, 24, 13, 20, (c, ax, ay) => {
      R(c, '#7d8691', ax - 4, ay - 8, 8, 8);
      R(c, '#4a5058', ax - 10, ay - 17, 20, 9); R(c, '#cfd4d9', ax - 9, ay - 16, 18, 7); R(c, '#eef0f2', ax - 9, ay - 16, 18, 1);
      R(c, '#ffffff', ax - 6, ay - 20, 12, 3); R(c, '#2a2f36', ax - 7, ay - 12, 14, 1); R(c, '#4fae5a', ax + 6, ay - 14);
    });
    case 'coffee': return sprite(28, 40, 14, 36, (c, ax, ay) => {
      // A compact espresso machine on a timber cabinet aligned with the deck.
      face(c, ax - 12, ay - 19, 12, 0.5, 0, -13, '#25303b');
      face(c, ax, ay - 13, 12, -0.5, 0, -13, '#25303b');
      face(c, ax - 11, ay - 18, 10, 0.5, 0, -11, '#c08a52');
      face(c, ax + 1, ay - 12, 10, -0.5, 0, -11, '#7b4a2b');
      diamond(c, ax, ay - 25, '#25303b', 12, 6);
      diamond(c, ax, ay - 24, '#d6b17c', 10, 5);
      R(c, '#4f392b', ax - 7, ay - 13, 3, 1); R(c, '#e1bc77', ax - 6, ay - 13);
      for (let u = 0; u < 12; u++) {
        const top = ay - 35 + Math.floor(u / 2);
        R(c, '#25303b', ax - 6 + u, top, 1, 13);
        if (u > 0 && u < 11) R(c, '#b6b5a8', ax - 6 + u, top + 1, 1, 3);
        if (u > 1 && u < 10) R(c, '#39434a', ax - 6 + u, top + 5, 1, 6);
      }
      R(c, '#e9e4d0', ax - 2, ay - 25, 4, 3); R(c, '#f4eddb', ax - 2, ay - 25, 4, 1);
      R(c, '#c76c56', ax + 3, ay - 28);
    });
    case 'beanbag': return sprite(26, 16, 13, 12, (c, ax, ay) => {
      const [dark, mid, light] = [['#8c2f2a', '#d0473f', '#ec7a6c'], ['#2c4f86', '#3f7fd6', '#7fb0ee'], ['#9a7414', '#e0a832', '#f2cf7a']][o.variant ?? 0];
      ellipse(c, ax, ay - 4, 11, 6, dark); ellipse(c, ax, ay - 5, 10, 5, mid); ellipse(c, ax - 3, ay - 7, 5, 2, light);
    });
    case 'parasol': return sprite(40, 52, 20, 48, (c, ax, ay) => {
      R(c, '#d8d2c5', ax - 1, ay - 36, 2, 36); R(c, '#9a9488', ax - 4, ay - 1, 8, 1);
      for (let dy = 0; dy <= 9; dy++) {
        const half = Math.round(4 + dy * 1.7);
        for (let x = -half; x < half; x++) R(c, Math.floor((x + 40) / 5) % 2 ? '#f4ece0' : '#cf5b52', ax + x, ay - 46 + dy);
      }
      R(c, '#8c2f2a', ax - 21, ay - 37, 42, 1); R(c, '#d8d2c5', ax - 1, ay - 49, 2, 3);
    });
    case 'arena': return sprite(104, 56, 52, 28, (c, ax, ay) => {
      // A white ring, a centre line between the two corners, and a Poké Ball in the middle.
      ellipse(c, ax, ay, 42, 20, '#f4ece0'); ellipse(c, ax, ay, 40, 18, '#d8b47a');
      R(c, '#f4ece0', ax - 1, ay - 18, 2, 36);
      ellipse(c, ax, ay, 8, 4, '#2a2a2a'); ellipse(c, ax, ay, 7, 3, '#ffffff');
      c.save(); c.beginPath(); c.rect(ax - 8, ay - 5, 16, 5); c.clip(); ellipse(c, ax, ay, 7, 3, '#e0483e'); c.restore();
      R(c, '#2a2a2a', ax - 7, ay, 14, 1); ellipse(c, ax, ay, 2, 1, '#ffffff');
    });
    case 'sign': return sprite(52, 36, 26, 32, (c, ax, ay) => {
      // A small timber wayfinder belongs to the garden instead of dominating the work.
      R(c, '#61452d', ax - 2, ay - 16, 4, 16); R(c, '#b38a52', ax - 1, ay - 16, 1, 15);
      R(c, '#61452d', ax - 22, ay - 29, 44, 12); R(c, '#d6b882', ax - 21, ay - 28, 42, 10);
      R(c, '#ebd09a', ax - 20, ay - 28, 40, 1); R(c, '#9b7147', ax - 21, ay - 19, 42, 1);
    });
    case 'post': return sprite(12, 50, 6, 46, (c, ax, ay) => {
      R(c, WOOD.dark, ax - 3, ay - 40, 6, 40); R(c, '#8a5530', ax - 2, ay - 40, 3, 40); R(c, '#5e3720', ax - 4, ay - 43, 8, 4);
    });
    case 'gate': return sprite(84, 100, 72, 94, (c, ax, ay) => {
      R(c, WOOD.dark, ax - 3, ay - 40, 6, 40); R(c, '#8a5530', ax - 2, ay - 40, 3, 40);
      for (let i = -54; i <= 6; i++) { const y = ay - 46 + i / 2; R(c, WOOD.dark, ax + i, y - 4, 1, 7); R(c, '#9a6438', ax + i, y - 3, 1, 4); }
      const bx = ax - 24, by = ay - 46 - 12;
      R(c, WOOD.dark, bx - 1, by + 2, 1, 6); R(c, WOOD.dark, bx + 1, by + 3, 1, 6);
      R(c, '#5a3519', bx - 30, by + 8, 60, 13); R(c, '#e9d29b', bx - 29, by + 9, 58, 11); R(c, '#c8955a', bx - 29, by + 18, 58, 2);
    });
    case 'center': return centerSprite();
    default: return null;
  }
}

function centerSprite() {
  // Anchored at the building's front (bottom) corner.
  return sprite(112, 116, 56, 110, (c, ax, ay) => {
    const Hh = 34;
    face(c, ax - 48, ay - 24, 48, 0.5, Hh, 0, '#efe5d0');
    face(c, ax - 48, ay - 24, 48, 0.5, 5, 0, '#c4af8b');
    face(c, ax, ay, 48, -0.5, Hh, 0, '#d4c7ac');
    face(c, ax, ay, 48, -0.5, 5, 0, '#ad9977');
    face(c, ax - 32, ay - 16, 16, 0.5, 24, 4, '#24426b');
    face(c, ax - 31, ay - 15.5, 14, 0.5, 23, 4, '#4d7fb8');
    face(c, ax - 29, ay - 14.5, 3, 0.5, 21, 6, '#a8d4ff');
    face(c, ax - 24, ay - 12, 1, 0.5, 23, 4, '#24426b');
    face(c, ax - 34, ay - 17, 20, 0.5, 31, 26, '#d4483e');
    face(c, ax - 26, ay - 13, 4, 0.5, 30, 27, '#ffffff');
    for (const wx of [10, 30]) { face(c, ax + wx, ay - wx / 2, 10, -0.5, 26, 14, '#5f7a94'); face(c, ax + wx + 1, ay - wx / 2 - 0.5, 8, -0.5, 25, 15, '#9fcbe8'); }
    face(c, ax - 52, ay - 26 - Hh, 52, 0.5, 6, 0, '#9c3029');
    face(c, ax, ay - Hh, 52, -0.5, 6, 0, '#842620');
    diamond(c, ax, ay - 58 - Hh, '#d4483e', 52, 26);
    diamond(c, ax, ay - 50 - Hh, '#df5a4d', 40, 20);
    const bx = ax, by = ay - 32 - Hh;
    ellipse(c, bx, by, 11, 7, '#2a2a2a'); ellipse(c, bx, by, 10, 6, '#ffffff');
    c.save(); c.beginPath(); c.rect(bx - 12, by - 8, 24, 8); c.clip(); ellipse(c, bx, by, 10, 6, '#f04436'); c.restore();
    R(c, '#2a2a2a', bx - 10, by, 20, 1); ellipse(c, bx, by, 3, 2, '#2a2a2a'); ellipse(c, bx, by, 2, 1, '#ffffff');
  });
}

// ---------------------------------------------------------------- animated bits (every frame)

// Five reusable poses per tree sprite. Integer row offsets keep the original pixel
// palette and silhouette crisp; the lower trunk and ground anchor never move.
const treePoses = new WeakMap();
export function drawTree(c, o, t) {
  const spr = o.spr;
  if (!spr) return;
  let poses = treePoses.get(spr.cv);
  if (!poses) {
    poses = [];
    const { width, height } = spr.cv;
    const crownEnd = Math.max(1, spr.ay - 16);
    for (let lean = -2; lean <= 2; lean++) {
      const cv = document.createElement('canvas');
      cv.width = width + 4; cv.height = height;
      const g = cv.getContext('2d');
      g.imageSmoothingEnabled = false;
      for (let row = 0; row < height; row++) {
        const heightInCrown = Math.max(0, 1 - row / crownEnd);
        const dx = Math.round(lean * heightInCrown);
        g.drawImage(spr.cv, 0, row, width, 1, 2 + dx, row, width, 1);
      }
      poses.push(cv);
    }
    treePoses.set(spr.cv, poses);
  }
  // Neighbours follow the same slow breeze, with a small delay across the grove.
  const phase = o.x * 0.48 + o.y * 0.31;
  const lean = Math.round(Math.sin(t / 1500 - phase) * 1.8);
  const [x, y] = o.at;
  c.drawImage(poses[lean + 2], Math.round(x - spr.ax) - 2, Math.round(y - spr.ay));
}

// The actual machinery is cached artwork. A few crisp pixels show when a PM is at its controls.
export function drawProductMachine(c, o, t, active) {
  if (!active || !o.spr) return;
  const [ax, ay] = o.at;
  const pulse = Math.floor(t / 600) % 2;
  R(c, pulse ? '#d3e58c' : '#86b153', ax - 3, ay - 70, 3, 3);
  R(c, pulse ? '#d3e58c' : '#86b153', ax - 20, ay - 22, 2, 2);
  const travel = (t % 2600) / 2600;
  const px = ax + 30 + Math.floor(travel * 23), py = ay - 27 + Math.floor(travel * 11);
  diamond(c, px, py - 4, '#25303b', 4, 2);
  diamond(c, px, py - 3, '#8bbcf0', 3, 1.5);
}

export function drawWater(c, t) {
  for (const [x, y] of WATER) {
    if (noise(x, y, 71) > 0.64) continue;
    const [cx, ty] = toScreen(x, y);
    const phase = (t / 5200 + noise(x, y, 79)) % 1;
    // Travel downriver, safely inside each diamond so banks stay undisturbed.
    const u = 0.35 + noise(x, y, 83) * 0.3, v = 0.25 + phase * 0.5;
    const px = cx + (u - v) * HW, py = ty + (u + v) * HH;
    const width = Math.round(Math.sin(phase * Math.PI) * 4);
    if (!width) continue;
    const color = phase < 0.18 || phase > 0.82 ? '#6c9bd4' : '#8bbcf0';
    R(c, color, px - width, py, width, 1);
    R(c, color, px, py + 1, width, 1);
  }
  if (environment.has(OBJECT_ASSETS.waterfall)) {
    const [cx, ty] = toScreen(...WATERFALL_TILE);
    const left = cx - HW, top = ty + HH;
    for (let i = 0; i < 3; i++) {
      const fall = (t / 1150 + i / 3) % 1;
      R(c, i % 2 ? '#8bbcf0' : '#c7e9f3', left + 3 + i * 8, top + 13 + Math.floor(fall * 31), 1, 4);
    }
    const foam = Math.floor(t / 260) % 3;
    R(c, '#c7e9f3', left + 3 + foam, top + 49, 5, 1);
    R(c, '#c7e9f3', left + 17 - foam, top + 52, 4, 1);
  }
}

// The server rack's lights: lazy green blinks when idle, a busy flicker while commands run.
export function drawRack(c, o, t, busy) {
  const [ax, ay] = o.at;
  if (o.spr?.asset) {
    if (!busy) return;
    for (let i = 0; i < 6; i++) {
      const on = (Math.floor(t / 340) + i * 2) % 5 < 2;
      R(c, on ? '#aecb66' : '#557281', ax + 8, ay - 48 + i * 7, 2, 1);
    }
    return;
  }
  for (let i = 0; i < 9; i++) {
    const y = ay - 51 + i * 5;
    for (let j = 0; j < 3; j++) {
      const k = Math.floor(t / (busy ? 90 : 700)) + i * 3 + j * 5;
      const on = (k * 2654435761 >>> 0) % 7 < (busy ? 4 : 2);
      R(c, on ? (busy && j === 2 ? '#ffb02e' : '#5dff8a') : '#1c3a26', ax + 1 + j * 2, y, 1, 1);
    }
    R(c, '#0b0d10', ax - 8, y, 7, 1);
  }
  if (busy) {
    // A little progress bar on the top unit.
    const w = Math.floor((t / 60) % 15);
    R(c, '#0b0d10', ax - 9, ay - 54, 15, 2); R(c, '#5dc8ff', ax - 9, ay - 54, w, 2);
  }
}

// who: null when the seat is empty, else { typing, papers }.
export function drawWorkDesk(c, o, t, who) {
  if (!who) return;
  const [ax, ay] = o.at;
  if (o.spr?.asset) {
    if (!who.typing) return;
    // Small keyboard on the clear side of the table, aligned with its 2:1 top.
    diamond(c, ax + 5, ay - 23, '#414b52', 7, 3);
    diamond(c, ax + 5, ay - 22, '#8192a5', 5, 2);
    const key = Math.floor(t / 220) % 3;
    R(c, '#ece8d6', ax + 2 + key * 2, ay - 21 + Math.floor(key / 2), 2, 1);
    return;
  }
  ellipse(c, ax - 6, ay - 44, 8, 5, 'rgba(150,225,255,.22)'); // screen glow on the worker's face
  for (let i = 0; i < who.papers; i++) { R(c, '#a2a8ae', ax + 1, ay - 22 - i * 2, 9, 1); R(c, '#ffffff', ax + 1, ay - 23 - i * 2, 9, 1); }
  if (who.typing) {
    const k = Math.floor(t / 110) % 5;
    R(c, '#2a2f36', ax - 7, ay - 28, 12, 2); R(c, '#ffffff', ax - 6 + k * 2, ay - 28, 1, 1);
    for (let i = 0; i < 3; i++) {
      const p = ((t / 1100) + i / 3) % 1;
      c.globalAlpha = 1 - p;
      R(c, ['#7fe3ff', '#f2c14e', '#9cf29a'][i], ax - 16 + i * 4, ay - 46 - p * 12, 2, 1);
      c.globalAlpha = 1;
    }
  }
}

// who: null when empty, else { reading, web, books }.
export function drawReadDesk(c, o, t, who) {
  if (!who) return;
  const [ax, ay] = o.at;
  if (o.spr?.asset) {
    // Follow the book already drawn on the reading desk; use the clear side on a spare desk.
    const bx = o.kind === 'readdesk' ? ax - 10 : ax + 6, by = ay - 26;
    if (who.web) { drawProp(c, 'tablet', ax + 5, ay - 22, t); return; }
    if (!who.reading) return;
    diamond(c, bx, by, '#f4efdc', 6, 3);
    R(c, '#c4beb0', bx, by + 1, 1, 4);
    const turn = (t % 3400) / 3400;
    if (turn > 0.72) {
      const page = Math.round(Math.cos((turn - 0.72) / 0.28 * Math.PI) * 4);
      R(c, '#ffffff', bx + Math.min(0, page), by, Math.max(1, Math.abs(page)), 3);
    }
    return;
  }
  ellipse(c, ax - 10, ay - 30, 8, 3, 'rgba(255,233,160,.35)'); // lamp light
  for (let i = 0; i < who.books; i++) R(c, ['#e9c46a', '#d8b65a', '#f2d48a'][i % 3], ax + 7, ay - 24 - i * 2, 9, 2); // folder pile
  if (who.web) {
    R(c, '#1f242b', ax - 7, ay - 28, 13, 8); R(c, '#5fb0e8', ax - 6, ay - 27, 11, 6);
    R(c, '#7bbd4a', ax - 4, ay - 26, 3, 2); R(c, '#ffffff', ax + 1, ay - 25, 3, 1);
    return;
  }
  // An open binder of documents.
  R(c, '#2f5f9e', ax - 9, ay - 28, 18, 8);
  R(c, '#fbfbf8', ax - 8, ay - 27, 7, 6); R(c, '#fbfbf8', ax + 1, ay - 27, 7, 6); R(c, '#9aa3ad', ax, ay - 27, 1, 6);
  for (let i = 0; i < 3; i++) { R(c, '#b0b6bc', ax - 7, ay - 25 + i * 2, 5, 1); R(c, '#b0b6bc', ax + 2, ay - 25 + i * 2, 5, 1); }
  if (who.reading) {
    const p = (t % 1800) / 1800;
    if (p < 0.35) {
      const w = Math.round(7 * Math.cos((p / 0.35) * Math.PI));
      if (w > 0) R(c, '#ffffff', ax + 1, ay - 28, w, 6); else if (w < 0) R(c, '#ffffff', ax + w, ay - 28, -w, 6);
    }
  }
}

// todos: null for the idle board, else { done, total } of whoever is presenting.
export function drawBoard(c, o, t, todos) {
  if (!todos) return;
  const [ax, ay] = o.at;
  if (o.spr?.asset) {
    // Three small notes on the board's sloping face; no invented task counts or text.
    for (let i = 0; i < 3; i++) {
      const x = ax - 12 + i * 7, y = ay - 40 + i * 3;
      R(c, ['#aecb66', '#8bbcf0', '#d8b47a'][i], x, y, 4, 4);
      const width = i === Math.floor(t / 1800) % 3 ? 2 + Math.floor(t / 300) % 3 : 4;
      R(c, '#8192a5', x, y + 7, width, 1);
    }
    return;
  }
  R(c, '#fbfbf8', ax - 20, ay - 56, 40, 28);
  R(c, '#3f7fd6', ax - 20, ay - 56, 40, 3);
  const rows = Math.min(5, Math.max(3, todos.total));
  for (let i = 0; i < rows; i++) {
    const y = ay - 50 + i * 4;
    const done = i < todos.done;
    if (done) R(c, '#4fae5a', ax - 17, y, 3, 3); else { R(c, '#6e7780', ax - 17, y, 3, 3); R(c, '#fbfbf8', ax - 16, y + 1); }
    const len = 8 + ((i * 7 + 3) % 16);
    const writing = !done && i === todos.done ? Math.floor((t / 120) % len) + 1 : len;
    R(c, done ? '#a0a6ac' : '#2c3440', ax - 12, y + 1, writing, 1);
  }
}

// The out-tray fills up with today's finished work; the top drawer pops open on each delivery.
export function drawCabinet(c, o, t, open, done) {
  if (o.spr?.asset) return;
  const [ax, ay] = o.at;
  for (let i = 0; i < Math.min(6, done); i++) { R(c, '#a2a8ae', ax - 7, ay - 31 - i * 2, 14, 1); R(c, '#ffffff', ax - 7, ay - 32 - i * 2, 14, 1); }
  if (!open) return;
  R(c, '#7b4a2b', ax - 10, ay - 25, 20, 7); R(c, '#c7a26a', ax - 9, ay - 24, 18, 5); R(c, '#4f392b', ax - 2, ay - 22, 4, 1);
  for (let i = 0; i < 6; i++) {
    const a = i + t / 300;
    R(c, i % 2 ? '#fff3a0' : '#ffffff', ax + Math.cos(a) * (8 + (t / 40 % 6)), ay - 36 - Math.abs(Math.sin(a)) * 10, 1, 1);
  }
}

// Small things a standing Pokémon holds while it works.
export function drawProp(c, kind, x, y, t) {
  x = Math.round(x); y = Math.round(y);
  if (kind === 'book') {
    R(c, '#7b4a2b', x - 6, y - 4, 12, 8);
    R(c, '#f4efdc', x - 5, y - 5, 10, 7); R(c, '#c4beb0', x, y - 5, 1, 7);
    R(c, '#c4beb0', x - 4, y - 3, 3, 1); R(c, '#c4beb0', x + 2, y - 1, 2, 1);
    if (t % 3200 > 2500) R(c, '#ffffff', x - 3 + Math.floor((t % 700) / 150), y - 5, 2, 6);
  } else if (kind === 'parcel') {
    diamond(c, x, y - 7, '#d8b47a', 5, 2);
    face(c, x - 5, y - 5, 5, 0.5, 0, -4, '#a57949');
    face(c, x, y - 3, 5, -0.5, 0, -4, '#7b4a2b');
    R(c, '#ece8d6', x - 1, y - 5, 2, 5);
  } else if (kind === 'document') {
    R(c, '#9aa3ad', x - 4, y - 5, 8, 9); R(c, '#ffffff', x - 3, y - 4, 6, 7);
    for (let i = 0; i < 3; i++) R(c, '#9aa0a6', x - 2, y - 3 + i * 2, 4, 1);
  } else if (kind === 'tablet') {
    R(c, '#1f242b', x - 5, y - 4, 10, 8); R(c, '#5fb0e8', x - 4, y - 3, 8, 6); R(c, '#7bbd4a', x - 3, y - 2, 3, 2); R(c, '#ffffff', x + 1, y);
  } else if (kind === 'clipboard') {
    R(c, '#8a5a35', x - 5, y - 5, 10, 10); R(c, '#ffffff', x - 4, y - 4, 8, 8); R(c, '#9aa3ad', x - 2, y - 6, 4, 2);
    for (let i = 0; i < 3; i++) R(c, '#9aa0a6', x - 3, y - 2 + i * 2, 6, 1);
    R(c, '#f2c14e', x + 4, y - 6 + Math.round(Math.sin(t / 90)), 1, 5); R(c, '#2c3440', x + 4, y - 1 + Math.round(Math.sin(t / 90)));
  } else if (kind === 'magnifier') {
    const dx = Math.round(Math.sin(t / 400) * 3);
    ellipse(c, x + dx, y - 3, 4, 4, '#3b4148'); ellipse(c, x + dx, y - 3, 3, 3, '#bfe3ff'); R(c, '#ffffff', x + dx - 1, y - 5);
    R(c, '#4a5058', x + dx + 3, y + 1, 2, 4);
  } else if (kind === 'sheet') {
    R(c, '#9aa3ad', x - 4, y - 5, 8, 10); R(c, '#ffffff', x - 3, y - 4, 6, 8); R(c, '#4fae5a', x - 2, y - 3, 2, 2);
    for (let i = 0; i < 2; i++) R(c, '#9aa0a6', x - 2, y + i * 2, 4, 1);
  }
}
