# v2 head turns: three drawn angles per family and size.
#   lead:   'L' 3/4 toward the monitor (screen-left, default), 'F' front (camera), 'R' 3/4 toward the interns
#   intern: 'R' 3/4 toward its monitor (screen-right, default), 'F' front, 'L' 3/4 toward the lead
# Skull silhouette, jaw, ear, hair mass and headwear are redrawn per angle. The opposite 3/4 starts as a
# mirror whose tones go back through the shader (light stays top-left) and is then hand-corrected.
from core import Part
import lead as L

# ======================================================================= LEAD (head box 22 wide)
FACE = {
    'L': L.FACE,
    'F': Part('''
...44444444444...
..4444444444444..
.445444444444443.
.455444444444443.
34554444444444433
24544444444444432
24444444444444432
.344444444444443.
..3444444444443..
..3444444444433..
...34444444433...
....344444433....
.....3333333.....
'''),
    'R': Part('''
..4444444444444..
.454444444444443.
.4554444444444433
.4544444444444433
23454444444444433
32454444444444433
32444444444444433
2334444444444443.
.344444444444443.
..3444444444443..
....34444444443..
....3444444443...
......3333333....
'''),
}
FACE_O = {'L': (2, 8), 'F': (2, 8), 'R': (3, 8)}
# features relative to the face origin, per angle
FEAT = {
    'L': dict(eyes=((3, 5), (9, 5)), mouth=(4, 9), nose=(7, 8), blush=((2, 8), (3, 8), (10, 8), (11, 8)), glow=(2, 6), mirror=False),
    'F': dict(eyes=((4, 5), (11, 5)), mouth=(6, 9), nose=(9, 8), blush=((3, 8), (4, 8), (12, 8), (13, 8)), glow=(3, 6), mirror=False),
    'R': dict(eyes=((6, 5), (12, 5)), mouth=(9, 9), nose=(9, 8), blush=((5, 8), (6, 8), (13, 8), (14, 8)), glow=None, mirror=True),
}

# ---------------- CLAUDE (bob, side-swept bangs, clip, springy crown strand)
CL_F_BACK = Part('''
......................
........HHHHHH........
......HHHHHHHHHH......
.....HHH**HHHHHHH.....
....HH****HHHHHHHH....
...HHH**HHHHHHHHHHH...
...HHHHHHHHHHHHHHHH...
..HHHHHHHHHHHHHHHHHH..
..HHHHHHHHHHHHHHHHHH..
.HHHHHHHHHHHHHHHHHHHH.
.HHHHHHHHHHHHHHHHHHHH.
.HHHHHHHHHHHHHHHHHHHH.
.HHHHHHHHHHHHHHHHHHHH.
.HHHHHHHHHHHHHHHHHHHH.
.HHHHHHHHHHHHHHHHHHHH.
.HHHHHHHHHHHHHHHHHHHH.
.HHHHHHHHHHHHHHHHHHHH.
.HHHHHHHHHHHHHHHHHHHH.
.HHHHHHHHHHHHHHHHHHHH.
..HHHHHHHHHHHHHHHHHH..
..HHH_..........._HH..
''')
CL_F_FRONT = Part('''
......................
......................
......................
......................
......................
......................
.......HHHHHHHH.......
.....HH*HHHHHHHHH.....
....HH**H_HHHHHHHH....
...HHHHH_.HHHHHHHHH...
..HHHHH_...HHHHHHHHH..
..HHHH_..H..HHHH.HHH..
..HHH...HH...HH...HH..
..HH.....H........HH..
..HH..............HH..
..HH..............HH..
..H_..............HH..
...H..............H...
''', cast=1)

# ---------------- CODEX (short spiky, big headphones)
CX_F_BACK = Part('''
......................
.......H..H..H........
......HH.HHH.HH.......
.....HHHHHHHHHHHH.....
....HHH**HHHHHHHHH....
...HHH****HHHHHHHHH...
...HHHH**HHHHHHHHHH...
..HHHHHHHHHHHHHHHHHH..
..HHHHHHHHHHHHHHHHHH..
..HHHHHHHHHHHHHHHHHH..
..HHHHHHHHHHHHHHHHHH..
..HHHHHHHHHHHHHHHHHH..
..HHHHHHHHHHHHHHHHHH..
..HHHHHHHHHHHHHHHHHH..
..HHHHHHHHHHHHHHHHHH..
...HHHHHHHHHHHHHHHH...
...HHH..........HHH...
''')
CX_F_FRONT = Part('''
......................
......................
......................
......................
......................
......................
.....HHHHHHHHHHHH.....
....HH**HHHHHHHHHH....
...HHHHHH_HHH_HHHHH...
..HHH_HHH.HH.HH_HHHH..
..HH..H_..H...H..HHH..
..H...........H...HH..
..H................H..
''', cast=1)
CX_F_BAND = Part('''
......................
......................
......oppppppppo......
....opq........ppo....
...op............po...
..op..............po..
..p................p..
''', kx=0.3, ky=0.2)

# ---------------- AGY (centre part, curtain bangs, goggles)
AG_F_BACK = Part('''
......................
.........HHHH.........
.......HHHHHHHH.......
......HH**HHHHHHH.....
.....HH****HHHHHHH....
....HHH**HHHHHHHHHH...
....HHHHHHHHHHHHHHH...
...HHHHHHHHHHHHHHHHH..
..HHHHHHHHHHHHHHHHHH..
..HHHHHHHHHHHHHHHHHH..
..HHHHHHHHHHHHHHHHHH..
..HHHHHHHHHHHHHHHHHH..
..HHHHHHHHHHHHHHHHHH..
..HHHHHHHHHHHHHHHHHH..
..HHHHHHHHHHHHHHHHHH..
..HHHHHHHHHHHHHHHHHH..
..HHHHHHHHHHHHHHHHHH..
..HHHHHHHHHHHHHHHHHH..
...HHH...........HHH..
''')
AG_F_FRONT = Part('''
......................
......................
......................
......................
......................
......................
.....HHHHH_HHHHHH.....
....HH*HHH_HHHHHHH....
...HH**HH_.HHHHHHHH...
..HHHHHH_...HHHHHHHH..
..HHHHH_.....HHHHHHH..
..HHH_.........HHHHH..
..HH.............HHH..
..HH..............HH..
..H................H..
''', cast=1)
AG_F_GOG = Part('''
....oooo...oooo.......
..oorrrrpooorrrrpoo...
.oopr88rqpopr88rqpoo..
..oprrrrqo.oprrrrqo...
...oppppo...oppppo....
''', kx=0, ky=0)

# assembled per angle: back, front, and where the accessories sit (head-box coordinates)
def _m(p, **kw):
    return p.mirror(**kw)


HEADS = {
    'claude': {
        'L': dict(back=L.CL_HAIRB, front=L.CL_HAIRF, clip=(3, 10), ahoge=8, tips=True),
        'F': dict(back=CL_F_BACK, front=CL_F_FRONT, clip=(4, 10), ahoge=8, tips=True),
        'R': dict(back=_m(L.CL_HAIRB), front=_m(L.CL_HAIRF), clip=(17, 10), ahoge=9, tips=True),
    },
    'codex': {
        'L': dict(back=L.CX_HAIRB, front=L.CX_HAIRF, band=L.CX_BAND, cup_far=(L.CX_CUP_FAR, -1, 11),
                  cup_near=(L.CX_CUP_NEAR, 17, 10), cable=0),
        'F': dict(back=CX_F_BACK, front=CX_F_FRONT, band=CX_F_BAND, cup_far=None,
                  cups=((L.CX_CUP_NEAR.mirror(relight=True), -2, 10), (L.CX_CUP_NEAR, 18, 10)), cable=0),
        'R': dict(back=_m(L.CX_HAIRB), front=_m(L.CX_HAIRF), band=_m(L.CX_BAND), cup_far=(L.CX_CUP_FAR.mirror(), 19, 11),
                  cup_near=(L.CX_CUP_NEAR.mirror(), -1, 10), cable=1),
    },
    'agy': {
        'L': dict(back=L.AG_HAIRB, front=L.AG_HAIRF, gog=(L.AG_GOG, 1, 5), tail=(14, -1, False), rib=(28, 20, False)),
        'F': dict(back=AG_F_BACK, front=AG_F_FRONT, gog=(AG_F_GOG, 0, 5), tail=(13, -1, False), rib=(28, 20, False)),
        'R': dict(back=_m(L.AG_HAIRB), front=_m(L.AG_HAIRF), gog=(L.AG_GOG.mirror(relight=False), -1, 5),
                  tail=(12, -1, False), rib=(28, 20, False)),
    },
}

# Eighth-turn drawings: asymmetric jaw/ear planes between the full three-quarter
# keys. The accessory spacing changes with skull rotation, not just the pupils.
FACE['LF'] = Part('''
...44444444444...
..4544444444443..
.455444444444433.
.455444444444433.
34544444444444332
24544444444444323
24444444444444332
.344444444444433.
..3444444444443..
...344444444433..
....3444444433...
.....34444433....
......333333.....
''')
FACE['FR'] = Part('''
...44444444444...
..4544444444443..
.455444444444443.
.455444444444443.
23454444444444333
32454444444444432
23444444444444432
.344444444444443.
..3444444444443..
...344444444443..
....3444444433...
.....344444433...
......333333.....
''')
FACE_O.update(LF=(2,8),FR=(2,8))
FEAT['LF']=dict(eyes=((4,5),(10,5)),mouth=(5,9),nose=(8,8),blush=((3,8),(11,8)),glow=(3,6),mirror=False)
FEAT['FR']=dict(eyes=((5,5),(11,5)),mouth=(7,9),nose=(9,8),blush=((4,8),(12,8)),glow=None,mirror=False)
for fam in HEADS:
    for angle in ('LF','FR'):
        hd=dict(HEADS[fam]['F'])
        if fam=='claude':
            hd['front']=HEADS[fam]['L' if angle=='LF' else 'F']['front']
            hd['clip']=(3 if angle=='LF' else 5,10)
        elif fam=='codex':
            hd['cups']=((L.CX_CUP_NEAR.mirror(),-1 if angle=='LF' else -2,10),
                        (L.CX_CUP_NEAR,18 if angle=='LF' else 17,10))
        elif fam=='agy':
            hd['tail']=(14 if angle=='LF' else 13,-1,False)
        HEADS[fam][angle]=hd
