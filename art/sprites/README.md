# art/sprites — 픽셀 오피스 캐릭터 / Pixel-office characters

오버뷰 '재미 모드'(픽셀 오피스)에 앉는 에이전트 캐릭터의 원본입니다. 패밀리는 Claude, Codex, Antigravity 3종이고, 리드와 인턴 2가지 크기가 있습니다. 상태 10종(인트로 2개 포함), 팬 테마 5종(팔레트만 다름)이며, 걸어 다니는 동료 3종이 함께 들어 있습니다. 모든 픽셀은 이 폴더의 Python 소스에서 만듭니다. 외부 이미지, 네트워크, 서드파티 패키지는 쓰지 않습니다.

Source of the agent characters shown in the overview's pixel office: 3 families (Claude, Codex, Antigravity) × lead/intern × 10 states (2 of them intros) × 5 fan-theme palettes, plus 3 walking colleagues. Every pixel is authored in the Python files here; no image files, no network, no third-party packages.

## Build / 빌드

```text
python art/sprites/build.py            # -> ui/src/72-sprites.js (the only file it writes)
python art/sprites/check_v2.py         # decoded v2 == v1 expansion, every exposure and pixel; size; stale-file guard
python art/sprites/validate_motion.py  # timelines, seams, clipping, tool contact, ramps, walker foot lock
```

- Python 3.12, stdlib only. `check_v2.py` also needs `node` on PATH.
- Output is deterministic (byte-identical for the same sources, LF only) and must stay ≤ 150 KB (currently about 111 KB).
- Edit the sources, never `ui/src/72-sprites.js`.

| 파일 / File | 내용 / Contents |
|---|---|
| `core.py` | 합성기: 손으로 찍은 ASCII 파츠, 면 명암, 주름 표시, 선택적 외곽선 / compositor: hand-drawn ASCII parts, planar shading, fold marks, selective outline |
| `pal.py` | 테마 5 × 패밀리 3 팔레트(OKLCH 색조 이동 램프) / palettes, hue-shifted OKLCH ramps |
| `lead.py` `intern.py` `intern2.py` `heads.py` `hands.py` `arms_lead.py` `atelier.py` `walker.py` | 그린 파츠와 포즈 / drawn parts and poses |
| `motion.py` `anims_lead.py` `anims_intern.py` | 타이밍 정본(노출표) / timing source of truth (exposure sheets) |
| `rig.py` | 포즈 → 프레임 / pose → frame |
| `at2.py` `at2_decode.js` | v2 패커와 디코더 / v2 packer and decoder |

## AT_SPRITES v2 format

`ui/src/72-sprites.js` defines `window.atDecode2` and `window.AT_SPRITES`.

```js
window.AT_SPRITES = {
  version: 2,
  lead:   { w: 48, h: 56, anchorX: 21, anchorY: 51, deskY: 45 },  // deskY = desk far edge; below it only hands/forearms
  intern: { w: 32, h: 42, anchorX: 15, anchorY: 39, deskY: 34 },
  palettes: { <claude|chatgpt|gemini|grok|muse>: { <claude|codex|agy>: [null, '#rrggbb', ... 35 colours] } },
  pools: { lead: { w, h, r }, intern: { w, h, r }, walker: { w, h, r } },   // r = records joined with ','
  anims: { <family>: { <lead|intern>: { <state>: { fps, loop, key, next?, seq: [raster, hold, raster, hold, ...] } } } },
  walker: { w: 16, h: 27, anchorX: 8, anchorY: 26, palettes: { <theme>: [...] },
            anims: { walk: {fps, loop, key, seq}, stand: {...} }, variants: [ { name, palettes, anims } ] } }
```

- **States**: `work tool child user user_loop stall idle done done_loop stopped`.
  - `loop:false` plays once from the state change, then continues with `next`.
  - `key` is the frame to show under reduced motion.
- **Pixels**: `.` is transparent; `1-9 a-z` is a base-36 palette index; index 0 is transparent.
- **Pool record** `<ref>!<skip><pixels><skip><pixels>…` describes one distinct raster, row-major over `w × h`.
  - `ref` is the base-26 number (`A-Z`, `A` = 0) of an earlier record in the same pool. If it is empty, the raster starts fully transparent.
  - `skip` is a base-26 count (`A-Z`) of pixels kept from the reference; no letters means 0.
  - `pixels` are literal pixel characters written from that position.
  - Upper-case letters never occur as pixels, so no separators or escaping are needed.
- **`seq`** lists runs of `[raster number, number of exposures]`. Expanding them gives exactly the v1 `frames` list.
- **`atDecode2(V)`** expands v2 once at load into the v1 runtime shape: `anims[f][s][st].frames` = arrays of row strings.
  - Identical exposures share one row array tagged `_rid`, so the UI can cache one canvas per raster.
  - v1 data passes through unchanged.
  - The decoder uses no `eval` or `new Function`. It takes about 20–35 ms.
- **Sizes**: 879 distinct rasters cover 9,618 exposures. In v1 form the same data was about 2 MB.

## Credits / 크레딧

The design went through three art passes:

| Pass | Contribution |
|---|---|
| Claude | Original design: silhouettes, parts, families, outline and contrast system, v2 data format |
| GPT-6.1-sol | Shadow-saturation and ramp cleanup |
| gpt-6-astra | Animation timing and in-betweens, torsos/sleeves, walker foot contact |

The games named in the art notes (Sea of Stars, Eastward, Octopath Traveler, Owlboy, Celeste, Hades and others) are **style references only**. No assets, characters, logos or wordmarks are copied. Theme names describe colour moods only.

설계는 Claude가 했고(실루엣, 파츠, 외곽선 체계, v2 형식), GPT-6.1-sol이 그림자 채도와 램프를 정리했으며, gpt-6-astra가 애니메이션 타이밍·중간 동작·옷·행인 접지를 다듬었습니다. 언급된 게임들은 **스타일 참고일 뿐**이고, 에셋·캐릭터·로고·워드마크는 복제하지 않았습니다.
