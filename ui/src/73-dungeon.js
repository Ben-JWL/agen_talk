/* ===== 73-dungeon.js — 픽셀 던전 (재미 모드 overview): each server is a dungeon floor, each project a stone chamber, each root agent a hero
   at its own station and its subagents companions behind it. What a hero does follows what the agent is doing right now (act(): 탐험 = reading
   and searching, 수련 = the model thinking, 제작 = editing, 전투 = commands, 정찰 = the web, 소환 = subagents, 관문 = waiting for me …).
   One canvas (static stone + decor + light baked per layout into an offscreen canvas; heroes, props, glows and particles drawn per frame) under
   a DOM overlay: every hero / companion is a real <button data-agent> patched in place across polls, all agent text goes through textContent.
   Sprites are window.AT_ATLAS (72, 16x16, decoded once); they are single frames, so motion is procedural (bob, lunge, hop, flip, 90° turn, flash). ===== */
const OvDungeon = (() => {
  const { h, text, attr, cls } = R;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const hsh = s => { let x = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; };
  // deterministic value noise in [0, 1) for the procedural stone
  const nz = (x, y, s) => { let v = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041); v = Math.imul(v ^ (v >>> 13), 1274126177); return ((v ^ (v >>> 16)) >>> 0) / 4294967296; };
  const ease = f => f < .5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
  const short = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const TOOLS = ['claude', 'codex', 'agy'];
  const NEED = ['hero.claude.0', 'hero.codex.0', 'hero.agy.0', 'kid.claude.0', 'mon.0', 'boss.0', 'anvil', 'camp.0', 'chest.0', 'tomb.0', 'owl', 'scroll'];
  const available = () => { const at = window.AT_ATLAS; return !!(at && at.sprites && at.alpha && NEED.every(k => typeof at.sprites[k] === 'string')); };

  // ---------- sprites: decoded once to 16x16 canvases; mirrored / white (hit flash) / lying variants built lazily ----------
  const SP = new Map();
  function spr(nm) {
    let s = SP.get(nm); if (s !== undefined) return s;
    const at = window.AT_ATLAS, src = at && at.sprites[nm]; s = null;
    if (typeof src === 'string') {
      const bar = src.indexOf('|'), pal = src.slice(0, bar), px = src.slice(bar + 1), c = document.createElement('canvas'); c.width = c.height = 16;
      const cx = c.getContext('2d'), id = cx.createImageData(16, 16), d = id.data; let x0 = 16, y0 = 16, x1 = -1, y1 = -1;
      for (let i = 0; i < 256; i++) {
        const ch = px[i]; if (!ch || ch === '.') continue;
        const j = at.alpha.indexOf(ch) * 6; if (j < 0 || j + 6 > pal.length) continue;
        d[i * 4] = parseInt(pal.substr(j, 2), 16); d[i * 4 + 1] = parseInt(pal.substr(j + 2, 2), 16); d[i * 4 + 2] = parseInt(pal.substr(j + 4, 2), 16); d[i * 4 + 3] = 255;
        const x = i & 15, y = i >> 4; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      cx.putImageData(id, 0, 0);
      if (x1 >= 0) s = { c, x0, y0, x1, y1, v: {} };
    }
    SP.set(nm, s); return s;
  }
  function vari(s, f, w, r) {
    const key = (r ? 'r' : f ? 'f' : '') + (w ? 'w' : ''); if (!key) return s.c;
    let c = s.v[key]; if (c) return c;
    c = document.createElement('canvas'); c.width = c.height = 16; const x = c.getContext('2d');
    if (r) { x.translate(16, 0); x.rotate(Math.PI / 2); } else if (f) { x.translate(16, 0); x.scale(-1, 1); }   // r: (x, y) -> (15 - y, x), head to the right
    x.drawImage(s.c, 0, 0); x.setTransform(1, 0, 0, 1, 0, 0);
    if (w) { x.globalCompositeOperation = 'source-in'; x.fillStyle = '#fff'; x.fillRect(0, 0, 16, 16); }
    return (s.v[key] = c);
  }
  let X = null, DIM = 1;   // the context put() draws on (main canvas, or the background while baking); alpha factor for an unlit floor
  /* draw sprite nm with its visible bottom-centre at (cx, fy) art px. o: f mirrored, w white, r lying, a alpha, sc integer scale, sit = rows cut off
     at the bottom (sitting), sq = squash rows */
  function put(nm, cx, fy, o) {
    const s = spr(nm); if (!s) return;
    const f = o && o.f, w = o && o.w, r = o && o.r, sc = (o && o.sc) || 1, a = (o && o.a != null ? o.a : 1) * DIM;
    if (a <= 0.01) return;
    let x0 = s.x0, x1 = s.x1, y1 = s.y1;
    if (r) { x0 = 15 - s.y1; x1 = 15 - s.y0; y1 = s.x1; } else if (f) { x0 = 15 - s.x1; x1 = 15 - s.x0; }
    const dx = Math.round(cx - (x0 + x1 + 1) / 2 * sc), dy = Math.round(fy - (y1 + 1) * sc), c = vari(s, f, w, r);
    if (a < 1) X.globalAlpha = a;
    if (o && o.sit) X.drawImage(c, 0, 0, 16, y1 + 1 - o.sit, dx, dy + o.sit * sc, 16 * sc, (y1 + 1 - o.sit) * sc);
    else if (o && o.sq) X.drawImage(c, 0, 0, 16, y1 + 1, dx, dy + o.sq, 16 * sc, (y1 + 1) * sc - o.sq);
    else X.drawImage(c, dx, dy, 16 * sc, 16 * sc);
    if (a < 1) X.globalAlpha = 1;
  }
  const dot = (x, y, c, w, hh) => { X.fillStyle = c; X.fillRect(Math.round(x), Math.round(y), w || 1, hh || 1); };
  const shadow = (x, y, w) => { X.globalAlpha = .32 * DIM; X.fillStyle = '#000'; X.fillRect(Math.round(x - w / 2), y - 1, w, 2); X.fillRect(Math.round(x - w / 2) + 2, y + 1, w - 4, 1); X.globalAlpha = 1; };
  // tiny pixel font: 3x5 digits for damage numbers
  const DIG = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];
  function digits(v, x, y, c) {
    const s = String(v);
    for (const [ox, oy, cc] of [[1, 0, '#1a0c08'], [-1, 0, '#1a0c08'], [0, 1, '#1a0c08'], [0, -1, '#1a0c08'], [0, 0, c]]) {
      X.fillStyle = cc;
      for (let i = 0; i < s.length; i++) { const m = DIG[s.charCodeAt(i) - 48]; if (m) for (let j = 0; j < 15; j++) if (m[j] === '1') X.fillRect(x + i * 4 + (j % 3) + ox, y + ((j / 3) | 0) + oy, 1, 1); }
    }
  }
  // the two cue bubbles (pixel grids): red '!' = an unread wait (the only red alert), grey '…' = a wait I already read / no answer
  let BUB = null;
  function bubbles() {
    if (BUB) return BUB;
    const mk = (rows, map) => { const c = document.createElement('canvas'); c.width = rows[0].length; c.height = rows.length; const x = c.getContext('2d'); rows.forEach((r, y) => { for (let i = 0; i < r.length; i++) if (map[r[i]]) { x.fillStyle = map[r[i]]; x.fillRect(i, y, 1, 1); } }); return c; };
    BUB = {
      bang: mk(['.KKKKKKK.', 'KHRRRRRRK', 'KRRRWRRRK', 'KRRRWRRRK', 'KRRRWRRRK', 'KRRRRRRRK', 'KRRRWRRRK', 'KRRRRRRRK', '.KKKRKKK.', '...KRK...', '....K....'], { K: '#2b0c09', R: '#e3392b', H: '#ff7a68', W: '#ffffff' }),
      read: mk(['.KKKKKKKKK.', 'KGGGGGGGGGK', 'KGGGGGGGGGK', 'KGDGGDGGDGK', 'KGGGGGGGGGK', '.KKKGKKKKK.', '...KGK.....', '....K......'], { K: '#3b3b42', G: '#d6d6dc', D: '#5a5a63' })
    };
    return BUB;
  }
  // additive glow sprites, one per colour
  const GL = new Map();
  function glowAt(col, x, y, r, a) {
    if (a <= 0.005) return;
    const key = col.join(); let c = GL.get(key);
    if (!c) { c = document.createElement('canvas'); c.width = c.height = 64; const x2 = c.getContext('2d'), gr = x2.createRadialGradient(32, 32, 0, 32, 32, 32), rgb = col.join(','); gr.addColorStop(0, 'rgba(' + rgb + ',1)'); gr.addColorStop(.35, 'rgba(' + rgb + ',.45)'); gr.addColorStop(1, 'rgba(' + rgb + ',0)'); x2.fillStyle = gr; x2.fillRect(0, 0, 64, 64); GL.set(key, c); }
    X.globalCompositeOperation = 'lighter'; X.globalAlpha = a * T.gf * DIM; X.drawImage(c, x - r, y - r, r * 2, r * 2); X.globalAlpha = 1; X.globalCompositeOperation = 'source-over';
  }

  // ---------- theme: the five fan themes tint the stone and the light; light mode = a brighter sandstone dungeon ----------
  const THM = {
    claude: { f: [84, 68, 57], w: [104, 84, 69], r: [31, 25, 22], l: [255, 170, 95], ac: [226, 134, 95] },
    chatgpt: { f: [64, 71, 67], w: [83, 92, 87], r: [20, 23, 22], l: [255, 214, 160], ac: [25, 195, 125] },
    gemini: { f: [59, 65, 88], w: [77, 85, 114], r: [17, 19, 30], l: [182, 198, 255], ac: [138, 162, 255] },
    grok: { f: [66, 66, 66], w: [86, 86, 86], r: [13, 13, 13], l: [236, 236, 236], ac: [244, 244, 244] },
    muse: { f: [75, 61, 90], w: [95, 79, 114], r: [23, 18, 32], l: [255, 166, 222], ac: [208, 123, 240] }
  };
  const mix = (a, b, f) => a.map((v, i) => v + (b[i] - v) * f);
  let T = null;
  function pal() {
    const t = THM[A && A.theme()] || THM.claude, dk = !A || A.dark();
    if (dk) return T = { f: t.f, w: t.w, r: t.r, l: t.l, ac: t.ac, amb: .3, maxA: .8, sh: [6, 5, 9], gf: 1, dk };
    const lift = c => c.map(v => Math.min(255, v * 2.5));
    return T = { f: mix([206, 182, 140], lift(t.f), .22), w: mix([224, 200, 158], lift(t.w), .22), r: mix([150, 126, 98], lift(t.r).map(v => v * .6), .2), l: mix([255, 226, 170], t.l, .3), ac: t.ac, amb: .74, maxA: .42, sh: [64, 44, 26], gf: .45, dk };
  }

  // ---------- activities: what the agent is doing now -> what its hero does ----------
  const SEARCH = /^(?:sudo\s+)?(?:grep|egrep|rg|ag|ack|find|fd|ls|ll|tree|cat|bat|head|tail|less|more|wc|du|stat|file|which|where|jq|git\s+(?:log|diff|status|show|blame|grep|ls-files)|sed\s+-n|Get-ChildItem|Get-Content|Select-String|type|dir)\b/i;
  const EXPLORE = /^(?:Read|Glob|Grep|LS|NotebookRead|read_file|list_dir|list_files|list_directory|view|view_file|view_file_outline|file_search|grep_search|search_files|find_by_name|codebase_search)$/i;
  const FORGE = /^(?:Edit|Write|MultiEdit|NotebookEdit|apply_patch|write_file|edit_file|create_file|str_replace\w*|replace_file_content|write_to_file)$/i;
  const SCOUT = /^(?:WebSearch|WebFetch|web_search|web_fetch|search_web|read_url_content|browser\w*)$|^mcp__.*(?:fetch|search|brows|navigat|page|web|chrome|playwright|screenshot|url)/i;
  const SUMMON = /^(?:Agent|Task|spawn_agent|Subagent)$/i;
  const STUDY = /^(?:TodoWrite|TodoRead|ExitPlanMode|EnterPlanMode|update_plan|todo\w*|plan\w*)$/i;
  const SHELL = /^(?:Bash|Monitor|PowerShell|shell|exec|run_command|run_terminal_cmd)$/i;
  const KNOWN = [EXPLORE, FORGE, SCOUT, SUMMON, STUDY, SHELL];
  const PROSE = /^(?:[A-Z][a-z]+(?:\s|$)|[^\x00-\x7f])/, LOOK = /^(?:List|Find|Search|Show|Read|Check|View|Look|Inspect|Count|Print|Display|Get|Locate|Examine|Review|Compare|Verify|See|Peek|Dump)\b|확인|조회|검색|찾|목록|보기|읽|살펴|탐색/;
  const RUNNER = /^(?:python3?|node|npm|npx|pnpm|yarn|uv|uvx|cargo|go|make|bash|sh|pip3?|poetry|deno|bun|docker|kubectl|git|dotnet|java|mvn|gradle|ruby|bundle)$/;
  const stripCd = c => String(c || '').replace(/^\s*(?:cd\s+\S+\s*(?:&&|;)\s*)+/, '').trim();
  const base = p => short(String(p || '').trim().split(/\s+/)[0].replace(/[\\/]+$/, '').split(/[\\/]/).pop(), 18);
  function cmdHead(c) {
    const tk = stripCd(c).split(/\s+/).filter(Boolean); while (tk.length > 1 && (/^\w+=/.test(tk[0]) || /^(?:sudo|time|nice|env)$/.test(tk[0]))) tk.shift();
    const b = s => String(s || '').split(/[\\/]/).pop(); let hd = b(tk[0]);
    if (RUNNER.test(hd) && tk[1] && !/^-/.test(tk[1])) hd += ' ' + b(tk[1]); else if (/^python3?$/.test(hd) && tk[1] === '-m' && tk[2]) hd = tk[2];
    return short(hd, 20);
  }
  const L = (k, label, x) => Object.assign({ k, label }, x);
  function fight(n, cmd, lab) {
    const a = n.a || {}, hd = cmdHead(cmd), seed = hsh(hd || n.key);
    const procAge = (a.procs || []).reduce((m, p) => p.bg ? m : Math.max(m, +p.age || 0), 0);   // a dev server left running in the background is not this fight
    const acts = a.acts || []; let lt = 0; for (let i = acts.length - 1; i >= 0; i--) if (acts[i].k === 'tool') { lt = +acts[i].t || 0; break; }
    const stAge = n.enteredPerf > -1e8 ? (performance.now() - n.enteredPerf) / 1000 : 0;
    // a long fight (the command has been running for 5 minutes) brings out a boss
    const boss = procAge >= 300 || stAge >= 300 || (n.st === 'tool' && lt > 0 && (Date.now() - lt) / 1000 >= 300);
    return L('fight', '전투' + (lab || hd ? ' · ' + (lab || hd) : '') + (boss ? ' (보스)' : ''), { mon: boss ? 'boss.' + (seed % 4) : 'mon.' + (seed % 16), boss });
  }
  function act(n) {
    if (!n) return null;
    const a = n.a || {}, st = n.st, now = String(a.now || '');
    if (st === 'dead') return L('grave', '묘비 · 연결 끊김');
    if (st === 'stopped') return L('down', '쓰러짐 · 중단됨');
    if (st === 'done') return L('loot', '전리품 · 완료');
    if (st === 'idle') return R.isQuietLong(a) ? L('camp', '야영 · 오래 비움', { long: true }) : L('camp', '야영 · 쉬는 중');
    if (st === 'stall') return L('stuck', '거미줄 · 응답 없음');
    if (st === 'user') return L('gate', '관문 · ' + (/승인/.test(n.why || '') ? '승인 대기' : '답 기다림'));
    if (st === 'child') return L('summon', '소환 · 하위 ' + (n.nKids || 0));
    const p = C.parseAct(now); let nm = p.name, obj = p.obj;
    if (!nm) { const m = now.match(/^([\w.-]{2,80}): ([\s\S]*)$/); if (m) { nm = m[1]; obj = m[2]; } }   // long MCP tool names
    if (!nm) { const m = now.match(/^([A-Za-z_][\w.-]{1,79})(?:\s+([\s\S]*))?$/); if (m && KNOWN.some(r => r.test(m[1]))) { nm = m[1]; obj = m[2] || ''; } }   // a bare tool name: 'TodoWrite', 'apply_patch …', 'mcp__x__browser_batch'
    obj = String(obj || '').trim();
    if (SHELL.test(nm)) {
      const c = stripCd(obj);
      // Claude Code sends the command's description when it has one ('Run the test suite', '테스트 실행'): prose, not a command line
      if (PROSE.test(c)) return LOOK.test(c) ? L('explore', '탐험 · ' + short(c, 18), { held: 'torch' }) : fight(n, c.split(/\s+/).slice(0, 2).join(' '), short(c, 18));
      if (SEARCH.test(c)) return L('explore', '탐험 · ' + cmdHead(c), { held: /^(?:sudo\s+)?(?:grep|egrep|rg|ag|ack|find|fd|Select-String|git\s+grep)\b/i.test(c) ? 'lens' : /^(?:ls|ll|tree|dir|Get-ChildItem)\b/i.test(c) ? 'compass' : 'torch' });
      return fight(n, c);
    }
    if (EXPLORE.test(nm)) return L('explore', '탐험 · ' + (/grep|search/i.test(nm) ? short(obj, 18) : base(obj)), { held: /grep|search/i.test(nm) ? 'lens' : /glob|ls|list|find/i.test(nm) ? 'compass' : 'torch' });
    if (FORGE.test(nm)) return L('forge', '제작' + (/[\w가-힣]/.test(base(obj)) ? ' · ' + base(obj) : ''));
    if (SCOUT.test(nm)) { const s = /search/i.test(nm) ? 0 : /fetch|url/i.test(nm) ? 1 : 2; return L('scout', '정찰 · ' + ['검색', '웹 문서', '브라우저'][s], { prop: ['orb', 'scope', 'ball'][s] }); }
    if (SUMMON.test(nm)) return L('summon', '소환 · 하위 에이전트');
    if (STUDY.test(nm)) return L('study', '연구 · 계획');
    if (nm) return fight(n, obj, short(nm.replace(/^mcp__/, ''), 16));
    if (st === 'tool') return fight(n, '', '도구 실행');   // a tool runs but its line is prose: no command to name
    return L('train', '수련 · 생각 중');
  }
  const heroSprite = n => 'hero.' + (TOOLS.includes(n.tool) ? n.tool : 'claude') + '.' + (hsh(n.key) % 5);
  const kidSprite = n => 'kid.' + (TOOLS.includes(n.tool) ? n.tool : 'claude') + '.' + (hsh(n.key) % 4);
  const cueOf = n => n ? (n.waiting ? 'bang' : n.ack ? 'read' : null) : null;
  const ACTIVE = new Set(['train', 'explore', 'forge', 'fight', 'scout', 'summon', 'study']);

  /* the station of one hero is a 72 x 36 art-px stage: back row (y 2..18) = companions in slots SLOT and a back prop at x 64;
     main row (feet at y 36) = the hero at hx and its prop at mx. propsOf lists the props an activity puts there. */
  const SLOT = [8, 21, 34, 47];
  const STAGE = { train: { hx: 28, mx: 48 }, explore: { hx: 26 }, forge: { hx: 31, mx: 48 }, fight: { hx: 27, mx: 50 }, scout: { hx: 29, mx: 48 }, summon: { hx: 22, mx: 43 },
    study: { hx: 27, mx: 45 }, gate: { hx: 26, mx: 52 }, stuck: { hx: 26, mx: 45 }, camp: { hx: 25, mx: 44 }, loot: { hx: 26, mx: 46 }, down: { hx: 27, mx: 46 }, grave: { hx: 26 } };
  function propsOf(k, H) {
    const v = H.h, out = [], m = (s, x, back, o) => out.push({ s, x, back, o });
    switch (k) {
      case 'train': m(v % 3 === 2 ? 'target' : 'dummy.' + (v % 2), 48); break;
      case 'explore': m('map.' + (v % 2), 64, true); break;
      case 'forge': m('anvil', 48); m('forge', 64, true); break;
      case 'fight': m(H.mon || 'mon.0', H.boss ? 54 : 50, false, { sc: H.boss ? 2 : 1 }); break;
      case 'scout': m(H.prop || 'scope', 48); break;
      case 'summon': m('tome', 43); m('spell', 64, true); break;
      case 'study': m('book', 45); m('shelf', 64, true); break;
      case 'gate': m('door.' + (v % 2), 52); m('locked', 64, true); break;
      case 'stuck': m('hourglass', 45); break;
      case 'camp': m('camp.' + (v % 2), 44); m('tent', 64, true); m('bag', 9); break;
      case 'loot': m('chest.' + (v % 3), 46); break;
      case 'down': m('skull', 46); break;
      case 'grave': m('tomb.' + (v % 2), 26); break;
    }
    return out;
  }

  // ---------- size steps: integer device px per art px (crisp), from the pane width and DPR ----------
  const scaleFor = (devW, dpr, z) => {
    const minS = Math.max(1, Math.ceil(dpr - .01)), m = clamp(Math.round(devW / 560), Math.max(minS, Math.ceil(dpr * 2 - .01)), 10);   // 보통 keeps >= 2 CSS px per art px
    return z === 'l' ? clamp(Math.max(Math.round(devW / 380), m + 1), 2, 12) : z === 's' ? clamp(Math.min(Math.round(devW / 900), m - 1), minS, 10) : m;
  };

  // ---------- state ----------
  let A = null, D = null, host = null, world = null, cv = null, g = null, deco = null, hits = null, sig = '', bg = null;
  let S = 2, dpr = 1, k = 2, devW = 0, W = 0, H = 0, G = null, floors = [], rooms = [], cells = [], glows = [], lastT = 0;
  const NODES = new Map(), heroes = new Map(), els = new Map(), planes = [];
  const PT = Array.from({ length: 360 }, () => ({ on: false, x: 0, y: 0, vx: 0, vy: 0, g: 0, t0: 0, life: 1, c: '', k: 0, v: 0 }));
  let pti = 0;
  function emit(kd, x, y, vx, vy, gr, life, c, v) {
    const p = PT[pti = (pti + 1) % PT.length];
    p.on = true; p.k = kd; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.g = gr; p.life = life; p.c = c; p.v = v || 0; p.t0 = performance.now();
  }
  const SPK = ['#fff3b0', '#ffd65a', '#ff9a3c', '#ffffff'];
  function sparks(x, y, n, up) { for (let i = 0; i < n; i++) emit(0, x, y, (Math.random() - .5) * .06, -Math.random() * .05 - (up ? .03 : .005), .00012, 260 + Math.random() * 260, SPK[i % 4]); }
  function dust(x, y, n) { for (let i = 0; i < n; i++) emit(2, x + (Math.random() - .5) * 10, y - Math.random() * 6, (Math.random() - .5) * .025, -Math.random() * .012, 0, 380 + Math.random() * 200, T && T.dk ? '#9a9088' : '#8a7a66'); }

  // ---------- layout: floors (servers) -> chambers (projects, flowed and wrapped to the width) -> stations (root agents) ----------
  function layout() {
    const cw = host.clientWidth || 800; dpr = window.devicePixelRatio || 1; devW = cw * dpr;
    S = scaleFor(devW, dpr, R.S.ofcSize); k = S / dpr;
    W = Math.max(150, Math.floor(devW / S));
    const CW = Math.max(72, Math.ceil(136 / k)), CH = 40 + Math.ceil(32 / k), WALLH = Math.max(24, Math.ceil(22 / k) + 8), LS = Math.max(20, Math.ceil(26 / k) + 6), M = 6, GP = 6, PAD = 6;
    G = { CW, CH, WALLH, LS, M };
    floors = []; rooms = []; cells = [];
    let y = 2;
    D.servers.forEach((sv, si) => {
      const fl = { sv, si, y, lit: sv.state !== 'error' }; floors.push(fl);
      y += LS + 3;
      const maxCols = Math.max(1, Math.floor((W - 2 * M - 2 * PAD - 6) / CW));
      const items = D.projects.filter(p => p.server === sv.id).map(p => {
        const roots = D.roots.filter(r => r.project === p.id), n = Math.max(1, roots.length), cols = Math.min(n, maxCols), rows = Math.ceil(n / cols);
        return { p, roots, cols, rows, w: Math.min(W - 2 * M, Math.max(cols * CW + 2 * PAD + 6, 116)), h: WALLH + rows * CH + 6, fl };
      });
      if (!items.length) items.push({ p: null, roots: [], cols: 0, rows: 0, w: Math.min(W - 2 * M, 170), h: WALLH + 32, fl });   // a floor without projects: one empty chamber
      const lines = []; let line = [], x = M;
      for (const it of items) { if (line.length && x + it.w > W - M) { lines.push(line); line = []; x = M; } line.push(it); x += it.w + GP; }
      if (line.length) lines.push(line);
      for (const ln of lines) {
        // widen the chambers of a line toward the full width (at most +50 % each), centre what is left
        const used = ln.reduce((s, it) => s + it.w, 0) + GP * (ln.length - 1), extra = W - 2 * M - used;
        for (const it of ln) it.w += Math.max(0, Math.min(Math.floor(extra * it.w / used), Math.floor(it.w * .5)));
        const tot = ln.reduce((s, it) => s + it.w, 0) + GP * (ln.length - 1), rh = Math.max(...ln.map(it => it.h));
        let xx = M + Math.max(0, Math.floor((W - 2 * M - tot) / 2));
        for (const it of ln) {
          const rm = { p: it.p, fl, x: xx, y, w: it.w, h: rh, cols: it.cols, rows: it.rows, n: it.roots.length, seed: hsh(it.p ? it.p.id : 'empty:' + sv.id) };
          rm.gx = rm.x + Math.floor((rm.w - it.cols * CW) / 2); rm.gy = rm.y + WALLH + 2;
          it.roots.forEach((r, i) => cells.push({ key: r.key, room: rm, fl, x: rm.gx + (i % it.cols) * CW, y: rm.gy + Math.floor(i / it.cols) * CH, ox: (CW - 72) >> 1, kids: [], kk: [], more: 0 }));
          rooms.push(rm); xx += it.w + GP;
        }
        y += rh + GP;
      }
      y += 4; fl.h = y - fl.y;
    });
    H = y + 2;
    cv.width = W * S; cv.height = H * S;
    const cssW = W * S / dpr, cssH = H * S / dpr;
    cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px'; world.style.width = cssW + 'px'; world.style.height = cssH + 'px';
    cls(world, 'tiny', k < 1.5);
  }

  // ---------- bake: rock, corridors, chambers (brick wall + tiled floor), decor and the static light into one offscreen canvas ----------
  // the sign's width in art px (DOM text: name + branch + the unread chip), so wall lamps keep clear of it
  const signW = p => { const s = String(p ? p.name : ''); let w = 56 + Math.min(18, String(p && p.branch || '').length) * 6.6; for (const ch of s.slice(0, 28)) w += ch.charCodeAt(0) > 0x2e7f ? 12.5 : 7.4; return Math.ceil(w / k); };
  function tile(lx, ly, st, sd) {
    const tw = st === 1 ? 12 : 8, th = 8, row = Math.floor(ly / th), off = st === 2 ? 0 : (row % 2) * (tw >> 1), tx = (lx + off) % tw, ty = ly % th, col = Math.floor((lx + off) / tw);
    if (tx === 0 || ty === 0) return .66;
    const tn = nz(col, row, sd);
    let f = .84 + tn * .2 + nz(lx, ly, sd + 9) * .07 + (ty === 1 ? .05 : 0) - (tx === tw - 1 || ty === th - 1 ? .06 : 0);
    if (st === 2 && (col + row) % 2) f -= .1;
    if (tn > .86 && (tx === ty || tx + ty === tw - 1)) f -= .2;   // a crack
    return f;
  }
  function bake() {
    pal();
    bg = document.createElement('canvas'); bg.width = W; bg.height = H;
    const bx = bg.getContext('2d'), id = bx.createImageData(W, H), P = new Uint32Array(id.data.buffer);
    const cl = v => v < 0 ? 0 : v > 255 ? 255 : v | 0;
    const set = (x, y, c, f) => { P[y * W + x] = (0xff000000 | (cl(c[2] * f) << 16) | (cl(c[1] * f) << 8) | cl(c[0] * f)) >>> 0; };
    const rect = (x0, y0, w, hh, fn) => { const xa = Math.max(0, x0), xb = Math.min(W, x0 + w), ya = Math.max(0, y0), yb = Math.min(H, y0 + hh); for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) fn(x, y, x - x0, y - y0); };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(x, y, T.r, .72 + nz(x >> 2, y >> 2, 1) * .3 + nz(x, y, 2) * .22 + (nz(x, y, 3) > .988 ? .55 : 0));
    for (const fl of floors) {   // the corridor of each floor (its label sits on it, stairs at the end)
      rect(G.M, fl.y + 2, W - 2 * G.M, G.LS - 1, (x, y, lx, ly) => set(x, y, ly === 0 ? T.w : T.f, ly === 0 ? .55 : ly === G.LS - 2 ? .5 : tile(lx, ly, 0, 77 + fl.si) * .74));
    }
    for (const rm of rooms) {
      const st = rm.seed % 3, WH = G.WALLH;
      rect(rm.x, rm.y, rm.w, rm.h, (x, y, lx, ly) => {
        const e = Math.min(lx, ly, rm.w - 1 - lx, rm.h - 1 - ly);
        if (e === 0) return set(x, y, T.r, .4);
        if (e < 3) return set(x, y, T.w, ly < 3 && e === ly ? 1.08 - (e - 1) * .12 : .58 + (e === 1 ? .1 : 0));
        if (ly < WH) {   // the wall face: bricks, a lit top edge, a dark foot
          if (ly >= WH - 2) return set(x, y, T.w, .48);
          const bw = 10, bh = 5, row = Math.floor((ly - 3) / bh), off = (row % 2) * 5, bxp = (lx + off) % bw, byp = (ly - 3) % bh;
          if (bxp === 0 || byp === 0) return set(x, y, T.w, .56);
          return set(x, y, T.w, .8 + nz(Math.floor((lx + off) / bw), row, rm.seed) * .26 + (byp === 1 ? .09 : 0) + nz(lx, ly, 5) * .05);
        }
        const d = ly - WH;
        set(x, y, T.f, tile(lx - 3, d, st, rm.seed) * (d < 5 ? .62 + d * .075 : 1));
      });
    }
    bx.putImageData(id, 0, 0);
    // decor + light sources
    X = bx; DIM = 1; bx.imageSmoothingEnabled = false;
    const lights = []; glows = [];
    const lamp = (fl, x, y, r, i, flick) => { if (fl.lit) { lights.push([x, y, r, i]); if (flick) glows.push({ x, y, r: r * .55, ph: (x * 7 + y * 13) % 100 }); } };
    for (const fl of floors) put('stairs', W - G.M - 11, fl.y + G.LS);
    for (const rm of rooms) {
      const v = rm.seed, cxm = rm.x + rm.w / 2, half = Math.min(rm.w / 2 - 16, signW(rm.p) / 2), fy = rm.y + G.WALLH;
      // the wall: sconces (and some banners) left and right of the sign
      let n = 0;
      for (let x = rm.x + 14 + (v % 7); x < rm.x + rm.w - 12; x += 40 + (v >> 3) % 14) {
        if (Math.abs(x - cxm) < half + 11) continue;
        if (n++ % 3 === 2 && nz(x, rm.y, v) > .35) put('banner.' + ((v >> 5) + n) % 4, x, fy - 2);
        else { put('sconce.' + (v >> 9) % 2, x, fy - 4); lamp(rm.fl, x, fy - 15, 50, .8, true); }
      }
      if (!n) lamp(rm.fl, cxm, fy - 10, 46, .5, false);
      for (const c of cells) if (c.room === rm) lamp(rm.fl, c.x + c.ox + 32, c.y + 26, 44, .62, false);   // each station sits in a pool of light
      if (!rm.p) { put('web.1', rm.x + 12, rm.gy + 14); put('coffin', cxm, rm.y + rm.h - 6); put('skull', cxm + 22, rm.y + rm.h - 5, { a: .9 }); lamp(rm.fl, cxm, rm.y + rm.h - 14, 30, .2, false); continue; }
      // floor decor in the free spots: the margins beside the stations, empty stations of the last row, the stretched bottom
      const spots = [], mL = rm.gx - rm.x - 3, gw = rm.cols * G.CW, mR = rm.x + rm.w - 3 - (rm.gx + gw);
      for (let r = 0; r < rm.rows; r++) {
        const yy = rm.gy + r * G.CH;
        if (mL >= 14) { spots.push([rm.x + 3 + mL / 2, yy + 22]); if (mL >= 18) spots.push([rm.x + 3 + mL / 2, yy + 40]); }
        if (mR >= 14) { spots.push([rm.x + rm.w - 3 - mR / 2, yy + 22]); if (mR >= 18) spots.push([rm.x + rm.w - 3 - mR / 2, yy + 40]); }
      }
      const left = rm.rows * rm.cols - rm.n;
      for (let i = 0; i < left; i++) { const cx0 = rm.gx + (rm.cols - 1 - i) * G.CW, yy = rm.gy + (rm.rows - 1) * G.CH; spots.push([cx0 + 20, yy + 30], [cx0 + 50, yy + 22], [cx0 + 36, yy + 44]); }
      const by = rm.gy + rm.rows * G.CH; if (rm.y + rm.h - 4 - by >= 16) for (let x = rm.x + 14; x < rm.x + rm.w - 12; x += 22) spots.push([x, rm.y + rm.h - 5]);
      const DECO = ['barrel', 'crate', 'crystal.0', 'crystal.1', 'shroom.0', 'shroom.1', 'pillar.0', 'pillar.1', 'gargoyle', 'coffin', 'pile', 'brazier', 'barrel', 'crate'];
      let placed = 0;
      spots.forEach(([x, y2], i) => {
        if (placed >= 9 || nz(i, 3, v) > .62) return;
        const d = DECO[Math.floor(nz(i, 4, v) * DECO.length)]; placed++;
        put(d, Math.round(x), Math.round(y2));
        if (d === 'brazier') { lamp(rm.fl, x, y2 - 10, 40, .7, true); }
        else if (d.startsWith('crystal')) lamp(rm.fl, x, y2 - 6, 18, .25, false);
      });
    }
    // the static light: ambient + every lamp, as a darkness layer over stone and decor (lit areas pop, the rock stays dark)
    const Lm = new Float32Array(W * H).fill(T.amb);
    for (const [lx, ly, r, i] of lights) {
      const x0 = Math.max(0, Math.floor(lx - r)), x1 = Math.min(W - 1, Math.ceil(lx + r)), y0 = Math.max(0, Math.floor(ly - r)), y1 = Math.min(H - 1, Math.ceil(ly + r));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const d = Math.sqrt((x - lx) * (x - lx) + (y - ly) * (y - ly) * 1.3) / r; if (d < 1) Lm[y * W + x] += i * (1 - d) * (1 - d); }
    }
    for (const fl of floors) if (!fl.lit) for (let y = fl.y; y < Math.min(H, fl.y + fl.h); y++) for (let x = 0; x < W; x++) Lm[y * W + x] *= .45;   // a disconnected server: the floor is dark
    const sh = document.createElement('canvas'); sh.width = W; sh.height = H;
    const sx = sh.getContext('2d'), sd = sx.createImageData(W, H), Q = new Uint32Array(sd.data.buffer), rgb = (T.sh[2] << 16) | (T.sh[1] << 8) | T.sh[0];
    for (let i = 0; i < Q.length; i++) { const a = clamp(1 - Lm[i], 0, T.maxA); Q[i] = (((a * 255) | 0) << 24 | rgb) >>> 0; }
    sx.putImageData(sd, 0, 0); bx.drawImage(sh, 0, 0);
  }

  // ---------- per hero animation state (kept across polls; keyed by agent) ----------
  function syncHeroes() {
    const now = performance.now(), keep = new Set();
    for (const c of cells) {
      const n = NODES.get(c.key); if (!n) continue;
      keep.add(c.key);
      const a = act(n); let Hh = heroes.get(c.key);
      if (!Hh) { const hv = hsh(c.key); Hh = { h: hv, ph: hv % 997, k: a.k, x: STAGE[a.k].hx, tAct: -1e9, hopAt: -1e9, old: null, pt: null, pw: 0, fx: 0 }; heroes.set(c.key, Hh); }
      else if (Hh.k !== a.k) {
        // a new activity: the old props poof away, the new ones fade in, the hero walks over (never a teleport)
        Hh.old = { k: Hh.k, t0: now, props: propsOf(Hh.k, Hh) }; Hh.k = a.k; Hh.tAct = now; Hh.pt = null; Hh.pw = 0;
        if (a.k === 'loot') Hh.hopAt = now;
        if (!A.reduced() && c.fl.lit) for (const p of Hh.old.props) dust(c.x + c.ox + p.x, c.y + (p.back ? 18 : 36), 6);
      }
      Hh.mon = a.mon; Hh.boss = !!a.boss; Hh.held = a.held || 'torch'; Hh.prop = a.prop; Hh.long = !!a.long; Hh.sp = heroSprite(n);
    }
    for (const key of [...heroes.keys()]) if (!keep.has(key)) heroes.delete(key);
  }

  // ---------- DOM overlay: floor labels, chamber signs, '+N' chips (decorative) and the agent buttons (patched in place) ----------
  const px = v => (Math.round(v * k * 100) / 100) + 'px';
  const box = (x, y, w, hh) => 'left:' + px(x) + ';top:' + px(y) + ';width:' + px(w) + ';height:' + px(hh);
  const kidRank = n => n.waiting ? 0 : n.ack ? 1 : A.active(n.st) ? 2 : n.st === 'stall' || n.st === 'user' ? 3 : 4;
  function mkBtn(key, kid) {
    const b = kid ? h('button.hit.kid', { type: 'button', data: { agent: key } })
      : h('button.hit', { type: 'button', data: { agent: key } }, h('span.np', h('span.nm', h('i'), h('span')), h('span.ac', h('span.al'), h('span.md'))));
    A.bindAgent(b, () => NODES.get(key));
    els.set(key, b); return b;
  }
  function patch(b, n) {
    R.stClass(b, n.st); b.dataset.st = n.st; b.dataset.w = n.waiting ? '1' : ''; b.dataset.ack = n.ack ? '1' : '';
    attr(b, 'aria-label', A.label(n));
  }
  function refresh() {
    const want = [], fr = [];
    for (const fl of floors) {
      const sv = fl.sv, cnt = D.roots.filter(r => r.server === sv.id).length;
      fr.push(h('div.flr', { style: 'left:' + px(G.M + 3) + ';top:' + px(fl.y + 2 + (G.LS - 1) / 2) + ';max-width:' + px(W - 2 * G.M - 30) },
        h('b', 'B' + (fl.si + 1)), h('span', sv.name), h('small', (sv.kind === 'local' ? '내 PC' : 'SSH') + ' · ' + (sv.state === 'ok' ? '연결됨' : sv.state === 'connecting' ? '연결 중' : '끊김 — 불이 꺼졌습니다') + ' · 영웅 ' + cnt)));
    }
    for (const rm of rooms) {
      if (!rm.p) { fr.push(h('div.emp', { style: 'left:' + px(rm.x + rm.w / 2) + ';top:' + px(rm.y + G.WALLH / 2 + 1) }, '빈 층 — 에이전트 없음')); continue; }
      const p = rm.p, ags = D.roots.filter(r => r.project === p.id), wait = ags.reduce((m, r) => m + (r.waiting ? 1 : 0) + r.kids.filter(x => x.waiting).length, 0);
      fr.push(h('div.sgn' + (p.other ? '.other' : ''), { style: 'left:' + px(rm.x + rm.w / 2) + ';top:' + px(rm.y + 1 + G.WALLH / 2) + ';max-width:' + px(rm.w - 20), title: p.name + (p.branch ? ' · ' + p.branch : '') },
        h('span', p.name), p.branch ? h('small', p.branch) : null, wait ? h('b', '!' + wait) : null));
    }
    for (const c of cells) {
      const n = NODES.get(c.key); if (!n) continue;
      const b = els.get(c.key) || mkBtn(c.key, false);
      b.style.cssText = box(c.x, c.y + 19, G.CW, G.CH - 20);
      patch(b, n);
      const np = b.firstChild, nm = np.firstChild, ac = np.lastChild, a = act(n), sm = R.shortModel(n.a && n.a.model);
      nm.firstChild.className = 'st-' + n.st; text(nm.lastChild, n.name);
      text(ac.firstChild, a.label);
      const md = ac.lastChild; text(md, sm ? (n.a.modelPrev ? '⇄ ' : '') + sm : ''); md.hidden = !sm; cls(md, 'chg', !!(n.a && n.a.modelPrev)); cls(md, 'fb', !!(n.a && n.a.modelFb));
      attr(md, 'title', n.a && n.a.modelPrev ? R.shortModel(n.a.modelPrev) + ' → ' + sm + (n.a.modelFb ? ' (안전장치 재라우팅)' : '') : null);
      cls(b, 'long', R.isQuietLong(n.a));
      want.push(b);
      // companions: unread first, then read waits, then the busy ones; up to 4 shown, else 3 and a '+N' chip
      const ks = n.kids.slice().sort((x, y) => kidRank(x) - kidRank(y)), many = Math.max(ks.length, n.nKids || 0) > 4, shown = ks.slice(0, many ? 3 : 4);
      c.kids = shown.map(x => x.key); c.kk = shown.map(x => act(x).k); c.more = Math.max(ks.length, n.nKids || 0) - shown.length;
      shown.forEach((kn, i) => { const kb = els.get(kn.key) || mkBtn(kn.key, true); kb.style.cssText = box(c.x + c.ox + SLOT[i] - 7, c.y + 1, 14, 18); patch(kb, kn); want.push(kb); });
      if (c.more > 0) fr.push(h('span.more', { style: 'left:' + px(c.x + c.ox + SLOT[3]) + ';top:' + px(c.y + 10), title: '하위 ' + Math.max(ks.length, n.nKids || 0) + '개' }, '+' + c.more));
    }
    deco.replaceChildren(...fr);
    // reuse buttons by key, drop the gone ones, put the rest in reading order; a moved focused button gets its focus back
    const ws = new Set(want), fe = document.activeElement;
    for (const [key, el] of els) if (!ws.has(el)) { el.remove(); els.delete(key); }
    want.forEach((el, i) => { if (hits.children[i] !== el) hits.insertBefore(el, hits.children[i] || null); });
    if (fe && ws.has(fe) && document.activeElement !== fe) fe.focus({ preventScroll: true });
  }

  // ---------- frame ----------
  const crossed = (t, dt, per, off) => Math.floor((t - off) / per) > Math.floor((t - dt - off) / per);
  function bubble(kind, x, y, t, rm) { const B = bubbles()[kind]; if (!B) return; const bob = rm ? 0 : Math.floor(t / 420) % 2; X.globalAlpha = DIM; X.drawImage(B, Math.round(x - B.width / 2), Math.round(y - B.height - bob)); X.globalAlpha = 1; }
  function twinkle(x, y, a, c) { if (a <= .05) return; X.globalAlpha = a * DIM; dot(x, y - 1, c); dot(x - 1, y, c); dot(x, y, '#fff'); dot(x + 1, y, c); dot(x, y + 1, c); X.globalAlpha = 1; }
  function drawCell(c, t, dt, rm) {
    const n = NODES.get(c.key), Hh = heroes.get(c.key); if (!n || !Hh) return;
    const sx = c.x + c.ox, F = c.y + 36, B = c.y + 18, k2 = Hh.k, st = STAGE[k2], lit = c.fl.lit, fx = lit && !rm;
    DIM = lit ? 1 : .55;
    // --- the hero moves toward its spot (explore: patrols the station) ---
    let tx = st.hx;
    if (k2 === 'explore' && !rm) {
      if (Hh.pt == null) Hh.pt = 44;
      if (Math.abs(Hh.x - Hh.pt) < .5) { if (!Hh.pw) Hh.pw = t + 700; else if (t > Hh.pw) { Hh.pt = Hh.pt > 28 ? 12 : 44; Hh.pw = 0; } }
      tx = Hh.pt;
    }
    const dx0 = tx - Hh.x, spd = (k2 === 'explore' ? .013 : .026) * dt; let walking = false;
    if (rm) Hh.x = tx; else if (Math.abs(dx0) <= spd) Hh.x = tx; else { Hh.x += Math.sign(dx0) * spd; walking = true; }
    if (walking && fx && k2 === 'explore' && Math.floor(Hh.x / 5) !== Hh.fx) { Hh.fx = Math.floor(Hh.x / 5); emit(0, sx + Hh.x - 2 + (Hh.fx % 2) * 3, F, 0, 0, 0, 1800, T.dk ? '#0c0a0a' : '#6b5a44'); }
    const face = walking ? Math.sign(dx0) : 1, hx = Math.round(sx + Hh.x), ph = t + Hh.ph;
    const fadeIn = rm ? 1 : clamp((t - Hh.tAct) / 450, 0, 1);
    // --- the props of the previous activity fade out ---
    if (Hh.old && !rm && t - Hh.old.t0 < 350) for (const p of Hh.old.props) put(p.s, sx + p.x, p.back ? B : F, Object.assign({}, p.o, { a: 1 - (t - Hh.old.t0) / 350 }));
    else Hh.old = null;
    const props = propsOf(k2, Hh);
    // --- back row: back prop, companions ---
    for (const p of props) if (p.back) {
      put(p.s, sx + p.x, B, { a: fadeIn });
      if (p.s === 'forge') glowAt([255, 120, 40], sx + p.x, B - 5, 16, (rm ? .3 : .26 + .08 * Math.sin(t / 90 + Hh.ph)) * fadeIn);
      if (p.s === 'tent' && Hh.long) put('web.0', sx + p.x + 1, B - 1, { a: .85 });
    }
    c.kids.forEach((key, i) => {
      const kn = NODES.get(key); if (!kn) return;
      const kk = c.kk[i] || 'camp', kx = sx + SLOT[i], o = {};
      let lift = 0;
      if (kk === 'down') o.r = 1; else if (kk === 'grave') o.a = .35; else if (kk === 'camp') o.a = R.isQuietLong(kn.a) ? .55 : .85;
      if (!rm && ACTIVE.has(kk)) lift = k2 === 'summon' ? Math.round(1 + Math.sin(t / 260 + i * 1.7) * 1.5) : Math.floor((t + i * 170) / 280) % 2;
      shadow(kx, B, 8);
      put(kidSprite(kn), kx, B - lift, o);
      if (fx && ACTIVE.has(kk) && crossed(ph + i * 333, dt, 1400, 0)) sparks(kx + 5, B - 9, 2, true);
      if (kk === 'loot' && !rm) twinkle(kx + 5, B - 13, Math.max(0, Math.sin(t / 380 + i)), '#ffe58a');
      const cue = cueOf(kn); if (cue) bubble(cue, kx, B - 15, t, rm);
    });
    // --- floor effects ---
    if (k2 === 'summon') {   // a rune circle under the tome, one rune bright and travelling
      const cx2 = sx + 43, col = 'rgb(' + T.ac.join(',') + ')', hi = rm ? -1 : Math.floor(t / 70) % 28;
      X.globalAlpha = (rm ? .8 : .55 + .35 * Math.sin(t / 300)) * fadeIn * DIM;
      for (let i = 0; i < 28; i++) { const an = i / 28 * Math.PI * 2; dot(sx + 43 + Math.cos(an) * 12, F - 1 + Math.sin(an) * 4, i === hi || i === (hi + 14) % 28 ? '#fff' : col); }
      X.globalAlpha = 1;
      glowAt(T.ac, cx2, F - 4, 18, (rm ? .3 : .22 + .12 * Math.sin(t / 300)) * fadeIn);
    }
    // --- main row: shadows, props, the hero, held things ---
    let lunge = 0, flash = false, recoil = 0, sq = 0, hop = 0, hot = false;
    if (!rm) {
      if (k2 === 'train' || k2 === 'fight') {
        const per = k2 === 'fight' ? (Hh.boss ? 1300 : 1050) : 900, q = ph % per, reach = k2 === 'fight' ? 4 : 3;
        lunge = q < 110 ? q / 110 * reach : q < 320 ? reach * (1 - (q - 110) / 210) : 0;
        flash = q >= 110 && q < 200; recoil = q >= 110 && q < 320 ? (k2 === 'fight' ? 2 : (Math.floor(q / 40) % 2 ? 1 : -1)) : 0;
        if (fx && crossed(ph, dt, per, 110)) {
          const mx = sx + (k2 === 'fight' && Hh.boss ? 54 : st.mx);
          sparks(mx - (Hh.boss ? 12 : 6), F - 9, k2 === 'fight' ? 7 : 4, false);
          if (k2 === 'fight') emit(1, mx - 4, F - (Hh.boss ? 36 : 22), 0, -.014, 0, 800, Hh.boss ? '#ff8a5c' : '#ffe14d', 1 + Math.floor(Math.random() * (Hh.boss ? 999 : 99)));
        }
      } else if (k2 === 'forge') {
        const q = ph % 700; sq = q < 90 ? 1 : 0; hot = q < 170;
        if (fx && crossed(ph, dt, 700, 0)) sparks(sx + 48, F - 10, 6, true);
      } else if (k2 === 'loot' && t - Hh.hopAt < 520) hop = Math.round(Math.sin((t - Hh.hopAt) / 520 * Math.PI) * 6);
      else if (k2 === 'scout' && fx && crossed(ph, dt, 600, 0)) emit(0, sx + 48 + (Math.random() - .5) * 8, F - 12, 0, -.012, 0, 900, '#bfe6ff');
      else if (k2 === 'study' && fx && crossed(ph, dt, 1500, 0)) emit(2, sx + 45, F - 12, (Math.random() - .5) * .01, -.01, 0, 900, '#f4ecd8');
      else if (k2 === 'camp' && !Hh.long && fx && crossed(ph, dt, 320, 0)) emit(0, sx + 44 + (Math.random() - .5) * 6, F - 10, (Math.random() - .5) * .006, -.018, 0, 700, Math.random() < .5 ? '#ffb347' : '#ff6a2a');
    }
    for (const p of props) if (!p.back) {
      let s = p.s, o = Object.assign({ a: fadeIn }, p.o), x = sx + p.x, y = F;
      if ((k2 === 'fight' || k2 === 'train') && p === props[0]) { x += recoil; o.w = flash; if (!rm && k2 === 'fight') y -= Math.floor(ph / 400) % 2; }
      if (k2 === 'forge' && s === 'anvil' && hot) s = 'anvil.hot';
      if (k2 === 'summon' && s === 'tome') y = F - 3 - (rm ? 0 : Math.round(Math.sin(t / 400) * 1.5));
      if (k2 === 'study' && s === 'book') y = F - 1 - (rm ? 0 : Math.round(Math.sin(t / 700) * 1));
      if (k2 === 'camp' && Hh.long && s.startsWith('camp')) o.a = .32 * fadeIn;
      if (k2 === 'grave') { shadow(x, F, 12); put(s, x, F, o); continue; }
      shadow(x, F, p.o && p.o.sc ? 22 : 11);
      put(s, x, y, o);
      if (k2 === 'fight' && Hh.boss) glowAt([255, 70, 40], x, y - 14, 26, rm ? .14 : .1 + .06 * Math.sin(t / 200));
    }
    if (k2 === 'fight') {   // the monster's HP: drains over a 20 s cycle, refills (the command keeps going)
      const bw = Hh.boss ? 22 : 12, mx = sx + (Hh.boss ? 54 : st.mx), top = F - (Hh.boss ? 34 : 19), hp = rm ? .6 : 1 - ((t - Math.max(Hh.tAct, 0)) / 20000 % 1) * .9;
      X.globalAlpha = fadeIn * DIM; dot(mx - bw / 2 - 1, top - 1, '#140808', bw + 2, 4); dot(mx - bw / 2, top, '#5a1c1c', bw, 2); dot(mx - bw / 2, top, hp > .35 ? '#58d26a' : '#ff5a4a', Math.max(1, Math.round(bw * hp)), 2); X.globalAlpha = 1;
    }
    if (k2 === 'scout') glowAt(Hh.prop === 'scope' ? [255, 236, 170] : [140, 200, 255], sx + 48, F - 9, 16, (rm ? .3 : .22 + .16 * Math.sin(t / 260)) * fadeIn);
    if (k2 === 'camp' && !Hh.long) glowAt([255, 140, 50], sx + 44, F - 6, 22, (rm ? .34 : .3 + .06 * Math.sin(t / 70 + Hh.ph) + .04 * Math.sin(t / 23)) * fadeIn);
    if (k2 === 'camp' && Hh.long && !rm) { X.globalAlpha = DIM; for (let i = 0; i < 3; i++) if ((Math.floor(t / 300) + i) % 3) dot(sx + 41 + i * 3, F - 2 - (i % 2), i % 2 ? '#ff6a2a' : '#c23a12'); X.globalAlpha = 1; }   // embers
    if (k2 === 'forge' && hot && !rm) glowAt([255, 150, 60], sx + 48, F - 8, 14, .35);
    if (k2 === 'gate') put('key', sx + 38, F - 4 - (rm ? 0 : Math.round(1 + Math.sin(t / 350) * 1.5)), { a: fadeIn });
    if (k2 === 'loot') { put('trophy', sx + 46, F - 15 - (rm ? 0 : Math.round(Math.sin(t / 450) * 1.5)), { a: fadeIn }); if (!rm) for (let i = 0; i < 3; i++) twinkle(sx + 40 + i * 6, F - 22 + (i % 2) * 6, Math.max(0, Math.sin(t / 300 + i * 2.1)), '#ffe58a'); }
    // the hero (a tombstone and its ghost instead when the session is gone)
    if (k2 === 'grave') {
      put('ghost', hx + 9, F - 9 - (rm ? 0 : Math.round(Math.sin(t / 500) * 2)), { a: .72 });
    } else {
      const o = { f: face < 0 };
      let y = F - hop;
      if (walking) y -= Math.floor(t / 110) % 2;
      else if (!rm && ACTIVE.has(k2) && k2 !== 'train' && k2 !== 'fight' && k2 !== 'forge') y -= Math.floor(ph / 600) % 2;
      if (k2 === 'down') { o.r = 1; o.a = .85; }
      if (k2 === 'camp') { o.sit = 3; if (Hh.long) o.a = .78; }
      if (k2 === 'stuck') o.a = .72;
      if (sq) o.sq = sq;
      shadow(hx + Math.round(lunge), F, k2 === 'down' ? 14 : 10);
      put(Hh.sp, hx + Math.round(lunge), y, o);
      if (k2 === 'explore') {   // carries its light (torch / lens / compass) and a moving pool of light
        const ix = hx + (face < 0 ? -8 : 8), iy = y - 2;
        put(Hh.held, ix, iy, { f: face < 0, a: fadeIn });
        glowAt(T.l, ix, iy - 10, 24, rm ? .3 : .26 + .05 * Math.sin(t / 90 + Hh.ph));
      }
      if (k2 === 'stuck') { put('web.' + (Hh.h % 2), hx, F + 1, { a: .88 }); }
      if (k2 === 'camp') {   // zzz drifting up
        const q = rm ? .35 : ((t + Hh.ph) % 2600) / 2600;
        put('zzz', hx + 7, F - 13 - Math.round(q * 7), { a: rm ? .85 : Math.sin(q * Math.PI) * (Hh.long ? .6 : .95) });
      }
    }
    const cue = cueOf(n); if (cue) bubble(cue, hx, (k2 === 'camp' ? F - 15 : F - 18) - hop, t, rm);
    else if (k2 === 'stuck') bubble('read', hx, F - 18, t, rm);
    DIM = 1;
  }
  function drawParticles(t) {
    for (const p of PT) {
      if (!p.on) continue;
      const age = t - p.t0; if (age > p.life || age < -50) { p.on = false; continue; }
      const f = Math.max(0, age) / p.life, x = p.x + p.vx * age, y = p.y + p.vy * age + .5 * p.g * age * age;
      if (p.k === 1) { X.globalAlpha = 1 - f * f; digits(p.v, Math.round(x - String(p.v).length * 2), Math.round(y), p.c); }
      else { X.globalAlpha = (1 - f) * (p.k === 2 ? .7 : 1); dot(x, y, p.c, p.k === 2 ? 2 : 1, p.k === 2 ? 2 : 1); }
      X.globalAlpha = 1;
    }
  }
  // where a delivered 톡 lands: the hero, or a shown companion (else its hero)
  function spot(key) {
    for (const c of cells) {
      const Hh = heroes.get(c.key);
      if (c.key === key && Hh) return { x: c.x + c.ox + Hh.x, y: c.y + 36 - 18, fl: c.fl };
      const i = c.kids.indexOf(key); if (i >= 0) return { x: c.x + c.ox + SLOT[i], y: c.y + 18 - 18, fl: c.fl };
    }
    return null;
  }
  function drawPlanes(t, rm) {
    for (let i = planes.length - 1; i >= 0; i--) {
      const q = planes[i], p = spot(q.key), age = t - q.t0;
      if (!p || age > (rm ? 3000 : 2600)) { planes.splice(i, 1); continue; }
      if (rm) { put('scroll', p.x + 10, p.y + 18, {}); continue; }
      const f = age / 1600;
      if (f < 1) {   // the owl flies in from the floor's stairs with the scroll
        const x0 = W - G.M - 11, y0 = p.fl.y + 6, e = ease(f), x = x0 + (p.x - x0) * e, y = y0 + (p.y - y0) * e - Math.sin(f * Math.PI) * 22;
        put('scroll', x, y + 8, {});
        put('owl', x, y - (Math.floor(age / 120) % 2), { f: p.x > x0 });
        if (Math.floor(age / 60) % 2) dot(x + (p.x > x0 ? -7 : 7), y - 4, '#fff3b0');
      } else {
        if (!q.landed) { q.landed = true; sparks(p.x, p.y + 4, 10, true); }
        put('scroll', p.x + 10, p.y + 18, { a: 1 - (f - 1) / .625 });
      }
    }
  }
  function frame(t) {
    if (!bg || !world || !world.isConnected || !g) return;
    const rm = A.reduced(), dt = clamp(t - lastT, 0, 100); lastT = t;
    X = g; DIM = 1;
    g.setTransform(S, 0, 0, S, 0, 0); g.imageSmoothingEnabled = false; g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.drawImage(bg, 0, 0);
    for (const L2 of glows) glowAt(T.l, L2.x, L2.y, L2.r, rm ? .16 : .13 + .045 * Math.sin(t / 130 + L2.ph) + .03 * Math.sin(t / 41 + L2.ph * 3));   // flickering wall lights
    for (const c of cells) drawCell(c, t, dt, rm);
    if (!rm) drawParticles(t);
    drawPlanes(t, rm);
  }

  // ---------- module API ----------
  function mount(el) {
    host = el;
    cv = h('canvas', { 'aria-hidden': 'true' }); g = cv.getContext('2d');
    deco = h('div.deco', { 'aria-hidden': 'true' });
    hits = h('div.hits', { role: 'group', 'aria-label': '던전의 영웅들' });
    world = h('div.ovd', cv, deco, hits);
    el.replaceChildren(world);
    els.clear(); sig = ''; bg = null;
  }
  function update(el, d, api, force) {
    A = api; D = d;
    if (!available()) return;
    if (host !== el || !world || !world.isConnected) mount(el);
    NODES.clear(); const walk = n => { NODES.set(n.key, n); n.kids.forEach(walk); }; D.roots.forEach(walk);
    const cw = el.clientWidth, dp = window.devicePixelRatio || 1;
    const sg = cw + '/' + dp + '/' + R.S.ofcSize + '/' + A.theme() + A.dark() + '#' + D.servers.map(s => s.id + ':' + s.state).join(',') + '#'
      + D.projects.map(p => p.id + '=' + p.name + ':' + D.roots.filter(r => r.project === p.id).map(r => r.key).join(',')).join('|');
    if (sg !== sig || !bg) { sig = sg; layout(); bake(); }   // force (a resize event) adds nothing: width and DPR are in the signature, and a bake is the costly part
    syncHeroes(); refresh();
    lastT = performance.now(); frame(lastT);
  }
  return {
    available,
    update,
    frame,
    unmount() { world = null; host = null; g = null; bg = null; sig = ''; els.clear(); heroes.clear(); planes.length = 0; for (const p of PT) p.on = false; },
    invalidate() { sig = ''; bg = null; T = null; GL.clear(); },
    plane(n) { if (!world || !n || !NODES.has(n.key)) return; planes.push({ key: n.key, t0: performance.now(), landed: false }); if (planes.length > 8) planes.shift(); },
    act,
    steps: () => devW ? { s: scaleFor(devW, dpr, 's'), m: scaleFor(devW, dpr, 'm'), l: scaleFor(devW, dpr, 'l') } : null,
    scale: () => S,
    scaleFor,
    cue: key => cueOf(NODES.get(key)),
    scene: () => ({ rooms: rooms.filter(r => r.p).map(r => ({ id: r.p.id, name: r.p.name, n: r.n })), heroes: cells.filter(c => NODES.has(c.key)).map(c => { const n = NODES.get(c.key); return { id: c.key, k: act(n).k, sprite: heroSprite(n) }; }) })
  };
})();
