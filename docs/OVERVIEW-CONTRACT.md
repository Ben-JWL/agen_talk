# Overview integration contract

This is the interface between three parallel work streams: the collector, the sprite pipeline and the UI.

## 1. `project` on agent nodes (collector → UI)

Every agent node that has a working directory gets an optional `project` field. It is omitted when no git repository is found.

```json
"project": {
  "name":   "agen_talk",                    // repo name: from the origin remote's last path segment, else the repo folder name
  "branch": "main",                         // current branch, or "@1a2b3c4" (detached HEAD, short sha), or null
  "key":    "github.com/ben-jwl/agen_talk", // grouping key, the same on every machine; credentials, scheme, port and ".git" stripped
                                            // "local:<root path>" when there is no remote
  "root":   "~/work/agen_talk"       // repo root path on that machine (already shortened like `meta`)
}
```

- Subagents inherit their parent's project unless their own cwd resolves to a different repo.
- Only `.git/HEAD`, `.git/config` and `commondir` / `gitdir` pointers are read (worktrees and submodules supported). The collector never runs `git`.
- Results are cached per directory for 30 s. Python 3.8 stdlib only.
- The UI must treat every field as untrusted text (textContent only) and must cope with the field being absent.

## 2. Sprites (art pipeline → UI)

- Sources live in `art/sprites/` (Python). `python art/sprites/build.py` writes `ui/src/72-sprites.js`.
- `ui/src/72-sprites.js` must define `window.AT_SPRITES` in format **v2**, as specified in `art/sprites/README.md`, plus `window.atDecode2`, the decoder.
- No other code may depend on build internals.
- Size budget for the generated file: ≤ 150 KB.

## 3. UI

### Overview modes
- The overview replaces the empty right pane (no room open).
- Default mode: **배선 지도** (wiring map).
- **재미 모드** (픽셀 오피스) is a toggle in the overview header and in Settings → 화면. It is off by default and remembered per user.

### Themes
- The five fan themes (Claude 풍, ChatGPT 풍, Gemini 풍, Grok 풍, Muse 풍), crossed with light/dark/system, style the overview pane only. The rest of the app keeps its own tokens.
- No logos or wordmarks.

### Project
- Show it as a chip in room rows and the room header.
- The wiring map groups by server → project → agent.
- The office has one room per project.

### Hard constraints
- One inline script (the CSP hash).
- No `innerHTML` with data (`ui/build.py` asserts this).
- Respect reduced motion.
- No network.
- Pause the render loop when the pane is hidden, the window is unfocused for long, or polling is paused.
- Clicking an agent opens its room.
- Keyboard access.
