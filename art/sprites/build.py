"""Build the pixel-office characters: `python art/sprites/build.py` writes ui/src/72-sprites.js (and nothing else).

Stdlib only. The output is deterministic (same sources -> byte-identical file, LF line endings) and must stay
within the 260 KB budget. Checks: `python art/sprites/check_v2.py`, `python art/sprites/validate_motion.py`.
"""
import json
import os
import sys

sys.dont_write_bytecode = True  # the build writes ui/src/72-sprites.js and nothing else
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import pal
import motion
import lead as L
import intern as I
import anims_lead as AL
import anims_intern as AI
import walker as WK
import acc as AC
import rig
from rig import lead_frame, intern_frame

OUT = os.path.normpath(os.path.join(HERE, '..', '..', 'ui', 'src', '72-sprites.js'))
BUDGET = 260 * 1024
IDX = '0123456789abcdefghijklmnopqrstuvwxyz'
STATES = ['work', 'tool', 'child', 'user', 'user_loop', 'stall', 'idle', 'done', 'done_loop', 'stopped']


def merged(FAM, fam, state, f):
    base = state.split('~')[0].replace('_loop', '')
    t = FAM.get(fam, {}).get(base, {})
    p = dict(f)
    for k, v in t.items():
        if k in ('by', 'hy', 'bx', 'hx'):
            p[k] = p.get(k, 0) + v
        else:
            p.setdefault(k, v)
    return p


def anims_for(fam, size):
    M, fn = (AL, lead_frame) if size == 'lead' else (AI, intern_frame)
    out = {}
    cache = {}
    for st in STATES:
        a = motion.animation(fam,size,st)
        frames=[]
        for f in a['frames']:
            p=merged(M.FAM,fam,st,f)
            k=repr(sorted(p.items()))
            if k not in cache: cache[k]=fn(fam,p)
            frames.append(cache[k])
        d = dict(fps=a['fps'], loop=a['loop'], key=a.get('key', 0), frames=frames,review=a['review'])
        if a.get('next'):
            d['next'] = a['next']
        out[st] = d
    # Motion variants `<state>~N` (same fps/length as the base loop) and the rotation sets the page picks from.
    for st, keys in motion.var_keys(size).items():
        for vk in keys[1:]:
            a = motion.animation(fam, size, vk)
            frames = []
            for f in a['frames']:
                p = merged(M.FAM, fam, vk, f)
                k = repr(sorted(p.items()))
                if k not in cache: cache[k] = fn(fam, p)
                frames.append(cache[k])
            out[vk] = dict(fps=a['fps'], loop=True, key=a['key'], frames=frames, review=a['review'])
    out['vars'] = motion.var_keys(size)
    # Identical landing drawings: no face, hand or hair pop when the adapter follows next.
    for st in ('user','done'):
        out[st]['frames'][-3:]=[out[st+'_loop']['frames'][0]]*3
    return out


def build():
    S = dict(version=1,
             lead=dict(w=L.W, h=L.H, anchorX=L.ANCHOR[0], anchorY=L.ANCHOR[1], deskY=L.DESKY),
             intern=dict(w=I.W, h=I.H, anchorX=I.ANCHOR[0], anchorY=I.ANCHOR[1], deskY=I.DESKY),
             palettes={}, anims={})
    for th in pal.THEMES:
        S['palettes'][th] = {}
        for fam in pal.FAMS:
            p = pal.palette(th, fam)
            p[0] = None
            S['palettes'][th][fam] = p
    for fam in pal.FAMS:
        S['anims'][fam] = {'lead': anims_for(fam, 'lead'), 'intern': anims_for(fam, 'intern')}
    wp = {}
    for th in pal.THEMES:
        p = WK.palette(th)
        p[0] = None
        wp[th] = p
    S['walker'] = dict(w=WK.W, h=WK.H, anchorX=WK.ANCHOR[0], anchorY=WK.ANCHOR[1], palettes=wp, anims=dict(
        walk=dict(fps=12, loop=True, key=0, frames=[WK.frame(i) for i in range(12)]),
        stand=dict(fps=12, loop=True, key=0, frames=[WK.frame(stand=i) for i in range(144)])))
    # v2: extra colleagues (same w/h/anchor). Pages that only know `walker` ignore this.
    # v2.1: family walkers carry fam/size and no palettes: they use palettes[theme][fam] + the agent's look.
    S['walker']['variants'] = []
    for var in WK.GENERIC + [f + '.' + z for f, z in WK.FAMILY]:
        V = WK.VAR[var]
        d = dict(name=var, anims=dict(
            walk=dict(fps=12, loop=True, key=0, frames=[WK.frame(i, var=var) for i in range(12)]),
            stand=dict(fps=12, loop=True, key=0, frames=[WK.frame(stand=i, var=var) for i in range(144)])))
        if 'fam' in V:
            d.update(fam=V['fam'], size=V['size'])
        else:
            vp = {}
            for th in pal.THEMES:
                p = WK.palette(th, var)
                p[0] = None
                vp[th] = p
            d['palettes'] = vp
        S['walker']['variants'].append(d)
    S['looks'] = looks()
    return S


def hexs(cols):
    return ''.join(c.lstrip('#') for c in cols)


def looks():
    """Per-agent looks: palette overrides (look 1..n-1 per theme/family over LOOK_IDX, skin 1..3 over SKIN_IDX)
    and the accessory overlays + which family/size may wear which."""
    I = lambda P, idx: [P[IDX.index(c)] for c in idx]
    lp = {th: {f: [''] + [hexs(I(pal.palette(th, f, k), pal.LOOK_IDX)) for k in range(1, pal.NLOOKS)] for f in pal.FAMS}
          for th in pal.THEMES}
    sk = [''] + [hexs(I(pal.palette('claude', 'claude', 0, k), pal.SKIN_IDX)) for k in range(1, len(pal.SKIN_LOOK))]
    T = AC.table()
    acc = {size: {n: dict(a=e['a'], v={k: [dx, dy, '|'.join(rows)] for k, (dx, dy, rows) in sorted(e['v'].items())})
                  for n, e in sorted(T[size].items())} for size in T}
    return dict(n=pal.NLOOKS, idx=pal.LOOK_IDX, sidx=pal.SKIN_IDX, pal=lp, skin=sk,
                acc=dict(names=AC.NAMES, allow=AC.ALLOW, **acc))


def meta_of(rows):
    return rig.META.get(tuple(rows)) or WK.META.get(tuple(rows))


_T = []


def occ_of(pool, rows):
    """Raster pixels (y * w + x) where some accessory would land on a hand / arm / prop drawn in front of the head:
    the page leaves those to the raster (pools[*].oc)."""
    if not _T:
        _T.append(AC.table())
    m = meta_of(rows)
    if not m or not m['front'] or pool not in _T[0]:
        return []
    w = len(rows[0])
    out = set()
    for a in _T[0][pool].values():
        for (x, y, ch) in AC.pixels(a, m) or []:
            if (x, y) in m['front'] and 0 <= y < len(rows) and 0 <= x < w and rows[y][x] != '.':
                out.add(y * w + x)
    return sorted(out)


def overlay_errors(S):
    """Every accessory a family may wear, over every raster it can appear on: inside the raster, 2 rows of
    headroom, clear of the side and bottom edges (the same rules as the art itself)."""
    errs = []
    T = AC.table()
    seen = set()
    jobs = []
    for fam in pal.FAMS:
        for size in ('lead', 'intern'):
            for st, a in S['anims'][fam][size].items():
                if st != 'vars':
                    jobs += [(fam, size, size, fr) for fr in a['frames']]
    for v in S['walker']['variants']:
        if v.get('fam'):
            for a in v['anims'].values():
                jobs += [(v['fam'], v['size'], 'walker', fr) for fr in a['frames']]
    for fam, size, pool, fr in jobs:
        k = (fam, size, pool, tuple(fr))
        if k in seen:
            continue
        seen.add(k)
        m = meta_of(fr)
        if not m:
            errs.append(f'no head anchor: {fam}/{pool}')
            continue
        w, h = len(fr[0]), len(fr)
        for name in AC.ALLOW[fam][size]:
            px = AC.pixels(T[pool][name], m)
            if px is None:
                errs.append(f'accessory {name} has no {m["v"]} view for {pool}')
                continue
            for (x, y, ch) in px:
                if not (1 <= x < w - 1 and 2 <= y < h - 1):
                    errs.append(f'accessory clip: {fam}/{pool}/{name} at ({x},{y})')
                    break
    return sorted(set(errs))


def validate(S):
    errs = []
    for fam in pal.FAMS:
        for size in ('lead', 'intern'):
            d = S[size]
            for st in STATES:
                a = S['anims'][fam][size].get(st)
                if not a or not a['frames']:
                    errs.append(f'missing {fam}/{size}/{st}')
                    continue
                if a.get('next') and a['next'] not in S['anims'][fam][size]:
                    errs.append(f'bad next {fam}/{size}/{st}')
                for i, fr in enumerate(a['frames']):
                    if len(fr) != d['h'] or any(len(r) != d['w'] for r in fr):
                        errs.append(f'size {fam}/{size}/{st}/{i}')
                    top = next((y for y, r in enumerate(fr) if r.strip('.')), 99)
                    if top < 2:
                        errs.append(f'clip: {fam}/{size}/{st}/{i} filled at y={top} (<2)')
                    used = set(''.join(fr)) - {'.'}
                    for th in pal.THEMES:
                        P = S['palettes'][th][fam]
                        for c in used:
                            if c not in IDX or not P[IDX.index(c)]:
                                errs.append(f'palette {th}/{fam} lacks {c!r}')
            # variants listed in vars: same size/clip/palette checks, same fps and length as the base,
            # first and last exposure = the base frame-0 drawing (switching at a loop boundary never pops)
            A = S['anims'][fam][size]
            for st, keys in A.get('vars', {}).items():
                b = A.get(st)
                if not b or keys[0] != st:
                    errs.append(f'vars {fam}/{size}/{st}: base missing or not first')
                    continue
                for vk in keys[1:]:
                    v = A.get(vk)
                    if not v or not v['frames']:
                        errs.append(f'missing variant {fam}/{size}/{vk}')
                        continue
                    if not v['loop'] or v['fps'] != b['fps'] or len(v['frames']) != len(b['frames']):
                        errs.append(f'variant {fam}/{size}/{vk}: loop/fps/length differ from the base')
                    if v['frames'][0] != b['frames'][0] or v['frames'][-1] != b['frames'][0]:
                        errs.append(f'variant seam {fam}/{size}/{vk}: must start and end on the base frame 0')
                    for i, fr in enumerate(v['frames']):
                        if len(fr) != d['h'] or any(len(r) != d['w'] for r in fr):
                            errs.append(f'size {fam}/{size}/{vk}/{i}')
                        top = next((y for y, r in enumerate(fr) if r.strip('.')), 99)
                        if top < 2:
                            errs.append(f'clip: {fam}/{size}/{vk}/{i} filled at y={top} (<2)')
                        used = set(''.join(fr)) - {'.'}
                        for th in pal.THEMES:
                            P = S['palettes'][th][fam]
                            for c in used:
                                if c not in IDX or not P[IDX.index(c)]:
                                    errs.append(f'palette {th}/{fam} lacks {c!r}')
    wsets = [(S['walker']['anims'], S['walker']['palettes'])] + [(v['anims'], v.get('palettes') or {th: S['palettes'][th][v['fam']] for th in pal.THEMES}) for v in S['walker'].get('variants', [])]
    for anims_, pals_ in wsets:
      for nm, a in anims_.items():
        for i, fr in enumerate(a['frames']):
            top = next((y for y, r in enumerate(fr) if r.strip('.')), 99)
            if top < 2:
                errs.append(f'clip: walker/{nm}/{i} filled at y={top}')
            used = set(''.join(fr)) - {'.'}
            for th, P in pals_.items():
                for c in used:
                    if not P[IDX.index(c)]:
                        errs.append(f'walker palette {th} lacks {c}')
    errs += overlay_errors(S)
    L = S.get('looks')
    if L:
        for th in pal.THEMES:
            for fam in pal.FAMS:
                if len(L['pal'][th][fam]) != L['n'] or any(len(x) != 6 * len(L['idx']) for x in L['pal'][th][fam][1:]):
                    errs.append(f'looks {th}/{fam} malformed')
    return sorted(set(errs))


def render(S):
    """The exact text of ui/src/72-sprites.js."""
    import at2
    with open(os.path.join(HERE, 'at2_decode.js'), encoding='utf-8') as f:
        decoder = f.read()
    return at2.js(at2.pack(S, meta_of, occ_of), decoder)


def main():
    S = build()
    e = validate(S)
    print('errors:', len(e))
    for x in e[:30]:
        print(' ', x)
    if e:
        return 1
    text = render(S)
    data = text.encode('utf-8')
    if len(data) > BUDGET:
        print('over budget: %d bytes > %d' % (len(data), BUDGET))
        return 1
    with open(OUT, 'wb') as f:  # bytes: LF only on every OS
        f.write(data)
    n = sum(len(a['frames']) for f in S['anims'].values() for s in f.values() for k, a in s.items() if k != 'vars')
    print('exposures', n, '->', os.path.relpath(OUT, os.path.join(HERE, '..', '..')).replace(os.sep, '/'), len(data), 'bytes')
    return 0


if __name__ == '__main__':
    sys.exit(main())
