# agen-talk

**상황실 (Agent Room)** is a desktop dashboard for the AI coding agents (Codex, Claude Code, Antigravity CLI)
running on your PC and on the Linux servers you can SSH into. Every agent gets a chat-like room that shows what
it is for, what it is doing now, and whether it is really working. Rooms that are waiting for you (approval,
question, stalled) are pinned on top with a red badge, and Windows notifications tell you when something needs you.

<!-- screenshots: add the files under docs/ and uncomment -->
<!-- ![Rooms](docs/screenshot-rooms.png) -->
<!-- ![Add server](docs/screenshot-add-server.png) -->

Windows 10/11, no admin rights, nothing installed on your servers.

## Install

1. Open the [Releases](../../releases) page and download `AgentRoom-Setup-<version>.exe`.
2. Run it. It installs per user (`%LOCALAPPDATA%\Programs\AgentRoom`), adds a Start-menu entry and optionally a desktop shortcut.
3. Check the download against `SHA256SUMS` from the same release (`certutil -hashfile <file> SHA256`).

**SmartScreen.** The installer is not code-signed yet, so Windows shows "Windows protected your PC".
Click **More info**, then **Run anyway**.

**Company policy blocks it?** Some organisations block unsigned apps. Use one of these instead:
- the **portable zip** (`AgentRoom-<version>-portable.zip`): unzip anywhere and run `AgentRoom.exe` (may still be blocked), or
- **run from source** with Python 3.8+: `python app.py` (the window needs `pip install pywebview`; without it a Chrome/Edge app window is used. SSH falls back to OpenSSH when paramiko is not installed; its console may ask you to confirm the fingerprint and enter the password.)

The window uses Microsoft Edge WebView2, which is part of current Windows 10/11. If it is missing the app falls
back to a Chrome/Edge window and tells you how to install WebView2.

## First run

1. Start **상황실 (Agent Room)**. Your own PC is already listed.
2. Add a server: **서버 추가** (add server), enter the server address, account, and password in the app. On first contact,
   compare the displayed server fingerprint with one from its administrator before confirming. The app creates a dedicated key
   and trust store under `%APPDATA%\AgentRoom` (`id_ed25519` and `known_hosts`), registers the key, and never asks for the
   password again. If the server allows password login but refuses key login, choose the session-password option; that password
   stays in memory until the app closes.
3. If someone shared a server list with you (a `presets.json` file), choose **서버 목록 가져오기** (import server list) and pick the file.
   The servers then appear with a **연결하기** (connect) button. Nothing like this ships in the app: the list stays private to whoever made it.
   Format: `{"presets": [{"name": "GPU box", "host": "gpu.example.com", "port": 22}]}`.
4. Settings: turn on **Windows 알림** to be told about waiting, stalled, or disconnected agents.

The installed app uses its in-app SSH client. OpenSSH is used only when running the source-mode fallback.

### Source-mode OpenSSH fallback: "Bad owner or permissions" on an Entra-joined PC

On work PCs joined to Entra ID the SSH config file often has the wrong owner. The app shows a copy button with this
fix for the source-mode OpenSSH config; run it in PowerShell:

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
- Obvious secrets (API keys, tokens, private keys, `password=` values) are masked as `[가려짐]` in displayed instructions.
- The page is served with a strict Content-Security-Policy.
- Whether a Claude Code session accepts messages from other sessions is that session's own choice: the `crossSessionInbound`
  setting (`accept`, `hold` or `refuse`) in Claude Code's settings. The app reads it and respects it; it never changes it.

## How the server side works

Nothing is installed on the servers. For each server the app uses its built-in SSH connection and streams its own collector
(`agent_room.py`, pure Python standard library) to `python3 -c` over that session. The collector reads your agents'
state read-only (`/proc`, `~/.codex`, `~/.claude`, `~/.gemini`) and prints one JSON line per request. When the window
closes or the connection drops, the session ends and the collector exits with it. Requirement: `python3` 3.8 or newer on the server.

## Security model

- The dashboard listens on `127.0.0.1` only, on a free port.
- Every launch makes a new random secret and serves everything under `http://127.0.0.1:<port>/<secret>/`. Any other path is a 404, so other users on the same PC (fast user switching, remote desktop) cannot read the dashboard.
- Changing requests need a per-launch token and a matching `Host`; an `Origin` header, if sent, must match, and the talk endpoints require it.
- No data leaves your PC except over your own SSH connections to servers you added. There is no telemetry, no account, no cloud service.
- The server password is entered in the app and held only while the add-server job runs; the session-password option lasts only until the app closes. Unknown server fingerprints require confirmation; changed fingerprints are rejected.
- The dedicated key and trusted server fingerprints live at `%APPDATA%\AgentRoom\id_ed25519` and `%APPDATA%\AgentRoom\known_hosts`. If paramiko is unavailable, OpenSSH fallback uses `%USERPROFILE%\.ssh\agent_room_ed25519`.
- Config lives in `%APPDATA%\AgentRoom\channels.json`, logs in `%LOCALAPPDATA%\AgentRoom\agent-room.log`.

## Uninstall

Settings > Apps > Installed apps > 상황실 (Agent Room) > Uninstall. Your servers and settings in `%APPDATA%\AgentRoom` are kept
(delete that folder yourself for a clean slate).

To also revoke access, remove the line ending in `agent-room@<your PC name>` from `~/.ssh/authorized_keys` on each server,
then delete `%APPDATA%\AgentRoom\id_ed25519`, `%APPDATA%\AgentRoom\id_ed25519.pub`, and `%APPDATA%\AgentRoom\known_hosts` on your PC.

## Build from source

```
python ui/build.py                      # ui/src -> ui/dist/index.html (copy over index.html when you change the UI)
python agent_room.py --selftest         # collector + hub tests
python app.py --selftest
pip install -r packaging/requirements-build.txt
python packaging/make_icon.py
pyinstaller packaging/agent_room.spec --noconfirm --distpath build/dist --workpath build/work
iscc /DAppVersion=0.1.0 packaging\installer.iss     # needs Inno Setup 6
```

Releases are built by `.github/workflows/release.yml` when a `v*` tag is pushed. See `docs/ARCHITECTURE.md` for how the pieces fit.
Dashboard only, without the app: `python agent_room.py hub` (Python 3.8+, standard library only).

## License

[MIT](LICENSE). Third-party components: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
