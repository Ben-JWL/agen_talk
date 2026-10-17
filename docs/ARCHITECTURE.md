# Architecture

```
 Windows PC                                        Linux server (nothing installed)
+--------------------------------------------+    +-----------------------------------+
| AgentRoom.exe (app.py, PyInstaller)        |    |                                   |
|  - pywebview window -> WebView2            |    |  python3 -c <agent_room.py>       |
|  - hub (agent_room.py, in process)  ---ssh stdin/stdout--->  collector ("pipe" mode) |
|      127.0.0.1:<port>/<secret>/  (UI + API)|    |  reads /proc, ~/.codex, ~/.claude, |
|  - local channel: reads this PC's agents   |    |  ~/.gemini  (read-only)           |
+--------------------------------------------+    +-----------------------------------+
```

## Pieces

- `agent_room.py`: stdlib-only, Python 3.8+. It is the collector (runs anywhere), the hub (HTTP server, channel threads), and the CLI. The same file is streamed to servers, so it must stay dependency-free.
- `app.py`: the Windows entry point. Starts the hub in process, opens a pywebview window, enforces a single instance, stops everything when the window closes. Falls back to a Chrome/Edge `--app` window when WebView2 is absent.
- `index.html`: the whole UI in one file with no external requests. It is built from `ui/src/*` by `ui/build.py` (files concatenated in name order) and the built file is committed; CI fails if they differ.
- `channels.example.json`: starter config (the local channel, no servers). The real file lives in `%APPDATA%\AgentRoom\channels.json`.

## Channels

A channel is one machine: `local` (this PC) or `ssh`. The hub polls each channel on its own thread, merges agent
sessions into one model, and serves it to the UI. An ssh channel runs `ssh <target> python3 -c <bootstrap>`; the
bootstrap reads the collector source from stdin. Closing the ssh session ends the collector.

## Local web surface

Every path is under `/<secret>/` (random per launch); other paths return 404. POSTs need a per-launch token and a matching `Host`; an `Origin` header, if sent, must match, and the talk endpoints require it. Responses carry `X-Frame-Options` and a restrictive CSP.

## Talk

UI -> `POST api/talk` (secret path, token, and a required `Origin`) -> hub. For an ssh channel the hub writes one JSON request line on the same
ssh stdin/stdout pipe as polling: a line starting with `{` is a request answered by one JSON reply line, a bare newline is still a poll. The collector on the
server then writes to the target Claude Code session's inbox socket, or runs `codex app-server proxy` for one send. Delivery is observed only in the
session transcript. Each node may carry `msgs` (up to 8 entries: `dir` down/follow/up, `kind`, `from`, `to`, `who`, `ts`, redacted `text`, `encrypted`, and `msg_id`/`by` for talks) and `talk`
(`{ok, hold?, max}` or `{ok:false, reason}`); both are optional, so older readers ignore them.

## Release

`.github/workflows/release.yml` (tag `v*`): verify the UI build, selftests, make the icon, PyInstaller (onedir, windowed),
smoke-test the exe, Inno Setup installer (per user, no admin), portable zip, `SHA256SUMS`, GitHub Release.
`.github/workflows/ci.yml` runs the selftests and the UI/hygiene checks on every push and pull request.
