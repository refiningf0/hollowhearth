// Hollowhearth client: networking, input, local movement, world rendering.
(function () {
  const D = window.GameData, R = window.Render, T = D.TILE;
  const cv = document.getElementById('game');
  const ctx = cv.getContext('2d');
  const SOLID = new Set(['~', 'T', 'R', '#', 'x']);
  const ENEMY_SCALE = 1.25;

  const G = window.Game = {
    ws: null, me: null, myId: null, zone: null, clock: { day: 1, t: 0, season: 'Spring', dos: 1, len: 360 }, clockAt: 0,
    local: { x: 0, y: 0, facing: 0, anim: 0, dash: null, walkT: 0, blinkT: 0 },
    players: new Map(), enemies: new Map(), proj: [], projAt: 0, tele: [], pickups: [], minions: new Map(),
    floaters: [], keys: {}, mouse: { x: 0, y: 0, wx: 0, wy: 0, down: false }, cds: {},
    guideOn: true, build: { active: false, type: null, rot: 0 }, gather: null, fish: null, interact: null,
    bubbles: new Map(), party: [], dying: [], ptrails: new Map(),
    cam: { x: 0, y: 0 }, zoom: 1, shake: 0, packs: [0, 0], season: 'Spring', night: 0, lastTravel: 0, hoverBuilding: null,
  };
  G.send = (o) => { if (G.ws && G.ws.readyState === 1) G.ws.send(JSON.stringify(o)); };

  // ================================================================== login / connection
  const $ = (id) => document.getElementById(id);
  let pending = null; // { name, password, create }
  let reconnecting = false;
  function connect(cls) {
    if (G.ws && G.ws.readyState <= 1) G.ws.close();
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}`);
    G.ws = ws;
    ws.onopen = () => G.send({ t: 'login', name: pending.name, password: pending.password, create: pending.create, cls });
    ws.onmessage = (ev) => onMsg(JSON.parse(ev.data));
    ws.onclose = () => {
      if (G.ws !== ws) return;
      if (G.me || reconnecting) {
        // lost connection mid-game (network blip or server update): log back in automatically
        if (!reconnecting) UI.big('Connection lost', 'Reconnecting...');
        reconnecting = true;
        G.me = null;
        setTimeout(() => { if (reconnecting) { pending.create = false; connect(); } }, 2000);
      }
    };
  }
  function showLogin() {
    $('login').classList.remove('hidden');
    try { $('login-name').value = localStorage.getItem('hh_name') || ''; } catch (e) { /* storage blocked */ }
    ($('login-name').value ? $('login-pass') : $('login-name')).focus();
  }
  function submitLogin(create) {
    Music.start(); // browsers only allow audio after a click
    const name = $('login-name').value.trim(), password = $('login-pass').value;
    if (name.length < 2) { $('login-err').textContent = 'Enter a username (2-16 characters).'; return; }
    if (password.length < 4) { $('login-err').textContent = 'Enter a password (at least 4 characters).'; return; }
    pending = { name, password, create };
    try { localStorage.setItem('hh_name', name); } catch (e) { /* storage blocked */ }
    $('login-err').textContent = '';
    connect();
  }
  $('login-go').onclick = () => submitLogin(false);
  $('login-new').onclick = () => submitLogin(true);
  for (const id of ['login-name', 'login-pass']) $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') submitLogin(false); e.stopPropagation(); });
  $('class-back').onclick = () => { $('login-step-class').classList.add('hidden'); $('login-step-name').classList.remove('hidden'); };
  function showClassPick() {
    $('login-step-name').classList.add('hidden');
    $('login-step-class').classList.remove('hidden');
    const box = $('class-cards'); box.innerHTML = '';
    for (const [id, c] of Object.entries(D.CLASSES)) {
      const el = document.createElement('div');
      el.className = 'ccard';
      el.innerHTML = `<img src="sprites/${c.sprite}.png"><div class="cn">${c.name}</div><div class="cd2">${c.desc}</div><div class="cs">${c.hp} base HP · ${c.builds.map(b => b.name).join(' / ')} builds</div>`;
      el.onclick = () => connect(id);
      box.appendChild(el);
    }
  }

  // ================================================================== messages
  function onMsg(m) {
    switch (m.t) {
      case 'err': if (reconnecting) break; $('login-err').textContent = m.msg; $('login-step-class').classList.add('hidden'); $('login-step-name').classList.remove('hidden'); break;
      case 'need_class': showClassPick(); break;
      case 'welcome':
        if (reconnecting) { reconnecting = false; UI.toast('Reconnected!', 'good'); }
        G.myId = m.id; setClock(m.clock);
        $('login').classList.add('hidden'); $('hud').classList.remove('hidden');
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        UI.chat('', 'Welcome to Hollowhearth! Press H for controls.');
        break;
      case 'me': {
        const first = !G.me;
        const prevBuild = G.me && G.me.build;
        G.me = m;
        if (first || prevBuild !== m.build) UI.buildAbilities();
        UI.updateMe();
        break;
      }
      case 'zone': enterZone(m); break;
      case 's': onSnap(m); break;
      case 'obj': if (G.zone) { G.zone.objs.set(m.o.id, m.o); } break;
      case 'objdel': if (G.zone) G.zone.objs.delete(m.id); break;
      case 'pos': G.local.x = m.x; G.local.y = m.y; G.local.dash = null; break;
      case 'toast': if (m.kind === 'big') UI.big(m.msg); else if (m.kind === 'recipe') { Music.sting('recipe'); UI.toast(m.msg, 'recipe'); UI.big('New recipe unlocked!', m.msg.replace(/^New recipe unlocked: /, '')); } else UI.toast(m.msg, m.kind); break;
      case 'quest_done': Music.sting('quest'); R.confetti(G.local.x, G.local.y - 50, 70); UI.big('Quest complete: ' + m.name, `+${m.reward} Crumbs`); G.guideOn = true; break;
      case 'quest_step': UI.toast('Quest: ' + m.text, 'gear'); G.guideOn = true; break;
      case 'almanac': UI.almanac(m.name, m.bonus, m.kills); break;
      case 'pick': addFloater(G.local.x, G.local.y - 70, m.txt, '#bff5b8', m.icon, true); break;
      case 'death':
        Music.sting('death');
        $('death-tip').textContent = m.tip;
        $('respawn-here').textContent = m.dungeon ? 'Get back up (dungeon entrance)' : 'Get back up';
        $('death').classList.remove('hidden');
        G.gather = null; G.fish = null;
        break;
      case 'dialog': UI.dialog(m); break;
      case 'shop': UI.shop(m); break;
      case 'expedition': UI.expedition(m); break;
      case 'homes': UI.homes(m.list); break;
      case 'ui': UI.station(m.ui, m.id); break;
      case 'fish': onFish(m); break;
      case 'clock': setClock(m); if (m.newDay) UI.big(`A new day dawns`, `${m.season} ${m.dos}`); break;
      case 'sleepstate': $('sleep-text').textContent = m.total > 1 ? `Sleeping... waiting for everyone to rest (${m.n}/${m.total})` : 'Sleeping...'; break;
      case 'woke': $('sleep-overlay').classList.add('hidden'); break;
      case 'chat':
        UI.chat(m.from, m.msg, m.ch);
        if (m.ch === 'local' && m.pid) G.bubbles.set(m.pid, { text: m.msg, until: performance.now() + 4000 + m.msg.length * 60 });
        break;
      case 'party': G.party = m.members; UI.updateParty(); break;
      case 'party_invite': UI.partyInvite(m.from); break;
      case 'party_run': UI.partyRun(m); break;
      case 'who': UI.players(m.list); break;
    }
  }
  function setClock(c) {
    G.clock = c; G.clockAt = performance.now();
    if (G.zone && c.season !== G.season) { G.season = c.season; if (G.zone.kind === 'village' || G.zone.kind === 'home') G.zone.ground = R.buildGround(G.zone, G.season); }
    G.season = c.season;
    UI.updateClock();
  }

  function enterZone(m) {
    const z = {
      id: m.id, kind: m.kind, name: m.name, w: m.w, h: m.h, tiles: m.tiles, owner: m.owner, theme: m.theme, dark: m.dark, key: m.key,
      buildArea: m.buildArea, dungeonDef: m.dungeonDef, objs: new Map(),
    };
    for (const o of m.objs) z.objs.set(o.id, o);
    z.ground = R.buildGround(z, G.season);
    z.mm = R.buildMinimap(z);
    z.fog = document.createElement('canvas'); z.fog.width = z.w; z.fog.height = z.h;
    const fc = z.fog.getContext('2d'); fc.fillStyle = '#000'; fc.fillRect(0, 0, z.w, z.h);
    G.zone = z;
    G.local.x = m.you.x; G.local.y = m.you.y; G.local.dash = null;
    G.cam.x = G.local.x; G.cam.y = G.local.y;
    G.players.clear(); G.enemies.clear(); G.proj = []; G.localProj = []; G.tele = []; G.pickups = []; G.minions.clear();
    G.packs = m.packs; G.gather = null; G.fish = null; G.lastTravel = performance.now();
    if (G.build.active && (z.kind !== 'home' || z.owner !== (G.me && G.me.name))) UI.setBuild(false);
    UI.closeAll();
    $('death').classList.add('hidden'); $('sleep-overlay').classList.add('hidden');
    UI.updateZone();
    UI.updateMe();
  }

  function onSnap(m) {
    const now = performance.now();
    const seen = new Set();
    for (const p of m.p) {
      const [id, x, y, f, a, hp, maxhp, fl, name, cls, bi] = p;
      seen.add(id);
      let e = G.players.get(id);
      if (!e) { e = { x, y, walkT: 0 }; G.players.set(id, e); }
      Object.assign(e, { tx: x, ty: y, f, a, hp, maxhp, fl, name, cls, bi });
      if (Math.hypot(e.x - x, e.y - y) > 300) { e.x = x; e.y = y; }
      if (id === G.myId) {
        G.self = e;
        if (G.me) { G.me.hp = hp; G.me.maxhp = maxhp; }
      }
    }
    for (const id of G.players.keys()) if (!seen.has(id)) G.players.delete(id);
    const seenE = new Set();
    for (const q of m.e) {
      const [id, type, x, y, hp, maxhp, fl, face, z] = q;
      seenE.add(id);
      let e = G.enemies.get(id);
      if (!e) { e = { x, y, z: 0, flash: 0, born: now }; G.enemies.set(id, e); }
      Object.assign(e, { id, type, tx: x, ty: y, tz: z, hp, maxhp, fl, face });
    }
    for (const [id, e] of G.enemies) if (!seenE.has(id)) { G.enemies.delete(id); if (e.hp <= 0 || Math.hypot(e.x - G.local.x, e.y - G.local.y) < 1200) G.dying.push({ e, t0: now }); }
    G.proj = m.pr; G.projAt = now;
    G.tele = m.tg;
    const pk = new Map(G.pickups.map(k => [k[0], k]));
    G.pickups = m.pk.map(k => { const old = pk.get(k[0]); return old ? Object.assign(k, { rx: old.rx, ry: old.ry }) : k; });
    const seenM = new Set();
    for (const [id, kind, x, y] of m.mn) { seenM.add(id); const e = G.minions.get(id) || { x, y }; e.tx = x; e.ty = y; e.kind = kind; G.minions.set(id, e); }
    for (const id of G.minions.keys()) if (!seenM.has(id)) G.minions.delete(id);
    if (m.pc) G.packs = m.pc;
    for (const ev of m.ev || []) onEvent(ev);
    UI.updateBoss();
  }
  function onEvent(ev) {
    if (ev.k === 'dmg') {
      if (ev.pl) {
        addFloater(ev.x, ev.y, ev.txt || '-' + ev.v, '#ff8a9a', null, false, true);
        if (ev.id === G.myId) { G.shake = Math.max(G.shake, 4); G.hurtAt = performance.now(); }
      } else {
        addFloater(ev.x + (Math.random() - 0.5) * 16, ev.y, String(ev.v), ev.c ? '#ffd23a' : '#ffffff', null, false, false, true, ev.c);
        const e = G.enemies.get(ev.id);
        if (e) { e.flash = performance.now(); e.hitFrom = Math.atan2(e.y - G.local.y, e.x - G.local.x); R.hitFx(e.x + (Math.random() - 0.5) * 10, e.y - 14 - (e.z || 0), ev.c); }
        if (ev.c) G.shake = Math.max(G.shake, 2.5);
      }
    } else if (ev.k === 'fx') R.spawnFx(ev, (n) => { G.shake = Math.max(G.shake, n); });
    else if (ev.k === 'packs') { G.packs = [ev.c, ev.t]; UI.updateZone(); addFloater(G.local.x, G.local.y - 90, `Pack cleared! ${ev.c}/${ev.t}`, '#ffe58a', null, true); }
    else if (ev.k === 'banner') { Music.sting('victory'); R.confetti(G.local.x, G.local.y - 60, 120); }
    if (ev.k === 'banner') UI.big(ev.msg, 'A portal home has opened');
  }
  function addFloater(x, y, text, col, icon, rise, hurt, box, crit) {
    G.floaters.push({ x, y, text, col, icon, t: 0, life: box ? 0.8 : 1.3, box, crit, hurt });
  }

  // ================================================================== fishing
  function onFish(m) {
    if (m.state === 'wait') { G.fish = { state: 'wait', bx: m.bx, by: m.by, t: performance.now() }; }
    else if (m.state === 'bite') { if (G.fish) { G.fish.state = 'bite'; G.fish.biteAt = performance.now(); } }
    else if (m.state === 'caught') { G.fish = null; UI.big(m.msg, 'Press R to cast again'); addFloater(G.local.x, G.local.y - 70, '+1 ' + D.ITEMS[m.item].name, '#bff5b8', m.item, true); }
    else { G.fish = null; if (m.msg) UI.toast(m.msg, 'err'); }
  }

  // ================================================================== collision
  function tileAt(px, py) {
    const z = G.zone; if (!z) return 'x';
    const x = Math.floor(px / T), y = Math.floor(py / T);
    if (x < 0 || y < 0 || x >= z.w || y >= z.h) return 'x';
    return z.tiles[y * z.w + x];
  }
  G.tileAt = tileAt;
  function blocked(x, y, r) {
    for (const [dx, dy] of [[-r, -r], [r, -r], [-r, r], [r, r], [0, 0]]) if (SOLID.has(tileAt(x + dx, y + dy))) return true;
    for (const o of G.zone.objs.values()) {
      if (!o.col || o.nocol) continue;
      const c = o.col;
      const cx = Math.max(c[0], Math.min(x, c[2])), cy = Math.max(c[1], Math.min(y, c[3]));
      if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) return true;
    }
    return false;
  }
  G.blocked = blocked;
  function moveLocal(dx, dy) {
    const L = G.local, r = 10;
    let hit = false;
    if (blocked(L.x, L.y, r)) { L.x += dx; L.y += dy; return false; } // overlapping something: let the player walk out
    const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 8) || 1;
    for (let i = 0; i < steps; i++) {
      const sx = dx / steps, sy = dy / steps;
      if (!blocked(L.x + sx, L.y, r)) L.x += sx; else hit = true;
      if (!blocked(L.x, L.y + sy, r)) L.y += sy; else hit = true;
    }
    return hit;
  }

  // ================================================================== abilities (client side)
  function abilityId(key) { const me = G.me; if (!me) return null; return D.CLASSES[me.cls].builds[me.build].abilities[key]; }
  G.abilityId = abilityId;
  function moveDir() {
    let mx = 0, my = 0; const k = G.keys;
    if (k.w || k.arrowup) my -= 1; if (k.s || k.arrowdown) my += 1; if (k.a || k.arrowleft) mx -= 1; if (k.d || k.arrowright) mx += 1;
    const l = Math.hypot(mx, my);
    return l ? [mx / l, my / l] : [0, 0];
  }
  function useAbility(key) {
    const me = G.me, L = G.local;
    if (!me || !G.zone || (G.self && G.self.fl & 1)) return;
    if (G.build.active) return;
    const id = abilityId(key), ab = D.ABILITIES[id];
    if (!ab) return;
    const now = performance.now() / 1000;
    if ((G.cds[key] || 0) > now) return;
    G.cds[key] = now + ab.cd;
    G.fish = null;
    const ax = G.mouse.wx, ay = G.mouse.wy;
    const a = Math.atan2(ay - (L.y - 18), ax - L.x);
    L.facing = a;
    if (id === 'roll') {
      let [mx, my] = moveDir();
      if (!mx && !my) { mx = Math.cos(a); my = Math.sin(a); }
      L.dash = { vx: mx * 430, vy: my * 430, t: 0.32, roll: true, dur: 0.32 };
    } else if (id === 'charge') {
      L.dash = { vx: Math.cos(a) * 640, vy: Math.sin(a) * 640, t: 0.28, dur: 0.28 };
    } else if (id === 'blink') {
      const d = Math.min(170, Math.hypot(ax - L.x, ay - L.y));
      let bx = L.x, by = L.y;
      for (let s = 8; s <= d; s += 8) { const nx = L.x + Math.cos(a) * s, ny = L.y + Math.sin(a) * s; if (!blocked(nx, ny, 10)) { bx = nx; by = ny; } }
      R.spawnFx({ f: 'blink', x: L.x, y: L.y });
      L.x = bx; L.y = by; L.blinkT = 0.2;
      R.spawnFx({ f: 'blink', x: L.x, y: L.y });
    }
    predictShots(id, a);
    const CAST = { knives: '220,235,255', volley: '220,235,255', rapidfire: '255,190,90', emberbolt: '255,150,60', spark: '140,230,255', chain: '170,200,255', frostnova: '170,230,255', meteor: '255,150,60', owl: '190,255,140', ward: '140,180,255', stealth: '200,180,230', cleave: '255,255,255', whirlwind: '255,255,255', slam: '255,230,200', battlecry: '255,215,100', unstoppable: '255,150,70' };
    if (CAST[id]) R.castFlash(L.x + Math.cos(a) * 18, L.y - 20 + Math.sin(a) * 18, CAST[id]);
    if (id === 'stealth') R.spawnFx({ f: 'poof', x: L.x, y: L.y - 20 });
    if (id === 'ward') R.spawnFx({ f: 'blink', x: L.x, y: L.y });
    G.send({ t: 'ab', k: key, ax, ay });
    sendMove(true);
  }

  // ---- your own projectiles are drawn instantly; the server still decides what they hit
  const PREDICTED = new Set(['knife', 'arrow', 'ember', 'spark']);
  G.localProj = [];
  function shoot(a, speed, life, kind) {
    const L = G.local;
    G.localProj.push({ x: L.x + Math.cos(a) * 14, y: L.y - 18 + Math.sin(a) * 14, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life, kind });
  }
  function predictShots(id, a) {
    if (id === 'knives') for (let i = -1; i <= 1; i++) shoot(a + i * 0.15, 560, 0.5, 'knife');
    else if (id === 'volley') for (let i = 0; i < 5; i++) shoot(a + (i - 2) * 0.2, 640, 0.7, 'arrow');
    else if (id === 'emberbolt') shoot(a, 470, 0.9, 'ember');
    else if (id === 'spark') shoot(a, 720, 0.6, 'spark');
    else if (id === 'rapidfire') for (let i = 0; i < 12; i++) setTimeout(() => {
      const L = G.local;
      shoot(Math.atan2(G.mouse.wy - (L.y - 18), G.mouse.wx - L.x) + (Math.random() - 0.5) * 0.12, 620, 0.55, 'knife');
    }, i * 100);
  }
  function updateLocalProj(dt) {
    for (let i = G.localProj.length - 1; i >= 0; i--) {
      const p = G.localProj[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      let dead = p.life <= 0 || SOLID.has(tileAt(p.x, p.y));
      if (!dead) for (const e of G.enemies.values()) if (Math.hypot(e.x - p.x, e.y - 8 - p.y) < 24) { dead = p.kind !== 'arrow'; break; }
      if (dead) { if (p.life > 0) R.spawnFx({ f: p.kind === 'ember' ? 'burst' : 'spark', x: p.x, y: p.y, r: 40 }, () => { }); G.localProj.splice(i, 1); }
    }
  }

  // ================================================================== interaction
  const GATHER_DUR = { tree: 0.9, rock: 1.0, ore: 1.1, bush: 0.5 };
  function interactables() {
    const z = G.zone, L = G.local, out = [];
    if (!z) return out;
    for (const o of z.objs.values()) {
      let d, text = null, range = 70;
      if (o.kind === 'building') {
        const c = o.col;
        d = Math.hypot(L.x - Math.max(c[0], Math.min(L.x, c[2])), L.y - Math.max(c[1], Math.min(L.y, c[3])));
        range = 34;
        const own = z.owner === (G.me && G.me.name);
        if (o.type === 'cottage') text = 'Sleep';
        else if (!own) continue;
        else if (o.type === 'stove') text = 'Cook';
        else if (o.type === 'anvil') text = 'Forge & Temper';
        else if (o.type === 'smelter') text = 'Smelt';
        else if (o.type === 'farmbed') { text = o.crop ? (o.crop.ready ? 'Harvest' : 'Check crop') : 'Plant seeds'; range = 20; }
        else continue;
      } else {
        d = Math.hypot(L.x - o.x, L.y - o.y);
        switch (o.kind) {
          case 'npc': text = o.traveler ? 'Talk to the Traveler' : 'Talk to ' + D.NPCS[o.npc].name; range = 75; d = Math.hypot(L.x - o.x, L.y - o.y); break;
          case 'expedition': text = 'Open Expedition Map'; range = 80; break;
          case 'mine': text = 'Enter the Hollow Mine'; range = 70; break;
          case 'portal': text = 'Leave the dungeon'; range = 60; break;
          case 'signpost': if (z.kind !== 'village') continue; text = 'Visit a homestead'; range = 60; break;
          case 'chest': if (o.opened) continue; text = 'Open chest'; range = 55; break;
          case 'tree': case 'rock': case 'ore': case 'bush':
            if (o.dead) continue;
            text = 'Hold E: ' + (o.kind === 'tree' ? 'Chop tree' : o.kind === 'bush' ? 'Pick berries' : 'Mine ' + (o.res === 'stone' || !o.res ? 'rock' : D.ITEMS[o.res].name));
            range = 52; d = Math.hypot(L.x - o.x, L.y - (o.y - 4));
            break;
          default: continue;
        }
      }
      if (d < range) out.push({ o, d, text });
    }
    out.sort((a, b) => a.d - b.d);
    return out;
  }
  function doInteract() {
    const it = G.interact; if (!it) return false;
    const o = it.o;
    if (o.node) return true; // gathering handled while held
    if (o.kind === 'portal') { UI.confirm('Leave the dungeon and return to the village?', () => G.send({ t: 'act', id: o.id })); return true; }
    G.send({ t: 'act', id: o.id });
    return true;
  }
  function castLine() {
    const L = G.local;
    const a = Math.atan2(G.mouse.wy - L.y, G.mouse.wx - L.x);
    for (let d = 30; d <= 140; d += 10) {
      const bx = L.x + Math.cos(a) * d, by = L.y + Math.sin(a) * d;
      if (tileAt(bx, by) === '~') { G.send({ t: 'cast', bx, by }); L.facing = a; return true; }
    }
    // try any direction toward the nearest water
    for (let r = 30; r <= 110; r += 16) for (let i = 0; i < 16; i++) {
      const aa = i / 16 * Math.PI * 2, bx = L.x + Math.cos(aa) * r, by = L.y + Math.sin(aa) * r;
      if (tileAt(bx, by) === '~') { G.send({ t: 'cast', bx, by }); return true; }
    }
    return false;
  }
  function toolPress() {
    if (G.fish) { if (G.fish.state === 'bite') G.send({ t: 'reel' }); else { G.send({ t: 'reel' }); } return; }
    if (G.interact && G.interact.o.node) return; // hold to gather
    if (G.me && G.me.inv.fishing_rod) { if (!castLine()) UI.toast('Nothing to use your tool on here. Stand by trees, rocks or water.', 'err'); }
    else UI.toast('Stand next to a tree, rock or bush and hold R (or E) to gather.', 'err');
  }

  // ================================================================== input
  const typing = () => { const a = document.activeElement; return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && a.offsetParent !== null; };
  window.addEventListener('keydown', (e) => {
    if (!G.me) return;
    const k = e.key.toLowerCase();
    if (typing()) {
      if (k === 'escape') document.activeElement.blur();
      if (k === 'enter' && document.activeElement.id === 'chat-input') {
        const v = e.target.value.trim(); if (v) G.send({ t: 'chat', msg: v });
        e.target.value = ''; e.target.blur();
      }
      return;
    }
    if (e.repeat && !'wasd'.includes(k) && !k.startsWith('arrow')) { G.keys[k] = true; return; }
    G.keys[k] = true;
    if (k === 'enter') { $('chat-input').focus(); e.preventDefault(); return; }
    if (k === 'escape') { UI.escape(); return; }
    if (k === 'tab') e.preventDefault();
    if (UI.dialogOpen() && (k === ' ' || k === 'e')) { UI.dialogAdvance(); return; }
    if (G.build.active) {
      if (k === 'r') { if (G.build.type) G.build.rot = (G.build.rot + 1) % 4; else if (G.hoverBuilding) G.send({ t: 'rotate', id: G.hoverBuilding.id }); return; }
      if (k === 'x' && G.hoverBuilding && !G.build.type) { const hb = G.hoverBuilding; UI.confirm(`Remove this ${D.BUILDINGS[hb.type].name}? You get half the materials back.`, () => G.send({ t: 'demolish', id: hb.id })); return; }
      if (k === 'b') { UI.setBuild(false); return; }
    }
    switch (k) {
      case 'q': useAbility('q'); break;
      case 'e':
        if (G.fish) { toolPress(); break; }
        if (G.interact) { doInteract(); break; }
        useAbility('e'); break;
      case 'r': toolPress(); break;
      case 'g': G.send({ t: 'eat' }); break;
      case 'm': UI.toast(Music.toggleMute() ? 'Music muted (M)' : 'Music on (M)'); break;
      case 'l': G.send({ t: 'swapbuild' }); break;
      case 'i': UI.toggle('inventory'); break;
      case 'j': UI.toggle('journal'); break;
      case 'k': UI.toggle('almanac'); break;
      case 'p': G.send({ t: 'who' }); break;
      case 'h': UI.toggle('help'); break;
      case 'b':
        if (G.zone && G.zone.kind === 'home' && G.zone.owner === G.me.name) UI.setBuild(!G.build.active);
        else UI.toast('You can only build on your own homestead (east of the village).', 'err');
        break;
    }
  });
  window.addEventListener('keyup', (e) => { G.keys[e.key.toLowerCase()] = false; });
  window.addEventListener('blur', () => { G.keys = {}; G.mouse.down = false; });
  cv.addEventListener('mousemove', (e) => { G.mouse.x = e.clientX; G.mouse.y = e.clientY; });
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('mousedown', (e) => {
    if (!G.me) return;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    if (e.button === 0) {
      if (G.fish && G.fish.state === 'bite') { G.send({ t: 'reel' }); return; }
      if (G.build.active) { placeBuilding(); return; }
      G.mouse.down = true;
    } else if (e.button === 2) {
      if (G.build.active) { if (G.build.type) G.build.type = null; else UI.setBuild(false); UI.refresh('build'); return; }
      useAbility('rmb');
    }
  });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) G.mouse.down = false; });
  $('respawn-here').onclick = () => { G.send({ t: 'respawn', where: 'here' }); $('death').classList.add('hidden'); };
  $('respawn-village').onclick = () => { G.send({ t: 'respawn', where: 'village' }); $('death').classList.add('hidden'); };
  $('wake-btn').onclick = () => { G.send({ t: 'wake' }); $('sleep-overlay').classList.add('hidden'); };
  document.querySelectorAll('#menu-buttons button').forEach(b => b.onclick = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: b.dataset.k })));

  // ================================================================== build mode
  function ghostTile() {
    const d = D.BUILDINGS[G.build.type];
    const [w, h] = G.build.rot % 2 ? [d.h, d.w] : [d.w, d.h];
    return [Math.round(G.mouse.wx / T - w / 2), Math.round(G.mouse.wy / T - h / 2), w, h];
  }
  function ghostOk(tx, ty, w, h) {
    const z = G.zone, A = z.buildArea;
    if (!A || tx < A[0] || ty < A[1] || tx + w > A[2] || ty + h > A[3]) return false;
    for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++) { const c = z.tiles[y * z.w + x]; if (c !== '.' && c !== ',' && c !== 'd') return false; }
    const rect = [tx * T + 1, ty * T + 1, (tx + w) * T - 1, (ty + h) * T - 1];
    for (const o of z.objs.values()) {
      if (o.col && !(o.node && o.dead) && o.col[0] < rect[2] && o.col[2] > rect[0] && o.col[1] < rect[3] && o.col[3] > rect[1]) return false;
      if (o.kind === 'exit' && o.x - o.w / 2 - 64 < rect[2] && o.x + o.w / 2 + 64 > rect[0] && o.y - o.h / 2 < rect[3] && o.y + o.h / 2 > rect[1]) return false;
    }
    return true;
  }
  function placeBuilding() {
    if (!G.build.type) return;
    const [tx, ty, w, h] = ghostTile();
    if (!ghostOk(tx, ty, w, h)) { UI.toast('You can\'t place that there.', 'err'); return; }
    G.send({ t: 'build', type: G.build.type, tx, ty, rot: G.build.rot });
    const d = D.BUILDINGS[G.build.type];
    const after = (G.me.home.counts[G.build.type] || 0) + 1;
    if (after >= d.max || d.max === 1) G.build.type = null;
    setTimeout(() => UI.refresh('build'), 150);
  }

  // ================================================================== update loop
  let lastSend = 0, lastSent = '';
  function sendMove(force) {
    const L = G.local, now = performance.now();
    if (!force && now - lastSend < 50) return;
    const key = Math.round(L.x) + ',' + Math.round(L.y) + ',' + L.anim + ',' + Math.round(G.mouse.wx / 8) + ',' + Math.round(G.mouse.wy / 8);
    if (!force && key === lastSent && now - lastSend < 300) return;
    lastSend = now; lastSent = key;
    G.send({ t: 'mv', x: Math.round(L.x), y: Math.round(L.y), f: +L.facing.toFixed(2), a: L.anim, ax: Math.round(G.mouse.wx), ay: Math.round(G.mouse.wy) });
  }

  function update(dt) {
    const L = G.local, me = G.me, z = G.zone;
    if (!me || !z) return;
    const dead = G.self && (G.self.fl & 1);
    const sleeping = !$('sleep-overlay').classList.contains('hidden');
    // world mouse
    G.mouse.wx = (G.mouse.x - cv.width / 2) / G.zoom + G.cam.x;
    G.mouse.wy = (G.mouse.y - cv.height / 2) / G.zoom + G.cam.y;
    let moving = false;
    if (!dead && !sleeping) {
      const [mx, my] = typing() ? [0, 0] : moveDir();
      const cls = D.CLASSES[me.cls];
      const speed = cls.speed * (1 + (me.stats.speed || 0));
      if (L.dash) {
        moveLocal(L.dash.vx * dt, L.dash.vy * dt);
        L.dash.t -= dt;
        if (L.dash.t <= 0) L.dash = null;
        moving = true;
      } else if (mx || my) {
        moveLocal(mx * speed * dt, my * speed * dt);
        moving = true;
      }
      if (!L.dash) L.facing = Math.atan2(G.mouse.wy - (L.y - 18), G.mouse.wx - L.x);
      if (moving) { L.walkT += dt; if (G.fish) { G.fish = null; } L.stepAcc = (L.stepAcc || 0) + dt; if (L.stepAcc > (L.dash ? 0.03 : 0.22)) { L.stepAcc = 0; R.dust(L.x, L.y, moveDir()[0]); } }
      L.anim = moving ? 1 : 0;
      if (G.mouse.down && !G.build.active && !UI.overUI) useAbility('lmb');
      // exits
      if (performance.now() - G.lastTravel > 1500) for (const o of z.objs.values()) {
        if (o.kind !== 'exit') continue;
        if (Math.abs(L.x - o.x) < o.w / 2 && Math.abs(L.y - o.y) < o.h / 2) { G.lastTravel = performance.now(); G.send({ t: 'travel', to: o.to }); }
      }
    }
    if (L.blinkT > 0) L.blinkT -= dt;
    sendMove(false);
    // interactables & gathering
    const list = dead ? [] : interactables();
    G.interact = list[0] || null;
    const holding = G.keys.e || G.keys.r;
    if (G.interact && G.interact.o.node && holding && !typing() && !moving) {
      const o = G.interact.o;
      if (!G.gather || G.gather.id !== o.id) G.gather = { id: o.id, t: 0, dur: GATHER_DUR[o.kind] || 1 };
      G.gather.t += dt;
      if (G.gather.t >= G.gather.dur) { G.gather.t = 0; G.send({ t: 'hit', id: o.id }); }
    } else G.gather = null;
    // smoothing other entities
    const k = 1 - Math.exp(-dt * 14);
    for (const [id, e] of G.players) {
      if (id === G.myId) { e.x = L.x; e.y = L.y; continue; }
      const moved = Math.hypot(e.tx - e.x, e.ty - e.y);
      e.x += (e.tx - e.x) * k; e.y += (e.ty - e.y) * k;
      if (moved > 1) { e.walkT += dt; e.stepAcc = (e.stepAcc || 0) + dt; if (e.stepAcc > 0.24) { e.stepAcc = 0; R.dust(e.x, e.y, Math.sign(e.tx - e.x)); } }
    }
    for (const e of G.enemies.values()) { e.x += (e.tx - e.x) * k; e.y += (e.ty - e.y) * k; e.z += ((e.tz || 0) - e.z) * Math.min(1, k * 1.5); }
    for (const m of G.minions.values()) { m.x += (m.tx - m.x) * k; m.y += (m.ty - m.y) * k; }
    for (const p of G.pickups) { if (p.rx == null) { p.rx = p[2]; p.ry = p[3]; } p.rx += (p[2] - p.rx) * k; p.ry += (p[3] - p.ry) * k; }
    // camera
    const ck = 1 - Math.exp(-dt * 10);
    G.cam.x += (L.x - G.cam.x) * ck; G.cam.y += (L.y - 20 - G.cam.y) * ck;
    G.shake *= Math.pow(0.002, dt);
    // fog of war
    if (z.kind === 'dungeon' || z.kind === 'mine') {
      const fc = z.fog.getContext('2d');
      fc.globalCompositeOperation = 'destination-out';
      fc.beginPath(); fc.arc(L.x / T, L.y / T, 9, 0, 7); fc.fill();
      fc.globalCompositeOperation = 'source-over';
    }
    // day/night
    const c = G.clock, t = (c.t + (performance.now() - G.clockAt) / 1000) % c.len, f = t / c.len;
    let night = 0;
    if (f > 0.72) night = Math.min(1, (f - 0.72) / 0.08);
    if (f < 0.06) night = 1 - f / 0.06;
    G.night = night;
    pickMusic();
    for (let i = G.floaters.length - 1; i >= 0; i--) { const fl = G.floaters[i]; fl.t += dt; if (fl.t > fl.life) G.floaters.splice(i, 1); }
  }

  // ================================================================== music
  let lastPick = 0;
  function pickMusic() {
    const now = performance.now(), z = G.zone;
    if (!z || now - lastPick < 500) return;
    lastPick = now;
    let tr = 'village';
    if (z.kind === 'dungeon') {
      let fight = false;
      for (const e of G.enemies.values()) if (e.type.startsWith('boss:') && !(e.fl & 64) && Math.hypot(e.x - G.local.x, e.y - G.local.y) < 900) fight = true;
      tr = fight ? 'boss' : 'dungeon';
    } else if (z.kind === 'mine') tr = 'mine';
    else if (z.kind === 'home') tr = G.night > 0.6 ? 'night' : 'home';
    else tr = G.night > 0.6 ? 'night' : 'village';
    Music.setTrack(tr);
  }

  // ================================================================== render
  function questTargets() {
    const me = G.me, z = G.zone; if (!me || !z) return { npcs: new Set(), objs: new Set(), arrow: null };
    const q = D.QUESTS[me.quest.idx];
    const st = q ? q.steps[me.quest.step] : null;
    const res = { npcs: new Set(), objs: new Set(), arrow: null };
    if (!st) return res;
    if ((st.type === 'talk' || st.type === 'deliver') && st.npc) res.npcs.add(st.npc);
    if (st.type === 'buy') res.npcs.add('velvet');
    if (st.type === 'open_map' || st.type === 'clear') res.objs.add('expedition');
    const g = st.guide;
    if (!g || !G.guideOn) return res;
    const L = G.local;
    const find = (pred) => { let best = null, bd = 1e9; for (const o of z.objs.values()) if (pred(o)) { const d = Math.hypot(o.x - L.x, o.y - L.y); if (d < bd) { bd = d; best = o; } } return best; };
    let target = null;
    if (z.kind === g.zone || (g.zone === 'home' && z.kind === 'home' && z.owner === me.name)) {
      if (g.npc) target = find(o => o.kind === 'npc' && o.npc === g.npc && !o.traveler);
      else if (g.obj === 'node') target = find(o => o.node && !o.dead && (st.type !== 'have' || Object.keys(st.items).includes(o.res) && (me.inv[o.res] || 0) < st.items[o.res]));
      else if (g.obj && D.BUILDINGS[g.obj]) target = find(o => o.kind === 'building' && o.type === g.obj);
      else if (g.obj) target = find(o => o.kind === g.obj);
      if (st.type === 'clear' && z.kind === 'dungeon') target = null;
    } else {
      // route to the right zone
      if (z.kind === 'dungeon') target = st.type === 'clear' && z.key === st.dungeon ? null : find(o => o.kind === 'portal');
      else if (z.kind === 'home' || z.kind === 'mine') target = find(o => o.kind === 'exit');
      else if (z.kind === 'village') target = g.zone === 'home' ? find(o => o.kind === 'exit' && o.to === 'home') : g.zone === 'mine' ? find(o => o.kind === 'mine') : g.zone === 'dungeon' ? find(o => o.kind === 'expedition') : null;
    }
    if (st.type === 'clear' && z.kind === 'dungeon' && z.key === st.dungeon) target = null;
    res.arrow = target;
    return res;
  }
  G.questTargets = questTargets;

  function drawPlayer(c, e, isMe, t, labels, id) {
    const cls = D.CLASSES[e.cls]; if (!cls) return;
    const fl = e.fl || 0;
    const x = e.x, y = e.y;
    if (fl & 1) { // knocked out
      R.shadow(c, x, y, 16, 5);
      c.save(); c.globalAlpha = 0.6; R.sprite(c, cls.sprite, x, y + 6, cls.scale, false, { rot: Math.PI / 2 * 0.9, tint: '#5a4a7a', tintA: 0.5 }); c.restore();
      labels.push([e.name + ' (knocked out)', x, y + 16, '#ffb3c0']);
      return;
    }
    const moving = isMe ? G.local.anim : (e.a || 0);
    const wt = isMe ? G.local.walkT : e.walkT;
    const bob = moving ? Math.abs(Math.sin(wt * 11)) * 4 : Math.sin(t * 2.4) * 0.8;
    const sq = moving ? 1 + Math.sin(wt * 22) * 0.03 : 1 + Math.sin(t * 2.4) * 0.015;
    const flip = Math.cos(isMe ? G.local.facing : e.f) < 0;
    let rot = moving ? Math.sin(wt * 11) * 0.06 : 0;
    const rolling = isMe ? (G.local.dash && G.local.dash.roll) : (fl & 4);
    // dodge: a quick lean-forward slide that leaves fading after-images behind
    const host = isMe ? G.local : e, now = performance.now();
    host.trail = (host.trail || []).filter(p => now - p.t < 320);
    if (rolling) {
      const last = host.trail[host.trail.length - 1];
      if (!last || Math.hypot(last.x - x, last.y - y) > 26) host.trail.push({ x, y, t: now });
      const vx = isMe ? G.local.dash.vx : (e.tx - e.x);
      rot = Math.sign(vx || (flip ? -1 : 1)) * 0.2;
    }
    for (const p of host.trail) {
      const k = 1 - (now - p.t) / 320;
      R.sprite(c, cls.sprite, p.x, p.y - 2, cls.scale, flip, { tint: '#9fd8ff', tintA: 0.65, alpha: 0.55 * k, sx: 1.06, sy: 0.95 });
    }
    if (rolling && host.trail.length) { // speed streaks from the oldest after-image to you
      const o = host.trail[0];
      c.save(); c.strokeStyle = 'rgba(200,235,255,0.55)'; c.lineCap = 'round';
      for (const [dy, w] of [[-38, 2], [-24, 3], [-10, 2]]) { c.lineWidth = w; c.beginPath(); c.moveTo(o.x, o.y + dy); c.lineTo(x, y + dy); c.stroke(); }
      c.restore();
    }
    if (fl & 64) rot = t * 18;
    R.shadow(c, x, y, 18, 6);
    if (fl & 32) { c.save(); c.globalAlpha = 0.35 + Math.sin(t * 8) * 0.1; c.fillStyle = '#ff9a3a'; c.beginPath(); c.ellipse(x, y - 4, 26, 10, 0, 0, 7); c.fill(); c.restore(); }
    if (fl & 64) { c.save(); c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 4; c.beginPath(); c.arc(x, y - 24, 46, t * 18, t * 18 + 2.5); c.stroke(); c.beginPath(); c.arc(x, y - 24, 46, t * 18 + 3.14, t * 18 + 5.6); c.stroke(); c.restore(); }
    const alpha = (fl & 2) ? 0.35 : 1;
    const spinning = !!(fl & 64);
    const sh = R.sprites[cls.sprite] ? R.sprites[cls.sprite].height * cls.scale : 56;
    const h = spinning ? (R.sprite(c, cls.sprite, x, y - sh / 2 - 2, cls.scale, flip, { rot, alpha, center: true }), sh)
      : R.sprite(c, cls.sprite, x, y - (rolling ? 0 : bob), cls.scale, flip, rolling ? { sx: 1.08, sy: 0.93, rot, alpha } : { sx: 1 / sq, sy: sq, rot, alpha });
    if (fl & 8) { c.save(); c.globalAlpha = 0.25 + Math.sin(t * 5) * 0.08; c.fillStyle = '#8ab4ff'; c.strokeStyle = '#d4e0ff'; c.lineWidth = 2; c.beginPath(); c.ellipse(x, y - 28, 30, 36, 0, 0, 7); c.fill(); c.globalAlpha = 0.7; c.stroke(); c.restore(); }
    if (fl & 16) labels.push(['Z z z', x + 18, y - 70 + Math.sin(t * 2) * 4, '#c9b6e8']);
    const inParty = !isMe && G.party.some(m => m.id === id);
    labels.push([e.name, x, y + 14, isMe ? '#ffffff' : inParty ? '#8fe08a' : '#bfe6ff']);
    const bub = G.bubbles.get(id);
    if (bub && bub.until > performance.now()) labels.push(['#bubble', x, y - (h || 56) - 14, bub.text]);
    else if (bub) G.bubbles.delete(id);
    if (!isMe && e.hp < e.maxhp) labels.push(['#bar', x, y - (h || 56) - 10, e.hp / e.maxhp, '#8fe08a']);
  }

  function drawEnemy(c, e, t, labels, now) {
    const boss = e.type.startsWith('boss:');
    let def, sprite, scale, tint = null;
    if (boss) { const bd = D.DUNGEONS[e.type.slice(5)].boss; def = D.ENEMIES[bd.base]; sprite = bd.sprite; scale = def.scale * bd.scale * ENEMY_SCALE; tint = bd.tint; }
    else { def = D.ENEMIES[e.type]; if (!def) return; sprite = def.sprite; scale = def.scale * ENEMY_SCALE; }
    const fl = e.fl;
    const x = e.x, y = e.y, z = e.z || 0;
    const hop = def.ai === 'hop' && !(fl & 64) ? Math.abs(Math.sin(t * 6 + x)) * 3 : 0;
    const fly = def.fly ? 10 + Math.sin(t * 4 + x * 0.1) * 4 : 0;
    R.shadow(c, x, y, def.r * (boss ? 1.6 : 1.1) * Math.max(0.5, 1 - z / 120), 6 * (boss ? 1.6 : 1));
    let opts = { sy: 1, sx: 1 };
    if (fl & 8) { const p = 0.5 + Math.sin(t * 30) * 0.5; opts.tint = '#ff3050'; opts.tintA = 0.15 + p * 0.3; opts.sy = 0.94; opts.sx = 1.06; }
    else if (now - e.flash < 110) { opts.tint = '#ffffff'; opts.tintA = 0.8; }
    else if (fl & 2) { opts.tint = '#7ac8ff'; opts.tintA = 0.35; }
    else if (tint) { opts.tint = tint; opts.tintA = 0.22; }
    if (fl & 16) opts.rot = t * 20;
    if (fl & 32) opts.rot = t * 14 * (e.face || 1);
    const born = Math.min(1, (now - e.born) / 250);
    opts.sx *= born; opts.sy *= born;
    const hitK = Math.max(0, 1 - (now - e.flash) / 170);
    let kx = 0;
    if (hitK > 0) { opts.sx *= 1 + 0.18 * hitK; opts.sy *= 1 - 0.14 * hitK; kx = Math.cos(e.hitFrom || 0) * 5 * hitK; }
    if (boss) {
      const enr = e.hp < e.maxhp * 0.5;
      c.save(); c.globalCompositeOperation = 'lighter';
      const ar = def.r * 3.2, g = c.createRadialGradient(x, y, 0, x, y, ar);
      g.addColorStop(0, enr ? `rgba(255,60,60,${0.3 + Math.sin(t * 8) * 0.12})` : 'rgba(255,200,120,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.beginPath(); c.ellipse(x, y, ar, ar * 0.5, 0, 0, 7); c.fill();
      c.strokeStyle = enr ? 'rgba(255,90,90,0.55)' : 'rgba(255,220,150,0.4)'; c.lineWidth = 2; c.setLineDash([10, 12]); c.lineDashOffset = -t * 30;
      c.beginPath(); c.ellipse(x, y, ar * 0.8, ar * 0.4, 0, 0, 7); c.stroke(); c.setLineDash([]);
      c.restore();
      if (Math.random() < 0.35) R.addPart({ k: 'dot', x: x + (Math.random() - 0.5) * def.r * 4, y: y - Math.random() * 20, vx: 0, vy: -60 - Math.random() * 60, col: enr ? '#ff7a6a' : '#ffd890', life: 0.9, size: 2.5, grav: 0, add: true, drag: 1 });
    }
    const yy = y - z - hop - fly;
    const sh = R.sprites[sprite] ? R.sprites[sprite].height * scale : 40;
    let h;
    if ((fl & 16) || (fl & 32)) { opts.center = true; R.sprite(c, sprite, x, yy - sh / 2, scale, e.face < 0, opts); h = sh; }
    else h = R.sprite(c, sprite, x + kx, yy, scale, e.face < 0, opts) || 40;
    if (fl & 4) { for (let i = 0; i < 3; i++) { const a = t * 4 + i * 2.1; c.fillStyle = '#ffe58a'; c.beginPath(); c.arc(x + Math.cos(a) * 14, yy - h - 4 + Math.sin(a) * 4, 3, 0, 7); c.fill(); } }
    if (!boss && e.hp < e.maxhp) labels.push(['#bar', x, yy - h - 8, e.hp / e.maxhp, '#ff6b7d']);
  }

  // enemies that just died: flash white, swell and dissolve upward
  function drawDying(c, now) {
    G.dying = G.dying.filter(d => now - d.t0 < 380);
    for (const d of G.dying) {
      const e = d.e, k = (now - d.t0) / 380;
      const boss = e.type.startsWith('boss:');
      let sprite, scale;
      if (boss) { const bd = D.DUNGEONS[e.type.slice(5)].boss; sprite = bd.sprite; scale = D.ENEMIES[bd.base].scale * bd.scale * ENEMY_SCALE; }
      else { const def = D.ENEMIES[e.type]; if (!def) continue; sprite = def.sprite; scale = def.scale * ENEMY_SCALE; }
      R.sprite(c, sprite, e.x, e.y - (e.z || 0) - k * 18, scale, e.face < 0, { tint: '#ffffff', tintA: 0.85, alpha: 1 - k, sx: 1 + k * 0.35, sy: 1 + k * 0.5 });
    }
  }

  function drawBubble(c, x, y, text) {
    c.font = '600 12px Fredoka, sans-serif';
    const words = text.split(/\s+/), lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (c.measureText(test).width > 170 && line) { lines.push(line); line = w; } else line = test;
    }
    if (line) lines.push(line);
    if (lines.length > 4) { lines.length = 4; lines[3] += '…'; }
    const w = Math.max(30, ...lines.map(l => c.measureText(l).width)) + 16, h = lines.length * 15 + 10;
    const bx = x - w / 2, by = y - h - 8;
    c.fillStyle = 'rgba(255,255,255,0.96)'; c.strokeStyle = '#1d1428'; c.lineWidth = 2;
    c.beginPath(); c.roundRect(bx, by, w, h, 8); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(x - 6, by + h - 1); c.lineTo(x, by + h + 7); c.lineTo(x + 6, by + h - 1); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(x - 6, by + h); c.lineTo(x, by + h + 7); c.lineTo(x + 6, by + h); c.stroke();
    c.fillStyle = '#2a1e3f'; c.textAlign = 'center'; c.textBaseline = 'middle';
    lines.forEach((l, i) => c.fillText(l, x, by + 12 + i * 15));
  }

  function frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - (frame.last || now)) / 1000);
    frame.last = now; G.frames = (G.frames || 0) + 1;
    const t = now / 1000;
    if (cv.width !== innerWidth || cv.height !== innerHeight) { cv.width = innerWidth; cv.height = innerHeight; }
    update(dt);
    const z = G.zone;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#120c1a'; ctx.fillRect(0, 0, cv.width, cv.height);
    if (!z || !G.me) return;
    const Z = G.zoom = Math.max(0.9, Math.min(cv.width / (30 * T), cv.height / (17 * T)));
    const sx = (Math.random() - 0.5) * G.shake, sy = (Math.random() - 0.5) * G.shake;
    const camX = G.cam.x + sx, camY = G.cam.y + sy;
    const vw = cv.width / Z, vh = cv.height / Z;
    const left = camX - vw / 2, top = camY - vh / 2;
    ctx.imageSmoothingEnabled = true;
    ctx.setTransform(Z, 0, 0, Z, -left * Z, -top * Z);
    // ground
    const gx = Math.max(0, left), gy = Math.max(0, top);
    const gw = Math.min(z.ground.width - gx, vw + 2), gh = Math.min(z.ground.height - gy, vh + 2);
    if (gw > 0 && gh > 0) ctx.drawImage(z.ground, gx, gy, gw, gh, gx, gy, gw, gh);
    // water shimmer
    if (z.kind === 'village' || z.kind === 'home') {
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1.5;
      for (let ty = Math.floor(top / T); ty < (top + vh) / T; ty++) for (let tx = Math.floor(left / T); tx < (left + vw) / T; tx++) {
        if (tileAt(tx * T + 1, ty * T + 1) !== '~' || R.hash(tx, ty, 11) > 0.3) continue;
        const ph = Math.sin(t * 1.5 + tx * 0.7 + ty);
        ctx.beginPath(); ctx.moveTo(tx * T + 8 + ph * 4, ty * T + 20); ctx.lineTo(tx * T + 18 + ph * 4, ty * T + 20); ctx.stroke();
      }
    }
    const inView = (x, y, m) => x > left - m && x < left + vw + m && y > top - m && y < top + vh + m;
    // telegraphs
    for (const tg of G.tele) R.drawTele(ctx, tg, t);
    // guide arrow (under entities)
    const qt = questTargets();
    // y-sorted drawables
    const list = [];
    for (const o of z.objs.values()) if (inView(o.x, o.y, 200)) list.push([o.kind === 'building' ? (o.tx + o.w) * T - 4 : o.kind === 'expedition' ? o.y + 14 : o.y, 'o', o]);
    for (const [id, e] of G.players) if (inView(e.x, e.y, 100)) list.push([e.y, 'p', e, id]);
    if (!G.players.has(G.myId) && G.self) list.push([G.local.y, 'p', G.self, G.myId]);
    for (const e of G.enemies.values()) if (inView(e.x, e.y, 150)) list.push([e.y, 'e', e]);
    for (const k of G.pickups) list.push([k.ry, 'k', k]);
    list.sort((a, b) => a[0] - b[0]);
    const labels = [];
    for (const [, kind, o, id] of list) {
      if (kind === 'o') {
        if (o.kind === 'npc') {
          const N = D.NPCS[o.npc];
          R.shadow(ctx, o.x, o.y, 18, 6);
          const flip = G.local.x < o.x;
          const h = R.sprite(ctx, N.sprite, o.x, o.y + Math.sin(t * 2 + o.x) * 1, N.scale, flip) || 60;
          labels.push([o.traveler ? 'Traveler' : N.name, o.x, o.y + 14, '#ffe58a']);
          if (qt.npcs.has(o.npc) && !o.traveler) labels.push(['#mark', o.x, o.y - h - 16]);
          if (o.traveler) labels.push(['#mark', o.x, o.y - h - 16, '?']);
        } else {
          R.drawObject(ctx, o, t, G);
          if (o.kind === 'expedition' && qt.objs.has('expedition')) labels.push(['#mark', o.x, o.y - 76]);
        }
      } else if (kind === 'p') drawPlayer(ctx, id === G.myId ? Object.assign(o, { x: G.local.x, y: G.local.y }) : o, id === G.myId, t, labels, id);
      else if (kind === 'e') drawEnemy(ctx, o, t, labels, now);
      else if (kind === 'k') { const k2 = o.slice(); k2[2] = o.rx; k2[3] = o.ry; R.drawPickup(ctx, k2, t); }
    }
    // minions
    for (const m of G.minions.values()) R.drawOwl(ctx, m.x, m.y, t);
    // projectiles (extrapolated)
    const pdt = (now - G.projAt) / 1000;
    const liveP = new Set();
    for (const p of G.proj) {
      if (p[7] === G.myId && PREDICTED.has(p[5])) continue;
      const q = p.slice(); q[1] = p[1] + p[3] * pdt; q[2] = p[2] + p[4] * pdt;
      liveP.add(p[0]);
      let tr = G.ptrails.get(p[0]); if (!tr) { tr = []; G.ptrails.set(p[0], tr); }
      tr.push([q[1], q[2]]); if (tr.length > 9) tr.shift();
      R.drawTrail(ctx, tr, p[5]); R.drawProj(ctx, q, t);
    }
    for (const id of G.ptrails.keys()) if (!liveP.has(id)) G.ptrails.delete(id);
    updateLocalProj(dt);
    for (const p of G.localProj) { p.trail = p.trail || []; p.trail.push([p.x, p.y]); if (p.trail.length > 9) p.trail.shift(); R.drawTrail(ctx, p.trail, p.kind); R.drawProj(ctx, [0, p.x, p.y, p.vx, p.vy, p.kind, 0], t); }
    drawDying(ctx, now);
    // fishing line
    if (G.fish) {
      const L = G.local, f = G.fish;
      const bob = f.state === 'bite' ? Math.sin(t * 30) * 3 + 3 : Math.sin(t * 3) * 1.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(L.x + 14, L.y - 50); ctx.quadraticCurveTo((L.x + f.bx) / 2, Math.min(L.y, f.by) - 40, f.bx, f.by + bob); ctx.stroke();
      ctx.fillStyle = '#e8506a'; ctx.strokeStyle = '#1d1428'; ctx.beginPath(); ctx.arc(f.bx, f.by + bob, 4, 0, 7); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.ellipse(f.bx, f.by + 4, 8 + (t * 8 % 6), 3, 0, 0, 7); ctx.stroke();
      if (f.state === 'bite') labels.push(['#mark', f.bx, f.by - 22]);
    }
    R.updateDrawParts(ctx, dt);
    // build ghost
    if (G.build.active) {
      G.hoverBuilding = null;
      if (G.build.type) {
        const [tx, ty, w, h] = ghostTile();
        R.drawBuildingGhost(ctx, G.build.type, tx, ty, G.build.rot, ghostOk(tx, ty, w, h), t);
      } else {
        for (const o of z.objs.values()) if (o.kind === 'building' && G.mouse.wx > o.col[0] && G.mouse.wx < o.col[2] && G.mouse.wy > o.col[1] && G.mouse.wy < o.col[3]) G.hoverBuilding = o;
        if (G.hoverBuilding) {
          const o = G.hoverBuilding;
          ctx.strokeStyle = '#f5c542'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.strokeRect(o.tx * T, o.ty * T, o.w * T, o.h * T); ctx.setLineDash([]);
          labels.push([`${D.BUILDINGS[o.type].name}:  [R] Rotate   [X] Remove`, o.x, o.ty * T - 10, '#ffe58a']);
        }
      }
      const A = z.buildArea;
      if (A) { ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.setLineDash([6, 6]); ctx.strokeRect(A[0] * T, A[1] * T, (A[2] - A[0]) * T, (A[3] - A[1]) * T); ctx.setLineDash([]); }
    }
    // lighting
    let dark = 0, tintCol = null;
    if (z.kind === 'dungeon' || z.kind === 'mine') dark = z.dark || 0.7;
    else { dark = G.night * 0.62; tintCol = 'rgba(16,14,48,1)'; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (dark > 0.01) {
      const toS = (x, y) => [(x - left) * Z, (y - top) * Z];
      const lights = [];
      for (const [id, e] of G.players) { const ex = id === G.myId ? G.local.x : e.x, ey = id === G.myId ? G.local.y : e.y; const [a, b] = toS(ex, ey - 24); lights.push([a, b, (z.kind === 'dungeon' ? 260 : 200) * Z, null]); }
      for (const o of z.objs.values()) { const l = R.objLight(o, G); if (l && inView(l[0], l[1], l[2])) { const [a, b] = toS(l[0], l[1]); lights.push([a, b, l[2] * Z, l[3]]); } }
      for (const p of G.proj) { const col = R.projLight(p[5]); if (col) { const [a, b] = toS(p[1] + p[3] * pdt, p[2] + p[4] * pdt); lights.push([a, b, 70 * Z, col]); } }
      for (const m of G.minions.values()) { const [a, b] = toS(m.x, m.y); lights.push([a, b, 70 * Z, [200, 255, 150]]); }
      for (const tg of G.tele) { const [a, b] = toS(tg[2], tg[3]); lights.push([a, b, (tg[4] || 40) * 1.2 * Z, [255, 80, 90]]); }
      R.drawLighting(ctx, cv.width, cv.height, dark, lights, tintCol);
    }
    // red screen edges when you get hit / are low on health
    {
      const hurtK = Math.max(0, 1 - (now - (G.hurtAt || 0)) / 350);
      const lowK = G.me && G.me.maxhp && G.me.hp / G.me.maxhp < 0.3 && !(G.self && G.self.fl & 1) ? 0.35 + Math.sin(t * 6) * 0.15 : 0;
      const vk = Math.max(hurtK * 0.75, lowK);
      if (vk > 0.01) {
        const g = ctx.createRadialGradient(cv.width / 2, cv.height / 2, Math.min(cv.width, cv.height) * 0.35, cv.width / 2, cv.height / 2, Math.max(cv.width, cv.height) * 0.7);
        g.addColorStop(0, 'rgba(200,20,40,0)'); g.addColorStop(1, `rgba(200,20,40,${vk})`);
        ctx.fillStyle = g; ctx.fillRect(0, 0, cv.width, cv.height);
      }
    }
    // overlay in world coordinates (names, bars, markers, floaters)
    ctx.setTransform(Z, 0, 0, Z, -left * Z, -top * Z);
    if (qt.arrow) {
      const L = G.local, a = Math.atan2(qt.arrow.y - L.y, qt.arrow.x - L.x), d = Math.hypot(qt.arrow.x - L.x, qt.arrow.y - L.y);
      if (d > 60) {
        const px = L.x + Math.cos(a) * 40, py = L.y + Math.sin(a) * 26 - 2 + Math.sin(t * 6) * 2;
        ctx.save(); ctx.translate(px, py); ctx.rotate(a);
        ctx.fillStyle = '#f5c542'; ctx.strokeStyle = '#1d1428'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-8, -10); ctx.lineTo(-3, 0); ctx.lineTo(-8, 10); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
    }
    for (const lb of labels) {
      if (lb[0] === '#bar') {
        const [, x, y, f, col] = lb;
        ctx.fillStyle = '#1d1428'; ctx.beginPath(); ctx.roundRect(x - 19, y - 3, 38, 6, 3); ctx.fill();
        ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(x - 18, y - 2, 36 * Math.max(0, f), 4, 2); ctx.fill();
      } else if (lb[0] === '#mark') R.questMark(ctx, lb[1], lb[2], t, lb[3]);
      else if (lb[0] === '#bubble') drawBubble(ctx, lb[1], lb[2], lb[3]);
      else R.label(ctx, lb[0], lb[1], lb[2], 12, lb[3], true);
    }
    // interaction prompt & gather bar
    const L = G.local;
    if (G.interact && !G.build.active && !(G.self && G.self.fl & 1)) {
      const it = G.interact;
      const txt = it.o.node ? `[E] ${it.text.replace('Hold E: ', '')} (hold)` : `[E] ${it.text}`;
      ctx.font = '700 13px Fredoka, sans-serif';
      const w = ctx.measureText(txt).width + 18;
      const py = L.y - 92;
      ctx.fillStyle = 'rgba(42,30,63,0.92)'; ctx.strokeStyle = '#a98fd8'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(L.x - w / 2, py - 11, w, 22, 8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, L.x, py);
    }
    if (G.gather) {
      const f = G.gather.t / G.gather.dur, py = L.y - 72;
      ctx.fillStyle = '#1d1428'; ctx.beginPath(); ctx.roundRect(L.x - 26, py - 5, 52, 10, 5); ctx.fill();
      ctx.fillStyle = '#8fe08a'; ctx.beginPath(); ctx.roundRect(L.x - 24, py - 3, 48 * f, 6, 3); ctx.fill();
    }
    if (G.fish && G.fish.state === 'wait') R.label(ctx, 'Waiting for a bite...', L.x, L.y - 92, 12, '#c9e6ff', true);
    if (G.fish && G.fish.state === 'bite') R.label(ctx, 'Press E!', L.x, L.y - 92, 16, '#ffe58a', true);
    // floaters
    for (const f of G.floaters) {
      const k = f.t / f.life;
      const y = f.y - k * (f.box ? 26 : 34);
      ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      if (f.box) {
        f.dx = f.dx != null ? f.dx : (Math.random() - 0.5) * 30;
        const pop = f.t < 0.16 ? R.easeOutBack(f.t / 0.16) : 1;
        const sc = (f.crit ? 1.55 : 1) * pop;
        const fx = f.x + f.dx * R.easeOut(k);
        ctx.save(); ctx.translate(fx, y); ctx.scale(sc, sc);
        const txt = f.crit ? f.text + '!' : f.text;
        ctx.font = `800 13px Fredoka, sans-serif`;
        const w = ctx.measureText(txt).width + 12;
        if (f.crit) { ctx.shadowColor = '#ffb020'; ctx.shadowBlur = 12; }
        ctx.fillStyle = f.crit ? 'rgba(70,30,10,0.92)' : 'rgba(30,20,40,0.88)'; ctx.strokeStyle = f.crit ? '#ffd23a' : 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(-w / 2, -10, w, 20, 5); ctx.fill(); ctx.shadowBlur = 0; ctx.stroke();
        ctx.fillStyle = f.col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, 0, 1);
        ctx.restore();
      } else if (f.hurt) {
        const pop = f.t < 0.14 ? R.easeOutBack(f.t / 0.14) : 1;
        ctx.save(); ctx.translate(f.x, y); ctx.scale(pop * 1.15, pop * 1.15);
        R.label(ctx, f.text, 0, 0, 15, f.col, true);
        ctx.restore();
      } else {
        if (f.icon && Icons.has(D.ITEMS[f.icon] ? D.ITEMS[f.icon].icon : f.icon)) Icons.drawIcon(ctx, D.ITEMS[f.icon] ? D.ITEMS[f.icon].icon : f.icon, f.x - 8 - ctx.measureText(f.text).width / 2 - 14, y - 9, 18);
        R.label(ctx, f.text, f.x, y, f.hurt ? 15 : 13, f.col, true);
      }
      ctx.globalAlpha = 1;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    UI.drawMinimap(qt.arrow);
    UI.tick();
    G.frameMs = performance.now() - now;
  }
  function loop() { frame(); requestAnimationFrame(loop); }
  // keep simulating if the browser stops sending animation frames (hidden/background tab)
  setInterval(() => { if (performance.now() - (frame.last || 0) > 150) frame(); }, 60);

  // ================================================================== boot
  R.load().then(() => { UI.init(); showLogin(); requestAnimationFrame(loop); });
})();
