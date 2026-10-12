// Shared game data — loaded by both the Node server and the browser client.
(function (root) {
  const TILE = 32;

  // ---------------------------------------------------------------- classes
  const CLASSES = {
    ranger: {
      name: 'Ranger', sprite: 'ranger', hp: 110, speed: 160, scale: 0.5,
      desc: 'Quick and slippery. Throws knives from range and rolls out of danger.',
      builds: [
        { name: 'Hunter', abilities: { lmb: 'knives', rmb: 'roll', q: 'owl', e: 'rapidfire' } },
        { name: 'Shadow', abilities: { lmb: 'knives', rmb: 'roll', q: 'stealth', e: 'volley' } },
      ],
    },
    mage: {
      name: 'Mage', sprite: 'mage', hp: 95, speed: 150, scale: 0.42,
      desc: 'Fragile, but hits hard. Ember bolts, blinks and big area spells.',
      builds: [
        { name: 'Ember', abilities: { lmb: 'emberbolt', rmb: 'blink', q: 'frostnova', e: 'meteor' } },
        { name: 'Storm', abilities: { lmb: 'spark', rmb: 'blink', q: 'ward', e: 'chain' } },
      ],
    },
    brawler: {
      name: 'Brawler', sprite: 'brawler', hp: 140, speed: 152, scale: 0.44,
      desc: 'Up close and sturdy. Cleaves crowds and shrugs off hits.',
      builds: [
        { name: 'Bruiser', abilities: { lmb: 'cleave', rmb: 'charge', q: 'unstoppable', e: 'whirlwind' } },
        { name: 'Warden', abilities: { lmb: 'cleave', rmb: 'charge', q: 'battlecry', e: 'slam' } },
      ],
    },
  };

  // cd = seconds, mult = x weapon power
  const ABILITIES = {
    knives:      { name: 'Throwing Knives', cd: 0.45, mult: 0.62, icon: 'ab_knives', desc: 'Throw a fan of 3 knives toward the cursor.' },
    roll:        { name: 'Dodge Roll', cd: 1.0, icon: 'ab_roll', desc: 'Roll toward where you are moving. You cannot be hit while rolling.' },
    owl:         { name: 'Owl Companion', cd: 14, dur: 10, mult: 0.5, icon: 'ab_owl', desc: 'Call an owl that flies with you for 10s and pecks the nearest foe.' },
    rapidfire:   { name: 'Rapid Fire', cd: 10, mult: 0.45, icon: 'ab_rapid', desc: 'Throw 12 knives in quick succession at the cursor.' },
    stealth:     { name: 'Stealth', cd: 16, dur: 4, icon: 'ab_stealth', desc: 'Vanish for 4s. Monsters lose track of you and stop attacking. Your next hit deals +80% damage.' },
    volley:      { name: 'Piercing Volley', cd: 8, mult: 1.1, icon: 'ab_volley', desc: 'Fire 5 arrows in a wide fan that pass through every foe.' },
    emberbolt:   { name: 'Ember Bolt', cd: 0.55, mult: 1.0, icon: 'ab_ember', desc: 'A bolt of fire that bursts on impact, splashing nearby foes.' },
    blink:       { name: 'Blink', cd: 3, icon: 'ab_blink', desc: 'Teleport a short distance toward the cursor.' },
    frostnova:   { name: 'Frost Nova', cd: 9, mult: 1.3, icon: 'ab_frost', desc: 'Blast frost around you, damaging and slowing nearby foes for 3s.' },
    meteor:      { name: 'Meteor', cd: 11, mult: 3.0, icon: 'ab_meteor', desc: 'Call a meteor at the cursor. It lands after a short delay for huge damage.' },
    spark:       { name: 'Spark', cd: 0.4, mult: 0.75, icon: 'ab_spark', desc: 'A fast spark that jumps to a second foe.' },
    ward:        { name: 'Arcane Ward', cd: 15, dur: 5, icon: 'ab_ward', desc: 'A shield that absorbs damage equal to 40% of your max HP for 5s.' },
    chain:       { name: 'Chain Lightning', cd: 8, mult: 1.5, icon: 'ab_chain', desc: 'Lightning strikes up to 5 foes near the cursor.' },
    cleave:      { name: 'Cleave', cd: 0.5, mult: 1.2, icon: 'ab_cleave', desc: 'Swing your blade in a wide arc in front of you.' },
    charge:      { name: 'Shoulder Charge', cd: 4, mult: 1.0, icon: 'ab_charge', desc: 'Dash forward, slamming every foe in your path.' },
    unstoppable: { name: 'Unstoppable', cd: 16, dur: 5, icon: 'ab_unstop', desc: 'For 5s you take 50% less damage and cannot be slowed or knocked back.' },
    whirlwind:   { name: 'Whirlwind', cd: 9, mult: 0.6, icon: 'ab_whirl', desc: 'Spin for 1.5s, hitting everything around you 6 times.' },
    battlecry:   { name: 'Battle Cry', cd: 18, dur: 6, icon: 'ab_cry', desc: 'Heal yourself and nearby allies for 20% HP and grant +25% damage for 6s.' },
    slam:        { name: 'Ground Slam', cd: 10, mult: 1.8, icon: 'ab_slam', desc: 'Smash the ground, damaging and stunning foes around you for 1.5s.' },
  };

  // ---------------------------------------------------------------- enemies
  // behaviour: hop, dash, shoot, sprint, ring, swing, mark, spear, spin, roll
  const ENEMIES = {
    frog:       { name: 'Hoppy Frog', sprite: 'frog', blurb: 'jumps on you', ai: 'hop', hp: 42, dmg: 12, speed: 70, r: 14, scale: 0.62 },
    bee:        { name: 'Stinger Bee', sprite: 'bee', blurb: 'sting-dashes', ai: 'dash', hp: 30, dmg: 11, speed: 95, r: 13, scale: 0.55, fly: true },
    squirrel:   { name: 'Acorn Squirrel', sprite: 'squirrel', blurb: 'shoots', ai: 'shoot', hp: 32, dmg: 9, speed: 85, r: 13, scale: 0.6, proj: 'acorn' },
    hare:       { name: 'Kicking Hare', sprite: 'hare', blurb: 'sprints and strikes', ai: 'sprint', hp: 38, dmg: 13, speed: 105, r: 13, scale: 0.6 },
    mushroom:   { name: 'Spore Mushroom', sprite: 'mushroom', blurb: 'puffs a ring of spores', ai: 'ring', hp: 46, dmg: 9, speed: 45, r: 15, scale: 0.6, proj: 'spore' },
    quillbird:  { name: 'Quill Bird', sprite: 'quillbird', blurb: 'shoots', ai: 'shoot', hp: 30, dmg: 9, speed: 90, r: 14, scale: 0.55, fly: true, proj: 'quill', spread: 3 },
    crab:       { name: 'Pincher Crab', sprite: 'crab', blurb: 'swings a weapon', ai: 'swing', hp: 58, dmg: 15, speed: 65, r: 17, scale: 0.55 },
    jelly:      { name: 'Drifting Jelly', sprite: 'jelly', blurb: 'puffs a ring of spores', ai: 'ring', hp: 36, dmg: 9, speed: 50, r: 14, scale: 0.65, fly: true, proj: 'bubble' },
    wretch:     { name: 'Drowned Wretch', sprite: 'wretch', blurb: 'sprints and strikes', ai: 'sprint', hp: 44, dmg: 13, speed: 92, r: 13, scale: 0.6 },
    siren:      { name: 'Cellar Siren', sprite: 'siren', blurb: 'marks the ground, then it erupts', ai: 'mark', hp: 36, dmg: 16, speed: 60, r: 13, scale: 0.55 },
    soldier:    { name: 'Tin Soldier', sprite: 'soldier', blurb: 'jabs a long spear', ai: 'spear', hp: 50, dmg: 15, speed: 72, r: 13, scale: 0.55 },
    cogbot:     { name: 'Clockwork Cogbot', sprite: 'cogbot', blurb: 'spins its blades', ai: 'spin', hp: 54, dmg: 8, speed: 70, r: 17, scale: 0.55 },
    jester:     { name: 'Spring Jester Doll', sprite: 'jester', blurb: 'jumps on you', ai: 'hop', hp: 44, dmg: 14, speed: 78, r: 14, scale: 0.58 },
    glimmerbug: { name: 'Glimmerbug', sprite: 'glimmerbug', blurb: 'shoots', ai: 'shoot', hp: 28, dmg: 9, speed: 80, r: 13, scale: 0.6, fly: true, proj: 'glimmer', homing: true },
    pillbug:    { name: 'Rolly Pillbug', sprite: 'pillbug', blurb: 'rolls and bounces', ai: 'roll', hp: 48, dmg: 13, speed: 60, r: 14, scale: 0.6 },
  };

  // ---------------------------------------------------------------- dungeons
  const DUNGEONS = {
    crypt: {
      name: 'The Hushed Crypt', short: 'Hushed Crypt', lvl: 1, rec: 1, rooms: 8, theme: 'crypt',
      pool: ['wretch', 'siren', 'glimmerbug', 'mushroom'],
      boss: { name: 'The Hushed Matron', sprite: 'siren', base: 'siren', scale: 1.5, hp: 520, tint: '#9fe3ff', moves: ['mark', 'ring', 'summon', 'sprint'] },
      traveler: true,
      blurb: 'A quiet crypt beneath the old chapel. The first crust piece rests here.',
    },
    bramble: {
      name: 'Bramble Hollow', short: 'Bramble Hollow', lvl: 3, rec: 3, rooms: 10, theme: 'bramble',
      pool: ['frog', 'bee', 'squirrel', 'hare', 'quillbird'],
      boss: { name: 'Old Thumper', sprite: 'hare', base: 'hare', scale: 1.9, hp: 900, tint: '#ffd27a', moves: ['sprint', 'hop', 'ring', 'summon'] },
      blurb: 'An overgrown thicket full of jumpy critters.',
    },
    grotto: {
      name: 'Tidewater Grotto', short: 'Tidewater Grotto', lvl: 6, rec: 6, rooms: 11, theme: 'grotto',
      pool: ['crab', 'jelly', 'pillbug', 'wretch'],
      boss: { name: 'Captain Pinch', sprite: 'crab', base: 'crab', scale: 1.9, hp: 1500, tint: '#ff9a7a', moves: ['swing', 'roll', 'ring', 'summon'] },
      blurb: 'Damp caves where the tide leaves strange things behind.',
    },
    attic: {
      name: 'The Toybox Attic', short: 'Toybox Attic', lvl: 9, rec: 9, rooms: 12, theme: 'attic',
      pool: ['soldier', 'cogbot', 'jester', 'glimmerbug'],
      boss: { name: 'Jack-in-the-Box', sprite: 'jester', base: 'jester', scale: 2.0, hp: 2300, tint: '#e7b6ff', moves: ['hop', 'spin', 'ring', 'summon', 'mark'] },
      blurb: 'Forgotten toys that wind themselves up at night.',
    },
    furnace: {
      name: 'The Pie-Oven Furnace', short: 'Pie-Oven Furnace', lvl: 11, rec: 11, rooms: 13, theme: 'furnace',
      pool: ['cogbot', 'soldier', 'pillbug', 'glimmerbug', 'mushroom'],
      boss: { name: 'The Oven Warden', sprite: 'soldier', base: 'soldier', scale: 2.1, hp: 3400, tint: '#ffb070', moves: ['spear', 'mark', 'ring', 'spin', 'summon'] },
      blurb: 'The great oven where the Hearth Pie was first baked. Scorching hot.',
    },
  };
  const DUNGEON_ORDER = ['crypt', 'bramble', 'grotto', 'attic', 'furnace'];

  const THEMES = {
    crypt:   { floor: '#4b4a5e', floor2: '#55546a', grout: '#3a394b', wall: '#1f1d2b', wallTop: '#36334a', patch: '#3f6b63', patch2: '#4f8077', light: [190, 220, 255], dark: 0.82 },
    bramble: { floor: '#5b6b3a', floor2: '#667842', grout: '#4b5a2f', wall: '#1e3020', wallTop: '#2f4a2c', patch: '#7a8c3f', patch2: '#c58fd0', light: [255, 240, 200], dark: 0.55 },
    grotto:  { floor: '#3f5f6b', floor2: '#476b78', grout: '#33505a', wall: '#1a2a33', wallTop: '#2d4552', patch: '#2f7f8f', patch2: '#5fb0b8', light: [190, 240, 255], dark: 0.72 },
    attic:   { floor: '#6b4f3a', floor2: '#775940', grout: '#563f2e', wall: '#2a1d18', wallTop: '#47332a', patch: '#8a3f4f', patch2: '#c46a6a', light: [255, 220, 170], dark: 0.7 },
    furnace: { floor: '#5a3a2a', floor2: '#633f2d', grout: '#47291d', wall: '#24140f', wallTop: '#3d2318', patch: '#d0641f', patch2: '#e8853a', light: [255, 200, 140], dark: 0.66 },
  };

  // ---------------------------------------------------------------- items
  // stackables. icon ids are drawn by the client
  const ITEMS = {
    wood:          { name: 'Logs', icon: 'wood', desc: 'Chopped from trees. Used for building.', sell: 1 },
    stone:         { name: 'Stone', icon: 'stone', desc: 'Mined from rocks. Used for building.', sell: 1 },
    berries:       { name: 'Berries', icon: 'berries', desc: 'Picked from berry bushes or grown in farm beds. Used for cooking.', sell: 2 },
    wheat:         { name: 'Wheat', icon: 'wheat', desc: 'Grown in farm beds. Used for cooking.', sell: 3 },
    pumpkin:       { name: 'Pumpkin', icon: 'pumpkin', desc: 'Grown in farm beds. Used for cooking.', sell: 8 },
    fish:          { name: 'Fish', icon: 'fish', desc: 'Caught with a fishing rod. Used for cooking.', sell: 6 },
    golden_fish:   { name: 'Golden Carp', icon: 'golden_fish', desc: 'A rare shimmering catch. Grinny pays well for these.', sell: 60 },
    bronze_ore:    { name: 'Bronze Ore', icon: 'bronze_ore', desc: 'Mined in the Hollow Mine. Smelt 2 into a Bronze Bar.', sell: 4 },
    iron_ore:      { name: 'Iron Ore', icon: 'iron_ore', desc: 'Mined deep in the Hollow Mine. Smelt 2 + 1 Coal into an Iron Bar.', sell: 6 },
    coal:          { name: 'Coal', icon: 'coal', desc: 'Fuel. Used for Iron Bars and Level 2 stove recipes.', sell: 3 },
    bronze_bar:    { name: 'Bronze Bar', icon: 'bronze_bar', desc: 'Used for forging and upgrades.', sell: 12 },
    iron_bar:      { name: 'Iron Bar', icon: 'iron_bar', desc: 'Used for forging and upgrades.', sell: 20 },
    ember_core:    { name: 'Ember Core', icon: 'ember_core', desc: 'A still-warm core dropped in the Toybox Attic and Pie-Oven Furnace. Used for Ember gear.', sell: 30 },
    berry_seed:    { name: 'Berry Seeds', icon: 'seed_berry', desc: 'Plant in a Farm Bed. Ready in 1 day. Yields 4 Berries.', sell: 3, seed: 'berries' },
    wheat_seed:    { name: 'Wheat Seeds', icon: 'seed_wheat', desc: 'Plant in a Farm Bed. Ready in 2 days. Yields 4 Wheat.', sell: 5, seed: 'wheat' },
    pumpkin_seed:  { name: 'Pumpkin Seeds', icon: 'seed_pumpkin', desc: 'Plant in a Farm Bed. Ready in 3 days. Yields 2 Pumpkins.', sell: 10, seed: 'pumpkin' },
    crust_piece:   { name: 'Crust Piece', icon: 'crust', desc: 'A piece of the shattered Hearth Pie. Candlewick wants these.', sell: 0, story: true },
    fishing_rod:   { name: 'Fishing Rod', icon: 'rod', desc: 'Press R (Tool) facing water to cast.', sell: 0, tool: true },
    // meals
    berry_bite:    { name: 'Berry Bite', icon: 'meal_berry', meal: { heal: 35 }, desc: 'Heals 35 HP.', sell: 8 },
    skewer:        { name: 'Fish & Berry Skewer', icon: 'meal_skewer', meal: { heal: 60, buff: 'dmg', amt: 0.15, dur: 180 }, desc: 'Heals 60 HP. +15% damage for 3 minutes.', sell: 18 },
    wheat_bun:     { name: 'Wheat Bun', icon: 'meal_bun', meal: { heal: 55, buff: 'regen', amt: 2, dur: 180 }, desc: 'Heals 55 HP. Regenerate 2 HP/s for 3 minutes.', sell: 14 },
    hearty_stew:   { name: 'Hearty Stew', icon: 'meal_stew', meal: { heal: 90, buff: 'def', amt: 0.25, dur: 240 }, desc: 'Heals 90 HP. Take 25% less damage for 4 minutes.', sell: 35 },
    pumpkin_pie:   { name: 'Pumpkin Pie', icon: 'meal_pie', meal: { heal: 130, buff: 'dmg', amt: 0.3, dur: 240 }, desc: 'Heals 130 HP. +30% damage for 4 minutes.', sell: 55 },
    hearth_pie:    { name: 'The Hearth Pie', icon: 'meal_hearth', desc: 'The legendary pie, whole again. Bring it to Candlewick!', sell: 0, story: true },
  };

  // cooking. renown = homestead renown needed. stove = stove level needed
  const RECIPES = {
    berry_bite:  { in: { berries: 3 }, renown: 0, stove: 1 },
    skewer:      { in: { fish: 1, berries: 2 }, renown: 10, stove: 1 },
    wheat_bun:   { in: { wheat: 2 }, renown: 20, stove: 1 },
    hearty_stew: { in: { fish: 2, wheat: 2, pumpkin: 1, coal: 1 }, renown: 32, stove: 2 },
    pumpkin_pie: { in: { pumpkin: 2, wheat: 2, berries: 2, coal: 1 }, renown: 45, stove: 2 },
    hearth_pie:  { in: { crust_piece: 5, pumpkin: 1, wheat: 2, berries: 3 }, renown: 0, stove: 2, story: true },
  };

  const SMELT = {
    bronze_bar: { in: { bronze_ore: 2 } },
    iron_bar: { in: { iron_ore: 2, coal: 1 } },
  };

  // ---------------------------------------------------------------- gear
  const SLOTS = ['weapon', 'helmet', 'body', 'charm'];
  const GEAR_NAMES = {
    ranger: { weapon: 'Knives', helmet: 'Hood', body: 'Leathers' },
    mage: { weapon: 'Staff', helmet: 'Hat', body: 'Robe' },
    brawler: { weapon: 'Blade', helmet: 'Helm', body: 'Plate' },
  };
  const TIERS = {
    starter: { name: 'Traveler\'s', lvl: 1 },
    sturdy:  { name: 'Sturdy', lvl: 3, cost: { wood: 12, stone: 8 }, crumbs: 60, temper: 'stone' },
    bronze:  { name: 'Bronze', lvl: 6, cost: { bronze_bar: 3, wood: 5 }, crumbs: 200, temper: 'bronze_bar' },
    iron:    { name: 'Iron', lvl: 9, cost: { iron_bar: 3, coal: 2 }, crumbs: 450, temper: 'iron_bar' },
    ember:   { name: 'Ember', lvl: 12, cost: { iron_bar: 2, ember_core: 3 }, crumbs: 900, temper: 'ember_core' },
    found:   { name: '', lvl: 0 },
  };
  const FORGE_TIERS = ['sturdy', 'bronze', 'iron', 'ember'];
  const CHARMS = {
    spooky: { name: 'Spooky Charm', stat: 'crit', base: 0.05, per: 0.005, desc: 'chance to land a critical hit for double damage' },
    lucky:  { name: 'Lucky Charm', stat: 'crumbs', base: 0.15, per: 0.02, desc: 'more Crumbs from every pickup' },
    swift:  { name: 'Swift Charm', stat: 'speed', base: 0.08, per: 0.006, desc: 'faster movement speed' },
    hearty: { name: 'Hearty Charm', stat: 'hpPct', base: 0.08, per: 0.01, desc: 'more max HP' },
  };

  function gearStats(item) {
    const L = item.lvl;
    if (item.slot === 'weapon') return { power: 10 + 4 * L };
    if (item.slot === 'helmet') return { hp: 6 * L, def: 1 * L };
    if (item.slot === 'body') return { hp: 10 * L, def: 2 * L };
    if (item.slot === 'charm') {
      const c = CHARMS[item.charm] || CHARMS.spooky;
      return { [c.stat]: +(c.base + c.per * (L - 1)).toFixed(3) };
    }
    return {};
  }

  function temperCost(item) {
    const t = TIERS[item.tier] && TIERS[item.tier].temper ? item.tier : (item.lvl >= 9 ? 'iron' : item.lvl >= 6 ? 'bronze' : 'sturdy');
    return { crumbs: 25 * item.lvl + 20, mat: TIERS[t].temper, matN: 1 + Math.floor(item.lvl / 4) };
  }
  function temperMax(item) {
    const base = TIERS[item.tier] && TIERS[item.tier].lvl ? TIERS[item.tier].lvl : item.baseLvl || item.lvl;
    return base + 2;
  }

  // ---------------------------------------------------------------- buildings (homestead)
  // w,h in tiles (before rotation)
  const BUILDINGS = {
    cottage:  { name: 'Cottage', w: 4, h: 3, cost: { wood: 30, stone: 15 }, renown: 10, max: 1, desc: 'Your home. Sleep here to pass the night.' },
    stove:    { name: 'Kitchen Stove', w: 2, h: 2, cost: { wood: 25, stone: 15 }, renown: 5, max: 1, needs: 'cottage', desc: 'Cook meals. Upgrade to Level 2 for advanced recipes.', upgrade: { cost: { bronze_bar: 3, stone: 8, wood: 8 }, renown: 5 } },
    farmbed:  { name: 'Farm Bed', w: 2, h: 2, cost: { wood: 5 }, renown: 2, max: 12, needs: 'cottage', desc: 'Plant seeds here.' },
    anvil:    { name: 'Anvil', w: 2, h: 1, cost: { wood: 20, stone: 20 }, renown: 5, max: 1, needs: 'cottage', desc: 'Forge and temper gear.' },
    smelter:  { name: 'Smelter', w: 2, h: 2, cost: { stone: 15, wood: 5 }, renown: 5, max: 1, needs: 'cottage', desc: 'Smelt ore into bars.' },
    chest:    { name: 'Storage Chest', w: 1, h: 1, cost: { wood: 10 }, renown: 2, max: 4, needs: 'cottage', desc: 'Decorative storage chest.' },
    lantern:  { name: 'Lantern Post', w: 1, h: 1, cost: { wood: 4, stone: 2 }, renown: 2, max: 20, needs: 'cottage', desc: 'Lights up the night.' },
    flowers:  { name: 'Flower Pot', w: 1, h: 1, cost: { stone: 3, berries: 2 }, renown: 3, max: 20, needs: 'cottage', desc: 'Pretty! Adds renown.' },
    fence:    { name: 'Fence', w: 1, h: 1, cost: { wood: 2 }, renown: 1, max: 60, needs: 'cottage', desc: 'A little picket fence.' },
    bench:    { name: 'Bench', w: 2, h: 1, cost: { wood: 8 }, renown: 3, max: 6, needs: 'cottage', desc: 'A cozy place to sit.' },
  };

  // ---------------------------------------------------------------- npcs & shops
  const NPCS = {
    candlewick: { name: 'Candlewick', sprite: 'candlewick', scale: 0.5, title: 'Hearthkeeper' },
    velvet:     { name: 'Madame Velvet', sprite: 'velvet', scale: 0.42, title: 'Seeds & Farming' },
    sugarplum:  { name: 'Sugarplum', sprite: 'sugarplum', scale: 0.42, title: 'Sweets & Decor' },
    grinny:     { name: 'Grinny', sprite: 'grinny', scale: 0.45, title: 'Fisher' },
    stitch:     { name: 'Stitch', sprite: 'stitch', scale: 0.42, title: 'Tailor' },
  };

  const SHOPS = {
    velvet: { sells: [['berry_seed', 10], ['wheat_seed', 15], ['pumpkin_seed', 30]], buys: ['berries', 'wheat', 'pumpkin'] },
    sugarplum: { sells: [['berries', 6], ['wheat', 9]], buys: ['berry_bite', 'skewer', 'wheat_bun', 'hearty_stew', 'pumpkin_pie'] },
    grinny: { sells: [['fishing_rod', 40]], buys: ['fish', 'golden_fish'] },
    candlewick: { sells: [['charm:spooky', 120], ['charm:lucky', 120]], buys: ['bronze_ore', 'iron_ore', 'coal', 'bronze_bar', 'iron_bar', 'ember_core', 'wood', 'stone'] },
    stitch: { sells: [['gear:helmet:4', 180], ['gear:body:4', 240], ['charm:swift', 160], ['charm:hearty', 160], ['gear:helmet:8', 520], ['gear:body:8', 700]], buys: [] },
  };

  // ---------------------------------------------------------------- quests
  // step types: talk, open_map, clear, deliver, visit, have, build, cook, buy, plant, forge, equip, catch, smelt, upgrade
  // guide: where the arrow points  {zone:'village'|'home'|'mine'|'dungeon', npc?, obj?}
  const QUESTS = [
    { id: 'q_welcome', name: 'Welcome to Hollowhearth', steps: [
      { type: 'talk', npc: 'candlewick', text: 'Talk to Candlewick by the hearth in the village square.', guide: { zone: 'village', npc: 'candlewick' } },
    ] },
    { id: 'q_crypt', name: 'The Hushed Crypt', steps: [
      { type: 'open_map', text: 'Open the Expedition Map at the north end of the village.', guide: { zone: 'village', obj: 'expedition' } },
      { type: 'clear', dungeon: 'crypt', text: 'Clear The Hushed Crypt and recover the first Crust Piece.', guide: { zone: 'village', obj: 'expedition' } },
      { type: 'talk', npc: 'candlewick', text: 'Bring the Crust Piece back to Candlewick.', guide: { zone: 'village', npc: 'candlewick' } },
    ] },
    { id: 'q_home', name: 'A Home of Your Own', steps: [
      { type: 'visit', zone: 'home', text: 'Follow the east road to your Homestead.', guide: { zone: 'village', obj: 'signpost' } },
      { type: 'have', items: { wood: 30, stone: 15 }, text: 'Gather 30 Logs and 15 Stone (hold E or R by trees and rocks).', guide: { zone: 'home', obj: 'node' } },
      { type: 'build', building: 'cottage', text: 'Press B to open the build menu and build a Cottage.', guide: { zone: 'home' } },
    ] },
    { id: 'q_cook', name: 'Hearth Cooking', steps: [
      { type: 'build', building: 'stove', text: 'Build a Kitchen Stove (B). Needs 25 Logs and 15 Stone.', guide: { zone: 'home' } },
      { type: 'cook', recipe: 'berry_bite', text: 'Pick berries from bushes and cook a Berry Bite at your stove.', guide: { zone: 'home', obj: 'stove' } },
      { type: 'deliver', npc: 'candlewick', item: 'berry_bite', text: 'Bring a Berry Bite to Candlewick.', guide: { zone: 'village', npc: 'candlewick' } },
    ] },
    { id: 'q_farm', name: 'Seeds of Spring', steps: [
      { type: 'buy', item: 'seed', text: 'Buy seeds from Madame Velvet at the market (west of the square).', guide: { zone: 'village', npc: 'velvet' } },
      { type: 'build', building: 'farmbed', text: 'Build a Farm Bed at your homestead (B).', guide: { zone: 'home' } },
      { type: 'plant', text: 'Plant your seeds in the Farm Bed (E).', guide: { zone: 'home', obj: 'farmbed' } },
    ] },
    { id: 'q_gear', name: 'Gear Up', steps: [
      { type: 'build', building: 'anvil', text: 'Build an Anvil at your homestead (B).', guide: { zone: 'home' } },
      { type: 'forge', text: 'Forge a new weapon at the Anvil (uses Logs, Stone and Crumbs).', guide: { zone: 'home', obj: 'anvil' } },
      { type: 'equip', slot: 'weapon', text: 'Equip your new weapon: press I, then click it.', guide: null },
    ] },
    { id: 'q_bramble', name: 'Into the Bramble', steps: [
      { type: 'clear', dungeon: 'bramble', text: 'Clear Bramble Hollow.', guide: { zone: 'village', obj: 'expedition' } },
      { type: 'talk', npc: 'candlewick', text: 'Bring the second Crust Piece to Candlewick.', guide: { zone: 'village', npc: 'candlewick' } },
    ] },
    { id: 'q_fish', name: 'Gone Fishing', steps: [
      { type: 'talk', npc: 'grinny', text: 'Talk to Grinny on the dock by the lake (south-west).', guide: { zone: 'village', npc: 'grinny' } },
      { type: 'catch', n: 3, text: 'Catch 3 fish: face the water and press R, then press E when you see "!".', guide: { zone: 'village', obj: 'lake' } },
    ] },
    { id: 'q_mine', name: 'The Hollow Mine', steps: [
      { type: 'visit', zone: 'mine', text: 'Enter the Hollow Mine (cave in the north-west of the village).', guide: { zone: 'village', obj: 'mine' } },
      { type: 'have', items: { bronze_ore: 6 }, text: 'Mine 6 Bronze Ore (orange-speckled rocks).', guide: { zone: 'mine', obj: 'node' } },
      { type: 'build', building: 'smelter', text: 'Build a Smelter at your homestead (B).', guide: { zone: 'home' } },
      { type: 'smelt', item: 'bronze_bar', n: 3, text: 'Smelt 3 Bronze Bars at the Smelter.', guide: { zone: 'home', obj: 'smelter' } },
      { type: 'upgrade', building: 'stove', text: 'Upgrade your Kitchen Stove to Level 2 (3 Bronze Bars, 8 Stone, 8 Logs).', guide: { zone: 'home', obj: 'stove' } },
    ] },
    { id: 'q_grotto', name: 'Tidewater Grotto', steps: [
      { type: 'clear', dungeon: 'grotto', text: 'Clear Tidewater Grotto.', guide: { zone: 'village', obj: 'expedition' } },
      { type: 'talk', npc: 'candlewick', text: 'Bring the third Crust Piece to Candlewick.', guide: { zone: 'village', npc: 'candlewick' } },
    ] },
    { id: 'q_attic', name: 'The Toybox Attic', steps: [
      { type: 'clear', dungeon: 'attic', text: 'Clear The Toybox Attic.', guide: { zone: 'village', obj: 'expedition' } },
      { type: 'talk', npc: 'candlewick', text: 'Bring the fourth Crust Piece to Candlewick.', guide: { zone: 'village', npc: 'candlewick' } },
    ] },
    { id: 'q_furnace', name: 'The Oven Warden', steps: [
      { type: 'clear', dungeon: 'furnace', text: 'Defeat The Oven Warden in The Pie-Oven Furnace.', guide: { zone: 'village', obj: 'expedition' } },
      { type: 'talk', npc: 'candlewick', text: 'Bring the last Crust Piece to Candlewick.', guide: { zone: 'village', npc: 'candlewick' } },
    ] },
    { id: 'q_pie', name: 'The Hearth Pie', steps: [
      { type: 'cook', recipe: 'hearth_pie', text: 'Bake The Hearth Pie at your Level 2 stove (5 Crust Pieces, 1 Pumpkin, 2 Wheat, 3 Berries).', guide: { zone: 'home', obj: 'stove' } },
      { type: 'deliver', npc: 'candlewick', item: 'hearth_pie', text: 'Bring The Hearth Pie to Candlewick.', guide: { zone: 'village', npc: 'candlewick' } },
    ] },
  ];

  const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
  const DAYS_PER_SEASON = 7;
  const DAY_SECONDS = 360; // one in-game day = 6 real minutes (or sleep)

  const TIPS = [
    'Cook meals at your Kitchen Stove: they heal you and give strong bonuses. Press G in a fight to eat your selected meal.',
    'Forge and temper gear at your Anvil. Going in under-geared makes foes much tougher.',
    'Red shapes on the ground show where an attack will land. Dodge out of them!',
    'Right click to dodge, blink or charge out of danger.',
    'Press L to swap to your other build. Each class has two.',
  ];

  function renownOf(home) {
    let r = 0;
    for (const b of home.buildings || []) {
      const d = BUILDINGS[b.type];
      if (!d) continue;
      r += d.renown;
      if (b.lvl >= 2 && d.upgrade) r += d.upgrade.renown;
    }
    return r;
  }

  const D = {
    TILE, CLASSES, ABILITIES, ENEMIES, DUNGEONS, DUNGEON_ORDER, THEMES, ITEMS, RECIPES, SMELT,
    SLOTS, GEAR_NAMES, TIERS, FORGE_TIERS, CHARMS, gearStats, temperCost, temperMax,
    BUILDINGS, NPCS, SHOPS, QUESTS, SEASONS, DAYS_PER_SEASON, DAY_SECONDS, TIPS, renownOf,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = D;
  else root.GameData = D;
})(typeof window !== 'undefined' ? window : globalThis);
