# Ambient colleague: 16x24, side view facing right (page mirrors for left). Feet on y=23.
from core import Part, Canvas
from pal import ramp, mix

W, H = 16, 27
ANCHOR = (8, 26)   # feet on y=26; 2 rows of headroom so nothing touches the top edge

HEAD = Part('''
...HHHH..
.HHHHHHH.
HHHHHHHHH
HHHHHH44.
HHH2H474.
HHH344445
.HH34434.
..H3443..
...333...
''', kx=0.7, ky=0.6)
TORSO = Part('''
..33...
.ihhg..
iihhhg.
ihhhhg.
ihhhgg.
ihhhgg.
.hhggg.
.mmlll.
''', kx=0.6, ky=0.3)
LEGS = [Part(r, kx=0.5, ky=0) for r in ('''
..DDDD....
..DDDDD...
.kkDDDDD..
.kk...DD..
kk.....DD.
kk.....DD.
k......DD.
oo.....ooo
''', '''
..DDDD....
.kkDDDD...
.kk..DD...
kk...DD...
kk....DD..
ko....DD..
o.....ooo.
''', '''
..DDDD....
..DDDD....
..kDDD....
..kkDD....
...kDD....
..okDD....
..o.DD....
....ooo...
''', '''
..DDDD....
..DDDD....
..DDDk....
..DD.kk...
..DD..kk..
..DD..kk..
..DD...ko.
..DD....o.
..ooo.....
''', '''
..DDDD....
..DDDDk...
.DDDDkkk..
.DD...kk..
DD.....kk.
DD.....kk.
D......kk.
oo.....ooo
''', '''
..DDDD....
.DDDDkk...
.DD..kk...
DD...kk...
DD....kk..
Do....kk..
o.....ooo.
''', '''
..DDDD....
..DDDk....
..DDkk....
..DDkk....
...Dkk....
..oDkk....
..o.kk....
....ooo...
''', '''
..DDDD....
..DDDD....
..kkkD....
..kk.DD...
..kk..DD..
..kk..DD..
..kk...Do.
..kk....o.
..ooo.....
''')]
STAND = Part('''
..DDDD....
..DDDD....
..kDDD....
..kDDD....
..kDDD....
..kDDD....
..kDDD....
..oooooo..
''', kx=0.5, ky=0)
ARM = {
    'back': Part('''
.CC
CC.
CC.
44.
4..
''', kx=0.5, ky=0, cast=1),
    'mid': Part('''
CC.
CC.
CC.
CC.
44.
''', kx=0.5, ky=0, cast=1),
    'fwd': Part('''
CC..
.CC.
.CC.
..44
..4.
''', kx=0.5, ky=0, cast=1),
    'cup': Part('''
CC...
CC...
.CC..
..44.
''', kx=0.5, ky=0, cast=1),
}
FAR = {k: Part([''.join(r).replace('C', 'g').replace('4', '3') for r in p.g], kx=0, ky=0) for k, p in ARM.items()}
CUP = Part('''
vvv.
vvvu
vvv.
.u..
''', kx=0.6, ky=0)
STEAM = [Part(r, kx=0, ky=0) for r in ('x.\n.x\n.x', '.x\nx.\n.x', '.x\n.x\nx.', 'x.\nx.\n.x')]

BOB = [0, 1, 0, -1, -1, 0] * 2
NEAR = ['back','back','mid','mid','fwd','fwd','fwd','fwd','mid','mid','back','back']
FARA = ['fwd','fwd','mid','mid','back','back','back','back','mid','mid','fwd','fwd']

# Contact / down / passing / up / swing / precontact. Each planted sole moves
# left exactly one source pixel per exposure, matching overview.html Chars.steps().
LEG_KEYS = [
'''
......kkmmm.....
......kkmmm.....
......kk.mmm....
.....kk..mmm....
.....kk...mmm...
....kk....mmm...
....kk.....mm...
.....oo....mmo..
.....ooo...ooo..
''','''
......kkmmm.....
.....kk.mmm.....
....kk...mm.....
....kk...mmm....
....kk....mm....
....koo...mm....
.....oo...mm....
..........mmo...
..........ooo...
''','''
......kkmmm.....
.....kk.mmm.....
.....kk..mm.....
.....kk..mm.....
......kk.mm.....
.......ko.mm....
.......oo.mm....
.........mmo....
.........ooo....
''','''
......kkmmm.....
......kkmm......
.......kkmm.....
........kkm.....
........mkk.....
........mmkoo...
........mm.oo...
........mmo.....
........ooo.....
''','''
......kkmmm.....
.......kkmm.....
.......mmkk.....
.......mm.kk....
.......mm..kk...
.......mm...ko..
.......mm...oo..
.......mmo......
.......ooo......
''','''
......kkmmm.....
......mm.kk.....
......mm..kk....
......mm...kk...
......mm....kk..
......mm....kk..
......mm....ooo.
......mmo.......
......ooo.......
''']
LEGS = [Part(rows if half==0 else rows.translate(str.maketrans('km','mk')),kx=0,ky=0)
        for half in range(2) for rows in LEG_KEYS]


# ---- v2 variants: 'b' long hair + longer coat, 'c' stockier build with a cap
HEAD_B = Part('''
...HHHH..
.HHHHHHH.
HHHHHHHHH
HHHHHH44.
HHHHH474.
HHH344445
HHH34434.
HHH3443..
HHH.333..
HH.......
.H.......
''', kx=0.7, ky=0.5)
TORSO_B = Part('''
..33...
.CCCC..
CCCCCC.
CCCCCC.
CCC-CC.
CCCCCC.
CC+C-C.
CCCCCC.
CC-CCC.
.CCCC..
''', kx=0.6, ky=0.3, mode='plane')
HEAD_C = Part('''
..AAAA...
.AAAAAA..
AAAAAAAAA
.HH44444.
HHH44474.
HH3444445
.H34434..
..3443...
...333...
''', kx=0.7, ky=0.6)
TORSO_C = Part('''
..33....
.CCCCC..
CCCCCCC.
CCCCCCC.
CCC-CCC.
CCCCCCC.
.CCC+CC.
.DDDDDD.
''', kx=0.6, ky=0.3, mode='plane')
VAR = {
    'a': dict(head=lambda: HEAD, torso=lambda: TORSO, hx=0, tx=4),
    'b': dict(head=lambda: HEAD_B, torso=lambda: TORSO_B, hx=0, tx=4),
    'c': dict(head=lambda: HEAD_C, torso=lambda: TORSO_C, hx=0, tx=3),
}


def frame(i=None, stand=None, var='a'):
    V = VAR[var]
    cv = Canvas(W, H)
    b = BOB[i] if i is not None else (1 if 48 <= stand % 144 < 76 else 0)
    ty = 12 + b
    far = FAR[FARA[i]] if i is not None else FAR['mid']
    cv.put(far, 7, ty + 1)
    if i is not None:
        lg = LEGS[i]
        cv.put(lg, 0, 18)
    else:
        cv.put(STAND, 3, 19)
    cv.put(V['torso'](), V['tx'], ty)
    cv.put(V['head'](), 3 + (1 if i is not None else 0), 4 + b)
    if i is not None:
        cv.put(ARM[NEAR[i]], 5, ty + 2)
    else:
        cv.put(CUP, 9, ty + 4)
        cv.put(ARM['cup'], 5, ty + 2)
        cv.put(STEAM[(stand // 9) % 4], 10, ty + 1)
    cv.finish(rim=True, rim_rows=(0, 15))
    if i is not None:
        # Explicit soles are the contact contract. Raised foot outlines cannot masquerade as ground.
        cv.px[26]=['.']*W
        foot=11-i%6
        for x in range(foot,foot+3): cv.px[26][x]='o'
        if i%6==0:
            for x in range(5,8): cv.px[26][x]='o'
    return cv.rows()


WALK_OUTFIT = {
    'claude':  dict(C='#d8a548', D='#6a4a3a', H='#4a2a22', o='#2a1c1c', mug='#f2ebe0', rim='#ffd7a8'),
    'chatgpt': dict(C='#c9ced2', D='#2c3036', H='#1e2026', o='#10a37f', mug='#10a37f', rim='#c8f8e4'),
    'gemini':  dict(C='#b9a8ee', D='#2a3170', H='#3a2a54', o='#5a6cf5', mug='#ffffff', rim='#d6c6ff'),
    'grok':    dict(C='#f0f0f0', D='#141414', H='#2a2a2a', o='#6a6a6a', mug='#141414', rim='#ffffff'),
    'muse':    dict(C='#f39cc6', D='#2f3a8a', H='#5a2a4a', o='#0866ff', mug='#ffd166', rim='#ffc6ea'),
}


WALK_OUTFIT_B = {
    'claude':  dict(C='#7d9a6a', D='#3e2f2a', H='#b0603a', o='#2a1c1c', mug='#c8643f', rim='#ffd7a8'),
    'chatgpt': dict(C='#1f2328', D='#4a5058', H='#c9a36a', o='#f2f4f3', mug='#ffffff', rim='#c8f8e4'),
    'gemini':  dict(C='#3a4ab0', D='#1e2250', H='#e8c8ff', o='#f0c860', mug='#9b72cb', rim='#d6c6ff'),
    'grok':    dict(C='#3a3a3c', D='#0e0e0e', H='#d8d8d8', o='#f2f2f2', mug='#ffffff', rim='#ffffff'),
    'muse':    dict(C='#6a3fb0', D='#2a1e4a', H='#ff9ccf', o='#ffd166', mug='#0866ff', rim='#ffc6ea'),
}
WALK_OUTFIT_C = {
    'claude':  dict(C='#3e5a7a', D='#c2a37a', H='#2a1a14', o='#c8643f', mug='#f2ebe0', rim='#ffd7a8'),
    'chatgpt': dict(C='#10a37f', D='#e4e8e6', H='#3a2a22', o='#202328', mug='#202328', rim='#c8f8e4'),
    'gemini':  dict(C='#e6ecfc', D='#4a68f0', H='#2a1e3a', o='#9b72cb', mug='#4a68f0', rim='#d6c6ff'),
    'grok':    dict(C='#9a9a9a', D='#1a1a1a', H='#121212', o='#ffffff', mug='#1a1a1a', rim='#ffffff'),
    'muse':    dict(C='#ffd166', D='#4c2a80', H='#3a1e2e', o='#f06aa8', mug='#b357e6', rim='#ffc6ea'),
}
SKIN_V = {'a': ['#6a3a36', '#c27c68', '#efb896', '#ffdcbc', '#ef9a8a'],
          'b': ['#7a3f3a', '#d08a72', '#f8c8a6', '#fff0dc', '#f6a296'],
          'c': ['#3e2220', '#7e4a3a', '#b8805a', '#d9a47c', '#c87a66']}


def palette(theme, var='a'):
    o = {'a': WALK_OUTFIT, 'b': WALK_OUTFIT_B, 'c': WALK_OUTFIT_C}[var][theme]
    P = ['#000000'] * 36
    idx = '0123456789abcdefghijklmnopqrstuvwxyz'

    def put(ch, cols):
        for c, v in zip(ch, cols):
            P[idx.index(c)] = v
    put('23456', SKIN_V[var])
    put('789', ['#2a1e2e', '#ffffff', '#8a3a3a'])
    put('abcde', ramp(o['H'], 5, lo=0.14, hi=0.24))
    cl = ramp(o['C'], 5)
    put('fghij', cl)
    put('klmn', ramp(o['D'], 4, lo=0.12, hi=0.22))
    put('opq', ramp(o['o'], 3))
    put('r', ['#ffffff'])
    put('st', [cl[2], cl[1]])
    put('w', [cl[2]])
    put('uv', ramp(o['mug'], 3, lo=0.28, hi=0.1)[:2])
    put('x', ['#f6f2ec'])
    put('y', ['#a8dcf0'])
    put('z', [o['rim']])
    put('1', [mix(cl[0], '#120a20', 0.62)])
    P[0] = 'transparent'
    return P
