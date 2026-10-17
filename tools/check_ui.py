#!/usr/bin/env python3
"""Build the UI from ui/src and fail unless it equals the committed index.html (line endings ignored); the page must satisfy the hub's CSP."""
import pathlib, re, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
subprocess.run([sys.executable, str(ROOT / "ui" / "build.py")], check=True)
built = (ROOT / "ui" / "dist" / "index.html").read_bytes().replace(b"\r\n", b"\n")
committed = (ROOT / "index.html").read_bytes().replace(b"\r\n", b"\n")
# CSP (agen_talk.page_csp hashes the one inline script): exactly one attribute-less <script>, no inline handlers, no javascript: URLs
if re.findall(rb"<script\b[^>]*>", built) != [b"<script>"]:
    sys.exit("the page needs exactly one <script> with no attributes")
if re.search(rb" on[a-z]+=\"", built) or b"javascript:" in built or b"<script src" in built:
    sys.exit("inline handlers, javascript: and <script src are blocked by the page CSP")
if built != committed:
    sys.exit("index.html is stale: run `python ui/build.py` and copy ui/dist/index.html over index.html")
print("index.html matches ui/src")
