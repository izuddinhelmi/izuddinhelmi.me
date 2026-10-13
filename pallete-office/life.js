// Everyday Pokémon movement, off-duty hobbies, and work effects.
import { toScreen, ellipse, drawProp } from './world.js';

const R = (c, color, x, y, w = 1, h = 1) => { c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), w, h); };
// A steady daytime backdrop; the office does not change with weather or activity.
export function drawBackdrop(ctx, view) {
  ctx.fillStyle = '#3e5b6a';
  ctx.fillRect(Math.floor(view.x0) - 2, Math.floor(view.y0) - 2, Math.ceil(view.x1 - view.x0) + 4, Math.ceil(view.y1 - view.y0) + 4);
}

const waterCache = new WeakMap();
function waterTiles(world) {
  if (!waterCache.has(world)) {
    const list = [];
    world.terrain.forEach((col, x) => col.forEach((t, y) => { if (t === 'w') list.push([x, y]); }));
    waterCache.set(world, list);
  }
  return waterCache.get(world);
}

export function nearestWater(world, x, y) {
  let best = null;
  for (const [wx, wy] of waterTiles(world)) {
    const d = Math.hypot(wx - x, wy - y);
    if (!best || d < best.d) best = { tile: [wx, wy], d };
  }
  return best;
}

// ---------------------------------------------------------------- the Pokémon themselves

// Flyers lift off when they travel; floaters always hover a little. Goomy and family slide.
const FLYERS = new Set([6, 148, 149, 373, 635, 887]);
const FLOATERS = new Set([150, 374, 375, 376, 885, 886]);
const SLIDERS = new Set([704, 705, 706]);
export function hover(id, moving, now, t0) {
  if (FLYERS.has(id) && moving) return -10 + Math.sin((now + t0) / 180) * 1.5;
  if (FLOATERS.has(id)) return -4 + Math.sin((now + t0) / 420) * 1.5;
  return 0;
}
export const slides = (id) => SLIDERS.has(id);

// A little flourish by type while a Pokémon is working.
function flair(ctx, type, x, top, bw, t) {
  const p = (t / 900) % 1;
  switch (type) {
    case 'fire':
      for (let i = 0; i < 3; i++) { const q = (p + i / 3) % 1; ctx.globalAlpha = 1 - q; R(ctx, q < 0.5 ? '#ffd27a' : '#ff8a3a', x - 3 + i * 3 + Math.sin(t / 150 + i) * 2, top + 2 - q * 10); }
      break;
    case 'electric':
      if (Math.floor(t / 160) % 3 === 0) { const s = Math.floor(t / 160) % 2 ? 1 : -1; for (let i = 0; i < 4; i++) R(ctx, '#ffe95c', x + s * (bw * 0.45 + (i % 2)), top + 6 + i * 2); }
      break;
    case 'water':
      for (let i = 0; i < 2; i++) { const q = (p + i / 2) % 1; ctx.globalAlpha = 1 - q; R(ctx, '#8fd0ff', x + (i ? 1 : -1) * (3 + q * 6), top + 4 - Math.sin(q * Math.PI) * 6); }
      break;
    case 'grass':
      { ctx.globalAlpha = 1 - p; R(ctx, '#8fd16a', x + Math.sin(t / 300) * 6, top - p * 8, 2, 1); }
      break;
    case 'psychic':
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t / 200);
      for (let a = 0; a < 10; a++) { const r = (a / 10) * Math.PI * 2 + t / 500; R(ctx, '#c9a8ff', x + Math.cos(r) * (bw * 0.5), top + 10 + Math.sin(r) * 3); }
      break;
    case 'rock': case 'steel':
      if (Math.floor(t / 400) % 2) R(ctx, '#ffffff', x - bw * 0.3 + (Math.floor(t / 400) % 5) * 3, top + 8);
      break;
    default: // dragons, dark and the rest: a few sparkles
      for (let i = 0; i < 2; i++) { const q = (p + i / 2) % 1; ctx.globalAlpha = 1 - q; R(ctx, i ? '#9fc8ff' : '#d8b0ff', x + (i ? 5 : -5), top + 4 - q * 8); }
  }
  ctx.globalAlpha = 1;
}

// One burst of firework sparks.
function burst(ctx, x, y, p, color, n = 10, r = 14) {
  ctx.globalAlpha = Math.max(0, 1 - p);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    R(ctx, color, x + Math.cos(a) * r * p, y + Math.sin(a) * r * p * 0.8 + p * p * 4, 2, 2);
  }
  ctx.globalAlpha = 1;
}

const MOMENT_MS = { commit: 2600, push: 2600, pr: 2600, 'test-pass': 1600, 'test-fail': 1800, heal: 1700, compact: 900 };
export const momentActive = (c, now) => c.moment && now - c.moment.t < (MOMENT_MS[c.moment.kind] ?? 1500);

// Everything drawn on and around one Pokémon. g: where it is and what it's up to.
export function drawExtras(ctx, c, now, g) {
  const d = c.data, { sx, sy, bw, top } = g;
  if (g.working) flair(ctx, d.species.type, sx, top, bw, now + c.t0);

  if (d.status === 'hurt' && !d.parentId) { // poisoned by a failed tool: bubbles until it's healed
    for (let i = 0; i < 3; i++) {
      const q = ((now / 1100) + i / 3) % 1;
      ctx.globalAlpha = 1 - q;
      ellipse(ctx, sx - 4 + i * 4, top - q * 10, 1 + (i % 2), 1 + (i % 2), '#b27ad9');
    }
    ctx.globalAlpha = 1;
  }
  if (d.state === 'blocked') { // fainted: stars circling its head
    for (let i = 0; i < 3; i++) { const a = now / 300 + (i / 3) * Math.PI * 2; R(ctx, '#ffe066', sx + Math.cos(a) * 7, top + 2 + Math.sin(a) * 2, 2, 2); }
  }
  if (g.pile > 0 && !g.moving && !g.seat) { // the context window filling up, as a pile of papers
    const side = c.flip ? -1 : 1;
    for (let i = 0; i < g.pile; i++) { R(ctx, '#a2a8ae', sx + side * (bw * 0.5) - 3, sy - 1 - i * 2, 7, 1); R(ctx, '#ffffff', sx + side * (bw * 0.5) - 3, sy - 2 - i * 2, 7, 1); }
  }
  if (d.parentId && d.state === 'leaving') drawProp(ctx, 'sheet', sx, top - 6 + Math.sin(now / 120) * 1, now); // carrying its report

  if (c.hobby?.kind === 'fish') fishing(ctx, c, now, g);
  if (c.hobby?.kind === 'stones') stones(ctx, c, now, g);

  if (momentActive(c, now)) {
    const e = now - c.moment.t;
    switch (c.moment.kind) {
      case 'commit': case 'push': case 'pr':
        [['#ffe066', 0], ['#ff7aa2', 500], ['#7fe3ff', 1000]].forEach(([col, delay], i) => {
          const p = (e - delay) / 1300;
          if (p > 0 && p < 1) burst(ctx, sx + (i - 1) * 12, top - 16 - i * 4, p, col);
        });
        break;
      case 'test-pass': burst(ctx, sx, top - 8, e / 1600, '#6fcf97', 12, 12); break;
      case 'test-fail':
        for (let i = 0; i < 3; i++) { const q = (e / 1800 + i / 3) % 1; ctx.globalAlpha = 1 - q; ellipse(ctx, sx - 4 + i * 4, top - 4 - q * 10, 2 + q * 2, 2 + q, '#8e9499'); }
        R(ctx, '#7fc8ff', sx + bw * 0.35, top + 4 + (e / 300) % 3, 2, 3);
        ctx.globalAlpha = 1;
        break;
      case 'heal':
        for (let i = 0; i < 5; i++) {
          const q = ((e / 1700) + i / 5) % 1;
          ctx.globalAlpha = 1 - q;
          const x = sx - 8 + i * 4, y = top + 10 - q * 18;
          R(ctx, '#ff9ac6', x - 1, y, 3, 1); R(ctx, '#ff9ac6', x, y - 1, 1, 3);
        }
        ctx.globalAlpha = 1;
        break;
      case 'compact': // stomp! the paper pile is flattened
        burst(ctx, sx, sy, e / 900, '#d8c9a8', 12, 16);
        break;
    }
  }
  if (c.cheer && now - c.cheer < 1400) { // you clicked it: hearts
    const q = (now - c.cheer) / 1400;
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = 1 - q;
      const x = sx - 6 + i * 6, y = top - 4 - q * 16 - i * 2;
      R(ctx, '#ff6b8a', x, y, 1, 1); R(ctx, '#ff6b8a', x + 2, y, 1, 1); R(ctx, '#ff6b8a', x - 1, y + 1, 5, 1); R(ctx, '#ff6b8a', x, y + 2, 3, 1); R(ctx, '#ff6b8a', x + 1, y + 3, 1, 1);
    }
    ctx.globalAlpha = 1;
  }
}

// Off-duty fishing: rod, line, a bobbing float, and now and then a catch.
function fishing(ctx, c, now, g) {
  const { sx, top, bw } = g;
  const [wx, wy] = toScreen(c.hobby.at[0] + 0.5, c.hobby.at[1] + 0.5);
  const dir = wx > sx ? 1 : -1;
  const hx = sx + dir * bw * 0.35, hy = top + 8;
  const tipX = hx + dir * 7, tipY = hy - 7;
  for (let i = 0; i <= 7; i++) R(ctx, '#7a4a2b', hx + dir * i, hy - i);
  const p = ((now - c.hobby.since) % 9000) / 9000;
  const bite = p > 0.82;
  const bx = wx, by = wy + (bite ? 1 : 0) + Math.round(Math.sin(now / 400) * 0.8);
  const steps = 16;
  for (let i = 1; i < steps; i++) { const t = i / steps; R(ctx, 'rgba(230,240,255,.55)', tipX + (bx - tipX) * t, tipY + (by - tipY) * t + Math.sin(t * Math.PI) * 4); }
  R(ctx, '#e2553f', bx - 1, by - 2, 2, 1); R(ctx, '#ffffff', bx - 1, by - 1, 2, 1);
  if (bite) {
    R(ctx, '#ffe066', sx - 1, top - 10, 2, 4); R(ctx, '#ffe066', sx - 1, top - 5, 2, 1); // !
    if (p > 0.9) { const q = (p - 0.9) / 0.1; R(ctx, '#f2994a', bx - 2 + dir * q * 6, by - 4 - Math.sin(q * Math.PI) * 8, 4, 2); }
  }
}

// Off-duty stone skipping: a stone arcs out and skips across the water.
function stones(ctx, c, now, g) {
  const { sx, top } = g;
  const [wx, wy] = toScreen(c.hobby.at[0] + 0.5, c.hobby.at[1] + 0.5);
  const p = ((now - c.hobby.since) % 7000) / 7000;
  if (p < 0.35) {
    const q = p / 0.35;
    R(ctx, '#9aa0a6', sx + (wx - sx) * q, top + 8 + (wy - top - 8) * q - Math.sin(q * Math.PI) * 14, 2, 2);
  } else if (p < 0.7) {
    const q = (p - 0.35) / 0.35;
    for (let i = 0; i < 3; i++) {
      if (q < i * 0.25) continue;
      const k = (q - i * 0.25) / 0.5;
      if (k > 1) continue;
      ctx.globalAlpha = 1 - k;
      for (let a = 0; a < 8; a++) { const t = (a / 8) * Math.PI * 2; R(ctx, '#e8f4ff', wx - 10 + i * 9 + Math.cos(t) * (1 + k * 5), wy - i * 3 + Math.sin(t) * (0.5 + k * 2)); }
      ctx.globalAlpha = 1;
    }
  }
}

// ---------------------------------------------------------------- cries

const cries = new Map();
let lastCry = 0;
export function cry(id) {
  if (!(id > 0)) return;
  const now = performance.now();
  if (now - lastCry < 1200) return; // never a chorus
  lastCry = now;
  let a = cries.get(id);
  if (!a) { a = new Audio(globalThis.PALLET_STATIC?.cry(id) ?? `cry/${id}`); a.volume = 0.22; cries.set(id, a); }
  try { a.currentTime = 0; a.play().catch(() => {}); } catch { /* audio not ready yet */ }
}
