"""AT_SPRITES v2 packer (stdlib only): every distinct raster stored once, as a patch against an earlier raster.

pool record  = <ref>!<skip><pixels><skip><pixels>...
  ref     base-26 in A-Z (A=0) of an earlier record in the same pool, or empty = start from transparent
  skip    base-26 in A-Z: pixels (row-major) kept from the reference (no letters = 0)
  pixels  literal palette chars ('.' transparent, 1-9 a-z = base-36 index) written from there on
records are joined with ','. Animations keep fps/loop/key/next and store seq = [raster, hold, raster, hold, ...].
anims[fam][size].vars (variant rotation sets, lists of state keys) is copied as is.
Deterministic: rasters are numbered by first appearance, ties between equally good references go to the lower id.
"""
import json
from operator import ne

CANDIDATES = 6  # exact encodings tried per raster (the closest earlier rasters by differing-pixel count)


def b26(n):
    if n == 0:
        return 'A'
    s = ''
    while n:
        s = chr(65 + n % 26) + s
        n //= 26
    return s


def _ops(cur, ref):
    """skip/literal string turning ref into cur (equal-length str)."""
    n = len(cur)
    out = []
    i = 0
    last = 0
    while i < n:
        if cur[i] == ref[i]:
            i += 1
            continue
        j = i
        while j < n:
            if cur[j] != ref[j]:
                j += 1
                continue
            k = j
            while k < n and cur[k] == ref[k]:
                k += 1
            if k < n and (k - j) <= 1:  # a 1-px equal gap is cheaper inside the literal than a new skip
                j = k
                continue
            break
        out.append(b26(i - last) if i - last else '')
        out.append(cur[i:j])
        last = j
        i = j
    return ''.join(out)


class Pool:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.ids = {}
        self.flat = []
        self.rec = []

    def add(self, rows):
        key = tuple(rows)
        if key in self.ids:
            return self.ids[key]
        cur = ''.join(rows)
        best = '!' + _ops(cur, '.' * len(cur))
        if self.flat:
            diffs = sorted((sum(map(ne, cur, other)), j) for j, other in enumerate(self.flat))
            for _, j in diffs[:CANDIDATES]:
                s = b26(j) + '!' + _ops(cur, self.flat[j])
                if len(s) < len(best):
                    best = s
        self.ids[key] = len(self.flat)
        self.flat.append(cur)
        self.rec.append(best)
        return self.ids[key]

    def data(self):
        return dict(w=self.w, h=self.h, r=','.join(self.rec))


def seq(pool, frames):
    out = []
    for fr in frames:
        i = pool.add(fr)
        if out and out[-2] == i:
            out[-1] += 1
        else:
            out += [i, 1]
    return out


def pal_str(P):
    """[None, '#rrggbb', ...] -> 'rrggbb' * 35 (the decoder expands it back)."""
    return ''.join(c.lstrip('#') for c in P[1:])


def b36(n):
    s = ''
    while True:
        s = '0123456789abcdefghijklmnopqrstuvwxyz'[n % 36] + s
        n //= 36
        if not n:
            return s


def hd_runs(metas):
    """Head anchors per raster as runs: <view A-E|S> <hx> <hy> <bx+10> <by+10> [count base36 if > 1]."""
    out, prev, n = [], None, 0
    for m in metas:
        t = (m['v'], m['hx'], m['hy'], m['bx'] + 10, m['by'] + 10) if m else ('Z', 0, 0, 10, 10)
        for v in t[1:]:
            assert 0 <= v < 36, t
        if t == prev:
            n += 1
            continue
        if prev:
            out.append(prev[0] + ''.join(b36(v) for v in prev[1:]) + (b36(n) if n > 1 else ''))
        prev, n = t, 1
    if prev:
        out.append(prev[0] + ''.join(b36(v) for v in prev[1:]) + (b36(n) if n > 1 else ''))
    return ''.join(out)


def pack(S, meta_of=None, occ_of=None):
    """v1-shaped S (frames = lists of row strings) -> v2 dict. v2.1: palettes as strings, per-raster head anchors
    (pools[*].hd), occlusion pixels (pools[*].oc = {t: distinct pixel runs, i: per-raster runs}), looks, family walkers."""
    pools = {'lead': Pool(S['lead']['w'], S['lead']['h']), 'intern': Pool(S['intern']['w'], S['intern']['h']),
             'walker': Pool(S['walker']['w'], S['walker']['h'])}

    def anim(a, pool):
        d = {k: v for k, v in a.items() if k not in ('frames', 'review')}
        d['seq'] = seq(pool, a['frames'])
        return d
    V = dict(version=2, lead=S['lead'], intern=S['intern'],
             palettes={th: {f: pal_str(P) for f, P in fs.items()} for th, fs in S['palettes'].items()}, anims={})
    for fam, sizes in S['anims'].items():
        V['anims'][fam] = {size: {st: (a if st == 'vars' else anim(a, pools[size])) for st, a in sts.items()}
                           for size, sts in sizes.items()}
    W = S['walker']
    def var(v):
        d = dict(name=v['name'])
        if v.get('palettes'):
            d['palettes'] = {th: pal_str(P) for th, P in v['palettes'].items()}
        if v.get('fam'):
            d.update(fam=v['fam'], size=v['size'])
        d['anims'] = {nm: anim(a, pools['walker']) for nm, a in v['anims'].items()}
        return d
    V['walker'] = dict(w=W['w'], h=W['h'], anchorX=W['anchorX'], anchorY=W['anchorY'],
                       palettes={th: pal_str(P) for th, P in W['palettes'].items()},
                       anims={nm: anim(a, pools['walker']) for nm, a in W['anims'].items()},
                       variants=[var(v) for v in W.get('variants', [])])
    if S.get('looks'):
        V['looks'] = S['looks']
    V['pools'] = {}
    for k, p in pools.items():
        d = p.data()
        if meta_of:
            rows = [[p.flat[i][y * p.w:(y + 1) * p.w] for y in range(p.h)] for i in range(len(p.flat))]
            d['hd'] = hd_runs([meta_of(r) for r in rows])
            # occlusion: distinct pixel sets (runs: 3-char base36 start + 1-char base36 length) and per-raster runs of
            # <table index + 1 as 2 letters A-Z, 'AA' = none><count base36 if > 1>
            table, ids = [], []
            for r in rows:
                px = occ_of(k, r) if occ_of else []
                s = ''
                j = 0
                while j < len(px):
                    n = 1
                    while j + n < len(px) and px[j + n] == px[j] + n and n < 35:
                        n += 1
                    s += b36(px[j]).rjust(3, '0') + b36(n)
                    j += n
                if s and s not in table:
                    table.append(s)
                ids.append(table.index(s) + 1 if s else 0)
            if table:
                runs, j = '', 0
                while j < len(ids):
                    n = 1
                    while j + n < len(ids) and ids[j + n] == ids[j]:
                        n += 1
                    runs += chr(65 + ids[j] // 26) + chr(65 + ids[j] % 26) + (b36(n) if n > 1 else '')
                    j += n
                d['oc'] = dict(t=table, i=runs)
        V['pools'][k] = d
    return V


def js(V, decoder):
    """ui/src/72-sprites.js: the decoder (window.atDecode2) and the data (window.AT_SPRITES), LF only."""
    head = ('/* 72-sprites.js - GENERATED by art/sprites/build.py, do not edit.\n'
            '   Pixel-office characters: window.AT_SPRITES (format v2, see art/sprites/README.md) and its decoder\n'
            '   window.atDecode2(V) -> v1 runtime shape. */\n')
    data = 'window.AT_SPRITES = ' + json.dumps(V, separators=(',', ':'), ensure_ascii=True) + ';\n'
    return head + decoder.strip() + '\n' + data
