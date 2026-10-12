"""Cut the character/enemy art out of the reference sheets into clean transparent PNGs.

Usage:  python tools/extract_sprites.py
Reads 23.png (enemies) and image.png (classes + villagers) from the project root
and writes public/sprites/<id>.png

The sheets have soft edges blended into a purple background. Edge pixels get a real
alpha value and the purple is un-mixed from their colour, so sprites have no halo.
"""
import os
from collections import deque
from statistics import median
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "sprites")
os.makedirs(OUT, exist_ok=True)

BG_TOL = 42        # colour distance treated as background when connected to the border
HOLE_TOL = 22      # stricter distance for background enclosed by the sprite (e.g. inside a bow)
HOLE_MIN = 20      # enclosed background regions smaller than this are kept as art
EDGE = 3           # how far (px) from the background edge pixels get soft alpha


def dist(a, b):
    return abs(a[0] - b[0]) + abs(a[1] - b[1]) + abs(a[2] - b[2])


def extract(img, box, name, glow=None):
    """glow=(rows, tol): above `rows` (cell y), use a looser background tolerance to strip a soft glow."""
    cell = img.crop(box).convert("RGB")
    w, h = cell.size
    px = cell.load()
    border = [px[x, 0] for x in range(w)] + [px[x, h - 1] for x in range(w)] + [px[0, y] for y in range(h)] + [px[w - 1, y] for y in range(h)]
    bg = tuple(int(median(c[i] for c in border)) for i in range(3))
    d = [[dist(px[x, y], bg) for y in range(h)] for x in range(w)]
    tol = (lambda y: glow[1] if y < glow[0] else BG_TOL) if glow else (lambda y: BG_TOL)

    # 1. background connected to the border
    isbg = [[False] * h for _ in range(w)]
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if d[x][y] < tol(y) and not isbg[x][y]:
                isbg[x][y] = True; q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if d[x][y] < tol(y) and not isbg[x][y]:
                isbg[x][y] = True; q.append((x, y))
    while q:
        x, y = q.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not isbg[nx][ny] and d[nx][ny] < tol(ny):
                isbg[nx][ny] = True; q.append((nx, ny))

    # 2. enclosed background holes (strict tolerance so dark-purple art like Velvet's wings survives)
    seen = [[False] * h for _ in range(w)]
    for sx in range(w):
        for sy in range(h):
            if isbg[sx][sy] or seen[sx][sy] or d[sx][sy] >= HOLE_TOL:
                continue
            region, dq = [], deque([(sx, sy)])
            seen[sx][sy] = True
            while dq:
                x, y = dq.popleft(); region.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and not seen[nx][ny] and not isbg[nx][ny] and d[nx][ny] < HOLE_TOL:
                        seen[nx][ny] = True; dq.append((nx, ny))
            if len(region) >= HOLE_MIN:
                for x, y in region:
                    isbg[x][y] = True

    # 3. distance (in px) from the background, for edge softening
    edge = [[99] * h for _ in range(w)]
    q = deque()
    for x in range(w):
        for y in range(h):
            if isbg[x][y]:
                edge[x][y] = 0; q.append((x, y))
    while q:
        x, y = q.popleft()
        if edge[x][y] >= EDGE + 2:
            continue
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and edge[nx][ny] > edge[x][y] + 1:
                edge[nx][ny] = edge[x][y] + 1; q.append((nx, ny))

    # 4. alpha + colour un-mixing on edge pixels
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    op = out.load()
    alpha = [[0.0] * h for _ in range(w)]
    for x in range(w):
        for y in range(h):
            if isbg[x][y]:
                continue
            c = px[x, y]
            a = 1.0
            if edge[x][y] <= EDGE:
                # the "true" colour this pixel was blended from: the strongest art pixel nearby
                # the solid art this pixel was blended from: the nearest pixel deeper inside the sprite
                best, bestc = 0, c
                for r in range(1, EDGE + 1):
                    for dx in range(-r, r + 1):
                        for dy in range(-r, r + 1):
                            if max(abs(dx), abs(dy)) != r:
                                continue
                            nx, ny = x + dx, y + dy
                            if 0 <= nx < w and 0 <= ny < h and not isbg[nx][ny] and edge[nx][ny] > edge[x][y] and d[nx][ny] > best:
                                best, bestc = d[nx][ny], px[nx, ny]
                    if best > 60:
                        break
                best = max(best, d[x][y])
                a = min(1.0, d[x][y] / max(1, best) * 1.15)
                if a < 0.25:
                    continue
                if a < 0.95:
                    # colour it like the solid art next to it (usually the dark outline): no purple, no over-shoot
                    c = bestc
            alpha[x][y] = a
            op[x, y] = (c[0], c[1], c[2], round(a * 255))

    # 5. drop specks: keep components (of solid-ish pixels) with at least 8 px
    keep = [[False] * h for _ in range(w)]
    seen = [[False] * h for _ in range(w)]
    for sx in range(w):
        for sy in range(h):
            if seen[sx][sy] or alpha[sx][sy] < 0.5:
                continue
            comp, dq = [], deque([(sx, sy)])
            seen[sx][sy] = True
            while dq:
                x, y = dq.popleft(); comp.append((x, y))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < w and 0 <= ny < h and not seen[nx][ny] and alpha[nx][ny] >= 0.5:
                            seen[nx][ny] = True; dq.append((nx, ny))
            if len(comp) >= 8:
                for x, y in comp:
                    for dx in (-2, -1, 0, 1, 2):
                        for dy in (-2, -1, 0, 1, 2):
                            nx, ny = x + dx, y + dy
                            if 0 <= nx < w and 0 <= ny < h:
                                keep[nx][ny] = True
    for x in range(w):
        for y in range(h):
            if not keep[x][y]:
                op[x, y] = (0, 0, 0, 0)
    bbox = out.getbbox()
    out = out.crop((max(0, bbox[0] - 1), max(0, bbox[1] - 1), min(w, bbox[2] + 1), min(h, bbox[3] + 1)))
    out.save(os.path.join(OUT, name + ".png"))
    print(name, out.size, "bg", bg)


enemies = [
    ["frog", "bee", "squirrel", "hare", "mushroom"],
    ["quillbird", "crab", "jelly", "wretch", "siren"],
    ["soldier", "cogbot", "jester", "glimmerbug", "pillbug"],
]
# sprite area of each row ends just above the label text
erows = [(55, 138), (185, 272), (315, 407)]
sheet = Image.open(os.path.join(ROOT, "23.png"))
for r, names in enumerate(enemies):
    for c, n in enumerate(names):
        y0, y1 = erows[r]
        extract(sheet, (c * 160 + 2, y0, c * 160 + 158, y1), n)

chars = [["mage", "ranger", "brawler", "velvet"], ["stitch", "grinny", "candlewick", "sugarplum"]]
sheet2 = Image.open(os.path.join(ROOT, "image.png"))
for r, names in enumerate(chars):
    for c, n in enumerate(names):
        x0 = c * 200 + 4
        y0 = r * 206 + 4
        extract(sheet2, (x0, y0, x0 + 192, y0 + 180), n, glow=(81, 110) if n == 'candlewick' else None)
