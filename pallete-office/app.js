import {
  W, BASE_W, BASE_H, ZONES, GATE, OUTBOX, BOARD_SPOT, PRODUCT_OPERATOR, PRODUCT_MACHINE, toScreen, ellipse, buildWorld, loadEnvironmentAssets,
  drawWater, drawTree, drawRack, drawWorkDesk, drawReadDesk, drawBoard, drawCabinet, drawProp, drawProductMachine,
} from './world.js';
import { createLofiPlayer } from './lofi.js';
import * as life from './life.js';
import { workActivity, idleHabit, drawHabit } from './behaviors.js';
import { OFFICE_ROOMS, roomChoices, mayEnter, insideRoom, drawOfficeWall, drawRoomLabels } from './campus.js';
import { findRoute } from './navigation.js';

const $ = (s) => document.querySelector(s);
const stage = $('#stage'), canvas = $('#world'), ctx = canvas.getContext('2d');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
await loadEnvironmentAssets();
const world = buildWorld();

const chars = new Map();  // agent id -> { data from server + view state }
const taken = new Map();  // "x,y" spot -> agent id
// A static copy (the website showcase) brings its own feed and file names; see showcase/.
const STATIC = window.PALLET_STATIC ?? null;
if (STATIC) document.body.classList.add('static');
const spritePath = (id, shiny) => STATIC ? STATIC.sprite(id, shiny) : `sprite/${id}${shiny ? '?shiny=1' : ''}`;
// ?tv: just the island and the Pokémon, full screen, with the music always on.
const TV = new URLSearchParams(location.search).has('tv');
if (TV) document.body.classList.add('tv');
if (new URLSearchParams(location.search).has('debug')) window.__office = { chars, taken }; // ?debug: inspect from the console
let lines = [], feed = [], demoOn = false, selected = null, booted = false, dirty = true;
const prefs = loadPrefs();

const STATE_LABEL = {
  reading: 'Reading', web: 'Browsing', editing: 'Editing', running: 'Running', planning: 'Planning',
  delegating: 'Delegating', thinking: 'Thinking', waiting: 'Needs you', blocked: 'Stuck', error: 'Oops',
  compacting: 'Compacting', done: 'Your turn', sleeping: 'Napping', idle: 'Ready', leaving: 'Leaving',
};
const BUBBLE = {
  reading: '📖', web: '🌐', editing: '✏️', running: '⚙️', planning: '📋', delegating: '📣',
  waiting: '❗', blocked: '⛔', error: '💢', compacting: '🌀', done: '♪', leaving: '👋',
};
const STATE_ZONE = { waiting: 'center', blocked: 'center', done: 'chill', sleeping: 'chill', idle: 'chill', chilling: 'chill', leaving: 'gate' };
const SPEED = 2.4; // tiles per second
// Pokémon are drawn at 85% of their sprite size, so they fit the desks.
const CHAR_SCALE = 0.85;
const SEAT_LIFT = 8; // seated Pokémon sit up on their chair, above the desk line

// No roles and no residents: a Pokémon only appears for a real Claude Code session.
const residents = [];
const operatorKey = PRODUCT_OPERATOR.join(',');

// ---------------------------------------------------------------- prefs

function loadPrefs() {
  try { return { sound: true, notify: false, music: false, musicVolume: 30, ...JSON.parse(localStorage.getItem('pallet-prefs') || '{}') }; }
  catch { return { sound: true, notify: false, music: false, musicVolume: 30 }; }
}
function savePrefs() { try { localStorage.setItem('pallet-prefs', JSON.stringify(prefs)); } catch { /* private mode */ } }

// ---------------------------------------------------------------- sprites

const sprites = new Map();
function spriteFor(id, shiny) {
  const key = `${id}${shiny ? 's' : ''}`;
  if (!sprites.has(key)) {
    sprites.set(key, null);
    loadSprite(id, shiny).then((s) => sprites.set(key, s), () => setTimeout(() => sprites.delete(key), 15000));
  }
  return sprites.get(key);
}

async function loadSprite(id, shiny) {
  const res = await fetch(spritePath(id, shiny));
  if (!res.ok) throw new Error('sprite unavailable');
  const type = res.headers.get('content-type') || 'image/png';
  const buf = await res.arrayBuffer();
  let frames = [];
  // Canvas only ever shows a GIF's first frame, so decode every frame ourselves where we can.
  if (type.includes('gif') && 'ImageDecoder' in window) {
    try {
      const dec = new ImageDecoder({ data: buf, type: 'image/gif' });
      await dec.tracks.ready;
      await dec.completed;
      const n = dec.tracks.selectedTrack.frameCount;
      for (let i = 0; i < n; i++) {
        const { image } = await dec.decode({ frameIndex: i });
        frames.push({ bmp: await createImageBitmap(image), dur: Math.max(20, (image.duration ?? 100000) / 1000) });
        image.close();
      }
      dec.close();
    } catch { frames = []; }
  }
  if (!frames.length) frames = [{ bmp: await createImageBitmap(new Blob([buf], { type })), dur: 1e9 }];
  return { frames, total: frames.reduce((s, f) => s + f.dur, 0), box: measure(frames), white: null };
}

// Visible bounds across a few frames, so feet sit on the ground whatever the GIF padding.
function measure(frames) {
  const { width: w, height: h } = frames[0].bmp;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d', { willReadFrequently: true });
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  const step = Math.max(1, Math.floor(frames.length / 6));
  for (let i = 0; i < frames.length; i += step) {
    c.clearRect(0, 0, w, h);
    c.drawImage(frames[i].bmp, 0, 0);
    const d = c.getImageData(0, 0, w, h).data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  if (x1 < 0) return { x0: 0, y0: 0, x1: w, y1: h, cx: w / 2, w, h };
  return { x0, y0, x1, y1, cx: Math.round((x0 + x1) / 2), w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function frameIndex(spr, ms) {
  if (spr.frames.length === 1) return 0;
  let t = ms % spr.total;
  for (let i = 0; i < spr.frames.length; i++) { t -= spr.frames[i].dur; if (t < 0) return i; }
  return 0;
}

function whiteOf(spr) {
  if (!spr.white) {
    const f = spr.frames[0].bmp;
    const cv = document.createElement('canvas');
    cv.width = f.width; cv.height = f.height;
    const c = cv.getContext('2d');
    c.drawImage(f, 0, 0);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, cv.width, cv.height);
    spr.white = cv;
  }
  return spr.white;
}

// ---------------------------------------------------------------- characters

const tileOf = (c) => [Math.floor(c.fx), Math.floor(c.fy)];
const swims = (c) => !!c.data.species.swims;

const hasHelpers = (id) => helperCount(id) > 0;

// Helpers per parent, recounted at most every 200 ms (room picking asks for it a lot).
let helpers = new Map(), helpersAt = -1;
function helperCount(id) {
  const now = performance.now();
  if (now - helpersAt > 200) {
    helpers = new Map(); helpersAt = now;
    for (const c of chars.values()) if (c.data.parentId && !c.removed && !c.dying) helpers.set(c.data.parentId, (helpers.get(c.data.parentId) ?? 0) + 1);
  }
  return helpers.get(id) ?? 0;
}

// ---------------------------------------------------------------- rooms

// Each room holds as many Pokémon as it has places. A session takes the first room on its list
// with space for it and its helpers, and keeps it while it still fits, so nobody hops about.
const roomCap = (r) => ZONES[r].spots.length;
const roomLoad = (r, me) => {
  let n = 0;
  for (const [k, id] of taken) {
    const o = chars.get(id);
    if (o && o !== me && o.data.parentId !== me.id && insideRoom(r, ...k.split(',').map(Number))) n++;
  }
  return n;
};
function workRoom(d) {
  const c = chars.get(d.id), choices = roomChoices(d);
  if (!c) return choices[0];
  const need = 1 + helperCount(d.id), fits = (r) => roomLoad(r, c) + need <= roomCap(r);
  if (choices.includes(c.room) && (c.roomFor === choices[0] || !fits(choices[0])) && fits(c.room)) return c.room;
  const pick = choices.find(fits)
    ?? (choices.includes(c.room) ? c.room : choices.reduce((a, b) => (roomCap(b) - roomLoad(b, c) > roomCap(a) - roomLoad(a, c) ? b : a)));
  c.room = pick; c.roomFor = choices[0];
  return pick;
}

function zoneFor(d) {
  if (d.state === 'leaving' && d.parentId) return 'parent';
  if (d.parentId) return 'huddle'; // helpers work right beside the Pokémon that called them
  if (d.state === 'waiting' && !d.parentId && Date.now() - d.since > 180_000) return 'front';
  const zone = STATE_ZONE[d.state];
  if (zone && !(zone === 'chill' && hasHelpers(d.id))) return zone;
  return workRoom(d); // working, or supervising its helpers
}

function upsert(d, quiet = false) {
  let c = chars.get(d.id);
  const now = performance.now();
  if (!c) {
    const parent = d.parentId && chars.get(d.parentId);
    const [sx, sy] = parent ? tileOf(parent) : GATE;
    c = { id: d.id, data: d, fx: sx + 0.5, fy: sy + 0.5, path: [], zone: null, spot: null, flip: false,
          t0: Math.random() * 5000, born: now, wantZone: null, wantAt: 0, nextWander: now + 8000 };
    chars.set(d.id, c);
    const h = handoffs.get(d.species.id);
    if (h && now - h.t < 4000) { handoffs.delete(d.species.id); Object.assign(c, { fx: h.fx, fy: h.fy, flip: h.flip, born: -1e9 }); }
    if (quiet) {
      // Page just loaded: put everyone straight at their spot instead of parading in.
      c.zone = zoneFor(d) === 'parent' ? 'meeting' : zoneFor(d);
      const [x, y] = c.zone === 'huddle' ? (claimHuddle(c) ?? GATE) : claimSpot(c, c.zone);
      c.fx = x + 0.5; c.fy = y + 0.5; c.born = -1e9;
    } else if (!d.parentId && !d.offDuty) { sound('join'); cryFor(d); }
  } else if (!quiet) {
    const o = c.data;
    if (o.species.line !== d.species.line) c.born = now; // starter swapped by hand: just a poof
    else if (o.species.id !== d.species.id) { c.evolve = { from: o.species.id, shiny: o.shiny, t: now, start: now }; sound('evolve'); }
    else if (d.level > o.level && !d.parentId) { c.levelUp = now; sound('level'); }
    if (o.state !== d.state) onStateChange(c, o.state, d);
  }
  c.data = d;
  const z = zoneFor(d);
  if (z !== c.wantZone) { c.wantZone = z; c.wantAt = now; }
  dirty = true;
}

function cryFor(d) { if (prefs.sound && booted && !d.offDuty) life.cry(d.species.id); }

function onStateChange(c, prev, d) {
  if (d.state === 'waiting' || d.state === 'blocked') { sound('attention'); notify(d); setTimeout(() => cryFor(d), 500); }
  else if (d.state === 'done' && !d.parentId && prev !== 'sleeping') {
    sound('done'); setTimeout(() => cryFor(d), 500);
    if (c.head) flights.push({ x: c.head[0], y: c.head[1], t0: performance.now() }); // finished work flies to the chest
  }
  else if (d.state === 'error') sound('error');
}

function removeChar(id, handoff = false) {
  const c = chars.get(id);
  if (!c) return;
  if (handoff) { // an off-duty Pokémon is clocking in: the session's character takes its place
    handoffs.set(c.data.species.id, { fx: c.fx, fy: c.fy, flip: c.flip, t: performance.now() });
    forget(id);
    return;
  }
  c.removed = true;
  if (c.data.parentId || c.zone === 'gate' && !c.path.length) c.dying = performance.now();
  else { c.data = { ...c.data, state: 'leaving' }; c.wantZone = 'gate'; c.wantAt = 0; c.leaveBy = performance.now() + 5000; }
  dirty = true;
}

function forget(id) {
  const c = chars.get(id);
  if (!c) return;
  release(c);
  chars.delete(id);
  if (selected === id) selected = null;
  dirty = true;
}

// Where to work: a free desk in this area or the next ones round the ring; failing that, a
// standing spot here first, then in the next areas; failing that, the nearest open tile.
// Two Pokémon never share a tile.
function claimSpot(c, zone) {
  const take = (list) => {
    for (const s of list ?? []) {
      const k = s.join(',');
      if (k === operatorKey) continue;
      if (!taken.has(k) && world.walkable(...s, swims(c))) { taken.set(k, c.id); c.spot = k; return s; }
    }
    return null;
  };
  if (ZONES[zone].scatter) {
    const z = ZONES[zone];
    const free = (list) => list.filter((s) => !taken.has(s.join(',')));
    const picnic = free(z.spots.slice(0, z.picnic)), anywhere = free(z.spots);
    const pool = c.data.species.swims && z.water ? free(z.water).concat(anywhere) : (Math.random() < 0.4 && picnic.length ? picnic : anywhere);
    if (pool.length) {
      const s = c.data.species.swims && z.water && free(z.water).length ? pool[0] : pool[Math.floor(Math.random() * pool.length)];
      taken.set(s.join(','), c.id); c.spot = s.join(',');
      return s;
    }
  }
  const chain = [];
  for (let k = zone; k && !chain.includes(k); k = ZONES[k].overflow) chain.push(k);
  const z = ZONES[zone];
  if (z.water && swims(c)) { const got = take([...z.water, ...z.spots]); if (got) return got; } // swimmers take the water
  for (const k of chain) { const got = take(ZONES[k].seats ?? (k === zone ? ZONES[k].spots : null)); if (got) return got; }
  for (const k of chain) { const got = take(ZONES[k].stand ?? (k === zone ? null : ZONES[k].spots)); if (got) return got; }
  return nearestFreeTile(c, (z.stand ?? z.spots)[0]);
}

// The closest open tile to an area: walkable, not a desk, not anyone else's spot.
// In a room it looks inside that room first, then just outside its doors.
function nearestFreeTile(c, [sx, sy], inRoom = true) {
  const seen = new Set([`${sx},${sy}`]);
  const q = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.shift();
    const k = `${x},${y}`;
    const inProject = !inRoom || !OFFICE_ROOMS.some(room => room.key === c.zone) || insideRoom(c.zone, x, y);
    if (inProject && mayEnter(c.data, x, y) && !taken.has(k) && !world.seats.has(k) && k !== operatorKey && world.walkable(x, y, swims(c))) {
      taken.set(k, c.id); c.spot = k;
      return [x, y];
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nk = `${x + dx},${y + dy}`;
      if (!seen.has(nk) && x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < world.terrain[0].length) { seen.add(nk); q.push([x + dx, y + dy]); }
    }
  }
  return inRoom ? nearestFreeTile(c, [sx, sy], false) : GATE;
}

// The product machine is scenery now: nobody is assigned to run it.
const operatingProduct = () => false;

function release(c) {
  if (c.spot && taken.get(c.spot) === c.id) taken.delete(c.spot);
  c.spot = null;
}

// The tiles round a parent, nearest first; helpers take the free ones (never a desk seat).
const HUDDLE_NEAR = 6;
const HUDDLE = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1], [2, 0], [0, 2], [-2, 0], [0, -2]];
const parentSpot = (p) => p.path[p.path.length - 1] ?? tileOf(p); // where the parent is, or is heading

function claimHuddle(c) {
  const p = chars.get(c.data.parentId);
  if (!p) return null;
  const [px, py] = parentSpot(p);
  c.huddleAt = `${px},${py}`;
  // A few helpers gather round the parent; the rest help from the next rooms over.
  let near = 0;
  for (const [dx, dy] of HUDDLE) if (taken.has(`${px + dx},${py + dy}`) && chars.get(taken.get(`${px + dx},${py + dy}`))?.data.parentId === p.id) near++;
  if (near >= HUDDLE_NEAR) return spillHelper(c, p);
  for (const [dx, dy] of HUDDLE) {
    const x = px + dx, y = py + dy, k = `${x},${y}`;
    const room = OFFICE_ROOMS.find(room => room.key === p.zone)?.key;
    if (room && insideRoom(room, px, py) && !insideRoom(room, x, y)) continue;
    if (!world.walkable(x, y, swims(c)) || !mayEnter(c.data, x, y) || world.seats.has(k) || (taken.has(k) && taken.get(k) !== c.id)) continue;
    taken.set(k, c.id); c.spot = k;
    return [x, y];
  }
  return spillHelper(c, p);
}

// Overflow helpers take a free place in whichever of the parent's rooms has the most space.
function spillHelper(c, p) {
  const free = (r) => ZONES[r].spots.filter((s) => !taken.has(s.join(',')) && s.join(',') !== operatorKey && world.walkable(...s, swims(c)));
  const rooms = roomChoices(p.data).filter((r) => r !== p.zone).sort((a, b) => free(b).length - free(a).length);
  for (const r of rooms) {
    const [s] = free(r);
    if (s) { taken.set(s.join(','), c.id); c.spot = s.join(','); return s; }
  }
  return nearestFreeTile(c, parentSpot(p)); // every room is full: stand nearby
}

function goTo(c, zone) {
  release(c);
  c.zone = zone;
  let target;
  if (zone === 'parent') { const p = chars.get(c.data.parentId); target = p ? tileOf(p) : GATE; }
  else if (zone === 'huddle') { const p = chars.get(c.data.parentId); target = claimHuddle(c) ?? (p ? tileOf(p) : GATE); }
  else target = claimSpot(c, zone);
  walkTo(c, target);
}

function walkTo(c, target) {
  const start = c.path[0] ?? tileOf(c);
  const route = findPath(start, target, swims(c));
  c.path = c.path.length ? [start, ...route] : route;
}

const findPath = (start, target, swim) => findRoute(world, start, target, swim);

function step(c, now, dt) {
  if (c.dying) { if (now - c.dying > 450) forget(c.id); return; }
  if (!isChilling(c)) { c.napUntil = 0; c.hobby = null; }
  if (!c.data.parentId && !c.removed) { const z = zoneFor(c.data); if (z !== c.wantZone) { c.wantZone = z; c.wantAt = now; } }
  // A short debounce, so quick Read→Edit→Read flips don't send everyone sprinting back and forth.
  if (c.wantZone !== c.zone && now - c.wantAt > (c.zone ? 450 : 0)) goTo(c, c.wantZone);
  if (c.zone === 'parent' && !c.path.length) {
    const p = chars.get(c.data.parentId);
    if (!p || Math.hypot(p.fx - c.fx, p.fy - c.fy) < 1.6) { if (c.removed || !p) c.dying = now; }
    else walkTo(c, tileOf(p));
  }
  if (c.removed && !c.data.parentId && ((c.zone === 'gate' && !c.path.length) || now > c.leaveBy)) c.dying = now;
  // The parent moved on: follow it.
  if (c.zone === 'huddle') {
    const p = chars.get(c.data.parentId);
    if (p && parentSpot(p).join(',') !== c.huddleAt) goTo(c, 'huddle');
  }


  moveAlong(c, dt);
}

function moveAlong(c, dt) {
  if (!c.path.length) return;
  const [tx, ty] = c.path[0];
  const dx = tx + 0.5 - c.fx, dy = ty + 0.5 - c.fy, dist = Math.hypot(dx, dy), sp = SPEED * dt;
  if (dist <= sp) { c.fx = tx + 0.5; c.fy = ty + 0.5; c.path.shift(); }
  else { c.fx += (dx / dist) * sp; c.fy += (dy / dist) * sp; }
  const screenDx = dx - dy;
  if (Math.abs(screenDx) > 0.05) c.flip = screenDx > 0; // sprites face left; mirror when walking right
}


// ---------------------------------------------------------------- chill area & arena

// Anyone not working lounges in the chill area. Now and then two of them spar in the arena.
const ARENA = ZONES.arena.spots; // the two corners of the ring
const arena = { fighters: null, started: 0, until: 0, nextAt: performance.now() + 8000 };
const handoffs = new Map(); // species id -> where an off-duty Pokémon stood when it clocked in
const isChilling = (c) => !c.dying && !c.removed && zoneFor(c.data) === 'chill';

function arenaTick(now) {
  if (arena.fighters) {
    const [a, b] = arena.fighters;
    if (![a, b].every((c) => chars.get(c.id) === c && isChilling(c))) return endFight(now);
    if (!arena.started && !a.path.length && !b.path.length) { arena.started = now; arena.until = now + 7000 + Math.random() * 5000; }
    if (!arena.started) return;
    if (now > arena.until) return endFight(now);
    a.flip = true; b.flip = false; // face each other across the ring
    const t = now - arena.started, ph = (t % 1100) / 1100;
    const [atk, def] = Math.floor(t / 1100) % 2 ? [b, a] : [a, b];
    atk.lunge = ph < 0.3 ? Math.sin((ph / 0.3) * Math.PI) : 0; atk.struck = false;
    def.lunge = 0; def.struck = ph > 0.12 && ph < 0.4;
    return;
  }
  // Loungers nod off now and then.
  for (const c of chars.values()) {
    if (!isChilling(c) || c.path.length || now < (c.napCheck ?? 0)) continue;
    c.napCheck = now + 15000 + Math.random() * 20000;
    c.napUntil = Math.random() < 0.35 ? now + 10000 + Math.random() * 15000 : 0;
  }
  if (now < arena.nextAt) return;
  arena.nextAt = now + 15000 + Math.random() * 20000;
  const idle = [...chars.values()].filter((c) => isChilling(c) && !c.path.length && !c.data.parentId);
  if (idle.length < 2) return;
  const a = idle.splice(Math.floor(Math.random() * idle.length), 1)[0];
  const b = idle[Math.floor(Math.random() * idle.length)];
  arena.fighters = [a, b];
  arena.started = 0;
  [a, b].forEach((c, i) => {
    release(c);
    taken.set(ARENA[i].join(','), c.id); c.spot = ARENA[i].join(',');
    c.fighting = true; c.napUntil = 0;
    walkTo(c, ARENA[i]);
  });
}

// What a lounging Pokémon gets up to: swim about, fish from the bank, or skip stones.
function hobbyTick(now) {
  for (const c of chars.values()) {
    if (!isChilling(c) || c.fighting || c.path.length || c.napUntil > now || c.data.state === 'sleeping') { c.hobby = null; continue; }
    if (c.hobby) { c.flip = toScreen(c.hobby.at[0] + 0.5, c.hobby.at[1] + 0.5)[0] > toScreen(c.fx, c.fy)[0]; }
    if (now < (c.hobbyCheck ?? 0)) continue;
    c.hobbyCheck = now + 12000 + Math.random() * 12000;
    const [x, y] = tileOf(c);
    if (swims(c) && world.isWater(x, y)) {
      const free = (ZONES.chill.water ?? []).filter((s) => !taken.has(s.join(',')));
      if (free.length) { const s = free[Math.floor(Math.random() * free.length)]; release(c); taken.set(s.join(','), c.id); c.spot = s.join(','); walkTo(c, s); }
      c.hobby = null;
      continue;
    }
    const wt = life.nearestWater(world, x, y);
    c.hobby = wt && wt.d <= 1.5 ? { kind: 'fish', at: wt.tile, since: now }
      : wt && wt.d <= 5 && Math.random() < 0.6 ? { kind: 'stones', at: wt.tile, since: now } : null;
  }
}

function endFight(now) {
  for (const c of arena.fighters) {
    Object.assign(c, { fighting: false, lunge: 0, struck: false });
    if (chars.get(c.id) === c && isChilling(c)) goTo(c, 'chill'); // back to lounging
  }
  arena.fighters = null;
  arena.nextAt = now + 15000 + Math.random() * 20000;
}

// ---------------------------------------------------------------- drawing

let S = 1, offX = 0, offY = 0, dpr = 1, uiK = 1;
function layout() {
  const r = stage.getBoundingClientRect();
  dpr = window.devicePixelRatio || 1;
  // TV browsers have slow graphics: draw at most 1280 pixels wide and let the screen scale it up.
  if (TV) dpr = Math.min(dpr, 1280 / Math.max(1, r.width));
  canvas.width = Math.max(1, Math.round(r.width * dpr));
  canvas.height = Math.max(1, Math.round(r.height * dpr));
  // Fill the window: the island runs under the corner panels, which only cover its empty edges.
  // On phones the team list sits below, so there the island still fits above it.
  const top = 40;
  const panelTops = r.width > 700 ? [] : [...document.querySelectorAll('.hud-panel')]
    .map(panel => panel.getBoundingClientRect())
    .filter(panel => panel.width && panel.height)
    .map(panel => panel.top - r.top - 8);
  const viewHeight = Math.max(180, Math.min(r.height, ...panelTops));
  const fit = Math.min(r.width / BASE_W, (viewHeight - top) / BASE_H);
  S = fit * dpr;
  offX = Math.round((canvas.width - BASE_W * S) / 2);
  offY = Math.round((top * dpr + (viewHeight - top) * dpr - BASE_H * S) / 2);
  uiK = dpr * Math.min(1.25, Math.max(0.8, fit / 1.3));
}
new ResizeObserver(layout).observe(stage);
const panelObserver = new ResizeObserver(layout);
document.querySelectorAll('.hud-panel').forEach(panel => panelObserver.observe(panel));
layout();

const toDisplay = (x, y) => [offX + x * S, offY + y * S];

// ---------------------------------------------------------------- work scenes

const flights = [];        // finished work goes through the machine, then to the outbox
let chestOpenAt = -1e9;
const CHEST_TOP = (() => { const [x, y] = toScreen(OUTBOX[0] + 0.5, OUTBOX[1] + 0.5); return [x, y - 32]; })();
const MACHINE_TOP = (() => { const [x, y] = world.objects.find((o) => o.kind === 'productmachine').at; return [x - 30, y - 24]; })();
const busyWith = (d, ...acts) => acts.includes(workActivity(d));

function deliveries() {
  const day = new Date().toDateString();
  if (prefs.delivered?.day !== day) prefs.delivered = { day, n: 0 };
  return prefs.delivered;
}

// Who is sitting where, whether the pot is on, and what's on the whiteboard.
function sceneNow() {
  const scene = { seated: new Map(), cooking: false, presenter: null, productActive: flights.length > 0 };
  for (const c of chars.values()) {
    if (c.path.length || c.dying) continue;
    const k = tileOf(c).join(',');
    if (world.seats.has(k)) scene.seated.set(k, c);
    if (operatingProduct(c)) scene.productActive = true;
    if (busyWith(c.data, 'running')) scene.cooking = true; // shared server also serves the project rooms
    if (k === BOARD_SPOT.join(',') && busyWith(c.data, 'planning')) scene.presenter = c.data.todos?.total ? c.data.todos : { done: 0, total: 3 };
  }
  return scene;
}

function drawObject(o, now, scene) {
  const [x, y] = o.at;
  if (o.kind === 'officewall') drawOfficeWall(ctx, o, toScreen);
  else if (['tree', 'roundtree', 'pine'].includes(o.kind)) drawTree(ctx, o, reducedMotion.matches ? 0 : now);
  else if (o.spr) ctx.drawImage(o.spr.cv, Math.round(x - o.spr.ax), Math.round(y - o.spr.ay));
  const sitter = scene.seated.get(`${o.x},${o.y}`)?.data;
  switch (o.kind) {
    case 'rack': drawRack(ctx, o, reducedMotion.matches ? 0 : now, scene.cooking); break;
    case 'workdesk': case 'readdesk':
      if (sitter && busyWith(sitter, 'editing')) drawWorkDesk(ctx, o, reducedMotion.matches ? 0 : now, { typing: true, papers: 0 });
      if (sitter && busyWith(sitter, 'reading', 'web')) drawReadDesk(ctx, o, reducedMotion.matches ? 0 : now, { reading: busyWith(sitter, 'reading'), web: busyWith(sitter, 'web'), books: 0 });
      break;
    case 'whiteboard': drawBoard(ctx, o, reducedMotion.matches ? 0 : now, scene.presenter); break;
    case 'cabinet': drawCabinet(ctx, o, now, now - chestOpenAt < 1600, deliveries().n); break;
    case 'productmachine': drawProductMachine(ctx, o, now, scene.productActive); break;
  }
}

function propFor(d) {
  const s = workActivity(d);
  if (s === 'reading') return /^(Searching|Looking)/.test(d.detail ?? '') ? 'magnifier' : 'book';
  return { web: 'tablet', editing: 'clipboard', running: 'tablet', planning: 'clipboard', delegating: 'document' }[s] ?? null;
}

function drawChar(c, now) {
  const d = c.data;
  const [fx, fy] = toScreen(c.fx, c.fy);
  const operating = operatingProduct(c);
  // The control panel sits slightly to the right of the walkable operator tile.
  const sx = Math.round(fx + (operating ? 15 : 0)), sy = Math.round(fy);
  let spr = spriteFor(d.species.id, d.shiny);
  if (c.evolve && !spr) { // hold the animation until the new form has loaded
    if (now - c.evolve.start > 10000) c.evolve = null;
    else { spr = spriteFor(c.evolve.from, c.evolve.shiny); c.evolve.t = now; }
  }
  const moving = c.path.length > 0;
  const seat = !moving && world.seats.get(tileOf(c).join(','));
  if (!moving && tileOf(c).join(',') === BOARD_SPOT.join(',')) c.flip = false; // face the whiteboard
  if (operating) c.flip = PRODUCT_MACHINE[0] - PRODUCT_MACHINE[1] > PRODUCT_OPERATOR[0] - PRODUCT_OPERATOR[1];
  const swimming = swims(c) && world.isWater(...tileOf(c));
  let bob = 0, shake = 0;
  const urgency = d.state === 'waiting' ? Math.min(1, (Date.now() - d.since) / 180_000) : 0; // waits longer, hops higher
  const hoverLift = life.hover(d.species.id, moving, now, c.t0);
  if (moving) bob = hoverLift < -5 || life.slides(d.species.id) ? 0 : -Math.abs(Math.sin(now / 90)) * 2;
  else if (d.state === 'waiting') { const per = 1400 - 500 * urgency, ph = (now % per) / per; bob = ph < 0.3 ? -Math.sin((ph / 0.3) * Math.PI) * (7 + 7 * urgency) : 0; if (c.zone === 'front') shake = Math.round(Math.sin(now / 90) * 2); }
  else if (d.parentId && c.zone === 'huddle') {
    const p = chars.get(d.parentId);
    if (p) c.flip = toScreen(p.fx, p.fy)[0] > fx;
    const ph = ((now + c.t0) % 900) / 900; bob = ph < 0.3 ? -Math.sin((ph / 0.3) * Math.PI) * 3 : 0;
  }
  else if (!seat && (d.state === 'editing' || d.state === 'running')) { const ph = ((now + c.t0) % 650) / 650; bob = ph < 0.3 ? -Math.sin((ph / 0.3) * Math.PI) * 2 : 0; }
  else if (d.state === 'error') shake = Math.round(Math.sin(now / 28) * 1.5);
  if (c.struck) shake = Math.round(Math.sin(now / 25) * 2);
  const lungeX = Math.round((c.lunge || 0) * 7) * (c.flip ? 1 : -1);
  const napping = (d.state === 'sleeping' || c.napUntil > now) && !c.fighting;
  const habit = idleHabit(d, now + c.t0, { moving, fighting: c.fighting, napping, hobby: !!c.hobby,
    supervising: !isChilling(c), reduced: reducedMotion.matches });
  const action = workActivity(d);
  if (!moving && !reducedMotion.matches) {
    if (habit?.kind === 'meditate') bob -= Math.round(Math.sin(habit.phase * Math.PI) * 2);
    if (habit?.kind === 'spark') shake += habit.phase > 0.35 && habit.phase < 0.55 ? Math.round(Math.sin(now / 85)) : 0;
    if (seat && action === 'editing') bob += Math.floor(now / 260) % 2;
    if (action === 'reading') shake += Math.round(Math.sin(now / 1600));
  }
  if (swimming) bob += Math.sin(now / 420 + c.t0) * 1.2;
  bob = Math.round(bob);

  const alpha = c.dying ? Math.max(0, 1 - (now - c.dying) / 450) : 1;
  const k = CHAR_SCALE * (d.parentId ? 0.8 : 1);
  if (c.cheer && now - c.cheer < 500) bob = Math.min(bob, -Math.sin(((now - c.cheer) / 500) * Math.PI) * 8); // you clicked it
  if (c.moment?.kind === 'compact' && now - c.moment.t < 400) bob = -Math.sin(((now - c.moment.t) / 400) * Math.PI) * 6; // stomp!
  const lift = (seat ? -SEAT_LIFT : 0) + Math.round(hoverLift);
  const squash = d.state === 'blocked' ? 0.55 : habit?.kind === 'stretch' ? 1 + Math.sin(habit.phase * Math.PI) * 0.035 : 1;
  ctx.save();
  ctx.globalAlpha = alpha;
  const sw = spr ? spr.box.w * k : 14;
  if (!swimming && !seat) ellipse(ctx, sx, sy, Math.max(4, Math.round(sw * (hoverLift < -5 ? 0.24 : 0.36))), hoverLift < -5 ? 2 : 3, 'rgba(0,0,0,.22)');
  if (selected === c.id) {
    const r = Math.max(8, Math.round(sw * 0.5));
    const pulse = Math.round(Math.sin(now / 200));
    ellipse(ctx, sx, sy, r + 2 + pulse, 5 + (pulse > 0 ? 1 : 0), 'rgba(255,224,102,.75)');
  }

  if (!spr) { // still loading: a bouncing Poké Ball
    const y = sy - 7 - Math.abs(Math.sin(now / 150)) * 3;
    ellipse(ctx, sx, y, 5, 5, '#222'); ellipse(ctx, sx, y, 4, 4, '#fff');
    ctx.fillStyle = '#ff3b30'; ctx.fillRect(sx - 4, y - 4, 8, 4);
    ctx.fillStyle = '#222'; ctx.fillRect(sx - 4, y, 8, 1);
    ctx.restore();
    c.head = [sx, sy - 12]; c.hit = { x0: sx - 7, x1: sx + 7, y0: sy - 14, y1: sy + 3 };
    return;
  }

  let img = spr.frames[frameIndex(spr, napping ? 0 : now + c.t0)].bmp, box = spr.box;
  if (c.evolve) {
    const e = now - c.evolve.t;
    if (e > 2800) c.evolve = null;
    else {
      const period = Math.max(70, 420 - (e / 2800) * 360);
      const old = Math.floor(e / period) % 2 === 0 ? spriteFor(c.evolve.from, c.evolve.shiny) : spr;
      if (old) { img = whiteOf(old); box = old.box; }
      ellipse(ctx, sx, sy - box.h * k / 2, box.w * k * 0.7, box.h * k * 0.6, `rgba(255,255,220,${0.25 + 0.2 * Math.sin(e / 60)})`);
    }
  }
  const bw = box.w * k, bh = box.h * k;
  // Destination snapped to whole screen pixels.
  const snap = (v, off) => (Math.round(off + v * S) - off) / S;
  const w = img.width * k, h = img.height * k * squash;
  const x0 = snap(sx - (c.flip ? img.width - box.cx : box.cx) * k + shake + lungeX, offX);
  const y0 = snap(sy - (box.y1 + 1) * k * squash + bob + lift, offY);
  if (swimming) { ctx.beginPath(); ctx.rect(0, 0, BASE_W, sy - 2); ctx.clip(); }
  const drawAt = (im) => (c.flip ? ctx.drawImage(im, 0, 0, w, h) : ctx.drawImage(im, x0, y0, w, h));
  if (c.flip) { ctx.translate(x0 + w, y0); ctx.scale(-1, 1); }
  drawAt(img);
  if (c.struck && Math.floor(now / 70) % 2) { ctx.globalAlpha = alpha * 0.6; drawAt(whiteOf(spr)); } // took a hit
  ctx.restore();
  if (c.struck) { // impact sparks on the side facing the attacker
    const ix = sx + (c.flip ? 7 : -7), iy = sy - Math.round(bh * 0.6);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + now / 80;
      ctx.fillStyle = i % 2 ? '#fff3a0' : '#ffffff';
      ctx.fillRect(Math.round(ix + Math.cos(a) * 5), Math.round(iy + Math.sin(a) * 4), 2, 2);
    }
  }

  if (swimming) {
    const rw = Math.round(bw * 0.45) + Math.round(Math.sin(now / 300) * 2);
    for (let i = -rw; i <= rw; i += 2) { ctx.fillStyle = '#cfe9ff'; ctx.fillRect(sx + i, sy - 2 + Math.round(Math.sin(i + now / 200)), 1, 1); }
  }
  // Spawn / leave poof.
  const age = now - c.born;
  const poof = age < 500 ? age / 500 : c.dying ? Math.min(1, (now - c.dying) / 450) : null;
  if (poof !== null) {
    ctx.globalAlpha = 1 - poof;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2, r = 5 + poof * 10;
      ellipse(ctx, sx + Math.cos(a) * r, sy - 9 + Math.sin(a) * r * 0.6, 2, 2, '#ffffff');
    }
    ctx.globalAlpha = 1;
  }
  // Standing workers hold what they're working on.
  const prop = !operating && !moving && !seat && !c.dying && propFor(d);
  if (prop) drawProp(ctx, prop, sx + (c.flip ? 1 : -1) * Math.round(bw * 0.32), sy - Math.round(bh * 0.3) + bob + lift, reducedMotion.matches ? 0 : now);
  const top = sy - Math.round(bh * squash) + bob + lift;
  const working = !moving && !c.dying && !!action;
  if (!c.dying) drawHabit(ctx, habit, { x: sx, y: sy + bob + lift, top, width: bw, flip: c.flip, swimming });
  life.drawExtras(ctx, c, now, { sx, sy, bw, top, moving, seat, working, pile: Math.min(5, Math.floor((d.load ?? 0) / 12)) });
  c.head = [sx, sy - Math.round(bh * squash) + bob + lift - 2];
  c.headStill = [sx, sy - Math.round(bh * squash) + lift - 2]; // ignores hops: bubbles anchor here
  c.hit = { x0: sx - bw / 2 - 2, x1: sx + bw / 2 + 2, y0: sy - bh - 2 + bob + lift, y1: sy + 3 };
}

function frame(now) {
  // On the TV, 30 frames a second is plenty and halves the work.
  if (TV && now - (frame.last ?? 0) < 30) { requestAnimationFrame(frame); return; }
  const dt = Math.min(0.05, (now - (frame.last ?? now)) / 1000);
  frame.last = now;
  for (const c of [...chars.values()]) step(c, now, dt);
  arenaTick(now);
  hobbyTick(now);

  // The world is drawn straight onto the screen canvas, scaled by S.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.setTransform(S, 0, 0, S, offX, offY);
  // A plain backdrop that fills the whole screen, whatever its shape.
  const view = { x0: -offX / S, y0: -offY / S, x1: (canvas.width - offX) / S, y1: (canvas.height - offY) / S };
  life.drawBackdrop(ctx, view);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(world.terrainCanvas, 0, 0);
  drawWater(ctx, reducedMotion.matches ? 0 : now);

  const scene = sceneNow();
  const items = world.objects.map((o) => ({ d: o.depth, o }));
  for (const c of chars.values()) items.push({ d: c.fx + c.fy + 0.01, c });
  for (const c of residents) if (!c.hidden) items.push({ d: c.fx + c.fy + 0.01, c });
  items.sort((a, b) => a.d - b.d);
  for (const it of items) (it.o ? drawObject(it.o, now, scene) : drawChar(it.c, now));
  drawRoomLabels(ctx, toScreen);
  for (const f of [...flights]) {
    const p = (now - f.t0) / (reducedMotion.matches ? 1 : 2400);
    if (p >= 1) { flights.splice(flights.indexOf(f), 1); chestOpenAt = now; deliveries().n++; savePrefs(); continue; }
    if (p >= 0.35 && p < 0.65) continue; // inside the product machine
    const [tx, ty] = CHEST_TOP;
    const outgoing = p >= 0.65, q = outgoing ? (p - 0.65) / 0.35 : p / 0.35;
    const [sx, sy] = outgoing ? [MACHINE_TOP[0] + 75, MACHINE_TOP[1] + 14] : [f.x, f.y];
    const [ex, ey] = outgoing ? [tx, ty] : MACHINE_TOP;
    drawProp(ctx, outgoing ? 'parcel' : 'sheet', sx + (ex - sx) * q, sy + (ey - sy) * q - Math.sin(q * Math.PI) * 20, now);
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawOverlay(now, items);

  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- overlay (crisp text at screen resolution)

const FONT = '"Pixelify Sans", ui-monospace, monospace';

function drawOverlay(now, items) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${Math.round(6.5 * S)}px ${FONT}`;
  for (const o of world.objects) {
    if (!o.text) continue;
    const [x, y] = toScreen(o.x + 0.5, o.y + 0.5);
    const [dx, dy] = toDisplay(x + o.textAt[0], y + o.textAt[1]);
    ctx.fillStyle = o.textColor ?? '#4a2a12';
    ctx.fillText(o.text, dx, dy + S * 0.5);
  }

  // Today's finished turns, on the chest.
  const n = deliveries().n;
  if (n) {
    const [cx, cy] = toDisplay(CHEST_TOP[0], CHEST_TOP[1] - 10);
    const label = `📄 ${n} done today`;
    ctx.font = `600 ${Math.round(10 * uiK)}px ${FONT}`;
    const w = ctx.measureText(label).width + 10 * uiK, h = 16 * uiK;
    pill(cx - w / 2, cy - h, w, h, 4 * uiK, 'rgba(18,28,38,.78)');
    ctx.fillStyle = '#ffe9a8';
    ctx.fillText(label, cx, cy - h / 2 + uiK * 0.5);
  }

  const people = items.filter((it) => it.c && it.c.head).map((it) => it.c);
  const placed = [];
  for (const c of [...people].reverse()) nameTag(c, placed); // front-most first, so they keep their place
  const placedBubbles = [];
  for (const c of [...people].sort((a, b) => (a.id < b.id ? -1 : 1))) bubble(c, now, placedBubbles); // stable order: no swapping
}

function pill(x, y, w, h, r, fill, stroke, lw) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); }
}

function nameTag(c, placed) {
  const d = c.data;
  if (d.parentId && selected !== c.id) return;
  const [x, y] = toDisplay(...toScreen(c.fx, c.fy));
  const text = d.offDuty ? d.species.name : d.parentId ? d.label : d.project;
  const fs = Math.round((d.parentId ? 7.5 : 8.5) * uiK);
  ctx.font = `600 ${fs}px ${FONT}`;
  const w = ctx.measureText(text).width + 8 * uiK, h = fs + 3 * uiK;
  let ty = y + 3 * uiK;
  // Nudge down until it no longer covers a tag that's already drawn.
  const hits = (r) => placed.some((p) => r.x < p.x + p.w && p.x < r.x + r.w && r.y < p.y + p.h && p.y < r.y + r.h);
  for (let i = 0; i < 4 && hits({ x: x - w / 2, y: ty, w, h }); i++) ty += h + uiK;
  placed.push({ x: x - w / 2, y: ty, w, h });
  ctx.globalAlpha = c.dying ? 0.4 : 1;
  pill(x - w / 2, ty, w, h, 2 * uiK, d.parentId ? 'rgba(40,40,70,.60)' : 'rgba(18,28,38,.66)');
  ctx.fillStyle = d.needsYou ? '#ffe066' : '#f3f6f8';
  ctx.fillText(text, x, ty + h / 2 + uiK * 0.5);
  ctx.globalAlpha = 1;
}

// What the bubble says, in words: the actual action, not just an icon.
function bubbleText(c, d) {
  if (c.fighting) return '';
  if (c.evolve) return 'What? It\'s evolving!';
  if (d.provider === 'codex' && !['done', 'idle', 'sleeping', 'waiting', 'blocked', 'error'].includes(d.state)) return d.progressText || d.detail || 'Thinking…';
  if (d.state === 'thinking') return 'Thinking…';
  if (d.state === 'done') return 'Done, your turn';
  if (d.state === 'idle') return '';
  return d.detail || '';
}

function bubble(c, now, placed = []) {
  const d = c.data;
  if (c.dying) return;
  if (operatingProduct(c) && !d.needsYou && selected !== c.id && !c.evolve) return;
  const [hx, hy] = toDisplay(...(c.headStill ?? c.head)); // steady, even while it hops
  if ((d.state === 'sleeping' || c.napUntil > now) && !c.fighting) {
    ctx.font = `700 ${Math.round(13 * uiK)}px ${FONT}`;
    for (let i = 0; i < 3; i++) {
      const p = ((now / 2400) + i / 3) % 1;
      ctx.globalAlpha = Math.sin(p * Math.PI);
      ctx.fillStyle = '#e8f1ff';
      ctx.fillText(i % 2 ? 'Z' : 'z', hx + (8 + p * 14) * uiK, hy - p * 26 * uiK);
    }
    ctx.globalAlpha = 1;
    return;
  }
  let icon = BUBBLE[d.state];
  if (d.state === 'thinking' && (d.progressText || Date.now() - d.since > 600)) icon = '…';
  if (c.evolve) icon = '✨';
  if (c.fighting && arena.started) icon = '⚔️';
  if (!icon) return;
  let text = bubbleText(c, d);
  const attention = d.needsYou || d.state === 'blocked';
  // Hold what the bubble says for a moment, so it doesn't flicker as quick tool calls fly by.
  const say = `${icon}\u0000${text}`;
  if (c.say !== say && (c.say === undefined || attention || now - (c.sayAt ?? 0) > 1500)) { c.say = say; c.sayAt = now; }
  [icon, text] = c.say.split('\u0000');

  const fs = Math.round(12 * uiK);
  ctx.font = `600 ${fs}px ${FONT}`;
  let label = text;
  const maxW = (selected === c.id ? 260 : d.parentId ? 130 : 170) * uiK; // helpers' bubbles are a bit narrower
  while (label && ctx.measureText(label).width > maxW) label = `${label.slice(0, -2)}…`;
  const iconW = Math.max(fs * 1.25, ctx.measureText(icon).width);
  const w = iconW + (label ? ctx.measureText(label).width + 8 * uiK : 0) + 12 * uiK;
  const h = fs + 12 * uiK;
  const urgency = d.state === 'waiting' ? Math.min(1, (Date.now() - d.since) / 180_000) : 0;
  const pop = attention ? 1 + (0.06 + 0.12 * urgency) + (0.06 + 0.08 * urgency) * Math.max(0, Math.sin(now / 160)) : 1;
  const bx = hx - w / 2;
  let by = hy - h - 10 * uiK;
  // Stack bubbles upwards rather than on top of each other.
  const hits = (y) => placed.some((p) => bx < p.x + p.w && p.x < bx + w && y < p.y + p.h && p.y < y + h);
  for (let i = 0; i < 4 && hits(by); i++) by -= h + 3 * uiK;
  placed.push({ x: bx, y: by, w, h });
  // Glide to a new stacking height instead of jumping there.
  const lift = by - hy;
  c.bubbleLift = c.bubbleLift == null || Math.abs(c.bubbleLift - lift) > 120 * uiK ? lift : c.bubbleLift + (lift - c.bubbleLift) * 0.12;
  by = hy + c.bubbleLift;

  ctx.save();
  ctx.translate(hx, hy); ctx.scale(pop, pop); ctx.translate(-hx, -hy);
  const fill = attention ? '#ffe066' : d.state === 'error' ? '#ffd6d6' : '#ffffff';
  pill(bx, by, w, h, 6 * uiK, fill, '#1d2a33', 2 * uiK);
  ctx.beginPath();
  ctx.moveTo(hx - 5 * uiK, by + h - 1); ctx.lineTo(hx, by + h + 7 * uiK); ctx.lineTo(hx + 5 * uiK, by + h - 1);
  ctx.fillStyle = fill; ctx.fill();
  ctx.lineWidth = 2 * uiK; ctx.strokeStyle = '#1d2a33';
  ctx.beginPath(); ctx.moveTo(hx - 5 * uiK, by + h); ctx.lineTo(hx, by + h + 7 * uiK); ctx.lineTo(hx + 5 * uiK, by + h); ctx.stroke();
  ctx.textAlign = 'left';
  ctx.fillStyle = attention ? '#c0261d' : '#1d2a33';
  ctx.font = `700 ${fs}px ${FONT}`;
  ctx.fillText(icon, bx + 6 * uiK, by + h / 2 + uiK);
  if (label) { ctx.font = `600 ${fs}px ${FONT}`; ctx.fillStyle = '#1d2a33'; ctx.fillText(label, bx + 6 * uiK + iconW + 6 * uiK, by + h / 2 + uiK); }
  ctx.restore();
  ctx.textAlign = 'center';

  if (c.levelUp && now - c.levelUp < 1800) {
    const p = (now - c.levelUp) / 1800;
    ctx.globalAlpha = 1 - p;
    ctx.font = `700 ${Math.round(13 * uiK)}px ${FONT}`;
    ctx.fillStyle = '#ffe066';
    ctx.fillText(`Lv ${d.level}!`, hx, by - 8 * uiK - p * 24 * uiK);
    ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------- picking

function pick(e) {
  const r = canvas.getBoundingClientRect();
  const bx = ((e.clientX - r.left) * dpr - offX) / S, by = ((e.clientY - r.top) * dpr - offY) / S;
  const list = [...chars.values(), ...residents].filter((c) => c.hit && !c.hidden && !c.dying).sort((a, b) => (b.fx + b.fy) - (a.fx + a.fy));
  return list.find((c) => bx >= c.hit.x0 && bx <= c.hit.x1 && by >= c.hit.y0 && by <= c.hit.y1);
}
canvas.addEventListener('click', (e) => {
  const c = pick(e);
  selected = c ? c.id : null;
  if (c) { c.cheer = performance.now(); if (prefs.sound) life.cry(c.data.species.id); }
  dirty = true;
});
canvas.addEventListener('pointermove', (e) => { canvas.style.cursor = pick(e) ? 'pointer' : 'default'; });

// ---------------------------------------------------------------- panel

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const spriteUrl = (sp, shiny) => spritePath(sp.id, shiny);
function ago(t) {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : `${Math.floor(s / 3600)}h`;
}
const clock = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function card(d, kids) {
  const lo = (d.level - 1) ** 2, hi = d.level ** 2;
  const xpPct = Math.round(((d.xp - lo) / Math.max(1, hi - lo)) * 100);
  const sel = selected === d.id;
  const todo = d.todos && d.todos.total
    ? `<div class="todo"><div class="bar"><span style="width:${Math.round((d.todos.done / d.todos.total) * 100)}%"></span></div><small>${d.todos.done}/${d.todos.total} tasks</small></div>` : '';
  const kidHtml = kids.length
    ? `<div class="kids">${kids.map((k) => `<span class="kid"><img src="${spriteUrl(k.species)}" alt="">${esc(k.label)} · ${esc(STATE_LABEL[k.state] ?? k.state)}</span>`).join('')}</div>` : '';
  const more = sel ? `
    <ol class="recent">${d.recent.map((r) => `<li><time>${clock(r.t)}</time>${esc(r.text)}</li>`).join('') || '<li>No tool calls yet</li>'}</ol>
    <label class="pickline">Starter for this project
      <select data-project="${esc(d.projectKey)}">${lines.map((l) => `<option value="${l.key}"${l.key === d.species.line ? ' selected' : ''}>${esc(l.name)}</option>`).join('')}</select>
    </label>` : '';
  return {
    cls: `card s-${d.state}${sel ? ' sel' : ''}${d.needsYou || d.state === 'blocked' ? ' attn' : ''}`,
    img: spriteUrl(d.species, d.shiny),
    body: `
      <div class="top"><b>${esc(d.project)}</b>${d.demo ? '<span class="tag">demo</span>' : d.provider === 'codex' ? '<span class="tag">Codex</span>' : '<span class="tag">Claude</span>'}<span class="lv">Lv ${d.level}</span></div>
      <div class="sub">${esc(d.species.name)}${d.shiny ? ' ✨' : ''}<span class="ago" data-since="${d.since}"></span></div>
      <div class="state-line"><span class="chip">${esc(STATE_LABEL[d.state] ?? d.state)}</span></div>
      <div class="detail">${esc(d.detail)}</div>
      ${d.progressText ? `<div class="live-progress" title="${esc(d.progressText)}">${esc(d.progressText)}</div>` : ''}
      ${todo}
      <div class="xp" title="${d.xp} XP"><span style="width:${xpPct}%"></span></div>
      ${kidHtml}${more}`,
  };
}

// Cards are kept and patched rather than rebuilt, so the animated sprites never reload or flicker.
const cardEls = new Map();
const titleEls = {};
function cardEl(d, kids) {
  const v = card(d, kids);
  let el = cardEls.get(d.id);
  if (!el) {
    el = document.createElement('article');
    el.dataset.id = d.id;
    el.innerHTML = '<img class="mon" alt=""><div class="body"></div>';
    cardEls.set(d.id, el);
  }
  if (el.className !== v.cls) el.className = v.cls;
  const img = el.firstChild;
  if (img.getAttribute('src') !== v.img) { img.src = v.img; img.alt = d.species.name; }
  if (el.lastChild._html !== v.body) { el.lastChild.innerHTML = v.body; el.lastChild._html = v.body; }
  return el;
}

function renderPanel() {
  if (document.activeElement?.tagName === 'SELECT') return;
  const all = [...chars.values()].filter((c) => !c.dying).map((c) => c.data);
  const mains = all.filter((d) => !d.parentId && !d.offDuty);
  const kidsOf = (id) => all.filter((k) => k.parentId === id);
  const needs = mains.filter((d) => d.needsYou || d.state === 'blocked');
  const resting = mains.filter((d) => !needs.includes(d) && ['done', 'sleeping', 'idle', 'leaving'].includes(d.state));
  const working = mains.filter((d) => !needs.includes(d) && !resting.includes(d));
  for (const button of document.querySelectorAll('[data-resident]')) button.setAttribute('aria-pressed', String(button.dataset.resident === selected));

  const box = $('#agents');
  const nodes = [];
  for (const [title, list, cls] of [['Needs you', needs, 'needs'], ['Working', working, 'working'], ['Your turn', resting, 'resting']]) {
    if (!list.length) continue;
    const h = titleEls[cls] ??= Object.assign(document.createElement('h2'), { className: `group-title ${cls}` });
    const html = `${title} <span>${list.length}</span>`;
    if (h.innerHTML !== html) h.innerHTML = html;
    nodes.push(h, ...list.map((d) => cardEl(d, kidsOf(d.id))));
  }
  for (const id of [...cardEls.keys()]) if (!mains.some((d) => d.id === id)) cardEls.delete(id);
  // Nobody here: the team panel hides itself and the hint on the map says so.
  // Only touch the DOM where order actually changed.
  nodes.forEach((n, i) => { if (box.children[i] !== n) box.insertBefore(n, box.children[i] ?? null); });
  while (box.children.length > nodes.length) box.lastChild.remove();
  for (const el of box.querySelectorAll('.ago[data-since]')) el.textContent = ago(Number(el.dataset.since));

  $('#feed').innerHTML = feed.slice(0, 8).map((l) =>
    `<li class="k-${esc(l.kind)}"><time>${clock(l.t)}</time><b>${esc(l.who)}</b> <span class="proj">(${esc(l.project)})</span> ${esc(l.text)}</li>`).join('');
  $('#counts').textContent = mains.length ? `${working.length} working · ${needs.length} need you` : '';
  document.title = needs.length ? `(${needs.length}) Pallet Office` : 'Pallet Office';
  $('#hint').hidden = !booted || mains.length > 0; // only once the live data is in
}

$('#agents').addEventListener('click', (e) => {
  if (e.target.closest('select, label')) return;
  const el = e.target.closest('.card');
  if (!el) return;
  selected = selected === el.dataset.id ? null : el.dataset.id;
  dirty = true;
});
$('#agents').addEventListener('change', async (e) => {
  const sel = e.target.closest('select[data-project]');
  if (!sel) return;
  sel.blur();
  await post('api/species', { projectKey: sel.dataset.project, line: sel.value });
});

// ---------------------------------------------------------------- sound + notifications

let audio = null;
let music = null, musicLoading = false;
// Music starts on its own unless you've switched it off. Browsers only allow sound after you've
// interacted with the page, so if it's blocked on load, it starts on your first click or key press.
function autoMusic() {
  if ((prefs.musicOff && !TV) || music?.playing || musicLoading) return;
  try { audio ??= new AudioContext(); } catch { return; }
  if (audio.state === 'running') startMusic();
  else audio.resume().then(() => { if (audio.state === 'running') startMusic(); }).catch(() => {});
}
for (const type of ['pointerdown', 'keydown']) {
  addEventListener(type, (e) => {
    try { audio ??= new AudioContext(); audio.resume(); } catch { /* no audio */ }
    if (!e.target.closest?.('#musicBtn')) autoMusic();
  }, { once: !TV });
}
// On the TV the music is never off: keep trying until the browser lets it play, and restart it if it stops.
if (TV) setInterval(autoMusic, 3000);

async function startMusic() {
  if (musicLoading) return;
  musicLoading = true; syncButtons();
  try {
    audio ??= new AudioContext(); music ??= createLofiPlayer(audio);
    music.setVolume((TV ? Math.max(prefs.musicVolume, 20) : prefs.musicVolume) / 100); // never silent on the TV
    await music.play();
    prefs.music = true; savePrefs();
  } catch (error) {
    $('#musicBtn').title = 'Music could not start. Click to try again.';
    console.warn('Could not start music:', error);
  } finally { musicLoading = false; syncButtons(); }
}
const TUNES = {
  ship: [[523, 0.08], [659, 0.08], [784, 0.08], [1047, 0.12], [784, 0.08], [1047, 0.25]],
  pass: [[784, 0.07], [1047, 0.14]],
  heal: [[1047, 0.14], [1047, 0.14], [1047, 0.14], [784, 0.28], [1047, 0.14], [1319, 0.36]], // the Pokémon Center
  attention: [[988, 0.08], [1319, 0.16], [988, 0.08], [1319, 0.16]],
  done: [[523, 0.07], [659, 0.07], [784, 0.07], [1047, 0.18]],
  error: [[220, 0.1], [165, 0.18]],
  join: [[660, 0.06], [990, 0.1]],
  level: [[784, 0.07], [988, 0.07], [1175, 0.15]],
  evolve: [[523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.1], [1319, 0.1], [1568, 0.3]],
};
function sound(kind) {
  if (!kind || !prefs.sound || !booted || !audio || audio.state !== 'running') return;
  let t = audio.currentTime + 0.01;
  for (const [f, dur] of TUNES[kind]) {
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = kind === 'error' ? 'sawtooth' : 'square';
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(audio.destination);
    o.start(t); o.stop(t + dur + 0.02);
    t += dur * 0.9;
  }
}

function notify(d) {
  if (!prefs.notify || !booted || !('Notification' in window) || Notification.permission !== 'granted' || document.hasFocus()) return;
  try { new Notification(`${d.project} needs you`, { body: d.detail ?? '', icon: spriteUrl(d.species, d.shiny), tag: d.id }); } catch { /* unsupported */ }
}

function syncButtons() {
  $('#musicBtn').disabled = musicLoading;
  $('#musicBtn').setAttribute('aria-pressed', String(!!music?.playing));
  $('#musicBtn').textContent = musicLoading ? '♫ Loading…' : music?.playing ? '♫ Music on' : '♫ Play music';
  $('#musicVolumeControl').hidden = !music?.playing;
  $('#musicVolume').value = prefs.musicVolume;
  $('#soundBtn').setAttribute('aria-pressed', String(prefs.sound));
  $('#soundBtn').textContent = prefs.sound ? '🔊 Sound' : '🔇 Muted';
  $('#notifyBtn').setAttribute('aria-pressed', String(prefs.notify));
  $('#notifyBtn').textContent = prefs.notify ? '🔔 Alerts on' : '🔕 Alerts off';
}
// Full screen: the browser's own on most devices; on an iPad without it, a home-screen tip.
const fullscreenEl = () => document.fullscreenElement ?? document.webkitFullscreenElement;
function syncFullscreen() {
  const btn = $('#fullBtn');
  btn.hidden = !!fullscreenEl() || window.navigator.standalone === true;
  btn.textContent = '⛶ Full screen';
}
$('#fullBtn').addEventListener('click', async () => {
  const el = document.documentElement, go = el.requestFullscreen ?? el.webkitRequestFullscreen;
  try { if (!go) throw new Error('unsupported'); await go.call(el); }
  catch { $('#fullBtn').textContent = 'Share → Add to Home Screen'; setTimeout(syncFullscreen, 5000); }
});
for (const type of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(type, syncFullscreen);
syncFullscreen();
// On the TV the button only shows for a few seconds after you touch or move the mouse.
if (TV) {
  let idleTimer;
  const wake = () => { document.body.classList.remove('idle'); clearTimeout(idleTimer); idleTimer = setTimeout(() => document.body.classList.add('idle'), 4000); };
  for (const type of ['pointermove', 'pointerdown', 'keydown']) addEventListener(type, wake);
  wake();
}
$('#soundBtn').addEventListener('click', () => { prefs.sound = !prefs.sound; savePrefs(); syncButtons(); });
$('#musicBtn').addEventListener('click', () => {
  if (music?.playing) { music.stop(); prefs.music = false; prefs.musicOff = true; savePrefs(); syncButtons(); }
  else { prefs.musicOff = false; startMusic(); }
});
$('#musicVolume').addEventListener('input', (e) => {
  prefs.musicVolume = Number(e.target.value); music?.setVolume(prefs.musicVolume / 100); savePrefs();
});
$('#notifyBtn').addEventListener('click', async () => {
  if (!prefs.notify && 'Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
  prefs.notify = !prefs.notify && 'Notification' in window && Notification.permission === 'granted';
  savePrefs(); syncButtons();
});

function post(url, body) {
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {});
}

// ---------------------------------------------------------------- live connection

function connect() {
  const es = STATIC ? STATIC.feed() : new EventSource('stream');
  const conn = $('#conn');
  es.addEventListener('open', () => { conn.textContent = 'live'; conn.className = 'conn live'; });
  es.addEventListener('error', () => { conn.textContent = 'reconnecting…'; conn.className = 'conn down'; });
  es.addEventListener('snapshot', (e) => {
    const s = JSON.parse(e.data);
    lines = s.lines; feed = s.log; demoOn = s.demo; syncButtons();
    const ids = new Set(s.agents.map((a) => a.id));
    for (const id of [...chars.keys()]) if (!ids.has(id)) forget(id);
    s.agents.sort((a, b) => (a.parentId ? 1 : 0) - (b.parentId ? 1 : 0)).forEach((a) => upsert(a, !booted));
    booted = true;
    dirty = true;
  });
  es.addEventListener('agent', (e) => upsert(JSON.parse(e.data)));
  es.addEventListener('moment', (e) => {
    const m = JSON.parse(e.data), c = chars.get(m.id);
    if (!c) return;
    c.moment = { kind: m.kind, t: performance.now() };
    sound({ commit: 'ship', push: 'ship', pr: 'ship', 'test-pass': 'pass', 'test-fail': 'error', heal: 'heal' }[m.kind] ?? null);
  });
  es.addEventListener('remove', (e) => { const m = JSON.parse(e.data); removeChar(m.id, m.handoff); });
  es.addEventListener('log', (e) => { feed.unshift(JSON.parse(e.data)); feed.length = Math.min(feed.length, 80); dirty = true; });
  es.addEventListener('meta', (e) => { demoOn = JSON.parse(e.data).demo; syncButtons(); });
}

syncButtons();
autoMusic();
connect();
requestAnimationFrame(frame);
// The panel runs on a timer, not animation frames, so it (and the "(2) Pallet Office" tab title)
// stays current even in a background tab.
let panelAt = 0;
setInterval(() => {
  const now = Date.now();
  if (dirty || now - panelAt > 1000) {
    dirty = false; panelAt = now; renderPanel();

  }
}, 200);
