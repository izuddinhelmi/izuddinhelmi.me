// Two project rooms plus the original three shared rooms form a cutaway lodge.
export const PROJECT_ROOMS = [
  { key: 'taubat', name: 'TaubatApp', match: 'taubatapp', color: '#8fa7bf',
    floor: 'p', bounds: [4, 2, 8, 6], doors: [[6, 7], [7, 7]], labelAt: [7, 8.4], seats: [[5, 4], [7, 4]],
    stand: [[4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [4, 5], [6, 5], [8, 5], [5, 6], [7, 6]] },
  { key: 'keluar', name: 'KeluarSekejap', match: 'keluarsekejap', color: '#b6c78e',
    floor: 'k', bounds: [10, 2, 14, 6], doors: [[12, 7], [13, 7]], labelAt: [13, 8.4], seats: [[11, 4], [13, 4]],
    stand: [[10, 3], [11, 3], [12, 3], [13, 3], [14, 3], [10, 5], [12, 5], [14, 5], [11, 6], [13, 6]] },
];
// A static copy can rename the project rooms (the website showcase uses Taubat.app teams).
for (const [key, change] of Object.entries(globalThis.PALLET_STATIC?.rooms ?? {})) Object.assign(PROJECT_ROOMS.find(room => room.key === key) ?? {}, change);
export const SHARED_ROOMS = [
  {key:'design', name:'Design studio', color:'#b6c78e', floor:'n', bounds:[16,2,20,6],
    doors:[[18,7],[19,7]], labelAt:[19,8.4], seats:[[17,4]],
    stand:[[18,3],[19,3],[20,3],[16,4],[18,5],[19,5],[20,5]]},
  {key:'meeting', name:'Meeting room', color:'#d2b994', floor:'s', bounds:[10,10,14,13],
    doors:[[12,9],[13,9],[12,14],[13,14]], labelAt:[13,15.3],
    seats:[[11,11],[13,11],[12,12],[12,10]], stand:[[10,12],[14,12],[11,13],[13,13]]},
  {key:'workshop', name:'Shared workspace', color:'#8fa7bf', floor:'k', bounds:[16,10,20,13],
    doors:[[18,9],[19,9],[18,14],[19,14]], labelAt:[19,15.3], seats:[[17,11],[19,12]],
    stand:[[16,10],[18,10],[19,10],[20,11],[16,12],[18,12],[17,13],[19,13]]},
];
export const OFFICE_ROOMS = [...PROJECT_ROOMS,...SHARED_ROOMS];

// The rooms a working session may use, best first. Its own project room comes first; the
// shared rooms take the overflow. Another project's room is never on the list: project rooms
// (TaubatApp, KeluarSekejap) are reserved for their own sessions.
export function roomChoices(data) {
  const home = projectRoom(data);
  const activity = data.state === 'thinking' ? data.activity : data.state;
  const first = activity === 'planning' ? 'design' : activity === 'delegating' ? 'meeting'
    : activity === 'editing' || activity === 'running' ? 'workshop' : 'meeting';
  const shared = [first, ...SHARED_ROOMS.map(room => room.key).filter(key => key !== first)];
  if (!home) return shared;
  // Planning and briefing happen in the design studio and meeting room; everything else at home.
  return activity === 'planning' || activity === 'delegating' ? [first, home, ...shared.slice(1)] : [home, ...shared];
}

// Only a project's own Pokémon may stand inside its room.
export function mayEnter(data, x, y) {
  const room = PROJECT_ROOMS.find(room => insideRoom(room.key, x, y));
  return !room || room.key === projectRoom(data);
}

export function projectRoom(data) {
  const clean = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  // Match a project name or an actual path component, never an unrelated substring.
  const names = [data.project, ...String(data.projectKey ?? '').split(/[\\/]/)];
  return PROJECT_ROOMS.find(room => names.some(name => clean(name) === room.match))?.key ?? null;
}

export function insideRoom(key, x, y) {
  const room = OFFICE_ROOMS.find(room => room.key === key);
  if (!room) return false;
  const [x0, y0, x1, y1] = room.bounds;
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

export function officeWalls() {
  const walls = [], doors = new Set(OFFICE_ROOMS.flatMap(r => r.doors.map(p => p.join(','))));
  for (let x = 3; x <= 21; x++) {
    walls.push({x, y: 1, axis: 'x', height: 45, window: [4, 5, 10, 11, 16, 17, 20].includes(x), board: [7, 8, 13, 14].includes(x)});
    if (!doors.has(`${x},7`)) walls.push({x, y: 7, axis: 'x', height: 8});
  }
  for (let y = 2; y <= 6; y++) {
    walls.push({x: 3, y, axis: 'y', height: 45, window: y === 3 || y === 4});
    walls.push({x: 9, y, axis: 'y', height: 18});
    walls.push({x: 15, y, axis: 'y', height: 18});
    walls.push({x: 21, y, axis: 'y', height: 8});
  }
  // The two shared rooms extend the right side into a short L-shaped wing.
  for(let x=9;x<=21;x++) {
    if(!doors.has(`${x},9`)) walls.push({x,y:9,axis:'x',height:24,board:[10,11].includes(x)});
    if(!doors.has(`${x},14`)) walls.push({x,y:14,axis:'x',height:8});
  }
  for(let y=10;y<=13;y++) {
    walls.push({x:9,y,axis:'y',height:18});
    walls.push({x:15,y,axis:'y',height:14});
    walls.push({x:21,y,axis:'y',height:8});
  }
  return walls;
}

// Scanline polygons keep every wall/window edge on the same hard pixel grid.
function poly(c, color, points) {
  c.fillStyle = color;
  for (let y = Math.floor(Math.min(...points.map(p => p[1]))); y < Math.ceil(Math.max(...points.map(p => p[1]))); y++) {
    const xs = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      if ((a[1] <= y + .5 && b[1] > y + .5) || (b[1] <= y + .5 && a[1] > y + .5))
        xs.push(a[0] + (y + .5 - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
    }
    xs.sort((a,b) => a-b);
    for (let i = 0; i + 1 < xs.length; i += 2) c.fillRect(Math.round(xs[i]), y, Math.round(xs[i+1])-Math.round(xs[i]), 1);
  }
}

export function drawOfficeWall(c, wall, toScreen) {
  const {x, y, axis, height: h} = wall;
  const a = toScreen(axis === 'x' ? x : x + .5, axis === 'x' ? y + .5 : y);
  const b = toScreen(axis === 'x' ? x + 1 : x + .5, axis === 'x' ? y + .5 : y + 1);
  const panel = (lo, hi, bottom, top, color) => {
    const at = (u,z) => [a[0]+(b[0]-a[0])*u, a[1]+(b[1]-a[1])*u-z];
    poly(c,color,[at(lo,bottom),at(hi,bottom),at(hi,top),at(lo,top)]);
  };
  panel(0,1,0,h,axis === 'x' ? '#e6d7b9' : '#d1c0a1');
  panel(0,1,0,4,'#9a7048');
  panel(0,1,h-3,h, h > 20 ? '#354b54' : '#a8794e');
  panel(0,1,h,h+2, h > 20 ? '#637c80' : '#c7a26a');
  if (h > 20 && (x % 3 === 0 || axis === 'y' && y % 3 === 0)) panel(0,.12,0,h-3,'#a8794e');
  if (wall.window) {
    panel(.09,.92,14,35,'#7b5c40');
    panel(.16,.85,16,33,'#719cb5');
    panel(.19,.48,24,32,'#add3dc');
    panel(.49,.55,16,33,'#dfd6bc');
    panel(.1,.93,13,15,'#f0e4ce');
  }
  if (wall.board) {
    const top = Math.min(33, h - 3), bottom = top - 20;
    panel(0,1,bottom,top,'#a8794e');
    panel(0,1,bottom+2,top-2,'#efebdb');
    panel(.15,.4,top-10,top-6,x < 12 ? '#8fa7bf' : '#b6c78e');
    panel(.58,.82,top-14,top-9,'#d2b994');
  }
}

export function drawRoomLabels(c, toScreen) {
  c.save();
  c.font = '7px "Pixelify Sans", monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
  for (const room of OFFICE_ROOMS) {
    const [x,y] = toScreen(...room.labelAt);
    const width = Math.ceil(c.measureText(room.name).width) + 10;
    c.fillStyle = '#354638'; c.fillRect(Math.round(x-width/2),Math.round(y-5),width,11);
    c.fillStyle = room.color; c.fillRect(Math.round(x-width/2),Math.round(y-5),2,11);
    c.fillStyle = '#f1eddd'; c.fillText(room.name,Math.round(x+1),Math.round(y+1));
  }
  c.restore();
}
