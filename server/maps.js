// Map generation for every zone type. Maps are tile grids (strings of chars) + object lists.
// Tiles: '.' grass ',' flower grass 'd' dirt 'p' plaza stone 's' sand '~' water 'k' dock
//        'T' forest wall 'R' cliff rock 'c' cave floor '#' dungeon wall 'f' dungeon floor 'g' dungeon floor patch
const D = require('../shared/data');
const T = D.TILE;

function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

class Grid {
  constructor(w, h, fill) { this.w = w; this.h = h; this.t = new Array(w * h).fill(fill); }
  get(x, y) { if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 'x'; return this.t[y * this.w + x]; }
  set(x, y, c) { if (x < 0 || y < 0 || x >= this.w || y >= this.h) return; this.t[y * this.w + x] = c; }
  rect(x0, y0, x1, y1, c) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, c); }
  ellipse(cx, cy, rx, ry, c, only) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1 && (!only || only.includes(this.get(x, y)))) this.set(x, y, c);
      }
  }
  str() { return this.t.join(''); }
}

const SOLID = new Set(['~', 'T', 'R', '#', 'x']);
function isSolidTile(c) { return SOLID.has(c); }

let oid = 1;
function obj(kind, tx, ty, extra) {
  return Object.assign({ id: 'o' + (oid++), kind, x: tx * T, y: ty * T }, extra || {});
}
function colRect(o, w, h, oy) { // collision rect in px centered on x, bottom-ish
  o.col = [o.x - w / 2, o.y - h / 2 + (oy || 0), o.x + w / 2, o.y + h / 2 + (oy || 0)];
  return o;
}

// ------------------------------------------------------------------ village
function makeVillage() {
  const W = 84, H = 66;
  const g = new Grid(W, H, '.');
  const r = rng(1234);
  // forest border
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const edge = Math.min(x, y, W - 1 - x, H - 1 - y);
    if (edge < 2 || (edge < 4 && r() < 0.5)) g.set(x, y, 'T');
  }
  // flowers
  for (let i = 0; i < 260; i++) { const x = 4 + Math.floor(r() * (W - 8)), y = 4 + Math.floor(r() * (H - 8)); if (g.get(x, y) === '.') g.set(x, y, ','); }
  // lake (south-west)
  g.ellipse(17, 53, 12.5, 8.5, 's', ['.', ',']);
  g.ellipse(17, 53, 11, 7, '~');
  // cliffs + mine (north-west)
  g.ellipse(11, 9, 11, 9, 'R');
  g.rect(0, 0, 18, 4, 'R');
  // roads
  g.rect(40, 9, 42, 34, 'd');        // north to expedition
  g.rect(42, 31, W - 1, 33, 'd');    // east to homestead
  g.rect(20, 31, 40, 33, 'd');       // west market
  g.rect(40, 33, 42, 46, 'd');       // south
  g.rect(22, 44, 42, 46, 'd');       // to lake
  g.rect(12, 17, 14, 32, 'd');       // to mine
  g.rect(12, 30, 22, 32, 'd');
  // plaza
  g.ellipse(41.5, 32.5, 8, 7, 'p');
  g.ellipse(41.5, 8, 5, 3.5, 'p'); // expedition clearing
  g.rect(W - 4, 30, W - 1, 34, 'd');
  for (let y = 30; y <= 34; y++) for (let x = W - 5; x < W; x++) g.set(x, y, 'd');
  // dock
  g.rect(22, 48, 23, 52, 'k');

  const objs = [];
  objs.push(colRect(obj('hearth', 41.5, 32.5, { name: 'Village Hearth' }), 40, 28));
  objs.push(obj('npc', 41.5, 29.6, { npc: 'candlewick' }));
  objs.push(obj('npc', 25, 28.5, { npc: 'velvet' }));
  objs.push(colRect(obj('stall', 25, 27, { color: '#7b4fa0' }), 80, 30, -6));
  objs.push(obj('npc', 57, 28.5, { npc: 'sugarplum' }));
  objs.push(colRect(obj('stall', 57, 27, { color: '#d76a9a' }), 80, 30, -6));
  objs.push(obj('npc', 22.5, 51.4, { npc: 'grinny' }));
  objs.push(obj('npc', 57, 38, { npc: 'stitch', needsFlag: 'stitch' }));
  objs.push(colRect(obj('stall', 57, 39.5, { color: '#c9b37a', needsFlag: 'stitch' }), 80, 30, -6));
  objs.push(colRect(obj('expedition', 41.5, 6.6, { name: 'Expedition Map' }), 76, 26, 4));
  objs.push(colRect(obj('signpost', 76, 29.4, { name: 'Homestead', text: 'Homestead  →' }), 10, 8, 10));
  objs.push(colRect(obj('mine', 13, 16.2, { name: 'Hollow Mine' }), 0, 0));
  objs.push(obj('exit', 83, 32, { to: 'home', w: 2 * T, h: 6 * T }));
  objs.push(obj('lake', 17, 53, { name: 'Lake' }));
  const houses = [[30, 21, '#b0546b'], [52, 21, '#5a7bb0'], [64, 22, '#7aa05a'], [31, 41, '#b07a4a'], [52, 44, '#9a62b5'], [66, 42, '#c06a4a'], [69, 54, '#5a8fb0'], [47, 56, '#b0546b']];
  for (const [x, y, c] of houses) objs.push(colRect(obj('house', x, y, { roof: c }), 104, 56, 10));
  const lamps = [[37, 28], [46, 28], [37, 37], [46, 37], [40, 14], [43, 14], [60, 31], [70, 34], [28, 31], [24, 46]];
  for (const [x, y] of lamps) objs.push(colRect(obj('lamp', x, y), 8, 8, 8));
  // decorative trees
  const near = (x, y) => objs.some(o => Math.abs(o.x / T - x) < 4 && Math.abs(o.y / T - y) < 4);
  for (let i = 0; i < 90; i++) {
    const x = 4 + r() * (W - 8), y = 4 + r() * (H - 8);
    const tc = g.get(Math.floor(x), Math.floor(y));
    let ok = tc === '.' || tc === ',';
    for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1; dx++) { const c = g.get(Math.floor(x) + dx, Math.floor(y) + dy); if (c !== '.' && c !== ',') ok = false; }
    if (!ok || near(x, y)) continue;
    objs.push(colRect(obj('decotree', x, y, { v: Math.floor(r() * 3) }), 18, 12, 14));
  }
  return { kind: 'village', name: 'Hollowhearth Village', w: W, h: H, tiles: g.str(), objects: objs, spawn: { x: 41.5 * T, y: 36 * T }, from: { home: { x: 80 * T, y: 32 * T }, mine: { x: 13 * T, y: 18.5 * T }, dungeon: { x: 41.5 * T, y: 10.5 * T } } };
}

// ------------------------------------------------------------------ homestead
function makeHome(owner) {
  const W = 58, H = 44;
  const g = new Grid(W, H, '.');
  const r = rng(hashStr('home:' + owner));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const edge = Math.min(x, y, W - 1 - x, H - 1 - y);
    if (edge < 2 || (edge < 3 && r() < 0.5)) g.set(x, y, 'T');
  }
  for (let i = 0; i < 160; i++) { const x = 3 + Math.floor(r() * (W - 6)), y = 3 + Math.floor(r() * (H - 6)); if (g.get(x, y) === '.') g.set(x, y, ','); }
  g.rect(0, 20, 14, 22, 'd');
  g.ellipse(47, 34, 5.5, 4, 's');
  g.ellipse(47, 34, 4.5, 3.2, '~');
  const objs = [];
  objs.push(obj('exit', 0, 21.5, { to: 'village', w: 2 * T, h: 4 * T }));
  objs.push(colRect(obj('signpost', 4, 19.2, { name: 'Village', text: '←  Village' }), 10, 8, 10));
  objs.push(obj('lake', 47, 34, { name: 'Pond' }));
  const taken = [];
  const free = (x, y, d) => taken.every(([a, b]) => Math.hypot(a - x, b - y) > d) && !(x > 17 && x < 40 && y > 12 && y < 30) && !(y > 18.5 && y < 24 && x < 16);
  const place = (kind, n, extra, dist) => {
    let tries = 0;
    while (n > 0 && tries++ < 2000) {
      const x = 4 + r() * (W - 8), y = 4 + r() * (H - 8);
      const c = g.get(Math.floor(x), Math.floor(y));
      if (c !== '.' && c !== ',') continue;
      if (!free(x, y, dist)) continue;
      if (Math.hypot(x - 47, y - 34) < 7.5) continue;
      if (Math.hypot(x - 28, y - 31) < 3.5) continue; // keep the spawn point clear
      taken.push([x, y]);
      const o = obj(kind, x, y, Object.assign({ node: true, nid: kind + taken.length }, extra));
      if (kind === 'tree') colRect(o, 18, 12, 14); else if (kind === 'bush') colRect(o, 22, 14, 4); else colRect(o, 26, 16, 4);
      objs.push(o); n--;
    }
  };
  place('tree', 26, { res: 'wood', hits: 4, yieldPer: 3 }, 2.6);
  place('rock', 16, { res: 'stone', hits: 3, yieldPer: 3 }, 2.2);
  place('bush', 7, { res: 'berries', hits: 1, yieldPer: 4 }, 2.2);
  return { kind: 'home', name: owner + '\'s Homestead', owner, w: W, h: H, tiles: g.str(), objects: objs, spawn: { x: 28 * T, y: 31 * T }, from: { village: { x: 3 * T, y: 21.5 * T } }, buildArea: [3, 3, W - 3, H - 3] };
}

// ------------------------------------------------------------------ mine
function makeMine() {
  const W = 52, H = 44;
  const g = new Grid(W, H, 'R');
  const r = rng(777);
  // random walkers carve caves
  const carve = (x, y, n) => {
    for (let i = 0; i < n; i++) {
      g.ellipse(x, y, 1.6 + r() * 1.3, 1.5 + r() * 1.1, 'c');
      const a = r() * Math.PI * 2;
      x = Math.max(5, Math.min(W - 6, x + Math.cos(a) * 2));
      y = Math.max(5, Math.min(H - 6, y + Math.sin(a) * 2));
    }
  };
  carve(26, 38, 120); carve(26, 26, 120); carve(14, 14, 110); carve(38, 12, 110); carve(26, 8, 60);
  g.rect(24, 36, 28, H - 1, 'c');
  const objs = [];
  objs.push(obj('exit', 26, H - 0.5, { to: 'village', w: 6 * T, h: 2 * T }));
  const spots = [];
  for (let y = 3; y < H - 4; y++) for (let x = 3; x < W - 3; x++) {
    let ok = true;
    for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1; dx++) if (g.get(x + dx, y + dy) !== 'c') ok = false;
    if (ok && y < H - 7) spots.push([x + 0.5, y + 0.5]);
  }
  const taken = [];
  const place = (res, n, filter) => {
    let tries = 0;
    while (n > 0 && tries++ < 3000) {
      const [x, y] = spots[Math.floor(r() * spots.length)];
      if (filter && !filter(x, y)) continue;
      if (taken.some(([a, b]) => Math.hypot(a - x, b - y) < 2.3)) continue;
      taken.push([x, y]);
      objs.push(colRect(obj('ore', x, y, { res, node: true, hits: res === 'stone' ? 3 : 4, yieldPer: res === 'stone' ? 3 : 2, respawn: 90 }), 26, 16, 4));
      n--;
    }
  };
  place('bronze_ore', 12, (x, y) => y > 18);
  place('coal', 10);
  place('stone', 16);
  place('iron_ore', 9, (x, y) => y < 20);
  return { kind: 'mine', name: 'The Hollow Mine', w: W, h: H, tiles: g.str(), objects: objs, spawn: { x: 26 * T, y: (H - 3) * T }, from: { village: { x: 26 * T, y: (H - 3) * T } }, dark: 0.7 };
}

// ------------------------------------------------------------------ dungeon
function makeDungeon(key, seed) {
  const def = D.DUNGEONS[key];
  const W = 110, H = 110;
  const g = new Grid(W, H, '#');
  const r = rng(seed);
  const rooms = [];
  const overlaps = (a) => rooms.some(b => a.x0 - 3 < b.x1 && a.x1 + 3 > b.x0 && a.y0 - 3 < b.y1 && a.y1 + 3 > b.y0);
  const inBounds = (a) => a.x0 > 2 && a.y0 > 2 && a.x1 < W - 3 && a.y1 < H - 3;
  const mk = (cx, cy, w, h) => ({ x0: Math.round(cx - w / 2), y0: Math.round(cy - h / 2), x1: Math.round(cx - w / 2) + w - 1, y1: Math.round(cy - h / 2) + h - 1, cx: Math.round(cx - w / 2) + w / 2, cy: Math.round(cy - h / 2) + h / 2, w, h });
  rooms.push(Object.assign(mk(W / 2, H / 2, 10, 10), { depth: 0, parent: -1 }));
  let attempts = 0;
  const target = def.rooms;
  while (rooms.length < target && attempts++ < 4000) {
    // prefer extending from deeper rooms so the dungeon is a winding path with side branches
    const pi = r() < 0.65 ? rooms.length - 1 : Math.floor(r() * rooms.length);
    const p = rooms[pi];
    const a = Math.floor(r() * 4) * Math.PI / 2;
    const w = 10 + Math.floor(r() * 7), h = 9 + Math.floor(r() * 6);
    const dist = 17 + r() * 6;
    const c = mk(p.cx + Math.cos(a) * dist, p.cy + Math.sin(a) * dist, w, h);
    if (!inBounds(c) || overlaps(c)) continue;
    c.depth = p.depth + 1; c.parent = pi;
    rooms.push(c);
  }
  // boss room off the deepest room
  let deepest = rooms.reduce((a, b, i) => (b.depth > rooms[a].depth ? i : a), 0);
  let boss = null;
  for (let tries = 0; tries < 400 && !boss; tries++) {
    const pi = tries < 200 ? deepest : Math.floor(r() * rooms.length);
    const p = rooms[pi];
    const a = Math.floor(r() * 4) * Math.PI / 2;
    const c = mk(p.cx + Math.cos(a) * 22, p.cy + Math.sin(a) * 22, 19, 17);
    if (!inBounds(c) || overlaps(c)) continue;
    c.depth = p.depth + 1; c.parent = pi; c.boss = true;
    rooms.push(c); boss = c;
  }
  for (const rm of rooms) g.rect(rm.x0, rm.y0, rm.x1, rm.y1, 'f');
  // corridors
  const corridor = (a, b) => {
    let x = Math.floor(a.cx), y = Math.floor(a.cy);
    const tx = Math.floor(b.cx), ty = Math.floor(b.cy);
    const horizFirst = r() < 0.5;
    const stepX = () => { while (x !== tx) { g.rect(x - 1, y - 1, x + 1, y + 1, 'f'); x += Math.sign(tx - x); } };
    const stepY = () => { while (y !== ty) { g.rect(x - 1, y - 1, x + 1, y + 1, 'f'); y += Math.sign(ty - y); } };
    if (horizFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
    g.rect(x - 1, y - 1, x + 1, y + 1, 'f');
  };
  for (let i = 1; i < rooms.length; i++) corridor(rooms[rooms[i].parent], rooms[i]);
  // decorative floor patches
  for (let i = 0; i < rooms.length * 3; i++) {
    const rm = rooms[Math.floor(r() * rooms.length)];
    const cx = rm.x0 + r() * rm.w, cy = rm.y0 + r() * rm.h;
    g.ellipse(cx, cy, 2 + r() * 3, 1.5 + r() * 2.5, 'g', ['f']);
  }
  const objs = [];
  const start = rooms[0];
  objs.push(obj('portal', start.cx, start.cy - 2, { name: 'Way Out', exit: true }));
  // packs
  const packs = [];
  let pid = 0;
  for (let i = 1; i < rooms.length; i++) {
    const rm = rooms[i];
    if (rm.boss) continue;
    const n = rm.w * rm.h > 150 ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const px = rm.x0 + 2.5 + r() * (rm.w - 5), py = rm.y0 + 2.5 + r() * (rm.h - 5);
      const size = (def.lvl <= 1 ? 2 : 3) + Math.floor(r() * 3) + Math.floor(def.lvl / 5);
      const members = [];
      for (let m = 0; m < size; m++) members.push({ type: def.pool[Math.floor(r() * def.pool.length)], x: (px + (r() - 0.5) * 3) * T, y: (py + (r() - 0.5) * 3) * T });
      packs.push({ id: pid++, members, room: i });
    }
  }
  // chests
  const side = rooms.filter(x => !x.boss && x !== start);
  for (let k = 0; k < 2 && side.length; k++) {
    const rm = side.splice(Math.floor(r() * side.length), 1)[0];
    objs.push(colRect(obj('chest', rm.x0 + 1.5 + r() * (rm.w - 3), rm.y0 + 1.5, { name: 'Treasure Chest', opened: [] }), 30, 20, 2));
  }
  if (def.traveler && side.length) {
    const rm = side[Math.floor(r() * side.length)];
    objs.push(obj('npc', rm.cx, rm.cy, { npc: 'stitch', traveler: true }));
  }
  // torches along room walls
  for (const rm of rooms) {
    objs.push(obj('torch', rm.x0 + 0.5, rm.y0 - 0.3));
    objs.push(obj('torch', rm.x1 + 0.5, rm.y0 - 0.3));
  }
  return {
    kind: 'dungeon', key, name: def.name, w: W, h: H, tiles: g.str(), objects: objs,
    spawn: { x: start.cx * T, y: start.cy * T }, packs, boss: boss ? { x: boss.cx * T, y: boss.cy * T, room: boss } : null,
    theme: def.theme, dark: D.THEMES[def.theme].dark,
  };
}

module.exports = { makeVillage, makeHome, makeMine, makeDungeon, isSolidTile, rng, hashStr };
