# Intern timing (v2): lighter, quicker, fewer frames than the lead (juniors get a bit more bounce).
# view: 0 = 3/4 toward its monitor (right), -1 = front, -2 = 3/4 toward the lead (left).
import intern as I
import intern2 as I2
from anims_lead import sheared, up
from core import Part

A = I2.A
T, D, H, R, X = A['type_up'], A['type_dn'], A['hover'], A['rest'], A['relax']


def fd(*names):
    return [(Part(I2.FOLDS[n][0], kx=0, ky=0), I2.FOLDS[n][1], I2.FOLDS[n][2]) for n in names]


WAIST, SLUMP, STRETCH, PULL, LEAN = fd('waist'), fd('slump'), fd('stretch'), fd('waist', 'pull_r'), fd('lean')


def F(**k):
    k.setdefault('folds', WAIST)
    return k


FAM = {
    'claude': dict(),
    'codex': dict(work=dict(eyes='soft', mouth='flat'), tool=dict(mouth='flat')),
    'agy': dict(work=dict(hy=-1)),
}


def work():
    g = dict(glow=1)
    return dict(fps=12, loop=True, key=0, frames=[
        F(armL=T, armR=D, ph=0, **g), F(armL=D, armR=T, ph=0, **g), F(armL=T, armR=D, by=1, ph=1, folds=SLUMP, **g),
        F(armL=D, armR=T, by=1, eyes='down', ph=2, folds=SLUMP, **g), F(armL=T, armR=D, by=1, eyes='down', ph=2, folds=SLUMP, **g),
        F(armL=D, armR=D, ph=1, **g), F(armL=T, armR=D, ph=0, eyes='shut', **g), F(armL=D, armR=T, ph=0, **g),
        F(armL=T, armR=D, ph=1, **g), F(armL=D, armR=T, ph=1, **g)])


def tool():
    g = dict(glow=1)
    return dict(fps=12, loop=True, key=4, frames=[
        F(armL=T, armR=D, ph=0, **g), F(armL=D, armR=T, ph=0, **g),
        F(armL=D, armR=A['lift'], by=-1, eyes='squint', ph=1, folds=PULL, **g),            # wind up
        F(armL=D, armR=A['lift'], by=-1, eyes='squint', ph=2, folds=PULL, **g),
        F(armL=D, armR=A['strike'], by=1, eyes='squint', mouth='flat', ph=0, folds=SLUMP, **g),  # Enter
        F(armL=D, armR=A['strike'], by=1, eyes='squint', mouth='grin', ph=3, folds=SLUMP, **g),
        F(armL=D, armR=A['strike'], by=0, eyes='open', mouth='grin', ph=2, **g),
        F(armL=T, armR=D, ph=1, **g), F(armL=D, armR=T, ph=0, **g), F(armL=T, armR=D, ph=0, **g)])


def child():
    cu, co, ct = A['cross_under'], A['cross_over'], A['cross_tap']
    b = dict(armL=cu, mouth='flat')
    return dict(fps=8, loop=True, key=4, frames=[
        F(armR=co, ph=0, **b), F(armR=co, by=1, ph=1, **b), F(armR=ct, by=1, ph=1, **b),
        F(armR=co, view=-1, eyes='lookl', ph=0, **b), F(armR=co, view=-2, hx=-1, eyes='open', ph=3, **b),
        F(armR=ct, view=-2, hx=-1, eyes='open', ph=2, **b), F(armR=co, view=-2, hx=-1, by=1, eyes='open', ph=1, **b),
        F(armR=co, view=-1, ph=0, **b), F(armR=co, eyes='shut', ph=0, **b), F(armR=ct, ph=0, **dict(b, mouth='pout'))])


def user():
    ra = A['raise']
    return dict(fps=12, loop=False, key=4, next='user_loop', frames=[
        F(armL=D, armR=D, eyes='wide', mouth='o', ph=0),
        F(armL=D, armR=T, view=-1, by=1, mouth='o', ph=0, folds=SLUMP),
        F(armL=X, armR=A['raise_antic'], view=-1, by=1, mouth='o', ph=3, folds=SLUMP),
        F(armL=X, armR=up(ra, -2), view=-1, by=-1, mouth='open', ph=2, folds=PULL),
        F(armL=X, armR=ra, view=-1, mouth='open', ph=1, folds=PULL)])


def user_loop():
    ra = A['raise']
    w1, w2, wm = sheared(ra, 6, 1), sheared(ra, 6, 2), sheared(ra, 6, -1)
    b = dict(armL=X, view=-1, folds=PULL)
    return dict(fps=10, loop=True, key=0, frames=[
        F(armR=ra, mouth='o', ph=0, **b), F(armR=w1, mouth='o', ph=0, **b), F(armR=w2, mouth='open', ph=1, **b),
        F(armR=w1, mouth='open', ph=2, **b), F(armR=ra, mouth='o', ph=2, **b), F(armR=wm, mouth='open', ph=3, **b),
        F(armR=ra, mouth='o', by=1, ph=0, **b), F(armR=ra, mouth='smile', by=1, eyes='shut', ph=1, **b)])


def stall():
    b = dict(armL=H, armR=H, mouth='wave')
    return dict(fps=6, loop=True, key=2, frames=[
        F(eyes='wide', by=1, sw=0, ph=0, **b), F(eyes='wide', by=1, sw=1, ph=0, **b),
        F(eyes='wide', by=1, bx=1, sw=2, ph=1, view=-1, **b), F(eyes='lookl', by=1, sw=3, ph=1, view=-2, **b),
        F(eyes='lookl', by=1, sw=4, ph=0, view=-2, **b), F(eyes='wide', by=2, ph=2, view=-1, folds=SLUMP, **b),
        F(eyes='shut', by=2, ph=3, folds=SLUMP, **b), F(eyes='wide', by=2, ph=3, folds=SLUMP, **b),
        F(eyes='wide', by=1, bx=-1, ph=1, **dict(b, mouth='flat')), F(eyes='wide', by=1, ph=0, **b)])


MUG_X = 13


def mugpose(k, s=None, by=0, **kw):
    arm = I2.HOLD[k]
    my = k + by
    props = [(I.MUG, MUG_X, my)]
    if s is not None:
        props.append((I.STEAM[s % 4], MUG_X + 1, my - 5))
    hl, hdx, hdy = I2.MUG_HANDS['L']
    hr, rdx, rdy = I2.MUG_HANDS['R']
    over = [(hl, MUG_X + hdx, my + hdy), (hr, MUG_X + rdx, my + rdy)]
    return F(armL=arm, armR=arm, props=props, over=over, by=by, folds=LEAN, **kw)


def idle():
    return dict(fps=8, loop=True, key=0, frames=[
        mugpose(28, 0, eyes='soft', hy=-1, ph=0),
        mugpose(28, 1, eyes='soft', hy=-1, ph=0),
        mugpose(28, 2, by=1, eyes='soft', hy=-1, ph=1),
        mugpose(28, 3, by=1, eyes='soft', hy=-1, ph=1),
        mugpose(25, 0, eyes='soft', hy=-1, ph=0),           # eased lift
        mugpose(20, None, eyes='shut', hy=-1, ph=3),
        mugpose(16, None, eyes='shut', hy=-1, mouth=None, ph=2),
        mugpose(13, None, eyes='shut', hy=-1, mouth=None, ph=2),     # sip
        mugpose(13, None, eyes='shut', hy=-1, mouth=None, ph=1),
        mugpose(13, None, eyes='shut', hy=-1, mouth=None, ph=1),
        mugpose(16, None, eyes='happy', hy=-1, mouth='hum', ph=0),
        mugpose(20, None, eyes='happy', hy=-1, mouth='hum', ph=3),
        mugpose(25, 1, eyes='happy', hy=-1, ph=3),
        mugpose(28, 2, eyes='soft', hy=-1, ph=2),
        mugpose(28, 3, by=1, eyes='soft', hy=-1, ph=1),
        mugpose(28, 0, by=1, eyes='shut', hy=-1, ph=0)])


def done():
    sm, st = A['stretch_mid'], A['stretch_top']
    return dict(fps=10, loop=False, key=3, next='done_loop', frames=[
        F(armL=D, armR=D, by=1, eyes='shut', ph=0, folds=SLUMP),
        F(armL=sm, armR=sm, eyes='happy', mouth='o', ph=3, folds=STRETCH),
        F(armL=st, armR=st, by=0, eyes='happy', mouth='open', ph=2, folds=STRETCH),
        F(armL=st, armR=st, by=-1, eyes='happy', mouth='open', ph=1, folds=STRETCH),
        F(armL=st, armR=st, by=0, eyes='happy', mouth='o', ph=0, folds=STRETCH),
        F(armL=sm, armR=sm, eyes='happy', mouth='smile', ph=3, folds=STRETCH),
        F(armL=X, armR=X, by=1, eyes='happy', mouth='smile', ph=2, folds=SLUMP),
        F(armL=X, armR=X, eyes='happy', mouth='smile', ph=1),
        F(armL=X, armR=X, eyes='happy', mouth='smile', ph=0)])


def done_loop():
    b = dict(armL=X, armR=X, mouth='smile')
    return dict(fps=5, loop=True, key=0, frames=[
        F(eyes='happy', ph=0, **b), F(eyes='happy', hy=1, ph=1, **b), F(eyes='happy', hy=1, ph=2, **b),
        F(eyes='happy', ph=1, **b), F(eyes='soft', by=1, ph=0, folds=SLUMP, **b), F(eyes='soft', by=1, ph=3, folds=SLUMP, **b),
        F(eyes='happy', ph=3, **b), F(eyes='happy', ph=0, **b)])


def stopped():
    b = dict(armL=X, armR=X, hy=1, eyes='shut', mouth='flat', folds=SLUMP)
    return dict(fps=2, loop=True, key=0, frames=[F(by=1, ph=0, **b), F(by=2, ph=1, **b)])


STATES = dict(work=work, tool=tool, child=child, user=user, user_loop=user_loop, stall=stall, idle=idle,
              done=done, done_loop=done_loop, stopped=stopped)
