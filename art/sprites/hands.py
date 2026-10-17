# v2 hands. Explicit skin tones (2 deep, 3 shadow, 4 base, 5 light); the 1-px gaps between fingers
# become warm outline lines in finish(), which is what separates the finger groups at 6x.
# Light from top-left: knuckle highlights (5) on the top row, shadow (3) toward the fingertips/right.
from core import Part


def H(rows):
    return Part(rows, kx=0, ky=0)


# ---------------- LEAD (about 6-8 px wide)
# typing, back of the hand seen from above-front; fingers point down onto the keys, thumb tucked inside
KEY_A = H('''
.444..
455443
454443
.44343
..3.3.
''')            # index + ring down
KEY_B = H('''
.444..
455443
454443
.4344.
...3..
''')            # middle down, the others lifted
HOVER = H('''
.4444..
4554443
4544443
.44343.
..3.3..
''')            # spread and frozen above the keys
PRESS = H('''
.444....
45544...
4544444.
4543..43
.332...3
''')            # index finger extended, tip at (7,4)
POINT = H('''
.444....
45544444
4543....
.332....
''')            # reaching in, index straight
FIST = H('''
.444.
45543
45443
.332.
''')
OPEN = H('''
..4.4...
..4544..
..45343.
4.45543.
4445443.
.44443..
..443...
''')            # raised palm, fingers spread, thumb out
WAVE_L = H('''
.4.4....
.4544...
.45343..
4.45543.
4445443.
.44443..
..443...
''')
WAVE_R = H('''
...4.4..
...4544.
...45343
.4.45543
.444543.
..4443..
..443...
''')
SMALL_OPEN = H('''
..44..
.4544.
.45443
445443
.4443.
''')            # stretch hands
TUCK = H('''
.4.4.
45454
.3.3.
''')            # fingertips gripping the other arm (crossed arms)
TUCK_TAP = H('''
.4...
.4.4.
45454
.3.3.
''')            # index lifted: tapping
MUG_L = H('''
.44..
4554.
4.444
454..
4.444
.33..
''')            # left hand: palm on the side, two fingers wrapped across the front
MUG_R = H('''
.54.
4544
.443
4443
.32.
''')            # right fist through the handle, thumb on top

# ---------------- INTERN (4-5 px, simplified but shaped)
I_KEY_A = H('''
.44.
4554
4.43
3...
''')
I_KEY_B = H('''
.44.
4554
4.43
..3.
''')
I_HOVER = H('''
.444.
45543
4.4.3
''')
I_PRESS = H('''
.44.
4554
.443
..3.
''')
I_FIST = H('''
.44.
4554
.33.
''')
I_OPEN = H('''
..44.
.4543
44543
.443.
''')
I_TUCK = H('''
4.4.
4544
''')
I_TUCK_TAP = H('''
4...
4.4.
4544
''')
I_MUG_L = H('''
.4.
454
4.4
.3.
''')
I_MUG_R = H('''
.5.
454
.43
''')
