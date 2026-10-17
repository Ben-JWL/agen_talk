/* ===== 73-office.js — 재미 모드: 픽셀 오피스 (OVERVIEW-CONTRACT §3). A cross-section building: each server a storey, each project
   (project.key) a room, each agent a desk, subagents as interns beside their lead. Characters come from window.AT_SPRITES (72-sprites.js);
   without it the overview stays on the wiring map. Layers (back → front): far sky (pre-blurred), static building/rooms/furniture
   (pre-rendered; night darkness baked in), screens, characters (never lit or bloomed), desk fronts, state bubbles; soft light at
   half resolution + bloom from an emitter mask at 1/16. One canvas, integer-scaled, ≤30 fps, only while visible (Overview owns the loop).
   Reduced motion: key poses, no particles, no walkers. All text on screen is canvas pixels or DOM textContent. ===== */
const OvOffice = (() => {
  const { h, text } = R;
  let AP = null;
  const RM = () => !!(AP && AP.reduced());
  const TH = () => { const t = AP ? AP.theme() : 'claude'; return t === 'chatgpt' ? 'codex' : t; };
  const DK = () => !!(AP && AP.dark());
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const hsh = s => { let x = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; };
  const signWide = room => !room.p.other && /[^ -~]/.test(String(room.p.name || ''));
  const signWideTxt = room => { const t = String(room.p.name || '').trim(); return t.length > 12 ? t.slice(0, 11) + '…' : t; };
  const signNameW = room => signWide(room) ? signWideTxt(room).length * 7 : textW(signTxt(room.p.other ? 'etc' : room.p.name, 18));
  const signTxt = (s, n) => { s = String(s || '').replace(/[^\x20-\x7e]/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '.' : s; };
const hx = v => typeof v === 'number' ? v : parseInt(v.slice(1), 16);
const RGB = c => [c >> 16 & 255, c >> 8 & 255, c & 255];
const mixc = (a, b, t) => { const A = RGB(a), B = RGB(b); return (Math.round(A[0] + (B[0] - A[0]) * t) << 16) | (Math.round(A[1] + (B[1] - A[1]) * t) << 8) | Math.round(A[2] + (B[2] - A[2]) * t); };
const cssc = c => '#' + (c & 0xFFFFFF).toString(16).padStart(6, '0');
const lum = c => { const [r, g, b] = RGB(c); return (r * 2 + g * 3 + b) / 6 / 255; };

class Lay {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Int32Array(w * h).fill(-1); }
  set(x, y, c) { x = Math.round(x); y = Math.round(y); if (c == null || c < 0 || x < 0 || y < 0 || x >= this.w || y >= this.h) return; this.d[y * this.w + x] = c; }
  get(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? -1 : this.d[y * this.w + x]; }
  spr(rows, pal, ox, oy, o = {}) {
    for (let y = 0; y < rows.length; y++) {
      const row = rows[y], Y = oy + y;
      if (o.clip != null && Y >= o.clip) continue;
      const sh = o.shear ? o.shear(y) : 0;
      for (let x = 0; x < row.length; x++) {
        const ch = row[o.flip ? row.length - 1 - x : x];
        if (ch === '.' || ch === ' ') continue;
        const c = pal[ch];
        if (c == null) continue;
        if (o.over && this.get(ox + x + sh, Y) === -1) continue;
        this.set(ox + x + sh, Y, c);
      }
    }
  }
  canvas(alpha = 1) {
    const cv = document.createElement('canvas'); cv.width = this.w; cv.height = this.h;
    const g = cv.getContext('2d'), im = g.createImageData(this.w, this.h), D = im.data;
    for (let i = 0; i < this.d.length; i++) { const c = this.d[i]; if (c < 0) continue; D[i * 4] = c >> 16 & 255; D[i * 4 + 1] = c >> 8 & 255; D[i * 4 + 2] = c & 255; D[i * 4 + 3] = Math.round(255 * alpha); }
    g.putImageData(im, 0, 0); return cv;
  }
}
/* selective outline: transparent pixels next to the sprite take a darker, hue-shifted version of their neighbour;
   lighter on the lit (top/left) side, darker on the shadow side. Rim light on right edges (coloured by theme). */
function finish(L, deep, rim, rimA = .38, key = 0xFFF2D8) {
  const w = L.w, hgt = L.h, src = L.d.slice(), out = L.d;
  for (let y = 0; y < hgt; y++) for (let x = 0; x < w; x++) {
    const c = src[y * w + x]; if (c < 0) continue;
    const r = x + 1 >= w ? -1 : src[y * w + x + 1], up = y > 0 ? src[(y - 1) * w + x] : -1, lf = x > 0 ? src[y * w + x - 1] : -1;
    if (r < 0 && rim != null) out[y * w + x] = mixc(c, rim, rimA);
    else if ((up < 0 || lf < 0) && key != null) out[y * w + x] = mixc(c, key, .14);
  }
  const s2 = out.slice();
  for (let y = 0; y < hgt; y++) for (let x = 0; x < w; x++) {
    if (src[y * w + x] >= 0) continue;
    const R = x + 1 < w ? src[y * w + x + 1] : -1, Lf = x > 0 ? src[y * w + x - 1] : -1, D = y + 1 < hgt ? src[(y + 1) * w + x] : -1, U = y > 0 ? src[(y - 1) * w + x] : -1;
    let n = -1, lit = false;
    if (R >= 0) { n = R; lit = true; } else if (D >= 0) { n = D; lit = true; } else if (Lf >= 0) n = Lf; else if (U >= 0) n = U;
    if (n < 0) continue;
    s2[y * w + x] = mixc(n, deep, lit ? .62 : .8);
  }
  L.d.set(s2);
  return L;
}


const R_ = str => str.trim().split('\n').map(r => r.trim());

/* ---------- small props & icons ---------- */
const PLANE = [R_(`
W........
gWW......
.gWWWW...
..gfWWWWW
...ggff..`), R_(`
.........
gWW......
.gWWWW...
..gfWWWWW
..ggff...`)];
const ICONS = {
  bang: R_(`
..##..
..##..
..##..
..##..
......
..##..`),
  dots: R_(`
.......
.......
.......
#.#.#..
.......`),
  term0: R_(`
#......
.#.....
..#....
.#.....
#..####`),
  term1: R_(`
#......
.#.....
..#....
.#.....
#......`),
  hour: R_(`
#####
.#.#.
..#..
..#..
.###.
#####`),
  gear0: R_(`
...#...
.#####.
.##.##.
###.###
.##.##.
.#####.
...#...`),
  gear1: R_(`
.#...#.
..###..
.##.##.
.#...#.
.##.##.
..###..
.#...#.`),
  tree: R_(`
.###...
..#....
..####.
..#..#.
.###.#.
....###`),
  check: R_(`
......#
.....##
#...##.
##.##..
.###...
..#....`),
  stop: R_(`
.......
.#####.
.#####.
.#####.
.#####.
.#####.`),
  plug: R_(`
.#.#...
.#.#...
#####..
#####..
.###.#.
..#..#.
..#.#..`)
};
const ZGLYPH = [R_(`
###
.#.
###`), R_(`
####
..#.
.#..
####`)];
/* 3x5 pixel font for signs (upper case, digits, - _ . /) */
const FONT = (() => {
  const src = {
    A: '.#.|#.#|###|#.#|#.#', B: '##.|#.#|##.|#.#|##.', C: '.##|#..|#..|#..|.##', D: '##.|#.#|#.#|#.#|##.', E: '###|#..|##.|#..|###', F: '###|#..|##.|#..|#..',
    G: '.##|#..|#.#|#.#|.##', H: '#.#|#.#|###|#.#|#.#', I: '###|.#.|.#.|.#.|###', J: '..#|..#|..#|#.#|.#.', K: '#.#|#.#|##.|#.#|#.#', L: '#..|#..|#..|#..|###',
    M: '#...#|##.##|#.#.#|#...#|#...#', N: '#..#|##.#|#.##|#..#|#..#', O: '.#.|#.#|#.#|#.#|.#.', P: '##.|#.#|##.|#..|#..', Q: '.#.|#.#|#.#|##.|.##', R: '##.|#.#|##.|#.#|#.#',
    S: '.##|#..|.#.|..#|##.', T: '###|.#.|.#.|.#.|.#.', U: '#.#|#.#|#.#|#.#|###', V: '#.#|#.#|#.#|#.#|.#.', W: '#...#|#...#|#.#.#|##.##|#...#', X: '#.#|#.#|.#.|#.#|#.#',
    Y: '#.#|#.#|.#.|.#.|.#.', Z: '###|..#|.#.|#..|###', 0: '###|#.#|#.#|#.#|###', 1: '.#.|##.|.#.|.#.|###', 2: '##.|..#|.#.|#..|###', 3: '##.|..#|.#.|..#|##.',
    4: '#.#|#.#|###|..#|..#', 5: '###|#..|##.|..#|##.', 6: '.##|#..|###|#.#|###', 7: '###|..#|.#.|.#.|.#.', 8: '###|#.#|###|#.#|###', 9: '###|#.#|###|..#|##.',
    '-': '...|...|###|...|...', _: '...|...|...|...|###', '.': '...|...|...|...|.#.', '/': '..#|..#|.#.|#..|#..', ' ': '..|..|..|..|..', ':': '.|#|.|#|.'
  };
  const f = {}; for (const k in src) f[k] = src[k].split('|'); return f;
})();
function textW(str) { let w = 0; for (const ch of str.toUpperCase()) w += (FONT[ch] || FONT[' '])[0].length + 1; return Math.max(0, w - 1); }
function drawText(g, str, x, y, col, shadow) {
  for (const ch of str.toUpperCase()) {
    const gl = FONT[ch] || FONT[' '];
    for (let r = 0; r < 5; r++) for (let c = 0; c < gl[r].length; c++) if (gl[r][c] === '#') {
      if (shadow != null) { g.fillStyle = cssc(shadow); g.fillRect(x + c, y + r + 1, 1, 1); }
      g.fillStyle = cssc(col); g.fillRect(x + c, y + r, 1, 1);
    }
    x += gl[0].length + 1;
  }
}


const mulc = (c, t) => { const A = RGB(c), B = RGB(t); return (Math.round(A[0] * B[0] / 255) << 16) | (Math.round(A[1] * B[1] / 255) << 8) | Math.round(A[2] * B[2] / 255); };
function tintLay(L, t) { if (t == null) return; for (let i = 0; i < L.d.length; i++) if (L.d[i] >= 0) L.d[i] = mulc(L.d[i], t); }

/* ===== pixel theme ramps (interior materials shared by day/night; lighting does the time of day) ===== */
const PIXT = {
  claude: { label: 'Claude 풍', sw: '#C2603F', decor: 'claude',
    base: { wall: [0xC4AE93, 0xD8C5AA, 0xE9DCC6, 0xF6EEDF], trim: [0x5A3427, 0x7E4C36, 0xA66C4A, 0xC98D63], floor: [0x6E4632, 0x8E5D40, 0xAE7A52, 0xC99A6B],
      desk: [0x4A2B22, 0x6D402E, 0x93603F, 0xB78258], chair: [0x22362C, 0x2F4A3B, 0x44664F], metal: [0x2A2427, 0x463B3B, 0x6E605C, 0x9C8B84],
      scr: 0x241B22, code: [0xF0A070, 0xE6D6BC, 0xA6C48E], acc: [0x8A3B27, 0xC2603F, 0xE68D63, 0xF7C6A0], plant: [0x1F3A2B, 0x2E5A3C, 0x4E8650, 0x8AB86A],
      pot: [0x7A3A26, 0xB25A3A, 0xD9845C], books: [0x8A3B27, 0x3E5A6E, 0xC88F25, 0x4E7A4C, 0x6E4A8A, 0xD9C4A0], lamp: 0xFFD49A, rim: 0xFFDDB0, glow: 0xFFB070 },
    day: { sky: [0x8FC0D8, 0xB4D4DE, 0xDCE0D2, 0xF4E2C4], far: [0xC2C8C2, 0xA8B0AA], ground: [0x5E7E44, 0x7E9E54, 0x4E3C2E], ext: [0x5E342A, 0x80483A, 0xA2604A, 0xC2805E], slab: [0x4A3A33, 0x6E5B50, 0x948073], win: [0x9CC7DB, 0xE0ECE8], amb: null },
    night: { sky: [0x120F24, 0x201A38, 0x372848, 0x583A52], far: [0x231C30, 0x2E2438], ground: [0x172018, 0x202C1E, 0x1A1412], ext: [0x2A1813, 0x40241B, 0x583226, 0x704231], slab: [0x201713, 0x352820, 0x4A3A30], win: [0x14122A, 0x2C2444], amb: 0x9A8CB4 } },
  codex: { label: 'ChatGPT 풍', sw: '#10A37F', decor: 'codex',
    base: { wall: [0xB4B8BE, 0xD0D4D8, 0xE6E8EA, 0xF7F8F9], trim: [0x4A5058, 0x6A717A, 0x9097A0, 0xBCC2C8], floor: [0x7A8086, 0x989EA4, 0xB7BCC0, 0xD0D4D7],
      desk: [0x8E959C, 0xBFC5CA, 0xE2E6E9, 0xFAFBFC], chair: [0x7E858C, 0xA2A9B0, 0xC6CCD1], metal: [0x16181B, 0x2C3035, 0x4E555D, 0x80878F],
      scr: 0x0B1311, code: [0x19C37D, 0xC8D2D0, 0x6FB3E0], acc: [0x0A6B50, 0x10A37F, 0x4CC9A0, 0xA8EBD3], plant: [0x1A3326, 0x285A3E, 0x3E8656, 0x7DBF7F],
      pot: [0xB8BDC2, 0xDADDE0, 0xF4F5F6], books: [0x22262C, 0x10A37F, 0xDADDE0, 0x6E6E80], lamp: 0xEAFFF6, rim: 0xC4F7E2, glow: 0x5CF0B0 },
    day: { sky: [0xA2C4E2, 0xC0D8EA, 0xDAE6EE, 0xECF0F2], far: [0xB6C0C8, 0xA0ACB6], ground: [0x868F96, 0x9EA6AC, 0x666E74], ext: [0x363B41, 0x4E545B, 0x6A7179, 0x899098], slab: [0x2E3237, 0x464B51, 0x5F656C], win: [0xA6C8E4, 0xE0EAF2], amb: null },
    night: { sky: [0x040608, 0x090D11, 0x10171C, 0x172026], far: [0x0E1418, 0x141B20], ground: [0x0C1012, 0x13181B, 0x080B0D], ext: [0x0F1215, 0x181C20, 0x22272C, 0x2D3339], slab: [0x0E1114, 0x1A1E22, 0x262B30], win: [0x05080B, 0x0E161C], amb: 0x929EAC } },
  gemini: { label: 'Gemini 풍', sw: 'linear-gradient(135deg,#4466F0,#9B6BD8,#E9A6D9)', decor: 'gemini',
    base: { wall: [0x7E8BB4, 0xA6B3D6, 0xC8D2EC, 0xE6ECF9], trim: [0x2A2F5C, 0x3B4380, 0x5562A8, 0x7C8AD0], floor: [0x3E4870, 0x56628E, 0x7280AE, 0x93A2CE],
      desk: [0x5A6290, 0x8590C0, 0xB4BEE4, 0xE0E6FA], chair: [0xA8B2DC, 0xCCD4F0, 0xEEF2FC], metal: [0x1A1C38, 0x2E3260, 0x4E5590, 0x8790C8],
      scr: 0x0C0E2C, code: [0x8AA2FF, 0xDDAAF2, 0x7FE3E0], acc: [0x3A3FB0, 0x5A6CF5, 0x9B72CB, 0xEBA6DD], plant: [0x1A3A4A, 0x26606A, 0x3E9A8E, 0x8AD8C0],
      pot: [0xC8D0EE, 0xE6EAFA, 0xFFFFFF], books: [0x5A6CF5, 0x9B72CB, 0xEBA6DD, 0x7FE3E0], lamp: 0xD6CCFF, rim: 0xCDB8FF, glow: 0x9AA8FF },
    day: { sky: [0x4E74D0, 0x7C9CE6, 0xAEC2F2, 0xDEE4FA], far: [0xE6ECFC, 0xCAD6F4], ground: [0xEEF2FD, 0xD6DFF6, 0xBCC9EE], ext: [0x363D6C, 0x4A538A, 0x646EAA, 0x848ECA], slab: [0x283056, 0x3C4474, 0x566098], win: [0x5C82E0, 0xC6D4F8], amb: null },
    night: { sky: [0x04051A, 0x0B0D2C, 0x181546, 0x31205C], far: [0x281A58, 0x44287A], ground: [0x0A0C24, 0x121638, 0x070818], ext: [0x121634, 0x1C2246, 0x28305C, 0x364072], slab: [0x0E1230, 0x1A2046, 0x283060], win: [0x060820, 0x221852], amb: 0x7C86A6 } },
  grok: { label: 'Grok 풍', sw: '#0A0A0A', decor: 'grok',
    base: { wall: [0x6A6A6E, 0x8A8A8E, 0xA8A8AC, 0xC4C4C8], trim: [0x161616, 0x242424, 0x343434, 0x4A4A4A], floor: [0x2A2A30, 0x36363D, 0x44444C, 0x5E5E68],
      desk: [0x26262A, 0x3A3A40, 0x56565E, 0x84848C], chair: [0x3E3E44, 0x55555C, 0x74747C], metal: [0x0C0C0C, 0x1E1E1E, 0x3A3A3A, 0x707070],
      scr: 0x040404, code: [0xF2F2F2, 0x9AA6B8, 0x6E7686], acc: [0x5E687A, 0xA6B2C4, 0xDCE4F0, 0xFFFFFF], plant: [0x1A2420, 0x26382E, 0x3A5444, 0x5E7E66],
      pot: [0x2A2A2A, 0x3E3E3E, 0x5A5A5A], books: [0x1C1C1C, 0xF2F2F2, 0x5E687A, 0x3A3A3A], lamp: 0xF0F4FF, rim: 0xE8EEFF, glow: 0xE6ECFF },
    day: { sky: [0x868C94, 0x9EA3A9, 0xB4B8BC, 0xC8CACC], far: [0x6A6F76, 0x565B62], ground: [0x363636, 0x464646, 0x262626], ext: [0x2A2A2A, 0x3C3C3C, 0x545454, 0x6C6C6C], slab: [0x1A1A1A, 0x2C2C2C, 0x424242], win: [0x98A0A8, 0xC8CCD0], amb: null },
    night: { sky: [0x000000, 0x040405, 0x09090C, 0x101014], far: [0x08080A, 0x0E0E12], ground: [0x080808, 0x101010, 0x040404], ext: [0x070707, 0x101010, 0x1A1A1A, 0x262626], slab: [0x060606, 0x101010, 0x1C1C1C], win: [0x000000, 0x0A0A0E], amb: 0x9496A4 } },
  muse: { label: 'Muse 풍', sw: 'linear-gradient(135deg,#0866FF,#A855F7,#F06AA8)', decor: 'muse',
    base: { wall: [0xBDB8D4, 0xD6D2E8, 0xEAE8F5, 0xF8F7FD], trim: [0x8C8AA6, 0xACAAC4, 0xCCCADE, 0xE6E5F0], floor: [0x8E7A6A, 0xAE9A86, 0xCBB8A2, 0xE2D3BF],
      desk: [0x8E7A6A, 0xBFAE9A, 0xE4D8C8, 0xFBF6EE], chair: [0xB0821A, 0xDEAA36, 0xF6D27A], metal: [0x26262E, 0x3C3C48, 0x5E5E6E, 0x9696A8],
      scr: 0x14142A, code: [0x6FA8FF, 0xF0A0D0, 0xC9B8FF], acc: [0x0645B8, 0x0866FF, 0xA855F7, 0xF06AA8], plant: [0x1E3A2A, 0x2E5E3E, 0x4C8C56, 0x92C47A],
      pot: [0xE6E0F4, 0xF6F2FF, 0xFFFFFF], books: [0x0866FF, 0xA855F7, 0xF06AA8, 0xFFC857, 0x2EC4B6], lamp: 0xFFE6F2, rim: 0xD8C6FF, glow: 0x8CB4FF },
    day: { sky: [0x88B2F4, 0xB0C8F6, 0xD8D4F4, 0xF4D6E8], far: [0xC8C4E8, 0xB0ACDA], ground: [0x86BC74, 0xA2D08A, 0x6A5A4E], ext: [0x9894B2, 0xB8B4D0, 0xD8D5EA, 0xF2F1F9], slab: [0x7C7896, 0x9C98B6, 0xBEBAD4], win: [0x9EC0F8, 0xF4DCF0], amb: null },
    night: { sky: [0x0C0A22, 0x1A123C, 0x321E56, 0x582862], far: [0x221A3E, 0x2E244C], ground: [0x0E161A, 0x16221C, 0x0A0A10], ext: [0x26243C, 0x363352, 0x48446A, 0x5C5884], slab: [0x1C1A30, 0x2C2A46, 0x3E3A5E], win: [0x0E0A28, 0x38205E], amb: 0x968AC4 } }
};
const THEME_ORDER = ['claude', 'codex', 'gemini', 'grok', 'muse'];
function pixPal(theme, dark) { const T = PIXT[theme]; return Object.assign({ decor: T.decor, night: dark }, T.base, dark ? T.night : T.day); }

/* ---------- characters: window.AT_SPRITES (72-sprites.js; v2 decoded once by window.atDecode2) ---------- */
const THEME_KEY = { claude: 'claude', codex: 'chatgpt', gemini: 'gemini', grok: 'grok', muse: 'muse' };
const Chars = {
  src: null, cache: new Map(), _steps: null,
  load() {
    if (this.src) return true;
    const V = window.AT_SPRITES;
    if (!V || typeof V !== 'object') return false;
    try {
      const S2 = V.version === 2 && V.pools ? (typeof window.atDecode2 === 'function' ? window.atDecode2(V) : null) : V;
      if (!S2 || !S2.lead || !S2.intern || !S2.anims || !S2.palettes) return false;
      for (const k of ['lead', 'intern']) if (!(S2[k].w > 0 && S2[k].h > 0) || S2[k].anchorX == null || S2[k].anchorY == null) return false;
      this.src = S2;
    } catch (e) { console.warn('AT_SPRITES', e); return false; }
    return true;
  },
  dims(size) { const d = Object.assign({}, this.src[size]); if (d.deskY == null) d.deskY = d.anchorY - Math.round(d.h * .22); return d; },
  anim(fam, size, st) {
    const A = ((this.src.anims[fam] || {})[size]) || {};
    const a = A[st] || (st === 'stopped' ? A.idle : null) || (st === 'dead' ? null : A.idle || A.work);
    if (!a || !a.frames || !a.frames.length) return null;
    return { fps: a.fps || 8, n: a.frames.length, loop: a.loop !== false, next: a.next && A[a.next] ? a.next : null, key: a.key != null ? a.key : 0, frames: a.frames };
  },
  /* intros play once from the state change, then `next`; loops are phase-shifted per agent */
  pick(fam, size, st, since, t, ph, reduce) {
    const a = this.anim(fam, size, st), state = st;
    if (!a) return null;
    if (reduce) return { a, state, i: Math.min(a.key, a.n - 1) };
    const ms = 1000 / a.fps;
    if (!a.loop) {
      const i = Math.floor(since / ms);
      if (i < a.n) return { a, state, i };
      if (a.next) { const b = this.anim(fam, size, a.next); return { a: b, state: a.next, i: Math.floor((since - a.n * ms) / (1000 / b.fps)) % b.n }; }
      return { a, state, i: a.n - 1 };
    }
    return { a, state, i: Math.floor(t / ms + ph * a.n) % a.n };
  },
  /* one frame -> canvas (night tint + short rim from the scene); identical exposures share a raster id (v2 _rid) */
  frame(fam, size, st, pick, v, blink, ctx) {
    const rows = pick.a.frames[pick.i], key = rows._rid != null ? fam + '#' + rows._rid : fam + size + pick.state + pick.i;
    let c = this.cache.get(key);
    if (c) return c;
    const pal = ((this.src.palettes[THEME_KEY[ctx.theme]] || this.src.palettes.claude || {})[fam]) || [];
    const L = new Lay(rows[0].length, rows.length), cols = pal.map(x => x ? hx(x) : -1);
    for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) { const ch = rows[y][x]; if (ch === '.') continue; const ci = parseInt(ch, 36); if (ci > 0 && cols[ci] >= 0) L.set(x, y, cols[ci]); }
    tintLay(L, ctx.tint); rimOnly(L, ctx.rim, ctx.rimA * .8);
    c = L.canvas(); this.cache.set(key, c);
    return c;
  },
  /* the walker (walk + stand, faces right). Walk speed is measured from the frames: the planted foot's backward shift
     on the bottom row per frame = how far the body advances, so feet never slide. */
  walker() { const W = this.src && this.src.walker; return W && W.anims && W.anims.walk && W.anims.stand ? { w: W.w, h: W.h, anchorX: W.anchorX, anchorY: W.anchorY, walk: W.anims.walk, stand: W.anims.stand } : null; },
  steps() {
    if (this._steps) return this._steps;
    const fr = this.src.walker.anims.walk.frames, n = fr.length, foot = f => { const r = f[f.length - 1], set = new Set(); for (let x = 0; x < r.length; x++) if (r[x] !== '.') set.add(x); return set; };
    const out = [];
    for (let i = 0; i < n; i++) { const A = foot(fr[i]), B = foot(fr[(i + 1) % n]); let best = 0, bs = -1; for (let d = 0; d <= 4; d++) { let o = 0; for (const x of A) if (B.has(x - d)) o++; if (o > bs) { bs = o; best = d; } } out.push(best); }
    return (this._steps = out);
  },
  advance(k) { const st = this.steps(); let x = 0; for (let i = 0; i < k; i++) x += st[i % st.length]; return x; },
  framesFor(dist) { let k = 0; while (this.advance(k) < dist && k < 400) k++; return k; },
  walkerFrame(mode, i, left, ctx) {
    const W = this.src.walker, a = W.anims[mode], idx = RM() ? (a.key || 0) : i % a.frames.length, key = 'W' + mode + idx + (left ? 'l' : 'r');
    let c = this.cache.get(key);
    if (c) return c;
    const pal = (W.palettes[THEME_KEY[ctx.theme]] || W.palettes.claude || []).map(x => x ? hx(x) : -1), rows = a.frames[idx], L = new Lay(rows[0].length, rows.length);
    for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) { const ch = rows[y][left ? rows[y].length - 1 - x : x]; if (ch === '.') continue; const ci = parseInt(ch, 36); if (ci > 0 && pal[ci] >= 0) L.set(x, y, pal[ci]); }
    tintLay(L, ctx.tint);
    c = L.canvas(); this.cache.set(key, c); return c;
  }
};
function rimOnly(L, rim, a) {
  if (rim == null) return;
  const w = L.w, src = L.d.slice();
  for (let y = 0; y < L.h; y++) for (let x = 0; x < w; x++) { const c = src[y * w + x]; if (c < 0) continue; const r = x + 1 < w ? src[y * w + x + 1] : -1, r2 = x + 2 < w ? src[y * w + x + 2] : -1; if (r >= 0 && r2 < 0) L.d[y * w + x] = mixc(c, rim, a); }
}

/* =====================================================================
   PIXEL OFFICE v2 — environment + HD-2D lighting.
   Layers, back to front:
     far      sky, stars, skyline        -> presented blurred (depth of field)
     stat     building, rooms, props, chairs, desk tops, monitors (crisp; night darkness baked in)
     sprites  screens, characters, steam, cats, notes, planes, dust motes (crisp, per frame)
     front    desk front panels + contact shadows (crisp, drawn over the sprites)
     ui       state bubbles (crisp)
     light    soft radial light (lamps, windows, monitors, the red '!' glow) at half resolution,
              added on top with smoothing + a 1/8-res bloom pass. CSS vignette over the viewport.
   No ordered dithering anywhere: value steps are solid pixel bands, light is smooth.
   ===================================================================== */
function mkc(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); const g = c.getContext('2d'); g.imageSmoothingEnabled = false; return [c, g]; }
const F = (g, x, y, w, h, c) => { g.fillStyle = cssc(c); g.fillRect(x, y, w, h); };
const PX = (g, x, y, c) => { g.fillStyle = cssc(c); g.fillRect(x, y, 1, 1); };
/* translucent solid fill (replaces dithering): a clean value step */
function dith(g, x, y, w, h, c, a) { g.globalAlpha = a; F(g, x, y, w, h, c); g.globalAlpha = 1; }
/* stepped vertical ramp: one solid band per colour plus a mixed in-between band (no checkerboard) */
function vramp(g, x, y, w, h, cols) {
  const steps = []; for (let i = 0; i < cols.length; i++) { steps.push(cols[i]); if (i < cols.length - 1) steps.push(mixc(cols[i], cols[i + 1], .5)); }
  for (let i = 0; i < steps.length; i++) { const y0 = y + Math.round(h * i / steps.length), y1 = y + Math.round(h * (i + 1) / steps.length); F(g, x, y0, w, y1 - y0, steps[i]); }
}
function srand(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const rgba = (c, a) => { const [r, g, b] = RGB(c); return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')'; };
/* soft light: radial gradient (sy squashes it into a pool) */
function glow(g, x, y, r, c, a, sy = 1) {
  if (a <= 0) return;
  g.save(); g.translate(x, y); g.scale(1, sy);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, r); gr.addColorStop(0, rgba(c, a)); gr.addColorStop(.35, rgba(c, a * .45)); gr.addColorStop(1, rgba(c, 0));
  g.fillStyle = gr; g.fillRect(-r, -r, r * 2, r * 2); g.restore();
}
const WALKER = [R_(`
..hhh..
.hhss..
.hsss..
..ss...
.cccc..
ccccdc.
cdccdc.
.cccd..
.pppp..
.pp.pp.
.pp.pp.
.kk.kk.`), R_(`
..hhh..
.hhss..
.hsss..
..ss...
.cccc..
ccccdc.
cdccdc.
.cccd..
.pppp..
.pp..p.
pp...pp
kk...kk`), R_(`
..hhh..
.hhss..
.hsss..
..ss...
.cccc..
ccccdc.
cdccdc.
.cccd..
.pppp..
..ppp..
..pp...
..kk...`)];
const CAT = [R_(`
..a...a.....
.aba.aba....
.abbbbba.aa.
abcbbbbbabba
abaabbbbbbba
abbbbbbbbbca
.aaaaaaaaaa.`), R_(`
..a...a.....
.aba.aba....
.abbbbbaaaa.
abcbbbbbbbba
abaabbbbbbba
abbbbbbbbbca
.aaaaaaaaaa.`), R_(`
..a...a.....
.aba.aba....
.abbbbba.aa.
abcbbbbbabba
abaabbbbbbac
abbbbbbbbbba
.aaaaaaaaaa.`)];
const COATS = [[0x5A2E14, 0xD07A34, 0xF2A860], [0x2E2E36, 0x7A7A86, 0xB4B4C0], [0x111114, 0x2E2E34, 0x5A5A64], [0x6A5A4A, 0xEDE4D6, 0xFFFFFF]];

const nightc = (P, c) => P.night ? mulc(c, P.amb) : c;
const Office = {
  S: 3, WD: 480, HD: 400, k: 2.4, stations: [], rooms: [], stories: [], planes: [], notes: new Map(), ghosts: new Map(), lastT: -1e9,
  setTheme() { Chars.cache.clear(); this.ghosts.clear(); this.bubbleCache.clear(); this.walkCache = null; this.catCache = null; this.stat = null; this.lastT = -1e9; },
  geo() {
    const D = Chars.dims('lead'), I = Chars.dims('intern');
    const SW = Math.max(72, D.w + 32), cx = SW >> 1, DT = Math.max(D.deskY + 2, 30);
    const IW = Math.max(34, I.w + 10), icx = (IW - 11) >> 1;
    return { D, I, SW, IW, cx, icx, DT, ROWH: DT + 20, WH: 30, TOP: 16,
      L: { ox: cx - D.anchorX, oy: DT - D.deskY, mon: [cx - 33, DT - 19, 18, 16], scr: [cx - 31, DT - 17, 14, 10] },
      K: { ox: icx - I.anchorX, oy: DT - I.deskY, mon: [IW - 12, DT - 12, 10, 9], scr: [IW - 11, DT - 11, 8, 6] } };
  },
  /* ---------- layout: storeys of compact rooms; spare width becomes a lounge, never an empty stretched room ---------- */
  layout() {
    const box = this.host, dpr = window.devicePixelRatio || 1, cssW = Math.max(320, box.clientWidth - 18), devW = Math.floor(cssW * dpr);
    const S = clamp(Math.floor(devW / 420), 2, 9);
    const WD = Math.max(200, Math.floor(devW / S));
    this.S = S; this.WD = WD; this.k = S / dpr;
    const G = this.G = this.geo();
    const BW = 6, SLAB = 9, maxInner = WD - 2 * (4 + BW), RP = 14, ROOF = 58, LOUNGE = 112, PW = 4;
    const rooms = [], stories = [], stations = [];
    // pass 1: pack project rooms into storeys (per server)
    const rowsAll = [];
    for (const sv of this.D.servers) {
      const specs = [];
      for (const p of this.D.projects.filter(q => q.server === sv.id)) {
        const leads = this.D.roots.filter(a => a.project === p.id);
        if (!leads.length) continue;
        const teams = leads.map(a => ({ a, w: G.SW + G.IW * Math.min(4, a.kids.length) }));
        const pack = mw => { const rows = []; let cur = [], cw = 0; for (const t of teams) { if (cur.length && cw + t.w > mw) { rows.push(cur); cur = []; cw = 0; } cur.push(t); cw += t.w; } if (cur.length) rows.push(cur); return rows; };
        const maxW = maxInner - 2 * RP, k = pack(maxW).length;
        let lo = Math.max(...teams.map(t => t.w)), hi = maxW; // balance rows: narrowest width that still needs only k rows
        while (lo < hi) { const mid = (lo + hi) >> 1; if (pack(mid).length <= k) hi = mid; else lo = mid + 1; }
        const rowsT = pack(hi);
        const sw = textW(signTxt(p.other ? 'etc' : p.name, 18)) + textW(signTxt(p.branch, 14)) + 32;
        const w = Math.max(132, sw + 64, ...rowsT.map(r => r.reduce((s2, t) => s2 + t.w, 0) + 2 * RP));
        specs.push({ p, sv, rowsT, w: Math.min(maxInner, w), h: G.TOP + rowsT.length * G.ROWH + 2 });
      }
      let row = [], used = 0;
      for (const sp of specs) { if (row.length && used + PW + sp.w > maxInner) { rowsAll.push({ sv, row }); row = []; used = 0; } used += (row.length ? PW : 0) + sp.w; row.push(sp); }
      if (row.length) rowsAll.push({ sv, row });
    }
    // the building is only as wide as its widest storey plus a lounge, centred on the street
    const widest = Math.max(0, ...rowsAll.map(r => r.row.reduce((a, b) => a + b.w, 0) + PW * (r.row.length - 1)));
    const innerW = Math.min(maxInner, widest + PW + LOUNGE), BX = Math.floor((WD - innerW) / 2) - BW, x0 = BX + BW;
    this.B = { BX, BW, SLAB, x0, innerW, ROOF, X1: x0 + innerW };
    let y = ROOF;
    for (const { sv, row } of rowsAll) {
      {
        const used = row.reduce((s2, r) => s2 + r.w, 0) + PW * (row.length - 1);
        let extra = innerW - used;
        const h = Math.max(...row.map(r => r.h));
        const items = row.slice();
        if (extra - PW > 190) { const kw = Math.floor((extra - PW) / 2) - 2; items.push({ filler: true, kind: 'kitchen', w: kw, h }, { filler: true, w: extra - PW - kw - PW, h }); }
        else if (extra >= 64) items.push({ filler: true, w: extra - PW, h }); // lounge / stairwell
        else { const add = Math.floor(extra / row.length); items.forEach((r, i) => { r.w += add + (i === row.length - 1 ? extra - add * row.length : 0); }); }
        let x = x0;
        const st = { sv, y, h, rooms: [] };
        for (const r of items) {
          const room = { ...r, x, y: y + SLAB, h, i: rooms.length };
          rooms.push(room); st.rooms.push(room);
          if (!r.filler) room.spans = [];
          if (!r.filler) room.rowsT.forEach((rt, ri) => {
            const rw = rt.reduce((s2, t) => s2 + t.w, 0);
            let sx = room.x + Math.max(RP, Math.floor((room.w - rw) / 2));
            const sy = room.y + G.TOP + ri * G.ROWH;
            room.spans.push({ x0: sx, x1: sx + rw, y: sy });
            for (const t of rt) {
              stations.push({ n: t.a, kind: 'lead', x: sx, y: sy, room, ph: (hsh(t.a.id) % 997) / 997 });
              t.a.kids.slice(0, 4).forEach((kid, j) => stations.push({ n: kid, kind: 'kid', x: sx + G.SW + G.IW * j, y: sy, room, ph: (hsh(kid.id) % 997) / 997 }));
              sx += t.w;
            }
          });
          x += room.w + PW;
        }
        stories.push(st);
        y += SLAB + h;
      }
    }
    this.groundY = y; this.HD = y + SLAB + 26;
    this.rooms = rooms; this.stories = stories; this.stations = stations;
    this.order = stations.slice().sort((a, b) => a.y - b.y || a.x - b.x);
    [this.fb, this.fg] = mkc(WD, this.HD);
    [this.fs, this.sg] = mkc(WD, this.HD);   // sprite layer: never lit, never bloomed
    [this.em, this.eg] = mkc(Math.ceil(WD / 4), Math.ceil(this.HD / 4)); this.eg.imageSmoothingEnabled = true; // emitter mask for bloom
    [this.lc, this.lg] = mkc(Math.ceil(WD / 2), Math.ceil(this.HD / 2)); this.lg.imageSmoothingEnabled = true;
    [this.bc, this.bg] = mkc(Math.ceil(WD / 8), Math.ceil(this.HD / 8)); this.bg.imageSmoothingEnabled = true;
    this.cv.width = WD * S; this.cv.height = this.HD * S;
    this.cv.style.width = (WD * S / dpr) + 'px'; this.cv.style.height = (this.HD * S / dpr) + 'px';
    const world = this.world; world.style.width = this.cv.style.width; world.style.height = this.cv.style.height;
    this.buildStatic();
    this.buildOverlays();
  },
  /* ---------- static layers ---------- */
  buildStatic() {
    const P = this.P = pixPal(TH(), DK()), WD = this.WD, HD = this.HD, B = this.B, G = this.G;
    this.cctx = { theme: TH(), rim: P.night ? P.glow : P.rim, rimA: P.night ? .5 : .32, tint: P.night ? mixc(P.amb, 0xFFFFFF, .55) : null };
    const rr = srand(hsh(TH() + (DK() ? 'n' : 'd')));
    this.emit = [];
    // far: sky + skyline (presented blurred)
    const [fc, fg] = mkc(WD, HD); this.far = fc;
    const sg = fg.createLinearGradient(0, 0, 0, B.ROOF + 30); P.sky.forEach((c, i) => sg.addColorStop(i / (P.sky.length - 1), cssc(c)));
    fg.fillStyle = sg; fg.fillRect(0, 0, WD, HD);
    if (P.night) for (let i = 0; i < WD / 3; i++) PX(fg, Math.floor(rr() * WD), Math.floor(rr() * B.ROOF), rr() < .2 ? 0xFFFFFF : mixc(P.sky[0], 0xFFFFFF, .5));
    else this.clouds(fg, rr, P);
    for (let layer = 0; layer < 2; layer++) {
      let x = -4 + Math.floor(rr() * 8);
      while (x < WD) {
        const w = 10 + Math.floor(rr() * 18), hgt = (layer ? 10 : 18) + Math.floor(rr() * (layer ? 14 : 20)), top = B.ROOF + 2 - hgt + layer * 6;
        F(fg, x, top, w, HD - top, P.far[layer]);
        for (let wy = top + 3; wy < B.ROOF; wy += 3) for (let wx = x + 2; wx < x + w - 1; wx += 3) if (rr() < (P.night ? .3 : .12)) PX(fg, wx, wy, P.night ? mixc(0xFFD58A, P.far[layer], .25) : mixc(P.far[layer], 0xFFFFFF, .2));
        x += w + Math.floor(rr() * 4);
      }
    }
    // stat: everything crisp in front of the sky
    const [c, g] = mkc(WD, HD); this.stat = c;
    const [frc, frg] = mkc(WD, HD); this.front = frc;
    const gy = this.groundY + B.SLAB;
    F(g, 0, gy, WD, HD - gy, P.ground[1]); F(g, 0, gy, WD, 1, P.ground[0]); F(g, 0, gy + 6, WD, HD - gy - 6, P.ground[2]); F(g, 0, gy + 6, WD, 1, mixc(P.ground[1], P.ground[2], .5));
    for (let x = 2; x < WD; x += 5) { PX(g, x, gy - 1, P.ground[1]); PX(g, x + 2, gy - 2, P.ground[0]); }
    for (let x = 0; x < WD; x += 12) F(g, x, gy + 12, 6, 1, mixc(P.ground[2], 0xFFFFFF, .12));
    const ext = P.ext, bx0 = B.BX, bx1 = B.X1 + B.BW;
    F(g, bx0, B.ROOF - 6, bx1 - bx0, gy - B.ROOF + 9, ext[1]);
    const brick = P.decor === 'claude' || P.decor === 'muse';
    for (let y = B.ROOF - 6; y < gy + 3; y++) {
      if (brick ? y % 4 === 0 : y % 12 === 0) F(g, bx0, y, bx1 - bx0, 1, ext[0]);
      else for (let x = bx0 + (brick ? (Math.floor(y / 4) % 2) * 4 : 0); x < bx1; x += brick ? 8 : 24) PX(g, x, y, ext[0]);
    }
    F(g, bx0, B.ROOF - 6, 1, gy - B.ROOF + 9, ext[3]); F(g, bx1 - 1, B.ROOF - 6, 1, gy - B.ROOF + 9, ext[0]);
    F(g, bx0 - 2, B.ROOF - 9, bx1 - bx0 + 4, 3, ext[3]); F(g, bx0 - 2, B.ROOF - 6, bx1 - bx0 + 4, 1, ext[0]);
    this.rooftop(g, P);
    for (const st of this.stories) { this.slab(g, P, st.y, bx0 + B.BW, bx1 - B.BW); for (const room of st.rooms) room.filler ? (room.kind === 'kitchen' ? this.drawKitchen(g, P, room, rr) : this.drawLounge(g, P, room, rr)) : this.drawRoom(g, P, room, rr); }
    this.slab(g, P, this.groundY, bx0 + B.BW, bx1 - B.BW);
    for (const s2 of this.order) s2.kind === 'lead' ? this.leadDesk(g, frg, P, s2) : this.kidDesk(g, frg, P, s2);
    // night: one clean ambient multiply over the interiors (no noise), then emissive pixels stay bright
    if (P.night) {
      for (const r of this.rooms) { g.globalCompositeOperation = 'multiply'; F(g, r.x, r.y, r.w, r.h, P.amb); g.globalCompositeOperation = 'source-over'; }
      const im = frg.getImageData(0, 0, WD, HD), D = im.data, [ar, ag, ab] = RGB(P.amb);
      for (let i = 0; i < D.length; i += 4) if (D[i + 3]) { D[i] = D[i] * ar / 255; D[i + 1] = D[i + 1] * ag / 255; D[i + 2] = D[i + 2] * ab / 255; }
      frg.putImageData(im, 0, 0);
    }
    for (const [x, y, w, h, col] of this.emit) F(g, x, y, w, h, col);
    // static light (half resolution, smooth)
    const [lsc, lsg] = mkc(Math.ceil(WD / 2), Math.ceil(HD / 2)); this.lightStatic = lsc; lsg.imageSmoothingEnabled = true; lsg.scale(.5, .5);
    const N = P.night;
    for (const room of this.rooms) {
      lsg.save(); lsg.beginPath(); lsg.rect(room.x, room.y, room.w, room.h); lsg.clip();
      for (const [lx, ly] of room.lamps || []) { glow(lsg, lx, ly, 30, P.lamp, N ? .4 : .12); glow(lsg, lx, room.y + G.WH + 16, 40, P.lamp, N ? .5 : .08, .38); }
      for (const [lx, ly, col, r, a] of room.lights || []) glow(lsg, lx, ly, r, col, N ? a : a * .4);
      if (room.win) {
        const [wx, ww] = room.win, X = room.x + wx, top = room.y + 20, bot = room.y + room.h;
        const lgr = lsg.createLinearGradient(0, top, 0, bot); lgr.addColorStop(0, N ? rgba(0xA8C0FF, .10) : rgba(0xFFF0C8, .30)); lgr.addColorStop(1, rgba(N ? 0xA8C0FF : 0xFFF0C8, 0));
        lsg.fillStyle = lgr; lsg.beginPath(); lsg.moveTo(X, top); lsg.lineTo(X + ww, top); lsg.lineTo(X + ww - 18, bot); lsg.lineTo(X - 22, bot); lsg.closePath(); lsg.fill();
        glow(lsg, X + ww / 2, room.y + 12, 22, N ? 0x9AB4FF : 0xFFF4D8, N ? .12 : .25);
      }
      lsg.restore();
    }
    // emitter mask (quarter res): only true light sources bloom (bulbs, lit signs, emissive pixels); never sprites or pale materials
    const [esc, esg] = mkc(Math.ceil(WD / 4), Math.ceil(HD / 4)); this.emStatic = esc; esg.imageSmoothingEnabled = true; esg.scale(.25, .25);
    for (const room of this.rooms) for (const [lx, ly] of room.lamps || []) glow(esg, lx, ly, 4, P.lamp, N ? .6 : .2);
    if (N) for (const [x, y, w, h, col] of this.emit) { esg.fillStyle = rgba(col, .45); esg.fillRect(x, y, w, h); }
    // dust motes live in the light (window shafts by day, lamp cones by night)
    this.motes = [];
    for (const room of this.rooms) {
      const r3 = srand(room.i * 77 + 3);
      const srcs = N ? (room.lamps || []).map(([lx]) => [lx - 14, room.y + 10, 28, room.h - 16]) : room.win ? [[room.x + room.win[0] - 10, room.y + 22, room.win[1] + 10, room.h - 26]] : [];
      for (const [x, y2, w, h] of srcs) for (let i = 0; i < 7; i++) this.motes.push({ x: x + r3() * w, y: y2 + r3() * h, w, h, x0: x, y0: y2, s: .4 + r3() * .8, ph: r3() * 6.28 });
    }
    // screen code texture (scrolls)
    const [tc, tg] = mkc(14, 64); this.codeTex = tc; F(tg, 0, 0, 14, 64, P.scr);
    const r2 = srand(77);
    for (let y = 0; y < 64; y += 2) { let x = (r2() < .3 ? 2 : 0) + (r2() < .2 ? 2 : 0); while (x < 13) { const w = 1 + Math.floor(r2() * 4); F(tg, x, y, Math.min(w, 14 - x), 1, P.code[Math.floor(r2() * 3)]); x += w + 1; if (r2() < .25) break; } }
    // far layer pre-blurred at screen resolution (tilt-shift style depth for the background)
    const S = this.S, FH = Math.min(HD, B.ROOF + 14); this.farH = FH; const [fb2, fbg] = mkc(WD * S, FH * S); fbg.imageSmoothingEnabled = true; fbg.filter = 'blur(' + Math.max(1.5, S * 1.1) + 'px)'; fbg.drawImage(fc, 0, 0, WD, FH, 0, 0, WD * S, FH * S); fbg.filter = 'none'; this.farBlur = fb2;
  },
  clouds(g, rr, P) {
    for (let i = 0; i < 6; i++) {
      const cx = Math.floor(rr() * this.WD), cy = 8 + Math.floor(rr() * 24), w = 14 + Math.floor(rr() * 18);
      for (let j = 0; j < 4; j++) { const bx = cx + j * Math.floor(w / 4) - 4, bw = Math.floor(w / 2) - Math.abs(j - 1.5) * 2, bh = 5 - Math.abs(j - 1.5); F(g, bx, cy - bh, bw, bh + 2, mixc(P.sky[3], 0xFFFFFF, .7)); F(g, bx, cy + 1, bw, 1, mixc(P.sky[2], 0xFFFFFF, .35)); }
    }
  },
  rooftop(g, P) {
    const B = this.B, y = B.ROOF - 9, W = B.X1 + B.BW, M = P.metal;
    const tx = W - 46; F(g, tx, y - 14, 14, 14, M[1]); F(g, tx, y - 14, 2, 14, M[3]); F(g, tx + 12, y - 14, 2, 14, M[0]); F(g, tx - 1, y - 15, 16, 2, M[2]); F(g, tx + 2, y - 2, 1, 2, M[0]); F(g, tx + 11, y - 2, 1, 2, M[0]);
    const ax = W - 20; F(g, ax, y - 26, 1, 26, M[2]); F(g, ax - 3, y - 18, 7, 1, M[2]); F(g, ax - 2, y - 12, 5, 1, M[2]); this.antenna = [ax, y - 27];
    for (let i = 0; i < 2; i++) { const ux = W - 76 - i * 14; F(g, ux, y - 7, 11, 7, M[2]); F(g, ux, y - 7, 11, 1, M[3]); for (let k = 0; k < 4; k++) F(g, ux + 2, y - 5 + k, 7, 1, k % 2 ? M[1] : M[2]); }
    for (let i = 0; i < 3; i++) { const px = W - 110 + i * 9; F(g, px, y - 4, 7, 4, mixc(P.plant[1], P.pot[0], .2)); PX(g, px + 1, y - 6, P.plant[2]); PX(g, px + 3, y - 7, P.plant[3]); PX(g, px + 5, y - 6, P.plant[2]); }
    const label = 'AGEN TALK', tw = textW(label), sx = B.BX + 14, sy = y - 16;
    F(g, sx + 4, sy + 11, 1, 5, M[1]); F(g, sx + tw + 6, sy + 11, 1, 5, M[1]);
    F(g, sx, sy, tw + 11, 11, P.night ? 0x111015 : M[1]); F(g, sx, sy, tw + 11, 1, M[3]);
    drawText(g, label, sx + 6, sy + 3, P.night ? P.acc[3] : 0xFFFFFF, P.night ? mixc(P.acc[0], 0, .3) : M[0]);
    this.signGlow = [sx + (tw + 11) / 2, sy + 5, tw + 11];
  },
  slab(g, P, y, x0, x1) {
    const s = P.slab, SL = this.B.SLAB, X = x0 - this.B.BW, W = x1 - x0 + 2 * this.B.BW;
    F(g, X, y, W, SL, s[1]); F(g, X, y, W, 1, s[2]); F(g, X, y + SL - 1, W, 1, s[0]); F(g, X, y + SL - 2, W, 1, mixc(s[0], s[1], .5));
    F(g, x0, y + 5, x1 - x0, 1, mixc(s[0], P.acc[0], .35));
    for (let x = x0 + 6; x < x1; x += 16) { PX(g, x, y + 4, s[2]); PX(g, x, y + 6, s[0]); }
  },
  /* ---------- rooms: each one tells a little story ---------- */
  walls(g, P, W, H, rr) {
    const WH = this.G.WH, d = P.decor, w = P.wall, f = P.floor, t = P.trim;
    F(g, 0, 0, W, WH, w[2]);
    if (d === 'claude') for (let x = 0; x < W; x += 10) F(g, x, 0, 5, WH, mixc(w[2], w[3], .3)); // soft wallpaper stripes
    if (d === 'codex') { F(g, 0, 0, W, WH, w[3]); for (let x = 12; x < W; x += 26) { F(g, x, 0, 1, WH, mixc(w[3], w[1], .45)); F(g, x + 1, 0, 1, WH, mixc(w[3], w[2], .38)); } F(g, 0, 18, W, 2, P.acc[1]); F(g, 0, 18, W, 1, P.acc[2]); }
    if (d === 'gemini') { const j0 = mixc(w[2], w[0], .7), j3 = mixc(w[2], w[3], .7), j1 = mixc(w[2], w[1], .7); for (let x = 0; x < W; x += 20) { F(g, x, 0, 1, WH, j0); F(g, x + 1, 0, 1, WH, j3); PX(g, x + 3, 6, j1); PX(g, x + 3, 25, j1); PX(g, x + 17, 6, j1); PX(g, x + 17, 25, j1); } F(g, 0, 15, W, 1, j1); F(g, 0, 16, W, 1, j3); }
    if (d === 'grok') for (let y = 0; y < WH; y += 10) for (let x = ((y / 10) % 2) * 12 - 12; x < W; x += 24) { // board-formed concrete panels, calm per-panel tone
      const tone = hsh(x + ':' + y) % 3; F(g, x, y, 24, 10, tone === 0 ? w[2] : tone === 1 ? mixc(w[2], w[1], .18) : mixc(w[2], w[3], .14));
      F(g, x, y, 24, 1, mixc(w[2], w[3], .32)); F(g, x, y + 9, 24, 1, mixc(w[2], w[1], .4)); F(g, x, y, 1, 10, mixc(w[2], w[1], .3)); PX(g, x + 4, y + 5, mixc(w[2], w[0], .45)); PX(g, x + 19, y + 5, mixc(w[2], w[0], .45));
    }
    if (d === 'muse') { vramp(g, 0, 0, W, WH, [w[3], mixc(w[2], P.acc[3], .1), mixc(w[2], P.acc[2], .14)]); F(g, 0, 4, W, 1, t[2]); }
    F(g, 0, 0, W, 1, mixc(w[0], 0, .25)); F(g, 0, 1, W, 1, mixc(w[2], w[0], .5)); F(g, 0, 2, W, 1, mixc(w[2], w[0], .22));
    if (d === 'claude') { F(g, 0, WH - 11, W, 11, t[1]); F(g, 0, WH - 12, W, 1, t[3]); F(g, 0, WH - 11, W, 1, t[2]); for (let x = 6; x < W; x += 16) { F(g, x, WH - 9, 1, 7, t[0]); F(g, x + 1, WH - 9, 1, 7, t[2]); F(g, x + 2, WH - 9, 12, 1, t[2]); F(g, x + 2, WH - 3, 12, 1, t[0]); } }
    F(g, 0, WH - 2, W, 2, t[0]); F(g, 0, WH - 2, W, 1, t[d === 'codex' || d === 'muse' ? 2 : 1]);
    F(g, 0, WH - 4, W, 1, mixc(t[0], 0, .3)); for (let x = 30; x < W - 10; x += 70) { F(g, x, WH - 7, 4, 4, 0xF2EEE6); PX(g, x + 1, WH - 6, 0x6A6A6A); PX(g, x + 2, WH - 6, 0x6A6A6A); }
    F(g, 0, WH, W, H - WH, f[2]);
    if (d === 'claude') for (let y = WH; y < H; y += 4) { // oak planks: seams, staggered joints, a few deliberate grain strokes per plank
      F(g, 0, y + 3, W, 1, mixc(f[2], f[1], .75)); const off = ((y - WH) >> 2) * 13 % 29;
      for (let x = off - 29; x < W; x += 29) { F(g, x, y, 1, 3, mixc(f[2], f[0], .45)); const gx = x + 5 + (hsh(x + ',' + y) % 14); F(g, gx, y + 1, 4 + (hsh(y + ',' + x) % 4), 1, mixc(f[2], f[1], .35)); if ((x + y) % 3 === 0) F(g, x + 2, y, 25, 1, mixc(f[2], f[3], .22)); }
    }
    if (d === 'codex') { for (let x = 0; x < W; x += 32) F(g, x, WH, 1, H - WH, mixc(f[2], f[1], .45)); for (let y = WH + 16; y < H; y += 16) F(g, 0, y, W, 1, mixc(f[2], f[1], .45)); for (let y = WH; y < H; y += 16) for (let x = 0; x < W; x += 32) { F(g, x + 1, y + 1, 31, 1, mixc(f[2], f[3], .33)); if (hsh(x + '/' + y) % 3 === 0) F(g, x + 1, y + 2, 31, 13, mixc(f[2], f[3], .15)); } F(g, 0, WH + 1, W, 2, mixc(f[2], f[3], .5)); }
    if (d === 'gemini') { const s1 = mixc(f[2], f[1], .72), s3 = mixc(f[2], f[3], .65), sa = mixc(f[2], P.acc[2], .55); for (let y = WH; y < H; y += 8) F(g, 0, y, W, 1, s1); for (let x = 0; x < W; x += 16) F(g, x, WH, 1, H - WH, s1); for (let y = WH; y < H; y += 8) for (let x = 0; x < W; x += 16) { F(g, x + 1, y + 1, 14, 1, s3); PX(g, x, y, sa); } }
    if (d === 'grok') for (let y = WH; y < H; y += 12) for (let x = ((y - WH) / 12 % 2) * 12 - 12; x < W; x += 24) { // steel floor plates, seams + corner bolts
      const bolt = mixc(f[2], f[3], .55); F(g, x, y, 24, 12, hsh(x + '|' + y) % 2 ? f[2] : mixc(f[2], f[1], .25)); F(g, x, y, 24, 1, mixc(f[2], f[3], .4)); F(g, x, y, 1, 12, mixc(f[2], f[0], .7)); F(g, x, y + 11, 24, 1, mixc(f[2], f[1], .75)); PX(g, x + 2, y + 2, bolt); PX(g, x + 21, y + 2, bolt); PX(g, x + 2, y + 9, bolt); PX(g, x + 21, y + 9, bolt);
    }
    if (d === 'muse') for (let x = 0; x < W; x += 7) { F(g, x, WH, 1, H - WH, mixc(f[2], f[1], .75)); F(g, x + 1, WH, 6, H - WH, (x / 7) % 3 === 1 ? f[3] : f[2]); const cut = WH + 6 + ((x * 13) % 23); F(g, x + 1, cut, 6, 1, f[1]); }
    F(g, 0, WH, W, 1, mixc(f[2], f[0], .75)); F(g, 0, WH + 1, W, 1, mixc(f[2], f[0], .45)); F(g, 0, WH + 2, W, 1, mixc(f[2], f[0], .2));
    dith(g, 0, 0, 2, H, mixc(w[0], 0, .35), .35); dith(g, W - 3, 0, 3, H, mixc(w[0], 0, .35), .45);
  },
  window(g, P, W, room) {
    const d = P.decor, t = P.trim, winW = d === 'gemini' ? 15 : 24, wx = W - winW - 24;
    room.win = [wx, winW];
    if (d === 'gemini') { this.porthole(g, P, wx + 7, 13, 7); return wx; }
    const frame = d === 'grok' ? P.metal[1] : t[2];
    F(g, wx - 1, 3, winW + 2, 17, frame); vramp(g, wx, 4, winW, 15, [P.win[0], P.win[1]]);
    if (P.night) { this.emit.push([room.x + wx + 4, room.y + 7, 1, 1, 0xFFFFFF], [room.x + wx + 15, room.y + 10, 1, 1, 0xDDE4FF], [room.x + wx + 17, room.y + 5, 3, 3, 0xF4EED8]); }
    else F(g, wx + 3, 12, 8, 2, mixc(P.win[1], 0xFFFFFF, .6));
    F(g, wx + Math.floor(winW / 2), 4, 1, 15, frame); F(g, wx, 11, winW, 1, frame);
    F(g, wx - 2, 19, winW + 4, 2, d === 'grok' ? P.metal[3] : t[3]);
    if (d === 'claude' || d === 'muse') { const cu = d === 'claude' ? P.acc : [P.acc[2], P.acc[3], 0xFFFFFF]; F(g, wx - 4, 2, 3, 18, cu[1]); F(g, wx - 4, 2, 1, 18, cu[2]); F(g, wx + winW + 1, 2, 3, 18, cu[1]); F(g, wx + winW + 3, 2, 1, 18, cu[0]); }
    return wx;
  },
  drawRoom(g, P, room, rr) {
    const X = room.x, Y = room.y, W = room.w, H = room.h, d = P.decor, WH = this.G.WH, t = P.trim, w = P.wall;
    g.save(); g.beginPath(); g.rect(X, Y, W, H); g.clip(); g.translate(X, Y);
    this.walls(g, P, W, H, rr);
    const wx = this.window(g, P, W, room);
    const sign = this.signW(room);
    let px = sign + 6;
    room.lamps = []; room.lights = []; room.anim = [];
    const lamp = (lx, ly) => room.lamps.push([X + lx, Y + ly]);
    room.weather = { x: wx, w: d === 'gemini' ? 15 : 24, kind: { claude: 'rain', codex: P.night ? 'snow' : 'none', gemini: 'star', grok: 'rain', muse: 'snow' }[d] };
    const space = () => wx - 8 - px;
    // ceiling fixtures
    if (d === 'claude') for (let lx = sign + 26; lx < W - 16; lx += 64) { F(g, lx, 0, 1, 5, t[0]); F(g, lx - 3, 5, 7, 2, P.acc[1]); F(g, lx - 2, 4, 5, 1, P.acc[2]); F(g, lx - 3, 7, 7, 1, P.acc[0]); this.emit.push([X + lx - 1, Y + 8, 3, 1, 0xFFF0C8]); lamp(lx, 8); }
    if (d === 'codex') for (let lx = sign + 4; lx < W - 30; lx += 46) { F(g, lx, 2, 18, 1, P.metal[2]); this.emit.push([X + lx, Y + 1, 18, 1, 0xF4FFFA]); lamp(lx + 9, 3); }
    if (d === 'gemini') { F(g, 0, 3, W, 1, P.acc[0]); this.emit.push([X, Y + 2, W, 1, P.acc[2]]); for (let lx = sign + 14; lx < W - 20; lx += 60) { lamp(lx, 10); room.anim.push({ k: 'orb', x: lx, y: 10 }); } }
    if (d === 'grok') { F(g, 0, 1, W, 3, P.metal[1]); F(g, 0, 1, W, 1, P.metal[2]); for (let x = 3; x < W; x += 9) F(g, x, 2, 4, 1, P.acc[0]); for (let lx = sign + 4; lx < W - 30; lx += 58) { PX(g, lx - 1, 6, P.metal[2]); PX(g, lx + 22, 6, P.metal[2]); this.emit.push([X + lx, Y + 6, 22, 1, P.night ? 0xC4CAD4 : 0xE8ECF2]); lamp(lx + 11, 7); } }
    if (d === 'muse') { F(g, 0, 0, W, 1, P.metal[2]); for (let lx = sign + 10; lx < W - 20; lx += 52) { PX(g, lx, 0, P.metal[2]); F(g, lx - 1, 1, 3, 2, P.metal[1]); this.emit.push([X + lx, Y + 3, 1, 1, 0xFFF4E0]); lamp(lx, 4); }
      for (let x = 4; x < W - 4; x += 6) { const sag = Math.round(Math.sin((x / W) * Math.PI) * 3); PX(g, x, 5 + sag, P.metal[1]); this.emit.push([X + x, Y + 6 + sag, 1, 1, [0xFFD27A, 0xFF9AC8, 0x9AD0FF][(x / 6 | 0) % 3]]); } }
    // signature wall props
    const order = srand(hsh(room.p.name + 'w'))() < .5;
    if (d === 'claude') {
      if (order && space() > 10) { this.clock(g, P, px + 4, 7); px += 12; }
      if (space() > 22) { this.bookshelf(g, P, px, 3, rr); px += 24; }
      if (space() > 16) { F(g, px + 1, 5, 12, 9, t[1]); F(g, px + 2, 6, 10, 7, w[3]); F(g, px + 3, 8, 4, 4, P.acc[2]); F(g, px + 6, 7, 5, 3, P.books[1]); F(g, px + 5, 10, 6, 2, P.acc[1]); px += 16; }
      if (!order && space() > 10) { this.clock(g, P, px + 4, 7); px += 12; }
      // hanging pothos from a ceiling hook
      const hx2 = Math.min(W - 40, sign + 4); for (let i = 0; i < 9; i++) { PX(g, hx2 + Math.round(Math.sin(i * .9) * 1.5), 2 + i, P.plant[i % 2 ? 2 : 1]); if (i % 2) PX(g, hx2 + 1 + Math.round(Math.sin(i * .9) * 1.5), 2 + i, P.plant[3]); }
      this.plant(g, P, W - 11, 22, 'monstera');
    }
    if (d === 'codex') {
      if (space() > 34) { F(g, px, 4, 34, 14, P.metal[3]); F(g, px + 1, 5, 32, 12, 0xFAFCFC); F(g, px + 3, 7, 7, 4, 0x2E3238); F(g, px + 4, 8, 5, 2, 0xFAFCFC); F(g, px + 10, 9, 6, 1, P.acc[1]); F(g, px + 16, 7, 7, 4, P.acc[1]); F(g, px + 17, 8, 5, 2, 0xFAFCFC); F(g, px + 4, 13, 20, 1, 0x6FA8D8); F(g, px + 4, 15, 12, 1, 0x9AA0A6); F(g, px + 2, 18, 30, 1, P.metal[2]); PX(g, px + 26, 13, 0xE5342B); px += 38; }
      if (space() > 10) { this.clock(g, P, px + 4, 7); px += 12; }
      if (space() > 12) { this.poster(g, P, px, 4, 10, 13, [0x10A37F, 0x22262C, 0xF4F5F6]); px += 14; }
      this.plant(g, P, W - 11, 21, 'snake');
    }
    if (d === 'gemini') {
      if (space() > 26) { F(g, px, 6, 24, 12, mixc(P.acc[0], w[2], .45)); F(g, px, 6, 24, 1, P.acc[3]); for (let i = 0; i < 20; i++) PX(g, px + 2 + i, 14 - Math.round(Math.sin(i / 3) * 3 + i / 6), P.acc[3]); F(g, px + 2, 8, 6, 1, 0xFFFFFF); room.lights.push([X + px + 12, Y + 12, P.acc[2], 18, .35]); px += 28; }
      if (space() > 12) { this.poster(g, P, px, 4, 10, 13, [P.acc[0], P.acc[2], 0xFFE680]); px += 14; }
      this.plant(g, P, W - 12, 19, 'float');
    }
    if (d === 'grok') {
      if (space() > 16) { F(g, px, 8, 13, 14, 0xF2F2F2); F(g, px + 1, 9, 11, 12, 0x0A0A0A); drawText(g, '42', px + 3, 12, 0xF2F2F2, null); px += 17; }
      if (space() > 18) { const rx = px; F(g, rx, 5, 16, 25, P.metal[0]); F(g, rx, 5, 1, 25, P.metal[2]); for (let y = 7; y < 28; y += 4) { F(g, rx + 2, y, 12, 3, P.metal[1]); F(g, rx + 2, y, 12, 1, P.metal[2]); room.anim.push({ k: 'led', x: rx + 12, y: y + 1 }); } px += 19; }
      if (space() > 10) { this.clock(g, P, px + 4, 7); px += 12; }
      this.plant(g, P, W - 11, 22, 'snake');
    }
    if (d === 'muse') {
      for (const [fw, fh] of [[14, 10], [10, 13], [16, 11]]) { if (space() < fw + 4) break; F(g, px, 6, fw, fh, t[0]); F(g, px + 1, 7, fw - 2, fh - 2, 0xFFFFFF); vramp(g, px + 2, 8, fw - 4, fh - 4, [P.acc[1], P.acc[2], P.acc[3]]); if (rr() < .5) F(g, px + 3, 8 + (fh - 4) / 2 | 0, fw - 6, 2, 0xFFE8A0); else { F(g, px + 3, 9, 3, 3, 0xFFE8A0); } room.lights.push([X + px + fw / 2, Y + 4, 0xFFF0E0, 14, .3]); px += fw + 5; }
      const ex = W - 19; F(g, ex + 2, 16, 1, 18, P.desk[0]); F(g, ex + 9, 16, 1, 18, P.desk[0]); F(g, ex + 5, 14, 1, 20, P.desk[1]); F(g, ex, 12, 13, 11, 0xFFFFFF); F(g, ex + 1, 13, 11, 9, 0xFAF6EE); F(g, ex + 2, 15, 5, 3, P.acc[3]); F(g, ex + 5, 17, 6, 3, P.acc[1]); F(g, ex + 3, 19, 3, 2, 0xFFC857); F(g, ex - 1, 23, 15, 1, P.desk[1]);
    }
    // seeded per project name: every room gets its own mix, plus a few rare props
    const rs = srand(hsh(room.p.name)), fy = H - 14, pickL = rs(), pickR = rs(), rare = rs();
    if (rare < .18) { // aquarium (rare): glows, fish swim
      F(g, 1, fy - 9, 13, 9, 0x2A5A7A); F(g, 2, fy - 8, 11, 7, 0x4AA8D0); F(g, 2, fy - 8, 11, 1, 0x9AE0F8); F(g, 2, fy - 3, 11, 2, 0xC8B080); F(g, 1, fy, 13, 7, P.desk[0]); F(g, 1, fy, 13, 1, P.desk[2]);
      room.anim.push({ k: 'fish', x: 3, y: fy - 7 }); room.lights.push([X + 7, Y + fy - 5, 0x6AD8FF, 12, .4]); this.emit.push([X + 2, Y + fy - 8, 11, 1, 0x9AE0F8]);
    } else if (pickL < .3) { F(g, 2, fy, 10, 7, 0xB98A58); F(g, 2, fy, 10, 1, 0xD8AE78); F(g, 6, fy, 2, 7, 0xE8D8B0); F(g, 3, fy - 5, 8, 5, 0xC8965E); F(g, 3, fy - 5, 8, 1, 0xE0B67C); F(g, 2, fy - 7, 10, 2, 0xE8D8C0); PX(g, 4, fy - 7, 0xC83A2A); PX(g, 8, fy - 7, 0xC83A2A); }  // boxes + pizza box
    else if (pickL < .55) { F(g, 3, fy - 13, 2, 20, P.desk[0]); F(g, 1, fy - 14, 6, 1, P.desk[1]); F(g, 5, fy - 12, 4, 8, P.acc[1]); F(g, 5, fy - 12, 4, 1, P.acc[2]); F(g, 0, fy - 11, 3, 6, P.books[1 % P.books.length]); }  // coat rack with jacket and scarf
    else if (pickL < .8) { F(g, 1, fy - 10, 11, 17, P.metal[2]); for (let i = 0; i < 3; i++) { F(g, 2, fy - 9 + i * 5, 9, 4, P.metal[1]); F(g, 5, fy - 8 + i * 5, 3, 1, P.metal[3]); } this.plant(g, P, 6, fy - 22, 'snake'); }  // filing cabinet + plant
    else { F(g, 3, fy - 16, 6, 9, 0x8A4A1E); F(g, 4, fy - 15, 4, 7, 0xC8742E); F(g, 5, fy - 24, 2, 9, 0x5A3418); F(g, 4, fy - 25, 4, 2, 0x3A2010); PX(g, 6, fy - 12, 0x2A1408); F(g, 2, fy - 6, 8, 1, P.metal[1]); F(g, 3, fy - 5, 1, 12, P.metal[1]); F(g, 8, fy - 5, 1, 12, P.metal[1]); }  // guitar on a stand
    if (pickR < .4) { F(g, W - 9, fy + 1, 6, 6, P.metal[2]); F(g, W - 9, fy + 1, 6, 1, P.metal[3]); PX(g, W - 7, fy, 0xF4F4F0); PX(g, W - 6, fy - 1, 0xE8E8E0); }  // bin
    else if (pickR < .65) { F(g, W - 10, fy - 2, 6, 9, 0x3A4048); F(g, W - 10, fy - 2, 6, 1, 0x5A6068); F(g, W - 9, fy - 9, 1, 8, 0x1A5A9A); F(g, W - 7, fy - 8, 1, 7, 0xC8342A); PX(g, W - 9, fy - 10, 0x1A5A9A); PX(g, W - 7, fy - 9, 0xC8342A); }  // umbrella stand
    else if (pickR < .88) { F(g, W - 12, fy - 14, 10, 21, 0x2A2A44); F(g, W - 11, fy - 12, 8, 6, 0x101830); F(g, W - 12, fy - 15, 10, 2, P.acc[1]); PX(g, W - 9, fy - 4, 0xE5342B); PX(g, W - 6, fy - 4, 0xFFC857); room.anim.push({ k: 'arcade', x: W - 11, y: fy - 12 }); room.lights.push([X + W - 7, Y + fy - 9, 0x8AA8FF, 12, .35]); }  // mini arcade cabinet
    else { F(g, W - 11, fy - 6, 8, 13, P.desk[1]); F(g, W - 11, fy - 6, 8, 1, P.desk[3]); F(g, W - 9, fy - 11, 4, 4, 0xE8C040); F(g, W - 8, fy - 7, 2, 1, 0xE8C040); PX(g, W - 9, fy - 11, 0xFFF0A0); }  // trophy on a cabinet
    // meeting nook / whiteboard stand in wide gaps beside a short desk row
    for (const sp of room.spans || []) {
      const gapR = X + W - sp.x1, gapL = sp.x0 - X, ry = sp.y - Y + this.G.DT;
      if (gapR >= 50) { const tx = sp.x1 - X + Math.floor((gapR - 34) / 2) + 2; F(g, tx + 2, ry - 10, 4, 10, P.chair[1]); F(g, tx + 24, ry - 10, 4, 10, P.chair[1]); F(g, tx, ry - 2, 30, 4, P.desk[2]); F(g, tx, ry - 2, 30, 1, P.desk[3]); F(g, tx + 4, ry + 2, 2, 10, P.desk[0]); F(g, tx + 24, ry + 2, 2, 10, P.desk[0]); F(g, tx + 10, ry - 5, 8, 3, P.metal[1]); F(g, tx + 10, ry - 5, 8, 1, P.metal[3]); F(g, tx + 21, ry - 4, 2, 2, P.pot[1]); F(g, tx + 5, ry - 4, 2, 2, 0xF4F4F0); F(g, tx - 3, ry + 6, 5, 3, P.chair[1]); F(g, tx + 28, ry + 6, 5, 3, P.chair[1]); }
      if (gapL >= 44) { const bx = sp.x0 - X - 32; F(g, bx, ry - 22, 22, 14, P.metal[3]); F(g, bx + 1, ry - 21, 20, 12, 0xFAFCFC); F(g, bx + 3, ry - 19, 8, 1, 0x3A6AD0); F(g, bx + 3, ry - 17, 12, 1, 0x7A7A84); F(g, bx + 3, ry - 15, 6, 1, 0xC8342A); F(g, bx + 12, ry - 14, 6, 3, 0x2E8A5A); F(g, bx + 4, ry - 8, 1, 18, P.metal[1]); F(g, bx + 17, ry - 8, 1, 18, P.metal[1]); F(g, bx + 2, ry + 9, 18, 1, P.metal[1]); }
    }
    if (rs() < .45) room.anim.push({ k: 'cat', x: wx + 4, y: 12, coat: COATS[Math.floor(rs() * COATS.length)], ph: rs() });
    if (rare > .8 && space() > 22) { const nx = px + 2, txt = P.decor === 'grok' ? 'HI' : 'OK'; F(g, nx - 1, 5, 18, 9, 0x141418); drawText(g, txt, nx + 4, 7, mixc(P.acc[2], 0, .55), null); room.anim.push({ k: 'neon', x: nx + 4, y: 7, txt }); px += 22; }
    this.sign(g, P, room);
    // pneumatic mail tube (paper planes come out here)
    F(g, 2, 0, 4, 6, P.metal[1]); F(g, 2, 0, 1, 6, P.metal[3]); F(g, 1, 6, 6, 2, P.metal[2]); F(g, 2, 7, 4, 1, P.metal[0]);
    g.restore();
    room.tube = [X + 4, Y + 9];
  },
  /* spare width on a storey becomes a lounge: elevator, vending machine, sofa, water cooler, notice board */
  drawLounge(g, P, room, rr) {
    const X = room.x, Y = room.y, W = room.w, H = room.h, WH = this.G.WH, M = P.metal;
    g.save(); g.beginPath(); g.rect(X, Y, W, H); g.clip(); g.translate(X, Y);
    this.walls(g, P, W, H, rr);
    room.lamps = []; room.lights = []; room.anim = [];
    let x = 6;
    room.elev = { x: 6 }; room.walk = { a: X + 17, b: X + Math.min(W - 26, 84), y: Y + WH + 6, elev: true };
    // elevator (sized for the 16x24 walker) with floor indicator, call button and a green exit sign
    F(g, x, 2, 23, WH + 2, M[1]); F(g, x + 1, 5, 21, WH - 2, M[2]); F(g, x + 11, 5, 1, WH - 2, M[0]); F(g, x + 1, 5, 21, 1, M[3]); F(g, x, 2, 23, 1, M[3]);
    F(g, x + 8, 0, 7, 2, 0x111111); this.emit.push([X + x + 9, Y + 0, 2, 1, 0xFFB040], [X + x + 12, Y + 0, 2, 1, 0xFFB040]);
    F(g, x + 25, 14, 2, 3, M[0]); this.emit.push([X + x + 25, Y + 14, 2, 1, 0xE8ECF0]);
    if (W > 120) { F(g, x + 30, 0, 9, 3, 0x0E5A2E); this.emit.push([X + x + 31, Y + 1, 7, 1, 0x5AF08A]); room.lights.push([X + x + 34, Y + 2, 0x5AF08A, 10, .35]); }
    x += 33;
    // vending machine (it glows at night)
    if (W - x > 20) { F(g, x, 6, 14, WH + 8, mixc(P.acc[0], 0x202020, .3)); F(g, x + 2, 8, 8, 16, 0xEAF4FF); for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) F(g, x + 3 + c * 2 + (c > 0 ? c - 1 : 0), 9 + r * 4, 1, 2, [0xE5342B, 0xFFC857, 0x5AD0C8, 0x7FE08A][(r + c) % 4]); F(g, x + 11, 10, 2, 6, M[2]); F(g, x + 2, WH + 2, 8, 3, M[0]);
      this.emit.push([X + x + 2, Y + 8, 8, 1, 0xFFFFFF]); room.lights.push([X + x + 7, Y + 16, 0xCFE8FF, 22, .45]); x += 18; }
    // water cooler
    if (W - x > 12) { F(g, x + 1, 6, 6, 7, 0x9AD4F0); F(g, x + 1, 6, 2, 7, 0xC8ECFF); F(g, x, 13, 8, 15, 0xEDEDED); F(g, x, 13, 8, 1, 0xFFFFFF); PX(g, x + 2, 16, 0x3A7AE0); PX(g, x + 5, 16, 0xE5342B); x += 12; }
    // notice board with pinned notes
    if (W - x > 28) { F(g, x, 4, 24, 15, 0x8A5A34); F(g, x + 1, 5, 22, 13, 0xC89A6A); for (let i = 0; i < 6; i++) { const nx = x + 2 + (i % 3) * 7, ny = 6 + Math.floor(i / 3) * 6; F(g, nx, ny, 5, 5, [0xFFF4B0, 0xFFFFFF, 0xC8F0FF, 0xFFD0E0][i % 4]); PX(g, nx + 2, ny, 0xE5342B); F(g, nx + 1, ny + 2, 3, 1, 0x9A9A9A); } }
    // sofa + rug + plant
    if (W - x > 40) { const sx = x + 2, sy = WH + 6; F(g, sx - 4, sy + 12, 44, 5, mixc(P.acc[2], P.floor[2], .4)); F(g, sx - 4, sy + 12, 44, 1, mixc(P.acc[3], P.floor[2], .4));
      F(g, sx, sy, 34, 9, P.chair[1]); F(g, sx, sy, 34, 1, P.chair[2]); F(g, sx - 2, sy + 2, 3, 9, P.chair[0]); F(g, sx + 33, sy + 2, 3, 9, P.chair[0]); F(g, sx, sy + 9, 34, 3, P.chair[0]); F(g, sx + 4, sy + 3, 8, 4, P.acc[2]); F(g, sx + 22, sy + 3, 8, 4, P.acc[3]);
      if (hsh(String(room.i)) % 2) room.anim.push({ k: 'cat', x: sx + 12, y: sy + 2, coat: COATS[room.i % COATS.length], ph: .3 }); }
    this.plant(g, P, W - 11, WH - 8, P.decor === 'codex' || P.decor === 'grok' ? 'snake' : 'monstera');
    for (let lx = 20; lx < W - 10; lx += 56) { this.emit.push([X + lx - 2, Y + 2, 5, 1, 0xFFF4E0]); F(g, lx - 2, 1, 5, 1, M[2]); room.lamps.push([X + lx, Y + 4]); }
    g.restore();
  },
  /* tea kitchen: counter, coffee machine (steams), fridge with magnets, microwave, fruit bowl, small table */
  drawKitchen(g, P, room, rr) {
    const X = room.x, Y = room.y, W = room.w, H = room.h, WH = this.G.WH, M = P.metal, D = P.desk;
    g.save(); g.beginPath(); g.rect(X, Y, W, H); g.clip(); g.translate(X, Y);
    this.walls(g, P, W, H, rr);
    room.lamps = []; room.lights = []; room.anim = [];
    // wall cabinets + tiled backsplash
    F(g, 6, 4, Math.min(W - 40, 70), 9, D[1]); F(g, 6, 4, Math.min(W - 40, 70), 1, D[3]); for (let x = 6; x < 6 + Math.min(W - 40, 70); x += 14) { F(g, x, 4, 1, 9, D[0]); PX(g, x + 11, 9, D[3]); }
    for (let y = 14; y < WH - 2; y += 3) for (let x = 6; x < 6 + Math.min(W - 40, 70); x += 4) F(g, x, y, 3, 2, mixc(P.wall[3], 0xFFFFFF, .4));
    // counter
    const cw = Math.min(W - 40, 70); F(g, 6, WH - 6, cw, 3, D[3]); F(g, 6, WH - 3, cw, 13, D[1]); F(g, 6, WH - 3, cw, 1, D[0]); for (let x = 6; x < 6 + cw; x += 14) { F(g, x, WH - 3, 1, 13, D[0]); PX(g, x + 7, WH + 2, D[3]); }
    // coffee machine (steam), microwave, fruit bowl
    F(g, 10, WH - 16, 9, 10, 0x2A2A30); F(g, 11, WH - 15, 7, 3, 0x46464E); this.emit.push([X + 12, Y + WH - 14, 1, 1, 0x5AE08A]); F(g, 13, WH - 9, 3, 3, 0xF4F4F0); room.anim.push({ k: 'steam', x: 14, y: WH - 10 });
    if (cw > 40) { F(g, 24, WH - 13, 14, 7, M[2]); F(g, 25, WH - 12, 8, 5, 0x1E2228); F(g, 34, WH - 12, 3, 5, M[1]); this.emit.push([X + 35, Y + WH - 11, 1, 1, 0x5AE08A]); }
    if (cw > 56) { F(g, 44, WH - 9, 9, 3, 0xF2EEE6); PX(g, 45, WH - 10, 0xE5342B); PX(g, 47, WH - 11, 0xFFC857); PX(g, 49, WH - 10, 0x7FD06A); PX(g, 51, WH - 10, 0xFF9A3A); }
    // fridge with magnets + a note
    const fx = 6 + cw + 6; if (W - fx > 16) { F(g, fx, 2, 14, WH + 10, 0xE8EAEE); F(g, fx, 2, 14, 1, 0xFFFFFF); F(g, fx, 14, 14, 1, 0xB8BCC4); F(g, fx + 12, 6, 1, 5, 0x9AA0A8); F(g, fx + 12, 17, 1, 8, 0x9AA0A8); F(g, fx + 2, 18, 5, 6, 0xFFF4B0); PX(g, fx + 3, 18, 0xE5342B); PX(g, fx + 8, 6, P.acc[1]); PX(g, fx + 5, 8, P.acc[2]); }
    // small round table with two stools
    if (W > 120) { const tx = W - 46; F(g, tx, WH + 8, 22, 3, D[2]); F(g, tx, WH + 8, 22, 1, D[3]); F(g, tx + 10, WH + 11, 2, 9, D[0]); F(g, tx - 6, WH + 14, 5, 2, P.chair[1]); F(g, tx - 5, WH + 16, 1, 5, P.chair[0]); F(g, tx + 23, WH + 14, 5, 2, P.chair[1]); F(g, tx + 26, WH + 16, 1, 5, P.chair[0]); F(g, tx + 4, WH + 6, 3, 2, 0xF2EEE6); F(g, tx + 14, WH + 6, 3, 2, P.pot[1]); }
    this.plant(g, P, W - 11, WH - 8, 'monstera');
    room.walk = { a: X + W - 6, b: X + 24, y: Y + WH + 6 };
    for (let lx = 24; lx < W - 10; lx += 56) { this.emit.push([X + lx - 2, Y + 2, 5, 1, 0xFFF4E0]); F(g, lx - 2, 1, 5, 1, M[2]); room.lamps.push([X + lx, Y + 4]); }
    g.restore();
  },
  clock(g, P, x, y) { F(g, x - 2, y - 3, 5, 7, 0x2E3238); F(g, x - 3, y - 2, 7, 5, 0x2E3238); F(g, x - 2, y - 2, 5, 5, 0xFFFFFF); PX(g, x, y - 1, 0x222222); PX(g, x, y, 0x222222); PX(g, x + 1, y, 0xE5342B); },
  poster(g, P, x, y, w, h, c) { F(g, x, y, w, h, c[2]); F(g, x + 1, y + 1, w - 2, h - 5, c[0]); F(g, x + 2, y + 3, w - 4, 3, c[1]); F(g, x + 2, y + h - 3, w - 5, 1, c[1]); PX(g, x + w / 2 | 0, y, 0xC8C8C8); },
  signW(room) { return 8 + signNameW(room) + textW(signTxt(room.p.branch, 14)) + 14 + 8; },
  sign(g, P, room) {
    const wide = signWide(room), d = P.decor, name = wide ? '' : signTxt(room.p.other ? 'etc' : room.p.name, 18), br = signTxt(room.p.branch, 14), nw = signNameW(room), tw = nw + textW(br) + 14, x = 8, y = 2;
    const sty = { claude: [P.trim[1], P.trim[3], 0xF6D486, 0xE7C9A0, P.trim[0]], codex: [0xFFFFFF, P.metal[3], 0x111111, P.acc[0], 0xC8CCD0],
      gemini: [mixc(P.acc[0], 0x0A0C30, .5), P.acc[2], 0xFFFFFF, P.acc[3], 0x0A0C30], grok: [0x0A0A0A, 0x5A5A5A, 0xF4F4F4, 0x9AA6B8, 0x000000], muse: [0xFFFFFF, P.trim[1], P.acc[1], P.acc[2], P.trim[0]] }[d];
    F(g, x - 1, y - 1, tw + 2, 11, sty[4]); F(g, x, y, tw, 9, sty[0]); F(g, x, y, tw, 1, sty[1]); F(g, x + 1, y - 2, 1, 1, sty[4]); F(g, x + tw - 2, y - 2, 1, 1, sty[4]);
    drawText(g, name, x + 4, y + 2, sty[2], null); PX(g, x + nw + 6, y + 4, sty[3]); drawText(g, br, x + nw + 9, y + 2, sty[3], null);
    room.htmlSign = wide ? { x: x + 4, y: y + 1, text: signWideTxt(room), col: cssc(sty[2]) } : null;   // Hangul etc.: the 5 px font has no glyphs, an HTML label sits on the plaque
    room.lampAt = [room.x + x + tw + 3, room.y + y + 2];
    F(g, x + tw + 2, y + 1, 5, 5, sty[4]); F(g, x + tw + 3, y + 2, 3, 3, 0x4A3A3A);
    room.lights.push([room.x + x + tw / 2, room.y + y + 4, P.lamp, tw * .5, .18]);
  },
  porthole(g, P, cx, cy, r) {
    for (let y = -r - 2; y <= r + 2; y++) for (let x = -r - 2; x <= r + 2; x++) {
      const d = Math.sqrt(x * x + y * y);
      if (d <= r) { let c = mixc(P.win[0], P.win[1], clamp((y + r) / (2 * r), 0, 1)); if (P.night && (x * 7 + y * 13) % 11 === 0 && d < r - 1) c = 0xFFFFFF; const pd = Math.sqrt((x + 4) * (x + 4) + (y - 9) * (y - 9)); if (pd < 8) c = pd > 7 ? P.acc[3] : mixc(P.acc[1], P.acc[2], clamp((x + 4) / 10, 0, 1)); PX(g, cx + x, cy + y, c); }
      else if (d <= r + 2) PX(g, cx + x, cy + y, d <= r + 1 ? P.metal[3] : P.metal[1]);
    }
  },
  bookshelf(g, P, x, y, rr) {
    const D = P.desk; F(g, x, y, 20, 27, D[0]); F(g, x + 1, y + 1, 18, 25, D[1]); F(g, x, y, 20, 1, D[3]);
    for (let s = 0; s < 3; s++) { const sy = y + 2 + s * 8; F(g, x + 1, sy + 6, 18, 2, D[2]); let bx = x + 2; while (bx < x + 17) { const bw = 1 + Math.floor(rr() * 2), bh = 3 + Math.floor(rr() * 3), c = P.books[Math.floor(rr() * P.books.length)]; F(g, bx, sy + 6 - bh, bw, bh, c); PX(g, bx, sy + 6 - bh, mixc(c, 0xFFFFFF, .35)); bx += bw + (rr() < .2 ? 1 : 0); } }
  },
  plant(g, P, x, y, kind) {
    const pl = P.plant, pot = P.pot;
    if (kind === 'float') { F(g, x - 4, y + 3, 9, 4, pot[1]); F(g, x - 4, y + 3, 9, 1, pot[2]); F(g, x - 3, y + 7, 7, 1, pot[0]); }
    else { F(g, x - 3, y + 6, 7, 7, pot[1]); F(g, x - 3, y + 6, 2, 7, pot[2]); F(g, x + 2, y + 6, 2, 7, pot[0]); F(g, x - 4, y + 5, 9, 2, pot[2]); }
    const leaves = kind === 'snake' ? [[-2, 0, -2, -9], [0, 0, 0, -12], [2, 0, 3, -8], [1, 0, 1, -10]] : [[-1, 2, -6, -4], [0, 2, 0, -7], [1, 2, 6, -3], [0, 2, -3, -9], [0, 2, 4, -8]];
    for (const [x0, y0, x1, y1] of leaves) { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); for (let i = 0; i <= n; i++) { const X = Math.round(x + x0 + (x1 - x0) * i / n), Y = Math.round(y + y0 + (y1 - y0) * i / n); PX(g, X, Y, pl[1]); if (kind !== 'snake' && i > n / 3) { PX(g, X - 1, Y, pl[2]); PX(g, X + 1, Y, pl[0]); PX(g, X, Y - 1, pl[3]); } else PX(g, X + 1, Y, i % 3 ? pl[2] : pl[3]); } }
  },
  /* ---------- furniture: back parts into `g` (behind the sprite), desk fronts into `fr` (over it) ---------- */
  leadDesk(g, fr, P, s2) {
    const G = this.G, x = s2.x, y = s2.y, D = P.desk, C = P.chair, M = P.metal, cx = G.cx, DT = G.DT, SW = G.SW, [mx, my] = G.L.mon;
    // chair back
    F(g, x + cx - 9, y + DT - 23, 18, 1, C[2]); F(g, x + cx - 11, y + DT - 22, 22, 22, C[1]); F(g, x + cx - 11, y + DT - 22, 2, 22, C[2]); F(g, x + cx + 9, y + DT - 22, 2, 22, C[0]);
    F(g, x + cx - 9, y + DT - 15, 18, 1, C[0]); F(g, x + cx - 9, y + DT - 14, 18, 1, C[2]); for (let i = 0; i < 3; i++) { PX(g, x + cx - 6 + i * 6, y + DT - 19, C[0]); PX(g, x + cx - 6 + i * 6, y + DT - 9, C[0]); }
    // desk top
    F(g, x + 1, y + DT, SW - 2, 6, D[2]); F(g, x + 1, y + DT, SW - 2, 1, D[3]); F(g, x + 1, y + DT + 5, SW - 2, 1, D[3]);
    for (let i = 0; i < SW / 10; i++) PX(g, x + 5 + i * 10 + (i % 2) * 3, y + DT + 2 + (i % 2), D[1]);
    // keyboard
    F(g, x + cx - 9, y + DT + 1, 16, 3, M[1]); for (let i = 0; i < 7; i++) PX(g, x + cx - 8 + i * 2, y + DT + 1, M[3]); F(g, x + cx - 8, y + DT + 2, 14, 1, M[2]); F(g, x + cx - 9, y + DT + 4, 16, 1, mixc(D[2], 0, .3));
    // monitor + sticky notes
    F(g, x + mx + 5, y + DT, 8, 2, M[1]); F(g, x + mx + 5, y + DT, 8, 1, M[3]); F(g, x + mx + 8, y + my + 16, 2, DT - my - 16, M[2]);
    F(g, x + mx, y + my, 18, 16, M[0]); F(g, x + mx + 1, y + my + 1, 16, 14, M[1]); F(g, x + mx + 1, y + my + 1, 16, 1, M[3]); F(g, x + mx + 17, y + my + 1, 1, 14, M[0]);
    F(g, x + mx + 2, y + my + 2, 14, 10, P.scr); PX(g, x + mx + 9, y + my + 13, M[3]);
    const r = hsh(s2.n.id); if (r % 2) { F(g, x + mx + 15, y + my - 1, 3, 3, 0xFFE38A); F(g, x + mx + 15, y + my - 1, 3, 1, 0xFFF4C0); } if (r % 3 === 0) { F(g, x + mx - 1, y + my + 3, 2, 3, 0xFFB0C8); }
    // the "tool" machine at the right, button on its left face where the arm reaches
    const bx = x + cx + 19, by = y + DT - 16;
    F(g, bx, by, 13, 18, M[1]); F(g, bx, by, 13, 1, M[3]); F(g, bx, by, 1, 18, M[3]); F(g, bx + 12, by, 1, 18, M[0]);
    for (let i = 0; i < 4; i++) F(g, bx + 3, by + 10 + i * 2, 7, 1, M[0]);
    F(g, bx + 1, by + 7, 3, 3, P.acc[1]); PX(g, bx + 1, by + 7, P.acc[3]); PX(g, bx + 3, by + 9, P.acc[0]);
    F(g, bx, by + 18, 13, 1, mixc(D[2], 0, .35));
    // a personal prop by the monitor: books, snack, plushie, energy can, paint jar
    const px = x + mx + 19, py = y + DT, d = P.decor, k = r % 4;
    if (k === 0) { F(g, px, py - 3, 6, 2, P.books[0]); F(g, px, py - 5, 6, 2, P.books[2 % P.books.length]); F(g, px, py - 5, 6, 1, mixc(P.books[2 % P.books.length], 0xFFFFFF, .3)); }
    if (k === 1) { F(g, px + 1, py - 4, 4, 4, d === 'grok' ? 0xE6E6E6 : 0xF2E6D0); F(g, px + 1, py - 4, 4, 1, 0xC83A2A); PX(g, px + 2, py - 5, 0xFFFFFF); }
    if (k === 2) { F(g, px, py - 5, 5, 5, P.acc[2]); F(g, px, py - 6, 2, 1, P.acc[2]); F(g, px + 3, py - 6, 2, 1, P.acc[2]); PX(g, px + 1, py - 4, 0x222222); PX(g, px + 3, py - 4, 0x222222); PX(g, px + 2, py - 3, mixc(P.acc[2], 0xFF8080, .5)); }
    if (k === 3) { F(g, px + 1, py - 5, 3, 5, d === 'muse' ? P.pot[1] : 0x3A3A44); F(g, px + 1, py - 3, 3, 1, P.acc[2]); if (d === 'muse') { PX(g, px + 1, py - 7, P.acc[3]); PX(g, px + 3, py - 8, P.acc[1]); } }
    // front: desk panel, drawer unit, contact shadow
    F(fr, x + 3, y + DT + 16, SW - 6, 1, mixc(P.floor[0], 0, .4)); dith(fr, x + 1, y + DT + 16, SW - 2, 3, 0, .22);
    F(fr, x + 1, y + DT + 6, SW - 2, 10, D[1]); F(fr, x + 5, y + DT + 6, cx + 4, 10, mixc(D[0], 0, .4)); F(fr, x + 5, y + DT + 6, cx + 4, 2, mixc(D[0], 0, .6));
    F(fr, x + 1, y + DT + 6, 3, 10, D[0]); F(fr, x + 1, y + DT + 6, 1, 10, D[2]);
    F(fr, x + cx + 10, y + DT + 6, SW - cx - 11, 10, D[2]); F(fr, x + cx + 10, y + DT + 10, SW - cx - 11, 1, D[0]); F(fr, x + cx + 16, y + DT + 8, 4, 1, D[3]); F(fr, x + cx + 16, y + DT + 12, 4, 1, D[3]); F(fr, x + SW - 2, y + DT + 6, 1, 10, D[0]);
  },
  kidDesk(g, fr, P, s2) {
    const G = this.G, x = s2.x, y = s2.y, D = P.desk, C = P.chair, M = P.metal, cx = G.icx, DT = G.DT, IW = G.IW, [mx, my] = G.K.mon;
    F(g, x + cx - 6, y + DT - 15, 12, 1, C[2]); F(g, x + cx - 7, y + DT - 14, 14, 14, C[1]); F(g, x + cx - 7, y + DT - 14, 1, 14, C[2]); F(g, x + cx + 6, y + DT - 14, 1, 14, C[0]);
    F(g, x + 1, y + DT, IW - 2, 5, D[2]); F(g, x + 1, y + DT, IW - 2, 1, D[3]); F(g, x + 1, y + DT + 4, IW - 2, 1, D[3]);
    F(g, x + cx - 5, y + DT + 1, 11, 2, M[1]); for (let i = 0; i < 5; i++) PX(g, x + cx - 4 + i * 2, y + DT + 1, M[3]);
    F(g, x + mx, y + my, 10, 9, M[0]); F(g, x + mx + 1, y + my + 1, 8, 6, P.scr); F(g, x + mx + 4, y + my + 9, 2, DT - my - 9, M[2]); F(g, x + mx + 2, y + DT, 6, 1, M[1]);
    F(fr, x + 2, y + DT + 13, IW - 4, 1, mixc(P.floor[0], 0, .4)); dith(fr, x + 1, y + DT + 13, IW - 2, 3, 0, .2);
    F(fr, x + 1, y + DT + 5, IW - 2, 8, D[1]); F(fr, x + 4, y + DT + 5, IW - 8, 8, mixc(D[0], 0, .4)); F(fr, x + 1, y + DT + 5, 3, 8, D[0]); F(fr, x + IW - 4, y + DT + 5, 3, 8, D[0]);
  },
  /* ---------- per-frame ---------- */
  sprite(s2, t) {
    const n = s2.n, size = s2.kind === 'lead' ? 'lead' : 'intern', fam = n.tool === 'agy' ? 'agy' : n.tool === 'codex' ? 'codex' : 'claude';
    const since = t - (n.enteredPerf != null ? n.enteredPerf : -1e9);
    const pick = Chars.pick(fam, size, n.st, since, t, s2.ph, RM());
    if (!pick) return null;
    const period = 2600 + (hsh(n.id) % 2400), blink = !Chars.src && !RM() && ['work', 'tool', 'child', 'user'].includes(n.st) && ((t + s2.ph * 9000) % period) < 140;
    let c = Chars.frame(fam, size, n.st, pick, hsh(n.id) % 9, blink, this.cctx);
    if (n.st === 'stopped') { let gh = this.ghosts.get(c); if (!gh) { gh = this.ghost(c); this.ghosts.set(c, gh); } c = gh; }
    const o = s2.kind === 'lead' ? this.G.L : this.G.K;
    return [c, s2.x + o.ox, s2.y + o.oy];
  },
  ghost(src) { // cold, translucent, fading out toward the bottom in clean bands
    const [c, g] = mkc(src.width, src.height); g.drawImage(src, 0, 0);
    const im = g.getImageData(0, 0, c.width, c.height), D = im.data;
    for (let y = 0; y < c.height; y++) { const a = y > c.height * .55 ? (y > c.height * .75 ? 70 : 110) : 150; for (let x = 0; x < c.width; x++) { const i = (y * c.width + x) * 4; if (!D[i + 3]) continue; const l = (D[i] * 2 + D[i + 1] * 3 + D[i + 2]) / 6; D[i] = l * .55 + 0xB8 * .45; D[i + 1] = l * .6 + 0xC8 * .4; D[i + 2] = l * .55 + 0xFF * .45; D[i + 3] = a; } }
    g.putImageData(im, 0, 0); return c;
  },
  screen(g, s2, t) {
    const n = s2.n, P = this.P, small = s2.kind === 'kid', o = small ? this.G.K : this.G.L, sx = s2.x + o.scr[0], sy = s2.y + o.scr[1], sw = o.scr[2], sh = o.scr[3];
    const q = RM() ? 0 : t, fr = Math.floor(q / 250), cxs = sx + (sw >> 1), cys = sy + (sh >> 1);
    switch (n.st) {
      case 'work': { g.drawImage(this.codeTex, 0, RM() ? 0 : Math.floor(q / 160 + s2.ph * 64) % 52, sw, sh, sx, sy, sw, sh); if (fr % 2) F(g, cxs, sy + sh - 2, 2, 1, P.code[0]); return 'on'; }
      case 'tool': { F(g, sx, sy, sw, sh, 0x050806); const lines = Math.max(2, (sh - 2) >> 1); for (let i = 0; i < lines; i++) { const w = 2 + ((i * 7 + fr) % Math.max(2, sw - 4)); F(g, sx + 1, sy + 1 + i * 2, 1, 1, P.acc[2]); F(g, sx + 3, sy + 1 + i * 2, Math.min(w, sw - 4), 1, i === lines - 1 ? P.code[0] : mixc(P.code[1], 0, .35)); } F(g, sx + 1, sy + sh - 1, sw - 2, 1, 0x1E2A24); F(g, sx + 1, sy + sh - 1, Math.max(1, ((RM() ? .6 : (q / 2200 + s2.ph) % 1) * (sw - 2)) | 0), 1, P.acc[2]); return 'on'; }
      case 'child': { F(g, sx, sy, sw, sh, P.scr); F(g, cxs - 1, sy + 1, 3, 2, P.code[0]); F(g, cxs, sy + 3, 1, 1, P.code[1]); F(g, sx + 1, sy + 4, sw - 2, 1, P.code[1]); for (let i = 0; i < 3; i++) F(g, sx + 1 + Math.round(i * (sw - 3) / 2), sy + 5, 2, 2, i === fr % 3 ? P.acc[3] : P.code[2]); return 'on'; }
      case 'user': { F(g, sx, sy, sw, sh, P.scr); F(g, sx + 1, sy + 1, sw - 2, sh - 2, 0xF4F4F4); F(g, sx + 1, sy + 1, sw - 2, 1, 0xC8C8CC); if (sw > 8) { F(g, sx + 2, sy + 3, sw - 6, 1, 0x777780); F(g, sx + 2, sy + 5, sw - 8, 1, 0x777780); } F(g, sx + sw - 5, sy + sh - 3, 3, 2, fr % 2 ? 0xFF4A3A : 0xC02E24); return 'red'; }
      case 'stall': { g.drawImage(this.codeTex, 0, Math.floor(s2.ph * 50), sw, sh, sx, sy, sw, sh); dith(g, sx, sy, sw, sh, P.scr, .55); F(g, cxs - 1, cys - 2, 3, 1, 0xFFB040); F(g, cxs, cys - 1, 1, 2, 0xFFB040); F(g, cxs - 1, cys + 1, 3, 1, 0xFFB040); return 'amber'; }
      case 'idle': { F(g, sx, sy, sw, sh, mixc(P.scr, 0, .3)); const tt = q / 900 + s2.ph * 10; F(g, sx + Math.round((Math.sin(tt) * .5 + .5) * (sw - 2)), sy + Math.round((Math.cos(tt * 1.3) * .5 + .5) * (sh - 2)), small ? 1 : 2, small ? 1 : 2, P.acc[2]); return 'dim'; }
      case 'done': { F(g, sx, sy, sw, sh, mixc(P.scr, 0, .2)); const pts = small ? [[1, 3], [2, 4], [3, 3], [4, 2], [5, 1]] : [[3, 5], [4, 6], [5, 7], [6, 6], [7, 5], [8, 4], [9, 3]]; for (const [a, b] of pts) PX(g, sx + a, sy + b, 0x6FD39A); return 'dim'; }
      case 'stopped': { F(g, sx, sy, sw, sh, mixc(P.metal[0], 0, .3)); for (let i = 0; i < Math.min(4, sh - 1); i++) PX(g, sx + sw - 3 - i, sy + 1 + i, mixc(P.metal[3], 0, .3)); return 'off'; }
      case 'dead': { const r = srand(RM() ? 3 : Math.floor(q / 110) + hsh(n.id)); for (let yy = 0; yy < sh; yy++) for (let xx = 0; xx < sw; xx++) PX(g, sx + xx, sy + yy, r() < .5 ? 0x2A2A2E : r() < .5 ? 0x5A5A62 : 0x8A8A94); return 'off'; }
    }
    return 'off';
  },
  bubbleCache: new Map(),
  bubble(kind, frame) {
    const key = kind + frame; let c = this.bubbleCache.get(key); if (c) return c;
    const red = kind === 'bang', W = 13, H = 12;
    const L = new Lay(W + 2, H + 4), bg = red ? 0xE5342B : 0xFFFBF2, lite = red ? 0xFF7B70 : 0xFFFFFF, sh = red ? 0xB8281F : 0xE6DCCE;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const corner = (x === 0 || x === W - 1) && (y === 0 || y === H - 1); if (corner) continue; L.set(x + 1, y + 1, y === 0 || x === 0 ? lite : y === H - 1 || x === W - 1 ? sh : bg); }
    L.set(3, H + 1, bg); L.set(4, H + 1, sh); L.set(3, H + 2, sh);
    const ic = { bang: [ICONS.bang, 0xFFFFFF], dots: [ICONS.dots, 0xC27A12], gear: [frame % 2 ? ICONS.term1 : ICONS.term0, 0x3A4050], tree: [ICONS.hour, 0x6A5A40], check: [ICONS.check, 0x3E8A5A], stop: [ICONS.stop, 0x6A6A74], plug: [ICONS.plug, 0x6A6A74] }[kind];
    const rows = ic[0], ox = 1 + Math.floor((W - rows[0].length) / 2), oy = 1 + Math.floor((H - rows.length) / 2);
    if (kind === 'dots') { for (let i = 0; i < Math.min(3, frame + 1); i++) { L.set(3 + i * 3, 6, 0xC27A12); L.set(4 + i * 3, 6, 0xC27A12); L.set(3 + i * 3, 7, 0xC27A12); L.set(4 + i * 3, 7, 0xA8650C); } }
    else for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) if (rows[y][x] === '#') L.set(ox + x, oy + y, ic[1]);
    finish(L, red ? 0x4A0E0A : 0x4A3A30, null, 0, null);
    c = L.canvas(); this.bubbleCache.set(key, c); return c;
  },
  /* ambient life: a tiny colleague takes the elevator to the vending machine / makes coffee, then leaves */
  life(g, s, t, room, lights) {
    const w = room.walk; if (!w) return;
    const R = RM(), P = this.P, WK = Chars.walker();
    // timeline (ms): doors open, hold stand pose, walk a->b (foot-locked), stand with cup, walk back, hold, doors, gone
    const dist = Math.abs(w.b - w.a), ms = WK ? 1000 / WK.walk.fps : 170;
    const nWalk = WK ? Chars.framesFor(dist) : Math.ceil(dist / 1.5);
    const tW = nWalk * ms, t0 = 600, t1 = t0 + 500, t2 = t1 + tW, t3 = t2 + 3200, t4 = t3 + tW, t5 = t4 + 400, t6 = t5 + 700;
    const T = Math.max(24000, t6 + 6000), c = R ? -1 : (t + room.i * 7919) % T;
    if (room.elev) {
      const dOpen = c < 0 ? 0 : c < t0 ? c / t0 : c < t1 ? 1 : c < t1 + 400 ? (t1 + 400 - c) / 400 : c >= t5 - 300 && c < t5 ? (c - t5 + 300) / 300 : c >= t5 && c < t6 - 300 ? 1 : c >= t6 - 300 && c < t6 ? (t6 - c) / 300 : 0;
      const d = Math.round(dOpen * 9), ex = room.x + room.elev.x + 11, ey = room.y + 5;
      if (d) { F(g, ex - d, ey, d * 2, this.G.WH - 2, nightc(P, 0x2A2018)); F(g, ex - d, ey, d * 2, 1, 0xFFE6B0); lights.push([ex, ey + 10, 0xFFE0A8, 16, .45 * dOpen, 1]); }
    }
    if (c < 0 || c < t0 || c >= t5 + 200) return;
    let x, mode = 'stand', fi = 0;
    const back = c >= t2 + 3200;
    if (c < t1) x = w.a;
    else if (c < t2) { const k = Math.floor((c - t1) / ms); x = w.a + Math.sign(w.b - w.a) * Math.min(dist, WK ? Chars.advance(k) : k * 1.5); mode = 'walk'; fi = k; }
    else if (c < t3) { x = w.b; fi = Math.floor((c - t2) / (WK ? 1000 / WK.stand.fps : 300)); }
    else if (c < t4) { const k = Math.floor((c - t3) / ms); x = w.b + Math.sign(w.a - w.b) * Math.min(dist, WK ? Chars.advance(k) : k * 1.5); mode = 'walk'; fi = k; }
    else x = w.a;
    const left = back ? w.a < w.b : w.b < w.a;
    if (WK) {
      const im = Chars.walkerFrame(mode, fi, left, this.cctx);
      s.drawImage(im, Math.round(x) - (left ? WK.w - 1 - WK.anchorX : WK.anchorX), w.y - WK.anchorY);
      return;
    }
    const f = mode === 'walk' ? 1 + Math.floor(fi / 2) % 2 : 0, key = room.i + ':' + f + (left ? 'l' : 'r');
    const cache = this.walkCache || (this.walkCache = new Map());
    let im = cache.get(key);
    if (!im) {
      const rs = srand(room.i * 31 + 7), L = new Lay(7, 12);
      L.spr(WALKER[f], { h: [0x2A1A14, 0x1A1A22, 0x6A4A2A, 0xC8A060][Math.floor(rs() * 4)], s: SKIN[Math.floor(rs() * 3)][2], c: [P.acc[1], 0x3A6AA8, 0x6A8A4A, 0xC8B08A][Math.floor(rs() * 4)], d: 0x2A2A30, p: 0x3A3A48, k: 0x1A1A1E }, 0, 0, { flip: left });
      tintLay(L, this.cctx.tint); finish(L, 0x1A1420, null, 0, null); im = L.canvas(); cache.set(key, im);
    }
    s.drawImage(im, Math.round(x) - 4, w.y - 12);
  },
  /* weather on the windows, per theme: rain (Claude, Grok), snow (Muse, ChatGPT at night), shooting stars (Gemini) */
  weather(g, t, R, P) {
    const tt = R ? 0 : t;
    for (const room of this.rooms) {
      const W = room.weather; if (!W || W.kind === 'none') continue;
      const x0 = room.x + W.x, y0 = room.y + 4, ww = W.w, wh = 15;
      g.save(); g.beginPath();
      if (W.kind === 'star') g.arc(x0 + 7.5, room.y + 13.5, 7, 0, Math.PI * 2); else g.rect(x0, y0, ww, wh);
      g.clip();
      if (W.kind === 'rain') { g.fillStyle = rgba(mixc(P.win[1], 0xFFFFFF, .5), P.night ? .55 : .7); const n = P.decor === 'grok' ? 14 : 9; for (let i = 0; i < n; i++) { const y = y0 + ((i * 53 + tt * .11 + room.i * 7) % (wh + 4)) - 2, x = x0 + ((i * 37 + tt * .025) % ww); g.fillRect(Math.round(x), Math.round(y), 1, 2); } }
      if (W.kind === 'snow') { g.fillStyle = 'rgba(255,255,255,.85)'; for (let i = 0; i < 8; i++) { const y = y0 + ((i * 29 + tt * .012 + room.i * 5) % wh), x = x0 + (((i * 41 + Math.sin(tt / 900 + i) * 2) % ww) + ww) % ww; g.fillRect(Math.round(x), Math.round(y), 1, 1); } }
      if (W.kind === 'star' && !R) { const c = (t + room.i * 2300) % 6000; if (c < 500) { const k = c / 500, sx = x0 + 14 - k * 16, sy = room.y + 8 + k * 9; g.fillStyle = '#FFFFFF'; g.fillRect(Math.round(sx), Math.round(sy), 1, 1); g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(Math.round(sx) + 1, Math.round(sy) - 1, 1, 1); g.fillRect(Math.round(sx) + 2, Math.round(sy) - 1, 1, 1); } }
      g.restore();
    }
  },
  render(t) {
    if (!this.stat) return;
    const g = this.fg, s = this.sg, P = this.P, R = RM(), G = this.G, N = P.night;
    const lights = [], cores = [];   // lights: [x, y, colour, radius, alpha, squashY]   cores (bloom only): [x, y, colour, radius, alpha]
    for (const c of [g, s]) { c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.clearRect(0, 0, this.WD, this.HD); }
    g.drawImage(this.stat, 0, 0);
    this.weather(g, t, R, P);
    // animated room props (lit layer)
    for (const room of this.rooms) {
      for (const a of room.anim) {
        const X = room.x + a.x, Y = room.y + a.y;
        if (a.k === 'led') { const on = R || (Math.floor(t / 180 + a.y * 3.7) % 5); PX(g, X, Y, on ? mixc(P.acc[3], P.metal[1], N ? .45 : .2) : P.metal[1]); PX(g, X - 2, Y, (Math.floor(t / 400 + a.y) % 3) ? (N ? 0x3A9A60 : 0x5AE08A) : P.metal[1]); if (on && N) cores.push([X, Y, P.acc[2], 2, .3]); }
        if (a.k === 'orb') { const oy = Y + (R ? 0 : Math.round(Math.sin(t / 900 + a.x) * 1.5)); F(g, X - 1, oy - 1, 3, 3, P.acc[3]); PX(g, X - 1, oy - 1, 0xFFFFFF); lights.push([X, oy, P.acc[2], 16, .45, 1]); cores.push([X, oy, P.acc[3], 5, .9]); }
        if (a.k === 'steam' && !R) { g.fillStyle = 'rgba(255,255,255,.55)'; for (let k = 0; k < 7; k++) { if ((k + Math.floor(t / 160)) % 3 === 0) continue; g.fillRect(X + Math.round(Math.sin(t / 380 + k * .8) * 1.3), Y - k, 1, 1); } }
        if (a.k === 'cat') { const cyc = (t / 1000 + a.ph * 7) % 7, f = R ? 0 : cyc > 6.5 ? 2 : Math.floor(t / 1100 + a.ph * 3) % 2; const CC = this.catCache || (this.catCache = new Map()), key = a.coat.join() + f + (N ? 'n' : ''); let cc = CC.get(key); if (!cc) { const ly = new Lay(12, 7); ly.spr(CAT[f], { a: a.coat[0], b: a.coat[1], c: a.coat[2] }, 0, 0); if (N) tintLay(ly, mixc(P.amb, 0xFFFFFF, .3)); cc = ly.canvas(); CC.set(key, cc); } g.drawImage(cc, X, Y); }
        if (a.k === 'fish') { for (let i = 0; i < 2; i++) { const fx = X + Math.round(4 + Math.sin((R ? 0 : t) / (1300 + i * 400) + i * 2) * 4), fy = Y + 1 + i * 3; F(g, fx, fy, 2, 1, i ? 0xFFB040 : 0xFF6A4A); PX(g, fx + (Math.sin(t / 1300 + i) > 0 ? -1 : 2), fy, 0xFFD080); } if (!R) PX(g, X + 2 + Math.floor(t / 400) % 3, Y + 5 - Math.floor(t / 250) % 6, 0xD8F4FF); }
        if (a.k === 'arcade') { const ph = R ? 0 : Math.floor(t / 300); for (let y = 0; y < 6; y++) F(g, X, Y + y, 8, 1, [0x3A6AFF, 0xFF5AA8, 0xFFE24A, 0x5AE0A8][(y + ph) % 4]); cores.push([X + 4, Y + 3, 0x9AB0FF, 5, .7]); }
        if (a.k === 'neon') { const c = R ? 1000 : (t + room.i * 1700) % 7000, on = !(c < 140 || (c > 260 && c < 330)); drawText(g, a.txt, X, Y, on ? P.acc[3] : mixc(P.acc[2], 0, .55), null); if (on) { lights.push([X + 3, Y + 2, P.acc[2], 14, .45, 1]); cores.push([X + 3, Y + 2, P.acc[3], 6, .9]); } }
      }
      if (room.filler) this.life(g, s, t, room, lights);
      if (!room.filler && room.lampAt && this.stations.some(s2 => s2.room === room && s2.n.st === 'user')) { const [lx, ly] = room.lampAt, on = R || Math.floor(t / 600) % 2 === 0; F(g, lx, ly, 3, 3, on ? 0xFF3B2E : 0x9A2018); PX(g, lx, ly, on ? 0xFFB0A8 : 0xC03028); if (on) { lights.push([lx + 1, ly + 1, 0xFF4A3A, 12, .5, 1]); cores.push([lx + 1, ly + 1, 0xFF4A3A, 4, .9]); } }
    }
    // stations: screen + machine (lit layer) / character, steam, note (sprite layer)
    for (const s2 of this.order) {
      const n = s2.n, small = s2.kind === 'kid', o = small ? G.K : G.L;
      const sc = this.screen(g, s2, t), gx = s2.x + o.scr[0] + (o.scr[2] >> 1), gy = s2.y + o.scr[1] + (o.scr[3] >> 1);
      const flick = R ? 1 : .88 + .12 * Math.sin(t / 90 + s2.ph * 40) * Math.sin(t / 37 + s2.ph * 9);
      const col = sc === 'red' ? 0xFF4A3A : sc === 'amber' ? 0xFFAA40 : P.glow;
      if (sc !== 'off') {
        const a = sc === 'on' ? .5 : sc === 'red' ? .6 : sc === 'amber' ? .45 : .22;
        lights.push([gx, gy, col, small ? 12 : 20, a * flick, 1]);
        lights.push([gx + 2, s2.y + G.DT + 9, col, small ? 16 : 26, a * .45, .35]);   // bounce light on the desk and floor
        cores.push([gx, gy, col, small ? 2 : 4, sc === 'dim' ? .18 : .4]);
      }
      if (!small) { const bx = s2.x + G.cx + 19, by = s2.y + G.DT - 16, fast = n.st === 'tool'; for (let i = 0; i < 3; i++) { const on = R ? i === 0 : fast ? (Math.floor(t / 90) + i * 2) % 3 === 0 : (Math.floor(t / 1200) + i) % 3 === 0; PX(g, bx + 10, by + 3 + i * 2, on ? (fast ? P.acc[3] : 0x5AE08A) : P.metal[0]); } if (fast && !R && Math.floor(t / 110) % 2) { PX(g, bx + 2, by + 8, 0xFFFFFF); lights.push([bx + 2, by + 8, P.acc[2], 8, .5, 1]); cores.push([bx + 2, by + 8, 0xFFFFFF, 3, .8]); } }
      const sp = this.sprite(s2, t);
      if (sp) s.drawImage(sp[0], sp[1], sp[2]);
      const mugInHand = Chars.src && n.st === 'idle';
      if (!small && !mugInHand) { const mx = s2.x + G.cx + 10, my = s2.y + G.DT - 3; F(g, mx, my, 4, 5, nightc(P, P.pot[1])); F(g, mx, my, 1, 5, nightc(P, P.pot[2])); F(g, mx + 4, my + 1, 1, 2, nightc(P, P.pot[0])); F(g, mx + 1, my, 2, 1, nightc(P, 0x3A2418)); }
      if (!small && !mugInHand && n.st !== 'dead' && n.st !== 'stopped') { s.fillStyle = 'rgba(255,255,255,.5)'; for (let k = 0; k < 6; k++) { if (!R && (k + Math.floor(t / 180 + s2.ph * 10)) % 3 === 0) continue; s.fillRect(s2.x + G.cx + 11 + Math.round(Math.sin((R ? 0 : t / 420) + k * .9 + s2.ph * 6) * 1.2), s2.y + G.DT - 5 - k, 1, 1); } }
      const note = this.notes.get(n.id);
      if (note && note > t) { const nx = s2.x + (small ? G.icx - 2 : G.cx - 2), ny = s2.y + G.DT + 2; F(s, nx, ny, 5, 3, 0xFFFFFF); F(s, nx, ny + 2, 5, 1, 0xD8D8E0); PX(s, nx + 1, ny + 1, P.acc[1]); }
    }
    s.drawImage(this.front, 0, 0);
    // activity pulses along the slab cable
    for (const st of this.stories) { const act = this.stations.filter(s2 => st.rooms.includes(s2.room) && AP.active(s2.n.st)); act.forEach((s2, i) => { const p = R ? (i + .5) / Math.max(1, act.length) : ((t / 3200 + s2.ph) % 1), x = Math.floor(this.B.x0 + p * this.B.innerW); PX(g, x, st.y + 5, P.acc[3]); PX(g, x - 1, st.y + 5, P.acc[2]); PX(g, x - 2, st.y + 5, mixc(P.acc[1], P.slab[1], .5)); lights.push([x, st.y + 5, P.acc[2], 6, .5, 1]); cores.push([x, st.y + 5, P.acc[3], 2, .6]); }); }
    // dust motes drifting in the light (unlit layer so they stay soft specks)
    for (const m of this.motes) { const tt = R ? 0 : t / 1000; const y = m.y0 + ((m.y - m.y0 - tt * 2 * m.s) % m.h + m.h) % m.h, x = m.x + Math.sin(tt * m.s + m.ph) * 3; s.fillStyle = (N ? 'rgba(255,236,190,' : 'rgba(255,255,240,') + (.3 + .25 * Math.sin(tt * 1.7 + m.ph)) + ')'; s.fillRect(Math.round(x), Math.round(y), 1, 1); }
    // paper planes (talks)
    this.planes = this.planes.filter(pl => {
      const s2 = this.stations.find(z => z.n.id === pl.id); if (!s2) return false;
      const [x0, y0] = s2.room.tube, x1 = s2.x + (s2.kind === 'kid' ? G.icx : G.cx), y1 = s2.y + G.DT + 1;
      const f = R ? 1 : (t - pl.t0) / 1500;
      if (f >= 1) { this.notes.set(pl.id, t + 7000); return false; }
      const e = f < .5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2, cx = (x0 + x1) / 2, cy = Math.min(y0, y1) - 6;
      const x = (1 - e) * (1 - e) * x0 + 2 * (1 - e) * e * cx + e * e * x1, y = (1 - e) * (1 - e) * y0 + 2 * (1 - e) * e * cy + e * e * y1;
      if (!pl.cv) pl.cv = [0, 1].map(i => { const l2 = new Lay(9, 5); l2.spr(PLANE[i], { W: 0xFFFFFF, g: 0x8A90A8, f: 0xD8DCE8 }, 0, 0, { flip: x1 < x0 }); return finish(l2, 0x2A2238, null, 0, null).canvas(); });
      s.drawImage(pl.cv[Math.floor(t / 90) % 2], Math.round(x) - 4, Math.round(y) - 2);
      return true;
    });
    // state cues (crisp, unlit)
    for (const s2 of this.order) {
      const n = s2.n, small = s2.kind === 'kid', o = small ? G.K : G.L, cx = small ? G.icx : G.cx;
      let kind = null, fr = 0;
      switch (n.st) { case 'user': kind = 'bang'; break; case 'stall': kind = 'dots'; fr = R ? 2 : Math.min(2, Math.floor(t / 600) % 4); break; case 'tool': kind = 'gear'; fr = R ? 0 : Math.floor(t / 420) % 2; break; case 'child': kind = 'tree'; break; case 'done': kind = 'check'; break; case 'stopped': kind = 'stop'; break; case 'dead': kind = 'plug'; break; }
      if (kind) {
        const img = this.bubble(kind, fr), bob = n.st === 'user' && !R ? Math.round(Math.sin(t / 220) * 1) : 0;
        let bx = kind === 'bang' ? s2.x + cx - (small ? 16 : 24) : s2.x + cx + (small ? 6 : 9), by = s2.y + o.oy - (small ? 4 : 5) + bob;
        if (kind === 'check') { bx = s2.x + o.mon[0] + (small ? -2 : 1); by = s2.y + o.mon[1] - 16; }
        s.drawImage(img, bx, by);
        if (kind === 'bang') { lights.push([bx + 7, by + 6, 0xFF4A3A, 14, R ? .35 : .4 + .12 * Math.sin(t / 220), 1]); cores.push([bx + 7, by + 6, 0xFF4A3A, 6, .7]); }
      }
      if (n.st === 'idle') for (let i = 0; i < 3; i++) {
        const p = R ? (i + .5) / 3 : ((t / 2600) + i / 3 + s2.ph) % 1;
        const zx = s2.x + cx + (small ? 4 : 6) + Math.round(p * 7 + Math.sin(p * 6) * 1.5), zy = s2.y + o.oy + (small ? 4 : 8) - Math.round(p * 13);
        if (p > .85) continue;
        const gl = ZGLYPH[p > .45 ? 1 : 0];
        for (let y = 0; y < gl.length; y++) for (let x = 0; x < gl[y].length; x++) if (gl[y][x] === '#') { PX(s, zx + x + 1, zy + y + 1, 0x2A2238); PX(s, zx + x, zy + y, 0xEAF2FF); }
      }
    }
    const [ax, ay] = this.antenna; if (R || Math.floor(t / 900) % 2) { PX(g, ax, ay, 0xFFFFFF); lights.push([ax, ay, 0xFFFFFF, 6, .5, 1]); cores.push([ax, ay, 0xFFFFFF, 3, .9]); }
    if (N) { const [sx, sy, sw] = this.signGlow, c = R ? 5000 : t % 9000, a = c < 120 || (c > 220 && c < 300) ? .12 : .5; lights.push([sx, sy, P.acc[3], sw * .8, a, .45]); cores.push([sx, sy, P.acc[3], sw * .35, a * 1.4]); }
    // light (half res) and emitter mask (quarter res) for bloom
    const lg = this.lg; lg.setTransform(1, 0, 0, 1, 0, 0); lg.globalCompositeOperation = 'source-over'; lg.clearRect(0, 0, this.lc.width, this.lc.height);
    lg.drawImage(this.lightStatic, 0, 0); lg.setTransform(.5, 0, 0, .5, 0, 0); lg.globalCompositeOperation = 'lighter';
    for (const [x, y, c, r, a, sy] of lights) glow(lg, x, y, r, c, N ? a : a * .5, sy);
    lg.setTransform(1, 0, 0, 1, 0, 0);
    const eg = this.eg; eg.setTransform(1, 0, 0, 1, 0, 0); eg.globalCompositeOperation = 'source-over'; eg.clearRect(0, 0, this.em.width, this.em.height);
    eg.drawImage(this.emStatic, 0, 0); eg.setTransform(.25, 0, 0, .25, 0, 0); eg.globalCompositeOperation = 'lighter';
    for (const [x, y, c, r, a] of cores) glow(eg, x, y, r, c, N ? a : a * .5);
    eg.setTransform(1, 0, 0, 1, 0, 0);
    this.bg.clearRect(0, 0, this.bc.width, this.bc.height); this.bg.drawImage(this.em, 0, 0, this.bc.width, this.bc.height);
    this.present();
  },
  present() {
    const cg = this.cg, W = this.WD * this.S, H = this.HD * this.S, N = this.P.night;
    cg.globalCompositeOperation = 'source-over'; cg.globalAlpha = 1; cg.imageSmoothingEnabled = false;
    cg.clearRect(0, 0, W, H);
    cg.drawImage(this.farBlur, 0, 0);
    if (this.farH < this.HD) { cg.imageSmoothingEnabled = true; cg.drawImage(this.far, 0, this.farH, this.WD, this.HD - this.farH, 0, this.farH * this.S, W, H - this.farH * this.S); cg.imageSmoothingEnabled = false; }
    cg.drawImage(this.fb, 0, 0, W, H);
    // light: 'screen' never clips pale materials to white; bloom comes only from the emitter mask
    cg.imageSmoothingEnabled = true; cg.globalCompositeOperation = 'screen';
    cg.globalAlpha = N ? 1 : .75; cg.drawImage(this.lc, 0, 0, W, H);
    cg.globalAlpha = N ? .9 : .4; cg.drawImage(this.bc, 0, 0, W, H);
    // sprites last: crisp, never lit or bloomed (night tint + rim are baked into the frames)
    cg.globalAlpha = 1; cg.globalCompositeOperation = 'source-over'; cg.imageSmoothingEnabled = false;
    cg.drawImage(this.fs, 0, 0, W, H);
  },
  /* ---------- DOM overlay: focusable desks (buttons), nameplates, storey labels ---------- */
  buildOverlays() {
    const box = this.hits; box.replaceChildren(); this.hit = new Map();
    const k = this.k, G = this.G;
    for (const st of this.stories) {
      const sv = st.sv;
      box.append(h('div.slab', { style: 'left:' + ((this.B.x0 + 3) * k) + 'px;top:' + ((st.y + this.B.SLAB / 2) * k - 10) + 'px', 'aria-hidden': 'true' },
        h('span', sv.name), h('small', (sv.kind === 'local' ? '내 PC' : 'SSH') + ' · ' + (sv.state === 'ok' ? '연결됨' : sv.state === 'connecting' ? '연결 중' : '끊김'))));
    }
    for (const room of this.rooms) if (room.htmlSign) {
      const hs = room.htmlSign;
      box.append(h('div.sgn', { style: 'left:' + ((room.x + hs.x) * k) + 'px;top:' + ((room.y + hs.y) * k) + 'px;font-size:' + (7 * k) + 'px;line-height:' + (7 * k) + 'px;color:' + hs.col, 'aria-hidden': 'true' }, hs.text));
    }
    for (const s2 of this.order) {
      const small = s2.kind === 'kid', n = s2.n, o = small ? G.K : G.L, w = small ? G.IW : G.SW, top = Math.min(o.oy, G.DT - 24) - 4, key = n.key;
      const b = h('button.hit' + (small ? '.kid' : ''), { type: 'button', data: { agent: key }, style: 'left:' + (s2.x * k) + 'px;top:' + ((s2.y + top) * k) + 'px;width:' + (w * k) + 'px;height:' + ((G.DT + 17 - top) * k) + 'px' },
        h('span.np', { style: 'top:' + ((G.DT + 7 - top) * k) + 'px' }, h('i'), h('span')));
      AP.bindAgent(b, () => { const z = this.stations.find(q => q.n.key === key); return z && z.n; });
      box.append(b); this.hit.set(key, b);
    }
    this.refreshOverlays();
  },
  refreshOverlays() {
    if (!this.hit) return;
    for (const s2 of this.stations) {
      const b = this.hit.get(s2.n.key); if (!b) continue;
      const n = s2.n;
      b.className = 'hit' + (s2.kind === 'kid' ? ' kid' : ''); R.stClass(b, n.st); b.dataset.st = n.st; b.dataset.w = n.waiting ? '1' : ''; b.setAttribute('aria-label', AP.label(n));
      const np = b.querySelector('.np'); np.firstChild.className = 'st-' + n.st; text(np.lastChild, n.name);
    }
  },
  plane(n) { if (!this.stations.find(z => z.n.key === n.key)) return; this.planes.push({ id: n.id, t0: performance.now() }); }
};

  /* ---------- module API for Overview ---------- */
  const sigOf = (D, w) => w + '#' + D.projects.map(p => p.id + ':' + D.roots.filter(r => r.project === p.id).map(r => r.key + '(' + r.kids.slice(0, 4).map(k => k.key).join(',') + ')').join(',')).join('|') + '#' + D.servers.map(s => s.id + s.state).join(',');
  function mount(host) {
    Office.host = host;
    Office.world = h('div.ovo'); Office.cv = h('canvas', { 'aria-hidden': 'true' }); Office.hits = h('div.hits', { role: 'group', 'aria-label': '책상' });
    Office.cg = Office.cv.getContext('2d');
    Office.world.append(Office.cv, Office.hits);
    host.replaceChildren(Office.world);
    Office.vig = h('div.ovo-vig', { 'aria-hidden': 'true' }); host.parentElement && host.parentElement.append(Office.vig);
    Office.sig = '';
  }
  return {
    available: () => Chars.load(),
    update(host, D, api, force) {
      AP = api; Office.D = D;
      if (!Chars.load()) return;
      if (Office.host !== host || !Office.world || !Office.world.isConnected) mount(host);
      const sg = sigOf(D, host.clientWidth);
      if (sg !== Office.sig || force || !Office.stat) { Office.sig = sg; Office.layout(); Office.render(performance.now()); return; }
      const byKey = new Map(), walk = n => { byKey.set(n.key, n); n.kids.forEach(walk); }; D.roots.forEach(walk);
      for (const s2 of Office.stations) { const n = byKey.get(s2.n.key); if (n) s2.n = n; }
      Office.refreshOverlays();
      if (RM()) Office.render(performance.now());
    },
    frame(t) { if (Office.stat && Office.world && Office.world.isConnected) Office.render(t); },
    plane(n) { if (!RM()) Office.plane(n); },
    invalidate() { Office.setTheme(); },
    unmount() { if (Office.vig) Office.vig.remove(); Office.world = null; Office.host = null; Office.stat = null; Office.sig = ''; }
  };
})();
