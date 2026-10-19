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
# The number printed on each pin, in the order the outlets are written (top to bottom, then left to right),
# read off the map by eye, and the names from the map's own outlet list.
NUMBERS = [24, 36, 43, 15, 31, 42, 40, 29, 38, 28, 34, 22, 19, 17, 16, 18, 33, 11, 35, 32, 27, 25, 37, 44, 41, 23, 20,
           1, 2, 7, 39, 10, 12, 5, 3, 26, 14, 30, 4, 21, 9, 8, 6, 13]
NAMES = {1: "orchardgateway", 2: "Plaza Singapura", 3: "Raffles City", 4: "One Raffles Place", 5: "Great World", 6: "VivoCity",
         7: "Raffles Specialist Centre", 8: "Guoco Tower", 9: "18 Cross", 10: "Parkway Parade", 11: "Jem",
         12: "NUS, Yusof Ishak House", 13: "RWS WEAVE", 14: "Alexandra Retail Centre", 15: "Waterway Point", 16: "Tampines 1",
         17: "NEX", 18: "Changi Airport T2", 19: "Junction 8", 20: "ARTRA Alexandra", 21: "Pagoda House", 22: "Hougang Mall",
         23: "East Coast Road", 24: "Causeway Point", 25: "BreadTalk IHQ", 26: "Clarke Quay Central", 27: "Velocity @ Novena Square",
         28: "Rivervale Mall", 29: "Bukit Panjang Plaza", 30: "Suntec City", 31: "Lentor Modern", 32: "The Woodleigh Mall",
         33: "Jurong Point", 34: "West Mall", 35: "Tampines West CC", 36: "Wisteria Mall", 37: "Paya Lebar Quarter",
         38: "Pasir Ris Mall", 39: "Bedok Mall", 40: "Sengkang Grand Mall", 41: "Sceneca Square", 42: "Compass One",
         43: "Punggol Coast Mall", 44: "The Star Vista"}


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
    outlets = sorted(pins, key=lambda p: (p[1], p[0]))
    assert len(outlets) == len(NUMBERS) == 44 and sorted(NUMBERS) == list(range(1, 45)), "map pins changed: re-read NUMBERS"
    out = {"_note": __doc__.strip().splitlines()[0], "image": [W, H], "mapBottom": MAP_BOTTOM, "cell": CELL,
           "outlets": outlets, "numbers": NUMBERS, "names": [NAMES[n] for n in NUMBERS], "land": land}
    OUT.write_text(json.dumps(out), encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}: {len(pins)} outlets, {sum(r.count('1') for r in land)} land cells")


if __name__ == "__main__":
    main()
