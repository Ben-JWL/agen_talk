/* ===== 61-detail.js — drawer pieces kept from the old detail page (CHAT-UX §8): subagent tree + processes. Detail.tree(el, a), Detail.procs(el, a).
   All agent strings go through textContent / h(); every update patches in place (keyed). ===== */
const Detail = (() => {
  const { h, svgUse, text, attr, cls, keyed, M, U, ST, timeEl, setTime, fmtDur } = R;
  const get = k => M.agents.get(k);
  const live = a => R.LIVE.has(a.st);
  const subtree = a => { const o = []; (function w(x) { for (const k of x.kids) { const c = get(k); if (c) { o.push(c); w(c); } } })(a); return o; };
  const ancestors = a => { const o = []; for (let p = a.parent && get(a.parent); p; p = p.parent && get(p.parent)) o.unshift(p); return o; };
  const pidOf = a => { const p = C.meta(a).pid; return /^\d+$/.test(p) ? p : ''; };
  const nearestPid = a => { for (let p = a.parent && get(a.parent); p; p = p.parent && get(p.parent)) if (pidOf(p)) return pidOf(p); return ''; };
  const isCross = a => !!a.parent && ((pidOf(a) && pidOf(a) !== nearestPid(a)) || /claude -p/.test(a.name));
  const spawnCmd = (c, p) => {
    const pid = pidOf(c), pr = (p ? p.procs : []).find(x => { const t = x.cmd + ' ' + x.kid; return (pid && t.includes(pid)) || (/claude -p/.test(c.name) && /claude\b.* -p\b/.test(t)); });
    return pr ? pr.cmd : ((/claude -p/.test(c.name) ? 'claude -p ' : '') + C.meta(c).cwd).trim();
  };
  const isOpen = a => { const v = U.expanded[a.key]; return v == null ? subtree(a).some(x => !R.REST.has(x.st)) : !!v; };
  const setOpen = (a, v) => { U.expanded[a.key] = v; R.save(); };
  const when = (a) => (live(a) || a.st === 'stall' || a.st === 'user') && a.t0 != null ? [a.t0, 'live'] : [a.lastAt, 'ago'];

  // ---------- tree (drawer 하위 N): no root node; 2-line 44 px nodes, 16 px indent per depth, guides ----------
  function treeItems(a) {
    const items = [];
    (function walk(n, d, fl, top) {
      const kids = n.kids.map(get).filter(Boolean);
      kids.forEach((c, i) => {
        const ck = c.kids.map(get).filter(Boolean), last = i === kids.length - 1 && !(top && n.hidden), exp = (ck.length || c.hidden) && isOpen(c);
        if (exp && U.expanded[c.key] == null) U.expanded[c.key] = true;   // pin: a visible branch collapses only by user action
        items.push({ a: c, d, fl: [...fl, last], exp: !!exp, kids: ck });
        if (exp) { walk(c, d + 1, [...fl, last], false); if (c.hidden) items.push({ hid: true, key: 'h:' + c.key, d: d + 1, fl: [...fl, last, true], n: c.hidden }); }
      });
    })(a, 0, [], true);
    if (a.hidden) items.push({ hid: true, key: 'h:' + a.key, d: 0, fl: [true], n: a.hidden });
    return items;
  }
  const sumKids = kids => {
    const g = { done: 0, live: 0, user: 0, stall: 0, other: 0 };
    for (const k of kids) g[k.st === 'done' ? 'done' : live(k) ? 'live' : k.st === 'user' || k.st === 'stall' ? k.st : 'other']++;
    return [['완료', g.done], ['작업 중', g.live], ['입력 대기', g.user], ['응답 없음', g.stall], ['그 외', g.other]].filter(x => x[1]).map(x => x[0] + '\u00a0' + x[1]).join(' · ');
  };
  // guide cells of a tree row: one per ancestor level (vertical line unless that ancestor was the last child) + this row's elbow; fl = [last?, ...]
  function guides(el, fl, cross) {
    const sig = fl.join('') + (cross ? 'x' : ''); if (el._sig === sig) return; el._sig = sig;
    el.querySelector('.ind').replaceChildren(...(fl.length ? [...fl.slice(0, -1).map(last => h('span.c', { class: last ? '' : 'v' })), h('span.c', { class: 'e' + (fl[fl.length - 1] ? '' : ' t') + (cross ? ' dsh' : '') })] : []));
  }
  function mkRow(it, tree) {
    const el = h('div.tn', { role: 'treeitem', tabindex: '-1' }, h('span.ind'), h('button.tg', { type: 'button', tabindex: '-1' }, svgUse('i-chev')),
      it.hid ? h('span.t1.dim') : h('div.tbody', h('div.t1', C.glyph('work'), h('b.dt-nm'), h('span.cnt'), timeEl(Date.now(), 'live', 'el rel')), h('div.t2.meta', h('span.chip.xp', '⇢ 다른 프로세스'), h('span.nw', h('span.verb'), ' ', h('span.obj')))));
    if (!it.hid) {
      el.addEventListener('click', () => { const a = el._a; if (a) R.openRoom(a.ch, a.id); });
      el.querySelector('.tg').addEventListener('click', e => { e.stopPropagation(); const a = el._a; setOpen(a, !isOpen(a)); tree._refresh(); });
    }
    return el;
  }
  function setRow(el, it, tree) {
    cls(el, 'hid', !!it.hid);
    const a = it.a, cross = a && isCross(a);
    guides(el, it.fl, cross);
    const tg = el.querySelector('.tg'), exp = it.exp, can = !it.hid && (it.kids.length || a.hidden);
    cls(tg, 'off', !can); cls(tg, 'open', !!exp); cls(el, 'leaf', !can); tg.tabIndex = -1; if (can) attr(tg, 'aria-label', '하위 ' + it.kids.length + '개 ' + (exp ? '접기' : '펼치기'));
    if (it.hid) { text(el.querySelector('.t1'), '완료 ' + it.n + '개는 목록에서 빠짐 (수집기)'); attr(el, 'aria-hidden', 'true'); return; }
    el._a = a; attr(el, 'aria-level', it.d + 1); attr(el, 'aria-expanded', can ? (exp ? 'true' : 'false') : null);
    C.setGlyph(el.querySelector('.gl'), a.st);
    const nm = el.querySelector('.dt-nm'); text(nm, a.name);
    const cmd = cross ? spawnCmd(a, get(a.parent)) : '';
    attr(el, 'title', a.name + (a.meta ? '\n' + a.meta : '') + (cmd ? '\n' + cmd : ''));   // the spawn command lives in the title only
    text(el.querySelector('.cnt'), it.kids.length ? '· ' + it.kids.length : ''); el.querySelector('.xp').hidden = !cross;
    const nd = C.nowDoing(a), nw = el.querySelector('.nw'); text(nw.querySelector('.verb'), nd.verb); text(nw.querySelector('.obj'), nd.obj); cls(nw.querySelector('.obj'), 'prose', !!nd.prose);
    attr(nw, 'title', [nd.verb, nd.obj].filter(Boolean).join(' '));
    const [t, m] = when(a); setTime(el.querySelector('.el'), t, m);
  }
  function setTree(box, a) {
    const tree = box._tree; tree._root = a;
    tree._refresh = () => setTree(box, get(tree._root.key) || a);
    const items = treeItems(a);
    keyed(tree, items, { key: it => it.hid ? it.key : it.a.key, create: it => mkRow(it, tree), update: (el, it) => setRow(el, it, tree) });
    return items.length;
  }
  function treeBox() {
    const tree = h('div.dt-tree', { role: 'tree', 'aria-label': '하위 에이전트 트리' }), box = h('div', tree); box._tree = tree;
    tree.addEventListener('keydown', e => {
      const r = e.target.closest('.tn'), a = r && r._a; if (!a) return;
      const rows = [...tree.children].filter(x => x._a), i = rows.indexOf(r), tgl = (v, all) => {
        const setAll = n => { setOpen(n, v); if (all) n.kids.map(get).filter(Boolean).forEach(setAll); }; setAll(a); tree._refresh(); };
      const can = a.kids.length || a.hidden, open = can && isOpen(a);
      if (e.key === 'ArrowDown') rows[i + 1] && rows[i + 1].focus();
      else if (e.key === 'ArrowUp') rows[i - 1] && rows[i - 1].focus();
      else if (e.key === 'ArrowLeft') { if (open) tgl(false); else { const p = rows.find(x => x._a.key === a.parent); p && p.focus(); } }
      else if (e.key === 'ArrowRight') { if (can && (!open || e.shiftKey)) tgl(true, e.shiftKey); else if (open && rows[i + 1]) rows[i + 1].focus(); }
      else if (e.key === 'Enter') R.openRoom(a.ch, a.id);
      else return;
      e.preventDefault(); e.stopPropagation();
    });
    return box;
  }

  // ---------- processes ----------
  const word = s => (String(s).trim().split(/\s+/)[0] || '').split(/[\\/]/).pop();
  function chainOf(p, a) {
    const parts = [a.tool], m = p.cmd.match(/^(bash|sh|zsh|cmd|powershell)((?: -c| \/c)?)\s+(.*)$/i);
    if (m) { parts.push((m[1] + m[2]).trim(), word(p.kid || m[3])); } else { parts.push(word(p.cmd)); if (p.kid && word(p.kid) !== word(p.cmd)) parts.push(word(p.kid)); }
    return parts.filter((x, i) => x && x !== parts[i - 1]);
  }
  function mkProc(it) {
    const pr = C.procRow(it.p, it.owner), det = h('div.pdet', h('div.k', '전체 명령'), h('div.inset.full'), h('div.k', '부모 체인'), h('div.mono.chain'), h('div.k.own'));
    const w = h('div.pw', pr, det);
    const tog = () => { const o = !w.classList.contains('open'); w.classList.toggle('open', o); attr(pr, 'aria-expanded', o ? 'true' : 'false'); };
    pr.setAttribute('role', 'button'); pr.tabIndex = 0; pr.addEventListener('click', tog);
    pr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tog(); } });
    return w;
  }
  function setProcs(box, a) {
    const subs = [a, ...subtree(a)], keys = new Set(subs.map(x => x.key)), items = [];
    for (const o of subs) for (const p of o.procs) items.push({ k: o.key + ':' + p.pid, p, owner: o });
    const n = items.length;
    for (const e of M.events) if (e.type === 'proc-done' && keys.has(e.key)) items.push({ k: 'd:' + e.id, fin: e });
    if (!items.length) items.push({ k: 'empty', empty: true });
    keyed(box, items, {
      key: it => it.k,
      create: it => it.empty ? h('div.note', { style: 'padding:16px;font-size:12.5px;color:var(--ink-2)' }, '실행 중인 프로세스가 없습니다') : it.fin ? h('div.prow.fin', C.glyph('done'), h('span.cmd'), h('span.el'), timeEl(Date.now(), 'ago', 'el rel')) : mkProc(it),
      update: (el, it) => {
        if (it.empty) return;
        if (it.fin) { const c = el.querySelector('.cmd'); text(c, it.fin.cmd); attr(c, 'title', it.fin.cmd); text(el.querySelector('.el'), '끝남 · ' + fmtDur(it.fin.dur) + ' 걸림'); setTime(el.querySelector('.rel'), it.fin.t, 'ago'); return; }
        C.setProcRow(el.firstElementChild, it.p, it.owner);
        text(el.querySelector('.full'), it.p.cmd + (it.p.kid ? '\n↳ ' + it.p.kid : ''));
        text(el.querySelector('.chain'), chainOf(it.p, it.owner).join(' → '));
        text(el.querySelector('.own'), 'pid ' + it.p.pid + ' · 소속 ' + it.owner.name + (it.p.bg ? ' · 백그라운드' : ''));
      },
    });
    return n;
  }

  // ---------- exports for the drawer ----------
  function tree(el, a) { if (!el._box) { el._box = treeBox(); el.append(el._box); } return setTree(el._box, a); }
  function procs(el, a) { return setProcs(el, a); }
  return { tree, procs, isCross, spawnCmd, subtree, ancestors, live, sumKids, treeBox, guides, isOpen, setOpen, when, pidOf };
})();
window.Detail = Detail;
