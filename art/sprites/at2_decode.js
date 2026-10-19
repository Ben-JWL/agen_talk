/* atDecode2 (art/sprites/at2_decode.js, copied verbatim into ui/src/72-sprites.js by build.py). */
/* AT_SPRITES v2 -> the v1 runtime shape (frames = arrays of row strings), decoded once at load.
   Identical exposures share one row array (tagged with _rid) so callers can cache per raster. v1 passes through.
   Variant keys (`work~1` ...) decode like any state; anims[f][s].vars (rotation sets) is copied unchanged.
   v2.1: palettes may be 'rrggbb'x35 strings (expanded to [null, '#rrggbb', ...]); pools[*].hd (head anchor runs) becomes
   rows._hd = [view, hx, hy, bx, by] per raster, pools[*].oc (occluded overlay pixels: distinct sets + per-raster runs) rows._oc = Set of y*w+x;
   looks and family walkers (variants with fam/size, no palettes) pass through. */
window.atDecode2 = function atDecode2(V) {
  if (!V || V.version !== 2 || !V.pools) return V;
  const pools = {}, P = p => typeof p === 'string' ? [null].concat(p.match(/.{6}/g).map(c => '#' + c)) : p;
  const pmap = o => { const r = {}; for (const k of Object.keys(o || {})) r[k] = typeof o[k] === 'string' ? P(o[k]) : pmap(o[k]); return r; };
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
    if (p.hd) {
      let r = 0, i = 0;
      const s = p.hd, n36 = c => parseInt(c, 36);
      while (i < s.length && r < out.length) {
        const t = [s[i], n36(s[i + 1]), n36(s[i + 2]), n36(s[i + 3]) - 10, n36(s[i + 4]) - 10];
        i += 5; let j = i;
        while (j < s.length && !(s.charCodeAt(j) >= 65 && s.charCodeAt(j) <= 90)) j++;
        const cnt = j > i ? n36(s.slice(i, j)) : 1; i = j;
        for (let k = 0; k < cnt && r < out.length; k++) out[r++]._hd = t;
      }
    }
    if (p.oc) {
      const sets = p.oc.t.map(s => { const set = new Set(); for (let i = 0; i < s.length; i += 4) { const a = parseInt(s.slice(i, i + 3), 36), n = parseInt(s[i + 3], 36); for (let k = 0; k < n; k++) set.add(a + k); } return set; });
      const s = p.oc.i; let i = 0, r = 0;
      while (i < s.length) {
        const id = (s.charCodeAt(i) - 65) * 26 + s.charCodeAt(i + 1) - 65; let j = i + 2;
        while (j < s.length && !(s.charCodeAt(j) >= 65 && s.charCodeAt(j) <= 90)) j++;
        const cnt = j > i + 2 ? parseInt(s.slice(i + 2, j), 36) : 1; i = j;
        for (let k = 0; k < cnt; k++, r++) if (id && out[r]) out[r]._oc = sets[id - 1];
      }
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
  const S = { version: 2, lead: V.lead, intern: V.intern, palettes: pmap(V.palettes), anims: {}, rasters: {} };
  if (V.looks) S.looks = V.looks;
  for (const fam of Object.keys(V.anims)) {
    S.anims[fam] = {};
    for (const size of Object.keys(V.anims[fam])) {
      const A = V.anims[fam][size], o = {};
      for (const st of Object.keys(A)) o[st] = A[st].seq ? expand(A[st], pools[size]) : A[st];   // `vars` (rotation sets) passes through
      S.anims[fam][size] = o;
    }
  }
  if (V.walker) {
    const W = V.walker, ex = an => { const o = {}; for (const k of Object.keys(an)) o[k] = expand(an[k], pools.walker); return o; };
    S.walker = { w: W.w, h: W.h, anchorX: W.anchorX, anchorY: W.anchorY, palettes: pmap(W.palettes), anims: ex(W.anims),
      variants: (W.variants || []).map(v => Object.assign({ name: v.name, anims: ex(v.anims) }, v.palettes ? { palettes: pmap(v.palettes) } : {}, v.fam ? { fam: v.fam, size: v.size } : {})) };
  }
  for (const k of Object.keys(pools)) S.rasters[k] = pools[k].length;
  return S;
};
