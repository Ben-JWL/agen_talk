# Architecture

```
 Windows PC                                        Linux server (nothing installed)
+--------------------------------------------+    +-----------------------------------+
| AgenTalk.exe (app.py, PyInstaller)        |    |                                   |
|  - pywebview window -> WebView2            |    |  python3 -c <agen_talk.py>       |
|  - hub (agen_talk.py, in process)  ---SSH stdin/stdout--->  collector ("pipe" mode) |
|      127.0.0.1:<port>/<secret>/  (UI + API)|    |  reads /proc, ~/.codex, ~/.claude, |
|  - local channel: reads this PC's agents   |    |  ~/.gemini; writes only on request |
+--------------------------------------------+    +-----------------------------------+
```

## Pieces

- `agen_talk.py`: stdlib-only, Python 3.8+. It is the collector (runs anywhere), the hub (HTTP server, channel threads), and the CLI. The same file is streamed to servers, so it must stay dependency-free: the hub imports paramiko lazily and only for its own SSH sessions, never in the collector.
- `app.py`: the Windows entry point. Starts the hub in process, opens a pywebview window, enforces a single instance, stops everything when the window closes. Falls back to a Chrome/Edge `--app` window when WebView2 is absent.
- `index.html`: the whole UI in one file with no external requests. It is built from `ui/src/*` by `ui/build.py` (files concatenated in name order) and the built file is committed; CI fails if they differ.
- `channels.example.json`: starter config (the local channel, no servers). The real file lives in `%APPDATA%\AgenTalk\channels.json`.
- Per-user files: config, the app's SSH key and its trust store in `%APPDATA%\AgenTalk` (`channels.json`, `id_ed25519`, `known_hosts`);
  state, the log and the WebView2 profile (`webview\`, which holds the UI's 24 h room cache in localStorage) in `%LOCALAPPDATA%\AgenTalk`.

## Channels

A channel is one machine: `local` (this PC) or `ssh`. The hub polls each channel on its own thread, merges agent
sessions into one model, and serves it to the UI. An ssh channel opens an in-app SSH session (paramiko, bundled in the
Windows app) with the app's own key `%APPDATA%\AgenTalk\id_ed25519` and trust store `%APPDATA%\AgenTalk\known_hosts`
(the user's `~/.ssh/config` and `known_hosts` are not used to connect; the config is only a prefill source, see `api/sshconfig` below), and runs `python3 -I -c <bootstrap>` on the server; the
bootstrap reads the collector source from stdin. Closing the SSH session ends the collector.

OpenSSH (`ssh -T ... -- <target> python3 -I -c <bootstrap>`) is only a fallback: when paramiko cannot be imported (a source
run without it) or when a channel's hand-written `ssh_args` use an option the in-app client does not support (anything but
`-i`, `-p`, `-o IdentitiesOnly=...`). In that mode 서버 추가 creates and installs `%USERPROFILE%\.ssh\agen_talk_ed25519` and uses
the user's `~/.ssh/known_hosts`. Both keys carry the comment `agen-talk@<PC name>`; to revoke, remove that line from the server's
`~/.ssh/authorized_keys` and delete the key files.

Addresses are host names (letters, digits, `.` `_` `-`), IPv4 or bare IPv6 literals (`host_ok`; `known_hosts` uses `[host]:port` off port 22).
A key-only server (no `password` / `keyboard-interactive` method) fails a 서버 추가 job with kind `password_disabled`; the dialog then shows
`GET api/key` (the app's public key line and the `install_cmd` one-liner, same restricted options) for the user to run on the server, and
reruns the job without a password. A channel thread that fails waits 2 s, doubling to 60 s; `GET api/channels` reports `retry_at` (epoch s;
null while connecting / ok or while a password-session channel has no password) and `POST api/channels/retry {id}` (one per channel per 2 s)
ends the current wait (지금 확인; the backoff keeps growing until a connect succeeds, so a refusing server is not hammered; the page also calls it for every errored channel on `online`, on focus after >= 30 s away and
after a poll gap > 20 s). `POST api/servers/rename {id, name}` (1-40 characters, unique), `move {id, dir: up|down}` and
`remove {id, forget_hostkey}` re-read and write `channels.json` under the hub lock; remove stops the channel's thread, closes its transport,
drops its in-memory password and, if asked, its entry in the app's `known_hosts` (only when no other channel uses that host and port). The
local channel cannot be removed. The app's key line stays in the server's `authorized_keys` (the UI says which comment to look for).

`GET api/sshconfig` is a prefill helper for 서버 추가: it reads only `%USERPROFILE%\.ssh\config` (POSIX `~/.ssh/config`), at most 256 KB,
and returns up to 100 `{alias, host, user, port, jump, skipped?}` for the plain aliases of its `Host` lines (values first-match-wins as in ssh;
wildcard / negated patterns are not entries). `Match` blocks are skipped, `Include` is not followed, files named by `IdentityFile` are never opened,
and no other key's value is returned; `ProxyJump` / `ProxyCommand` only become `jump: true` (shown as not supported). Nothing from it is saved or run.

## Local web surface

Every path is under `/<secret>/` (random per launch); other paths return 404. POSTs need a per-launch token and a matching `Host`; an `Origin` header, if sent, must match, and the talk endpoints require it.
GETs (`api/channels`, `api/state`, `api/presets`, `api/app`, `api/key`, `api/sshconfig`, `api/servers/job`) need the session cookie but no token (`api/key` and `api/sshconfig` are refused under `--insecure`); `Host` patterns of the SSH config are matched without regular expressions and with caps on patterns and time;
POSTs include `api/servers` (+ `job/confirm`, `job/cancel`, `forget-hostkey`, `rename`, `move`, `remove`), `api/channels/retry`, `api/talk`, `api/end`. Responses carry `X-Frame-Options` and a restrictive CSP.

## Agent states

Each node has `st` (work, tool, child, user, stall, idle, done, stopped, dead) and a Korean `why`. A turn that ended with a plain
answer is `done` ("답변 완료"); it is `user` ("질문함 · 답변 기다림") only when the final assistant text asks something (ends with `?`,
or an ask cue such as 할까요 / 진행할까요 / should I / would you like in its last sentences; code blocks and quotes are ignored).
Approvals, questions to answer, usage limits, interrupts and orphaned turns stay `user`. An answered main session older than six hours
reads as `idle`. Older collectors still send `user` + "답변 끝남"; the UI reads that as `done`.

In the UI, "안읽음" counts waits the user has not read: opening a waiting room, or "모두 읽음", records the episode (its state,
reason and start time) in `room.ui` and drops it from the badges, notifications and the dungeon '!'; a new episode alerts again.
"작업 완료" / "작업 완료 · 방 나가기" in a waiting room makes the view treat that episode as done (and hides the room for the latter);
nothing is sent to the agent, and the mark clears itself when the session works or waits again.

## Talk

UI -> `POST api/talk` (secret path, token, and a required `Origin`) -> hub. For an ssh channel the hub writes one JSON request line on the same
SSH stdin/stdout pipe as polling: a line starting with `{` is a request answered by one JSON reply line, a bare newline is still a poll. The collector on the
server then writes to the target Claude Code session's inbox socket, or runs `codex app-server proxy` for one send. Delivery is observed only in the
session transcript. Each node may carry `msgs` (up to 8 entries: `dir` down/follow/up, `kind`, `from`, `to`, `who`, `ts`, redacted `text`, `encrypted`, and `msg_id`/`by` for talks) and `talk`
(`{ok, hold?, max}` or `{ok:false, reason}`); both are optional, so older readers ignore them.

## Model

Each node may carry `model` (what answered last, e.g. `claude-opus-5-5`), `model_prev` (the different model before it, seen within the transcript tail only) and
`model_fb` (true when the newest change is a Claude Code `model_refusal_fallback` safeguard reroute that is still in effect). The UI shows `model` as a chip on the
wiring-map cards (`R.shortModel`: `opus-5.5`), marked `⇄` when `model_prev` is set, and in the warning colour while `model_fb` holds.

## Ending a session

UI -> `POST api/end {ch, id, pid, idle?}` (secret path, token, and a required `Origin`, like talk) -> hub -> the same pipe as talk
(`{"op":"end", msg_id, tool, id, pid, idle}`). `pid` is the process the page showed when the user confirmed: the hub refuses (`changed`) when
its snapshot names another one. The collector collects again and requires the node to still carry `end.ok` with that pid (else `gone` / `refused`),
a process list that was really re-read (`stale` otherwise: on Windows a failed listing keeps an old snapshot), and with `idle` (유휴 세션 정리)
a session that is still resting (`active` otherwise). Then it sends SIGTERM, SIGKILL after 5 s, and SIGTERM to the child processes the session
left, each only while its start time still matches (Windows: the creation time is compared again, then `taskkill /T /F`).
The reply is `{msg_id, outcome: ended|gone|refused|failed|unreachable, reason?}`.
Nodes carry `end` = `{ok: true, pid}` or `{ok: false, reason}` (`self`, `owner`, `shared`). It is never automatic and never done for subagents, for the
collector's own ancestors, for another user's process, for a codex process that hosts several sessions (on Windows: one whose command line does not
name the thread), or for a claude session whose `sessions/<pid>.json` does not vouch for its process (no `procStart`, a file that is not its pid's
own, two files claiming one session, a `node` process not running claude). `"end": false` in `channels.json` turns it off (`GET api/app` reports `end_on`).

## Private files (Windows)

`run.json` (the hub's secret and token), `channels.json` and `agen-talk.log` are created with a protected DACL that names only the current user
(`private_fd`: the DACL is part of `CreateFile`, so nobody with inherited access to the profile folder, such as a sandbox group, can hold a handle
from before it applied). Files written by older versions get the same DACL at the next start (`pm_acl`).

## Release

`.github/workflows/release.yml` (tag `v*`): verify the UI build, selftests, make the icon, PyInstaller (onedir, windowed),
smoke-test the exe, Inno Setup installer (per user, no admin), portable zip, `SHA256SUMS`, GitHub Release.
`.github/workflows/ci.yml` runs the selftests (Python 3.8 stdlib-only, and 3.12 with paramiko), the UI/hygiene checks and the
UI dev selftest (`ui/build.py --dev`, headless Chrome with `?talkfx=1&selftest=1`) on every push and pull request; a manual
run (workflow_dispatch) also builds the PyInstaller app and runs the frozen `AgenTalk.exe --selftest`.
The installer deletes `{app}\_internal` before copying, so an upgrade never mixes old and new runtime files.

Supply chain: the build installs `packaging/requirements-build.lock` with `pip install --require-hashes` (every package,
transitive ones included, pinned by version and sha256; `packaging/requirements-build.txt` is the human-edited input and its
header says how to regenerate the lock with pip-compile on Windows/Python 3.12). Every `uses:` action is pinned to a full
commit SHA (tag in the trailing comment), and the Inno Setup fallback installs a pinned Chocolatey version. The release workflow
signs SLSA build provenance for the Setup exe, the portable zip and `SHA256SUMS` (`actions/attest-build-provenance`; only the
`build` job gets `id-token: write` / `attestations: write`). To verify a download (needs the GitHub CLI):
`gh attestation verify <file> --repo Ben-JWL/agen_talk`; then check the other files against the verified `SHA256SUMS`.
