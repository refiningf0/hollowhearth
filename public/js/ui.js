// HUD + all menus/panels. Nothing here pauses the game (it's multiplayer).
(function () {
  const D = window.GameData;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const UI = window.UI = { overUI: false };
  const G = () => window.Game;
  const ic = (id, s) => `<img src="${Icons.iconURL(id, s || 32)}" alt="">`;
  const itemIcon = (id) => (D.ITEMS[id] ? D.ITEMS[id].icon : id);
  const iname = (id) => (D.ITEMS[id] ? D.ITEMS[id].name : id === 'crumbs' ? 'Crumbs' : id);
  const SLOT_LABEL = { weapon: 'Weapon', helmet: 'Helmet', body: 'Body armor', charm: 'Charm' };
  const STAT_LABEL = { power: 'Power', hp: 'Max HP', def: 'Defense', crit: 'Crit chance', crumbs: 'Crumb find', speed: 'Move speed', hpPct: 'Max HP' };
  const fmtStat = (k, v) => (['crit', 'crumbs', 'speed', 'hpPct'].includes(k) ? `+${Math.round(v * 1000) / 10}%` : `+${v}`);

  // cost chip: [Name, icon, have/need]
  function chip(id, need, have) {
    const miss = have < need;
    return `<span class="cost ${miss ? 'miss' : ''}">${esc(iname(id))} ${ic(id === 'crumbs' ? 'crumbs' : itemIcon(id), 18)} ${have}/${need}</span>`;
  }
  function costChips(cost, crumbs) {
    const me = G().me;
    let h = '';
    for (const k in cost) h += chip(k, cost[k], me.inv[k] || 0);
    if (crumbs) h += chip('crumbs', crumbs, me.crumbs);
    return h;
  }
  function canAfford(cost, crumbs) {
    const me = G().me;
    for (const k in cost) if ((me.inv[k] || 0) < cost[k]) return false;
    return !crumbs || me.crumbs >= crumbs;
  }

  // ================================================================== HUD
  UI.init = function () {
    $('quest').onclick = () => { G().guideOn = !G().guideOn; UI.updateQuest(); UI.toast(G().guideOn ? 'Quest arrow on: follow the yellow arrow at your feet.' : 'Quest arrow hidden.'); };
    $('chat-input').addEventListener('focus', () => { G().keys = {}; });
  };

  let portraitCls = null;
  function drawPortrait(cls) {
    if (portraitCls === cls) return;
    const im = Render.sprites[D.CLASSES[cls].sprite]; if (!im) return;
    portraitCls = cls;
    const c = $('portrait').getContext('2d');
    c.clearRect(0, 0, 104, 104);
    const s = 104 / (im.width * 0.62);
    c.drawImage(im, 0, 0, im.width, im.height * 0.62, (104 - im.width * s) / 2, 6, im.width * s, im.height * 0.62 * s);
  }

  UI.updateMe = function () {
    const g = G(), me = g.me; if (!me) return;
    drawPortrait(me.cls);
    $('pc-name').textContent = me.name;
    $('pc-sub').textContent = `${D.CLASSES[me.cls].name} - ${g.clock.season} ${g.clock.dos}`;
    const res = [['wood', me.inv.wood], ['stone', me.inv.stone], ['wheat', me.inv.wheat], ['berries', me.inv.berries], ['crumbs', me.crumbs]];
    $('resources').innerHTML = res.map(([id, n]) => `<span class="res" title="${iname(id)}">${ic(id, 20)}${n || 0}</span>`).join('');
    $('buffs').innerHTML = (me.buffs || []).map(b => `<span class="buff">${b.name}: ${b.type === 'dmg' ? '+' + Math.round(b.amt * 100) + '% dmg' : b.type === 'def' ? '-' + Math.round(b.amt * 100) + '% dmg taken' : '+' + b.amt + ' HP/s'} <span class="muted">${Math.floor(b.left / 60)}:${String(b.left % 60).padStart(2, '0')}</span></span>`).join('');
    $('btn-build').classList.toggle('hidden', !(g.zone && g.zone.kind === 'home' && g.zone.owner === me.name));
    UI.updateQuest();
    UI.updateAbilityMeta();
    for (const n of Object.keys(wins)) UI.refresh(n);
  };
  UI.updateClock = function () {
    const c = G().clock;
    $('clock').textContent = `${c.season} ${c.dos} · Day ${c.day}`;
    if (G().me) $('pc-sub').textContent = `${D.CLASSES[G().me.cls].name} - ${c.season} ${c.dos}`;
  };
  UI.updateZone = function () {
    const z = G().zone; if (!z) return;
    let t = z.name;
    if (z.kind === 'dungeon') t = `${D.DUNGEONS[z.key].short} - ${G().packs[0]}/${G().packs[1]} packs`;
    $('zone-title').textContent = t;
  };

  function stepText(st, me) {
    if (st.type === 'clear') {
      const d = D.DUNGEONS[st.dungeon];
      const gl = me.stats.gearLvl;
      let s = `${st.text.replace(/\.$/, '')} (recommended gear level ${d.rec}). Use the Expedition Map. Your gear is level ${gl}`;
      s += gl < d.rec ? ': go in under-geared and foes get much tougher. Forge and temper at your Anvil, and cook meals (G to eat) first.' : '.';
      return s;
    }
    return st.text;
  }
  UI.updateQuest = function () {
    const g = G(), me = g.me; if (!me) return;
    const q = D.QUESTS[me.quest.idx];
    const el = $('quest');
    el.classList.toggle('tracking', g.guideOn);
    if (!q) { el.innerHTML = `<div class="qhead">Main story [J]</div><div class="qtext">The Hearth Pie is whole again! Keep farming, forging and exploring dungeons with friends.</div>`; return; }
    const st = q.steps[me.quest.step];
    let prog = '';
    if (st.type === 'have') prog = Object.entries(st.items).map(([k, n]) => `${iname(k)} ${Math.min(n, me.inv[k] || 0)}/${n}`).join(' · ');
    if (st.type === 'catch' || st.type === 'smelt') prog = `${me.quest.prog.n || 0}/${st.n}`;
    el.innerHTML = `<div class="qhead">Main story [J] <span class="muted" style="font-weight:500">· ${esc(q.name)}</span></div><div class="qtext">${esc(stepText(st, me))}</div>${prog ? `<div class="qprog">${prog}</div>` : ''}`;
  };

  // ------------------------------------------------------------------ ability bar
  const SLOTS = [['lmb', 'Left Click'], ['rmb', 'Right Click'], ['q', 'Q'], ['e', 'E'], ['tool', 'R'], ['meal', 'G']];
  UI.buildAbilities = function () {
    const g = G(), me = g.me; if (!me) return;
    const box = $('abilities'); box.innerHTML = '';
    for (const [k, label] of SLOTS) {
      const el = document.createElement('div');
      el.className = 'ab' + (k === 'tool' ? ' gap' : '');
      el.id = 'ab-' + k;
      let icon = 'none', name = '', desc = '';
      if (k === 'tool') { icon = 'tool'; name = 'Tool'; desc = 'Hold R (or E) next to trees, rocks, ore and bushes to gather. With a fishing rod, press R facing water to fish.'; }
      else if (k === 'meal') { name = 'No meal'; desc = 'Press G to eat your selected meal. Pick which meal in your inventory (I). When you run out it switches to the next one.'; }
      else { const id = g.abilityId(k), ab = D.ABILITIES[id]; icon = ab.icon; name = ab.name; desc = `${ab.desc}<br><span class="muted">Cooldown: ${ab.cd}s</span>`; }
      el.innerHTML = `<div class="slot"><span class="ic">${ic(icon, 36)}</span><div class="cd hidden"></div><span class="cnt"></span></div><div class="key">${label}</div><div class="nm">${esc(name)}</div><div class="tip panel"><b>${esc(name)}</b><br>${desc}</div>`;
      box.appendChild(el);
    }
    const b = D.CLASSES[me.cls].builds[me.build];
    $('build-hint').textContent = `[L] change build · ${b.name}`;
    UI.updateAbilityMeta();
  };
  UI.updateAbilityMeta = function () {
    const me = G().me; if (!me) return;
    const ml = $('ab-meal'); if (!ml) return;
    const meal = me.meal && me.inv[me.meal] ? me.meal : null;
    ml.querySelector('.ic').innerHTML = ic(meal ? D.ITEMS[meal].icon : 'none', 36);
    ml.querySelector('.nm').textContent = meal ? D.ITEMS[meal].name : 'No meal';
    ml.querySelector('.cnt').textContent = meal ? me.inv[meal] : '';
    const tl = $('ab-tool');
    if (tl) tl.querySelector('.ic').innerHTML = ic(me.inv.fishing_rod ? 'rod' : 'tool', 36);
  };
  let lastTick = 0;
  UI.tick = function () {
    const g = G(), me = g.me; if (!me) return;
    const now = performance.now();
    if (now - lastTick < 90) return;
    lastTick = now;
    const t = now / 1000;
    for (const k of ['lmb', 'rmb', 'q', 'e']) {
      const el = $('ab-' + k); if (!el) continue;
      const left = (g.cds[k] || 0) - t;
      const cd = el.querySelector('.cd');
      if (left > 0.05) { cd.classList.remove('hidden'); cd.textContent = left.toFixed(1); } else cd.classList.add('hidden');
    }
    const s = g.self;
    const hp = s ? s.hp : me.hp, mx = s ? s.maxhp : me.maxhp;
    $('hp-fill').style.width = Math.max(0, 100 * hp / mx) + '%';
    $('hp-text').textContent = `${Math.max(0, Math.round(hp))} / ${mx}`;
    $('shield-fill').style.width = s && (s.fl & 8) ? '100%' : '0%';
    UI.updateZone();
  };
  UI.updateBoss = function () {
    let boss = null;
    for (const e of G().enemies.values()) if (e.type.startsWith('boss:') && !(e.fl & 64)) boss = e;
    const el = $('boss-bar');
    if (!boss) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.querySelector('.bb-name').textContent = D.DUNGEONS[boss.type.slice(5)].boss.name;
    el.querySelector('.bb-fill').style.width = (100 * boss.hp / boss.maxhp) + '%';
  };

  // ------------------------------------------------------------------ toasts / chat
  UI.toast = function (msg, kind) {
    const box = $('toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = msg;
    box.appendChild(el);
    while (box.children.length > 4) box.removeChild(box.firstChild);
    setTimeout(() => el.remove(), kind === 'err' ? 3500 : 5000);
  };
  UI.big = function (msg, sub) {
    const box = $('big-toast');
    const el = document.createElement('div');
    el.className = 'big';
    el.innerHTML = esc(msg) + (sub ? `<small>${esc(sub)}</small>` : '');
    box.appendChild(el);
    while (box.children.length > 2) box.removeChild(box.firstChild);
    setTimeout(() => el.remove(), 4200);
  };
  let almT = null;
  UI.almanac = function (name, bonus, kills) {
    const el = $('almanac-toast');
    el.innerHTML = `Almanac: ${esc(name)} <span class="gold">(+${bonus})</span>${kills > 1 ? ` <span class="muted">${kills} defeated</span>` : ''}`;
    el.classList.remove('hidden');
    clearTimeout(almT); almT = setTimeout(() => el.classList.add('hidden'), 4500);
  };
  UI.chat = function (from, msg, ch) {
    const log = $('chat-log');
    const el = document.createElement('div');
    const tag = ch === 'party' ? '<span class="ch-party">[Party]</span> ' : ch === 'global' ? '<span class="ch-global">[All]</span> ' : '';
    if (ch === 'party') el.className = 'party-line';
    el.innerHTML = from ? `${tag}<b>${esc(from)}:</b> ${esc(msg)}` : `${tag}<span class="sys">${esc(msg)}</span>`;
    log.appendChild(el);
    while (log.children.length > 9) log.removeChild(log.firstChild);
  };

  // ------------------------------------------------------------------ minimap
  UI.drawMinimap = function (target) {
    const g = G(), z = g.zone; if (!z) return;
    const c = $('minimap').getContext('2d');
    const W = 200, H = 150, s = z.w > 90 ? 2.6 : 2.2;
    c.fillStyle = '#05030a'; c.fillRect(0, 0, W, H);
    const px = g.local.x / D.TILE, py = g.local.y / D.TILE;
    let ox = W / 2 - px * s, oy = H / 2 - py * s;
    ox = Math.min(0, Math.max(W - z.w * s, ox)); oy = Math.min(0, Math.max(H - z.h * s, oy));
    if (z.w * s < W) ox = (W - z.w * s) / 2;
    if (z.h * s < H) oy = (H - z.h * s) / 2;
    c.imageSmoothingEnabled = false;
    c.drawImage(z.mm, ox, oy, z.w * s, z.h * s);
    if (z.kind === 'dungeon' || z.kind === 'mine') c.drawImage(z.fog, ox, oy, z.w * s, z.h * s);
    const dot = (x, y, col, r) => { c.fillStyle = col; c.beginPath(); c.arc(ox + x / D.TILE * s, oy + y / D.TILE * s, r, 0, 7); c.fill(); };
    for (const o of z.objs.values()) {
      if (o.kind === 'npc') dot(o.x, o.y, '#ffe58a', 2.5);
      if (o.kind === 'portal' || o.kind === 'mine' || o.kind === 'expedition') dot(o.x, o.y, '#c78aff', 3);
    }
    if (target) { dot(target.x, target.y, '#f5c542', 4); c.strokeStyle = '#1d1428'; c.lineWidth = 1; c.stroke(); }
    for (const [id, e] of g.players) if (id !== g.myId) dot(e.x, e.y, g.party.some(m => m.id === id) ? '#8fe08a' : '#8ad8ff', 3);
    dot(g.local.x, g.local.y, '#ffffff', 3.5);
  };

  // ================================================================== windows
  const wins = {};
  let zTop = 10;
  function openWin(name, title, render, opts) {
    opts = opts || {};
    let w = wins[name];
    if (!w) {
      const el = document.createElement('div');
      el.className = 'win panel';
      if (opts.width) el.style.width = opts.width + 'px';
      if (opts.left) { el.style.left = opts.left; el.style.transform = 'translate(0,-50%)'; }
      el.innerHTML = `<div class="wh"><div class="wt"></div><button class="x" title="Close (Esc)">×</button></div><div class="wb"></div>`;
      el.querySelector('.x').onclick = () => UI.close(name);
      $('panels').appendChild(el);
      w = wins[name] = { el, render, title };
    }
    w.render = render; w.title = title;
    w.el.style.zIndex = ++zTop;
    draw(name);
    return w;
  }
  function draw(name) {
    const w = wins[name]; if (!w) return;
    const body = w.el.querySelector('.wb');
    if (!body) return;
    const sc = body.scrollTop;
    w.el.querySelector('.wt').innerHTML = typeof w.title === 'function' ? w.title() : w.title;
    w.render(body);
    body.scrollTop = sc;
  }
  UI.refresh = (name) => { if (wins[name]) draw(name); };
  UI.close = (name) => {
    const w = wins[name]; if (!w) return;
    w.el.remove(); delete wins[name];
    if (name === 'build') G().build.active = false, G().build.type = null;
  };
  UI.closeAll = () => { for (const n of Object.keys(wins)) UI.close(n); };
  UI.isOpen = (name) => !!wins[name];
  UI.toggle = (name) => { if (wins[name]) UI.close(name); else UI.open(name); };
  UI.open = (name) => {
    if (name === 'inventory') inventory();
    else if (name === 'journal') journal();
    else if (name === 'almanac') almanac();
    else if (name === 'help') help();
  };
  UI.dialogOpen = () => !!wins.dialog;
  UI.escape = function () {
    const g = G();
    if (g.build.active && g.build.type) { g.build.type = null; UI.refresh('build'); return; }
    const names = Object.keys(wins);
    if (names.length) {
      const top = names.sort((a, b) => wins[b].el.style.zIndex - wins[a].el.style.zIndex)[0];
      UI.close(top); return;
    }
    menu();
  };

  // ------------------------------------------------------------------ inventory
  let invSel = null, giveMode = null;
  function nearbyPlayers() {
    const g = G(), out = [];
    for (const [id, e] of g.players) if (id !== g.myId && Math.hypot(e.x - g.local.x, e.y - g.local.y) < 260) out.push([id, e.name]);
    return out;
  }
  function gearStatsHtml(item, other) {
    const st = D.gearStats(item), os = other ? D.gearStats(other) : {};
    const keys = new Set([...Object.keys(st), ...Object.keys(os)]);
    return [...keys].map(k => {
      const v = st[k] || 0, ov = os[k] || 0, d = Math.round((v - ov) * 1000) / 1000;
      const diff = other && d !== 0 ? ` <span class="${d > 0 ? 'green' : 'red'}">(${d > 0 ? '+' : ''}${['crit', 'crumbs', 'speed', 'hpPct'].includes(k) ? Math.round(d * 1000) / 10 + '%' : d})</span>` : '';
      return `<div class="cmp">${STAT_LABEL[k] || k}: <b>${v ? fmtStat(k, v) : '—'}</b>${diff}</div>`;
    }).join('');
  }
  function inventory() {
    openWin('inventory', () => `Inventory <small>I to close</small>`, (b) => {
      const g = G(), me = g.me;
      const eq = (slot) => me.gear.find(x => x.uid === me.equip[slot]);
      let h = '<div class="inv-wrap"><div><div class="sec">Equipped</div><div class="equip">';
      for (const slot of D.SLOTS) {
        const it = eq(slot);
        h += `<div class="eslot" data-uid="${it ? it.uid : ''}" data-slot="${slot}">${ic(it ? Icons.gearIcon(it, me.cls) : slot, 36)}<div><div class="sl">${SLOT_LABEL[slot]}</div><div class="gn">${it ? esc(it.name) + ` <span class="gold">Lv ${it.lvl}</span>` : '<span class="muted">Empty</span>'}</div></div></div>`;
      }
      const s = me.stats;
      h += `</div><div class="stats"><b>Gear level ${s.gearLvl}</b><br>Max HP: ${me.maxhp}<br>Power: ${s.power}<br>Defense: ${s.def}<br>Crit: ${Math.round(s.crit * 100)}%${s.crumbs ? `<br>Crumb find: +${Math.round(s.crumbs * 100)}%` : ''}${s.speed ? `<br>Move speed: +${Math.round(s.speed * 100)}%` : ''}<br><span class="muted">Renown: ${me.renown}</span></div></div>`;
      h += '<div style="flex:1"><div class="sec">Bag <span class="muted" style="text-transform:none;font-weight:500">· click an item</span></div><div class="grid">';
      const equipped = new Set(Object.values(me.equip));
      for (const it of me.gear) {
        if (equipped.has(it.uid)) continue;
        const cur = eq(it.slot);
        const better = !cur || it.lvl > cur.lvl;
        h += `<div class="cell ${invSel === it.uid ? 'sel' : ''} ${better && it.slot !== 'charm' ? 'up' : ''}" data-uid="${it.uid}" title="${esc(it.name)}">${ic(Icons.gearIcon(it, me.cls), 36)}<span class="lv">${it.lvl}</span></div>`;
      }
      for (const [id, n] of Object.entries(me.inv)) {
        if (!D.ITEMS[id]) continue;
        h += `<div class="cell ${invSel === id ? 'sel' : ''}" data-item="${id}" title="${esc(D.ITEMS[id].name)}">${ic(D.ITEMS[id].icon, 36)}<span class="n">${n}</span></div>`;
      }
      h += '</div><div class="detail" id="inv-detail">';
      // detail
      const gsel = me.gear.find(x => x.uid === invSel);
      if (gsel) {
        const cur = eq(gsel.slot);
        const isEq = equipped.has(gsel.uid);
        h += `<div class="dn">${esc(gsel.name)} <span class="gold">Lv ${gsel.lvl}</span></div><div class="dt">${SLOT_LABEL[gsel.slot]}${isEq ? ' · equipped' : ''}</div>`;
        h += gearStatsHtml(gsel, isEq ? null : cur);
        if (gsel.slot === 'charm') { const c = D.CHARMS[gsel.charm]; h += `<div class="muted" style="margin-top:4px">A charm gives ${c.desc}.</div>`; }
        if (!isEq && cur) h += `<div class="muted" style="margin-top:4px">Compared to your ${esc(cur.name)} (Lv ${cur.lvl}).</div>`;
        h += '<div class="acts">';
        if (!isEq) h += `<button class="btn green" data-act="equip">Equip</button>`;
        else if (gsel.slot !== 'weapon') h += `<button class="btn" data-act="unequip">Unequip</button>`;
        if (!isEq) h += `<button class="btn" data-act="give">Give to player</button><button class="btn" data-act="drop">Drop</button><button class="btn" data-act="salvage">Salvage (+${8 * gsel.lvl} Crumbs)</button>`;
        h += '</div>';
      } else if (invSel && me.inv[invSel]) {
        const it = D.ITEMS[invSel];
        h += `<div class="dn">${ic(it.icon, 22)} ${esc(it.name)} <span class="muted">x${me.inv[invSel]}</span></div><div class="dt">${it.meal ? 'Meal' : it.seed ? 'Seeds' : it.story ? 'Story item' : it.tool ? 'Tool' : 'Material'}</div><div>${esc(it.desc)}</div><div class="acts">`;
        if (it.meal) h += me.meal === invSel ? `<span class="green">Selected for G</span>` : `<button class="btn green" data-act="selmeal">Use this meal for G</button>`;
        if (!it.story && !it.tool) h += `<button class="btn" data-act="give">Give to player</button><button class="btn" data-act="drop1">Drop 1</button><button class="btn" data-act="dropall">Drop all</button>`;
        h += '</div>';
      } else h += '<span class="muted">Select an item to see what it does. Gear marked ▲ is better than what you have on.</span>';
      if (giveMode) {
        const np = nearbyPlayers();
        h += `<div class="sec">Give to...</div>` + (np.length ? np.map(([id, n]) => `<button class="btn small" data-give="${id}">${esc(n)}</button> `).join('') : '<span class="muted">No players nearby. Stand next to a friend.</span>');
      }
      h += '</div></div></div>';
      b.innerHTML = h;
      b.querySelectorAll('[data-uid]').forEach(el => el.onclick = () => { if (el.dataset.uid) { invSel = el.dataset.uid; giveMode = null; draw('inventory'); } });
      b.querySelectorAll('[data-item]').forEach(el => el.onclick = () => { invSel = el.dataset.item; giveMode = null; draw('inventory'); });
      b.querySelectorAll('[data-act]').forEach(el => el.onclick = () => {
        const a = el.dataset.act;
        const isGear = !!me.gear.find(x => x.uid === invSel);
        if (a === 'equip') G().send({ t: 'equip', uid: invSel });
        if (a === 'unequip') G().send({ t: 'unequip', slot: me.gear.find(x => x.uid === invSel).slot });
        if (a === 'salvage') UI.confirm('Salvage this item for Crumbs? It will be destroyed.', () => { G().send({ t: 'salvage', uid: invSel }); invSel = null; });
        if (a === 'selmeal') G().send({ t: 'selmeal', item: invSel });
        if (a === 'give') { giveMode = true; draw('inventory'); }
        if (a === 'drop') { G().send({ t: 'drop', uid: invSel }); invSel = null; }
        if (a === 'drop1') G().send({ t: 'drop', item: invSel, n: 1 });
        if (a === 'dropall') G().send({ t: 'drop', item: invSel, n: me.inv[invSel] });
        if (!isGear && a.startsWith('drop') && a === 'dropall') invSel = null;
      });
      b.querySelectorAll('[data-give]').forEach(el => el.onclick = () => {
        const isGear = !!me.gear.find(x => x.uid === invSel);
        if (isGear) { G().send({ t: 'give', to: el.dataset.give, uid: invSel }); invSel = null; }
        else UI.prompt(`How many ${iname(invSel)} to give?`, me.inv[invSel], (n) => G().send({ t: 'give', to: el.dataset.give, item: invSel, n }));
        giveMode = null;
      });
    }, { width: 760 });
  }

  // ------------------------------------------------------------------ journal / almanac / help / menu
  function journal() {
    openWin('journal', 'Journal', (b) => {
      const me = G().me;
      let h = '<div class="muted" style="margin-bottom:8px">Click the quest box (top right) to toggle the yellow guide arrow at your feet.</div>';
      D.QUESTS.forEach((q, i) => {
        if (i > me.quest.idx) return;
        const done = i < me.quest.idx;
        h += `<div class="journal-q ${done ? 'done' : ''}"><div class="jn">${done ? '✔ ' : '► '}${esc(q.name)}</div>`;
        q.steps.forEach((st, j) => {
          if (done) return;
          if (j < me.quest.step) h += `<div class="js ok">${esc(st.text)}</div>`;
          else if (j === me.quest.step) h += `<div class="js cur">• ${esc(stepText(st, me))}</div>`;
        });
        h += '</div>';
      });
      if (me.quest.idx < D.QUESTS.length - 1) h += `<div class="journal-q"><div class="jn muted">??? More adventures await</div></div>`;
      b.innerHTML = h;
    }, { width: 560 });
  }
  function almanac() {
    openWin('almanac', () => `Almanac <small>creatures you've defeated</small>`, (b) => {
      const me = G().me;
      let h = '<div class="alm">';
      for (const [id, e] of Object.entries(D.ENEMIES)) {
        const a = me.almanac[id];
        h += `<div class="ae ${a ? '' : 'unk'}"><img src="sprites/${e.sprite}.png"><b>${a ? esc(e.name) : '???'}</b><span class="muted">${a ? esc(e.blurb) : 'Not yet discovered'}</span>${a ? `<div class="gold">${a.kills} defeated</div>` : ''}</div>`;
      }
      b.innerHTML = h + '</div><div class="muted" style="margin-top:8px">First defeat: +15 Crumbs · 10 defeats: +30 · 50 defeats: +80</div>';
    });
  }
  function help() {
    openWin('help', 'Controls', (b) => {
      b.innerHTML = `<div class="keys">
        <b>WASD / Arrows</b><span>Move</span>
        <b>Mouse</b><span>Aim</span>
        <b>Left Click (hold)</b><span>Basic attack</span>
        <b>Right Click</b><span>Dodge / movement skill</span>
        <b>Q, E</b><span>Class abilities</span>
        <b>E</b><span>Talk / interact (when a prompt shows)</span>
        <b>R (hold)</b><span>Tool: gather from trees, rocks, ore, bushes · fish at water</span>
        <b>G</b><span>Eat your selected meal</span>
        <b>L</b><span>Swap between your class's two builds</span>
        <b>I</b><span>Inventory &amp; gear</span>
        <b>J</b><span>Journal (quests)</span>
        <b>K</b><span>Almanac</span>
        <b>P</b><span>Players &amp; party (invite friends)</span>
        <b>B</b><span>Build menu (on your homestead) · R rotates · X removes</span>
        <b>M</b><span>Mute / unmute music</span>
        <b>Enter</b><span>Chat (shows as a bubble over your head) · /p party · /g everyone</span>
        <b>Esc</b><span>Close the top menu (or open the game menu)</span>
      </div><div class="muted" style="margin-top:10px">Play with friends: they open the same address in their browser (the server window lists it). Everyone shares the village, dungeons can be joined from the Expedition Map, and you can visit each other's homesteads from the village signpost.</div>`;
    }, { width: 560 });
  }
  function menu() {
    openWin('menu', 'Menu', (b) => {
      b.innerHTML = `<div class="rows"><button class="btn big" id="m-resume">Resume</button><div class="row" style="justify-content:space-between"><span>Music volume</span><input type="range" id="m-vol" min="0" max="1" step="0.05" value="${Music.volume}"><button class="btn small" id="m-mute">${Music.muted ? 'Unmute' : 'Mute'}</button></div><button class="btn" id="m-help">Controls</button><button class="btn" id="m-out">Save &amp; log out</button></div><div class="muted" style="margin-top:8px;text-align:center">The game autosaves every 20 seconds and keeps running while menus are open.</div>`;
      b.querySelector('#m-resume').onclick = () => UI.close('menu');
      b.querySelector('#m-vol').oninput = (e) => Music.setVolume(+e.target.value);
      b.querySelector('#m-mute').onclick = () => { Music.toggleMute(); draw('menu'); };
      b.querySelector('#m-help').onclick = () => { UI.close('menu'); help(); };
      b.querySelector('#m-out').onclick = () => { G().ws.close(); location.reload(); };
    }, { width: 320 });
  }
  UI.confirm = function (msg, yes) {
    openWin('confirm', 'Are you sure?', (b) => {
      b.innerHTML = `<div style="margin-bottom:12px">${esc(msg)}</div><div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn green" id="c-yes">Yes</button><button class="btn" id="c-no">No</button></div>`;
      b.querySelector('#c-yes').onclick = () => { UI.close('confirm'); yes(); };
      b.querySelector('#c-no').onclick = () => UI.close('confirm');
    }, { width: 380 });
  };
  UI.prompt = function (msg, max, cb) {
    openWin('prompt', esc(msg), (b) => {
      b.innerHTML = `<input class="num" id="p-n" type="number" min="1" max="${max}" value="${max}"> <button class="btn green" id="p-ok">OK</button>`;
      const inp = b.querySelector('#p-n'); inp.focus(); inp.select();
      const go = () => { const n = Math.max(1, Math.min(max, inp.value | 0)); UI.close('prompt'); cb(n); };
      b.querySelector('#p-ok').onclick = go;
      inp.onkeydown = (e) => { if (e.key === 'Enter') go(); e.stopPropagation(); };
    }, { width: 340 });
  };

  // ------------------------------------------------------------------ dialog
  UI.dialog = function (m) {
    UI.close('dialog');
    const el = document.createElement('div');
    el.className = 'dlg panel';
    const N = D.NPCS[m.npc];
    el.innerHTML = `<div class="por"><img src="sprites/${N ? N.sprite : 'stitch'}.png"></div><div style="flex:1"><div class="dn">${esc(m.name)}</div><div class="dtitle">${esc(m.title || '')}</div><div class="dtext">${esc(m.text)}</div><div class="dopts"></div></div>`;
    const opts = el.querySelector('.dopts');
    for (const o of m.options) {
      const btn = document.createElement('button');
      btn.className = 'btn' + (o.id !== 'bye' ? ' green' : '');
      btn.textContent = o.label;
      btn.onclick = () => { UI.close('dialog'); G().send({ t: 'dopt', id: o.id }); };
      opts.appendChild(btn);
    }
    $('panels').appendChild(el);
    el.style.zIndex = ++zTop;
    wins.dialog = { el, render: () => { }, title: '', opts: m.options };
    if (m.ending) setTimeout(() => UI.big('The End... for now!', 'Thank you for playing. Your adventure continues: keep farming, forging and exploring with friends.'), 600);
  };
  UI.dialogAdvance = function () {
    const w = wins.dialog; if (!w) return;
    if (w.opts.length === 1) { UI.close('dialog'); G().send({ t: 'dopt', id: w.opts[0].id }); }
  };

  // ------------------------------------------------------------------ shop
  UI.shop = function (m) {
    UI.close('dialog');
    openWin('shop', () => `${esc(m.name)} <small>Crumbs: ${G().me.crumbs}</small>`, (b) => {
      const me = G().me;
      let h = '<div class="sec">Buy</div><div class="rows">';
      m.sells.forEach((s, i) => {
        const stack = !s.key.includes(':') && s.key !== 'fishing_rod';
        h += `<div class="row">${ic(s.icon, 38).replace('<img', '<img class="ic"')}<div class="rm"><div class="rn">${esc(s.name)}</div><div class="rd">${esc(s.desc)}</div></div><div class="ra">${chip('crumbs', s.price, me.crumbs)}<button class="btn small green" data-buy="${i}" data-n="1">Buy</button>${stack ? `<button class="btn small" data-buy="${i}" data-n="5">x5</button>` : ''}</div></div>`;
      });
      h += '</div>';
      if (m.buys.length) {
        h += '<div class="sec">Sell</div><div class="rows">';
        for (const s of m.buys) {
          const have = me.inv[s.item] || 0;
          h += `<div class="row ${have ? '' : 'locked'}">${ic(s.icon, 38).replace('<img', '<img class="ic"')}<div class="rm"><div class="rn">${esc(s.name)}</div><div class="rd">You have ${have} · ${s.price} Crumbs each</div></div><div class="ra"><button class="btn small" data-sell="${s.item}" data-n="1" ${have ? '' : 'disabled'}>Sell 1</button><button class="btn small" data-sell="${s.item}" data-n="${have}" ${have ? '' : 'disabled'}>Sell all</button></div></div>`;
        }
        h += '</div>';
      }
      b.innerHTML = h;
      b.querySelectorAll('[data-buy]').forEach(el => el.onclick = () => G().send({ t: 'buy', npc: m.npc, key: m.sells[el.dataset.buy].key, n: +el.dataset.n }));
      b.querySelectorAll('[data-sell]').forEach(el => el.onclick = () => G().send({ t: 'sell', npc: m.npc, item: el.dataset.sell, n: +el.dataset.n }));
    }, { width: 620 });
  };

  // ------------------------------------------------------------------ expedition map
  UI.expedition = function (m) {
    openWin('expedition', 'Expedition Map', (b) => {
      let h = `<div class="muted" style="margin-bottom:8px">Your gear level: <b class="gold">${G().me.stats.gearLvl}</b>. Under-geared? Foes hit much harder. Friends can join your run from here.</div><div class="rows">`;
      for (const d of m.list) {
        const under = G().me.stats.gearLvl < d.rec;
        h += `<div class="row ${d.unlocked ? '' : 'locked'}"><div class="rm"><div class="rn">${esc(d.name)} ${d.cleared ? '<span class="green">✔ cleared</span>' : ''}</div><div class="rd">${esc(d.blurb)}</div><div class="rd">Recommended gear level: <b class="${under ? 'red' : 'green'}">${d.rec}</b>${d.unlocked ? '' : ` · <span class="red">${esc(d.lockText)}</span>`}</div>`;
        for (const r of d.runs) h += `<div style="margin-top:4px"><button class="btn small green" data-join="${r.id}" data-key="${d.key}">${r.party ? '★ Join your party' : 'Join ' + esc(r.names.join(', '))}'s run (${r.packs} packs)</button></div>`;
        h += `</div><div class="ra">${d.unlocked ? `<button class="btn" data-go="${d.key}">${d.runs.length ? 'New run' : 'Enter'}</button>` : '🔒'}</div></div>`;
      }
      b.innerHTML = h + '</div>';
      b.querySelectorAll('[data-go]').forEach(el => el.onclick = () => { UI.close('expedition'); G().send({ t: 'enter_dungeon', key: el.dataset.go }); });
      b.querySelectorAll('[data-join]').forEach(el => el.onclick = () => { UI.close('expedition'); G().send({ t: 'enter_dungeon', key: el.dataset.key, join: el.dataset.join }); });
    }, { width: 620 });
  };
  UI.homes = function (list) {
    openWin('homes', 'Visit a homestead', (b) => {
      b.innerHTML = `<div class="rows"><button class="btn green" data-o="">My homestead</button>${list.map(n => `<button class="btn" data-o="${esc(n)}">${esc(n)}'s homestead</button>`).join('')}</div><div class="muted" style="margin-top:8px">${list.length ? 'You can visit friends who are online.' : 'No other players online right now.'}</div>`;
      b.querySelectorAll('[data-o]').forEach(el => el.onclick = () => { UI.close('homes'); G().send({ t: 'travel', to: 'home', owner: el.dataset.o || null }); });
    }, { width: 340 });
  };

  // ------------------------------------------------------------------ build menu
  UI.setBuild = function (on) {
    const g = G();
    g.build.active = on; g.build.type = null; g.build.rot = 0;
    if (on) buildMenu(); else UI.close('build');
  };
  function buildMenu() {
    openWin('build', () => `Build <small>Renown ${G().me.renown}</small>`, (b) => {
      const g = G(), me = g.me;
      let h = `<div class="muted" style="margin-bottom:8px">Pick something, then click to place it. <b>R</b> rotates. Right click cancels. Hover a building with nothing picked: <b>R</b> rotate, <b>X</b> remove.</div><div class="rows">`;
      for (const [id, d] of Object.entries(D.BUILDINGS)) {
        const n = me.home.counts[id] || 0;
        const needs = d.needs && !me.home.counts[d.needs];
        const full = n >= d.max;
        const ok = !needs && !full && canAfford(d.cost);
        h += `<div class="row ${needs || full ? 'locked' : ''}" style="${g.build.type === id ? 'border-color:#f5c542' : ''}"><div class="rm"><div class="rn">${d.name} <span class="muted" style="font-size:12px">${n}/${d.max} · +${d.renown} renown</span></div><div class="rd">${esc(d.desc)}${needs ? ` <span class="red">Build a ${D.BUILDINGS[d.needs].name} first.</span>` : ''}</div><div>${costChips(d.cost)}</div></div><div class="ra"><button class="btn small ${ok ? 'green' : ''}" data-b="${id}" ${needs || full ? 'disabled' : ''}>${g.build.type === id ? 'Placing...' : 'Place'}</button></div></div>`;
      }
      b.innerHTML = h + '</div>';
      b.querySelectorAll('[data-b]').forEach(el => el.onclick = () => {
        const d = D.BUILDINGS[el.dataset.b];
        if (!canAfford(d.cost)) {
          const miss = Object.entries(d.cost).filter(([k, n]) => (me.inv[k] || 0) < n).map(([k, n]) => `${iname(k)} (${me.inv[k] || 0}/${n})`);
          UI.toast('Not enough ' + miss.join(', '), 'err'); return;
        }
        g.build.type = el.dataset.b; g.build.rot = 0; draw('build');
      });
    }, { width: 400, left: '16px' });
  }

  // ------------------------------------------------------------------ party
  UI.updateParty = function () {
    const g = G(), el = $('party-frame');
    const others = g.party.filter(m => m.id !== g.myId);
    if (!others.length) { el.classList.add('hidden'); el.innerHTML = ''; return; }
    el.classList.remove('hidden');
    const myZone = g.zone ? g.zone.id : '';
    el.innerHTML = `<div class="pf-head">Party <span class="muted">(P)</span></div>` + others.map(m => {
      const pct = m.maxhp ? Math.max(0, 100 * m.hp / m.maxhp) : 0;
      const canJoin = m.dungeon && m.zoneId !== myZone;
      return `<div class="pf-m">
        <div class="pf-top"><span class="pf-n">${m.leader ? '★ ' : ''}${esc(m.name)}</span><span class="pf-z">${esc(m.zone)}</span></div>
        <div class="pf-hp"><div style="width:${pct}%;${m.dead ? 'background:#6a5a7a' : ''}"></div></div>
        ${canJoin ? `<button class="btn small green" data-pjoin="${m.zoneId}" data-key="${m.key}">Join their run</button>` : ''}
      </div>`;
    }).join('');
    el.querySelectorAll('[data-pjoin]').forEach(b => b.onclick = () => g.send({ t: 'enter_dungeon', key: b.dataset.key, join: b.dataset.pjoin }));
  };
  UI.partyInvite = function (from) {
    openWin('pinvite', 'Party invite', (b) => {
      b.innerHTML = `<div style="margin-bottom:12px"><b>${esc(from)}</b> invited you to their party. Party members can run expeditions together and see each other's health.</div><div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn green" id="pi-yes">Join party</button><button class="btn" id="pi-no">Decline</button></div>`;
      b.querySelector('#pi-yes').onclick = () => { UI.close('pinvite'); G().send({ t: 'party_accept' }); };
      b.querySelector('#pi-no').onclick = () => { UI.close('pinvite'); G().send({ t: 'party_decline' }); };
    }, { width: 400 });
  };
  UI.partyRun = function (m) {
    openWin('prun', 'Expedition!', (b) => {
      b.innerHTML = `<div style="margin-bottom:12px"><b>${esc(m.from)}</b> started <b>${esc(m.name)}</b>. Join them?</div><div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn green" id="pr-yes">Join run</button><button class="btn" id="pr-no">Not now</button></div>`;
      b.querySelector('#pr-yes').onclick = () => { UI.close('prun'); G().send({ t: 'enter_dungeon', key: m.key, join: m.zoneId }); };
      b.querySelector('#pr-no').onclick = () => UI.close('prun');
    }, { width: 400 });
  };
  UI.players = function (list) {
    openWin('players', 'Players &amp; Party', (b) => {
      const g = G();
      const inParty = g.party.length > 0;
      const amLeader = g.party.some(m => m.id === g.myId && m.leader);
      let h = '';
      if (inParty) {
        h += '<div class="sec">Your party</div><div class="rows">';
        for (const m of g.party) {
          const me = m.id === g.myId;
          h += `<div class="row"><div class="rm"><div class="rn">${m.leader ? '★ ' : ''}${esc(m.name)}${me ? ' <span class="muted">(you)</span>' : ''}</div><div class="rd">${esc(D.CLASSES[m.cls].name)} · ${esc(m.zone)}</div></div><div class="ra">`;
          if (!me && m.dungeon && m.zoneId !== (g.zone && g.zone.id)) h += `<button class="btn small green" data-pjoin="${m.zoneId}" data-key="${m.key}">Join run</button>`;
          if (!me && amLeader) h += `<button class="btn small" data-kick="${m.id}">Kick</button>`;
          h += '</div></div>';
        }
        h += `</div><div style="margin-top:8px"><button class="btn small" id="pl-leave">Leave party</button></div>`;
      }
      h += '<div class="sec">Online</div><div class="rows">';
      const others = list.filter(o => o.id !== g.myId);
      if (!others.length) h += '<div class="muted">Nobody else is online right now. Share your link!</div>';
      for (const o of others) {
        h += `<div class="row"><div class="rm"><div class="rn">${esc(o.name)}</div><div class="rd">${esc(D.CLASSES[o.cls].name)} · ${esc(o.zone)}${o.mine ? ' · <span class="green">in your party</span>' : o.inParty ? ' · in a party' : ''}</div></div><div class="ra">${!o.mine && !o.inParty ? `<button class="btn small green" data-inv="${o.id}">Invite to party</button>` : ''}</div></div>`;
      }
      h += '</div><div class="muted" style="margin-top:8px">Party members get a prompt to join whenever one of you starts an expedition. Chat: type normally for nearby players, <b>/p</b> for party, <b>/g</b> for everyone.</div>';
      b.innerHTML = h;
      b.querySelectorAll('[data-inv]').forEach(x => x.onclick = () => { g.send({ t: 'party_invite', id: x.dataset.inv }); x.disabled = true; x.textContent = 'Invited'; });
      b.querySelectorAll('[data-kick]').forEach(x => x.onclick = () => { g.send({ t: 'party_kick', id: x.dataset.kick }); setTimeout(() => g.send({ t: 'who' }), 200); });
      b.querySelectorAll('[data-pjoin]').forEach(x => x.onclick = () => { UI.close('players'); g.send({ t: 'enter_dungeon', key: x.dataset.key, join: x.dataset.pjoin }); });
      const lv = b.querySelector('#pl-leave'); if (lv) lv.onclick = () => { g.send({ t: 'party_leave' }); setTimeout(() => g.send({ t: 'who' }), 200); };
    }, { width: 520 });
  };

  // ------------------------------------------------------------------ stations
  UI.station = function (ui, id) {
    if (ui === 'sleep') UI.confirm('Sleep until morning? (Everyone in the village and homesteads needs to be asleep for the night to pass.)', () => { G().send({ t: 'sleep' }); $('sleep-overlay').classList.remove('hidden'); $('sleep-text').textContent = 'Sleeping...'; });
    else if (ui === 'stove') stove(id);
    else if (ui === 'anvil') anvil();
    else if (ui === 'smelter') smelter();
    else if (ui === 'plant') plant(id);
  };
  function stove(id) {
    openWin('stove', () => `Kitchen Stove <small>Level ${G().me.home.stove} · Renown ${G().me.renown}</small>`, (b) => {
      const me = G().me;
      const lvl = me.home.stove;
      let h = '<div class="sec">Recipes</div><div class="rows">';
      const showPie = me.quest.idx >= D.QUESTS.findIndex(q => q.id === 'q_pie') || (me.inv.crust_piece || 0) >= 5;
      for (const [rid, rc] of Object.entries(D.RECIPES)) {
        const it = D.ITEMS[rid];
        if (rc.story && !showPie) continue;
        const known = rc.story || me.known.includes(rid);
        if (!known) { h += `<div class="row locked">${ic('none', 38).replace('<img', '<img class="ic"')}<div class="rm"><div class="rn">???</div><div class="rd">Unlocks at ${rc.renown} renown (you have ${me.renown}). Build and decorate your homestead to earn renown.</div></div></div>`; continue; }
        const stoveOk = lvl >= rc.stove;
        const ok = stoveOk && canAfford(rc.in);
        h += `<div class="row ${stoveOk ? '' : 'locked'}">${ic(it.icon, 38).replace('<img', '<img class="ic"')}<div class="rm"><div class="rn">${esc(it.name)} <span class="muted" style="font-size:12px">have ${me.inv[rid] || 0}</span></div><div class="rd">${esc(it.desc)}${stoveOk ? '' : ' <span class="red">Needs a Level 2 stove.</span>'}</div><div>${costChips(rc.in)}</div></div><div class="ra"><button class="btn small ${ok ? 'green' : ''}" data-cook="${rid}" data-n="1" ${stoveOk ? '' : 'disabled'}>Cook</button>${rc.story ? '' : `<button class="btn small" data-cook="${rid}" data-n="5" ${stoveOk ? '' : 'disabled'}>x5</button>`}</div></div>`;
      }
      h += '</div>';
      const up = D.BUILDINGS.stove.upgrade;
      if (lvl < 2) h += `<div class="sec">Upgrade to Level 2</div><div class="row"><div class="rm"><div class="rd">Unlocks advanced recipes (they use Coal as fuel).</div><div>${costChips(up.cost)}</div></div><div class="ra"><button class="btn small ${canAfford(up.cost) ? 'green' : ''}" id="st-up">Upgrade</button></div></div>`;
      b.innerHTML = h;
      b.querySelectorAll('[data-cook]').forEach(el => el.onclick = () => G().send({ t: 'cook', recipe: el.dataset.cook, n: +el.dataset.n }));
      const ub = b.querySelector('#st-up'); if (ub) ub.onclick = () => G().send({ t: 'upgrade', id });
    }, { width: 600 });
  }
  function anvil() {
    let tab = wins.anvil ? wins.anvil.tab : 'forge';
    openWin('anvil', 'Anvil', (b) => {
      const me = G().me;
      tab = wins.anvil.tab || tab;
      let h = `<div class="tabs"><button class="btn small ${tab === 'forge' ? 'on' : ''}" data-tab="forge">Forge new gear</button><button class="btn small ${tab === 'temper' ? 'on' : ''}" data-tab="temper">Temper (upgrade)</button></div>`;
      if (tab === 'forge') {
        h += '<div class="rows">';
        for (const tid of D.FORGE_TIERS) {
          const tr = D.TIERS[tid];
          h += `<div class="row"><div class="rm"><div class="rn">${tr.name} gear <span class="gold">Lv ${tr.lvl}</span></div><div>${costChips(tr.cost, tr.crumbs)}</div><div class="rd">`;
          h += ['weapon', 'helmet', 'body'].map(s => `${tr.name} ${D.GEAR_NAMES[me.cls][s]}: ${Object.entries(D.gearStats({ slot: s, lvl: tr.lvl })).map(([k, v]) => `${fmtStat(k, v)} ${STAT_LABEL[k]}`).join(', ')}`).join('<br>');
          h += `</div></div><div class="ra" style="flex-direction:column">${['weapon', 'helmet', 'body'].map(s => `<button class="btn small ${canAfford(tr.cost, tr.crumbs) ? 'green' : ''}" data-forge="${tid}" data-slot="${s}">Forge ${SLOT_LABEL[s].split(' ')[0]}</button>`).join('')}</div></div>`;
        }
        h += '</div><div class="muted" style="margin-top:8px">Forged gear goes to your bag. Press I and click it to equip!</div>';
      } else {
        const eq = new Set(Object.values(me.equip));
        const items = me.gear.slice().sort((a, c) => (eq.has(c.uid) ? 1 : 0) - (eq.has(a.uid) ? 1 : 0));
        h += '<div class="rows">';
        for (const it of items) {
          const max = D.temperMax(it);
          const c = D.temperCost(it);
          const next = Object.assign({}, it, { lvl: it.lvl + 1 });
          const cur = D.gearStats(it), nx = D.gearStats(next);
          const preview = Object.keys(nx).map(k => `${STAT_LABEL[k]} ${fmtStat(k, cur[k] || 0)} → <b class="green">${fmtStat(k, nx[k])}</b>`).join(', ');
          h += `<div class="row">${ic(Icons.gearIcon(it, me.cls), 38).replace('<img', '<img class="ic"')}<div class="rm"><div class="rn">${esc(it.name)} <span class="gold">Lv ${it.lvl}</span>${eq.has(it.uid) ? ' <span class="green" style="font-size:12px">equipped</span>' : ''}</div>`;
          if (it.lvl >= max) h += `<div class="rd">Tempered to its limit (Lv ${max}). Forge a higher tier for more.</div></div></div>`;
          else h += `<div class="rd">Lv ${it.lvl} → ${it.lvl + 1}: ${preview}</div><div>${costChips({ [c.mat]: c.matN }, c.crumbs)}</div></div><div class="ra"><button class="btn small ${canAfford({ [c.mat]: c.matN }, c.crumbs) ? 'green' : ''}" data-temper="${it.uid}">Temper</button></div></div>`;
        }
        h += '</div>';
      }
      b.innerHTML = h;
      b.querySelectorAll('[data-tab]').forEach(el => el.onclick = () => { wins.anvil.tab = el.dataset.tab; draw('anvil'); });
      b.querySelectorAll('[data-forge]').forEach(el => el.onclick = () => G().send({ t: 'forge', tier: el.dataset.forge, slot: el.dataset.slot }));
      b.querySelectorAll('[data-temper]').forEach(el => el.onclick = () => G().send({ t: 'temper', uid: el.dataset.temper }));
    }, { width: 660 });
    wins.anvil.tab = tab;
  }
  function smelter() {
    openWin('smelter', 'Smelter', (b) => {
      const me = G().me;
      let h = '<div class="rows">';
      for (const [bar, rc] of Object.entries(D.SMELT)) {
        const it = D.ITEMS[bar];
        h += `<div class="row">${ic(it.icon, 38).replace('<img', '<img class="ic"')}<div class="rm"><div class="rn">${it.name} <span class="muted" style="font-size:12px">have ${me.inv[bar] || 0}</span></div><div>${costChips(rc.in)}</div></div><div class="ra"><button class="btn small ${canAfford(rc.in) ? 'green' : ''}" data-s="${bar}" data-n="1">Smelt</button><button class="btn small" data-s="${bar}" data-n="5">x5</button></div></div>`;
      }
      b.innerHTML = h + '</div><div class="muted" style="margin-top:8px">Ore comes from the Hollow Mine (cave in the north-west of the village).</div>';
      b.querySelectorAll('[data-s]').forEach(el => el.onclick = () => G().send({ t: 'smelt', item: el.dataset.s, n: +el.dataset.n }));
    }, { width: 480 });
  }
  function plant(id) {
    openWin('plant', 'Plant seeds', (b) => {
      const me = G().me;
      const seeds = Object.keys(me.inv).filter(k => D.ITEMS[k] && D.ITEMS[k].seed);
      if (!seeds.length) { b.innerHTML = '<div>You have no seeds. Buy some from <b>Madame Velvet</b> at the village market (west of the square).</div>'; return; }
      b.innerHTML = '<div class="rows">' + seeds.map(s => `<div class="row">${ic(D.ITEMS[s].icon, 38).replace('<img', '<img class="ic"')}<div class="rm"><div class="rn">${D.ITEMS[s].name} <span class="muted">x${me.inv[s]}</span></div><div class="rd">${esc(D.ITEMS[s].desc)}</div></div><div class="ra"><button class="btn small green" data-p="${s}">Plant</button></div></div>`).join('') + '</div>';
      b.querySelectorAll('[data-p]').forEach(el => el.onclick = () => { G().send({ t: 'plant', id, seed: el.dataset.p }); UI.close('plant'); });
    }, { width: 460 });
  }
})();
