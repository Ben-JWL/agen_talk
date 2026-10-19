# art/sprites — 픽셀 오피스 캐릭터 / Pixel-office characters

오버뷰 '재미 모드'(픽셀 오피스)에 앉는 에이전트 캐릭터의 원본입니다. 패밀리는 Claude, Codex, Antigravity 3종이고, 리드와 인턴 2가지 크기가 있습니다. 상태 10종(인트로 2개 포함, 6종은 동작 변형 1–3개), 팬 테마 5종(팔레트만 다름)이며, 에이전트마다 룩(머리·옷 팔레트 5종 × 피부 4종 + 액세서리 0–1개)이 정해지고, 걸어 다니는 동료 7종과 패밀리 워커 6종(리드/인턴)이 함께 들어 있습니다. 모든 픽셀은 이 폴더의 Python 소스에서 만듭니다. 외부 이미지, 네트워크, 서드파티 패키지는 쓰지 않습니다.

Source of the agent characters shown in the overview's pixel office: 3 families (Claude, Codex, Antigravity) × lead/intern × 10 states (2 of them intros, 6 with 1–3 motion variants) × 5 fan-theme palettes, per-agent looks (5 hair/outfit palettes × 4 skins + 0–1 accessory overlay), 7 walking colleagues and 6 family walkers (lead/intern). Every pixel is authored in the Python files here; no image files, no network, no third-party packages.

## Build / 빌드

```text
python art/sprites/build.py            # -> ui/src/72-sprites.js (the only file it writes)
python art/sprites/check_v2.py         # decoded v2 == v1 expansion, every exposure and pixel; size; stale-file guard
python art/sprites/validate_motion.py  # timelines, seams, clipping, tool contact, ramps, walker foot lock
```

- Python 3.12, stdlib only. `check_v2.py` also needs `node` on PATH.
- Output is deterministic (byte-identical for the same sources, LF only) and must stay ≤ 260 KB (currently about 242 KB).
- Edit the sources, never `ui/src/72-sprites.js`.

| 파일 / File | 내용 / Contents |
|---|---|
| `core.py` | 합성기: 손으로 찍은 ASCII 파츠, 면 명암, 주름 표시, 선택적 외곽선 / compositor: hand-drawn ASCII parts, planar shading, fold marks, selective outline |
| `pal.py` | 테마 5 × 패밀리 3 팔레트(OKLCH 색조 이동 램프) / palettes, hue-shifted OKLCH ramps |
| `lead.py` `intern.py` `intern2.py` `heads.py` `hands.py` `arms_lead.py` `arms_var.py` `atelier.py` `walker.py` | 그린 파츠와 포즈 / drawn parts and poses |
| `acc.py` | 액세서리 오버레이(머리 각도별) / accessory overlays per head angle |
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
  palettes: { <claude|chatgpt|gemini|grok|muse>: { <claude|codex|agy>: 'rrggbb' x 35 } },   // decoded to [null, '#rrggbb', ...]
  pools: { lead: { w, h, r, hd, oc }, intern: {...}, walker: {...} },   // r = records joined with ','; hd, oc: see below
  looks: { n: 5, idx: '1abcdefghijklmnstwz', sidx: '23456',
           pal: { <theme>: { <fam>: ['', 'rrggbb' x idx.length, ...] } },   // look k > 0 overrides those slots
           skin: ['', 'rrggbb' x 5, ...],                                   // skin k > 0 overrides sidx
           acc: { names, allow: { <fam>: { lead: [...], intern: [...] } },
                  lead | intern | walker: { <name>: { a: 'h' | 'b', v: { <view A-E | S | *>: [dx, dy, 'row|row|...'] } } } } },
  anims: { <family>: { <lead|intern>: { <state>: { fps, loop, key, next?, seq: [raster, hold, raster, hold, ...] },
                                         '<state>~1': {...}, ...,                       // motion variants
                                         vars: { <state>: ['<state>', '<state>~1', ...] } } } },   // rotation sets
  walker: { w: 16, h: 27, anchorX: 8, anchorY: 26, palettes: { <theme>: [...] },
            anims: { walk: {fps, loop, key, seq}, stand: {...} },
            variants: [ { name, palettes, anims },                  // colleagues b c d e f g
                        { name: '<fam>.<lead|intern>', fam, size, anims } ] } }   // family walkers: palettes[theme][fam] + look
```

- **States**: `work tool child user user_loop stall idle done done_loop stopped`.
  - `loop:false` plays once from the state change, then continues with `next`.
  - `key` is the frame to show under reduced motion.
- **Motion variants**: `<state>~N` keys are extra loops for the same state; the plain key stays variant 0.
  - `vars[<state>]` lists the rotation set, base first. Sets today: `work` (lead 4: typing, reading/scrolling, thinking with hand to chin, lean back and review; intern 3), `idle` 4 (sip, look around, neck/shoulder stretch, phone in the free hand), `stall` 2 (head on hand + drumming fingers), `child` 2 (uncross, tap and check the monitor, turn to the interns), `done_loop` 3 (hands behind the head, happy sway), `user_loop` 2 (both hands wave).
  - Every variant has the base loop's `fps` and length, and its first and last exposure are the base frame-0 raster (same pose and secondary-motion phase; lengths are multiples of 60 so the hair wave closes). The page can switch variants at any loop boundary without a pop. `build.py`, `check_v2.py` and `validate_motion.py` check this, plus size, clipping and palette like the base states.
  - The page (`ui/src/73-office.js`, `Chars.loopPick`) cuts time into segments of one base loop and picks one variant per segment from a hash of (agent phase, segment): about 40 % base, no back-to-back repeats in sets of 3 or more. Intros play once, then rotate in `next`'s set. Reduced motion always shows the base `key`.
  - Keys of `vars` are not animations; a decoder or tool that walks `anims[f][s]` must skip `vars` (entries without `seq`).
- **Pixels**: `.` is transparent; `1-9 a-z` is a base-36 palette index; index 0 is transparent.
- **Pool record** `<ref>!<skip><pixels><skip><pixels>…` describes one distinct raster, row-major over `w × h`.
  - `ref` is the base-26 number (`A-Z`, `A` = 0) of an earlier record in the same pool. If it is empty, the raster starts fully transparent.
  - `skip` is a base-26 count (`A-Z`) of pixels kept from the reference; no letters means 0.
  - `pixels` are literal pixel characters written from that position.
  - Upper-case letters never occur as pixels, so no separators or escaping are needed.
- **Looks (v2.1)**: the page picks per agent id (`Chars.lookOf`): look = hash % n (an intern of the lead's family never gets the lead's look), skin = a second hash, accessory: about half get none, else one from `allow[fam][size]`. The accent ramp (`o p q`), eyes and silhouettes never change, so the family stays recognisable; families keep their own headwear (Claude clip/beanie, Codex headphones/hood, AGY goggles) and only get compatible accessories. Family walkers use the same palette slots, so an agent away from its desk wears the same look.
- **`hd`**: head anchors per raster as runs `<view><hx><hy><bx+10><by+10>[count]` (view `A`–`E` = 3/4 left … 3/4 right, `S` = walker side view; numbers one base-36 char each, count base 36 if > 1). Decoded to `rows._hd = [view, hx, hy, bx, by]`. Accessories with `a: 'h'` sit at (hx, hy) + (dx, dy), with `a: 'b'` (scarves) at (bx, by) + (dx, dy); walker anchors are normalised so the eye sits at (6, 4).
- **`oc`**: `{ t: [pixel runs: 3-char base-36 start (y*w+x) + 1-char length], i: per-raster runs of <table index + 1 as 2 letters, 'AA' = none>[count] }`, decoded to `rows._oc` (a Set): overlay pixels the page must leave to the raster because a hand, arm or prop is drawn in front of the head there. `build.py` checks every allowed accessory on every raster it can sit on (inside the raster, 2 rows of headroom, clear of the edges).
- **`seq`** lists runs of `[raster number, number of exposures]`. Expanding them gives exactly the v1 `frames` list.
- **`atDecode2(V)`** expands v2 once at load into the v1 runtime shape: `anims[f][s][st].frames` = arrays of row strings.
  - Identical exposures share one row array tagged `_rid`, so the UI can cache one canvas per raster.
  - v1 data passes through unchanged; `vars` is copied as is.
  - The decoder uses no `eval` or `new Function`. It takes about 40–70 ms.
- **Sizes**: 2,174 distinct rasters cover 23,238 exposures (63 of the animations are motion variants). In v1 form the same data would be about 4.5 MB.

## Credits / 크레딧

The design went through three art passes:

| Pass | Contribution |
|---|---|
| Claude | Original design: silhouettes, parts, families, outline and contrast system, v2 data format |
| GPT-6.1-sol | Shadow-saturation and ramp cleanup |
| gpt-6-astra | Animation timing and in-betweens, torsos/sleeves, walker foot contact |

The games named in the art notes (Sea of Stars, Eastward, Octopath Traveler, Owlboy, Celeste, Hades and others) are **style references only**. No assets, characters, logos or wordmarks are copied. Theme names describe colour moods only.

설계는 Claude가 했고(실루엣, 파츠, 외곽선 체계, v2 형식), GPT-6.1-sol이 그림자 채도와 램프를 정리했으며, gpt-6-astra가 애니메이션 타이밍·중간 동작·옷·행인 접지를 다듬었습니다. 언급된 게임들은 **스타일 참고일 뿐**이고, 에셋·캐릭터·로고·워드마크는 복제하지 않았습니다.
