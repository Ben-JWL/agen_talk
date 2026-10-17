#!/usr/bin/env python3
"""Writes agen_talk.ico (16, 24, 32, 48, 256) and agen_talk_256.png next to this file. Needs Pillow only.
Mark: a dark tile with three chat rows; the top row is bright with a red badge (the room waiting for you).
16 and 24 px are drawn on their own pixel grid, not resized."""
import pathlib
from PIL import Image, ImageDraw

HERE = pathlib.Path(__file__).resolve().parent
INK, RIM, BRI, DIM, RED = (0x1D, 0x1D, 0x1F), (0x48, 0x48, 0x4A), (0xF5, 0xF5, 0xF7), (0x98, 0x98, 0x9D), (0xE5, 0x34, 0x2B)


def big():
    S = 4
    im = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    rr = lambda b, r, f: d.rounded_rectangle([v * S for v in b], radius=r * S, fill=f)
    rr((16, 16, 240, 240), 56, RIM); rr((20, 20, 236, 236), 52, INK)
    rr((60, 64, 96, 100), 10, BRI); rr((108, 70, 148, 94), 12, BRI); d.ellipse([v * S for v in (160, 64, 196, 100)], fill=RED)
    rr((60, 110, 96, 146), 10, DIM); rr((108, 116, 196, 140), 12, DIM)
    rr((60, 156, 96, 192), 10, DIM); rr((108, 162, 172, 186), 12, DIM)
    return im


def px24():
    im = Image.new("RGBA", (24, 24), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, 23, 23), radius=6, fill=RIM); d.rounded_rectangle((1, 1, 22, 22), radius=5, fill=INK)
    for y, x1, f in ((5, 11, BRI), (10, 17, DIM), (15, 14, DIM)):
        d.rectangle((5, y, x1, y + 2), fill=f)
    d.rectangle((13, 4, 17, 8), fill=RED)   # ellipse on boxes <= 6 px draws a plus sign: plain squares
    return im


def px16():
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, 15, 15), radius=4, fill=RIM); d.rounded_rectangle((1, 1, 14, 14), radius=3, fill=INK)
    for y, x1, f in ((4, 7, BRI), (7, 11, DIM), (10, 9, DIM)):
        d.rectangle((3, y, x1, y + 1), fill=f)
    d.rectangle((9, 3, 11, 5), fill=RED)
    return im


def main():
    b = big()
    icons = {s: b.resize((s, s), Image.LANCZOS) for s in (256, 48, 32)}
    icons[24], icons[16] = px24(), px16()
    icons[256].save(HERE / "agen_talk.ico", sizes=[(s, s) for s in icons], append_images=[icons[s] for s in (48, 32, 24, 16)])
    icons[256].save(HERE / "agen_talk_256.png")
    print("wrote agen_talk.ico", sorted(icons), "and agen_talk_256.png in", HERE)


if __name__ == "__main__":
    main()
