# Architecture

```
 Windows PC                                        Linux server (nothing installed)
+--------------------------------------------+    +-----------------------------------+
| AgenTalk.exe (app.py, PyInstaller)        |    |                                   |
|  - pywebview window -> WebView2            |    |  python3 -c <agen_talk.py>       |
|  - hub (agen_talk.py, in process)  ---SSH stdin/stdout--->  collector ("pipe" mode) |
|      127.0.0.1:<port>/<secret>/  (UI + API)|    |  reads /proc, ~/.codex, ~/.claude, |
|  - local channel: reads this PC's agents   |    |  ~/.gemini  (read-only)           |
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
(the user's `~/.ssh/config` and `known_hosts` are not used), and runs `python3 -I -c <bootstrap>` on the server; the
bootstrap reads the collector source from stdin. Closing the SSH session ends the collector.

OpenSSH (`ssh -T ... -- <target> python3 -I -c <bootstrap>`) is only a fallback: when paramiko cannot be imported (a source
run without it) or when a channel's hand-written `ssh_args` use an option the in-app client does not support (anything but
`-i`, `-p`, `-o IdentitiesOnly=...`). In that mode 서버 추가 creates and installs `%USERPROFILE%\.ssh\agen_talk_ed25519` and uses
the user's `~/.ssh/known_hosts`. Both keys carry the comment `agen-talk@<PC name>`; to revoke, remove that line from the server's
`~/.ssh/authorized_keys` and delete the key files.

## Local web surface

Every path is under `/<secret>/` (random per launch); other paths return 404. POSTs need a per-launch token and a matching `Host`; an `Origin` header, if sent, must match, and the talk endpoints require it. Responses carry `X-Frame-Options` and a restrictive CSP.

## Talk

UI -> `POST api/talk` (secret path, token, and a required `Origin`) -> hub. For an ssh channel the hub writes one JSON request line on the same
SSH stdin/stdout pipe as polling: a line starting with `{` is a request answered by one JSON reply line, a bare newline is still a poll. The collector on the
server then writes to the target Claude Code session's inbox socket, or runs `codex app-server proxy` for one send. Delivery is observed only in the
session transcript. Each node may carry `msgs` (up to 8 entries: `dir` down/follow/up, `kind`, `from`, `to`, `who`, `ts`, redacted `text`, `encrypted`, and `msg_id`/`by` for talks) and `talk`
(`{ok, hold?, max}` or `{ok:false, reason}`); both are optional, so older readers ignore them.

## Release

`.github/workflows/release.yml` (tag `v*`): verify the UI build, selftests, make the icon, PyInstaller (onedir, windowed),
smoke-test the exe, Inno Setup installer (per user, no admin), portable zip, `SHA256SUMS`, GitHub Release.
`.github/workflows/ci.yml` runs the selftests (Python 3.8 stdlib-only, and 3.12 with paramiko), the UI/hygiene checks and the
UI dev selftest (`ui/build.py --dev`, headless Chrome with `?talkfx=1&selftest=1`) on every push and pull request; a manual
run (workflow_dispatch) also builds the PyInstaller app and runs the frozen `AgenTalk.exe --selftest`.
The installer deletes `{app}\_internal` before copying, so an upgrade never mixes old and new runtime files.
