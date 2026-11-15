# 에겐 톡 · Agen Talk

[![CI](https://github.com/Ben-JWL/agen_talk/actions/workflows/ci.yml/badge.svg)](https://github.com/Ben-JWL/agen_talk/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/Ben-JWL/agen_talk?include_prereleases&sort=semver)](https://github.com/Ben-JWL/agen_talk/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/Ben-JWL/agen_talk/total)](https://github.com/Ben-JWL/agen_talk/releases)
![Windows 10 | 11](https://img.shields.io/badge/Windows-10%20%7C%2011-0078D6)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**English** · [한국어](README.ko.md)

**All the AI coding agents you are running — Claude Code, Codex, Antigravity — in one window, like a chat app.**

## See it in action

![Overview, pixel dungeon, a room and the board](docs/img/demo.gif)

<sub>Sample data. The app's interface is in Korean; [What the buttons mean](#what-the-buttons-mean) has the translations.</sub>

## Install

- **Windows installer (recommended):** download `AgenTalk-Setup-<version>.exe` from the [latest release](https://github.com/Ben-JWL/agen_talk/releases/latest) and run it.
  - No admin rights needed: it installs for your user only.
  - The installer is not code-signed yet, so Windows may say *"Windows protected your PC"*. Click **More info → Run anyway**. See [Code signing policy](#code-signing-policy).
  - To update, run the new installer over the old one. Your servers and settings are kept.
- **Portable:** download `AgenTalk-<version>-portable.zip`, unzip it anywhere and run `AgenTalk.exe`.
- **From source** (Python 3.8+, any OS for the collector, Windows for the app window): see [Development](#development).

Windows 10 or 11 (64-bit) with Microsoft Edge WebView2, which current Windows versions already have. To watch a server you only need SSH access and `python3` 3.8+ there. Nothing gets installed on the server.

## Features

- **One room per agent.** Every Claude Code, Codex and Antigravity session on your PC and on your SSH servers shows up on its own. Each room says what the agent is for, what it is doing right now, and whether it is really working.
- **Unread, on top.** Approval requests, questions and stalled agents go under a red **안읽음** (unread) section with a Windows notification, like a messenger. Opening the room marks it read; a new wait alerts again. A button copies the command an agent is waiting to run, and **작업 완료** closes out a room you're done with.
- **Colour palettes.** Pick 기본 or a Claude, ChatGPT, Gemini, Grok or Muse style palette for the whole app, each in light and dark.
- **Overview.** When no room is open, a wiring map shows every server → project → agent → subagent, live. Each card shows its model (e.g. `opus-5.5`). If the model changed during the session, a `⇄` chip appears; it turns to the warning colour while a safeguard reroute (Claude Code falling back from one model to another) is in effect. The tooltip and session info show *before → after*.
- **Pixel dungeon (fun mode).** Optional: the overview becomes an animated pixel-art dungeon. Each server is a floor, each git project a chamber, each agent a hero and each subagent its companion. Five fan themes (Claude, ChatGPT, Gemini, Grok, Muse style) in light and dark. What an agent is doing decides what its hero does:
  - thinking or answering: **수련** (training at a dummy)
  - reading or searching files: **탐험** (exploring with a torch)
  - editing files: **제작** (forging at the anvil)
  - running commands or tests: **전투** (fighting a monster; a long run meets a boss)
  - web search: **정찰** (scouting)
  - waiting on subagents: **소환** (summoning)
  - waiting for your input: **관문** (at a locked door, red `!` until you read it)
  - no response: **거미줄** (stuck in a web)
  - idle: **야영** (camping; a long-idle camp looks abandoned)
  - done: **전리품** (treasure chest)
  - stopped: **쓰러짐** (fallen)
  - connection lost: **묘비** (tombstone)
- **Projects.** Agents are grouped by the git repository they work in, read from the repo's files, so the same repo groups together across machines.
- **Who told whom.** Instructions from a main agent to its subagents, and their reports, appear as cards and as a flow tree.
- **Talk.** You can send a short message into a running Claude Code or Codex session on a Linux server.
- **Tidy up.** Hide finished rooms in one click; they come back by themselves if the session wakes up.
- **End sessions.** A **세션 종료** (End session) button in each room's header stops that agent's process on its machine, after a confirmation. When sessions have rested longer than a threshold you choose (1 hour to 7 days, default 1 day) and their process is still running, the overview shows **유휴 세션 N** (N idle sessions); it opens a dialog where you pick and end several at once. Subagents are never ended on their own, and other users' sessions and a session Agen Talk itself runs under are never touched. Stopping a process also stops whatever the agent was doing. Set `"end": false` in `%APPDATA%\AgenTalk\channels.json` to turn this off.
- **Private by design.** No account, no cloud, no telemetry. Data moves only over your own SSH connections.

## Screenshots

| | |
|---|---|
| [![Overview: wiring map](docs/img/overview.png)](docs/img/overview.png) **Overview**: server → project → agent | [![Pixel dungeon](docs/img/dungeon.png)](docs/img/dungeon.png) **Pixel dungeon**: fun mode, Claude style |
| [![Pixel dungeon, dark](docs/img/dungeon-dark.png)](docs/img/dungeon-dark.png) **Pixel dungeon**: Gemini style, dark | [![A room](docs/img/room.png)](docs/img/room.png) **A room** with sent talks and their delivery state |
| [![Board](docs/img/board.png)](docs/img/board.png) **Board**: unread, working, waiting, done | [![Settings](docs/img/settings.png)](docs/img/settings.png) **Settings**: theme, fun mode, notifications, servers |

## Getting started

1. **See your agents.** Start your agents as usual and open **에겐 톡 (Agen Talk)** from the Start menu. Agents on this PC appear right away; the ones that need you are listed first under **안읽음** (unread).
2. **Add a Linux server (optional).** Click the **gear** (Settings), then **서버 추가** (Add server). Enter the address, your account and password.
   - The first time, the app shows the server's *fingerprint*, a short code that identifies that machine. Compare it with the one from your administrator if you have it.
   - The app then installs its own key, forgets the password and connects without asking from then on.
   - If the server refuses key login, choose the session password option: it stays in memory until the app closes.
   - You can paste `user@host:2222`, `ssh -p 2222 user@host` or `ssh://user@host:2222` into the address field (IPv6 works too); **내 SSH 설정에서 고르기** (pick from my SSH config) fills the form from a `Host` entry in `~/.ssh/config`. Nothing is saved until you connect, and jump hosts (ProxyJump) are not supported yet.
   - Password login turned off on the server? The app shows its public key and a one-line command to add it to `~/.ssh/authorized_keys`; run it from a terminal that can already log in, then press **키를 등록했습니다 — 다시 연결** (I added the key — connect again).
   - Settings → 채널 → **⋯** on a server: rename, change its address / account / port, move it up or down, or delete it.
   - Got a server list from a teammate? Use **서버 목록 가져오기** (Import server list) with their `presets.json`, which looks like `{"presets": [{"name": "GPU box", "host": "gpu.example.com", "port": 22}]}`.
3. **Notifications.** Settings → **Windows 알림** → on.
4. **Overview and fun mode.** Close a room (**‹ 오버뷰** or Esc) to see the overview. Switch between **배선 지도** (wiring map) and **픽셀 던전** (pixel dungeon) at the top right; Settings → 화면 has **재미 모드** (fun mode) and **오버뷰 테마** (overview theme).
5. **Tidy up.** At the bottom of the list, **완료된 방 N개 정리** hides every finished room. **숨긴 방 N개 다시 보기** brings them back.
6. **Talk (optional).** In the room of a Claude Code or Codex session on a Linux server, type a message and press **Enter** twice: once to confirm, once to send.
   - The agent receives it as a message *from another session* and can never approve a prompt with it.
   - Sessions on the Windows PC itself, subagents and Antigravity cannot receive talks yet; the room says why.

## What the buttons mean

| Korean | Meaning |
|---|---|
| 오버뷰 · 배선 지도 · 픽셀 던전 | Overview · wiring map · pixel dungeon |
| 재미 모드 · 오버뷰 테마 | Fun mode · overview theme |
| 안읽음 · 읽음 · 모두 읽음 | Unread (approval, question or input) · read · mark all read |
| 작업 완료 · 작업 완료 · 방 나가기 | Mark done · mark done and leave the room (the agent keeps running) |
| 색 팔레트 · 테마 맞춤 | Colour palette · follow the pixel-dungeon theme |
| 승인 요청 · 명령 복사 | Approval request · copy the command |
| 작업 중 / 진행 중 | Working |
| 응답 없음 / 조용함 | Stalled / quiet for a while |
| 하위 대기 · 하위 에이전트 | Waiting on subagents · subagent |
| 끝남 / 완료 | Done |
| 중단됨 / 끊김 | Stopped / disconnected |
| 프로젝트 · 기타 | Project · other (no git repository) |
| 완료된 방 N개 정리 · 숨긴 방 N개 다시 보기 · 목록에서 숨기기 | Tidy N finished rooms · show N hidden rooms · hide this room |
| 보드 · 설정 | Board · Settings |
| 서버 추가 · 서버 목록 가져오기 · 연결하기 | Add server · import server list · connect |
| 내 PC · 채널 | This PC · a connected machine |
| 톡 · 보내기 · 전달됨 | Talk · send · delivered |
| 흐름 · 세션 정보 · 터미널 명령 복사 | Flow · session info · copy the command to open its terminal |
| ⇄ · 안전장치 재라우팅 | Model changed during the session · safeguard reroute (warning colour) |
| 세션 종료 · 유휴 세션 N | End session · N idle sessions |

Keyboard: **↑/↓** move between rooms, **Enter** opens, **Esc** goes back, **b** board, **,** settings, **r** refresh, **?** all shortcuts.

## Troubleshooting

- **An agent doesn't show up.** It must run under your Windows user, or under the same account on a server you added. Quiet rooms are collapsed under **N개 더 보기** (show N more); hidden ones under **숨긴 방 다시 보기**.
- **"SSH 연결이 끊겼습니다" (SSH disconnected).** Check the address, port and VPN. The card shows the SSH error; **지금 확인** (Check now) reconnects at once, and the app retries by itself at most once a minute (the card counts down to the next try). It also retries when the network comes back or the PC wakes up.
- **"서버에 python3 가 없습니다" (no python3).** Ask for Python 3.8+ on the server. If it is named differently (for example `python3.11`), set the server's `python` field in `%APPDATA%\AgenTalk\channels.json`.
- **It opened in Chrome/Edge instead of its own window.** WebView2 is missing: install the *Evergreen Runtime* from Microsoft and start the app again.
- **Projects show as 기타 (other).** The agent was started in a folder that is not inside a git repository.
- **Logs** are in `%LOCALAPPDATA%\AgenTalk\agen-talk.log` (Settings → 정보 shows the folder).

## Development

```bash
git clone https://github.com/Ben-JWL/agen_talk.git && cd agen_talk
pip install pywebview paramiko     # optional: without them a Chrome/Edge window and OpenSSH are used
python app.py                      # the desktop app
python agen_talk.py                # one-shot text view of your agents (--board, --json); stdlib only
python agen_talk.py --selftest && python app.py --selftest
python tools/check_ui.py           # ui/src must match index.html; rebuild with: python ui/build.py
python art/atlas/build.py          # pixel-dungeon sprites -> ui/src/72-atlas.js (--check to verify)
```

[Architecture](docs/ARCHITECTURE.md) · [Overview contract](docs/OVERVIEW-CONTRACT.md) · [Dungeon sprites](art/atlas/README.md) · [Changelog](CHANGELOG.md) · [Third-party notices](THIRD_PARTY_NOTICES.md)

Releases are built by GitHub Actions when a `v*` tag is pushed (`.github/workflows/release.yml`).

## Code signing policy

The Windows installer and executable are **not code-signed yet**, which is why SmartScreen warns. Instead:

- Every release is built from this repository by GitHub Actions, never on a personal machine. The build log is public.
- Each release ships `SHA256SUMS`. Check a download with `certutil -hashfile AgenTalk-Setup-<version>.exe SHA256`.
- Each file carries a signed build-provenance attestation. With the GitHub CLI, run `gh attestation verify AgenTalk-Setup-<version>.exe --repo Ben-JWL/agen_talk`; it proves the file was built by this repository's workflow.
- Build dependencies are pinned by hash (`packaging/requirements-build.lock`) and all workflow actions are pinned to commit SHAs.

The project will sign releases when a code-signing certificate is available.

### Privacy policy

- **No telemetry, no account, no cloud.** The app does not send anything anywhere except over SSH to servers you add yourself.
- **Local only.** The dashboard listens on `127.0.0.1` under a random path that changes every launch. The first page load starts a session cookie, so a copied URL is useless. Changing requests also need a per-launch token. Do not run `agen_talk.py hub --insecure` on a shared machine: in that mode every local account can read your agents' text.
- **Passwords are never stored.** The server password is used once to register the app's key. The session password option keeps it in memory until the app closes.
- **Your key.** The app's SSH key is kept unencrypted in `%APPDATA%\AgenTalk\id_ed25519`, readable only by your Windows user. On servers it is installed with `no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty`. Uninstalling does not remove it: delete the line ending in `agen-talk@<your PC name>` from each server's `~/.ssh/authorized_keys` when you stop using the app.
- **What stays on your PC.** For about 24 hours the window caches room contents so they survive a restart: agents' instructions, reports, activity lines including commands, and the talks you sent. They are kept in `%LOCALAPPDATA%\AgenTalk\webview`, unencrypted. Common secret patterns (API keys, tokens, private keys, passwords in URLs or `password=` values) are masked as `[가려짐]` in agent text, but masking is pattern-based and cannot catch everything.
- **Full removal.** Uninstall from Windows Settings → Apps, then delete `%APPDATA%\AgenTalk` and `%LOCALAPPDATA%\AgenTalk`.

Found a security problem? Please report it privately through the repository's [Security](https://github.com/Ben-JWL/agen_talk/security) tab instead of a public issue.

## Credits

The pixel dungeon's sprites come from the [Pixel Art Atlas](https://huggingface.co/datasets/Angais/pixel-art-atlas-1.4m) by Angais (CC0 1.0; AI-generated, see [art/atlas](art/atlas/README.md)). Sea of Stars, Eastward and the Octopath Traveler series were style references only; no assets were used. The fan themes borrow colours and moods from AI products; they use no logos or trademarks and are not affiliated with or endorsed by those companies.

## License

[MIT](LICENSE).
