// Activity comes from the agent feed. Cosmetic habits never change that feed.
const WORK = new Set(['reading', 'web', 'editing', 'running', 'planning', 'delegating']);
const REST = new Set(['idle', 'done', 'chilling']);
export function workActivity(data) {
  if (!data || data.offDuty || data.needsYou) return null;
  if (WORK.has(data.state)) return data.state;
  return data.state === 'thinking' && WORK.has(data.activity) ? data.activity : null;
}

export function idleHabit(data, now, { moving = false, fighting = false, napping = false, hobby = false, supervising = false, reduced = false } = {}) {
  if (reduced || moving || fighting || napping || hobby || supervising || data.parentId || data.needsYou || !REST.has(data.state)) return null;
  const id = data.species.id;
  const elapsed = (now + id * 997) % 26000;
  if (elapsed > 5200) return null;
  const kind = id === 150 ? 'meditate' : id === 7 ? 'splash' : id === 1 ? 'leaf'
    : id === 25 ? 'spark' : [6, 149, 373].includes(id) ? 'stretch'
    : [374, 375, 376].includes(id) ? 'polish' : 'sip';
  return { kind, phase: elapsed / 5200 };
}

const pixel = (c, color, x, y, w = 1, h = 1) => {
  c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), w, h);
};

export function drawHabit(ctx, habit, { x, y, top, width, flip, swimming }) {
  if (!habit) return;
  const p = habit.phase, side = flip ? 1 : -1;
  const handX = x + side * Math.min(10, width * 0.3), handY = y - (y - top) * 0.35;
  if (habit.kind === 'meditate') {
    for (let i = 0; i < 2; i++) {
      const a = p * Math.PI * 2 + i * Math.PI;
      pixel(ctx, '#bca8db', x + Math.cos(a) * 9, y - 5 + Math.sin(a) * 3);
    }
  } else if (habit.kind === 'splash' && swimming && p > 0.25 && p < 0.7) {
    const q = (p - 0.25) / 0.45;
    for (let i = -1; i <= 1; i++) pixel(ctx, '#8bbcf0', x + i * (4 + q * 6), y - 3 - Math.sin(q * Math.PI) * (5 - Math.abs(i)), 1, 2);
  } else if (habit.kind === 'leaf') {
    pixel(ctx, '#aecb66', handX + Math.sin(p * 6) * 2, handY - 4, 3, 1);
    pixel(ctx, '#4d7936', handX + 1, handY - 3, 1, 2);
  } else if (habit.kind === 'spark' && p > 0.4 && p < 0.52) {
    pixel(ctx, '#d8b47a', x + width * 0.35, top + 7, 1, 2);
    pixel(ctx, '#f2d48a', x + width * 0.35 + 1, top + 9, 2, 1);
  } else if (habit.kind === 'polish' && p > 0.3 && p < 0.6) {
    pixel(ctx, '#c4beb0', handX, handY, 3, 2);
    pixel(ctx, '#f4ece0', handX + 2, handY - 2);
  } else if (habit.kind === 'sip') {
    const lift = Math.round(Math.sin(p * Math.PI) * 3), hy = handY - lift;
    pixel(ctx, '#25303b', handX - 3, hy - 3, 6, 5);
    pixel(ctx, '#ece8d6', handX - 2, hy - 2, 4, 3);
    pixel(ctx, '#7b4a2b', handX - 2, hy - 3, 4, 1);
    pixel(ctx, '#ece8d6', handX + 3, hy - 2, 1, 2);
  }
}
