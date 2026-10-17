# INTERN rig: 32x42 frame. Faces 3/4 RIGHT (the page puts the intern's monitor on the right).
# Light stays top-left. deskY = 34 (desk top 34..38, front from 39).
from core import Part

W, H = 32, 42
HX, HY = 8, 4
FACE_O = (1, 6)
TORSO_O = (8, 20)
DESK = 33
DESKY = 34
ANCHOR = (15, 39)
AXIS = 15

FACE = Part('''
...44444444..
..4544444444.
.445444444443
3244444444443
3244444444443
.344444444443
..44444444443
..34444444443
...344444443.
.....333333..
''')
EYES = {
    'open': ['11', '87'],
    'soft': ['..', '11'],
    'down': ['..', '11'],
    'look': ['11', '78'],
    'wide': ['11', '8 7'.replace(' ', '')],
    'shut': ['..', '11'],
    'happy': ['.1.', '1.1'],
    'squint': ['..', '11'],
}
EYES['wide'] = ['11', '87', '8.']
MOUTHS = {
    'smile': ['...', '.9.'],
    'flat': ['...', '99.'],
    'o': ['.9.', '.9.'],
    'open': ['99.', '99.'],
    'wave': ['...', '9.9'],
    'hum': ['...', '.9.'],
    'pout': ['...', '..9'],
    'grin': ['999', '...'],
}
EYE_SLOTS = ((5, 4), (9, 4))
MOUTH_SLOT = (6, 7)
BLUSH = ((4, 6), (11, 6))

# ---------------- claude intern: knit beanie with a bouncing pompom
CL_HAIRB = Part('''
................
................
................
...cccccccccc...
..cddddcccccbb..
.cddcccccbbbbbb.
.cdccccbbbbbbbb.
.ccccbbbbbbbbbb.
.cccbbbbbbbbbbb.
.ccbbbbbbbbbbbb.
.cbbbbbbbbbbbba.
.cbbbbbbbbbbbba.
.cbbbbbbbbbbbba.
..cbb......bba..
...b........a...
''')
CL_HAIRF = Part('''
................
................
................
................
................
................
.cdddcccbcccbbb.
.cdcc.cbb.bbbb..
.cc....b...bb...
.c..............
.c..............
''', cast=1)
CL_BEANIE = Part('''
....AAAAAAA.....
..AAAAAAAAAAA...
..AAAAAAAAAAAA..
..AAAAAAAAAAAA..
.AAAAAAAAAAAAA..
.qpqpqpqpqpqpoo.
.popopopopopooo.
''', kx=0.7, ky=0.8)
CL_POM = [Part(r, kx=0.6, ky=0.6) for r in ('''
.qq.
qqqp
pqpp
.pp.
''', '''
....
.qq.
qqqp
.pp.
''', '''
.qq.
qqqp
qqpp
pppo
''')]
# ---------------- codex intern: hood up, strings
CX_HOODB = Part('''
................
.....CCCCCC.....
...CCCCCCCCCC...
..CCCCCCCCCCCC..
.CCCCCCCCCCCCCC.
.CCCCCCCCCCCCCC.
CCCCCCCCCCCCCCCC
CCCCCCCCCCCCCCCC
CCCCCCCCCCCCCCCC
CCCCCCCCCCCCCCCC
CCCCCCCCCCCCCCCC
CCCCCCCCCCCCCCCC
.CCCCCCCCCCCCCC.
.CCCCCCCCCCCCCC.
..CCCCCCCCCCCC..
''', kx=0.8, ky=0.5)
CX_HAIRF = Part('''
................
................
................
................
...cddcccccbb...
..cdcccbccbbbb..
..cdc.cb.bcb.b..
..cc...b..b.....
''', cast=1)
CX_HOODF = Part('''
................
................
................
...hiiiiihhgg...
..hi........gg..
.hi..........gf.
.h............f.
.h............f.
.h............f.
.g............f.
.g............f.
.g............f.
.gg..........ff.
..gg........ff..
''', kx=0, ky=0)
CX_STR = [Part(r, kx=0, ky=0) for r in ('''
m...l
m...l
n...k
''', '''
m...l
.m..l
.n...k
''', '''
m..l.
m..l.
n..k.
''')]
# ---------------- agy intern: two floating buns + mini goggles
AG_HAIRB = Part('''
................
................
................
....cccccccc....
..ccddddccccbb..
.cddeedcccbbbbb.
.cdddcccbbbbbbb.
.cddccbbbbbbbbb.
.cdcbbbbbbbbbbb.
.ccbbbbbbbbbbbb.
.cbbbbbbbbbbbba.
.cbbbbbbbbbbbba.
..cbbbbbbbbbba..
...bba....bba...
''')
AG_HAIRF = Part('''
................
................
................
................
...cdddccccbb...
..cddccbcccbbb..
.cddc..cb..cbbb.
.cdc....b...bb..
.cc..........b..
.c..............
''', cast=1)
AG_BUNS = [Part(r, kx=0.6, ky=0.6) for r in ('''
.cdc..........cdc.
cddeb........cddcb
cdccb........cdcbb
.cbb..........cbb.
''', '''
..cd...........cd.
.cdec.........cddb
.cdcb.........cdcb
..bb...........bb.
''', '''
.cdc...........cd.
cddeb.........cddc
cdcbb.........cdcb
.bb............bb.
''', '''
..cdc.........cdc.
.cdeeb.......cddcb
.cdcbb.......cdcbb
..cbb.........cbb.
''')]
AG_GOG = Part('''
..ooo...ooo...
.orr8o.orr8o.o
.oprro.oprro..
..ooo...ooo...
''', kx=0, ky=0)

# ---------------- torsos (origin TORSO_O = (8,20), 15 wide)
CL_TORSO = Part('''
......3333.....
.....i4332h....
...iijnm2lkhg..
..hiijjinlkhgg.
.hhiijjimlhgggg
.hshiiijlhggtgf
..shhhiohhggtf.
..shhhhjhhggtf.
..shhwhohhggtf.
..shhhhhhhggtf.
..shhhhohhggtf.
..shhhhhhhggtf.
..shhhhohhggtf.
..shhhhhhhggtf.
..shhhhhhhggtf.
..shhhhhhhggtf.
..shhhhhhhggtf.
..shhhhhhhggtf.
''')
CX_TORSO = Part('''
......3333.....
....hh4332gg...
...hiijm332gg..
..hiijjiilkggg.
.hhhiiihhhgggg.
.hhhhhhhhhggggf
.sssssssssttttt
..hhhhhhhhgggf.
..hhhhwhhhgggf.
..hhhhhhhggggf.
..hhhhhhhggggf.
..hhhhhhhggggf.
..hhhhhhhggggf.
..hhhhhhhggggf.
..hhhhhhhggggf.
..hhhhhhhggggf.
..hhhhhhhggggf.
..hhhhhhhggggf.
''')
AG_TORSO = Part('''
......3333.....
....mmn332ll...
...nnnnm2llkk..
..hinnnmplkggg.
.hhiinnmolkgggg
.hshhiiphhggtgf
.nnnnnnmomlllkk
..mmmmmmolllkk.
..hhhhwhphgggf.
..hhhhhhohgggf.
..hhhhhhphgggf.
..hhhhhhohgggf.
..hhhhhhphgggf.
..hhhhhhohgggf.
..hhhhhhphgggf.
..hhhhhhohgggf.
..hhhhhhphgggf.
..hhhhhhohgggf.
''')


def arm(rows, x, y, nat='L', **kw):
    kw.setdefault('kx', 0.5)
    kw.setdefault('ky', 0.1)
    kw.setdefault('cast', 1)
    kw.setdefault('sep', 1)
    return (Part(rows, **kw), x, y, nat)


ARMS = {}
_TOP = '''
...CCC......
..CCCCC.....
.CCCCCC.....
.CCCCC......
CCCCC.......
CCCCC.......
CCCCC.......
CCCCCC......
CCCCCCC.....
.CCCCCCCC...
..CCCCCCCC..
....CCCCCC..
'''
ARMS['rest'] = arm(_TOP + '''
.....DDDDD..
......4444..
.....455443.
......3332..
''', 4, 22)
ARMS['type_up'] = arm(_TOP + '''
.....DDDDD..
......4444..
.....455443.
.....4.4.4..
''', 4, 22)
ARMS['type_dn'] = arm(_TOP + '''
.....DDDDD..
............
......4444..
.....455443.
''', 4, 22)
ARMS['hover'] = arm(_TOP.rstrip('\n').rsplit('\n', 1)[0] + '''
....CCCCDD..
......44444.
......45543.
......4.4.3.
''', 4, 22)
# right-arm natives: tool for interns = lift and strike the Enter key
ARMS['lift'] = arm('''
...CCC.......
..CCCCC......
..CCCCCC.....
...CCCCCC....
....CCCCC....
....CCCCC.4..
....CCCCDD54.
....CCCCDD443
.....CCCC.32.
''', 17, 22, 'R')
ARMS['strike'] = arm('''
...CCC......
..CCCCC.....
..CCCCCC....
...CCCCCC...
....CCCCCC..
....CCCCCC..
.....CCCCC..
.....CCCCC..
.....CCCCC..
....DDDDD...
....44444...
...4554443..
....33332...
''', 15, 24, 'R')
ARMS['raise'] = arm('''
....4.44..
...44544..
...45544..
..345543..
...4443...
...DDD....
...CCCC...
...CCCC...
...CCCC...
...CCCCC..
...CCCCC..
..CCCCCC..
..CCCCC...
.CCCCC....
CCCCCC....
CCCCC.....
.CCC......
''', 21, 6, 'R')
ARMS['raise_antic'] = arm('''
...4.44...
..44544...
.3455443..
..44443...
..DDDD....
..CCCCC...
..CCCCC...
.CCCCCC...
CCCCCCCC..
CCCCCCCC..
.CCCCCC...
..CCCC....
''', 20, 13, 'R')
ARMS['cross_under'] = arm('''
..CCC............
.CCCCC...........
.CCCCC...........
CCCCC............
CCCCC........DD..
CCCCCC..CCCCCDD..
.CCCCCCCCCCCCDD..
..CCCCCCCCCCCC...
....CCCCCCCCC....
''', 5, 22, 'N')
_CO = '''
.............CCC.
............CCCCC
............CCCCC
............CCCCC
..444........CCCC
.4554DCCCCCC.CCCC
.444DDCCCCCCCCCCC
...DCCCCCCCCCCCC.
......CCCCCCCCC..
'''
ARMS['cross_over'] = arm(_CO, 5, 22, 'N')
ARMS['cross_tap'] = arm(_CO.replace('''
..444........CCCC''', '''
..4.4........CCCC'''), 5, 22, 'N')
ARMS['hold_low'] = arm('''
...CCC.....
..CCCCC....
.CCCCCC....
.CCCCC.....
CCCCC......
CCCCCC.....
CCCCCCC....
.CCCCCCDD4.
..CCCCCDD44
.....CCDD43
''', 4, 22)
ARMS['hold_high'] = arm('''
.......44..
......4544.
......DD43.
.....CDD...
....CCCC...
..CCCCCC...
.CCCCCC....
.CCCCC.....
CCCCC......
CCCCC......
CCCCC......
.CCC.......
''', 4, 14)
ARMS['stretch_top'] = arm('''
.4.4.......
.4544......
34554......
.4443......
..DDD......
..CCCC.....
..CCCC.....
...CCCC....
...CCCC....
....CCCC...
....CCCC...
.....CCCC..
.....CCCC..
......CCCC.
......CCCC.
.......CCCC
.......CCC.
''', 1, 5)
ARMS['stretch_mid'] = arm('''
...444...
..45543..
..4443...
..DDD....
..CCCC...
.CCCC....
.CCCC....
CCCCC....
CCCCCC...
.CCCCCC..
..CCCCCC.
....CCCCC
''', 2, 12)
MUG = Part('''
.vvv..
8vvvuu
8vvu.u
.vvuu.
..u...
''', kx=0.6, ky=0)
STEAM = [Part(r, kx=0, ky=0) for r in ('''
.x.
x..
.x.
.x.
''', '''
...
.x.
x..
.x.
''', '''
x..
.x.
...
x..
''', '''
.x.
.x.
x..
...
''')]
SWEAT = [Part(r, kx=0, ky=0) for r in ('y', '8\ny', '8\ny\ny', '.\n8\ny', '.\n.\ny', '.\n.\n.')]


def _extend(p, n=3):
    p.g += [p.g[-1][:] for _ in range(n)]
    p.h = len(p.g)
    p._cache = {}


for _p in (CL_TORSO, CX_TORSO, AG_TORSO):
    _extend(_p)
