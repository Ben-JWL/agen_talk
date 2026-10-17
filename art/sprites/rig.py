from core import Part, Canvas
import lead as L

AXIS = 21


def stamp(cv, rows, x, y):
    for j, r in enumerate(rows):
        for i, c in enumerate(r):
            if c != '.':
                cv.set(x + i, y + j, c)


def put_arm(cv, arm, side, bx, by, dx=0, dy=0):
    part, x0, y0 = arm[:3]
    by = by + L.ARM_DY
    native = arm[3] if len(arm) > 3 else 'L'
    if native in ('R', 'N') or side == 'L':
        cv.put(part, x0 + bx + dx, y0 + by + dy)
    else:
        xr = 2 * AXIS - x0 - part.w + 1
        cv.put(part, xr + bx - dx, y0 + by + dy, flip=True)


ANG = {0: 'L', .5: 'LF', 1: 'F', 1.5: 'FR', 2: 'R'}


def put_hands(cv, arm, side, bx, by):
    """v2 arms carry separate hand sprites: arm[4] = [(Part, dx, dy), ...] relative to the arm origin."""
    if len(arm) < 5 or not arm[4]:
        return
    part, x0, y0, native = arm[0], arm[1], arm[2], arm[3]
    by = by + L.ARM_DY
    for (hp, dx, dy) in arm[4]:
        if native in ('R', 'N') or side == 'L':
            cv.put(hp, x0 + dx + bx, y0 + dy + by)
        else:
            xr = 2 * AXIS - (x0 + dx) - hp.w + 1
            cv.put(hp, xr + bx, y0 + dy + by, flip=True)


def lead_frame(fam, p):
    import heads as HD
    cv = Canvas(L.W, L.H)
    bx, by = p.get('bx', 0), p.get('by', 0)
    hx, hy = L.HX + bx + p.get('hx', 0), L.HY + by + p.get('hy', 0)
    ang = ANG[p.get('view', 0)]
    hd = HD.HEADS[fam][ang]
    ft = HD.FEAT[ang]
    ph = p.get('ph', 0)
    tx, ty = L.TORSO_O[0] + bx, L.TORSO_O[1] + by
    clip = (0, 0, L.W - 1, L.DESK)

    # ---- behind everything
    if fam == 'agy':
        tdx, tdy, tm = hd['tail']
        tail = L.AG_TAIL[p.get('tl', ph) % 4]
        cv.put(tail, hx + tdx, hy + tdy, flip=tm)
        rdx, rdy, rm = hd['rib']
        rib = L.AG_RIBBON[p.get('rb', ph) % 4]
        cv.put(rib, rdx + bx, rdy + by + L.ARM_DY, flip=rm)
    if fam == 'codex':
        cv.put(L.CX_HOOD, tx, ty + 1, clip=clip)
    cv.put(hd['back'], hx, hy)
    if fam == 'claude':
        ah = L.CL_AHOGE[p.get('ah', ph) % 4]
        cv.put(ah, hx + hd['ahoge'], hy - 1, flip=(ang == 'R'))
    if fam == 'codex' and hd.get('cup_far'):
        cp, cdx, cdy = hd['cup_far']
        cv.put(cp, hx + cdx, hy + cdy)
    torso = {'claude': L.CL_TORSO, 'codex': L.CX_TORSO, 'agy': L.AG_TORSO}[fam]
    cv.put(torso, tx, ty, clip=clip)
    for (patch, dx, dy) in p.get('folds', []):  # pose-dependent torso folds
        cv.paint(patch, tx + dx, ty + dy)
    # ---- head
    fo = HD.FACE_O[ang]
    fx, fy = hx + fo[0], hy + fo[1]
    cv.put(HD.FACE[ang], fx, fy)
    if fam == 'claude':
        tp = L.CL_TIPS[p.get('tp', ph) % 3]
        cv.put(tp, hx, hy + 18, flip=(ang == 'R'))
    e = p.get('eyes', 'open')
    for (ex, ey) in ft['eyes']:
        rows = L.EYES[e]
        ox = -1 if len(rows[0]) == 3 else 0
        stamp(cv, rows, fx + ex + ox, fy + ey)
    if p.get('blush', True):
        for (x, y) in ft['blush']:
            cv.set(fx + x, fy + y, '6')
    cv.set(fx + ft['nose'][0], fy + ft['nose'][1], '3')
    if p.get('glow') and ft['glow']:  # 1-px monitor reflection on the cheek facing the screen (left)
        cv.set(fx + ft['glow'][0], fy + ft['glow'][1], '5')
    m = p.get('mouth', 'smile')
    if m:
        rows = L.MOUTHS[m]
        if ft['mirror']:
            rows = [r[::-1] for r in rows]
        stamp(cv, rows, fx + ft['mouth'][0], fy + ft['mouth'][1])
    cv.put(hd['front'], hx, hy)
    if fam == 'claude':
        stamp(cv, L.CL_CLIP, hx + hd['clip'][0], hy + hd['clip'][1])
    if fam == 'codex':
        cv.put(hd['band'], hx, hy)
        if hd.get('cups'):
            for (cp, cdx, cdy) in hd['cups']:
                cv.put(cp, hx + cdx, hy + cdy)
        else:
            cp, cdx, cdy = hd['cup_near']
            cv.put(cp, hx + cdx, hy + cdy)
        cv.put(L.CX_STRINGS[p.get('st', ph) % 3], tx + 7, ty + 4, clip=clip)
        cv.put(L.CX_CABLE[p.get('cb', ph) % 3], hx + hd['cable'], hy + 17, clip=clip)
    if fam == 'agy':
        cv.put(L.AG_FLOAT[p.get('fl', ph) % 3], hx + 5 + (2 if ang == 'R' else 1 if ang == 'F' else 0), hy + 3)
        gp, gdx, gdy = hd['gog']
        cv.put(gp, hx + gdx, hy + gdy)
    # ---- arms (+ hand sprites)
    for side in 'LR':
        a = p.get('arm' + side)
        if a:
            put_arm(cv, a, side, bx, by)
            put_hands(cv, a, side, bx, by)
    if p.get('sw') is not None:
        sx = fx + (15 if ang == 'L' else 15 if ang == 'F' else 1)
        cv.put(L.SWEAT[p['sw'] % 6], sx, fy + 1 + min(p['sw'], 3))
    for (part, x, y) in p.get('props', []):
        cv.put(part, x, y + L.ARM_DY)
    for (part, x, y) in p.get('over', []):  # drawn after the props (e.g. fingers around a mug)
        cv.put(part, x, y + L.ARM_DY)
    cv.finish(rim_rows=(0, 32))
    # no outline seam where the torso meets the desk (only hands/forearms may sit below the edge)
    y = L.DESK + 1
    for x in range(cv.w):
        c = cv.px[y][x]
        if c != '.' and cv.lay[y][x] == -1 and (y + 1 >= cv.h or cv.px[y + 1][x] == '.'):
            cv.px[y][x] = '.'
    return cv.rows()


import intern as I


def put_iarm(cv, arm, side, bx, by):
    part, x0, y0, native = arm[:4]
    if native in ('R', 'N') or side == 'L':
        cv.put(part, x0 + bx, y0 + by)
    else:
        xr = 2 * I.AXIS - x0 - part.w + 1
        cv.put(part, xr + bx, y0 + by, flip=True)


IANG = {0: 'R', -1: 'F', -2: 'L'}


def intern_frame(fam, p):
    import intern2 as I2
    cv = Canvas(I.W, I.H)
    bx, by = p.get('bx', 0), p.get('by', 0)
    hx, hy = I2.HX + bx + p.get('hx', 0), I2.HY + by + p.get('hy', 0)
    ang = IANG[p.get('view', 0)]
    ft = I2.FEAT[ang]
    ph = p.get('ph', 0)
    tx, ty = I.TORSO_O[0] + bx, I.TORSO_O[1] + by
    clip = (0, 0, I.W - 1, I.DESK)
    if fam == 'agy':
        bdx, bdy = I2.BUNS_AT[ang]
        cv.put(I.AG_BUNS[p.get('bn', ph) % 4], hx + bdx, hy + bdy)
    if fam == 'codex':
        cv.put(I2.CX_HOOD[ang], hx, hy)
    if fam == 'claude':
        cv.put(I2.CL_BACK[ang], hx, hy)
    if fam == 'agy':
        cv.put(I2.AG_BACK[ang], hx, hy)
    torso = {'claude': I.CL_TORSO, 'codex': I.CX_TORSO, 'agy': I.AG_TORSO}[fam]
    cv.put(torso, tx, ty, clip=clip)
    for (patch, dx, dy) in p.get('folds', []):
        cv.paint(patch, tx + dx, ty + dy)
    fx, fy = hx + I2.FACE_O[0], hy + I2.FACE_O[1]
    cv.put(I2.FACE[ang], fx, fy)
    e = p.get('eyes', 'open')
    for (ex, ey) in ft['eyes']:
        rows = I2.EYES[e]
        ox = -1 if len(rows[0]) == 3 else 0
        stamp(cv, rows, fx + ex + ox, fy + ey)
    if p.get('blush', True):
        for (x, y) in ft['blush']:
            cv.set(fx + x, fy + y, '6')
    if p.get('glow') and ft['glow']:  # monitor is on the intern's right
        cv.set(fx + ft['glow'][0], fy + ft['glow'][1], '5')
    m = p.get('mouth', 'smile')
    if m:
        rows = I2.MOUTHS[m]
        if ft['mirror']:
            rows = [r[::-1] for r in rows]
        stamp(cv, rows, fx + ft['mouth'][0], fy + ft['mouth'][1])
    if fam == 'claude':
        cv.put(I2.CL_FRONT[ang], hx, hy)
        cv.put(I2.CL_BEANIE[ang], hx, hy)
        px_, py_ = I2.POM_AT[ang]
        cv.put(I.CL_POM[p.get('pm', ph) % 3], hx + px_, hy + py_, cast=1, flip=(ang == 'L'))
    if fam == 'codex':
        cv.put(I2.CX_RIM[ang], hx, hy)
        cv.put(I2.CX_FRINGE[ang], hx, hy)
        cv.put(I.CX_STR[p.get('st', ph) % 3], fx + I2.CX_STR_AT[ang], fy + 10, clip=clip)
    if fam == 'agy':
        cv.put(I2.AG_FRONT[ang], hx, hy)
        cv.put(I2.AG_GOG[ang], hx, hy + 3)
    if p.get('sw') is not None:
        sx = fx + (11 if ang != 'L' else 0)
        cv.put(I.SWEAT[p['sw'] % 6], sx, fy + 1 + min(p['sw'], 2))
    for side in 'LR':
        a = p.get('arm' + side)
        if a:
            put_iarm(cv, a, side, bx, by)
            put_ihands(cv, a, side, bx, by)
    for (part, x, y) in p.get('props', []):
        cv.put(part, x, y)
    for (part, x, y) in p.get('over', []):
        cv.put(part, x, y)
    cv.finish(rim_rows=(0, 24))
    y = I.DESK + 1
    for x in range(cv.w):
        c = cv.px[y][x]
        if c != '.' and cv.lay[y][x] == -1 and (y + 1 >= cv.h or cv.px[y + 1][x] == '.'):
            cv.px[y][x] = '.'
    return cv.rows()


def put_ihands(cv, arm, side, bx, by):
    if len(arm) < 5 or not arm[4]:
        return
    part, x0, y0, native = arm[:4]
    for (hp, dx, dy) in arm[4]:
        if native in ('R', 'N') or side == 'L':
            cv.put(hp, x0 + dx + bx, y0 + dy + by)
        else:
            xr = 2 * I.AXIS - (x0 + dx) - hp.w + 1
            cv.put(hp, xr + bx, y0 + dy + by, flip=True)
