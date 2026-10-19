r"""
extract_geo.py - outlet positions and a land mask from the team's "CHAGEE in Singapore" map.

    python3 storyboard/extract_geo.py      # writes sim/sg_geo.json

Reads word/media/image3.png from "OPIM 639_ Ideation Process (1).docx" (1672 x 941 px):
  * outlets: the 44 navy map pins (connected navy blobs about 24 x 33 px), pin tip = bottom of the blob;
  * land: 8 px cells whose pixels are mostly the map's beige.
Positions are in that image's pixels. The map says "approximate locations; not to scale", and its
Central City inset is drawn enlarged, so central outlets sit further apart than they really are.
Run again only if the map image changes.
"""

import io
import json
import zipfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).parent.parent
DOCX = ROOT / "OPIM 639_ Ideation Process (1).docx"
OUT = ROOT / "sim" / "sg_geo.json"
MAP_BOTTOM = 640          # the map ends here; below is the outlet list
CELL = 8


def navy(c):
    return c[0] < 70 and c[1] < 85 and c[2] < 140 and c[2] - c[0] > 30


def main():
    with zipfile.ZipFile(DOCX) as z:
        im = Image.open(io.BytesIO(z.read("word/media/image3.png"))).convert("RGB")
    W, H = im.size
    px = im.load()
    seen, pins = set(), []
    for y in range(MAP_BOTTOM):
        for x in range(W):
            if (x, y) in seen or not navy(px[x, y]):
                continue
            stack, pts = [(x, y)], []
            seen.add((x, y))
            while stack:
                a, b = stack.pop()
                pts.append((a, b))
                for u, v in ((a + 1, b), (a - 1, b), (a, b + 1), (a, b - 1)):
                    if 0 <= u < W and 0 <= v < MAP_BOTTOM and (u, v) not in seen and navy(px[u, v]):
                        seen.add((u, v))
                        stack.append((u, v))
            xs, ys = [p[0] for p in pts], [p[1] for p in pts]
            w, h = max(xs) - min(xs), max(ys) - min(ys)
            if 380 <= len(pts) <= 560 and 20 <= w <= 28 and 28 <= h <= 36 and min(xs) > 230:   # pins, not the artwork
                pins.append([round(sum(xs) / len(xs)), max(ys)])
    land = []
    for cy in range(0, MAP_BOTTOM, CELL):
        row = ""
        for cx in range(0, W, CELL):
            n = t = 0
            for yy in range(cy, min(cy + CELL, MAP_BOTTOM), 2):
                for xx in range(cx, min(cx + CELL, W), 2):
                    r, g, b = px[xx, yy]
                    t += 1
                    n += r > 200 and b < 232 and r - b > 12
            row += "1" if n / t > 0.35 else "0"
        land.append(row)
    out = {"_note": __doc__.strip().splitlines()[0], "image": [W, H], "mapBottom": MAP_BOTTOM,
           "cell": CELL, "outlets": sorted(pins, key=lambda p: (p[1], p[0])), "land": land}
    OUT.write_text(json.dumps(out), encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}: {len(pins)} outlets, {sum(r.count('1') for r in land)} land cells")


if __name__ == "__main__":
    main()
