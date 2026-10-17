"""Build the pixel-office characters: `python art/sprites/build.py` writes ui/src/72-sprites.js (and nothing else).

Stdlib only. The output is deterministic (same sources -> byte-identical file, LF line endings) and must stay
within the 150 KB budget. Checks: `python art/sprites/check_v2.py`, `python art/sprites/validate_motion.py`.
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
from rig import lead_frame, intern_frame

OUT = os.path.normpath(os.path.join(HERE, '..', '..', 'ui', 'src', '72-sprites.js'))
BUDGET = 150 * 1024
IDX = '0123456789abcdefghijklmnopqrstuvwxyz'
STATES = ['work', 'tool', 'child', 'user', 'user_loop', 'stall', 'idle', 'done', 'done_loop', 'stopped']


def merged(FAM, fam, state, f):
    base = state.replace('_loop', '')
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
    # v2: optional extra colleagues (same w/h/anchor). Pages that only know `walker` ignore this.
    S['walker']['variants'] = []
    for var in ('b', 'c'):
        vp = {}
        for th in pal.THEMES:
            p = WK.palette(th, var)
            p[0] = None
            vp[th] = p
        S['walker']['variants'].append(dict(name=var, palettes=vp, anims=dict(
            walk=dict(fps=12, loop=True, key=0, frames=[WK.frame(i, var=var) for i in range(12)]),
            stand=dict(fps=12, loop=True, key=0, frames=[WK.frame(stand=i, var=var) for i in range(144)]))))
    return S


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
    wsets = [(S['walker']['anims'], S['walker']['palettes'])] + [(v['anims'], v['palettes']) for v in S['walker'].get('variants', [])]
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
    return sorted(set(errs))


def render(S):
    """The exact text of ui/src/72-sprites.js."""
    import at2
    with open(os.path.join(HERE, 'at2_decode.js'), encoding='utf-8') as f:
        decoder = f.read()
    return at2.js(at2.pack(S), decoder)


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
    n = sum(len(a['frames']) for f in S['anims'].values() for s in f.values() for a in s.values())
    print('exposures', n, '->', os.path.relpath(OUT, os.path.join(HERE, '..', '..')).replace(os.sep, '/'), len(data), 'bytes')
    return 0


if __name__ == '__main__':
    sys.exit(main())
