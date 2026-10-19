#!/usr/bin/env python3
"""Colour palettes (ui/src/20-tokens.css = 기본, ui/src/21-palettes.css = the rest): every palette x light/dark must keep body text >= 4.5:1,
secondary text and focus rings >= 3:1, the red alert family untouched and clearly apart (CIEDE2000) from each palette's accent and stall colour.
Prints a table; exits non-zero on a failure. Stdlib only (CI runs it next to check_ui.py)."""
import math, pathlib, re, sys

SRC = pathlib.Path(__file__).resolve().parent.parent / "ui" / "src"
PALETTES = ["default", "claude", "chatgpt", "gemini", "grok", "muse"]
RESERVED = ("--signal", "--signal-text", "--on-signal")


def blocks(css):
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    for sel, body in re.findall(r"([^{}]+)\{([^{}]*)\}", css):
        decls = dict((k.strip(), v.strip()) for k, v in re.findall(r"(--[\w-]+)\s*:\s*([^;]+)", body))
        yield [s.strip() for s in sel.split(",")], decls


def tokens(pal, dark):
    t = {}
    tok = list(blocks((SRC / "20-tokens.css").read_text(encoding="utf-8")))
    pals = list(blocks((SRC / "21-palettes.css").read_text(encoding="utf-8")))
    for sels, d in tok:                                    # file order = cascade order for equal specificity
        if ":root" in sels:
            t.update(d)
    if dark:
        for sels, d in tok:
            if "html.dark" in sels:
                t.update(d)
    if pal != "default":
        for sels, d in pals:
            if sels == ["[data-palette=%s]" % pal]:
                t.update(d)
        if dark:
            for sels, d in pals:
                if ".dark[data-palette=%s]" % pal in sels:
                    t.update(d)
    return t


def hexrgb(h):
    h = h.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def resolve(t, v, depth=0):
    """-> list of (r,g,b) (several for a gradient's stops) or None for something not checkable (transparent mixes)."""
    v = v.strip()
    if depth > 20:
        raise ValueError("var() loop: " + v)
    m = re.fullmatch(r"var\((--[\w-]+)\)", v)
    if m:
        return resolve(t, t[m.group(1)], depth + 1)
    if re.fullmatch(r"#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}", v):
        return [hexrgb(v)]
    m = re.fullmatch(r"color-mix\(in srgb,\s*(.+?)\s+(\d+(?:\.\d+)?)%,\s*(.+)\)", v)
    if m:
        if "transparent" in v:
            return None
        a, b = resolve(t, m.group(1), depth + 1)[0], resolve(t, m.group(3), depth + 1)[0]
        p = float(m.group(2)) / 100
        return [tuple(round(a[i] * p + b[i] * (1 - p)) for i in range(3))]
    m = re.fullmatch(r"linear-gradient\((.*)\)", v)
    if m:
        return [hexrgb(x) for x in re.findall(r"#[0-9a-fA-F]{6}", m.group(1))]
    return None


def lum(c):
    f = lambda x: x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4
    r, g, b = (f(x / 255) for x in c)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def lab(c):
    f = lambda x: x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4
    r, g, b = (f(x / 255) for x in c)
    x, y, z = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, 0.2126 * r + 0.7152 * g + 0.0722 * b, (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
    g_ = lambda u: u ** (1 / 3) if u > 216 / 24389 else (24389 / 27 * u + 16) / 116
    fx, fy, fz = g_(x), g_(y), g_(z)
    return 116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)


def de2000(c1, c2):
    L1, a1, b1 = lab(c1)
    L2, a2, b2 = lab(c2)
    C1, C2 = math.hypot(a1, b1), math.hypot(a2, b2)
    Cm = (C1 + C2) / 2
    G = 0.5 * (1 - math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)))
    a1p, a2p = a1 * (1 + G), a2 * (1 + G)
    C1p, C2p = math.hypot(a1p, b1), math.hypot(a2p, b2)
    h1p, h2p = math.degrees(math.atan2(b1, a1p)) % 360, math.degrees(math.atan2(b2, a2p)) % 360
    dL, dC = L2 - L1, C2p - C1p
    dh = 0 if C1p * C2p == 0 else (h2p - h1p if abs(h2p - h1p) <= 180 else h2p - h1p - 360 if h2p > h1p else h2p - h1p + 360)
    dH = 2 * math.sqrt(C1p * C2p) * math.sin(math.radians(dh / 2))
    Lm, Cmp = (L1 + L2) / 2, (C1p + C2p) / 2
    hm = h1p + h2p if C1p * C2p == 0 else ((h1p + h2p) / 2 if abs(h1p - h2p) <= 180 else (h1p + h2p + 360) / 2 if h1p + h2p < 360 else (h1p + h2p - 360) / 2)
    T = 1 - 0.17 * math.cos(math.radians(hm - 30)) + 0.24 * math.cos(math.radians(2 * hm)) + 0.32 * math.cos(math.radians(3 * hm + 6)) - 0.20 * math.cos(math.radians(4 * hm - 63))
    SL = 1 + 0.015 * (Lm - 50) ** 2 / math.sqrt(20 + (Lm - 50) ** 2)
    SC, SH = 1 + 0.045 * Cmp, 1 + 0.015 * Cmp * T
    RT = -2 * math.sqrt(Cmp ** 7 / (Cmp ** 7 + 25 ** 7)) * math.sin(math.radians(60 * math.exp(-((hm - 275) / 25) ** 2)))
    return math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH))


# (foreground, background, minimum, what) — contrast pairs
TEXT, SECONDARY, UI = 4.5, 3.0, 3.0
PAIRS = [
    ("--ink", "--canvas", TEXT, "body text"), ("--ink", "--surface", TEXT, "body text"), ("--ink", "--row-sel", TEXT, "selected row"), ("--ink", "--tile", TEXT, "avatar tile"),
    ("--on-accent", "--accent", TEXT, "primary button / chip"), ("--on-bub-me", "--bub-me", TEXT, "my bubble"),
    ("--accent", "--surface", TEXT, "accent text (작업 중, links)"),
    ("--signal-text", "--surface", TEXT, "alert text"), ("--signal-text", "--canvas", TEXT, "alert text"), ("--signal-text", "--tint-signal", TEXT, "alert card"),
    ("--warn", "--surface", TEXT, "stall text"), ("--warn", "--canvas", TEXT, "stall text"),
    ("--ink-2", "--canvas", SECONDARY, "secondary text"), ("--ink-2", "--surface", SECONDARY, "secondary text"), ("--ink-2", "--row-sel", SECONDARY, "secondary on selected row"),
    ("--ink-2", "--rail-bg", SECONDARY, "rail icons"), ("--tab-on", "--rail-bg", SECONDARY, "selected rail icon"),
    ("--focus", "--canvas", UI, "focus ring"), ("--focus", "--surface", UI, "focus ring"),
    ("--on-signal", "--signal", UI, "red badge (bold)"), ("--st-work", "--surface", TEXT, "working label (작업 중, 배선 지도)"), ("--st-child", "--surface", UI, "child glyph"),
    ("--accent-2", "--surface", UI, "talk edge / me"),
]
# CIEDE2000 minimum distances: the alert red must never be mistaken for anything else that is coloured
DISTANCES = [("--accent", "--signal", 17), ("--accent", "--signal-text", 17), ("--st-work", "--signal", 17), ("--st-child", "--signal", 20),
             ("--warn", "--signal-text", 15), ("--warn", "--accent", 15), ("--accent-2", "--signal", 20)]


def main():
    fails, aims = [], []
    base = {m: tokens("default", m) for m in (False, True)}
    pal_css = (SRC / "21-palettes.css").read_text(encoding="utf-8")
    for k in RESERVED:
        if re.search(re.escape(k) + r"\s*:", re.sub(r"/\*.*?\*/", "", pal_css, flags=re.S)):
            fails.append("21-palettes.css sets the reserved alert token " + k)
    print("%-8s %-5s %-46s %7s" % ("palette", "mode", "pair", "value"))
    for pal in PALETTES:
        for dark in (False, True):
            t, mode = tokens(pal, dark), "dark" if dark else "light"
            for k in RESERVED:
                if t[k] != base[dark][k]:
                    fails.append("%s/%s: %s differs from 기본" % (pal, mode, k))
            for fg, bg, need, what in PAIRS:
                F, B = resolve(t, t[fg]), resolve(t, t[bg])
                if F is None or B is None:
                    fails.append("%s/%s: %s on %s is not checkable" % (pal, mode, fg, bg))
                    continue
                c = min(contrast(f, b) for f in F for b in B)
                bad = c < need
                print("%-8s %-5s %-46s %6.2f%s" % (pal, mode, "%s on %s" % (fg, bg), c, "  FAIL < %.1f" % need if bad else ""))
                if bad:
                    fails.append("%s/%s: %s on %s = %.2f < %.1f (%s)" % (pal, mode, fg, bg, c, need, what))
                elif need < TEXT and c < TEXT and fg == "--ink-2" and bg in ("--canvas", "--surface"):
                    aims.append("%s/%s: %s on %s = %.2f (passes 3:1, below the 4.5 aim)" % (pal, mode, fg, bg, c))
            if pal == "default":
                continue   # 기본 is the pre-palette look, kept pixel-identical (its accent is the ink itself)
            for a, b, need in DISTANCES:
                d = de2000(resolve(t, t[a])[0], resolve(t, t[b])[0])
                bad = d < need
                print("%-8s %-5s %-46s %6.1f%s" % (pal, mode, "dE2000 %s vs %s" % (a, b), d, "  FAIL < %d" % need if bad else ""))
                if bad:
                    fails.append("%s/%s: dE2000(%s, %s) = %.1f < %d" % (pal, mode, a, b, d, need))
    for a in aims:
        print("note:", a)
    if fails:
        print("\n".join(["", "palette check FAILED:"] + fails))
        sys.exit(1)
    print("palettes ok (%d palettes x light/dark)" % len(PALETTES))


if __name__ == "__main__":
    main()
