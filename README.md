# Hollowhearth

A cozy co-op multiplayer action RPG, rebuilt from the reference material in this folder
(`23.png` enemy sheet, `image.png` class/villager sheet, the gameplay GIF and the playtest-notes GIF).

## Run it

1. Install [Node.js](https://nodejs.org) (v18+).
2. Double-click **start.bat** (or run `npm install` then `npm start`).
3. Open http://localhost:3000. Friends on your Wi-Fi/LAN open the `http://192.168.x.x:3000` address the server prints.

Enter a username and password and click **Create account** (then pick Ranger, Mage or Brawler).
Next time, enter the same username and password and click **Log in** to load your save. Accounts are stored only on
your own server in `saves/` (passwords are salted and hashed, never stored as plain text). Saves autosave every 20 seconds.

## Playing with friends over the internet

Double-click **start-online.bat**. It starts the game and a Cloudflare tunnel, then shows a
`https://....trycloudflare.com` link (also copied to your clipboard). Send that link to friends; they open it in a
browser and create an account. Keep the window open while people play. The link changes each time you start it.

- Your PC must stay on with that window open.
- **Same Wi-Fi only:** `start.bat` is enough; friends use the `http://192.168.x.x:3000` address it prints.
- **Always online:** host the folder on a small cloud server (any Node.js host) so it runs without your PC.

## Controls

| Key | Action |
| --- | --- |
| WASD | Move |
| Left click (hold) | Basic attack toward the mouse |
| Right click | Dodge roll / Blink / Shoulder charge |
| Q, E | Class abilities |
| E | Talk / interact when a prompt shows |
| R (hold) | Tool: chop, mine, pick berries; fish at water |
| G | Eat selected meal |
| L | Swap build (each class has two) |
| I / J / K | Inventory / Journal / Almanac |
| B | Build menu on your homestead (R rotates, X removes) |
| M | Mute / unmute music (volume slider in the Esc menu) |
| Enter | Chat |
| Esc | Close the top menu, or open the game menu |

## What's in it

- **Village (Hollowhearth)**: Candlewick at the hearth (main story), Madame Velvet (seeds), Sugarplum (sweets),
  Grinny at the lake (fishing), Stitch (tailor, once rescued from the Hushed Crypt), the Expedition Map,
  the Hollow Mine cave, and the road east to your homestead.
- **Homestead**: one per player. Gather wood/stone/berries; build a cottage, kitchen stove, farm beds, anvil, smelter
  and decorations. Buildings rotate. Renown from buildings unlocks recipes. Going home heals you. Sleep to skip the night.
- **Dungeons**: Hushed Crypt, Bramble Hollow, Tidewater Grotto, Toybox Attic, Pie-Oven Furnace. Each is
  procedurally generated, with packs to clear, chests, and a boss guarding a Crust Piece. All 15 enemies from the
  reference sheet are in, each with its listed behaviour, plus 5 bosses.
- **Co-op**: everyone shares the village and mine. Join a friend's dungeon run from the Expedition Map, visit their
  homestead from the village signpost, give or drop items for each other, and chat. If you disconnect mid-dungeon
  you rejoin the same run.
- **Progression**: forge Sturdy/Bronze/Iron/Ember gear and temper it (with a stat preview), smelt ore into bars,
  cook meals for healing and buffs, and use charms. Under-geared players take extra damage.
- **Story**: 13 main quests ending with baking The Hearth Pie. Click the quest box for a guide arrow at your feet.

## Files

- `server/` is the authoritative game server (`index.js` handles players/quests/crafting, `zone.js` the enemy AI and combat, `maps.js` the map generation)
- `shared/data.js` holds all game data (classes, abilities, enemies, items, recipes, buildings, quests)
- `public/` is the browser client (`js/main.js` game loop/input, `js/render.js` drawing, `js/ui.js` HUD and menus, `js/icons.js` item icons)
- `public/sprites/` holds the character art cut from the reference sheets by `tools/extract_sprites.py`

## Merging this with another version of the game

This folder is self-contained, so another person (or their Claude) can read it and bring pieces over. Pointers:

- **Game rules and content** (classes, abilities, enemies, items, recipes, buildings, quests) are plain data in
  `shared/data.js`. This is the easiest place to compare and combine content.
- **Server logic** is in `server/`: `index.js` (accounts, saves, parties, chat, quests, crafting, shops),
  `zone.js` (enemy AI, combat, projectiles), `maps.js` (village/homestead/mine/dungeon generation).
- **Client** is in `public/js/`: `main.js` (networking, input, game loop), `render.js` (drawing + all effects),
  `ui.js` (HUD and menus), `music.js` (procedural soundtrack), `icons.js` (item icons).
- **Art**: `public/sprites/` was cut from the reference sheets (`23.png`, `image.png`) by `tools/extract_sprites.py`.
- No build step and no framework: Node.js + the `ws` package on the server, plain JavaScript + canvas in the browser.
- Saves are JSON files in `saves/` (not included in the repository).
