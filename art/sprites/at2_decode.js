/* atDecode2 (art/sprites/at2_decode.js, copied verbatim into ui/src/72-sprites.js by build.py). */
/* AT_SPRITES v2 -> the v1 runtime shape (frames = arrays of row strings), decoded once at load.
   Identical exposures share one row array (tagged with _rid) so callers can cache per raster. v1 passes through. */
window.atDecode2 = function atDecode2(V) {
  if (!V || V.version !== 2 || !V.pools) return V;
  const pools = {};
  for (const name of Object.keys(V.pools)) {
    const p = V.pools[name], n = p.w * p.h, codes = [], out = [], recs = p.r ? p.r.split(',') : [];
    for (let r = 0; r < recs.length; r++) {
      const s = recs[r], bang = s.indexOf('!');
      let ref = -1;
      for (let i = 0; i < bang; i++) ref = (ref < 0 ? 0 : ref) * 26 + (s.charCodeAt(i) - 65);
      const a = ref < 0 ? new Uint8Array(n).fill(46) : codes[ref].slice();
      let i = bang + 1, pos = 0;
      while (i < s.length) {
        let skip = 0, c = s.charCodeAt(i);
        while (i < s.length && c >= 65 && c <= 90) { skip = skip * 26 + (c - 65); c = s.charCodeAt(++i); }
        pos += skip;
        while (i < s.length && !(c >= 65 && c <= 90)) { a[pos++] = c; c = s.charCodeAt(++i); }
      }
      codes.push(a);
      const rows = [];
      for (let y = 0; y < p.h; y++) rows.push(String.fromCharCode.apply(null, a.subarray(y * p.w, (y + 1) * p.w)));
      rows._rid = name + ':' + r;
      out.push(rows);
    }
    pools[name] = out;
  }
  const expand = (a, pool) => {
    const o = {};
    for (const k of Object.keys(a)) if (k !== 'seq') o[k] = a[k];
    const f = [];
    for (let i = 0; i < a.seq.length; i += 2) for (let h = 0; h < a.seq[i + 1]; h++) f.push(pool[a.seq[i]]);
    o.frames = f;
    return o;
  };
  const S = { version: 2, lead: V.lead, intern: V.intern, palettes: V.palettes, anims: {}, rasters: {} };
  for (const fam of Object.keys(V.anims)) {
    S.anims[fam] = {};
    for (const size of Object.keys(V.anims[fam])) {
      const A = V.anims[fam][size], o = {};
      for (const st of Object.keys(A)) o[st] = expand(A[st], pools[size]);
      S.anims[fam][size] = o;
    }
  }
  if (V.walker) {
    const W = V.walker, ex = an => { const o = {}; for (const k of Object.keys(an)) o[k] = expand(an[k], pools.walker); return o; };
    S.walker = { w: W.w, h: W.h, anchorX: W.anchorX, anchorY: W.anchorY, palettes: W.palettes, anims: ex(W.anims),
      variants: (W.variants || []).map(v => ({ name: v.name, palettes: v.palettes, anims: ex(v.anims) })) };
  }
  for (const k of Object.keys(pools)) S.rasters[k] = pools[k].length;
  return S;
};
