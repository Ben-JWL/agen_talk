"""AT_SPRITES v2 equivalence check for the generated ui/src/72-sprites.js.

Rebuilds the v1 expansion from the sources (every exposure as row strings) and compares it frame-for-frame and
pixel-for-pixel with what the generated file decodes to under node (its own window.atDecode2, no eval).
Also checks: fps/loop/key/next, palettes, walker + variants, the 150 KB budget, `node --check`, LF line endings,
and that the file on disk is exactly what build.py would write now (stale-file guard).
Usage (repo root): python art/sprites/check_v2.py      Requires: Python 3.12 (stdlib), node on PATH.
"""
import json
import os
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build  # noqa: E402

NODE = r'''
const fs = require('fs'), vm = require('vm');
const [expPath, genPath] = process.argv.slice(2);
const exp = JSON.parse(fs.readFileSync(expPath, 'utf8'));
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(genPath, 'utf8'), ctx, { filename: '72-sprites.js' });
const W0 = ctx.window, errors = [], checked = { anims: 0, exposures: 0, pixels: 0 };
if (typeof W0.atDecode2 !== 'function') errors.push('window.atDecode2 missing');
if (!W0.AT_SPRITES || W0.AT_SPRITES.version !== 2) errors.push('window.AT_SPRITES is not version 2');
const t0 = process.hrtime.bigint();
const S = W0.atDecode2(W0.AT_SPRITES);
checked.decodeMs = Math.round(Number(process.hrtime.bigint() - t0) / 1e5) / 10;
function cmpAnim(tag, a, b) {
  checked.anims++;
  for (const k of ['fps', 'loop', 'key', 'next']) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) errors.push(tag + ' ' + k);
  if (a.frames.length !== b.frames.length) { errors.push(tag + ' exposure count ' + a.frames.length + ' != ' + b.frames.length); return; }
  for (let i = 0; i < a.frames.length; i++) {
    const A = a.frames[i], B = b.frames[i];
    checked.exposures++;
    if (A.length !== B.length) { errors.push(tag + ' f' + i + ' rows'); continue; }
    for (let y = 0; y < A.length; y++) { checked.pixels += A[y].length; if (A[y] !== B[y]) { errors.push(tag + ' f' + i + ' row ' + y); break; } }
  }
}
for (const k of ['lead', 'intern']) if (JSON.stringify(S[k]) !== JSON.stringify(exp[k])) errors.push(k + ' dims');
if (JSON.stringify(S.palettes) !== JSON.stringify(exp.palettes)) errors.push('palettes');
for (const fam of Object.keys(exp.anims)) for (const size of Object.keys(exp.anims[fam])) for (const st of Object.keys(exp.anims[fam][size]))
  cmpAnim(fam + '/' + size + '/' + st, S.anims[fam][size][st], exp.anims[fam][size][st]);
const W = S.walker, EW = exp.walker;
for (const k of ['w', 'h', 'anchorX', 'anchorY']) if (W[k] !== EW[k]) errors.push('walker ' + k);
if (JSON.stringify(W.palettes) !== JSON.stringify(EW.palettes)) errors.push('walker palettes');
for (const nm of Object.keys(EW.anims)) cmpAnim('walker/' + nm, W.anims[nm], EW.anims[nm]);
EW.variants.forEach((v, j) => {
  if (!W.variants[j] || W.variants[j].name !== v.name) { errors.push('walker variant ' + v.name); return; }
  if (JSON.stringify(W.variants[j].palettes) !== JSON.stringify(v.palettes)) errors.push('walker.' + v.name + ' palettes');
  for (const nm of Object.keys(v.anims)) cmpAnim('walker.' + v.name + '/' + nm, W.variants[j].anims[nm], v.anims[nm]);
});
checked.rasters = S.rasters;
console.log(JSON.stringify({ errorCount: errors.length, errors: errors.slice(0, 20), checked }));
process.exit(errors.length ? 1 : 0);
'''


def expected(S):
    def a(x):
        d = {k: x[k] for k in ('fps', 'loop', 'key') if k in x}
        if x.get('next'):
            d['next'] = x['next']
        d['frames'] = x['frames']
        return d
    W = S['walker']
    return dict(lead=S['lead'], intern=S['intern'], palettes=S['palettes'],
                anims={f: {z: {st: a(x) for st, x in sts.items()} for z, sts in zz.items()} for f, zz in S['anims'].items()},
                walker=dict(w=W['w'], h=W['h'], anchorX=W['anchorX'], anchorY=W['anchorY'], palettes=W['palettes'],
                            anims={n: a(x) for n, x in W['anims'].items()},
                            variants=[dict(name=v['name'], palettes=v['palettes'], anims={n: a(x) for n, x in v['anims'].items()})
                                      for v in W.get('variants', [])]))


def main():
    ok = True
    gen = build.OUT
    if not os.path.isfile(gen):
        print('missing', gen, '- run: python art/sprites/build.py')
        return 1
    data = open(gen, 'rb').read()
    S = build.build()
    e = build.validate(S)
    print('source validation errors:', len(e))
    ok = ok and not e
    fresh = build.render(S).encode('utf-8')
    same = fresh == data
    print('generated file is current (byte-identical to a fresh build):', same)
    ok = ok and same
    print('size: %d bytes (budget %d): %s' % (len(data), build.BUDGET, 'OK' if len(data) <= build.BUDGET else 'OVER'))
    ok = ok and len(data) <= build.BUDGET
    print('line endings: LF only' if b'\r' not in data else 'line endings: CR found')
    ok = ok and b'\r' not in data
    with tempfile.TemporaryDirectory(prefix='at2check-') as tmp:
        ep = os.path.join(tmp, 'expected.json')
        with open(ep, 'w', encoding='utf-8') as f:
            json.dump(expected(S), f)
        js = os.path.join(tmp, 'check.js')
        with open(js, 'w', encoding='utf-8') as f:
            f.write(NODE)
        r = subprocess.run(['node', js, ep, gen], capture_output=True, text=True)
        print('decode + pixel equality:', (r.stdout or r.stderr).strip())
        ok = ok and r.returncode == 0
        c = subprocess.run(['node', '--check', gen], capture_output=True, text=True)
        print('node --check ui/src/72-sprites.js:', 'OK' if c.returncode == 0 else 'FAIL ' + c.stderr[:300])
        ok = ok and c.returncode == 0
    print('PASS' if ok else 'FAIL')
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
