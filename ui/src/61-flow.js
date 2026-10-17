/* ===== 61-flow.js — 흐름 (TALK-UX §4): one instruction fanning out through nested agents, as a tree with the instruction / follow-up / report text per node.
   The drawer's 하위 tree (61-detail) widened: same guides, same U.expanded, same keyboard. Agent text only through textContent / h(). ===== */
const Flow = (() => {
  const { h, svgUse, text, attr, cls, keyed, M, U, A, ST } = R;
  const get = k => M.agents.get(k), FAN = 5;
  const isDown = m => m.dir === 'down' && m.kind !== 'peer' && m.kind !== 'talk';
  const down = key => R.msgs(key).find(isDown);
  const sameTx = c => { const m = down(c.key); return m && !m.encrypted ? m.text.trim() : ''; };

  // ---------- header ----------
  const box = Detail.treeBox(), tree = box._tree; tree.classList.add('ftree'); attr(tree, 'aria-label', '지시 흐름');
  const sumEl = h('span.fsum', { 'aria-live': 'polite' }), curEl = h('span.fcur'), note = h('p.meta.fnote', { hidden: true }, '이 세션은 지시 내용을 제공하지 않습니다 — 상태만 보입니다');
  const txIn = h('input', { type: 'checkbox', role: 'switch', id: 'flow-tx', on: { change: () => { U.flowText = txIn.checked; R.save(); R.emit('talkui'); } } });
  const all = v => { const r = get(cur.root); if (!r) return; for (const n of [r, ...Detail.subtree(r)]) if (n.kids.length) Detail.setOpen(n, v); R.emit('talkui'); };
  const el = h('div#flow', { hidden: true, tabindex: '-1' },
    h('div.fhead', h('div.fhl', h('div.fsum2.meta', sumEl, curEl)), h('div.fhr', h('button.btn.link', { type: 'button', on: { click: () => all(true) } }, '모두 펼치기'), h('button.btn.link', { type: 'button', on: { click: () => all(false) } }, '모두 접기'),
      h('label.fsw', h('span.meta', '내용 보기'), h('span.sw', txIn, h('i'))))), note, box);
  let cur = { root: null, key: null };
  tree._refresh = () => R.emit('talkui');
  const toggleOpen = id => { A.open.has(id) ? A.open.delete(id) : A.open.add(id); R.emit('talkui'); };

  // ---------- rows ----------
  function walkItems(root) {
    const out = [{ a: root, d: 0, fl: [], root: true, nk: 0 }];
    (function walk(n, d, fl) {
      const alive = n.kids.map(get).filter(Boolean), disp = [], skip = new Set(), grp = new Map();
      for (const c of alive) { const t = sameTx(c); if (t) (grp.get(t) || grp.set(t, []).get(t)).push(c); }
      for (const g of grp.values()) if (g.length >= FAN) { const rest = g.slice(1), wait = rest.filter(R.isWaiting), col = rest.filter(c => !R.isWaiting(c)); g.F = { first: g[0], wait, col, key: 'fan:' + n.key + ':' + g[0].key }; for (const c of col) skip.add(c); }
      for (const c of alive) {
        if (skip.has(c)) continue;
        disp.push({ c });
        const gg = [...grp.values()].find(g => g.F && g.F.first === c);
        if (gg) { for (const w of gg.F.wait) { skip.add(w); disp.push({ c: w }); }   // those waiting for me are always listed one by one
          const F = gg.F, open = !!U.expanded[F.key]; disp.push({ sum: { key: F.key, members: F.col, open } }); if (open) for (const m of F.col) disp.push({ c: m }); }
      }
      for (const g of Talk.ghosts(n.key)) disp.push({ g });
      // a waiting member listed above was pushed twice if it came before its group's first: de-dup by key
      const seen = new Set(), list = disp.filter(e => { const k = e.c ? e.c.key : e.sum ? e.sum.key : 'g' + e.g.ck; if (seen.has(k)) return false; seen.add(k); return true; });
      list.forEach((e, i) => {
        const fl2 = [...fl, i === list.length - 1];
        if (e.sum) out.push({ sum: e.sum, d, fl: fl2, key: e.sum.key });
        else if (e.g) out.push({ g: e.g, d, fl: fl2, key: 'g:' + e.g.ck });
        else { const c = e.c, nk = c.kids.map(get).filter(Boolean).length + Talk.ghosts(c.key).length, ex = nk > 0 && Detail.isOpen(c); if (ex && U.expanded[c.key] == null) U.expanded[c.key] = true; out.push({ a: c, d, fl: fl2, exp: ex, nk }); if (ex) walk(c, d + 1, fl2); }
      });
    })(root, 1, []);
    return out;
  }
  function mkRow() {
    const r = h('div.tn.fn', { role: 'treeitem', tabindex: '-1' }, h('span.ind'), h('button.tg', { type: 'button', tabindex: '-1' }, svgUse('i-chev')),
      h('div.tbody', h('div.t1', C.avatar(null), h('b.dt-nm'), h('span.cnt'), h('span.chip.xp', { title: '다른 프로세스' }, '⇢', h('span.xpt', ' 다른 프로세스')),
        h('span.fst', C.glyph('idle'), h('span.fsl'), R.timeEl(Date.now(), 'live', 'el rel')), h('button.btn.link.fexp', { type: 'button' }), h('span.bdg')), h('div.ft')));
    r.addEventListener('click', () => { const a = r._a; if (a) R.openRoom(a.ch, a.id); });
    r.querySelector('.tg').addEventListener('click', e => { e.stopPropagation(); const a = r._a; if (a) { Detail.setOpen(a, !Detail.isOpen(a)); R.emit('talkui'); } });
    r.querySelector('.fexp').addEventListener('click', e => { e.stopPropagation(); const k = r.dataset.key; U.expanded[k] = !U.expanded[k]; R.save(); R.emit('talkui'); });
    return r;
  }
  // text lines of a node: 나 (root's first prompt) · 지시 · 후속 · 보고
  function linesOf(key, root) {
    const o = [], ms = R.msgs(key), fl = ms.filter(m => m.dir === 'follow'), up = ms.filter(m => m.dir === 'up').pop(), d = ms.find(isDown);
    if (root) { const u = R.acts(key).find(x => x.k === 'user' && !/^\[상황실 톡 · /.test(x.x)); if (u) o.push({ k: 'me', lab: '나', txt: u.x, id: 'u|' + key }); }
    const mk = (k, lab, m, pre) => ({ k, lab, id: m.id, enc: m.encrypted, txt: m.encrypted ? '암호화된 ' + (m.dir === 'up' ? '보고' : '지시') + (m.role ? ' · ' + m.role : '') : (pre || '') + m.text });
    if (d) o.push(mk('d', '지시', d));
    if (fl.length === 1) o.push(mk('f:' + fl[0].id, '후속', fl[0]));
    else if (fl.length > 1) {
      const fo = 'fo|' + key, op = A.open.has(fo);
      if (!op) o.push({ ...mk('fo', '후속 ' + fl.length + ' ▸', fl[fl.length - 1]), tog: fo });
      else fl.forEach((m, i) => o.push(i ? mk('f:' + m.id, '후속', m, R.fmtHM(m.t) + ' · ') : { ...mk('fo', '후속 ' + fl.length + ' ▾', m, R.fmtHM(m.t) + ' · '), tog: fo }));
    }
    if (up) o.push(mk('u', '보고', up));
    return o;
  }
  function setLines(ft, lines) {
    const n = U.flowText ? 6 : 1;
    keyed(ft, lines, {
      key: l => l.k,
      create: l => { const body = C.clampBody(n, 'fv'); return h('div.fl', l.tog ? h('button.fk.lnk', { type: 'button', 'aria-expanded': 'false', on: { click: e => { e.stopPropagation(); toggleOpen(e.currentTarget._t); } } }) : h('span.fk'), h('div.fvw', h('span.flk', { role: 'img', 'aria-label': '암호화됨', hidden: true }, svgUse('i-lock')), body), h('span.fr', C.clampBtn(body))); },
      update: (e, l) => { const k = e.firstChild; text(k, l.lab); if (l.tog) { k._t = l.tog; attr(k, 'aria-expanded', A.open.has(l.tog) ? 'true' : 'false'); } const w = e.children[1]; w.firstChild.hidden = !l.enc; cls(w.lastChild, 'enc', !!l.enc); C.setClamp(w.lastChild, l.id, l.txt, n); },
    });
  }
  function setRow(r, it, curKey) {
    const root = !!it.root, a = it.a, t1 = r.querySelector('.t1');
    r._a = a || null; cls(r, 'sumrow', !!it.sum); cls(r, 'ghost', !!it.g); cls(r, 'cur', !!a && a.key === curKey);
    attr(r, 'aria-current', a && a.key === curKey ? 'true' : null); attr(r, 'aria-level', it.d + 1);
    Detail.guides(r, it.fl, !!a && !root && Detail.isCross(a));
    const tg = r.querySelector('.tg'), can = !!a && !root && it.nk > 0;
    cls(tg, 'off', !can); cls(tg, 'open', !!it.exp); attr(r, 'aria-expanded', can ? (it.exp ? 'true' : 'false') : null); if (can) attr(tg, 'aria-label', '하위 ' + it.nk + '개 ' + (it.exp ? '접기' : '펼치기'));
    const fe = r.querySelector('.fexp'); fe.hidden = !it.sum;
    if (it.sum) {
      const ms = it.sum.members; text(r.querySelector('.dt-nm'), (it.sum.open ? '▾ ' : '▸ ') + '하위 ' + ms.length + '개 더 (같은 지시) · ' + Detail.sumKids(ms)); text(fe, it.sum.open ? '접기' : '펼치기');
      setLines(r.querySelector('.ft'), []); return;
    }
    const nm = a ? a.name : it.g.name, ms2 = a ? null : it.g;
    C.setAvatar(r.querySelector('.av'), a || { tool: 'claude', st: 'done', parent: null }); text(r.querySelector('.dt-nm'), nm); attr(r, 'title', nm);
    text(r.querySelector('.cnt'), it.nk ? '· ' + it.nk : ''); r.querySelector('.xp').hidden = !(a && !root && Detail.isCross(a));
    const gl = r.querySelector('.fst .gl'), fsl = r.querySelector('.fsl'), tm = r.querySelector('.el');
    if (a) { gl.style.display = ''; C.setGlyph(gl, a.st); text(fsl, ST[a.st]); const [t, m] = Detail.when(a); R.setTimeFor(tm, t, m, a.ch); tm.hidden = t == null; C.badge(r.querySelector('.bdg'), ChatList.badgeOf(a, R.isWaiting(a))); }
    else { gl.style.display = 'none'; text(fsl, '(끝남)'); tm.hidden = true; C.badge(r.querySelector('.bdg'), null); }
    setLines(r.querySelector('.ft'), linesOf(a ? a.key : ms2.ck, root));
  }
  function render(root, curA) {
    cur = { root: root.key, key: curA ? curA.key : null };
    const subs = Detail.subtree(root), enc = subs.filter(x => R.msgs(x.key).some(m => m.encrypted)).length, sk = Detail.sumKids(subs);
    text(sumEl, '하위 ' + subs.length + (sk ? ' · ' + sk : '') + (enc ? ' · 암호화\u00a0' + enc : '')); text(curEl, curA && curA !== root ? ' · 현재 방: ' + curA.name : '');
    note.hidden = [root, ...subs].some(x => R.msgs(x.key).length); txIn.checked = !!U.flowText;
    keyed(tree, walkItems(root), { key: it => it.sum ? it.key : it.g ? it.key : it.a.key, create: mkRow, update: (r, it) => setRow(r, it, cur.key) });
    const rows = [...tree.children], ae = document.activeElement, t = rows.includes(ae) ? ae : rows.find(r => r._a && r._a.key === cur.key) || rows[0];
    rows.forEach(r => attr(r, 'tabindex', r === t ? '0' : '-1'));
    C.measure(el);
  }
  tree.addEventListener('keydown', e => {   // Space on a row = 더보기 / 접기 of its 지시 (the arrows, Enter, Shift+→ are Detail.treeBox's)
    if (e.key !== ' ' || !e.target.classList.contains('tn')) return;
    const a = e.target._a, d = a && down(a.key); e.preventDefault(); if (d) toggleOpen(d.id);
  });
  const focus = () => { const r = tree.querySelector('.tn[tabindex="0"]') || tree.querySelector('.tn'); r ? r.focus({ preventScroll: true }) : el.focus({ preventScroll: true }); };
  return { el, render, focus };
})();
