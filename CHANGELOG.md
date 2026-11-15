# Changelog / 변경 내역

## 0.2.0 (2026-11-16)

업데이트는 새 설치 파일을 그대로 실행하면 됩니다. 서버 목록과 설정은 그대로 남습니다.
To update, run the new installer over the old one; servers and settings are kept.

### 새 기능 / New

- **모델 표시** — 배선 지도의 에이전트·하위 에이전트 카드에 모델이 보입니다 (`opus-5.5`). 세션 중 모델이 바뀌면 `⇄`, 안전장치로 다른 모델에 재라우팅된 동안은 경고색입니다.
  Model chips on every wiring-map card; `⇄` when the model changed during the session, warning colour while a safeguard reroute holds.
- **세션 종료** — 방의 "세션 종료" 버튼으로 그 에이전트의 프로세스를 끝냅니다. 오버뷰의 "유휴 세션 N"은 오래 쉬는데 프로세스가 남은 세션을 모아 골라서 종료합니다. `channels.json`의 `"end": false`로 끌 수 있습니다.
  End a session's process from its room, or clean up long-idle sessions in bulk; `"end": false` in `channels.json` turns it off.
- **픽셀 던전** — 재미 모드가 픽셀 오피스에서 픽셀 던전으로 바뀌었습니다. 에이전트가 하는 일에 따라 영웅이 수련·탐험·제작·전투·정찰·소환을 합니다.
  The fun mode is now a pixel dungeon (it replaces the pixel office): what an agent does decides what its hero does.
- **SSH 서버 연결**
  - 주소 칸에 `ssh -p 2222 user@host`, `user@host:2222`, `ssh://…`, IPv6를 그대로 넣을 수 있습니다.
  - `~/.ssh/config`의 호스트를 골라 주소·계정·포트를 채울 수 있습니다 (채우기만 하며, 등록은 기존 절차 그대로).
  - 비밀번호 로그인이 꺼진 서버는 이 PC의 공개 키와 등록 명령을 보여 주고, 등록 뒤 비밀번호 없이 연결합니다.
  - "지금 확인"이 실제로 즉시 다시 연결합니다. 다음 자동 재연결까지 남은 시간이 보이고, 네트워크가 돌아오거나 절전에서 깨어나면 바로 재시도합니다.
  - 설정 › 채널에서 서버 이름 바꾸기, 주소·계정·포트 수정, 순서 변경, 삭제를 할 수 있습니다.
  Paste ssh commands / IPv6 into the address field, pick hosts from `~/.ssh/config`, a manual key route for key-only servers, a retry that really reconnects, and rename / edit / reorder / remove for servers.

### 바뀐 점 / Changed

- 픽셀 오피스는 제거되었습니다. 재미 모드를 켜 두었다면 픽셀 던전이 보입니다.
  The pixel office is gone; an enabled fun mode now shows the dungeon.
- 에겐 톡은 더 이상 "읽기 전용"만은 아닙니다: 톡 보내기와 세션 종료는 사용자가 누를 때만 동작합니다.
  The app writes only on request: 톡 and 세션 종료, each on an explicit click.

### 보안 / Security

- `run.json`, `channels.json`, 로그 파일을 만들 때부터 현재 사용자 전용 권한으로 만듭니다 (Windows).
  Private files are created with a user-only DACL from their first byte.
- 저장된 설정값 검증, "명령 복사" 시 제어문자 제거, 로그 줄 위조 방지.
  Stored settings are validated, copied commands are stripped of control characters, log lines cannot be forged.
- 호스트 키 종류만 바뀐 서버도 "서버 신원이 바뀜"으로 정확히 안내합니다.
  A server whose host-key type changed is reported as a changed host key.
- 빌드 의존성 갱신: Pillow 13.0.0, setuptools 84.2.1.

### 알려진 제한 / Known limits

- 경유 서버(ProxyJump/배스천)는 앱에서 추가할 수 없습니다.
  Bastion / ProxyJump hosts cannot be added in the app.
- 모델 전환은 대화 기록의 최근 부분에서만 감지합니다.
  A model change is detected only within the recent part of the transcript.
- 실행 파일은 코드 서명이 없습니다. 내려받은 파일은 `SHA256SUMS`와 빌드 증명으로 확인하세요.
  The exe is not code-signed; verify downloads with `SHA256SUMS` and the build attestation.
