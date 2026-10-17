#!/usr/bin/env python3
"""Public-repo hygiene scan: private IPs, home paths, emails, keys, tokens in every non-ignored file.
Exit 1 on any hit. Site-specific words (company, host, user names) never live in this repo: pass them
in the environment, e.g.  AT_SCAN_EXTRA='acme|myhost|myname' python tools/scan.py"""
import os, pathlib, re, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OK_USERS = {"me", "alice", "you", "user", "username", "name", "public", "default"}
OK_MAIL = re.compile(r"noreply|@example\.|@users\.noreply\.github\.com")
PATTERNS = {
    "private-ip": re.compile(r"(?<![\d.])(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(?!\d)"),
    "unix-home": re.compile(r"(?:/home|/Users)/[A-Za-z0-9._-]+"),
    "win-home": re.compile(r"[A-Za-z]:\\{1,2}Users\\{1,2}([^\\\"'\s<%]+)"),
    "email": re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}\b"),
    "private-key": re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    "ssh-pubkey": re.compile(r"ssh-(?:ed25519|rsa) AAAA[0-9A-Za-z+/]{40,}"),
    "token": re.compile(r"ghp_\w{20,}|gho_\w{20,}|github_pat_\w{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-\w+|sk-[A-Za-z0-9]{20,}"),
}
BAD_NAMES = re.compile(r"(\.pem|\.pfx|\.p12|_ed25519|_rsa|authorized_keys|known_hosts|channels\.json|presets\.json)$")
extra = os.environ.get("AT_SCAN_EXTRA")
if extra:
    PATTERNS["site-specific"] = re.compile(extra, re.I)


def files():
    out = subprocess.run(["git", "ls-files", "-co", "--exclude-standard", "-z"], cwd=ROOT, stdout=subprocess.PIPE, check=True).stdout
    return [f for f in out.decode().split("\0") if f]


def main():
    hits = []
    for f in files():
        if BAD_NAMES.search(f):
            hits.append((f, 0, "bad-filename", f))
        p = ROOT / f
        if not p.is_file() or p.suffix in (".ico", ".png", ".jpg", ".gif"):
            continue
        for n, line in enumerate(p.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            for kind, rx in PATTERNS.items():
                for m in rx.finditer(line):
                    s = m.group(0)
                    if kind == "email" and OK_MAIL.search(s): continue
                    if kind == "win-home" and m.group(1).lower() in OK_USERS: continue
                    hits.append((f, n, kind, s[:80]))
    for f, n, kind, s in hits:
        print("%s:%d: %s: %s" % (f, n, kind, s))
    print("scan: %d hit(s)" % len(hits))
    return 1 if hits else 0


if __name__ == "__main__":
    sys.exit(main())
