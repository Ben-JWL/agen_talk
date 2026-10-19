# Hue-shifted ramps (OKLCH): shadows drift toward violet/indigo, lights toward warm yellow.
import math


def _lin(c):
    c /= 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _gam(c):
    c = max(0.0, min(1.0, c))
    return 255 * (12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055)


def to_oklch(hx):
    hx = hx.lstrip('#')
    r, g, b = (_lin(int(hx[i:i + 2], 16)) for i in (0, 2, 4))
    l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    l, m, s = (v ** (1 / 3) for v in (l, m, s))
    L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
    A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
    B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    return L, math.hypot(A, B), math.degrees(math.atan2(B, A)) % 360


def from_oklch(L, C, H):
    A, B = C * math.cos(math.radians(H)), C * math.sin(math.radians(H))
    for _ in range(24):  # gamut squeeze by chroma
        l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
        m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
        s = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3
        r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
        g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
        b = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
        if all(-0.001 <= v <= 1.001 for v in (r, g, b)):
            break
        A *= 0.92
        B *= 0.92
    return '#%02x%02x%02x' % tuple(int(round(_gam(v))) for v in (r, g, b))


def _toward(h, target, f):
    d = ((target - h + 540) % 360) - 180
    return (h + d * f) % 360


def ramp(mid, n, lo=0.30, hi=0.17, cool=290, warm=85, shift=0.22, cdark=1.05, clight=0.75):
    """n colours dark->light around `mid` (mid sits at index n//2, or n//2-1 for even n darkish)."""
    L, C, H = to_oklch(mid)
    k = n // 2
    out = []
    for i in range(n):
        t = (i - k) / max(1, k if i < k else (n - 1 - k) or 1)
        if i < k:
            f = -t
            LL = L - lo * f
            HH = _toward(H, cool, shift * f)
            CC = C * (1 + (cdark - 1) * f) if C > 0.02 else C
        elif i > k:
            f = t
            LL = L + hi * f
            HH = _toward(H, warm, shift * f)
            CC = C * (1 + (clight - 1) * f)
        else:
            LL, CC, HH = L, C, H
        out.append(from_oklch(max(0.04, min(0.985, LL)), CC, HH))
    return out


def mix(a, b, t):
    a = a.lstrip('#')
    b = b.lstrip('#')
    ca = [int(a[i:i + 2], 16) for i in (0, 2, 4)]
    cb = [int(b[i:i + 2], 16) for i in (0, 2, 4)]
    return '#%02x%02x%02x' % tuple(int(round(ca[i] + (cb[i] - ca[i]) * t)) for i in range(3))


# ---- per family constants (hair, skin, eyes keep identity across themes) ----
SKIN = {
    'claude': ['#995d57', '#cf8e79', '#efbc9e', '#ffdfbd', '#e8a18f'],
    'codex':  ['#784b48', '#b37b61', '#d9a17d', '#f1cba3', '#ce8974'],
    'agy':    ['#9b665e', '#d09a87', '#f2c9b2', '#ffe9cd', '#e7a193'],
}
HAIR = {
    'claude': ['#5c3740', '#895044', '#b4744c', '#d99b63', '#efbd83'],
    'codex':  ['#2c3046', '#41465d', '#59627d', '#7e8aa4', '#acb7c7'],
    'agy':    ['#775c7f', '#b18ba5', '#dec0cd', '#f4dce0', '#fff0e4'],
}
EYE = {'claude': ('#3a1a22', '#fff8ee'), 'codex': ('#161a2e', '#f2f7ff'), 'agy': ('#2b2160', '#ffffff')}
MOUTH = {'claude': '#8a3a3a', 'codex': '#7a3536', 'agy': '#a03a55'}

THEMES = ['claude', 'chatgpt', 'gemini', 'grok', 'muse']
FAMS = ['claude', 'codex', 'agy']

# theme -> family -> dict(cloth mid, second mid, accent mid, glow, line decor (lit,shadow) or None,
# sparkle or None, mug, rim, outline)
OUTFIT = {
    'claude': {
        'claude': dict(C='#c8643f', D='#f2e4c8', A='#e0a83a', r='#fff1b8', line=('#e08a5c', '#a5492f'), w=None, mug='#f2ebe0', rim='#ffd7a8'),
        'codex':  dict(C='#5e4a3c', D='#efe0c6', A='#c8643f', r='#ffb070', line=None, w=None, mug='#c8643f', rim='#ffd7a8'),
        'agy':    dict(C='#d0a874', D='#fbf3e4', A='#a8503a', r='#ffe9b0', line=('#e6c290', '#a8804e'), w=None, mug='#7d9a6a', rim='#ffd7a8'),
    },
    'chatgpt': {
        'claude': dict(C='#e4e8e6', D='#10a37f', A='#202327', r='#c4f7e2', line=('#10a37f', '#0c7a60'), w=None, mug='#10a37f', rim='#c8f8e4'),
        'codex':  dict(C='#202328', D='#f2f4f3', A='#10a37f', r='#7affc4', line=None, w=None, mug='#f2f4f3', rim='#9ff0cc'),
        'agy':    dict(C='#14a57f', D='#f6f8f7', A='#1d2024', r='#d6fff0', line=('#f6f8f7', '#bfe8dc'), w=None, mug='#e9efec', rim='#d4fbea'),
    },
    'gemini': {
        'claude': dict(C='#7586e6', D='#ece6ff', A='#f0c860', r='#fff6c8', line=('#a9b6ff', '#4e5ab8'), w='#fff2a8', mug='#ece6ff', rim='#d6c6ff'),
        'codex':  dict(C='#2e3488', D='#c8d4ff', A='#9b72cb', r='#e2b8ff', line=None, w='#e8e0ff', mug='#9b72cb', rim='#b4c4ff'),
        'agy':    dict(C='#4a68f0', D='#f4f2ff', A='#d47ec8', r='#ffd6f6', line=('#9b72cb', '#3a3fb0'), w='#fff4b8', mug='#f4f2ff', rim='#ffd0f2'),
    },
    'grok': {
        'claude': dict(C='#e2e2e2', D='#1a1a1a', A='#5a5a5a', r='#ffffff', line=('#1a1a1a', '#1a1a1a'), w=None, mug='#1a1a1a', rim='#ffffff'),
        'codex':  dict(C='#1c1c1e', D='#f4f4f4', A='#e8e8e8', r='#ffffff', line=('#f4f4f4', '#9a9a9a'), w=None, mug='#f4f4f4', rim='#ffffff'),
        'agy':    dict(C='#2a2a2c', D='#f6f6f6', A='#f2f2f2', r='#d8e4ff', line=('#f6f6f6', '#bcbcbc'), w=None, mug='#ffffff', rim='#ffffff'),
    },
    'muse': {
        'claude': dict(C='#c85a9c', D='#fbeef4', A='#4f78c8', r='#cfe0ff', line=('#f08ac0', '#8e3470'), w='#ffd166', mug='#4f78c8', rim='#ffc6ea'),
        'codex':  dict(C='#4c2a80', D='#ff9ccf', A='#4f78c8', r='#9ec4ff', line=None, w='#f06aa8', mug='#ff9ccf', rim='#e2b8ff'),
        'agy':    dict(C='#b357e6', D='#fff3fb', A='#4f78c8', r='#bfe0ff', line=('#f06aa8', '#7a2aa8'), w='#ffd166', mug='#ffd166', rim='#ffc0ea'),
    },
}
# per theme cloth ramp tweaks (grok: harder contrast)
THEME_RAMP = {
    'claude': dict(lo=0.22, hi=0.14),
    'chatgpt': dict(lo=0.22, hi=0.14),
    'gemini': dict(lo=0.22, hi=0.14),
    'grok': dict(lo=0.24, hi=0.13, shift=0.12),
    'muse': dict(lo=0.22, hi=0.14),
}


# ---- per-agent looks (v2.1): the page picks a look per agent id; look 0 is the family's base palette above.
# A look swaps the hair ramp and the outfit (cloth + second cloth) ramps; skin comes from a separate small set.
# The accent ramp (o p q: Claude's clip / intern beanie, Codex's headphones, AGY's goggles and ribbon), eyes and the
# silhouettes never change, so the family stays recognisable at a glance.
NLOOKS = 5
LOOK_IDX = '1abcdefghijklmnstwz'   # palette slots a look overrides (outline + hair + outfit + its decor/rim)
SKIN_IDX = '23456'
# hair mids per family: base first (its hand-picked ramp above), then 4 alternatives that keep the family's mood
HAIR_LOOK = {
    'claude': [None, '#735043', '#42393e', '#b76d49', '#c6a67f'],     # walnut, soft black, copper, ash blonde
    'codex':  [None, '#34333d', '#755441', '#a0a7b4', '#466b71'],     # ink, chestnut, silver, deep teal
    'agy':    [None, '#dda5b8', '#a2c9bb', '#a9b8da', '#e2d5bd'],     # rose, sage mint, sky, champagne
}
# skin: 0 = the family's own ramp, then a shared fair / tan / deep set (deep step, shade, base, light, blush)
SKIN_LOOK = [None,
             ['#a16b62', '#d6a08c', '#f4d2bd', '#ffedda', '#eaaa98'],
             ['#75473b', '#a66e53', '#cf9975', '#ecc5a0', '#ca8570'],
             ['#482c29', '#704539', '#9c6850', '#c49370', '#aa6554']]
# outfit candidates per theme (cloth mid, second cloth mid): every look stays inside the theme's colour mood
THEME_CLOTH = {
    'claude':  [('#3e5a7a', '#efe0c6'), ('#7d9a6a', '#f2e4c8'), ('#8a4a6a', '#f6e6d6'), ('#d8a548', '#5e4a3c'),
                ('#2f6f6a', '#f0e2c8'), ('#c8643f', '#f2e4c8'), ('#5e4a3c', '#efe0c6'), ('#d0a874', '#fbf3e4')],
    'chatgpt': [('#3a4a5a', '#e4e8e6'), ('#8fd6bc', '#202328'), ('#e2e6e4', '#202328'), ('#5a6470', '#10a37f'),
                ('#0c7a60', '#f2f4f3'), ('#e4e8e6', '#10a37f'), ('#202328', '#f2f4f3'), ('#14a57f', '#f6f8f7')],
    'gemini':  [('#9b72cb', '#f4f2ff'), ('#d47ec8', '#2e3488'), ('#3fa7b8', '#ece6ff'), ('#e6ecfc', '#4a68f0'),
                ('#5a4ab8', '#f0c8f0'), ('#7586e6', '#ece6ff'), ('#2e3488', '#c8d4ff'), ('#4a68f0', '#f4f2ff')],
    'grok':    [('#6a6a6e', '#f2f2f2'), ('#a8a8ac', '#1a1a1a'), ('#3a3e48', '#dcdcdc'), ('#dedede', '#3a3a3a'),
                ('#4e4e52', '#c8c8c8'), ('#e2e2e2', '#1a1a1a'), ('#1c1c1e', '#f4f4f4'), ('#2a2a2c', '#f6f6f6')],
    'muse':    [('#4f78c8', '#fbeef4'), ('#ffd166', '#4c2a80'), ('#2ec4b6', '#fff3fb'), ('#f06aa8', '#2f3a8a'),
                ('#8a5ad0', '#ffe6a8'), ('#c85a9c', '#fbeef4'), ('#4c2a80', '#ff9ccf'), ('#b357e6', '#fff3fb')],
}
FAM_OFF = {'claude': 0, 'codex': 1, 'agy': 2}


def look_outfit(theme, fam, look):
    """(cloth, second) mids for look >= 1: the theme's candidates minus every family's base cloth (a Codex agent
    never borrows Claude's signature jacket), rotated per family."""
    bases = {OUTFIT[theme][f]['C'].lower() for f in FAMS}
    cand = [c for c in THEME_CLOTH[theme] if c[0].lower() not in bases]
    return cand[(FAM_OFF[fam] + look - 1) % len(cand)]


def fabric(mid, n, theme, secondary=False):
    """Woven cloth: reserve white for the key light, with a blue/lilac fold plane.

    Near-neutrals need a little authored chroma: rotating an achromatic hue alone
    cannot separate a white sleeve from a pale wall. Keep the centre below .90
    so the two lit steps remain distinct rather than clipping together.
    """
    L, C, H = to_oklch(mid)
    tr = THEME_RAMP[theme]
    if L > 0.86:
        L = min(L, 0.895)
        lo, hi = 0.31, 0.08
    elif L < 0.34:
        L = max(L, 0.295)
        lo, hi = 0.105, 0.21
    else:
        lo, hi = (0.255, 0.125) if secondary else (tr['lo'], tr['hi'])
        hi = min(hi, 0.975 - L)
    C = min(C, 0.155)
    cols = ramp(from_oklch(L, C, H), n, lo=lo, hi=hi,
                shift=0.15, cdark=0.78, clight=0.65)
    if C < 0.02 or (L > 0.86 and C < 0.045):
        # Warm pearl at the light, cool woven shadows. Grok remains near-neutral.
        chroma = 0.012 if theme == 'grok' or L < 0.45 else 0.03
        for i, col in enumerate(cols):
            light = to_oklch(col)[0]
            t = i / (n - 1)
            cols[i] = from_oklch(light, chroma * (1 - 0.55 * t),
                                  270 if i <= n // 2 else 85)
    return cols


def hair_look(mid):
    L, C, H = to_oklch(mid)
    L = max(0.29, min(L, 0.87))
    mid = from_oklch(L, min(C, 0.125), H)
    return ramp(mid, 5, lo=min(0.245, L - 0.065), hi=min(0.18, 0.97 - L),
                shift=0.23, cdark=0.8, clight=0.65)


def palette(theme, fam, look=0, skin=0):
    o = dict(OUTFIT[theme][fam])
    hair = HAIR[fam]
    if look:
        o['C'], o['D'] = look_outfit(theme, fam, look)
        o['line'] = 'look' if o['line'] else None
        hm = HAIR_LOOK[fam][look]
        hair = hair_look(hm)
    P = ['#000000'] * 36

    def put(chars, cols):
        for ch, col in zip(chars, cols):
            P['0123456789abcdefghijklmnopqrstuvwxyz'.index(ch)] = col
    sk = SKIN_LOOK[skin] if skin else SKIN[fam]
    put('23456', sk)
    put('7', [EYE[fam][0]])
    put('8', [EYE[fam][1]])
    put('9', [MOUTH[fam]])
    put('abcde', hair)
    cl = o['C']
    cloth = fabric(cl, 5, theme)
    put('fghij', cloth)
    sec = o['D']
    put('klmn', fabric(sec, 4, theme, secondary=True))
    acc = o['A']
    La = to_oklch(acc)[0]
    alo, ahi = (0.34, 0.04) if La > 0.86 else (0.12, 0.24) if La < 0.3 else (0.26, 0.12)
    put('opq', ramp(acc, 3, lo=min(alo, 0.24), hi=ahi, shift=0.12, cdark=0.78))
    put('r', [o['r']])
    if o['line'] == 'look':
        put('st', [cloth[3], cloth[1]])
    elif o['line']:
        put('st', list(o['line']))
    else:
        put('st', [cloth[2], cloth[1]])
    put('w', [o['w'] or cloth[2]])
    mug = ramp(o['mug'], 3, lo=0.28, hi=0.1)
    put('uv', mug[:2])
    put('x', ['#f6f2ec'])
    put('y', ['#b4e2f6'])
    put('z', [mix(cloth[3], o['rim'], 0.32)])
    # outline: deep hue-shifted mix of cloth dark and an indigo-plum
    # outer outline: a desaturated, hue-shifted dark taken from this figure's own cloth + hair darks
    # (never black, never violet): carries the silhouette on light wood/wallpaper and on night scenes.
    Lc, Cc, Hc = to_oklch(mix(cloth[0], hair[0], 0.35))
    put('1', [from_oklch(max(0.17, min(0.24, Lc - 0.14)), min(Cc * 0.7, 0.055), Hc)])
    # skin deep step a touch darker so hands/jaw hold their edge on the desk wood
    P[2] = mix(sk[0], '#5a3030', 0.35)
    P[0] = 'transparent'
    return P
