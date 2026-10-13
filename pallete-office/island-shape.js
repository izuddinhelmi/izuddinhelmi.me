// A broad garden apron gives the five-room lodge room to breathe.
// Stepped banks and shallow inlets keep the larger island from becoming a rectangle.
export const ISLAND_WIDTH = 27;
export const ISLAND_HEIGHT = 25;
export const WATERFALL_TILE = [3, 22];
const banks = [
  [0,23], [0,23], [0,23], [0,23], [0,23], [0,23], [0,22], [0,22],
  [0,24], [0,25], [0,26], [0,26], [0,26], [0,25], [0,25], [0,24],
  [0,24], [0,25], [0,25], [1,24], [2,24], [2,23], [3,22], [6,21], [11,17],
];
const notches = new Set([
  '8,0', '9,0',
  '0,18', '1,19', '2,21', '6,23', '7,23', '21,23',
]);

export function isIslandTile(x, y) {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
  const bank = banks[y];
  return !!bank && x >= bank[0] && x <= bank[1] && !notches.has(`${x},${y}`);
}

export function exposedEdges(terrain) {
  const edges = [];
  terrain.forEach((column, x) => column.forEach((tile, y) => {
    if (!tile) return;
    if (!terrain[x]?.[y + 1]) edges.push({x, y, side:'left', tile});
    if (!terrain[x + 1]?.[y]) edges.push({x, y, side:'right', tile});
  }));
  return edges.sort((a,b) => a.x + a.y - b.x - b.y);
}
