# agen_talk

**에겐 톡 (Agen Talk)** is a desktop dashboard for the AI coding agents (Codex, Claude Code, Antigravity CLI)
running on your PC and on the Linux servers you can SSH into. Every agent gets a chat-like room that shows what
it is for, what it is doing now, and whether it is really working. Rooms that are waiting for you (approval,
question, stalled) are pinned on top with a red badge, and Windows notifications tell you when something needs you.

<!-- screenshots: add the files under docs/ and uncomment -->
<!-- ![Rooms](docs/screenshot-rooms.png) -->
<!-- ![Add server](docs/screenshot-add-server.png) -->

Windows 10/11, no admin rights, nothing installed on your servers.

## Install

1. Open the [Releases](../../releases) page and download `AgenTalk-Setup-<version>.exe`.
2. Run it. It installs per user (`%LOCALAPPDATA%\Programs\AgenTalk`), adds a Start-menu entry and optionally a desktop shortcut.
3. Check the download against `SHA256SUMS` from the same release (`certutil -hashfile <file> SHA256`).

**SmartScreen.** The installer is not code-signed yet, so Windows shows "Windows protected your PC".
Click **More info**, then **Run anyway**.

**Company policy blocks it?** Some organisations block unsigned apps. Use one of these instead:
- the **portable zip** (`AgenTalk-<version>-portable.zip`): unzip anywhere and run `AgenTalk.exe` (may still be blocked), or
- **run from source** with Python 3.8+: `python app.py` (the window needs `pip install pywebview`; without it a Chrome/Edge app window is used. SSH uses the in-app client when `pip install paramiko` is done, and falls back to OpenSSH when paramiko is not installed; its console may ask you to confirm the fingerprint and enter the password.)

The window uses Microsoft Edge WebView2, which is part of current Windows 10/11. If it is missing the app falls
back to a Chrome/Edge window and tells you how to install WebView2.

## First run

1. Start **에겐 톡 (Agen Talk)**. Your own PC is already listed.
2. Add a server: **서버 추가** (add server), enter the server address, account, and password in the app. On first contact,
   compare the displayed server fingerprint with one from its administrator before confirming. The app creates a dedicated key
   and trust store under `%APPDATA%\AgenTalk` (`id_ed25519` and `known_hosts`), registers the key, and never asks for the
   password again. If the server allows password login but refuses key login, choose the session-password option; that password
   stays in memory until the app closes.
3. If someone shared a server list with you (a `presets.json` file), choose **서버 목록 가져오기** (import server list) and pick the file.
   The servers then appear with a **연결하기** (connect) button. Nothing like this ships in the app: the list stays private to whoever made it.
   Format: `{"presets": [{"name": "GPU box", "host": "gpu.example.com", "port": 22}]}`.
4. Settings: turn on **Windows 알림** to be told about waiting, stalled, or disconnected agents.

The installed app uses its in-app SSH client (paramiko). OpenSSH is used only as a fallback: when a source run has no
paramiko, or for a server whose hand-edited `ssh_args` in `channels.json` use an option other than `-i`, `-p` or
`-o IdentitiesOnly=...` (for example `-o ProxyJump=...`).

### OpenSSH fallback: "Bad owner or permissions" on an Entra-joined PC

On work PCs joined to Entra ID the SSH config file often has the wrong owner. This only matters for the OpenSSH
fallback (the in-app client never reads `~/.ssh/config`). The app shows a copy button with this fix; run it in PowerShell:

```powershell
$f = "$env:USERPROFILE\.ssh\config"; $me = whoami; icacls $f /setowner $me; icacls $f /inheritance:r /grant:r "${me}:F"
```

## Talk (톡)

**Seeing instructions.** When an agent hands work to a child, the child's room shows the parent's instruction as a card
(follow-ups too), and the parent's room shows the child's report. The **흐름** toggle in a room header draws the whole
tree of who told whom. Codex encrypts its instruction bodies, so those cards show as locked (🔒) with no text.

**Sending a talk.** In some rooms you can type a message and send it to the agent (Enter opens a confirm card, Enter again sends; Shift+Enter adds a line).

- **Claude Code**: the main (interactive) session of a Claude Code running on a Linux server. The message arrives as a message
  from another session, with reduced (peer) authority. It never appears as your own input and can never approve a permission prompt.
  If the session was started with `--dangerously-skip-permissions`, the message is held until you approve it in that terminal
  (the room shows 터미널에서 승인 대기, and 만료됨 after about 5 minutes). Otherwise the room shows 전달됨 once it lands.
- **Codex**: only threads hosted by the codex app-server daemon can be reached. A TUI started with `--no-daemon` is view-only.
  The app never answers a codex approval or any other request from codex: if one reaches its connection, it disconnects and leaves the prompt to your own codex window.
- **Not supported in v1**: sessions on the local Windows PC, subagents, and Antigravity CLI. The room shows why the box is disabled.

**Privacy and safety.**
- Settings > **톡 보내기 허용** turns sending off everywhere; the hub enforces it too. Viewing the flow stays on.
- The message text is never written to the app log; each send leaves one audit line (target, length, outcome).
- The window keeps a local cache so rooms survive a restart: the talks you sent, the agents' instructions and reports, and
  the activity lines shown in rooms (including commands the agents ran). It lives in the WebView2 profile under
  `%LOCALAPPDATA%\AgenTalk\webview`, is kept about 24 hours and is pruned on the next start (the 알림 feed, which can
  include process command lines, keeps up to 500 entries for 7 days). In the Chrome/Edge fallback window the same data
  sits in that browser's site data for `127.0.0.1`.
- Obvious secrets (API keys, tokens, private keys, `password=` values) are masked as `[가려짐]` in displayed instructions.
- The page is served with a strict Content-Security-Policy.
- Whether a Claude Code session accepts messages from other sessions is that session's own choice: the `crossSessionInbound`
  setting (`accept`, `hold` or `refuse`) in Claude Code's settings. The app reads it and respects it; it never changes it.

## How the server side works

Nothing is installed on the servers. For each server the app uses its built-in SSH connection and streams its own collector
(`agen_talk.py`, pure Python standard library) to `python3 -c` over that session. The collector reads your agents'
state read-only (`/proc`, `~/.codex`, `~/.claude`, `~/.gemini`) and prints one JSON line per request. When the window
closes or the connection drops, the session ends and the collector exits with it. Requirement: `python3` 3.8 or newer on the server.

## Security model

- The dashboard listens on `127.0.0.1` only, on a free port.
- Every launch makes a new random secret and serves everything under `http://127.0.0.1:<port>/<secret>/`. Any other path is a 404, so other users on the same PC (fast user switching, remote desktop) cannot read the dashboard.
- Changing requests need a per-launch token and a matching `Host`; an `Origin` header, if sent, must match, and the talk endpoints require it.
- No data leaves your PC except over your own SSH connections to servers you added. There is no telemetry, no account, no cloud service.
- The server password is entered in the app and held only while the add-server job runs; the session-password option lasts only until the app closes. Unknown server fingerprints require confirmation; changed fingerprints are rejected.
- The dedicated key and trusted server fingerprints live at `%APPDATA%\AgenTalk\id_ed25519` and `%APPDATA%\AgenTalk\known_hosts`. If paramiko is unavailable, OpenSSH fallback uses `%USERPROFILE%\.ssh\agen_talk_ed25519`.
- Config lives in `%APPDATA%\AgenTalk\channels.json`; logs (`agen-talk.log`) and the window's WebView2 profile (`webview\`, see Privacy above) live in `%LOCALAPPDATA%\AgenTalk`.

## Uninstall

Settings > Apps > Installed apps > 에겐 톡 (Agen Talk) > Uninstall. The uninstaller removes the program only. Your servers and
settings in `%APPDATA%\AgenTalk` and the logs and cached room contents in `%LOCALAPPDATA%\AgenTalk` are kept. For a full
removal delete both folders yourself.

To also revoke access, remove the line ending in `agen-talk@<your PC name>` from `~/.ssh/authorized_keys` on each server,
then delete `%APPDATA%\AgenTalk\id_ed25519`, `%APPDATA%\AgenTalk\id_ed25519.pub`, and `%APPDATA%\AgenTalk\known_hosts` on your PC.
If you ever used the OpenSSH fallback, also delete `%USERPROFILE%\.ssh\agen_talk_ed25519` and `%USERPROFILE%\.ssh\agen_talk_ed25519.pub`
(that key carries the same `agen-talk@<your PC name>` comment).

## Build from source

```
python ui/build.py                      # ui/src -> ui/dist/index.html (copy over index.html when you change the UI)
python agen_talk.py --selftest         # collector + hub tests
python app.py --selftest
pip install -r packaging/requirements-build.txt
python packaging/make_icon.py
pyinstaller packaging/agen_talk.spec --noconfirm --distpath build/dist --workpath build/work
iscc /DAppVersion=0.1.0 packaging\installer.iss     # needs Inno Setup 6
```

Releases are built by `.github/workflows/release.yml` when a `v*` tag is pushed. See `docs/ARCHITECTURE.md` for how the pieces fit.
Dashboard only, without the app: `python agen_talk.py hub` (Python 3.8+, standard library only).

## License

[MIT](LICENSE). Third-party components: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
