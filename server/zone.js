// A Zone is one live map instance (village, a homestead, the mine, or a dungeon run).
// The server simulates enemies, projectiles, telegraphs and pickups here.
const D = require('../shared/data');
const { isSolidTile } = require('./maps');
const T = D.TILE;

let uidc = 1;
const uid = (p) => p + (uidc++).toString(36);
const rand = (a, b) => a + Math.random() * (b - a);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

const TRIGGER = { hop: 210, dash: 250, shoot: 330, sprint: 230, ring: 170, swing: 80, mark: 300, spear: 140, spin: 120, roll: 280, summon: 700 };
const COOLDOWN = { hop: 1.2, dash: 1.6, shoot: 1.5, sprint: 1.4, ring: 2.2, swing: 0.9, mark: 2.0, spear: 1.1, spin: 2.2, roll: 2.5, summon: 1 };
const KEEP = { shoot: 210, mark: 190, ring: 80 };

class Zone {
  constructor(id, map, game) {
    this.id = id; this.game = game; this.map = map; this.kind = map.kind;
    this.w = map.w; this.h = map.h; this.tiles = map.tiles;
    this.objects = new Map();
    for (const o of map.objects) this.objects.set(o.id, o);
    this.enemies = new Map(); this.proj = []; this.pickups = new Map(); this.tele = [];
    this.minions = new Map(); this.timers = []; this.events = [];
    this.players = new Set();
    this.time = 0; this.emptyFor = 0;
    this.packsTotal = 0; this.packsCleared = 0; this.bossDead = false;
    this.partyMult = 1; this.maxPlayers = 0;
    if (map.kind === 'dungeon') this.setupDungeon();
  }

  // ------------------------------------------------------------ collision
  tileAt(px, py) {
    const x = Math.floor(px / T), y = Math.floor(py / T);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 'x';
    return this.tiles[y * this.w + x];
  }
  solidAt(px, py) { return isSolidTile(this.tileAt(px, py)); }
  blocked(x, y, r) {
    if (this.solidAt(x - r, y - r) || this.solidAt(x + r, y - r) || this.solidAt(x - r, y + r) || this.solidAt(x + r, y + r) || this.solidAt(x, y)) return true;
    for (const o of this.objects.values()) {
      if (!o.col || o.nocol) continue;
      const c = o.col;
      const cx = Math.max(c[0], Math.min(x, c[2])), cy = Math.max(c[1], Math.min(y, c[3]));
      if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) return true;
    }
    return false;
  }
  move(ent, dx, dy, r) {
    let hit = false;
    if (dx) { if (!this.blocked(ent.x + dx, ent.y, r)) ent.x += dx; else hit = true; }
    if (dy) { if (!this.blocked(ent.x, ent.y + dy, r)) ent.y += dy; else hit = true; }
    return hit;
  }

  // ------------------------------------------------------------ dungeon setup
  setupDungeon() {
    const def = D.DUNGEONS[this.map.key];
    this.def = def;
    for (const pack of this.map.packs) {
      pack.alive = pack.members.length;
      for (const m of pack.members) this.spawnEnemy(m.type, m.x, m.y, pack.id, false);
    }
    this.packsTotal = this.map.packs.length;
    if (this.map.boss) this.bossId = this.spawnEnemy(def.boss.base, this.map.boss.x, this.map.boss.y, null, true).id;
  }
  spawnEnemy(type, x, y, pack, boss) {
    const def = this.def;
    const base = D.ENEMIES[type];
    const lvl = def.lvl;
    const hpBase = boss ? def.boss.hp : base.hp;
    const hp = Math.round(hpBase * (1 + 0.45 * (lvl - 1)) * this.partyMult);
    const s = boss ? def.boss.scale : 1;
    const e = {
      id: uid('e'), type: boss ? 'boss:' + this.map.key : type, base, ai: base.ai, boss: !!boss,
      x, y, hx: x, hy: y, hp, maxhp: hp, lvl, pack, s,
      dmg: base.dmg * (0.65 + 0.25 * (lvl - 1)) * (boss ? 1.3 : 1),
      speed: base.speed * (boss ? 0.95 : 1), r: base.r * s,
      state: 'idle', t: 0, cd: rand(0.3, 1.2), target: null, face: 1, z: 0,
      slowUntil: 0, stunUntil: 0, mi: 0, hitSet: null, vx: 0, vy: 0,
      moves: boss ? def.boss.moves : [base.ai], spinTick: 0, contactCd: {},
    };
    this.enemies.set(e.id, e);
    return e;
  }
  onPlayerJoin(p) {
    this.players.add(p);
    if (this.kind !== 'dungeon') return;
    const n = this.players.size;
    if (n > this.maxPlayers) {
      const newMult = 1 + 0.5 * (n - 1);
      const k = newMult / this.partyMult;
      for (const e of this.enemies.values()) { e.hp = Math.round(e.hp * k); e.maxhp = Math.round(e.maxhp * k); }
      this.partyMult = newMult; this.maxPlayers = n;
    }
  }

  // ------------------------------------------------------------ helpers
  ev(o) { this.events.push(o); }
  addTele(t) {
    t.id = uid('t'); t.t0 = this.time; t.team = t.team || 'e';
    this.tele.push(t);
    return t;
  }
  after(sec, fn) { this.timers.push({ at: this.time + sec, fn }); }
  alivePlayers() { return [...this.players].filter(p => !p.dead && p.zone === this); }
  nearestPlayer(x, y, range, visibleOnly) {
    let best = null, bd = range;
    for (const p of this.players) {
      if (p.dead || p.zone !== this) continue;
      if (visibleOnly && p.stealthUntil > this.game.now) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  hurtCircle(x, y, r, dmg, src) {
    for (const p of this.alivePlayers()) if (Math.hypot(p.x - x, p.y - y) < r + 12) this.game.damagePlayer(p, dmg, src);
  }
  hurtCone(x, y, a, range, half, dmg, src) {
    for (const p of this.alivePlayers()) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < range + 12 && (d < 20 || Math.abs(angDiff(Math.atan2(p.y - y, p.x - x), a)) < half)) this.game.damagePlayer(p, dmg, src);
    }
  }
  hurtLine(x, y, a, len, w, dmg, src) {
    const cx = Math.cos(a), cy = Math.sin(a);
    for (const p of this.alivePlayers()) {
      const dx = p.x - x, dy = p.y - y;
      const along = dx * cx + dy * cy, perp = Math.abs(-dx * cy + dy * cx);
      if (along > -10 && along < len + 10 && perp < w / 2 + 12) this.game.damagePlayer(p, dmg, src);
    }
  }
  enemyProj(e, a, opts) {
    const sp = opts.speed || 230;
    this.proj.push({
      id: uid('p'), x: e.x, y: e.y - 6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: opts.r || 7,
      dmg: e.dmg * (opts.mult || 0.9), team: 'e', kind: opts.kind || 'orb', life: opts.life || 2.2,
      homing: opts.homing || 0, src: e,
    });
  }

  // ------------------------------------------------------------ enemy AI
  aggroPack(e, target) {
    if (e.pack == null) { if (!e.target) e.target = target; return; }
    for (const o of this.enemies.values()) if (o.pack === e.pack && !o.target) { o.target = target; if (o.state === 'idle') o.state = 'chase'; }
  }
  aiTick(e, dt) {
    const now = this.game.now;
    if (e.stunUntil > now) return;
    const slow = e.slowUntil > now ? 0.5 : 1;
    // target selection
    if (e.target && (e.target.dead || e.target.zone !== this || e.target.stealthUntil > now || dist(e, e.target) > 760)) {
      e.target = null;
      if (e.state === 'chase') e.state = 'idle';
    }
    if (!e.target) {
      const p = this.nearestPlayer(e.x, e.y, e.boss ? 330 : 250, true);
      if (p) { e.target = p; e.state = e.state === 'idle' ? 'chase' : e.state; this.aggroPack(e, p); }
    }
    e.cd -= dt;
    if (e.state === 'idle') {
      // drift home
      const d = Math.hypot(e.hx - e.x, e.hy - e.y);
      if (d > 8) { const a = Math.atan2(e.hy - e.y, e.hx - e.x); this.move(e, Math.cos(a) * e.speed * 0.6 * dt, Math.sin(a) * e.speed * 0.6 * dt, e.r); }
      return;
    }
    const tg = e.target;
    if (e.state === 'chase') {
      if (!tg) { e.state = 'idle'; return; }
      const move = e.moves[e.mi % e.moves.length];
      const d = dist(e, tg);
      const trig = (TRIGGER[move] || 120) + (e.boss ? e.r * 0.6 : 0);
      e.face = tg.x < e.x ? -1 : 1;
      if (e.cd <= 0 && d < trig) { this.startMove(e, move, tg); return; }
      let want = KEEP[move] != null ? KEEP[move] : 0;
      const a = angTo(e, tg);
      let sp = e.speed * slow;
      if (e.ai === 'hop' && !e.boss) sp *= 0.6;
      if (d > want + 10) this.move(e, Math.cos(a) * sp * dt, Math.sin(a) * sp * dt, e.r);
      else if (d < want - 50) this.move(e, -Math.cos(a) * sp * 0.8 * dt, -Math.sin(a) * sp * 0.8 * dt, e.r);
      else { const s = Math.sin(this.time * 1.3 + e.hx) > 0 ? 1 : -1; this.move(e, -Math.sin(a) * sp * 0.5 * dt * s, Math.cos(a) * sp * 0.5 * dt * s, e.r); }
      return;
    }
    if (e.state === 'wind') { e.t -= dt; if (e.t <= 0) this.actMove(e); return; }
    if (e.state === 'act') { this.actTick(e, dt); return; }
    if (e.state === 'recover') { e.t -= dt; if (e.t <= 0) e.state = e.target ? 'chase' : 'idle'; }
  }

  startMove(e, move, tg) {
    const s = e.boss ? 1.4 : 1;
    const enr = e.boss && e.hp < e.maxhp * 0.5 ? 0.75 : 1;
    e.move = move; e.state = 'wind'; e.aimA = angTo(e, tg); e.aimX = tg.x; e.aimY = tg.y;
    e.face = Math.cos(e.aimA) < 0 ? -1 : 1;
    let w = 0.5;
    switch (move) {
      case 'hop': w = 0.5 * enr; e.tele = this.addTele({ kind: 'circle', x: tg.x, y: tg.y, r: 46 * s, dur: w + 0.55 }); break;
      case 'dash': w = 0.55 * enr; e.tele = this.addTele({ kind: 'line', x: e.x, y: e.y, a: e.aimA, len: 270, w: 26 * s, dur: w }); break;
      case 'shoot': w = 0.35; break;
      case 'sprint': { w = 0.4 * enr; const L = Math.min(dist(e, tg) + 40, 320); e.tele = this.addTele({ kind: 'line', x: e.x, y: e.y, a: e.aimA, len: L, w: 30 * s, dur: w }); break; }
      case 'ring': w = 0.7 * enr; e.tele = this.addTele({ kind: 'ring', x: e.x, y: e.y, r: e.r + 22, dur: w, follow: e.id }); break;
      case 'swing': w = 0.5 * enr; e.tele = this.addTele({ kind: 'cone', x: e.x, y: e.y, a: e.aimA, r: 82 * s, half: 1.1, dur: w, follow: e.id }); break;
      case 'mark': w = 0.3; break;
      case 'spear': w = 0.55 * enr; e.tele = this.addTele({ kind: 'line', x: e.x, y: e.y, a: e.aimA, len: 150 * s, w: 28 * s, dur: w, follow: e.id }); break;
      case 'spin': w = 0.4 * enr; e.tele = this.addTele({ kind: 'circle', x: e.x, y: e.y, r: 58 * s, dur: w, follow: e.id }); break;
      case 'roll': w = 0.5 * enr; e.tele = this.addTele({ kind: 'line', x: e.x, y: e.y, a: e.aimA, len: 220, w: e.r * 2, dur: w }); break;
      case 'summon': w = 0.6; e.tele = this.addTele({ kind: 'ring', x: e.x, y: e.y, r: e.r + 40, dur: w, follow: e.id }); break;
    }
    e.t = w;
  }

  actMove(e) {
    const s = e.boss ? 1.4 : 1;
    e.state = 'act'; e.t = 0; e.hitSet = new Set();
    const move = e.move;
    switch (move) {
      case 'hop': e.leap = { sx: e.x, sy: e.y, tx: e.aimX, ty: e.aimY, dur: 0.55 }; break;
      case 'dash': e.vx = Math.cos(e.aimA) * 520; e.vy = Math.sin(e.aimA) * 520; e.dur = 0.45; break;
      case 'sprint': e.vx = Math.cos(e.aimA) * 400; e.vy = Math.sin(e.aimA) * 400; e.dur = Math.min(0.6, (Math.hypot(e.aimX - e.x, e.aimY - e.y) + 20) / 400); break;
      case 'shoot': {
        const n = e.boss ? 5 : (e.base.spread || 1);
        const tg = e.target || { x: e.aimX, y: e.aimY };
        const a0 = angTo(e, tg);
        for (let i = 0; i < n; i++) this.enemyProj(e, a0 + (i - (n - 1) / 2) * 0.22, { kind: e.base.proj, homing: e.base.homing ? 2.2 : 0, speed: e.base.homing ? 170 : 240 });
        this.finish(e, 0.4); return;
      }
      case 'ring': {
        const n = e.boss ? 18 : 10;
        const wave = (off) => { for (let i = 0; i < n; i++) this.enemyProj(e, off + i / n * Math.PI * 2, { kind: e.base.proj || (e.boss ? 'orb' : 'spore'), speed: 165, life: 1.9, mult: 0.8 }); };
        wave(Math.random());
        if (e.boss) this.after(0.4, () => { if (this.enemies.has(e.id)) wave(Math.random() + 0.17); });
        this.ev({ k: 'fx', f: 'puff', x: e.x, y: e.y, r: e.r + 20 });
        this.finish(e, 0.9); return;
      }
      case 'swing':
        this.hurtCone(e.x, e.y, e.aimA, 82 * s, 1.1, e.dmg * 1.2, e);
        this.ev({ k: 'fx', f: 'slash', x: e.x, y: e.y, a: e.aimA, r: 82 * s, team: 'e' });
        this.finish(e, 0.6); return;
      case 'mark': {
        const spots = [];
        if (e.boss) { for (const p of this.alivePlayers()) spots.push([p.x, p.y]); for (let i = 0; i < 3; i++) { const a = Math.random() * 7, r = rand(60, 200); spots.push([e.x + Math.cos(a) * r, e.y + Math.sin(a) * r]); } }
        else spots.push([e.aimX, e.aimY]);
        for (const [x, y] of spots) {
          const r = e.boss ? 66 : 56;
          this.addTele({ kind: 'circle', x, y, r, dur: 1.0, style: 'mark' });
          this.after(1.0, () => { this.hurtCircle(x, y, r, e.dmg * 1.3, e); this.ev({ k: 'fx', f: 'erupt', x, y, r }); });
        }
        this.finish(e, 0.9); return;
      }
      case 'spear':
        this.hurtLine(e.x, e.y, e.aimA, 150 * s, 28 * s, e.dmg * 1.2, e);
        this.ev({ k: 'fx', f: 'jab', x: e.x, y: e.y, a: e.aimA, len: 150 * s });
        this.finish(e, 0.6); return;
      case 'spin': e.dur = 1.6; e.spinTick = 0; break;
      case 'roll': e.vx = Math.cos(e.aimA) * 340; e.vy = Math.sin(e.aimA) * 340; e.dur = 2.2; break;
      case 'summon': {
        const live = [...this.enemies.values()].filter(o => o.summoned).length;
        const n = Math.min(3, 6 - live);
        for (let i = 0; i < n; i++) {
          const a = Math.random() * 7;
          let x = e.x + Math.cos(a) * (e.r + 40), y = e.y + Math.sin(a) * (e.r + 40);
          if (this.blocked(x, y, 14)) { x = e.x; y = e.y; }
          const m = this.spawnEnemy(this.def.pool[Math.floor(Math.random() * this.def.pool.length)], x, y, null, false);
          m.summoned = true; m.target = e.target; m.state = 'chase'; m.hp = m.maxhp = Math.round(m.maxhp * 0.6);
          this.ev({ k: 'fx', f: 'poof', x, y });
        }
        this.finish(e, 0.6); return;
      }
    }
  }

  actTick(e, dt) {
    e.t += dt;
    const s = e.boss ? 1.4 : 1;
    switch (e.move) {
      case 'hop': {
        const L = e.leap, k = Math.min(1, e.t / L.dur);
        const nx = L.sx + (L.tx - L.sx) * k, ny = L.sy + (L.ty - L.sy) * k;
        if (!this.blocked(nx, ny, e.r * 0.6)) { e.x = nx; e.y = ny; }
        e.z = Math.sin(Math.PI * k) * (e.boss ? 70 : 40);
        if (k >= 1) {
          e.z = 0;
          this.hurtCircle(e.x, e.y, 46 * s, e.dmg, e);
          this.ev({ k: 'fx', f: 'thud', x: e.x, y: e.y, r: 46 * s });
          if (e.boss) for (let i = 0; i < 12; i++) this.enemyProj(e, i / 12 * Math.PI * 2, { kind: 'orb', speed: 180, life: 1.5, mult: 0.7 });
          this.finish(e, 0.6);
        }
        break;
      }
      case 'dash': case 'sprint': case 'roll': {
        const hitWall = this.move(e, e.vx * dt, e.vy * dt, e.r);
        if (e.move === 'roll' && hitWall) {
          // bounce
          if (this.blocked(e.x + e.vx * dt * 2, e.y, e.r)) e.vx = -e.vx;
          if (this.blocked(e.x, e.y + e.vy * dt * 2, e.r)) e.vy = -e.vy;
          this.ev({ k: 'fx', f: 'bonk', x: e.x, y: e.y });
        }
        e.face = e.vx < 0 ? -1 : 1;
        const now = this.game.now;
        for (const p of this.alivePlayers()) {
          if (Math.hypot(p.x - e.x, p.y - e.y) < e.r + 14) {
            if (e.move === 'roll') { if ((e.contactCd[p.id] || 0) < now) { e.contactCd[p.id] = now + 0.6; this.game.damagePlayer(p, e.dmg, e); } }
            else if (e.move === 'dash' && !e.hitSet.has(p.id)) { e.hitSet.add(p.id); this.game.damagePlayer(p, e.dmg, e); }
          }
        }
        const reached = e.move === 'sprint' && e.target && dist(e, e.target) < e.r + 22;
        if (e.t >= e.dur || reached || (hitWall && e.move !== 'roll')) {
          if (e.move === 'sprint') {
            const a = e.target ? angTo(e, e.target) : e.aimA;
            this.hurtCone(e.x, e.y, a, 58 * s, 1.0, e.dmg * 1.1, e);
            this.ev({ k: 'fx', f: 'slash', x: e.x, y: e.y, a, r: 58 * s, team: 'e' });
          }
          this.finish(e, e.move === 'roll' ? 0.9 : 0.7);
        }
        break;
      }
      case 'spin': {
        const tg = e.target;
        if (tg) { const a = angTo(e, tg); this.move(e, Math.cos(a) * e.speed * 1.15 * dt, Math.sin(a) * e.speed * 1.15 * dt, e.r); }
        e.spinTick -= dt;
        if (e.spinTick <= 0) { e.spinTick = 0.3; this.hurtCircle(e.x, e.y, 54 * s, e.dmg * 0.55, e); }
        if (e.t >= e.dur) this.finish(e, 0.8);
        break;
      }
      default: this.finish(e, 0.5);
    }
  }
  finish(e, rec) {
    e.state = 'recover'; e.t = rec; e.vx = e.vy = 0; e.z = 0;
    const enr = e.boss && e.hp < e.maxhp * 0.5;
    e.cd = e.boss ? (enr ? 0.35 : 0.7) : COOLDOWN[e.move] * rand(0.85, 1.25);
    if (e.boss) e.mi++;
    if (e.tele) { this.tele = this.tele.filter(t => t !== e.tele); e.tele = null; }
  }

  // ------------------------------------------------------------ damage to enemies
  damageEnemy(e, amount, p, opts) {
    if (!this.enemies.has(e.id)) return;
    opts = opts || {};
    let dmg = amount;
    let crit = false;
    if (p) {
      if (Math.random() < p.stats.crit) { dmg *= 2; crit = true; }
      if (p.ambush) { dmg *= 1.8; p.ambush = false; crit = true; }
      dmg *= 1 + p.dmgBuff();
      if (!e.target) { e.target = p; if (e.state === 'idle') e.state = 'chase'; this.aggroPack(e, p); }
    }
    dmg = Math.max(1, Math.round(dmg * rand(0.92, 1.08)));
    e.hp -= dmg;
    if (opts.slow) e.slowUntil = this.game.now + opts.slow;
    if (opts.stun && !e.boss) { e.stunUntil = this.game.now + opts.stun; if (e.state !== 'act') { e.state = 'recover'; e.t = opts.stun; if (e.tele) { this.tele = this.tele.filter(t => t !== e.tele); e.tele = null; } } }
    if (opts.kb && !e.boss && e.state !== 'act') {
      const a = Math.atan2(e.y - opts.ky, e.x - opts.kx);
      this.move(e, Math.cos(a) * opts.kb, Math.sin(a) * opts.kb, e.r);
    }
    this.ev({ k: 'dmg', x: Math.round(e.x), y: Math.round(e.y - e.r * 2 - e.z), v: dmg, c: crit ? 1 : 0, id: e.id });
    if (e.hp <= 0) this.killEnemy(e, p);
  }
  killEnemy(e, killer) {
    this.enemies.delete(e.id);
    if (e.tele) this.tele = this.tele.filter(t => t !== e.tele);
    this.ev({ k: 'fx', f: 'death', x: e.x, y: e.y, r: e.r });
    // drops
    const lvl = e.lvl;
    const nC = e.boss ? 8 : 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < nC; i++) this.dropPickup(e.x, e.y, { kind: 'crumbs', amount: Math.round((3 + lvl * 1.6) * rand(0.8, 1.4)) });
    if (Math.random() < (e.boss ? 1 : 0.16)) for (let i = 0; i < (e.boss ? 3 : 1); i++) this.dropPickup(e.x, e.y, { kind: 'heart', amount: 20 });
    if ((this.map.key === 'attic' || this.map.key === 'furnace') && Math.random() < (e.boss ? 1 : 0.08)) this.dropPickup(e.x, e.y, { kind: 'item', item: 'ember_core', amount: e.boss ? 3 : 1 });
    if (this.map.key === 'bramble' && Math.random() < 0.2) this.dropPickup(e.x, e.y, { kind: 'item', item: 'berries', amount: 2 });
    if (this.map.key === 'grotto' && Math.random() < 0.15) this.dropPickup(e.x, e.y, { kind: 'item', item: 'fish', amount: 1 });
    this.game.onKill(this, e, killer);
    if (e.pack != null) {
      const pack = this.map.packs[e.pack];
      pack.alive--;
      if (pack.alive <= 0) { this.packsCleared++; this.ev({ k: 'packs', c: this.packsCleared, t: this.packsTotal }); }
    }
    if (e.boss) {
      this.bossDead = true;
      for (const o of this.enemies.values()) if (o.summoned) { this.enemies.delete(o.id); this.ev({ k: 'fx', f: 'poof', x: o.x, y: o.y }); }
      this.tele = [];
      const portal = { id: uid('o'), kind: 'portal', x: e.x, y: e.y - 70, name: 'Return to Village', exit: true };
      this.objects.set(portal.id, portal);
      this.game.broadcastObj(this, portal);
      this.game.onBossKilled(this, e);
    }
  }
  dropPickup(x, y, pk) {
    pk.id = uid('k');
    const a = Math.random() * Math.PI * 2, sp = rand(60, 160);
    pk.x = x; pk.y = y; pk.vx = Math.cos(a) * sp; pk.vy = Math.sin(a) * sp; pk.t0 = this.time;
    this.pickups.set(pk.id, pk);
    return pk;
  }

  // ------------------------------------------------------------ main tick
  tick(dt) {
    this.time += dt;
    const now = this.game.now;
    // timers
    if (this.timers.length) {
      const due = this.timers.filter(t => t.at <= this.time);
      this.timers = this.timers.filter(t => t.at > this.time);
      for (const t of due) t.fn();
    }
    // enemies
    if (this.enemies.size) {
      const active = this.players.size > 0;
      for (const e of this.enemies.values()) if (active) this.aiTick(e, dt);
      // separation
      const arr = [...this.enemies.values()];
      for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i], b = arr[j];
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = (a.r + b.r) * 0.8;
        if (d > 0 && d < m) {
          const push = (m - d) / 2, nx = dx / d, ny = dy / d;
          if (!a.boss && a.state !== 'act') this.move(a, -nx * push, -ny * push, a.r);
          if (!b.boss && b.state !== 'act') this.move(b, nx * push, ny * push, b.r);
        }
      }
      for (const t of this.tele) if (t.follow) { const e = this.enemies.get(t.follow); if (e) { t.x = e.x; t.y = e.y; } }
    }
    this.tele = this.tele.filter(t => this.time - t.t0 < t.dur);
    // projectiles
    const keep = [];
    for (const pr of this.proj) {
      pr.life -= dt;
      if (pr.homing) {
        const tg = pr.team === 'e' ? this.nearestPlayer(pr.x, pr.y, 400, false) : null;
        if (tg) {
          const want = Math.atan2(tg.y - pr.y, tg.x - pr.x), cur = Math.atan2(pr.vy, pr.vx);
          const na = cur + Math.max(-pr.homing * dt, Math.min(pr.homing * dt, angDiff(want, cur)));
          const sp = Math.hypot(pr.vx, pr.vy);
          pr.vx = Math.cos(na) * sp; pr.vy = Math.sin(na) * sp;
        }
      }
      pr.x += pr.vx * dt; pr.y += pr.vy * dt;
      let dead = pr.life <= 0;
      if (!dead && this.solidAt(pr.x, pr.y)) { dead = true; this.ev({ k: 'fx', f: 'spark', x: pr.x, y: pr.y }); }
      if (!dead && pr.team === 'e') {
        for (const p of this.alivePlayers()) if (Math.hypot(p.x - pr.x, p.y - pr.y) < pr.r + 12) { this.game.damagePlayer(p, pr.dmg, pr.src); dead = true; break; }
      } else if (!dead && pr.team === 'p') {
        for (const e of this.enemies.values()) {
          if (pr.hit && pr.hit.has(e.id)) continue;
          if (Math.hypot(e.x - pr.x, (e.y - e.r * 0.6) - pr.y) < pr.r + e.r + 4) {
            const owner = pr.owner;
            this.damageEnemy(e, pr.dmg, owner, { slow: pr.slow });
            if (pr.splash) {
              for (const o of this.enemies.values()) if (o !== e && Math.hypot(o.x - pr.x, o.y - pr.y) < pr.splash) this.damageEnemy(o, pr.dmg * 0.5, owner);
              this.ev({ k: 'fx', f: 'burst', x: pr.x, y: pr.y, r: pr.splash });
            }
            if (pr.chain) {
              let best = null, bd = 220;
              for (const o of this.enemies.values()) { if (o === e) continue; const d = Math.hypot(o.x - pr.x, o.y - pr.y); if (d < bd) { bd = d; best = o; } }
              if (best) { this.ev({ k: 'fx', f: 'zap', x: pr.x, y: pr.y, x2: best.x, y2: best.y - best.r }); this.damageEnemy(best, pr.dmg * 0.7, owner); }
            }
            if (pr.pierce) { pr.hit = pr.hit || new Set(); pr.hit.add(e.id); }
            else { dead = true; break; }
          }
        }
      }
      if (!dead) keep.push(pr);
    }
    this.proj = keep;
    // minions
    for (const m of this.minions.values()) {
      const o = m.owner;
      if (!o || o.zone !== this || now > m.until) { this.minions.delete(m.id); continue; }
      const tx = o.x + Math.cos(this.time * 2) * 34, ty = o.y - 46 + Math.sin(this.time * 3) * 6;
      m.x += (tx - m.x) * Math.min(1, dt * 5); m.y += (ty - m.y) * Math.min(1, dt * 5);
      m.cd -= dt;
      if (m.cd <= 0) {
        let best = null, bd = 300;
        for (const e of this.enemies.values()) { const d = Math.hypot(e.x - m.x, e.y - m.y); if (d < bd) { bd = d; best = e; } }
        if (best) {
          m.cd = 0.6;
          const a = Math.atan2(best.y - best.r * 0.6 - m.y, best.x - m.x);
          this.proj.push({ id: uid('p'), x: m.x, y: m.y, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520, r: 6, dmg: o.stats.power * D.ABILITIES.owl.mult, team: 'p', kind: 'feather', life: 0.8, owner: o });
        }
      }
    }
    // pickups
    for (const pk of this.pickups.values()) {
      pk.vx *= Math.pow(0.02, dt); pk.vy *= Math.pow(0.02, dt);
      if (Math.abs(pk.vx) > 1 || Math.abs(pk.vy) > 1) {
        const nx = pk.x + pk.vx * dt, ny = pk.y + pk.vy * dt;
        if (!this.solidAt(nx, ny)) { pk.x = nx; pk.y = ny; } else { pk.vx = pk.vy = 0; }
      }
      const age = this.time - pk.t0;
      if (pk.kind === 'heart' && age > 25) { this.pickups.delete(pk.id); continue; }
      if (age < 0.45) continue;
      // nearest eligible player
      let best = null, bd = pk.kind === 'heart' ? 70 : 100;
      for (const p of this.players) {
        if (p.dead || p.zone !== this) continue;
        if (pk.owner && pk.owner !== p.id) continue;
        if (pk.noPick && pk.noPick.id === p.id && now < pk.noPick.until) continue;
        if (pk.kind === 'heart' && p.hp >= p.maxhp) continue;
        const d = Math.hypot(p.x - pk.x, p.y - pk.y);
        if (d < bd) { bd = d; best = p; }
      }
      if (best) {
        if (bd < 20) { this.pickups.delete(pk.id); this.game.collect(best, pk, this); continue; }
        const sp = 260 + (100 - bd) * 6;
        pk.x += (best.x - pk.x) / bd * sp * dt; pk.y += (best.y - pk.y) / bd * sp * dt;
      }
    }
  }

  // ------------------------------------------------------------ network
  snapshot(forPlayer) {
    const now = this.game.now;
    const players = [];
    for (const p of this.players) {
      if (p.zone !== this) continue;
      let fl = 0;
      if (p.dead) fl |= 1; if (p.stealthUntil > now) fl |= 2; if (p.rollUntil > now) fl |= 4;
      if (p.shield > 0 && p.shieldUntil > now) fl |= 8; if (p.sleeping) fl |= 16; if (p.unstopUntil > now) fl |= 32;
      if (p.whirl && p.whirl.until > now) fl |= 64; if (p.fish) fl |= 128;
      players.push([p.id, Math.round(p.x), Math.round(p.y), Math.round(p.facing * 100) / 100, p.anim || 0, Math.round(p.hp), p.maxhp, fl, p.name, p.save.cls, p.buildIdx || 0]);
    }
    const enemies = [];
    for (const e of this.enemies.values()) {
      let fl = 0;
      if (e.boss) fl |= 1; if (e.slowUntil > now) fl |= 2; if (e.stunUntil > now) fl |= 4;
      if (e.state === 'wind') fl |= 8; if (e.state === 'act' && e.move === 'spin') fl |= 16; if (e.state === 'act' && e.move === 'roll') fl |= 32;
      if (e.state === 'idle') fl |= 64;
      enemies.push([e.id, e.type, Math.round(e.x), Math.round(e.y), Math.max(0, Math.round(e.hp)), e.maxhp, fl, e.face, Math.round(e.z)]);
    }
    const proj = this.proj.map(p => [p.id, Math.round(p.x), Math.round(p.y), Math.round(p.vx), Math.round(p.vy), p.kind, p.team === 'e' ? 1 : 0, p.owner ? p.owner.id : '']);
    const tele = this.tele.map(t => [t.id, t.kind, Math.round(t.x), Math.round(t.y), t.r || 0, +(t.a || 0).toFixed(2), t.len || 0, t.w || 0, +Math.min(1, (this.time - t.t0) / t.dur).toFixed(2), t.team === 'p' ? 1 : 0, t.half || 0, t.style || '']);
    const pickups = [];
    for (const pk of this.pickups.values()) {
      pickups.push([pk.id, pk.kind, Math.round(pk.x), Math.round(pk.y), pk.item || (pk.gear ? pk.gear.slot : ''), pk.owner || '']);
    }
    const mins = [...this.minions.values()].map(m => [m.id, m.kind, Math.round(m.x), Math.round(m.y)]);
    return { t: 's', p: players, e: enemies, pr: proj, tg: tele, pk: pickups, mn: mins, pc: [this.packsCleared, this.packsTotal] };
  }
}

module.exports = { Zone, uid };
