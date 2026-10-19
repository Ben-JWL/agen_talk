# Accessory overlays (v2.1): small sprites the page draws over a character's head or neck, per agent.
# Each one is drawn per head angle (A = 3/4 toward screen-left, B/D eighth turns, C front, E = 3/4 toward screen-right,
# S = walker side view facing right) and positioned from the raster's own head anchor (AT_SPRITES pools[*].hd), so it
# follows every head bob and turn. Pixels are palette indices of the wearer's palette (the look's colours apply).
# Glasses are line art (no outline pass); hats and scarves are shaded parts with the same selective outline as the
# rest of the art. Families keep their own headwear: Claude's clip and intern beanie, Codex's headphones and hood,
# AGY's goggles are never doubled, so each family gets only the accessories that sit well with its silhouette.
from core import Part, Canvas
import heads as HD
import intern2 as I2

NAMES = ['glasses', 'round', 'cap', 'beanie', 'scarf', 'clip', 'buds']
ALLOW = {
    'claude': {'lead': ['glasses', 'round', 'cap', 'beanie', 'scarf'], 'intern': ['glasses', 'round', 'scarf']},
    'codex':  {'lead': ['glasses', 'round', 'scarf'], 'intern': ['glasses', 'round', 'buds']},
    'agy':    {'lead': ['round', 'clip', 'buds'], 'intern': ['round', 'clip']},
}
# lead body anchor (torso origin incl. ARM_DY at bx = by = 0) and intern torso origin: scarves hang from the body
LEAD_BODY = (11, 25)
INTERN_BODY = (8, 20)

# 'glasses': dark browline over thin lower rims (the eyes stay readable); 'round': thin wire in the accent colour
LENS = {'glasses': ['7777', 'k..k', 'k..k', '.kk.'], 'round': ['.oo.', 'o..o', 'o..o', '.oo.']}


def glasses(kind, eyes, row, temple):
    """Two hand-drawn lenses around the 2-px eyes (head-box x of each eye's left pixel, eye top row), a bridge,
    and a short temple toward the visible ear (temple = (x0, x1) inclusive or None)."""
    L = LENS[kind]
    c = L[1][0]
    px = {}
    for ex in eyes:
        for j, r in enumerate(L):
            for i, ch in enumerate(r):
                if ch != '.':
                    px[(ex - 1 + i, row - 1 + j)] = ch
    t = L[0][1]
    a, b = eyes[0] + 3, eyes[1] - 2
    for x in range(a, b + 1):
        px[(x, row)] = t
    if temple:
        for x in range(temple[0], temple[1] + 1):
            px[(x, row)] = t
    return grid_of(px)


def grid_of(px):
    xs = [x for x, _ in px]
    ys = [y for _, y in px]
    x0, y0 = min(xs), min(ys)
    rows = [['.'] * (max(xs) - x0 + 1) for _ in range(max(ys) - y0 + 1)]
    for (x, y), ch in px.items():
        rows[y - y0][x - x0] = ch
    return (x0, y0, [''.join(r) for r in rows])


def shaded(part, outline=True):
    """Shade a part (top-left key light, planar) and give it the selective outline, cropped; returns (ox, oy, rows)
    relative to the part's own origin."""
    m = 2
    cv = Canvas(part.w + 2 * m, part.h + 2 * m)
    cv.put(part, m, m)
    if outline:
        cv.finish(rim=False)
    rows = cv.rows()
    ys = [y for y, r in enumerate(rows) if r.strip('.')]
    xs = [x for x in range(cv.w) if any(r[x] != '.' for r in rows)]
    return (min(xs) - m, min(ys) - m, [r[min(xs):max(xs) + 1] for r in rows[min(ys):max(ys) + 1]])


def place(dx, dy, part, outline=True):
    ox, oy, rows = shaded(part, outline)
    return (dx + ox, dy + oy, rows)


def mirror(entry, width):
    """Opposite 3/4 view of a head overlay: rows reversed about the head box (width = head box width)."""
    dx, dy, rows = entry
    w = len(rows[0])
    return (width - dx - w, dy, [r[::-1] for r in rows])


def eyes_lead(ang):
    fo, ft = HD.FACE_O[ang], HD.FEAT[ang]
    return [fo[0] + ex for (ex, _) in ft['eyes']], fo[1] + ft['eyes'][0][1] + 1


def eyes_intern(ang):
    fo, ft = I2.FACE_O, I2.FEAT[ang]
    return [fo[0] + ex for (ex, _) in ft['eyes']], fo[1] + ft['eyes'][0][1]


# ------------------------------------------------------------------ lead headwear (Claude lead only)
CAP_A = Part('''
.......CCCCCCCC.......
.....CCCCCCCCCCCC.....
....CCCCC-CCCCCCCC....
...CCCCCC-CCCCCCCCC...
..CCCCCCC-CCCCCCCCCC..
..CCCCCCC-CCCCCCCCCC..
AAAAAAACCCCCCCCCCCCC..
.AAAAA................
''', kx=0.7, ky=0.6)
CAP_C = Part('''
.......CCCCCCCC.......
.....CCCCCCCCCCCC.....
....CCCCCCC-CCCCCC....
...CCCCCCCC-CCCCCCC...
...CCCCCCCC-CCCCCCC...
..CCCCCCCCC-CCCCCCCC..
..CCAAAAAAAAAAAAAACC..
...AAAAAAAAAAAAAAAA...
''', kx=0.6, ky=0.6)
BEANIE_A = Part('''
........CCCCCCC.......
......CCCCCCCCCCC.....
....CCCCCCCCCCCCCCC...
...CCCCCCCCCCCCCCCCC..
...CCCCCCCCCCCCCCCCCC.
..ihihihihihihihihihg.
..hghghghghghghghghgg.
''', kx=0.7, ky=0.7)
BEANIE_C = Part('''
.......CCCCCCCC.......
.....CCCCCCCCCCCC.....
....CCCCCCCCCCCCCC....
...CCCCCCCCCCCCCCCC...
...CCCCCCCCCCCCCCCC...
..ihihihihihihihihih..
..hghghghghghghghghg..
''', kx=0.6, ky=0.7)
SCARF_L = Part('''
.....AAAAAAAAAAAA......
....AAAAAAAAAAAAAA.....
.....AAAAAAAAAAAA......
.............AAA.......
.............A-A.......
.............AAA.......
.............A-A.......
.............p.p.......
''', kx=0.4, ky=0.3)
SCARF_I = Part('''
...AAAAAAAAA...
..AAAAAAAAAAA..
...AAAAAAAAA...
.........AA....
.........-A....
.........AA....
.........p.p...
''', kx=0.4, ky=0.3)
CLIP = ['.q.', 'qrq', '.p.']
BUD_L = ['x.', 'xx', '.x', '.x', '.x', 'x.', 'x.']   # bud at the ear, cable down the jaw to the collar


def lead_acc():
    out = {}
    W = 22
    g = {}
    for kind in ('glasses', 'round'):
        g[kind] = {}
        for ang, v in (('L', 'A'), ('LF', 'B'), ('F', 'C'), ('FR', 'D'), ('R', 'E')):
            ex, row = eyes_lead(ang)
            temple = {'A': (ex[1] + 3, ex[1] + 5), 'B': (ex[1] + 3, ex[1] + 4), 'C': None,
                      'D': (ex[0] - 3, ex[0] - 2), 'E': (ex[0] - 4, ex[0] - 2)}[v]
            g[kind][v] = glasses(kind, ex, row, temple)
        out[kind] = dict(a='h', v=g[kind])
    cap = {'A': place(0, 1, CAP_A), 'C': place(0, 1, CAP_C)}
    cap['E'] = mirror(cap['A'], W)
    cap['B'] = cap['D'] = cap['C']
    out['cap'] = dict(a='h', v=cap)
    bea = {'A': place(0, 0, BEANIE_A), 'C': place(0, 0, BEANIE_C)}
    bea['E'] = mirror(bea['A'], W)
    bea['B'] = bea['D'] = bea['C']
    out['beanie'] = dict(a='h', v=bea)
    out['scarf'] = dict(a='b', v={'*': place(LEAD_BODY[0], LEAD_BODY[1], SCARF_L)})
    clip = {'A': (16, 11, CLIP), 'B': (16, 11, CLIP), 'C': (17, 11, CLIP), 'D': (2, 11, CLIP), 'E': (3, 11, CLIP)}
    out['clip'] = dict(a='h', v=clip)
    bud = {'A': (18, 14, BUD_L), 'B': (18, 14, BUD_L), 'C': (18, 14, BUD_L),
           'D': (2, 14, [r[::-1] for r in BUD_L]), 'E': (2, 14, [r[::-1] for r in BUD_L])}
    out['buds'] = dict(a='h', v=bud)
    return out


# intern eyes are 2 px apart: full rims would merge into a visor, so the frames are open at the top
INT_LENS = {'glasses': ['k..77..k', 'k......k', 'kkk..kkk'], 'round': ['o..oo..o', 'o......o', '.oo..oo.']}


def intern_glasses(kind, eyes, row, side):
    L = INT_LENS[kind]
    px = {(eyes[0] - 1 + i, row + j): ch for j, r in enumerate(L) for i, ch in enumerate(r) if ch != '.'}
    c = L[0][0]
    if side < 0:
        px[(eyes[0] - 2, row)] = c
    elif side > 0:
        px[(eyes[1] + 2, row)] = c
    return grid_of(px)


def intern_acc():
    out = {}
    for kind in ('glasses', 'round'):
        v = {}
        for ang, vv in (('R', 'E'), ('F', 'C'), ('L', 'A')):
            ex, row = eyes_intern(ang)
            v[vv] = intern_glasses(kind, ex, row, {'E': -1, 'C': 0, 'A': 1}[vv])
        out[kind] = dict(a='h', v=v)
    out['scarf'] = dict(a='b', v={'*': place(INTERN_BODY[0], INTERN_BODY[1], SCARF_I)})
    out['clip'] = dict(a='h', v={'E': (2, 6, CLIP), 'C': (11, 6, CLIP), 'A': (11, 6, CLIP)})
    bud = ['x', 'x', 'x', '.x', '.x']
    out['buds'] = dict(a='h', v={'E': (3, 10, bud), 'C': (3, 10, bud), 'A': (12, 10, [r[::-1].rjust(2, '.') for r in bud])})
    return out


# walker (side view, facing right): head anchor normalised so the eye is at (6, 4); body anchor = (0, bob)
W_CAP = Part('''
..CCCCC...
.CCCCCCC..
CCCC-CCCC.
CCCCCCAAAA
''', kx=0.7, ky=0.6)
W_BEANIE = Part('''
..CCCCC..
.CCCCCCC.
CCCCCCCCC
ihihihihi
''', kx=0.7, ky=0.7)
W_SCARF = Part('''
.AAAAA
AAAAAA
AA....
A-....
''', kx=0.4, ky=0.3)


def walker_acc():
    S = lambda e: {'S': e}
    return {
        'glasses': dict(a='h', v=S((3, 3, ['..777', '77..7']))),
        'round': dict(a='h', v=S((3, 3, ['..oo.', 'oo..o']))),
        'cap': dict(a='h', v=S(place(0, 0, W_CAP))),
        'beanie': dict(a='h', v=S(place(0, 0, W_BEANIE))),
        'scarf': dict(a='b', v=S(place(4, 12, W_SCARF))),
        'clip': dict(a='h', v=S((3, 2, ['qr']))),
        'buds': dict(a='h', v=S((3, 4, ['x', 'x', 'x']))),
    }


def _norm(e):
    dx, dy, rows = e
    w = max(len(r) for r in rows)
    return (dx, dy, [r.ljust(w, '.') for r in rows])


def table():
    T = {'lead': lead_acc(), 'intern': intern_acc(), 'walker': walker_acc()}
    for size in T.values():
        for a in size.values():
            a['v'] = {k: _norm(e) for k, e in a['v'].items()}
    return T


def anchor(meta, a):
    return (meta['bx'], meta['by']) if a == 'b' else (meta['hx'], meta['hy'])


def pixels(acc, meta):
    """[(x, y, ch)] of one accessory over one raster (absolute raster coordinates), or None if not drawn there."""
    e = acc['v'].get(meta['v']) or acc['v'].get('*')
    if not e:
        return None
    ax, ay = anchor(meta, acc['a'])
    dx, dy, rows = e
    return [(ax + dx + i, ay + dy + j, ch) for j, r in enumerate(rows) for i, ch in enumerate(r) if ch != '.']


def apply(rows, meta, acc, front=None):
    """The page's compositing: overlay pixels go on top, except where the raster has a hand/arm/prop in front."""
    px = [list(r) for r in rows]
    front = meta['front'] if front is None else front
    for (x, y, ch) in pixels(acc, meta) or []:
        if (x, y) in front and px[y][x] != '.':
            continue
        px[y][x] = ch
    return [''.join(r) for r in px]
