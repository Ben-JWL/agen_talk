# agen_talk

**에겐 톡 (Agen Talk)** 은 내 PC와 SSH로 접속하는 리눅스 서버에서 돌아가는 AI 코딩 에이전트(Codex, Claude Code, Antigravity CLI)를
한 화면에서 보는 데스크톱 대시보드입니다. 에이전트마다 채팅방이 하나씩 생기고, 무엇을 위한 작업인지, 지금 무엇을 하는지,
정말 일하고 있는지 보여 줍니다. 나를 기다리는 방(승인·질문·멈춤)은 맨 위에 빨간 배지로 고정되고, Windows 알림으로도 알려 줍니다.

<!-- 스크린샷: docs/ 아래에 파일을 넣고 주석을 풀어 주세요 -->
<!-- ![채팅방 목록](docs/screenshot-rooms.png) -->
<!-- ![서버 추가](docs/screenshot-add-server.png) -->

Windows 10/11, 관리자 권한 불필요, 서버에는 아무것도 설치하지 않습니다.

## 설치

1. [Releases](../../releases) 페이지에서 `AgenTalk-Setup-<버전>.exe` 를 받습니다.
2. 실행하면 사용자 계정에만 설치됩니다(`%LOCALAPPDATA%\Programs\AgenTalk`). 시작 메뉴에 등록되고 바탕 화면 바로 가기는 선택입니다.
3. 같은 릴리스의 `SHA256SUMS` 와 비교해 확인할 수 있습니다(`certutil -hashfile <파일> SHA256`).

**SmartScreen 안내.** 설치 파일은 아직 코드 서명이 없어서 "Windows의 PC 보호" 창이 뜹니다.
**추가 정보** 를 누른 뒤 **실행** 을 누르세요.

**회사 정책으로 막히면?** 서명 없는 앱을 막는 회사가 있습니다. 이 경우:
- **포터블 zip**(`AgenTalk-<버전>-portable.zip`)을 아무 폴더에 풀고 `AgenTalk.exe` 를 실행하거나(이것도 막힐 수 있음),
- **소스로 실행**: Python 3.8 이상에서 `python app.py` (창을 쓰려면 `pip install pywebview`, 없으면 Chrome/Edge 앱 창으로 열립니다. SSH는 OpenSSH 대체 경로를 사용하며 콘솔에서 지문 확인과 비밀번호 입력을 요청할 수 있습니다).

창은 Microsoft Edge WebView2 를 씁니다. 최신 Windows 10/11 에는 들어 있고, 없으면 Chrome/Edge 창으로 대신 열면서 설치 방법을 알려 줍니다.

## 처음 실행

1. **에겐 톡 (Agen Talk)** 을 시작합니다. 내 PC는 이미 목록에 있습니다.
2. **서버 추가** 를 눌러 서버 주소, 계정, 비밀번호를 앱에 입력합니다. 처음 연결할 때는 화면에 표시된 서버 지문이
   관리자가 알려 준 값과 같은지 확인한 뒤 승인하세요. 앱은 `%APPDATA%\AgenTalk` 아래에 전용 키와 신뢰 저장소
   (`id_ed25519`, `known_hosts`)를 만들고 서버에 키를 등록하므로 이후에는 비밀번호를 다시 묻지 않습니다. 서버가 키 로그인을
   허용하지 않으면 세션 비밀번호 옵션을 선택할 수 있으며, 비밀번호는 앱을 닫을 때까지만 메모리에 남습니다.
3. 회사나 팀에서 서버 목록(`presets.json`)을 공유받았다면 **서버 목록 가져오기** 로 그 파일을 고르세요.
   서버마다 **연결하기** 버튼이 생깁니다. 이 목록은 앱에 들어 있지 않고, 만든 사람만 가지고 있습니다.
   형식: `{"presets": [{"name": "GPU 서버", "host": "gpu.example.com", "port": 22}]}`
4. 설정에서 **Windows 알림** 을 켜 두면 입력 대기·응답 없음·끊김을 알려 줍니다.

설치된 앱은 자체 SSH 클라이언트를 사용합니다. OpenSSH는 소스 실행 모드의 대체 경로에서만 사용합니다.

### 소스 모드 OpenSSH 대체 경로: Entra 가입 PC의 "Bad owner or permissions" 오류

회사 Entra ID 가입 PC에서는 OpenSSH 설정 파일의 소유자가 어긋나는 일이 흔합니다. 소스 모드 대체 경로에서만 필요한 수정입니다.
PowerShell 에서 실행하세요(사용자 이름은 자동으로 들어갑니다).

```powershell
$f = "$env:USERPROFILE\.ssh\config"; $me = whoami; icacls $f /setowner $me; icacls $f /inheritance:r /grant:r "${me}:F"
```

## 톡

**지시 전파 보기.** 에이전트가 하위 에이전트에게 일을 맡기면, 하위 방에는 부모의 지시가(추가 지시도) 카드로, 부모 방에는 하위의 보고가
카드로 보입니다. 방 위쪽의 **흐름** 전환 버튼을 누르면 누가 누구에게 지시했는지 전체 트리로 볼 수 있습니다.
Codex는 지시 본문을 암호화하므로 해당 카드는 잠금(🔒)으로만 표시되고 내용은 보이지 않습니다.

**톡 보내기.** 일부 방에서는 에이전트에게 메시지를 직접 보낼 수 있습니다(Enter를 누르면 확인 카드가 뜨고, 한 번 더 누르면 보냅니다. Shift+Enter는 줄바꿈입니다).

- **Claude Code**: 리눅스 서버에서 실행 중인 Claude Code의 메인(대화형) 세션만 대상입니다. 메시지는 다른 세션이 보낸 메시지로,
  낮춘(peer) 권한으로 도착합니다. 내가 직접 입력한 것으로 처리되지 않으며, 권한 승인 요청을 대신 승인하는 일도 절대 없습니다.
  `--dangerously-skip-permissions` 로 시작한 세션이면 그 터미널에서 내가 승인할 때까지 보류됩니다(방에 "터미널에서 승인 대기",
  약 5분 뒤 "만료됨"). 그 외에는 도착하면 "전달됨" 이 표시됩니다.
- **Codex**: codex app-server 데몬이 호스팅하는 스레드만 닿습니다. `--no-daemon` 으로 시작한 TUI는 보기만 가능합니다.
  앱은 codex의 승인 요청이나 다른 어떤 요청에도 답하지 않습니다. 앱 연결로 요청이 오면 연결을 끊고, 프롬프트는 사용자의 codex 창에 남깁니다.
- **v1에서 지원하지 않음**: 내 Windows PC의 세션, 하위 에이전트(subagent), Antigravity CLI. 입력칸이 비활성인 이유는 방에 표시됩니다.

**개인정보와 안전.**
- 설정의 **톡 보내기 허용** 을 끄면 모든 방에서 보내기가 꺼지고, 허브도 이를 강제합니다. 흐름 보기는 그대로입니다.
- 메시지 본문은 앱 로그에 기록하지 않습니다. 보낼 때마다 대상·길이·결과만 담은 감사 로그 한 줄이 남습니다.
- 표시되는 지시에서 뚜렷한 비밀값(API 키, 토큰, 개인 키, `password=` 값 등)은 `[가려짐]` 으로 가립니다.
- 페이지는 엄격한 Content-Security-Policy 로 제공됩니다.
- Claude Code 세션이 다른 세션의 메시지를 받을지는 그 세션의 설정 `crossSessionInbound`(`accept`, `hold`, `refuse`)로 사용자가 정합니다.
  앱은 이 값을 읽어 따르기만 하고 바꾸지 않습니다.

## 서버 쪽은 어떻게 동작하나요

서버에는 아무것도 설치하지 않습니다. 앱이 서버마다 `ssh` 를 열어, 수집기(`agen_talk.py`, 파이썬 표준 라이브러리만 사용)를
SSH 세션으로 흘려 보내 `python3 -c` 로 실행합니다. 수집기는 에이전트 상태를 읽기 전용으로 읽고(`/proc`, `~/.codex`, `~/.claude`, `~/.gemini`)
요청마다 JSON 한 줄을 돌려줍니다. 창을 닫거나 연결이 끊기면 세션이 끝나면서 수집기도 함께 끝납니다.
서버 조건: `python3` 3.8 이상.

## 보안 모델

- 대시보드는 `127.0.0.1` 의 빈 포트에서만 열립니다.
- 실행할 때마다 새 비밀 문자열이 만들어지고 모든 주소가 `http://127.0.0.1:<포트>/<비밀>/` 아래에 놓입니다. 그 밖의 경로는 404 이므로
  같은 PC의 다른 사용자(빠른 사용자 전환, 원격 데스크톱)는 대시보드를 볼 수 없습니다.
- 변경 요청에는 실행마다 다른 토큰과 일치하는 `Host`가 필요합니다. `Origin` 헤더를 보내면 값이 일치해야 하며, 톡 엔드포인트에는 필수입니다.
- 내가 추가한 서버로 가는 내 SSH 연결 말고는 데이터가 PC 밖으로 나가지 않습니다. 원격 측정, 계정, 클라우드 서비스가 없습니다.
- 서버 비밀번호는 앱에서 입력하며 등록 작업 동안에만 메모리에 보관합니다. 세션 비밀번호 옵션도 앱을 닫으면 사라집니다. 처음 보는 서버 지문은 확인을 받아야 하며, 기록된 지문이 바뀌면 연결을 거부합니다.
- 전용 키와 서버 지문은 `%APPDATA%\AgenTalk\id_ed25519`, `%APPDATA%\AgenTalk\known_hosts` 에 있습니다.
- 설정은 `%APPDATA%\AgenTalk\channels.json`, 로그는 `%LOCALAPPDATA%\AgenTalk\agen-talk.log` 에 있습니다.

## 제거

설정 > 앱 > 설치된 앱 > 에겐 톡 (Agen Talk) > 제거. `%APPDATA%\AgenTalk` 의 서버 목록과 설정은 남습니다(완전히 지우려면 그 폴더를 직접 삭제).

접속 권한까지 없애려면 각 서버의 `~/.ssh/authorized_keys` 에서 `agen-talk@<내 PC 이름>` 으로 끝나는 줄을 지운 뒤,
내 PC의 `%APPDATA%\AgenTalk\id_ed25519`, `id_ed25519.pub`, `known_hosts` 파일을 지웁니다.

## 소스에서 빌드

```
python ui/build.py                      # ui/src -> ui/dist/index.html (UI를 고쳤으면 index.html 에 덮어쓰기)
python agen_talk.py --selftest
python app.py --selftest
pip install -r packaging/requirements-build.txt
python packaging/make_icon.py
pyinstaller packaging/agen_talk.spec --noconfirm --distpath build/dist --workpath build/work
iscc /DAppVersion=0.1.0 packaging\installer.iss     # Inno Setup 6 필요
```

릴리스는 `v*` 태그를 푸시하면 `.github/workflows/release.yml` 이 빌드합니다. 구조는 `docs/ARCHITECTURE.md` 를 보세요.
앱 없이 대시보드만: `python agen_talk.py hub` (Python 3.8 이상, 표준 라이브러리만).

## 라이선스

[MIT](LICENSE). 서드파티: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
