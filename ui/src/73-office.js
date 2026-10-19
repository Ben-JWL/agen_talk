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
  // state cue above a desk: the red '!' only for an unread wait; a wait I already opened (n.ack) gets a calm grey '…'
  const cueOf = n => ({ user: n.ack ? 'read' : 'bang', stall: n.ack ? 'read' : 'dots', tool: 'gear', child: 'tree', done: 'check', stopped: 'stop', dead: 'plug' })[n.st] || null;
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
  /* intros play once from the state change, then `next`; loops are phase-shifted per agent. Reduced motion: base key frame */
  pick(fam, size, st, since, t, ph, reduce) {
    const a = this.anim(fam, size, st), state = st;
    if (!a) return null;
    if (reduce) return { a, state, i: Math.min(a.key, a.n - 1) };
    const ms = 1000 / a.fps;
    if (!a.loop) {
      const i = Math.floor(since / ms);
      if (i < a.n) return { a, state, i };
      if (a.next) return this.loopPick(fam, size, a.next, since - a.n * ms, 0, ph);
      return { a, state, i: a.n - 1 };
    }
    return this.loopPick(fam, size, st, t, ph * a.n, ph);
  },
  /* motion variants (AT_SPRITES anims[f][s].vars[st] = [st, 'st~1', ...], same length as the base, all start and end on
     the base frame 0): time is cut into segments of one base loop; each segment plays one variant, picked per agent from
     a hash of (phase, segment). Each draw weighs base .5, the rest share .5, and excludes the previous segment's variant
     (chained inside blocks of 8 segments, seeded from the previous block): the base plays ~40 % of segments in a 3-4 set,
     half in a pair, back-to-back repeats are rare. Per-frame cost: at most 16 integer hashes */
  vars(fam, size, st) { const A = ((this.src.anims[fam] || {})[size]) || {}, v = A.vars && A.vars[st]; return v && v.length > 1 && A[st] ? v.filter(k => A[k] && A[k].frames) : null; },
  mix(a, b) { let h = Math.imul(a ^ 0x9E3779B9, 0x85EBCA6B) ^ Math.imul((b + 0x7F4A7C15) | 0, 0xC2B2AE35); h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; return h >>> 0; },
  varIdx(n, seed, seg) {
    const w = k => (k ? .5 / (n - 1) : .5), draw = (s, ex) => {
      let u = (this.mix(seed, s) % 10000) / 10000 * (1 - (ex < 0 ? 0 : w(ex))), last = 0;
      for (let k = 0; k < n; k++) { if (k === ex) continue; last = k; if ((u -= w(k)) < 0) return k; }
      return last;
    };
    const run = (b, to, ex) => { let c = draw(b, ex); for (let s = b + 1; s <= to; s++) c = draw(s, c); return c; }, b = seg - (((seg % 8) + 8) % 8);
    return run(b, seg, run(b - 8, b - 1, -1));
  },
  loopPick(fam, size, st, t, off, ph) {
    const a = this.anim(fam, size, st), g = Math.floor(t / (1000 / a.fps) + off), seg = Math.floor(g / a.n), i = g - seg * a.n, keys = this.vars(fam, size, st);
    if (!keys) return { a, state: st, i, seg };
    const v = keys[this.varIdx(keys.length, Math.floor(ph * 0x7FFFFFFF) | 0, seg)], b = v === st ? a : this.anim(fam, size, v);
    return { a: b, state: v, i: Math.min(i, b.n - 1), seg };
  },
  /* per-agent looks (AT_SPRITES.looks, v2.1): a look swaps the hair + outfit ramps (look 0 = the family palette), skin comes
     from a small shared set, and 0–1 accessory overlay (glasses, cap, scarf, ...) from the family/size's own list. All of it
     is a pure function of the agent id; an intern never wears its lead's look (when they share the family) */
  lookOf(id, fam, size, leadId) {
    const L = this.src && this.src.looks, h = hsh(id);
    if (!L) return { look: 0, skin: 0, acc: null, k: '' };
    const n = L.n, look = leadId != null ? (hsh(leadId) % n + 1 + h % (n - 1)) % n : h % n, skin = (h >>> 8) % L.skin.length;
    const allow = ((L.acc.allow[fam] || {})[size]) || [], acc = allow.length && (h >>> 16) % 100 >= 50 ? allow[(h >>> 20) % allow.length] : null;
    return { look, skin, acc, k: '/' + look + '.' + skin + '.' + (acc || '') };
  },
  /* palette of one family in one theme with a look applied (ints, -1 = none); a family walker uses the same mapping */
  pal(theme, fam, lk) {
    const key = theme + fam + (lk ? lk.k : ''), P = this.pals || (this.pals = new Map());
    let c = P.get(key); if (c) return c;
    const base = ((this.src.palettes[THEME_KEY[theme]] || this.src.palettes.claude || {})[fam]) || [], L = this.src.looks;
    c = base.map(x => x ? hx(x) : -1);
    const put = (idx, str) => { for (let i = 0; i < idx.length; i++) c[parseInt(idx[i], 36)] = parseInt(str.substr(6 * i, 6), 16); };
    if (L && lk) {
      const lp = ((L.pal[THEME_KEY[theme]] || L.pal.claude || {})[fam] || [])[lk.look];
      if (lp) put(L.idx, lp);
      if (L.skin[lk.skin]) put(L.sidx, L.skin[lk.skin]);
    }
    P.set(key, c); return c;
  },
  /* accessory overlay of one raster: anchored on the raster's own head (rows._hd = [view, hx, hy, bx, by]) or body; pixels where
     a hand / arm / prop is in front of the head (rows._oc) stay the raster's */
  overlay(Ly, rows, pool, name, cols) {
    const L = this.src.looks, A = L && L.acc[pool] && L.acc[pool][name], hd = rows._hd;
    if (!A || !hd) return;
    const e = A.v[hd[0]] || A.v['*']; if (!e) return;
    const R2 = e._r || (e._r = e[2].split('|')), ax = (A.a === 'b' ? hd[3] : hd[1]) + e[0], ay = (A.a === 'b' ? hd[4] : hd[2]) + e[1], w = rows[0].length, oc = rows._oc;
    for (let y = 0; y < R2.length; y++) for (let x = 0; x < R2[y].length; x++) {
      const ch = R2[y][x], X = ax + x, Y = ay + y; if (ch === '.') continue;
      if (oc && oc.has(Y * w + X)) continue;
      const ci = parseInt(ch, 36); if (ci > 0 && cols[ci] >= 0) Ly.set(X, Y, cols[ci]);
    }
  },
  /* bounded cache (Map insertion order = LRU): one canvas per raster x look */
  cget(key) { const c = this.cache.get(key); if (c) { this.cache.delete(key); this.cache.set(key, c); } return c; },
  cput(key, c) { this.cache.set(key, c); if (this.cache.size > 2400) this.cache.delete(this.cache.keys().next().value); return c; },
  /* one frame -> canvas (look palette + accessory, night tint + short rim from the scene); identical exposures share a raster
     id (v2 _rid), so the cache key is (family, raster, look) */
  frame(fam, size, st, pick, v, blink, ctx, lk) {
    const rows = pick.a.frames[pick.i], key = (rows._rid != null ? fam + '#' + rows._rid : fam + size + pick.state + pick.i) + (lk ? lk.k : '') + ctx.theme;
    let c = this.cget(key);
    if (c) return c;
    const cols = this.pal(ctx.theme, fam, lk), L = new Lay(rows[0].length, rows.length);
    for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) { const ch = rows[y][x]; if (ch === '.') continue; const ci = parseInt(ch, 36); if (ci > 0 && cols[ci] >= 0) L.set(x, y, cols[ci]); }
    if (lk && lk.acc) this.overlay(L, rows, size, lk.acc, cols);
    tintLay(L, ctx.tint); rimOnly(L, ctx.rim, ctx.rimA * .8);
    return this.cput(key, L.canvas());
  },
  /* the walker (walk + stand, faces right). Walk speed is measured from the frames: the planted foot's backward shift
     on the bottom row per frame = how far the body advances, so feet never slide (every variant shares the leg keys). */
  walker() { const W = this.src && this.src.walker; return W && W.anims && W.anims.walk && W.anims.stand ? { w: W.w, h: W.h, anchorX: W.anchorX, anchorY: W.anchorY, walk: W.anims.walk, stand: W.anims.stand } : null; },
  /* colleagues: the base walker + variants with their own palettes; family walkers (fam/size, no palettes) wear agents' looks */
  colleagues() { const W = this.src.walker; return this._col || (this._col = [W].concat((W.variants || []).filter(v => v.palettes && v.anims && v.anims.walk && v.anims.stand))); },
  famWalker(fam, size) { const W = this.src && this.src.walker; return W && (W.variants || []).find(v => v.fam === fam && v.size === size && v.anims && v.anims.walk && v.anims.stand) || null; },
  steps() {
    if (this._steps) return this._steps;
    const fr = this.src.walker.anims.walk.frames, n = fr.length, foot = f => { const r = f[f.length - 1], set = new Set(); for (let x = 0; x < r.length; x++) if (r[x] !== '.') set.add(x); return set; };
    const out = [];
    for (let i = 0; i < n; i++) { const A = foot(fr[i]), B = foot(fr[(i + 1) % n]); let best = 0, bs = -1; for (let d = 0; d <= 4; d++) { let o = 0; for (const x of A) if (B.has(x - d)) o++; if (o > bs) { bs = o; best = d; } } out.push(best); }
    return (this._steps = out);
  },
  advance(k) { const st = this.steps(); let x = 0; for (let i = 0; i < k; i++) x += st[i % st.length]; return x; },
  framesFor(dist) { let k = 0; while (this.advance(k) < dist && k < 400) k++; return k; },
  /* who = a colleague (base walker / generic variant) or { v: family walker, fam, lk } for an agent away from its desk */
  walkerFrame(mode, i, left, ctx, who) {
    const W = this.src.walker, fw = who && who.fam ? who : null, V = fw ? fw.v : who || W, a = V.anims[mode], idx = RM() ? (a.key || 0) : i % a.frames.length;
    const key = 'W' + (V.name || '') + (fw ? fw.lk.k : '') + mode + idx + (left ? 'l' : 'r') + ctx.theme;
    let c = this.cget(key);
    if (c) return c;
    const pal = fw ? this.pal(ctx.theme, fw.fam, fw.lk) : (V.palettes[THEME_KEY[ctx.theme]] || V.palettes.claude || []).map(x => x ? hx(x) : -1), rows = a.frames[idx], L = new Lay(rows[0].length, rows.length);
    for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) { const ch = rows[y][x]; if (ch === '.') continue; const ci = parseInt(ch, 36); if (ci > 0 && pal[ci] >= 0) L.set(x, y, pal[ci]); }
    if (fw && fw.lk.acc) this.overlay(L, rows, 'walker', fw.lk.acc, pal);
    if (left) { const d = L.d, w = L.w; for (let y = 0; y < L.h; y++) for (let x = 0; x < w >> 1; x++) { const p = y * w + x, q = y * w + w - 1 - x, t = d[p]; d[p] = d[q]; d[q] = t; } }
    tintLay(L, ctx.tint);
    return this.cput(key, L.canvas());
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
const famOf = n => n.tool === 'agy' ? 'agy' : n.tool === 'codex' ? 'codex' : 'claude';
const IDLE_ST = { idle: 1, done: 1, done_loop: 1 };   // states in which an agent may get up for a short walk
/* ---------- spatial variety. Every project room has an archetype (structure + props; all colours still come from the fan
   theme's ramps): wall treatment, floor, ceiling lights, window style and 3-6 signature props. Spare storey width becomes one
   of eight filler rooms; every desk is one of several variants. All of it is a pure function of ids (no Math.random). ---------- */
const ARCHS = ['studio', 'lab', 'server', 'green', 'shop', 'war', 'cafe', 'retro'];
const ARCH = {
  studio: { wall: 'wainscot', floor: 'rug', ceil: 'theme', win: 'wide' },      // library: shelves, fireplace, reading lamp
  lab: { wall: 'tiles', floor: 'tile', ceil: 'strip', win: 'std' },            // glass cabinet, flasks, formula whiteboard
  server: { wall: 'panels', floor: 'raised', ceil: 'cool', win: 'none' },      // racks with LEDs, patch panel, cool light
  green: { wall: 'glass', floor: 'pavers', ceil: 'sky', win: 'none' },         // atrium: glazing, skylights, hanging pots
  shop: { wall: 'brick', floor: 'concrete', ceil: 'track', win: 'std' },       // maker: pegboard, bins, 3D printer
  war: { wall: 'slats', floor: 'carpet', ceil: 'theme', win: 'blinds' },       // big chart screen, map pins, red strings
  cafe: { wall: 'brickhi', floor: 'checker', ceil: 'pend', win: 'double' },    // espresso counter, chalk menu, pastry case
  retro: { wall: 'stripes', floor: 'arcade', ceil: 'neon', win: 'std' }        // arcade cabinet, CRT with pong, posters
};
/* a project's archetype: a hash of its id, stepped by an odd stride (every archetype reachable) past the ones already on its storey */
const archOf = (id, taken = []) => { let i = hsh(id + '#arc') % ARCHS.length; const st = 1 + 2 * (hsh(id + '#step') % 4); for (let k = 0; k < ARCHS.length && taken.includes(ARCHS[i]); k++) i = (i + st) % ARCHS.length; return ARCHS[i]; };
const FILL_MIN = { lounge: 60, kitchen: 96, meeting: 78, rec: 92, stair: 70, nook: 64, booths: 50, gym: 76 };
const FILL_A = { meeting: { floor: 'carpet' }, rec: { floor: 'arcade' }, stair: { floor: 'concrete' }, nook: { floor: 'rug' }, gym: { floor: 'rubber' } };
const fillKind = (seed, w, pool, avoid) => { const fit = pool.filter(k => FILL_MIN[k] <= w), ok = fit.filter(k => !avoid.includes(k)), L = ok.length ? ok : fit; return L.length ? L[hsh(seed) % L.length] : 'lounge'; };
/* desk variants per agent id: monitor, chair, desk front and the small things on the desk */
const DV = { lead: { mon: ['std', 'dual', 'ultra', 'laptop', 'std', 'crt'], chair: ['office', 'gaming', 'mesh', 'stool', 'ball', 'office'], front: ['panel', 'panelL', 'open', 'trestle', 'L', 'panel'] },
  kid: { mon: ['std', 'laptop', 'tall', 'tablet'], chair: ['office', 'gaming', 'stool', 'office'], front: ['panel', 'open', 'panel'] } };
function deskOf(id, kind) {
  const T = DV[kind], h = hsh(id + '#desk'), h2 = hsh(id + '#top'), pk = (a, s) => a[(h >>> s) % a.length];
  const v = { mon: pk(T.mon, 0), chair: pk(T.chair, 6), front: pk(T.front, 12) };
  if (v.chair === 'ball') v.front = 'trestle';                 // a ball only reads under an open desk
  if (v.front === 'open' && kind === 'lead') v.chair = 'stool'; // standing desk: a tall drafting stool
  if (kind === 'lead') { v.le = h2 % 3 === 0 && v.mon !== 'dual' && v.mon !== 'ultra' ? 'lamp' : ''; v.tt = ['', 'figure', 'plant', 'duck', 'photo', ''][(h2 >>> 4) % 6]; v.re = ['', 'succulent', 'phones', 'books', 'cactus'][(h2 >>> 8) % 5]; }
  else v.it = ['', 'cactus', 'phones', 'note'][(h2 >>> 4) % 4];
  v.k = v.mon + '/' + v.chair + '/' + v.front;
  return v;
}
const line = (g, x0, y0, x1, y1, c) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1); for (let i = 0; i <= n; i++) PX(g, Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), c); };
const disc = (g, cx, cy, r, c0, c1, c2) => { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) { if (x * x + y * y > r * r + r * .6) continue; const s = x + y; PX(g, cx + x, cy + y, s < -r * .7 ? c2 : s > r * .6 ? c0 : c1); } };
/* 픽셀 오피스 크기: integer device px per art px (crisp). 보통 aims at a ~800 art-px-wide world (half the old default's dot size
   at DPR 1.5); 크게 is at least one step up (about the old default), 작게 one step down, but never below 1 CSS px per art px (the 5 px sign font and the plates stop being readable) */
const officeScale = (devW, dpr, size) => {
  const minS = Math.max(1, Math.ceil(dpr - 0.01)), m = clamp(Math.round(devW / 800), Math.max(minS, Math.ceil(dpr * 1.25 - 0.01)), 8);   // 보통 keeps >= 1.25 CSS px per art px
  return size === 'l' ? clamp(Math.max(Math.round(devW / 460), m + 1), 2, 9) : size === 's' ? clamp(Math.min(Math.round(devW / 1100), m - 1), minS, 8) : m;
};
const Office = {
  S: 3, WD: 480, HD: 400, k: 2.4, stations: [], walks: [], rooms: [], stories: [], planes: [], notes: new Map(), ghosts: new Map(), lastT: -1e9,
  setTheme() { Chars.cache.clear(); this.ghosts.clear(); this.bubbleCache.clear(); this.walkCache = null; this.catCache = null; this.stat = null; this.lastT = -1e9; },
  geo() {
    const D = Chars.dims('lead'), I = Chars.dims('intern');
    const SW = Math.max(72, D.w + 32), cx = SW >> 1, DT = Math.max(D.deskY + 2, 30);
    const IW = Math.max(34, I.w + 10), icx = (IW - 11) >> 1;
    return { D, I, SW, IW, cx, icx, DT, ROWH: DT + 20, WH: 30, TOP: 16,
      L: { ox: cx - D.anchorX, oy: DT - D.deskY, mon: [cx - 33, DT - 19, 18, 16], scr: [cx - 31, DT - 17, 14, 10] },
      K: { ox: icx - I.anchorX, oy: DT - I.deskY, mon: [IW - 12, DT - 12, 10, 9], scr: [IW - 11, DT - 11, 8, 6] } };
  },
  /* per-station geometry: the sprite anchor is shared, the monitor frame (mon), its screen (scr: glow, code texture, state)
     and a dual setup's second screen (scr2) follow the desk variant; top = highest monitor pixel (the done tick sits above it) */
  stGeo(kind, v) {
    const G = this.G, DT = G.DT;
    if (kind === 'lead') {
      const cx = G.cx, M = { std: [[cx - 33, DT - 19, 18, 16], [cx - 31, DT - 17, 14, 10]], dual: [[cx - 33, DT - 17, 17, 14], [cx - 31, DT - 15, 13, 9]], ultra: [[cx - 37, DT - 16, 26, 13], [cx - 36, DT - 15, 24, 9]],
        laptop: [[cx - 31, DT - 18, 15, 11], [cx - 30, DT - 17, 13, 8]], crt: [[cx - 35, DT - 17, 18, 15], [cx - 33, DT - 15, 13, 10]] }[v.mon];
      const scr2 = v.mon === 'dual' ? [cx - 30, DT - 30, 13, 8] : null;
      return { ox: G.L.ox, oy: G.L.oy, mon: M[0], scr: M[1], scr2, top: scr2 ? DT - 31 : M[0][1] };
    }
    const IW = G.IW, M = { std: [[IW - 12, DT - 12, 10, 9], [IW - 11, DT - 11, 8, 6]], laptop: [[IW - 13, DT - 9, 11, 7], [IW - 12, DT - 8, 9, 5]], tall: [[IW - 11, DT - 15, 9, 12], [IW - 10, DT - 14, 7, 9]], tablet: [[IW - 11, DT - 10, 9, 7], [IW - 10, DT - 9, 7, 5]] }[v.mon];
    return { ox: G.K.ox, oy: G.K.oy, mon: M[0], scr: M[1], scr2: null, top: M[0][1] };
  },
  /* ---------- layout: storeys of compact rooms; spare width becomes a lounge, never an empty stretched room ---------- */
  layout() {
    const box = this.host, dpr = window.devicePixelRatio || 1, cssW = Math.max(320, box.clientWidth - 18), devW = Math.floor(cssW * dpr);
    const S = officeScale(devW, dpr, R.S.ofcSize); this.devW = devW; this.dpr = dpr;
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
    let y = ROOF, prevK = [], lastK = [], recentA = [];
    for (const { sv, row } of rowsAll) {
      {
        const used = row.reduce((s2, r) => s2 + r.w, 0) + PW * (row.length - 1);
        let extra = innerW - used;
        const h = Math.max(...row.map(r => r.h));
        const items = row.slice(), si = stories.length, seed = sv.id + ':' + si + ':' + row.map(r => r.p.id).join(',');
        // filler rooms: a pair (kitchen / meeting / rec / nook / gym / booths, then the lounge with the elevator or a stairwell) or one;
        // never a kind from the two storeys above, never two stairwells in a row
        if (extra - PW > 190) { const kw = Math.floor((extra - PW) / 2) - 2, k1 = fillKind(seed + 'a', kw, ['kitchen', 'meeting', 'rec', 'nook', 'gym', 'booths'], prevK.concat(lastK)), k2 = lastK.includes('stair') || prevK.includes('stair') ? 'lounge' : fillKind(seed + 'b', extra - PW - kw - PW, ['lounge', 'lounge', 'stair'], []); items.push({ filler: true, kind: k1, w: kw, h }, { filler: true, kind: k2, w: extra - PW - kw - PW, h }); }
        else if (extra >= 64) items.push({ filler: true, kind: fillKind(seed, extra - PW, ['lounge', 'stair', 'meeting', 'nook', 'booths', 'gym', 'rec', 'lounge'], prevK.concat(lastK)), w: extra - PW, h });
        else { const add = Math.floor(extra / row.length); items.forEach((r, i) => { r.w += add + (i === row.length - 1 ? extra - add * row.length : 0); }); }
        lastK = prevK; prevK = items.filter(r => r.filler).map(r => r.kind);
        // archetypes: never shared on one storey, and spread over the building (the last six rooms are skipped too)
        for (const r of items) if (!r.filler) { r.arch = archOf(r.p.id, recentA); recentA.push(r.arch); if (recentA.length > 6) recentA.shift(); }
        let x = x0;
        const st = { sv, y, h, rooms: [] };
        for (const r of items) {
          const room = { ...r, x, y: y + SLAB, h, i: rooms.length, si };
          rooms.push(room); st.rooms.push(room);
          if (!r.filler) room.spans = [];
          if (!r.filler) room.rowsT.forEach((rt, ri) => {
            const rw = rt.reduce((s2, t) => s2 + t.w, 0);
            let sx = room.x + Math.max(RP, Math.floor((room.w - rw) / 2));
            const sy = room.y + G.TOP + ri * G.ROWH;
            room.spans.push({ x0: sx, x1: sx + rw, y: sy });
            for (const t of rt) {
              const lf = famOf(t.a), dv = deskOf(t.a.id, 'lead');
              stations.push({ n: t.a, kind: 'lead', x: sx, y: sy, room, ph: (hsh(t.a.id) % 997) / 997, lk: Chars.lookOf(t.a.id, lf, 'lead'), dv, o: this.stGeo('lead', dv) });
              t.a.kids.slice(0, 4).forEach((kid, j) => { const kv = deskOf(kid.id, 'kid'); stations.push({ n: kid, kind: 'kid', x: sx + G.SW + G.IW * j, y: sy, room, ph: (hsh(kid.id) % 997) / 997, lk: Chars.lookOf(kid.id, famOf(kid), 'intern', famOf(kid) === lf ? t.a.id : null), dv: kv, o: this.stGeo('kid', kv) }); });
              sx += t.w;
            }
          });
          x += room.w + PW;
        }
        stories.push(st);
        y += SLAB + h;
      }
    }
    this.groundY = y; this.LOBBY = 22; this.HD = y + SLAB + this.LOBBY + 26;   // street level: a closed facade with the entrance, then the street
    this.rooms = rooms; this.stories = stories; this.stations = stations; this.walks = [];
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
    this.planWalks();
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
    const gy = this.groundY + B.SLAB, sy0 = gy + this.LOBBY;   // gy: top of the street-level facade, sy0: the pavement
    F(g, 0, sy0, WD, HD - sy0, P.ground[1]); F(g, 0, sy0, WD, 1, P.ground[0]); F(g, 0, sy0 + 6, WD, HD - sy0 - 6, P.ground[2]); F(g, 0, sy0 + 6, WD, 1, mixc(P.ground[1], P.ground[2], .5));
    for (let x = 2; x < WD; x += 5) { PX(g, x, sy0 - 1, P.ground[1]); PX(g, x + 2, sy0 - 2, P.ground[0]); }
    for (let x = 0; x < WD; x += 12) F(g, x, sy0 + 12, 6, 1, mixc(P.ground[2], 0xFFFFFF, .12));
    const ext = P.ext, bx0 = B.BX, bx1 = B.X1 + B.BW;
    F(g, bx0, B.ROOF - 6, bx1 - bx0, sy0 - B.ROOF + 9, ext[1]);
    const brick = P.decor === 'claude' || P.decor === 'muse';
    for (let y = B.ROOF - 6; y < sy0 + 3; y++) {
      if (brick ? y % 4 === 0 : y % 12 === 0) F(g, bx0, y, bx1 - bx0, 1, ext[0]);
      else for (let x = bx0 + (brick ? (Math.floor(y / 4) % 2) * 4 : 0); x < bx1; x += brick ? 8 : 24) PX(g, x, y, ext[0]);
    }
    F(g, bx0, B.ROOF - 6, 1, sy0 - B.ROOF + 9, ext[3]); F(g, bx1 - 1, B.ROOF - 6, 1, sy0 - B.ROOF + 9, ext[0]);
    F(g, bx0 - 2, B.ROOF - 9, bx1 - bx0 + 4, 3, ext[3]); F(g, bx0 - 2, B.ROOF - 6, bx1 - bx0 + 4, 1, ext[0]);
    this.xlights = [];   // exterior lights (street lamps, entrance): glow + bloom only
    this.rooftop(g, P);
    const FD = { kitchen: 'drawKitchen', lounge: 'drawLounge', meeting: 'drawMeeting', rec: 'drawRec', stair: 'drawStair', nook: 'drawNook', booths: 'drawBooths', gym: 'drawGym' };
    for (const st of this.stories) { this.slab(g, P, st.y, bx0 + B.BW, bx1 - B.BW); for (const room of st.rooms) room.filler ? this[FD[room.kind] || 'drawLounge'](g, P, room, rr) : this.drawRoom(g, P, room, rr); }
    this.slab(g, P, this.groundY, bx0 + B.BW, bx1 - B.BW);
    this.lobby(g, P, gy, sy0);
    // away version of each desk's chair corner (pushed-back chair over the bare floor), pasted while the agent is on a walk;
    // an open desk front shows the chair base too, so its patch reaches down to the floor
    const [, scratch] = mkc(1, 1);
    for (const s2 of this.order) {
      const L = s2.kind === 'lead', op = s2.dv.front === 'open' || s2.dv.front === 'trestle', r = L ? [s2.x + G.cx - 13, s2.y + G.DT - 32, 30, op ? 48 : 32] : [s2.x + G.icx - 9, s2.y + G.DT - 21, 22, op ? 35 : 21], [pc, pg] = mkc(r[2], r[3]);
      pg.drawImage(c, r[0], r[1], r[2], r[3], 0, 0, r[2], r[3]); pg.translate(-r[0], -r[1]);
      L ? this.leadDesk(pg, scratch, P, s2, true) : this.kidDesk(pg, scratch, P, s2, true);
      s2.patch = pc; s2.pr = r;
    }
    for (const s2 of this.order) s2.kind === 'lead' ? this.leadDesk(g, frg, P, s2) : this.kidDesk(g, frg, P, s2);
    // night: one clean ambient multiply over the interiors (no noise), then emissive pixels stay bright
    if (P.night) {
      for (const r of this.rooms) { g.globalCompositeOperation = 'multiply'; F(g, r.x, r.y, r.w, r.h, P.amb); g.globalCompositeOperation = 'source-over'; }
      for (const s2 of this.order) { const pg = s2.patch.getContext('2d'); pg.setTransform(1, 0, 0, 1, 0, 0); pg.globalCompositeOperation = 'multiply'; F(pg, 0, 0, s2.patch.width, s2.patch.height, P.amb); pg.globalCompositeOperation = 'source-over'; }
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
      for (const [lx, ly, lc] of room.lamps || []) { glow(lsg, lx, ly, 30, lc || P.lamp, N ? .4 : .12); glow(lsg, lx, room.y + G.WH + 16, 40, lc || P.lamp, N ? .5 : .08, .38); }
      for (const [lx, ly, col, r, a] of room.lights || []) glow(lsg, lx, ly, r, col, N ? a : a * .4);
      for (const [wx, ww, dim] of room.wins || []) {   // window shafts (closed blinds let a third through)
        const X = room.x + wx, top = room.y + 20, bot = room.y + room.h, k = dim ? .35 : 1;
        const lgr = lsg.createLinearGradient(0, top, 0, bot); lgr.addColorStop(0, N ? rgba(0xA8C0FF, .10 * k) : rgba(0xFFF0C8, .30 * k)); lgr.addColorStop(1, rgba(N ? 0xA8C0FF : 0xFFF0C8, 0));
        lsg.fillStyle = lgr; lsg.beginPath(); lsg.moveTo(X, top); lsg.lineTo(X + ww, top); lsg.lineTo(X + ww - 18, bot); lsg.lineTo(X - 22, bot); lsg.closePath(); lsg.fill();
        glow(lsg, X + ww / 2, room.y + 12, 22, N ? 0x9AB4FF : 0xFFF4D8, (N ? .12 : .25) * k);
      }
      for (const [sx, sw] of room.sky || []) {   // skylight shafts, straight down and a little slanted
        const top = room.y + 2, bot = room.y + room.h, lgr = lsg.createLinearGradient(0, top, 0, bot);
        lgr.addColorStop(0, N ? rgba(0xA8C0FF, .12) : rgba(0xFFF4D0, .4)); lgr.addColorStop(1, rgba(N ? 0xA8C0FF : 0xFFF4D0, 0));
        lsg.fillStyle = lgr; lsg.beginPath(); lsg.moveTo(sx, top); lsg.lineTo(sx + sw, top); lsg.lineTo(sx + sw - 12, bot); lsg.lineTo(sx - 16, bot); lsg.closePath(); lsg.fill();
      }
      lsg.restore();
    }
    for (const [lx, ly, col, r, a] of this.xlights) glow(lsg, lx, ly, r, col, N ? a : a * .25);
    // emitter mask (quarter res): only true light sources bloom (bulbs, lit signs, emissive pixels); never sprites or pale materials
    const [esc, esg] = mkc(Math.ceil(WD / 4), Math.ceil(HD / 4)); this.emStatic = esc; esg.imageSmoothingEnabled = true; esg.scale(.25, .25);
    for (const room of this.rooms) for (const [lx, ly, lc] of room.lamps || []) glow(esg, lx, ly, 4, lc || P.lamp, N ? .6 : .2);
    if (N) for (const [lx, ly, col] of this.xlights) glow(esg, lx, ly, 3, col, .7);
    if (N) for (const [x, y, w, h, col] of this.emit) { esg.fillStyle = rgba(col, .45); esg.fillRect(x, y, w, h); }
    // dust motes live in the light (window / skylight shafts by day, lamp cones by night)
    this.motes = [];
    for (const room of this.rooms) {
      const r3 = srand(room.i * 77 + 3), w0 = (room.wins || [])[0], s0 = (room.sky || [])[0];
      const srcs = N ? (room.lamps || []).map(([lx]) => [lx - 14, room.y + 10, 28, room.h - 16]) : w0 ? [[room.x + w0[0] - 10, room.y + 22, w0[1] + 10, room.h - 26]] : s0 ? [[s0[0] - 8, room.y + 6, s0[1] + 4, room.h - 10]] : [];
      for (const [x, y2, w, h] of srcs) for (let i = 0; i < 7; i++) this.motes.push({ x: x + r3() * w, y: y2 + r3() * h, w, h, x0: x, y0: y2, s: .4 + r3() * .8, ph: r3() * 6.28 });
    }
    // screen code texture (scrolls)
    const [tc, tg] = mkc(32, 64); this.codeTex = tc; F(tg, 0, 0, 32, 64, P.scr);   // 32 wide: an ultrawide screen shows longer lines
    const r2 = srand(77);
    for (let y = 0; y < 64; y += 2) { let x = (r2() < .3 ? 2 : 0) + (r2() < .2 ? 2 : 0); while (x < 31) { const w = 1 + Math.floor(r2() * 4); F(tg, x, y, Math.min(w, 32 - x), 1, P.code[Math.floor(r2() * 3)]); x += w + 1; if (r2() < (x > 13 ? .12 : .25)) break; } }
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
    this.roofExtras(g, P, sx + tw + 11);
  },
  /* roof extras between the AGEN TALK sign and the planters, by building width: solar panels, raised garden beds, a dish */
  roofExtras(g, P, x0) {
    const B = this.B, y = B.ROOF - 9, x1 = B.X1 + B.BW - 116, n = c => nightc(P, c), M = P.metal, free = x1 - x0 - 10;
    if (free < 24) return;
    let x = x0 + 10;
    const np = Math.min(6, Math.floor((free - (free > 120 ? 40 : 0)) / 18));
    for (let i = 0; i < np; i++, x += 18) {   // tilted panels: cell grid, a glint by day
      F(g, x + 2, y - 3, 1, 3, n(M[1])); F(g, x + 12, y - 5, 1, 5, n(M[1])); F(g, x + 2, y - 1, 11, 1, n(M[0]));
      for (let r = 0; r < 4; r++) F(g, x + r, y - 8 + r, 15 - r, 1, n(r % 2 ? 0x2A4A7A : 0x34588A)); F(g, x + 4, y - 8, 1, 4, n(0x5A7AAA)); F(g, x + 9, y - 8, 1, 4, n(0x5A7AAA)); F(g, x, y - 9, 15, 1, n(M[3]));
      if (!P.night) PX(g, x + 2, y - 8, 0xFFFFFF);
    }
    if (x1 - x > 36) {   // raised garden beds with flowers
      for (let k = 0; k < (x1 - x > 64 ? 2 : 1); k++, x += 22) { F(g, x, y - 5, 18, 5, n(P.desk[1])); F(g, x, y - 5, 18, 1, n(P.desk[3])); F(g, x + 1, y - 6, 16, 1, n(P.plant[0]));
        for (let i = 0; i < 6; i++) { PX(g, x + 2 + i * 3, y - 7 - (i % 2), n(P.plant[2])); PX(g, x + 2 + i * 3, y - 8 - (i % 2), n([0xFF7AB0, 0xFFC857, 0xF4F4F0, P.acc[2]][(i + k) % 4])); } }
    }
    if (x1 - x > 14 && hsh(String(B.innerW)) % 2) { F(g, x + 5, y - 6, 1, 6, n(M[2])); for (let i = 0; i < 4; i++) F(g, x + 1 + i, y - 11 + i, 7 - i * 2 > 0 ? 7 - i * 2 : 1, 1, n(M[3])); PX(g, x + 7, y - 12, n(M[1])); }   // satellite dish
  },
  /* street level: a closed facade under the bottom slab: glass entrance under an awning in the theme accent, shop-front
     windows (lit at night), planters, street lamps at the corners, a bike rack. Exterior, so night colours go through nightc */
  lobby(g, P, y0, y1) {
    const B = this.B, bx0 = B.BX, bx1 = B.X1 + B.BW, M = P.metal, A = P.acc, N = P.night, n = c => nightc(P, c), E = this.emit, X = this.xlights;
    F(g, bx0, y1 - 3, bx1 - bx0, 3, P.slab[1]); F(g, bx0, y1 - 3, bx1 - bx0, 1, P.slab[2]); F(g, bx0, y0, bx1 - bx0, 1, mixc(P.ext[0], 0, .3));
    const ew = 26, ex = bx0 + Math.max(30, Math.floor((bx1 - bx0) * .28)), warm = 0xF2D8A0, glass = n(mixc(P.win[0], P.win[1], .5));
    // shop-front windows, either side of the door
    for (let wx = bx0 + 14, k = 0; wx + 22 < bx1 - 14; wx += 38, k++) {   // windows (some lit at night, some with blinds down), now and then a bench under a poster
      if (wx + 22 > ex - 12 && wx < ex + ew + 12) continue;
      const h2 = hsh(k + 'lw' + (bx1 - bx0));
      if (h2 % 5 === 0) { F(g, wx + 6, y0 + 5, 10, 8, n(P.wall[3])); F(g, wx + 7, y0 + 6, 8, 3, n(A[1])); F(g, wx + 7, y0 + 10, 6, 1, n(M[1])); F(g, wx + 2, y1 - 7, 18, 2, n(P.desk[2])); F(g, wx + 3, y1 - 5, 1, 2, n(M[0])); F(g, wx + 18, y1 - 5, 1, 2, n(M[0])); continue; }
      F(g, wx - 1, y0 + 4, 24, 13, n(M[1]));
      if (N && h2 % 3) { F(g, wx, y0 + 5, 22, 11, 0x5A4434); E.push([wx, y0 + 5, 22, 1, warm]); F(g, wx + 3 + (h2 % 5), y0 + 11, 4, 5, 0x2A2220); F(g, wx + 14, y0 + 9 + (h2 % 3), 5, 7 - (h2 % 3), 0x2A2220); X.push([wx + 11, y0 + 10, warm, 18, .35]); }
      else if (N) { F(g, wx, y0 + 5, 22, 11, n(P.win[0])); for (let yy = y0 + 6; yy < y0 + 16; yy += 2) F(g, wx, yy, 22, 1, n(mixc(P.trim[2], P.win[0], .4))); }
      else { vramp(g, wx, y0 + 5, 22, 11, [P.win[0], P.win[1]]); line(g, wx + 3, y0 + 14, wx + 9, y0 + 6, mixc(P.win[1], 0xFFFFFF, .5)); if (h2 % 4 === 1) for (let yy = y0 + 5; yy < y0 + 10; yy += 2) F(g, wx, yy, 22, 1, mixc(P.trim[3], 0xFFFFFF, .3)); }
      F(g, wx + 11, y0 + 5, 1, 11, n(M[1])); F(g, wx - 2, y0 + 16, 26, 1, n(M[3]));
    }
    // entrance: double glass doors, awning, a lit house plaque, planters
    F(g, ex - 1, y0 + 4, ew + 2, y1 - y0 - 7, n(M[1])); F(g, ex, y0 + 5, ew, y1 - y0 - 8, N ? 0x6A5440 : glass); F(g, ex + 12, y0 + 5, 2, y1 - y0 - 8, n(M[1]));
    PX(g, ex + 10, y0 + 11, n(M[3])); PX(g, ex + 15, y0 + 11, n(M[3])); if (N) { E.push([ex, y0 + 5, ew, 1, warm]); X.push([ex + ew / 2, y0 + 10, warm, 26, .5]); } else line(g, ex + 2, y0 + 15, ex + 8, y0 + 7, mixc(P.win[1], 0xFFFFFF, .5));
    for (let x = ex - 4; x < ex + ew + 4; x++) { const st = ((x - ex + 4) >> 2) % 2; F(g, x, y0 + 1, 1, 3, n(st ? A[1] : mixc(A[1], 0xFFFFFF, .65))); if ((x - ex) % 4 === 0) PX(g, x + 1, y0 + 4, n(A[1])); }
    F(g, ex - 4, y0, ew + 8, 1, n(mixc(A[0], 0, .2)));
    F(g, ex + ew + 4, y0 + 7, 9, 6, n(M[0])); drawText(g, 'AT', ex + ew + 5, y0 + 8, N ? A[3] : 0xF4F4F0, null); if (N) X.push([ex + ew + 8, y0 + 10, A[3], 8, .4]);
    for (const px of [ex - 9, ex + ew + 4]) { F(g, px, y1 - 9, 6, 6, n(P.pot[1])); F(g, px, y1 - 9, 6, 1, n(P.pot[2])); for (let i = 0; i < 4; i++) { PX(g, px + 1 + i, y1 - 10 - (i % 2), n(P.plant[2])); PX(g, px + i + (i > 1 ? 1 : 0), y1 - 12 + (i % 2), n(P.plant[i % 2 ? 3 : 1])); } }
    // street lamps on the pavement at both corners, a bike rack with a bike near the right one
    for (const lx of [bx0 + 4, bx1 - 5]) { F(g, lx, y1 - 20, 1, 24, n(M[0])); F(g, lx - 1, y1 + 3, 3, 1, n(M[0])); F(g, lx - 2, y1 - 22, 5, 2, n(M[1])); F(g, lx - 1, y1 - 20, 3, 1, N ? 0xFFE6A8 : n(M[3])); if (N) { E.push([lx - 1, y1 - 20, 3, 1, 0xFFE6A8]); X.push([lx, y1 - 18, 0xFFD890, 30, .55]); } }
    const rk = bx1 - 40;
    if (rk > ex + ew + 20) { for (let k = 0; k < 3; k++) { F(g, rk + k * 5, y1 - 2, 1, 5, n(M[2])); F(g, rk + k * 5 + 3, y1 - 2, 1, 5, n(M[2])); F(g, rk + k * 5 + 1, y1 - 3, 2, 1, n(M[2])); }
      const bc = n(A[1]), wc = n(M[0]); for (const wx2 of [rk + 2, rk + 11]) { for (let a2 = 0; a2 < 12; a2++) PX(g, Math.round(wx2 + Math.cos(a2 * .52) * 3), Math.round(y1 + 1 + Math.sin(a2 * .52) * 3), wc); }
      line(g, rk + 2, y1 + 1, rk + 6, y1 - 3, bc); line(g, rk + 6, y1 - 3, rk + 11, y1 + 1, bc); line(g, rk + 6, y1 - 3, rk + 9, y1 - 3, bc); line(g, rk + 2, y1 + 1, rk + 7, y1 + 1, bc); F(g, rk + 5, y1 - 5, 3, 1, wc); F(g, rk + 9, y1 - 5, 2, 1, wc); }
  },
  slab(g, P, y, x0, x1) {
    const s = P.slab, SL = this.B.SLAB, X = x0 - this.B.BW, W = x1 - x0 + 2 * this.B.BW;
    F(g, X, y, W, SL, s[1]); F(g, X, y, W, 1, s[2]); F(g, X, y + SL - 1, W, 1, s[0]); F(g, X, y + SL - 2, W, 1, mixc(s[0], s[1], .5));
    F(g, x0, y + 5, x1 - x0, 1, mixc(s[0], P.acc[0], .35));
    for (let x = x0 + 6; x < x1; x += 16) { PX(g, x, y + 4, s[2]); PX(g, x, y + 6, s[0]); }
  },
  /* ---------- rooms: each one tells a little story ---------- */
  walls(g, P, W, H, rr, A) {   // A: archetype (wall treatment + floor pattern over the theme's wallpaper and ramps)
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
    if (A && A.wall) this.wallArch(g, P, W, A.wall);
    F(g, 0, WH - 2, W, 2, t[0]); F(g, 0, WH - 2, W, 1, t[d === 'codex' || d === 'muse' ? 2 : 1]);
    F(g, 0, WH - 4, W, 1, mixc(t[0], 0, .3)); for (let x = 30; x < W - 10; x += 70) { F(g, x, WH - 7, 4, 4, 0xF2EEE6); PX(g, x + 1, WH - 6, 0x6A6A6A); PX(g, x + 2, WH - 6, 0x6A6A6A); }
    F(g, 0, WH, W, H - WH, f[2]);
    if (A && A.floor && A.floor !== 'rug') this.floorArch(g, P, W, H, A.floor);
    else if (d === 'claude') for (let y = WH; y < H; y += 4) { // oak planks: seams, staggered joints, a few deliberate grain strokes per plank
      F(g, 0, y + 3, W, 1, mixc(f[2], f[1], .75)); const off = ((y - WH) >> 2) * 13 % 29;
      for (let x = off - 29; x < W; x += 29) { F(g, x, y, 1, 3, mixc(f[2], f[0], .45)); const gx = x + 5 + (hsh(x + ',' + y) % 14); F(g, gx, y + 1, 4 + (hsh(y + ',' + x) % 4), 1, mixc(f[2], f[1], .35)); if ((x + y) % 3 === 0) F(g, x + 2, y, 25, 1, mixc(f[2], f[3], .22)); }
    }
    else if (d === 'codex') { for (let x = 0; x < W; x += 32) F(g, x, WH, 1, H - WH, mixc(f[2], f[1], .45)); for (let y = WH + 16; y < H; y += 16) F(g, 0, y, W, 1, mixc(f[2], f[1], .45)); for (let y = WH; y < H; y += 16) for (let x = 0; x < W; x += 32) { F(g, x + 1, y + 1, 31, 1, mixc(f[2], f[3], .33)); if (hsh(x + '/' + y) % 3 === 0) F(g, x + 1, y + 2, 31, 13, mixc(f[2], f[3], .15)); } F(g, 0, WH + 1, W, 2, mixc(f[2], f[3], .5)); }
    else if (d === 'gemini') { const s1 = mixc(f[2], f[1], .72), s3 = mixc(f[2], f[3], .65), sa = mixc(f[2], P.acc[2], .55); for (let y = WH; y < H; y += 8) F(g, 0, y, W, 1, s1); for (let x = 0; x < W; x += 16) F(g, x, WH, 1, H - WH, s1); for (let y = WH; y < H; y += 8) for (let x = 0; x < W; x += 16) { F(g, x + 1, y + 1, 14, 1, s3); PX(g, x, y, sa); } }
    else if (d === 'grok') for (let y = WH; y < H; y += 12) for (let x = ((y - WH) / 12 % 2) * 12 - 12; x < W; x += 24) { // steel floor plates, seams + corner bolts
      const bolt = mixc(f[2], f[3], .55); F(g, x, y, 24, 12, hsh(x + '|' + y) % 2 ? f[2] : mixc(f[2], f[1], .25)); F(g, x, y, 24, 1, mixc(f[2], f[3], .4)); F(g, x, y, 1, 12, mixc(f[2], f[0], .7)); F(g, x, y + 11, 24, 1, mixc(f[2], f[1], .75)); PX(g, x + 2, y + 2, bolt); PX(g, x + 21, y + 2, bolt); PX(g, x + 2, y + 9, bolt); PX(g, x + 21, y + 9, bolt);
    }
    else if (d === 'muse') for (let x = 0; x < W; x += 7) { F(g, x, WH, 1, H - WH, mixc(f[2], f[1], .75)); F(g, x + 1, WH, 6, H - WH, (x / 7) % 3 === 1 ? f[3] : f[2]); const cut = WH + 6 + ((x * 13) % 23); F(g, x + 1, cut, 6, 1, f[1]); }
    if (A && A.floor === 'rug') this.rug(g, P, W, H);
    F(g, 0, WH, W, 1, mixc(f[2], f[0], .75)); F(g, 0, WH + 1, W, 1, mixc(f[2], f[0], .45)); F(g, 0, WH + 2, W, 1, mixc(f[2], f[0], .2));
    dith(g, 0, 0, 2, H, mixc(w[0], 0, .35), .35); dith(g, W - 3, 0, 3, H, mixc(w[0], 0, .35), .45);
  },
  /* archetype wall treatments: drawn over the theme wallpaper (the top of the wall keeps the theme), under the baseboard */
  wallArch(g, P, W, kind) {
    const WH = this.G.WH, w = P.wall, t = P.trim, D = P.desk, M = P.metal, a = P.acc;
    if (kind === 'wainscot') { const y0 = WH - 12; F(g, 0, y0, W, 10, D[1]); F(g, 0, y0, W, 1, D[3]); F(g, 0, y0 + 1, W, 1, D[2]); for (let x = 4; x < W; x += 14) { F(g, x, y0 + 3, 10, 6, mixc(D[1], D[0], .3)); F(g, x, y0 + 3, 10, 1, D[0]); F(g, x, y0 + 8, 10, 1, D[2]); F(g, x + 9, y0 + 4, 1, 4, D[2]); } F(g, 0, 7, W, 1, mixc(w[2], t[1], .55)); F(g, 0, 8, W, 1, mixc(w[2], w[3], .5)); }
    if (kind === 'tiles') { const c0 = mixc(w[3], 0xFFFFFF, .5), gr = mixc(w[2], w[1], .3), band = mixc(a[2], c0, .3); F(g, 0, 8, W, 1, mixc(w[2], w[0], .35)); for (let y = 9; y < WH - 2; y += 4) { F(g, 0, y, W, 3, y === 17 ? band : c0); F(g, 0, y + 3, W, 1, gr); for (let x = 0; x < W; x += 5) { F(g, x, y, 1, 3, gr); PX(g, x + 1, y, mixc(c0, 0xFFFFFF, .5)); } } }
    if (kind === 'panels') { const b = mixc(w[1], M[1], .62), hi = mixc(b, w[3], .16), lo = mixc(b, M[0], .45); F(g, 0, 3, W, WH - 3, b); for (let x = 0; x < W; x += 20) { F(g, x, 3, 1, WH, lo); F(g, x + 1, 3, 1, WH, hi); } F(g, 0, 17, W, 1, lo); F(g, 0, 18, W, 1, hi);
      for (let x = 10; x < W - 10; x += 40) for (let k = 0; k < 3; k++) F(g, x, 21 + k * 2, 6, 1, M[0]);
      F(g, 0, 3, W, 1, M[2]); F(g, 0, 6, W, 1, M[2]); for (let x = 3; x < W; x += 6) F(g, x, 4, 1, 2, M[1]); F(g, 0, 4, W, 1, mixc(a[1], b, .45)); F(g, 0, 5, W, 1, mixc(0x3A6AD0, b, .4)); }   // cable tray along the top
    if (kind === 'glass') { // atrium glazing: sky, a far garden, mullions every 16, a low wall with a planted sill
      vramp(g, 0, 3, W, 16, [P.win[0], P.win[1]]); const fo = mixc(P.plant[1], P.win[1], .45), fo2 = mixc(P.plant[2], P.win[1], .5);
      for (let x = 0; x < W; x += 9) { const hh = 3 + (hsh(x + 'gl') % 4); F(g, x + 1, 19 - hh, 7, hh, fo); F(g, x, 20 - hh, 9, hh - 1, fo); PX(g, x + 3, 19 - hh, fo2); }
      if (!P.night) for (let x = 6; x < W; x += 32) for (let k = 0; k < 5; k++) PX(g, x + k, 12 - k, mixc(P.win[1], 0xFFFFFF, .55));
      for (let x = 0; x < W; x += 16) { F(g, x, 3, 2, 16, t[1]); F(g, x, 3, 1, 16, t[2]); } F(g, 0, 3, W, 1, t[0]); F(g, 0, 11, W, 1, t[1]);
      F(g, 0, 19, W, WH - 19, mixc(w[1], t[1], .4)); F(g, 0, 19, W, 1, t[3]); F(g, 0, 20, W, 1, t[1]);
      for (let x = 5; x < W; x += 11) { PX(g, x, 18, P.plant[2]); PX(g, x + 1, 17, P.plant[3]); PX(g, x + 2, 18, P.plant[1]); } }
    if (kind === 'brick' || kind === 'brickhi') { const y0 = kind === 'brick' ? 15 : 9, bc = mixc(w[1], P.pot[1], .5), mo = mixc(w[3], bc, .3);
      F(g, 0, y0, W, WH - 2 - y0, mo); for (let y = y0; y < WH - 3; y += 4) for (let x = ((y - y0) / 4 % 2) * 4 - 4; x < W; x += 8) { const tn = hsh(x + 'b' + y) % 4; F(g, x, y + 1, 7, 3, tn === 0 ? mixc(bc, 0, .12) : tn === 1 ? mixc(bc, 0xFFFFFF, .1) : bc); F(g, x, y + 1, 7, 1, mixc(bc, 0xFFFFFF, .18)); }
      F(g, 0, y0, W, 1, mixc(w[2], w[0], .4)); }
    if (kind === 'slats') { const b = mixc(w[1], t[0], .55), s1 = mixc(b, 0xFFFFFF, .1), s0 = mixc(b, 0, .25); F(g, 0, 3, W, WH - 3, b); for (let x = 0; x < W; x += 4) { F(g, x, 3, 1, WH, s0); F(g, x + 1, 3, 1, WH, s1); } F(g, 0, WH - 6, W, 1, s0); }
    if (kind === 'stripes') { const y0 = 12; F(g, 0, y0 - 1, W, 1, mixc(w[2], w[0], .3)); [a[0], a[1], a[2], a[3]].forEach((c, i) => F(g, 0, y0 + i * 2, W, 2, mixc(c, w[2], .15))); F(g, 0, y0 + 8, W, 1, mixc(w[2], w[0], .3)); }
  },
  /* archetype floors: patterns change, colours stay on the theme's floor ramp (mixed toward metal / wall / pot where the material asks) */
  floorArch(g, P, W, H, kind) {
    const WH = this.G.WH, f = P.floor, M = P.metal, a = P.acc;
    if (kind === 'tile') { const c0 = mixc(f[3], P.wall[3], .55), c1 = mixc(c0, f[2], .22), gr = mixc(f[2], f[1], .35); for (let y = WH; y < H; y += 6) for (let x = 0; x < W; x += 12) { F(g, x, y, 12, 6, ((x / 12) + (y - WH) / 6) % 2 ? c0 : c1); F(g, x, y, 12, 1, mixc(c0, 0xFFFFFF, .3)); F(g, x, y + 5, 12, 1, gr); F(g, x + 11, y, 1, 6, gr); } }
    if (kind === 'raised') { const c0 = mixc(f[1], M[2], .55), hi = mixc(c0, M[3], .35), lo = mixc(c0, M[0], .5); for (let y = WH; y < H; y += 6) for (let x = 0; x < W; x += 12) { F(g, x, y, 12, 6, c0); F(g, x, y, 12, 1, hi); F(g, x, y + 5, 12, 1, lo); F(g, x + 11, y, 1, 6, lo); if (((x / 12) + (y - WH) / 3) % 4 === 1) for (let dx = 2; dx < 10; dx += 2) { PX(g, x + dx, y + 2, lo); PX(g, x + dx + 1, y + 3, lo); } } }
    if (kind === 'pavers') { const b = mixc(f[2], P.pot[1], .3), j = mixc(b, P.plant[0], .5); F(g, 0, WH, W, H - WH, j);   // flagstones of uneven width, mossy joints
      for (let y = WH + 1, r = 0; y < H; y += 7, r++) { let x = -(hsh('r' + r) % 9); while (x < W) { const w = 10 + hsh(x + 'f' + r) % 7, tn = hsh(x + 'p' + r) % 3, c = tn === 0 ? b : tn === 1 ? mixc(b, 0xFFFFFF, .1) : mixc(b, 0, .08); F(g, x + 1, y, w - 2, 6, c); F(g, x, y + 1, w, 4, c); F(g, x + 1, y, w - 2, 1, mixc(c, 0xFFFFFF, .18)); x += w + 1; } } }
    if (kind === 'concrete') { const b = mixc(f[2], M[2], .45), lo = mixc(b, 0, .2), hi = mixc(b, 0xFFFFFF, .1); F(g, 0, WH, W, H - WH, b); F(g, 0, WH + 3, W, 6, hi); for (let x = 24; x < W; x += 48) F(g, x, WH, 1, H - WH, lo); F(g, 0, WH + 20, W, 1, lo);
      for (let x = 12; x < W; x += 61) { let cy = WH + 8 + (x % 9), cx = x; for (let k = 0; k < 9; k++) { PX(g, cx, cy, lo); cx += 1; cy += (hsh(x + 'c' + k) % 3) - 1; } } }
    if (kind === 'carpet') { const b = mixc(f[1], P.trim[0], .45), b2 = mixc(b, 0xFFFFFF, .06), se = mixc(b, 0, .18); for (let y = WH; y < H; y += 8) for (let x = 0; x < W; x += 16) { F(g, x, y, 16, 8, ((x / 16) + (y - WH) / 8) % 2 ? b : b2); F(g, x, y, 16, 1, se); F(g, x, y, 1, 8, se); } }
    if (kind === 'checker') { const c0 = mixc(f[3], 0xFFFFFF, .25), c1 = mixc(f[2], P.trim[0], .25); for (let y = WH; y < H; y += 5) for (let x = 0; x < W; x += 8) F(g, x, y, 8, 5, ((x / 8) + (y - WH) / 5) % 2 ? c0 : c1); for (let y = WH; y < H; y += 5) F(g, 0, y, W, 1, mixc(c0, c1, .3)); }
    if (kind === 'arcade') { const b = mixc(mixc(f[1], f[0], .5), a[0], .3), cs = [a[2], a[3], P.books[1 % P.books.length], 0xFFC857]; F(g, 0, WH, W, H - WH, b);   // arcade carpet: a calm base, sparse motifs
      for (let y = WH + 3, r = 0; y < H; y += 9, r++) for (let x = (r % 2) * 7 + 2, k = r; x < W; x += 14, k++) { const c = mixc(cs[k % 4], b, .5); if (k % 3 === 0) { PX(g, x + 1, y, c); F(g, x, y + 1, 3, 1, c); } else if (k % 3 === 1) { PX(g, x, y, c); PX(g, x + 1, y + 1, c); PX(g, x + 2, y, c); PX(g, x + 3, y + 1, c); } else { F(g, x + 1, y, 1, 3, c); F(g, x, y + 1, 3, 1, c); } } }
    if (kind === 'rubber') { const b = mixc(f[0], M[0], .5), se = mixc(b, 0, .3), hi = mixc(b, 0xFFFFFF, .08); F(g, 0, WH, W, H - WH, b); for (let y = WH; y < H; y += 8) for (let x = 0; x < W; x += 16) { F(g, x, y, 16, 1, se); F(g, x, y, 1, 8, se); F(g, x + 1, y + 1, 15, 1, hi); PX(g, x + 7, y, b); PX(g, x + 8, y - 1, se); } }
  },
  rug(g, P, W, H) {   // studio: a big bordered rug, most of it under the desks; what shows between them reads as the room
    const WH = this.G.WH, a = P.acc, x0 = 6, y0 = WH + 5, w = W - 12, h = H - y0 - 3, b = mixc(a[0], P.floor[1], .4), bd = mixc(a[1], P.floor[2], .3), ln = mixc(a[2], P.floor[3], .35);
    F(g, x0, y0, w, h, bd); F(g, x0 + 2, y0 + 2, w - 4, h - 4, b); F(g, x0 + 3, y0 + 3, w - 6, 1, ln); F(g, x0 + 3, y0 + h - 4, w - 6, 1, ln); F(g, x0 + 3, y0 + 3, 1, h - 6, ln); F(g, x0 + w - 4, y0 + 3, 1, h - 6, ln);
    for (let x = x0 + 12; x < x0 + w - 10; x += 16) { const cy = y0 + (h >> 1); PX(g, x, cy - 2, ln); PX(g, x - 1, cy - 1, ln); PX(g, x + 1, cy - 1, ln); PX(g, x - 2, cy, ln); PX(g, x + 2, cy, ln); PX(g, x - 1, cy + 1, ln); PX(g, x + 1, cy + 1, ln); PX(g, x, cy + 2, ln); }
    for (let x = x0; x < x0 + w; x += 2) { PX(g, x, y0 - 1, ln); PX(g, x, y0 + h, ln); }   // fringe
  },
  /* windows: std (24), wide (40, two mullions), double (two of 17), blinds (std, closed slats: a third of the light), none.
     Gemini keeps its portholes (one, or two for wide / double). Fills room.wins (light shafts) and room.weathers (rain on the glass) */
  window(g, P, W, room, st) {
    const d = P.decor, t = P.trim, kind = { claude: 'rain', codex: P.night ? 'snow' : 'none', gemini: 'star', grok: 'rain', muse: 'snow' }[d];
    room.wins = []; room.weathers = [];
    if (st === 'none') { room.win = null; return W - 24; }
    if (d === 'gemini') { const n = st === 'wide' || st === 'double' ? 2 : 1, x0 = W - 24 - 15 * n - 4 * (n - 1); for (let i = 0; i < n; i++) { const wx = x0 + i * 19; this.porthole(g, P, wx + 7, 13, 7); room.wins.push([wx, 15, st === 'blinds']); room.weathers.push({ x: wx, w: 15, kind: st === 'blinds' ? 'none' : 'star', circ: true }); if (st === 'blinds') for (let y = 7; y < 20; y += 2) F(g, wx + 1, y, 13, 1, mixc(t[3], 0xFFFFFF, .3)); } room.win = room.wins[0]; return x0; }
    const frame = d === 'grok' ? P.metal[1] : t[2];
    const one = (wx, ww, first, blinds) => {
      F(g, wx - 1, 3, ww + 2, 17, frame); vramp(g, wx, 4, ww, 15, [P.win[0], P.win[1]]);
      if (P.night) { this.emit.push([room.x + wx + 4, room.y + 7, 1, 1, 0xFFFFFF], [room.x + wx + ww - 9, room.y + 10, 1, 1, 0xDDE4FF]); if (first) this.emit.push([room.x + wx + ww - 7, room.y + 5, 3, 3, 0xF4EED8]); }
      else F(g, wx + 3, 12, Math.min(8, ww - 6), 2, mixc(P.win[1], 0xFFFFFF, .6));
      if (ww >= 36) { F(g, wx + Math.floor(ww / 3), 4, 1, 15, frame); F(g, wx + Math.floor(ww * 2 / 3), 4, 1, 15, frame); } else F(g, wx + Math.floor(ww / 2), 4, 1, 15, frame);
      F(g, wx, 11, ww, 1, frame);
      if (blinds) { for (let y = 4; y < 19; y += 2) { F(g, wx, y, ww, 1, mixc(t[3], 0xFFFFFF, .35)); F(g, wx, y + 1, ww, 1, mixc(t[2], t[3], .5)); } F(g, wx + ww - 3, 4, 1, 13, t[0]); }
      F(g, wx - 2, 19, ww + 4, 2, d === 'grok' ? P.metal[3] : t[3]);
      if (d === 'claude' || d === 'muse') { const cu = d === 'claude' ? P.acc : [P.acc[2], P.acc[3], 0xFFFFFF]; F(g, wx - 4, 2, 3, 18, cu[1]); F(g, wx - 4, 2, 1, 18, cu[2]); F(g, wx + ww + 1, 2, 3, 18, cu[1]); F(g, wx + ww + 3, 2, 1, 18, cu[0]); }
      room.wins.push([wx, ww, !!blinds]); room.weathers.push({ x: wx, w: ww, kind: blinds ? 'none' : kind });
    };
    let wx;
    if (st === 'wide') { wx = W - 64; one(wx, 40, true); }
    else if (st === 'double') { wx = W - 24 - 42; one(wx, 17, true); one(wx + 25, 17, false); }
    else { wx = W - 48; one(wx, 24, true, st === 'blinds'); }
    room.win = room.wins[0];
    return wx;
  },
  /* a project room: theme wallpaper + archetype (wall treatment, floor, ceiling lights, window, signature props), the theme's own
     accent if wall is left, the sign. Wall props fill the stretch between the plaque and the window (c.px .. c.space());
     floor props stand in the two corners beside the desk rows (always >= 14 px wide), larger pieces in wide gaps */
  drawRoom(g, P, room, rr) {
    const X = room.x, Y = room.y, W = room.w, H = room.h, WH = this.G.WH, A = ARCH[room.arch] || ARCH.studio;
    g.save(); g.beginPath(); g.rect(X, Y, W, H); g.clip(); g.translate(X, Y);
    room.lamps = []; room.lights = []; room.anim = []; room.spots = []; room.sky = [];
    this.walls(g, P, W, H, rr, A);
    const sign = this.signW(room);
    let ws = A.win; if ((ws === 'wide' || ws === 'double') && W - 24 - 42 - sign - 14 < 22) ws = 'std';   // narrow room: a plain window
    const wx = this.window(g, P, W, room, ws);
    const c = { X, Y, W, H, wx, sign, px: sign + 6, yb: H - 7, space() { return this.wx - 8 - this.px; },
      lamp: (lx, ly, col) => room.lamps.push([X + lx, Y + ly, col]), em: (x, y, w, h, col) => this.emit.push([X + x, Y + y, w, h, col]),
      li: (x, y, col, r, a) => room.lights.push([X + x, Y + y, col, r, a]), an: o => room.anim.push(o), spot: (x, k) => room.spots.push({ x: X + x, k }) };
    this.ceiling(g, P, room, A.ceil, c);
    this['ar_' + room.arch](g, P, room, c, rr);
    this.accent(g, P, room, c);
    // wide gaps beside a short desk row: a table on the right, a board on the left (skinned per archetype), clear of the corner props
    for (const sp of room.spans || []) {
      const gapR = X + W - sp.x1, gapL = sp.x0 - X, ry = sp.y - Y + this.G.DT;
      if (gapR >= 64) { const tx = sp.x1 - X + Math.floor((gapR - 16 - 34) / 2) + 2; room.spots.push({ x: X + tx + 15, k: 'nook' }); this.nook(g, P, tx, ry, room.arch); }
      if (gapL >= 50) { const bx = sp.x0 - X - 32; room.spots.push({ x: X + bx + 11, k: 'board' }); this.board(g, P, bx, ry, room.arch); }
    }
    const rs = srand(hsh(room.p.name)), rare = rs();
    if (room.win && rs() < .45) room.anim.push({ k: 'cat', x: room.win[0] + 4, y: 12, coat: COATS[Math.floor(rs() * COATS.length)], ph: rs() });
    if (rare > .8 && c.space() > 22) { const nx = c.px + 2, txt = P.decor === 'grok' ? 'HI' : 'OK'; F(g, nx - 1, 5, 18, 9, 0x141418); drawText(g, txt, nx + 4, 7, mixc(P.acc[2], 0, .55), null); room.anim.push({ k: 'neon', x: nx + 4, y: 7, txt }); c.px += 22; }
    this.sign(g, P, room);
    // pneumatic mail tube (paper planes come out here)
    F(g, 2, 0, 4, 6, P.metal[1]); F(g, 2, 0, 1, 6, P.metal[3]); F(g, 1, 6, 6, 2, P.metal[2]); F(g, 2, 7, 4, 1, P.metal[0]);
    g.restore();
    room.tube = [X + 4, Y + 9];
  },
  /* ceiling lights: the theme's own fixtures, fluorescent strips (cool: server blue), skylights, track spots, pendants, a neon tube */
  ceiling(g, P, room, kind, c) {
    const { X, Y, W, sign } = c, d = P.decor, t = P.trim, M = P.metal, A = P.acc, lamp = c.lamp;
    if (kind === 'theme') {
      if (d === 'claude') for (let lx = sign + 26; lx < W - 16; lx += 64) { F(g, lx, 0, 1, 5, t[0]); F(g, lx - 3, 5, 7, 2, A[1]); F(g, lx - 2, 4, 5, 1, A[2]); F(g, lx - 3, 7, 7, 1, A[0]); this.emit.push([X + lx - 1, Y + 8, 3, 1, 0xFFF0C8]); lamp(lx, 8); }
      if (d === 'codex') for (let lx = sign + 4; lx < W - 30; lx += 46) { F(g, lx, 2, 18, 1, M[2]); this.emit.push([X + lx, Y + 1, 18, 1, 0xF4FFFA]); lamp(lx + 9, 3); }
      if (d === 'gemini') { F(g, 0, 3, W, 1, A[0]); this.emit.push([X, Y + 2, W, 1, A[2]]); for (let lx = sign + 14; lx < W - 20; lx += 60) { lamp(lx, 10); room.anim.push({ k: 'orb', x: lx, y: 10 }); } }
      if (d === 'grok') { F(g, 0, 1, W, 3, M[1]); F(g, 0, 1, W, 1, M[2]); for (let x = 3; x < W; x += 9) F(g, x, 2, 4, 1, A[0]); for (let lx = sign + 4; lx < W - 30; lx += 58) { PX(g, lx - 1, 6, M[2]); PX(g, lx + 22, 6, M[2]); this.emit.push([X + lx, Y + 6, 22, 1, P.night ? 0xC4CAD4 : 0xE8ECF2]); lamp(lx + 11, 7); } }
      if (d === 'muse') { F(g, 0, 0, W, 1, M[2]); for (let lx = sign + 10; lx < W - 20; lx += 52) { PX(g, lx, 0, M[2]); F(g, lx - 1, 1, 3, 2, M[1]); this.emit.push([X + lx, Y + 3, 1, 1, 0xFFF4E0]); lamp(lx, 4); }
        for (let x = 4; x < W - 4; x += 6) { const sag = Math.round(Math.sin((x / W) * Math.PI) * 3); PX(g, x, 5 + sag, M[1]); this.emit.push([X + x, Y + 6 + sag, 1, 1, [0xFFD27A, 0xFF9AC8, 0x9AD0FF][(x / 6 | 0) % 3]]); } }
    }
    if (kind === 'strip' || kind === 'cool') { const tube = kind === 'cool' ? 0xC4EAFF : 0xF4FAFF; for (let lx = sign + 6; lx < W - 28; lx += 44) { F(g, lx - 1, 1, 22, 2, M[2]); F(g, lx - 1, 1, 22, 1, M[3]); F(g, lx, 3, 20, 1, tube); c.em(lx, 3, 20, 1, tube); if (kind === 'cool') { c.li(lx + 10, 9, 0x6FC4FF, 30, .4); room.lamps.push([X + lx + 10, Y + 4, 0x9AD8FF]); } else lamp(lx + 10, 4); } }
    if (kind === 'sky') for (let sx = sign + 8; sx < W - 26; sx += 38) { F(g, sx - 1, 0, 24, 4, M[1]); vramp(g, sx, 0, 22, 3, [mixc(P.win[1], 0xFFFFFF, .3), P.win[1]]); F(g, sx + 10, 0, 1, 3, M[1]); F(g, sx - 1, 3, 24, 1, M[0]); room.sky.push([X + sx, 22]); if (P.night) { F(g, sx + 9, 4, 3, 1, M[2]); c.em(sx + 9, 5, 3, 1, 0xFFF0D0); lamp(sx + 10, 6); } }
    if (kind === 'track') { F(g, sign + 2, 1, W - sign - 6, 2, M[1]); F(g, sign + 2, 1, W - sign - 6, 1, M[2]); for (let lx = sign + 12, i = 0; lx < W - 10; lx += 26, i++) { PX(g, lx, 3, M[0]); F(g, lx - 1, 4, 3, 3, M[2]); PX(g, lx - 1, 4, M[3]); F(g, lx - 1 + (i % 2 ? 1 : -1), 7, 3, 1, M[0]); c.em(lx - 1 + (i % 2 ? 1 : -1), 7, 3, 1, P.lamp); lamp(lx, 8); } }
    if (kind === 'pend') for (let lx = sign + 16, i = 0; lx < W - 20; lx += 32, i++) { const cl = 4 + (i % 2) * 2; F(g, lx, 0, 1, cl, M[1]); F(g, lx - 2, cl, 5, 1, A[1]); F(g, lx - 3, cl + 1, 7, 2, A[1]); F(g, lx - 3, cl + 1, 7, 1, A[2]); F(g, lx - 4, cl + 3, 9, 1, A[0]); c.em(lx - 1, cl + 4, 3, 1, 0xFFE6B0); lamp(lx, cl + 5); }
    if (kind === 'neon') { const x0 = sign + 4, x1 = W - 4; for (let x = x0; x < x1; x += 12) { PX(g, x, 1, M[1]); c.em(x + 1, 2, Math.min(10, x1 - x - 1), 1, (x - x0) / 12 % 2 ? A[2] : A[3]); } for (let lx = x0 + 20; lx < x1; lx += 44) c.li(lx, 5, A[2], 24, .35); }
  },
  /* ---------- archetype props ---------- */
  ar_studio(g, P, room, c, rr) {
    const D = P.desk, t = P.trim, A = P.acc, M = P.metal, { W, yb } = c;
    if (c.space() >= 28) { // fireplace: stone surround, mantel with candles, the fire flickers and warms the room
      const x = c.px + 2, st = mixc(t[1], P.wall[1], .4), sd = mixc(st, 0, .3), sh = mixc(st, 0xFFFFFF, .2);
      F(g, x, 12, 24, 19, st); for (let y = 14; y < 30; y += 3) for (let bx = x + ((y / 3) % 2) * 3; bx < x + 24; bx += 6) PX(g, bx, y, sd); F(g, x, 12, 1, 19, sh);
      F(g, x - 2, 10, 28, 2, t[2]); F(g, x - 2, 10, 28, 1, t[3]); F(g, x - 1, 12, 26, 1, t[0]);
      F(g, x + 4, 16, 16, 14, 0x140E0C); F(g, x + 3, 15, 18, 1, sd); F(g, x + 3, 16, 1, 14, sd); F(g, x + 20, 16, 1, 14, sd); F(g, x + 6, 27, 12, 2, 0x4A2A1A); F(g, x + 7, 27, 4, 1, 0x6A3A22); F(g, x + 3, 30, 18, 1, mixc(st, 0, .45));
      F(g, x + 2, 7, 1, 3, 0xF4EEDC); c.em(x + 2, 6, 1, 1, 0xFFD27A); F(g, x + 21, 6, 1, 4, 0xF4EEDC); c.em(x + 21, 5, 1, 1, 0xFFD27A); F(g, x + 9, 4, 7, 6, D[0]); F(g, x + 10, 5, 5, 4, A[2]); PX(g, x + 11, 7, A[3]);
      c.an({ k: 'fire', x: x + 6, y: 26, w: 12 }); c.spot(x + 12, 'fire'); c.px += 30;
    }
    if (c.space() >= 22) { this.bookshelf(g, P, c.px, 3, rr); c.px += 24; }
    if (c.space() >= 16) { const x = c.px; F(g, x + 1, 5, 12, 9, t[1]); F(g, x + 2, 6, 10, 7, P.wall[3]); F(g, x + 3, 8, 4, 4, A[2]); F(g, x + 6, 7, 5, 3, P.books[1]); F(g, x + 5, 10, 6, 2, A[1]); c.px += 16; }
    { const x = 1, top = yb - 34; F(g, x, top, 12, 34, D[0]); F(g, x + 1, top + 1, 10, 32, D[1]); F(g, x, top, 12, 1, D[3]);   // tall bookcase, a globe on top
      for (let s = 0; s < 4; s++) { const sy = top + 2 + s * 8; F(g, x + 1, sy + 6, 10, 2, D[2]); let bx = x + 2; while (bx < x + 10) { const bw = rr() < .4 ? 2 : 1, bh = 3 + Math.floor(rr() * 3), cc = P.books[Math.floor(rr() * P.books.length)]; F(g, bx, sy + 6 - bh, bw, bh, cc); PX(g, bx, sy + 6 - bh, mixc(cc, 0xFFFFFF, .35)); bx += bw; } }
      disc(g, x + 6, top - 4, 3, 0x2A5A8A, 0x3E7AB0, 0x7AB8E0); PX(g, x + 5, top - 5, P.plant[2]); PX(g, x + 7, top - 3, P.plant[2]); PX(g, x + 6, top - 4, P.plant[3]); F(g, x + 4, top - 1, 5, 1, M[2]); }
    { const x = W - 9; F(g, x - 2, yb - 1, 5, 1, M[1]); F(g, x, yb - 29, 1, 28, M[2]); F(g, x - 3, yb - 35, 7, 5, A[1]); F(g, x - 2, yb - 36, 5, 1, A[2]); F(g, x - 3, yb - 35, 1, 5, A[2]); F(g, x - 3, yb - 31, 7, 1, A[0]);   // reading lamp + books
      c.em(x - 2, yb - 30, 5, 1, 0xFFE6B0); c.li(x, yb - 27, P.lamp, 22, .45); F(g, x - 8, yb - 3, 5, 3, P.books[0]); F(g, x - 7, yb - 5, 4, 2, P.books[2 % P.books.length]); F(g, x - 8, yb - 3, 5, 1, mixc(P.books[0], 0xFFFFFF, .3)); }
  },
  ar_lab(g, P, room, c) {
    const M = P.metal, A = P.acc, w = P.wall, { W, yb } = c, ink = [0x2A4A9A, 0xC8342A, 0x2E2E36], glass = mixc(P.win[1], 0xFFFFFF, .45);
    if (c.space() >= 28) { // whiteboard: E=MC2, a curve on axes, a fraction
      const x = c.px, bw = Math.min(38, c.space() - 2); F(g, x, 3, bw, 15, M[3]); F(g, x + 1, 4, bw - 2, 13, 0xFAFCFC);
      drawText(g, 'E', x + 3, 6, ink[0], null); F(g, x + 7, 7, 3, 1, ink[2]); F(g, x + 7, 9, 3, 1, ink[2]); drawText(g, 'MC', x + 11, 6, ink[0], null); F(g, x + 21, 5, 2, 1, ink[1]); PX(g, x + 22, 6, ink[1]); F(g, x + 21, 7, 2, 1, ink[1]);
      F(g, x + 3, 13, 5, 1, ink[2]); F(g, x + 10, 12, 2, 1, ink[1]); F(g, x + 9, 13, 4, 1, ink[2]); F(g, x + 10, 14, 2, 1, ink[1]); F(g, x + 15, 13, 6, 1, ink[2]);
      if (bw >= 34) { F(g, x + 25, 5, 1, 10, ink[2]); F(g, x + 25, 14, bw - 27, 1, ink[2]); for (let i = 0; i < bw - 28; i++) PX(g, x + 26 + i, 10 - Math.round(Math.sin(i / 1.6) * 3), ink[1]); }
      F(g, x + 2, 18, bw - 4, 1, M[2]); PX(g, x + 4, 17, ink[0]); PX(g, x + 6, 17, ink[1]); c.spot(x + bw / 2, 'board'); c.px += bw + 4;
    }
    if (c.space() >= 18) { // wall shelf of flasks: one bubbles, the liquids glow a little at night
      const x = c.px; F(g, x, 20, 18, 1, M[2]); PX(g, x + 2, 21, M[1]); PX(g, x + 15, 21, M[1]);
      F(g, x + 2, 13, 2, 3, glass); F(g, x + 1, 16, 4, 1, glass); F(g, x, 17, 6, 3, glass); F(g, x, 18, 6, 2, A[2]); c.em(x + 1, 18, 1, 1, mixc(A[2], 0xFFFFFF, .4));
      F(g, x + 8, 10, 3, 10, glass); F(g, x + 8, 14, 3, 6, 0x6FD88A); F(g, x + 8, 10, 1, 10, mixc(glass, 0xFFFFFF, .5)); c.an({ k: 'bub', x: x + 9, y: 19, h: 5, c: 0xD8FFE4 }); c.li(x + 9, 16, 0x7FE08A, 10, .3);
      F(g, x + 14, 13, 1, 3, glass); disc(g, x + 14, 18, 2, mixc(0xFF7AB0, 0, .2), 0xFF7AB0, 0xFFC0D8); c.px += 20;
    }
    if (c.space() >= 9) { const x = c.px; F(g, x, 6, 7, 7, 0x1E8A4A); F(g, x + 1, 7, 5, 5, 0xEAFFF0); F(g, x + 3, 8, 1, 3, 0x1E8A4A); F(g, x + 2, 9, 3, 1, 0x1E8A4A); c.px += 10; }
    { const x = 1, top = yb - 34, gl = mixc(P.win[1], w[3], .45); F(g, x, top, 12, 34, M[2]); F(g, x, top, 12, 1, M[3]); F(g, x + 1, top + 1, 10, 22, gl); F(g, x + 6, top + 1, 1, 22, M[2]);   // glass-front cabinet
      for (let s = 0; s < 3; s++) { const sy = top + 7 + s * 7; F(g, x + 1, sy, 10, 1, M[1]); for (let k = 0; k < 4; k++) F(g, x + 2 + k * 2 + (k > 1 ? 1 : 0), sy - 3 + (k % 2), 1, 3 - (k % 2), [A[2], 0x7FE08A, 0xFFB040, 0x9AB8FF][(s + k) % 4]); }
      PX(g, x + 2, top + 2, mixc(gl, 0xFFFFFF, .6)); PX(g, x + 3, top + 3, mixc(gl, 0xFFFFFF, .4)); F(g, x + 1, top + 24, 10, 9, M[1]); F(g, x + 1, top + 28, 10, 1, M[0]); F(g, x + 5, top + 25, 2, 1, M[3]); F(g, x + 5, top + 30, 2, 1, M[3]);
      c.li(x + 6, top + 12, 0xBFE8FF, 14, .3); }
    { const x = W - 13, top = yb - 22, wb = mixc(M[3], 0xFFFFFF, .45); F(g, x, top, 11, 22, wb); F(g, x, top, 11, 1, 0xFFFFFF); F(g, x + 10, top + 1, 1, 21, M[2]);   // incubator: amber readout, status LED
      F(g, x + 2, top + 3, 7, 3, 0x1A1410); c.em(x + 3, top + 4, 4, 1, 0xFFB040); F(g, x + 1, top + 8, 9, 1, M[2]); F(g, x + 8, top + 11, 1, 6, M[1]); F(g, x + 1, top + 21, 9, 1, M[1]); c.an({ k: 'led', x: x + 7, y: top + 7 }); }
  },
  ar_server(g, P, room, c) {
    const M = P.metal, A = P.acc, { W, yb } = c;
    const rack = (x, top, h) => { F(g, x, top, 12, h, M[0]); F(g, x, top, 12, 1, M[2]); F(g, x, top, 1, h, M[2]); F(g, x + 11, top, 1, h, mixc(M[0], 0, .35));
      for (let y = top + 2; y < top + h - 4; y += 4) { F(g, x + 2, y, 8, 3, M[1]); F(g, x + 2, y, 8, 1, M[2]); F(g, x + 3, y + 2, 3, 1, M[0]); }
      c.an({ k: 'rled', x: x + 8, y: top + 3, n: Math.floor((h - 6) / 4), s: x }); F(g, x + 1, top + h - 2, 10, 2, M[1]); c.li(x + 6, top + h / 2, 0x5AB8FF, 16, .32); };
    if (c.space() >= 24) { // patch panel, cables looping down
      const x = c.px; F(g, x, 8, 22, 6, M[0]); F(g, x, 8, 22, 1, M[2]); for (let i = 0; i < 10; i++) { PX(g, x + 1 + i * 2, 10, M[2]); PX(g, x + 1 + i * 2, 12, M[2]); }
      [A[1], 0x3A6AD0, 0xE8B830, 0x5AC87A, 0xD8442A].forEach((col, k) => { const cx = x + 2 + k * 4, L = 4 + (k * 3) % 5; F(g, cx, 14, 1, L, col); F(g, cx, 14 + L, 3, 1, col); F(g, cx + 2, 14, 1, L, mixc(col, 0, .25)); });
      c.spot(x + 11, 'rack'); c.px += 25;
    }
    if (c.space() >= 16) { const x = c.px; F(g, x, 5, 16, 11, M[0]); F(g, x + 1, 6, 14, 9, 0x06121A); F(g, x, 5, 16, 1, M[2]); c.an({ k: 'bars', x: x + 2, y: 14, w: 12, h: 7 }); c.li(x + 8, 10, 0x5AD0FF, 14, .35); c.px += 19; }
    if (c.space() >= 10) { const x = c.px; F(g, x, 8, 9, 9, M[1]); F(g, x + 1, 9, 7, 7, M[0]); F(g, x, 8, 9, 1, M[2]); c.an({ k: 'fan', x: x + 4, y: 12 }); c.px += 12; }
    rack(1, yb - 38, 38); rack(W - 14, yb - 38, 38);
    if (!room.spots.length) c.spot(7, 'rack');
  },
  ar_green(g, P, room, c) {
    const pl = P.plant, pot = P.pot, t = P.trim, { W, yb } = c, kind = { claude: 'rain', codex: P.night ? 'snow' : 'none', gemini: 'star', grok: 'rain', muse: 'snow' }[P.decor];
    if (P.night) for (let x = c.sign + 6; x < W - 28; x += 13) c.em(x, 5 + (x * 7) % 9, 1, 1, x % 3 ? 0xDDE4FF : 0xFFFFFF);
    room.weathers.push({ x: W - 60, w: 32, kind });
    for (let x = c.sign + 12, i = 0; x < W - 66; x += 30, i++) { // macramé pots from the ceiling, trailing leaves
      const L = 4 + (i % 2) * 3; F(g, x, 0, 1, L, mixc(t[2], 0xFFFFFF, .25)); PX(g, x - 1, L, t[2]); PX(g, x + 1, L, t[2]); F(g, x - 2, L + 1, 5, 3, pot[1]); F(g, x - 2, L + 1, 5, 1, pot[2]); PX(g, x + 2, L + 2, pot[0]);
      PX(g, x - 1, L, pl[2]); PX(g, x, L - 1, pl[3]); PX(g, x + 2, L, pl[1]); for (let k = 0; k < 6 + (i % 3); k++) PX(g, x - 3 + (k % 2), L + 3 + k, pl[k % 2 ? 2 : 1]); for (let k = 0; k < 4; k++) PX(g, x + 3 - (k % 2), L + 3 + k, pl[k % 2 ? 1 : 3]);
    }
    for (let x = c.sign + 26, i = 0; x < W - 70; x += 34, i++) this.plant(g, P, x, 22, i % 2 ? 'snake' : 'monstera');
    { const x = 7; F(g, x - 5, yb - 9, 11, 9, pot[1]); F(g, x - 5, yb - 9, 2, 9, pot[2]); F(g, x + 4, yb - 9, 2, 9, pot[0]); F(g, x - 6, yb - 10, 13, 2, pot[2]);   // fiddle-leaf fig
      F(g, x, yb - 26, 1, 16, mixc(P.desk[0], pl[0], .3)); line(g, x, yb - 18, x + 3, yb - 22, mixc(P.desk[0], pl[0], .3));
      for (const [dx, dy] of [[-4, -24], [3, -27], [-3, -31], [2, -34], [0, -38], [4, -21], [-5, -19], [5, -31], [-2, -36]]) { const lx = x + dx, ly = yb + dy; F(g, lx - 1, ly, 3, 2, pl[2]); PX(g, lx, ly - 1, pl[3]); PX(g, lx + 1, ly + 2, pl[1]); PX(g, lx - 1, ly + 1, pl[1]); } }
    { const x = W - 13; F(g, x, yb - 1, 11, 1, P.desk[0]); F(g, x + 1, yb - 21, 1, 21, P.desk[0]); F(g, x + 9, yb - 21, 1, 21, P.desk[0]);   // tiered stand + watering can
      for (const [sy, k] of [[yb - 21, 0], [yb - 14, 1], [yb - 7, 2]]) { F(g, x, sy, 11, 1, P.desk[1]); F(g, x + 2 + k, sy - 3, 3, 3, pot[1]); F(g, x + 2 + k, sy - 3, 3, 1, pot[2]); PX(g, x + 3 + k, sy - 4, pl[2]); PX(g, x + 2 + k, sy - 5, pl[3]); PX(g, x + 4 + k, sy - 5, pl[1]); if (k !== 1) { F(g, x + 6, sy - 2, 3, 2, pot[0]); PX(g, x + 7, sy - 3, pl[3]); } }
      F(g, x + 3, yb - 5, 5, 4, mixc(P.metal[2], P.acc[1], .35)); F(g, x + 3, yb - 5, 5, 1, P.metal[3]); line(g, x + 8, yb - 4, x + 10, yb - 7, P.metal[2]); }
    c.an({ k: 'fly', x: c.sign + 4, y: 6, w: Math.max(20, W - c.sign - 40), h: 14, ph: (room.i * .37) % 1, col: [0xFFC857, P.acc[2], 0xF4F4F0][room.i % 3] });
    c.spot(c.sign + 26, 'plant');
  },
  ar_shop(g, P, room, c) {
    const M = P.metal, A = P.acc, D = P.desk, { W, yb } = c, bins = [A[1], 0x3A6AD0, 0xE8B830, 0x5A9A5A];
    if (c.space() >= 24) { // pegboard with tool outlines
      const x = c.px, pw = Math.min(30, c.space() - 2), pb = mixc(D[3], 0xC8A878, .45), ph = mixc(pb, D[0], .3), sh = mixc(pb, 0, .25); F(g, x, 3, pw, 15, D[1]); F(g, x + 1, 4, pw - 2, 13, pb);
      for (let yy = 5; yy < 17; yy += 3) for (let xx = x + 2; xx < x + pw - 1; xx += 3) PX(g, xx, yy, ph);
      line(g, x + 3, 15, x + 7, 7, sh); line(g, x + 3, 14, x + 7, 6, M[3]); F(g, x + 6, 5, 3, 2, M[3]); PX(g, x + 7, 5, pb);   // wrench
      F(g, x + 11, 8, 1, 8, D[0]); F(g, x + 9, 6, 5, 2, M[2]); F(g, x + 12, 9, 1, 7, sh);   // hammer
      F(g, x + 16, 6, 1, 3, A[1]); F(g, x + 16, 9, 1, 6, M[3]);   // screwdriver
      if (pw >= 28) { for (let i = 0; i < 6; i++) F(g, x + 19 + i, 9 + (i >> 1), 1, 6 - (i >> 1), M[3]); F(g, x + 25, 8, 2, 4, D[0]); }   // saw
      c.spot(x + pw / 2, 'bench'); c.px += pw + 4;
    }
    if (c.space() >= 16) { const x = c.px; F(g, x, 18, 16, 1, M[2]); PX(g, x + 1, 19, M[1]); PX(g, x + 14, 19, M[1]); for (let k = 0; k < 3; k++) { F(g, x + 1 + k * 5, 13, 4, 5, bins[k]); F(g, x + 1 + k * 5, 13, 4, 1, mixc(bins[k], 0xFFFFFF, .3)); PX(g, x + 2 + k * 5, 15, 0xF4F4F0); } c.px += 18; }
    if (c.space() >= 10) { const x = c.px; PX(g, x + 4, 8, M[2]); F(g, x + 1, 10, 6, 3, 0xE8B830); F(g, x + 2, 9, 4, 1, 0xF4D060); F(g, x, 13, 8, 1, 0xC89A20); c.px += 10; }   // hard hat on a hook
    { const x = 1, top = yb - 32; F(g, x, top, 1, 32, M[2]); F(g, x + 11, top, 1, 32, M[2]);   // shelving with bins
      for (let s = 0; s < 4; s++) { const sy = top + 7 + s * 8; F(g, x, sy, 12, 1, M[3]); F(g, x + 1, sy - 5, 4, 5, bins[s % 4]); F(g, x + 6, sy - 5, 5, 5, bins[(s + 2) % 4]); F(g, x + 1, sy - 5, 4, 1, mixc(bins[s % 4], 0xFFFFFF, .3)); F(g, x + 6, sy - 5, 5, 1, mixc(bins[(s + 2) % 4], 0xFFFFFF, .3)); PX(g, x + 2, sy - 3, 0xF4F4F0); PX(g, x + 8, sy - 3, 0xF4F4F0); } }
    { const x = W - 14, top = yb - 26;   // 3D printer on a cart, filament spool below, hazard tape on the floor
      F(g, x, yb - 9, 12, 1, M[2]); F(g, x, yb - 3, 12, 1, M[2]); F(g, x, yb - 9, 1, 8, M[1]); F(g, x + 11, yb - 9, 1, 8, M[1]); PX(g, x + 1, yb - 1, M[0]); PX(g, x + 10, yb - 1, M[0]);
      disc(g, x + 5, yb - 6, 2, mixc(A[1], 0, .3), A[1], mixc(A[1], 0xFFFFFF, .3)); PX(g, x + 5, yb - 6, M[0]);
      F(g, x, top, 12, 17, M[0]); F(g, x + 1, top + 1, 10, 15, mixc(M[1], P.win[1], .25)); F(g, x, top, 12, 1, M[2]); F(g, x + 1, top + 13, 10, 2, M[2]); F(g, x + 1, top + 1, 1, 12, M[2]); F(g, x + 10, top + 1, 1, 12, M[2]); F(g, x + 1, top + 15, 10, 1, M[1]);
      c.em(x + 9, top + 15, 1, 1, 0x5AE08A); c.an({ k: 'printer', x: x + 2, y: top + 3, w: 8, b: top + 13 }); c.li(x + 6, top + 9, 0xFFC080, 10, .25);
      for (let i = 0; i < 16; i++) F(g, x - 2 + i, yb + 2, 1, 2, (i >> 1) % 2 ? 0xE8B830 : 0x2A2A2A); }
  },
  ar_war(g, P, room, c) {
    const M = P.metal, A = P.acc, { W, yb } = c;
    if (c.space() >= 18) { // big wall screen with a live chart
      const sw = Math.min(46, c.space() - 2), x = c.px; F(g, x, 2, sw, 17, M[0]); F(g, x + 1, 3, sw - 2, 15, P.scr); F(g, x, 2, sw, 1, M[2]); F(g, x + (sw >> 1) - 3, 19, 6, 1, M[1]);
      c.an({ k: 'chart', x: x + 1, y: 3, w: sw - 2, h: 15 }); c.li(x + sw / 2, 10, P.glow, sw * .6, .4); c.spot(x + sw / 2, 'screen'); c.px += sw + 4;
    }
    if (c.space() >= 22) { // world map with blinking pins
      const x = c.px, land = mixc(P.plant[2], 0xD8C890, .35), pts = [[x + 5, 8], [x + 12, 7], [x + 16, 12], [x + 7, 13]]; F(g, x, 4, 20, 13, P.trim[0]); F(g, x + 1, 5, 18, 11, mixc(0x2E5A8A, A[0], .2));
      for (const [lx, ly, lw, lh] of [[3, 2, 4, 3], [2, 4, 3, 3], [5, 7, 2, 3], [10, 2, 6, 2], [11, 4, 4, 2], [12, 6, 2, 3], [15, 8, 3, 2]]) F(g, x + lx, 4 + ly, lw, lh, land);
      c.an({ k: 'pins', pts }); c.px += 23;
    }
    if (c.space() >= 20) { // red-string board
      const x = c.px, notes = [[2, 7, 4, 4, 0xFFFFFF], [11, 7, 5, 4, 0xFFF4B0], [3, 12, 5, 4, 0xFFD0E0], [12, 12, 4, 4, 0xFFFFFF]]; F(g, x, 5, 18, 13, 0x8A5A34); F(g, x + 1, 6, 16, 11, 0xC89A6A);
      for (const [nx, ny, nw, nh, col] of notes) { F(g, x + nx, ny, nw, nh, col); F(g, x + nx + 1, ny + 1, nw - 2, 1, 0x9A9A9A); }
      line(g, x + 4, 8, x + 13, 8, 0xD8342A); line(g, x + 4, 8, x + 5, 13, 0xD8342A); line(g, x + 13, 8, x + 14, 13, 0xD8342A); line(g, x + 5, 13, x + 13, 9, 0xD8342A);
      for (const [nx, ny] of notes) PX(g, x + nx + 1, ny, 0xE5342B); c.px += 21;
    }
    if (c.space() >= 16) { this.clock(g, P, c.px + 3, 8); this.clock(g, P, c.px + 11, 8); c.px += 16; }
    { const x = 1, top = yb - 30; line(g, x + 3, top + 10, x + 1, yb, P.desk[0]); line(g, x + 9, top + 10, x + 11, yb, P.desk[0]); line(g, x + 6, top + 12, x + 6, yb - 2, P.desk[0]);   // flip chart
      F(g, x + 1, top, 11, 15, 0xFAFAF6); F(g, x, top, 13, 2, M[1]); F(g, x + 3, top + 10, 2, 3, A[1]); F(g, x + 6, top + 7, 2, 6, A[2]); F(g, x + 9, top + 5, 2, 8, A[1]); line(g, x + 3, top + 7, x + 10, top + 3, 0xC8342A); F(g, x + 1, top + 15, 11, 1, mixc(0xFAFAF6, 0, .2)); }
    { const x = W - 12; F(g, x, yb - 18, 10, 18, M[2]); F(g, x, yb - 18, 10, 1, M[3]); for (let k = 0; k < 3; k++) { F(g, x + 1, yb - 12 + k * 6, 8, 1, M[1]); F(g, x + 4, yb - 15 + k * 6, 2, 1, M[3]); }   // cabinet + the red hotline
      F(g, x + 2, yb - 21, 6, 3, 0xC8342A); F(g, x + 1, yb - 22, 8, 1, 0xA8281F); F(g, x + 1, yb - 23, 2, 1, 0xA8281F); F(g, x + 7, yb - 23, 2, 1, 0xA8281F); PX(g, x + 4, yb - 20, 0xF4F4F0); PX(g, x + 8, yb - 19, 0x2A2A2A); PX(g, x + 9, yb - 18, 0x2A2A2A); }
  },
  ar_cafe(g, P, room, c) {
    const M = P.metal, A = P.acc, D = P.desk, { W, yb } = c, chalk = 0xF0EEE6, cb = 0x24302A;
    if (c.space() >= 22) { const x = c.px, bw = Math.min(26, c.space() - 2); F(g, x, 3, bw, 17, D[0]); F(g, x + 1, 4, bw - 2, 15, cb); drawText(g, 'MENU', x + ((bw - 15) >> 1), 6, chalk, null);   // chalk menu
      for (let i = 0; i < 3; i++) { F(g, x + 3, 12 + i * 2, bw - 10, 1, mixc(chalk, cb, .45)); F(g, x + bw - 5, 12 + i * 2, 2, 1, [0xFFD27A, 0xFF9AC8, 0x9AD0FF][i]); } c.px += bw + 4; }
    if (c.space() >= 16) { const x = c.px; F(g, x, 17, 16, 1, D[2]); F(g, x, 18, 16, 1, D[0]);   // shelf: mugs + a jar of beans
      for (let k = 0; k < 3; k++) { F(g, x + 1 + k * 4, 14, 3, 3, [P.pot[1], 0xF4F4F0, A[2]][k]); PX(g, x + 4 + k * 4, 15, mixc([P.pot[1], 0xF4F4F0, A[2]][k], 0, .25)); } F(g, x + 13, 12, 3, 5, mixc(P.win[1], 0xFFFFFF, .4)); F(g, x + 13, 14, 3, 3, 0x4A2A1A); F(g, x + 13, 11, 3, 1, D[0]); c.px += 18; }
    { const x = 1, top = yb - 13;   // espresso machine on a counter (steams); the coffee spot
      F(g, x, top, 13, 13, D[1]); F(g, x, top, 13, 2, D[3]); F(g, x, top + 2, 13, 1, D[0]); F(g, x + 6, top + 4, 1, 8, D[0]); PX(g, x + 4, top + 7, D[3]); PX(g, x + 9, top + 7, D[3]);
      F(g, x + 1, top - 9, 11, 9, M[3]); F(g, x + 1, top - 9, 11, 1, 0xFFFFFF); F(g, x + 1, top - 7, 11, 1, A[1]); F(g, x + 11, top - 8, 1, 8, M[2]); F(g, x + 4, top - 4, 4, 2, M[1]); PX(g, x + 5, top - 1, 0xF4F4F0); PX(g, x + 6, top - 1, 0xF4F4F0); F(g, x + 1, top - 1, 11, 1, M[1]);
      disc(g, x + 9, top - 4, 1, M[0], 0xF4F4F0, 0xFFFFFF); c.em(x + 2, top - 5, 1, 1, 0x5AE08A); c.an({ k: 'steam', x: x + 3, y: top - 10 }); c.spot(x + 7, 'coffee'); c.li(x + 6, top - 5, 0xFFD8A0, 12, .3); }
    { const x = W - 13, top = yb - 20, gl = mixc(P.win[1], 0xFFFFFF, .55);   // pastry case, lit inside
      F(g, x, yb - 9, 11, 9, D[1]); F(g, x, yb - 9, 11, 1, D[3]); F(g, x, top, 11, 11, gl); F(g, x, top, 11, 1, M[2]); F(g, x, top, 1, 11, M[2]); F(g, x + 10, top, 1, 11, M[2]); F(g, x + 1, top + 6, 9, 1, M[3]);
      F(g, x + 2, top + 4, 3, 2, 0xE0A050); PX(g, x + 3, top + 3, 0xF0C070); F(g, x + 6, top + 3, 3, 3, 0xF6D8E0); F(g, x + 6, top + 3, 3, 1, 0xE85A8A); F(g, x + 2, top + 8, 3, 2, 0xC88A50); PX(g, x + 3, top + 8, 0xFF9AC8); F(g, x + 6, top + 8, 3, 2, 0xD8B070);
      c.em(x + 1, top + 1, 9, 1, 0xFFF0D0); c.li(x + 5, top + 5, 0xFFE0B0, 14, .35); }
  },
  ar_retro(g, P, room, c) {
    const M = P.metal, A = P.acc, D = P.desk, { W, yb } = c, inv = ['.#...#.', '..###..', '.#####.', '##.#.##', '#######', '#.#.#.#'];
    if (c.space() >= 12) { const x = c.px; F(g, x, 4, 10, 14, 0x161628); F(g, x, 4, 10, 1, A[2]); for (let r = 0; r < inv.length; r++) for (let k = 0; k < 7; k++) if (inv[r][k] === '#') PX(g, x + 1 + k, 7 + r, 0x5AE08A); F(g, x + 2, 15, 6, 1, A[3]); c.px += 13; }   // invader poster
    if (c.space() >= 12) { const x = c.px; F(g, x, 4, 10, 14, mixc(A[0], 0x101020, .3)); disc(g, x + 5, 9, 3, 0xF0A030, 0xFFD040, 0xFFF0A0); F(g, x + 2, 9, 3, 1, mixc(A[0], 0x101020, .3)); for (let k = 0; k < 3; k++) PX(g, x + 2 + k * 3, 15, 0xFFE0A0); c.px += 13; }   // the dot-eater poster
    if (c.space() >= 18) { const x = c.px; F(g, x, 17, 18, 1, D[2]); F(g, x, 18, 18, 1, D[0]); for (let k = 0; k < 7; k++) { const col = [A[1], 0x3A6AD0, 0xE8B830, 0x5A9A5A, A[2], 0xD8442A, 0x8A5AC8][k]; F(g, x + 1 + k * 2 + (k > 3 ? 1 : 0), 12 + (k % 3 === 1 ? 1 : 0), 2, 5 - (k % 3 === 1 ? 1 : 0), col); PX(g, x + 1 + k * 2 + (k > 3 ? 1 : 0), 13, mixc(col, 0xFFFFFF, .4)); } c.px += 20; }   // cartridges
    { const x = 1, top = yb - 30, body = mixc(A[0], 0x1A1A2E, .4);   // arcade cabinet
      F(g, x, top, 12, 30, body); F(g, x, top, 1, 30, mixc(body, 0xFFFFFF, .2)); F(g, x + 11, top, 1, 30, mixc(body, 0, .35)); F(g, x + 1, top + 1, 10, 3, A[3]); c.em(x + 2, top + 2, 8, 1, mixc(A[3], 0xFFFFFF, .4));
      F(g, x + 1, top + 5, 10, 8, M[0]); F(g, x + 2, top + 6, 8, 6, 0x101830); c.an({ k: 'arcade', x: x + 2, y: top + 6 }); F(g, x, top + 14, 12, 3, M[1]); F(g, x, top + 14, 12, 1, M[2]); PX(g, x + 3, top + 13, 0xE5342B); F(g, x + 3, top + 14, 1, 1, M[0]); PX(g, x + 7, top + 15, 0xFFC857); PX(g, x + 9, top + 15, 0x5AB8FF);
      F(g, x + 3, top + 19, 6, 4, mixc(body, 0, .3)); PX(g, x + 5, top + 20, 0xFFC857); c.li(x + 6, top + 9, 0x8AA8FF, 14, .35); c.spot(x + 6, 'arcade'); }
    { const x = W - 15, top = yb - 21;   // CRT TV on a low cabinet playing pong, console below
      F(g, x, yb - 8, 13, 8, D[1]); F(g, x, yb - 8, 13, 1, D[3]); F(g, x + 6, yb - 7, 1, 7, D[0]); F(g, x + 2, yb - 6, 4, 2, M[2]); F(g, x + 2, yb - 6, 4, 1, M[3]); c.em(x + 5, yb - 5, 1, 1, 0xE5342B);
      F(g, x, top, 13, 13, M[1]); F(g, x, top, 13, 1, M[2]); F(g, x + 1, top + 1, 11, 10, M[0]); F(g, x + 2, top + 2, 9, 7, 0x0A1A0E); F(g, x + 3, top + 11, 2, 1, M[2]); F(g, x + 8, top + 11, 2, 1, M[2]); line(g, x + 4, top - 1, x + 2, top - 5, M[2]); line(g, x + 8, top - 1, x + 10, top - 5, M[2]);
      c.an({ k: 'pong', x: x + 2, y: top + 2, w: 9, h: 7 }); c.li(x + 6, top + 6, 0x9AFFB0, 12, .3); }
  },
  /* the theme's own accent on whatever wall is left, and its plant by the window: the theme reads in every archetype */
  accent(g, P, room, c) {
    const d = P.decor, W = c.W;
    if (d === 'claude') { const hx2 = Math.min(W - 40, c.sign + 3); for (let i = 0; i < 9; i++) { PX(g, hx2 + Math.round(Math.sin(i * .9) * 1.5), 2 + i, P.plant[i % 2 ? 2 : 1]); if (i % 2) PX(g, hx2 + 1 + Math.round(Math.sin(i * .9) * 1.5), 2 + i, P.plant[3]); } if (c.space() > 10) { this.clock(g, P, c.px + 4, 7); c.px += 12; } }
    if (d === 'codex' && c.space() > 12) { this.poster(g, P, c.px, 4, 10, 13, [0x10A37F, 0x22262C, 0xF4F5F6]); c.px += 14; }
    if (d === 'gemini' && c.space() > 12) { this.poster(g, P, c.px, 4, 10, 13, [P.acc[0], P.acc[2], 0xFFE680]); c.px += 14; }
    if (d === 'grok' && c.space() > 16) { // one of three monochrome pieces per room, so the '42' plaque is a rare joke, not wallpaper
      const x = c.px, k = hsh(room.p.name + '#gk') % 3; F(g, x, 8, 13, 14, 0xF2F2F2); F(g, x + 1, 9, 11, 12, 0x0A0A0A);
      if (k === 0) drawText(g, '42', x + 3, 12, 0xF2F2F2, null);
      else if (k === 1) { for (const [sx, sy] of [[3, 11], [8, 10], [5, 15], [10, 14], [2, 18], [7, 19]]) PX(g, x + sx, sy, 0xF2F2F2); F(g, x + 6, 13, 3, 3, 0x8A8E96); PX(g, x + 6, 13, 0xF2F2F2); }   // starfield + moon
      else { F(g, x + 6, 11, 1, 7, 0xF2F2F2); F(g, x + 5, 13, 3, 4, 0xF2F2F2); PX(g, x + 4, 16, 0xC4CAD4); PX(g, x + 8, 16, 0xC4CAD4); PX(g, x + 6, 18, 0xFFB040); PX(g, x + 6, 19, 0xE5342B); }   // little rocket
      c.px += 17; }
    if (d === 'muse' && c.space() > 18) { const x = c.px; F(g, x, 6, 14, 10, P.trim[0]); F(g, x + 1, 7, 12, 8, 0xFFFFFF); vramp(g, x + 2, 8, 10, 6, [P.acc[1], P.acc[2], P.acc[3]]); F(g, x + 3, 10, 8, 2, 0xFFE8A0); room.lights.push([c.X + x + 7, c.Y + 4, 0xFFF0E0, 14, .3]); c.px += 19; }
    if (room.arch !== 'server') this.plant(g, P, W - (d === 'gemini' ? 12 : 11), d === 'gemini' ? 19 : d === 'codex' ? 21 : 22, d === 'gemini' ? 'float' : d === 'codex' || d === 'grok' ? 'snake' : 'monstera');
  },
  /* gap pieces: a table (nook) and a board on a stand, skinned per archetype */
  nook(g, P, tx, ry, arch) {
    const D = P.desk, C = P.chair, M = P.metal;
    if (arch === 'cafe') { F(g, tx + 8, ry - 2, 14, 2, D[3]); F(g, tx + 8, ry - 2, 14, 1, 0xFFFFFF); F(g, tx + 14, ry, 2, 12, M[1]); F(g, tx + 11, ry + 11, 8, 1, M[1]); F(g, tx + 10, ry - 5, 3, 3, 0xF4F4F0); F(g, tx + 17, ry - 4, 2, 2, P.pot[1]);
      for (const bx of [tx + 1, tx + 25]) { F(g, bx, ry - 6, 5, 1, M[2]); F(g, bx, ry - 6, 1, 8, M[2]); F(g, bx + 4, ry - 6, 1, 8, M[2]); F(g, bx, ry + 1, 5, 2, C[1]); F(g, bx, ry + 3, 1, 9, M[1]); F(g, bx + 4, ry + 3, 1, 9, M[1]); } return; }
    F(g, tx + 2, ry - 10, 4, 10, C[1]); F(g, tx + 24, ry - 10, 4, 10, C[1]); F(g, tx, ry - 2, 30, 4, D[2]); F(g, tx, ry - 2, 30, 1, D[3]); F(g, tx + 4, ry + 2, 2, 10, D[0]); F(g, tx + 24, ry + 2, 2, 10, D[0]);
    if (arch === 'war') { F(g, tx + 3, ry - 2, 24, 2, mixc(0x2E5A8A, P.acc[0], .2)); F(g, tx + 6, ry - 2, 5, 1, mixc(P.plant[2], 0xD8C890, .35)); F(g, tx + 15, ry - 2, 7, 1, mixc(P.plant[2], 0xD8C890, .35)); PX(g, tx + 9, ry - 3, 0xE5342B); PX(g, tx + 18, ry - 3, 0xE5342B); }
    else { F(g, tx + 10, ry - 5, 8, 3, M[1]); F(g, tx + 10, ry - 5, 8, 1, M[3]); F(g, tx + 21, ry - 4, 2, 2, P.pot[1]); F(g, tx + 5, ry - 4, 2, 2, 0xF4F4F0); }
    F(g, tx - 3, ry + 6, 5, 3, C[1]); F(g, tx + 28, ry + 6, 5, 3, C[1]);
  },
  board(g, P, bx, ry, arch) {
    const M = P.metal, face = arch === 'cafe' ? 0x24302A : arch === 'war' ? 0xC89A6A : arch === 'shop' ? mixc(P.desk[3], 0xC8A878, .45) : 0xFAFCFC;
    F(g, bx, ry - 22, 22, 14, arch === 'cafe' || arch === 'war' ? P.desk[0] : M[3]); F(g, bx + 1, ry - 21, 20, 12, face);
    if (arch === 'cafe') { drawText(g, 'SOUP', bx + 3, ry - 19, 0xF0EEE6, null); F(g, bx + 3, ry - 12, 14, 1, 0x9AA49E); }
    else if (arch === 'war') { F(g, bx + 3, ry - 19, 5, 4, 0xFFFFFF); F(g, bx + 12, ry - 18, 6, 4, 0xFFF4B0); F(g, bx + 6, ry - 13, 5, 3, 0xFFD0E0); line(g, bx + 5, ry - 17, bx + 14, ry - 16, 0xD8342A); line(g, bx + 5, ry - 17, bx + 8, ry - 12, 0xD8342A); }
    else if (arch === 'shop') { for (let yy = ry - 20; yy < ry - 10; yy += 3) for (let xx = bx + 2; xx < bx + 20; xx += 3) PX(g, xx, yy, mixc(face, P.desk[0], .3)); F(g, bx + 5, ry - 19, 1, 8, P.desk[0]); F(g, bx + 3, ry - 19, 5, 2, M[2]); line(g, bx + 10, ry - 12, bx + 15, ry - 19, M[3]); }
    else if (arch === 'lab') { drawText(g, 'E', bx + 3, ry - 20, 0x2A4A9A, null); F(g, bx + 7, ry - 19, 3, 1, 0x2E2E36); F(g, bx + 7, ry - 17, 3, 1, 0x2E2E36); drawText(g, 'MC', bx + 11, ry - 20, 0x2A4A9A, null); F(g, bx + 3, ry - 13, 14, 1, 0xC8342A); }
    else { F(g, bx + 3, ry - 19, 8, 1, 0x3A6AD0); F(g, bx + 3, ry - 17, 12, 1, 0x7A7A84); F(g, bx + 3, ry - 15, 6, 1, 0xC8342A); F(g, bx + 12, ry - 14, 6, 3, 0x2E8A5A); }
    F(g, bx + 4, ry - 8, 1, 18, M[1]); F(g, bx + 17, ry - 8, 1, 18, M[1]); F(g, bx + 2, ry + 9, 18, 1, M[1]);
  },
  /* spare width on a storey becomes a lounge: elevator, vending machine, sofa, water cooler, notice board */
  drawLounge(g, P, room, rr) {
    const X = room.x, Y = room.y, W = room.w, H = room.h, WH = this.G.WH, M = P.metal;
    g.save(); g.beginPath(); g.rect(X, Y, W, H); g.clip(); g.translate(X, Y);
    this.walls(g, P, W, H, rr);
    room.lamps = []; room.lights = []; room.anim = []; room.spots = [];
    let x = 6;
    room.elev = { x: 6 }; room.walk = { a: X + 17, b: X + Math.min(W - 26, 84), y: Y + WH + 6, elev: true };
    // elevator (sized for the 16x24 walker) with floor indicator, call button and a green exit sign
    F(g, x, 2, 23, WH + 2, M[1]); F(g, x + 1, 5, 21, WH - 2, M[2]); F(g, x + 11, 5, 1, WH - 2, M[0]); F(g, x + 1, 5, 21, 1, M[3]); F(g, x, 2, 23, 1, M[3]);
    F(g, x + 8, 0, 7, 2, 0x111111); this.emit.push([X + x + 9, Y + 0, 2, 1, 0xFFB040], [X + x + 12, Y + 0, 2, 1, 0xFFB040]);
    F(g, x + 25, 14, 2, 3, M[0]); this.emit.push([X + x + 25, Y + 14, 2, 1, 0xE8ECF0]);
    if (W > 120) { F(g, x + 30, 0, 9, 3, 0x0E5A2E); this.emit.push([X + x + 31, Y + 1, 7, 1, 0x5AF08A]); room.lights.push([X + x + 34, Y + 2, 0x5AF08A, 10, .35]); }
    x += 33;
    // vending machine (it glows at night)
    if (W - x > 20) { room.spots.push({ x: X + x + 7, k: 'vending' }); F(g, x, 6, 14, WH + 8, mixc(P.acc[0], 0x202020, .3)); F(g, x + 2, 8, 8, 16, 0xEAF4FF); for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) F(g, x + 3 + c * 2 + (c > 0 ? c - 1 : 0), 9 + r * 4, 1, 2, [0xE5342B, 0xFFC857, 0x5AD0C8, 0x7FE08A][(r + c) % 4]); F(g, x + 11, 10, 2, 6, M[2]); F(g, x + 2, WH + 2, 8, 3, M[0]);
      this.emit.push([X + x + 2, Y + 8, 8, 1, 0xFFFFFF]); room.lights.push([X + x + 7, Y + 16, 0xCFE8FF, 22, .45]); x += 18; }
    // water cooler
    if (W - x > 12) { room.spots.push({ x: X + x + 4, k: 'cooler' }); F(g, x + 1, 6, 6, 7, 0x9AD4F0); F(g, x + 1, 6, 2, 7, 0xC8ECFF); F(g, x, 13, 8, 15, 0xEDEDED); F(g, x, 13, 8, 1, 0xFFFFFF); PX(g, x + 2, 16, 0x3A7AE0); PX(g, x + 5, 16, 0xE5342B); x += 12; }
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
    room.lamps = []; room.lights = []; room.anim = []; room.spots = [];
    // wall cabinets + tiled backsplash
    F(g, 6, 4, Math.min(W - 40, 70), 9, D[1]); F(g, 6, 4, Math.min(W - 40, 70), 1, D[3]); for (let x = 6; x < 6 + Math.min(W - 40, 70); x += 14) { F(g, x, 4, 1, 9, D[0]); PX(g, x + 11, 9, D[3]); }
    for (let y = 14; y < WH - 2; y += 3) for (let x = 6; x < 6 + Math.min(W - 40, 70); x += 4) F(g, x, y, 3, 2, mixc(P.wall[3], 0xFFFFFF, .4));
    // counter
    const cw = Math.min(W - 40, 70); F(g, 6, WH - 6, cw, 3, D[3]); F(g, 6, WH - 3, cw, 13, D[1]); F(g, 6, WH - 3, cw, 1, D[0]); for (let x = 6; x < 6 + cw; x += 14) { F(g, x, WH - 3, 1, 13, D[0]); PX(g, x + 7, WH + 2, D[3]); }
    // coffee machine (steam), microwave, fruit bowl
    F(g, 10, WH - 16, 9, 10, 0x2A2A30); F(g, 11, WH - 15, 7, 3, 0x46464E); this.emit.push([X + 12, Y + WH - 14, 1, 1, 0x5AE08A]); F(g, 13, WH - 9, 3, 3, 0xF4F4F0); room.anim.push({ k: 'steam', x: 14, y: WH - 10 }); room.spots.push({ x: X + 15, k: 'coffee' });
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
  /* ---------- more filler rooms: meeting room, rec room, stairwell, library nook, phone booths, gym corner. Each one sets
     idle-walk spots (room.spots) and an ambient colleague's walk (room.walk) like the lounge and the kitchen ---------- */
  fillBegin(g, P, room, rr) {
    const W = room.w, H = room.h; g.save(); g.beginPath(); g.rect(room.x, room.y, W, H); g.clip(); g.translate(room.x, room.y);
    this.walls(g, P, W, H, rr, FILL_A[room.kind]); room.lamps = []; room.lights = []; room.anim = []; room.spots = []; room.sky = [];
    const X = room.x, Y = room.y;
    return { X, Y, W, H, WH: this.G.WH, em: (x, y, w, h, col) => this.emit.push([X + x, Y + y, w, h, col]), li: (x, y, col, r, a) => room.lights.push([X + x, Y + y, col, r, a]), spot: (x, k) => room.spots.push({ x: X + x, k }),
      downlights: (x0, step) => { for (let lx = x0; lx < W - 8; lx += step) { F(g, lx - 2, 1, 5, 1, P.metal[2]); this.emit.push([X + lx - 2, Y + 2, 5, 1, 0xFFF4E0]); room.lamps.push([X + lx, Y + 4]); } } };
  },
  drawMeeting(g, P, room, rr) {
    const c = this.fillBegin(g, P, room, rr), { W, H, WH } = c, M = P.metal, D = P.desk, C = P.chair;
    // glass partition to the corridor (frosted band), the wall screen cycling slides, a credenza
    const gb = mixc(P.wall[3], P.win[1], .3); F(g, 0, 3, W, 18, gb); for (let x = 3; x < W; x += 9) F(g, x, 4, 4, 16, mixc(gb, 0xFFFFFF, .18)); F(g, 0, 11, W, 2, mixc(0xFFFFFF, gb, .35)); for (let x = 2; x < W; x += 4) PX(g, x, 11, mixc(gb, P.acc[1], .4));
    for (let x = 0; x < W; x += 22) F(g, x, 3, 1, 18, M[2]); F(g, 0, 3, W, 1, M[2]); F(g, 0, 20, W, 1, M[2]);
    const sw = Math.min(36, W - 34), sx = (W - sw) >> 1; F(g, sx - 1, 3, sw + 2, 16, M[0]); F(g, sx, 4, sw, 14, 0x0E1218); room.anim.push({ k: 'slides', x: sx + 1, y: 5, w: sw - 2, h: 12 }); c.li(sx + sw / 2, 11, 0xDDE8FF, sw * .7, .35);
    F(g, sx - 4, WH - 7, sw + 8, 6, D[1]); F(g, sx - 4, WH - 7, sw + 8, 1, D[3]); F(g, sx + 2, WH - 9, 3, 2, P.plant[2]); F(g, sx + 2, WH - 8, 3, 1, P.pot[1]);
    // the table: chairs behind it, its top, chairs in front (backs to us)
    const tw = Math.min(W - 24, 66), tx = (W - tw) >> 1, ty = WH + 17;
    for (let cx2 = tx + 7; cx2 < tx + tw - 4; cx2 += 12) { F(g, cx2 - 4, ty - 9, 8, 9, C[1]); F(g, cx2 - 4, ty - 9, 8, 1, C[2]); F(g, cx2 + 3, ty - 8, 1, 8, C[0]); }
    F(g, tx, ty, tw, 3, D[2]); F(g, tx, ty, tw, 1, D[3]); F(g, tx + 1, ty + 3, tw - 2, 1, D[0]); F(g, tx + 4, ty + 3, 2, 12, D[0]); F(g, tx + tw - 6, ty + 3, 2, 12, D[0]);
    F(g, tx + 6, ty - 4, 7, 4, M[1]); F(g, tx + 7, ty - 3, 5, 2, P.scr); F(g, tx + 5, ty - 1, 9, 1, M[2]); F(g, tx + 18, ty - 4, 2, 4, 0x9AD4F0); PX(g, tx + 18, ty - 5, 0x3A6AD0); F(g, tx + tw - 14, ty - 1, 5, 1, 0xFFFFFF);
    F(g, tx + (tw >> 1) - 3, ty - 2, 6, 2, M[0]); c.em(tx + (tw >> 1), ty - 2, 1, 1, 0x5AE08A);
    for (let cx2 = tx + 12; cx2 < tx + tw - 8; cx2 += 18) { F(g, cx2 - 5, ty + 7, 10, 11, C[0]); F(g, cx2 - 5, ty + 7, 10, 1, C[1]); F(g, cx2 - 5, ty + 7, 1, 11, C[1]); F(g, cx2 - 1, ty + 18, 2, 3, M[1]); F(g, cx2 - 4, ty + 21, 8, 1, M[0]); }
    this.clock(g, P, W - 8, 8);
    c.downlights(16, 30); c.spot(sx + sw / 2, 'meet');
    room.walk = { a: room.x + 8, b: room.x + sx + (sw >> 1) - 6, y: room.y + WH + 6 };
    g.restore();
  },
  drawRec(g, P, room, rr) {
    const c = this.fillBegin(g, P, room, rr), { W, H, WH } = c, M = P.metal, A = P.acc;
    for (let x = 4, k = 0; x < W - 6; x += 7, k++) { const col = [A[1], 0xFFC857, A[2], 0x5AB8FF][k % 4], sag = Math.round(Math.sin((x / W) * Math.PI) * 2); PX(g, x, 2 + sag, M[1]); F(g, x + 1, 3 + sag, 4, 1, col); F(g, x + 2, 4 + sag, 2, 1, col); PX(g, x + 2, 5 + sag, col); }   // pennant string
    { const x = 6, body = mixc(A[0], 0x1A1A2E, .4); F(g, x, 6, 13, WH + 2, body); F(g, x, 6, 1, WH + 2, mixc(body, 0xFFFFFF, .2)); F(g, x + 1, 7, 11, 3, A[3]); c.em(x + 2, 8, 9, 1, mixc(A[3], 0xFFFFFF, .4));   // arcade cabinet
      F(g, x + 1, 11, 11, 8, M[0]); F(g, x + 2, 12, 9, 6, 0x101830); room.anim.push({ k: 'arcade', x: x + 2, y: 12 }); F(g, x, 20, 13, 3, M[1]); PX(g, x + 3, 19, 0xE5342B); PX(g, x + 8, 21, 0xFFC857); PX(g, x + 10, 21, 0x5AB8FF); c.li(x + 6, 15, 0x8AA8FF, 16, .4); c.spot(x + 6, 'arcade'); }
    if (W > 110) { const x = W - 28, y = 11; disc(g, x, y, 5, 0x1A1A1A, 0x2A2A2A, 0x3A3A3A); disc(g, x, y, 4, 0xC8342A, 0xD84A3A, 0xE86A5A); disc(g, x, y, 3, 0xEDE4D0, 0xF4ECD8, 0xFFF8E8); disc(g, x, y, 1, 0x2E8A4A, 0x3EA05A, 0x5AC07A); PX(g, x, y, 0xC8342A); line(g, x + 1, y - 1, x + 4, y - 4, M[3]); PX(g, x + 5, y - 5, A[1]); }   // dartboard
    // ping-pong table, the ball arcs over the net
    const tw = Math.min(40, W - 56), tx = 26 + ((W - 56 - tw) >> 1), ty = WH + 18, top = mixc(A[0], 0x1E4A6A, .55);
    F(g, tx, ty, tw, 2, top); F(g, tx, ty, tw, 1, 0xF4F4F0); F(g, tx, ty + 2, tw, 1, mixc(top, 0, .35)); F(g, tx + (tw >> 1), ty - 3, 1, 3, 0xF4F4F0); F(g, tx + (tw >> 1) - 1, ty - 3, 3, 1, M[2]);
    F(g, tx + 3, ty + 3, 1, 10, M[1]); F(g, tx + tw - 4, ty + 3, 1, 10, M[1]); F(g, tx + (tw >> 1) - 4, ty + 3, 1, 10, M[1]); F(g, tx + (tw >> 1) + 4, ty + 3, 1, 10, M[1]);
    F(g, tx + 2, ty - 1, 3, 1, 0xC8342A); PX(g, tx + 5, ty - 1, M[0]); F(g, tx + tw - 5, ty - 1, 3, 1, 0x2A2A2A);
    room.anim.push({ k: 'pp', x: tx + 4, y: ty - 2, w: tw - 8, ph: (room.i * .41) % 2 }); c.spot(tx + (tw >> 1), 'pp');
    // beanbags
    for (const [bx, col] of [[W - 26, A[1]], [W - 14, P.books[1 % P.books.length]]]) { const by = H - 12; F(g, bx - 4, by - 4, 9, 7, col); F(g, bx - 5, by - 2, 11, 5, col); F(g, bx - 3, by - 5, 6, 1, mixc(col, 0xFFFFFF, .3)); F(g, bx - 4, by - 4, 3, 2, mixc(col, 0xFFFFFF, .2)); F(g, bx - 5, by + 3, 11, 1, mixc(col, 0, .35)); }
    c.downlights(30, 40);
    room.walk = { a: room.x + W - 6, b: room.x + 24, y: room.y + WH + 6 };
    g.restore();
  },
  drawStair(g, P, room, rr) {
    const c = this.fillBegin(g, P, room, rr), { W, H, WH } = c, M = P.metal, f = P.floor, t = P.trim;
    // fire door + exit sign, extinguisher
    F(g, 3, 5, 16, WH - 3, t[1]); F(g, 4, 6, 14, WH - 4, mixc(M[2], P.acc[0], .25)); F(g, 4, 6, 14, 1, mixc(M[3], P.acc[0], .2)); F(g, 8, 9, 6, 6, mixc(P.win[1], 0xFFFFFF, .2)); F(g, 8, 9, 6, 1, M[1]); PX(g, 10, 11, M[1]); PX(g, 12, 13, M[1]); F(g, 5, 18, 12, 2, M[3]); F(g, 5, 19, 12, 1, M[1]);
    F(g, 6, 1, 10, 4, 0x0E5A2E); c.em(7, 2, 8, 2, 0x2AC060); c.em(9, 2, 1, 1, 0xEFFFF2); c.em(8, 3, 2, 1, 0xEFFFF2); c.em(12, 2, 2, 1, 0xEFFFF2); c.em(13, 3, 1, 1, 0xEFFFF2); c.li(11, 3, 0x5AF08A, 12, .45);
    F(g, 21, 15, 4, 9, 0xC8342A); F(g, 21, 15, 1, 9, 0xE85A4A); F(g, 22, 13, 2, 2, 0x2A2A2A); line(g, 24, 13, 25, 18, 0x2A2A2A); F(g, 20, 19, 6, 1, M[2]); F(g, 21, 8, 4, 4, 0xC8342A); PX(g, 22, 9, 0xFFFFFF); PX(g, 23, 10, 0xFFFFFF);
    // switchback stairs: the back flight from the landing up to the ceiling (darker), the front flight from the floor up to the landing
    const x0 = 30, x1 = W - 3, Hm = Math.round(H * .5), n = Math.max(5, Math.round((x1 - x0) / 5)), side = mixc(P.wall[1], t[1], .45), sideB = mixc(side, 0, .3), tread = f[3], treadB = mixc(f[3], 0, .25);
    const flight = (xa, ya, xb, yb2, sd, tr, under) => { for (let i = 0; i < n; i++) { const sxa = Math.round(xa + (xb - xa) * i / n), sxb = Math.round(xa + (xb - xa) * (i + 1) / n), sy = Math.round(ya + (yb2 - ya) * (i + 1) / n), L = Math.min(sxa, sxb), w = Math.abs(sxb - sxa) + 1;
      F(g, L, sy, w, under ? under - sy : 5, sd); F(g, L, sy, w, 1, tr); PX(g, xb > xa ? L : L + w - 1, sy, mixc(tr, 0xFFFFFF, .3)); } };
    flight(x0, Hm, x1, 1, sideB, treadB, 0); line(g, x0, Hm - 8, x1, -6, mixc(M[2], 0, .25));
    F(g, x0 - 8, Hm, 10, 3, tread); F(g, x0 - 8, Hm + 3, 10, 3, side);
    flight(x1, H - 3, x0, Hm, side, tread, H); line(g, x1, H - 11, x0, Hm - 8, M[3]); for (let i = 0; i <= n; i += 2) { const bx = Math.round(x1 + (x0 - x1) * i / n), by = Math.round(H - 3 + (Hm - H + 3) * i / n); F(g, bx, by - 7, 1, 7, M[2]); }
    F(g, (x0 + x1) >> 1, H - 10, 5, 7, mixc(side, 0, .25)); F(g, ((x0 + x1) >> 1) + 1, H - 9, 3, 1, mixc(side, 0xFFFFFF, .15));   // a hatch under the stairs
    F(g, 22, 1, 5, 2, M[1]); c.em(23, 3, 3, 1, 0xFFF4E0); room.lamps.push([room.x + 24, room.y + 4]);
    c.spot(11, 'door'); room.walk = { a: room.x + 11, b: room.x + 24, y: room.y + WH + 6 };
    g.restore();
  },
  drawNook(g, P, room, rr) {
    const c = this.fillBegin(g, P, room, rr), { W, H, WH } = c, M = P.metal, D = P.desk, C = P.chair, A = P.acc;
    for (let x = 4; x + 20 <= W - 24; x += 21) this.bookshelf(g, P, x, 3, rr);   // wall-to-wall shelves
    line(g, 28, 2, 21, WH + 8, D[0]); line(g, 32, 2, 25, WH + 8, D[0]); for (let k = 1; k < 9; k++) { const yy = 2 + k * 4; F(g, Math.round(28 - k * .7 * 1.1), yy, 4, 1, D[2]); }   // rolling ladder
    F(g, 26, 1, 8, 1, M[2]);
    const ax = W - 30, ay = H - 26;   // armchair, floor lamp, side table with tea
    F(g, ax, ay, 18, 12, C[1]); F(g, ax, ay, 18, 1, C[2]); F(g, ax - 2, ay + 5, 4, 10, C[0]); F(g, ax + 16, ay + 5, 4, 10, C[0]); F(g, ax + 1, ay + 10, 16, 5, C[1]); F(g, ax + 4, ay + 3, 10, 6, A[2]); F(g, ax + 4, ay + 3, 10, 1, mixc(A[2], 0xFFFFFF, .3)); F(g, ax - 1, ay + 15, 2, 3, D[0]); F(g, ax + 17, ay + 15, 2, 3, D[0]);
    const lx = W - 7; F(g, lx - 2, H - 7, 5, 1, M[1]); F(g, lx, H - 34, 1, 27, M[2]); F(g, lx - 3, H - 39, 7, 5, A[1]); F(g, lx - 2, H - 40, 5, 1, A[2]); c.em(lx - 2, H - 34, 5, 1, 0xFFE6B0); c.li(lx, H - 30, P.lamp, 24, .5);
    const tx = ax - 12; F(g, tx, H - 16, 8, 2, D[2]); F(g, tx, H - 16, 8, 1, D[3]); F(g, tx + 3, H - 14, 2, 8, D[0]); F(g, tx + 2, H - 19, 3, 3, 0xF4F4F0); PX(g, tx + 5, H - 18, 0xF4F4F0); room.anim.push({ k: 'steam', x: tx + 3, y: H - 20 });
    c.downlights(20, 50); c.spot(14, 'shelf');
    room.walk = { a: room.x + W - 6, b: room.x + 18, y: room.y + WH + 6 };
    g.restore();
  },
  drawBooths(g, P, room, rr) {
    const c = this.fillBegin(g, P, room, rr), { W, H, WH } = c, M = P.metal, D = P.desk, C = P.chair, A = P.acc;
    const bw = 18, gap = 4, n = Math.max(1, Math.min(3, Math.floor((W - 12) / (bw + gap)))), x0 = (W - n * bw - (n - 1) * gap) >> 1, fr = mixc(A[0], P.trim[1], .4), foam = mixc(P.wall[0], P.trim[0], .5), gl = mixc(P.win[1], 0xFFFFFF, .3);
    for (let i = 0; i < n; i++) {   // a cabin: cap with a phone plate, side depth, a glazed door showing the foam-lined inside (shelf, laptop, stool), solid kick panel
      const bx = x0 + i * (bw + gap), frd = mixc(fr, 0, .35), ins = mixc(foam, 0xFFE6B0, .12);
      F(g, bx, 4, bw, WH + 5, fr); F(g, bx + bw, 5, 2, WH + 4, frd); F(g, bx - 1, 2, bw + 2, 3, frd); F(g, bx - 1, 2, bw + 2, 1, mixc(fr, 0xFFFFFF, .3)); F(g, bx + bw + 1, 3, 1, 2, frd);
      F(g, bx + 5, 5, bw - 10, 3, M[0]); PX(g, bx + 7, 6, 0xF4F4F0); PX(g, bx + 8, 7, 0xF4F4F0); PX(g, bx + 9, 7, 0xF4F4F0); PX(g, bx + 10, 6, 0xF4F4F0);
      F(g, bx + 2, 9, bw - 4, 21, ins); for (let y = 10; y < 29; y += 3) for (let x = bx + 3 + ((y / 3) % 2); x < bx + bw - 3; x += 3) { PX(g, x, y, mixc(ins, 0xFFFFFF, .1)); PX(g, x + 1, y + 1, mixc(ins, 0, .2)); }
      F(g, bx + 6, 9, 6, 1, 0xFFE6B0); F(g, bx + 3, 20, bw - 6, 1, D[2]); F(g, bx + 5, 17, 6, 3, M[1]); F(g, bx + 6, 18, 4, 1, P.scr); F(g, bx + 6, 25, 6, 2, C[1]); F(g, bx + 6, 25, 6, 1, C[2]); F(g, bx + 8, 27, 2, 3, M[1]);
      F(g, bx + 2, 9, 1, 21, mixc(gl, ins, .5)); line(g, bx + 4, 15, bx + 8, 10, mixc(ins, 0xFFFFFF, .45)); line(g, bx + 5, 19, bx + 11, 11, mixc(ins, 0xFFFFFF, .3));
      F(g, bx + 2, 30, bw - 4, 7, mixc(fr, 0xFFFFFF, .12)); F(g, bx + 2, 30, bw - 4, 1, frd); F(g, bx + 3, 35, bw - 6, 1, M[2]); F(g, bx + bw - 4, 19, 1, 5, M[3]);
      if (P.night) this.emit.push([c.X + bx + 6, c.Y + 9, 6, 1, 0xFFE6B0]);
      F(g, bx + (bw >> 1) - 2, 0, 5, 2, M[0]); room.anim.push({ k: 'booth', x: bx + (bw >> 1) - 1, y: 1, ph: (i * .37 + room.i * .13) % 1, i });
      F(g, bx - 1, WH + 9, bw + 3, 1, M[0]);
    }
    if (W - (x0 + n * (bw + gap)) > 24 && n < 3) drawText(g, 'QUIET', x0 + n * (bw + gap) + 1, 8, mixc(P.trim[0], P.wall[2], .3), null);
    c.downlights(12, 44); c.spot(x0 + (bw >> 1), 'booth');
    room.walk = { a: room.x + W - 6, b: room.x + x0 + bw + 2, y: room.y + WH + 8 };
    g.restore();
  },
  drawGym(g, P, room, rr) {
    const c = this.fillBegin(g, P, room, rr), { W, H, WH } = c, M = P.metal, A = P.acc;
    const mw = Math.min(W - 40, 54), rw = mixc(P.wall[2], P.win[1], .3), rf = mixc(mixc(P.floor[0], M[0], .5), P.win[1], .3);   // mirror: the room's own bands, flipped
    F(g, 5, 2, mw + 2, 24, M[1]); F(g, 5, 2, mw + 2, 1, M[3]); F(g, 6, 3, mw, 12, rw); F(g, 6, 15, mw, 2, mixc(P.trim[0], P.win[1], .3)); F(g, 6, 17, mw, 8, rf); for (let x = 8; x < 6 + mw; x += 9) F(g, x, 17, 1, 8, mixc(rf, 0, .2));
    for (let x = 12; x < 6 + mw - 8; x += 24) { line(g, x, 23, x + 8, 5, mixc(rw, 0xFFFFFF, .5)); line(g, x + 3, 23, x + 10, 8, mixc(rw, 0xFFFFFF, .3)); }
    const tx = 8, ty = H - 13;   // treadmill: the belt runs, the console glows
    F(g, tx, ty, 32, 3, M[0]); F(g, tx, ty + 3, 32, 2, M[2]); F(g, tx, ty + 3, 32, 1, M[3]); PX(g, tx + 1, ty + 5, M[0]); PX(g, tx + 24, ty + 5, M[0]); room.anim.push({ k: 'belt', x: tx + 1, y: ty - 1, w: 24 });
    F(g, tx + 26, ty - 4, 8, 7, M[1]); F(g, tx + 26, ty - 4, 8, 1, M[3]); F(g, tx + 29, ty - 20, 2, 16, M[2]); F(g, tx + 24, ty - 24, 10, 5, M[1]); F(g, tx + 24, ty - 24, 10, 1, M[3]); F(g, tx + 25, ty - 23, 8, 2, P.scr); c.em(tx + 25, ty - 23, 6, 1, P.code[0]);
    F(g, tx + 17, ty - 14, 13, 1, M[3]); F(g, tx + 17, ty - 14, 1, 3, M[3]);
    if (W > 112) { const bx = tx + 44; F(g, bx, H - 17, 16, 3, P.chair[1]); F(g, bx, H - 17, 16, 1, P.chair[2]); F(g, bx + 2, H - 14, 2, 8, M[1]); F(g, bx + 12, H - 14, 2, 8, M[1]);   // weight bench + barbell
      F(g, bx + 1, H - 29, 1, 12, M[2]); F(g, bx + 14, H - 29, 1, 12, M[2]); F(g, bx - 4, H - 29, 24, 1, M[3]); F(g, bx - 4, H - 32, 2, 7, M[0]); F(g, bx + 18, H - 32, 2, 7, M[0]); F(g, bx - 2, H - 31, 1, 5, M[1]); F(g, bx + 17, H - 31, 1, 5, M[1]); }
    const rx = W - 32; F(g, rx, WH - 4, 18, 2, M[1]); F(g, rx, WH + 4, 18, 2, M[1]); F(g, rx + 1, WH - 4, 1, 14, M[2]); F(g, rx + 16, WH - 4, 1, 14, M[2]);   // dumbbell rack
    for (let k = 0; k < 3; k++) for (const ly of [WH - 7, WH + 1]) { const dx = rx + 2 + k * 5; F(g, dx, ly, 1, 3, M[0]); F(g, dx + 1, ly + 1, 2, 1, M[3]); F(g, dx + 3, ly, 1, 3, M[0]); }
    disc(g, W - 22, H - 12, 6, mixc(A[1], 0, .3), A[1], mixc(A[1], 0xFFFFFF, .35));
    F(g, W - 13, H - 10, 4, 7, A[2]); F(g, W - 13, H - 10, 4, 1, mixc(A[2], 0xFFFFFF, .35)); F(g, W - 12, H - 7, 2, 1, mixc(A[2], 0, .3));   // rolled mat
    const wx = W - 10; F(g, wx, 9, 6, 11, M[3]); F(g, wx, 9, 6, 1, 0xFFFFFF); F(g, wx + 1, 11, 4, 3, M[0]); c.em(wx + 2, 12, 2, 1, 0x5AB8FF); F(g, wx + 2, 15, 2, 1, M[1]); F(g, wx + 1, 19, 4, 1, M[1]);   // bottle filler
    c.downlights(18, 40); c.spot(wx + 3, 'cooler');
    room.walk = { a: room.x + W - 6, b: room.x + wx - 4, y: room.y + WH + 6 };
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
  /* chairs. x = seat centre, Y = the desk-top line. Seated, the sprite hides the back; pushed back (away) the chair moves back
     and up, its seat shows; under an open desk front the base shows (it moves with the chair) */
  chair(g, P, x, Y, st, away, kid, open) {
    const C = P.chair, M = P.metal, A = P.acc, X = x + (away ? (kid ? 3 : 4) : 0), B = Y + (away ? (kid ? -2 : -3) : 0), fl = Y + (kid ? 12 : 15);
    if (st === 'ball') { disc(g, X + (away ? 2 : 0), fl - 9, 9, mixc(A[1], 0, .3), A[1], mixc(A[1], 0xFFFFFF, .35)); return; }
    if (open) {
      if (st === 'stool') { const w2 = kid ? 4 : 5; line(g, X - w2 + 1, B - (kid ? 6 : 9), X - w2 - 2, fl, M[2]); line(g, X + w2 - 1, B - (kid ? 6 : 9), X + w2 + 2, fl, M[2]); F(g, X - w2, Y + 7, w2 * 2, 1, M[1]); }
      else { F(g, X - 1, Y + 4, 2, fl - Y - 6, M[1]); F(g, X - (kid ? 6 : 9), fl - 2, kid ? 12 : 18, 1, M[0]); for (const dx of kid ? [-6, 0, 5] : [-9, -1, 8]) PX(g, X + dx, fl - 1, M[0]); }
    }
    if (st === 'stool') { const w = kid ? 10 : 12, sy = B - (kid ? 8 : 12); line(g, X - (w >> 1) + 2, sy + 3, X - (w >> 1), Y, M[2]); line(g, X + (w >> 1) - 3, sy + 3, X + (w >> 1) - 1, Y, M[2]); F(g, X - (w >> 1) + 1, Y - (kid ? 3 : 4), w - 2, 1, M[1]); F(g, X - (w >> 1), sy, w, 3, C[1]); F(g, X - (w >> 1), sy, w, 1, C[2]); F(g, X - (w >> 1), sy + 2, w, 1, C[0]); return; }
    if (kid) {
      if (st === 'gaming') { F(g, X - 5, B - 19, 10, 1, C[2]); F(g, X - 6, B - 18, 12, 18, C[0]); F(g, X - 6, B - 18, 2, 18, A[1]); F(g, X + 4, B - 18, 2, 18, A[1]); F(g, X - 3, B - 16, 6, 2, A[2]); F(g, X - 3, B - 13, 6, 10, C[1]); if (away) { F(g, X - 7, Y - 2, 14, 2, C[0]); F(g, X - 7, Y - 2, 14, 1, A[1]); } return; }
      F(g, X - 6, B - 15, 12, 1, C[2]); F(g, X - 7, B - 14, 14, 14, C[1]); F(g, X - 7, B - 14, 1, 14, C[2]); F(g, X + 6, B - 14, 1, 14, C[0]);
      if (away) { F(g, X - 7, Y - 2, 14, 2, C[1]); F(g, X - 7, Y - 2, 14, 1, C[2]); } return;
    }
    if (st === 'gaming') { F(g, X - 7, B - 29, 14, 1, C[2]); F(g, X - 9, B - 28, 18, 28, C[0]); F(g, X - 9, B - 28, 2, 28, A[1]); F(g, X + 7, B - 28, 2, 28, A[1]); F(g, X - 9, B - 28, 1, 28, A[2]); F(g, X - 11, B - 21, 2, 9, C[0]); F(g, X + 9, B - 21, 2, 9, C[0]);
      F(g, X - 5, B - 26, 10, 24, C[1]); F(g, X - 5, B - 26, 10, 1, C[2]); F(g, X - 4, B - 25, 8, 3, A[2]); F(g, X - 4, B - 12, 8, 3, A[1]);
      if (away) { F(g, X - 10, Y - 3, 20, 3, C[0]); F(g, X - 10, Y - 3, 20, 1, A[1]); F(g, X + 8, Y - 3, 2, 3, mixc(C[0], 0, .3)); } return; }
    if (st === 'mesh') { const mc = mixc(C[1], C[2], .45), ml = mixc(C[1], C[0], .25); F(g, X - 8, B - 23, 16, 1, C[0]); F(g, X - 10, B - 22, 20, 21, C[0]); F(g, X - 9, B - 21, 18, 17, mc); for (let i = 0; i < 8; i++) F(g, X - 9, B - 20 + i * 2, 18, 1, ml); F(g, X - 9, B - 21, 1, 17, mixc(mc, 0xFFFFFF, .3)); F(g, X - 9, B - 9, 18, 2, C[0]);
      if (away) { F(g, X - 9, Y - 3, 18, 3, C[0]); F(g, X - 9, Y - 3, 18, 1, C[1]); } return; }
    F(g, X - 9, B - 23, 18, 1, C[2]); F(g, X - 11, B - 22, 22, 22, C[1]); F(g, X - 11, B - 22, 2, 22, C[2]); F(g, X + 9, B - 22, 2, 22, C[0]);
    F(g, X - 9, B - 15, 18, 1, C[0]); F(g, X - 9, B - 14, 18, 1, C[2]); for (let i = 0; i < 3; i++) { PX(g, X - 6 + i * 6, B - 19, C[0]); PX(g, X - 6 + i * 6, B - 9, C[0]); }
    if (away) { F(g, X - 10, Y - 3, 20, 3, C[1]); F(g, X - 10, Y - 3, 20, 1, C[2]); F(g, X + 8, Y - 3, 2, 3, C[0]); }
  },
  leadDesk(g, fr, P, s2, away) {
    const G = this.G, x = s2.x, y = s2.y, D = P.desk, M = P.metal, A = P.acc, pl = P.plant, cx = G.cx, DT = G.DT, SW = G.SW, v = s2.dv, o = s2.o, [mx, my, mw, mh] = o.mon, Y = y + DT, X = x + mx, MY = y + my;
    this.chair(g, P, x + cx, Y, v.chair, away, false, v.front === 'open' || v.front === 'trestle');
    // desk top (an L desk's return reads as a deeper top on the right)
    F(g, x + 1, Y, SW - 2, 6, D[2]); F(g, x + 1, Y, SW - 2, 1, D[3]); F(g, x + 1, Y + 5, SW - 2, 1, D[3]);
    for (let i = 0; i < SW / 10; i++) PX(g, x + 5 + i * 10 + (i % 2) * 3, Y + 2 + (i % 2), D[1]);
    if (v.front === 'L') { F(g, x + cx + 11, Y - 2, SW - cx - 12, 2, D[2]); F(g, x + cx + 11, Y - 2, SW - cx - 12, 1, D[3]); }
    // keyboard
    F(g, x + cx - 9, Y + 1, 16, 3, M[1]); for (let i = 0; i < 7; i++) PX(g, x + cx - 8 + i * 2, Y + 1, M[3]); F(g, x + cx - 8, Y + 2, 14, 1, M[2]); F(g, x + cx - 9, Y + 4, 16, 1, mixc(D[2], 0, .3));
    // monitor(s): flat panel / dual on an arm / ultrawide / laptop on a riser / a deep CRT
    const pan = (px, py, w, h, s) => { F(g, px, py, w, h, M[0]); F(g, px + 1, py + 1, w - 2, h - 2, M[1]); F(g, px + 1, py + 1, w - 2, 1, M[3]); F(g, px + w - 1, py + 1, 1, h - 2, M[0]); F(g, x + s[0], y + s[1], s[2], s[3], P.scr); };
    if (v.mon === 'laptop') {
      for (let i = 0; i < 5; i++) { PX(g, X + 2 + i, Y - 5 + i, M[1]); PX(g, X + mw - 3 - i, Y - 5 + i, M[1]); } F(g, X - 1, MY + mh, mw + 2, 2, M[2]); F(g, X - 1, MY + mh, mw + 2, 1, M[3]); F(g, X + 1, MY + mh + 1, mw - 2, 1, M[1]);
      F(g, X, MY, mw, mh, M[1]); F(g, X, MY, mw, 1, M[3]); F(g, X + mw - 1, MY + 1, 1, mh - 1, M[0]); F(g, x + o.scr[0], y + o.scr[1], o.scr[2], o.scr[3], P.scr);
    } else if (v.mon === 'crt') {
      const cb = mixc(M[3], 0xE6DCC2, .55), cs = mixc(cb, M[1], .45);
      F(g, X + mw, MY + 2, 3, mh - 4, cs); F(g, X + mw, MY + 2, 3, 1, cb); F(g, X, MY, mw, mh, cb); F(g, X, MY, mw, 1, mixc(cb, 0xFFFFFF, .4)); F(g, X + mw - 1, MY + 1, 1, mh - 1, cs);
      F(g, X + 1, MY + 1, mw - 2, 12, mixc(cb, M[0], .6)); F(g, x + o.scr[0], y + o.scr[1], o.scr[2], o.scr[3], P.scr); PX(g, x + o.scr[0], y + o.scr[1], mixc(cb, M[0], .6)); PX(g, x + o.scr[0] + o.scr[2] - 1, y + o.scr[1], mixc(cb, M[0], .6));
      F(g, X + 3, MY + mh - 2, 4, 1, cs); if (!away) this.emit.push([X + mw - 3, MY + mh - 2, 1, 1, 0x5AE08A]); F(g, X + 2, Y - 2, mw - 4, 2, cs);
    } else {
      if (v.mon === 'dual') { const ax = X - 2; F(g, ax, y + DT - 28, 1, 28, M[2]); F(g, ax - 1, Y - 1, 4, 1, M[1]); F(g, ax, MY + 6, 2, 1, M[2]); F(g, ax, y + DT - 25, 2, 1, M[2]); pan(x + cx - 31, y + DT - 31, 15, 10, o.scr2); }
      else { const nx = X + (mw >> 1) - 1; F(g, nx, MY + mh, 2, Y - MY - mh, M[2]); F(g, nx - 3, Y, 8, 2, M[1]); F(g, nx - 3, Y, 8, 1, M[3]); }
      pan(X, MY, mw, mh, o.scr); if (v.mon === 'std') PX(g, X + (mw >> 1), MY + mh - 3, M[3]);
    }
    const r = hsh(s2.n.id); if (r % 2) { F(g, X + mw - 3, MY - 1, 3, 3, 0xFFE38A); F(g, X + mw - 3, MY - 1, 3, 1, 0xFFF4C0); } if (r % 3 === 0) { F(g, X - 1, MY + 3, 2, 3, 0xFFB0C8); }
    // the "tool" machine at the right, button on its left face where the arm reaches
    const bx = x + cx + 19, by = y + DT - 16;
    F(g, bx, by, 13, 18, M[1]); F(g, bx, by, 13, 1, M[3]); F(g, bx, by, 1, 18, M[3]); F(g, bx + 12, by, 1, 18, M[0]);
    for (let i = 0; i < 4; i++) F(g, bx + 3, by + 10 + i * 2, 7, 1, M[0]);
    F(g, bx + 1, by + 7, 3, 3, A[1]); PX(g, bx + 1, by + 7, A[3]); PX(g, bx + 3, by + 9, A[0]);
    F(g, bx, by + 18, 13, 1, mixc(D[2], 0, .35));
    // desk things: on the tower (tt), at the right end (re), a lamp at the left end (le)
    const tx = bx, ty = by, rx = x + cx + 33;
    if (v.tt === 'figure') { F(g, tx + 4, ty - 7, 4, 3, A[2]); F(g, tx + 4, ty - 7, 4, 1, A[3]); PX(g, tx + 5, ty - 6, 0x222222); PX(g, tx + 7, ty - 6, 0x222222); PX(g, tx + 5, ty - 8, A[3]); F(g, tx + 4, ty - 4, 4, 3, A[1]); PX(g, tx + 3, ty - 3, A[1]); PX(g, tx + 8, ty - 3, A[1]); PX(g, tx + 5, ty - 3, A[3]); }
    if (v.tt === 'plant') { F(g, tx + 7, ty - 3, 4, 3, P.pot[1]); F(g, tx + 7, ty - 3, 4, 1, P.pot[2]); PX(g, tx + 8, ty - 4, pl[2]); PX(g, tx + 9, ty - 5, pl[3]); PX(g, tx + 7, ty - 5, pl[1]); PX(g, tx + 10, ty - 4, pl[2]); for (let i = 0; i < 5; i++) PX(g, tx + 11 + (i % 2), ty - 1 + i * 2, pl[i % 2 ? 2 : 1]); }
    if (v.tt === 'duck') { F(g, tx + 5, ty - 3, 5, 3, 0xF2C230); F(g, tx + 7, ty - 5, 3, 2, 0xF2C230); PX(g, tx + 10, ty - 4, 0xE07A20); PX(g, tx + 8, ty - 5, 0x222222); PX(g, tx + 5, ty - 3, 0xFFE680); F(g, tx + 5, ty - 1, 5, 1, 0xD8A020); }
    if (v.tt === 'photo') { F(g, tx + 3, ty - 6, 6, 6, D[0]); F(g, tx + 4, ty - 5, 4, 4, mixc(P.win[0], 0xFFFFFF, .25)); PX(g, tx + 4, ty - 2, pl[2]); PX(g, tx + 5, ty - 3, pl[2]); PX(g, tx + 6, ty - 2, pl[1]); PX(g, tx + 7, ty - 5, 0xFFE680); }
    if (v.re === 'succulent') { F(g, rx + 1, Y - 3, 4, 3, P.pot[1]); F(g, rx, Y - 4, 6, 1, P.pot[2]); PX(g, rx + 1, Y - 5, pl[2]); PX(g, rx + 2, Y - 6, pl[3]); PX(g, rx + 3, Y - 5, pl[1]); PX(g, rx + 4, Y - 6, pl[2]); PX(g, rx + 2, Y - 5, pl[1]); PX(g, rx + 3, Y - 7, pl[3]); }
    if (v.re === 'phones') { F(g, rx + 2, Y - 9, 1, 9, M[2]); F(g, rx, Y - 1, 5, 1, M[1]); F(g, rx, Y - 12, 5, 1, M[1]); PX(g, rx - 1, Y - 11, M[1]); PX(g, rx + 5, Y - 11, M[1]); F(g, rx - 1, Y - 10, 2, 4, A[1]); F(g, rx + 4, Y - 10, 2, 4, A[1]); PX(g, rx - 1, Y - 10, A[2]); }
    if (v.re === 'books') { const bk = P.books; F(g, rx, Y - 7, 2, 7, bk[0]); F(g, rx + 2, Y - 6, 2, 6, bk[1 % bk.length]); F(g, rx + 4, Y - 8, 2, 8, bk[2 % bk.length]); PX(g, rx, Y - 7, mixc(bk[0], 0xFFFFFF, .35)); PX(g, rx + 4, Y - 8, mixc(bk[2 % bk.length], 0xFFFFFF, .35)); }
    if (v.re === 'cactus') { F(g, rx + 1, Y - 3, 4, 3, P.pot[1]); F(g, rx + 1, Y - 3, 4, 1, P.pot[2]); F(g, rx + 2, Y - 9, 2, 6, pl[2]); F(g, rx + 2, Y - 9, 1, 6, pl[3]); PX(g, rx + 1, Y - 7, pl[2]); PX(g, rx + 1, Y - 8, pl[2]); PX(g, rx + 4, Y - 6, pl[1]); PX(g, rx + 4, Y - 7, pl[1]); PX(g, rx + 3, Y - 10, 0xFF7AB0); }
    if (v.le === 'lamp') { const lx = x + 2; F(g, lx - 1, Y - 1, 5, 1, M[1]); F(g, lx, Y - 2, 3, 1, M[2]); F(g, lx + 1, Y - 19, 1, 17, M[2]); line(g, lx + 1, Y - 19, lx + 5, Y - 22, M[2]); F(g, lx + 4, Y - 23, 6, 2, A[1]); F(g, lx + 5, Y - 24, 4, 1, A[2]); F(g, lx + 4, Y - 21, 6, 1, A[0]);
      if (!away) { this.emit.push([lx + 5, Y - 20, 4, 1, 0xFFE6B0]); s2.room.lights.push([lx + 7, Y - 17, P.lamp, 16, .4]); } }
    // front: contact shadow, then the desk front (panel with drawers right / left, standing-desk frame, trestle legs, L return)
    F(fr, x + 3, Y + 16, SW - 6, 1, mixc(P.floor[0], 0, .4)); dith(fr, x + 1, Y + 16, SW - 2, 3, 0, .22);
    const knee = (kx, kw) => { F(fr, kx, Y + 6, kw, 10, mixc(D[0], 0, .4)); F(fr, kx, Y + 6, kw, 2, mixc(D[0], 0, .6)); };
    if (v.front === 'open') {
      F(fr, x + 1, Y + 6, SW - 2, 2, M[1]); F(fr, x + 1, Y + 6, SW - 2, 1, M[2]);
      for (const lx of [x + 5, x + SW - 9]) { F(fr, lx, Y + 8, 4, 7, M[2]); F(fr, lx, Y + 8, 1, 7, M[3]); F(fr, lx + 3, Y + 8, 1, 7, M[1]); F(fr, lx - 3, Y + 15, 10, 1, M[0]); }
      F(fr, x + 12, Y + 6, 5, 2, M[0]); PX(fr, x + 13, Y + 6, A[2]); PX(fr, x + 15, Y + 6, M[3]);
    } else if (v.front === 'trestle') {
      F(fr, x + 1, Y + 6, SW - 2, 1, D[0]);
      for (const lx of [x + 7, x + SW - 8]) { for (let i = 0; i < 10; i++) { const s = i >> 2; F(fr, lx - 1 - s, Y + 6 + i, 2, 1, i % 4 === 3 ? D[0] : D[1]); F(fr, lx + 1 + s, Y + 6 + i, 2, 1, D[0]); } }
      F(fr, x + 9, Y + 11, SW - 18, 1, D[0]); F(fr, x + 9, Y + 10, SW - 18, 1, D[1]);
    } else if (v.front === 'panelL') {
      F(fr, x + 1, Y + 6, SW - 2, 10, D[1]); knee(x + cx - 9, SW - cx + 4);
      F(fr, x + 1, Y + 6, cx - 10, 10, D[2]); F(fr, x + 1, Y + 10, cx - 10, 1, D[0]); F(fr, x + 13, Y + 8, 4, 1, D[3]); F(fr, x + 13, Y + 12, 4, 1, D[3]); F(fr, x + 1, Y + 6, 1, 10, D[3]); F(fr, x + cx - 10, Y + 6, 1, 10, D[0]);
      F(fr, x + SW - 4, Y + 6, 3, 10, D[0]); F(fr, x + SW - 2, Y + 6, 1, 10, D[1]);
    } else {
      F(fr, x + 1, Y + 6, SW - 2, 10, D[1]); knee(x + 5, cx + 4);
      F(fr, x + 1, Y + 6, 3, 10, D[0]); F(fr, x + 1, Y + 6, 1, 10, D[2]);
      if (v.front === 'L') { const rw = SW - cx - 11; F(fr, x + cx + 10, Y + 6, rw, 3, D[3]); F(fr, x + cx + 10, Y + 6, rw, 1, mixc(D[3], 0xFFFFFF, .3)); F(fr, x + cx + 10, Y + 9, rw, 9, D[2]); F(fr, x + cx + 10, Y + 13, rw, 1, D[0]); F(fr, x + cx + 16, Y + 11, 4, 1, D[3]); F(fr, x + cx + 16, Y + 15, 4, 1, D[3]); F(fr, x + SW - 2, Y + 9, 1, 9, D[0]); F(fr, x + cx + 10, Y + 18, rw, 1, mixc(P.floor[0], 0, .4)); }
      else { F(fr, x + cx + 10, Y + 6, SW - cx - 11, 10, D[2]); F(fr, x + cx + 10, Y + 10, SW - cx - 11, 1, D[0]); F(fr, x + cx + 16, Y + 8, 4, 1, D[3]); F(fr, x + cx + 16, Y + 12, 4, 1, D[3]); F(fr, x + SW - 2, Y + 6, 1, 10, D[0]); }
    }
  },
  kidDesk(g, fr, P, s2, away) {
    const G = this.G, x = s2.x, y = s2.y, D = P.desk, M = P.metal, A = P.acc, cx = G.icx, DT = G.DT, IW = G.IW, v = s2.dv, o = s2.o, [mx, my, mw, mh] = o.mon, Y = y + DT, X = x + mx, MY = y + my;
    this.chair(g, P, x + cx, Y, v.chair, away, true, v.front === 'open');
    F(g, x + 1, Y, IW - 2, 5, D[2]); F(g, x + 1, Y, IW - 2, 1, D[3]); F(g, x + 1, Y + 4, IW - 2, 1, D[3]);
    F(g, x + cx - 5, Y + 1, 11, 2, M[1]); for (let i = 0; i < 5; i++) PX(g, x + cx - 4 + i * 2, Y + 1, M[3]);
    if (v.mon === 'laptop') { F(g, X - 1, MY + mh, mw + 2, 1, M[2]); F(g, X - 1, MY + mh + 1, mw + 2, 1, M[0]); F(g, X, MY, mw, mh, M[1]); F(g, X, MY, mw, 1, M[3]); }
    else if (v.mon === 'tablet') { F(g, X, MY, mw, mh, M[0]); PX(g, X + 6, MY + mh, M[2]); PX(g, X + 7, MY + mh + 1, M[2]); F(g, X + 1, Y - 1, mw - 1, 1, M[1]); }
    else { F(g, X, MY, mw, mh, M[0]); const nx = X + (mw >> 1) - 1; F(g, nx, MY + mh, 2, Y - MY - mh, M[2]); F(g, nx - 2, Y, 6, 1, M[1]); if (v.mon === 'tall') F(g, X, MY, mw, 1, M[1]); }
    F(g, x + o.scr[0], y + o.scr[1], o.scr[2], o.scr[3], P.scr);
    if (v.it === 'cactus') { const px = X + mw - 4; F(g, px, MY - 2, 3, 2, P.pot[1]); F(g, px + 1, MY - 5, 1, 3, P.plant[2]); PX(g, px, MY - 4, P.plant[2]); PX(g, px + 2, MY - 3, P.plant[1]); }
    if (v.it === 'phones') { F(g, X + 1, MY - 1, 4, 1, M[1]); PX(g, X, MY, M[1]); F(g, X - 1, MY + 1, 2, 3, A[1]); }
    if (v.it === 'note') { F(g, X + mw - 3, MY - 1, 3, 3, 0xFFE38A); F(g, X + mw - 3, MY - 1, 3, 1, 0xFFF4C0); }
    F(fr, x + 2, Y + 13, IW - 4, 1, mixc(P.floor[0], 0, .4)); dith(fr, x + 1, Y + 13, IW - 2, 3, 0, .2);
    if (v.front === 'open') { F(fr, x + 1, Y + 5, IW - 2, 2, M[1]); F(fr, x + 1, Y + 5, IW - 2, 1, M[2]); for (const lx of [x + 3, x + IW - 6]) { F(fr, lx, Y + 7, 3, 6, M[2]); F(fr, lx, Y + 7, 1, 6, M[3]); F(fr, lx - 2, Y + 12, 7, 1, M[0]); } }
    else { F(fr, x + 1, Y + 5, IW - 2, 8, D[1]); F(fr, x + 4, Y + 5, IW - 8, 8, mixc(D[0], 0, .4)); F(fr, x + 1, Y + 5, 3, 8, D[0]); F(fr, x + IW - 4, Y + 5, 3, 8, D[0]); }
  },
  /* ---------- per-frame ---------- */
  sprite(s2, t) {
    const n = s2.n, size = s2.kind === 'lead' ? 'lead' : 'intern', fam = famOf(n);
    const since = t - (n.enteredPerf != null ? n.enteredPerf : -1e9);
    const pick = Chars.pick(fam, size, n.st, since, t, s2.ph, RM());
    if (!pick) return null;
    const period = 2600 + (hsh(n.id) % 2400), blink = !Chars.src && !RM() && ['work', 'tool', 'child', 'user'].includes(n.st) && ((t + s2.ph * 9000) % period) < 140;
    let c = Chars.frame(fam, size, n.st, pick, hsh(n.id) % 9, blink, this.cctx, s2.lk);
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
    const n = s2.n, P = this.P, small = s2.kind === 'kid', o = s2.o, sx = s2.x + o.scr[0], sy = s2.y + o.scr[1], sw = o.scr[2], sh = o.scr[3];
    const q = RM() ? 0 : t, fr = Math.floor(q / 250), cxs = sx + (sw >> 1), cys = sy + (sh >> 1);
    switch (n.st) {
      case 'work': { g.drawImage(this.codeTex, 0, RM() ? 0 : Math.floor(q / 160 + s2.ph * 64) % 52, sw, sh, sx, sy, sw, sh); if (fr % 2) F(g, cxs, sy + sh - 2, 2, 1, P.code[0]); return 'on'; }
      case 'tool': { F(g, sx, sy, sw, sh, 0x050806); const lines = Math.max(2, (sh - 2) >> 1); for (let i = 0; i < lines; i++) { const w = 2 + ((i * 7 + fr) % Math.max(2, sw - 4)); F(g, sx + 1, sy + 1 + i * 2, 1, 1, P.acc[2]); F(g, sx + 3, sy + 1 + i * 2, Math.min(w, sw - 4), 1, i === lines - 1 ? P.code[0] : mixc(P.code[1], 0, .35)); } F(g, sx + 1, sy + sh - 1, sw - 2, 1, 0x1E2A24); F(g, sx + 1, sy + sh - 1, Math.max(1, ((RM() ? .6 : (q / 2200 + s2.ph) % 1) * (sw - 2)) | 0), 1, P.acc[2]); return 'on'; }
      case 'child': { F(g, sx, sy, sw, sh, P.scr); F(g, cxs - 1, sy + 1, 3, 2, P.code[0]); F(g, cxs, sy + 3, 1, 1, P.code[1]); F(g, sx + 1, sy + 4, sw - 2, 1, P.code[1]); for (let i = 0; i < 3; i++) F(g, sx + 1 + Math.round(i * (sw - 3) / 2), sy + 5, 2, 2, i === fr % 3 ? P.acc[3] : P.code[2]); return 'on'; }
      case 'user': { F(g, sx, sy, sw, sh, P.scr); F(g, sx + 1, sy + 1, sw - 2, sh - 2, 0xF4F4F4); F(g, sx + 1, sy + 1, sw - 2, 1, 0xC8C8CC); if (sw > 8) { F(g, sx + 2, sy + 3, sw - 6, 1, 0x777780); F(g, sx + 2, sy + 5, sw - 8, 1, 0x777780); } if (n.ack) return 'dim'; F(g, sx + sw - 5, sy + sh - 3, 3, 2, fr % 2 ? 0xFF4A3A : 0xC02E24); return 'red'; }
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
    const ic = { bang: [ICONS.bang, 0xFFFFFF], dots: [ICONS.dots, 0xC27A12], read: [ICONS.dots, 0x9A9AA4], gear: [frame % 2 ? ICONS.term1 : ICONS.term0, 0x3A4050], tree: [ICONS.hour, 0x6A5A40], check: [ICONS.check, 0x3E8A5A], stop: [ICONS.stop, 0x6A6A74], plug: [ICONS.plug, 0x6A6A74] }[kind];
    const rows = ic[0], ox = 1 + Math.floor((W - rows[0].length) / 2), oy = 1 + Math.floor((H - rows.length) / 2);
    if (kind === 'dots' || kind === 'read') { const c1 = kind === 'read' ? 0x9A9AA4 : 0xC27A12, c2 = kind === 'read' ? 0x7A7A84 : 0xA8650C; for (let i = 0; i < Math.min(3, frame + 1); i++) { L.set(3 + i * 3, 6, c1); L.set(4 + i * 3, 6, c1); L.set(3 + i * 3, 7, c1); L.set(4 + i * 3, 7, c2); } }   // read = a wait I already saw: calm grey '…'
    else for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) if (rows[y][x] === '#') L.set(ox + x, oy + y, ic[1]);
    finish(L, red ? 0x4A0E0A : 0x4A3A30, null, 0, null);
    c = L.canvas(); this.bubbleCache.set(key, c); return c;
  },
  /* ---------- idle walks: an idle / finished agent sometimes gets up, walks along its storey to the nearest coffee machine,
     water cooler, vending machine, whiteboard or meeting nook (else its own window / coat rack) along the aisle behind the
     desks, stands there 4–8 s (a sip),
     walks back and sits down. At most 2 walkers in the whole office, each agent at most every 2–4 min, never under reduced
     motion. Any other state calls it back at once (double-speed walk). The desk keeps its monitor, bubble and hit area;
     the chair is pushed back while it is empty. ---------- */
  planWalks() {
    const G = this.G, now = performance.now();
    for (const s2 of this.stations) {
      const st = this.stories.find(q => q.rooms.includes(s2.room)), xd = s2.x + (s2.kind === 'lead' ? G.cx : G.icx), cand = [];
      for (const r of st.rooms) if (r.filler || r === s2.room) for (const sp of r.spots || []) cand.push(sp.x);
      if (!cand.length) cand.push(s2.room.coat != null ? s2.room.coat : s2.room.x + (s2.room.win ? s2.room.win[0] + (s2.room.win[1] >> 1) : 10));
      const far = cand.filter(c => Math.abs(c - xd) >= 20), pool = far.length ? far : cand;   // a real walk: the nearest spot that is not right behind the chair
      let best = pool[0]; for (const c of pool) if (Math.abs(c - xd) < Math.abs(best - xd)) best = c;
      const dir = best >= xd ? 1 : -1;
      s2.walk = { xd, xt: Math.abs(best - xd) < 10 ? xd + dir * 10 : best - dir * 5, y: s2.y + 20 };   // feet on the back aisle (= the lounge walk line on row 1)
      s2.nw = now + 25000 + hsh(s2.n.id + 'w') % 140000;   // first walk after 25-165 s, then every 2-4 min
      s2.away = null;
    }
    if (this.forced) this.force = true;   // a relayout drops walks; the dev hook re-arms its walk
  },
  walkTick(t, R) {
    const WK = Chars.walker(); if (!WK) return;
    if (R) { for (const w of this.walks) w.s2.away = null; this.walks = []; return; }
    const ms = 1000 / WK.walk.fps;
    this.walks = this.walks.filter(w => {
      const s2 = w.s2, ok = IDLE_ST[s2.n.st] && this.stations.includes(s2);
      if (!ok && w.ph === 'up') { s2.away = null; return false; }
      if (!ok && (w.ph === 'out' || w.ph === 'stay')) { w.x0 = w.x; w.ph = 'back'; w.t0 = t; w.fast = true; }
      const leg = (from, to, k) => { const d = Math.abs(to - from), a = Math.min(d, Chars.advance(k)); w.x = from + Math.sign(to - from) * a; return a >= d; };
      if (w.ph === 'up') { w.x = w.xd; if (t - w.t0 > 450) { w.ph = 'out'; w.t0 = t; } }
      else if (w.ph === 'out') { if (leg(w.xd, w.xt, Math.floor((t - w.t0) / ms))) { w.ph = 'stay'; w.t0 = t; } }
      else if (w.ph === 'stay') { if (t - w.t0 > w.dur) { w.ph = 'back'; w.t0 = t; w.x0 = w.xt; } }
      else if (w.ph === 'back') { if (leg(w.x0, w.xd, Math.floor((t - w.t0) / (w.fast ? ms / 2 : ms)))) { w.ph = 'down'; w.t0 = t; } }
      else if (w.ph === 'down' && t - w.t0 > 350) { s2.away = null; s2.nw = t + 120000 + hsh(s2.n.id + Math.floor(t)) % 120000; return false; }
      return true;
    });
    if (!this.force && (this.walks.length >= 2 || t - (this.lastWalk || -1e9) < 9000)) return;
    for (const s2 of this.stations) {
      if (s2.away || !s2.walk || (!this.force && t < s2.nw)) continue;
      if (!IDLE_ST[s2.n.st] || !Chars.famWalker(famOf(s2.n), s2.kind === 'lead' ? 'lead' : 'intern')) { if (!this.force) s2.nw = t + 20000 + hsh(s2.n.id) % 20000; continue; }
      const w = { s2, ph: 'up', t0: t, xd: s2.walk.xd, xt: s2.walk.xt, x: s2.walk.xd, y: s2.walk.y, dur: this.force ? 6e5 : 4000 + hsh(s2.n.id + t) % 4000, fast: false };
      s2.away = w; this.walks.push(w); this.lastWalk = t; this.force = false;
      break;
    }
  },
  drawWalks(s, t) {
    const WK = Chars.walker(); if (!WK) return;
    for (const w of this.walks) {
      const s2 = w.s2, fam = famOf(s2.n), V = Chars.famWalker(fam, s2.kind === 'lead' ? 'lead' : 'intern'); if (!V) continue;
      const out = w.ph === 'up' || w.ph === 'out' || w.ph === 'stay', left = out ? w.xt < w.xd : w.xd < w.x0, ms = 1000 / WK.walk.fps;
      let mode = 'stand', fi = 0;
      if (w.ph === 'out' || w.ph === 'back') { mode = 'walk'; fi = Math.floor((t - w.t0) / (w.fast ? ms / 2 : ms)); }
      else if (w.ph === 'stay') fi = Math.floor((t - w.t0) / ms) + 100 - Math.floor(Math.min(w.dur, 8000) / ms / 2);   // the sip lands mid-stay
      const im = Chars.walkerFrame(mode, ((fi % 144) + 144) % 144, left, this.cctx, { v: V, fam, lk: s2.lk });
      s.drawImage(im, Math.round(w.x) - (left ? WK.w - 1 - WK.anchorX : WK.anchorX), w.y - WK.anchorY);
    }
  },
  /* ambient life: a tiny colleague takes the elevator to the vending machine / makes coffee, then leaves */
  life(g, s, t, room, lights) {
    const w = room.walk; if (!w) return;
    const R = RM(), P = this.P, WK = Chars.walker();
    // timeline (ms): doors open, hold stand pose, walk a->b (foot-locked), stand with cup, walk back, hold, doors, gone
    const dist = Math.abs(w.b - w.a), ms = WK ? 1000 / WK.walk.fps : 170;
    const nWalk = WK ? Chars.framesFor(dist) : Math.ceil(dist / 1.5);
    const tW = nWalk * ms, t0 = 600, t1 = t0 + 500, t2 = t1 + tW, t3 = t2 + 3200, t4 = t3 + tW, t5 = t4 + 400, t6 = t5 + 700;
    const T = Math.max(24000, t6 + 6000), c = R ? -1 : (t + room.i * 7919) % T, CO = WK ? Chars.colleagues() : null, who = CO ? CO[hsh(room.i + ':' + Math.floor((t + room.i * 7919) / T)) % CO.length] : null;
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
      const im = Chars.walkerFrame(mode, fi, left, this.cctx, who);
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
    for (const room of this.rooms) for (const W of room.weathers || []) {
      if (W.kind === 'none') continue;
      const x0 = room.x + W.x, y0 = room.y + 4, ww = W.w, wh = 15;
      g.save(); g.beginPath();
      if (W.circ) g.arc(x0 + 7.5, room.y + 13.5, 7, 0, Math.PI * 2); else g.rect(x0, y0, ww, wh);
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
        // archetype / filler props (non-emissive pixels go through nightc; screens, LEDs and flames stay bright and feed the light)
        if (a.k === 'fire') { for (let i = 0; i < a.w; i++) { const hh = R ? 3 + (i % 3) : 2 + Math.round((Math.sin(t / 140 + i * 1.9) * .5 + .5) * 3 + (Math.sin(t / 90 + i * 3.1) * .5 + .5) * 2) - (i === 0 || i === a.w - 1 ? 2 : 0); for (let k = 0; k < hh; k++) PX(g, X + i, Y - k, k < 1 ? 0xFFF0B0 : k < hh * .5 ? 0xFFB040 : k < hh - 1 ? 0xE8642A : 0xA83A1E); }
          const fa = R ? .5 : .45 + .1 * Math.sin(t / 110) * Math.sin(t / 47); lights.push([X + a.w / 2, Y - 3, 0xFF9A40, 34, fa, 1]); lights.push([X + a.w / 2, Y + 10, 0xFF8A30, 40, fa * .5, .35]); cores.push([X + a.w / 2, Y - 2, 0xFFB050, 5, .8]); }
        if (a.k === 'bub' && !R) for (let i = 0; i < 2; i++) { const p = (t / 900 + i * .5 + a.x * .13) % 1; PX(g, X + (i % 2), Y - Math.floor(p * a.h), a.c); }
        if (a.k === 'rled') for (let i = 0; i < a.n; i++) { const s = a.s * 7 + i * 13, col = [0x5AE08A, 0x5AB8FF, 0xFFB040][s % 3], on = R || Math.floor(t / (140 + (s * 53) % 260) + s) % 4 !== 0; PX(g, X, Y + i * 4, on ? col : P.metal[1]); PX(g, X - 2, Y + i * 4, R || Math.floor(t / 900 + s) % 6 ? 0x5AE08A : P.metal[1]); if (on && N && i % 2 === 0) cores.push([X, Y + i * 4, col, 2, .35]); }
        if (a.k === 'bars') { for (let i = 0; i < a.w; i += 2) { const v = R ? .5 : (Math.sin(t / 700 + i * .9) * .5 + .5) * .7 + (Math.sin(t / 230 + i * 2.3) * .5 + .5) * .3, hh = 1 + Math.round(v * (a.h - 1)); F(g, X + i, Y - hh + 1, 1, hh, v > .82 ? 0xFFB040 : 0x5AD0FF); } cores.push([X + a.w / 2, Y - 3, 0x5AD0FF, 3, .3]); }
        if (a.k === 'fan') { const c1 = nightc(P, P.metal[3]); if (!R && Math.floor(t / 70) % 2) { F(g, X - 3, Y, 7, 1, c1); F(g, X, Y - 3, 1, 7, c1); } else for (let k = -2; k <= 2; k++) { PX(g, X + k, Y + k, c1); PX(g, X + k, Y - k, c1); } PX(g, X, Y, nightc(P, P.metal[1])); }
        if (a.k === 'fly' && !R && !N) { const u = t / 1000 + a.ph * 20, fx = X + Math.round((Math.sin(u * .23) * .5 + .5) * a.w), fy = Y + Math.round((Math.sin(u * .41 + 1) * .5 + .5) * a.h), c1 = a.col, c2 = mixc(a.col, 0, .4);
          PX(g, fx, fy, c2); if (Math.floor(t / 120) % 2) { PX(g, fx - 1, fy - 1, c1); PX(g, fx + 1, fy - 1, c1); } else { PX(g, fx - 1, fy, c1); PX(g, fx + 1, fy, c1); } }
        if (a.k === 'printer') { const hh = R ? 3 : Math.floor((t / 1000 + room.i * 5) % 24 / 4), hx = X + (R ? 3 : Math.round((Math.sin(t / 380) * .5 + .5) * (a.w - 3))), Bb = room.y + a.b, hy = Bb - hh - 3;
          if (hh) F(g, X + (a.w >> 1) - 1, Bb - hh, 3, hh, nightc(P, P.acc[2])); F(g, X, hy, a.w, 1, nightc(P, P.metal[2])); F(g, hx, hy - 1, 3, 2, nightc(P, P.metal[3])); PX(g, hx + 1, hy + 1, 0xFF8040); if (N) cores.push([hx + 1, hy + 1, 0xFF8040, 2, .5]); }
        if (a.k === 'chart') { const off = R ? 0 : t / 260, gc = mixc(P.scr, P.code[1], .14); for (let x = 0; x < a.w; x += 6) F(g, X + x, Y, 1, a.h, gc); for (let y = 3; y < a.h; y += 5) F(g, X, Y + y, a.w, 1, gc);
          for (let x = 1; x < a.w - 1; x += 3) { const v = Math.sin((x + Math.floor(off / 3) * 3) * .7) * .5 + .5, bh = Math.round(v * 3) + 1; F(g, X + x, Y + a.h - bh, 2, bh, mixc(P.code[2], P.scr, .3)); }
          let py = null; for (let x = 0; x < a.w; x++) { const u = (x + off) / 5, v = Math.sin(u) * .35 + Math.sin(u * .37 + 1) * .3 + .5, yy = Y + 2 + Math.round((1 - clamp(v, 0, 1)) * (a.h - 8)); if (py != null) F(g, X + x, Math.min(py, yy), 1, Math.abs(py - yy) + 1, P.code[0]); py = yy; }
          if (!R && Math.floor(t / 500) % 2) PX(g, X + a.w - 2, py, 0xFFFFFF); lights.push([X + a.w / 2, Y + a.h / 2, P.code[0], a.w * .5, .3, 1]); cores.push([X + a.w / 2, Y + a.h / 2, P.code[0], 4, .3]); }
        if (a.k === 'pins') { const k = R ? 0 : Math.floor(t / 700) % a.pts.length; a.pts.forEach(([px, py], i) => PX(g, room.x + px, room.y + py, i === k ? 0xFF4A3A : nightc(P, 0xB8281F))); const [px, py] = a.pts[k]; cores.push([room.x + px, room.y + py, 0xFF4A3A, 2, .5]); }
        if (a.k === 'pong') { const u = R ? 0 : t / 1000, bw = a.w - 3, bx = X + 1 + Math.round(Math.abs(((u * 7) % (2 * bw)) - bw)), by = Y + Math.round(Math.abs(((u * 4.3) % (2 * (a.h - 1))) - (a.h - 1))), g1 = 0xB8FFC8;
          for (let y = 0; y < a.h; y += 2) PX(g, X + (a.w >> 1), Y + y, mixc(0x0A1A0E, g1, .35)); F(g, X, Y + clamp(by - Y - 1, 0, a.h - 3), 1, 3, g1); F(g, X + a.w - 1, Y + clamp(by - Y - 1 + (R ? 0 : Math.round(Math.sin(u * 3))), 0, a.h - 3), 1, 3, g1); PX(g, bx, by, 0xFFFFFF);
          lights.push([X + a.w / 2, Y + a.h / 2, 0x9AFFB0, 12, .3, 1]); cores.push([X + a.w / 2, Y + a.h / 2, 0x9AFFB0, 3, .3]); }
        if (a.k === 'pp' && !R) { const p = (t / 900 + a.ph) % 2, f = p < 1 ? p : 2 - p; PX(g, X + Math.round(f * a.w), Y - Math.round(Math.sin(f * Math.PI) * 6), nightc(P, 0xFFF4E0)); }
        if (a.k === 'belt') { const off = R ? 0 : Math.floor(t / 80); for (let x = 0; x < a.w; x++) if ((x + off) % 4 === 0) PX(g, X + a.w - 1 - x, Y + 1, nightc(P, P.metal[2])); }
        if (a.k === 'booth') { const busy = R ? a.i % 2 === 0 : Math.floor(t / 9000 + a.ph * 7) % 3 === 0, col = busy ? 0xFF5A4A : 0x5AE08A; F(g, X, Y, 3, 1, col); cores.push([X + 1, Y, col, 2, .5]); if (busy) lights.push([X + 1, Y + 14, 0xFFE6B0, 12, .35, 1]); }
        if (a.k === 'slides') { const sl = R ? 0 : Math.floor((t + room.i * 1300) / 4000) % 3; F(g, X, Y, a.w, a.h, 0xF2F5F8); F(g, X, Y, a.w, 2, P.acc[1]);
          if (sl === 0) for (let i = 0; i < 4; i++) { const bh = 2 + ((i * 3 + 2) % 6); F(g, X + 3 + i * 6, Y + a.h - 1 - bh, 4, bh, [P.acc[1], P.acc[2], P.code[2], P.acc[0]][i]); }
          else if (sl === 1) { disc(g, X + (a.w >> 2) + 2, Y + 7, 3, P.acc[0], P.acc[1], P.acc[2]); for (let i = 0; i < 3; i++) F(g, X + (a.w >> 1), Y + 4 + i * 3, (a.w >> 1) - 3 - i * 2, 1, 0x8A9098); }
          else { F(g, X + 3, Y + 4, a.w - 8, 2, 0x3A4048); for (let i = 0; i < 3; i++) F(g, X + 3, Y + 8 + i * 2, a.w - 10 - i * 4, 1, 0x8A9098); }
          lights.push([X + a.w / 2, Y + a.h / 2, 0xDDE8FF, a.w * .6, .3, 1]); }
      }
      if (room.filler) this.life(g, s, t, room, lights);
      if (!room.filler && room.lampAt && this.stations.some(s2 => s2.room === room && s2.n.st === 'user' && !s2.n.ack)) { const [lx, ly] = room.lampAt, on = R || Math.floor(t / 600) % 2 === 0; F(g, lx, ly, 3, 3, on ? 0xFF3B2E : 0x9A2018); PX(g, lx, ly, on ? 0xFFB0A8 : 0xC03028); if (on) { lights.push([lx + 1, ly + 1, 0xFF4A3A, 12, .5, 1]); cores.push([lx + 1, ly + 1, 0xFF4A3A, 4, .9]); } }
    }
    // stations: screen + machine (lit layer) / character, steam, note (sprite layer)
    this.walkTick(t, R); this.drawWalks(s, t);   // the back aisle: seated agents and the desk fronts of the row in front stay in front
    for (const s2 of this.order) {
      const n = s2.n, small = s2.kind === 'kid', o = s2.o;
      if (s2.away && s2.patch) g.drawImage(s2.patch, s2.pr[0], s2.pr[1]);
      if (o.scr2) { const [ax, ay, aw, ah] = o.scr2, X2 = s2.x + ax, Y2 = s2.y + ay, busy = n.st === 'work' || n.st === 'tool';
        if (busy) { g.drawImage(this.codeTex, 16, R ? 8 : Math.floor(t / 420 + s2.ph * 40) % 56, aw, ah, X2, Y2, aw, ah); lights.push([X2 + aw / 2, Y2 + ah / 2, P.glow, 12, .25, 1]); }
        else if (n.st !== 'dead' && n.st !== 'stopped') { F(g, X2, Y2, aw, ah, mixc(P.scr, 0, .3)); for (let i = 0; i < 4; i++) F(g, X2 + 2 + i * 3, Y2 + ah - 2 - ((i * 5 + 3) % 4), 2, 1 + ((i * 5 + 3) % 4), mixc(P.code[2], P.scr, .45)); } }
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
      const sp = s2.away ? null : this.sprite(s2, t);
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
      const n = s2.n, small = s2.kind === 'kid', o = s2.o, cx = small ? G.icx : G.cx;
      const kind = cueOf(n), fr = kind === 'dots' ? (R ? 2 : Math.min(2, Math.floor(t / 600) % 4)) : kind === 'read' ? 2 : kind === 'gear' ? (R ? 0 : Math.floor(t / 420) % 2) : 0;
      if (kind) {
        const img = this.bubble(kind, fr), bob = kind === 'bang' && !R ? Math.round(Math.sin(t / 220) * 1) : 0;
        let bx = kind === 'bang' ? s2.x + cx - (small ? 16 : 24) : s2.x + cx + (small ? 6 : 9), by = s2.y + o.oy - (small ? 4 : 5) + bob;
        if (kind === 'check') { bx = s2.x + o.mon[0] + (small ? -2 : 1); by = s2.y + o.top - 16; }
        s.drawImage(img, bx, by);
        if (kind === 'bang') { lights.push([bx + 7, by + 6, 0xFF4A3A, 14, R ? .35 : .4 + .12 * Math.sin(t / 220), 1]); cores.push([bx + 7, by + 6, 0xFF4A3A, 6, .7]); }
      }
      if (n.st === 'idle' && !s2.away) for (let i = 0; i < 3; i++) {
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
    const k = this.k, G = this.G, tiny = k < 1.3; this.world.classList.toggle('tiny', tiny);   // 작게 at 1 CSS px per art px: smaller storey labels and plates
    for (const st of this.stories) {
      const sv = st.sv;
      box.append(h('div.slab', { style: 'left:' + ((this.B.x0 + 3) * k) + 'px;top:' + ((st.y + this.B.SLAB / 2) * k - (tiny ? 7 : 10)) + 'px', 'aria-hidden': 'true' },
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
      b.className = 'hit' + (s2.kind === 'kid' ? ' kid' : ''); R.stClass(b, n.st); b.dataset.st = n.st; b.dataset.w = n.waiting ? '1' : ''; b.dataset.ack = n.ack ? '1' : ''; b.setAttribute('aria-label', AP.label(n));
      const np = b.querySelector('.np'); np.firstChild.className = 'st-' + n.st; text(np.lastChild, n.name);
    }
  },
  plane(n) { if (!this.stations.find(z => z.n.key === n.key)) return; this.planes.push({ id: n.id, t0: performance.now() }); }
};

  /* ---------- module API for Overview ---------- */
  const sigOf = (D, w) => w + R.S.ofcSize + '#' + D.projects.map(p => p.id + ':' + D.roots.filter(r => r.project === p.id).map(r => r.key + '(' + r.kids.slice(0, 4).map(k => k.key).join(',') + ')').join(',')).join('|') + '#' + D.servers.map(s => s.id + s.state).join(',');
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
    chars: () => (Chars.load() ? Chars : null),   // selftest hook (variant rotation, looks)
    walkNow() { Office.force = Office.forced = true; },
    cue(key) { const s2 = Office.stations.find(q => q.n.key === key); return s2 ? cueOf(s2.n) : undefined; },   // selftest hook: the bubble a desk shows ('bang' = red '!')
    /* selftest hooks: the scene's room archetypes / filler kinds / desk variants, the pure pickers, a relayout */
    scene: () => ({ rooms: Office.rooms.map(r => r.filler ? { si: r.si, filler: r.kind, spots: (r.spots || []).length } : { si: r.si, id: r.p.id, arch: r.arch }), desks: Office.stations.map(s2 => ({ id: s2.n.id, kind: s2.kind, v: s2.dv.k, scr: s2.o.scr.join(',') })) }),
    archOf: id => archOf(id), fillKind: (seed, w) => fillKind(seed, w, Object.keys(FILL_MIN), []), deskOf: (id, kind) => deskOf(id, kind).k, archs: () => ARCHS.slice(),
    relayout() { if (Office.host) Office.layout(); },            // dev hook (?walk=1 in the talkfx page): start an idle walk now, long stay
    scale: () => Office.S, scaleFor: officeScale, geo: () => Office.G,   // selftest hooks: the current device px per art px, the pure picker, desk geometry
    steps: () => Office.devW ? Object.fromEntries(['s', 'm', 'l'].map(z => [z, officeScale(Office.devW, Office.dpr, z)])) : null,   // what each size step draws at on this pane (작게 can equal 보통 on a high-DPI screen)
    /* selftest hook: make every agent due for a walk, run one scheduling step (reduced or not); returns the walkers started */
    walkTest(reduce) { if (!Office.stations.length) return -1; for (const s2 of Office.stations) s2.nw = 0; Office.lastWalk = -1e9; Office.walkTick(performance.now(), !!reduce); const n = Office.walks.length; for (const w of Office.walks) w.s2.away = null; Office.walks = []; return n; },
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
