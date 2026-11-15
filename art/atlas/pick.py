#!/usr/bin/env python3
"""Dev-only: copy the picked sprites out of one shard of the Pixel Art Atlas into art/atlas/sprites.json.

    python art/atlas/pick.py PATH/TO/train-000.parquet

The dataset is https://huggingface.co/datasets/Angais/pixel-art-atlas-1.4m (CC0 1.0; 16x16 sprites with a transparent
background). Needs pyarrow and Pillow, which nothing else in this repository uses: run it from a throwaway venv.
sprites.json is committed, so the normal build (art/atlas/build.py, stdlib only) never needs the dataset or the network.

PICK maps a name used by ui/src/73-dungeon.js to a dataset row_id (all from data/train-000.parquet).
"""
import io
import json
import os
import sys

PICK = {
    # heroes: one family per tool, five looks each (picked per agent by a hash of its id)
    "hero.claude.0": 2227, "hero.claude.1": 6247, "hero.claude.2": 6675, "hero.claude.3": 10418, "hero.claude.4": 34813,      # garden gnome
    "hero.codex.0": 7009, "hero.codex.1": 28130, "hero.codex.2": 35910, "hero.codex.3": 26631, "hero.codex.4": 34195,         # knight figurine
    "hero.agy.0": 6044, "hero.agy.1": 18026, "hero.agy.2": 36302, "hero.agy.3": 32975, "hero.agy.4": 39869,                   # robot companion
    # companions (subagents)
    "kid.claude.0": 14614, "kid.claude.1": 36459, "kid.claude.2": 41593, "kid.claude.3": 8481,                                # fire / frost / leaf spirit, will-o-wisp
    "kid.codex.0": 4287, "kid.codex.1": 7106, "kid.codex.2": 32450, "kid.codex.3": 34283,                                     # warrior figurine
    "kid.agy.0": 3378, "kid.agy.1": 12892, "kid.agy.2": 16270, "kid.agy.3": 2335,                                             # toy robot
    # monsters (전투: a command is running)
    "mon.0": 32, "mon.1": 7729, "mon.2": 8341, "mon.3": 2694, "mon.4": 10350, "mon.5": 31474, "mon.6": 7127, "mon.7": 20796,
    "mon.8": 62231, "mon.9": 13729, "mon.10": 78330, "mon.11": 12828, "mon.12": 22258, "mon.13": 20675, "mon.14": 15564, "mon.15": 21072,
    "boss.0": 17393, "boss.1": 6208, "boss.2": 25430, "boss.3": 26926,                                                         # a long fight: fire dragon, bone dragon, king slime, stone golem
    # stations
    "dummy.0": 623, "dummy.1": 11130, "target": 1695,                      # 수련
    "anvil": 7201, "anvil.hot": 22600, "forge": 11225,                     # 제작
    "map.0": 2133, "map.1": 28037, "lens": 8751, "torch": 879, "compass": 4207, "pickaxe": 1481,   # 탐험
    "scope": 6086, "orb": 22353, "ball": 2793,                             # 정찰
    "tome": 835, "spell": 17599,                                           # 소환
    "shelf": 3128, "book": 9428,                                           # 연구
    "door.0": 7180, "door.1": 31367, "locked": 7308, "key": 21094,         # 관문 (입력 대기)
    "chest.0": 37503, "chest.1": 68347, "chest.2": 499, "trophy": 14072,   # 완료
    "camp.0": 11084, "camp.1": 13834, "bag": 5730, "tent": 10000,          # 휴식
    "web.0": 6552, "web.1": 83899, "hourglass": 2767,                      # 응답 없음
    "skull": 12415, "tomb.0": 3642, "tomb.1": 472, "ghost": 14495,         # 중단됨 / 끊김
    # decor
    "sconce.0": 10016, "sconce.1": 1861, "brazier": 2397, "banner.0": 2410, "banner.1": 10037, "banner.2": 37020, "banner.3": 4990,
    "barrel": 1364, "crate": 1066, "stairs": 4899, "crystal.0": 3482, "crystal.1": 18463, "shroom.0": 69469, "shroom.1": 1514,
    "coffin": 36730, "gargoyle": 12411, "pillar.0": 15418, "pillar.1": 33224, "pile": 24963, "arch": 4398, "hatch": 8253,
    # effects / messenger
    "zzz": 52162, "spark": 14681, "scroll": 27588, "owl": 5673,
}
ALPHA = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"   # palette index 1.. -> ALPHA[i - 1]; '.' = transparent


def main(src):
    import pyarrow.parquet as pq
    from PIL import Image
    t = pq.read_table(src, columns=["image", "caption", "subject", "row_id"])
    by = {r: i for i, r in enumerate(t.column("row_id").to_pylist())}
    img, cap, sub = t.column("image"), t.column("caption"), t.column("subject")
    out = {}
    for name, rid in PICK.items():
        i = by[rid]
        im = Image.open(io.BytesIO(img[i].as_py()["bytes"])).convert("RGBA")
        assert im.size == (16, 16), (name, im.size)
        px = list(im.getdata())
        cols = sorted({p[:3] for p in px if p[3] >= 128}, key=lambda c: (c[0] * 2 + c[1] * 3 + c[2], c))
        assert len(cols) <= len(ALPHA), (name, len(cols))
        idx = {c: ALPHA[k] for k, c in enumerate(cols)}
        out[name] = {"row_id": rid, "subject": sub[i].as_py(), "caption": cap[i].as_py(),
                     "pal": "".join("%02x%02x%02x" % c for c in cols),
                     "px": "".join(idx[p[:3]] if p[3] >= 128 else "." for p in px)}
    dst = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sprites.json")
    with open(dst, "w", encoding="utf-8", newline="\n") as f:
        f.write("{\n" + ",\n".join(" %s: %s" % (json.dumps(k), json.dumps(v, ensure_ascii=False)) for k, v in out.items()) + "\n}\n")
    print(len(out), "sprites ->", dst)


if __name__ == "__main__":
    main(sys.argv[1])
