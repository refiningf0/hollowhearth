// Hollowhearth — game server. Serves the client over HTTP and runs the shared world over WebSockets.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const D = require('../shared/data');
const maps = require('./maps');
const { Zone, uid } = require('./zone');

const PORT = +process.env.PORT || 3000;
const ROOT = path.join(__dirname, '..');
const SAVE_DIR = path.join(ROOT, 'saves');
fs.mkdirSync(SAVE_DIR, { recursive: true });
const T = D.TILE;

// ====================================================================== http
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.gif': 'image/gif', '.json': 'application/json', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') url = '/index.html';
  const base = url.startsWith('/shared/') ? ROOT : path.join(ROOT, 'public');
  const file = path.normalize(path.join(base, url));
  if (!file.startsWith(base)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

// ====================================================================== world state
const WORLD_FILE = path.join(SAVE_DIR, '_world.json');
let world = { day: 1, t: 60 };
try { world = Object.assign(world, JSON.parse(fs.readFileSync(WORLD_FILE, 'utf8'))); } catch (e) { /* first run */ }

const G = { now: 0 };
const zones = new Map();
const players = new Map(); // id -> Player

function seasonInfo() {
  const d = world.day - 1;
  const season = D.SEASONS[Math.floor(d / D.DAYS_PER_SEASON) % 4];
  return { day: world.day, t: world.t, season, dos: (d % D.DAYS_PER_SEASON) + 1, len: D.DAY_SECONDS };
}

// ====================================================================== saves
function saveFile(name) { return path.join(SAVE_DIR, name.toLowerCase().replace(/[^a-z0-9_-]/g, '_') + '.json'); }
function hashPassword(pass) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { salt, hash: crypto.scryptSync(pass, salt, 64).toString('hex') };
}
function checkPassword(pass, auth) {
  const h = crypto.scryptSync(pass, auth.salt, 64);
  const want = Buffer.from(auth.hash, 'hex');
  return h.length === want.length && crypto.timingSafeEqual(h, want);
}
function loadSave(name) { try { return JSON.parse(fs.readFileSync(saveFile(name), 'utf8')); } catch (e) { return null; } }
function writeSave(s) {
  const f = saveFile(s.name);
  try { fs.writeFileSync(f + '.tmp', JSON.stringify(s)); fs.renameSync(f + '.tmp', f); } catch (e) { console.error('save failed', e.message); }
}
function saveWorld() { try { fs.writeFileSync(WORLD_FILE, JSON.stringify(world)); } catch (e) { /* ignore */ } }

const DUNGEON_PREFIX = { crypt: 'Hushed', bramble: 'Brambly', grotto: 'Tidewater', attic: 'Wind-Up', furnace: 'Ovenforged' };
function gearName(cls, slot, tier, charm, dungeon) {
  if (slot === 'charm') return (D.CHARMS[charm] || D.CHARMS.spooky).name;
  const base = D.GEAR_NAMES[cls][slot];
  if (tier === 'found') return (DUNGEON_PREFIX[dungeon] || 'Old') + ' ' + base;
  if (tier === 'stitch') return 'Tailored ' + base;
  return D.TIERS[tier].name + ' ' + base;
}
function makeGear(s, slot, lvl, tier, extra) {
  extra = extra || {};
  const charm = slot === 'charm' ? (extra.charm || Object.keys(D.CHARMS)[Math.floor(Math.random() * 4)]) : undefined;
  const g = { uid: 'g' + (s.nextUid++), slot, lvl, baseLvl: lvl, tier, charm };
  g.name = gearName(s.cls, slot, tier, charm, extra.dungeon);
  return g;
}
function newSave(name, cls) {
  const s = {
    v: 1, name, cls, build: 0, crumbs: 30, inv: {}, gear: [], equip: {}, nextUid: 1, meal: null,
    quest: { idx: 0, step: 0, prog: {} }, flags: {}, cleared: {}, almanac: {},
    home: { buildings: [], depleted: {} }, knownRecipes: ['berry_bite'], kills: 0, created: Date.now(),
  };
  for (const slot of ['weapon', 'helmet', 'body']) { const g = makeGear(s, slot, 1, 'starter'); s.gear.push(g); s.equip[slot] = g.uid; }
  return s;
}

// ====================================================================== inventory helpers
const itemName = (id) => (D.ITEMS[id] ? D.ITEMS[id].name : id);
function invHas(s, items) { for (const k in items) if ((s.inv[k] || 0) < items[k]) return false; return true; }
function invTake(s, items) { for (const k in items) { s.inv[k] -= items[k]; if (s.inv[k] <= 0) delete s.inv[k]; } }
function invGive(s, id, n) { s.inv[id] = (s.inv[id] || 0) + n; }
function missingText(s, items, crumbs) {
  const miss = [];
  for (const k in items) if ((s.inv[k] || 0) < items[k]) miss.push(`${itemName(k)} (${s.inv[k] || 0}/${items[k]})`);
  if (crumbs && s.crumbs < crumbs) miss.push(`Crumbs (${s.crumbs}/${crumbs})`);
  return miss.length ? 'Not enough ' + miss.join(', ') : '';
}
function equipped(s, slot) { const u = s.equip[slot]; return u ? s.gear.find(g => g.uid === u) : null; }

// ====================================================================== player
class Player {
  constructor(ws, save) {
    this.id = uid('u'); this.ws = ws; this.save = save; this.name = save.name;
    this.zone = null; this.x = 0; this.y = 0; this.facing = 0; this.anim = 0; this.aimX = 0; this.aimY = 0;
    this.cds = {}; this.dead = false; this.invulnUntil = 0; this.rollUntil = 0; this.stealthUntil = 0; this.ambush = false;
    this.shield = 0; this.shieldUntil = 0; this.unstopUntil = 0; this.buffs = {}; this.whirl = null; this.rapid = null; this.charge = null;
    this.sleeping = false; this.fish = null; this.lastHit = 0; this.mealCd = 0; this.allowJump = 0; this.dirty = true;
    this.buildIdx = save.build || 0; this.dialog = null;
    calcStats(this);
    this.hp = save.hp && save.hp > 0 ? Math.min(save.hp, this.maxhp) : this.maxhp;
  }
  send(o) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  toast(msg, kind) { this.send({ t: 'toast', msg, kind: kind || 'info' }); }
  dmgBuff() {
    let b = 0;
    for (const k in this.buffs) { const x = this.buffs[k]; if (x.until > G.now && x.type === 'dmg') b += x.amt; }
    return b;
  }
  buffAmt(type) { let b = 0; for (const k in this.buffs) { const x = this.buffs[k]; if (x.until > G.now && x.type === type) b += x.amt; } return b; }
}

function calcStats(p) {
  const s = p.save, cls = D.CLASSES[s.cls];
  let hp = cls.hp, power = 0, def = 0, crit = 0.03, crumbs = 0, speed = 0, hpPct = 0;
  for (const slot of D.SLOTS) {
    const it = equipped(s, slot);
    if (!it) continue;
    const st = D.gearStats(it);
    hp += st.hp || 0; power += st.power || 0; def += st.def || 0; crit += st.crit || 0; crumbs += st.crumbs || 0; speed += st.speed || 0; hpPct += st.hpPct || 0;
  }
  if (!power) power = 8;
  p.maxhp = Math.round(hp * (1 + hpPct));
  const lv = (slot) => (equipped(s, slot) ? equipped(s, slot).lvl : 0);
  const gearLvl = Math.floor((lv('weapon') + lv('helmet') + lv('body')) / 3);
  p.stats = { power, def, crit: +crit.toFixed(3), crumbs, speed, gearLvl, hp: p.maxhp };
  if (p.hp > p.maxhp) p.hp = p.maxhp;
  p.dirty = true;
}

function meState(p) {
  const s = p.save;
  const homeB = s.home.buildings;
  return {
    t: 'me', id: p.id, name: s.name, cls: s.cls, build: p.buildIdx, hp: Math.round(p.hp), maxhp: p.maxhp, stats: p.stats,
    crumbs: s.crumbs, inv: s.inv, gear: s.gear, equip: s.equip, meal: s.meal, quest: s.quest, flags: s.flags, cleared: s.cleared,
    almanac: s.almanac, renown: D.renownOf(s.home), known: s.knownRecipes,
    home: { stove: (homeB.find(b => b.type === 'stove') || {}).lvl || 0, counts: homeB.reduce((a, b) => { a[b.type] = (a[b.type] || 0) + 1; return a; }, {}) },
    buffs: Object.values(p.buffs).filter(b => b.until > G.now).map(b => ({ type: b.type, amt: b.amt, left: Math.round(b.until - G.now), name: b.name })),
  };
}

// ====================================================================== zones
function getZone(id) { return zones.get(id); }
const village = new Zone('village', maps.makeVillage(), G); zones.set('village', village);
const mine = new Zone('mine', maps.makeMine(), G); zones.set('mine', mine);

function homeZoneFor(ownerSave) {
  const id = 'home:' + ownerSave.name.toLowerCase();
  let z = zones.get(id);
  if (z) return z;
  z = new Zone(id, maps.makeHome(ownerSave.name), G);
  z.ownerSave = ownerSave; z.owner = ownerSave.name;
  // node state
  for (const o of z.objects.values()) if (o.node) { o.dead = (ownerSave.home.depleted[o.nid] || 0) >= world.day; o.hitsLeft = o.hits; }
  for (const b of ownerSave.home.buildings) addBuildingObj(z, b);
  for (const o of z.objects.values()) if (o.node && o.dead === false && overlapsBuilding(z, o.col)) o.dead = true;
  zones.set(id, z);
  return z;
}
function dims(type, rot) { const d = D.BUILDINGS[type]; return rot % 2 ? [d.h, d.w] : [d.w, d.h]; }
const GROW = { berries: 1, wheat: 2, pumpkin: 3 };
function buildingObj(b) {
  const [w, h] = dims(b.type, b.rot);
  const o = { id: 'b' + b.id, kind: 'building', type: b.type, bid: b.id, tx: b.tx, ty: b.ty, rot: b.rot, lvl: b.lvl || 1, x: (b.tx + w / 2) * T, y: (b.ty + h / 2) * T, w, h };
  o.col = [b.tx * T + 2, b.ty * T + 2, (b.tx + w) * T - 2, (b.ty + h) * T - 2];
  if (b.type === 'farmbed') o.nocol = true;
  if (b.crop) { const g = GROW[b.crop.type]; o.crop = { type: b.crop.type, prog: Math.min(1, (world.day - b.crop.planted) / g), ready: world.day - b.crop.planted >= g }; }
  return o;
}
function addBuildingObj(z, b) { const o = buildingObj(b); z.objects.set(o.id, o); return o; }
function rectsOverlap(a, b) { return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]; }
function overlapsBuilding(z, rect) {
  for (const o of z.objects.values()) if (o.kind === 'building' && rectsOverlap(o.col, rect)) return true;
  return false;
}

function objFor(o, p) {
  if (o.needsFlag && !p.save.flags[o.needsFlag]) return null;
  if (o.traveler && p.save.flags.stitch) return null;
  const c = Object.assign({}, o);
  if (o.opened) c.opened = o.opened.includes(p.id);
  return c;
}
function sendObj(z, o) { for (const p of z.players) { const c = objFor(o, p); if (c) p.send({ t: 'obj', o: c }); else p.send({ t: 'objdel', id: o.id }); } }
G.broadcastObj = sendObj;
function delObj(z, id) { z.objects.delete(id); for (const p of z.players) p.send({ t: 'objdel', id }); }

function enterZone(p, z, pos) {
  if (p.zone) leaveZone(p);
  p.zone = z; z.onPlayerJoin(p);
  const sp = pos || z.map.spawn;
  p.x = sp.x; p.y = sp.y; p.fish = null; p.sleeping = false; p.rapid = null; p.whirl = null; p.charge = null;
  if (z.kind === 'home' && p.hp < p.maxhp && !p.dead) { p.hp = p.maxhp; p.toast('Home sweet home. Your HP is fully restored.'); }
  if (p.dead) { p.dead = false; p.hp = p.maxhp; }
  p.save.lastZone = z.kind === 'home' ? 'home' : z.kind === 'mine' ? 'mine' : 'village';
  const objs = [];
  for (const o of z.objects.values()) { const c = objFor(o, p); if (c) objs.push(c); }
  p.send({
    t: 'zone', id: z.id, kind: z.kind, name: z.map.name, w: z.w, h: z.h, tiles: z.tiles, objs, owner: z.owner || null,
    theme: z.map.theme || null, dark: z.map.dark || 0, key: z.map.key || null, you: { x: p.x, y: p.y },
    buildArea: z.map.buildArea || null, packs: [z.packsCleared, z.packsTotal], dungeonDef: z.def ? { rec: z.def.rec, lvl: z.def.lvl } : null,
  });
  p.dirty = true;
  questEvent(p, 'visit', { zone: z.kind });
  checkPassive(p);
}
function leaveZone(p) {
  const z = p.zone;
  if (!z) return;
  z.players.delete(p);
  for (const m of z.minions.values()) if (m.owner === p) z.minions.delete(m.id);
  for (const e of z.enemies.values()) if (e.target === p) e.target = null;
  p.zone = null;
}

// ====================================================================== quests
function curQuest(s) { return D.QUESTS[s.quest.idx] || null; }
function curStep(s) { const q = curQuest(s); return q ? q.steps[s.quest.step] : null; }
function questEvent(p, type, data) {
  const s = p.save, st = curStep(s);
  if (!st || st.type !== type) return;
  const prog = s.quest.prog;
  let ok = false;
  switch (type) {
    case 'talk': ok = data.npc === st.npc; break;
    case 'open_map': ok = true; break;
    case 'clear': ok = data.dungeon === st.dungeon; break;
    case 'deliver': ok = data.npc === st.npc && data.item === st.item; break;
    case 'build': case 'upgrade': ok = data.building === st.building; break;
    case 'cook': ok = data.recipe === st.recipe; break;
    case 'buy': ok = st.item === 'seed' ? /_seed$/.test(data.item) : data.item === st.item; break;
    case 'plant': ok = true; break;
    case 'forge': ok = data.slot === 'weapon'; break;
    case 'equip': ok = data.slot === st.slot; break;
    case 'catch': prog.n = (prog.n || 0) + 1; ok = prog.n >= st.n; p.dirty = true; break;
    case 'smelt': if (data.item === st.item) { prog.n = (prog.n || 0) + data.n; ok = prog.n >= st.n; p.dirty = true; } break;
    case 'visit': ok = data.zone === st.zone; break;
  }
  if (ok) advance(p);
}
function stepDoneAlready(p, st) {
  const s = p.save;
  switch (st.type) {
    case 'have': return invHas(s, st.items);
    case 'build': return s.home.buildings.some(b => b.type === st.building);
    case 'upgrade': return s.home.buildings.some(b => b.type === st.building && b.lvl >= 2);
    case 'equip': { const w = equipped(s, 'weapon'); return !!w && w.tier !== 'starter'; }
    case 'visit': return p.zone && p.zone.kind === st.zone;
    case 'clear': return !!s.cleared[st.dungeon];
    case 'buy': return Object.keys(s.inv).some(k => /_seed$/.test(k)) || s.home.buildings.some(b => b.crop);
    case 'plant': return s.home.buildings.some(b => b.crop);
  }
  return false;
}
function advance(p, noCheck) {
  const s = p.save;
  const q = curQuest(s);
  if (!q) return;
  s.quest.step++; s.quest.prog = {};
  if (s.quest.step >= q.steps.length) {
    const reward = 40 + 30 * s.quest.idx;
    s.crumbs += reward;
    p.send({ t: 'quest_done', name: q.name, reward });
    if (q.id === 'q_cook') { s.flags.trade = true; p.toast('Candlewick now offers Trade. Talk to him to see his charms.'); }
    s.quest.idx++; s.quest.step = 0;
  } else {
    p.send({ t: 'quest_step', text: q.steps[s.quest.step].text });
  }
  p.dirty = true;
  writeSave(s);
  if (!noCheck) checkPassive(p);
}
function checkPassive(p) {
  for (let i = 0; i < 12; i++) {
    const st = curStep(p.save);
    if (!st || !stepDoneAlready(p, st)) break;
    advance(p, true);
  }
}
function checkRenown(p) {
  const s = p.save, r = D.renownOf(s.home);
  for (const id in D.RECIPES) {
    const rc = D.RECIPES[id];
    if (rc.story || s.knownRecipes.includes(id)) continue;
    if (r >= rc.renown) {
      s.knownRecipes.push(id);
      p.send({ t: 'toast', kind: 'recipe', msg: `New recipe unlocked: ${itemName(id)}! Go to your Kitchen Stove to see your new dish.` });
    }
  }
}

// ====================================================================== combat hooks (called by zones)
G.damagePlayer = function (p, raw, src) {
  const now = G.now;
  if (p.dead || p.rollUntil > now || p.invulnUntil > now || !p.zone || p.zone.kind !== 'dungeon') return;
  const rec = p.zone.def.rec;
  const under = Math.max(0, rec - p.stats.gearLvl);
  let dmg = raw * (1 + 0.15 * under) * (30 / (30 + p.stats.def));
  dmg *= 1 - Math.min(0.6, p.buffAmt('def'));
  if (p.unstopUntil > now) dmg *= 0.5;
  dmg = Math.max(1, Math.round(dmg));
  if (p.shield > 0 && p.shieldUntil > now) {
    const a = Math.min(p.shield, dmg); p.shield -= a; dmg -= a;
    if (dmg <= 0) { p.zone.ev({ k: 'dmg', x: Math.round(p.x), y: Math.round(p.y - 50), v: 0, pl: 1, txt: 'blocked' }); return; }
  }
  p.hp -= dmg; p.invulnUntil = now + 0.33; p.lastHurt = now;
  p.zone.ev({ k: 'dmg', x: Math.round(p.x), y: Math.round(p.y - 50), v: dmg, pl: 1, id: p.id });
  if (p.fish) p.fish = null;
  if (p.hp <= 0) killPlayer(p);
  p.dirty = true;
};
function killPlayer(p) {
  p.hp = 0; p.dead = true; p.rapid = null; p.whirl = null; p.charge = null; p.stealthUntil = 0;
  const hasMeals = Object.keys(p.save.inv).some(k => D.ITEMS[k] && D.ITEMS[k].meal);
  const tip = !hasMeals ? D.TIPS[0] : D.TIPS[1 + Math.floor(Math.random() * (D.TIPS.length - 1))];
  p.send({ t: 'death', tip, dungeon: p.zone && p.zone.kind === 'dungeon' });
  p.dirty = true;
}
G.onKill = function (z, e, killer) {
  if (e.boss) return;
  for (const p of z.players) {
    if (p.zone !== z) continue;
    const s = p.save;
    const a = s.almanac[e.type] || (s.almanac[e.type] = { kills: 0 });
    a.kills++; s.kills = (s.kills || 0) + 1;
    let bonus = 0;
    if (a.kills === 1) bonus = 15; else if (a.kills === 10) bonus = 30; else if (a.kills === 50) bonus = 80;
    if (bonus) { s.crumbs += bonus; p.send({ t: 'almanac', name: D.ENEMIES[e.type].name, bonus, kills: a.kills }); }
    p.dirty = true;
  }
};
G.onBossKilled = function (z, e) {
  const def = z.def;
  z.ev({ k: 'banner', msg: def.boss.name + ' was defeated!' });
  for (const p of z.players) {
    if (p.zone !== z) continue;
    const s = p.save;
    if (!s.cleared[z.map.key]) {
      invGive(s, 'crust_piece', 1);
      p.send({ t: 'toast', kind: 'big', msg: 'You recovered a Crust Piece! Bring it to Candlewick.' });
    }
    s.cleared[z.map.key] = (s.cleared[z.map.key] || 0) + 1;
    const slots = ['weapon', 'weapon', 'helmet', 'body', 'body', 'charm'];
    const slot = slots[Math.floor(Math.random() * slots.length)];
    const g = makeGear(s, slot, def.lvl + (Math.random() < 0.5 ? 1 : 0), 'found', { dungeon: z.map.key });
    const pk = z.dropPickup(e.x, e.y, { kind: 'gear', gear: g, owner: p.id });
    pk.vx *= 0.5; pk.vy *= 0.5;
    questEvent(p, 'clear', { dungeon: z.map.key });
    p.dirty = true;
    writeSave(s);
  }
};
G.collect = function (p, pk, z) {
  const s = p.save;
  if (pk.kind === 'crumbs') {
    const n = Math.round(pk.amount * (1 + p.stats.crumbs));
    s.crumbs += n; p.send({ t: 'pick', txt: '+' + n, icon: 'crumbs' });
  } else if (pk.kind === 'heart') {
    p.hp = Math.min(p.maxhp, p.hp + pk.amount + p.maxhp * 0.08);
    p.send({ t: 'pick', txt: '+HP', icon: 'heart' });
  } else if (pk.kind === 'item') {
    invGive(s, pk.item, pk.amount);
    p.send({ t: 'pick', txt: `+${pk.amount} ${itemName(pk.item)}`, icon: pk.item });
    checkPassive(p);
  } else if (pk.kind === 'gear') {
    s.gear.push(pk.gear);
    if (!s.flags.gotGear) { s.flags.gotGear = true; p.send({ t: 'toast', kind: 'big', msg: 'You have new gear! Press I to open your inventory and click it to equip.' }); }
    else p.toast(`New gear: ${pk.gear.name} (Lv ${pk.gear.lvl}). Press I to equip.`, 'gear');
  }
  p.dirty = true;
};

// ====================================================================== abilities
function pproj(p, a, o) {
  p.zone.proj.push(Object.assign({ id: uid('p'), x: p.x + Math.cos(a) * 14, y: p.y - 18 + Math.sin(a) * 14, vx: Math.cos(a) * o.speed, vy: Math.sin(a) * o.speed, r: 7, team: 'p', owner: p }, o));
}
function aoe(p, x, y, r, dmg, opts) {
  for (const e of [...p.zone.enemies.values()]) if (Math.hypot(e.x - x, e.y - y) < r + e.r) p.zone.damageEnemy(e, dmg, p, Object.assign({ kx: x, ky: y }, opts || {}));
}
function useAbility(p, key, ax, ay) {
  if (p.dead || p.sleeping || !p.zone) return;
  const now = G.now, z = p.zone;
  const abId = D.CLASSES[p.save.cls].builds[p.buildIdx].abilities[key];
  const ab = D.ABILITIES[abId];
  if (!ab) return;
  if ((p.cds[key] || 0) > now + 0.12) return;
  p.cds[key] = now + ab.cd;
  const a = Math.atan2(ay - (p.y - 18), ax - p.x);
  p.facing = a;
  const P = p.stats.power;
  if (key !== 'rmb' && abId !== 'stealth' && abId !== 'ward' && abId !== 'unstoppable') p.stealthUntil = 0;
  if (p.fish) p.fish = null;
  const fx = (o) => z.ev(Object.assign({ k: 'fx', pid: p.id }, o));
  switch (abId) {
    case 'knives': for (let i = -1; i <= 1; i++) pproj(p, a + i * 0.15, { speed: 560, life: 0.5, dmg: P * ab.mult, kind: 'knife' }); break;
    case 'rapidfire': p.rapid = { n: 12, next: now }; break;
    case 'roll': p.rollUntil = now + 0.34; p.allowJump = now + 0.6; break;
    case 'owl': { const id = uid('m'); z.minions.set(id, { id, kind: 'owl', owner: p, x: p.x, y: p.y - 40, until: now + ab.dur, cd: 0.2 }); fx({ f: 'poof', x: p.x, y: p.y - 40 }); break; }
    case 'stealth': p.stealthUntil = now + ab.dur; p.ambush = true; for (const e of z.enemies.values()) if (e.target === p) { e.target = null; if (e.state === 'chase') e.state = 'idle'; } fx({ f: 'poof', x: p.x, y: p.y - 20 }); break;
    case 'volley': for (let i = 0; i < 5; i++) pproj(p, a + (i - 2) * 0.2, { speed: 640, life: 0.7, dmg: P * ab.mult, kind: 'arrow', pierce: true }); break;
    case 'emberbolt': pproj(p, a, { speed: 470, life: 0.9, dmg: P * ab.mult, kind: 'ember', splash: 56, r: 9 }); break;
    case 'spark': pproj(p, a, { speed: 720, life: 0.6, dmg: P * ab.mult, kind: 'spark', chain: true }); break;
    case 'blink': p.allowJump = now + 0.6; fx({ f: 'blink', x: p.x, y: p.y }); break;
    case 'frostnova': aoe(p, p.x, p.y, 115, P * ab.mult, { slow: 3 }); fx({ f: 'nova', x: p.x, y: p.y, r: 115 }); break;
    case 'meteor': {
      let d = Math.hypot(ax - p.x, ay - p.y), mx = ax, my = ay;
      if (d > 420) { mx = p.x + (ax - p.x) / d * 420; my = p.y + (ay - p.y) / d * 420; }
      z.addTele({ kind: 'circle', x: mx, y: my, r: 85, dur: 0.8, team: 'p' });
      z.after(0.8, () => { if (p.zone === z) aoe(p, mx, my, 85, P * ab.mult, { kb: 20 }); z.ev({ k: 'fx', f: 'meteor', x: mx, y: my, r: 85 }); });
      break;
    }
    case 'ward': p.shield = Math.round(p.maxhp * 0.4); p.shieldUntil = now + ab.dur; break;
    case 'chain': {
      let d = Math.hypot(ax - p.x, ay - p.y), cx = ax, cy = ay;
      if (d > 450) { cx = p.x + (ax - p.x) / d * 450; cy = p.y + (ay - p.y) / d * 450; }
      const list = [...z.enemies.values()].filter(e => Math.hypot(e.x - cx, e.y - cy) < 190).sort((a1, b1) => Math.hypot(a1.x - cx, a1.y - cy) - Math.hypot(b1.x - cx, b1.y - cy)).slice(0, 5);
      let lx = p.x, ly = p.y - 20;
      for (const e of list) { fx({ f: 'zap', x: lx, y: ly, x2: e.x, y2: e.y - e.r }); lx = e.x; ly = e.y - e.r; z.damageEnemy(e, P * ab.mult, p); }
      if (!list.length) fx({ f: 'zap', x: lx, y: ly, x2: cx, y2: cy });
      break;
    }
    case 'cleave': {
      for (const e of [...z.enemies.values()]) {
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        const ea = Math.atan2(e.y - p.y, e.x - p.x);
        let df = ea - a; while (df > Math.PI) df -= 2 * Math.PI; while (df < -Math.PI) df += 2 * Math.PI;
        if (d < 80 + e.r && (Math.abs(df) < 1.05 || d < e.r + 14)) z.damageEnemy(e, P * ab.mult, p, { kb: 16, kx: p.x, ky: p.y });
      }
      fx({ f: 'slash', x: p.x, y: p.y - 10, a, r: 80, team: 'p' });
      break;
    }
    case 'charge': p.charge = { until: now + 0.32, hit: new Set() }; p.allowJump = now + 0.6; break;
    case 'unstoppable': p.unstopUntil = now + ab.dur; fx({ f: 'cry', x: p.x, y: p.y }); break;
    case 'whirlwind': p.whirl = { until: now + 1.5, next: now }; break;
    case 'battlecry':
      for (const o of z.players) if (!o.dead && Math.hypot(o.x - p.x, o.y - p.y) < 260) { o.hp = Math.min(o.maxhp, o.hp + o.maxhp * 0.2); o.buffs.cry = { type: 'dmg', amt: 0.25, until: now + ab.dur, name: 'Battle Cry' }; o.dirty = true; }
      fx({ f: 'cry', x: p.x, y: p.y });
      break;
    case 'slam': aoe(p, p.x, p.y, 125, P * ab.mult, { stun: 1.5, kb: 24 }); fx({ f: 'slam', x: p.x, y: p.y, r: 125 }); break;
  }
}

function playerTick(p, dt) {
  const now = G.now, z = p.zone;
  if (!z) return;
  if (p.dead) return;
  // regen
  const regen = p.buffAmt('regen') + (z.kind !== 'dungeon' ? 6 : (now - (p.lastHurt || 0) > 6 ? 3 : 0));
  if (regen && p.hp < p.maxhp) { p.hp = Math.min(p.maxhp, p.hp + regen * dt); if (Math.random() < 0.1) p.dirty = true; }
  if (p.rapid && p.rapid.n > 0) {
    while (p.rapid && p.rapid.next <= now && p.rapid.n > 0) {
      const a = Math.atan2(p.aimY - (p.y - 18), p.aimX - p.x) + (Math.random() - 0.5) * 0.12;
      pproj(p, a, { speed: 620, life: 0.55, dmg: p.stats.power * D.ABILITIES.rapidfire.mult, kind: 'knife' });
      p.rapid.n--; p.rapid.next += 0.1;
    }
    if (p.rapid.n <= 0) p.rapid = null;
  }
  if (p.whirl) {
    if (now > p.whirl.until) p.whirl = null;
    else if (now >= p.whirl.next) { p.whirl.next = now + 0.25; aoe(p, p.x, p.y, 85, p.stats.power * D.ABILITIES.whirlwind.mult, { kb: 8 }); }
  }
  if (p.charge) {
    if (now > p.charge.until) p.charge = null;
    else for (const e of [...z.enemies.values()]) if (!p.charge.hit.has(e.id) && Math.hypot(e.x - p.x, e.y - p.y) < e.r + 30) { p.charge.hit.add(e.id); z.damageEnemy(e, p.stats.power * D.ABILITIES.charge.mult, p, { kb: 40, kx: p.x, ky: p.y, stun: 0.4 }); }
  }
  if (p.shield > 0 && p.shieldUntil < now) p.shield = 0;
  // fishing
  if (p.fish) {
    const f = p.fish;
    if (f.state === 'wait' && now >= f.biteAt) { f.state = 'bite'; f.until = now + 0.95; p.send({ t: 'fish', state: 'bite' }); }
    else if (f.state === 'bite' && now > f.until) { p.fish = null; p.send({ t: 'fish', state: 'miss', msg: 'It got away! Press R to cast again.' }); }
  }
}

// ====================================================================== interactions
function near(p, o, d) { return Math.hypot(p.x - o.x, p.y - o.y) < (d || 110); }
function findNpcObj(z, npc) { for (const o of z.objects.values()) if (o.kind === 'npc' && o.npc === npc) return o; return null; }

const STORY = {
  q_welcome: "Oh! A new face by the hearth. I'm Candlewick, keeper of Hollowhearth's flame.\n\nLong ago our Hearth Pie kept this whole village warm... until it shattered into five Crust Pieces, scattered into the dungeons around us.\n\nThe nearest one is in The Hushed Crypt. It's an easy one, I promise! Use the Expedition Map at the north end of the village to travel there.",
  q_crypt: "You found it! The first Crust Piece... it still smells of cinnamon.\n\nThe other four are in much tougher places. You'll need a proper home to prepare: food, gear and a warm bed.\n\nFollow the east road to your Homestead. Gather wood and stone and build yourself a cottage. Once you have a stove I'll teach you to cook.",
  q_bramble: "Two pieces! The crust is starting to remember its shape.\n\nGrinny down by the lake has been asking about you. Fish make fine meals, and a good meal makes for a good adventurer.",
  q_grotto: "Three! You're getting good at this.\n\nThe Toybox Attic is next. Those wind-up toys are nastier than they look. Temper your gear at the Anvil before you go.",
  q_attic: "Four pieces... just one left. It's in The Pie-Oven Furnace, guarded by The Oven Warden.\n\nIt's scorching in there. Forge Ember gear if you can, and bring plenty of meals.",
  q_furnace: "All five! I can hardly believe it.\n\nNow the most important part: the Hearth Pie must be baked again. Use your Level 2 stove with the five Crust Pieces, a Pumpkin, 2 Wheat and 3 Berries.",
};

function talk(p, o) {
  const s = p.save, st = curStep(s), q = curQuest(s);
  const npc = o.npc, N = D.NPCS[npc];
  const d = { t: 'dialog', npc, name: N.name, title: N.title, objId: o.id, text: '', options: [] };
  const bye = { id: 'bye', label: 'Goodbye' };
  if (o.traveler) {
    d.name = 'A Weary Traveler'; d.title = 'Lost in the crypt';
    d.text = "Oh! Another living soul! I've been lost down here for ages. My name is Stitch... I used to be a tailor.\n\nCould I come home with you to Hollowhearth Village?";
    d.options = [{ id: 'trav_yes', label: 'Yes, come with me!' }, { id: 'trav_no', label: 'Not right now.' }];
  } else if (npc === 'candlewick') {
    if (st && st.type === 'talk' && st.npc === 'candlewick') {
      d.text = STORY[q.id] || 'Welcome back, friend.';
      if (q.id === 'q_crypt' || q.id === 'q_bramble' || q.id === 'q_grotto' || q.id === 'q_attic' || q.id === 'q_furnace') { /* crust pieces are kept for the pie */ }
      questEvent(p, 'talk', { npc });
      d.options = [{ id: 'bye', label: 'Got it!' }];
    } else if (st && st.type === 'deliver' && st.npc === 'candlewick') {
      if ((s.inv[st.item] || 0) > 0) {
        d.text = st.item === 'hearth_pie' ? 'Is that... is that the Hearth Pie?!' : 'Ooh, is that a Berry Bite I smell?';
        d.options = [{ id: 'deliver', label: `Give ${itemName(st.item)}` }, bye];
      } else {
        d.text = st.item === 'berry_bite' ? "Your stove is ready? Wonderful. Pick some berries from the bushes on your homestead and cook me a Berry Bite. It only needs 3 Berries!" : 'Bake The Hearth Pie at your stove and bring it here!';
        d.options = [bye];
      }
    } else {
      d.text = s.quest.idx >= D.QUESTS.length ? 'The Hearth Pie keeps us all warm again, thanks to you. Hollowhearth is yours as much as mine.' : (st ? 'The hearth is burning bright today. ' + 'Your next task: ' + st.text : 'Welcome back, friend.');
      if (s.flags.trade) d.options.push({ id: 'shop', label: 'Trade' });
      d.options.push(bye);
    }
  } else if (npc === 'grinny') {
    if (st && st.type === 'talk' && st.npc === 'grinny') {
      d.text = "Heh heh heh... you want to fish? Take this rod, it's on the house.\n\nFace the water and press R to cast. Watch your bobber: when you see the \"!\" press E quickly to reel it in.";
      if (!s.inv.fishing_rod) invGive(s, 'fishing_rod', 1);
      questEvent(p, 'talk', { npc });
      d.options = [{ id: 'bye', label: 'Thanks, Grinny!' }];
    } else {
      d.text = 'Heh heh. The fish are biting today. I buy whatever you catch.' + (s.inv.fishing_rod ? '' : ' Need a rod? I sell those too.');
      d.options = [{ id: 'shop', label: 'Trade' }, bye];
    }
  } else if (npc === 'velvet') {
    d.text = 'Bonsoir, darling. Seeds for your farm beds? Plant them and they grow day by day. Sleep in your cottage to hurry the night along.';
    d.options = [{ id: 'shop', label: 'Buy seeds' }, bye];
  } else if (npc === 'sugarplum') {
    d.text = 'Sweet things for sweet folks! I sell baking basics and I buy any meals you cook.';
    d.options = [{ id: 'shop', label: 'Trade' }, bye];
  } else if (npc === 'stitch') {
    d.text = 'Thank you for bringing me home! My needle is back in business. I sew armor and charms for adventurers.';
    d.options = [{ id: 'shop', label: 'Browse' }, bye];
  }
  p.dialog = { npc, objId: o.id };
  p.send(d);
  p.dirty = true;
}
function dialogOption(p, id) {
  const dl = p.dialog;
  if (!dl) return;
  const s = p.save;
  const o = p.zone.objects.get(dl.objId);
  if (!o) return;
  if (id === 'shop') return openShop(p, dl.npc);
  if (id === 'deliver') {
    const st = curStep(s);
    if (st && st.type === 'deliver' && (s.inv[st.item] || 0) > 0) {
      invTake(s, { [st.item]: 1 });
      const text = st.item === 'hearth_pie'
        ? "It's... perfect. Golden, warm, and whole again.\n\nYou did it! The Hearth Pie will keep Hollowhearth warm for generations. Thank you, friend. This village is your home now."
        : "Mmm! Just like old times.\n\nYou're a natural. Other villagers will love your cooking too. Madame Velvet sells seeds at the market, so you can grow your own ingredients.\n\nI also have a few trinkets for trade now, if you're interested.";
      questEvent(p, 'deliver', { npc: dl.npc, item: st.item });
      p.send({ t: 'dialog', npc: dl.npc, name: D.NPCS[dl.npc].name, title: D.NPCS[dl.npc].title, objId: o.id, text, options: [{ id: 'bye', label: 'Goodbye' }], ending: st.item === 'hearth_pie' });
    }
    return;
  }
  if (id === 'trav_yes') {
    s.flags.stitch = true;
    p.send({ t: 'objdel', id: o.id });
    p.send({ t: 'dialog', npc: 'stitch', name: 'Stitch', title: 'Tailor', text: "Really? Oh, thank you! I'll head to Hollowhearth right away. Find me at the market. I'll have my tailor stall set up!", options: [{ id: 'bye', label: 'See you there!' }] });
    p.toast('Stitch moved to Hollowhearth Village. He runs a tailor shop at the east market.');
    p.dirty = true;
    return;
  }
  p.dialog = null;
}

function shopEntry(s, key, price) {
  if (key.startsWith('charm:')) {
    const c = D.CHARMS[key.split(':')[1]];
    return { key, price, name: c.name, icon: 'charm', desc: `Charm slot. +${Math.round(c.base * 100)}% ${c.desc}. Equip it from your inventory (I).` };
  }
  if (key.startsWith('gear:')) {
    const [, slot, lvl] = key.split(':');
    return { key, price, name: `Tailored ${D.GEAR_NAMES[s.cls][slot]} (Lv ${lvl})`, icon: slot, desc: `${slot === 'helmet' ? 'Helmet' : 'Body armor'}, level ${lvl}. ` + Object.entries(D.gearStats({ slot, lvl: +lvl })).map(([k, v]) => `+${v} ${k.toUpperCase()}`).join(', ') };
  }
  const it = D.ITEMS[key];
  return { key, price, name: it.name, icon: it.icon, desc: it.desc };
}
function openShop(p, npc) {
  const s = p.save, sh = D.SHOPS[npc];
  if (!sh) return;
  p.send({
    t: 'shop', npc, name: D.NPCS[npc].name,
    sells: sh.sells.map(([k, pr]) => shopEntry(s, k, pr)),
    buys: sh.buys.map(id => ({ item: id, name: itemName(id), icon: D.ITEMS[id].icon, price: D.ITEMS[id].sell, have: s.inv[id] || 0 })),
  });
}

// ====================================================================== message handlers
const handlers = {
  mv(p, m) {
    if (!p.zone || p.dead || p.sleeping) return;
    const x = +m.x, y = +m.y;
    if (!isFinite(x) || !isFinite(y)) return;
    p.aimX = +m.ax || p.aimX; p.aimY = +m.ay || p.aimY;
    p.facing = +m.f || 0; p.anim = m.a | 0;
    const d = Math.hypot(x - p.x, y - p.y);
    const maxStep = 260 * (1 + p.stats.speed) * 0.25 + 30;
    if ((d > maxStep && p.allowJump < G.now) || d > 700 || (p.zone.blocked(x, y, 3) && !p.zone.blocked(p.x, p.y, 3))) { p.send({ t: 'pos', x: p.x, y: p.y }); return; }
    if (p.fish && d > 4) { p.fish = null; p.send({ t: 'fish', state: 'cancel' }); }
    p.x = x; p.y = y;
  },
  ab(p, m) { useAbility(p, m.k, +m.ax, +m.ay); },
  swapbuild(p) { p.buildIdx = p.buildIdx ? 0 : 1; p.save.build = p.buildIdx; p.toast(`Build: ${D.CLASSES[p.save.cls].builds[p.buildIdx].name}`); p.dirty = true; },
  respawn(p, m) {
    if (!p.dead) return;
    p.dead = false; p.hp = p.maxhp; p.invulnUntil = G.now + 2;
    if (m.where === 'village' || !p.zone || p.zone.kind !== 'dungeon') enterZone(p, village, village.map.spawn);
    else enterZone(p, p.zone, p.zone.map.spawn);
    p.dirty = true;
  },
  act(p, m) {
    const z = p.zone; if (!z || p.dead) return;
    const o = z.objects.get(m.id); if (!o || !near(p, o, 130)) return;
    switch (o.kind) {
      case 'npc': talk(p, o); break;
      case 'expedition': {
        questEvent(p, 'open_map', {});
        const list = D.DUNGEON_ORDER.map((key, i) => {
          const def = D.DUNGEONS[key];
          const qi = D.QUESTS.findIndex(q => q.steps.some(st => st.type === 'clear' && st.dungeon === key));
          const unlocked = p.save.quest.idx >= qi;
          const runs = [...zones.values()].filter(zz => zz.kind === 'dungeon' && zz.map.key === key && zz.players.size > 0 && !zz.bossDead)
            .map(zz => ({ id: zz.id, names: [...zz.players].map(pp => pp.name), packs: `${zz.packsCleared}/${zz.packsTotal}`, party: [...zz.players].some(pp => pp.party && pp.party === p.party) }));
          return { key, name: def.name, lvl: def.lvl, rec: def.rec, blurb: def.blurb, unlocked, cleared: p.save.cleared[key] || 0, runs, lockText: unlocked ? '' : `Unlocks during "${D.QUESTS[qi].name}"` };
        });
        p.send({ t: 'expedition', list, gearLvl: p.stats.gearLvl });
        break;
      }
      case 'mine': enterZone(p, mine, mine.map.from.village); break;
      case 'portal': enterZone(p, village, village.map.from.dungeon); break;
      case 'signpost': {
        if (z.kind !== 'village') break;
        const homes = [...players.values()].filter(o2 => o2 !== p).map(o2 => o2.name);
        p.send({ t: 'homes', list: homes });
        break;
      }
      case 'chest': {
        if (o.opened.includes(p.id)) { p.toast('You already looted this chest.'); break; }
        o.opened.push(p.id);
        const def = z.def;
        const slot = ['weapon', 'helmet', 'body', 'charm'][Math.floor(Math.random() * 4)];
        const g = makeGear(p.save, slot, Math.max(1, def.lvl - (Math.random() < 0.5 ? 1 : 0)), 'found', { dungeon: z.map.key });
        const pk = z.dropPickup(o.x, o.y + 10, { kind: 'gear', gear: g, owner: p.id }); pk.vx *= 0.5; pk.vy *= 0.5;
        for (let i = 0; i < 4; i++) { const c = z.dropPickup(o.x, o.y + 10, { kind: 'crumbs', amount: 4 + def.lvl * 2, owner: p.id }); c.vx *= 0.7; }
        p.send({ t: 'obj', o: objFor(o, p) });
        break;
      }
      case 'building': {
        if (z.kind !== 'home') break;
        const own = z.owner === p.name;
        const b = z.ownerSave.home.buildings.find(bb => bb.id === o.bid);
        if (!b) break;
        if (o.type === 'cottage') p.send({ t: 'ui', ui: 'sleep' });
        else if (!own) p.toast(`This belongs to ${z.owner}.`);
        else if (o.type === 'stove') p.send({ t: 'ui', ui: 'stove', id: o.id });
        else if (o.type === 'anvil') p.send({ t: 'ui', ui: 'anvil', id: o.id });
        else if (o.type === 'smelter') p.send({ t: 'ui', ui: 'smelter', id: o.id });
        else if (o.type === 'farmbed') {
          if (b.crop) {
            const g = GROW[b.crop.type];
            if (world.day - b.crop.planted >= g) {
              const n = b.crop.type === 'pumpkin' ? 2 : 4;
              invGive(p.save, b.crop.type, n); b.crop = null;
              p.send({ t: 'pick', txt: `+${n} ${itemName(o.crop.type)}`, icon: o.crop.type });
              const no = addBuildingObj(z, b); sendObj(z, no); p.dirty = true; checkPassive(p);
            } else p.toast(`Your ${itemName(b.crop.type)} will be ready in ${g - (world.day - b.crop.planted)} day(s). Sleep in your cottage to pass the night.`);
          } else p.send({ t: 'ui', ui: 'plant', id: o.id });
        }
        break;
      }
    }
  },
  dopt(p, m) { dialogOption(p, m.id); },
  hit(p, m) {
    const z = p.zone; if (!z) return;
    const o = z.objects.get(m.id);
    if (!o || !o.node || o.dead || !near(p, o, 95)) return;
    const dur = { tree: 0.9, rock: 1.0, ore: 1.1, bush: 0.5 }[o.kind] || 1;
    if (G.now - p.lastHit < dur * 0.8) return;
    p.lastHit = G.now;
    o.hitsLeft = (o.hitsLeft == null ? o.hits : o.hitsLeft) - 1;
    const n = o.yieldPer + (Math.random() < 0.3 ? 1 : 0);
    invGive(p.save, o.res, n);
    p.send({ t: 'pick', txt: `+${n} ${itemName(o.res)}`, icon: o.res });
    z.ev({ k: 'fx', f: o.kind === 'tree' ? 'chop' : o.kind === 'bush' ? 'leaf' : 'chip', x: o.x, y: o.y });
    if (o.hitsLeft <= 0) {
      o.dead = true;
      if (z.kind === 'home') z.ownerSave.home.depleted[o.nid] = world.day;
      else o.respawnAt = G.now + (o.respawn || 90);
      sendObj(z, o);
    }
    p.dirty = true;
    checkPassive(p);
  },
  travel(p, m) {
    const z = p.zone; if (!z || p.dead) return;
    const exitNear = [...z.objects.values()].some(o => (o.kind === 'exit' && Math.abs(p.x - o.x) < o.w / 2 + 80 && Math.abs(p.y - o.y) < o.h / 2 + 80) || (o.kind === 'signpost' && near(p, o, 160)));
    if (!exitNear) return;
    if (m.to === 'home') {
      let owner = p.save;
      if (m.owner && m.owner !== p.name) { const op = [...players.values()].find(o => o.name === m.owner); if (op) owner = op.save; }
      const hz = homeZoneFor(owner);
      enterZone(p, hz, hz.map.from.village);
    } else if (m.to === 'village') {
      enterZone(p, village, village.map.from[z.kind] || village.map.spawn);
    }
  },
  enter_dungeon(p, m) {
    const z = p.zone; if (!z || p.dead) return;
    const def = D.DUNGEONS[m.key]; if (!def) return;
    const party = partyOf(p);
    if (m.join) {
      const dz = zones.get(m.join);
      const partyRun = party && dz && [...dz.players].some(o => party.members.has(o.id));
      if (z.kind !== 'village' && !partyRun) return p.toast('Use the Expedition Map in the village to join runs.', 'err');
      if (!dz || dz.kind !== 'dungeon' || dz.bossDead) return p.toast('That run has ended.', 'err');
      if (dz === z) return;
      const any = [...dz.players][0];
      enterZone(p, dz, any ? { x: any.x, y: any.y } : dz.map.spawn);
      return;
    }
    if (z.kind !== 'village') return;
    const qi = D.QUESTS.findIndex(q => q.steps.some(st => st.type === 'clear' && st.dungeon === m.key));
    if (p.save.quest.idx < qi) { p.toast('That expedition is still locked.'); return; }
    const id = 'dun:' + m.key + ':' + uid('');
    const dz = new Zone(id, maps.makeDungeon(m.key, (Math.random() * 1e9) | 0), G);
    zones.set(id, dz);
    enterZone(p, dz, dz.map.spawn);
    p.toast(`${def.name}: recommended gear level ${def.rec}. Your gear is level ${p.stats.gearLvl}.`);
    if (party) for (const id2 of party.members) { const o = players.get(id2); if (o && o !== p) o.send({ t: 'party_run', from: p.name, key: m.key, name: def.name, zoneId: id }); }
  },
  build(p, m) {
    const z = p.zone, s = p.save;
    if (!z || z.kind !== 'home' || z.owner !== p.name) return;
    const def = D.BUILDINGS[m.type]; if (!def) return;
    const rot = (m.rot | 0) % 4, tx = m.tx | 0, ty = m.ty | 0;
    if (def.needs && !s.home.buildings.some(b => b.type === def.needs)) return p.toast(`Build a ${D.BUILDINGS[def.needs].name} first.`, 'err');
    if (s.home.buildings.filter(b => b.type === m.type).length >= def.max) return p.toast(`You can only have ${def.max} ${def.name}${def.max > 1 ? 's' : ''}.`, 'err');
    const err = placementError(z, m.type, tx, ty, rot);
    if (err) return p.toast(err, 'err');
    const miss = missingText(s, def.cost);
    if (miss) return p.toast(miss, 'err');
    invTake(s, def.cost);
    const b = { id: s.nextUid++, type: m.type, tx, ty, rot, lvl: 1 };
    s.home.buildings.push(b);
    sendObj(z, addBuildingObj(z, b));
    z.ev({ k: 'fx', f: 'poof', x: (tx + dims(m.type, rot)[0] / 2) * T, y: (ty + dims(m.type, rot)[1] / 2) * T });
    p.toast(`Built ${def.name}! (+${def.renown} renown)`, 'good');
    questEvent(p, 'build', { building: m.type });
    checkRenown(p); checkPassive(p);
    p.dirty = true; writeSave(s);
  },
  demolish(p, m) {
    const z = p.zone, s = p.save;
    if (!z || z.kind !== 'home' || z.owner !== p.name) return;
    const i = s.home.buildings.findIndex(b => 'b' + b.id === m.id);
    if (i < 0) return;
    const b = s.home.buildings[i];
    if (b.type === 'cottage' && s.home.buildings.length > 1) return p.toast('Remove your other buildings before the cottage.', 'err');
    s.home.buildings.splice(i, 1);
    const cost = D.BUILDINGS[b.type].cost;
    for (const k in cost) invGive(s, k, Math.floor(cost[k] / 2));
    delObj(z, m.id);
    p.toast(`Removed ${D.BUILDINGS[b.type].name}. Refunded half its cost.`);
    p.dirty = true;
  },
  rotate(p, m) {
    const z = p.zone, s = p.save;
    if (!z || z.kind !== 'home' || z.owner !== p.name) return;
    const b = s.home.buildings.find(bb => 'b' + bb.id === m.id);
    if (!b) return;
    const nr = (b.rot + 1) % 4;
    const old = z.objects.get(m.id); z.objects.delete(m.id);
    const err = placementError(z, b.type, b.tx, b.ty, nr);
    if (err) { z.objects.set(m.id, old); return p.toast('Not enough room to rotate here.', 'err'); }
    b.rot = nr;
    sendObj(z, addBuildingObj(z, b));
  },
  upgrade(p, m) {
    const z = p.zone, s = p.save;
    if (!z || z.kind !== 'home' || z.owner !== p.name) return;
    const b = s.home.buildings.find(bb => 'b' + bb.id === m.id);
    if (!b) return;
    const up = D.BUILDINGS[b.type].upgrade;
    if (!up || b.lvl >= 2) return;
    const miss = missingText(s, up.cost);
    if (miss) return p.toast(miss, 'err');
    invTake(s, up.cost); b.lvl = 2;
    sendObj(z, addBuildingObj(z, b));
    p.toast(`${D.BUILDINGS[b.type].name} upgraded to Level 2!`, 'good');
    questEvent(p, 'upgrade', { building: b.type });
    checkRenown(p);
    p.dirty = true; writeSave(s);
  },
  plant(p, m) {
    const z = p.zone, s = p.save;
    if (!z || z.kind !== 'home' || z.owner !== p.name) return;
    const b = s.home.buildings.find(bb => 'b' + bb.id === m.id);
    const it = D.ITEMS[m.seed];
    if (!b || b.type !== 'farmbed' || b.crop || !it || !it.seed || !(s.inv[m.seed] > 0)) return;
    invTake(s, { [m.seed]: 1 });
    b.crop = { type: it.seed, planted: world.day };
    sendObj(z, addBuildingObj(z, b));
    p.toast(`Planted ${it.name}. Ready in ${GROW[it.seed]} day(s).`, 'good');
    questEvent(p, 'plant', {});
    p.dirty = true;
  },
  cook(p, m) {
    const s = p.save, rc = D.RECIPES[m.recipe];
    if (!rc || !p.zone || p.zone.owner !== p.name) return;
    const stove = s.home.buildings.find(b => b.type === 'stove');
    if (!stove) return;
    if (!rc.story && !s.knownRecipes.includes(m.recipe)) return p.toast('You have not unlocked that recipe yet.', 'err');
    if ((stove.lvl || 1) < rc.stove) return p.toast('Upgrade your stove to Level 2 for this recipe.', 'err');
    const n = Math.max(1, Math.min(20, m.n | 0));
    let made = 0;
    for (let i = 0; i < n; i++) { if (!invHas(s, rc.in)) break; invTake(s, rc.in); invGive(s, m.recipe, 1); made++; questEvent(p, 'cook', { recipe: m.recipe }); }
    if (!made) return p.toast(missingText(s, rc.in), 'err');
    if (!s.meal && D.ITEMS[m.recipe].meal) s.meal = m.recipe;
    p.send({ t: 'pick', txt: `Cooked ${made}x ${itemName(m.recipe)}`, icon: m.recipe });
    p.dirty = true;
  },
  smelt(p, m) {
    const s = p.save, rc = D.SMELT[m.item];
    if (!rc || !p.zone || p.zone.owner !== p.name || !s.home.buildings.some(b => b.type === 'smelter')) return;
    const n = Math.max(1, Math.min(20, m.n | 0));
    let made = 0;
    for (let i = 0; i < n; i++) { if (!invHas(s, rc.in)) break; invTake(s, rc.in); invGive(s, m.item, 1); made++; }
    if (!made) return p.toast(missingText(s, rc.in), 'err');
    questEvent(p, 'smelt', { item: m.item, n: made });
    p.send({ t: 'pick', txt: `Smelted ${made}x ${itemName(m.item)}`, icon: m.item });
    p.dirty = true;
  },
  forge(p, m) {
    const s = p.save, tier = D.TIERS[m.tier];
    if (!tier || !tier.cost || !['weapon', 'helmet', 'body'].includes(m.slot)) return;
    if (!p.zone || p.zone.owner !== p.name || !s.home.buildings.some(b => b.type === 'anvil')) return;
    const miss = missingText(s, tier.cost, tier.crumbs);
    if (miss) return p.toast(miss, 'err');
    invTake(s, tier.cost); s.crumbs -= tier.crumbs;
    const g = makeGear(s, m.slot, tier.lvl, m.tier);
    s.gear.push(g);
    p.send({ t: 'toast', kind: 'big', msg: `Forged ${g.name} (Lv ${g.lvl})! Don't forget to equip it: press I and click it.` });
    questEvent(p, 'forge', { slot: m.slot });
    p.dirty = true; writeSave(s);
  },
  temper(p, m) {
    const s = p.save, g = s.gear.find(x => x.uid === m.uid);
    if (!g || g.slot === 'charm' && false) return;
    if (!p.zone || p.zone.owner !== p.name || !s.home.buildings.some(b => b.type === 'anvil')) return;
    if (g.lvl >= D.temperMax(g)) return p.toast('This item is already tempered to its limit.', 'err');
    const c = D.temperCost(g);
    const miss = missingText(s, { [c.mat]: c.matN }, c.crumbs);
    if (miss) return p.toast(miss, 'err');
    invTake(s, { [c.mat]: c.matN }); s.crumbs -= c.crumbs;
    g.lvl++;
    calcStats(p);
    p.toast(`${g.name} tempered to Lv ${g.lvl}!`, 'good');
    p.dirty = true;
  },
  salvage(p, m) {
    const s = p.save, i = s.gear.findIndex(x => x.uid === m.uid);
    if (i < 0 || Object.values(s.equip).includes(m.uid)) return;
    const g = s.gear[i]; s.gear.splice(i, 1);
    const c = 8 * g.lvl; s.crumbs += c;
    p.toast(`Salvaged ${g.name} for ${c} Crumbs.`);
    p.dirty = true;
  },
  equip(p, m) {
    const s = p.save, g = s.gear.find(x => x.uid === m.uid);
    if (!g) return;
    s.equip[g.slot] = g.uid;
    calcStats(p);
    questEvent(p, 'equip', { slot: g.slot });
    checkPassive(p);
  },
  unequip(p, m) { if (m.slot === 'weapon') return; delete p.save.equip[m.slot]; calcStats(p); },
  selmeal(p, m) { if (D.ITEMS[m.item] && D.ITEMS[m.item].meal) { p.save.meal = m.item; p.dirty = true; } },
  eat(p) {
    const s = p.save;
    if (p.dead || G.now < p.mealCd) return;
    if (!s.meal || !(s.inv[s.meal] > 0)) {
      const any = Object.keys(s.inv).filter(k => D.ITEMS[k] && D.ITEMS[k].meal).sort((a, b) => D.ITEMS[b].meal.heal - D.ITEMS[a].meal.heal)[0];
      if (!any) return p.toast('No meals! Cook some at your Kitchen Stove.', 'err');
      s.meal = any;
    }
    const it = D.ITEMS[s.meal], ml = it.meal;
    invTake(s, { [s.meal]: 1 });
    p.hp = Math.min(p.maxhp, p.hp + ml.heal);
    if (ml.buff) p.buffs.meal = { type: ml.buff, amt: ml.amt, until: G.now + ml.dur, name: it.name };
    p.mealCd = G.now + 2;
    p.send({ t: 'pick', txt: `Ate ${it.name} (+${ml.heal} HP)`, icon: s.meal });
    if (!(s.inv[s.meal] > 0)) {
      const next = Object.keys(s.inv).filter(k => D.ITEMS[k] && D.ITEMS[k].meal).sort((a, b) => D.ITEMS[b].meal.heal - D.ITEMS[a].meal.heal)[0];
      s.meal = next || null;
      if (next) p.toast(`Out of ${it.name}. Switched to ${itemName(next)}.`);
    }
    p.dirty = true;
  },
  buy(p, m) {
    const s = p.save, sh = D.SHOPS[m.npc];
    if (!sh || !p.zone || p.zone.kind !== 'village') return;
    const e = sh.sells.find(x => x[0] === m.key);
    if (!e) return;
    const n = Math.max(1, Math.min(99, m.n | 0));
    const price = e[1] * n;
    if (s.crumbs < price) return p.toast(`Not enough Crumbs (${s.crumbs}/${price}).`, 'err');
    s.crumbs -= price;
    if (m.key.startsWith('charm:')) s.gear.push(makeGear(s, 'charm', 1, 'starter', { charm: m.key.split(':')[1] }));
    else if (m.key.startsWith('gear:')) { const [, slot, lvl] = m.key.split(':'); s.gear.push(makeGear(s, slot, +lvl, 'stitch')); }
    else invGive(s, m.key, n);
    p.send({ t: 'pick', txt: `Bought ${n > 1 ? n + 'x ' : ''}${shopEntry(s, m.key, 0).name}`, icon: 'crumbs' });
    if (m.key.startsWith('charm:') || m.key.startsWith('gear:')) p.toast('Equip it from your inventory (I).', 'gear');
    questEvent(p, 'buy', { item: m.key });
    p.dirty = true;
    openShop(p, m.npc);
  },
  sell(p, m) {
    const s = p.save, sh = D.SHOPS[m.npc];
    if (!sh || !sh.buys.includes(m.item)) return;
    const n = Math.max(1, Math.min(s.inv[m.item] || 0, m.n | 0));
    if (!n) return;
    invTake(s, { [m.item]: n });
    s.crumbs += D.ITEMS[m.item].sell * n;
    p.dirty = true;
    openShop(p, m.npc);
  },
  cast(p, m) {
    const s = p.save, z = p.zone;
    if (!z || p.dead) return;
    if (!s.inv.fishing_rod) return p.toast('You need a fishing rod. Talk to Grinny at the lake.', 'err');
    const bx = +m.bx, by = +m.by;
    if (z.tileAt(bx, by) !== '~' || Math.hypot(bx - p.x, by - p.y) > 150) return p.toast('Face the water to cast.', 'err');
    p.fish = { state: 'wait', biteAt: G.now + 1.6 + Math.random() * 3, bx, by };
    p.send({ t: 'fish', state: 'wait', bx, by });
  },
  reel(p) {
    const f = p.fish;
    if (!f) return;
    p.fish = null;
    if (f.state === 'bite') {
      const gold = Math.random() < 0.05;
      const item = gold ? 'golden_fish' : 'fish';
      invGive(p.save, item, 1);
      p.send({ t: 'fish', state: 'caught', item, msg: gold ? 'WOW! A Golden Carp!' : 'You caught a Fish!' });
      questEvent(p, 'catch', {});
      p.dirty = true;
    } else p.send({ t: 'fish', state: 'miss', msg: 'Too early! The fish swam off. Press R to cast again.' });
  },
  sleep(p) {
    const z = p.zone;
    if (!z || z.kind !== 'home') return;
    p.sleeping = true;
    checkSleep();
  },
  wake(p) { p.sleeping = false; broadcastSleep(); },
  give(p, m) {
    const to = players.get(m.to), s = p.save;
    if (!to || to.zone !== p.zone || Math.hypot(to.x - p.x, to.y - p.y) > 260) return p.toast('Stand closer to that player to give items.', 'err');
    if (m.uid) {
      const i = s.gear.findIndex(g => g.uid === m.uid);
      if (i < 0 || Object.values(s.equip).includes(m.uid)) return p.toast('Unequip it first.', 'err');
      const g = s.gear.splice(i, 1)[0];
      g.uid = 'g' + (to.save.nextUid++); g.name = g.name.replace(/(Knives|Staff|Blade|Hood|Hat|Helm|Leathers|Robe|Plate)$/, (x) => D.GEAR_NAMES[to.save.cls][g.slot] || x);
      to.save.gear.push(g);
      p.toast(`Gave ${g.name} to ${to.name}.`); to.toast(`${p.name} gave you ${g.name}! Press I to equip it.`, 'gear');
    } else {
      const n = Math.max(1, Math.min(s.inv[m.item] || 0, m.n | 0));
      if (!n || D.ITEMS[m.item].story) return;
      invTake(s, { [m.item]: n }); invGive(to.save, m.item, n);
      p.toast(`Gave ${n} ${itemName(m.item)} to ${to.name}.`); to.toast(`${p.name} gave you ${n} ${itemName(m.item)}.`, 'gear');
      checkPassive(to);
    }
    p.dirty = true; to.dirty = true;
  },
  drop(p, m) {
    const s = p.save, z = p.zone;
    if (!z) return;
    let pk;
    if (m.uid) {
      const i = s.gear.findIndex(g => g.uid === m.uid);
      if (i < 0 || Object.values(s.equip).includes(m.uid)) return p.toast('Unequip it first.', 'err');
      pk = { kind: 'gear', gear: s.gear.splice(i, 1)[0] };
    } else {
      const n = Math.max(1, Math.min(s.inv[m.item] || 0, m.n | 0));
      if (!n || !D.ITEMS[m.item] || D.ITEMS[m.item].story || D.ITEMS[m.item].tool) return;
      invTake(s, { [m.item]: n });
      pk = { kind: 'item', item: m.item, amount: n };
    }
    pk.noPick = { id: p.id, until: G.now + 4 };
    z.dropPickup(p.x, p.y, pk);
    p.dirty = true;
  },
  chat(p, m) {
    const msg = String(m.msg || '').slice(0, 200).trim();
    if (!msg) return;
    const sys = (t) => p.send({ t: 'chat', from: '', msg: t });
    if (msg === '/who') return sys('Online: ' + [...players.values()].map(o => `${o.name} (${o.zone ? o.zone.map.name : '...'})`).join(', '));
    if (msg.startsWith('/invite ')) return handlers.party_invite(p, { name: msg.slice(8).trim() });
    if (msg === '/leave') return handlers.party_leave(p);
    if (msg.startsWith('/g ')) return broadcast({ t: 'chat', ch: 'global', from: p.name, msg: msg.slice(3) });
    if (msg.startsWith('/p ')) {
      const party = partyOf(p);
      if (!party) return sys('You are not in a party. Invite someone with /invite name or the Players menu (P).');
      for (const id of party.members) { const o = players.get(id); if (o) o.send({ t: 'chat', ch: 'party', from: p.name, msg: msg.slice(3) }); }
      return;
    }
    if (msg.startsWith('/')) return sys('Commands: /g message (everyone), /p message (party), /invite name, /leave, /who');
    // local chat: everyone in the same area sees it, plus a bubble over your head
    if (!p.zone) return;
    for (const o of p.zone.players) o.send({ t: 'chat', ch: 'local', from: p.name, pid: p.id, msg });
  },
  who(p) {
    const party = partyOf(p);
    p.send({ t: 'who', list: [...players.values()].map(o => ({ id: o.id, name: o.name, cls: o.save.cls, zone: o.zone ? o.zone.map.name : '', inParty: !!o.party, mine: !!party && party.members.has(o.id) })) });
  },
  party_invite(p, m) {
    const to = m.id ? players.get(m.id) : [...players.values()].find(o => o.name.toLowerCase() === String(m.name || '').toLowerCase());
    if (!to) return p.toast('That player is not online.', 'err');
    if (to === p) return p.toast("You can't invite yourself.", 'err');
    let party = partyOf(p);
    if (party && party.members.has(to.id)) return p.toast(`${to.name} is already in your party.`, 'err');
    if (to.party) return p.toast(`${to.name} is already in a party.`, 'err');
    if (party && party.members.size >= PARTY_MAX) return p.toast(`Parties can have up to ${PARTY_MAX} players.`, 'err');
    if (!party) { party = { id: partySeq++, leader: p.id, members: new Set([p.id]) }; parties.set(party.id, party); p.party = party.id; sendParty(party); }
    to.invite = { from: p.id, party: party.id, until: G.now + 60 };
    to.send({ t: 'party_invite', from: p.name });
    p.toast(`Invited ${to.name} to your party.`);
  },
  party_accept(p) {
    const inv = p.invite; p.invite = null;
    const party = inv && inv.until > G.now ? parties.get(inv.party) : null;
    if (!party) return p.toast('That invite has expired.', 'err');
    if (p.party) return p.toast('Leave your current party first.', 'err');
    if (party.members.size >= PARTY_MAX) return p.toast('That party is full.', 'err');
    party.members.add(p.id); p.party = party.id;
    for (const id of party.members) { const o = players.get(id); if (o) o.send({ t: 'chat', ch: 'party', from: '', msg: `${p.name} joined the party.` }); }
    sendParty(party);
  },
  party_decline(p) {
    const inv = p.invite; p.invite = null;
    const from = inv && players.get(inv.from);
    if (from) from.toast(`${p.name} declined your party invite.`);
  },
  party_leave(p) { leaveParty(p); },
  party_kick(p, m) {
    const party = partyOf(p);
    if (!party || party.leader !== p.id) return;
    const o = players.get(m.id);
    if (o && party.members.has(o.id) && o !== p) { o.toast('You were removed from the party.'); leaveParty(o); }
  },
};

// ====================================================================== parties
const PARTY_MAX = 4;
const parties = new Map();
let partySeq = 1;
function partyOf(p) { return p.party ? parties.get(p.party) || null : null; }
function partyState(party) {
  return [...party.members].map(id => players.get(id)).filter(Boolean).map(m => ({
    id: m.id, name: m.name, cls: m.save.cls, hp: Math.round(m.hp), maxhp: m.maxhp, dead: m.dead, leader: party.leader === m.id,
    zone: m.zone ? m.zone.map.name : '', zoneId: m.zone ? m.zone.id : '', key: (m.zone && m.zone.map.key) || null,
    dungeon: !!(m.zone && m.zone.kind === 'dungeon' && !m.zone.bossDead),
  }));
}
function sendParty(party) {
  const members = partyState(party);
  for (const id of party.members) { const o = players.get(id); if (o) o.send({ t: 'party', members }); }
}
function leaveParty(p) {
  const party = partyOf(p);
  p.party = null;
  p.send({ t: 'party', members: [] });
  if (!party) return;
  party.members.delete(p.id);
  for (const id of party.members) { const o = players.get(id); if (o) o.send({ t: 'chat', ch: 'party', from: '', msg: `${p.name} left the party.` }); }
  if (party.members.size <= 1) {
    for (const id of party.members) { const o = players.get(id); if (o) { o.party = null; o.send({ t: 'party', members: [] }); o.toast('Your party was disbanded.'); } }
    parties.delete(party.id);
    return;
  }
  if (party.leader === p.id) party.leader = [...party.members][0];
  sendParty(party);
}

function placementError(z, type, tx, ty, rot) {
  const [w, h] = dims(type, rot);
  const A = z.map.buildArea;
  if (tx < A[0] || ty < A[1] || tx + w > A[2] || ty + h > A[3]) return 'You can\'t build there.';
  for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++) { const c = z.tiles[y * z.w + x]; if (c !== '.' && c !== ',' && c !== 'd') return 'You can\'t build on that ground.'; }
  const rect = [tx * T + 1, ty * T + 1, (tx + w) * T - 1, (ty + h) * T - 1];
  for (const o of z.objects.values()) {
    if (o.col && rectsOverlap(o.col, rect) && !(o.node && o.dead)) return o.node ? 'Something is in the way (clear trees or rocks first).' : 'Something is in the way.';
    if (o.kind === 'exit' && rectsOverlap([o.x - o.w / 2 - 64, o.y - o.h / 2, o.x + o.w / 2 + 64, o.y + o.h / 2], rect)) return 'Keep the road clear.';
  }
  return '';
}

// ====================================================================== day / sleep
function broadcast(o) { const s = JSON.stringify(o); for (const p of players.values()) if (p.ws.readyState === 1) p.ws.send(s); }
function eligibleSleepers() { return [...players.values()].filter(p => p.zone && p.zone.kind !== 'dungeon' && p.zone.kind !== 'mine'); }
function broadcastSleep() {
  const el = eligibleSleepers();
  const n = el.filter(p => p.sleeping).length;
  for (const p of players.values()) if (p.sleeping) p.send({ t: 'sleepstate', n, total: el.length });
}
function checkSleep() {
  const el = eligibleSleepers();
  if (el.length && el.every(p => p.sleeping)) newDay(true);
  else broadcastSleep();
}
function newDay(slept) {
  world.day++; world.t = slept ? 20 : 0;
  const si = seasonInfo();
  for (const p of players.values()) {
    if (p.sleeping) { p.sleeping = false; p.hp = p.maxhp; p.send({ t: 'woke' }); }
    p.dirty = true;
  }
  broadcast({ t: 'clock', ...si, newDay: true });
  for (const z of zones.values()) {
    if (z.kind !== 'home') continue;
    for (const o of z.objects.values()) {
      if (o.node && o.dead && (z.ownerSave.home.depleted[o.nid] || 0) < world.day && !overlapsBuilding(z, o.col)) { o.dead = false; o.hitsLeft = o.hits; sendObj(z, o); }
    }
    for (const b of z.ownerSave.home.buildings) if (b.crop) sendObj(z, addBuildingObj(z, b));
  }
  saveWorld();
}

// ====================================================================== connections
const wss = new WebSocketServer({ server });
wss.on('connection', (ws) => {
  let p = null;
  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    if (!p) {
      if (m.t !== 'login') return;
      const err = (msg) => ws.send(JSON.stringify({ t: 'err', msg }));
      if (ws.tries >= 5) return err('Too many attempts. Reload the page and try again.');
      const name = String(m.name || '').trim();
      const pass = String(m.password || '');
      if (!/^[A-Za-z0-9 _-]{2,16}$/.test(name)) return err('Usernames are 2-16 letters, numbers, spaces, _ or -.');
      if (pass.length < 4 || pass.length > 64) return err('Passwords must be 4-64 characters.');
      let save = loadSave(name);
      if (m.create) {
        if (save) return err('That username is taken. Pick another, or log in.');
        if (!D.CLASSES[m.cls]) return ws.send(JSON.stringify({ t: 'need_class', name }));
        save = newSave(name, m.cls);
        save.auth = hashPassword(pass);
        writeSave(save);
      } else {
        if (!save) return err('No account with that username. Click "Create account" to make one.');
        if (!save.auth) { save.auth = hashPassword(pass); writeSave(save); } // older save without a password: claim it
        else if (!checkPassword(pass, save.auth)) { ws.tries = (ws.tries || 0) + 1; return err('Wrong password.'); }
      }
      if ([...players.values()].some(o => o.name.toLowerCase() === name.toLowerCase())) return err('That character is already playing.');
      p = new Player(ws, save);
      players.set(p.id, p);
      p.send({ t: 'welcome', id: p.id, clock: seasonInfo() });
      // rejoin a dungeon run if it's still going
      const ld = save.lastDungeon;
      const dz = ld && ld.until > Date.now() ? zones.get(ld.id) : null;
      delete save.lastDungeon;
      if (dz) enterZone(p, dz, { x: ld.x, y: ld.y });
      else if (save.lastZone === 'home') { const hz = homeZoneFor(save); enterZone(p, hz, hz.map.spawn); }
      else if (save.lastZone === 'mine') enterZone(p, mine, mine.map.from.village);
      else enterZone(p, village, village.map.spawn);
      broadcast({ t: 'chat', from: '', msg: `${p.name} joined the world.` });
      checkRenown(p); checkPassive(p);
      console.log(`[+] ${p.name} (${save.cls})`);
      return;
    }
    const h = handlers[m.t];
    if (h) { try { h(p, m); } catch (e) { console.error('handler', m.t, e); } }
  });
  ws.on('close', () => {
    if (!p) return;
    const s = p.save;
    if (p.zone && p.zone.kind === 'dungeon') s.lastDungeon = { id: p.zone.id, x: p.x, y: p.y, until: Date.now() + 180000 };
    s.hp = Math.max(1, Math.round(p.hp));
    leaveParty(p);
    leaveZone(p);
    players.delete(p.id);
    writeSave(s);
    broadcast({ t: 'chat', from: '', msg: `${p.name} left the world.` });
    console.log(`[-] ${p.name}`);
    checkSleep();
  });
});

// ====================================================================== main loop
const TICK = 1 / 30;
let tickN = 0, lastSave = 0, lastClock = 0;
let last = process.hrtime.bigint();
setInterval(() => {
  const nowNs = process.hrtime.bigint();
  const dt = Math.min(0.1, Number(nowNs - last) / 1e9);
  last = nowNs;
  G.now += dt; tickN++;
  world.t += dt;
  if (world.t >= D.DAY_SECONDS) newDay(false);
  for (const z of zones.values()) {
    if (z.players.size || z.kind === 'dungeon') z.tick(dt);
    if (z.kind === 'mine') for (const o of z.objects.values()) if (o.node && o.dead && o.respawnAt <= G.now) { o.dead = false; o.hitsLeft = o.hits; sendObj(z, o); }
  }
  for (const p of players.values()) playerTick(p, dt);
  // zone cleanup
  for (const [id, z] of zones) {
    if (z.kind !== 'dungeon' && z.kind !== 'home') continue;
    if (z.players.size) { z.emptyFor = 0; continue; }
    z.emptyFor += dt;
    if ((z.kind === 'dungeon' && z.emptyFor > 200) || (z.kind === 'home' && z.emptyFor > 20)) {
      if (z.kind === 'home' && ![...players.values()].some(p => p.save === z.ownerSave)) writeSave(z.ownerSave);
      zones.delete(id);
    }
  }
  // network
  if (tickN % 2 === 0) {
    for (const z of zones.values()) {
      if (!z.players.size) { z.events = []; continue; }
      const snap = z.snapshot();
      snap.ev = z.events; z.events = [];
      const hasOwned = snap.pk.some(k => k[5]);
      const shared = hasOwned ? null : JSON.stringify(snap);
      for (const p of z.players) {
        if (p.ws.readyState !== 1) continue;
        if (shared) p.ws.send(shared);
        else p.ws.send(JSON.stringify(Object.assign({}, snap, { pk: snap.pk.filter(k => !k[5] || k[5] === p.id) })));
      }
    }
  }
  for (const p of players.values()) if (p.dirty) { p.dirty = false; p.send(meState(p)); }
  if (tickN % 30 === 0) for (const party of parties.values()) sendParty(party);
  if (G.now - lastClock > 5) { lastClock = G.now; broadcast({ t: 'clock', ...seasonInfo() }); }
  if (G.now - lastSave > 20) {
    lastSave = G.now;
    for (const p of players.values()) { p.save.hp = Math.max(1, Math.round(p.hp)); writeSave(p.save); }
    saveWorld();
  }
}, TICK * 1000);

// save everyone before the server stops (Ctrl+C or closing the window)
function shutdown() {
  for (const p of players.values()) { p.save.hp = Math.max(1, Math.round(p.hp)); if (p.zone && p.zone.kind === 'dungeon') p.save.lastDungeon = null; writeSave(p.save); }
  saveWorld();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('SIGHUP', shutdown);

server.listen(PORT, '0.0.0.0', () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
  console.log(`\n  Hollowhearth server running!`);
  console.log(`  Play on this computer:   http://localhost:${PORT}`);
  for (const ip of ips) console.log(`  Friends on your network: http://${ip}:${PORT}`);
  console.log('');
});
