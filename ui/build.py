#!/usr/bin/env python3
"""Dev-only: concatenate src/* (sorted by name) into dist/index.html. Nothing from here ships but the output.
Order contract: 1x-head.html, 2x/3x *.css, 40-body.html, 5x/6x *.js, 90-tail.html."""
import pathlib, re, sys
HERE = pathlib.Path(__file__).resolve().parent
DEV = "--dev" in sys.argv
parts = sorted(p for p in (HERE / "src").iterdir() if p.suffix in (".html", ".css", ".js") and (DEV or ".dev." not in p.name))
out = []
for p in parts:
    s = p.read_text(encoding="utf-8")
    if p.suffix == ".css": s = "\n/* ---- %s ---- */\n%s" % (p.name, s)
    if p.suffix == ".js": s = "\n/* ---- %s ---- */\n%s" % (p.name, s)
    out.append(s)
html = "".join(out)
assert "<script src" not in html and "@import" not in html and "eval(" not in html, "no external scripts, no eval"
assert not re.search(r"\.innerHTML\s*=\s*[^'\"`;]*\$\{", html), "innerHTML with interpolation is forbidden"
(HERE / "dist").mkdir(exist_ok=True)
(HERE / "dist" / "index.html").write_text(html, encoding="utf-8")
print("dist/index.html", len(html), "bytes from", [p.name for p in parts])
