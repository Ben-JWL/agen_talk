# Pixel compositor for hand-drawn parts.
# Parts are ASCII grids. '.' = empty. Uppercase = material to be form-shaded
# (S skin, H hair, C cloth, D second cloth, A accent, M mug). Any palette char
# (1-9 a-z) is kept verbatim. The shader only decides which ramp step an
# uppercase pixel gets from the part's own silhouette (top-left key light),
# so every shape is still drawn by hand.

IDX = '0123456789abcdefghijklmnopqrstuvwxyz'
RAMPS = {'S': '2345', 'H': 'abcde', 'C': 'fghij', 'D': 'klmn', 'A': 'opq', 'M': 'uv'}
BASE = {'S': 2, 'H': 2, 'C': 2, 'D': 2, 'A': 1, 'M': 1}
CH2MAT = {}
for m, r in RAMPS.items():
    for c in r:
        CH2MAT[c] = m
CH2MAT.update({'1': 'O', '6': 'S', '7': 'F', '8': 'F', '9': 'F', 'r': 'A', 's': 'C', 't': 'C', 'w': 'C',
               'x': 'X', 'y': 'Y', 'z': 'Z'})
SPECIAL_DARK = {'6': '3', 's': 't', 't': 'f', 'w': 'h', 'r': 'p', 'z': 'h'}
# outline colour (lit side, shadow side) per material
# final: outer silhouette = the hue-shifted dark `1` (restores v2 read against wood/wallpaper);
# corners on lit curves still step to a mid tone (hand AA). Inner lines stay astra's soft material darks.
OUTL = {'H': ('1', '1'), 'C': ('1', '1'), 'S': ('2', '2'), 'D': ('k', '1'), 'A': ('o', '1'), 'M': ('u', '1'),
        'F': ('1', '1'), 'O': ('1', '1'), 'Z': ('1', '1')}
NO_OUTLINE = {'X', 'Y'}


def darken(c, n=1):
    for _ in range(n):
        if c in SPECIAL_DARK:
            c = SPECIAL_DARK[c]
            continue
        m = CH2MAT.get(c)
        if m in RAMPS and c in RAMPS[m]:
            r = RAMPS[m]
            i = r.index(c)
            c = r[max(0, i - 1)]
    return c


def lighten(c, n=1):
    for _ in range(n):
        m = CH2MAT.get(c)
        if m in RAMPS and c in RAMPS[m]:
            r = RAMPS[m]
            i = r.index(c)
            c = r[min(len(r) - 1, i + 1)]
    return c


def grid(rows):
    if isinstance(rows, str):
        rows = [r for r in rows.strip('\n').split('\n')]
        # strip common indentation
        ind = min(len(r) - len(r.lstrip(' ')) for r in rows if r.strip())
        rows = [r[ind:].rstrip() for r in rows]
    w = max(len(r) for r in rows)
    return [list(r.ljust(w, '.').replace(' ', '.')) for r in rows]


OPS = {'-': ('C', -1), '=': ('C', -2), '+': ('C', 1), ':': ('D', -1), ';': ('D', 1), '*': ('H', 'sheen'),
       '_': ('H', -1), '^': ('H', 1)}
MIRROR_MAP = {'b': 'H', 'c': 'H', 'd': 'H', 'e': '*', 'g': 'C', 'h': 'C', 'i': 'C', 'j': 'C',
              'l': 'D', 'm': 'D', 'n': 'D', 'p': 'A', 'q': 'A'}


class Part:
    """A hand drawn part. kx/ky add a broad form gradient (left/top lit).
    mode 'pillow' (v1, edge-based) or 'plane' (v2: broad lit/shadow planes, 1-px top-left edge light,
    folds come from hand-placed op marks: - = darker, + lighter, : ; for the second cloth, * hair sheen)."""

    def __init__(self, rows, kx=0.6, ky=0.4, edge=1.0, cast=0, bias=0.0, name='', sep=0, mode='plane'):
        self.sep = sep
        self.g = grid(rows)
        self.h = len(self.g)
        self.w = len(self.g[0]) if self.h else 0
        self.kx, self.ky, self.edge, self.cast, self.bias = kx, ky, edge, cast, bias
        self.mode = mode
        self.name = name
        self._cache = {}

    def mirror(self, relight=True, extra=None):
        """Opposite 3/4 view: reversed rows; explicit ramp tones are handed back to the shader so the
        light stays top-left (only dark strand lines / outlines / glows stay as drawn)."""
        m = dict(MIRROR_MAP)
        if extra:
            m.update(extra)
        rows = [''.join((m.get(c, c) if relight else c) for c in r[::-1]) for r in self.g]
        return Part(rows, kx=self.kx, ky=self.ky, edge=self.edge, cast=self.cast, bias=self.bias,
                    sep=self.sep, mode=self.mode)

    def shaded(self, flip=False):
        if flip in self._cache:
            return self._cache[flip]
        g = [r[::-1] for r in self.g] if flip else [r[:] for r in self.g]
        h, w = self.h, self.w

        def solid(x, y):
            return 0 <= x < w and 0 <= y < h and g[y][x] != '.'
        xs = [x for y in range(h) for x in range(w) if g[y][x] != '.']
        ys = [y for y in range(h) for x in range(w) if g[y][x] != '.']
        if not xs:
            self._cache[flip] = g
            return g
        x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
        out = [r[:] for r in g]
        for y in range(h):
            for x in range(w):
                c = g[y][x]
                op = None
                if c in OPS:
                    c, op = OPS[c]
                elif c not in RAMPS:
                    continue
                if self.mode == 'plane':
                    lit = 1.0 if ((not solid(x - 1, y)) or (not solid(x, y - 1))) else 0.0
                    dk = 1.0 if (not solid(x + 1, y)) else 0.0
                    v = 0.9 * lit - 0.8 * dk + self.bias
                else:
                    lit = (not solid(x - 1, y)) + (not solid(x, y - 1)) + 0.6 * (not solid(x - 1, y - 1))                         + 0.45 * ((not solid(x - 2, y)) + (not solid(x, y - 2)))
                    dk = (not solid(x + 1, y)) + (not solid(x, y + 1)) + 0.6 * (not solid(x + 1, y + 1))                         + 0.45 * ((not solid(x + 2, y)) + (not solid(x, y + 2)))
                    v = (lit - dk) * self.edge + self.bias
                if x1 > x0:
                    v += self.kx * 2 * (0.5 - (x - x0) / (x1 - x0))
                if y1 > y0:
                    v += self.ky * 2 * (0.5 - (y - y0) / (y1 - y0))
                r = RAMPS[c]
                b = BASE[c]
                st = 0
                if v >= 2.3:
                    st = 2
                elif v >= 0.95:
                    st = 1
                elif v <= -2.3:
                    st = -2
                elif v <= -0.95:
                    st = -1
                i = max(0, min(len(r) - 1, b + st))
                if op == 'sheen':
                    i = len(r) - 1 if i >= b else len(r) - 2
                elif op is not None:
                    i = max(0, min(len(r) - 1, i + op))
                out[y][x] = r[i]
        self._cache[flip] = out
        return out


class Canvas:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.px = [['.'] * w for _ in range(h)]
        self.lay = [[-1] * w for _ in range(h)]
        self.n = 0

    def get(self, x, y):
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.px[y][x]
        return '.'

    def set(self, x, y, c, layer=None):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[y][x] = c
            if layer is not None:
                self.lay[y][x] = layer

    def put(self, part, ox, oy, flip=False, cast=None, clip=None, under=False, mask_from=None, sep=None):
        """Place a part. cast = contact-shadow depth onto what is already there (light from top-left,
        so the shadow falls right/down). clip = (x0,y0,x1,y1) inclusive visible box. under = only fill
        empty pixels (draw behind)."""
        g = part.shaded(flip) if isinstance(part, Part) else part
        self.n += 1
        L = self.n
        cast = part.cast if (cast is None and isinstance(part, Part)) else (cast or 0)
        newpix = set()
        for y, row in enumerate(g):
            for x, c in enumerate(row):
                if c == '.':
                    continue
                X, Y = ox + x, oy + y
                if clip and not (clip[0] <= X <= clip[2] and clip[1] <= Y <= clip[3]):
                    continue
                if not (0 <= X < self.w and 0 <= Y < self.h):
                    continue
                if under and self.px[Y][X] != '.':
                    continue
                newpix.add((X, Y))
        shadow = set()
        if cast and not under:
            offs = [(1, 0), (0, 1), (1, 1)]
            if cast >= 2:
                offs += [(0, 2), (1, 2)]
            for (X, Y) in newpix:
                for dx, dy in offs:
                    q = (X + dx, Y + dy)
                    if q in newpix:
                        continue
                    if 0 <= q[0] < self.w and 0 <= q[1] < self.h and self.px[q[1]][q[0]] != '.':
                        shadow.add(q)
        sep = part.sep if (sep is None and isinstance(part, Part)) else (sep or 0)
        if sep and not under:
            for (X, Y) in newpix:
                for dx, dy in ((1, 0), (0, 1), (-1, 0), (0, -1)):
                    q = (X + dx, Y + dy)
                    if q in newpix:
                        continue
                    if 0 <= q[0] < self.w and 0 <= q[1] < self.h and self.px[q[1]][q[0]] != '.':
                        shadow.add(q)
        for (X, Y) in shadow:
            self.px[Y][X] = darken(self.px[Y][X], 2 if sep and sep > 1 else 1)
        for y, row in enumerate(g):
            for x, c in enumerate(row):
                X, Y = ox + x, oy + y
                if (X, Y) in newpix:
                    self.px[Y][X] = c
                    self.lay[Y][X] = L
        return L

    def paint(self, part, ox, oy, flip=False):
        """Fold patch over pixels that are already there: - = darker, + lighter (any material),
        explicit palette chars recolour. Never adds silhouette."""
        g = part.g if isinstance(part, Part) else grid(part)
        if flip:
            g = [r[::-1] for r in g]
        for y, row in enumerate(g):
            for x, c in enumerate(row):
                X, Y = ox + x, oy + y
                if c == '.' or not (0 <= X < self.w and 0 <= Y < self.h) or self.px[Y][X] == '.':
                    continue
                if c == '-':
                    self.px[Y][X] = darken(self.px[Y][X])
                elif c == '=':
                    self.px[Y][X] = darken(self.px[Y][X], 2)
                elif c == '+':
                    self.px[Y][X] = lighten(self.px[Y][X])
                else:
                    self.px[Y][X] = c

    def dot(self, pts, ox=0, oy=0):
        for (x, y, c) in pts:
            self.set(ox + x, oy + y, c)

    def finish(self, rim=True, rim_rows=None, aa=True):
        """Selective outline (outside, coloured by the neighbour material), hand-style
        corner AA, then a back-right rim light on hair/cloth edges."""
        w, h = self.w, self.h
        P = self.px
        out = [r[:] for r in P]
        is_ol = [[False] * w for _ in range(h)]

        def mat(c):
            return CH2MAT.get(c, 'F')

        for y in range(h):
            for x in range(w):
                if P[y][x] != '.':
                    continue
                # neighbours
                nb = {}
                for dx, dy, side in ((1, 0, 'lit'), (0, 1, 'lit'), (-1, 0, 'dark'), (0, -1, 'dark')):
                    X, Y = x + dx, y + dy
                    if 0 <= X < w and 0 <= Y < h and P[Y][X] != '.' and mat(P[Y][X]) not in NO_OUTLINE:
                        nb.setdefault(side, []).append(P[Y][X])
                if not nb:
                    continue
                if 'dark' in nb:
                    c = nb['dark'][0]
                    col = OUTL.get(mat(c), ('1', '1'))[1]
                else:
                    c = nb['lit'][0]
                    col = OUTL.get(mat(c), ('1', '1'))[0]
                out[y][x] = col
                is_ol[y][x] = True
        if aa:
            # soften staircase corners: an outline pixel touching the shape only diagonally-inward
            # on a lit (top/left) curve takes the shadow step of its neighbour fill
            for y in range(h):
                for x in range(w):
                    if not is_ol[y][x]:
                        continue
                    nfill = []
                    for dx, dy in ((1, 0), (0, 1), (-1, 0), (0, -1)):
                        X, Y = x + dx, y + dy
                        if 0 <= X < w and 0 <= Y < h and P[Y][X] != '.':
                            nfill.append(P[Y][X])
                    nout = sum(1 for dx, dy in ((1, 0), (0, 1), (-1, 0), (0, -1))
                               if 0 <= x + dx < w and 0 <= y + dy < h and is_ol[y + dy][x + dx])
                    if len(nfill) == 1 and nout >= 2:
                        c = nfill[0]
                        m = mat(c)
                        if m in ('H', 'C', 'D', 'S') and out[y][x] != '1':
                            # lit side corner: blend to a mid-dark step
                            out[y][x] = darken(c, 2) if m != 'S' else '3'
        if rim:
            for y in range(1, h - 1):
                if rim_rows and not (rim_rows[0] <= y <= rim_rows[1]):
                    continue
                for x in range(w - 1):
                    cc = P[y][x]
                    if cc == '.' or mat(cc) not in ('H', 'C', 'D'):
                        continue
                    if not is_ol[y][x + 1] or (x + 2 < w and P[y][x + 2] != '.'):
                        continue
                    if P[y - 1][x] == '.' and P[y + 1][x] == '.':
                        continue
                    # A short light-facing edge, not a continuous neon pipe down the head.
                    if y > 0 and P[y - 1][x + 1] != '.':
                        continue
                    out[y][x] = 'z'
        self.px = out
        return self

    def rows(self):
        return [''.join(r) for r in self.px]


def hexrgb(s):
    s = s.lstrip('#')
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))


def dump(part, flip=False):
    for r in part.shaded(flip):
        print(''.join(r))
