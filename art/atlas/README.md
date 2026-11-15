# 픽셀 던전 스프라이트 · art/atlas

픽셀 던전(재미 모드 오버뷰)에 쓰는 16×16 스프라이트 110개의 원본입니다. 용사, 동료, 몬스터, 보스, 작업대와 소품, 장식이 들어 있습니다.

- **출처:** Angais의 [Pixel Art Atlas](https://huggingface.co/datasets/Angais/pixel-art-atlas-1.4m) 데이터셋 한 샤드(`data/train-000.parquet`)에서 골랐습니다.
- **라이선스:** CC0 1.0 (퍼블릭 도메인 헌정). 스프라이트는 AI로 만들어졌습니다(Krea 2 Turbo + 픽셀 아트 LoRA). 데이터셋은 Krea와 무관한 독립 배포물입니다. 고지는 [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md)에 있습니다.
- **파일:**
  - `pick.py`: 개발용. pyarrow와 Pillow가 필요하니 버리는 가상환경에서만 실행하세요. `PICK` 표의 이름마다 `row_id`에 해당하는 행을 골라 `sprites.json`에 씁니다.
  - `sprites.json`: 커밋되는 원본입니다.
  - `build.py`: 표준 라이브러리만 씁니다. `sprites.json`으로 `ui/src/72-atlas.js`를 만듭니다. `--check`는 파일이 낡았으면 실패합니다. 크기 예산은 96 KB입니다.
- **형식:** `window.AT_ATLAS = { size: 16, alpha, sprites: { '<이름>': '<rrggbb…>|<256글자>' } }`. 앞부분은 팔레트 색이고, 256글자는 픽셀입니다. `.`은 투명이고, 다른 글자는 `alpha`의 k번째 글자이면 팔레트의 k번째 색입니다.
- **이름:** `hero.<도구>.<n>`(claude, codex, agy), `kid.<도구>.<n>`(하위 에이전트 동료), `mon.<n>`, `boss.<n>`, 작업대·소품(`anvil`, `map.0`, `tome` 등), 장식(`sconce.0`, `pillar.1` 등). 이름은 `[a-z]+(\.[a-z]+)?(\.\d+)?` 형식이어야 합니다.
- **스프라이트 추가:** `pick.py`의 `PICK`에 `"이름": row_id`를 넣고, 가상환경에서 `pick.py`를 실행해 `sprites.json`을 만든 다음 `python art/atlas/build.py`를 실행합니다. `ui/src/72-atlas.js`는 손으로 고치지 마세요.

---

# Pixel dungeon sprites · art/atlas

The source for the 110 16×16 sprites of the pixel dungeon (the fun-mode overview). They cover heroes, companions, monsters, bosses, workstations and props, and decor.

- **Source:** one shard (`data/train-000.parquet`) of the [Pixel Art Atlas](https://huggingface.co/datasets/Angais/pixel-art-atlas-1.4m) by Angais.
- **Licence:** CC0 1.0 (public-domain dedication). The sprites are AI-generated (Krea 2 Turbo with a pixel-art LoRA). The dataset is an independent release, not endorsed by Krea. The notice is in [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md).
- **Files:**
  - `pick.py`: dev-only. Needs pyarrow and Pillow, so run it in a throwaway venv. It copies the rows named in its `PICK` table from the shard into `sprites.json`.
  - `sprites.json`: committed source of truth.
  - `build.py`: stdlib only. Writes `ui/src/72-atlas.js` from `sprites.json`. `--check` fails when the committed file is stale. Budget: 96 KB.
- **Format:** `window.AT_ATLAS = { size: 16, alpha, sprites: { '<name>': '<rrggbb…>|<256 chars>' } }`. The first part is the palette. In the 256 characters, `.` is transparent and any other character is the palette colour at its index in `alpha`.
- **Naming:** `hero.<tool>.<n>` (claude, codex, agy), `kid.<tool>.<n>` (subagent companions), `mon.<n>`, `boss.<n>`, workstations and props (`anvil`, `map.0`, `tome`, ...), decor (`sconce.0`, `pillar.1`, ...). Names must match `[a-z]+(\.[a-z]+)?(\.\d+)?`.
- **Adding a sprite:** add `"name": row_id` to `PICK` in `pick.py`, run `pick.py` in the venv to regenerate `sprites.json`, then run `python art/atlas/build.py`. Never edit `ui/src/72-atlas.js` by hand.
