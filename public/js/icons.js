// Procedurally drawn icons for items, gear and abilities.
(function () {
  const cache = {};
  const OUT = '#1d1428';

  function blob(c, x, y, r, fill, line) {
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = fill; c.fill();
    if (line !== false) { c.lineWidth = 2; c.strokeStyle = OUT; c.stroke(); }
  }
  function poly(c, pts, fill, lw) {
    c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.closePath(); c.fillStyle = fill; c.fill(); c.lineWidth = lw || 2; c.strokeStyle = OUT; c.lineJoin = 'round'; c.stroke();
  }
  function rrect(c, x, y, w, h, r, fill, line) {
    c.beginPath(); c.roundRect(x, y, w, h, r); c.fillStyle = fill; c.fill();
    if (line !== false) { c.lineWidth = 2; c.strokeStyle = OUT; c.stroke(); }
  }
  function line(c, x1, y1, x2, y2, col, w) { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.stroke(); }
  function ore(c, speck) {
    poly(c, [[6, 26], [9, 13], [17, 7], [26, 11], [29, 24], [22, 29], [11, 29]], '#8a8494');
    c.fillStyle = '#a7a1b3'; c.beginPath(); c.moveTo(10, 14); c.lineTo(17, 9); c.lineTo(22, 12); c.lineTo(14, 17); c.fill();
    for (const [x, y, r] of [[13, 20, 3], [21, 17, 2.5], [19, 24, 2.2], [24, 22, 1.8]]) blob(c, x, y, r, speck, false);
  }
  function bar(c, col, hi) {
    poly(c, [[5, 22], [10, 14], [26, 14], [29, 22], [25, 27], [9, 27]], col);
    poly(c, [[10, 14], [26, 14], [24, 18], [12, 18]], hi, 1.5);
  }
  function pouch(c, seed) {
    poly(c, [[9, 12], [23, 12], [27, 27], [5, 27]], '#c9a26b');
    line(c, 9, 12, 23, 12, OUT, 2); line(c, 12, 9, 20, 9, '#8a6a3f', 3);
    blob(c, 16, 21, 4.5, seed);
  }
  function fishShape(c, body, fin) {
    c.save(); c.translate(16, 17);
    poly(c, [[-12, 0], [-4, -7], [6, -6], [11, 0], [6, 6], [-4, 7]], body);
    poly(c, [[10, 0], [15, -6], [15, 6]], fin);
    blob(c, -6, -1, 1.6, OUT, false);
    c.restore();
  }
  function bowl(c, soup) {
    c.beginPath(); c.ellipse(16, 16, 12, 5, 0, 0, Math.PI * 2); c.fillStyle = soup; c.fill(); c.lineWidth = 2; c.strokeStyle = OUT; c.stroke();
    c.beginPath(); c.moveTo(4, 16); c.quadraticCurveTo(16, 34, 28, 16); c.fillStyle = '#e9e2f2'; c.fill(); c.stroke();
  }

  const ICONS = {
    wood(c) { // two logs
      for (const [y, o] of [[20, 0], [12, 4]]) {
        rrect(c, 4 + o, y - 4, 22, 9, 4, '#a0683a');
        c.beginPath(); c.ellipse(26 + o, y + 0.5, 3.5, 4.5, 0, 0, Math.PI * 2); c.fillStyle = '#e2b77d'; c.fill(); c.lineWidth = 2; c.strokeStyle = OUT; c.stroke();
        line(c, 9 + o, y - 1, 18 + o, y - 1, '#7a4a26', 1.5);
      }
    },
    stone(c) {
      poly(c, [[4, 26], [8, 15], [15, 9], [23, 11], [29, 20], [28, 27]], '#9a95a6');
      c.fillStyle = '#bdb8c8'; c.beginPath(); c.moveTo(9, 16); c.lineTo(15, 11); c.lineTo(21, 13); c.lineTo(13, 18); c.fill();
    },
    wheat(c) {
      line(c, 16, 29, 16, 8, '#5c8f2e', 2.5);
      for (let i = 0; i < 4; i++) { const y = 9 + i * 5; for (const s of [-1, 1]) { c.save(); c.translate(16, y); c.rotate(s * 0.6); c.beginPath(); c.ellipse(s * 4, 0, 4, 2.2, 0, 0, Math.PI * 2); c.fillStyle = '#9bd04c'; c.fill(); c.lineWidth = 1.5; c.strokeStyle = OUT; c.stroke(); c.restore(); } }
    },
    berries(c) {
      poly(c, [[16, 6], [22, 4], [20, 10]], '#4f9a3a', 1.5);
      blob(c, 11, 18, 6, '#d93a5a'); blob(c, 21, 18, 6, '#d93a5a'); blob(c, 16, 25, 6, '#c42c4c');
      for (const [x, y] of [[9, 16], [19, 16], [14, 23]]) blob(c, x, y, 1.6, '#ff9db0', false);
    },
    crumbs(c) {
      blob(c, 16, 16, 11, '#e9a83c');
      blob(c, 16, 16, 7.5, '#f6c75c', false);
      for (const [x, y] of [[12, 13], [19, 12], [14, 20], [20, 19]]) blob(c, x, y, 1.6, '#9a5a1e', false);
    },
    pumpkin(c) {
      line(c, 16, 9, 18, 4, '#5c7a2e', 3);
      c.beginPath(); c.ellipse(16, 19, 12, 10, 0, 0, Math.PI * 2); c.fillStyle = '#ef8a2c'; c.fill(); c.lineWidth = 2; c.strokeStyle = OUT; c.stroke();
      c.beginPath(); c.ellipse(16, 19, 4, 10, 0, 0, Math.PI * 2); c.lineWidth = 1.5; c.stroke();
    },
    fish(c) { fishShape(c, '#6aa8e0', '#4a7fc0'); },
    golden_fish(c) { fishShape(c, '#f5cf4a', '#e09a2a'); },
    bronze_ore(c) { ore(c, '#e8883a'); },
    iron_ore(c) { ore(c, '#d6e4f2'); },
    coal(c) { blob(c, 12, 20, 7, '#2b2733'); blob(c, 21, 18, 7, '#38323f'); blob(c, 16, 12, 6, '#2b2733'); },
    bronze_bar(c) { bar(c, '#c8762e', '#eaa25a'); },
    iron_bar(c) { bar(c, '#9aa6b8', '#d4dde9'); },
    ember_core(c) { c.shadowColor = '#ff8a2a'; c.shadowBlur = 8; poly(c, [[16, 4], [26, 14], [16, 28], [6, 14]], '#ff8a2a'); c.shadowBlur = 0; poly(c, [[16, 9], [21, 14], [16, 21], [11, 14]], '#ffd27a', 1); },
    seed_berry(c) { pouch(c, '#d93a5a'); },
    seed_wheat(c) { pouch(c, '#9bd04c'); },
    seed_pumpkin(c) { pouch(c, '#ef8a2c'); },
    crust(c) { poly(c, [[5, 24], [27, 24], [16, 6]], '#e8b46a'); line(c, 6, 24, 26, 24, '#b07a3a', 4); for (const [x, y] of [[14, 17], [18, 20]]) blob(c, x, y, 1.3, '#b07a3a', false); },
    rod(c) { line(c, 6, 28, 24, 5, '#8a5a2e', 3); line(c, 24, 5, 26, 20, '#e9e2f2', 1); blob(c, 26, 22, 2.5, '#e8506a'); },
    meal_berry(c) { blob(c, 16, 18, 10, '#f5d6e6'); blob(c, 16, 12, 4, '#d93a5a'); },
    meal_skewer(c) { line(c, 4, 28, 28, 4, '#a0683a', 2.5); blob(c, 11, 21, 4.5, '#d93a5a'); c.save(); c.translate(17, 15); c.rotate(-0.78); c.beginPath(); c.ellipse(0, 0, 6, 3.5, 0, 0, 7); c.fillStyle = '#6aa8e0'; c.fill(); c.lineWidth = 2; c.strokeStyle = OUT; c.stroke(); c.restore(); blob(c, 23, 9, 3.5, '#d93a5a'); },
    meal_bun(c) { c.beginPath(); c.ellipse(16, 18, 12, 9, 0, 0, Math.PI * 2); c.fillStyle = '#e0a45a'; c.fill(); c.lineWidth = 2; c.strokeStyle = OUT; c.stroke(); line(c, 10, 15, 13, 12, '#f6d49a', 2); line(c, 17, 14, 20, 11, '#f6d49a', 2); },
    meal_stew(c) { bowl(c, '#b8643a'); blob(c, 12, 15, 2, '#ef8a2c', false); blob(c, 19, 16, 2, '#9bd04c', false); },
    meal_pie(c) { poly(c, [[4, 22], [28, 22], [24, 27], [8, 27]], '#c8863a'); c.beginPath(); c.ellipse(16, 20, 12, 5, 0, Math.PI, 0); c.fillStyle = '#ef8a2c'; c.fill(); c.lineWidth = 2; c.strokeStyle = OUT; c.stroke(); },
    meal_hearth(c) { c.shadowColor = '#ffd27a'; c.shadowBlur = 10; c.beginPath(); c.ellipse(16, 19, 13, 8, 0, 0, Math.PI * 2); c.fillStyle = '#e8b46a'; c.fill(); c.shadowBlur = 0; c.lineWidth = 2; c.strokeStyle = OUT; c.stroke(); for (let i = 0; i < 5; i++) line(c, 16, 19, 16 + Math.cos(i * 1.26) * 10, 19 + Math.sin(i * 1.26) * 6, '#b07a3a', 1.5); blob(c, 16, 19, 3, '#d93a5a'); },
    heart(c) { c.beginPath(); c.moveTo(16, 27); c.bezierCurveTo(2, 17, 6, 5, 16, 11); c.bezierCurveTo(26, 5, 30, 17, 16, 27); c.fillStyle = '#e8506a'; c.fill(); c.lineWidth = 2; c.strokeStyle = OUT; c.stroke(); blob(c, 11, 13, 2, '#ffb3c2', false); },
    // gear
    weapon(c) { line(c, 8, 25, 24, 8, '#e9e2f2', 5); line(c, 8, 25, 24, 8, OUT, 1); line(c, 6, 20, 13, 27, '#8a5a2e', 4); },
    knives(c) { for (const s of [-1, 1]) { c.save(); c.translate(16, 17); c.rotate(s * 0.5); poly(c, [[-2, -12], [2, -12], [2, 3], [-2, 3]], '#e9e2f2'); rrect(c, -3, 3, 6, 8, 2, '#8a5a2e'); c.restore(); } },
    staff(c) { line(c, 9, 29, 21, 9, '#8a5a2e', 4); blob(c, 22, 8, 5.5, '#8ad8ff'); },
    blade(c) { c.save(); c.translate(16, 16); c.rotate(0.78); poly(c, [[-3, -14], [3, -14], [3, 6], [-3, 6]], '#e9e2f2'); rrect(c, -7, 6, 14, 3, 1, '#c9a26b'); rrect(c, -2, 9, 4, 6, 1, '#8a5a2e'); c.restore(); },
    helmet(c) { c.beginPath(); c.moveTo(5, 22); c.quadraticCurveTo(5, 6, 16, 6); c.quadraticCurveTo(27, 6, 27, 22); c.closePath(); c.fillStyle = '#a7b3c9'; c.fill(); c.lineWidth = 2; c.strokeStyle = OUT; c.stroke(); rrect(c, 3, 20, 26, 5, 2, '#7f8aa3'); line(c, 16, 8, 16, 19, '#d4dde9', 2); },
    body(c) { poly(c, [[10, 5], [22, 5], [29, 11], [25, 16], [23, 14], [23, 28], [9, 28], [9, 14], [7, 16], [3, 11]], '#6a8fd0'); line(c, 13, 6, 16, 10, OUT, 1.5); line(c, 19, 6, 16, 10, OUT, 1.5); line(c, 9, 21, 23, 21, '#c9a26b', 3); },
    charm(c) { c.beginPath(); c.arc(16, 9, 6, Math.PI * 0.1, Math.PI * 0.9, true); c.strokeStyle = '#c9a26b'; c.lineWidth = 2; c.stroke(); c.shadowColor = '#c78aff'; c.shadowBlur = 8; poly(c, [[16, 13], [24, 20], [16, 29], [8, 20]], '#b57aff'); c.shadowBlur = 0; blob(c, 14, 19, 1.6, '#f0dcff', false); },
    // abilities
    ab_knives(c) { line(c, 8, 26, 16, 6, '#f2ecfa', 3); line(c, 24, 26, 16, 6, '#f2ecfa', 3); line(c, 6, 28, 10, 24, '#c9a26b', 3); line(c, 26, 28, 22, 24, '#c9a26b', 3); },
    ab_roll(c) { c.beginPath(); c.arc(20, 16, 8, 0, 7); c.strokeStyle = '#8ad8ff'; c.lineWidth = 3; c.stroke(); blob(c, 20, 16, 4, '#8ad8ff', false); for (let i = 0; i < 3; i++) line(c, 3, 11 + i * 5, 10, 11 + i * 5, '#f2ecfa', 2.5); },
    ab_owl(c) { blob(c, 16, 17, 11, '#b8e07a'); blob(c, 12, 15, 4, '#fff', false); blob(c, 20, 15, 4, '#fff', false); blob(c, 12, 15, 2, OUT, false); blob(c, 20, 15, 2, OUT, false); poly(c, [[14, 20], [18, 20], [16, 24]], '#f5b94a', 1); poly(c, [[7, 9], [10, 4], [12, 9]], '#b8e07a', 1.5); poly(c, [[20, 9], [22, 4], [25, 9]], '#b8e07a', 1.5); },
    ab_rapid(c) { for (let i = 0; i < 3; i++) line(c, 7 + i * 7, 26, 13 + i * 7, 6, '#f5a53a', 3.5); },
    ab_stealth(c) { c.beginPath(); c.ellipse(16, 16, 12, 7, 0, 0, 7); c.strokeStyle = '#c9b6e8'; c.lineWidth = 2.5; c.stroke(); blob(c, 16, 16, 4, '#c9b6e8', false); line(c, 6, 26, 26, 6, '#e8506a', 3); },
    ab_volley(c) { for (let i = -2; i <= 2; i++) { const a = -Math.PI / 2 + i * 0.32; line(c, 16, 28, 16 + Math.cos(a) * 20, 28 + Math.sin(a) * 20, '#f2ecfa', 2); } },
    ab_ember(c) { c.shadowColor = '#ff8a2a'; c.shadowBlur = 8; blob(c, 18, 14, 8, '#ff9a3a'); c.shadowBlur = 0; blob(c, 18, 14, 4, '#ffe08a', false); line(c, 5, 27, 12, 20, '#ff9a3a', 3); },
    ab_blink(c) { for (const [x, y, r] of [[9, 23, 3], [16, 16, 4], [24, 9, 5]]) { c.globalAlpha = 0.4 + r / 10; blob(c, x, y, r, '#c78aff', false); } c.globalAlpha = 1; },
    ab_frost(c) { for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; line(c, 16 - Math.cos(a) * 12, 16 - Math.sin(a) * 12, 16 + Math.cos(a) * 12, 16 + Math.sin(a) * 12, '#a6e6ff', 3); } blob(c, 16, 16, 3, '#fff', false); },
    ab_meteor(c) { line(c, 4, 4, 18, 18, '#ffb84a', 4); c.shadowColor = '#ff6a2a'; c.shadowBlur = 8; blob(c, 20, 20, 7, '#c8562a'); c.shadowBlur = 0; },
    ab_spark(c) { poly(c, [[18, 3], [8, 18], [15, 18], [12, 29], [24, 13], [17, 13]], '#7ae6ff', 1.5); },
    ab_ward(c) { c.beginPath(); c.moveTo(16, 4); c.lineTo(27, 9); c.quadraticCurveTo(27, 23, 16, 29); c.quadraticCurveTo(5, 23, 5, 9); c.closePath(); c.fillStyle = '#7a9cff'; c.fill(); c.lineWidth = 2; c.strokeStyle = OUT; c.stroke(); blob(c, 16, 15, 4, '#d4e0ff', false); },
    ab_chain(c) { poly(c, [[14, 3], [6, 16], [12, 16], [8, 29], [18, 14], [12, 14]], '#c78aff', 1.5); poly(c, [[24, 8], [19, 17], [23, 17], [20, 26], [27, 15], [23, 15]], '#7ae6ff', 1.2); },
    ab_cleave(c) { c.beginPath(); c.arc(16, 22, 13, Math.PI * 1.1, Math.PI * 1.9); c.strokeStyle = '#f2ecfa'; c.lineWidth = 4; c.lineCap = 'round'; c.stroke(); line(c, 16, 26, 26, 10, '#c9cfdc', 3); },
    ab_charge(c) { poly(c, [[4, 12], [18, 12], [18, 6], [29, 16], [18, 26], [18, 20], [4, 20]], '#f5a53a'); },
    ab_unstop(c) { c.beginPath(); c.moveTo(16, 4); c.lineTo(27, 9); c.quadraticCurveTo(27, 23, 16, 29); c.quadraticCurveTo(5, 23, 5, 9); c.closePath(); c.fillStyle = '#e8763a'; c.fill(); c.lineWidth = 2; c.strokeStyle = OUT; c.stroke(); poly(c, [[11, 18], [16, 10], [21, 18]], '#ffe08a', 1.5); line(c, 16, 12, 16, 23, '#ffe08a', 3); },
    ab_whirl(c) { c.beginPath(); for (let t = 0; t < 12; t += 0.2) { const r = t * 1.1; c.lineTo(16 + Math.cos(t) * r, 16 + Math.sin(t) * r); } c.strokeStyle = '#f2ecfa'; c.lineWidth = 2.5; c.stroke(); },
    ab_cry(c) { poly(c, [[5, 13], [12, 13], [22, 6], [22, 26], [12, 19], [5, 19]], '#f5b94a'); line(c, 25, 11, 28, 9, '#f5b94a', 2); line(c, 25, 16, 29, 16, '#f5b94a', 2); line(c, 25, 21, 28, 23, '#f5b94a', 2); },
    ab_slam(c) { rrect(c, 9, 4, 14, 14, 4, '#e0a46a'); line(c, 3, 26, 29, 26, '#c9b6e8', 3); line(c, 8, 22, 4, 18, '#c9b6e8', 2); line(c, 24, 22, 28, 18, '#c9b6e8', 2); },
    tool(c) { line(c, 7, 27, 22, 8, '#8a5a2e', 3); c.beginPath(); c.ellipse(23, 9, 6, 4, -0.7, 0, 7); c.strokeStyle = '#e9e2f2'; c.lineWidth = 2; c.stroke(); line(c, 19, 12, 27, 6, '#e9e2f2', 1); },
    none(c) { line(c, 10, 16, 22, 16, '#8b7aa6', 3); },
    almanac(c) { rrect(c, 6, 5, 20, 23, 3, '#7b4fa0'); line(c, 10, 5, 10, 28, OUT, 2); blob(c, 18, 15, 4, '#f5b94a'); },
  };

  function iconFor(id) {
    if (ICONS[id]) return id;
    return 'none';
  }

  function drawIcon(c, id, x, y, size) {
    c.save(); c.translate(x, y); c.scale(size / 32, size / 32);
    (ICONS[iconFor(id)])(c);
    c.restore();
  }

  function iconURL(id, size) {
    size = size || 32;
    const k = id + '@' + size;
    if (cache[k]) return cache[k];
    const cv = document.createElement('canvas');
    cv.width = cv.height = size * 2;
    const c = cv.getContext('2d');
    drawIcon(c, id, 0, 0, size * 2);
    return (cache[k] = cv.toDataURL());
  }

  // gear icon id for a gear item
  function gearIcon(g, cls) {
    if (g.slot === 'weapon') return cls === 'mage' ? 'staff' : cls === 'brawler' ? 'blade' : 'knives';
    return g.slot;
  }

  window.Icons = { drawIcon, iconURL, gearIcon, has: (id) => !!ICONS[id] };
})();
