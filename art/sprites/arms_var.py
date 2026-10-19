"""Hand-authored parts for the motion variants (work/idle/stall/child/done_loop/user_loop `~N` keys).

Same conventions as arms_lead.py / intern2.py: sleeves are ASCII cloth (C, - crease, + fold light, D cuff, : rib),
drawn as the screen-left arm (the rig mirrors them for the right side); hands are explicit skin tones.
Imported by motion.py after atelier, so the sleeves get the same tailoring pass as the base arms.
"""
import atelier  # noqa: F401  (installs tailored base arms/holds first)
from core import Part
import arms_lead as AR
import intern2 as I2
import lead as L
import intern as I
import hands as HN


def H(rows):
    return Part(rows, kx=0, ky=0)


# ---------------- new hands / props
# phone held upright in a loose fist (lead): screen glow `y`, glint `x`, case outline `1`; B = thumb on the screen
PHONE = H('''
1111.
1yy1.
1yx1.
4444.
45543
4544.
.33..
''')
PHONE_B = H('''
1111.
1yy1.
14y1.
4544.
45543
4544.
.33..
''')
I_PHONE = H('''
111
1y1
444
453
.3.
''')
I_PHONE_B = H('''
111
141
454
453
.3.
''')
# small eyes-up look for the thinking pose (pupil in the top row)
L.EYES.setdefault('up', ['..', 'a8', '.7'])
I2.EYES.setdefault('up', ['a8', '.7'])


def top_hand(arm, hand, ox=0, oy=0):
    """Put `hand` on the cuff of a hold sleeve: centred on the topmost cuff (D/:) row, 1 row of overlap."""
    part = arm[0]
    top = next(j for j, r in enumerate(part.g) if any(c in 'D:' for c in r))
    xs = [x for x, c in enumerate(part.g[top]) if c in 'D:']
    dx = (min(xs) + max(xs)) // 2 - hand.w // 2 + ox
    return (arm[0], arm[1], arm[2], arm[3], [(hand, dx, top - hand.h + 1 + oy)])


def mirror_native(arm, axis):
    """A native right arm (raise, raise_w1 ...) drawn on the screen-left side: same pixels as the rig's flip."""
    part, x0, y0 = arm[:3]
    rows = [''.join(r[::-1]) for r in part.g]
    p = Part(rows, kx=part.kx, ky=part.ky, cast=part.cast, sep=part.sep, mode=part.mode)
    nx = 2 * axis - x0 - part.w + 1
    hands = []
    for hp, dx, dy in (arm[4] if len(arm) > 4 else []):
        hx = 2 * axis - (x0 + dx) - hp.w + 1
        hands.append((Part([''.join(r[::-1]) for r in hp.g], kx=hp.kx, ky=hp.ky), hx - nx, dy))
    return (p, nx, y0, 'N', hands)


def sl(rows, x, y, **kw):
    return atelier.tailor(AR.sl(rows, x, y, **kw))


# ---------------- lead
LA = {}
for k in (27, 29, 31, 33):
    LA['chin%d' % k] = top_hand(AR.HOLD[k], HN.FIST, 0, 1)   # fist under the chin / cheek
LA['phone36'] = top_hand(AR.HOLD[36], PHONE, 0, 1)   # held at chest height over the mug
LA['phone36b'] = top_hand(AR.HOLD[36], PHONE_B, 0, 1)
# both hands laced behind the head: elbow out at the side, forearm runs back behind the hair
LA['behind'] = sl('''
...CCCCCCC.
..CC+CCCCCC
.CC+CC-CCC.
CC+CC......
CC+C.......
CCC+C......
CCCC-......
.CCC-C.....
.CC+CC.....
..CCC-C....
..CC+CC....
...CCC-C...
...CC+CC...
....CCC-C..
....CC+CC..
.....CCC-C.
.....CCCCCC
......CCCCC
......CCCCC
''', 3, 9)
LA['raise_l'] = mirror_native(AR.A['raise'], 21)
LA['raise_l1'] = mirror_native(AR.A['raise_w1'], 21)
LA['raise_lm'] = mirror_native(AR.A['raise_wm'], 21)
LA['raise_lantic'] = mirror_native(AR.A['raise_antic'], 21)

# ---------------- intern
IA = {}
for k in (21, 23, 25, 27):
    IA['chin%d' % k] = top_hand(I2.HOLD[k], HN.I_FIST, 0, 1)
IA['phone28'] = top_hand(I2.HOLD[28], I_PHONE, 0, 1)   # chest height: the intern's sleeve is short
IA['phone28b'] = top_hand(I2.HOLD[28], I_PHONE_B, 0, 1)
IA['behind'] = atelier.tailor(I2.sl('''
...CCCCC
..CC+CCC
.CC+C...
CC+C....
CCC-....
CCCC....
.CC+C...
.CCC-...
..CC+C..
..CCC-..
...CC+C.
...CCCC.
....CCCC
....CCCC
''', 3, 8))
IA['raise_l'] = mirror_native(I2.A['raise'], I.AXIS)
IA['raise_antic_l'] = mirror_native(I2.A['raise_antic'], I.AXIS)
# Transition drawings: shoulders stay planted while the wrist follows an arc.
# A low elbow bend and an outward shoulder-height bend bridge desk -> stretch.
LA['lift_low'] = sl('''
......CCC..
.....CCCCC.
....CCCCC..
...CCCCC...
..CCCCC....
.CCCC.....D
CCCC....DD:
CCCC...CCC.
.CCCC.CCC..
..CCCCCC...
...CCCC....
''', 4, 26, hands=[(HN.FIST, 8, 3)])
LA['lift_mid'] = sl('''
..DD:D......
..CC+C......
.CC+CC......
.CCCC.......
CCCC........
CCCC........
CCCC.....CCC
.CCCC...CCCC
..CCCC.CCCCC
...CCCCCCCC.
....CCCCCC..
.....CCCC...
''', 3, 20, hands=[(HN.FIST, 2, -3)])
IA['lift_low'] = atelier.tailor(I2.sl('''
....CCC..
...CCCCC.
..CCCCC..
.CCCC..D.
CCCC..DD:
.CCC.CCC.
..CCCCC..
...CCC...
''', 3, 22, hands=[(HN.I_FIST, 6, 1)]))
IA['lift_mid'] = atelier.tailor(I2.sl('''
.DD:.....
.CCC.....
CCC......
CCC......
CCC...CCC
.CCC.CCCC
..CCCCCC.
...CCCC..
''', 2, 18, hands=[(HN.I_FIST, 1, -2)]))

# Use the already drawn mug contours: wrist/hand/phone always travel together.
for V, holds, fist, phone, phone_b, lo, hi in (
        (LA, AR.HOLD, HN.FIST, PHONE, PHONE_B, 36, 31),
        (IA, I2.HOLD, HN.I_FIST, I_PHONE, I_PHONE_B, 28, 25)):
    for k in range(hi, lo+1):
        V['phone%d'%k] = top_hand(holds[k], phone, 0, 1)
        V['phone%db'%k] = top_hand(holds[k], phone_b, 0, 1)
    V['phone_palm'] = top_hand(holds[lo], fist, 0, 1)
    for k in range(21 if V is IA else 27, lo+1):
        V['chin%d'%k] = top_hand(holds[k], fist, 0, 1)
    axis = 21 if V is LA else I.AXIS
    base = AR.A if V is LA else I2.A
    V['raise_lmid'] = mirror_native(base['raise_mid'], axis)
