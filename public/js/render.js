// Rendering: sprites, ground prerender, world objects, entities, effects, lighting, minimap.
(function () {
  const D = window.GameData, T = D.TILE;
  const OUT = '#1d1428';
  const R = {};

  // ------------------------------------------------------------ sprites
  const SPRITES = ['frog', 'bee', 'squirrel', 'hare', 'mushroom', 'quillbird', 'crab', 'jelly', 'wretch', 'siren', 'soldier', 'cogbot', 'jester', 'glimmerbug', 'pillbug', 'mage', 'ranger', 'brawler', 'velvet', 'stitch', 'grinny', 'candlewick', 'sugarplum'];
  const SPR = {};
  R.sprites = SPR;
  R.load = () => Promise.all(SPRITES.map(n => new Promise(res => { const im = new Image(); im.onload = () => { SPR[n] = im; res(); }; im.onerror = res; im.src = 'sprites/' + n + '.png'; })));
  const tintCache = {};
  function tinted(name, color, alpha) {
    const k = name + color + alpha;
    if (tintCache[k]) return tintCache[k];
    const im = SPR[name]; if (!im) return null;
    const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height;
    const c = cv.getContext('2d');
    c.drawImage(im, 0, 0);
    c.globalCompositeOperation = 'source-atop'; c.globalAlpha = alpha; c.fillStyle = color; c.fillRect(0, 0, cv.width, cv.height);
    return (tintCache[k] = cv);
  }
  R.tinted = tinted;
  function hash(x, y, s) { let h = (x * 374761393 + y * 668265263 + (s || 0) * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  R.hash = hash;

  // ------------------------------------------------------------ palettes
  const SEASON_PAL = {
    Spring: { grass: '#7cbf5a', grass2: '#74b453', blade: '#97d672', dark: '#5f9c45', flowers: ['#ffb3d1', '#fff4a3', '#ffffff', '#c9a6ff'], canopy: ['#5aa04a', '#6cb455', '#4a8f3f'], blossom: '#ffc2dd' },
    Summer: { grass: '#6db34a', grass2: '#64a944', blade: '#86cc5e', dark: '#4f8d39', flowers: ['#ffe066', '#ff9a6a', '#ffffff'], canopy: ['#3f8f3a', '#4fa046', '#337a30'], blossom: null },
    Autumn: { grass: '#a8b25a', grass2: '#9da653', blade: '#c3c46e', dark: '#868e45', flowers: ['#ff9a3a', '#d9562a', '#ffd166'], canopy: ['#e0812f', '#c8562a', '#e8a53a'], blossom: null },
    Winter: { grass: '#e3ecf2', grass2: '#d8e3eb', blade: '#f6fafc', dark: '#bccbd6', flowers: ['#a6c8ff', '#ffffff'], canopy: ['#d6e4ee', '#ebf2f7', '#c0d3df'], blossom: null },
  };
  R.pal = (season) => SEASON_PAL[season] || SEASON_PAL.Spring;

  // ------------------------------------------------------------ ground prerender
  R.buildGround = function (zone, season) {
    const W = zone.w, H = zone.h;
    const cv = document.createElement('canvas');
    cv.width = W * T; cv.height = H * T;
    const c = cv.getContext('2d');
    const P = R.pal(season);
    const th = zone.theme ? D.THEMES[zone.theme] : null;
    const tile = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 'x' : zone.tiles[y * W + x];
    const isFloor = (ch) => ch === 'f' || ch === 'g';
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const ch = tile(x, y), px = x * T, py = y * T, h = hash(x, y);
      switch (ch) {
        case '.': case ',': case 'T': {
          c.fillStyle = h < 0.5 ? P.grass : P.grass2; c.fillRect(px, py, T, T);
          if (ch === 'T') { c.fillStyle = P.dark; c.fillRect(px, py, T, T); break; }
          c.strokeStyle = P.blade; c.lineWidth = 1.5;
          for (let i = 0; i < 3; i++) { const bx = px + hash(x, y, i) * 28 + 2, by = py + hash(x, y, i + 9) * 26 + 4; c.beginPath(); c.moveTo(bx - 2, by - 3); c.lineTo(bx, by); c.lineTo(bx + 2, by - 3); c.stroke(); }
          if (ch === ',') for (let i = 0; i < 3; i++) { c.fillStyle = P.flowers[Math.floor(hash(x, y, i + 3) * P.flowers.length)]; c.beginPath(); c.arc(px + 4 + hash(x, y, i + 5) * 24, py + 4 + hash(x, y, i + 7) * 24, 2.2, 0, 7); c.fill(); }
          break;
        }
        case 'd': {
          c.fillStyle = h < 0.5 ? '#c49d68' : '#bd9662'; c.fillRect(px, py, T, T);
          c.fillStyle = '#a8814f';
          for (let i = 0; i < 2; i++) { c.beginPath(); c.arc(px + hash(x, y, i) * 30 + 1, py + hash(x, y, i + 4) * 30 + 1, 1.6, 0, 7); c.fill(); }
          break;
        }
        case 'p': {
          c.fillStyle = '#9c93a8'; c.fillRect(px, py, T, T);
          const off = (y % 2) * 8;
          for (let i = -1; i < 2; i++) { c.fillStyle = hash(x * 3 + i, y) < 0.5 ? '#bdb4c9' : '#b3aac0'; c.beginPath(); c.roundRect(px + off + i * 16 + 1, py + 1, 14, 14, 3); c.fill(); c.beginPath(); c.roundRect(px + ((off + 8) % 16) + i * 16 + 1, py + 17, 14, 14, 3); c.fill(); }
          break;
        }
        case 's': { c.fillStyle = h < 0.5 ? '#e8d6a4' : '#e2cf9b'; c.fillRect(px, py, T, T); c.fillStyle = '#cdb780'; for (let i = 0; i < 3; i++) c.fillRect(px + hash(x, y, i) * 30, py + hash(x, y, i + 3) * 30, 2, 2); break; }
        case '~': case 'k': {
          const shore = ['~', 'k'].includes(tile(x, y - 1)) && ['~', 'k'].includes(tile(x - 1, y)) && ['~', 'k'].includes(tile(x + 1, y)) && ['~', 'k'].includes(tile(x, y + 1));
          c.fillStyle = shore ? '#4d8ed6' : '#6aa8e6'; c.fillRect(px, py, T, T);
          if (h < 0.25) { c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(px + 6, py + 16); c.quadraticCurveTo(px + 12, py + 12, px + 18, py + 16); c.stroke(); }
          if (ch === 'k') {
            c.fillStyle = '#a0683a'; c.fillRect(px, py, T, T);
            c.strokeStyle = '#6e4224'; c.lineWidth = 1.5;
            for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(px, py + i * 8 + 0.5); c.lineTo(px + T, py + i * 8 + 0.5); c.stroke(); }
            c.fillStyle = '#6e4224'; c.fillRect(px + 3, py + 3, 2, 2); c.fillRect(px + 27, py + 19, 2, 2);
          }
          break;
        }
        case 'R': {
          const below = tile(x, y + 1);
          const mine = zone.kind === 'mine';
          c.fillStyle = mine ? (h < 0.5 ? '#4a3f4f' : '#463b4b') : (h < 0.5 ? '#8d8196' : '#867a8f'); c.fillRect(px, py, T, T);
          if (below !== 'R' && below !== 'x') {
            c.fillStyle = mine ? '#352c3a' : '#62566b'; c.fillRect(px, py + 10, T, 22);
            c.strokeStyle = mine ? '#261f2b' : '#4a4052'; c.lineWidth = 1.5;
            c.beginPath(); c.moveTo(px + 8, py + 12); c.lineTo(px + 11, py + 22); c.moveTo(px + 22, py + 14); c.lineTo(px + 19, py + 28); c.stroke();
            c.fillStyle = mine ? '#5d5263' : '#a497ad'; c.fillRect(px, py + 8, T, 3);
          }
          break;
        }
        case 'c': {
          c.fillStyle = h < 0.5 ? '#6e625b' : '#685c55'; c.fillRect(px, py, T, T);
          c.fillStyle = '#5a4f49';
          for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(px + hash(x, y, i) * 30 + 1, py + hash(x, y, i + 4) * 30 + 1, 1.5 + hash(x, y, i + 8) * 1.5, 0, 7); c.fill(); }
          break;
        }
        case 'f': case 'g': {
          c.fillStyle = th.grout; c.fillRect(px, py, T, T);
          for (let r = 0; r < 4; r++) {
            const off = ((y * 4 + r) % 2) * 8;
            for (let i = -1; i < 2; i++) {
              const bx = px + off + i * 16, by = py + r * 8;
              c.fillStyle = hash(x * 5 + i, y * 4 + r) < 0.5 ? th.floor : th.floor2;
              c.fillRect(Math.max(px, bx + 1), by + 1, Math.min(px + T, bx + 15) - Math.max(px, bx + 1), 6);
            }
          }
          if (ch === 'g') {
            c.fillStyle = th.patch; c.globalAlpha = 0.92; c.fillRect(px, py, T, T); c.globalAlpha = 1;
            c.fillStyle = th.patch2;
            for (let i = 0; i < 3; i++) { const gx = px + hash(x, y, i) * 26 + 3, gy = py + hash(x, y, i + 3) * 26 + 3; c.save(); c.translate(gx, gy); c.rotate(hash(x, y, i + 6) * 3); c.beginPath(); c.ellipse(0, 0, 3.5, 1.4, 0, 0, 7); c.fill(); c.restore(); }
          }
          // shadow under walls
          if (tile(x, y - 1) === '#') { const g = c.createLinearGradient(0, py, 0, py + 12); g.addColorStop(0, 'rgba(0,0,0,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(px, py, T, 12); }
          break;
        }
        case '#': {
          const below = tile(x, y + 1);
          if (isFloor(below)) {
            c.fillStyle = th.wallTop; c.fillRect(px, py, T, T);
            c.strokeStyle = th.wall; c.lineWidth = 1.5;
            for (let r = 0; r < 3; r++) { const yy = py + 6 + r * 9; c.beginPath(); c.moveTo(px, yy); c.lineTo(px + T, yy); c.stroke(); const off = (r % 2) * 10; c.beginPath(); c.moveTo(px + off + 6, yy); c.lineTo(px + off + 6, yy + 9); c.moveTo(px + off + 22, yy); c.lineTo(px + off + 22, yy + 9); c.stroke(); }
            c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(px, py, T, 4);
          } else { c.fillStyle = th.wall; c.fillRect(px, py, T, T); }
          break;
        }
        default: c.fillStyle = '#000'; c.fillRect(px, py, T, T);
      }
    }
    // grass fringe on path edges
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const ch = tile(x, y);
      if (!'dps'.includes(ch)) continue;
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const n = tile(x + dx, y + dy);
        if (n !== '.' && n !== ',') continue;
        c.fillStyle = P.grass;
        for (let i = 0; i < 4; i++) {
          const t = (i + 0.5) / 4 * T;
          const bx = x * T + (dx === 0 ? t : dx < 0 ? 0 : T), by = y * T + (dy === 0 ? t : dy < 0 ? 0 : T);
          c.beginPath(); c.arc(bx, by, 4 + hash(x, y, i + dx * 3 + dy * 7) * 3, 0, 7); c.fill();
        }
      }
    }
    // forest canopy
    const can = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (tile(x, y) === 'T' && hash(x, y, 2) < 0.55) can.push([x * T + 16 + (hash(x, y, 3) - 0.5) * 16, y * T + 16 + (hash(x, y, 4) - 0.5) * 16, 20 + hash(x, y, 5) * 10, Math.floor(hash(x, y, 6) * 3)]);
    can.sort((a, b) => a[1] - b[1]);
    for (const [cx, cy, r] of can) { c.fillStyle = 'rgba(0,0,0,0.18)'; c.beginPath(); c.ellipse(cx + 4, cy + 8, r, r * 0.8, 0, 0, 7); c.fill(); }
    for (const [cx, cy, r, v] of can) {
      c.fillStyle = P.canopy[v]; c.strokeStyle = OUT; c.lineWidth = 2;
      c.beginPath(); c.arc(cx, cy, r, 0, 7); c.fill(); c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.13)'; c.beginPath(); c.arc(cx - r * 0.3, cy - r * 0.35, r * 0.45, 0, 7); c.fill();
    }
    return cv;
  };

  // ------------------------------------------------------------ minimap base
  const MM = { '.': '#6db34a', ',': '#6db34a', T: '#2f5a2a', d: '#c49d68', p: '#b3aac0', s: '#e2cf9b', '~': '#4d8ed6', k: '#a0683a', R: '#5c5164', c: '#7a6c64', '#': null, f: null, g: null, x: '#000' };
  R.buildMinimap = function (zone) {
    const cv = document.createElement('canvas'); cv.width = zone.w; cv.height = zone.h;
    const c = cv.getContext('2d'); const img = c.createImageData(zone.w, zone.h);
    const th = zone.theme ? D.THEMES[zone.theme] : null;
    for (let i = 0; i < zone.tiles.length; i++) {
      const ch = zone.tiles[i];
      let col = MM[ch];
      if (ch === 'f') col = '#e8915a'; else if (ch === 'g') col = '#e07a3a'; else if (ch === '#') col = null;
      if (zone.kind === 'mine' && ch === 'R') col = null;
      if (!col) continue;
      if (th && (ch === 'f' || ch === 'g')) col = ch === 'f' ? '#e8a06a' : '#e8863a';
      const n = parseInt(col.slice(1), 16);
      img.data[i * 4] = n >> 16; img.data[i * 4 + 1] = (n >> 8) & 255; img.data[i * 4 + 2] = n & 255; img.data[i * 4 + 3] = 255;
    }
    // dungeon wall edges in blue like the original
    if (zone.kind === 'dungeon') for (let y = 1; y < zone.h - 1; y++) for (let x = 1; x < zone.w - 1; x++) {
      const i = y * zone.w + x;
      if (zone.tiles[i] !== '#') continue;
      const nb = [i - 1, i + 1, i - zone.w, i + zone.w].some(j => zone.tiles[j] === 'f' || zone.tiles[j] === 'g');
      if (nb) { img.data[i * 4] = 52; img.data[i * 4 + 1] = 100; img.data[i * 4 + 2] = 170; img.data[i * 4 + 3] = 255; }
    }
    c.putImageData(img, 0, 0);
    return cv;
  };

  // ------------------------------------------------------------ helpers
  function shadow(c, x, y, rx, ry, a) { c.fillStyle = `rgba(20,10,30,${a || 0.28})`; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, 7); c.fill(); }
  R.shadow = shadow;
  function label(c, text, x, y, size, col, bold) {
    c.font = `${bold ? 700 : 600} ${size}px Fredoka, "Trebuchet MS", sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 3; c.strokeStyle = 'rgba(20,10,30,0.85)'; c.lineJoin = 'round';
    c.strokeText(text, x, y); c.fillStyle = col || '#fff'; c.fillText(text, x, y);
  }
  R.label = label;
  function sprite(c, name, x, y, scale, flip, opts) {
    opts = opts || {};
    let im = SPR[name];
    if (!im) return;
    if (opts.tint) im = tinted(name, opts.tint, opts.tintA || 0.5) || im;
    const w = im.width * scale, h = im.height * scale;
    c.save(); c.translate(x, y);
    if (opts.rot) c.rotate(opts.rot);
    c.scale((flip ? -1 : 1) * (opts.sx || 1), opts.sy || 1);
    if (opts.alpha != null) c.globalAlpha = opts.alpha;
    c.drawImage(im, -w / 2, opts.center ? -h / 2 : -h, w, h);
    c.restore();
    return h;
  }
  R.sprite = sprite;

  // ------------------------------------------------------------ world objects
  function tree(c, x, y, P, v, dead, t) {
    if (dead) { shadow(c, x, y + 2, 12, 5); c.fillStyle = '#8a5a2e'; c.strokeStyle = OUT; c.lineWidth = 2; c.beginPath(); c.roundRect(x - 9, y - 9, 18, 11, 3); c.fill(); c.stroke(); c.fillStyle = '#d9b07a'; c.beginPath(); c.ellipse(x, y - 9, 9, 3.5, 0, 0, 7); c.fill(); c.stroke(); return; }
    shadow(c, x, y + 2, 26, 9);
    c.fillStyle = '#8a5a2e'; c.strokeStyle = OUT; c.lineWidth = 2;
    c.beginPath(); c.roundRect(x - 6, y - 26, 12, 28, 3); c.fill(); c.stroke();
    const sway = Math.sin(t * 1.3 + x * 0.05) * 1.5;
    const col = P.canopy[v % 3];
    const blobs = [[0, -50, 24], [-17, -38, 17], [17, -38, 17], [0, -32, 18]];
    for (const [dx, dy, r] of blobs) { c.fillStyle = col; c.beginPath(); c.arc(x + dx + sway, y + dy, r, 0, 7); c.fill(); c.stroke(); }
    for (const [dx, dy, r] of blobs) { c.fillStyle = col; c.beginPath(); c.arc(x + dx + sway, y + dy, r - 2, 0, 7); c.fill(); }
    c.fillStyle = 'rgba(255,255,255,0.15)'; c.beginPath(); c.arc(x - 8 + sway, y - 58, 9, 0, 7); c.fill();
    if (P.blossom) { c.fillStyle = P.blossom; for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(x + sway + (hash(x | 0, i) - 0.5) * 40, y - 30 - hash(i, y | 0) * 34, 2.5, 0, 7); c.fill(); } }
  }
  function rock(c, x, y, speck, dead, mine) {
    if (dead) { c.fillStyle = mine ? '#4f4555' : '#8d8799'; for (const [dx, dy] of [[-8, -2], [6, 0], [0, 3]]) { c.beginPath(); c.arc(x + dx, y + dy, 3.5, 0, 7); c.fill(); } return; }
    shadow(c, x, y + 3, 18, 6);
    c.fillStyle = mine ? '#7a7084' : '#a39db0'; c.strokeStyle = OUT; c.lineWidth = 2;
    c.beginPath(); c.moveTo(x - 17, y + 2); c.lineTo(x - 13, y - 13); c.lineTo(x - 3, y - 20); c.lineTo(x + 10, y - 17); c.lineTo(x + 17, y - 5); c.lineTo(x + 15, y + 3); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.22)'; c.beginPath(); c.moveTo(x - 11, y - 11); c.lineTo(x - 3, y - 17); c.lineTo(x + 6, y - 14); c.lineTo(x - 4, y - 8); c.fill();
    if (speck) { c.fillStyle = speck; for (const [dx, dy, r] of [[-6, -6, 3], [5, -9, 2.6], [8, -2, 2.2], [-1, -1, 2], [-10, -2, 1.8]]) { c.beginPath(); c.arc(x + dx, y + dy, r, 0, 7); c.fill(); } }
  }
  function bush(c, x, y, picked, P) {
    shadow(c, x, y + 2, 18, 6);
    c.fillStyle = P.canopy[1]; c.strokeStyle = OUT; c.lineWidth = 2;
    for (const [dx, dy, r] of [[-8, -9, 10], [8, -9, 10], [0, -15, 11]]) { c.beginPath(); c.arc(x + dx, y + dy, r, 0, 7); c.fill(); c.stroke(); }
    for (const [dx, dy, r] of [[-8, -9, 8], [8, -9, 8], [0, -15, 9]]) { c.beginPath(); c.arc(x + dx, y + dy, r, 0, 7); c.fill(); }
    if (!picked) { c.fillStyle = '#d93a5a'; for (const [dx, dy] of [[-9, -10], [6, -14], [1, -6], [10, -6], [-3, -19]]) { c.beginPath(); c.arc(x + dx, y + dy, 2.8, 0, 7); c.fill(); c.lineWidth = 1; c.stroke(); } }
  }
  function house(c, x, y, roof, night) {
    shadow(c, x, y + 26, 60, 10);
    c.strokeStyle = OUT; c.lineWidth = 2.5;
    c.fillStyle = '#efe0c8'; c.beginPath(); c.roundRect(x - 48, y - 30, 96, 58, 4); c.fill(); c.stroke();
    c.fillStyle = '#d9c4a4'; c.fillRect(x - 46, y + 14, 92, 12);
    c.fillStyle = roof; c.beginPath(); c.moveTo(x - 60, y - 26); c.lineTo(x - 36, y - 70); c.lineTo(x + 36, y - 70); c.lineTo(x + 60, y - 26); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(0,0,0,0.18)'; c.lineWidth = 2; for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(x - 60 + i * 6, y - 26 - i * 11); c.lineTo(x + 60 - i * 6, y - 26 - i * 11); c.stroke(); }
    c.strokeStyle = OUT; c.lineWidth = 2.5;
    c.fillStyle = '#8a5a2e'; c.beginPath(); c.roundRect(x - 10, y - 4, 20, 32, [8, 8, 0, 0]); c.fill(); c.stroke();
    c.fillStyle = night ? '#ffd27a' : '#9ad0ff';
    for (const dx of [-32, 22]) { c.beginPath(); c.roundRect(x + dx, y - 16, 12, 12, 2); c.fill(); c.stroke(); }
  }
  function stall(c, x, y, color, t) {
    shadow(c, x, y + 14, 44, 8);
    c.strokeStyle = OUT; c.lineWidth = 2;
    c.fillStyle = '#a0683a'; c.fillRect(x - 38, y - 44, 5, 56); c.strokeRect(x - 38, y - 44, 5, 56); c.fillRect(x + 33, y - 44, 5, 56); c.strokeRect(x + 33, y - 44, 5, 56);
    c.fillStyle = '#c8935a'; c.beginPath(); c.roundRect(x - 42, y - 2, 84, 16, 3); c.fill(); c.stroke();
    for (let i = 0; i < 6; i++) { c.fillStyle = i % 2 ? '#fff4e6' : color; c.beginPath(); c.moveTo(x - 46 + i * 15.3, y - 46); c.lineTo(x - 46 + (i + 1) * 15.3, y - 46); c.lineTo(x - 46 + (i + 1) * 15.3, y - 34); c.arc(x - 46 + (i + 0.5) * 15.3, y - 34, 7.65, 0, Math.PI); c.closePath(); c.fill(); }
    c.beginPath(); c.rect(x - 46, y - 52, 92, 6); c.fillStyle = color; c.fill(); c.stroke();
  }
  function fire(c, x, y, t, s) {
    s = s || 1;
    for (let i = 0; i < 3; i++) {
      const f = Math.sin(t * 9 + i * 2) * 2 * s;
      c.fillStyle = ['#ff7a2a', '#ffb23a', '#fff09a'][i];
      const h = (22 - i * 6) * s + f, w = (10 - i * 2.5) * s;
      c.beginPath(); c.moveTo(x - w, y); c.quadraticCurveTo(x - w, y - h * 0.6, x + f * 0.3, y - h); c.quadraticCurveTo(x + w, y - h * 0.6, x + w, y); c.closePath(); c.fill();
    }
  }
  R.fire = fire;
  function questMark(c, x, y, t, ch) {
    const b = Math.sin(t * 4) * 3;
    c.fillStyle = '#f5c542'; c.strokeStyle = OUT; c.lineWidth = 3;
    c.font = '900 26px Fredoka, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.strokeText(ch || '!', x, y + b); c.fillText(ch || '!', x, y + b);
  }
  R.questMark = questMark;

  function building(c, o, t, night) {
    const x0 = o.tx * T, y0 = o.ty * T, w = o.w * T, h = o.h * T, cx = x0 + w / 2;
    c.strokeStyle = OUT; c.lineWidth = 2;
    switch (o.type) {
      case 'cottage': {
        shadow(c, cx, y0 + h, w / 2 + 6, 10);
        const wallTop = y0 + h * 0.25;
        c.fillStyle = '#f2e3c9'; c.beginPath(); c.roundRect(x0 + 6, wallTop, w - 12, h - (wallTop - y0) - 2, 4); c.fill(); c.stroke();
        c.fillStyle = '#d9c4a4'; c.fillRect(x0 + 8, y0 + h - 14, w - 16, 10);
        // roof
        c.fillStyle = '#b8546b'; c.beginPath(); c.moveTo(x0 - 4, wallTop + 6); c.lineTo(x0 + w * 0.25, y0 - h * 0.45); c.lineTo(x0 + w * 0.75, y0 - h * 0.45); c.lineTo(x0 + w + 4, wallTop + 6); c.closePath(); c.fill(); c.stroke();
        c.fillStyle = '#9a4258'; c.fillRect(x0 + w * 0.68, y0 - h * 0.55, 12, 20); c.strokeRect(x0 + w * 0.68, y0 - h * 0.55, 12, 20);
        for (let i = 0; i < 3; i++) { const k = (t * 0.4 + i / 3) % 1; c.fillStyle = `rgba(230,230,240,${0.5 * (1 - k)})`; c.beginPath(); c.arc(x0 + w * 0.68 + 6 + Math.sin(k * 6) * 4, y0 - h * 0.6 - k * 30, 4 + k * 6, 0, 7); c.fill(); }
        const door = o.rot === 1 ? x0 + w - 26 : o.rot === 3 ? x0 + 12 : cx - 9;
        c.fillStyle = '#8a5a2e'; c.beginPath(); c.roundRect(door, y0 + h - 34, 18, 32, [8, 8, 0, 0]); c.fill(); c.stroke();
        c.fillStyle = night ? '#ffd27a' : '#9ad0ff';
        const wins = o.rot === 1 ? [x0 + 14, cx - 6] : o.rot === 3 ? [cx - 6, x0 + w - 28] : [x0 + 16, x0 + w - 30];
        for (const wx of wins) { c.beginPath(); c.roundRect(wx, wallTop + 12, 14, 14, 2); c.fill(); c.stroke(); }
        break;
      }
      case 'stove': {
        shadow(c, cx, y0 + h, w / 2, 8);
        c.fillStyle = o.lvl >= 2 ? '#b8643a' : '#a65a4a'; c.beginPath(); c.roundRect(x0 + 4, y0 + 6, w - 8, h - 8, 6); c.fill(); c.stroke();
        c.strokeStyle = 'rgba(0,0,0,0.25)'; for (let r = 1; r < 4; r++) { c.beginPath(); c.moveTo(x0 + 6, y0 + 6 + r * 13); c.lineTo(x0 + w - 6, y0 + 6 + r * 13); c.stroke(); }
        c.strokeStyle = OUT;
        c.fillStyle = '#2b1d22'; c.beginPath(); c.roundRect(cx - 14, y0 + h - 30, 28, 20, [10, 10, 2, 2]); c.fill(); c.stroke();
        fire(c, cx, y0 + h - 11, t, 0.55);
        c.fillStyle = '#6e6a78'; c.fillRect(x0 + w - 20, y0 - 18, 10, 26); c.strokeRect(x0 + w - 20, y0 - 18, 10, 26);
        if (o.lvl >= 2) { c.fillStyle = '#e8a55a'; c.fillRect(x0 + 4, y0 + 6, w - 8, 5); }
        break;
      }
      case 'farmbed': {
        c.fillStyle = '#8a5a2e'; c.beginPath(); c.roundRect(x0 + 3, y0 + 3, w - 6, h - 6, 4); c.fill(); c.stroke();
        c.fillStyle = '#5a3b22'; c.beginPath(); c.roundRect(x0 + 7, y0 + 7, w - 14, h - 14, 3); c.fill();
        c.strokeStyle = '#4a2f1a'; for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(x0 + 9, y0 + 7 + i * (h - 14) / 4); c.lineTo(x0 + w - 9, y0 + 7 + i * (h - 14) / 4); c.stroke(); }
        if (o.crop) {
          const pr = o.crop.ready ? 1 : Math.max(0.15, o.crop.prog);
          for (let i = 0; i < 4; i++) {
            const px = x0 + 16 + (i % 2) * (w - 32), py = y0 + 22 + Math.floor(i / 2) * (h - 32);
            c.strokeStyle = '#3f7a2a'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(px, py); c.lineTo(px, py - 12 * pr); c.stroke();
            c.fillStyle = '#6cb455'; c.beginPath(); c.ellipse(px - 4 * pr, py - 8 * pr, 4 * pr, 2.2 * pr, -0.5, 0, 7); c.fill(); c.beginPath(); c.ellipse(px + 4 * pr, py - 10 * pr, 4 * pr, 2.2 * pr, 0.5, 0, 7); c.fill();
            if (o.crop.ready) {
              c.lineWidth = 1.5; c.strokeStyle = OUT;
              if (o.crop.type === 'berries') { c.fillStyle = '#d93a5a'; for (const [dx, dy] of [[-4, -12], [3, -15], [0, -9]]) { c.beginPath(); c.arc(px + dx, py + dy, 3, 0, 7); c.fill(); c.stroke(); } }
              else if (o.crop.type === 'wheat') { c.fillStyle = '#e8c85a'; c.beginPath(); c.ellipse(px, py - 16, 3.5, 7, 0, 0, 7); c.fill(); c.stroke(); }
              else { c.fillStyle = '#ef8a2c'; c.beginPath(); c.ellipse(px, py - 6, 8, 6.5, 0, 0, 7); c.fill(); c.stroke(); }
            }
          }
          if (o.crop.ready) { c.fillStyle = 'rgba(255,240,150,0.9)'; label(c, 'Ready!', cx, y0 - 6, 11, '#ffe58a', true); }
        }
        break;
      }
      case 'anvil': {
        shadow(c, cx, y0 + h, w / 2, 7);
        c.fillStyle = '#8a5a2e'; c.beginPath(); c.roundRect(cx - 12, y0 + h - 18, 24, 16, 2); c.fill(); c.stroke();
        c.fillStyle = '#5d5a6b'; c.beginPath(); c.moveTo(cx - 26, y0 + h - 30); c.lineTo(cx + 18, y0 + h - 30); c.quadraticCurveTo(cx + 30, y0 + h - 28, cx + 28, y0 + h - 22); c.lineTo(cx + 10, y0 + h - 18); c.lineTo(cx - 10, y0 + h - 18); c.lineTo(cx - 20, y0 + h - 22); c.closePath(); c.fill(); c.stroke();
        c.fillStyle = '#8d8a9b'; c.fillRect(cx - 24, y0 + h - 30, 40, 3);
        break;
      }
      case 'smelter': {
        shadow(c, cx, y0 + h, w / 2, 8);
        c.fillStyle = '#8d8196'; c.beginPath(); c.moveTo(x0 + 6, y0 + h - 2); c.lineTo(x0 + 12, y0 + 4); c.lineTo(x0 + w - 12, y0 + 4); c.lineTo(x0 + w - 6, y0 + h - 2); c.closePath(); c.fill(); c.stroke();
        c.fillStyle = '#ff8a2a'; c.shadowColor = '#ff8a2a'; c.shadowBlur = 12; c.beginPath(); c.roundRect(cx - 10, y0 + h - 24, 20, 16, [8, 8, 0, 0]); c.fill(); c.shadowBlur = 0; c.stroke();
        fire(c, cx, y0 + h - 9, t, 0.4);
        break;
      }
      case 'chest': {
        shadow(c, cx, y0 + h, 14, 5);
        c.fillStyle = '#a0683a'; c.beginPath(); c.roundRect(x0 + 4, y0 + 10, w - 8, h - 12, 3); c.fill(); c.stroke();
        c.fillStyle = '#c8935a'; c.beginPath(); c.roundRect(x0 + 3, y0 + 6, w - 6, 9, [5, 5, 1, 1]); c.fill(); c.stroke();
        c.fillStyle = '#f5c542'; c.fillRect(cx - 2, y0 + 13, 4, 5);
        break;
      }
      case 'lantern': {
        shadow(c, cx, y0 + h - 2, 8, 3);
        c.fillStyle = '#4a3a42'; c.fillRect(cx - 2, y0 - 18, 4, h + 14);
        c.fillStyle = night ? '#ffd27a' : '#f2e6b8'; c.beginPath(); c.roundRect(cx - 7, y0 - 30, 14, 15, 3); c.fill(); c.stroke();
        break;
      }
      case 'flowers': {
        c.fillStyle = '#c8763a'; c.beginPath(); c.moveTo(cx - 9, y0 + 14); c.lineTo(cx + 9, y0 + 14); c.lineTo(cx + 6, y0 + h - 2); c.lineTo(cx - 6, y0 + h - 2); c.closePath(); c.fill(); c.stroke();
        for (const [dx, dy, col] of [[-6, 6, '#ff8ab3'], [5, 4, '#fff07a'], [0, -1, '#c9a6ff']]) { c.fillStyle = '#4f9a3a'; c.fillRect(cx + dx - 1, y0 + dy, 2, 12); c.fillStyle = col; c.beginPath(); c.arc(cx + dx, y0 + dy, 4.5, 0, 7); c.fill(); c.lineWidth = 1.5; c.stroke(); }
        break;
      }
      case 'fence': {
        c.fillStyle = '#f2e6d0';
        if (o.rot % 2 === 0) { c.fillRect(x0, y0 + 14, w, 4); c.strokeRect(x0, y0 + 14, w, 4); for (const dx of [6, 20]) { c.beginPath(); c.moveTo(x0 + dx, y0 + 26); c.lineTo(x0 + dx, y0 + 6); c.lineTo(x0 + dx + 3, y0 + 2); c.lineTo(x0 + dx + 6, y0 + 6); c.lineTo(x0 + dx + 6, y0 + 26); c.closePath(); c.fill(); c.stroke(); } }
        else { c.fillRect(cx - 2, y0, 4, h); c.strokeRect(cx - 2, y0, 4, h); for (const dy of [4, 18]) { c.beginPath(); c.roundRect(cx - 4, y0 + dy - 8, 8, 18, 2); c.fill(); c.stroke(); } }
        break;
      }
      case 'bench': {
        shadow(c, cx, y0 + h, w / 2 - 4, 5);
        c.fillStyle = '#a0683a';
        c.beginPath(); c.roundRect(x0 + 4, y0 + 2, w - 8, 9, 2); c.fill(); c.stroke();
        c.beginPath(); c.roundRect(x0 + 2, y0 + 14, w - 4, 8, 2); c.fill(); c.stroke();
        c.fillRect(x0 + 8, y0 + 22, 4, 8); c.fillRect(x0 + w - 12, y0 + 22, 4, 8);
        break;
      }
    }
  }
  R.drawBuildingGhost = function (c, type, tx, ty, rot, ok, t) {
    const d = D.BUILDINGS[type];
    const [w, h] = rot % 2 ? [d.h, d.w] : [d.w, d.h];
    c.save(); c.globalAlpha = 0.6;
    building(c, { type, tx, ty, rot, w, h, lvl: 1 }, t, false);
    c.globalAlpha = 1;
    c.fillStyle = ok ? 'rgba(90,230,120,0.25)' : 'rgba(240,70,90,0.3)'; c.strokeStyle = ok ? '#5ae678' : '#f0465a'; c.lineWidth = 2;
    c.fillRect(tx * T, ty * T, w * T, h * T); c.strokeRect(tx * T, ty * T, w * T, h * T);
    c.restore();
  };

  // returns an array of light sources the object emits
  R.drawObject = function (c, o, t, S) {
    const P = R.pal(S.season);
    const night = S.night > 0.3;
    switch (o.kind) {
      case 'tree': case 'decotree': tree(c, o.x, o.y, P, o.v || (o.nid ? o.nid.length : 0), o.dead, t); break;
      case 'rock': rock(c, o.x, o.y, null, o.dead, false); break;
      case 'ore': rock(c, o.x, o.y, { stone: null, bronze_ore: '#e8883a', iron_ore: '#dfe9f5', coal: '#1f1a24' }[o.res], o.dead, true); break;
      case 'bush': bush(c, o.x, o.y, o.dead, P); break;
      case 'house': house(c, o.x, o.y, o.roof, night); break;
      case 'stall': stall(c, o.x, o.y, o.color, t); break;
      case 'hearth':
        shadow(c, o.x, o.y + 8, 30, 10);
        c.fillStyle = '#7d7184'; c.strokeStyle = OUT; c.lineWidth = 2;
        for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; c.beginPath(); c.ellipse(o.x + Math.cos(a) * 22, o.y + Math.sin(a) * 10, 8, 6, 0, 0, 7); c.fill(); c.stroke(); }
        c.fillStyle = '#6e4224'; c.fillRect(o.x - 14, o.y - 4, 28, 6);
        fire(c, o.x, o.y, t, 1.3);
        break;
      case 'lamp':
        shadow(c, o.x, o.y + 8, 8, 3);
        c.fillStyle = '#4a3a42'; c.fillRect(o.x - 2, o.y - 34, 4, 42);
        c.strokeStyle = OUT; c.lineWidth = 2; c.fillStyle = night ? '#ffd27a' : '#f2e6b8';
        c.beginPath(); c.roundRect(o.x - 7, o.y - 46, 14, 15, 3); c.fill(); c.stroke();
        break;
      case 'expedition': {
        shadow(c, o.x, o.y + 18, 50, 9);
        c.strokeStyle = OUT; c.lineWidth = 2.5; c.fillStyle = '#8a5a2e';
        c.fillRect(o.x - 44, o.y - 40, 7, 60); c.strokeRect(o.x - 44, o.y - 40, 7, 60); c.fillRect(o.x + 37, o.y - 40, 7, 60); c.strokeRect(o.x + 37, o.y - 40, 7, 60);
        c.fillStyle = '#a0683a'; c.beginPath(); c.roundRect(o.x - 50, o.y - 58, 100, 56, 5); c.fill(); c.stroke();
        c.fillStyle = '#f2e3c0'; c.beginPath(); c.roundRect(o.x - 42, o.y - 51, 84, 42, 3); c.fill(); c.stroke();
        c.fillStyle = '#9fc48a'; c.beginPath(); c.ellipse(o.x - 18, o.y - 32, 16, 10, 0.3, 0, 7); c.fill(); c.beginPath(); c.ellipse(o.x + 16, o.y - 28, 14, 9, -0.4, 0, 7); c.fill();
        c.strokeStyle = '#c0392b'; c.setLineDash([3, 3]); c.lineWidth = 1.5; c.beginPath(); c.moveTo(o.x - 28, o.y - 26); c.quadraticCurveTo(o.x, o.y - 50, o.x + 20, o.y - 26); c.stroke(); c.setLineDash([]);
        c.fillStyle = '#c0392b'; c.font = '900 14px Fredoka'; c.textAlign = 'center'; c.fillText('x', o.x + 20, o.y - 24);
        label(c, 'Expedition Map', o.x, o.y + 30, 13, '#ffe58a', true);
        break;
      }
      case 'signpost':
        shadow(c, o.x, o.y + 14, 10, 4);
        c.fillStyle = '#8a5a2e'; c.strokeStyle = OUT; c.lineWidth = 2;
        c.fillRect(o.x - 3, o.y - 30, 6, 44); c.strokeRect(o.x - 3, o.y - 30, 6, 44);
        c.fillStyle = '#c8935a'; c.beginPath(); c.roundRect(o.x - 40, o.y - 40, 80, 20, 3); c.fill(); c.stroke();
        c.font = '700 11px Fredoka'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#3a2418'; c.fillText(o.text, o.x, o.y - 30);
        break;
      case 'mine':
        c.fillStyle = '#1a1420'; c.strokeStyle = OUT; c.lineWidth = 3;
        c.beginPath(); c.moveTo(o.x - 30, o.y + 10); c.lineTo(o.x - 30, o.y - 22); c.quadraticCurveTo(o.x, o.y - 52, o.x + 30, o.y - 22); c.lineTo(o.x + 30, o.y + 10); c.closePath(); c.fill(); c.stroke();
        c.fillStyle = '#8a5a2e'; c.fillRect(o.x - 34, o.y - 26, 7, 38); c.fillRect(o.x + 27, o.y - 26, 7, 38); c.fillRect(o.x - 36, o.y - 32, 72, 8);
        c.strokeRect(o.x - 36, o.y - 32, 72, 8);
        label(c, 'Hollow Mine', o.x, o.y - 44, 13, '#ffe58a', true);
        break;
      case 'portal': {
        const r = 26 + Math.sin(t * 3) * 2;
        c.save(); c.translate(o.x, o.y);
        c.fillStyle = 'rgba(120,70,220,0.3)'; c.beginPath(); c.ellipse(0, 0, r + 8, (r + 8) * 0.5, 0, 0, 7); c.fill();
        for (let i = 0; i < 3; i++) { c.strokeStyle = ['#c78aff', '#8ad8ff', '#fff'][i]; c.lineWidth = 3; c.beginPath(); c.ellipse(0, 0, r - i * 7, (r - i * 7) * 0.5, 0, t * (2 + i) % 6.28, t * (2 + i) % 6.28 + 4); c.stroke(); }
        c.restore();
        label(c, o.name || 'Way Out', o.x, o.y - 28, 12, '#e6d4ff', true);
        break;
      }
      case 'chest': {
        shadow(c, o.x, o.y + 10, 18, 5);
        c.strokeStyle = OUT; c.lineWidth = 2;
        c.fillStyle = '#a0683a'; c.beginPath(); c.roundRect(o.x - 16, o.y - 10, 32, 20, 3); c.fill(); c.stroke();
        if (o.opened) { c.fillStyle = '#c8935a'; c.beginPath(); c.roundRect(o.x - 16, o.y - 26, 32, 14, [5, 5, 1, 1]); c.fill(); c.stroke(); c.fillStyle = '#2a1a12'; c.fillRect(o.x - 13, o.y - 12, 26, 5); }
        else {
          c.fillStyle = '#c8935a'; c.beginPath(); c.roundRect(o.x - 17, o.y - 18, 34, 12, [6, 6, 1, 1]); c.fill(); c.stroke();
          c.fillStyle = '#f5c542'; c.fillRect(o.x - 3, o.y - 9, 6, 7); c.strokeRect(o.x - 3, o.y - 9, 6, 7);
          c.fillStyle = `rgba(255,230,140,${0.4 + Math.sin(t * 4) * 0.25})`; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(o.x - 12 + i * 12 + Math.sin(t * 2 + i) * 3, o.y - 26 - ((t * 20 + i * 9) % 18), 1.6, 0, 7); c.fill(); }
        }
        break;
      }
      case 'torch':
        c.fillStyle = '#4a3a42'; c.fillRect(o.x - 3, o.y - 6, 6, 14);
        fire(c, o.x, o.y - 6, t + o.x, 0.5);
        break;
      case 'building': building(c, o, t, night); break;
    }
  };
  R.objLight = function (o, S) {
    switch (o.kind) {
      case 'hearth': return [o.x, o.y - 10, 190, [255, 180, 90]];
      case 'lamp': return S.night > 0.2 ? [o.x, o.y - 40, 110, [255, 210, 130]] : null;
      case 'torch': return [o.x, o.y - 10, 150, [255, 170, 90]];
      case 'portal': return [o.x, o.y, 120, [190, 140, 255]];
      case 'chest': return o.opened ? null : [o.x, o.y - 10, 60, [255, 220, 140]];
      case 'building': if (o.type === 'stove' || o.type === 'smelter') return [o.x, o.y, 90, [255, 160, 80]]; if (o.type === 'lantern') return [o.x, o.y - 40, 120, [255, 210, 130]]; if (o.type === 'cottage' && S.night > 0.2) return [o.x, o.y, 120, [255, 210, 130]]; return null;
      case 'house': return S.night > 0.2 ? [o.x, o.y, 110, [255, 210, 130]] : null;
      case 'mine': return [o.x, o.y - 10, 60, [255, 200, 150]];
    }
    return null;
  };

  // ------------------------------------------------------------ easing
  const easeOut = (k) => 1 - Math.pow(1 - k, 3);
  const easeOutBack = (k) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };
  R.easeOut = easeOut; R.easeOutBack = easeOutBack;

  // ------------------------------------------------------------ telegraphs
  R.drawTele = function (c, tg, t) {
    const [, kind, x, y, r, a, len, w, prog, team, half, style] = tg;
    t = t || performance.now() / 1000;
    const rgb = team ? (r === 85 ? '255,150,60' : '255,170,60') : style === 'mark' ? '200,90,255' : '240,60,85';
    const pulse = 0.5 + Math.sin(t * 14 + x * 0.01) * 0.5;
    const edgeA = 0.55 + pulse * 0.35 + prog * 0.1;
    c.save();
    if (kind === 'circle') {
      const g = c.createRadialGradient(x, y, r * 0.2, x, y, r);
      g.addColorStop(0, `rgba(${rgb},0.04)`); g.addColorStop(1, `rgba(${rgb},0.24)`);
      c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
      // filling core
      c.fillStyle = `rgba(${rgb},${0.18 + prog * 0.22})`; c.beginPath(); c.arc(x, y, r * easeOut(prog), 0, 7); c.fill();
      // double edge + rotating dashes
      c.strokeStyle = `rgba(${rgb},${edgeA})`; c.lineWidth = 2.5; c.beginPath(); c.arc(x, y, r, 0, 7); c.stroke();
      c.setLineDash([8, 10]); c.lineDashOffset = -t * 40; c.lineWidth = 1.5; c.strokeStyle = `rgba(255,255,255,${0.25 + pulse * 0.25})`;
      c.beginPath(); c.arc(x, y, r - 5, 0, 7); c.stroke(); c.setLineDash([]);
      if (style === 'mark') { // arcane rune ring
        c.strokeStyle = `rgba(${rgb},0.8)`; c.lineWidth = 2;
        for (let i = 0; i < 6; i++) { const aa = t * 2 + i * Math.PI / 3; c.beginPath(); c.moveTo(x + Math.cos(aa) * r * 0.55, y + Math.sin(aa) * r * 0.55); c.lineTo(x + Math.cos(aa + 0.5) * r * 0.75, y + Math.sin(aa + 0.5) * r * 0.75); c.stroke(); }
      }
      if (team && r === 85) { // meteor falling from the sky onto the circle
        const k = easeOut(prog), mx = x + (1 - k) * 160, my = y - (1 - k) * 420;
        c.globalCompositeOperation = 'lighter';
        const tg2 = c.createLinearGradient(mx + 120, my - 300, mx, my);
        tg2.addColorStop(0, 'rgba(255,120,40,0)'); tg2.addColorStop(1, 'rgba(255,200,90,0.9)');
        c.strokeStyle = tg2; c.lineWidth = 16; c.lineCap = 'round'; c.beginPath(); c.moveTo(mx + 110, my - 280); c.lineTo(mx, my); c.stroke();
        const fg = c.createRadialGradient(mx, my, 0, mx, my, 34);
        fg.addColorStop(0, 'rgba(255,255,220,1)'); fg.addColorStop(0.4, 'rgba(255,160,60,0.9)'); fg.addColorStop(1, 'rgba(255,80,20,0)');
        c.fillStyle = fg; c.beginPath(); c.arc(mx, my, 34, 0, 7); c.fill();
        c.globalCompositeOperation = 'source-over';
        c.fillStyle = '#5a3a2a'; c.beginPath(); c.arc(mx, my, 11, 0, 7); c.fill();
      }
    } else if (kind === 'line') {
      c.translate(x, y); c.rotate(a);
      const g = c.createLinearGradient(0, 0, len, 0);
      g.addColorStop(0, `rgba(${rgb},0.3)`); g.addColorStop(1, `rgba(${rgb},0.08)`);
      c.fillStyle = g; c.beginPath(); c.roundRect(0, -w / 2, len, w, w / 2); c.fill();
      c.fillStyle = `rgba(${rgb},${0.22 + prog * 0.2})`; c.beginPath(); c.roundRect(0, -w / 2, len * easeOut(prog), w, w / 2); c.fill();
      c.strokeStyle = `rgba(${rgb},${edgeA})`; c.lineWidth = 2; c.beginPath(); c.roundRect(0, -w / 2, len, w, w / 2); c.stroke();
      // scrolling warning chevrons
      c.strokeStyle = `rgba(255,255,255,${0.35 + pulse * 0.3})`; c.lineWidth = 2.5; c.lineCap = 'round';
      const step = 26, off = (t * 90) % step;
      for (let d = off; d < len - 8; d += step) { c.beginPath(); c.moveTo(d - 5, -w * 0.25); c.lineTo(d + 3, 0); c.lineTo(d - 5, w * 0.25); c.stroke(); }
    } else if (kind === 'cone') {
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${rgb},0.06)`); g.addColorStop(1, `rgba(${rgb},0.28)`);
      c.fillStyle = g; c.beginPath(); c.moveTo(x, y); c.arc(x, y, r, a - half, a + half); c.closePath(); c.fill();
      c.fillStyle = `rgba(${rgb},${0.2 + prog * 0.2})`; c.beginPath(); c.moveTo(x, y); c.arc(x, y, r * easeOut(prog), a - half, a + half); c.closePath(); c.fill();
      c.strokeStyle = `rgba(${rgb},${edgeA})`; c.lineWidth = 2.5; c.beginPath(); c.moveTo(x, y); c.arc(x, y, r, a - half, a + half); c.closePath(); c.stroke();
    } else if (kind === 'ring') {
      for (let i = 0; i < 3; i++) {
        const k = (prog + i / 3) % 1;
        c.strokeStyle = `rgba(${rgb},${(1 - k) * 0.8})`; c.lineWidth = 3;
        c.beginPath(); c.ellipse(x, y - 10, r * (1.6 - k * 0.8), r * (1.6 - k * 0.8) * 0.8, 0, 0, 7); c.stroke();
      }
    }
    c.restore();
  };

  // ------------------------------------------------------------ projectiles (with glowing trails)
  const PCOL = { knife: '#f2ecfa', arrow: '#f2ecfa', ember: '#ff8a2a', spark: '#7ae6ff', feather: '#c8f08a', acorn: '#a0683a', quill: '#6a8fe0', spore: '#c8e06a', bubble: '#9ad8ff', glimmer: '#c78aff', orb: '#ff5a8a' };
  const PRGB = { knife: '220,235,255', arrow: '220,235,255', ember: '255,140,50', spark: '120,230,255', feather: '190,240,140', acorn: '200,150,90', quill: '120,160,255', spore: '200,230,100', bubble: '150,220,255', glimmer: '200,140,255', orb: '255,90,140' };
  R.projLight = (k) => ({ ember: [255, 150, 60], spark: [120, 220, 255], glimmer: [200, 140, 255], orb: [255, 90, 140], knife: [200, 220, 255], arrow: [200, 220, 255] })[k];
  R.drawTrail = function (c, pts, kind) {
    if (!pts || pts.length < 2) return;
    const rgb = PRGB[kind] || '255,255,255';
    const wide = kind === 'ember' ? 10 : kind === 'spark' || kind === 'orb' || kind === 'glimmer' ? 7 : 4;
    c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
    for (let i = 1; i < pts.length; i++) {
      const k = i / pts.length;
      c.strokeStyle = `rgba(${rgb},${k * 0.55})`; c.lineWidth = wide * k;
      c.beginPath(); c.moveTo(pts[i - 1][0], pts[i - 1][1]); c.lineTo(pts[i][0], pts[i][1]); c.stroke();
    }
    c.restore();
  };
  R.drawProj = function (c, p, t) {
    const [, x, y, vx, vy, kind] = p;
    t = t || performance.now() / 1000;
    const a = Math.atan2(vy, vx);
    const col = PCOL[kind] || '#fff', rgb = PRGB[kind] || '255,255,255';
    // soft additive glow under everything
    c.save(); c.globalCompositeOperation = 'lighter';
    const gr = kind === 'ember' ? 26 : kind === 'knife' || kind === 'arrow' ? 14 : 18;
    const g = c.createRadialGradient(x, y, 0, x, y, gr);
    g.addColorStop(0, `rgba(${rgb},0.55)`); g.addColorStop(1, `rgba(${rgb},0)`);
    c.fillStyle = g; c.beginPath(); c.arc(x, y, gr, 0, 7); c.fill();
    c.restore();
    c.save(); c.translate(x, y); c.rotate(a);
    if (kind === 'knife' || kind === 'arrow' || kind === 'quill') {
      c.fillStyle = col; c.strokeStyle = OUT; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(10, 0); c.lineTo(-3, -3.2); c.lineTo(-10, -1.6); c.lineTo(-10, 1.6); c.lineTo(-3, 3.2); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.9)'; c.fillRect(-2, -0.8, 9, 1.6);
    } else if (kind === 'feather') {
      c.fillStyle = col; c.beginPath(); c.ellipse(0, 0, 9, 3, 0, 0, 7); c.fill();
      c.strokeStyle = '#8ab85a'; c.lineWidth = 1; c.beginPath(); c.moveTo(-9, 0); c.lineTo(9, 0); c.stroke();
    } else if (kind === 'acorn') {
      c.rotate(t * 12);
      c.fillStyle = '#c8935a'; c.strokeStyle = OUT; c.lineWidth = 1.5; c.beginPath(); c.ellipse(0, 0, 6, 5, 0, 0, 7); c.fill(); c.stroke();
      c.fillStyle = '#6e4224'; c.beginPath(); c.ellipse(-3, 0, 3, 5.5, 0, 0, 7); c.fill();
    } else {
      const r = kind === 'ember' ? 9 : kind === 'spore' ? 7 : 6.5;
      const wob = 1 + Math.sin(t * 30 + x) * 0.12;
      c.shadowColor = col; c.shadowBlur = 16;
      c.fillStyle = col; c.beginPath(); c.arc(0, 0, r * wob, 0, 7); c.fill();
      c.shadowBlur = 0; c.fillStyle = 'rgba(255,255,255,0.85)'; c.beginPath(); c.arc(-1, -1, r * 0.45, 0, 7); c.fill();
      if (kind === 'ember' || kind === 'orb') { // flickering flame tongues
        c.fillStyle = `rgba(${rgb},0.6)`;
        for (let i = 0; i < 3; i++) { const aa = Math.PI + (i - 1) * 0.5 + Math.sin(t * 25 + i) * 0.2; c.beginPath(); c.ellipse(Math.cos(aa) * r, Math.sin(aa) * r, r * 0.9, r * 0.35, aa, 0, 7); c.fill(); }
      }
      if (kind === 'spark') { c.strokeStyle = '#e6fbff'; c.lineWidth = 1.5; c.beginPath(); for (let i = 0; i < 4; i++) { const aa = t * 40 + i * 1.6; c.moveTo(0, 0); c.lineTo(Math.cos(aa) * r * 1.8, Math.sin(aa) * r * 1.8); } c.stroke(); }
    }
    c.restore();
  };

  // ------------------------------------------------------------ pickups
  R.drawPickup = function (c, k, t) {
    const [id, kind, x, y, item] = k;
    const b = Math.sin(t * 5 + x) * 2.5;
    shadow(c, x, y + 4, 7, 3, 0.25);
    if (kind === 'crumbs') {
      c.fillStyle = '#f6c75c'; c.strokeStyle = OUT; c.lineWidth = 1.5;
      c.beginPath(); c.arc(x, y - 6 + b, 5, 0, 7); c.fill(); c.stroke();
      c.fillStyle = '#9a5a1e'; c.fillRect(x - 2, y - 8 + b, 1.5, 1.5); c.fillRect(x + 1, y - 5 + b, 1.5, 1.5);
      const gl = (t * 1.3 + x * 0.013) % 1; // glint
      if (gl < 0.15) { const s = Math.sin(gl / 0.15 * Math.PI) * 6; c.strokeStyle = 'rgba(255,255,230,0.95)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x + 2 - s, y - 9 + b); c.lineTo(x + 2 + s, y - 9 + b); c.moveTo(x + 2, y - 9 + b - s); c.lineTo(x + 2, y - 9 + b + s); c.stroke(); }
    } else if (kind === 'heart') {
      const s = 1 + Math.sin(t * 6) * 0.08;
      c.save(); c.globalCompositeOperation = 'lighter'; const g = c.createRadialGradient(x, y - 9, 0, x, y - 9, 16); g.addColorStop(0, 'rgba(255,90,120,0.45)'); g.addColorStop(1, 'rgba(255,90,120,0)'); c.fillStyle = g; c.beginPath(); c.arc(x, y - 9, 16, 0, 7); c.fill(); c.restore();
      Icons.drawIcon(c, 'heart', x - 9 * s, y - 18 * s + b, 18 * s);
    } else if (kind === 'item') {
      const it = D.ITEMS[item];
      Icons.drawIcon(c, it ? it.icon : 'none', x - 11, y - 24 + b, 22);
    } else if (kind === 'gear') {
      // rotating god-rays + light pillar
      c.save(); c.globalCompositeOperation = 'lighter';
      const pg = c.createLinearGradient(0, y - 110, 0, y);
      pg.addColorStop(0, 'rgba(255,220,120,0)'); pg.addColorStop(1, `rgba(255,220,120,${0.55 + Math.sin(t * 4) * 0.2})`);
      c.fillStyle = pg; c.fillRect(x - 7, y - 110, 14, 110);
      c.translate(x, y - 17 + b);
      for (let i = 0; i < 8; i++) { c.rotate(Math.PI / 4); c.fillStyle = 'rgba(255,230,150,0.18)'; c.beginPath(); c.moveTo(0, 0); c.lineTo(-4, -30 - Math.sin(t * 3 + i) * 6); c.lineTo(4, -30 - Math.sin(t * 3 + i) * 6); c.closePath(); c.fill(); }
      c.restore();
      c.save(); c.translate(x, y - 17 + b); c.rotate(t * 0.8);
      c.restore();
      Icons.drawIcon(c, item === 'weapon' ? 'weapon' : item, x - 13, y - 30 + b, 26);
      if (Math.random() < 0.12) addPart({ k: 'dot', x: x + (Math.random() - 0.5) * 18, y: y - 10, vx: 0, vy: -50, col: '#ffe9a0', life: 0.7, size: 2, grav: 0, add: true });
    }
  };

  // ------------------------------------------------------------ owl minion
  R.drawOwl = function (c, x, y, t) {
    const f = Math.sin(t * 14) * 4;
    shadow(c, x, y + 40, 8, 3, 0.18);
    c.save(); c.globalCompositeOperation = 'lighter'; const g = c.createRadialGradient(x, y, 0, x, y, 26); g.addColorStop(0, 'rgba(190,255,140,0.35)'); g.addColorStop(1, 'rgba(190,255,140,0)'); c.fillStyle = g; c.beginPath(); c.arc(x, y, 26, 0, 7); c.fill(); c.restore();
    c.strokeStyle = OUT; c.lineWidth = 2;
    c.fillStyle = '#a6d870';
    c.beginPath(); c.ellipse(x - 11, y + 2, 9, 4 + f * 0.5, -0.4 + f * 0.05, 0, 7); c.fill(); c.stroke();
    c.beginPath(); c.ellipse(x + 11, y + 2, 9, 4 - f * 0.5, 0.4 - f * 0.05, 0, 7); c.fill(); c.stroke();
    c.fillStyle = '#c4ec8a'; c.beginPath(); c.ellipse(x, y, 10, 11, 0, 0, 7); c.fill(); c.stroke();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(x - 4, y - 3, 3.2, 0, 7); c.arc(x + 4, y - 3, 3.2, 0, 7); c.fill();
    c.fillStyle = OUT; c.beginPath(); c.arc(x - 4, y - 3, 1.6, 0, 7); c.arc(x + 4, y - 3, 1.6, 0, 7); c.fill();
    c.fillStyle = '#f5b94a'; c.beginPath(); c.moveTo(x - 2, y + 1); c.lineTo(x + 2, y + 1); c.lineTo(x, y + 4); c.fill();
    if (Math.random() < 0.08) addPart({ k: 'dot', x: x + (Math.random() - 0.5) * 16, y: y + 6, vx: (Math.random() - 0.5) * 20, vy: 30, col: '#d8ffb0', life: 0.6, size: 2, grav: 0, add: true });
  };

  // ------------------------------------------------------------ particles / fx
  const parts = [];
  R.parts = parts;
  function addPart(p) { p.t = 0; parts.push(p); if (parts.length > 1200) parts.splice(0, parts.length - 1200); }
  R.addPart = addPart;
  const rnd = (a, b) => a + Math.random() * (b - a);
  function burst(x, y, n, o) {
    for (let i = 0; i < n; i++) {
      const a = o.dir != null ? o.dir + rnd(-o.spread, o.spread) : Math.random() * 6.28, s = o.speed * rnd(0.35, 1.1);
      addPart({ k: o.streak ? 'streak' : 'dot', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (o.up || 0), col: o.col, life: o.life * rnd(0.6, 1.2), size: o.size * rnd(0.6, 1.3), grav: o.grav || 0, add: o.add, drag: o.drag });
    }
  }
  const ring = (x, y, r, col, life, w, fill) => addPart({ k: 'ring', x, y, r, col, life, w: w || 4, fill });
  const flash = (x, y, r, col, life) => addPart({ k: 'flash', x, y, r, col, life: life || 0.18 });
  const debris = (x, y, n, col, speed) => { for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + rnd(-1.3, 1.3), s = rnd(0.4, 1) * speed; addPart({ k: 'debris', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, col, life: rnd(0.5, 0.9), size: rnd(2.5, 5), rot: Math.random() * 6, vr: rnd(-12, 12), grav: 1 }); } };
  const smoke = (x, y, n, col) => { for (let i = 0; i < n; i++) addPart({ k: 'smoke', x: x + rnd(-10, 10), y: y + rnd(-6, 6), vx: rnd(-25, 25), vy: rnd(-40, -10), col: col || '200,190,210', life: rnd(0.5, 0.9), size: rnd(8, 14) }); };
  R.confetti = function (x, y, n) {
    const cols = ['#f5c542', '#e8506a', '#8fe08a', '#8ad8ff', '#c78aff', '#ffffff'];
    for (let i = 0; i < (n || 60); i++) { const a = -Math.PI / 2 + rnd(-1.1, 1.1), s = rnd(220, 480); addPart({ k: 'confetti', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, col: cols[i % cols.length], life: rnd(1.4, 2.2), size: rnd(4, 7), rot: Math.random() * 6, vr: rnd(-10, 10), grav: 0.6 }); }
  };
  R.dust = function (x, y, dir) { addPart({ k: 'smoke', x: x + rnd(-4, 4), y: y - 2, vx: -(dir || 0) * 30 + rnd(-10, 10), vy: rnd(-18, -6), col: '210,195,170', life: 0.45, size: rnd(4, 7) }); };
  R.castFlash = function (x, y, col) { flash(x, y, 26, col || '255,255,255', 0.12); };
  R.deathFx = function (x, y, r, boss) {
    flash(x, y - r, r * 3, '255,255,255', 0.25);
    burst(x, y - r, boss ? 60 : 22, { col: '#ffffff', speed: boss ? 420 : 240, life: 0.6, size: 5, add: true, drag: 0.9 });
    burst(x, y - r, boss ? 30 : 12, { col: '#f5c542', speed: 160, life: 0.9, size: 3, grav: 1, up: 120 });
    ring(x, y, r * 2.6, 'rgba(255,255,255,1)', 0.4, 5);
    addPart({ k: 'wisp', x, y: y - r, vx: rnd(-10, 10), vy: -70, life: 1.1, size: r * 0.7 });
    if (boss) { ring(x, y, 320, 'rgba(255,220,140,1)', 0.8, 10); R.confetti(x, y - 40, 90); }
  };
  R.hitFx = function (x, y, crit) {
    flash(x, y, crit ? 46 : 22, crit ? '255,230,120' : '255,255,255', crit ? 0.2 : 0.1);
    burst(x, y, crit ? 14 : 6, { col: crit ? '#ffe58a' : '#ffffff', speed: crit ? 380 : 260, life: 0.22, size: 2.2, streak: true, add: true });
    if (crit) ring(x, y, 44, 'rgba(255,220,120,1)', 0.25, 3);
  };

  R.spawnFx = function (e, shake) {
    const x = e.x, y = e.y;
    switch (e.f) {
      case 'slash': {
        const enemy = e.team === 'e';
        addPart({ k: 'crescent', x, y, a: e.a, r: e.r, col: enemy ? '255,90,110' : '255,255,255', glow: enemy ? '255,60,80' : '160,220,255', life: 0.26 });
        burst(x + Math.cos(e.a) * e.r * 0.7, y + Math.sin(e.a) * e.r * 0.7, 6, { col: enemy ? '#ff9aa8' : '#e6f6ff', dir: e.a, spread: 0.9, speed: 260, life: 0.25, size: 2, streak: true, add: true });
        break;
      }
      case 'jab':
        addPart({ k: 'beam', x, y: y - 14, a: e.a, len: e.len, col: '255,120,140', life: 0.22, w: 10 });
        flash(x + Math.cos(e.a) * e.len, y - 14 + Math.sin(e.a) * e.len, 24, '255,160,170', 0.15);
        break;
      case 'puff': smoke(x, y - 12, 10, '200,230,120'); ring(x, y - 10, e.r * 1.4, 'rgba(210,240,130,1)', 0.4, 4); break;
      case 'erupt':
        flash(x, y, e.r * 1.6, '210,120,255', 0.25);
        ring(x, y, e.r * 1.5, 'rgba(200,110,255,1)', 0.45, 7, true);
        burst(x, y, 26, { col: '#d9a6ff', speed: 300, life: 0.6, size: 5, add: true, up: 200, grav: 1 });
        for (let i = 0; i < 6; i++) addPart({ k: 'pillar', x: x + rnd(-e.r, e.r) * 0.6, y: y + rnd(-e.r, e.r) * 0.4, col: '200,110,255', life: rnd(0.3, 0.5), h: rnd(60, 110), w: rnd(6, 12) });
        shake(4);
        break;
      case 'thud': ring(x, y, e.r * 1.3, 'rgba(240,225,200,1)', 0.4, 6); smoke(x, y, 10, '210,195,170'); debris(x, y, 8, '#a8957a', 220); shake(3); break;
      case 'death': R.deathFx(x, y, e.r || 14, (e.r || 0) > 30); break;
      case 'spark': burst(x, y, 6, { col: '#fff3c0', speed: 200, life: 0.18, size: 2, streak: true, add: true }); break;
      case 'burst':
        flash(x, y, e.r * 1.8, '255,160,60', 0.2);
        ring(x, y, e.r * 1.4, 'rgba(255,170,70,1)', 0.3, 5, true);
        burst(x, y, 18, { col: '#ffb24a', speed: 260, life: 0.45, size: 4, add: true });
        smoke(x, y, 4, '90,70,70');
        break;
      case 'zap': addPart({ k: 'zap', x, y, x2: e.x2, y2: e.y2, life: 0.28 }); flash(e.x2, e.y2, 36, '150,230,255', 0.2); burst(e.x2, e.y2, 8, { col: '#bff4ff', speed: 260, life: 0.2, size: 2, streak: true, add: true }); break;
      case 'nova':
        flash(x, y - 10, e.r * 1.4, '170,230,255', 0.25);
        ring(x, y - 6, e.r * 1.1, 'rgba(180,235,255,1)', 0.45, 9, true);
        for (let i = 0; i < 14; i++) { const a = i / 14 * 6.28; addPart({ k: 'shard', x, y: y - 10, vx: Math.cos(a) * 360, vy: Math.sin(a) * 260, a, life: 0.4, size: rnd(7, 12) }); }
        burst(x, y - 10, 24, { col: '#e6f8ff', speed: 300, life: 0.5, size: 3, add: true });
        break;
      case 'meteor':
        flash(x, y, e.r * 3, '255,190,90', 0.35);
        ring(x, y, e.r * 1.6, 'rgba(255,170,70,1)', 0.5, 12, true);
        ring(x, y, e.r * 2.6, 'rgba(255,230,180,1)', 0.7, 4);
        burst(x, y, 40, { col: '#ffb84a', speed: 420, life: 0.7, size: 6, add: true, drag: 0.9 });
        debris(x, y, 16, '#5a4040', 420);
        smoke(x, y - 10, 14, '80,60,60');
        addPart({ k: 'crack', x, y, r: e.r, life: 1.4, seed: Math.random() * 100 });
        shake(9);
        break;
      case 'cry':
        flash(x, y - 30, 120, '255,220,120', 0.3);
        for (let i = 0; i < 3; i++) setTimeout(() => ring(x, y - 20, 150, 'rgba(255,215,90,1)', 0.55, 6), i * 110);
        addPart({ k: 'rune', x, y: y - 6, r: 60, col: '255,210,100', life: 0.8 });
        burst(x, y - 30, 20, { col: '#ffe58a', speed: 200, life: 0.7, size: 3, up: 140, add: true });
        break;
      case 'slam':
        flash(x, y, e.r * 1.6, '255,240,210', 0.2);
        ring(x, y, e.r * 1.2, 'rgba(240,225,200,1)', 0.45, 10, true);
        ring(x, y, e.r * 1.8, 'rgba(255,255,255,1)', 0.6, 3);
        debris(x, y, 18, '#a8957a', 380);
        smoke(x, y, 14, '210,195,170');
        addPart({ k: 'crack', x, y, r: e.r * 0.9, life: 1.2, seed: Math.random() * 100 });
        shake(7);
        break;
      case 'chop': debris(x, y - 22, 7, '#c8935a', 220); burst(x, y - 22, 4, { col: '#e9d4a8', speed: 120, life: 0.3, size: 2 }); break;
      case 'chip': debris(x, y - 10, 7, '#bdb8c8', 220); burst(x, y - 10, 5, { col: '#ffffff', speed: 200, life: 0.15, size: 2, streak: true, add: true }); break;
      case 'leaf': for (let i = 0; i < 7; i++) addPart({ k: 'confetti', x, y: y - 14, vx: rnd(-90, 90), vy: rnd(-160, -60), col: i % 2 ? '#6cb455' : '#d93a5a', life: rnd(0.6, 1), size: rnd(3, 5), rot: Math.random() * 6, vr: rnd(-8, 8), grav: 0.5 }); break;
      case 'blink':
        flash(x, y - 24, 40, '200,140,255', 0.2);
        ring(x, y - 20, 34, 'rgba(200,140,255,1)', 0.3, 4);
        burst(x, y - 24, 18, { col: '#d9b0ff', speed: 160, life: 0.5, size: 3, add: true });
        break;
      case 'poof': smoke(x, y, 9); burst(x, y, 10, { col: '#ffffff', speed: 140, life: 0.4, size: 3, add: true }); break;
      case 'bonk': burst(x, y, 6, { col: '#ffffff', speed: 180, life: 0.2, size: 2, streak: true, add: true }); ring(x, y, 20, 'rgba(255,255,255,1)', 0.2, 2); break;
    }
  };

  R.updateDrawParts = function (c, dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.t += dt;
      if (p.t > p.life) { parts.splice(i, 1); continue; }
      const k = p.t / p.life;
      if (p.vx != null) {
        const drag = p.drag != null ? p.drag : 0.92;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vx *= Math.pow(drag, dt * 60); p.vy = p.vy * Math.pow(drag, dt * 60) + (p.grav || 0) * 900 * dt;
      }
      c.save();
      if (p.add) c.globalCompositeOperation = 'lighter';
      switch (p.k) {
        case 'dot':
          c.globalAlpha = 1 - k; c.fillStyle = p.col; c.beginPath(); c.arc(p.x, p.y, p.size * (1 - k * 0.5), 0, 7); c.fill();
          break;
        case 'streak': {
          c.globalCompositeOperation = 'lighter'; c.globalAlpha = 1 - k; c.strokeStyle = p.col; c.lineWidth = p.size; c.lineCap = 'round';
          c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04); c.stroke();
          break;
        }
        case 'ring': {
          const e = easeOut(k), rr = p.r * (0.3 + e * 0.8);
          if (p.fill) { const g = c.createRadialGradient(p.x, p.y, rr * 0.5, p.x, p.y, rr); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, p.col.replace(/[\d.]+\)$/, (0.22 * (1 - k)) + ')')); c.fillStyle = g; c.beginPath(); c.ellipse(p.x, p.y, rr, rr * 0.75, 0, 0, 7); c.fill(); }
          c.globalAlpha = 1 - k; c.strokeStyle = p.col; c.lineWidth = (p.w || 4) * (1 - k) + 1;
          c.beginPath(); c.ellipse(p.x, p.y, rr, rr * 0.75, 0, 0, 7); c.stroke();
          break;
        }
        case 'flash': {
          c.globalCompositeOperation = 'lighter';
          const rr = p.r * (0.5 + easeOut(k) * 0.45);
          const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr);
          g.addColorStop(0, `rgba(${p.col},${0.55 * (1 - k)})`); g.addColorStop(0.5, `rgba(${p.col},${0.2 * (1 - k)})`); g.addColorStop(1, `rgba(${p.col},0)`);
          c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, rr, 0, 7); c.fill();
          break;
        }
        case 'crescent': { // sweeping glowing slash
          const sweep = easeOut(Math.min(1, k * 1.8));
          const a0 = p.a - 1.1, a1 = p.a - 1.1 + 2.2 * sweep;
          c.globalCompositeOperation = 'lighter';
          for (const [ri, ro, al] of [[0.55, 1.05, 0.35], [0.72, 1.0, 0.6], [0.86, 0.98, 1]]) {
            c.fillStyle = `rgba(${al === 1 ? p.col : p.glow},${al * (1 - k)})`;
            c.beginPath(); c.arc(p.x, p.y, p.r * ro, a0, a1); c.arc(p.x, p.y, p.r * ri, a1, a0, true); c.closePath(); c.fill();
          }
          break;
        }
        case 'beam': {
          c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
          for (const [w, al] of [[p.w * 2, 0.25], [p.w, 0.5], [p.w * 0.35, 1]]) { c.strokeStyle = `rgba(${al === 1 ? '255,255,255' : p.col},${al * (1 - k)})`; c.lineWidth = w; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x + Math.cos(p.a) * p.len, p.y + Math.sin(p.a) * p.len); c.stroke(); }
          break;
        }
        case 'zap': {
          c.globalCompositeOperation = 'lighter';
          const pts = [[p.x, p.y]], n = 7;
          for (let i2 = 1; i2 < n; i2++) { const f = i2 / n; pts.push([p.x + (p.x2 - p.x) * f + rnd(-18, 18), p.y + (p.y2 - p.y) * f + rnd(-18, 18)]); }
          pts.push([p.x2, p.y2]);
          for (const [w, col] of [[9, `rgba(120,200,255,${0.3 * (1 - k)})`], [4, `rgba(170,230,255,${0.8 * (1 - k)})`], [1.6, `rgba(255,255,255,${1 - k})`]]) {
            c.strokeStyle = col; c.lineWidth = w; c.lineJoin = 'round'; c.beginPath(); pts.forEach(([a, b], j) => (j ? c.lineTo(a, b) : c.moveTo(a, b))); c.stroke();
          }
          // a little side branch
          const m = pts[3]; c.strokeStyle = `rgba(200,240,255,${0.7 * (1 - k)})`; c.lineWidth = 1.5; c.beginPath(); c.moveTo(m[0], m[1]); c.lineTo(m[0] + rnd(-30, 30), m[1] + rnd(-30, 30)); c.stroke();
          break;
        }
        case 'debris':
          p.rot += p.vr * dt; c.globalAlpha = Math.min(1, (1 - k) * 2); c.translate(p.x, p.y); c.rotate(p.rot); c.fillStyle = p.col; c.strokeStyle = OUT; c.lineWidth = 1;
          c.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7); c.strokeRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
          break;
        case 'confetti':
          p.rot += p.vr * dt; p.vx += Math.sin(p.t * 8 + p.rot) * 20 * dt;
          c.globalAlpha = Math.min(1, (1 - k) * 2); c.translate(p.x, p.y); c.rotate(p.rot); c.scale(1, Math.cos(p.t * 9 + p.rot)); c.fillStyle = p.col; c.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
          break;
        case 'smoke':
          c.globalAlpha = 0.45 * (1 - k); c.fillStyle = `rgb(${p.col})`; c.beginPath(); c.arc(p.x, p.y, p.size * (0.6 + k), 0, 7); c.fill();
          break;
        case 'shard':
          c.globalCompositeOperation = 'lighter'; c.globalAlpha = 1 - k; c.translate(p.x, p.y); c.rotate(p.a);
          c.fillStyle = '#d4f4ff'; c.beginPath(); c.moveTo(p.size, 0); c.lineTo(0, -p.size * 0.3); c.lineTo(-p.size * 0.6, 0); c.lineTo(0, p.size * 0.3); c.closePath(); c.fill();
          break;
        case 'pillar': {
          c.globalCompositeOperation = 'lighter';
          const hh = p.h * easeOut(Math.min(1, k * 2.5));
          const g = c.createLinearGradient(0, p.y - hh, 0, p.y);
          g.addColorStop(0, `rgba(${p.col},0)`); g.addColorStop(1, `rgba(${p.col},${0.8 * (1 - k)})`);
          c.fillStyle = g; c.fillRect(p.x - p.w / 2, p.y - hh, p.w, hh);
          break;
        }
        case 'wisp': {
          c.globalCompositeOperation = 'lighter';
          const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * (1 + k));
          g.addColorStop(0, `rgba(230,240,255,${0.7 * (1 - k)})`); g.addColorStop(1, 'rgba(200,220,255,0)');
          c.fillStyle = g; c.beginPath(); c.arc(p.x + Math.sin(p.t * 8) * 6, p.y, p.size * (1 + k), 0, 7); c.fill();
          break;
        }
        case 'rune': {
          c.globalCompositeOperation = 'lighter'; c.globalAlpha = 1 - k; c.translate(p.x, p.y); c.scale(1, 0.55); c.rotate(p.t * 3);
          c.strokeStyle = `rgb(${p.col})`; c.lineWidth = 3;
          const rr = p.r * (0.5 + easeOut(k) * 0.45);
          c.beginPath(); c.arc(0, 0, rr, 0, 7); c.stroke();
          c.beginPath(); for (let j = 0; j < 6; j++) { const aa = j * Math.PI / 3; c.moveTo(Math.cos(aa) * rr, Math.sin(aa) * rr); c.lineTo(Math.cos(aa + 2.1) * rr, Math.sin(aa + 2.1) * rr); } c.stroke();
          break;
        }
        case 'crack': {
          c.globalAlpha = Math.min(1, (1 - k) * 1.5); c.strokeStyle = 'rgba(40,25,30,0.7)'; c.lineWidth = 2.5; c.lineCap = 'round';
          const R2 = hash(p.seed | 0, 1);
          for (let j = 0; j < 7; j++) {
            let cx = p.x, cy = p.y, aa = j / 7 * 6.28 + R2;
            c.beginPath(); c.moveTo(cx, cy);
            for (let s2 = 0; s2 < 4; s2++) { aa += (hash(j, s2, p.seed | 0) - 0.5) * 0.9; cx += Math.cos(aa) * p.r * 0.28; cy += Math.sin(aa) * p.r * 0.2; c.lineTo(cx, cy); }
            c.stroke();
          }
          if (k < 0.4) { c.globalCompositeOperation = 'lighter'; c.strokeStyle = `rgba(255,150,60,${0.6 * (1 - k / 0.4)})`; c.lineWidth = 1.5; c.stroke(); }
          break;
        }
      }
      c.restore();
    }
  };

  // ------------------------------------------------------------ lighting
  const lightCv = document.createElement('canvas');
  R.drawLighting = function (c, cw, ch, dark, lights, tint) {
    if (dark <= 0.01) return;
    if (lightCv.width !== cw || lightCv.height !== ch) { lightCv.width = cw; lightCv.height = ch; }
    const l = lightCv.getContext('2d');
    l.globalCompositeOperation = 'source-over';
    l.clearRect(0, 0, cw, ch);
    l.fillStyle = tint || `rgba(14,8,28,1)`; l.globalAlpha = dark; l.fillRect(0, 0, cw, ch); l.globalAlpha = 1;
    l.globalCompositeOperation = 'destination-out';
    for (const [x, y, r] of lights) {
      const g = l.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.5, 'rgba(0,0,0,0.75)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      l.fillStyle = g; l.beginPath(); l.arc(x, y, r, 0, 7); l.fill();
    }
    c.drawImage(lightCv, 0, 0);
    // warm glow
    c.save(); c.globalCompositeOperation = 'lighter';
    for (const [x, y, r, col] of lights) {
      if (!col) continue;
      const g = c.createRadialGradient(x, y, 0, x, y, r * 0.7);
      g.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${0.16 * dark})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, r * 0.7, 0, 7); c.fill();
    }
    c.restore();
  };

  window.Render = R;
})();
