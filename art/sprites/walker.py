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
# ---- v2.1: colleagues with props ('d' cleaner + mop, 'e' courier + parcel, 'f' plant carrier, 'g' laptop under the arm)
HEAD_D = Part('''
...AAAA..
.AAAAAAA.
AAAAAAAAA
HHHHHH44.
HHH2H474.
HHH344445
.HH34434.
..H3443..
...333...
''', kx=0.7, ky=0.6)          # bandana
TORSO_D = Part('''
..33...
.CDDC..
CCDDCC.
CCDDCC.
CCCCCC.
CC-CCC.
CCCCCC.
.CCCCC.
''', kx=0.6, ky=0.3, mode='plane')   # overalls: bib + straps over a shirt
HEAD_E = Part('''
..AAAA...
.AAAAAA..
AAAAAAAAAA
.HH4444..
HHH44474.
HH3444445
.H34434..
..3443...
...333...
''', kx=0.7, ky=0.6)          # courier cap, brim forward
TORSO_E = Part('''
..33...
.CCCC..
CCCCCC.
CCCCCC.
CC-CCC.
CCCCCC.
CCCCCC.
.DDDDD.
''', kx=0.6, ky=0.3, mode='plane')
HEAD_F = Part('''
..HHHH...
.HHHHHH..
HHHHHHHH.
HHHHH44..
HHH2H474.
HHH344445
HHH34434.
HH.3443..
H..333...
''', kx=0.7, ky=0.6)          # low ponytail
TORSO_F = Part('''
..33...
.CCCC..
CCCCCC.
CCCCCC.
CCCCCC.
CC+CCC.
CCCCCC.
.CCCCC.
''', kx=0.6, ky=0.3, mode='plane')
HEAD_G = Part('''
...HHHH..
.HHHHHHH.
HHHHHHHH.
HHHHHH44.
HHH2H474.
HHH344445
.HH34434.
..H3443..
...333...
''', kx=0.7, ky=0.6)
TORSO_G = Part('''
..33...
.CwwC..
CCwwCC.
CCCwCC.
CCCwCC.
CCCCCC.
CCCCCC.
.DDDDD.
''', kx=0.6, ky=0.3, mode='plane')   # lanyard
# props (palette slots: u v = wood / cardboard / pot, s t = leaf greens, x = mop head / tape)
MOP = Part('''
.....u....
.....u....
......u...
......u...
.......u..
.......u..
........u.
.......xxx
......xxyy
''', kx=0, ky=0)
MOP_SWEEP = [Part(r, kx=0, ky=0) for r in ('''
.....u....
.....u....
.....u....
......u...
......u...
......u...
......u...
.....xxxx.
....xxxyy.
''', '''
.....u....
.....u....
......u...
......u...
.......u..
.......u..
........u.
........u.
.......xxyy
''')]
HOLD = Part('''
CC..
.CC.
..44
''', kx=0.5, ky=0, cast=1)    # near arm forward, hand closed around a handle / box edge
BOX = Part('''
vvvvvu
vxxvvv
vvxvvu
vvvvvu
uuuuuu
''', kx=0, ky=0)
PLANT = [Part(r, kx=0, ky=0) for r in ('''
..t.s.
.tsss.
tsswst
.sstts
..ts..
.vxxv.
.vvvu.
..vu..
''', '''
...ts.
.tsss.
tssswt
.sstts
..st..
.vxxv.
.vvvu.
..vu..
''')]
LAPTOP = Part('''
1vvvvvu
1uuuuyu
''', kx=0, ky=0)
UNDER = Part('''
CC.
CC.
CC.
44.
''', kx=0.5, ky=0, cast=1)   # near arm pressed to the side over the laptop

# ---- v2.1: family walkers. A walking, standing version of each family's look (lead and intern) that uses the
# family palette (AT_SPRITES.palettes[theme][fam]) and therefore every per-agent look/skin swap, so an agent who leaves
# its desk wears the same hair, outfit and accessories in the corridor. Interns stand 2 px shorter.
FHEAD = {
    ('claude', 'lead'): Part('''
...HHHH...
.HHHHHHHH.
HHHHHHHHHH
HHHHHH_44.
HHHqpH474.
HHHH34444.
HHHH34434.
HHH_3443..
.HH..333..
''', kx=0.7, ky=0.6),       # bob, side-swept bangs, clip, springy crown strand
    ('codex', 'lead'): Part('''
..H.H.H...
..HAHHHH..
.HHAHHHHH.
HHHAHHHHH.
HHAAAHH44.
HAAAAH474.
HAAAA34445
.HAAH4434.
..H.3443..
....333...
''', kx=0.7, ky=0.6),       # short spikes, headphones: band over the crown, cup on the ear
    ('agy', 'lead'): Part('''
HH.HHHH...
HHHHoppopo
HHHorr8rr.
HHHHoooH4.
HHH2H474..
HHH344445.
.HH34434..
..H3443...
...333....
''', kx=0.7, ky=0.6),       # floating ponytail, goggles up on the forehead
    ('claude', 'intern'): Part('''
...qq.....
..qppq....
..AAAAAA..
.AAAAAAAA.
AAAAAAAAA.
qqppqqppo.
HH_2H474..
HHH344445.
.HH34434..
..H3443...
...333....
''', kx=0.7, ky=0.7),       # cuffed beanie with the pompom
    ('codex', 'intern'): Part('''
..CCCCC...
.CCCCCCC..
CCCCCCCCC.
CCCCH_HH..
CCC44474..
CCC344445.
CCC34434..
.CC3443...
..C.333...
''', kx=0.8, ky=0.5),       # hood up, fringe peeking out
    ('agy', 'intern'): Part('''
.HH...HH..
HHHH.HHHH.
.HHHHHHH..
.HHHHHHHH.
HHHorrorr.
HHHHoooH4.
HHH2H474..
HHH344445.
.HH34434..
..H3443...
...333....
''', kx=0.7, ky=0.6),       # two floating buns, mini goggles
}
FTORSO = {
    'claude': Part('''
..33...
.iCCs..
CCCCsl.
CCCCsl.
CCCCsl.
CCCCsl.
.CCCsC.
.CCCCC.
''', kx=0.6, ky=0.3),       # cardigan: placket line + shirt at the front edge
    'codex': Part('''
CC33...
CCCCC..
CCCCCC.
CCCCCC.
CCCCCC.
CCC-CC.
.CCCCC.
.ffgff.
''', kx=0.6, ky=0.3),       # hoodie: hood bump at the back of the neck, rib band
    'agy': Part('''
..33...
.CCpq..
CCCpoC.
CCCCCC.
CCCCCC.
CCCCCC.
.CCCCC.
.mmlll.
''', kx=0.6, ky=0.3),       # flight jacket with the neckerchief knot
}
# legs and shoes in the outfit's own cloth darks (f g) so a look swap recolours the trousers too
FLEGS = [Part('\n'.join(''.join({'k': 'f', 'm': 'g'}.get(c, c) for c in row) for row in p.g), kx=0, ky=0) for p in LEGS]
FSTAND = Part('\n'.join(''.join({'D': 'C', 'k': 'f'}.get(c, c) for c in row) for row in STAND.g), kx=0.5, ky=0)
SIP = Part('''
..44
.CC.
CC..
CC..
''', kx=0.5, ky=0, cast=1)
# head drawn this many px above the base head row (interns: hats and buns keep the eye line; nothing may rise above
# the base head's top row, the walk bob needs that headroom)
# eye pixel inside each family head (the head anchor in META is normalised so the eye sits at (6, 4) as in HEAD)
FEYE = {('claude', 'lead'): (6, 4), ('codex', 'lead'): (7, 5), ('agy', 'lead'): (6, 4),
        ('claude', 'intern'): (6, 6), ('codex', 'intern'): (6, 4), ('agy', 'intern'): (6, 6)}
FHDY = {('claude', 'intern'): -2, ('agy', 'intern'): -2}


def _fam(fam, size):
    return dict(head=lambda: FHEAD[(fam, size)], torso=lambda: FTORSO[fam], tx=4, fam=fam, size=size, eye=FEYE[(fam, size)],
                dy=2 if size == 'intern' else 0, legs=FLEGS, stand=FSTAND, sip=True, hdy=FHDY.get((fam, size), 0))


VAR = {
    'a': dict(head=lambda: HEAD, torso=lambda: TORSO, tx=4),
    'b': dict(head=lambda: HEAD_B, torso=lambda: TORSO_B, tx=4),
    'c': dict(head=lambda: HEAD_C, torso=lambda: TORSO_C, tx=3),
    'd': dict(head=lambda: HEAD_D, torso=lambda: TORSO_D, tx=4, prop='mop'),
    'e': dict(head=lambda: HEAD_E, torso=lambda: TORSO_E, tx=3, prop='box'),
    'f': dict(head=lambda: HEAD_F, torso=lambda: TORSO_F, tx=4, prop='plant'),
    'g': dict(head=lambda: HEAD_G, torso=lambda: TORSO_G, tx=4, prop='laptop'),
}
GENERIC = ['b', 'c', 'd', 'e', 'f', 'g']        # extra colleagues, in AT_SPRITES.walker.variants order
FAMILY = [(f, s) for f in ('claude', 'codex', 'agy') for s in ('lead', 'intern')]
for _f, _s in FAMILY:
    VAR[_f + '.' + _s] = _fam(_f, _s)
META = {}   # rows -> head anchor (same contract as rig.META; view 'S' = side view, facing right)


def frame(i=None, stand=None, var='a'):
    V = VAR[var]
    cv = Canvas(W, H)
    walk = i is not None
    st = None if walk else stand % 144
    # Carrying weight damps the up pose; the free arm trails the contact by one exposure.
    b = BOB[i] if walk else (1 if 48 <= st < 70 else 0)
    if walk and V.get('prop') in ('box', 'plant'): b = max(0, b)
    dy = V.get('dy', 0)
    ty = 12 + b + dy
    prop = V.get('prop')
    sip = V.get('sip') and not walk and 92 <= st < 134
    lift = (1 if st < 94 else 3 if st < 96 else 5 if st < 98 else 7 if st < 100 else
            8 if st < 124 else 7 if st < 126 else 5 if st < 128 else 3 if st < 131 else 1) if sip else 0
    far = FAR[FARA[(i-1)%12]] if walk and prop not in ('box', 'plant') else FAR['mid']
    cv.put(far, 7, ty + 1)
    if walk:
        cv.put(V.get('legs', LEGS)[i], 0, 18)
    else:
        cv.put(V.get('stand', STAND), 3, 19)
    cv.put(V['torso'](), V['tx'], ty)
    hx, hy = 3 + (1 if walk else 0), 4 + b + dy + V.get('hdy', 0)
    head=V['head']()
    if not walk and st in (34,35,112,113):
        rows=[''.join(r) for r in head.g]
        ex,ey=V.get('eye',(6,4))
        rows[ey]=rows[ey][:ex]+'a'+rows[ey][ex+1:]
        head=Part(rows,kx=head.kx,ky=head.ky)
    cv.put(head, hx, hy)
    head_end = cv.n
    if prop == 'mop':
        # Grip bobs with the shoulder; the flexible shaft ends in a grounded mop head.
        end=13 if walk or not 56 <= st < 84 else 12
        y0=ty+1
        rows=[]
        for y in range(y0,26):
            row=['.']*10
            x=10 if y<=ty+4 else round(10+(end-10)*(y-ty-4)/max(1,24-ty-4))
            if y<24: row[x-5]='u'
            else:
                for x in range(end-2,end+2): row[min(9,x-5)]='x'
            rows.append(''.join(row))
        cv.put(Part(rows,kx=0,ky=0),5,y0)
        cv.put(HOLD, 6, ty + 2)
    elif prop == 'box':
        cv.put(BOX, 8, ty + 1)
        cv.put(HOLD, 6, ty + 3)
    elif prop == 'plant':
        cv.put(PLANT[(1 if i%6 in (2,3) else 0) if walk else (1 if 52<=st<74 else 0)], 9, ty - 1)
        cv.put(HOLD, 6, ty + 2)
    elif prop == 'laptop':
        cv.put(LAPTOP, 3, ty + 4)
        cv.put(UNDER, 5, ty + 2)
    elif walk:
        cv.put(ARM[NEAR[(i-1)%12]], 5, ty + 2)
    elif sip:
        # Wrist and cup share one lift trajectory; elbow stays joined to the shoulder.
        wrist=5-lift; elbow=5-max(0,lift-3)//2
        top=min(2,wrist); rows=[]
        for y in range(top,elbow+2):
            row=['.']*5
            if 2<=y<=elbow:
                row[0]=row[1]='C'
            if wrist<=y<=elbow:
                x=round(3-2*(y-wrist)/max(1,elbow-wrist))
                row[x]=row[x+1]='4' if y<=wrist+1 else 'C'
            rows.append(''.join(row))
        cv.put(Part(rows,kx=.5,ky=0,cast=1),5,ty+top)
        cv.put(CUP,9,ty+4-lift)
    else:
        cv.put(CUP, 9, ty + 4)
        cv.put(ARM['cup'], 5, ty + 2)
        cv.put(STEAM[(stand // 9) % 4], 10, ty + 1)
    cv.finish(rim=True, rim_rows=(0, 15))
    if walk:
        # Explicit soles are the contact contract. Raised foot outlines cannot masquerade as ground.
        cv.px[26] = ['.'] * W
        foot = 11 - i % 6
        for x in range(foot, foot + 3): cv.px[26][x] = 'o'
        if i % 6 == 0:
            for x in range(5, 8): cv.px[26][x] = 'o'
    rows = cv.rows()
    front = {(x, y) for y in range(H) for x in range(W) if cv.lay[y][x] > head_end}
    ex, ey = V.get('eye', (6, 4))
    META[tuple(rows)] = dict(hx=hx + ex - 6, hy=hy + ey - 4, v='S', bx=0, by=b + dy, front=frozenset(front))
    return rows


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
# v2.1 colleagues: C/D/H/o as above; P = extra slot overrides for the props (u v, s t w, x)
WALK_OUTFIT_D = {   # cleaner: overalls, bandana (accent), mop with a wooden handle
    'claude':  dict(C='#3e6a8a', D='#2e3e5a', H='#3a2a22', o='#b8402e', P=dict(uv=('#7a5434', '#b0804e'), x='#ece6d8')),
    'chatgpt': dict(C='#2e7a8a', D='#1e4a56', H='#2a2a30', o='#10a37f', P=dict(uv=('#6a6e74', '#a4aab0'), x='#f2f4f3')),
    'gemini':  dict(C='#4a5ac8', D='#262c70', H='#2a1e3a', o='#d47ec8', P=dict(uv=('#5a6290', '#9aa4d8'), x='#f4f2ff')),
    'grok':    dict(C='#4a4a50', D='#26262a', H='#1a1a1a', o='#a8a8a8', P=dict(uv=('#3a3a3a', '#6a6a6a'), x='#e8e8e8')),
    'muse':    dict(C='#2ec4b6', D='#1a6a64', H='#3a1e2e', o='#f06aa8', P=dict(uv=('#8a5a3a', '#c8905a'), x='#fff3fb')),
}
WALK_OUTFIT_E = {   # courier: uniform, cap (accent), cardboard parcel with tape
    'claude':  dict(C='#7a5a3a', D='#3e2f2a', H='#2a1a14', o='#c8643f', P=dict(uv=('#a8743e', '#d0a066'), x='#efe2c0')),
    'chatgpt': dict(C='#3a4048', D='#22262c', H='#3a2a22', o='#10a37f', P=dict(uv=('#a8743e', '#d0a066'), x='#f2f4f3')),
    'gemini':  dict(C='#2e3488', D='#1e2250', H='#3a2a54', o='#f0c860', P=dict(uv=('#a8743e', '#d0a066'), x='#fff6c8')),
    'grok':    dict(C='#2a2a2c', D='#121212', H='#0e0e0e', o='#e8e8e8', P=dict(uv=('#8a7a6a', '#b4a490'), x='#f4f4f4')),
    'muse':    dict(C='#4c2a80', D='#2a1e4a', H='#5a2a4a', o='#ffd166', P=dict(uv=('#a8743e', '#d0a066'), x='#fff3e0')),
}
WALK_OUTFIT_F = {   # plant carrier: knit sweater, terracotta pot, leaves
    'claude':  dict(C='#c8a46e', D='#4a3a32', H='#8a4a2a', o='#3a2a24', P=dict(uv=('#9a4a2e', '#c86a44'), st=('#4e8650', '#2e5a3c'), w='#8ab86a')),
    'chatgpt': dict(C='#e4e8e6', D='#2c3036', H='#c9a36a', o='#202328', P=dict(uv=('#b8bdc2', '#e6e8ea'), st=('#3e8656', '#285a3e'), w='#7dbf7f')),
    'gemini':  dict(C='#d47ec8', D='#2a3170', H='#e8c8ff', o='#3a3fb0', P=dict(uv=('#c8d0ee', '#ffffff'), st=('#3e9a8e', '#26606a'), w='#8ad8c0')),
    'grok':    dict(C='#bcbcbc', D='#1a1a1a', H='#3a3a3a', o='#0e0e0e', P=dict(uv=('#3e3e3e', '#5a5a5a'), st=('#3a5444', '#26382e'), w='#5e7e66')),
    'muse':    dict(C='#ffd166', D='#2f3a8a', H='#3a1e2e', o='#4c2a80', P=dict(uv=('#e6e0f4', '#ffffff'), st=('#4c8c56', '#2e5e3e'), w='#92c47a')),
}
WALK_OUTFIT_G = {   # laptop under the arm, lanyard
    'claude':  dict(C='#efe0c6', D='#3e5a7a', H='#5c3740', o='#2a1c1c', P=dict(uv=('#4a4044', '#8a7e80'), w='#c8643f')),
    'chatgpt': dict(C='#8fd6bc', D='#22262c', H='#1e2026', o='#10a37f', P=dict(uv=('#2c3035', '#80878f'), w='#10a37f')),
    'gemini':  dict(C='#e6ecfc', D='#3a3fb0', H='#1a1430', o='#9b72cb', P=dict(uv=('#2e3260', '#8790c8'), w='#9b72cb')),
    'grok':    dict(C='#d8d8d8', D='#2a2a2c', H='#1a1a1a', o='#f2f2f2', P=dict(uv=('#1e1e1e', '#707070'), w='#f2f2f2')),
    'muse':    dict(C='#fbeef4', D='#4f78c8', H='#c85a9c', o='#0866ff', P=dict(uv=('#3c3c48', '#9696a8'), w='#f06aa8')),
}
SKIN_V = {'a': ['#6a3a36', '#c27c68', '#efb896', '#ffdcbc', '#ef9a8a'],
          'b': ['#7a3f3a', '#d08a72', '#f8c8a6', '#fff0dc', '#f6a296'],
          'c': ['#3e2220', '#7e4a3a', '#b8805a', '#d9a47c', '#c87a66'],
          'd': ['#6e4234', '#a46c50', '#cf9870', '#ecc49a', '#d08470'],
          'e': ['#a06a66', '#d8a292', '#f8d8c6', '#fff2e6', '#f2b2a6'],
          'f': ['#3e2622', '#6a4032', '#956048', '#bb8664', '#a65a4c'],
          'g': ['#7a3f3a', '#d08a72', '#f8c8a6', '#fff0dc', '#f6a296']}


def palette(theme, var='a'):
    from pal import fabric, hair_look, to_oklch, from_oklch, SKIN_LOOK
    o = {'a': WALK_OUTFIT, 'b': WALK_OUTFIT_B, 'c': WALK_OUTFIT_C, 'd': WALK_OUTFIT_D, 'e': WALK_OUTFIT_E,
         'f': WALK_OUTFIT_F, 'g': WALK_OUTFIT_G}[var][theme]
    P = ['#000000'] * 36
    idx = '0123456789abcdefghijklmnopqrstuvwxyz'

    def put(ch, cols):
        for c, v in zip(ch, cols):
            P[idx.index(c)] = v
    # The new colleagues share the inclusive face ramps used at the desks.
    skin = {'d': 2, 'e': 1, 'f': 3}.get(var)
    put('23456', SKIN_LOOK[skin] if skin else SKIN_V[var])
    put('789', ['#2a1e2e', '#ffffff', '#8a3a3a'])
    put('abcde', hair_look(o['H']))
    cl = fabric(o['C'], 5, theme)
    put('fghij', cl)
    put('klmn', fabric(o['D'], 4, theme, secondary=True))
    # Caps/bandanas keep a legible brim; saturated theme accents do not become neon shoes.
    L, C, Hc = to_oklch(o['o'])
    accent = from_oklch(max(0.28, min(0.84, L)), min(C, 0.14), Hc)
    put('opq', ramp(accent, 3, lo=0.14, hi=0.12, shift=0.14, cdark=0.8))
    put('r', ['#ffffff'])
    put('st', [cl[2], cl[1]])
    put('w', [cl[2]])
    put('uv', ramp(o.get('mug', '#f2ebe0'), 3, lo=0.28, hi=0.1)[:2])
    put('x', ['#f6f2ec'])
    put('y', ['#b6c4ce'])
    put('z', [mix(cl[3], o.get('rim', WALK_OUTFIT[theme]['rim']), 0.28)])
    L, C, Hc = to_oklch(mix(cl[0], P[10], 0.35))
    put('1', [from_oklch(max(0.18, min(0.245, L - 0.12)), min(C * 0.7, 0.045), Hc)])
    for ch, v in o.get('P', {}).items():
        put(ch, [v] if isinstance(v, str) else list(v))
    if var == 'd':
        # A light shaft separates the mop from the overalls; cool yarn shade at the wet end.
        put('u', [mix(P[31], P[30], 0.55)])
        put('y', [mix(P[33], '#7c929c', 0.5)])
    elif var == 'e':
        # Warm kraft with a quiet paper tape; the side stays darker than the top plane.
        put('u', [mix(P[30], '#694733', 0.16)])
        put('v', [mix(P[31], '#e4b87b', 0.18)])
        put('x', [mix(P[33], '#e8d3a6', 0.4)])
    elif var == 'f':
        put('x', [mix(P[31], '#f2d9be', 0.25)])
        # Leaves carry a broad light plane and a cool green interior, rather than many bright dots.
        put('s', [mix(P[28], '#668f62', 0.18)])
        put('t', [mix(P[29], '#2e4b42', 0.2)])
        put('w', [mix(P[32], '#b0c98a', 0.25)])
    elif var == 'g':
        put('y', [mix(P[31], '#d5deea', 0.55)])
    P[0] = 'transparent'
    return P
