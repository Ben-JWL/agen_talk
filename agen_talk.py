#!/usr/bin/env python3
"""Agen Talk (에겐 톡): every codex / claude / agy agent on your machines, live: what it is for, what it does now, whether it is really working.

  agen_talk.py                  tree: what each agent is for and what it is doing now
  agen_talk.py --board          kanban
  agen_talk.py --all            also show sessions idle for more than a day
  agen_talk.py --json           state as JSON
  agen_talk.py hub [FILE]       dashboard for several machines in a Chrome/Edge app window (dev / source use; the installed app is app.py,
                                 which runs this same hub in-process via hub_start()). Reads channels.json (FILE, else next to this file,
                                 else %APPDATA%\\AgenTalk, Linux ~/.config/agen-talk) and serves http://127.0.0.1:PORT/ only, page and API under
                                 a random /<secret>/ (printed URL); --insecure = no secret, root paths, read-only (a shared Linux box).
                                 ssh channels stream this file to the server over the ssh session (python3 -c, nothing installed there);
                                 the server-side collector exits when the session ends. Transport: in-app SSH (paramiko) with the app's own
                                 key and trust store (%APPDATA%\\AgenTalk\\id_ed25519, known_hosts); OpenSSH only when paramiko is missing or a
                                 channel's ssh_args need it (fallback key ~/.ssh/agen_talk_ed25519). 설정 → 서버 추가 registers servers
                                 (the password is typed once in the app and never stored).
                                 Test-only env: AT_SSH, AT_SSH_KEYGEN, AT_KEYINSTALL_TIMEOUT, AT_NO_PARAMIKO, AT_TALK_ROOT, AT_CODEX.
  agen_talk.py keyinstall RESULT_FILE user@host PORT [NAME]   internal: the password console the hub opens
  agen_talk.py pipe             collector over stdin/stdout, one JSON line per input line (the hub runs this remotely);
                                 a line starting with { is a talk request (톡: a message into a claude / codex session), anything else is a poll
  agen_talk.py --selftest
  watch -c -n3 'agen_talk.py -c'

Read-only sources: /proc, ~/.codex (state_5.sqlite + rollouts), ~/.claude (sessions + transcripts),
~/.gemini/antigravity-cli (conversation_summaries.db). Each user sees only their own agents, provided ~/.codex, ~/.claude and
~/.gemini are 0700. A dropped ssh link leaves the remote collector idle until sshd's ClientAlive timeout; it then exits by itself.
Python 3.8+, stdlib only.
"""
import getpass, hashlib, json, os, re, shutil, socket, sqlite3, stat, sys, textwrap, time, unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from itertools import chain
from pathlib import Path

HOME = Path.home()
WIN = os.name == "nt"
OLD = 600          # ponytail: finished work idle >10min folds to a count; a flag if history matters
STALL = {"codex": 900}   # 'work' silent longer than this -> stall; default 600 (seen: claude max 483 s, codex max 737 s)
FRESH = 6 * 3600   # a root that finished its turn this recently is waiting for you; older is just idle
LIVE = ("work", "tool", "child")
ATTENTION = ("user", "stall")
REST = ("idle", "done", "stopped", "dead")
NOW = time.time()
CLK = 100 if WIN else os.sysconf("SC_CLK_TCK")
WARN = []          # collect() warnings
NODES = {}         # id -> node, filled by node(); lets proc_attach find a node by thread/session id


# ---------- helpers ----------
def mtime(p):
    try:
        return os.stat(p).st_mtime
    except (OSError, TypeError):
        return None


def tail(p, n):
    """Parsed JSON lines from the last n bytes, newest first."""
    try:
        with open(p, "rb") as f:
            start = max(0, f.seek(0, 2) - n)
            f.seek(start)
            lines = f.read().decode("utf-8", "replace").splitlines()
    except (OSError, TypeError):
        return
    for ln in (lines[1:] if start else lines)[::-1]:
        try:
            d = json.loads(ln)
        except ValueError:
            continue
        if isinstance(d, dict):  # null / [] / "x" lines would crash every caller
            yield d


CTRL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")  # agent text goes to terminals: no ESC sequences


def line1(s, n=200):
    return CTRL.sub("", next((l.strip() for l in str(s or "").splitlines() if l.strip()), ""))[:n]


SECRET = re.compile("|".join([   # ponytail: a pattern list, not entropy detection; add a pattern when a real leak shows up
    r"sk-[A-Za-z0-9_-]{20,}", r"gh[pousr]_[A-Za-z0-9]{36,}", r"github_pat_[A-Za-z0-9_]{20,}", r"AKIA[0-9A-Z]{16}", r"xox[abprs]-[A-Za-z0-9-]{10,}",
    r"AIza[0-9A-Za-z_-]{35}", r"eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}", r"-----BEGIN [A-Z ]*PRIVATE KEY(?: BLOCK)?-----(?s:.{0,8192}?)-----END [A-Z ]*PRIVATE KEY(?: BLOCK)?-----",  # shortcut: key labels are capped at 40/64 chars and PEM bodies at 8 KiB; raise those bounds if longer values must be supported
    r"(?P<b>(?i:\bbearer\s+))[\w.~+/-]{16,}=*", r"(?P<ba>(?i:\bbasic\s+))[A-Za-z0-9+/]{12,}=*",
    r"[sr]k_(?:live|test)_[A-Za-z0-9]{16,}", r"glpat-[\w-]{20,}", r"hf_[A-Za-z0-9]{30,}", r"npm_[A-Za-z0-9]{36}", r"ya29\.[\w-]{20,}",
    r"(?P<ak>(?i:accountkey=))[^;\s]{20,}",
    r"(?P<u>\b[A-Za-z][A-Za-z0-9+.-]*://[^/\s:@]+:)[^@\s/]{3,}(?=@)",   # scheme://user:PASSWORD@host
    r"(?P<sp>\bsshpass\s+-p\s*)\S+", r"(?P<pw>(?<!\S)(?:--password(?:=|\s+)|-p(?=[^\s\d-])))\S{3,}",   # mysql -pSECRET, --password X (ssh -p 22 stays)
    r"(?P<k>(?i:(?<![A-Za-z0-9])[A-Za-z0-9_-]{0,40}(?:password|passwd|pass|pwd|secret|token|api[_-]?key|private[_-]?key|credentials?)[A-Za-z0-9_-]{0,64}[\"']?\s*[:=]\s*[\"']?))[^\s\"',}]{4,}"]))


def redact(s):
    """Secrets out of agent text (msgs, acts): the value goes, a `key=` / `Bearer ` prefix stays."""
    repl = lambda m: (m.group(m.lastgroup) if m.lastgroup else "") + "[가려짐]"
    if "-----END " not in s:
        m = re.search(r"-----BEGIN [A-Z ]*PRIVATE KEY(?: BLOCK)?-----", s)
        if m:
            return SECRET.sub(repl, s[:m.start()]) + m.group() + "[가려짐]"
    s = SECRET.sub(repl, s)
    m = re.search(r"-----BEGIN [A-Z ]*PRIVATE KEY(?: BLOCK)?-----", s)
    return s[:m.end()] + "[가려짐]" if m else s


def short(p):
    p = str(p or "").replace(str(HOME), "~")
    parts = p.split("/")
    return p if len(parts) <= 4 else "…/" + "/".join(parts[-2:])


def q(db, sql, live=True):
    """Rows or []. live=False adds immutable=1 (no -wal/-shm files get created when the tool is not running)."""
    try:
        c = sqlite3.connect("%s?mode=ro%s" % (Path(os.path.abspath(db)).as_uri(), "" if live else "&immutable=1"), uri=True)  # as_uri quotes # ? % and spaces
        try:
            return c.execute(sql).fetchall()
        finally:
            c.close()
    except sqlite3.Error:
        return []


def fmt(a):
    if a is None:
        return ""
    a = int(a)
    return f"{a}s" if a < 60 else f"{a // 60}m" if a < 3600 else f"{a // 3600}h{a % 3600 // 60:02d}m" if a < 86400 else f"{a // 86400}d"


def iso(s):
    try:
        return datetime.strptime(s[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc).timestamp() + float("0" + s[19:].rstrip("Z"))
    except (TypeError, ValueError):
        return None


def status(st, tool, age, sub):
    if st == "work" and (age or 0) > STALL.get(tool, 600):
        return "stall"
    if st == "user":
        return "done" if sub else "idle" if (age or 0) > FRESH else "user"
    return st


def node(nid, tool, name, st, why, ts, sub=False, since=None, **kw):
    """ts = epoch of the last significant signal; since = epoch of the turn start or None.
    Sources pass 'user' for 'turn ended'; node() turns it into done (sub) or idle (old)."""
    a = NOW - ts if ts else None
    s = status(st, tool, a, sub)
    if s == "stall" and st == "work":
        why = "%s 동안 신호 없음 · %s" % (fmt(a), why)   # time downgrade only
    n = {"id": nid, "tool": tool, "name": name or "?", "st": s, "why": why, "age": a,
         "since": NOW - since if since else None, "now": None, "last": None, "meta": "",
         "procs": [], "kids": [], "hidden": 0}
    n.update({k: v for k, v in kw.items() if v})
    for k in ("name", "why", "now", "last", "meta"):
        if isinstance(n[k], str):
            n[k] = CTRL.sub("", redact(n[k][:65536])[:8000])   # redact, then cut: a cut must never leave half a key behind
    NODES[nid] = n
    return n


# ---------- project (git) of an agent's working directory: files only, never `git` ----------
GITP = {}   # cwd -> (expires, project or None)


def git_dir_of(top):
    """`top/.git` resolved: a directory, or a `gitdir: …` file (worktree, submodule); None when neither."""
    g = os.path.join(top, ".git")
    if os.path.isdir(g):
        return g
    try:
        with open(g, encoding="utf-8", errors="replace") as f:
            line = f.readline(4096).strip()
    except OSError:
        return None
    if line.startswith("gitdir:"):
        d = line[7:].strip()
        return os.path.normpath(d if os.path.isabs(d) else os.path.join(top, d))
    return None


def git_remote_key(url):
    """'https://user:pw@example.com:443/Ben/x.git' / 'git@example.com:Ben/x.git' -> 'example.com/ben/x' (no scheme, credentials, port, .git)."""
    u = str(url or "").strip()
    m = re.match(r"(?i)^[a-z][a-z0-9+.-]*://(?:[^@/]*@)?([^/:]+)(?::\d+)?/(.+)$", u) or re.match(r"^(?:[^@/]+@)?([^/:\\]{2,}):(?!//)(.+)$", u)   # scp-like; a 1-letter "host" is a Windows drive
    if not m:
        return None
    path = re.sub(r"(?i)\.git/?$", "", m.group(2).strip("/"))
    return (m.group(1) + "/" + path).lower() if path else None


def git_project(cwd_, ttl=30):
    """{name, branch, key, root} of the git repository containing cwd_ (walking up), or None. Cached per directory."""
    if not cwd_:
        return None
    hit = GITP.get(cwd_)
    if hit and hit[0] > NOW:
        return hit[1]
    proj, d = None, os.path.abspath(str(cwd_))
    for _ in range(40):
        g = git_dir_of(d)
        if g:
            common = g
            try:
                with open(os.path.join(g, "commondir"), encoding="utf-8", errors="replace") as f:
                    c = f.readline(4096).strip()
                common = os.path.normpath(c if os.path.isabs(c) else os.path.join(g, c))
            except OSError:
                pass
            branch = None
            try:
                with open(os.path.join(g, "HEAD"), encoding="utf-8", errors="replace") as f:
                    head = f.readline(4096).strip()
                branch = head[16:] if head.startswith("ref: refs/heads/") else ("@" + head[:7]) if re.fullmatch(r"[0-9a-f]{40,64}", head) else None
            except OSError:
                pass
            url = None
            try:
                with open(os.path.join(common, "config"), encoding="utf-8", errors="replace") as f:
                    sec = None
                    for ln in f.read(1 << 16).splitlines():
                        ln = ln.strip()
                        if ln.startswith("["):
                            sec = ln
                        elif sec and re.fullmatch(r'\[remote\s+"origin"\]', sec) and re.match(r"url\s*=", ln):
                            url = ln.split("=", 1)[1].strip()
                            break
            except OSError:
                pass
            key = git_remote_key(url)
            name = key.rsplit("/", 1)[-1] if key else os.path.basename(d) or d
            proj = {"name": line1(name, 80), "branch": line1(branch, 120) or None, "key": key or "local:" + d, "root": short(d)}
            break
        up = os.path.dirname(d)
        if up == d:
            break
        d = up
    GITP[cwd_] = (NOW + ttl, proj)
    if len(GITP) > 512:
        GITP.clear()
    return proj


def project_fill(ns, inherited=None):
    """Subagents without their own project (no cwd, or the same repo) take their parent's."""
    for n in ns:
        if not n.get("project") and inherited:
            n["project"] = inherited
        project_fill(n.get("kids") or [], n.get("project") or inherited)


def fold(n):
    """Hide finished subtrees idle > OLD, keep a count; a kid with procs stays."""
    keep = [k for k in n["kids"] if k["st"] not in REST or (k["age"] or 0) <= OLD or k["kids"] or k["procs"]]
    n["hidden"] += len(n["kids"]) - len(keep)
    n["kids"] = keep
    return n


def rline1(s, n=200):
    """line1 with secrets redacted first: cutting before redaction can leave the head of a key visible."""
    return line1(redact(line1(s, 4096)), n)


def act(name, args):
    """One line for a tool call: the command, path or target it names."""
    if isinstance(args, str):
        args = re.sub(r"\A\s*//[^\n]*\n", "", args)  # code-mode '// @exec: {yield_time_ms...}' header
        m = re.search(r'cmd:\s*"((?:[^"\\]|\\.)*)', args)  # codex code-mode: exec_command({cmd:"..."})
        if m:
            try:
                return "$ " + rline1(json.loads(f'"{m.group(1)}"'))
            except ValueError:
                return "$ " + rline1(m.group(1))
        try:
            args = json.loads(args)
        except ValueError:
            return f"{name} {rline1(args, 80)}"
    if isinstance(args, dict):
        for k in ("description", "command", "cmd", "file_path", "path", "pattern", "query", "url", "target", "prompt"):
            v = args.get(k)
            if isinstance(v, list):
                v = " ".join(map(str, v))
            if isinstance(v, str) and v and not v.startswith("gAAAA"):  # gAAAA… = encrypted payload
                return ("$ " if k in ("command", "cmd") else f"{name}: ") + rline1(v)
    return name


def acts_add(raw, d, k, x):
    """Append one activity item (newest-first list) when the line has a timestamp and the text is readable."""
    t, x = iso(d.get("timestamp")), redact(line1(x, 2000))[:200]
    if not t or not x or (k == "say" and x.startswith("gAAAA")):
        return
    if raw and k in ("user", "say") and raw[-1]["k"] == k and raw[-1]["x"] == x:  # the same text written twice (event + response item)
        return
    raw.append({"t": t, "k": k, "x": x})


def acts_fin(raw):
    """Newest-first raw items -> oldest-first, at most 12; consecutive identical tool calls become one 'x ×N'."""
    out, cnt = [], []
    for a in reversed(raw):
        if out and a["k"] == "tool" and out[-1]["k"] == "tool" and out[-1]["x"] == a["x"]:
            cnt[-1] += 1   # t stays the first call's: a folded run keeps its identity across polls, only x changes
        else:
            out.append(dict(a))
            cnt.append(1)
    for a, c in zip(out, cnt):
        if c > 1:
            a["x"] = a["x"][:190] + " ×%d" % c
    return out[-12:]


# ---------- msgs: the instructions that travel between agents (TALK-ENG 1) ----------
TALK_RE = re.compile(r"\[Agen Talk · ([A-Za-z0-9._-]{1,32}@[A-Za-z0-9._-]{1,64}) · (at-[0-9a-f]{8})\]")   # our own talk prefix, anchored at the body's start
TALK_MAX = 4000


def msgs_add(ms, nid, d, kind, frm, to, who, ts, text, **kw):
    """Append one message (dir down|follow|up, kind agent|workflow|codex|agy|peer|talk) when it has a time. Text: redacted, then cut at 4,000."""
    if not ts:
        return
    text = text or ""
    raw_n = len(text)
    text = redact(CTRL.sub("", text[:8000]))
    m = {"id": hashlib.sha1(("%s|%s|%s|%s" % (nid, d, ts, text[:200])).encode("utf-8", "replace")).hexdigest()[:12], "dir": d, "kind": kind,
         "from": line1(frm, 200), "to": line1(to, 200), "who": line1(who, 80), "ts": ts, "text": text[:TALK_MAX]}
    if raw_n > TALK_MAX:
        m.update(truncated=True, n=raw_n)
    ms.append(dict(m, **{k: v for k, v in kw.items() if v}))


def msgs_fin(ms):
    """Oldest first, at most 8: the spawn instruction is always kept, plus the newest 7 others."""
    ms.sort(key=lambda m: m["ts"])
    d = next((m for m in ms if m["dir"] == "down" and m["kind"] not in ("peer", "talk")), None)
    return sorted(([d] if d else []) + [m for m in ms if m is not d][-7:], key=lambda m: m["ts"])


def msgs_post(forest, cap=60000):
    """Resolve peer ids, then keep whole messages up to cap and previews up to 2x cap."""
    ms = [m for n in claude_walk(forest) for m in n.get("msgs", ())]
    for m in ms:
        fs = m.pop("fs", None)
        if fs in NODES:
            m["from"] = fs
    ordered = sorted(ms, key=lambda m: -m["ts"])
    tot, preview = 0, []
    for m in ordered:
        n = len(m["text"].encode("utf-8"))
        if tot + n > cap:
            preview.append(m)
        else:
            tot += n
    for m in sorted(preview, key=lambda m: (m["dir"] != "down", -m["ts"])):
        n = m.get("n", len(m["text"]))
        sample = m["text"][:300]
        size = len(sample.encode("utf-8"))
        if tot + size <= cap * 2:
            if len(m["text"]) > 300:
                m.update(n=n, text=sample, truncated=True)
            tot += size
        else:
            m.update(n=n, text="", truncated=True)



# ---------- processes ----------
PROC = {}   # pid -> {ppid, comm, uid, cpu (ticks), start (raw stat field 22 | None), started (epoch), state[, cmd on Windows]}
PREV = {}   # (pid, started) -> (cpu ticks, sampled at): the previous collect()'s sample; lives in the serving process
PTS = 0     # when PROC was sampled
KIDS = (None, {})  # (the PROC it was built from, ppid -> [pids])
BTIME = 0
if not WIN:
    BTIME = next(int(l.split()[1]) for l in open("/proc/stat") if l.startswith("btime"))
PS = ("Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine,CreationDate,"
      "UserModeTime,KernelModeTime | ConvertTo-Json -Compress")


PS_AT = [0.0]   # when ps_json last ran (Windows)


def procs():
    global PTS
    if WIN and PROC and time.time() - PS_AT[0] < 5:   # ponytail: PowerShell costs 0.5-2 s; reuse the last snapshot for 5 s (ctypes Toolhelp32 if CPU shows up)
        return PROC
    PS_AT[0] = time.time()
    PREV.clear()  # the old PROC becomes the baseline for CPU deltas
    PREV.update({(k, v["started"]): (v["cpu"], PTS) for k, v in PROC.items()})
    PTS = NOW
    if WIN:
        snap = win_procs(ps_json())
        if not snap and PROC:   # PowerShell failed or timed out: keep the last snapshot instead of showing every agent dead
            WARN.append("프로세스 목록을 읽지 못함 (PowerShell 실패/시간 초과)")
            return PROC
        return snap
    out = {}
    for d in os.listdir("/proc"):
        if not d.isdigit():
            continue
        try:
            st = open(f"/proc/{d}/stat").read()
            uid = os.stat(f"/proc/{d}").st_uid
        except OSError:
            continue
        r = st[st.rindex(")") + 2:].split()
        out[int(d)] = {"ppid": int(r[1]), "comm": st[st.index("(") + 1:st.rindex(")")], "uid": uid, "state": r[0],
                       "cpu": int(r[11]) + int(r[12]) + int(r[13]) + int(r[14]),  # + reaped children: short greps count
                       "start": r[19], "started": BTIME + int(r[19]) / CLK}
    return out


def ps_json():
    import subprocess
    try:  # ponytail: one PowerShell per poll; cache for 2 polls if it exceeds 1 s
        return subprocess.run([sys32("WindowsPowerShell", "v1.0", "powershell.exe") if WIN else "powershell", "-NoProfile", "-NonInteractive", "-Command",
                               "[Console]::OutputEncoding=[Text.Encoding]::UTF8;" + PS],  # 5.1 default: OEM cp949
                              **popen_kw(capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=10)).stdout
    except (OSError, subprocess.SubprocessError):
        return ""


def win_procs(text):
    try:
        d = json.loads(text.lstrip("\ufeff")) if text.strip() else []
    except ValueError:
        WARN.append("프로세스 목록을 읽지 못함")
        return {}
    out = {}
    for p in [d] if isinstance(d, dict) else d:  # one process -> a bare object
        if not isinstance(p, dict) or "ProcessId" not in p:
            continue
        m = re.search(r"Date\((\d+)", p.get("CreationDate") or "")  # ponytail: PowerShell 5.1 date format; 7 emits ISO -> NOW
        name = p.get("Name") or ""
        out[p["ProcessId"]] = {"ppid": p.get("ParentProcessId") or 0, "comm": re.sub(r"\.exe$", "", name.lower()), "uid": 0,
                               "cpu": (int(p.get("UserModeTime") or 0) + int(p.get("KernelModeTime") or 0)) // 100000,
                               "start": None, "started": int(m.group(1)) / 1000 if m else NOW, "state": "S",
                               "cmd": p.get("CommandLine") or name}
    return out


def fds(pid):
    try:
        names = os.listdir(f"/proc/{pid}/fd")
    except OSError:
        return []
    out = []
    for f in names:   # an fd closed between listdir and readlink must not drop the others
        try:
            out.append(os.readlink(f"/proc/{pid}/fd/{f}"))
        except OSError:
            pass
    return out


def cwd(pid):
    try:
        return os.readlink(f"/proc/{pid}/cwd")
    except OSError:
        return ""


def argv(pid):
    if WIN:   # no /proc: split the CommandLine of the process snapshot (good enough for flag checks)
        import shlex
        try:
            return [a.strip('"') for a in shlex.split(PROC.get(pid, {}).get("cmd") or "", posix=False)]
        except ValueError:
            return (PROC.get(pid, {}).get("cmd") or "").split()
    try:
        return open(f"/proc/{pid}/cmdline", "rb").read().decode("utf-8", "replace").split("\0")[:-1]
    except OSError:
        return []


def top(parent, t):
    while t in parent:
        t = parent[t]
    return t


def proc_env(pid):
    """Only CLAUDE_PID and CODEX_THREAD_ID; the rest of the environment is never kept."""
    try:
        raw = open(f"/proc/{pid}/environ", "rb").read()
    except OSError:
        return {}
    return {k.decode(): v.decode("utf-8", "replace") for k, v in re.findall(rb"(?:^|\0)(CLAUDE_PID|CODEX_THREAD_ID)=([^\0]*)", raw)}


def proc_kids(pid, deep=True):
    global KIDS
    if KIDS[0] is not PROC:
        m = defaultdict(list)
        for k, v in PROC.items():
            m[v["ppid"]].append(k)
        KIDS = (PROC, m)
    out, todo = [], [pid]
    while todo:
        c = KIDS[1].get(todo.pop(), [])
        out += c
        if deep:
            todo += c
    return out


def proc_cpu(pid):
    """Ticks/s of this pid alone since the previous collect(); lifetime average on first sight."""
    p = PROC[pid]
    pv = PREV.get((pid, p["started"]))
    return (p["cpu"] - pv[0]) / max(NOW - pv[1], 0.5) if pv else p["cpu"] / max(NOW - p["started"], 1)


def proc_cmd(pid):
    a = argv(pid)
    return " ".join([os.path.basename(a[0])] + a[1:]) if a else PROC[pid].get("cmd") or PROC[pid]["comm"]


def proc_entry(pid, cmd=None, bg=False):
    """A tool root as shown on its agent: subtree CPU %, state, busiest descendant."""
    kids = proc_kids(pid)
    sts = {PROC[m]["state"] for m in [pid] + kids}
    rate = {m: proc_cpu(m) for m in [pid] + kids}
    e = {"pid": pid, "cmd": line1(redact(line1(cmd or proc_cmd(pid), 4096))), "age": max(NOW - PROC[pid]["started"], 0),
         "cpu": int(sum(rate.values()) / CLK * 100),
         "state": next((s for s in "RDT" if s in sts), "Z" if sts == {"Z"} else "S")}
    if kids:
        e["kid"] = line1(redact(line1(proc_cmd(max(kids, key=lambda m: (rate[m], m))), 4096)), 120)
    if bg:
        e["bg"] = True
    return e


SHELL_RE = re.compile(rb"\beval '(.*)' (?:< /dev/null )?&& pwd -P >\| \S*/claude-[0-9a-f]+-cwd", re.S)   # any temp dir: /tmp, $TMPDIR, Git Bash's /c/Users/…/Temp


def shell_cmdline(cmd):
    """Windows: Git Bash's `bash.exe -c "…"` command line with the CreateProcess escapes (\\" and \\\\) undone, as bytes."""
    return cmd.replace('\\"', '"').replace("\\\\", "\\").encode("utf-8", "replace")


def same_proc_start(p, proc_start):
    """PID-reuse guard for a sessions/<pid>.json: Linux compares /proc stat field 22; Windows' procStart is a FILETIME (100 ns since 1601)."""
    if not proc_start:
        return True
    if p["start"] is not None:
        return str(p["start"]) == str(proc_start)
    try:
        return abs(p["started"] - (int(proc_start) / 1e7 - 11644473600)) < 2
    except (TypeError, ValueError):
        return True


def proc_shells(host):
    """[(pid, eval_text, fd1)] of the claude tool shells directly under a claude process."""
    out = []
    for c in proc_kids(host, False):
        try:
            raw = shell_cmdline(PROC[c]["cmd"]) if WIN else open(f"/proc/{c}/cmdline", "rb").read()
        except OSError:
            continue
        m = SHELL_RE.search(raw)
        if m:
            try:
                fd1 = os.readlink(f"/proc/{c}/fd/1")
            except OSError:
                fd1 = ""
            out.append((c, m.group(1).replace(b"'\"'\"'", b"'").decode("utf-8", "replace"), fd1))
    return out


def proc_tagged(host):
    """{pid: thread id} of the direct children of a codex process that carry CODEX_THREAD_ID (its tool commands)."""
    return {c: t for c in proc_kids(host, False) for t in [proc_env(c).get("CODEX_THREAD_ID")] if t}


def proc_find(nodes, pid):
    for n in nodes:
        if any(p["pid"] == pid for p in n["procs"]):
            return n
        r = proc_find(n["kids"], pid)
        if r:
            return r


def proc_attach(roots):
    """Nest agent hosts under the node whose tool process launched them; attach reparented leftovers; drop the rest."""
    forest = roots.pop(None, [])
    for pid in sorted(roots, key=lambda x: PROC[x]["started"]):
        c, par = pid, PROC[pid]["ppid"]
        while par in PROC and not roots.get(par) and par != c:  # Windows: pid 0 is its own parent
            c, par = par, PROC[par]["ppid"]
        if not roots.get(par) or par == pid:
            forest += roots[pid]
            continue
        t = proc_find(roots[par], c)  # the node whose procs hold the launching child
        if t:
            t["procs"] = [p for p in t["procs"] if p["pid"] != c]
            if t["st"] == "tool":
                t["st"], t["why"] = "child", "하위 에이전트 실행 중 (%s)" % roots[pid][0]["tool"]
        (t or roots[par][0])["kids"] += roots[pid]
    seen = {p["pid"] for n in NODES.values() for p in n["procs"]}
    me = os.getuid() if not WIN else 0
    for pid, p in PROC.items():  # reparented leftovers: nohup, setsid, Monitor shells whose call is gone
        if p["uid"] != me or (p["ppid"] in PROC and p["ppid"] != 1) or pid in roots or pid in seen:
            continue
        e = proc_env(pid)
        x, t = int(e.get("CLAUDE_PID") or 0) if str(e.get("CLAUDE_PID") or "0").isdigit() else 0, e.get("CODEX_THREAD_ID")   # an empty or junk CLAUDE_PID is just no claude
        n = roots[x][0] if roots.get(x) and PROC[x]["started"] <= p["started"] else NODES.get(t)
        if n:
            n["procs"].append(proc_entry(pid, bg=True))
        # ponytail: ownerless leftovers are invisible; a '고아 작업' list if wanted
    return forest


def selftest_proc():
    global PROC, PREV, NOW, NODES, proc_env, argv
    # claude tool shells: Linux argv (any temp dir) and Windows Git Bash command lines (CreateProcess escapes)
    lin = b"bash\0-c\0source x && eval 'ls -la' < /dev/null && pwd -P >| /run/user/1000/claude-ab12-cwd\0"
    win = r'''"C:\Program Files\Git\bin\bash.exe" -c "source /c/s.sh && eval 'grep \"a b\" f' < /dev/null && pwd -P >| /c/Temp/claude-9328-cwd"'''
    assert SHELL_RE.search(lin).group(1) == b"ls -la" and SHELL_RE.search(shell_cmdline(win)).group(1) == b'grep "a b" f'
    wp = {"start": None, "started": 1792200902.634}   # Windows: procStart is a FILETIME of the same instant
    assert same_proc_start(wp, "134366745026348375") and not same_proc_start(wp, str(134366745026348375 + 10 ** 8)) and same_proc_start(wp, None)
    assert same_proc_start({"start": "77", "started": 0}, "77") and not same_proc_start({"start": "78", "started": 0}, "77")
    save = PROC, dict(PREV), NOW, dict(NODES), proc_env, KIDS, argv
    uid = 0 if WIN else os.getuid()
    argv = lambda pid: []   # the fake pids (10, 11, 12…) are real processes inside a container: never read their /proc
    try:
        w = win_procs('[{"ProcessId":100,"ParentProcessId":4,"Name":"claude.exe","CommandLine":"claude.exe -p","CreationDate":"/Date(1760000000000)/",'
                      '"UserModeTime":3000000,"KernelModeTime":2000000},{"ProcessId":200,"ParentProcessId":100,"Name":"bash.exe","CommandLine":null,'
                      '"CreationDate":"/Date(1760000001000)/","UserModeTime":0,"KernelModeTime":0},'
                      '{"ProcessId":300,"ParentProcessId":200,"Name":"python.exe","CommandLine":"python x.py","CreationDate":"/Date(1760000002000)/",'
                      '"UserModeTime":1,"KernelModeTime":1}]')
        assert w[100]["comm"] == "claude" and w[300]["ppid"] == 200 and w[200]["cmd"] == "bash.exe"
        assert w[100]["cpu"] == 50 and w[100]["started"] == 1760000000.0 and w[100]["start"] is None
        assert win_procs('{"ProcessId":1,"Name":"a.exe"}')[1]["comm"] == "a"
        # CPU deltas, state precedence, subtree sum, busiest descendant
        NOW = 1000.0
        mk = lambda pp, cpu, st="S", cm="x": {"ppid": pp, "comm": cm, "uid": uid, "cpu": cpu, "start": "1", "started": 0.0, "state": st}
        PROC = {10: mk(1, 0, cm="claude"), 11: mk(10, 100), 12: mk(11, 500, "D", "sleep"), 13: mk(11, 100, "R", "make")}
        PREV.clear()
        PREV.update({(11, 0.0): (100, 997.0), (12, 0.0): (200, 997.0), (13, 0.0): (100, 997.0)})
        assert proc_cpu(12) == 100 and proc_cpu(13) == 0
        e = proc_entry(11, "curl -H 'Authorization: Bearer abcdefghijklmnop12345'")
        assert e["cmd"] == "curl -H 'Authorization: Bearer [가려짐]'", e
        assert proc_entry(11, "x" * 180 + " Bearer abcdefghijklmnop12345")["cmd"] == "x" * 180 + " Bearer [가려짐]"
        assert e["cpu"] == 100 and e["state"] == "R" and e["kid"] == "sleep" and "bg" not in e, e
        PROC[13]["state"] = "S"
        assert proc_entry(11)["state"] == "D" and proc_entry(12)["state"] == "D"
        PROC[12]["state"] = "Z"
        assert proc_entry(12)["state"] == "Z" and "kid" not in proc_entry(12)
        assert sorted(proc_kids(10)) == [11, 12, 13] and proc_kids(10, False) == [11]
        # attach: host B (pid 21) runs under shell 11 of host A (pid 10); leftover 40 is tagged with A
        PROC = {10: mk(1, 0, cm="claude"), 11: mk(10, 0), 21: mk(11, 0, cm="claude"), 40: mk(1, 0), 41: mk(1, 0)}
        PROC[40]["started"] = PROC[41]["started"] = 5.0
        nd = lambda t, st: {"id": t, "tool": t, "st": st, "why": "", "procs": [], "kids": []}
        a, b, c = nd("codex", "tool"), nd("claude", "work"), nd("agy", "dead")
        a["procs"] = [{"pid": 11}]
        NODES.clear()
        NODES.update({"A": a, "B": b})
        proc_env = lambda p: {"CLAUDE_PID": "10"} if p == 40 else {"CODEX_THREAD_ID": "A"} if p == 41 else {}
        f = proc_attach({None: [c], 10: [a], 21: [b]})
        assert f == [c, a] and a["kids"] == [b] and a["st"] == "child" and "claude" in a["why"], f
        assert [p["pid"] for p in a["procs"]] == [40, 41] and all(p["bg"] for p in a["procs"]), a["procs"]
        PROC = {0: mk(0, 0), 10: mk(0, 0, cm="claude")}  # Windows System Idle Process: its own parent, must not loop
        assert proc_attach({10: [nd("claude", "work")]})
        assert win_procs("garbage") == {} and win_procs('{"Name":"x"}') == {}
        WARN.clear()
    finally:
        PROC, NOW, proc_env, argv = save[0], save[2], save[4], save[6]
        PREV.clear(), PREV.update(save[1]), NODES.clear(), NODES.update(save[3])


# ---------- codex ----------
CX, CX_KIDS, CX_PARENT, CX_HELD, CX_TURN, CX_TAG, CX_LIVE = {}, {}, {}, {}, {}, {}, set()
CX_SUB = set()   # threads whose `source` says subagent (guardian reviews have no spawn edge): never a root room
CX_CALLS = ("function_call", "custom_tool_call", "local_shell_call")


def codex_lines(path):
    """Newest-first rollout lines: 256 KB tail, 4 MB if that parsed nothing (one >256 KB line)."""
    for n in (1 << 18, 4 << 20):
        g = tail(path, n)
        d = next(g, None)
        if d:
            return chain([d], g)
    return iter(())


def codex_state(lines, held_pid, holder_started, tagged, source, is_sub, kids_open, turn_start):
    """(st, why, now, last, ts, since) from newest-first rollout lines. Rules: spec 3.2 (1-11).
    tagged = pids of this thread's tool processes (CODEX_THREAD_ID children of the holder)."""
    outs, pend, ctx, now, newest, ts, mark = set(), [], None, None, None, None, None
    for d in lines:
        p, ty = d.get("payload") or {}, d.get("type")
        t = p.get("type") if isinstance(p, dict) else None
        ts = ts or iso(d.get("timestamp"))
        if newest is None and t != "token_count":
            newest = t
        if ty == "event_msg" and t in ("task_started", "task_complete", "turn_aborted"):
            mark = (t, p, d)
            break
        if ty == "turn_context" and ctx is None:
            ctx = p
        elif ty == "response_item":
            if t and t.endswith("_output"):
                outs.add(p.get("call_id"))
            elif t in CX_CALLS:
                a = p.get("input") or p.get("arguments") or p.get("action")
                now = now or act(p.get("name", t), a)
                if p.get("call_id") not in outs:
                    pend.append((p.get("name"), p.get("namespace"), a, iso(d.get("timestamp"))))
            elif t == "message" and p.get("role") == "assistant" and now is None:
                now = line1(" ".join(c.get("text", "") for c in p.get("content", []) if isinstance(c, dict)))
    m, mp = (mark[0], mark[1]) if mark else (None, {})
    done = is_sub or source == "exec"  # exec roots finish like subagents: nobody types a follow-up
    last = line1(mp.get("last_agent_message")) if m == "task_complete" else None
    # the turn's start: task_started carries epoch started_at; no marker in the tail -> thread_turns
    start = (mp.get("started_at") or iso(mark[2].get("timestamp"))) if m == "task_started" else turn_start
    if m == "task_complete":
        e = mp.get("error")
        if e:
            r = e.get("codex_error_info") if isinstance(e, dict) else None
            r = next(iter(r), None) if isinstance(r, dict) else r
            if not done and r in ("usage_limit_exceeded", "unauthorized"):
                return "user", "사용량 한도/인증 필요", now, last, ts, None
            return "stopped", "오류: %s" % (r or "알 수 없음"), now, last, ts, None
        return "user", "답변 끝남", now, last, ts, None
    if m == "turn_aborted":
        return ("stopped", "중단됨", now, last, ts, None) if done else ("user", "사용자가 중단함 (Esc)", now, last, ts, None)
    if held_pid is None:
        return "dead", "프로세스 없음, 턴 미완료", now, last, ts, None
    if (start and holder_started and start + 1 < holder_started) or newest == "thread_settings_applied":
        return "user", "이전 실행의 턴 · 입력 기다림", now, last, ts, None  # orphan: the process restarted, the turn never did
    if PROC.get(held_pid, {}).get("state") == "T":
        return "stall", "프로세스 정지됨 (T)", now, last, ts, start
    if any(c[0] == "wait_agent" for c in pend):
        return "child", "하위 에이전트 대기", now, last, ts, start
    for name, ns, args, cts in pend:
        if name == "sleep" and ns == "clock":
            try:
                sec = json.loads(args)["duration_ms"] / 1000
            except (ValueError, KeyError, TypeError):
                sec = 0
            if kids_open:
                return "child", "타이머 대기 (하위 작업 중)", now, last, ts, start
            return "tool", "타이머 %.0f초" % sec, now, last, ts, start
    if pend:
        name, ns, args, cts = pend[-1]  # oldest pending call
        age = NOW - cts if cts else 0
        now = act(name, args)
        if (ctx or {}).get("approval_policy") not in (None, "never") and ctx.get("approvals_reviewer") == "user" \
                and ("require_escalated" in str(args) or (not tagged and age > 5 and not WIN)):  # ponytail: no CODEX_THREAD_ID env on Windows, so never guess 'approval'
            return "user", "명령 승인 대기", now, last, ts, start
        return "tool", "%s 실행 중 %s%s" % (line1(now, 60), fmt(age), "" if tagged else " (프로세스 미확인)"), now, last, ts, start, cts
    return "work", "모델 응답 중", now, last, ts, start


def codex_acts(lines):
    """Newest-first rollout lines -> activity items (newest first, <= 40 raw). Tool OUTPUTS are never used."""
    raw = []
    for d in lines:
        if len(raw) >= 40:
            break
        p, ty = d.get("payload"), d.get("type")
        if not isinstance(p, dict):
            continue
        t = p.get("type")
        txt = " ".join(c.get("text", "") for c in p.get("content", []) if isinstance(c, dict)) if isinstance(p.get("content"), list) else ""
        if ty == "event_msg":
            if t == "user_message":
                if not TALK_RE.match(str(p.get("message")).lstrip()):   # our own talk arrives as msgs kind talk, never as a prompt of the human
                    acts_add(raw, d, "user", p.get("message"))
            elif t == "task_complete":
                e = p.get("error")
                r = (e.get("codex_error_info") if isinstance(e, dict) else e) if e else None
                r = next(iter(r), None) if isinstance(r, dict) else r
                acts_add(raw, d, "err", "오류: %s" % (r or "알 수 없음")) if e else acts_add(raw, d, "done", p.get("last_agent_message") or "턴 끝남")
            elif t == "turn_aborted":
                acts_add(raw, d, "err", "중단됨")
            elif t and (t.endswith("_approval_request") or t == "request_user_input"):
                c = p.get("command")
                acts_add(raw, d, "ask", " ".join(map(str, c)) if isinstance(c, list) else c or p.get("reason") or p.get("question") or t)
        elif ty == "response_item":
            if t in CX_CALLS:
                a, nm = p.get("input") or p.get("arguments") or p.get("action"), p.get("name", t)
                if nm in ("spawn_agent", "followup_task"):
                    try:
                        j = json.loads(a)
                    except (ValueError, TypeError):
                        j = None
                    j = j if isinstance(j, dict) else {}
                    acts_add(raw, d, "spawn", j.get("task_name") or j.get("agent_name") or j.get("target") or nm)
                else:
                    acts_add(raw, d, "tool", act(nm, a))
            elif t == "message" and p.get("role") == "assistant" or t == "agent_message":
                acts_add(raw, d, "say", txt)
            elif t == "message" and p.get("role") == "user" and not txt.lstrip().startswith(("<", "#")) and not TALK_RE.match(txt.lstrip()):  # AGENTS.md / environment blobs
                acts_add(raw, d, "user", txt)
    return raw


def codex_msgs(t, lines):
    """TALK-ENG 1.2 Codex. A sub thread: the spawn (its text is encrypted), the parent's later messages, its reports. A root: our own talks."""
    _, path, role, apath, model, title, first, source, rec, cwd_, created = CX[t]
    par, ms = CX_PARENT.get(t), []
    if par:
        pa = (CX[par][3] if par in CX else None) or "/root"   # the parent's agent path: depth 1 hangs under /root
        who = NODES[par]["name"] if par in NODES else "?"
        msgs_add(ms, t, "down", "codex", par, t, who, created, "", encrypted=True, role=role)
    for d in lines:
        p, ts = d.get("payload"), iso(d.get("timestamp"))
        if not isinstance(p, dict):
            continue
        ty, pt = d.get("type"), p.get("type")
        if par and pt == "agent_message" and apath and p.get("recipient") == apath and p.get("author") == pa and ts and ts - (created or 0) >= 5:
            c = [x for x in p.get("content") or () if isinstance(x, dict)]   # header (plain) + body: encrypted unless it is a FINAL_ANSWER
            enc = any(x.get("type") == "encrypted_content" for x in c)
            msgs_add(ms, t, "follow", "codex", par, t, who, ts, "" if enc else (c[0].get("text", "") if c else "").partition("Payload:\n")[2], encrypted=enc, role=role)
        elif par and ty == "event_msg" and pt == "task_complete" and p.get("last_agent_message"):
            msgs_add(ms, t, "up", "codex", t, par, who, ts, p["last_agent_message"], role=role)
        elif par and ty == "response_item" and pt == "function_call" and p.get("namespace") == "collaboration" and p.get("name") == "send_message":
            try:
                tg = json.loads(p.get("arguments")).get("target")
            except (ValueError, TypeError, AttributeError):
                tg = None
            if tg == pa:
                msgs_add(ms, t, "up", "codex", t, par, who, ts, "", encrypted=True, role=role)
        elif not par and ty == "event_msg" and pt == "user_message":
            m = TALK_RE.match(str(p.get("message")).lstrip())
            if m:
                msgs_add(ms, t, "down", "talk", "agen-talk:" + m.group(1), t, m.group(1), ts, str(p["message"]).lstrip()[m.end():].strip(), msg_id=m.group(2), by=m.group(1))
    return msgs_fin(ms)


def cx_subagent(source):
    """The `subagent` object of a threads.source JSON ({"subagent": {"thread_spawn": {...}}} or {"subagent": {"other": "guardian"}}), else None."""
    if not isinstance(source, str) or not source.startswith("{"):
        return None
    try:
        d = json.loads(source)
    except ValueError:
        return None
    return d.get("subagent") if isinstance(d, dict) and "subagent" in d else None


def codex_node(t):
    _, path, role, apath, model, title, first, source, rec, cwd_, created = CX[t]
    pid = CX_HELD.get(t)
    if pid not in CX_TAG:  # direct children of the holder carrying this thread's id (proc_tagged is per holder)
        CX_TAG[pid] = proc_tagged(pid) if pid else {}
    tagged = [p for p, th in CX_TAG[pid].items() if th == t]
    sub = bool(apath) or t in CX_PARENT or t in CX_SUB
    kids = [k for k in CX_KIDS.get(t, ()) if k in CX]
    g, seen = codex_lines(path), []

    def rec():  # state reads newest-first until the turn marker; acts and msgs continue on the same iterator (one read, no second pass over the file)
        for d in g:
            seen.append(d)
            yield d
    st, why, now, last, ts, since, *c0 = codex_state(
        rec(), pid, PROC[pid]["started"] if pid in PROC else None, tagged, source, sub,
        any(k in CX_HELD and CX_TURN.get(k, ("inProgress",))[0] == "inProgress" for k in kids), CX_TURN.get(t, (0, None))[1])
    lines = seen + list(g)   # ponytail: the whole 256 KB tail is parsed every poll now (3-5 ms per thread); stop codex_msgs early if that shows in collect time
    n = node(t, "codex", apath.rsplit("/", 1)[-1] if sub and apath else line1(title or first), st, why, ts or mtime(path),
             sub=sub or source == "exec", since=since, now=now, last=last, acts=acts_fin(codex_acts(lines)), msgs=codex_msgs(t, lines),
             meta=" · ".join(filter(None, ["pid %d" % pid if pid else "", short(cwd_), model, role if sub else ""])), project=git_project(cwd_))
    c0 = (c0 or [NOW])[0] or NOW  # oldest pending call; processes that predate it are leftovers, not the call
    n["procs"] = [proc_entry(p, bg=st != "tool" or PROC[p]["started"] < c0 - 5) for p in tagged]
    for k in kids:
        if k not in CX_LIVE and k not in CX_HELD and (CX_TURN.get(k, (0,))[0] != "inProgress") and NOW - (mtime(CX[k][1]) or 0) > OLD:
            n["hidden"] += 1  # finished and old: not even read
        else:
            n["kids"].append(codex_node(k))
    return fold(n)


def codex_host(v):
    """A process that can hold Codex threads. Linux finds the holder by its open rollout fds, so any codex* process may stay a candidate;
    Windows has no fd listing and takes hosts[0] as the holder, so helpers (the always-on sandbox service, computer-use, exec-server) must not count."""
    if WIN:
        return v["comm"] == "codex" and not re.search(r" exec-server( |$)", v.get("cmd") or "")
    return v["comm"].startswith("codex") and v["comm"] != "codex-code-mode"


def codex_collect(roots):
    global CX, CX_KIDS, CX_PARENT, CX_HELD, CX_TURN, CX_TAG, CX_LIVE
    hosts = [p for p, v in PROC.items() if codex_host(v)]
    db, hist = HOME / ".codex/state_5.sqlite", HOME / ".codex/thread_history_1.sqlite"
    CX = {r[0]: r for r in q(db, "select id, rollout_path, agent_role, agent_path, model, substr(title,1,200),"
                             " substr(first_user_message,1,200), source, recency_at_ms, cwd, created_at from threads", bool(hosts))}
    CX_KIDS, CX_PARENT, CX_HELD, CX_TURN, CX_TAG = defaultdict(list), {}, {}, {}, {}
    if not CX:
        if db.exists():
            WARN.append("codex: state_5.sqlite 읽기 실패")
        return
    for p, c in q(db, "select parent_thread_id, child_thread_id from thread_spawn_edges", bool(hosts)):
        CX_KIDS[p].append(c)
        CX_PARENT[c] = p
    CX_SUB.clear()
    for t, r in CX.items():
        sp = cx_subagent(r[7])
        if sp is None:
            continue
        CX_SUB.add(t)
        par = (sp.get("thread_spawn") or {}).get("parent_thread_id") if isinstance(sp, dict) else None
        if par in CX and t not in CX_PARENT:   # an edge the table lacks: the child still belongs under its parent
            CX_KIDS[par].append(t)
            CX_PARENT[t] = par
    # latest turn per thread, trusted only while the projection has caught up with the rollout file
    by_path = {r[1]: t for t, r in CX.items()}
    for tid, st, started, off in q(hist, "select t.thread_id, t.status, t.started_at, s.next_rollout_byte_offset from thread_turns t"
                                   " join thread_history_projection_state s using (thread_id) where t.rollout_ordinal ="
                                   " (select max(rollout_ordinal) from thread_turns where thread_id = t.thread_id)", bool(hosts)):
        if tid in CX and off == (os.stat(CX[tid][1]).st_size if os.path.exists(CX[tid][1]) else -1):
            CX_TURN[tid] = (st, started)
    for pid in hosts:  # the holder of a rollout file is the process whose thread it is (app-server daemons too)
        for f in fds(pid):
            if f in by_path:
                CX_HELD[by_path[f]] = pid
    if WIN and hosts:  # ponytail: Windows has no fd listing; treat inProgress threads plus recent completed interactive ones as live
        CX_HELD.update({t: hosts[0] for t, r in CX.items() if CX_TURN.get(t, ("",))[0] == "inProgress" and NOW - r[8] / 1000 < 86400})
        cutoff = min(PROC[h]["started"] for h in hosts) - 5
        recent = sorted(((r[8], t) for t, r in CX.items() if CX_TURN.get(t, ("",))[0] == "completed"
                         and r[7] != "exec" and t not in CX_SUB and r[8] / 1000 >= cutoff), reverse=True)
        CX_HELD.update({t: hosts[0] for _, t in recent[:len(hosts)]})
    CX_LIVE = set()  # held threads and their ancestors: never skipped as 'finished'
    for t in CX_HELD:
        while t and t not in CX_LIVE:
            CX_LIVE.add(t)
            t = CX_PARENT.get(t)
    for t in ({top(CX_PARENT, t) for t in CX_HELD} & set(CX)) - CX_SUB:
        roots.setdefault(CX_HELD.get(t), []).append(codex_node(t))
    for t, r in CX.items():  # killed `codex exec` and friends: open turn, nobody holds it
        if t not in CX_PARENT and t not in CX_SUB and t not in CX_LIVE and (CX_TURN.get(t, ("",))[0] == "inProgress" and NOW - r[8] / 1000 < 86400
                                                       or r[7] == "exec" and NOW - r[8] / 1000 < FRESH):  # a just-finished `codex exec` stays visible as done
            n = codex_node(t)
            if n["st"] in ("dead", "done"):
                roots[None].append(n)


def selftest_codex():
    global NOW, PROC
    NOW = 1000000.0
    import datetime as _d
    ts = lambda off: _d.datetime.fromtimestamp(NOW - off, _d.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    ev = lambda off, t, **p: {"type": "event_msg", "timestamp": ts(off), "payload": dict(type=t, **p)}
    ri = lambda off, t, **p: {"type": "response_item", "timestamp": ts(off), "payload": dict(type=t, **p)}
    call = lambda off, name, cid, args="{}", ns=None: ri(off, "function_call", name=name, call_id=cid, arguments=args, namespace=ns)
    ctx = lambda pol, rev: {"type": "turn_context", "timestamp": ts(500), "payload": {"approval_policy": pol, "approvals_reviewer": rev}}
    start = ev(600, "task_started", started_at=NOW - 600)
    PROC = {7: {"started": NOW - 5000, "state": "S"}}
    st = lambda lines, held=7, tagged=(), src="cli", sub=False, kids=False, ts0=None, hs=NOW - 5000: \
        codex_state(iter(lines), held, hs, list(tagged), src, sub, kids, ts0)
    # Windows hosts: the app-server or CLI, never the sandbox service / computer-use helper / exec-server
    g = globals()
    old_win = g["WIN"]   # WIN is declared global further down this function
    try:
        g["WIN"] = True
        pr = lambda comm, cmd: {"comm": comm, "cmd": cmd}
        assert codex_host(pr("codex", r"C:\c\codex.exe -c x=1 app-server --analytics-default-enabled")) and codex_host(pr("codex", "codex.exe"))
        assert not codex_host(pr("codex-windows-sandbox-service", "codex-windows-sandbox-service.exe"))
        assert not codex_host(pr("codex-computer-use-swift", "x")) and not codex_host(pr("codex", 'codex.exe -c "a=b" exec-server --remote https://x'))
    finally:
        g["WIN"] = old_win
    # 1: error task_complete
    e = lambda r: [ev(1, "task_complete", error={"message": "x", "codex_error_info": r}, last_agent_message=None), start]
    assert st(e("usage_limit_exceeded"))[:2] == ("user", "사용량 한도/인증 필요")
    assert st(e("usage_limit_exceeded"), sub=True)[0] == "stopped" and st(e("server_overloaded"))[:2] == ("stopped", "오류: server_overloaded")
    # 2/3: clean end, esc
    r = st([ev(1, "task_complete", error=None, last_agent_message="끝\n둘째"), start])
    assert r[0] == "user" and r[3] == "끝" and r[5] is None
    assert st([ev(1, "turn_aborted", reason="interrupted"), start])[:2] == ("user", "사용자가 중단함 (Esc)")
    assert st([ev(1, "turn_aborted"), start], sub=True)[0] == "stopped"
    # Windows has no fd association: retain an interactive room after its turn completes while Codex stays alive.
    import tempfile
    global HOME, WIN, CX, CX_KIDS, CX_PARENT, CX_HELD, CX_TURN, CX_TAG, CX_LIVE, q, fds
    old_home, old_win, old_q, old_fds = HOME, WIN, q, fds
    old_proc = PROC
    tmp_home = tempfile.TemporaryDirectory()
    try:
        WIN, HOME = True, Path(tmp_home.name)
        PROC = {7: {"comm": "codex", "state": "S", "started": NOW - 60, "ppid": 1, "cpu": 0, "cmd": "codex"}}
        roll = HOME / "rollout.jsonl"
        db, hist = HOME / ".codex/state_5.sqlite", HOME / ".codex/thread_history_1.sqlite"
        db.parent.mkdir()
        db.touch(); hist.touch()
        tick = ["inProgress"]
        def fake_q(path, sql, *args):
            if "select id, rollout_path" in sql:
                return [("thread", str(roll), None, None, None, "room", "first", "cli", int(NOW * 1000), str(HOME), 0)]
            if "parent_thread_id" in sql:
                return []
            if "select t.thread_id" in sql:
                return [("thread", tick[0], NOW, roll.stat().st_size)]
            return []
        q, fds = fake_q, lambda pid: []
        closed_roll = HOME / "closed.jsonl"
        closed_roll.write_text(json.dumps(ev(3 * 3600, "task_complete", error=None, last_agent_message="old")) + "\n", encoding="utf-8")
        live_row = ("thread", str(roll), None, None, None, "room", "first", "cli", int(NOW * 1000), str(HOME), 0)
        closed_row = ("closed", str(closed_roll), None, None, None, "old room", "first", "cli",
                      int((NOW - 3 * 3600) * 1000), str(HOME), 0)
        for status, event, age, expected in (("completed", ev(1, "task_complete", error=None, last_agent_message="done"), 0, "user"),
                                             ("inProgress", ri(1, "reasoning"), 30, "work")):
            roll.write_text(json.dumps(event) + "\n", encoding="utf-8")
            tick[0] = status
            live_row = ("thread", str(roll), None, None, None, "room", "first", "cli", int((NOW - age) * 1000), str(HOME), 0)
            def fake_q(path, sql, *args):
                if "select id, rollout_path" in sql:
                    return [live_row, closed_row]
                if "parent_thread_id" in sql:
                    return []
                if "select t.thread_id" in sql:
                    return [("thread", tick[0], NOW, roll.stat().st_size),
                            ("closed", "completed", NOW - 3 * 3600, closed_roll.stat().st_size)]
                return []
            roots = defaultdict(list)
            codex_collect(roots)
            assert roots[7] and roots[7][0]["st"] == expected and all(n["id"] != "closed" for v in roots.values() for n in v), (status, roots)
    finally:
        HOME, WIN, q, fds, PROC = old_home, old_win, old_q, old_fds, old_proc
        tmp_home.cleanup()
    # 4: open turn, nobody holds it
    assert st([ri(5, "reasoning"), start], held=None)[0] == "dead"
    # 5: orphan (settings newest, or turn older than the holder)
    assert st([ev(2, "thread_settings_applied"), ev(3, "token_count"), start])[0] == "user"
    assert st([ri(5, "reasoning"), start], hs=NOW - 10)[:2] == ("user", "이전 실행의 턴 · 입력 기다림")
    # 6: stopped process
    PROC[7]["state"] = "T"
    assert st([start])[0] == "stall"
    PROC[7]["state"] = "S"
    # 7/8: wait_agent, sleep
    assert st([call(5, "wait_agent", "a", ns="collaboration"), start])[0] == "child"
    sl = [call(5, "sleep", "a", '{"duration_ms":45000}', "clock"), start]
    assert st(sl, kids=True)[0] == "child" and st(sl)[:2] == ("tool", "타이머 45초")
    # 9: approval wait (on-request + user reviewer + require_escalated); never -> plain tool
    ex = lambda a: [ri(30, "custom_tool_call", name="exec", call_id="c", input=a), ctx("on-request", "user"), start]
    assert st(ex("tools.exec_command({cmd:\"ls\", sandbox_permissions:\"require_escalated\"})"), tagged=[9])[0] == "user"
    WIN = False
    assert st(ex("tools.exec_command({cmd:\"ls\"})"))[:2] == ("user", "명령 승인 대기")  # no process, older than 5 s
    WIN = True  # no CODEX_THREAD_ID env on Windows: never guess 'approval'
    assert st(ex("tools.exec_command({cmd:\"ls\"})"))[0] == "tool"
    WIN = old_win
    r = st(ex("tools.exec_command({cmd:\"ls\"})"), tagged=[9])  # a process runs: not waiting for approval
    assert r[0] == "tool" and r[1] == "$ ls 실행 중 30s" and r[5] == NOW - 600
    r = st([ri(30, "custom_tool_call", name="exec", call_id="c", input="x"), ctx("never", "user"), start])
    assert r[0] == "tool" and r[1].endswith("(프로세스 미확인)")
    # answered call -> no pending; 11: work
    r = st([ri(1, "custom_tool_call_output", call_id="c"), ri(30, "custom_tool_call", name="exec", call_id="c", input="x"), start])
    assert r[0] == "work" and r[5] == NOW - 600
    # no marker in the tail: since from thread_turns
    assert st([ri(1, "reasoning")], ts0=NOW - 99)[5] == NOW - 99
    # exec roots end like subagents
    assert node("x", "codex", "x", "user", "x", NOW, True)["st"] == "done"
    # acts: newest-first fixture -> oldest first; a user prompt (AGENTS.md blob skipped), assistant text, repeated calls merged, spawn, approval, done
    msg = lambda off, role, text: ri(off, "message", role=role, content=[{"type": "input_text", "text": text}])
    fx = [ev(1, "task_complete", error=None, last_agent_message="끝\n둘째"), msg(2, "assistant", "답\n줄2"), ri(3, "function_call_output", call_id="c3", output="SECRET"),
          call(4, "shell", "c3", '{"command":["ls"]}'), call(5, "shell", "c2", '{"command":["ls"]}'), call(6, "spawn_agent", "c1", '{"task_name":"sci","message":"gAAAA"}'),
          ev(7, "exec_approval_request", command=["rm", "-rf", "x"]), msg(8, "user", "# AGENTS.md instructions"), msg(9, "user", "해줘"), ev(9, "user_message", message="해줘"),
          dict(ev(10, "token_count"), timestamp=None), ev(11, "turn_aborted")]
    a = acts_fin(codex_acts(iter(fx)))
    assert [(x["k"], x["x"]) for x in a] == [("err", "중단됨"), ("user", "해줘"), ("ask", "rm -rf x"), ("spawn", "sci"), ("tool", "$ ls ×2"), ("say", "답"), ("done", "끝")], a
    assert next(x["t"] for x in a if x["k"] == "tool") == NOW - 5   # the folded 'ls ×2' keeps the older call's time
    assert all(x["t"] and "SECRET" not in x["x"] for x in a) and acts_fin(codex_acts(iter([]))) == []


# ---------- claude ----------
INTERRUPTED = "[Request interrupted by user"
CL_KEEP = {"user", "assistant", "system", "api-request"}   # the only record types the state rules read; Claude adds new bookkeeping types often (artifact-autoreact-ledger, custom-title, frame-link…)
CL_QUIET = {"stop_hook_summary", "informational", "away_summary", "compact_boundary"}
CL_WAIT = {"permission prompt": "권한 승인 대기", "input needed": "입력 필요", "worker request": "하위 에이전트 권한 요청",
           "sandbox request": "샌드박스 요청", "goal proposal": "목표 제안 확인", "dialog open": "대화상자 열림"}
CL_RUN = LIVE + ("stall",)
CL_END = ("end_turn", "stop_sequence")


def claude_lines(path):
    """Significant transcript lines, newest first (file order, never timestamps); 64 KB tail, 1 MB if that holds none."""
    for size in (65536, 4 << 20):   # 4 MB like codex_lines: one screenshot tool_result can exceed 1 MB
        out = [d for d in tail(path, size) if d.get("type") in CL_KEEP and isinstance(d.get("message", {}), dict)
               and not (d.get("type") == "system" and d.get("subtype") in CL_QUIET)]
        if out:
            return out
    return []


def claude_content(d):
    m = d.get("message")
    c = m.get("content") if isinstance(m, dict) else None
    if isinstance(c, str):
        return [{"type": "text", "text": c}]
    return [dict(b, input={}) if b.get("type") == "tool_use" and not isinstance(b.get("input"), dict) else b
            for b in c if isinstance(b, dict)] if isinstance(c, list) else []


def claude_text(d):
    for b in reversed(claude_content(d)):
        if b.get("type") == "text" and line1(b.get("text")):
            return line1(b["text"])


def claude_body(d):
    """The record's text blocks, joined (claude_text is only line 1 of the last one)."""
    return "\n".join(str(b.get("text", "")) for b in claude_content(d) if b.get("type") == "text")


def claude_origin(d):
    o = d.get("origin")
    return o if isinstance(o, dict) else {}


def claude_foreign(d, text):
    """A user record the human did not type: injected (isMeta), from another origin (peer, coordinator, task-notification) or one of our own 에겐 톡 talks."""
    body = text.partition("\n")[2] if text.startswith("Another Claude session sent a message") else text
    return bool(d.get("isMeta") or claude_origin(d).get("kind") not in (None, "human") or TALK_RE.match(body))


def claude_now(lines):
    """Newest assistant activity: the tool it called or the text it wrote."""
    for d in lines:
        if d.get("type") == "assistant":
            for b in reversed(claude_content(d)):
                if b.get("type") == "tool_use":
                    return act(b.get("name"), b.get("input"))
                if b.get("type") == "text" and line1(b.get("text")):
                    return line1(b["text"])


def claude_pending(lines):
    """[(tool_use block, its line)] of the newest assistant message that no newer tool_result answers, oldest first."""
    done, mid, uses = set(), None, []
    for d in lines:
        if d.get("type") == "user":
            rs = [b.get("tool_use_id") for b in claude_content(d) if b.get("type") == "tool_result"]
            if not rs and mid is None:
                return []  # a prompt newer than the assistant line: nothing can still be pending
            done.update(rs)
        elif d.get("type") == "assistant":
            i = (d.get("message") or {}).get("id")
            if mid is None:
                mid = i or ""
            elif (i or "") != mid:
                break
            uses[:0] = [(b, d) for b in claude_content(d) if b.get("type") == "tool_use"]
    return [(b, d) for b, d in uses if b.get("id") not in done]


def claude_acts(lines, main):
    """Newest-first transcript lines -> activity items (newest first, <= 40 raw). Tool results are only read to spot a rejection."""
    raw, pend = [], {b.get("id") for b, _ in claude_pending(lines)}
    for d in lines:
        if len(raw) >= 40:
            break
        ty, bl = d.get("type"), claude_content(d)
        if ty == "user":
            if any(b.get("type") == "tool_result" for b in bl):
                if any(b.get("is_error") for b in bl) and str(d.get("toolUseResult")).startswith("User rejected tool use"):
                    acts_add(raw, d, "err", "도구 거부함")
                continue
            text = " ".join(str(b.get("text", "")) for b in bl if b.get("type") == "text").strip()
            if text.startswith(INTERRUPTED):
                acts_add(raw, d, "err", "사용자가 중단함")
            elif main and text and not text.startswith("<") and not claude_foreign(d, text):   # <task-notification>, <command-...>, peers and talks are not the human
                acts_add(raw, d, "user", text)
        elif ty == "assistant":
            if d.get("isApiErrorMessage"):
                acts_add(raw, d, "err", "API 오류: %s" % d.get("error"))
                continue
            end = (d.get("message") or {}).get("stop_reason") in CL_END
            if end:
                acts_add(raw, d, "done", claude_text(d) or "턴 끝남")
            for b in reversed(bl):
                if b.get("type") == "tool_use":
                    nm, inp = b.get("name"), b.get("input") or {}
                    q = inp.get("questions")
                    q = q[0].get("question") if isinstance(q, list) and q and isinstance(q[0], dict) else None
                    if nm in ("Agent", "Task", "Workflow"):
                        acts_add(raw, d, "spawn", inp.get("description") or inp.get("prompt") or nm)
                    elif b.get("id") in pend and nm in ("AskUserQuestion", "ExitPlanMode"):
                        acts_add(raw, d, "ask", q or act(nm, inp))
                    else:
                        acts_add(raw, d, "tool", act(nm, inp))
                elif b.get("type") == "text" and not end:
                    acts_add(raw, d, "say", b.get("text"))
    return raw


def claude_state(lines, kind, sess, shells, notes, nid=None, t0=None):
    """Spec 3.1 rules 0-10. lines newest first; kind main|sub|wf; shells [(pid, eval_text, fd1)] of the host;
    notes {task id: terminal status}. -> (st, why, now, last, ts, since, procs); 'user' becomes done/idle in node()."""
    main, sess = kind == "main", sess or {}
    f = lines[0] if lines else {}
    ty, sty, blocks = f.get("type"), f.get("subtype"), claude_content(f)
    ts = iso(f.get("timestamp"))
    say = next((claude_text(d) for d in lines if d.get("type") == "assistant"), None)
    res = [b for b in blocks if b.get("type") == "tool_result"]
    text = " ".join(str(b.get("text", "")) for b in blocks if b.get("type") == "text") if ty == "user" else ""
    procs, used = [], set()

    def fin(st, why, now=None, last=None):
        su = sess.get("statusUpdatedAt")
        up = next((iso(d.get("timestamp")) for d in lines if d.get("type") == "user"
                   and not any(b.get("type") == "tool_result" for b in claude_content(d))), None)  # this turn's prompt
        since = (up or su / 1000 if main and su and sess.get("status") in ("busy", "shell") else t0) if st in CL_RUN else None
        if st in CL_RUN and not now:
            now = claude_now(lines)
        if main:  # shells no pending call owns: background Monitor / nohup
            procs.extend(proc_entry(p, cmd=e, bg=True) for p, e, _ in shells if p not in used)   # proc_entry redacts before it cuts
        return st, why, now, last, ts, since, procs

    if main and sess.get("status") == "waiting":                                           # 0
        w = sess.get("waitingFor")
        return fin("user", CL_WAIT.get(w, w or "입력 필요"))
    cs = None if main else (notes or {}).get(nid)
    if cs:                                                                                 # 1
        if cs == "completed":
            return fin("user", "완료 보고됨", last=say)
        return fin("stopped", "TaskStop" if cs == "taskstop" else "부모가 중단함", last=say)
    err = f.get("error")
    mark = ("사용자가 중단함" if ty == "user" and text.startswith(INTERRUPTED) else                    # 2
            "도구 거부함" if ty == "user" and any(b.get("is_error") for b in res)
            and str(f.get("toolUseResult")).startswith("User rejected tool use") else
            "API 오류: %s" % err if ty == "assistant" and f.get("isApiErrorMessage")
            and err in ("rate_limit", "invalid_request", "authentication_failed") else
            "모델 거부" if ty == "system" and sty == "model_refusal_no_fallback" else None)
    if mark:
        return fin("user" if main else "stopped", mark, last=say)
    tr = res and " ".join(str(b.get("content")) for b in res)
    tur = f.get("toolUseResult")
    if res and ("Structured output provided successfully" in tr or "Report delivered to your caller." in tr   # newer Claude: the handback result is text only
                or isinstance(tur, dict) and tur.get("message") == "Report delivered to your caller."):  # 3
        return fin("user", "보고 완료", last=say)
    pend = claude_pending(lines)                                                           # 4
    if pend:
        b, d = pend[0]
        name, inp = b.get("name"), b.get("input") or {}
        age = NOW - (iso(d.get("timestamp")) or NOW)
        now = act(name, inp)
        for pb_, pd in pend:  # join pending Bash/Monitor calls to the host's eval shells by command text
            c = str((pb_.get("input") or {}).get("command", "")).strip()
            for p, e, _ in shells:
                if pb_.get("name") in ("Bash", "Monitor") and p not in used and c and e.strip() == c:
                    used.add(p)
                    procs.append(proc_entry(p, cmd=c))
        if name in ("AskUserQuestion", "ExitPlanMode"):
            return fin("user", "질문에 답 필요" if name == "AskUserQuestion" else "플랜 승인 대기", now)
        if name in ("Agent", "Task", "Workflow", "TaskOutput", "SendMessage"):
            return fin("child", "하위 에이전트 대기", now)
        if name in ("Bash", "Monitor"):
            if procs:
                return fin("tool", "%s 실행 중 %s" % (name, fmt(procs[0]["age"])), now)
            return (fin("tool", "%s 시작 중" % name, now) if age < 60 else
                    fin("stall", "%s 프로세스 없음 (죽었나?)" % name, now))
        if age > STALL.get("claude", 600):
            return fin("stall", "%s 응답 없음 %s" % (name, fmt(age)), now)
        return fin("tool", "%s 실행 중 %s" % (name, fmt(age)), now)
    if ty == "api-request":                                                                # 5
        return fin("work", "모델 응답 대기")
    if ty == "assistant" and (f.get("message") or {}).get("stop_reason") is None:          # 6
        return fin("work", "응답 생성 중", claude_text(f))
    if (ty == "user" and (res or text.startswith(("Your response above was stopped by a safety classifier",
                                                  "[structured-output-enforce]")))
            or ty == "system" and sty == "model_refusal_fallback"):                        # 7
        return fin("work", "다음 요청 준비 중")
    if (ty == "assistant" and (f.get("message") or {}).get("stop_reason") in CL_END
            or ty == "system" and sty in ("turn_duration", "local_command")):              # 8
        s = sess.get("status")
        if main and s == "busy":
            return fin("child", "하위 작업 대기", last=say)
        if main and s == "shell":
            return fin("child", "백그라운드 셸 %d개 대기" % len(shells) if shells else "백그라운드 작업 대기", last=say)
        return fin("user", "답변 끝남 · 입력 기다림" if main else "답변 끝남", last=say)
    if ty == "user":                                                                       # 9
        return fin("work", "프롬프트 처리 중")
    return fin("work", "상태 불명")                                                           # 10


def claude_title(path):
    for d in tail(path, 262144):
        if d.get("type") == "ai-title":
            return d.get("aiTitle")
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            for ln in f.readlines(262144):
                if '"ai-title"' in ln:
                    return json.loads(ln).get("aiTitle")
    except (OSError, ValueError, TypeError):
        pass


def claude_notes(src):
    """Parent transcript (path or bytes) -> {task id: completed|failed|killed|stopped|taskstop}, plus runId -> taskId.
    Whole-file byte regexes: ~10 ms per 10 MB. Orphan-summary ids are noise."""
    if not isinstance(src, bytes):
        try:
            src = Path(src).read_bytes()
        except OSError:
            return {}
    out = {}
    for blk in re.findall(rb"<task-notification>(.*?)</task-notification>", src, re.S):
        s = re.search(rb"<status>(\w+)</status>", blk)
        ev = re.search(rb"<event>(.*?)</event>", blk, re.S)
        st = s.group(1).decode() if s else "stopped" if ev and re.search(rb"Monitor (expired after|timed out)", ev.group(1)) else None
        for i in re.findall(rb"<task-id>(\w+)</task-id>", blk):
            if st in ("completed", "failed", "killed", "stopped") and not i.startswith(b"__orphan_summary"):
                out[i.decode()] = st
    for i in re.findall(rb'"message":"Successfully stopped task: [^"]*","task_id":"(\w+)"', src):
        out[i.decode()] = "taskstop"
    for t, r in re.findall(rb'"taskId":"(\w+)","taskType":"local_workflow","workflowName":"[^"]*","runId":"(wf_[\w-]+)"', src):
        out[r.decode()] = t.decode()  # exact runId key: relaunches reuse the script path, so never substring-match
    return out


CL_HEAD = {}   # transcript path -> (t0, (prompt, ts) | None, last used): the first lines never change
WF_USER, WF_TASK = "[Workflow harness — user request]", "[Workflow harness — computed task]"


def claude_head(path):
    """(epoch of the first transcript line, (prompt text, its epoch) | None). The prompt is line 1; a workflow agent's real one is line 2
    (line 1 relays the user's request), framed and indented."""
    h = CL_HEAD.get(path)
    if h:
        CL_HEAD[path] = h[:2] + (NOW,)
        return h[:2]
    def jl(ln):
        try:
            d = json.loads(ln)
        except ValueError:
            return {}
        return d if isinstance(d, dict) else {}
    try:
        with open(path, "rb") as f:
            l1 = f.readline(1 << 20)   # its timestamp comes after the prompt, so read the whole line
            m = re.search(rb'"timestamp":"([^"]+)"', l1)   # a line over 1 MiB does not parse: the regex still finds the time
            d = jl(l1)
            t0 = iso(d.get("timestamp")) or (iso(m.group(1).decode()) if m else None)
            if claude_body(d).startswith(WF_USER):
                d = jl(f.readline(1 << 20))
    except OSError:
        return None, None
    text = claude_body(d)
    if text.startswith(WF_TASK):
        text = textwrap.dedent(text.partition("The computed task text follows:\n")[2])
    prompt = (text, iso(d.get("timestamp"))) if text.strip() and iso(d.get("timestamp")) else None
    if t0 and prompt:
        CL_HEAD[path] = (t0, prompt, NOW)
    return t0, prompt


def claude_msgs(lines, kind, nid, par, prompt, st):
    """TALK-ENG 1.2 Claude. A subagent / workflow agent (par = (parent id, parent name)): the spawn prompt, the coordinator's follow-ups, its report.
    The main session: peer messages and our own talks (lines: newest first)."""
    ms, k = [], "workflow" if kind == "wf" else "agent"
    if kind == "main":
        for d in lines:
            if d.get("type") != "user" or any(b.get("type") == "tool_result" for b in claude_content(d)):
                continue
            o, ts, body = claude_origin(d), iso(d.get("timestamp")), claude_body(d)
            if o.get("handback"):   # a subagent's report: it shows on that subagent
                continue
            if body.startswith("Another Claude session sent a message"):
                body = body.partition("\n")[2]
            body = re.split(r"\n\n(?:This came from another Claude session|IMPORTANT: This is NOT from your user)", body)[0]
            m = TALK_RE.match(body)
            e = re.search(r"<cross-session-message\b([^>]*)>(.*?)</cross-session-message>", body, re.S)
            if m and not e and not str(o.get("from")).startswith("uds:"):   # copied into an envelope or sent from a uds: peer = not ours
                msgs_add(ms, nid, "down", "talk", "agen-talk:" + m.group(1), nid, m.group(1), ts, body[m.end():].strip(), msg_id=m.group(2), by=m.group(1))
            elif o.get("kind") == "peer":
                a = dict(re.findall(r'([\w-]+)="([^"]*)"', e.group(1))) if e else {}
                msgs_add(ms, nid, "down", "peer", a.get("from") or o.get("from") or "?", nid, a.get("from-name") or o.get("name") or "다른 세션", ts,
                         e.group(2).strip() if e else body, fs=a.get("from-session") or o.get("from"))
        return msgs_fin(ms)
    par = par or ("?", "?")
    if prompt:
        msgs_add(ms, nid, "down", k, par[0], nid, par[1], prompt[1], prompt[0])
    up = end = None
    for d in lines:
        ty, ts = d.get("type"), iso(d.get("timestamp"))
        if ty == "user" and d.get("isMeta") and claude_origin(d).get("kind") == "coordinator":
            msgs_add(ms, nid, "follow", k, par[0], nid, par[1], ts, claude_body(d).partition("\n")[2])   # line 1 = "The coordinator sent a message while you were working:"
        elif ty == "assistant":
            for b in claude_content(d):
                if up is None and b.get("type") == "tool_use" and b.get("name") == "SubagentHandback":
                    up = (str((b.get("input") or {}).get("message") or ""), ts)
            if end is None and (d.get("message") or {}).get("stop_reason") in CL_END:
                end = (claude_body(d), ts)
    up = up or (end if st in ("user", "done") else None)
    if up:
        msgs_add(ms, nid, "up", k, nid, par[0], par[1], up[1], up[0])
    return msgs_fin(ms)


def claude_talk_lines(path, lines):
    """Add queued_command attachments only to the talk-message pass."""
    queued, start = [], 0
    try:
        with open(path, "rb") as f:
            start = max(0, f.seek(0, 2) - (1 << 20))
            f.seek(start)
            raw = f.read().splitlines()
    except (OSError, TypeError):
        raw = []
    for ln in (raw[1:] if start else raw)[::-1]:
        if b'"queued_command"' not in ln:
            continue
        try:
            d = json.loads(ln)
        except ValueError:
            continue
        if not isinstance(d, dict):
            continue
        a = d.get("attachment")
        if d.get("type") == "attachment" and isinstance(a, dict) and a.get("type") == "queued_command":
            queued.append({"type": "user", "timestamp": d.get("timestamp"), "origin": a.get("origin"), "message": {"content": a.get("prompt", "")}})
    return lines + queued


def claude_agent(tr, kind, nid, name, sess, shells, notes, meta, started, par=None):
    """One node for one transcript: the main session, a subagent or a workflow agent. par = (parent id, parent name) of a subagent."""
    lines = claude_lines(tr)
    t0, prompt = claude_head(tr) if kind != "main" else (None, None)
    st, why, now, last, ts, since, procs = claude_state(lines, kind, sess, shells, notes, nid, t0)
    if kind != "main" and st in CL_RUN and (mtime(tr) or 0) < started:  # transcript older than the host: its agent is gone
        st, why, since = "dead", "이전 프로세스의 고아", None
    model = next((d["message"]["model"] for d in lines if d.get("type") == "assistant"
                  and str((d.get("message") or {}).get("model", "<")).strip()[:1] != "<"), None)
    acts = claude_acts(lines, kind == "main")
    if kind == "main" and sess.get("status") == "waiting" and sess.get("statusUpdatedAt"):   # a permission prompt leaves no transcript line
        acts[:0] = [{"t": sess["statusUpdatedAt"] / 1000, "k": "ask", "x": why}]
    msg_lines = claude_talk_lines(tr, lines) if kind == "main" else lines
    return node(nid, "claude", name, st, why, ts or mtime(tr), kind != "main", since, acts=acts_fin(acts), msgs=claude_msgs(msg_lines, kind, nid, par, prompt, st),
                now=now, last=last, procs=procs, meta=" · ".join(filter(None, [meta, model])))


def claude_workflow(j, shells, notes, started):
    """journal.jsonl -> workflow node. State file <sid>/workflows/<runId>.json (completed|killed) beats the journal."""
    run, agents, bykey, phases, closed = j.parent.name, {}, {}, [], 0
    for ln in open(j, encoding="utf-8", errors="replace"):
        try:
            e = json.loads(ln)
        except ValueError:
            continue
        if not isinstance(e, dict):
            continue
        a = e.get("agentId")
        if e.get("type") == "started":
            old = agents.get(bykey.get(e.get("key")))
            if old and old["st"] == "open":
                old["st"] = "replaced"  # the same key started again: the first agent was abandoned
            bykey[e.get("key")] = a
            agents[a] = {"label": e.get("label") or a, "st": "open"}
            if e.get("phase") and e["phase"] not in phases:
                phases.append(e["phase"])
        elif e.get("type") in ("result", "failed") and a in agents:
            closed += agents[a]["st"] != "replaced"
            agents[a]["st"] = "closed"
    try:
        wst = json.loads((j.parents[3] / "workflows" / (run + ".json")).read_text(encoding="utf-8"))
        wst = wst if isinstance(wst, dict) else {}
    except (OSError, ValueError, IndexError):
        wst = {}
    end = wst.get("status") or (notes or {}).get((notes or {}).get(run)) or None  # completed | killed | ...
    name = "workflow " + (wst.get("workflowName") or " → ".join(phases))
    kids = []
    for aid, a in agents.items():
        if a["st"] == "closed":
            continue
        tr = j.parent / ("agent-%s.jsonl" % aid)
        if a["st"] == "replaced":
            kids.append(node(aid, "claude", a["label"], "stopped", "재시작으로 대체됨", mtime(tr), True))
        elif end:
            kids.append(node(aid, "claude", a["label"], "user" if end == "completed" else "stopped",
                             "워크플로 끝남" if end == "completed" else "워크플로 중단됨 (aborted)", mtime(tr), True))
        else:
            kids.append(claude_agent(tr, "wf", aid, a["label"], {}, shells, {}, "", started, (run, name)))
    live = [k for k in kids if k["st"] not in REST]
    ages = [k["age"] for k in kids if k["age"] is not None]
    ts = NOW - min(ages) if ages else mtime(j)
    if end:
        st, why = ("user", "워크플로 끝남") if end == "completed" else ("stopped", "워크플로 중단됨 (aborted)")
    elif live:
        st, why = "child", "에이전트 %d개 실행 중" % len(live)
    elif kids and all(k["st"] in ("stopped", "dead") for k in kids):
        st, why = "stopped", "에이전트가 모두 중단됨"
    elif not kids and NOW - (mtime(j) or 0) < 60:
        st, why = "child", "다음 단계 준비 중"  # between phases nothing is open for a moment
    else:
        st, why = "user", "워크플로 끝남"
    since = NOW - max([k["since"] for k in live if k["since"]] or [0]) if any(k["since"] for k in live) else None
    w = node(run, "claude", name, st, why, ts, True, since, meta=run)
    w["kids"], w["hidden"] = kids, closed
    return fold(w)


def api_open(pid, text=None):
    """True while pid has an established :443 socket the server is pushing on: last receive < 3 s ago, last send >= 2 s before it
    (an open model response; a thinking model uses no CPU). ponytail: telemetry sockets are not told apart, rare."""
    import subprocess
    if text is None:
        try:
            text = subprocess.run(["ss", "-tinpH", "state", "established"], **popen_kw(capture_output=True, text=True, timeout=3)).stdout
        except (OSError, subprocess.SubprocessError):
            return False
    mine = False
    for ln in text.splitlines():
        if not ln[:1].isspace():
            mine = ":443 " in ln and "pid=%d," % pid in ln
        elif mine:
            m, r = re.search(r"lastsnd:(\d+)", ln), re.search(r"lastrcv:(\d+)", ln)
            if m and r and int(r.group(1)) < 3000 and int(m.group(1)) - int(r.group(1)) >= 2000:
                return True
    return False


def claude_parent(metas, a):
    """The subagent that launched `a` (meta.parentAgentId), None for the main session or a broken / circular chain."""
    p, seen = metas[a].get("parentAgentId"), {a}
    if not isinstance(p, str) or p not in metas:
        return None
    first = p
    while p in metas:
        if p in seen:
            return None
        seen.add(p)
        p = metas[p].get("parentAgentId")
        if not isinstance(p, str):
            break
    return first


def claude_node(s, shells):
    sid, pid = s["sessionId"], s["pid"]
    started = (s.get("startedAt") or 0) / 1000
    tr = next((HOME / ".claude/projects").glob("*/%s.jsonl" % sid), None)
    meta = "pid %s · %s" % (pid, short(s.get("cwd")))
    su, sstat = (s.get("statusUpdatedAt") or 0) / 1000 or None, s.get("status")
    ts = su  # age of the last signal
    if not tr:  # claude -p --no-session-persistence: no transcript, only the session file and the process
        a = argv(pid)
        try:
            mc = a[a.index("--mcp-config") + 1] if "--mcp-config" in a else None
            bare = mc is None or not json.loads(mc).get("mcpServers")
        except (ValueError, IndexError, AttributeError):
            bare = False
        if sstat == "waiting":
            st, why = "user", CL_WAIT.get(s.get("waitingFor"), "입력 필요")
        elif sstat != "busy":
            st, why = ("child", "백그라운드 셸 대기") if sstat == "shell" else ("user", "답변 끝남 · 입력 기다림")
        elif "--tools" in a and a[a.index("--tools") + 1:][:1] == [""] and bare:
            st, why = "work", "모델 응답 중 (SDK, 도구 없음)"
        else:
            st, why = ("tool", "Bash 실행 중") if shells else ("work", "SDK 세션")
        if st == "work" and su and NOW - su > STALL.get("claude", 600):
            # ponytail: 5 ticks/s of the host's own CPU, or an open model response on its socket = busy; else node() downgrades
            if proc_cpu(pid) >= 5:
                why, ts = "CPU 사용 중", NOW
            elif api_open(pid):
                ts = NOW
        procs = [proc_entry(p, cmd=e) for p, e, _ in shells]
        return node(sid, "claude", s.get("name"), st, why, ts, False, su if st in CL_RUN else None, procs=procs,
                    meta=meta, now=None if st != "work" else "transcript 없음 (--no-session-persistence)")
    sub, notes = tr.with_suffix("") / "subagents", [None]

    def kid(build):  # notes scan (whole parent transcript) only once some child still looks alive
        n = build(notes[0] or {})
        if n["st"] in CL_RUN and notes[0] is None:
            notes[0] = claude_notes(tr)
            n = build(notes[0])
        return n

    title, metas = claude_title(tr) or s.get("name"), {}
    for m in sorted(sub.glob("agent-*.meta.json")):
        try:
            mj = json.loads(m.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if isinstance(mj, dict):
            metas[m.name.split(".")[0][6:]] = mj
    up, subs = {a: claude_parent(metas, a) for a in metas}, {}   # up: the subagent that launched it, None = the main session
    for aid, mj in metas.items():
        par = (up[aid], metas[up[aid]].get("description") or "?") if up[aid] else (sid, title or "?")
        subs[aid] = kid(lambda nt: claude_agent(sub / ("agent-%s.jsonl" % aid), "sub", aid, mj.get("description"), {}, shells, nt, mj.get("agentType"), started, par))
    for aid, k in subs.items():
        if up[aid]:
            subs[up[aid]]["kids"].append(k)
    for a in set(up.values()) - {None}:
        fold(subs[a])
    kids = [k for aid, k in subs.items() if not up[aid]]
    for j in sorted(sub.glob("workflows/*/journal.jsonl")):
        kids.append(kid(lambda nt: claude_workflow(j, shells, nt, started)))
    claimed = {p["pid"] for k in claude_walk(kids) for p in k["procs"]}
    n = claude_agent(tr, "main", sid, title, s, [x for x in shells if x[0] not in claimed], None, meta, started)
    if n["why"] == "하위 작업 대기":  # busy but the turn ended: it waits on its live children
        live = sum(k["st"] not in REST for k in claude_walk(kids))
        if live:
            n["why"] = "하위 에이전트 %d개 대기" % live
        elif not n["procs"] and (n["age"] or 0) > 30:
            n["st"], n["why"] = "stall", "busy인데 하위 작업 없음"
    n["kids"] = kids
    return fold(n)


def claude_walk(ns):
    for k in ns:
        yield k
        yield from claude_walk(k["kids"])


CL_SESS = {}   # session id -> its sessions/<pid>.json of this collect (talk_fill reads the inbox facts from it)


def claude_collect(roots):
    CL_SESS.clear()
    for f in (HOME / ".claude/sessions").glob("*.json"):
        try:
            s = json.loads(f.read_text(encoding="utf-8"))
            if s.get("spare") or s.get("parkedJobId"):
                continue
            pid, p = s["pid"], PROC.get(s["pid"])
            sid = s["sessionId"]
        except (OSError, ValueError, KeyError, TypeError, AttributeError):
            continue
        CL_SESS[sid] = s
        su = (s.get("statusUpdatedAt") or 0) / 1000
        comm = p and p["comm"]
        if (p and (comm.startswith("claude") or comm == "node" if WIN else comm == "claude") and p["state"] not in "ZX"
                and same_proc_start(p, s.get("procStart"))):
            roots[pid] = [claude_node(s, proc_shells(pid))]
            pj = git_project(s.get("cwd"))
            if pj:
                roots[pid][0]["project"] = pj
        elif NOW - su < FRESH:
            roots[None].append(node(sid, "claude", s.get("name"), "dead", "claude 프로세스 없음", su, False,
                                    meta="pid %s · %s" % (pid, short(s.get("cwd"))), project=git_project(s.get("cwd"))))


def selftest_claude():
    global NOW, proc_entry
    NOW = time.time()
    real, proc_entry = proc_entry, lambda pid, cmd=None, bg=False: dict(pid=pid, cmd=cmd and line1(cmd), age=90, cpu=0, state="S", **({"bg": True} if bg else {}))
    try:
        def ts(ago):
            return datetime.fromtimestamp(NOW - ago, timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")

        def asst(blocks, stop=None, mid="m1", ago=5):
            return {"type": "assistant", "timestamp": ts(ago), "message": {"id": mid, "stop_reason": stop, "content": blocks}}

        def usr(c, ago=4, **kw):
            return dict({"type": "user", "timestamp": ts(ago), "message": {"content": c}}, **kw)

        def use(i, name="Bash", **inp):
            return {"type": "tool_use", "id": i, "name": name, "input": inp}

        def res(i, **kw):
            return usr([{"type": "tool_result", "tool_use_id": i, "content": "ok"}], **kw)

        def run(lines, kind="main", status="idle", shells=(), notes=None, **kw):
            return claude_state(lines, kind, dict(status=status, **kw), list(shells), notes or {}, "a1")[:2]

        bash = [asst([use("t1", command="sleep 99")], "tool_use", ago=30)]
        sh = [(77, " sleep 99 ", "/x/tasks/b.output")]
        # acts: user prompt (main only), assistant text, tool calls merged, spawn, rejected tool, interrupt, end_turn text as done; tool results never shown
        fx = [asst([{"type": "text", "text": "다 했음\n둘째"}], "end_turn", mid="m4", ago=1), res("t3", toolUseResult="User rejected tool use", ago=2),
              asst([use("t3", command="rm x")], "tool_use", mid="m3", ago=3), res("t2", ago=4), asst([use("t2", command="ls")], "tool_use", mid="m2b", ago=5),
              asst([use("t1", command="ls")], "tool_use", mid="m2", ago=6), asst([{"type": "tool_use", "id": "ag", "name": "Agent", "input": {"description": "조사"}},
              {"type": "text", "text": "시작"}], "tool_use", mid="m1b", ago=7), usr("<task-notification>x", ago=8), usr("부탁해\n둘째", ago=9),
              usr("[Request interrupted by user]", ago=10)]
        fx[1]["message"]["content"][0]["is_error"] = True
        a = acts_fin(claude_acts(fx, True))
        assert [(x["k"], x["x"]) for x in a] == [("err", "사용자가 중단함"), ("user", "부탁해"), ("spawn", "조사"), ("say", "시작"), ("tool", "$ ls ×2"), ("tool", "$ rm x"),
                                                  ("err", "도구 거부함"), ("done", "다 했음")], a
        assert [x["k"] for x in claude_acts(fx, False)].count("user") == 0
        assert run(bash, shells=sh, status="busy") == ("tool", "Bash 실행 중 1m")                      # 1 pending + shell
        assert run(bash, status="busy") == ("tool", "Bash 시작 중")                                    # young, no shell yet
        assert run([asst([use("t1", command="x")], "tool_use", ago=90)], status="busy")[0] == "stall"  # 2 no shell, 90 s
        assert run([{"type": "api-request", "timestamp": ts(1)}, res("t1"), asst([use("t1")], "tool_use")])[0] == "work"  # 3
        assert run([asst([{"type": "text", "text": "hi"}])]) == ("work", "응답 생성 중")                 # 4 stop_reason None
        end = [asst([{"type": "text", "text": "done\nx"}], "end_turn")]
        assert run(end, status="busy") == ("child", "하위 작업 대기")                                   # 5
        assert run(end, status="shell", shells=sh)[1] == "백그라운드 셸 1개 대기"
        st = claude_state(end, "main", {"status": "idle"}, sh, {})
        assert st[0] == "user" and st[3] == "done" and st[6] == [dict(pid=77, cmd="sleep 99", age=90, cpu=0, state="S", bg=True)]
        intr = [usr([{"type": "text", "text": "[Request interrupted by user for tool use]"}])] + bash
        assert run(intr)[0] == "user" and run(intr, "sub")[0] == "stopped"                            # 6
        so = [res("t9", toolUseResult={"success": True, "message": "Report delivered to your caller."})]
        assert run(so, "sub")[0] == "user" and run(so)[1] == "보고 완료"                                # 7 (node() -> done)
        so2 = [usr([{"type": "tool_result", "tool_use_id": "t9", "content": [{"type": "text", "text": '{"success":true,"message":"Report delivered to your caller."}'}]}])]
        assert run(so2, "sub")[1] == "보고 완료", run(so2, "sub")   # newer Claude: no toolUseResult, the result is text only
        assert run(bash, status="waiting", waitingFor="permission prompt") == ("user", "권한 승인 대기")  # 8 beats pending
        assert run([asst([use("q", "AskUserQuestion")], "tool_use")]) == ("user", "질문에 답 필요")      # 9
        assert run([asst([use("a", "Agent")], "tool_use")])[0] == "child"
        assert run([usr("do it")] + bash)[0] == "work"                                                  # prompt after a stale tool_use
        assert run([asst([use("r", "Read", file_path="/f")], "tool_use", ago=700)])[0] == "stall"
        assert run([], "sub")[1] == "상태 불명"
        assert run(end, "sub", notes={"a1": "killed"}) == ("stopped", "부모가 중단함")                 # rule 1
        assert run(end, "sub", notes={"a1": "completed"}) == ("user", "완료 보고됨")
        # parallel calls: oldest pending decides, answered ones drop out
        two = [res("p1"), asst([use("p2", "Agent")], "tool_use", ago=9), asst([use("p1", command="ls")], mid="m2", ago=10)]
        assert run([res("p1"), asst([use("p1", command="ls"), use("p2", "Agent")], "tool_use")])[0] == "child"
        assert not claude_pending(two[:1] + [asst([use("p1")], "tool_use")])
        # notes: aggregated block, orphan summary skipped, TaskStop, run map, Monitor expiry
        b = (b'x<task-notification>\\n<task-id>aaa1</task-id>\\n<task-id>__orphan_summary_1</task-id>\\n<task-id>bbb2</task-id>'
             b'\\n<status>killed</status></task-notification> "message":"Successfully stopped task: x","task_id":"ccc3" '
             b'"taskId":"wxyz","taskType":"local_workflow","workflowName":"n","runId":"wf_1-2" '
             b'<task-notification><task-id>mon1</task-id><event>Monitor expired after 3h</event></task-notification>')
        n = claude_notes(b)
        assert n == {"aaa1": "killed", "bbb2": "killed", "ccc3": "taskstop", "wf_1-2": "wxyz", "mon1": "stopped"}, n
        # workflow journal: a restarted key marks the first agent stopped; finished ones fold into the count
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            j = Path(d) / "s/subagents/workflows/wf_9/journal.jsonl"
            j.parent.mkdir(parents=True)
            j.write_text("\n".join(json.dumps(e) for e in [
                {"type": "started", "key": "k", "agentId": "A", "label": "r1", "phase": "P"},
                {"type": "started", "key": "k", "agentId": "B", "label": "r1", "phase": "P"},
                {"type": "started", "key": "z", "agentId": "C", "label": "r2"},
                {"type": "result", "key": "z", "agentId": "C"}]))
            w = claude_workflow(j, [], {"wf_9": "w1", "w1": "killed"}, NOW)
            assert [(k["id"], k["st"]) for k in w["kids"]] == [("A", "stopped"), ("B", "stopped")] and w["hidden"] == 1, w
            assert w["st"] == "stopped" and w["name"] == "workflow P"
            (j.parents[3] / "workflows").mkdir()
            (j.parents[3] / "workflows/wf_9.json").write_text('{"status": "completed"}')
            w = claude_workflow(j, [], {}, NOW)
            assert w["st"] == "done" and w["kids"][1]["why"] == "워크플로 끝남"
            # bookkeeping records after the last answer (unknown types too) never become the newest line
            tr = Path(d) / "t.jsonl"
            tr.write_text("\n".join(json.dumps(e) for e in [usr("go", ago=9), asst([{"type": "text", "text": "done"}], "end_turn", ago=8)]
                                    + [{"type": t, "sessionId": "s"} for t in ("artifact-autoreact-ledger", "custom-title", "frame-link", "some-future-type")]
                                    + [{"type": "attachment", "attachment": {"type": "x"}}]) + "\n", encoding="utf-8")
            ls = claude_lines(tr)
            assert [x["type"] for x in ls] == ["assistant", "user"], ls
            assert claude_state(ls, "main", {"status": "idle"}, [], {})[:2] == ("user", "답변 끝남 · 입력 기다림")
    finally:
        proc_entry = real
    print("claude ok")


# ---------- agy (Antigravity CLI) ----------
AGY = HOME / ".gemini/antigravity-cli"
AG_NONTERM = "0,1,2,8,9,11"   # step status: unspecified, PENDING, RUNNING, GENERATING, WAITING, QUEUED (done 3, canceled 6, error 7, interrupted 12)


def varint(b, i):
    r = s = 0
    while True:
        c = b[i]
        i += 1
        r |= (c & 0x7F) << s
        s += 7
        if c < 0x80:
            return r, i


def pb(b, path=()):
    """(field path, text) pairs of a protobuf blob; enough to find the subagent's task name."""
    i = 0
    while i < len(b):
        key, i = varint(b, i)
        f, t = key >> 3, key & 7
        if t == 0:
            _, i = varint(b, i)
        elif t in (1, 5):
            i += 8 if t == 1 else 4
        elif t == 2:
            n, i = varint(b, i)
            chunk, i = b[i:i + n], i + n
            try:
                yield from list(pb(chunk, path + (f,))) or [(path + (f,), chunk.decode())]
            except (ValueError, IndexError, UnicodeDecodeError):
                try:
                    yield path + (f,), chunk.decode()
                except UnicodeDecodeError:
                    pass
        else:
            raise ValueError("not protobuf")


def agy_fields(b):
    """Top-level (field, int | bytes) pairs; stops quietly at the first byte that is not protobuf."""
    i = 0
    try:
        while i < len(b):
            key, i = varint(b, i)
            f, t = key >> 3, key & 7
            if t == 0:
                v, i = varint(b, i)
            elif t == 2:
                n, i = varint(b, i)
                v, i = b[i:i + n], i + n
            elif t in (1, 5):
                v, i = b[i:i + (8 if t == 1 else 4)], i + (8 if t == 1 else 4)
            else:
                return
            yield f, v
    except IndexError:
        return


def agy_get(b, *path, all=False):
    """Value of the last (all=True: every) occurrence of a nested field path, else None / []."""
    vs = [v for f, v in agy_fields(b or b"") if f == path[0]]
    if len(path) > 1:
        vs = [x for v in vs if isinstance(v, bytes) for x in agy_get(v, *path[1:], all=True)]
    return vs if all else vs[-1] if vs else None


def pbv(raw, field):
    """Varint VALUE of a top-level field, 0 when absent (subagent rows encode killed=0 explicitly, so never test presence)."""
    v = agy_get(raw, field)
    return v if isinstance(v, int) else 0


def agy_t(s):
    """'2026-10-14 02:16:34.222736805+00:00' -> epoch, None for the zero time."""
    try:
        s = re.sub(r"\.(\d+)", lambda m: "." + (m.group(1) + "00000")[:6], str(s).replace("Z", "+00:00"))  # 3.8 fromisoformat wants exactly 3 or 6 digits
        t = datetime.fromisoformat(s).timestamp()
    except (TypeError, ValueError, OverflowError, OSError):
        return None
    return t if t > 1e9 else None


def agy_step(r):
    """(idx, type, status, metadata) -> dict: tool name / args JSON (metadata 4.1.2 / 4.1.3) and the last status transition time (26.1[-1].2.1)."""
    i, ty, st, m = r
    tr = agy_get(m, 26, 1, all=True)
    tt = agy_get(tr[-1], 2, 1) if tr else None
    name = agy_get(m, 4, 1, 2) or b""
    args = (agy_get(m, 4, 1, 3) or b"").decode("utf-8", "replace")
    try:
        a = json.loads(args)
    except ValueError:
        a = {}
    return {"idx": i, "type": ty, "st": st, "tool": name.decode("utf-8", "replace"), "args": args, "tt": tt,
            "cmd": a.get("CommandLine") if isinstance(a, dict) else None}


def agy_state(row, steps, hosted, host_started, sub, kids_unfinished=0, undelivered=False):
    """Pure classifier -> (st, why, now). row: {status, killed, nfi, raw, mx, count}; steps: agy_step() dicts, newest first,
    non-terminal only; hosted: host pid or None; host_started: epoch of that host (unhosted: the newest agy start, None if no agy runs).
    # ponytail: unverified live (no agy process on the dev box), rules from liveness.json agy; fix here when a live run disagrees"""
    live = str(row["status"]).endswith(("RUNNING", "BUSY", "CANCELING"))
    if not hosted:
        if live or row["nfi"] or pbv(row["raw"], 21) == 1 or any(s["tt"] and host_started and s["tt"] > host_started for s in steps):
            return "dead", "agy 프로세스 없음", None
        steps = []                    # idle and nobody hosts it: the leftover steps are history
    if row["killed"]:
        return "stopped", "강제 종료됨", None
    bg = None
    for s in steps:                   # 2: WAITING > GENERATING/CHECKPOINT > RUNNING tool > PENDING, not newest-first
        if s["st"] == 9 and not (sub and NOW - (s["tt"] or 0) > 60):     # a subagent's prompt self-denies after 60 s
            return "user", "권한 승인 대기: %s" % (s["tool"] or "도구"), None
    for s in steps:
        if s["type"] == 15 and s["st"] == 8:
            return "work", "응답 생성 중", None
        if s["type"] == 23:
            return "work", "컨텍스트 압축 중", None
    for s in steps:
        if s["st"] != 2:
            continue
        if s["tool"] == "schedule":
            a = s["args"].lower()
            if '"timercondition":"any"' in a.replace(" ", "") and "subagent" in a:
                m = re.search(r'"DurationSeconds"\s*:\s*(\d+)', s["args"])
                return "child", "하위 작업 대기 %ss" % (m.group(1) if m else "?"), None
            return "tool", "타이머/백그라운드 대기", None
        if s["type"] == 21 or s["tool"] == "run_command":
            if s["idx"] == row["mx"]:
                return "tool", "$ " + (s["cmd"] or "명령"), "$ " + line1(s["cmd"] or "")
            if bg is None and not (s["tt"] and host_started and s["tt"] < host_started):   # stale: left from a previous agy run
                bg = "$ " + line1(s["cmd"] or "")
    if any(s["st"] in (1, 11) for s in steps):
        return "work", "다음 단계 준비 중", None
    if live:
        return "work", "실행 중 (summary)" + (" · 백그라운드 " + bg if bg else ""), None
    if kids_unfinished or undelivered or pbv(row["raw"], 18) == 1 or row["nfi"] or pbv(row["raw"], 21) == 1:
        return "child", ("하위 에이전트 %d개 대기" % kids_unfinished if kids_unfinished else "하위 에이전트 대기"), None
    if bg:
        return "child", "백그라운드 명령 대기 · " + bg, None
    t = pbv(row["raw"], 28)
    if t in (4, 8, 10):
        return "user", "답변 끝남", None
    if t == 2:
        return "stopped", "사용자가 취소함", None
    if t == 1:
        return "stopped", "오류", None
    if t in (3, 6, 11):
        return "stopped", "한도 도달", None
    return ("idle", "(대화 시작 전)", None) if not row["count"] else ("user", "답변 끝남", None)


def agy_db(cid, name):
    return AGY / "conversations" / (cid + name)


AG_HEAD, AG_UP = {}, {}   # conversation id -> (prompt, ts) of a subagent (immutable) / (last step idx, [(text, ts)]) of its reports to the parent


def agy_msgs(cid, par, role, db, mx, live, ts):
    """TALK-ENG 1.2 agy, for a subagent: its spawn prompt (child db step 0, protobuf 19.2) and its send_message reports to the parent (step type 132)."""
    ms, h, u = [], AG_HEAD.get(cid), AG_UP.get(cid)
    if h is None:
        r = q(db, "select metadata, step_payload from steps where idx = 0", live)
        t = agy_get(r[0][1], 19, 2) if r else None
        if t:
            h = AG_HEAD[cid] = (t.decode("utf-8", "replace"), agy_step((0, 14, 0, r[0][0]))["tt"])
    if h:
        msgs_add(ms, cid, "down", "agy", par, cid, "?", h[1], h[0], role=role)
    if not u or u[0] != mx:
        u = AG_UP[cid] = (mx, [])
        for i, md, pl in q(db, "select idx, metadata, step_payload from steps where step_type = 132 order by idx desc limit 3", live):
            t = (pl or b"").decode("utf-8", "replace")
            j = t.find('{"', max(t.find("send_message"), 0)) if "send_message" in t else -1
            try:
                m = json.JSONDecoder().raw_decode(t[j:])[0] if j >= 0 else {}
            except ValueError:
                m = {}
            if isinstance(m, dict) and m.get("Recipient") == par and isinstance(m.get("Message"), str):
                u[1].append((m["Message"], agy_step((i, 132, 0, md))["tt"] or ts))
    for text, t in u[1]:
        msgs_add(ms, cid, "up", "agy", cid, par, "?", t, text, role=role)
    return msgs_fin(ms)


def agy_collect(roots):
    """roots[host pid] = [root nodes]; unhosted roots touched within FRESH go to roots[None]. Pids: the agy host process holds presence/<root>.lock open."""
    live_hosts = {pid: p for pid, p in PROC.items() if p["comm"] == "agy" and p["uid"] == (os.getuid() if hasattr(os, "getuid") else 0)
                  and argv(pid)[1:2] not in (["agentapi"], ["plugin"])}
    live = bool(live_hosts)
    rows = {r[0]: r for r in q(AGY / "conversation_summaries.db",
                               "select conversation_id, title, preview, step_count, last_modified_time, status, agent_name,"
                               " parent_conversation_id, killed, not_fully_idle, last_user_input_time, raw_summary"
                               " from conversation_summaries", live)}
    kids = defaultdict(list)
    for c, r in rows.items():
        if r[7] in rows:
            kids[r[7]].append(c)
    up = lambda c: up(rows[c][7]) if rows[c][7] in rows else c      # noqa: E731
    hosted = {}
    for pid in sorted(live_hosts, key=lambda p: live_hosts[p]["started"]):
        fl = fds(pid)
        for pat in ("presence/", "conversations/"):                  # June-era roots have no presence lock
            ids = {m.group(1) for f in fl for m in [re.search(r"antigravity-cli/" + pat + r"([0-9a-f-]{36})\.", f)] if m}
            if ids:
                break
        for c in ids & set(rows):
            hosted.setdefault(up(c), pid)
        if not ids and not WIN:
            roots.setdefault(pid, []).append(node("agy-%d" % pid, "agy", "(대화 시작 전)", "idle", "대화 시작 전",
                                                  live_hosts[pid]["started"], meta="pid %d · %s" % (pid, short(cwd(pid)))))
    if WIN and live_hosts:   # no fd links on Windows: the oldest agy hosts the roots touched since it started (older conversations stay closed)
        oldest = min(live_hosts, key=lambda p: live_hosts[p]["started"])
        since = live_hosts[oldest]["started"] - 5
        hosted = {up(c): oldest for c, r in rows.items() if (agy_t(r[4]) or 0) >= since}
    start = max([p["started"] for p in live_hosts.values()] or [0]) or None

    def build(cid, host, hs, sub):
        r = rows[cid]
        row = {"status": r[5], "killed": int(r[8] or 0) or pbv(r[11], 23), "nfi": int(r[9] or 0), "raw": r[11] or b"", "count": r[3], "mx": None}
        db = agy_db(cid, ".db")
        steps = [agy_step(x) for x in q(db, "select idx, step_type, status, metadata from steps where status in (%s) order by idx desc limit 8" % AG_NONTERM, live)]
        last = q(db, "select idx, step_type, status from steps order by idx desc limit 1", live)
        row["mx"] = last[0][0] if last else None
        sk, open_ = [], 0
        for k in kids[cid]:
            n, un = build(k, host, hs, True)
            sk.append(n)
            open_ += un
        try:
            und = bool(os.listdir(AGY / "brain" / cid / ".system_generated/messages/undelivered"))
        except OSError:
            und = False
        st, why, now = agy_state(row, steps, host, hs, sub, open_, und)
        try:  # 17.8.2 = the task name agy gives a subagent ("Selection Engine & UI Auditor")
            task = next((v for p, v in pb(row["raw"]) if p == (17, 8, 2)), None)
        except (ValueError, IndexError):
            task = None
        wal = str(db) + "-wal"      # an empty -wal is only a reader's touch (other tools open the db read-only too), not activity
        ts = max(filter(None, [mtime(db), mtime(wal) if mtime(wal) and os.path.getsize(wal) else None]), default=None) or agy_t(r[4])
        if not host and st == "user":
            st = "idle"               # nobody is at the prompt: agy exited, the conversation just sits there
        n = node(cid, "agy", r[1] or task or line1(r[2]) or r[6], st, why, ts, sub,
                 since=agy_t(r[10]) if st in LIVE and not sub else None, now=now,
                 meta=" · ".join(filter(None, ["pid %d" % host if host else "", short(cwd(host)) if host else "", r[6], "%s steps" % r[3]])),
                 project=git_project(cwd(host)) if host and not sub else None)
        n["kids"] = sk
        for k in sk:   # a subagent's messages name their parent only now that the parent node exists
            for m in k.get("msgs", ()):
                m["who"] = line1(n["name"], 80)
        ms = agy_msgs(cid, r[7], r[6], db, row["mx"], live, ts) if sub else None
        if ms:
            n["msgs"] = ms
        unfinished = bool(steps) or (last and not (last[0][1] == 15 and last[0][2] == 3)) or bool(open_)
        # procs: direct non-agy children of the host, joined to a RUNNING run_command by CommandLine[:40], else the root's bg
        n["_cmds"] = [s["cmd"] for s in steps if s["st"] == 2 and s["cmd"]]
        return fold(n), unfinished and not row["killed"]

    for c, r in rows.items():
        if r[7] in rows:
            continue
        host = hosted.get(c)
        ts = agy_t(r[4])
        if not host and (NOW - (ts or 0)) > FRESH:
            continue                  # ponytail: old unhosted conversations are not listed; raise FRESH or add a history page if wanted
        n, _ = build(c, host, live_hosts[host]["started"] if host else start, False)
        roots.setdefault(host, []).append(n)
    for pid in live_hosts:
        mine = roots.get(pid) or []
        if not mine:
            continue
        flat = []
        def walk_(n):
            flat.append(n)
            for k in n["kids"]:
                walk_(k)
        for n in mine:
            walk_(n)
        for c in (x for x, p in PROC.items() if p["ppid"] == pid and p["comm"] != "agy"):
            cmd = PROC[c].get("cmd") or " ".join(argv(c))
            t = next((n for n in flat if any(x[:40] in cmd for x in n["_cmds"])), mine[0])
            t["procs"].append(proc_entry(c, cmd, bg=t is mine[0] and not t["_cmds"]))
    for n in (x for v in roots.values() for x in v):
        for m in [n] + n["kids"]:
            m.pop("_cmds", None)


def selftest_agy():
    global NOW
    NOW = time.time()
    S = lambda i, ty, st, tool="", cmd=None, tt=None, args="": {"idx": i, "type": ty, "st": st, "tool": tool, "args": args, "tt": tt, "cmd": cmd}   # noqa: E731
    R = lambda **k: dict({"status": "CASCADE_RUN_STATUS_IDLE", "killed": 0, "nfi": 0, "raw": b"", "mx": 5, "count": 5}, **k)   # noqa: E731
    run = {"status": "CASCADE_RUN_STATUS_RUNNING"}
    f = lambda row, steps=(), host=1, hs=NOW - 99, sub=False, ku=0, und=False: agy_state(row, list(steps), host, hs, sub, ku, und)[:2]   # noqa: E731
    assert f(R(**run), host=None)[0] == "dead"                                       # RUNNING but no host
    assert f(R(), host=None, hs=NOW - 99, steps=[S(5, 15, 8, tt=NOW)])[0] == "dead"  # live-looking step newer than the host start
    assert f(R(), host=None, steps=[S(5, 15, 8)])[0] == "user"                       # idle + nobody hosts it: leftovers are history
    assert f(R(), [S(4, 132, 9, "write_to_file"), S(5, 132, 1)])[0] == "user"        # WAITING beats a newer PENDING
    assert f(R(), [S(5, 132, 1), S(4, 15, 8)])[0] == "work"                          # GENERATING beats PENDING
    assert f(R(), [S(5, 23, 2)]) == ("work", "컨텍스트 압축 중")
    sch = S(5, 132, 2, "schedule", args='{"DurationSeconds": 60, "TimerCondition": "any", "Prompt": "wait for subagents"}')
    assert f(R(), [sch]) == ("child", "하위 작업 대기 60s")
    assert f(R(), [dict(sch, args='{"DurationSeconds": 60}')])[0] == "tool"
    assert f(R(), [S(5, 21, 2, "run_command", "sleep 99")]) == ("tool", "$ sleep 99")
    assert f(R(mx=9), [S(5, 21, 2, "run_command", "sleep 99", tt=NOW - 500)], hs=NOW - 99)[0] == "user"   # stale: older than the host start
    assert f(R(mx=9), [S(5, 21, 2, "run_command", "sleep 99", tt=NOW - 5)], hs=NOW - 99)[0] == "child"    # live background command
    assert f(R(**run))[0] == "work" and f(R(), ku=2) == ("child", "하위 에이전트 2개 대기") and f(R(), und=True)[0] == "child"
    t = lambda n, **k: f(R(raw=bytes([0xE0, 0x01, n]) + b"", **k))[0]                # field 28 varint (28<<3 = 224 -> e0 01)
    assert t(4) == "user" and t(2) == "stopped" and t(1) == "stopped" and t(3) == "stopped" and t(4, sub=True) == "user"
    assert f(R(killed=1))[0] == "stopped" and f(R(count=0))[0] == "idle"
    assert pbv(bytes([0xB8, 0x01, 0x00]), 23) == 0 and pbv(bytes([0xB8, 0x01, 0x01, 0xA8, 0x01, 1]), 21) == 1   # explicit 0 reads as 0
    w = S(7, 132, 9, "run_command", tt=NOW - 120)
    assert f(R(), [w], sub=True)[1] != "권한 승인 대기: run_command" and f(R(), [dict(w, tt=NOW - 5)], sub=True)[1] == "권한 승인 대기: run_command"   # a subagent's prompt expires after 60 s
    print("ok agy")


# ---------- talk: a human's message into a session (TALK-ENG 2, 3) ----------
TALK_ROOT = os.environ.get("AT_TALK_ROOT") or None
CX_RPC = ("initialize", "thread/loaded/list", "thread/read", "thread/turns/list", "turn/start", "turn/steer")   # the only methods this program ever sends to codex
CX_DEADLINE = 20   # seconds for one codex send (a test lowers it)


def ancestors(pid):
    """pid and its parents, read live from /proc."""
    out = set()
    while pid > 1 and pid not in out:
        out.add(pid)
        try:
            st = open("/proc/%d/stat" % pid).read()
            pid = int(st[st.rindex(")") + 2:].split()[1])
        except (OSError, ValueError, IndexError):
            break
    return out


def own_sock(path):
    """True when path (symlinks followed) is a unix socket owned by this user; under TALK_ROOT when that is set."""
    try:
        p, st = os.path.realpath(path), os.stat(path)
    except (OSError, TypeError, ValueError):
        return False
    return stat.S_ISSOCK(st.st_mode) and st.st_uid == os.getuid() and (TALK_ROOT is None or p.startswith(os.path.realpath(TALK_ROOT) + os.sep))


def sock_ok(path, pid):
    """A claude inbox: <runtime dir>/cc-socks/<pid>.sock, in a directory Claude Code makes for this user."""
    if not isinstance(path, str) or not own_sock(path):
        return False
    p, uid = os.path.realpath(path), os.getuid()
    dirs = {"/run/user/%d/cc-socks" % uid, "/tmp/cc-socks-%d" % uid}
    if os.environ.get("XDG_RUNTIME_DIR"):
        dirs.add(os.path.join(os.environ["XDG_RUNTIME_DIR"], "cc-socks"))
    return os.path.dirname(p) in {os.path.realpath(d) for d in dirs} and os.path.basename(p) == "%s.sock" % pid


def claude_mode(tr, pid):
    """'bypass' | 'prompting': the last permissionMode in the transcript's 256 KB tail, else the process's flags."""
    try:
        with open(tr, "rb") as f:
            f.seek(max(0, f.seek(0, 2) - (1 << 18)))
            m = re.findall(rb'"permissionMode":"(\w+)"', f.read())
    except (OSError, TypeError):
        m = []
    if m:
        return "bypass" if m[-1] == b"bypassPermissions" else "prompting"
    a = argv(pid)
    return "bypass" if any(x in a for x in ("--dangerously-skip-permissions", "bypassPermissions", "--permission-mode=bypassPermissions")) else "prompting"


def claude_inbound(cwd_):
    """crossSessionInbound: accept | hold | refuse. ~/.claude/settings.json sets it; the project's settings files may only tighten; an unknown value holds.
    # ponytail: user + project files only; managed policy is not read, so a managed 'hold' shows up as a held send, not a refused one"""
    rank, v, c = {"accept": 0, "hold": 1, "refuse": 2}, "accept", Path(str(cwd_ or "/"))
    for i, f in enumerate((HOME / ".claude/settings.json", c / ".claude/settings.json", c / ".claude/settings.local.json")):
        try:
            x = json.loads(f.read_text(encoding="utf-8")).get("crossSessionInbound")
        except (OSError, ValueError, AttributeError):
            continue
        if x is not None:
            x = x if isinstance(x, str) and x in rank else "hold"
            v = x if i == 0 else max(v, x, key=rank.get)
    return v


def claude_cap(s, anc):
    """talk field of a claude root from its sessions/<pid>.json (TALK-ENG 2.1 rules 5-8). anc = pids that must not be messaged (this collector's ancestors)."""
    pid, sp = s.get("pid"), s.get("messagingSocketPath")
    if s.get("kind") != "interactive":
        return {"ok": False, "reason": "not-interactive"}
    if s.get("peerProtocol") != 1 or not sock_ok(sp, pid):
        return {"ok": False, "reason": "no-socket"}
    if pid in anc or sp == os.environ.get("CLAUDE_CODE_MESSAGING_SOCKET"):
        return {"ok": False, "reason": "self"}
    tr = next((HOME / ".claude/projects").glob("*/%s.jsonl" % s.get("sessionId")), None)
    d = {"ok": True, "max": TALK_MAX}
    if claude_mode(tr, pid) == "bypass" or claude_inbound(s.get("cwd")) == "hold":
        d["hold"] = True
    return d


def codex_cap(t):
    """talk field of a codex root thread (TALK-ENG 3.1): only a thread an app-server daemon hosts can be reached."""
    a = argv(CX_HELD[t])
    if CX[t][7] == "exec":
        return {"ok": False, "reason": "not-interactive"}
    return {"ok": False, "reason": "no-daemon"} if "--no-daemon" in a else {"ok": True, "max": TALK_MAX} if "app-server" in a else {"ok": False, "reason": "not-interactive"}


def talk_fill(forest):
    """Every node gets `talk`: {ok, hold?, max} or {ok: false, reason}. Rules in the spec's order (TALK-ENG 2.1)."""
    me = ancestors(os.getpid()) if not WIN else set()
    for r in forest:
        for k in claude_walk(r["kids"]):
            k["talk"] = {"ok": False, "reason": "subagent"}
        r["talk"] = ({"ok": False, "reason": "unsupported"} if r["tool"] == "agy"
                     else {"ok": False, "reason": "ended"} if r["st"] == "dead" or r["tool"] == "codex" and r["id"] not in CX_HELD
                     else {"ok": False, "reason": "windows"} if WIN
                     else claude_cap(CL_SESS[r["id"]], me) if r["tool"] == "claude" and r["id"] in CL_SESS
                     else codex_cap(r["id"]) if r["tool"] == "codex" else {"ok": False, "reason": "not-interactive"})


def claude_session(sid):
    """sessions/<pid>.json of a session id, or None. A crash + `--resume` leaves several files with one id: the live process wins, then the newest."""
    found = []
    for f in (HOME / ".claude/sessions").glob("*.json"):
        try:
            s = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if isinstance(s, dict) and s.get("sessionId") == sid and type(s.get("pid")) is int and not s.get("spare") and not s.get("parkedJobId"):
            found.append(s)

    def live(s):
        try:
            st = open("/proc/%d/stat" % s["pid"]).read()
            return str(st[st.rindex(")") + 2:].split()[19]) == str(s.get("procStart"))
        except (OSError, ValueError, IndexError):
            return False
    found.sort(key=lambda s: (live(s), s.get("statusUpdatedAt") or 0), reverse=True)
    return found[0] if found else None


def talk_line(by, mid, text):
    return "[Agen Talk · %s · %s]\n%s" % (by, mid, text)


def talk_drain(c, timeout=1):
    end, got = time.time() + timeout, 0
    try:
        while got < 4096 and time.time() < end:
            c.settimeout(max(0.001, end - time.time()))
            b = c.recv(4096)
            if not b:
                break
            got += len(b)
    except socket.timeout:
        pass


def talk_claude(sid, text, by, mid):
    """Send into a claude session's inbox socket (peer frame, never an auth line, never `from`). -> (outcome, reason, detail)."""
    import uuid
    s = claude_session(sid)
    try:
        st = open("/proc/%d/stat" % s["pid"]).read()
        r = st[st.rindex(")") + 2:].split()
        alive = st[st.index("(") + 1:st.rindex(")")] == "claude" and r[0] not in "ZX" and str(r[19]) == str(s.get("procStart"))   # pid reuse guard
    except (OSError, ValueError, IndexError, TypeError):
        alive = False
    if not alive:
        return "unreachable", "gone", None
    cap = claude_cap(s, ancestors(os.getpid()))
    if not cap["ok"]:
        return "refused", cap["reason"], None
    if claude_inbound(s.get("cwd")) == "refuse":
        return "refused", "inbound-off", None
    frame = json.dumps({"type": "user", "msgV": 1, "msg_id": str(uuid.uuid4()), "session_id": sid, "priority": "next",
                        "message": {"role": "user", "content": talk_line(by, mid, text)}}).encode() + b"\n"
    c = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    c.settimeout(3)
    try:
        c.connect(os.path.realpath(s["messagingSocketPath"]))
    except OSError as e:   # nobody listens: nothing was sent
        c.close()
        return "unreachable", "no-listener", type(e).__name__
    if hasattr(socket, "SO_PEERCRED"):   # the path was checked before connect; the listener itself must be this user too (no swap in between)
        import struct
        try:
            peer_uid = struct.unpack("3i", c.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, struct.calcsize("3i")))[1]
        except OSError:
            peer_uid = None
        if peer_uid != os.getuid():
            c.close()
            return "refused", "no-socket", None
    try:
        c.sendall(frame)
        c.shutdown(socket.SHUT_WR)
        talk_drain(c)
    except OSError as e:   # the line may or may not have arrived
        return "unknown", None, type(e).__name__
    finally:
        c.close()
    return ("held" if cap.get("hold") else "accepted"), None, None


class RpcError(Exception):
    pass


class RpcIgnored(Exception):
    pass


def talk_codex(tid, text, by, mid):
    """Send into a codex thread an app-server daemon hosts: one `codex app-server proxy` session; server requests (approvals) are never answered: the proxy disconnects.
    The proxy is never started without a running daemon. -> (outcome, reason, detail)"""
    import queue, subprocess, threading
    h = CX_HELD.get(tid)
    sock = os.path.join(os.environ.get("CODEX_HOME") or str(HOME / ".codex"), "app-server-control/app-server-control.sock")
    if not re.fullmatch(r"[0-9a-f-]{36}", tid) or not h or "app-server" not in argv(h) or not own_sock(sock):
        return "unreachable", "no-daemon", None
    a0 = argv(h)[0]
    exe = os.environ.get("AT_CODEX") or (a0 if os.path.isabs(a0) and os.access(a0, os.X_OK) else shutil.which("codex"))   # the daemon's own binary: same version
    if not exe:
        return "unreachable", "no-daemon", "codex 프로그램을 찾을 수 없습니다"
    sent, box, n = [False], queue.Queue(), [0]
    try:
        p = subprocess.Popen([exe, "app-server", "proxy", "--sock", sock], **popen_kw(stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, start_new_session=True))
    except OSError as e:
        return "unreachable", "no-daemon", type(e).__name__

    def kill_proxy():
        if p.poll() is None:
            p.terminate()
            p.kill()
    watchdog = threading.Timer(CX_DEADLINE, kill_proxy)
    watchdog.daemon = True
    watchdog.start()
    end = time.monotonic() + CX_DEADLINE

    def reader():
        for ln in iter(lambda: p.stdout.readline(4 << 20), b""):
            box.put(ln)
        box.put(None)

    def send(o):
        p.stdin.write(json.dumps(o).encode() + b"\n")
        p.stdin.flush()

    def rpc(method, params):
        """-> result; server-to-client requests are ignored and close this proxy."""
        assert method in CX_RPC, method
        n[0] += 1
        sent[0] = sent[0] or method in ("turn/start", "turn/steer")
        send({"id": n[0], "method": method, "params": params})
        while True:
            left = end - time.monotonic()
            if left <= 0:
                raise TimeoutError
            try:
                ln = box.get(timeout=left)
            except queue.Empty:
                raise TimeoutError
            if ln is None:
                raise EOFError("proxy ended")
            try:
                d = json.loads(ln)
            except ValueError:
                continue
            if not isinstance(d, dict):
                continue
            if "method" in d and "id" in d:   # any server request may be the owner's pending prompt
                raise RpcIgnored
            elif "method" not in d and d.get("id") == n[0]:
                if "error" in d:
                    raise RpcError(str((d["error"] or {}).get("message") if isinstance(d["error"], dict) else d["error"])[:200])
                return d.get("result") or {}

    def status():
        st = (rpc("thread/read", {"threadId": tid, "includeTurns": False}).get("thread") or {}).get("status")
        return st.get("type") if isinstance(st, dict) else st

    inp = [{"type": "text", "text": talk_line(by, mid, text), "text_elements": []}]
    threading.Thread(target=reader, daemon=True).start()
    try:
        rpc("initialize", {"clientInfo": {"name": "agen-talk", "title": "에겐 톡", "version": APP_VERSION}, "capabilities": {"experimentalApi": False}})
        send({"method": "initialized", "params": {}})
        cur, loaded = None, False
        for _ in range(5):   # never thread/resume: a thread nobody loaded is not ours to load
            r = rpc("thread/loaded/list", {"cursor": cur} if cur else {})
            cur = r.get("nextCursor")
            loaded = tid in (r.get("data") or ())
            if loaded or not cur:
                break
        if not loaded:
            return "unreachable", "not-loaded", None
        s = status()
        if s == "active":
            t = (rpc("thread/turns/list", {"threadId": tid, "limit": 1}).get("data") or [{}])[0]
            try:
                if t.get("status") != "inProgress":
                    raise RpcError("no open turn")
                rpc("turn/steer", {"threadId": tid, "expectedTurnId": t.get("id"), "input": inp})   # only these keys: overrides would persist
                return "accepted", None, None
            except RpcError:   # the turn ended meanwhile?
                s = status()
        if s == "idle":
            rpc("turn/start", {"threadId": tid, "input": inp})
            return "accepted", None, None
        return ("refused", "busy-race", None) if s == "active" else ("unreachable", "not-loaded", None)
    except RpcError as e:
        return "refused", "codex-error", str(e)
    except RpcIgnored:
        return ("unknown", None, "RpcIgnored") if sent[0] else ("refused", "busy-race", None)
    except (TimeoutError, EOFError, OSError) as e:
        if sent[0]:
            return "unknown", None, type(e).__name__
        return "unreachable", "timeout" if isinstance(e, TimeoutError) else "no-daemon", None
    finally:
        try:
            p.stdin.close()
        except OSError:
            pass
        watchdog.cancel()
        if time.monotonic() >= end:
            kill_proxy()
        try:
            p.wait(2)
        except subprocess.TimeoutExpired:
            p.terminate()
            try:
                p.wait(2)
            except subprocess.TimeoutExpired:
                p.kill()
                p.wait()


def talk_req(raw):
    """One talk request line (bytes) of the pipe protocol -> its reply dict. Never raises."""
    def rep(mid, outcome, reason=None, detail=None):
        return dict(dict(re=mid, outcome=outcome), **{k: v for k, v in (("reason", reason), ("detail", detail and str(detail)[:200])) if v})
    if len(raw) > 1 << 16:
        return rep(None, "refused", "too-long")
    try:
        d = json.loads(raw)
    except ValueError:
        d = None
    d = d if isinstance(d, dict) else {}
    mid, by, text, tool, tid = d.get("msg_id"), d.get("by"), d.get("text"), d.get("tool"), d.get("id")
    mid = mid if isinstance(mid, str) and re.fullmatch(r"at-[0-9a-f]{8}", mid) else None
    if d.get("op") != "talk" and d:
        return rep(mid, "refused", "bad-op")
    if not mid or tool not in ("claude", "codex") or not isinstance(tid, str) or not 0 < len(tid) <= 200 or not isinstance(text, str) or CTRL.search(text):
        return rep(mid, "refused", "bad-request")
    if not text:
        return rep(mid, "refused", "empty")
    if len(text) > TALK_MAX:
        return rep(mid, "refused", "too-long")
    if WIN:
        return rep(mid, "refused", "windows")
    by = by if isinstance(by, str) and re.fullmatch(r"[A-Za-z0-9._-]{1,32}@[A-Za-z0-9._-]{1,64}", by) else "?@?"
    try:
        return rep(mid, *(talk_claude if tool == "claude" else talk_codex)(tid, text, by, mid))
    except Exception as e:   # the pipe must outlive any one request
        return rep(mid, "unknown", "internal", type(e).__name__)


def talk_enqueue(slot, job, rate, key, target, now):
    """A full channel queue must not consume any talk rate limit."""
    import queue
    try:
        slot["tq"].put_nowait(job)
    except queue.Full:
        return False
    rate["dup"][key] = rate["last"][target] = now
    rate["win"].append(now)
    return True


# ---------- collect everything into one forest ----------
import threading
COLLECT_LOCK = threading.Lock()   # collect() rebuilds module globals (NOW, PROC, CX…, NODES): two local channels must not interleave


def collect():
    with COLLECT_LOCK:
        return collect_unlocked()


def collect_unlocked():
    global NOW, PROC
    NOW = time.time()
    del WARN[:]
    NODES.clear()
    PROC = procs()
    roots = {None: []}   # host pid -> [root nodes it hosts]; None = no live host
    for name, f in (("codex", codex_collect), ("agy", agy_collect), ("claude", claude_collect)):   # one broken source must not blank the machine
        try:
            f(roots)
        except Exception as e:
            WARN.append("%s 수집 오류: %s: %s" % (name, type(e).__name__, line1(str(e), 120)))
    try:
        forest = proc_attach(roots)   # nests hosts under the agent that launched them, attaches leftovers
    except Exception as e:
        WARN.append("프로세스 연결 오류: %s: %s" % (type(e).__name__, line1(str(e), 120)))
        forest = [n for v in roots.values() for n in v]
    for name, f in (("talk", talk_fill), ("msgs", msgs_post), ("project", project_fill)):
        try:
            f(forest)
        except Exception as e:
            WARN.append("%s 처리 오류: %s: %s" % (name, type(e).__name__, line1(str(e), 120)))
    for k in [k for k, v in CL_HEAD.items() if v[2] != NOW]:   # only the transcripts this collect read
        del CL_HEAD[k]
    rank = {s: i for i, s in enumerate(("stall", "user", "work", "tool", "child", "stopped", "dead", "idle", "done"))}
    forest.sort(key=lambda n: (rank[n["st"]], n["age"] or 0))
    return {"ts": time.time(), "time": time.strftime("%H:%M:%S"), "host": socket.gethostname(), "user": getpass.getuser(),
            "os": "windows" if WIN else "linux", "agents": forest, "warnings": list(WARN)}


# ---------- terminal render ----------
COLOR = "-c" in sys.argv
WIDTH = shutil.get_terminal_size((160, 40)).columns
ST = {"work": ("●", "32", "작업 중"), "tool": ("●", "32", "도구 실행 중"), "child": ("◔", "34", "하위 대기"),
      "user": ("○", "33;1", "입력 대기"), "stall": ("◐", "31;1", "응답 없음"), "idle": ("·", "2", "쉬는 중"),
      "done": ("✓", "2", "완료"), "stopped": ("✗", "2", "중단됨"), "dead": ("✗", "31", "끊김")}
TOOL = {"codex": "34", "claude": "38;5;208", "agy": "35"}
COLS = [("작업 중", ("work", "tool")), ("대기", ("child",)), ("나를 기다림", ATTENTION), ("끝남", ("done", "stopped", "dead"))]


def paint(s, code):
    return f"\033[{code}m{s}\033[0m" if COLOR and code else s


def cells(s):
    return sum(2 if unicodedata.east_asian_width(c) in "WF" else 1 for c in s)


def cut(s, n):
    if cells(s) <= n:
        return s
    out, w = "", 0
    for c in s:
        if w + cells(c) > n - 1:
            break
        out, w = out + c, w + cells(c)
    return out + "…"


def pad(s, n):
    s = cut(s, max(n, 1))
    return s + " " * (n - cells(s))


def detail(n):
    if n["st"] in LIVE + ATTENTION[1:] and n.get("now"):
        return "▶ " + n["now"]
    return "↳ " + (n.get("last") or n.get("now")) if n.get("last") or n.get("now") else ""


def walk(ns, path=()):
    for n in ns:
        yield n, path
        yield from walk(n["kids"], path + (n["name"],))


def recent(forest):
    if "--all" in sys.argv:
        return forest, 0
    keep = [n for n in forest if n["st"] not in REST or (n["age"] or 0) < 86400
            or any(k["st"] not in REST for k, _ in walk(n["kids"]))]
    return keep, len(forest) - len(keep)


def header(state):
    count = defaultdict(int)
    for n, _ in walk(state["agents"]):
        count[n["st"]] += 1
    left = "  ".join(paint(f"{ST[s][0]} {count[s]} {ST[s][2]}", ST[s][1]) for s in ST if count[s] or s in ATTENTION)
    print(paint(state["time"], "1"), " ", left)
    for w in state.get("warnings", ()):
        print(paint("! " + line1(w), "33"))


def tree(n, pre="", last=True, root=True):
    sym, col, label = ST[n["st"]]
    head = "" if root else pre + ("└─ " if last else "├─ ")
    body = "" if root else pre + ("   " if last else "│  ")
    under = body + ("│  " if n["kids"] or n["hidden"] else "   ")
    right = cut(" · ".join(x for x in (f"{label} {fmt(n['age'])}", n.get("why"), n.get("since") and "턴 " + fmt(n["since"])) if x),
                WIDTH // 2)
    print(head + paint(sym, col) + " " + paint(f"{n['tool']:<6}", TOOL[n["tool"]]) + " "
          + paint(cut(n["name"], WIDTH - cells(head) - cells(right) - 12), "1") + "  " + paint(right, "2"))
    if n.get("meta"):
        print(under + paint(cut(n["meta"], WIDTH - cells(under)), "2"))
    if detail(n):
        print(under + paint(cut(detail(n), WIDTH - cells(under)), col if n["st"] in LIVE + ATTENTION else "2"))
    for p in n.get("procs", []):
        print(under + paint(cut(f"⚙ {p['cmd']}  CPU {p['cpu']}%  {fmt(p['age'])}", WIDTH - cells(under)), "2"))
    for i, k in enumerate(n["kids"]):
        tree(k, body, i == len(n["kids"]) - 1 and not n["hidden"], False)
    if n["hidden"]:
        print(body + "└─ " + paint(f"+{n['hidden']} finished >{OLD // 60}m ago", "2"))


def board(forest):
    w = (WIDTH - 3 * (len(COLS) - 1)) // len(COLS)
    lines = []
    for label, sts in COLS:
        cards = sorted(((n, p) for n, p in walk(forest) if n["st"] in sts), key=lambda x: x[0]["age"] or 0)
        out = [(f"{label} ({len(cards)})", "1"), ("─" * w, "2")]
        for n, p in cards:
            out.append((f"{ST[n['st']][0]} {n['tool']} {n['name']}  {fmt(n['age'])}", ST[n["st"]][1]))
            if p:
                out.append(("  ⤷ " + p[-1], "2"))
            if detail(n):
                out.append(("  " + detail(n), "" if n["st"] in LIVE + ATTENTION else "2"))
            out.append(("", ""))
        lines.append(out)
    for row in range(max(map(len, lines))):
        print(" │ ".join(paint(pad(c[row][0], w), c[row][1]) if row < len(c) else " " * w for c in lines))


# ---------- pipe / hub ----------
# the hub feeds this to `python3 -c "BOOT"` on the server: first line = byte length, then the source, then one
# newline per poll. ponytail: BOOT must never contain " $ ` or \ (it passes through the remote login shell)
BOOT = ("import sys;b=sys.stdin.buffer;n=int(b.readline());s=b.read(n);sys.argv=['agen_talk.py','pipe'];"
        "exec(compile(s,'agen_talk.py','exec'),{'__name__':'__main__','__file__':'agen_talk.py'})")
INTERVAL = 3
HUB_SEEN = [time.time()]   # last /api request; channels stop polling 30 s after it (the ssh session stays)


def pipe():
    """Remote side: one JSON line per input line, ends at EOF so the collector dies with the ssh session."""
    for ln in sys.stdin.buffer:
        s = ln.strip()
        out = talk_req(s) if s[:1] == b"{" else collect()   # a line starting with { is a talk request, anything else is a poll
        sys.stdout.buffer.write(json.dumps(out, ensure_ascii=False).encode("utf-8", "replace") + b"\n")   # a lone surrogate (a cut emoji) must not kill the channel
        sys.stdout.buffer.flush()


# ---- 서버 추가: the password is typed once into ssh in its own console; a dedicated key gets installed (other keys are never touched)
SRV_HOST = r"(?=.{1,253}\Z)[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?"
SRV_USER = r"[A-Za-z_][A-Za-z0-9._-]{0,31}"
SRV_PY = r"[A-Za-z0-9._/-]{1,64}"
PUBKEY = r"ssh-ed25519 [A-Za-z0-9+/=]+( [A-Za-z0-9@._-]+)?"   # embedded in a remote command: this regex is what makes that safe
PC = re.sub(r"[^A-Za-z0-9._-]", "", socket.gethostname()) or "pc"
KEY = HOME / ".ssh" / "agen_talk_ed25519"
KEYINSTALL_TIMEOUT = float(os.environ.get("AT_KEYINSTALL_TIMEOUT", 180))   # seconds; test-only override, like AT_SSH / AT_SSH_KEYGEN
NOSSH = "ssh 프로그램을 찾을 수 없습니다"


class SrvErr(Exception):
    """args = (kind, message); kind is one of the error kinds the UI knows."""


def ssh_bin(name):
    """ssh / ssh-keygen: env AT_SSH / AT_SSH_KEYGEN (tests only; no fallback when set), PATH, the Windows OpenSSH folder."""
    env = os.environ.get("AT_SSH" if name == "ssh" else "AT_SSH_KEYGEN")
    if env:
        return env if os.path.isfile(env) else None
    if WIN:   # the absolute OpenSSH paths first: which() searches the cwd before PATH (Sysnative: a 32-bit python)
        for d in ("System32", "Sysnative"):
            f = os.path.join(os.environ.get("SystemRoot", r"C:\Windows"), d, "OpenSSH", name + ".exe")
            if os.path.isfile(f):
                return f
    return shutil.which(name)


def srv_check(d, ids):
    """Validate a POST /api/servers body (ids = {existing ssh channel id: its python}); returns the clean request or raises ValueError(field)."""
    d = d if isinstance(d, dict) else {}
    host, user, port, name, cid, py, pw, auth = (d.get(k) for k in ("host", "user", "port", "name", "id", "python", "password", "auth"))
    port, name, auth = 22 if port is None else port, "" if name is None else name, auth or "appkey"
    if d.get("session_password") is True:   # the UI's name for the password-for-this-session fallback (after key_rejected)
        auth = "password-session"
    strip = lambda t: re.sub(r"[\x00-\x1f\x7f\ud800-\udfff]", "", t).strip()   # control characters and lone surrogates (they cannot be encoded)
    py = py or (ids.get(cid) if isinstance(cid, str) else None)   # fix mode: the channel's own python unless the retry names one
    for k, ok in (("host", isinstance(host, str) and re.fullmatch(SRV_HOST, host)),
                  ("user", isinstance(user, str) and re.fullmatch(SRV_USER, user)),
                  ("port", type(port) is int and 0 < port < 65536),
                  ("name", isinstance(name, str) and len(strip(name)) <= 40),
                  ("id", cid is None or isinstance(cid, str) and cid in ids),
                  ("python", py in (None, "") or isinstance(py, str) and re.fullmatch(SRV_PY, py)),
                  ("password", pw is None or isinstance(pw, str) and len(pw) <= 256),
                  ("auth", auth in ("appkey", "password-session"))):
        if not ok:
            raise ValueError(k)
    return {"host": host, "user": user, "port": port, "name": strip(name), "id": cid, "python": py or None,
            "password": pw or None, "auth": auth}   # the password lives in this dict only until the job thread takes it


def ssh_kind(err):
    """Error kind of an ssh stderr text (order matters: a changed key prints the WARNING block and 'Host key verification failed')."""
    return ("host_key_changed" if re.search(r"REMOTE HOST IDENTIFICATION HAS CHANGED|Host key verification failed", err) else
            "wrong_password" if "Permission denied" in err else
            "unreachable" if re.search(r"Could not resolve|Connection refused|timed out|No route", err) else "other")


def last(text):
    return line1("\n".join(str(text).splitlines()[::-1]))   # line1 = first non-empty line


def chan_args(args, port, add=True):
    """ssh_args with our -i / -o IdentitiesOnly / -p replacing earlier ones; everything else is kept (add=False: just remove ours)."""
    a, out, i = list(args) if isinstance(args, list) else [], [], 0
    while i < len(a):
        if a[i] in ("-i", "-p") or a[i] == "-o" and str(a[i + 1] if i + 1 < len(a) else "").startswith("IdentitiesOnly"):
            i += 2
        else:
            out.append(a[i])
            i += 1
    return out + ["-i", str(KEY), "-o", "IdentitiesOnly=yes"] + (["-p", str(port)] if port != 22 else []) if add else out


def chan_port(c):
    """The port of an ssh channel entry: its `port` field, else its legacy `-p`, default 22."""
    if type(c.get("port")) is int:
        return str(c["port"])
    return next((a[i + 1] for a in [c.get("ssh_args")] if isinstance(a, list) for i in range(len(a) - 1) if a[i] == "-p"), "22")


def presets_check(raw):
    """channels.json `presets` -> ([{"name","host","port"}], [why each dropped entry was dropped])."""
    out, bad = [], []
    for e in raw if isinstance(raw, list) else ([] if raw is None else [raw]):
        h, port, name = (e.get(k) for k in ("host", "port", "name")) if isinstance(e, dict) else (None,) * 3
        port, name = 22 if port is None else port, h if name is None else name
        if not (isinstance(h, str) and re.fullmatch(SRV_HOST, h) and type(port) is int and 0 < port < 65536 and isinstance(name, str) and 0 < len(name) <= 40):
            bad.append(str(e)[:80])
        else:
            out.append({"name": CTRL.sub("", name), "host": h, "port": port})
    return out, bad


def presets_view(presets, chans):
    """What GET /api/presets serves: each preset plus `added` = a channel with that host and port exists."""
    have = {(str(c.get("ssh", "")).rpartition("@")[2], str(chan_port(c))) for c in chans if c.get("kind") == "ssh"}
    return [dict(p, added=(p["host"], str(p["port"])) in have) for p in presets]


def sys32(*parts):
    """%SystemRoot%\\System32\\<parts> (Windows tools by absolute path: a bare name would be searched in the cwd first)."""
    return os.path.join(os.environ.get("SystemRoot", r"C:\Windows"), "System32", *parts)


def popen_kw(inherit=False, console=False, **kw):
    """The one place that decides subprocess creation flags. Windows: no console window (CREATE_NO_WINDOW);
    console=True: its own visible console (keyinstall's password window); inherit=True: leave the flags alone
    (keyinstall's ssh must use keyinstall's console). Every subprocess call in this file goes through here (selftest checks)."""
    if WIN and not inherit:
        kw["creationflags"] = kw.get("creationflags", 0) | (0x00000010 if console else 0x08000000)
    return kw


def bundle(name):
    """A file shipped with the program: next to this source, or inside the PyInstaller bundle (sys._MEIPASS) when frozen."""
    return Path(getattr(sys, "_MEIPASS", None) or Path(__file__).resolve().parent) / name


def conf_dir(win=None):
    """Per-user config folder (channels.json, ui.json): %APPDATA%\\AgenTalk, POSIX fallback ~/.config/agen-talk."""
    return Path(os.environ.get("APPDATA") or HOME / "AppData/Roaming") / "AgenTalk" if (WIN if win is None else win) else HOME / ".config/agen-talk"


def state_dir(win=None):
    """Per-user state folder (run.json, log): %LOCALAPPDATA%\\AgenTalk, POSIX fallback ~/.local/state/agen-talk."""
    return Path(os.environ.get("LOCALAPPDATA") or HOME / "AppData/Local") / "AgenTalk" if (WIN if win is None else win) else HOME / ".local/state/agen-talk"


def default_cfg():
    """channels.json when `hub` has no FILE: one next to this source (the old layout) if present, else the config folder."""
    old = Path(__file__).resolve().with_name("channels.json")
    return old if old.exists() and not getattr(sys, "frozen", False) else conf_dir() / "channels.json"


def replace_retry(src, dst, tries=10):
    """os.replace that rides out Windows sharing violations (Defender, OneDrive or a reader holding the target for a moment)."""
    for i in range(tries):
        try:
            return os.replace(src, dst)
        except PermissionError:
            if not WIN or i == tries - 1:
                raise
            time.sleep(0.05 * (i + 1))


def write_conf(cfg, conf):
    """Atomic channels.json write (temp file in the same folder, fsync, os.replace on the resolved path); keeps the old file's mode, new files 0644."""
    import tempfile
    cfg = Path(cfg)
    cfg.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(cfg.resolve().parent), prefix=".channels-", suffix=".tmp")
    try:
        try:
            mode = os.stat(cfg).st_mode & 0o7777
        except OSError:
            mode = 0o600   # a new file: server names and accounts are nobody else's business (Windows ignores the bits)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(conf, f, indent=1, ensure_ascii=False)
            f.flush()
            os.fsync(f.fileno())
        os.chmod(tmp, mode)
        replace_retry(tmp, cfg.resolve())   # resolve: a symlinked channels.json stays a symlink
    except BaseException as e:
        os.unlink(tmp)
        if isinstance(e, OSError):
            raise SrvErr("other", "설정 파일(channels.json)을 저장하지 못했습니다: %s" % e)
        raise


def presets_merge(old, new, cap=50, stats=None):
    """Existing + imported presets (both validated by presets_check). Existing entries are never touched or dropped; a new entry is appended
    when its host+port is not there yet, in order, while the list is below `cap`. stats (dict) gets added / dup / capped."""
    out, seen, st = list(old), {(p["host"], p["port"]) for p in old}, {"added": 0, "dup": 0, "capped": 0}
    for p in new:
        k = (p["host"], p["port"])
        if k in seen:
            st["dup"] += 1
        elif len(out) >= cap:
            st["capped"] += 1
            seen.add(k)
        else:
            out.append(p)
            seen.add(k)
            st["added"] += 1
    if stats is not None:
        stats.update(st)
    return out


def chan_upsert(conf, rq, taken):
    """Patch the ssh channel named by rq['id'] (else the one with the same target and port) in conf, or append a new one; returns its entry.
    Only entries the hub itself would start (valid id, kind ssh, a target) are candidates."""
    tgt = "%s@%s" % (rq["user"], rq["host"])
    chs = conf.setdefault("channels", [])
    live = lambda c: isinstance(c, dict) and c.get("kind") == "ssh" and c.get("ssh") and re.fullmatch(r"[a-z0-9_-]+", str(c.get("id")))
    ent = next((c for c in chs if live(c) and (c["id"] == rq["id"] if rq["id"] else c["ssh"] == tgt and str(chan_port(c)) == str(rq["port"]))), None)
    if ent is None:
        base = re.sub(r"[^a-z0-9]+", "-", rq["host"].lower()).strip("-") or "srv"
        ids, new, n = set(taken) | {c.get("id") for c in chs if isinstance(c, dict)}, base, 1
        while new in ids:
            n += 1
            new = "%s-%d" % (base, n)
        ent = {"id": new, "name": rq["name"] or rq["host"], "kind": "ssh"}
        chs.append(ent)
    ent["ssh"] = tgt
    if rq.get("pm"):   # in-app SSH: port and auth are fields; our legacy -i/-p flags go away, anything else is kept
        keep = chan_args(ent.get("ssh_args"), rq["port"], add=False)
        ent.pop("ssh_args", None) if not keep else ent.__setitem__("ssh_args", keep)
        ent["port"], ent["auth"] = rq["port"], rq["auth"]
    else:
        ent["ssh_args"] = chan_args(ent.get("ssh_args"), rq["port"])
    if rq["python"]:
        ent["python"] = rq["python"]
    return ent


def key_pub():
    try:
        pub = Path(str(KEY) + ".pub").read_text(encoding="utf-8").strip()
    except OSError as e:
        raise SrvErr("other", "공개키를 읽을 수 없습니다: %s" % e)
    if not re.fullmatch(PUBKEY, pub):
        raise SrvErr("other", "공개키 형식이 올바르지 않습니다")
    return pub


def key_ensure():
    """Create the dedicated key when missing (idempotent); returns the validated public key line."""
    import subprocess
    pub = Path(str(KEY) + ".pub")
    if KEY.exists() and not KEY.is_file():
        raise SrvErr("other", "%s 가 파일이 아닙니다 — 지우거나 옮긴 뒤 다시 시도하세요" % KEY)
    if KEY.is_file() and not pub.exists():   # private key without its .pub: derive it (an encrypted key fails here: no tty)
        kg = ssh_bin("ssh-keygen")
        r = subprocess.run([kg or "ssh-keygen", "-y", "-f", str(KEY)], **popen_kw(stdin=subprocess.DEVNULL, capture_output=True, timeout=30)) if kg else None
        if not r or r.returncode:
            raise SrvErr("other", "공개키(.pub)가 없고 개인키에서 만들 수 없습니다: %s" % KEY)
        pub.write_text(" ".join(r.stdout.decode("utf-8", "replace").split()[:2]) + " agen-talk@" + PC + "\n", encoding="utf-8")   # -y may print the old comment: keep type + key only
    if not KEY.exists():
        kg = ssh_bin("ssh-keygen")
        if not kg:
            raise SrvErr("ssh_missing", "ssh-keygen 을 찾을 수 없습니다")
        KEY.parent.mkdir(mode=0o700, exist_ok=True)   # POSIX: 700 (umask only removes bits); Windows ignores the mode
        r = subprocess.run([kg, "-q", "-t", "ed25519", "-N", "", "-C", "agen-talk@" + PC, "-f", str(KEY)],
                           **popen_kw(stdin=subprocess.DEVNULL, capture_output=True, timeout=30))
        if r.returncode:
            raise SrvErr("other", last(r.stderr.decode("utf-8", "replace")) or "ssh-keygen 실패")
    return key_pub()


def run_capped(argv, timeout=30, cap=1 << 16):
    """run + capture, but reads at most `cap` bytes per stream, then kills the process (a hostile server cannot fill memory)."""
    import subprocess, threading
    p = subprocess.Popen(argv, **popen_kw(stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE))
    got = {"out": b"", "err": b""}   # fixed keys: the main thread iterates it while the readers store
    ts = [threading.Thread(target=lambda k=k, f=f: got.__setitem__(k, f.read(cap)), daemon=True) for k, f in (("out", p.stdout), ("err", p.stderr))]
    for t in ts:
        t.start()
    end = time.time() + timeout
    while time.time() < end and any(t.is_alive() for t in ts) and not any(len(v) >= cap for v in got.values()):
        ts[0].join(0.02)   # a stream that reached the cap ends the wait: a flood must not hold us for the whole timeout
    flood = any(len(v) >= cap for v in got.values())
    if p.poll() is None and (flood or any(t.is_alive() for t in ts)):
        p.kill()
    try:
        p.wait(5)
    except subprocess.TimeoutExpired:
        p.kill()
        p.wait()
    for t in ts:
        t.join(1)
    late = not flood and time.time() >= end
    if late:
        raise subprocess.TimeoutExpired(argv, timeout)
    return p.returncode, got.get("out", b""), got.get("err", b"")


PYCHECK = "%s -c 'import sys; print(\"AT-PY\", sys.version_info >= (3, 8))'"   # tagged: shell startup files (conda, nvm banners) may print too


def pycheck_parse(out):
    """The python check's answer ('True' / 'False' / '') from stdout that may hold other lines before it."""
    for ln in reversed(out.splitlines()):
        ln = ln.strip()
        if ln.startswith("AT-PY "):
            return ln[6:]
    return ""


def srv_verify(tgt, rq):
    """Key-login check (BatchMode): returns (kind, ssh stderr); kind is 'ok', 'no_python3' or an ssh_kind."""
    import subprocess
    try:
        rc, so, se = run_capped([ssh_bin("ssh"), "-T", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=10", "-o", "IdentitiesOnly=yes", "-i", str(KEY),
                                 "-p", str(rq["port"]), "--", tgt, PYCHECK % (rq["python"] or "python3")])
    except subprocess.TimeoutExpired:
        return "unreachable", "timed out"
    except (OSError, TypeError):   # TypeError: ssh_bin() is None
        return "ssh_missing", NOSSH
    out, err = pycheck_parse(so.decode("utf-8", "replace")), se.decode("utf-8", "replace")
    if rc == 0 and out == "True":
        return "ok", err
    if out == "False":
        return "no_python3", "python 버전이 3.8 보다 낮습니다"
    if rc in (126, 127):   # the remote shell's "cannot execute / not found"
        return "no_python3", err
    return ssh_kind(err), err


def kill_tree(p):
    import subprocess
    if WIN:   # the console's ssh child must die with the keyinstall process
        subprocess.run([sys32("taskkill.exe"), "/F", "/T", "/PID", str(p.pid)], **popen_kw(capture_output=True))
    else:
        p.terminate()   # keyinstall's SIGTERM handler kills its ssh


def jset(j, **kw):
    if not j["cancel"]:   # a cancelled job stays cancelled
        if kw.get("state") in ("keygen", "waiting_password", "verifying", "connecting", "confirm_hostkey", "installing_key"):
            j["phase"] = kw["state"]   # where an error happened: the UI polls too slowly to see every state
        j.update(kw)


def srv_install(j, rq, tgt):
    """Run `keyinstall` in its own console and wait for it; raises SrvErr."""
    import subprocess, tempfile
    fd, rf = tempfile.mkstemp(prefix="agen-talk-", suffix=".json")
    os.close(fd)
    try:
        if j["cancel"]:
            raise SrvErr("cancelled", "")
        jset(j, state="waiting_password")
        me = [sys.executable] if getattr(sys, "frozen", False) else [sys.executable, "-I", str(bundle("agen_talk.py"))]   # the frozen app is its own keyinstall
        p = j["proc"] = subprocess.Popen(me + ["keyinstall", rf, tgt, str(rq["port"]), rq["name"] or rq["host"]], **popen_kw(console=True))
        if j["cancel"]:   # cancelled while the process was being started
            kill_tree(p)
        try:
            p.wait(KEYINSTALL_TIMEOUT)
        except subprocess.TimeoutExpired:
            kill_tree(p)
            p.wait()
            raise SrvErr("cancelled", "3분 동안 입력이 없어 취소했습니다")
        try:
            res = json.loads(Path(rf).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            res = None
    finally:
        try:
            os.unlink(rf)
        except OSError:
            pass
    if not isinstance(res, dict):   # console closed: nothing was written
        raise SrvErr("cancelled", "비밀번호 창이 닫혀 취소했습니다")
    if res.get("code") != 0:
        text = "\n".join(str(x) for x in res.get("stderr") or [])
        jset(j, log=CTRL.sub("", text)[-4000:])
        raise SrvErr(ssh_kind(text), last(text) or "ssh 종료 코드 %s" % res.get("code"))


def srv_job(j, rq, save):
    """Thread body of one 서버 추가 job; j is the dict GET /api/servers/job serves. save(rq) writes channels.json + starts the channel."""
    tgt = "%s@%s" % (rq["user"], rq["host"])
    try:
        if not ssh_bin("ssh"):
            raise SrvErr("ssh_missing", NOSSH)
        key_ensure()
        kind, err = srv_verify(tgt, rq)   # the key may already log in (a retry): then no password window
        if kind in ("unreachable", "ssh_missing") or kind == "host_key_changed" and "CHANGED" in err:   # first contact only says 'verification failed'
            raise SrvErr(kind, last(err))
        if kind not in ("ok", "no_python3"):
            srv_install(j, rq, tgt)
            jset(j, state="verifying")
            kind, err = srv_verify(tgt, rq)
            if kind == "wrong_password":
                raise SrvErr("other", "키는 등록됐지만 로그인되지 않습니다 — 서버의 ~/.ssh 권한(700/600)과 홈 디렉터리 권한을 확인하세요")
        if kind != "ok":
            jset(j, log=CTRL.sub("", err)[-4000:])
            raise SrvErr(kind, last(err) or kind)
        jset(j, state="verifying")
        ch = save(rq)   # None when cancelled meanwhile
        if ch:
            jset(j, state="done", channel=ch)
    except SrvErr as e:
        jset(j, state="error", kind=e.args[0], message=e.args[1])
    except Exception as e:   # save() failed, ssh-keygen hung ...
        jset(j, state="error", kind="other", message=last(e) or type(e).__name__)


def install_cmd(pub):
    """The remote command that appends `pub` (already regex-validated) to authorized_keys. sh -c "...": fish / csh login shells cannot
    parse &&, ||; the leading blank line protects a last line without a final newline."""
    kt, kb = pub.split()[:2]   # the line gets options: the app only runs `python3 -c` (exec, no pty), so it needs no shell, forwarding or X11
    return ('sh -c "umask 077; mkdir -p ~/.ssh && chmod 700 ~/.ssh && touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys'
            " && (grep -qF '%s %s' ~/.ssh/authorized_keys || (echo; echo '%s %s') >> ~/.ssh/authorized_keys)\"" % (kt, kb, AUTH_OPTS, pub))


AUTH_OPTS = "no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty"   # not `restrict`: OpenSSH < 7.2 would refuse the whole line


def keyinstall(res, tgt, port, name=""):
    """Subcommand, runs in its own console: ssh asks for the password right here (stdin/stdout inherited) and appends our public key."""
    import signal, subprocess
    if WIN:
        import ctypes
        k32 = ctypes.windll.kernel32
        if not k32.GetConsoleWindow() or sys.stdout is None:   # started from the windowed app without a console: make one, and use it
            k32.AllocConsole()
            sys.stdin, sys.stdout = open("CONIN$", "r"), open("CONOUT$", "w", encoding="utf-8")
            sys.stderr = sys.stdout
        k32.SetConsoleOutputCP(65001)   # the Korean banner (and ssh's messages) as UTF-8
        k32.SetConsoleTitleW("에겐 톡 — %s (%s)" % (name or tgt.rpartition("@")[2], tgt))
    print("에겐 톡 — %s 에 이 PC의 전용 키를 등록합니다.\n처음 보는 서버라면 먼저 표시되는 지문이 서버 관리자가 알려 준 값과 같은지 확인하세요.\n"
          "확인한 뒤 서버 비밀번호를 아래에 입력하고 Enter 를 누르세요 (입력 중에는 글자가 보이지 않습니다).\n"
          "비밀번호는 저장되지 않습니다. 취소하려면 이 창을 닫으세요.\n" % tgt, flush=True)
    buf, rc, kid = b"", 255, []
    signal.signal(signal.SIGTERM, lambda *a: ([k.kill() for k in kid], os._exit(1)))   # the hub cancels us this way (Windows: taskkill /T)
    try:
        rem = install_cmd(key_pub())
        p = subprocess.Popen(keyinstall_argv(ssh_bin("ssh"), tgt, port, rem), **popen_kw(inherit=True, stderr=subprocess.PIPE))   # inherit: ssh must use keyinstall's own console
        kid.append(p)
        while True:   # relay raw chunks: a prompt without a newline must still show
            c = os.read(p.stderr.fileno(), 4096)
            if not c:
                break
            sys.stderr.buffer.write(c)
            sys.stderr.buffer.flush()
            buf = (buf + c)[-8192:]
        rc = p.wait()
    except (OSError, SrvErr, TypeError) as e:   # TypeError: ssh_bin() is None
        buf = str(e).encode()
    Path(res).write_text(json.dumps({"code": rc, "stderr": buf.decode("utf-8", "replace").splitlines()[-5:]}, ensure_ascii=False), encoding="utf-8")
    if rc == 0:
        print("\n등록 완료", flush=True)
        time.sleep(1.5)
    sys.exit(rc)


def keyinstall_argv(ssh, tgt, port, remote):
    return [ssh, "-o", "StrictHostKeyChecking=ask", "-o", "ConnectTimeout=10", "-o", "NumberOfPasswordPrompts=3",
            "-p", port, "--", tgt, remote]


# ---- in-app SSH (paramiko), hub side only: the collector and `pipe` stay stdlib. Without paramiko the OpenSSH code above is the fallback.
SESSION_PW = {}   # (user, host, port) -> password, for channels with auth "password-session": hub memory only, never written anywhere


def pm_mod():
    """paramiko, imported lazily (None when missing: the CLI on a bare Linux box, tests with AT_NO_PARAMIKO=1)."""
    if os.environ.get("AT_NO_PARAMIKO"):
        return None
    try:
        import logging, paramiko
        logger = logging.getLogger("paramiko")
        if not any(isinstance(h, logging.NullHandler) for h in logger.handlers):
            logger.addHandler(logging.NullHandler())   # no "Socket exception" lines on stderr
        return paramiko
    except Exception:   # ImportError, or a broken cryptography build
        return None


_PM_ACL_VALIDATED = set()


def win_set_dacl(path, sddl):
    """Windows: replace the file's DACL with `sddl` (e.g. 'D:P(A;;FA;;;S-1-5-…)') and read it back; OSError when it does not stick."""
    import ctypes
    from ctypes import wintypes
    adv, k32 = ctypes.WinDLL("advapi32", use_last_error=True), ctypes.WinDLL("kernel32")
    DACL = 4   # DACL_SECURITY_INFORMATION

    def as_text(sd_):   # Windows' own rendering: well-known SIDs come back as aliases (LA, BA…), so compare renderings, not input text
        out = ctypes.c_wchar_p()
        if not adv.ConvertSecurityDescriptorToStringSecurityDescriptorW(sd_, 1, DACL, ctypes.byref(out), None):
            raise ctypes.WinError(ctypes.get_last_error())
        try:
            return out.value
        finally:
            k32.LocalFree(out)
    sd = ctypes.c_void_p()
    if not adv.ConvertStringSecurityDescriptorToSecurityDescriptorW(ctypes.c_wchar_p(sddl), 1, ctypes.byref(sd), None):
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        want = as_text(sd)
        if not adv.SetFileSecurityW(ctypes.c_wchar_p(path), DACL, sd):
            raise ctypes.WinError(ctypes.get_last_error())
    finally:
        k32.LocalFree(sd)
    need = wintypes.DWORD(0)
    adv.GetFileSecurityW(ctypes.c_wchar_p(path), DACL, None, 0, ctypes.byref(need))
    buf = ctypes.create_string_buffer(need.value or 1)
    if not adv.GetFileSecurityW(ctypes.c_wchar_p(path), DACL, buf, need, ctypes.byref(need)):
        raise ctypes.WinError(ctypes.get_last_error())
    got = as_text(buf)
    if got != want:
        raise OSError("DACL did not stick: %s (wanted %s)" % (got, want))


def pm_acl(path):
    """Windows: only the current user may touch the file. Granted by SID (`whoami /user`), so domain / Entra account names never matter.
    A failure aborts key use; inherited permissions could expose the unencrypted key."""
    if not WIN:
        return
    path = str(Path(path).resolve())
    import subprocess
    try:
        out = subprocess.run([sys32("whoami.exe"), "/user", "/fo", "csv", "/nh"], **popen_kw(capture_output=True, text=True, timeout=10))
        sid = out.stdout.strip().split(",")[-1].strip().strip('"')
        if out.returncode or not re.fullmatch(r"S-1-[0-9-]+", sid):
            raise OSError("whoami /user: %r" % out.stdout[:80])
        win_set_dacl(path, "D:P(A;;FA;;;%s)" % sid)   # the whole DACL: protected, one entry. icacls /grant:r kept any other explicit entry
    except (OSError, subprocess.SubprocessError) as e:
        raise SrvErr("other", "개인 키 파일 권한을 제한하지 못했습니다 (%s)" % e)


def app_key(path=None):
    """The app's own key (%APPDATA%\\AgenTalk\\id_ed25519, created on first need): (paramiko key, public line 'ssh-ed25519 AAAA… agen-talk@pc')."""
    paramiko = pm_mod()
    p = Path(path) if path else conf_dir() / "id_ed25519"
    try:
        if p.stat().st_size == 0:   # left by an older build that died between create and write: never usable, so never authorized anywhere
            p.unlink()
    except OSError:
        pass
    if not p.exists():
        from cryptography.hazmat.primitives import serialization as ser
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
        import secrets
        pem = Ed25519PrivateKey.generate().private_bytes(ser.Encoding.PEM, ser.PrivateFormat.OpenSSH, ser.NoEncryption())
        p.parent.mkdir(parents=True, exist_ok=True)
        tmp = p.with_name(".%s.%s.tmp" % (p.name, secrets.token_hex(4)))
        fd = os.open(str(tmp), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            try:
                pm_acl(tmp)   # locked down before the private bytes exist
                with os.fdopen(fd, "wb") as f:
                    f.write(pem)
                    f.flush()
                    os.fsync(f.fileno())
            except BaseException:
                try:
                    os.close(fd)
                except OSError:
                    pass
                raise
            try:
                os.link(str(tmp), str(p))   # atomic publish that never replaces a key a parallel job published first
                _PM_ACL_VALIDATED.add(str(p))
            except FileExistsError:
                pass
        finally:
            tmp.unlink(missing_ok=True)
    if str(p) not in _PM_ACL_VALIDATED:   # validate existing keys before paramiko reads their private bytes
        pm_acl(p)
        _PM_ACL_VALIDATED.add(str(p))
    key = paramiko.Ed25519Key.from_private_key_file(str(p))
    pub = "ssh-ed25519 %s agen-talk@%s" % (key.get_base64(), PC)
    pp = p.with_name(p.name + ".pub")
    if not pp.exists():
        pp.write_text(pub + "\n", encoding="utf-8")
    if not re.fullmatch(PUBKEY, pub):
        raise SrvErr("other", "공개키 형식이 올바르지 않습니다")
    return key, pub


def hostspec(host, port):
    return host if port == 22 else "[%s]:%d" % (host, port)


def fingerprint(key):
    import base64, hashlib
    return "SHA256:" + base64.b64encode(hashlib.sha256(key.asbytes()).digest()).decode().rstrip("=")


def known_path():
    return conf_dir() / "known_hosts"   # the app's own trust store; the user's ~/.ssh/known_hosts and config are never read or written


def known_load():
    hk = pm_mod().HostKeys()
    try:
        hk.load(str(known_path()))
    except OSError:
        pass
    return hk


KNOWN_LOCK = __import__("threading").RLock()   # known_hosts is read-modify-write from several threads (jobs, forget-hostkey)


def known_save(hk):
    p = known_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_name(p.name + ".%d.tmp" % os.getpid())
    try:
        hk.save(str(tmp))
        try:
            os.chmod(tmp, 0o600)
        except OSError:
            pass
        pm_acl(tmp)
        replace_retry(tmp, p)
    except OSError as e:
        raise SrvErr("other", "서버 지문 기록(known_hosts)을 저장하지 못했습니다: %s" % e)
    finally:
        if tmp.exists():
            tmp.unlink()


def pm_neterr(e, host):
    """socket / paramiko exception -> SrvErr with the same wording ssh.exe printed (the UI hint regexes keep working)."""
    import socket as so
    paramiko = pm_mod()
    if isinstance(e, so.gaierror):
        return SrvErr("unreachable", "Could not resolve hostname %s" % host)
    if isinstance(e, ConnectionRefusedError):
        return SrvErr("unreachable", "Connection refused")
    if isinstance(e, (so.timeout, TimeoutError)):
        return SrvErr("unreachable", "Connection timed out")
    if isinstance(e, paramiko.SSHException) and re.search(r"timeout|timed out|banner|no existing session|eof", str(e), re.I):   # auth / banner time out
        return SrvErr("unreachable", "Connection timed out")
    if isinstance(e, paramiko.ssh_exception.NoValidConnectionsError):
        return SrvErr("unreachable", "Connection refused")
    if isinstance(e, OSError):
        return SrvErr("unreachable", "No route to host" if getattr(e, "errno", None) in (101, 113, 10051, 10065) else last(e) or type(e).__name__)
    return SrvErr("other", last(e) or type(e).__name__)


HOSTKEY_ALGS = {"ssh-rsa": ("rsa-sha2-512", "rsa-sha2-256", "ssh-rsa")}   # known_hosts records the key type; RSA is negotiated as rsa-sha2-*


def known_key_types(recorded, offered):
    """The host-key algorithms to offer for a server whose recorded key types are `recorded` (all offered when none match)."""
    want = {a for n in recorded for a in HOSTKEY_ALGS.get(n, (n,))}
    return [k for k in offered if k in want] or list(offered)


def pm_open(host, port, trust=None, reg=None):
    """A paramiko Transport whose host key is checked against the app's known_hosts. Unknown key: trust(fingerprint, keytype) -> bool decides
    (None = refuse). A key that differs from the recorded one is ALWAYS an error (host_key_changed). reg(obj) is told about the socket and the
    transport the moment they exist (a cancel can then close them; reg may raise to abort). Raises SrvErr."""
    import socket as so
    paramiko = pm_mod()
    spec, hk = hostspec(host, port), known_load()
    known = hk.lookup(spec)
    t = sock = None
    try:
        sock = so.create_connection((host, port), 10)
        reg and reg(sock)
        t = paramiko.Transport(sock)
        reg and reg(t)
        t.banner_timeout = 10
        if known:   # offer only the recorded key types: a different key then shows up as a mismatch, not as a negotiation failure
            t.get_security_options().key_types = known_key_types(known.keys(), t.get_security_options().key_types)
        t.start_client(timeout=10)
        k = t.get_remote_server_key()
        if known:
            if known.get(k.get_name()) != k:
                raise SrvErr("host_key_changed", "REMOTE HOST IDENTIFICATION HAS CHANGED: 서버의 호스트 키가 이 PC에 기록된 것과 다릅니다")
        else:
            if trust is None:
                raise SrvErr("other", "Host key verification failed: 처음 연결하는 서버입니다 — 키 등록하기로 서버 지문(%s)을 확인하세요" % fingerprint(k))
            if not trust(fingerprint(k), k.get_name()):
                raise SrvErr("cancelled", "서버 지문을 확인하지 않아 취소했습니다")
            with KNOWN_LOCK:
                hk = known_load()   # fresh: another job may have written meanwhile
                hk.add(spec, k.get_name(), k)
                known_save(hk)
            if not t.is_active():   # the user took long: sshd's LoginGraceTime dropped us. The key is trusted now: connect again
                t.close()
                return pm_open(host, port, None, reg)
        t.set_keepalive(15)
        return t
    except BaseException as e:
        for c in (t, sock):
            if c is not None:
                try:
                    c.close()
                except Exception:
                    pass
        if isinstance(e, SrvErr) or not isinstance(e, Exception):
            raise
        raise pm_neterr(e, host)


def pm_auth(t, user, key=None, password=None):
    """Authenticate; returns "key" or "password". Raises SrvErr wrong_password. Key first, then the password (keyboard-interactive when the
    server offers only that)."""
    paramiko = pm_mod()
    if key is not None:
        try:
            t.auth_publickey(user, key)
            return "key"
        except paramiko.AuthenticationException:
            pass
    if password is None:
        raise SrvErr("wrong_password", "Permission denied (publickey): 이 PC의 키로는 로그인되지 않습니다 — 비밀번호가 필요합니다")
    box = [password]   # the interactive handler reads it from here; emptied below so no closure keeps the password alive
    try:
        try:
            t.auth_password(user, password)
        except paramiko.BadAuthenticationType as e:
            if "keyboard-interactive" not in (e.allowed_types or []):
                raise
            t.auth_interactive(user, lambda title, instr, prompts: [box[0]] * len(prompts))
        return "password"
    except paramiko.AuthenticationException as e:
        if "timeout" in str(e).lower():   # paramiko reports a server that never answers as an AuthenticationException
            raise SrvErr("unreachable", "Connection timed out")
        raise SrvErr("wrong_password", "Permission denied (password)")
    finally:
        box[0] = None


def pm_exec(t, cmd, timeout=30, cap=1 << 16):
    """Run cmd on an open Transport: (exit status, stdout, stderr), each stream capped at `cap` bytes."""
    end = time.monotonic() + timeout
    ch = t.open_session(timeout=max(0.1, min(10, end - time.monotonic())))
    out, err = bytearray(), bytearray()
    try:
        ch.settimeout(max(0.1, end - time.monotonic()))
        ch.exec_command(cmd)
        while ch.recv_ready() or ch.recv_stderr_ready() or not (ch.eof_received or ch.closed):
            if time.monotonic() >= end:
                raise TimeoutError("원격 명령 시간이 초과되었습니다")
            ready = False
            for yes, recv, buf in ((ch.recv_ready, ch.recv, out), (ch.recv_stderr_ready, ch.recv_stderr, err)):
                if yes():
                    chunk = recv(min(4096, cap + 1 - len(buf)))
                    buf.extend(chunk)
                    ready = True
                    if len(buf) > cap:
                        raise ValueError("원격 명령 출력이 너무 깁니다")
            if not ready:
                time.sleep(min(0.01, max(0, end - time.monotonic())))
        status = getattr(ch, "status_event", None)
        if not ch.closed and status is not None and not status.wait(max(0, end - time.monotonic())):
            raise TimeoutError("원격 명령 시간이 초과되었습니다")
        if not ch.closed and status is None and not ch.exit_status_ready():
            raise TimeoutError("원격 명령 시간이 초과되었습니다")
        return ch.recv_exit_status(), out.decode("utf-8", "replace"), err.decode("utf-8", "replace")
    finally:
        ch.close()


def pm_pycheck(t, python):
    """(kind, text): 'ok' | 'no_python3' (too old, or the remote shell's 126/127) | 'other'."""
    rc, out, err = pm_exec(t, PYCHECK % (python or "python3"))
    out = pycheck_parse(out)
    if rc == 0 and out == "True":
        return "ok", err
    if out == "False":
        return "no_python3", "python 버전이 3.8 보다 낮습니다"
    if rc in (126, 127):
        return "no_python3", err
    return "other", err or "종료 코드 %s" % rc


def srv_job_pm(j, rq, save):
    """Thread body of one 서버 추가 job over paramiko (no console, no keyinstall process). States: connecting -> (confirm_hostkey) ->
    installing_key -> verifying -> done | error. The password is taken out of rq at once and dropped when the job ends. A cancel closes
    every socket / transport at once and is checked between all steps, so nothing is sent to the server after it."""
    pw, rq["password"] = rq.get("password"), None
    host, port, user = rq["host"], rq["port"], rq["user"]
    tps = []

    def closeall():
        for t in list(tps):
            try:
                t.close()
            except Exception:
                pass

    def chk():
        if j["cancel"]:
            raise SrvErr("cancelled", "")

    def reg(x):   # every socket / transport, the moment it exists
        tps.append(x)
        chk()
    j["close"] = closeall   # a cancel closes whatever is open

    def trust(fp, kt):   # an unknown server: wait for the user (token-protected POST /api/servers/job/confirm)
        jset(j, state="confirm_hostkey", fingerprint=fp, keytype=kt)
        j["ev"].clear()
        got = j["ev"].wait(KEYINSTALL_TIMEOUT)
        chk()
        if not got:
            raise SrvErr("cancelled", "3분 동안 확인이 없어 취소했습니다")
        jset(j, state="connecting")
        return j["accept"] is True
    t = None
    try:
        key, pub = app_key()
        jset(j, state="connecting")
        t = pm_open(host, port, trust, reg)
        chk()
        if rq["auth"] == "password-session":   # the server refuses our key: keep the password in memory for this run only
            pm_auth(t, user, None, pw or "")
            chk()
            jset(j, state="verifying")
            kind, err = pm_pycheck(t, rq["python"])
            if kind != "ok":
                raise SrvErr(kind, last(err) or kind)
            chk()
            SESSION_PW[(user, host, port)] = pw
            jset(j, auth="password-session")
        else:
            how = pm_auth(t, user, key, pw)
            chk()
            if how == "password":
                jset(j, state="installing_key")
                chk()   # the last point of no return: after this the key goes to the server
                rc, _, err = pm_exec(t, install_cmd(pub))
                if rc:
                    raise SrvErr("other", last(err) or "authorized_keys 에 쓰지 못했습니다 (종료 코드 %s)" % rc)
                t.close()
                chk()
                jset(j, state="verifying")
                t = pm_open(host, port, None, reg)   # a NEW connection with the key only: proves the install worked
                chk()
                try:
                    pm_auth(t, user, key, None)
                except SrvErr:
                    raise SrvErr("key_rejected", "키는 등록됐지만 키 로그인이 거절됐습니다 — 서버가 키 로그인을 막았거나 ~/.ssh 와 홈 디렉터리 권한(700/600)이 맞지 않습니다")
            else:
                jset(j, state="verifying")
            kind, err = pm_pycheck(t, rq["python"])
            if kind != "ok":
                raise SrvErr(kind, last(err) or kind)
        chk()
        jset(j, state="verifying")
        ch = save(rq)   # None when cancelled meanwhile
        if ch:
            jset(j, state="done", channel=ch)
    except SrvErr as e:
        jset(j, state="error", kind=e.args[0], message=(e.args[1] or "").replace(pw, "***") if pw else e.args[1])
    except Exception as e:   # paramiko / socket errors that escaped the mapping
        e = pm_neterr(e, host)
        jset(j, state="error", kind=e.args[0], message=(e.args[1] or "").replace(pw, "***") if pw else e.args[1])
    finally:
        closeall()
        tps.clear()   # no transport (and its auth handler) stays reachable from this thread's closures
        j["close"] = None
        t = pw = None


class PmProc:
    """A paramiko channel dressed as the Popen hub_chan expects: stdin / stdout / stderr, terminate()."""

    class _In:
        def __init__(self, ch):
            self.ch = ch

        def write(self, b):
            self.ch.sendall(b)

        def flush(self):
            pass

        def close(self):   # EOF: the remote collector exits (the same effect closing ssh's stdin had)
            try:
                self.ch.shutdown_write()
            except Exception:
                pass

    def __init__(self, t, ch):
        self.t, self.ch = t, ch
        self.stdin, self.stdout, self.stderr = self._In(ch), ch.makefile("rb"), ch.makefile_stderr("rb")

    def terminate(self):
        for c in (self.ch, self.t):
            try:
                c.close()
            except Exception:
                pass

    kill = terminate

    def poll(self):
        return None if self.t.is_active() else 0


def pm_channel(ch):
    """Open the collector transport of an ssh channel entry; raises RuntimeError(message) (hub_chan shows the message)."""
    user, _, host = str(ch["ssh"]).rpartition("@")
    port = int(chan_port(ch))
    t = None
    try:
        pw = SESSION_PW.get((user, host, port)) if ch.get("auth") == "password-session" else None
        if ch.get("auth") == "password-session" and pw is None:   # before connecting: a handshake per backoff would only fill the server's sshd log
            raise SrvErr("wrong_password", "Permission denied: 이 서버는 이번 실행에서 비밀번호로 연결해야 합니다 — 다시 연결하세요")
        t = pm_open(host, port, None)   # channels never prompt: unknown / changed keys are errors, fixed through the dialog
        paramiko = pm_mod()
        if ch.get("auth") == "password-session":
            pm_auth(t, user, None, pw)
        else:
            legacy = next((a[i + 1] for a in [ch.get("ssh_args")] if isinstance(a, list) for i in range(len(a) - 1) if a[i] == "-i"), None)
            key = None
            if legacy:
                for cls in (paramiko.Ed25519Key, paramiko.RSAKey, paramiko.ECDSAKey):
                    try:
                        key = cls.from_private_key_file(os.path.expanduser(legacy))
                        break
                    except Exception:
                        pass
            pm_auth(t, user, key or app_key()[0], None)
        c = t.open_session(timeout=10)
        c.exec_command('%s -I -c "%s"' % (ch.get("python", "python3"), BOOT))
        return PmProc(t, c)
    except BaseException as e:
        if t is not None:
            t.close()
        if isinstance(e, SrvErr):
            raise RuntimeError(e.args[1])
        if isinstance(e, Exception):
            raise RuntimeError(pm_neterr(e, host).args[1])
        raise


def hub_argv(ch):
    if ch["kind"] == "argv":
        return ch["argv"]
    a = list(ch.get("ssh_args") or [])
    if type(ch.get("port")) is int and ch["port"] != 22 and "-p" not in a:   # in-app-SSH channels keep port/auth as fields
        a += ["-p", str(ch["port"])]
    if ch.get("auth") == "appkey" and "-i" not in a:
        a += ["-i", str(conf_dir() / "id_ed25519"), "-o", "IdentitiesOnly=yes"]
    if ch.get("auth") in ("appkey", "password-session"):   # trusted through the app: OpenSSH must check the app's store, not ~/.ssh/known_hosts
        a += ["-o", "UserKnownHostsFile=" + str(known_path()), "-o", "StrictHostKeyChecking=yes"]
    return ([ssh_bin("ssh") or "ssh", "-T", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "-o", "ServerAliveInterval=15"]
            + a + ["--", ch["ssh"], ch.get("python", "python3"), "-I", "-c", '"%s"' % BOOT])  # -I: no cwd on sys.path


def unsupported_ssh_arg(ch):
    args = ch.get("ssh_args") if isinstance(ch.get("ssh_args"), list) else []
    i = 0
    while i < len(args):
        if args[i] in ("-i", "-p") and i + 1 < len(args):
            i += 2
        elif args[i] == "-o" and i + 1 < len(args) and args[i + 1].startswith("IdentitiesOnly="):
            i += 2
        elif args[i] == "-o" and i + 1 < len(args):
            return "-o " + args[i + 1]
        else:
            return args[i]
    return None


def drain_ssh_errors(stream, errors):
    channel = getattr(stream, "channel", None)
    pending = bytearray()
    while True:
        try:
            chunk = channel.recv_stderr(4096) if channel else os.read(stream.fileno(), 4096)
        except (OSError, ValueError):
            break
        if not chunk:
            break
        pending.extend(chunk)
        while b"\n" in pending:
            line, _, rest = pending.partition(b"\n")
            errors.append(line.decode("utf-8", "replace").strip())
            pending = bytearray(rest)
        if len(pending) >= 4096:
            errors.append(bytes(pending[:4096]).decode("utf-8", "replace").strip())
            pending.clear()
    if pending:
        errors.append(pending.decode("utf-8", "replace").strip())


def close_hub_proc(p):
    if isinstance(p, PmProc):
        p.terminate()
        return
    if p is None:
        return
    try:
        p.stdin.close()
    except (OSError, ValueError, AttributeError):
        pass
    if p.poll() is None:
        p.terminate()
        try:
            p.wait(timeout=1)
        except Exception:
            p.kill()
            p.wait()
    for f in (p.stdout, p.stderr):
        try:
            f.close()
        except (OSError, ValueError, AttributeError):
            pass


def kill_hub_proc(p):
    """Timeout path: kill first so a blocked buffered stdin write cannot hold close()."""
    try:
        if p.poll() is None:
            p.terminate()
            p.kill()
    except (OSError, AttributeError):
        pass


CSP = "default-src 'none'; frame-ancestors 'none'"   # JSON and everything that is not the page


def page_csp(body):
    """The page's CSP: its one inline script, by hash. A page with any other script gets script-src 'none': blank beats open."""
    import base64, logging
    body = body.replace(b"\r\n", b"\n").replace(b"\r", b"\n")
    m = re.findall(rb"<script>(.*?)</script>", body, re.S)
    if len(m) != 1 or body.count(b"<script") != 1:
        logging.getLogger("agen-talk").info("page has %d inline scripts, expected exactly one without attributes: serving script-src 'none'", body.count(b"<script"))
        src = "'none'"
    else:
        src = "'sha256-%s'" % base64.b64encode(hashlib.sha256(m[0]).digest()).decode()
    return ("default-src 'none'; script-src %s; style-src 'unsafe-inline'; img-src data:; connect-src 'self'; base-uri 'none'; form-action 'none'; "
            "frame-ancestors 'none'" % src)


def hub_host_ok(h):
    return re.fullmatch(r"(127\.0\.0\.1|localhost)(:[0-9]{1,5})?", h) is not None   # DNS-rebinding guard (no "127.0.0.1:1@evil" tricks)


def hub_read(p, sec, err):
    """One JSON line from a collector, login noise skipped. The watchdog closes a collector that stops answering."""
    import threading
    w = threading.Timer(sec, p.terminate)   # force-close a collector that ignores stdin EOF
    w.start()
    try:
        line = p.stdout.readline(1 << 20)
        while line and not line.startswith(b"{"):   # login-script noise
            if len(line) >= 1 << 20 and not line.endswith(b"\n"):
                raise ValueError("서버 응답 줄이 너무 깁니다")
            line = p.stdout.readline(1 << 20)
        if len(line) >= 1 << 20 and not line.endswith(b"\n"):   # a big fan-out can pass 1 MB: state lines may grow to 16 MB, noise may not
            line += p.stdout.readline((16 << 20) - len(line))
            if not line.endswith(b"\n"):
                raise ValueError("서버 응답 줄이 너무 깁니다")
    finally:
        w.cancel()
    if not line:
        raise EOFError(next((x for x in reversed(err) if x), "연결이 끊겼습니다"))
    return json.loads(line)


def hub_chan(ch, slot):
    """Thread body: keeps slot = {state, error, data, t} fresh and sends the talk request api/talk queues in slot["tq"]. Local = in-process collect(), else the argv transport."""
    import queue, subprocess, threading
    from collections import deque
    backoff, wake = 2, slot.setdefault("wake", threading.Event())   # wake: a patched channel reconnects now, not after the backoff
    tq = slot.setdefault("tq", queue.Queue(maxsize=1))
    while not slot.get("stop"):
        p, err = None, deque(maxlen=3)
        try:
            if ch["kind"] != "local":
                arg = unsupported_ssh_arg(ch) if ch["kind"] == "ssh" else None
                ssh = ssh_bin("ssh") if arg else None
                if arg and not ssh:
                    raise RuntimeError("SSH 옵션 %s 에는 OpenSSH가 필요합니다. OpenSSH가 설치되지 않았습니다" % arg)
                p = slot["p"] = (pm_channel(ch) if ch["kind"] == "ssh" and pm_mod() and not arg else
                                 subprocess.Popen(hub_argv(ch), **popen_kw(stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)))
                if p.stderr:
                    threading.Thread(target=drain_ssh_errors, args=(p.stderr, err), daemon=True).start()
                src = bundle("agen_talk.py").read_bytes()   # frozen: the bundled copy, never __file__
                p.stdin.write(b"%d\n" % len(src) + src)
                p.stdin.flush()
            while not slot.get("stop"):
                try:
                    job = tq.get_nowait()
                except queue.Empty:
                    job = None
                if job:   # a talk request goes out before the idle check and in turn with the polls: one writer per transport
                    wake.clear()
                    try:
                        if time.time() - job["t"] > 5:   # a late send must never happen
                            job["box"].update(outcome="unreachable", reason="channel")
                        elif p is None:
                            with COLLECT_LOCK:   # talk_req reads the same module state collect() rebuilds
                                job["box"].update(talk_req(json.dumps(job["req"]).encode()))
                        else:
                            timer = threading.Timer(45, kill_hub_proc, args=(p,))
                            timer.daemon = True
                            timer.start()
                            try:
                                p.stdin.write(json.dumps(job["req"]).encode() + b"\n")
                                p.stdin.flush()
                                rep = hub_read(p, 45, err)
                            finally:
                                timer.cancel()
                            if rep.get("re") != job["req"]["msg_id"]:
                                raise ValueError("톡 응답이 요청과 맞지 않습니다")   # the stream is out of step: reconnect
                            job["box"].update(rep)
                    finally:
                        job["ev"].set()
                    continue
                if time.time() - HUB_SEEN[0] > 30:
                    if wake.wait(1):
                        wake.clear()   # a set() that raced a job pickup must not leave the event set: every later wait would return at once
                    continue
                if p is None:   # collect() serialises on COLLECT_LOCK: several local channels are safe
                    data = collect()
                else:
                    p.stdin.write(b"\n")
                    p.stdin.flush()
                    data = hub_read(p, 20, err)
                slot.update(state="ok", error=None, data=data, t=time.time())
                backoff = 2
                if wake.wait(INTERVAL):   # a stop, a talk or a patched channel ends the wait early
                    wake.clear()   # jobs are re-checked with get_nowait() at the top, so clearing here cannot lose one
            close_hub_proc(p)
            p = slot["p"] = None
        except Exception as e:
            if slot.get("stop"):
                return
            if p and isinstance(e, OSError):   # the transport died before we wrote: its stderr says why
                time.sleep(0.3)
                e = next((x for x in reversed(err) if x), e)
            slot.update(state="error", error=str(e) or type(e).__name__)
            if p:
                close_hub_proc(p)
            if wake.wait(backoff):
                wake.clear()
                backoff = 2
            else:
                backoff = min(backoff * 2, 60)


def open_app(url, quiet=False):
    """Windows: Chrome / Edge app window (found via the App Paths registry), else print the URL (quiet: without it, the URL holds the secret)."""
    if WIN:
        import subprocess, winreg
        for exe in ("chrome.exe", "msedge.exe"):
            for root in (winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER):
                try:
                    with winreg.OpenKey(root, "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\" + exe) as k:
                        exe_path = os.path.expandvars(winreg.QueryValue(k, None).strip().strip('"'))   # may be quoted / %ProgramFiles%
                    if os.path.isfile(exe_path):   # stale entry: fall through to the next browser / the printed URL
                        subprocess.Popen([exe_path, "--app=" + url], **popen_kw())
                        return
                except OSError:
                    pass
    print("에겐 톡: 브라우저 창을 열지 못했습니다" if quiet else f"에겐 톡: 브라우저에서 {url} 를 여세요", flush=True)


def hub_running(port, secret=""):
    """True when something on 127.0.0.1:PORT answers /<secret>/api/channels like this hub (second launch just reopens the window)."""
    from urllib.request import ProxyHandler, build_opener
    try:   # no proxies: a corporate HTTP_PROXY would otherwise receive the loopback request (and the secret path)
        d = json.load(build_opener(ProxyHandler({})).open(f"http://127.0.0.1:{port}/{secret + '/' if secret else ''}api/channels", timeout=2))
        return isinstance(d, list) and all(isinstance(c, dict) and "state" in c for c in d)
    except (OSError, ValueError):
        return False


if getattr(sys, "frozen", False):
    APP_VERSION = bundle("VERSION").read_text(encoding="utf-8").strip()
else:
    APP_VERSION = "0.0.0-dev"   # source checkout; the frozen app reads build/VERSION (set from the git tag)
APP_INFO = {"version": APP_VERSION, "mode": "cli"}   # app.py sets mode to "webview" / "browser"; GET /api/app serves it


EXAMPLE_CONF = {"port": 8765, "presets": [], "channels": [{"id": "pc", "name": "내 PC", "kind": "local"}]}


def hub_start(cfg=None, port=None, secret="", on_show=None, token=None, fallback=True):
    """Start the hub (HTTP server + one thread per channel) and return (server, url, stop).
    The caller runs server.serve_forever(); stop() ends the channel threads, closes every ssh transport's stdin (the remote
    collectors exit), kills a keyinstall in progress and shuts the server down. server.token / server.secret are set.
    secret: page and API live ONLY under /<secret>/ (anything else is 404); "" = no prefix (the `hub --insecure` CLI of the old layout).
    cfg: channels.json path; None = default_cfg(), created with only the local channel when missing. port None = the file's port, else any free one."""
    import hmac, http.server, logging, queue, secrets, threading
    from collections import deque
    from urllib.parse import urlparse, parse_qs
    explicit = cfg is not None
    cfg = Path(cfg) if explicit else default_cfg()
    try:
        conf = json.loads(cfg.read_text(encoding="utf-8-sig"))   # -sig: Notepad's BOM
    except FileNotFoundError:
        conf = json.loads(json.dumps(EXAMPLE_CONF))
        if explicit:
            print(f"에겐 톡: {cfg} 가 없어 내 PC 만 보여줍니다", file=sys.stderr)
        else:
            try:
                write_conf(cfg, conf)   # first run of the installed app: a starter file in the config folder
            except SrvErr as e:
                print(f"에겐 톡: {e.args[1]}", file=sys.stderr)
    except (OSError, ValueError) as e:
        sys.exit(f"channels.json 오류: {e} — 메모장 등으로 고친 뒤 다시 실행하세요")
    cport = conf.get("port", 8765) if isinstance(conf, dict) else None
    if not isinstance(conf, dict) or not isinstance(conf.get("channels", []), list) or type(cport) is not int or not 0 < cport < 65536:
        sys.exit('channels.json 오류: 최상위는 {"port": 1~65535 숫자, "channels": [...]} 형태여야 합니다 — 메모장 등으로 고친 뒤 다시 실행하세요')
    presets, bad = presets_check(conf.get("presets"))   # optional server list for the first-run UI; saved back untouched by save()
    for b in bad:
        print(f"에겐 톡: 서버 목록(presets) 항목 건너뜀 {b}", file=sys.stderr, flush=True)
    chans, slots = [], {}
    for ch in conf.get("channels", []):
        ok = isinstance(ch, dict) and (re.fullmatch(r"[a-z0-9_-]+", str(ch.get("id"))) and ch["id"] not in slots and (
            ch.get("kind") == "local" or ch.get("kind") == "ssh" and ch.get("ssh")
            or ch.get("kind") == "argv" and isinstance(ch.get("argv"), list)))
        if not ok:
            print(f"에겐 톡: 채널 건너뜀 {ch}", file=sys.stderr)
            continue
        slots[ch["id"]] = {"state": "connecting", "error": None, "data": None, "t": None, "wake": threading.Event()}
        chans.append(ch)
    if not secret:   # `hub --insecure`: every account on this machine can read the page and the agents' text
        if any(c["kind"] != "local" for c in chans):
            raise SystemExit("에겐 톡: --insecure 는 다른 서버(ssh/argv 채널)와 함께 쓸 수 없습니다 — 그 서버들의 에이전트 내용까지 이 컴퓨터의 모든 계정에 공개됩니다")
        print("에겐 톡: 경고 — --insecure: 이 컴퓨터의 모든 계정이 내 에이전트의 프롬프트·명령·경로를 읽을 수 있습니다 (읽기 전용)", file=sys.stderr)
    token = token or secrets.token_urlsafe(24)   # per hub start; the page gets it in <meta name="at-token">, POSTs must send it back
    lock, jobs = threading.Lock(), [None]   # jobs[0]: the one 서버 추가 job (running or last)
    tk, talk_lock = {"on": conf.get("talk") is not False, "dup": {}, "last": {}, "win": deque()}, threading.Lock()   # the talk switch (channels.json "talk") and the rate limits
    page = bundle("index.html")
    prefix = "/" + secret if secret else ""
    sess = {"cookie": None}   # the page's session cookie (see session_ok); one per launch

    def save(rq, j):
        """channels.json (re-read; atomic write) + the live channel, for a verified job; None when cancelled meanwhile."""
        with lock:
            if j["cancel"]:
                return None
            cur = read_cur()
            ent = chan_upsert(cur, rq, slots)
            write_conf(cfg, cur)
            live = next((c for c in chans if c["id"] == ent["id"]), None)
            if live is None:
                slots[ent["id"]] = {"state": "connecting", "error": None, "data": None, "t": None, "wake": threading.Event()}
                chans.append(dict(ent))
                threading.Thread(target=hub_chan, args=(chans[-1], slots[ent["id"]]), daemon=True).start()
            else:   # patched in place: reconnect now with the new args
                live.update({k: ent[k] for k in ("ssh", "ssh_args", "python", "port", "auth") if k in ent})
                if "ssh_args" not in ent:
                    live.pop("ssh_args", None)
                slots[ent["id"]]["wake"].set()
                try:
                    slots[ent["id"]]["p"].stdin.close()
                except (KeyError, AttributeError, OSError, ValueError):
                    pass
            return {"id": ent["id"], "name": ent.get("name", ent["id"])}

    def read_cur():
        """The file as it is now (the hub's own conf when it is missing); raises SrvErr when unreadable."""
        try:
            cur = json.loads(cfg.read_text(encoding="utf-8-sig"))
        except FileNotFoundError:
            cur = json.loads(json.dumps(conf))
        except ValueError as e:
            raise SrvErr("other", "channels.json 을 읽을 수 없습니다: %s" % e)
        if not isinstance(cur, dict) or not isinstance(cur.get("channels", []), list):
            raise SrvErr("other", "channels.json 형식이 올바르지 않습니다")
        return cur

    def talk_post(d):
        """POST api/talk {ch, id, text, client_id} -> (http code, body). TALK-ENG 2.5: one send at a time, never a retry."""
        d = d if isinstance(d, dict) else {}
        ch, tid, text, cid = d.get("ch"), d.get("id"), d.get("text"), d.get("client_id")
        if not (isinstance(ch, str) and ch in slots and isinstance(tid, str) and 0 < len(tid) <= 200 and isinstance(text, str)
                and isinstance(cid, str) and re.fullmatch(r"[A-Za-z0-9_-]{1,64}", cid)):
            return 400, {"error": "입력이 올바르지 않습니다"}
        HUB_SEEN[0] = time.time()
        text = text.replace("\r", "").rstrip()
        mid = "at-" + secrets.token_hex(4)
        out = {"msg_id": mid, "ts": time.time(), "client_id": cid}
        if not text or len(text) > TALK_MAX or CTRL.search(text):
            return 200, dict(out, outcome="refused", reason="empty" if not text else "too-long" if len(text) > TALK_MAX else "bad-text")

        def done(outcome, reason=None, detail=None, tool="-", code=200, **kw):
            logging.getLogger("agen-talk").info("talk ch=%s tool=%s target=%s len=%d msg_id=%s outcome=%s reason=%s", ch, tool, tid, len(text), mid, outcome, reason)
            return code, dict(out, outcome=outcome, **dict({k: v for k, v in (("reason", reason), ("detail", detail)) if v}, **kw))

        if not tk["on"]:
            return done("refused", "off")
        sl = slots[ch]
        if sl["state"] != "ok" or not sl["data"] or sl.get("tq") is None:
            return done("unreachable", "channel")
        agents = sl["data"].get("agents") or []
        root = next((r for r in agents if isinstance(r, dict) and r.get("id") == tid), None)
        if root is None:
            return done("refused", "subagent") if any(isinstance(k, dict) and k.get("id") == tid for r in agents for k in claude_walk(r.get("kids") or ())) else done("unreachable", "gone")
        cap, tool = root.get("talk") or {}, root.get("tool")
        if not cap.get("ok") or tool not in ("claude", "codex"):
            return done("refused", cap.get("reason") or "unsupported", tool=tool)
        if not talk_lock.acquire(False):   # one send at a time, hub-wide
            return done("refused", "busy", tool=tool)
        try:
            now, key = time.time(), (ch, tid, hashlib.sha1(text.encode("utf-8")).digest())
            tk["dup"] = {k: t for k, t in tk["dup"].items() if now - t <= 10}
            while tk["win"] and now - tk["win"][0] > 600:
                tk["win"].popleft()
            if key in tk["dup"]:   # a double click; the receiver dedups the rest
                return done("refused", "duplicate", tool=tool)
            wait = max(3 - (now - tk["last"].get((ch, tid), 0)), tk["win"][0] + 600 - now if len(tk["win"]) >= 20 else 0)   # per target 3 s, hub-wide 20 per 10 min
            if wait > 0:
                return done("refused", "rate", tool=tool, code=429, retry_after=int(wait) + 1)
            by = (re.sub(r"[^A-Za-z0-9._-]", "", getpass.getuser())[:32] or "user") + "@" + PC[:64]   # the page never says who it is
            job = {"req": {"op": "talk", "msg_id": mid, "id": tid, "tool": tool, "text": text, "by": by}, "ev": threading.Event(), "box": {"outcome": "unknown"}, "t": now}
            if not talk_enqueue(sl, job, tk, key, (ch, tid), now):
                return done("refused", "busy", tool=tool)
            sl["wake"].set()
            job["ev"].wait(50)
            box = dict(job["box"])
        finally:
            talk_lock.release()
        return done(box.get("outcome") or "unknown", box.get("reason"), box.get("detail"), tool=tool)

    class Handler(http.server.BaseHTTPRequestHandler):
        timeout = 30   # a client that stalls mid-request frees its thread
        error_content_type = "text/plain"

        def log_message(self, *a):
            pass

        def send(self, code, body, ctype="application/json", extra=None, csp=CSP):
            if not isinstance(body, bytes):
                body = json.dumps(body, ensure_ascii=False).encode("utf-8", "replace")   # one bad string must not wedge an endpoint
            self.send_response(code)
            self.send_header("Content-Type", ctype + "; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Frame-Options", "DENY")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Content-Security-Policy", csp)
            for k, v in (extra or {}).items():
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(body)

        def sub(self):
            """The request path below /<secret> ('/', '/api/...'), or None when the secret is missing or wrong."""
            path = urlparse(self.path).path
            if not secret:
                return path
            parts = path.split("/", 2)   # ['', first segment, rest]
            if len(parts) < 2 or not hmac.compare_digest(parts[1].encode("utf-8", "replace"), secret.encode()):
                return None
            return "/" + (parts[2] if len(parts) > 2 else "")

        def session_ok(self):
            """The page's session cookie: minted on the first page load of this launch, then required everywhere, so the secret URL alone
            (seen in a process list, a shell history or a screenshot) is not a credential. No secret (`--insecure`) = read-only, no cookie."""
            if not secret:
                return True
            c = sess["cookie"]
            got = next((v for k, _, v in (x.strip().partition("=") for x in self.headers.get("Cookie", "").split(";")) if k == "at"), "")
            return bool(c) and hmac.compare_digest(got.encode("utf-8", "replace"), c.encode())

        def do_GET(self):
            if not hub_host_ok(self.headers.get("Host", "")):
                return self.send(403, {"error": "forbidden"})
            path = self.sub()
            if path is None:
                return self.send(404, {"error": "not found"})
            u = urlparse(self.path)
            if secret and u.path == prefix:   # relative URLs (api/...) need the trailing slash
                return self.send(301, b"", extra={"Location": prefix + "/"})
            if path in ("/", "/index.html"):
                extra = None
                if secret and not self.session_ok():
                    if sess["cookie"]:   # the URL was already used by the window: a copied URL gets nothing
                        return self.send(403, {"error": "이 주소는 이미 사용되었습니다 — 에겐 톡 창에서 여세요"})
                    sess["cookie"] = secrets.token_urlsafe(32)
                    extra = {"Set-Cookie": "at=%s; HttpOnly; SameSite=Strict; Path=%s/" % (sess["cookie"], prefix)}
                body = page.read_bytes().replace(b"__AT_TOKEN__", token.encode()).replace(b"\r\n", b"\n").replace(b"\r", b"\n")
                return self.send(200, body, "text/html", extra=extra, csp=page_csp(body))
            if not self.session_ok():
                return self.send(403, {"error": "forbidden"})
            if path.startswith("/api/"):
                HUB_SEEN[0] = time.time()
            if path == "/api/servers/job":   # read-only, no secrets: no token
                j = jobs[0]
                if not j or j["id"] != (parse_qs(u.query).get("id") or [""])[0]:
                    return self.send(404, {"error": "알 수 없는 작업"})
                return self.send(200, {k: v for k, v in dict(j).items() if k not in ("cancel", "proc", "ev", "accept", "close", "thread") and v not in (None, "")})
            if path == "/api/presets":
                return self.send(200, presets_view(presets, chans))
            if path == "/api/app":
                return self.send(200, dict(APP_INFO, logdir=str(state_dir()), talk_on=tk["on"], talk_max=TALK_MAX))
            if path == "/api/channels":
                return self.send(200, [{"id": c["id"], "name": c.get("name", c["id"]), "kind": c["kind"],
                                        "ssh": c.get("ssh"), "ssh_args": c.get("ssh_args", []), "port": c.get("port"), "auth": c.get("auth"),
                                        "state": slots[c["id"]]["state"], "error": slots[c["id"]]["error"],
                                        "t": slots[c["id"]]["t"]} for c in chans])
            if path == "/api/state":
                sl = slots.get((parse_qs(u.query).get("ch") or [""])[0])
                if sl is None:
                    return self.send(404, {"error": "알 수 없는 채널"})
                if sl["data"] is None:
                    return self.send(503, {"error": sl["error"] or "연결 중"})
                return self.send(200, sl["data"])   # after an error: the last data, /api/channels says it is stale
            self.send(404, {"error": "not found"})

        def do_POST(self):
            import subprocess
            h, port = self.headers, self.server.server_address[1]
            if not hub_host_ok(h.get("Host", "")):
                return self.send(403, {"error": "forbidden"})
            if not secret:   # `hub --insecure` (no secret): anyone on the box can reach it, so it is read-only
                return self.send(403, {"error": "forbidden"})
            path = self.sub()
            if path is None:
                return self.send(404, {"error": "not found"})   # wrong secret: nothing to learn, not even that the token exists
            if path != "/api/show" and not self.session_ok():   # show: a second launch proves itself with run.json's token alone
                return self.send(403, {"error": "forbidden"})
            talking = path in ("/api/talk", "/api/talk/setting")   # these must name their Origin: a missing one is not the page
            if (not hmac.compare_digest(h.get("X-AT-Token", "").encode(), token.encode())
                    or h.get("Origin", None if talking else "http://127.0.0.1:%d" % port) not in ("http://127.0.0.1:%d" % port, "http://localhost:%d" % port)):
                return self.send(403, {"error": "forbidden"})   # no CORS headers anywhere: other sites cannot even read the answer
            if h.get_content_type() != "application/json":
                return self.send(400, {"error": "application/json 만 받습니다"})
            try:
                n = int(h.get("Content-Length", ""))
            except ValueError:
                return self.send(400, {"error": "Content-Length 가 필요합니다"})
            lim = 65536 if path == "/api/presets/import" else 32768 if path == "/api/talk" else 4096
            if not 0 <= n <= lim:
                return self.send(413 if n > lim else 400, {"error": "본문이 너무 큽니다"})
            try:
                d = json.loads(self.rfile.read(n))
            except ValueError:
                return self.send(400, {"error": "json 이 올바르지 않습니다"})
            ids = {c["id"]: c.get("python") for c in chans if c["kind"] == "ssh"}
            try:
                if path == "/api/show":
                    if APP_INFO.get("mode") in ("browser", "cli"):   # no native window: the reopened browser window must be able to load the page again
                        sess["cookie"] = None
                    if on_show:
                        threading.Thread(target=on_show, daemon=True).start()
                    return self.send(200, {"ok": True})
                if path == "/api/open-logdir":
                    if WIN:
                        state_dir().mkdir(parents=True, exist_ok=True)
                        os.startfile(str(state_dir()))
                    return self.send(200, {"ok": True})
                if path == "/api/talk":
                    return self.send(*talk_post(d))
                if path == "/api/talk/setting":
                    if not isinstance(d, dict) or type(d.get("on")) is not bool:
                        return self.send(400, {"error": "입력이 올바르지 않습니다"})
                    try:
                        with lock:
                            cur = read_cur()
                            cur["talk"] = d["on"]
                            write_conf(cfg, cur)
                            tk["on"] = d["on"]
                    except SrvErr as e:
                        return self.send(500, {"error": e.args[1]})
                    return self.send(200, {"on": tk["on"]})
                if path == "/api/presets/import":
                    new, bad = presets_check(d.get("presets") if isinstance(d, dict) else d)
                    for b in bad:
                        print(f"에겐 톡: 가져온 서버 목록 항목 건너뜀 {b}", file=sys.stderr, flush=True)
                    try:
                        with lock:
                            cur = read_cur()
                            old = presets_check(cur.get("presets"))[0]
                            stats = {}
                            merged = presets_merge(old, new, stats=stats)
                            cur["presets"] = merged
                            write_conf(cfg, cur)
                            presets[:] = merged
                    except SrvErr as e:
                        return self.send(500, {"error": e.args[1]})
                    return self.send(200, dict(stats, presets=presets_view(presets, chans), invalid=len(bad)))
                if path == "/api/servers":
                    rq = srv_check(d, ids)
                    if isinstance(d, dict):
                        d["password"] = None   # the parsed body must not keep it either
                    old = next((c for c in chans if c["id"] == rq.get("id")), None)
                    xarg = unsupported_ssh_arg(old) if old and old.get("kind") == "ssh" else None
                    if xarg:   # setup connects directly; a channel that needs e.g. ProxyJump would fail as 'unreachable' and lose its trust store
                        return self.send(400, {"error": "이 서버는 channels.json 의 ssh_args (%s) 로 연결합니다 — 앱의 서버 추가로는 다시 등록할 수 없으니 channels.json 에서 고치세요" % xarg[:60]})
                    pmod = pm_mod() is not None
                    rq["pm"] = pmod
                    if not pmod:
                        rq["password"] = None   # the OpenSSH fallback asks in its own console; this process never keeps a password
                    with lock:
                        if jobs[0] and (jobs[0]["state"] not in ("done", "error") or jobs[0].get("thread") and jobs[0]["thread"].is_alive()):
                            return self.send(409, {"error": "busy"})   # a cancelled job's thread may still be unwinding
                        st0 = "connecting" if pmod else "keygen"
                        key_ = str(known_path().parent / "id_ed25519.pub") if pmod else str(KEY) + ".pub"
                        j = jobs[0] = {"id": secrets.token_hex(8), "state": st0, "phase": st0, "kind": None, "message": None, "channel": None, "log": "",
                                       "cancel": False, "proc": None, "key": key_, "comment": "agen-talk@" + PC,
                                       "ev": threading.Event(), "accept": None, "close": None,
                                       "window_title": "에겐 톡 — %s (%s@%s)" % (rq["name"] or rq["host"], rq["user"], rq["host"])}
                        j["thread"] = threading.Thread(target=srv_job_pm if pmod else srv_job, args=(j, rq, lambda rq: save(rq, j)), daemon=True)
                        j["thread"].start()
                    return self.send(202, {"job": j["id"]})
                if path == "/api/servers/job/confirm":   # the user's answer to an unknown server's fingerprint (token-protected like every POST)
                    with lock:
                        j = jobs[0]
                        if not j or not isinstance(d, dict) or j["id"] != d.get("id"):
                            return self.send(404, {"error": "알 수 없는 작업"})
                        if j["state"] != "confirm_hostkey":
                            return self.send(409, {"error": "확인할 서버 지문이 없습니다"})
                        j["accept"] = d.get("accept") is True
                        j["ev"].set()
                    return self.send(200, {"ok": True})
                if path == "/api/servers/job/cancel":
                    with lock:
                        j = jobs[0]
                        if not j or not isinstance(d, dict) or j["id"] != d.get("id"):
                            return self.send(404, {"error": "알 수 없는 작업"})
                        if j["state"] not in ("done", "error"):
                            j.update(cancel=True, state="error", kind="cancelled", message=None)
                            if j.get("ev"):
                                j["ev"].set()
                    if j.get("close"):
                        j["close"]()   # a cancelled job closes its transport
                    if j["proc"] and j["proc"].poll() is None:
                        kill_tree(j["proc"])
                    if j.get("thread"):
                        j["thread"].join(5)   # answer only once the job thread is gone: then nothing it does can happen after the 200
                    return self.send(200, {"ok": True})
                if path == "/api/servers/forget-hostkey":
                    d = d if isinstance(d, dict) else {}
                    rq = srv_check({"host": d.get("host"), "port": d.get("port"), "user": "x"}, {})
                    if pm_mod():   # the app's own trust store
                        with KNOWN_LOCK:
                            hk = known_load()
                            spec = hostspec(rq["host"], rq["port"])
                            had = bool(hk.lookup(spec))
                            if had:
                                del hk[spec]
                                known_save(hk)
                        return self.send(200, {"ok": had})
                    try:   # explicit -f: ssh-keygen would otherwise use the passwd home, not this user's profile
                        r = subprocess.run([ssh_bin("ssh-keygen"), "-R", rq["host"] if rq["port"] == 22 else "[%s]:%d" % (rq["host"], rq["port"]),
                                            "-f", str(HOME / ".ssh" / "known_hosts")], **popen_kw(stdin=subprocess.DEVNULL, capture_output=True, timeout=30))
                        return self.send(200, {"ok": r.returncode == 0})
                    except (OSError, TypeError, subprocess.TimeoutExpired):
                        return self.send(200, {"ok": False})
            except ValueError as e:
                return self.send(400, {"error": "입력이 올바르지 않습니다", "field": str(e)})
            except (SrvErr, OSError) as e:   # a file the hub could not write: answer with a reason, never a dropped connection
                return self.send(500, {"error": e.args[1] if isinstance(e, SrvErr) and len(e.args) > 1 else str(e)})
            self.send(404, {"error": "not found"})

    class Server(http.server.ThreadingHTTPServer):
        allow_reuse_address = not WIN   # on Windows SO_REUSEADDR lets a second process bind the same port
        daemon_threads = True

    want = cport if port is None else port
    try:
        srv = Server(("127.0.0.1", want), Handler)
    except OSError:
        if not fallback:
            raise
        srv = None
        for alt in range(want + 1, min(want + 10, 65536)) if want else ():   # the page's storage (settings, read marks, talks) is per port: stay close and stable
            try:
                srv = Server(("127.0.0.1", alt), Handler)
                break
            except OSError:
                pass
        srv = srv or Server(("127.0.0.1", 0), Handler)   # the whole range is taken: any free one
    srv.token, srv.secret, srv.cfg = token, secret, cfg
    for ch in chans:   # only after the bind: a failed launch must not leave ssh children behind
        threading.Thread(target=hub_chan, args=(ch, slots[ch["id"]]), daemon=True).start()
    url = f"http://127.0.0.1:{srv.server_address[1]}{prefix}/"

    def stop():
        for sl in list(slots.values()):
            sl["stop"] = True
            sl["wake"].set()
            p = sl.get("p")
            if p is not None:   # closing stdin ends the remote collector; terminate covers a transport stuck before that
                for f in (lambda: p.stdin.close(), lambda: p.terminate()):
                    try:
                        f()
                    except (OSError, ValueError):
                        pass
        j = jobs[0]
        if j and j.get("close"):
            j["cancel"] = True
            j["ev"].set()
            j["close"]()
        if j and j.get("proc") is not None and j["proc"].poll() is None:
            j["cancel"] = True
            kill_tree(j["proc"])
        srv.shutdown()
        srv.server_close()
    return srv, url, stop


def hub(args):
    """CLI: hub [FILE] [--insecure]. Without --insecure the page and API live under a random /<secret>/ (printed in the URL);
    --insecure = no secret, root paths (tests, a shared Linux box: every user of the box can read it)."""
    insecure = "--insecure" in args
    args = [a for a in args if a != "--insecure"]
    import secrets
    try:
        srv, url, stop = hub_start(args[0] if args else None, secret="" if insecure else secrets.token_urlsafe(18), fallback=False)
    except OSError as e:
        try:
            port = json.loads(Path(args[0] if args else default_cfg()).read_text(encoding="utf-8-sig")).get("port", 8765)
        except (OSError, ValueError, AttributeError):
            port = 8765
        if insecure and hub_running(port):   # double launch: just show the window (a secret hub cannot be probed from outside)
            print(f"에겐 톡: 이미 실행 중입니다 http://127.0.0.1:{port}/", flush=True)
            open_app(f"http://127.0.0.1:{port}/")
            sys.exit(0)
        sys.exit(f"에겐 톡: 포트 {port} 를 열 수 없습니다 ({e}) — 다른 프로그램이 쓰고 있으면 channels.json 의 port 를 바꾸세요")
    print(f"에겐 톡: {url} (Ctrl-C 로 끝냄)", flush=True)
    open_app(url)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        stop()


def selftest_project():
    """git_project: plain repo, worktree (gitdir file + commondir), detached HEAD, no remote, credential-free keys; cached per cwd."""
    import tempfile
    global NOW
    NOW = time.time()
    assert git_remote_key("https://user:pw@example.com:443/Ben-JWL/agen_talk.git") == "example.com/ben-jwl/agen_talk"
    assert git_remote_key("git@example.com:Ben-JWL/agen_talk.git") == "example.com/ben-jwl/agen_talk"
    assert git_remote_key("ssh://git@example.org:2222/team/proj.git") == "example.org/team/proj"
    assert git_remote_key("C:/local/repo") is None and git_remote_key("") is None and git_remote_key("/srv/git/x.git") is None
    nl = chr(10)
    with tempfile.TemporaryDirectory() as d:
        r = Path(d) / "repo"
        (r / ".git").mkdir(parents=True)
        (r / ".git" / "HEAD").write_text("ref: refs/heads/feat/x" + nl, encoding="utf-8")
        (r / ".git" / "config").write_text(nl.join(["[core]", "    bare = false", '[remote "origin"]', "    url = https://tok:secret@example.com/acme/widget.git", ""]), encoding="utf-8")
        (r / "src" / "deep").mkdir(parents=True)
        p_ = git_project(str(r / "src" / "deep"))
        assert p_ and p_["name"] == "widget" and p_["branch"] == "feat/x" and p_["key"] == "example.com/acme/widget" and "secret" not in json.dumps(p_), p_
        w = Path(d) / "wt"   # a worktree: .git is a file pointing into the main repo's worktrees/<name>, which names its commondir
        (r / ".git" / "worktrees" / "wt").mkdir(parents=True)
        (r / ".git" / "worktrees" / "wt" / "HEAD").write_text("0123456789abcdef0123456789abcdef01234567" + nl, encoding="utf-8")
        (r / ".git" / "worktrees" / "wt" / "commondir").write_text("../.." + nl, encoding="utf-8")
        w.mkdir()
        (w / ".git").write_text("gitdir: %s%s" % (r / ".git" / "worktrees" / "wt", nl), encoding="utf-8")
        pw = git_project(str(w))
        assert pw and pw["name"] == "widget" and pw["branch"] == "@0123456" and pw["key"] == p_["key"], pw
        n = Path(d) / "plain"
        (n / ".git").mkdir(parents=True)
        (n / ".git" / "HEAD").write_text("ref: refs/heads/main" + nl, encoding="utf-8")
        pn = git_project(str(n))
        assert pn["name"] == "plain" and pn["key"].startswith("local:") and pn["branch"] == "main", pn
        assert git_project(str(Path(d))) is None and git_project("") is None
        (r / ".git" / "HEAD").write_text("ref: refs/heads/other" + nl, encoding="utf-8")
        assert git_project(str(r / "src" / "deep"))["branch"] == "feat/x", "cached for the TTL"
    kid = {"id": "k", "kids": []}
    root = {"id": "r", "project": {"name": "a"}, "kids": [kid, {"id": "o", "project": {"name": "b"}, "kids": []}]}
    project_fill([root])
    assert kid["project"]["name"] == "a" and root["kids"][1]["project"]["name"] == "b"
    print("project ok")


def selftest_srv():
    ic = install_cmd("ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIabc agen-talk@PC")   # restricted line; the duplicate check matches the key, with or without options
    assert "echo '%s ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIabc agen-talk@PC'" % AUTH_OPTS in ic and "grep -qF 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIabc'" in ic
    # the python check reads only its tagged line: a login banner from ~/.bashrc must not fail the server
    assert pycheck_parse("(base) conda ready\nAT-PY True\n") == "True" and pycheck_parse("AT-PY False") == "False" and pycheck_parse("True") == ""
    ids = {"s1": "python", "pc": None}
    ok = srv_check({"host": "gpu-1.example.com", "user": "alice", "port": 2222, "name": " a\x1b b ", "python": "python3.11"}, ids)
    assert ok == {"host": "gpu-1.example.com", "user": "alice", "port": 2222, "name": "a b", "id": None, "python": "python3.11", "password": None, "auth": "appkey"}
    assert srv_check({"host": "203.0.113.1", "user": "u", "id": "s1"}, ids)["python"] == "python" and srv_check({"host": "h", "user": "u"}, ids)["port"] == 22
    for bad in ({"host": "h", "user": "-oProxyCommand=x"}, {"host": "-oProxyCommand=x", "user": "u"}, {"host": "a b", "user": "u"}, {"host": "h\n", "user": "u"},
                {"host": "h", "user": "u\n"}, {"host": "a" * 254, "user": "u"}, {"host": "h", "user": "u", "port": 0}, {"host": "h", "user": "u", "port": 65536},
                {"host": "h", "user": "u", "port": "22"}, {"host": "h", "user": "u", "port": True}, {"host": "h", "user": "u", "name": "x" * 41},
                {"host": "h", "user": "u", "name": 5}, {"host": "h", "user": "u", "id": "nope"}, {"host": "h", "user": "u", "id": ["s1"]},
                {"host": "h", "user": "u", "python": "py;rm"}, {"host": "h", "user": "u", "python": "x" * 65}, {"host": "", "user": "u"}, [], None):
        try:
            srv_check(bad, ids)
        except ValueError:
            continue
        raise AssertionError(bad)
    k = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIabc+/= agen-talk@PC-1.x"
    assert re.fullmatch(PUBKEY, k) and re.fullmatch(PUBKEY, k.split(" agent")[0])
    assert not any(re.fullmatch(PUBKEY, x) for x in (k + "'", k + "\n", "ssh-rsa AAAA", k + " x y", k.replace("AAAA", "A'A")))
    E = {"host_key_changed": ("@@@ WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED! @@@\nHost key verification failed.", "Host key verification failed."),
         "wrong_password": ("u@h: Permission denied (publickey,password).",), "unreachable": ("ssh: Could not resolve hostname x", "connect to host h port 22: Connection refused",
         "Connection timed out", "No route to host"), "other": ("", "Welcome", "kex_exchange_identification: read: Connection reset")}
    assert all(ssh_kind(t) == kind for kind, ts in E.items() for t in ts), E
    assert last("a\n\nb \x1b[2J\n\n") == "b [2J" and chan_args(["-p", "1", "-i", "x.pem", "-o", "IdentitiesOnly=no", "-v"], 22) == ["-v", "-i", str(KEY), "-o", "IdentitiesOnly=yes"]
    assert chan_args(chan_args(None, 2222), 2222) == ["-i", str(KEY), "-o", "IdentitiesOnly=yes", "-p", "2222"] and chan_args(["-o"], 22)[0] == "-o"
    conf = {"port": 9, "x": 1, "channels": [{"id": "s1", "kind": "ssh", "ssh": "u@h", "ssh_args": ["-v"], "name": "S"}, {"id": "pc", "kind": "local"}]}
    r1 = {"host": "h", "user": "u", "port": 22, "name": "", "id": None, "python": None}
    e1 = chan_upsert(conf, r1, set())   # same target: patched, no duplicate
    assert e1["id"] == "s1" and len(conf["channels"]) == 2 and e1["ssh_args"][:1] == ["-v"] and "IdentitiesOnly=yes" in e1["ssh_args"] and conf["x"] == 1
    e2 = chan_upsert(conf, dict(r1, host="Gpu.1", id=None), {"gpu-1"})
    assert e2 == {"id": "gpu-1-2", "name": "Gpu.1", "kind": "ssh", "ssh": "u@Gpu.1", "ssh_args": ["-i", str(KEY), "-o", "IdentitiesOnly=yes"]} and len(conf["channels"]) == 3
    e3 = chan_upsert(conf, dict(r1, host="other", id="pc"), set())   # an id that is not ssh is not patched: new entry
    assert e3["id"] == "other" and conf["channels"][1] == {"id": "pc", "kind": "local"}
    assert chan_upsert(conf, dict(r1, id="s1", port=2222, python="python"), set())["python"] == "python"
    pr, bad = presets_check([{"name": "서버 A", "host": "203.0.113.2"}, {"host": "gpu", "port": 2222, "name": "g"}, {"host": "-bad"}, {"host": "h", "port": 0},
                             {"host": "h", "name": "x" * 41}, {"host": "h", "port": "22"}, "str", {"name": "no host"}, {"host": "ok.lab", "name": ""}])
    assert pr == [{"name": "서버 A", "host": "203.0.113.2", "port": 22}, {"name": "g", "host": "gpu", "port": 2222}] and len(bad) == 7 and presets_check(None) == ([], []) and presets_check("x")[1]
    ch = [{"kind": "ssh", "ssh": "u@gpu", "ssh_args": ["-p", "2222"]}, {"kind": "ssh", "ssh": "u@203.0.113.2", "ssh_args": ["-p", "2200"]}, {"kind": "local"}]
    assert [x["added"] for x in presets_view(pr, ch)] == [False, True]   # host matches but the port differs -> not added; default port 22
    assert presets_view(pr, ch + [{"kind": "ssh", "ssh": "203.0.113.2"}])[0]["added"]
    c2 = {"channels": []}   # same user@host, different ports = different servers; same port = the same channel
    ea, eb = (chan_upsert(c2, dict(r1, port=n), set()) for n in (2201, 2202))
    assert ea["id"] != eb["id"] and len(c2["channels"]) == 2 and chan_upsert(c2, dict(r1, port=2201), set()) is ea and len(c2["channels"]) == 2
    c3 = {"channels": [{"id": "Bad ID", "kind": "ssh", "ssh": "u@h"}, {"id": "x", "kind": "ssh", "ssh": "u@h", "ssh_args": "-p 22"}]}
    assert chan_upsert(c3, r1, set())["id"] == "x" and len(c3["channels"]) == 2 and chan_args("-p 22", 22)[:1] == ["-i"]   # skipped-at-start entries are never patched
    assert srv_check({"host": "h", "user": "u", "name": "a\ud800b"}, {})["name"] == "ab"


def selftest_pack():
    global WIN
    # every subprocess call goes through popen_kw (a window must never flash on Windows); read this very file
    try:
        src = Path(__file__).read_text(encoding="utf-8")
    except OSError:
        src = ""
    for m in re.finditer(r"subprocess\.(run|Popen|call|check_output|check_call)\(", src):
        i, d = m.end(), 1
        while d and i < len(src):
            d += (src[i] == "(") - (src[i] == ")")
            i += 1
        assert "popen_kw(" in src[m.end():i], "subprocess call without popen_kw: " + src[m.start():m.start() + 70]
    assert src.count("popen_kw(") >= 10 or not src
    old = WIN
    try:
        WIN = True
        assert popen_kw(timeout=3) == {"timeout": 3, "creationflags": 0x08000000} and popen_kw(console=True)["creationflags"] == 0x10
        assert popen_kw(inherit=True, stderr=1) == {"stderr": 1} and popen_kw(creationflags=0x200)["creationflags"] == 0x08000200
        WIN = False
        assert popen_kw(timeout=3) == {"timeout": 3}   # POSIX: untouched
    finally:
        WIN = old
    # frozen paths: sys._MEIPASS wins, else next to the source
    mei = getattr(sys, "_MEIPASS", None)   # the frozen app has a real one: put it back afterwards
    assert mei or bundle("x") == Path(__file__).resolve().parent / "x"
    sys._MEIPASS = "/opt/frozen"
    try:
        assert bundle("agen_talk.py") == Path("/opt/frozen/agen_talk.py")
    finally:
        if mei is None:
            del sys._MEIPASS
        else:
            sys._MEIPASS = mei
    # per-user folders (Windows layout vs the POSIX fallback)
    ea, el = os.environ.get("APPDATA"), os.environ.get("LOCALAPPDATA")
    os.environ.update(APPDATA="/r/Roaming", LOCALAPPDATA="/r/Local")
    try:
        assert conf_dir(True) == Path("/r/Roaming/AgenTalk") and state_dir(True) == Path("/r/Local/AgenTalk")
        assert conf_dir(False) == HOME / ".config/agen-talk" and state_dir(False) == HOME / ".local/state/agen-talk"
    finally:
        for k, v in (("APPDATA", ea), ("LOCALAPPDATA", el)):
            os.environ.pop(k, None) if v is None else os.environ.__setitem__(k, v)
    # presets merge: dedupe by host+port, first wins, order kept, capped
    a = [{"name": "a", "host": "h1", "port": 22}, {"name": "b", "host": "h2", "port": 22}]
    assert presets_merge(a, [{"name": "dup", "host": "h1", "port": 22}, {"name": "c", "host": "h1", "port": 2222}]) == a + [{"name": "c", "host": "h1", "port": 2222}]
    assert len(presets_merge([], [{"name": "n", "host": "h", "port": p} for p in range(1, 80)])) == 50
    import tempfile
    with tempfile.TemporaryDirectory() as t:   # atomic write: new file 0644, an existing file's mode kept, no temp file left
        f = Path(t) / "sub" / "c.json"
        write_conf(f, {"a": 1})
        assert json.loads(f.read_text(encoding="utf-8")) == {"a": 1} and (os.name == "nt" or f.stat().st_mode & 0o777 == 0o600)   # new channels.json: owner only
        os.chmod(f, 0o664)
        write_conf(f, {"a": 2})
        assert (os.name == "nt" or f.stat().st_mode & 0o777 == 0o664) and [x.name for x in f.parent.iterdir()] == ["c.json"]


def selftest_pm():
    global WIN, conf_dir, pm_acl, pm_open
    # pure parts (no paramiko): in-app-SSH channel entries and requests
    rq = {"host": "example.com", "user": "alice", "port": 2200, "name": "", "id": None, "python": None, "password": "x", "auth": "appkey", "pm": True}
    c = {"channels": [{"id": "old", "kind": "ssh", "ssh": "alice@example.com", "ssh_args": ["-v", "-i", "k.pem", "-p", "2200", "-o", "IdentitiesOnly=yes"]}]}
    e = chan_upsert(c, rq, set())   # a legacy OpenSSH channel is migrated: port/auth become fields, our -i/-p go, other args stay
    assert e["id"] == "old" and e["port"] == 2200 and e["auth"] == "appkey" and e["ssh_args"] == ["-v"] and "password" not in json.dumps(c)
    e = chan_upsert(c, dict(rq, port=22), set())   # another port = another server
    assert e["id"] == "example-com" and e["port"] == 22 and "ssh_args" not in e and chan_port(e) == "22" and chan_port(c["channels"][0]) == "2200"
    assert srv_check({"host": "h", "user": "u", "password": "p" * 256, "auth": "password-session"}, {})["auth"] == "password-session"
    for bad in ({"password": "p" * 257}, {"password": 5}, {"auth": "x"}):
        try:
            srv_check(dict({"host": "h", "user": "u"}, **bad), {})
        except ValueError:
            continue
        raise AssertionError(bad)
    assert unsupported_ssh_arg({"ssh_args": chan_args(None, 22)}) is None
    assert unsupported_ssh_arg({"ssh_args": ["-i", "k", "-p", "22", "-o", "IdentitiesOnly=no"]}) is None
    assert unsupported_ssh_arg({"ssh_args": ["-o", "ProxyJump=bastion"]}) == "-o ProxyJump=bastion"
    assert unsupported_ssh_arg({"ssh_args": ["-v"]}) == "-v"
    import os, subprocess, threading
    from collections import deque
    old_ssh_bin = ssh_bin
    try:
        globals()["ssh_bin"] = lambda name: None
        slot = {"state": "connecting", "error": None, "stop": False, "wake": threading.Event()}
        worker = threading.Thread(target=hub_chan, args=({"kind": "ssh", "ssh": "u@h", "ssh_args": ["-o", "ProxyJump=bastion"]}, slot))
        worker.start()
        end = time.time() + 2
        while slot["state"] != "error" and time.time() < end:
            time.sleep(0.01)
        assert slot["state"] == "error"
        slot["stop"] = True; slot["wake"].set(); worker.join(2)
        assert "SSH 옵션 -o ProxyJump=bastion" in slot["error"] and not worker.is_alive()
    finally:
        globals()["ssh_bin"] = old_ssh_bin
    rd, wr = os.pipe()
    errors = deque(maxlen=3)
    stream = os.fdopen(rd, "rb")
    worker = threading.Thread(target=drain_ssh_errors, args=(stream, errors))
    worker.start()
    os.write(wr, b"line\n" * 10000 + b"x" * 100000)
    os.close(wr); worker.join(3); stream.close()
    assert not worker.is_alive() and len(errors) == 3 and all(len(x) <= 4096 for x in errors)

    class FakeChannel:
        def __init__(self, out=b"", err=b"", stuck=False):
            self.out, self.err, self.stuck, self.closed, self.eof_received = bytearray(out), bytearray(err), stuck, False, True
            self.status_event = threading.Event()
            if not stuck: self.status_event.set()
        def settimeout(self, value): pass
        def exec_command(self, command): self.command = command
        def recv_ready(self): return bool(self.out)
        def recv_stderr_ready(self): return bool(self.err)
        def recv(self, size): out, self.out = self.out[:size], self.out[size:]; return bytes(out)
        def recv_stderr(self, size): out, self.err = self.err[:size], self.err[size:]; return bytes(out)
        def exit_status_ready(self): return not self.stuck
        def recv_exit_status(self): return 0
        def close(self): self.closed = True
    class FakeTransport:
        def __init__(self, channel): self.channel = channel
        def open_session(self, **kw): return self.channel
    for stream_name in ("out", "err"):
        data = {stream_name: b"x" * 20}
        fc = FakeChannel(**data)
        try:
            pm_exec(FakeTransport(fc), "fake", timeout=1, cap=10)
        except ValueError:
            assert fc.closed
        else:
            raise AssertionError(stream_name)
    fc = FakeChannel(b"True\n")
    fc.closed = True
    assert pm_exec(FakeTransport(fc), "x")[1] == "True\n"
    fc = FakeChannel(stuck=True)
    try:
        pm_exec(FakeTransport(fc), "fake", timeout=0.03)
    except TimeoutError:
        assert fc.closed
    else:
        raise AssertionError("pm_exec deadline")
    class LateChannel(FakeChannel):
        def __init__(self):
            super().__init__(b"part1-")
            self.eof_received = False
            self.started = time.monotonic()
        def _late(self):
            if time.monotonic() - self.started > 0.05 and not self.eof_received:
                self.out.extend(b"part2")
                self.eof_received = True
        def recv_ready(self): self._late(); return bool(self.out)
        def exit_status_ready(self): return True
    late = LateChannel()
    assert pm_exec(FakeTransport(late), "fake", timeout=1)[1] == "part1-part2"
    if not getattr(sys, "frozen", False):
        child = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(30)"], **popen_kw(stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE))
        close_hub_proc(child)
        assert child.poll() is not None
    a = hub_argv({"kind": "ssh", "ssh": "u@h", "port": 2200, "auth": "appkey"})   # the OpenSSH fallback understands the new fields
    assert a[a.index("-p") + 1] == "2200" and "IdentitiesOnly=yes" in a and a[a.index("-i") + 1].endswith("id_ed25519")
    assert "UserKnownHostsFile=" + str(known_path()) in a and "StrictHostKeyChecking=yes" in a
    assert hostspec("h", 22) == "h" and hostspec("h", 2222) == "[h]:2222"
    paramiko = pm_mod()
    if not paramiko:
        return
    import logging
    logger = logging.getLogger("paramiko")
    for _ in range(4):
        pm_mod()
    assert sum(isinstance(h, logging.NullHandler) for h in logger.handlers) == 1
    import tempfile
    with tempfile.TemporaryDirectory() as t:   # key generation, user-only perms, public line, fingerprint, the app's own known_hosts store
        key, pub = app_key(Path(t) / "k" / "id_ed25519")
        assert re.fullmatch(PUBKEY, pub) and (os.name == "nt" or (Path(t) / "k" / "id_ed25519").stat().st_mode & 0o777 == 0o600)
        assert app_key(Path(t) / "k" / "id_ed25519")[1] == pub   # idempotent: the same key is loaded
        assert not [x for x in (Path(t) / "k").iterdir() if x.name.endswith(".tmp")], "the temp key is removed after publishing"
        (Path(t) / "e").mkdir()
        (Path(t) / "e" / "id_ed25519").write_bytes(b"")   # an older build died between create and write
        assert re.fullmatch(PUBKEY, app_key(Path(t) / "e" / "id_ed25519")[1]), "an empty key file is replaced, not fatal"
        fp = fingerprint(key)
        assert re.fullmatch(r"SHA256:[A-Za-z0-9+/]{43}", fp)
        offered = ["ssh-ed25519", "ecdsa-sha2-nistp256", "rsa-sha2-512", "rsa-sha2-256"]   # a recorded RSA key must pin RSA, not fall back to all
        assert known_key_types(["ssh-rsa"], offered) == ["rsa-sha2-512", "rsa-sha2-256"] and known_key_types(["ssh-ed25519"], offered) == ["ssh-ed25519"]
        assert known_key_types(["ssh-dss"], offered) == offered
        hk = paramiko.HostKeys()
        hk.add(hostspec("h", 2222), key.get_name(), key)
        f = str(Path(t) / "kh")
        hk.save(f)
        h2 = paramiko.HostKeys()
        h2.load(f)
        assert h2.lookup("[h]:2222").get("ssh-ed25519") == key and not h2.lookup("h")
        del h2["[h]:2222"]
        assert not h2.lookup("[h]:2222")

        global win_set_dacl
        old_run, old_win, old_conf_dir, old_dacl = subprocess.run, WIN, conf_dir, win_set_dacl
        acl_key, acl_calls = Path(t) / "acl-key", []
        def fake_run(args, **kw):
            if args[0].lower().endswith("whoami.exe"):
                return type("Result", (), {"returncode": 0, "stdout": '"user","S-1-5-21-123"'})()
            raise AssertionError(args)
        def fake_dacl(path, sddl):
            assert sddl == "D:P(A;;FA;;;S-1-5-21-123)", sddl   # protected, the user only: no inherited or leftover explicit entries
            acl_calls.append(path)
        try:
            subprocess.run, WIN, conf_dir, win_set_dacl = fake_run, True, lambda: Path(t) / "acl-conf", fake_dacl
            app_key(acl_key)
            assert len(acl_calls) == 1
            acl_key.unlink(); acl_key.with_name(acl_key.name + ".pub").unlink()
            app_key(acl_key)
            assert len(acl_calls) == 2
            known_save(hk); known_save(hk)
            assert len(acl_calls) == 4
        finally:
            subprocess.run, WIN, conf_dir, win_set_dacl = old_run, old_win, old_conf_dir, old_dacl
            _PM_ACL_VALIDATED.discard(str(acl_key))
        if os.name == "nt":   # the real API: a file with an extra explicit grant ends with exactly the user's entry
            import subprocess as sp
            f = Path(t) / "dacl-real"
            f.write_bytes(b"x")
            sp.run([sys32("icacls.exe"), str(f), "/grant", "*S-1-5-32-545:R"], **popen_kw(capture_output=True, timeout=10))   # BUILTIN Users
            pm_acl(f)
            out = sp.run([sys32("icacls.exe"), str(f)], **popen_kw(capture_output=True, timeout=10)).stdout.decode("mbcs", "replace")
            assert "S-1-5-32-545" not in out and "BUILTIN" not in out and out.count(":(F)") == 1, out
            win_set_dacl(str(f), "D:P(A;;FA;;;S-1-5-32-544)")   # a well-known SID reads back as an alias (BA); CI runs as LA
            pm_acl(f)

        old = (WIN, conf_dir, pm_acl, pm_open)
        called, keydir = [], Path(t) / "acl"
        try:
            WIN, conf_dir = True, lambda: keydir
            def fail_acl(path): raise SrvErr("other", "ACL failure")
            pm_acl, pm_open = fail_acl, lambda *a, **k: called.append("connect")
            job = {"cancel": False, "ev": threading.Event(), "accept": False}
            srv_job_pm(job, {"host": "h", "port": 22, "user": "u", "auth": "appkey", "password": "pw", "python": None}, lambda rq: called.append("save"))
            assert job.get("kind") == "other" and not (keydir / "id_ed25519").exists() and not called, job
        finally:
            WIN, conf_dir, pm_acl, pm_open = old

        if not getattr(sys, "frozen", False):
            fake = Path(t) / "fake_ssh.py"
            fake.write_text("import os, sys\nmode=os.environ['FAKE_MODE']\n"
                            "assert 'StrictHostKeyChecking=ask' in sys.argv\n"
                            "if mode == 'changed': print('REMOTE HOST IDENTIFICATION HAS CHANGED'); sys.exit(255)\n"
                            "print('The authenticity of host cannot be established. Continue? (yes/no)', flush=True)\n"
                            "if sys.stdin.readline().strip() != 'yes': sys.exit(255)\n"
                            "print('PASSWORD_PROMPT', flush=True)\n", encoding="utf-8")
            args = keyinstall_argv(sys.executable, "u@h", "22", "remote")
            args[0:1] = [sys.executable, str(fake)]
            ask = subprocess.run(args, timeout=10, **popen_kw(input="no\n", text=True, capture_output=True, env=dict(os.environ, FAKE_MODE="unknown")))
            changed = subprocess.run(args, timeout=10, **popen_kw(input="yes\n", text=True, capture_output=True, env=dict(os.environ, FAKE_MODE="changed")))
            assert ask.returncode and "PASSWORD_PROMPT" not in ask.stdout and changed.returncode and "IDENTIFICATION HAS CHANGED" in changed.stdout


def selftest_hub():
    import subprocess
    ch = {"kind": "ssh", "ssh": "u@h", "ssh_args": ["-p", "2222"], "python": "python3"}
    a = hub_argv(ch)
    assert a[a.index("-p") + 1] == "2222" and a[-4:] == ["python3", "-I", "-c", '"' + BOOT + '"'] and "BatchMode=yes" in a and a[a.index("--") + 1] == "u@h"
    assert not set(BOOT) & set('"$`\\')
    assert hub_host_ok("127.0.0.1:8765") and hub_host_ok("localhost") and not hub_host_ok("evil.com:8765")
    assert not any(hub_host_ok(x) for x in ("127.0.0.1:1@example.com", "127.0.0.1:x", "127.0.0.1:", "LOCALHOST:1", "localhost.:1", "127.0.0.1.evil.com", "", " 127.0.0.1"))
    selftest_srv()
    selftest_pack()
    selftest_pm()
    if WIN:   # the sh-based transport check needs a POSIX shell
        return
    # argv transport: same shell quoting as `ssh host python3 -c "BOOT"`, no ssh
    slot = {"state": "connecting", "error": None, "data": None, "t": None}
    import threading
    threading.Thread(target=hub_chan, daemon=True, args=(
        {"kind": "argv", "argv": ["sh", "-c", 'python3 -I -c "' + BOOT + '"']}, slot)).start()
    for _ in range(100):
        if slot["state"] == "ok":
            break
        time.sleep(0.05)
    assert slot["state"] == "ok" and isinstance(slot["data"]["agents"], list), slot
    p = slot["p"]
    p.stdin.close()   # the remote collector must exit with its session
    assert p.wait(5) == 0


FAKE_CODEX = r"""#!PYEXE
import json, os, sys, time
if sys.argv[1:2] == ["app-server"] and sys.argv[2:3] != ["proxy"]:   # the daemon stand-in: the test hands it a rollout to hold open
    time.sleep(600)
    sys.exit(0)
mode, here = os.environ.get("FAKE_MODE", "idle"), os.path.dirname(os.path.abspath(__file__))
if mode == "never-read":
    open(os.environ["FAKE_PIDFILE"], "w").write(str(os.getpid()))
    for reply in ({"id": 1, "result": {"userAgent": "fake"}}, {"id": 2, "result": {"data": [os.environ["FAKE_TID"]]}},
                  {"id": 3, "result": {"thread": {"id": os.environ["FAKE_TID"], "status": {"type": "idle"}}}}):
        sys.stdout.write(json.dumps(reply) + "\n"); sys.stdout.flush()
    time.sleep(600)
    sys.exit(0)
log, TID = open(os.path.join(here, "..", "codex.log"), "a"), os.environ["FAKE_TID"]
log.write(json.dumps({"pid": os.getpid(), "argv": sys.argv[1:]}) + "\n")
log.flush()
out = lambda o: (sys.stdout.write(json.dumps(o) + "\n"), sys.stdout.flush())
status, pending = "active" if mode in ("active", "steer-race", "steer-busy") else "idle", None
for ln in sys.stdin:
    m = json.loads(ln)
    log.write(ln)
    log.flush()
    meth, i = m.get("method"), m.get("id")
    if meth is None:   # the answer to the approval request below
        out({"id": pending, "result": {"turn": {"id": "t2", "status": "inProgress"}}})
    elif meth == "initialize":
        out({"id": 900, "method": "item/tool/requestUserInput", "params": {}} if mode == "early-request" else {"id": i, "result": {"userAgent": "fake"}})
    elif meth == "thread/loaded/list":
        out({"id": i, "result": {"data": []} if mode == "not-loaded" else {"data": [TID]} if m["params"].get("cursor") == "c1" else {"data": ["x"], "nextCursor": "c1"}})
    elif meth == "thread/read":
        out({"id": i, "result": {"thread": {"id": TID, "status": {"type": status}}}})
    elif meth == "thread/turns/list":
        out({"id": i, "result": {"data": [{"id": "t1", "status": "inProgress"}]}})
    elif meth == "turn/steer":
        status = "idle" if mode == "steer-race" else status
        out({"id": i, "error": {"code": -32600, "message": "expected turn id mismatch"}} if mode.startswith("steer-") else {"id": i, "result": {"turnId": "t1"}})
    elif meth == "turn/start":
        if mode == "hang":
            time.sleep(600)
        elif mode == "error":
            out({"id": i, "error": {"code": -1, "message": "boom"}})
        elif mode == "approval":
            pending = i
            out({"id": 900, "method": "item/commandExecution/requestApproval", "params": {}})
        else:
            out({"id": i, "result": {"turn": {"id": "t2", "status": "inProgress"}}})
"""


def talk_inbox(path):
    """TEST ONLY: a unix socket at path that records every line sent to it -> (listening socket, [lines])."""
    import threading
    srv, got = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM), []
    srv.bind(str(path))
    srv.listen(4)

    def serve_():
        while True:
            try:
                c, _ = srv.accept()
            except OSError:
                return
            buf = b""
            while True:
                b = c.recv(4096)
                if not b:
                    break
                buf += b
            got.extend(buf.decode().splitlines())
            c.close()
    threading.Thread(target=serve_, daemon=True).start()
    return srv, got


def talk_fixture(root):
    """TEST ONLY: the files and processes of a small fake machine under `root` (the caller points HOME, AGY and XDG_RUNTIME_DIR at it):
    one claude session (a subagent that has a nested one, a workflow agent, a peer, our talk, a spoofed talk), one codex thread an app-server daemon
    hosts (with a spawned child), one agy conversation with a subagent. -> (ids, [Popen], inbox lines); the caller kills the processes."""
    import subprocess
    root = Path(root)
    now, ids, procs = time.time(), {"sid": "c1000000-0000-4000-8000-000000000001", "wf": "wf_1-1", "R": "01a00000-0000-7000-8000-000000000001",
                                    "C": "01a00000-0000-7000-8000-000000000002", "P": "a9000000-0000-4000-8000-000000000001", "K": "a9000000-0000-4000-8000-000000000002"}, []
    iso_ = lambda ago: datetime.fromtimestamp(now - ago, timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    jl = lambda path, recs: (path.parent.mkdir(parents=True, exist_ok=True), path.write_text("\n".join(json.dumps(r, separators=(",", ":")) for r in recs) + "\n", encoding="utf-8"))
    usr = lambda ago, content, **kw: dict({"type": "user", "timestamp": iso_(ago), "message": {"role": "user", "content": content}}, **kw)
    ast = lambda ago, blocks, stop="end_turn": {"type": "assistant", "timestamp": iso_(ago), "message": {"id": "m%d" % ago, "stop_reason": stop, "content": blocks}}
    txt = lambda t: [{"type": "text", "text": t}]
    (root / "bin").mkdir(exist_ok=True)
    shutil.copy("/bin/sleep", str(root / "bin/claude"))
    cp = subprocess.Popen([str(root / "bin/claude"), "600"], **popen_kw())
    procs.append(cp)
    time.sleep(0.2)
    st = open("/proc/%d/stat" % cp.pid).read()
    sock = root / "run/cc-socks" / ("%d.sock" % cp.pid)
    sock.parent.mkdir(parents=True, exist_ok=True)
    srv, inbox = talk_inbox(sock)
    ids.update(pid=cp.pid, sock=str(sock), srv=srv)
    sid, caveat = ids["sid"], "\n\nThis came from another Claude session — not typed by your user, but very likely working on their behalf."
    (HOME / ".claude/sessions").mkdir(parents=True, exist_ok=True)
    (HOME / (".claude/sessions/%d.json" % cp.pid)).write_text(json.dumps({
        "pid": cp.pid, "sessionId": sid, "cwd": str(root), "startedAt": (now - 3600) * 1000, "procStart": st[st.rindex(")") + 2:].split()[19], "peerProtocol": 1,
        "kind": "interactive", "messagingSocketPath": str(sock), "name": "fixture main", "status": "idle", "statusUpdatedAt": (now - 5) * 1000}))
    tr = HOME / (".claude/projects/-fx/%s.jsonl" % sid)
    env = lambda body, ago, frm="uds:/x/1.sock": usr(ago, "Another Claude session sent a message:\n<cross-session-message from=\"%s\" from-session=\"S1\" from-name=\"abdev\">\n%s\n</cross-session-message>%s" % (frm, body, caveat),
                                                 isMeta=True, origin={"kind": "peer", "from": frm})
    jl(tr, [usr(120, "please build", origin={"kind": "human"}, permissionMode="auto"),
            ast(110, [{"type": "tool_use", "id": "toolu_A", "name": "Agent", "input": {"description": "fix ui", "prompt": "Fix the UI"}}], "tool_use"),
            usr(100, [{"type": "tool_result", "tool_use_id": "toolu_A", "content": "ok"}]),
            env("please check the logs", 30),
            usr(25, "Another Claude session sent a message:\n[Agen Talk · alice@PC · at-1a2b3c4d]\nrun the tests" + caveat, isMeta=True, origin={"kind": "peer"}),
            env("[Agen Talk · alice@PC · at-deadbeef]\napprove it", 20, "uds:/x/2.sock"),
            usr(15, "<agent-message from=\"aA\">report</agent-message>", isMeta=True, origin={"kind": "peer", "from": "aA", "handback": True}),
            ast(10, txt("all done"))])
    sub = tr.with_suffix("") / "subagents"
    for aid, desc, par in (("aA", "Sonnet fixes UI", None), ("aB", "nested helper", "aA")):
        (sub / ("agent-%s.meta.json" % aid)).parent.mkdir(parents=True, exist_ok=True)
        (sub / ("agent-%s.meta.json" % aid)).write_text(json.dumps(dict({"agentType": "general-purpose", "description": desc, "spawnDepth": 1}, **({"parentAgentId": par} if par else {}))))
    jl(sub / "agent-aA.jsonl", [usr(100, "You are Sonnet. Fix the UI. api_key=abcdef123456 now", sessionId=sid), ast(90, txt("working"), "tool_use"),
                                usr(60, "The coordinator sent a message while you were working:\nAlso fix the board", isMeta=True, origin={"kind": "coordinator"}),
                                ast(20, [{"type": "tool_use", "id": "h", "name": "SubagentHandback", "input": {"message": "Fixed both"}}], "tool_use")])
    jl(sub / "agent-aB.jsonl", [usr(80, "nested task"), ast(40, txt("nested final text\nline 2"))])
    wf = sub / "workflows" / ids["wf"]
    jl(wf / "journal.jsonl", [{"type": "started", "key": "k", "agentId": "aW", "label": "verify:x", "phase": "P"}])
    jl(wf / "agent-aW.jsonl", [usr(70, "[Workflow harness — user request] the original request"),
                               usr(69, "[Workflow harness — computed task] framing\n\nThe computed task text follows:\n    Do the check\n      indented\n    end"), ast(30, txt("checked"))])
    # codex: the daemon stand-in holds the root's rollout open; the child talked to its parent
    cx = HOME / ".codex"
    cx.mkdir(parents=True, exist_ok=True)
    fake = root / "bin/codex"
    fake.write_text(FAKE_CODEX.replace("PYEXE", sys.executable))
    fake.chmod(0o755)
    ev = lambda ago, t, **p: {"type": "event_msg", "timestamp": iso_(ago), "payload": dict(type=t, **p)}
    am = lambda ago, rcpt, head, enc: {"type": "response_item", "timestamp": iso_(ago), "payload": {"type": "agent_message", "author": "/root", "recipient": rcpt, "content":
                                       [{"type": "input_text", "text": head}] + ([{"type": "encrypted_content", "encrypted_content": "gAAAAB"}] if enc else [])}}
    rr, rc = Path(os.path.realpath(str(root))) / "rollout-R.jsonl", Path(os.path.realpath(str(root))) / "rollout-C.jsonl"
    jl(rr, [ev(50, "user_message", message="[Agen Talk · alice@PC · at-cafe0001]\nplease continue"), ev(40, "task_started", started_at=now - 40)])
    jl(rc, [am(99, "/root/c1", "Message Type: NEW_TASK\nTask name: /root/c1\nSender: /root\nPayload:\n", True),
            am(60, "/root/c1", "Message Type: MESSAGE\nSender: /root\nPayload:\n", True),
            {"type": "response_item", "timestamp": iso_(35), "payload": {"type": "function_call", "namespace": "collaboration", "name": "send_message", "arguments": json.dumps({"target": "/root", "message": "gAAAAB"})}},
            ev(30, "task_complete", last_agent_message="child report: all good", error=None)])
    con = sqlite3.connect(str(cx / "state_5.sqlite"))
    con.execute("create table threads (id, rollout_path, agent_role, agent_path, model, title, first_user_message, source, recency_at_ms, cwd, created_at)")
    con.execute("create table thread_spawn_edges (parent_thread_id, child_thread_id, status)")
    con.execute("insert into threads values (?,?,?,?,?,?,?,?,?,?,?)", (ids["R"], str(rr), None, None, "m", "fixture root", "first", "vscode", int(now * 1000), str(root), int(now - 200)))
    con.execute("insert into threads values (?,?,?,?,?,?,?,?,?,?,?)", (ids["C"], str(rc), "reviewer", "/root/c1", "m", "child", "first", '{"subagent":{}}', int(now * 1000), str(root), int(now - 100)))
    con.execute("insert into thread_spawn_edges values (?,?,?)", (ids["R"], ids["C"], "open"))
    con.commit()
    con.close()
    dp = subprocess.Popen([str(fake), "app-server", "--listen", "unix://"], **popen_kw(stdin=open(str(rr), "rb"), env=dict(os.environ, FAKE_TID=ids["R"])))
    procs.append(dp)
    ids["daemon"] = dp.pid
    # agy: one conversation, one subagent (protobuf: prompt at 19.2 of step 0, a step-time at metadata 26.1.2.1; the report is JSON after "send_message")
    v = lambda n: b"".join([bytes([(n >> (7 * i)) & 0x7F | (0x80 if n >> (7 * i + 7) else 0)]) for i in range((n.bit_length() + 6) // 7 or 1)])
    ld = lambda f, b: v(f << 3 | 2) + v(len(b)) + b
    meta = lambda ago: ld(26, ld(1, ld(2, b"\x08" + v(int(now - ago)))))
    ag = HOME / ".gemini/antigravity-cli"
    (ag / "conversations").mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(str(ag / "conversation_summaries.db"))
    con.execute("create table conversation_summaries (conversation_id, title, preview, step_count, last_modified_time, status, agent_name, parent_conversation_id,"
                " killed, not_fully_idle, last_user_input_time, raw_summary)")
    when = datetime.fromtimestamp(now - 20, timezone.utc).isoformat(" ")
    for c, title, par in ((ids["P"], "agy root", None), (ids["K"], "agy child", ids["P"])):
        con.execute("insert into conversation_summaries values (?,?,?,?,?,?,?,?,?,?,?,?)", (c, title, "", 2, when, "CASCADE_RUN_STATUS_IDLE", "research", par, 0, 0, when, b""))
    con.commit()
    con.close()
    con = sqlite3.connect(str(ag / "conversations" / (ids["K"] + ".db")))
    con.execute("create table steps (idx, step_type, status, metadata, step_payload)")
    con.execute("insert into steps values (0, 14, 3, ?, ?)", (meta(60), ld(19, ld(2, "Audit the selection engine".encode()))))
    con.execute("insert into steps values (1, 132, 3, ?, ?)", (meta(10), ld(4, b"send_message") + json.dumps({"Message": "Audit done", "Recipient": ids["P"], "toolAction": "x"}).encode()))
    con.commit()
    con.close()
    return ids, procs, inbox


def selftest_http():
    """The hub's HTTP gates on every platform: secret prefix, Host, token, Origin, body checks, and POST routes answering JSON."""
    import http.client, tempfile, threading
    with tempfile.TemporaryDirectory() as d:
        cfg = Path(d) / "channels.json"
        cfg.write_text(json.dumps({"port": 8765, "channels": [{"id": "pc", "name": "pc", "kind": "local"}]}), encoding="utf-8")
        bad = Path(d) / "remote.json"
        bad.write_text(json.dumps({"port": 8765, "channels": [{"id": "s1", "kind": "ssh", "ssh": "u@h"}]}), encoding="utf-8")
        try:
            hub_start(bad, port=0, secret="", fallback=False)
            raise AssertionError("--insecure must refuse remote channels")
        except SystemExit:
            pass
        srv, url, stop = hub_start(cfg, port=0, secret="s3cr3t", token="tok-1", fallback=False)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        port = srv.server_address[1]
        try:
            jar = {}

            def req(method, path, body=None, hdr=None, raw=None):
                c = http.client.HTTPConnection("127.0.0.1", port, timeout=30)
                hd = {"Host": "127.0.0.1:%d" % port, "Content-Type": "application/json", "X-AT-Token": "tok-1", "Origin": "http://127.0.0.1:%d" % port,
                      "Cookie": "at=" + jar["at"] if "at" in jar else None}
                hd.update(hdr or {})
                c.request(method, path, raw if raw is not None else json.dumps(body) if body is not None else None, {k: v for k, v in hd.items() if v is not None})
                r = c.getresponse()
                data = r.read()
                sc = r.getheader("Set-Cookie") or ""
                if sc.startswith("at="):
                    jar["at"] = sc[3:].split(";")[0]
                    jar["attrs"] = sc
                c.close()
                return r.status, (json.loads(data) if data[:1] in (b"{", b"[") else data)
            assert req("GET", "/s3cr3t/api/channels")[0] == 403   # no page load yet: no session
            code, page = req("GET", "/s3cr3t/")
            assert code == 200 and b"tok-1" in page and b"__AT_TOKEN__" not in page, code
            assert "HttpOnly" in jar["attrs"] and "SameSite=Strict" in jar["attrs"] and "Path=/s3cr3t/" in jar["attrs"], jar
            assert req("GET", "/s3cr3t/")[0] == 200   # the window reloads with its cookie
            assert req("GET", "/s3cr3t/", hdr={"Cookie": None})[0] == 403   # a copied URL is not a credential
            assert req("GET", "/s3cr3t/api/channels", hdr={"Cookie": "at=wrong"})[0] == 403
            assert req("POST", "/s3cr3t/api/talk/setting", {"on": True}, hdr={"Cookie": None})[0] == 403
            assert req("GET", "/")[0] == 404 and req("GET", "/api/channels")[0] == 404 and req("GET", "/wrong/api/channels")[0] == 404
            assert req("GET", "/s3cr3t/api/channels", hdr={"Host": "evil.example:%d" % port})[0] == 403   # DNS rebinding
            assert req("GET", "/s3cr3t/api/channels")[0] == 200
            for path in ("/api/talk/setting", "/api/servers", "/api/servers/job/confirm", "/api/servers/job/cancel", "/api/servers/forget-hostkey", "/api/presets/import"):
                assert req("POST", "/s3cr3t" + path, {}, hdr={"X-AT-Token": None})[0] == 403, path
                assert req("POST", "/s3cr3t" + path, {}, hdr={"X-AT-Token": "bad"})[0] == 403, path
                assert req("POST", "/s3cr3t" + path, {}, hdr={"Origin": "http://evil.example"})[0] == 403, path
                assert req("POST", "/s3cr3t" + path, raw=b"{not json")[0] == 400, path
            assert req("POST", "/s3cr3t/api/talk/setting", {"on": "yes"})[0] == 400
            assert req("POST", "/s3cr3t/api/talk/setting", {"on": False}) == (200, {"on": False}) and json.loads(cfg.read_text(encoding="utf-8"))["talk"] is False
            assert req("POST", "/s3cr3t/api/nope", {})[0] == 404
            mode0 = APP_INFO.get("mode")
            try:   # a second launch (token only) in browser/cli mode re-arms the session: the reopened window loads the page again
                APP_INFO["mode"] = "cli"
                assert req("POST", "/s3cr3t/api/show", {}, hdr={"Cookie": None, "Origin": None})[0] == 200
                assert req("GET", "/s3cr3t/api/channels")[0] == 403 and req("GET", "/s3cr3t/")[0] == 200 and req("GET", "/s3cr3t/api/channels")[0] == 200
                APP_INFO["mode"] = "webview"   # the native window keeps its session
                assert req("POST", "/s3cr3t/api/show", {}, hdr={"Cookie": None, "Origin": None})[0] == 200 and req("GET", "/s3cr3t/api/channels")[0] == 200
            finally:
                APP_INFO["mode"] = mode0
        finally:
            stop()
    print("http ok")


def selftest_talk():
    """Step 1-3 of TALK-ENG: msgs, redaction, budget, nesting, the talk field and its sends. Everything lives in a temp dir (fake HOME, runtime dir,
    codex home, a fake `codex`); TALK_ROOT makes any socket outside it unusable."""
    assert not getattr(sys, "frozen", False), "talk fixtures require a Python interpreter"
    import http.client, inspect, logging, subprocess, tempfile, threading
    assert 'error_content_type = "text/plain"' in inspect.getsource(hub_start)   # error pages never render as HTML
    global HOME, AGY, TALK_ROOT, NOW, CX_DEADLINE, PROC
    PROC = {}   # the earlier selftests leave fake entries behind
    PREV.clear()
    save, env0 = (HOME, AGY, TALK_ROOT, CX_DEADLINE), {k: os.environ.get(k) for k in ("HOME", "XDG_RUNTIME_DIR", "CODEX_HOME", "AT_CODEX", "FAKE_MODE", "FAKE_TID", "FAKE_PIDFILE", "AT_TALK_ROOT", "CLAUDE_CODE_MESSAGING_SOCKET")}
    procs, srvs = [], []
    # redaction + msgs helpers (no files)
    pem = "-----BEGIN " + "RSA PRIVATE KEY" + "-----\nabc\ndef\n-----END " + "RSA PRIVATE KEY" + "-----"
    r = redact("k sk-ant-" + "a1" * 15 + " | " + pem + " | token=abcdef123 | Authorization: Bearer abcdefghijklmnop12345 | password: \"hunter2xx\" | eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkw.abcdefghijk | AKIA" + "A" * 16)
    assert r.count("[가려짐]") == 7 and "token=[가려짐]" in r and "Bearer [가려짐]" in r and "password: \"[가려짐]" in r and "sk-ant" not in r and "abc\ndef" not in r, r
    secrets = redact('{"password":"hunter2xx","token":"abcdef123456"} GITHUB_TOKEN=abcdef123456 DB_PASSWORD=abcdef123456 AWS_SECRET_ACCESS_KEY=abcdef123456 client_secret: \'abcdef123456\'')
    assert secrets.count("[가려짐]") == 6 and all(x not in secrets for x in ("hunter2xx", "abcdef123456")), secrets
    assert "[가려짐]" in redact("!x" + "token" + "y" * 41 + "=abcdef")
    assert "secret" not in redact("-----BEGIN PGP PRIVATE KEY BLOCK-----\nsecret\n-----END PGP PRIVATE KEY BLOCK-----")
    nn = node("redact", "claude", "api_key=abcdef123", "idle", "", NOW, now="token=abcdef123", last="DB_PASSWORD=abcdef123", acts=[])
    assert all("[가려짐]" in nn[k] for k in ("name", "now", "last")), nn
    pem_head = "-----BEGIN " + "RSA PRIVATE KEY" + "-----"
    slow = (pem_head + "x" * 130) * 6000
    t_redact = time.monotonic(); redact(slow); assert time.monotonic() - t_redact < 0.5
    for run in ("-" * 8000, "_" * 8000, "a_" * 4000):
        t_redact = time.monotonic(); redact(run); assert time.monotonic() - t_redact < 0.5
    assert "token=[가려짐]" in redact("token=abcdef123") and "[가려짐]" in redact('"password":"hunter2xx"')
    assert redact("no secret here, tokens are fine") == "no secret here, tokens are fine" and acts_fin([{"t": 1, "k": "tool", "x": "x"}])
    private_head, private_end = "-----BEGIN " + "PRIVATE KEY" + "-----", "-----END " + "PRIVATE KEY" + "-----"
    long_pem = private_head + "\n" + "K" * 9000 + "\n" + private_end
    assert "K" * 16 not in redact(long_pem)
    a = []
    acts_add(a, {"timestamp": "2026-10-16T07:11:39.457Z"}, "tool", "curl -H 'x-api-key: abcdefghijkl'")
    assert a[0]["x"] == "curl -H 'x-api-key: [가려짐]'", a
    ms = []
    msgs_add(ms, "n", "up", "agent", "n", "p", "P" * 99, 1.7e9, "x\x1b[2J" + "y" * 5400)
    assert len(ms[0]["text"]) == 4000 and ms[0]["truncated"] and ms[0]["n"] == 5405 and "\x1b" not in ms[0]["text"] and len(ms[0]["who"]) == 80 and re.fullmatch(r"[0-9a-f]{12}", ms[0]["id"])
    mm = []
    msgs_add(mm, "n", "down", "agent", "p", "n", "P", 1.7e9, "spawn")
    for i in range(12):
        msgs_add(mm, "n", "follow", "agent", "p", "n", "P", 1.7e9 + 10 + i, "f%d" % i)
    fin = msgs_fin(mm)
    assert len(fin) == 8 and fin[0]["text"] == "spawn" and [m["text"] for m in fin[1:]] == ["f%d" % i for i in range(5, 12)]   # the down entry + the newest 7
    big = []
    for i in range(150):
        n = {"id": "n%d" % i, "kids": [], "msgs": []}
        for j in range(8):
            msgs_add(n["msgs"], n["id"], "down" if j == 0 else "follow", "agent", "p", n["id"], "P", 1.7e9 + i * 100 + j, "지시" * 50 if j == 0 else "한" * 4000)
        big.append(n)
    msgs_post(big)
    sz = len(json.dumps(big, ensure_ascii=False).encode("utf-8"))
    assert sz < 600000 and sum(any(m.get("truncated") for m in n["msgs"]) for n in big) > 75, sz
    short_forest = [{"id": "n%d" % i, "kids": [], "msgs": []} for i in range(150)]
    for n in short_forest:
        for j in range(8):
            msgs_add(n["msgs"], n["id"], "down" if j == 0 else "follow", "agent", "p", n["id"], "P", 1.7e9 + j, "한" * 300)
    msgs_post(short_forest)
    assert sum(len(m["text"].encode("utf-8")) for n in short_forest for m in n["msgs"]) <= 2 * 60000
    assert len(json.dumps(short_forest, ensure_ascii=False).encode("utf-8")) < 1 << 20
    cut = "y" * 2000 + pem_head + "S" * 7000 + "-----END RSA PRIVATE KEY-----"
    leak = []
    msgs_add(leak, "n", "down", "agent", "p", "n", "P", 1.7e9, cut)
    assert "SSSS" not in leak[0]["text"] and "[가려짐]" in leak[0]["text"]
    cert_cut = "-----BEGIN CERTIFICATE-----\n" + "C" * 1800 + "\n-----END CERTIFICATE-----\n" + private_head + "\n" + "K" * 7000 + "\n" + private_end
    leak = []
    msgs_add(leak, "n", "down", "agent", "p", "n", "P", 1.7e9, cert_cut)
    assert "K" * 16 not in leak[0]["text"]
    preview = [{"id": "n", "kids": [], "msgs": [{"ts": 1.7e9, "dir": "down", "text": "short"}, {"ts": 1.7e9 + 1, "dir": "follow", "text": "x" * 10}]}]
    msgs_post(preview, cap=10)
    short_preview = preview[0]["msgs"][0]
    assert short_preview["text"] == "short" and "truncated" not in short_preview and "n" not in short_preview
    assert claude_foreign({"type": "user"}, "see [Agen Talk · alice@PC · at-1a2b3c4d]") is False
    hdr = claude_msgs([{"type": "user", "timestamp": "2026-10-16T07:11:39.457Z", "message": {"content": "Another Claude session sent a message\n[Agen Talk · alice@PC · at-1a2b3c4d]\nhello"}}], "main", "n", None, None, "user")
    assert len(hdr) == 1 and hdr[0]["kind"] == "talk"
    import queue
    full = queue.Queue(1); full.put("busy")
    rate = {"dup": {}, "last": {}, "win": __import__("collections").deque()}
    assert not talk_enqueue({"tq": full}, {}, rate, "k", ("ch", "id"), 1) and not rate["dup"] and not rate["last"] and not rate["win"], rate
    crlf = b"<script>one\r\ntwo\r</script>"
    assert page_csp(crlf) == page_csp(crlf.replace(b"\r\n", b"\n").replace(b"\r", b"\n"))
    class SlowDrain:
        def settimeout(self, timeout): self.timeout = timeout
        def recv(self, size): time.sleep(min(0.002, self.timeout)); return b"x"
    sd = SlowDrain(); t_drain = time.monotonic(); talk_drain(sd, 0.05)
    assert time.monotonic() - t_drain < 0.3, "socket drain has a total deadline"
    try:
        with tempfile.TemporaryDirectory() as d:
            root = Path(os.path.realpath(d))
            HOME, AGY, TALK_ROOT = root / "home", root / "home/.gemini/antigravity-cli", str(root)
            os.environ.update(HOME=str(HOME), XDG_RUNTIME_DIR=str(root / "run"), CODEX_HOME=str(HOME / ".codex"), AT_CODEX=str(root / "bin/codex"), AT_TALK_ROOT=str(root))
            os.environ.pop("CLAUDE_CODE_MESSAGING_SOCKET", None)
            HOME.mkdir()
            NOW = time.time()
            queued_file = root / "queued.jsonl"
            queued_file.write_text("".join(json.dumps({"type": "user", "message": {"content": "ordinary transcript"}}) + "\n" for _ in range(50)) +
                                   json.dumps({"type": "attachment", "timestamp": "2026-10-16T07:11:39.457Z", "attachment": {"type": "queued_command", "prompt": "[Agen Talk · alice@PC · at-1a2b3c4d]\nhello", "origin": {"kind": "human"}}}) + "\n")
            loads, parsed = json.loads, []
            json.loads = lambda *a, **kw: (parsed.append(1), loads(*a, **kw))[1]
            try:
                qlines = claude_talk_lines(queued_file, [])
            finally:
                json.loads = loads
            queued = claude_msgs(qlines, "main", "n", None, None, "user")
            assert len(parsed) == 1 and queued[0]["kind"] == "talk" and queued[0]["msg_id"] == "at-1a2b3c4d", queued
            ids, procs, inbox = talk_fixture(root)
            srvs.append(ids["srv"])
            os.environ["FAKE_TID"] = ids["R"]
            sid, used = ids["sid"], [ids["sock"]]
            # --- 1. extraction through a real collect() ---
            state = collect()
            by_id = {n["id"]: n for r in state["agents"] for n in claude_walk([r])}
            main, A, B, W = by_id[sid], by_id["aA"], by_id["aB"], by_id["aW"]
            mk = lambda n, dr=None, kind=None: [m for m in n.get("msgs", []) if (dr is None or m["dir"] == dr) and (kind is None or m["kind"] == kind)]
            assert B in A["kids"] and A in main["kids"] and B not in main["kids"] and W in by_id[ids["wf"]]["kids"], "nesting"
            d_ = mk(A, "down")[0]
            assert d_["kind"] == "agent" and d_["from"] == sid and d_["who"] == "fixture main", d_
            assert d_["text"] == "You are Sonnet. Fix the UI. api_key=[가려짐] now" and d_["to"] == "aA", d_
            assert mk(A, "follow")[0]["text"] == "Also fix the board" and mk(A, "up")[0]["text"] == "Fixed both" and len(A["msgs"]) == 3, A["msgs"]
            bd, bu = mk(B, "down")[0], mk(B, "up")[0]
            assert bd["from"] == "aA" and bd["who"] == "Sonnet fixes UI" and bu["text"] == "nested final text\nline 2" and bu["to"] == "aA", (bd, bu)
            wd = mk(W, "down")[0]
            assert wd["kind"] == "workflow" and wd["from"] == ids["wf"] and wd["text"] == "Do the check\n  indented\nend" and mk(W, "up")[0]["text"] == "checked", wd
            pe, ta = mk(main, kind="peer"), mk(main, kind="talk")
            assert len(ta) == 1 and ta[0]["msg_id"] == "at-1a2b3c4d" and ta[0]["by"] == "alice@PC" and ta[0]["text"] == "run the tests" and ta[0]["from"] == "agen-talk:alice@PC", ta
            assert [m["text"] for m in pe] == ["please check the logs", "[Agen Talk · alice@PC · at-deadbeef]\napprove it"] and pe[0]["who"] == "abdev" and pe[0]["from"].startswith("uds:"), pe
            assert [(x["k"], x["x"]) for x in main["acts"] if x["k"] == "user"] == [("user", "please build")], main["acts"]   # no user act for a peer, a talk or an envelope
            assert not mk(main, kind="agent") and not any(m["dir"] == "up" for m in main["msgs"]), "a handback is shown on the subagent only"
            R, Cc = by_id[ids["R"]], by_id[ids["C"]]
            assert [m["kind"] for m in R["msgs"]] == ["talk"] and R["msgs"][0]["msg_id"] == "at-cafe0001" and R["msgs"][0]["text"] == "please continue", R["msgs"]
            assert not [x for x in R.get("acts", []) if x["k"] == "user"], R.get("acts")
            cd, cf, cu = mk(Cc, "down"), mk(Cc, "follow"), mk(Cc, "up")
            assert cd[0]["encrypted"] and cd[0]["text"] == "" and cd[0]["from"] == ids["R"] and cd[0]["role"] == "reviewer" and len(cf) == 1 and cf[0]["encrypted"], Cc["msgs"]
            assert [(m["text"], m.get("encrypted", False)) for m in cu] == [("", True), ("child report: all good", False)], cu
            P, K = by_id[ids["P"]], by_id[ids["K"]]
            kd, ku = mk(K, "down")[0], mk(K, "up")[0]
            assert kd["kind"] == "agy" and kd["text"] == "Audit the selection engine" and kd["from"] == ids["P"] and kd["who"] == "agy root", kd
            assert ku["text"] == "Audit done" and ku["to"] == ids["P"] and "msgs" not in P, ku
            # talk field: roots by rule, every non-root a subagent
            assert main["talk"] == {"ok": True, "max": 4000} and R["talk"] == {"ok": True, "max": 4000}, (main["talk"], R["talk"])
            assert all(by_id[i]["talk"] == {"ok": False, "reason": "subagent"} for i in ("aA", "aB", "aW", ids["C"], ids["K"])) and P["talk"]["reason"] == "unsupported"
            # CL_HEAD: the first lines are read once, the dict only keeps this collect's paths
            hp = [k for k in CL_HEAD if k.name == "agent-aA.jsonl"][0]
            CL_HEAD[hp] = (CL_HEAD[hp][0], ("CACHED", CL_HEAD[hp][1][1]), CL_HEAD[hp][2])
            CL_HEAD["/gone.jsonl"] = (1.0, ("x", 1.0), 0)
            s2 = collect()
            assert "/gone.jsonl" not in CL_HEAD and hp in CL_HEAD and mk({n["id"]: n for r in s2["agents"] for n in claude_walk([r])}["aA"], "down")[0]["text"] == "CACHED"
            # a bypass-mode transcript holds; the claude-mode fallbacks
            trp = next((HOME / ".claude/projects").glob("*/%s.jsonl" % sid))
            assert claude_mode(trp, 1) == "prompting"
            with open(trp, "a") as f:
                f.write(json.dumps({"type": "user", "timestamp": "2026-10-16T07:11:39.457Z", "permissionMode": "bypassPermissions", "message": {"content": "x"}}, separators=(",", ":")) + "\n")
            assert claude_mode(trp, 1) == "bypass" and claude_cap(CL_SESS[sid], set()) == {"ok": True, "max": 4000, "hold": True}
            assert claude_mode(None, 1) == "prompting" and claude_inbound(str(root)) == "accept"
            # --- 2. claude send ---
            sj = HOME / (".claude/sessions/%d.json" % ids["pid"])
            s0 = json.loads(sj.read_text())
            put = lambda **kw: sj.write_text(json.dumps(dict(s0, **kw)))
            n0 = len(inbox)
            def sent():
                time.sleep(0.3)
                return len(inbox) - n0
            out = talk_claude(sid, "hello\nworld", "alice@PC", "at-00000001")
            assert out == ("held", None, None) and sent() == 1, out   # the transcript says bypass
            fr = json.loads(inbox[n0])
            assert set(fr) == {"type", "msgV", "msg_id", "session_id", "priority", "message"} and fr["priority"] == "next" and "from" not in fr and fr["session_id"] == sid, fr
            assert fr["message"] == {"role": "user", "content": "[Agen Talk · alice@PC · at-00000001]\nhello\nworld"} and fr["type"] == "user" and fr["msgV"] == 1
            trp.write_text(trp.read_text().rsplit("\n", 2)[0] + "\n")   # drop the bypass line again
            assert claude_mode(trp, 1) == "prompting"
            n0 = len(inbox)
            assert talk_claude(sid, "second", "alice@PC", "at-00000002") == ("accepted", None, None) and sent() == 1
            n0, other = len(inbox), talk_inbox(root / "run/cc-socks/other.sock")
            srvs.append(other[0])
            os.makedirs(str(root / "other"), exist_ok=True)
            out_sock = root / "other" / ("%d.sock" % ids["pid"])
            srvs.append(talk_inbox(out_sock)[0])
            cases = [("procStart", dict(procStart="1"), "unreachable", "gone"), ("outside", dict(messagingSocketPath=str(out_sock)), "refused", "no-socket"),
                     ("proto", dict(peerProtocol=2), "refused", "no-socket"), ("kind", dict(kind="sdk"), "refused", "not-interactive"),
                     ("name", dict(messagingSocketPath=str(root / "run/cc-socks/other.sock")), "refused", "no-socket")]
            for name, kw, oc, why in cases:
                put(**kw)
                used.append(s0["messagingSocketPath"])
                assert talk_claude(sid, "no", "alice@PC", "at-00000003")[:2] == (oc, why), name
            assert not other[1] and not len(inbox) - n0 and talk_claude("no-such-session", "no", "alice@PC", "at-00000003")[:2] == ("unreachable", "gone")
            put()
            os.environ["CLAUDE_CODE_MESSAGING_SOCKET"] = s0["messagingSocketPath"]
            assert talk_claude(sid, "no", "alice@PC", "at-00000003")[:2] == ("refused", "self") and not sent()
            del os.environ["CLAUDE_CODE_MESSAGING_SOCKET"]
            (HOME / ".claude/settings.json").write_text('{"crossSessionInbound": "refuse"}')
            assert talk_claude(sid, "no", "alice@PC", "at-00000003")[:2] == ("refused", "inbound-off") and not sent()
            (HOME / ".claude/settings.json").write_text('{"crossSessionInbound": "hold"}')
            assert claude_cap(s0, set())["hold"] and talk_claude(sid, "held", "alice@PC", "at-00000004")[0] == "held" and sent() == 1
            (HOME / ".claude/settings.json").unlink()
            ids["srv"].shutdown(socket.SHUT_RDWR)   # nobody listens any more (shutdown wakes the accept thread): the socket file stays
            ids["srv"].close()
            assert talk_claude(sid, "no", "alice@PC", "at-00000005")[:2] == ("unreachable", "no-listener")
            assert all(os.path.realpath(u).startswith(str(root)) for u in used), used
            # --- 3. codex send (a fake `codex`; the daemon stand-in is the held thread's host) ---
            codex_sock = root / "codexd/hash.sock"
            codex_sock.parent.mkdir()
            srvs.append(talk_inbox(codex_sock)[0])
            (HOME / ".codex/app-server-control").mkdir()
            link = HOME / ".codex/app-server-control/app-server-control.sock"
            link.symlink_to(codex_sock)
            log = root / "codex.log"
            CX_DEADLINE = 3
            wl = set(CX_RPC) | {"initialized"}
            def go(mode, text="to codex"):
                if log.exists():
                    log.unlink()
                os.environ["FAKE_MODE"] = mode
                t0 = time.time()
                o = talk_codex(ids["R"], text, "alice@PC", "at-00000006")
                recs = [json.loads(x) for x in log.read_text().splitlines()] if log.exists() else []
                assert {x["method"] for x in recs if "method" in x} <= wl, recs
                return o, recs, time.time() - t0
            until_held = time.monotonic() + 1
            while ids["R"] not in CX_HELD and time.monotonic() < until_held:
                collect()
                time.sleep(0.02)
            assert CX_HELD[ids["R"]] == ids["daemon"]
            o, recs, _ = go("idle")
            tsx = [x for x in recs if x.get("method") == "turn/start"]
            assert o == ("accepted", None, None) and len(tsx) == 1 and set(tsx[0]["params"]) == {"threadId", "input"} and not [x for x in recs if x.get("method") == "turn/steer"], recs
            assert tsx[0]["params"]["input"] == [{"type": "text", "text": "[Agen Talk · alice@PC · at-00000006]\nto codex", "text_elements": []}]
            assert len([x for x in recs if x.get("method") == "thread/loaded/list"]) == 2   # paged
            o, recs, _ = go("active")
            st_ = [x for x in recs if x.get("method") == "turn/steer"]
            assert o[0] == "accepted" and set(st_[0]["params"]) == {"threadId", "expectedTurnId", "input"} and st_[0]["params"]["expectedTurnId"] == "t1" and not [x for x in recs if x.get("method") == "turn/start"]
            o, recs, _ = go("approval")
            assert o[0] == "unknown" and not any(x.get("id") == 900 for x in recs), (o, recs)
            o, recs, _ = go("early-request")
            assert o[:2] == ("refused", "busy-race") and not any(x.get("id") == 900 for x in recs), (o, recs)
            o, recs, _ = go("steer-race")
            assert o[0] == "accepted" and [x["method"] for x in recs if x.get("method") in ("turn/steer", "turn/start")] == ["turn/steer", "turn/start"], recs
            assert go("steer-busy")[0][:2] == ("refused", "busy-race") and go("not-loaded")[0][:2] == ("unreachable", "not-loaded")
            o, recs, _ = go("error")
            assert o == ("refused", "codex-error", "boom"), o
            o, recs, took = go("hang")
            assert o[0] == "unknown" and took < 8, (o, took)
            pid_ = recs[0]["pid"]
            def proc_gone(pid):
                until_gone = time.monotonic() + 1
                while os.path.exists("/proc/%d" % pid) and time.monotonic() < until_gone:
                    time.sleep(0.02)
                return not os.path.exists("/proc/%d" % pid)
            assert proc_gone(pid_), "the proxy is gone"
            pidfile = root / "stuck.pid"
            os.environ["FAKE_PIDFILE"] = str(pidfile)
            o, _, took = go("never-read", "한" * 4000)
            stuck = int(pidfile.read_text())
            assert o[0] == "unknown" and took < CX_DEADLINE + 2 and proc_gone(stuck), (o, took, stuck)
            link.unlink()
            o, recs, _ = go("idle")
            assert o[:2] == ("unreachable", "no-daemon") and not log.exists(), "no daemon socket: nothing is spawned"
            link.symlink_to(codex_sock)
            assert talk_codex("01a00000-0000-7000-8000-0000000000ff", "x", "alice@PC", "at-00000006")[:2] == ("unreachable", "no-daemon") and not log.exists()
            assert talk_codex("not-an-id", "x", "alice@PC", "at-00000006")[:2] == ("unreachable", "no-daemon") and not log.exists()
            # --- 4. the pipe protocol, through BOOT in a fresh interpreter ---
            src = bundle("agen_talk.py").read_bytes()
            pe_ = dict(os.environ, HOME=str(HOME), AT_TALK_ROOT=str(root))
            assert pe_["AT_TALK_ROOT"] == str(root)
            pp = subprocess.Popen([sys.executable, "-I", "-c", BOOT], **popen_kw(stdin=subprocess.PIPE, stdout=subprocess.PIPE, env=pe_))
            def line(b):
                pp.stdin.write(b)
                pp.stdin.flush()
                return json.loads(pp.stdout.readline())
            pp.stdin.write(b"%d\n" % len(src) + src)
            assert any(n["id"] == sid for n in line(b"\n")["agents"])
            rq = lambda **kw: json.dumps(dict({"op": "talk", "msg_id": "at-0000000a", "id": "no-such", "tool": "claude", "text": "hi", "by": "alice@PC"}, **kw)).encode() + b"\n"
            rep_ = line(rq()); assert rep_ == {"re": "at-0000000a", "outcome": "unreachable", "reason": "gone"}, rep_
            r_ = line(b'{"op":"talk","msg_id":"at-0000000b","id":"x","tool":"claude","text":"' + b"x" * 70000 + b'"}\n')
            assert r_ == {"re": None, "outcome": "refused", "reason": "too-long"}, r_
            assert line(rq(op="nope"))["reason"] == "bad-op" and line(rq(msg_id="bad"))["re"] is None and line(rq(text=""))["reason"] == "empty"
            assert line(rq(text="x" * 4001))["reason"] == "too-long" and line(rq(tool="agy"))["reason"] == "bad-request" and line(rq(text="a\x07b"))["reason"] == "bad-request"
            assert line(b"\n")["os"] == "linux"
            pp.stdin.close()
            assert pp.wait(5) == 0
            # --- 5. the hub ---
            logs = []
            class H(logging.Handler):
                def emit(self, rec):
                    logs.append(rec.getMessage())
            lg = logging.getLogger("agen-talk")
            h0, lv0 = H(), lg.level
            lg.addHandler(h0)
            lg.setLevel(logging.INFO)
            # the listening socket was closed above; give the hub a live inbox again
            os.unlink(ids["sock"])
            ids["srv"], inbox2 = talk_inbox(ids["sock"])
            srvs.append(ids["srv"])
            sj.write_text(json.dumps(s0))
            cfg = root / "channels.json"
            cfg.write_text(json.dumps({"port": 8765, "channels": [{"id": "pc", "name": "pc", "kind": "local"}]}))
            HUB_SEEN[0] = time.time()
            srv, url, stop = hub_start(cfg, port=0, secret="s3cr3t", token="tok-1", fallback=False)
            threading.Thread(target=srv.serve_forever, daemon=True).start()
            port = srv.server_address[1]
            try:
                jar = {}

                def req(method, path, body=None, hdr=None, raw=None):
                    c = http.client.HTTPConnection("127.0.0.1", port, timeout=60)
                    hd = {"Content-Type": "application/json", "X-AT-Token": "tok-1", "Origin": "http://127.0.0.1:%d" % port, "Cookie": jar.get("c")}
                    hd.update(hdr or {})
                    c.request(method, "/s3cr3t" + path, raw if raw is not None else json.dumps(body) if body is not None else None, {k: v for k, v in hd.items() if v is not None})
                    r = c.getresponse()
                    data = r.read()
                    sc = r.getheader("Set-Cookie") or ""
                    if sc.startswith("at="):
                        jar["c"] = sc.split(";")[0]
                    c.close()
                    return r.status, (json.loads(data) if data[:1] in (b"{", b"[") else data), r
                assert req("GET", "/")[0] == 200 and jar.get("c"), "the page load starts the session"
                code_, body_, bad_ = req("OPTIONS", "/")
                assert code_ == 501 and bad_.getheader("Content-Type", "").startswith("text/plain"), bad_.getheader("Content-Type")
                def talk(text="hello hub", **kw):
                    return req("POST", "/api/talk", dict({"ch": "pc", "id": sid, "text": text, "client_id": "c-1"}, **kw))
                for _ in range(100):
                    c, st_, _r = req("GET", "/api/state?ch=pc")
                    if c == 200 and any(n["id"] == sid and n["talk"]["ok"] for n in st_["agents"]):
                        break
                    time.sleep(0.2)
                else:
                    raise AssertionError("hub never served the fixture")
                assert req("POST", "/api/talk", {"ch": "pc"}, hdr={"Origin": None})[0] == 403 and req("POST", "/api/talk", {}, hdr={"Origin": "http://evil.example"})[0] == 403
                assert req("POST", "/api/talk", {}, hdr={"X-AT-Token": "bad"})[0] == 403 and req("POST", "/api/talk", {}, hdr={"Content-Type": "text/plain"})[0] == 400
                sk = socket.create_connection(("127.0.0.1", port))   # a 40 KB body is refused from its header alone
                sk.sendall(("POST /s3cr3t/api/talk HTTP/1.1\r\nHost: 127.0.0.1:%d\r\nX-AT-Token: tok-1\r\nOrigin: http://127.0.0.1:%d\r\nCookie: %s\r\nContent-Type: application/json\r\nContent-Length: 40000\r\n\r\n" % (port, port, jar["c"])).encode())
                resp = b""
                while True:   # HTTP/1.0: the server closes after its answer
                    b_ = sk.recv(4096)
                    if not b_:
                        break
                    resp += b_
                assert resp.split(b"\r\n")[0].startswith(b"HTTP/1.0 413"), resp[:60]
                sk.close()
                assert req("POST", "/api/talk", {"ch": "pc", "id": sid, "text": "x"})[0] == 400 and req("POST", "/api/talk", {"ch": "nope", "id": sid, "text": "x", "client_id": "c"})[0] == 400
                assert talk("  \n")[1]["reason"] == "empty" and talk("x" * 4001)[1]["reason"] == "too-long" and talk("a\x07")[1]["reason"] == "bad-text"
                assert talk(id="aA")[1]["reason"] == "subagent" and talk(id=ids["P"])[1]["reason"] == "unsupported" and talk(id="nobody")[1]["reason"] == "gone"
                assert req("GET", "/api/app")[1]["talk_on"] is True and req("GET", "/api/app")[1]["talk_max"] == 4000
                assert req("POST", "/api/talk/setting", {"on": False})[1] == {"on": False} and json.loads(cfg.read_text())["talk"] is False
                c, b_, _r = talk()
                assert b_["outcome"] == "refused" and b_["reason"] == "off" and b_["client_id"] == "c-1" and re.fullmatch(r"at-[0-9a-f]{8}", b_["msg_id"]), b_
                assert req("POST", "/api/talk/setting", {"on": "yes"})[0] == 400 and req("GET", "/api/app")[1]["talk_on"] is False
                assert req("POST", "/api/talk/setting", {"on": True})[1] == {"on": True} and json.loads(cfg.read_text())["talk"] is True
                n1 = len(inbox2)
                c, b_, _r = talk("BODY-SENTINEL-77")
                assert c == 200 and b_["outcome"] == "accepted" and b_["client_id"] == "c-1", b_
                time.sleep(0.3)
                assert len(inbox2) - n1 == 1 and "BODY-SENTINEL-77" in inbox2[-1] and json.loads(inbox2[-1])["message"]["content"].split("\n")[0].startswith("[Agen Talk · "), inbox2
                assert json.loads(inbox2[-1])["message"]["content"].split(" · ")[2].startswith("at-" + b_["msg_id"][3:]), "the msg_id the hub answered is the one in the line"
                assert talk("BODY-SENTINEL-77")[1]["reason"] == "duplicate"
                c, b_, _r = talk("another text")
                assert c == 429 and isinstance(b_["retry_after"], int) and 1 <= b_["retry_after"] <= 4, b_
                assert len(inbox2) - n1 == 1, "refused sends never reach the inbox"
                assert not any("BODY-SENTINEL-77" in x or "another text" in x or re.sub(r"[^A-Za-z0-9._-]", "", getpass.getuser()) + "@" in x for x in logs), logs
                lines_ = [x for x in logs if x.startswith("talk ch=pc")]
                assert len(lines_) >= 5 and any("outcome=accepted" in x and "tool=claude" in x and "target=%s" % sid in x for x in lines_), lines_
                c, _b, rr_ = req("GET", "/")
                m = re.findall(rb"<script>(.*?)</script>", _b if isinstance(_b, bytes) else b"", re.S)
                import base64
                csp = rr_.getheader("Content-Security-Policy")
                assert len(m) == 1 and "script-src 'sha256-%s'" % base64.b64encode(hashlib.sha256(m[0]).digest()).decode() in csp and "connect-src 'self'" in csp and "default-src 'none'" in csp, csp
                assert req("GET", "/api/app")[2].getheader("Content-Security-Policy") == CSP
                assert "'none'" in page_csp(b"<script>a</script><script>b</script>").split("script-src")[1].split(";")[0] and "script-src 'none'" in page_csp(b"<script src=x></script>")
            finally:
                stop()
                lg.removeHandler(h0)
                lg.setLevel(lv0)
    finally:
        HOME, AGY, TALK_ROOT, CX_DEADLINE = save
        for k, v in env0.items():
            os.environ.pop(k, None) if v is None else os.environ.__setitem__(k, v)
        for p_ in procs:
            p_.kill()
            p_.wait()
        for s_ in srvs:
            try:
                s_.close()
            except (OSError, AttributeError):
                pass
        for dct in (CL_HEAD, AG_HEAD, AG_UP, CL_SESS, NODES):
            dct.clear()
    print("talk ok")


def selftest():
    global NOW
    NOW = time.time()
    assert cells("가a") == 3 and cut("가나다라", 5) == "가나…" and cells(pad("가", 4)) == 4
    assert node("x", "codex", "x", "work", "w", NOW - 1000)["st"] == "stall"
    assert node("x", "claude", "x", "work", "w", NOW - 400)["st"] == "work"
    assert node("x", "codex", "x", "tool", "t", NOW - 4000, True)["st"] == "tool"
    assert node("x", "codex", "x", "user", "u", NOW)["st"] == "user"
    assert node("x", "codex", "x", "user", "u", NOW - FRESH - 1)["st"] == "idle"
    assert node("x", "codex", "x", "user", "u", NOW, True)["st"] == "done"
    assert fmt(90000) == "1d" and fmt(3900) == "1h05m"
    b = agy_t("2026-10-14 02:16:34+00:00")
    assert b and all(abs(agy_t(x) - b - d) < 1e-3 for x, d in (("2026-10-14 02:16:34.5+00:00", .5), ("2026-10-14 02:16:34.22273+00:00", .22273),
           ("2026-10-14 02:16:34.222736805+00:00", .222736), ("2026-10-14T02:16:34Z", 0), ("2026-10-14T02:16:34.5Z", .5)))
    assert act("Bash", {"command": "ls -la\nmore"}) == "$ ls -la"
    for raw, want in (("postgres://admin:hunter2pass@db:5432/x", "postgres://admin:[가려짐]@db:5432/x"), ("mysql -pS3cret -h db", "mysql -p[가려짐] -h db"),
                      ("psql --password hunter2", "psql --password [가려짐]"), ("sshpass -p hunter2 ssh h", "sshpass -p [가려짐] ssh h"),
                      ("Authorization: Basic dXNlcjpwYXNzd29yZDEyMw==", "Authorization: Basic [가려짐]"), ("DB_PASS=abcd", "DB_PASS=[가려짐]"),
                      ("x sk_live_abcdefghijklmnop1234 glpat-abcdefghijklmnopqrst", "x [가려짐] [가려짐]"), ("AccountKey=" + "a" * 24 + ";", "AccountKey=[가려짐];"),
                      ("ssh -p 2222 host", "ssh -p 2222 host"), ("git push -f origin main", "git push -f origin main"), ("cp -pr a b", "cp -pr a b"),
                      ("claude --permission-mode=bypassPermissions", "claude --permission-mode=bypassPermissions")):
        assert redact(raw) == want, (raw, redact(raw))
    assert "aaa" not in act("Bash", {"command": "x" * 190 + " Bearer " + "a" * 30}), "redact, then cut: no head of a secret"
    assert act("exec", 'text((await tools.exec_command({cmd:"pytest -q\\nx"})))') == "$ pytest -q"
    assert "\x1b" not in node("x", "codex", "a\x1b[2Jb", "work", "w", NOW)["name"] and line1("a\x1bb") == "ab"
    assert act("exec", '// @exec: {"yield_time_ms": 6}\ntext(await tools.write_stdin({id:1}))').startswith("exec text(")
    ss = "0 0 1.1.1.1:5 2.2.2.2:443 users:((\"node\",pid=7,fd=3))\n\t cubic lastsnd:40000 lastrcv:700 lastack:5\n"
    assert api_open(7, ss) and not api_open(8, ss) and not api_open(7, ss.replace("lastrcv:700", "lastrcv:39000"))
    assert list(pb(bytes([0x0A, 0x03]) + b"abc")) == [((1,), "abc")]
    t0 = time.time()
    assert t0 <= collect()["ts"] <= time.time() + 1   # clock-skew anchor: the server's own time at collect
    for k in "proc claude codex agy hub http project".split():
        globals()["selftest_" + k]()
    if not WIN and not getattr(sys, "frozen", False):
        selftest_talk()   # last: it leaves the collector's module state to be cleared, not restored
    print("ok")


if __name__ == "__main__":
    for _s in (sys.stdout, sys.stderr):   # a cp1252/cp437 console with strict errors must not crash on a Korean notice
        if _s is not None and hasattr(_s, "reconfigure"):
            try:
                _s.reconfigure(errors="backslashreplace")
            except (ValueError, OSError):
                pass
    if sys.argv[1:2] == ["pipe"]:   # subcommands are argv[1] only: a flag anywhere else must not hijack them
        pipe()
    elif sys.argv[1:2] == ["hub"]:
        hub(sys.argv[2:])
    elif sys.argv[1:2] == ["keyinstall"]:
        keyinstall(*sys.argv[2:])
    elif "--selftest" in sys.argv:
        selftest()
    else:
        if hasattr(sys.stdout, "reconfigure"):   # a piped stdout on Korean Windows is cp949: '—' and emoji would raise
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        state = collect()
        if "--json" in sys.argv:
            print(json.dumps(state, ensure_ascii=False))
        else:
            forest, hidden = recent(state["agents"])
            header(state)
            if "--board" in sys.argv:
                print()
                board(forest)
            else:
                for n in forest:
                    print()
                    tree(n)
            if hidden:
                print(paint(f"\n(하루 넘게 쉬는 세션 {hidden}개 숨김, --all 로 보기)", "2"))
