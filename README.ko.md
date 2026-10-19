# 에겐 톡 · Agen Talk

[![CI](https://github.com/Ben-JWL/agen_talk/actions/workflows/ci.yml/badge.svg)](https://github.com/Ben-JWL/agen_talk/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/Ben-JWL/agen_talk?include_prereleases&sort=semver)](https://github.com/Ben-JWL/agen_talk/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/Ben-JWL/agen_talk/total)](https://github.com/Ben-JWL/agen_talk/releases)
![Windows 10 | 11](https://img.shields.io/badge/Windows-10%20%7C%2011-0078D6)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[English](README.md) · **한국어**

**돌리고 있는 AI 코딩 에이전트(Claude Code, Codex, Antigravity)를 메신저처럼 한 화면에서 봅니다.**

## 미리 보기

![오버뷰, 픽셀 오피스, 방, 보드](docs/img/demo.gif)

<sub>샘플 데이터로 찍은 화면입니다.</sub>

## 설치

- **Windows 설치 파일 (추천):** [최신 릴리스](https://github.com/Ben-JWL/agen_talk/releases/latest)에서 `AgenTalk-Setup-<버전>.exe`를 내려받아 실행합니다.
  - 관리자 권한이 필요 없습니다. 내 사용자 계정에만 설치됩니다.
  - 아직 코드 서명을 하지 않아서 *"Windows의 PC 보호"* 창이 뜰 수 있습니다. **추가 정보 → 실행**을 누르세요. [코드 서명 정책](#코드-서명-정책)을 참고하세요.
  - 업데이트할 때는 새 설치 파일을 그냥 실행하면 됩니다. 서버 목록과 설정은 그대로 남습니다.
- **포터블:** `AgenTalk-<버전>-portable.zip`을 아무 곳에 풀고 `AgenTalk.exe`를 실행합니다.
- **소스에서 실행** (Python 3.8 이상): [개발](#개발)을 보세요.

Windows 10/11(64비트)과 Microsoft Edge WebView2가 필요한데, 요즘 Windows에는 이미 들어 있습니다. 서버를 보려면 SSH 접속과 서버의 `python3` 3.8 이상만 있으면 되고, 서버에는 아무것도 설치하지 않습니다.

## 기능

- **에이전트마다 방이 하나씩.** 내 PC와 SSH 서버의 Claude Code, Codex, Antigravity 세션이 각각 방으로 나타납니다. 무엇을 위한 에이전트인지, 지금 무엇을 하는지, 정말 일하고 있는지 보입니다.
- **안읽은 방이 맨 위에.** 승인 요청, 질문, 멈춘 에이전트에 빨간 배지와 Windows 알림이 뜹니다. 방을 열면 읽음 처리되고, 새로 기다리기 시작하면 다시 알려 줍니다. 에이전트가 실행하려는 명령은 버튼 하나로 복사됩니다.
- **색 팔레트.** 앱 전체 색을 기본, Claude·ChatGPT·Gemini·Grok·Muse 풍 중에서 고를 수 있고, 각각 라이트/다크가 있습니다.
- **오버뷰.** 방을 열지 않았을 때 서버 → 프로젝트 → 에이전트 → 하위 에이전트를 배선 지도로 실시간 보여 줍니다.
- **픽셀 오피스 (재미 모드).** 원하면 오버뷰가 움직이는 픽셀 아트 사무실로 바뀝니다. 프로젝트마다 방이 하나씩 있고, 다섯 가지 팬 테마(Claude·ChatGPT·Gemini·Grok·Muse 풍)를 라이트/다크로 고를 수 있습니다.
- **프로젝트.** 에이전트가 일하는 git 저장소를 파일에서 읽어 묶습니다. 여러 서버의 같은 저장소도 한 프로젝트로 묶입니다.
- **누가 누구에게 시켰나.** 메인 에이전트가 하위 에이전트에게 준 지시와 받은 보고가 카드와 흐름 트리로 보입니다.
- **톡.** 리눅스 서버에서 돌고 있는 Claude Code나 Codex 세션에 짧은 메시지를 보낼 수 있습니다.
- **정리.** 끝난 방을 한 번에 숨깁니다. 세션이 다시 움직이면 저절로 돌아옵니다.
- **개인정보 우선.** 계정, 클라우드, 사용 통계 전송이 없습니다. 데이터는 내 SSH 연결로만 오갑니다.

## 스크린샷

| | |
|---|---|
| [![오버뷰: 배선 지도](docs/img/overview.png)](docs/img/overview.png) **오버뷰**: 서버 → 프로젝트 → 에이전트 | [![픽셀 오피스](docs/img/office.png)](docs/img/office.png) **픽셀 오피스**: 재미 모드, Claude 풍 |
| [![픽셀 오피스 다크](docs/img/office-dark.png)](docs/img/office-dark.png) **픽셀 오피스**: Gemini 풍, 다크 | [![방](docs/img/room.png)](docs/img/room.png) **방**: 보낸 톡과 전달 상태 |
| [![보드](docs/img/board.png)](docs/img/board.png) **보드**: 안읽음, 작업 중, 하위 대기, 끝남 | [![설정](docs/img/settings.png)](docs/img/settings.png) **설정**: 테마, 재미 모드, 알림, 서버 |

## 사용법

1. **에이전트 보기.** 에이전트는 평소처럼 실행하고, 시작 메뉴에서 **에겐 톡 (Agen Talk)** 을 엽니다. 내 PC의 에이전트가 바로 나타나고, 확인이 필요한 방은 빨간 **안읽음** 아래에 먼저 나옵니다. 방을 열면 읽음 처리되고, 끝난 일은 방 위쪽의 **작업 완료**로 정리할 수 있습니다.
2. **리눅스 서버 추가 (선택).** 왼쪽 아래 **톱니바퀴(설정)** → **서버 추가**를 누르고 주소, 계정, 비밀번호를 입력합니다.
   - 처음 한 번은 서버의 *지문(fingerprint)* 이 나옵니다. 그 서버를 알아보는 짧은 고유 코드입니다. 관리자에게 받은 값이 있으면 같은지 비교하세요.
   - 그다음 앱이 전용 키를 설치하고 비밀번호는 잊습니다. 다음부터는 묻지 않고 연결합니다.
   - 서버가 키 로그인을 막아 두었다면 **이번 세션 동안만 비밀번호로 연결**을 고르세요. 비밀번호는 앱을 닫을 때까지 메모리에만 있습니다.
   - 동료에게 서버 목록 파일을 받았다면 **서버 목록 가져오기**로 `presets.json`을 고르세요. 형식은 `{"presets": [{"name": "GPU 서버", "host": "gpu.example.com", "port": 22}]}`입니다.
3. **알림.** 설정 → **Windows 알림** → 켜기.
4. **오버뷰와 재미 모드.** 방을 닫으면(**‹ 오버뷰** 또는 Esc) 오버뷰가 보입니다. 오른쪽 위에서 **배선 지도**와 **픽셀 오피스**를 바꿀 수 있고, 설정 → 화면에 **재미 모드**와 **오버뷰 테마**가 있습니다.
5. **정리.** 목록 맨 아래 **완료된 방 N개 정리**를 누르면 끝난 방을 모두 숨기고, **숨긴 방 N개 다시 보기**로 되돌립니다.
6. **톡 (선택).** 리눅스 서버의 Claude Code나 Codex 세션 방에서 메시지를 쓰고 **Enter**를 두 번 누르세요. 첫 번째는 확인, 두 번째에 보냅니다.
   - 에이전트는 이 메시지를 *다른 세션이 보낸 메시지*로 받고, 권한 승인은 절대 대신하지 못합니다.
   - Windows PC 자체의 세션, 하위 에이전트, Antigravity에는 아직 보낼 수 없습니다. 이유는 방에 표시됩니다.

단축키: **↑/↓** 방 이동, **Enter** 열기, **Esc** 뒤로, **b** 보드, **,** 설정, **r** 새로고침, **?** 전체 단축키.

## 문제 해결

- **에이전트가 안 보여요.** 내 Windows 사용자, 또는 추가한 서버의 같은 계정으로 실행 중이어야 합니다. 조용한 방은 **N개 더 보기**, 숨긴 방은 **숨긴 방 다시 보기** 아래에 있습니다.
- **"SSH 연결이 끊겼습니다".** 주소, 포트, VPN을 확인하세요. 카드에 SSH 오류가 나오고, **지금 확인**을 누르면 바로 다시 시도합니다. 앱도 최대 1분 간격으로 알아서 다시 연결합니다.
- **"서버에 python3 가 없습니다".** 서버에 Python 3.8 이상을 요청하세요. 이름이 다르다면(예: `python3.11`) `%APPDATA%\AgenTalk\channels.json`에서 그 서버의 `python` 값을 고치면 됩니다.
- **전용 창 대신 Chrome/Edge 창으로 열려요.** WebView2가 없는 경우입니다. Microsoft에서 *Evergreen Runtime*을 설치한 뒤 다시 실행하세요.
- **프로젝트가 기타로 나와요.** 에이전트를 git 저장소 밖의 폴더에서 실행한 경우입니다.
- **로그**는 `%LOCALAPPDATA%\AgenTalk\agen-talk.log`에 있습니다(설정 → 정보에서도 폴더를 볼 수 있습니다).

## 개발

```bash
git clone https://github.com/Ben-JWL/agen_talk.git && cd agen_talk
pip install pywebview paramiko     # 선택: 없으면 Chrome/Edge 창과 OpenSSH로 동작
python app.py                      # 데스크톱 앱
python agen_talk.py                # 내 에이전트를 터미널에 한 번 출력 (--board, --json), 표준 라이브러리만 사용
python agen_talk.py --selftest && python app.py --selftest
python tools/check_ui.py           # ui/src와 index.html이 같아야 함 (재생성: python ui/build.py)
python art/sprites/build.py        # 픽셀 아트 원본 -> ui/src/72-sprites.js
```

[구조](docs/ARCHITECTURE.md) · [오버뷰 계약](docs/OVERVIEW-CONTRACT.md) · [픽셀 아트](art/sprites/README.md) · [서드파티 고지](THIRD_PARTY_NOTICES.md)

`v*` 태그를 push하면 GitHub Actions가 릴리스를 빌드해 올립니다(`.github/workflows/release.yml`).

## 코드 서명 정책

Windows 설치 파일과 실행 파일은 **아직 코드 서명이 되어 있지 않습니다.** 그래서 SmartScreen 경고가 뜹니다. 대신 다음을 제공합니다.

- 모든 릴리스는 개인 PC가 아니라 GitHub Actions가 이 저장소에서 직접 빌드합니다. 빌드 기록은 공개되어 있습니다.
- 릴리스마다 `SHA256SUMS`가 함께 올라갑니다. `certutil -hashfile AgenTalk-Setup-<버전>.exe SHA256`으로 확인하세요.
- 파일마다 서명된 빌드 출처 증명(attestation)이 있습니다. GitHub CLI로 `gh attestation verify AgenTalk-Setup-<버전>.exe --repo Ben-JWL/agen_talk`를 실행하면 이 저장소의 워크플로가 만든 파일인지 확인됩니다.
- 빌드 의존성은 해시로 고정되어 있고(`packaging/requirements-build.lock`), 워크플로의 액션은 모두 커밋 SHA로 고정되어 있습니다.

코드 서명 인증서가 생기면 릴리스에 서명할 예정입니다.

### 개인정보 정책

- **사용 통계, 계정, 클라우드가 없습니다.** 내가 추가한 서버로 가는 SSH 연결 말고는 아무 데도 데이터를 보내지 않습니다.
- **이 PC 안에서만.** 화면은 `127.0.0.1`에서, 실행할 때마다 바뀌는 무작위 경로 아래에서만 열립니다. 처음 열 때 세션 쿠키가 생기므로 주소를 복사해 가도 쓸 수 없습니다. 무언가를 바꾸는 요청에는 실행마다 새로 만드는 토큰도 필요합니다. 여러 사람이 쓰는 컴퓨터에서는 `agen_talk.py hub --insecure`를 쓰지 마세요. 이 모드에서는 그 컴퓨터의 모든 계정이 내 에이전트 내용을 읽을 수 있습니다.
- **비밀번호는 저장하지 않습니다.** 서버 비밀번호는 앱 전용 키를 등록할 때 한 번만 씁니다. "이번 세션 동안만" 옵션은 앱을 닫을 때까지 메모리에만 둡니다.
- **앱 전용 키.** 키는 `%APPDATA%\AgenTalk\id_ed25519`에 암호화 없이 저장되며 내 Windows 사용자만 읽을 수 있습니다. 서버에는 `no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty` 제한을 붙여 설치합니다. 앱을 지워도 서버의 키는 남으니, 더 이상 쓰지 않으면 각 서버의 `~/.ssh/authorized_keys`에서 `agen-talk@<내 PC 이름>`으로 끝나는 줄을 지우세요.
- **내 PC에 남는 것.** 앱을 다시 켜도 방 내용이 보이도록 약 24시간 동안 캐시를 둡니다: 에이전트의 지시와 보고, 실행한 명령을 포함한 활동 줄, 내가 보낸 톡. 위치는 `%LOCALAPPDATA%\AgenTalk\webview`이고 암호화되어 있지 않습니다. 에이전트 글에 있는 흔한 비밀 값(API 키, 토큰, 개인 키, URL 속 비밀번호, `password=` 값)은 `[가려짐]`으로 가리지만, 정해진 패턴만 찾으므로 모든 것을 잡지는 못합니다.
- **완전히 지우기.** Windows 설정 → 앱에서 제거한 뒤 `%APPDATA%\AgenTalk`와 `%LOCALAPPDATA%\AgenTalk`도 지우세요.

보안 문제를 발견하셨다면 공개 이슈 대신 저장소의 [Security](https://github.com/Ben-JWL/agen_talk/security) 탭으로 비공개 제보해 주세요.

## 만든 이들

픽셀 아트(캐릭터, 사무실, 애니메이션)는 이 프로젝트를 위해 Claude Opus 5.5가 만들고 GPT-6.1-sol, gpt-6-astra가 다듬었습니다. Sea of Stars, Eastward, Octopath Traveler 시리즈는 스타일 참고로만 삼았고 에셋은 쓰지 않았습니다. 팬 테마는 AI 제품들의 색과 분위기만 빌렸으며, 로고나 상표는 쓰지 않았고 해당 회사들과 관련이 없습니다.

## 라이선스

[MIT](LICENSE).
