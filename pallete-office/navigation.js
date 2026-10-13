const DIRS = [[1,0],[0,1],[-1,0],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];

// Walls are real obstacles: even a requested destination must be walkable.
// An unreachable target leaves the character in place instead of teleporting it.
export function findRoute(world, [sx,sy], [tx,ty], swim = false) {
  if (sx === tx && sy === ty || !world.walkable(tx,ty,swim)) return [];
  const key = (x,y) => `${x},${y}`;
  const start = key(sx,sy), target = key(tx,ty);
  const previous = new Map([[start,null]]), q = [[sx,sy]];
  for (let i=0;i<q.length && !previous.has(target);i++) {
    const [x,y]=q[i];
    for(const [dx,dy] of DIRS) {
      const nx=x+dx,ny=y+dy,k=key(nx,ny);
      if(previous.has(k)||!world.walkable(nx,ny,swim))continue;
      if(dx&&dy&&(!world.walkable(x+dx,y,swim)||!world.walkable(x,y+dy,swim)))continue;
      previous.set(k,key(x,y));q.push([nx,ny]);
    }
  }
  if(!previous.has(target))return [];
  const route=[];
  for(let k=target;k!==start;k=previous.get(k))route.unshift(k.split(',').map(Number));
  return route;
}
