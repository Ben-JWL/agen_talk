# Lead animation direction (v2). Every frame is a keyed pose; holds are repeated frames so timing varies
# inside a loop at a fixed fps. ph = secondary-motion phase (hair, cable, ribbon...), lagging the body by
# 1-2 frames. view: 0 = 3/4 toward the monitor, 1 = front (camera), 2 = 3/4 toward the interns.
# folds: pose-dependent torso folds (waist bunching, pull lines, stretch lines).
import lead as L
import arms_lead as AR
from core import Part

A = AR.A
T, D, H, R, X = A['type_up'], A['type_dn'], A['hover'], A['rest'], A['relax']


def sheared(arm, top_rows, s):
    """v1 helper kept for the intern wave (shift forearm rows sideways)."""
    part, x, y, nat = arm[:4]
    g = [''.join(r) for r in part.g]
    out = []
    for j, r in enumerate(g):
        k = s if j < top_rows else (s // 2 if j < top_rows + 4 else 0)
        if k > 0:
            r = ('.' * k + r)[:len(r)] if r.endswith('.' * k) else ('.' * k + r)
        elif k < 0:
            r = r[-k:] + '.' * (-k)
        out.append(r)
    w = max(len(r) for r in out)
    out = [r.ljust(w, '.') for r in out]
    hands = [(hp, dx + s, dy) for (hp, dx, dy) in (arm[4] if len(arm) > 4 else [])]
    return (Part(out, kx=part.kx, ky=part.ky, cast=part.cast, sep=part.sep, mode=part.mode), x, y, nat, hands)


def up(arm, dy):
    return (arm[0], arm[1], arm[2] + dy, arm[3], arm[4] if len(arm) > 4 else [])


def fd(*names):
    out = []
    for n in names:
        rows, dx, dy = AR.FOLDS[n]
        out.append((Part(rows, kx=0, ky=0), dx, dy))
    return out


WAIST, SLUMP, STRETCH, PULL, RAISE_F, LEAN, CROSS = (fd('waist'), fd('slump'), fd('stretch'), fd('waist', 'pull_r'),
                                                     fd('waist', 'raise_r'), fd('lean'), fd('cross'))

# family personality: default expression tweaks per state
FAM = {
    'claude': dict(work=dict(eyes='open', mouth='smile'), idle=dict(mouth='smile')),
    'codex': dict(work=dict(eyes='soft', mouth='flat', by=1), tool=dict(eyes='look', mouth='flat'),
                  stall=dict(mouth='wave')),
    'agy': dict(work=dict(eyes='open', mouth='smile', hy=-1), idle=dict(mouth='smile')),
}


def F(**k):
    k.setdefault('folds', WAIST)
    return k


def work():
    g = dict(glow=1)
    fr = [
        F(armL=T, armR=D, ph=0, **g),
        F(armL=D, armR=D, ph=0, **g),
        F(armL=D, armR=T, ph=1, **g),
        F(armL=T, armR=D, ph=1, **g),
        F(armL=D, armR=T, by=1, eyes='down', ph=1, folds=SLUMP, **g),
        F(armL=T, armR=D, by=1, eyes='down', ph=2, folds=SLUMP, **g),
        F(armL=D, armR=T, by=1, hy=1, eyes='down', ph=2, folds=SLUMP, **g),
        F(armL=D, armR=D, by=1, hy=1, eyes='down', ph=2, folds=SLUMP, **g),
        F(armL=T, armR=D, ph=1, **g),
        F(armL=D, armR=T, ph=0, eyes='shut', **g),
        F(armL=T, armR=D, ph=0, **g),
        F(armL=D, armR=T, ph=0, **g),
        F(armL=T, armR=D, ph=3, **g),
        F(armL=D, armR=D, ph=3, **g),
    ]
    return dict(fps=12, loop=True, key=0, frames=fr)


def tool():
    b = dict(eyes='look', glow=1)
    fr = [
        F(armL=D, armR=D, ph=0, **b),
        F(armL=D, armR=T, bx=-1, by=1, ph=0, folds=SLUMP, **b),                       # anticipation: lean away, load
        F(armL=D, armR=A['reach1'], bx=0, ph=3, **b),
        F(armL=R, armR=A['reach2'], bx=1, hx=1, ph=2, folds=PULL, **b),               # extend (hair lags)
        F(armL=R, armR=A['press'], bx=1, hx=1, ph=1, eyes='squint', mouth='flat', folds=PULL, glow=1),  # press
        F(armL=R, armR=A['press'], bx=1, hx=1, ph=1, eyes='squint', mouth='flat', folds=PULL, glow=1),
        F(armL=R, armR=A['recoil'], bx=0, by=-1, ph=0, mouth='o', **b),               # recoil, overshoot up
        F(armL=R, armR=A['recoil'], bx=0, by=0, ph=3, **b),
        F(armL=R, armR=A['reach1'], ph=2, **b),
        F(armL=D, armR=D, bx=-1, ph=1, glow=1),                                       # settle past rest
        F(armL=T, armR=D, ph=1, glow=1),
        F(armL=D, armR=T, ph=0, **b),                                                 # glance at the LEDs
        F(armL=T, armR=D, ph=0, **b),
        F(armL=D, armR=T, ph=0, glow=1),
    ]
    return dict(fps=12, loop=True, key=4, frames=fr)


def child():
    cu, co, ct = A['cross_under'], A['cross_over'], A['cross_tap']
    b = dict(armL=cu, mouth='flat', folds=CROSS)
    fr = [
        F(armR=co, ph=0, **b),
        F(armR=co, ph=0, **b),
        F(armR=co, by=1, ph=1, **b),
        F(armR=co, by=1, ph=1, **b),
        F(armR=co, view=1, eyes='look', ph=1, **b),                   # head turns: 3/4 -> front
        F(armR=co, view=2, hx=1, eyes='open', ph=2, **b),             # -> 3/4 toward the interns
        F(armR=ct, view=2, hx=1, eyes='open', ph=3, **b),
        F(armR=co, view=2, hx=1, eyes='open', by=1, ph=3, **b),
        F(armR=ct, view=2, hx=1, eyes='open', by=1, ph=2, **b),
        F(armR=co, view=1, eyes='lookl', ph=1, **b),
        F(armR=co, view=0, ph=0, **b),
        F(armR=co, eyes='shut', ph=0, **b),
        F(armR=co, ph=0, **b),
        F(armR=ct, by=1, ph=1, **b),
        F(armR=co, by=1, ph=1, **dict(b, mouth='pout')),
        F(armR=ct, ph=0, **b),
    ]
    return dict(fps=8, loop=True, key=6, frames=fr)


def user():
    ra = A['raise']
    fr = [
        F(armL=D, armR=D, eyes='wide', mouth='o', ph=0),                              # notices
        F(armL=D, armR=T, view=1, by=1, eyes='open', mouth='o', ph=0, folds=SLUMP),   # turn to camera + squash
        F(armL=X, armR=A['raise_antic'], view=1, by=1, mouth='o', ph=3, folds=SLUMP),
        F(armL=X, armR=up(ra, -2), view=1, by=-1, mouth='open', ph=2, folds=RAISE_F),  # overshoot
        F(armL=X, armR=up(ra, -1), view=1, by=0, mouth='open', ph=1, folds=RAISE_F),
        F(armL=X, armR=ra, view=1, mouth='o', ph=0, folds=RAISE_F),
    ]
    return dict(fps=12, loop=False, key=5, next='user_loop', frames=fr)


def user_loop():
    b = dict(armL=X, view=1, folds=RAISE_F)
    fr = [
        F(armR=A['raise'], mouth='o', ph=0, **b),
        F(armR=A['raise_w1'], mouth='o', ph=0, **b),
        F(armR=A['raise_w2'], mouth='open', ph=1, **b),
        F(armR=A['raise_w2'], mouth='open', ph=2, **b),
        F(armR=A['raise_w1'], mouth='o', ph=2, **b),
        F(armR=A['raise'], mouth='o', ph=3, **b),
        F(armR=A['raise_wm'], mouth='open', ph=3, **b),
        F(armR=A['raise_wm'], mouth='open', ph=0, **b),
        F(armR=A['raise'], mouth='o', by=1, ph=0, **b),
        F(armR=A['raise'], mouth='smile', by=1, eyes='shut', ph=1, **b),
        F(armR=A['raise'], mouth='smile', by=1, ph=1, **b),
        F(armR=A['raise'], mouth='o', by=0, ph=0, **b),
    ]
    return dict(fps=10, loop=True, key=2, frames=fr)


def stall():
    b = dict(armL=H, armR=H, mouth='wave')
    fr = [
        F(eyes='wide', by=1, sw=0, ph=0, **b),
        F(eyes='wide', by=1, sw=1, ph=0, **b),
        F(eyes='wide', by=1, bx=-1, sw=2, ph=1, **b),                 # small shiver
        F(eyes='wide', by=1, sw=3, ph=1, view=1, **b),                # looks around: front...
        F(eyes='look', by=1, sw=4, ph=0, view=2, **b),                # ...toward the interns
        F(eyes='look', by=1, sw=5, ph=0, view=2, **b),
        F(eyes='wide', by=2, ph=2, view=1, folds=SLUMP, **b),         # back, slump
        F(eyes='shut', by=2, ph=3, folds=SLUMP, **b),
        F(eyes='wide', by=2, ph=3, folds=SLUMP, **b),
        F(eyes='wide', by=1, ph=2, **dict(b, mouth='flat')),
        F(eyes='wide', by=1, bx=1, ph=1, **dict(b, mouth='flat')),
        F(eyes='wide', by=1, ph=0, **b),
    ]
    return dict(fps=6, loop=True, key=2, frames=fr)


MUG_X = 18


def mugpose(k, s=None, by=0, **kw):
    """Both hands ride with the cup: sleeve HOLD[k] (mirrored for the right arm), mug top at y=k,
    fingers drawn over the mug. 17 reuses the 16 sleeve one pixel lower."""
    key = 16 if k == 17 else k
    arm = AR.HOLD[key]
    if k == 17:
        arm = up(arm, 1)
    my = k + by
    props = [(L.MUG, MUG_X, my)]
    if s is not None:
        props.append((L.STEAM[s % 4], MUG_X + 1, my - 7))
    hl, hdx, hdy = AR.MUG_HANDS['L']
    hr, rdx, rdy = AR.MUG_HANDS['R']
    over = [(hl, MUG_X + hdx, my + hdy), (hr, MUG_X + rdx, my + rdy)]
    return F(armL=arm, armR=arm, props=props, over=over, by=by, folds=LEAN, **kw)


def idle():
    fr = [
        mugpose(36, 0, eyes='soft', hy=0, ph=0),
        mugpose(36, 1, eyes='soft', hy=0, ph=0),
        mugpose(36, 2, by=1, eyes='soft', hy=0, ph=1),
        mugpose(36, 3, by=1, eyes='soft', hy=0, ph=1),
        mugpose(33, 0, eyes='soft', hy=0, ph=0),                     # ease out of the rest...
        mugpose(27, 1, eyes='soft', hy=0, ph=3),
        mugpose(21, None, eyes='shut', hy=0, ph=3),
        mugpose(17, None, eyes='shut', hy=-1, mouth=None, ph=2),      # ...into the sip
        mugpose(16, None, eyes='shut', hy=-1, mouth=None, ph=2),
        mugpose(16, None, eyes='shut', hy=-1, mouth=None, ph=1),
        mugpose(16, None, eyes='shut', hy=-1, mouth=None, ph=1),
        mugpose(17, None, eyes='shut', hy=-1, mouth=None, ph=0),
        mugpose(21, None, eyes='happy', hy=0, mouth='hum', ph=0),    # "ahh"
        mugpose(27, 2, eyes='happy', hy=0, mouth='hum', ph=3),
        mugpose(33, 3, eyes='happy', hy=0, ph=3),
        mugpose(36, 0, eyes='soft', hy=0, ph=2),
        mugpose(36, 1, eyes='soft', hy=0, ph=1),
        mugpose(36, 2, by=1, eyes='soft', hy=0, ph=1),
        mugpose(36, 3, by=1, eyes='shut', hy=0, ph=0),
        mugpose(36, 0, eyes='soft', hy=0, ph=0),
    ]
    return dict(fps=8, loop=True, key=0, frames=fr)


def done():
    sm, st = A['stretch_mid'], A['stretch_top']
    fr = [
        F(armL=D, armR=D, eyes='open', ph=0),
        F(armL=D, armR=D, by=1, eyes='shut', ph=0, folds=SLUMP),      # gather
        F(armL=sm, armR=sm, by=0, eyes='happy', mouth='o', ph=3, folds=STRETCH),
        F(armL=st, armR=st, by=0, eyes='happy', mouth='open', ph=2, folds=STRETCH),
        F(armL=st, armR=st, by=-1, eyes='happy', mouth='open', ph=1, folds=STRETCH),   # overshoot
        F(armL=st, armR=st, by=-1, eyes='happy', mouth='open', ph=0, folds=STRETCH),
        F(armL=st, armR=st, by=0, eyes='happy', mouth='o', ph=3, folds=STRETCH),
        F(armL=sm, armR=sm, by=0, eyes='happy', mouth='smile', ph=2, folds=STRETCH),
        F(armL=X, armR=X, by=1, eyes='happy', mouth='smile', ph=1, folds=SLUMP),      # settle (squash)
        F(armL=X, armR=X, by=0, eyes='happy', mouth='smile', ph=0),
        F(armL=X, armR=X, by=0, eyes='happy', mouth='smile', ph=3),
        F(armL=X, armR=X, by=0, eyes='happy', mouth='smile', ph=0),
    ]
    return dict(fps=10, loop=False, key=4, next='done_loop', frames=fr)


def done_loop():
    b = dict(armL=X, armR=X, mouth='smile')
    fr = [
        F(eyes='happy', ph=0, **b),
        F(eyes='happy', ph=0, **b),
        F(eyes='happy', hy=1, ph=1, **b),                             # contented nod
        F(eyes='happy', hy=1, ph=2, **b),
        F(eyes='happy', ph=1, **b),
        F(eyes='soft', ph=0, **b),
        F(eyes='soft', by=1, ph=0, folds=SLUMP, **b),
        F(eyes='soft', by=1, ph=3, folds=SLUMP, **b),
        F(eyes='soft', ph=3, **b),
        F(eyes='happy', ph=0, **b),
        F(eyes='happy', ph=0, **b),
        F(eyes='happy', ph=0, **b),
    ]
    return dict(fps=5, loop=True, key=0, frames=fr)


def stopped():
    b = dict(armL=X, armR=X, hy=1, eyes='shut', mouth='flat', folds=SLUMP)
    return dict(fps=2, loop=True, key=0, frames=[
        F(by=1, ph=0, **b), F(by=1, ph=0, **b), F(by=2, ph=1, **b), F(by=2, ph=1, **b)])


STATES = dict(work=work, tool=tool, child=child, user=user, user_loop=user_loop, stall=stall, idle=idle,
              done=done, done_loop=done_loop, stopped=stopped)
