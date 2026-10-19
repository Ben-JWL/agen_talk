/* ===== 63-board.js (P4) — 보드: attention-bucket lanes. DIRECTION §4. Cards are keyed by agent key and keep their
   element across polls (a bucket change moves the same element to the other lane). ===== */
(() => {
  const { h, text, attr, cls, keyed, M, U, ST, on } = R;
  const LANE_IDS = ['wait', 'work', 'child', 'done'];
  const LANES = [['wait', '나를 기다림'], ['work', '작업 중'], ['child', '하위 대기'], ['done', '끝남']];
  const FAN = 5;                                   // a parent with >= FAN kids collapses to one summary card
  const cards = new Map(), sums = new Map(), ord = new Map();   // key -> element ; key -> {b, t} frozen sort time
  let sel, lanes = {}, board, scope;

  const bucketOf = a => R.isWaiting(a) ? 'wait' : a.st === 'child' ? 'child' : R.LIVE.has(a.st) ? 'work' : 'done';
  const open = a => { R.U.room = a.key; R.openRoom(a.ch, a.id); };
  const isSel = a => U.room === a.key;

  // a card is the list row (avatar + title + channel + preview) — waiting cards carry the ask bubble and 방 열기
  function makeCard(a) {
    const el = C.roomRow(a, 'card');
    el.addEventListener('click', () => { open(el._a); });
    return el;
  }
  function setCard(el, a, b) {
    el._a = a;
    for (const v of ['wait', 'work', 'child', 'done']) cls(el, 'k-' + v, v === b);
    C.setRoomRow(el, a, { scoped: false });
    el.querySelector('.cfoot').hidden = b !== 'wait';
    const lab = a.name + ', ' + ST[a.st] + (a.why ? ', ' + a.why : '');
    attr(el, 'role', 'option'); if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');   // roving: rove() picks the one tab stop
    attr(el, 'aria-label', lab);
    cls(el, 'gone', !M.agents.has(a.key));
    attr(el, 'aria-current', isSel(a) ? 'true' : null); attr(el, 'aria-selected', isSel(a) ? 'true' : 'false');
  }
  // keyboard: one tab stop; ↑/↓ within a lane, ←/→ to the neighbouring lane (same row, clamped), Home/End, Enter opens
  const navCards = () => R.$$('.bcard:not(.k-sum)', board).filter(c => !c.closest('[hidden]') && !c.classList.contains('gone'));
  function rove() {
    const cs = navCards(), cur = cs.find(c => c === document.activeElement) || cs.find(c => c.getAttribute('aria-current') === 'true') || cs[0];
    for (const c of cs) attr(c, 'tabindex', c === cur ? '0' : '-1');
  }
  function pick(c) {
    for (const x of R.$$('.bcard[aria-current=true]', board)) { attr(x, 'aria-current', null); attr(x, 'aria-selected', 'false'); }
    attr(c, 'aria-current', 'true'); attr(c, 'aria-selected', 'true');
    c.focus({ preventScroll: true }); c.scrollIntoView({ block: 'nearest', inline: 'nearest' }); rove();
  }
  function onKey(e) {
    const c = e.target.closest && e.target.closest('.bcard:not(.k-sum)'); if (!c || e.target !== c) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(c._a); return; }
    const lane = c.closest('.lbody'), mine = R.$$('.bcard:not(.k-sum)', lane), i = mine.indexOf(c); let t = null;
    if (e.key === 'ArrowDown') t = mine[i + 1] || c;
    else if (e.key === 'ArrowUp') t = mine[i - 1] || c;
    else if (e.key === 'Home') t = mine[0];
    else if (e.key === 'End') t = mine[mine.length - 1];
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const ls = LANE_IDS.map(id => R.$$('.bcard:not(.k-sum)', lanes[id].body).filter(x => !x.closest('[hidden]'))).filter(l => l.length), li = ls.findIndex(l => l.includes(c)), nl = ls[li + (e.key === 'ArrowRight' ? 1 : -1)];
      t = nl ? nl[Math.min(i, nl.length - 1)] : c;
    } else return;
    e.preventDefault(); pick(t);
  }

  function makeSum(p) {
    const el = h('div.bcard.k-sum', h('div.l1', h('span.name')), h('div.l3', h('span.txt')), h('button.btn.sm.act', { type: 'button' }));
    el.querySelector('.act').addEventListener('click', () => { U.boardExp[el._p.key] = !U.boardExp[el._p.key]; R.save(); render(); });
    return el;
  }
  function setSum(el, p, d) {
    el._p = p;
    text(el.querySelector('.name'), '↳ 하위 에이전트'); attr(el.querySelector('.name'), 'title', p.name);
    const parts = [d.done && d.done + '개 완료', d.live && d.live + '개 작업 중', d.wait && d.wait + '개 입력 대기'].filter(Boolean);
    text(el.querySelector('.txt'), '하위 ' + d.all + '개 중 ' + parts.join(' · '));
    const exp = !!U.boardExp[p.key]; text(el.querySelector('.act'), exp ? '접기' : '모두 보기'); attr(el.querySelector('.act'), 'aria-expanded', exp ? 'true' : 'false');
  }

  function desc(a, out = []) { for (const k of a.kids) { const c = M.agents.get(k); if (c) { out.push(c); desc(c, out); } } return out; }

  function render() {
    const ch = U.boardCh && R.chan(U.boardCh) ? U.boardCh : '';
    if (U.boardCh && !ch) U.boardCh = '';
    const all = R.agentsOf(ch || 'all'), hidden = new Set(), fans = new Map(), total = { wait: 0, work: 0, child: 0, done: 0 };
    for (const a of all) total[bucketOf(a)]++;
    const nWait = all.filter(R.needsMe).length;   // the lane keeps read waits (last, marked 읽음) but counts only the unread ones
    for (const a of all) if (a.kids.length >= FAN && !hidden.has(a.key)) {
      const ds = desc(a), d = { all: ds.length, wait: 0, live: 0, done: 0 };
      for (const c of ds) { const b = bucketOf(c); d[b === 'wait' ? 'wait' : b === 'done' ? 'done' : 'live']++; if (b !== 'wait' && !U.boardExp[a.key]) hidden.add(c.key); }
      fans.set(a.key, d);
    }
    const by = { wait: [], work: [], child: [], done: [] };
    for (const a of all) {
      if (hidden.has(a.key)) continue;
      const b = bucketOf(a), o = ord.get(a.key);
      if (!o || o.b !== b) ord.set(a.key, { b, t: a.t0 != null ? a.t0 : a.lastAt != null ? a.lastAt : Infinity });
      by[b].push(a);
    }
    for (const [k, o] of ord) if (!M.agents.has(k)) { ord.delete(k); cards.delete(k); sums.delete(k); }
    for (const [id, l] of Object.entries(lanes)) {
      const items = [], list = by[id].sort((x, y) => (id === 'wait' ? (R.isAcked(x) - R.isAcked(y)) || R.waitCmp(x, y) : 0) || (ord.get(x.key).t - ord.get(y.key).t) || (x.key < y.key ? -1 : 1));
      for (const a of list) { items.push({ a, b: id }); if (fans.has(a.key)) items.push({ sum: a, d: fans.get(a.key) }); }
      const collapsed = id === 'done' && !U.boardDone && total[id] > 0;
      const shown = id === 'wait' ? nWait : total[id]; text(l.n, shown); l.sec.dataset.n = shown;
      l.empty.hidden = !!total[id]; l.body.hidden = collapsed;
      if (id === 'done') {
        l.tog.hidden = !total[id]; text(l.tog, collapsed ? total[id] + '개 (펼치기)' : '접기'); attr(l.tog, 'aria-expanded', collapsed ? 'false' : 'true');
        cls(board, 'dc', collapsed || !total[id]);
      }
      keyed(l.body, collapsed ? [] : items, {
        key: it => it.sum ? 'sum:' + it.sum.key : it.a.key,
        create: it => it.sum ? (sums.get(it.sum.key) || sums.set(it.sum.key, makeSum(it.sum)).get(it.sum.key)) : (cards.get(it.a.key) || cards.set(it.a.key, makeCard(it.a)).get(it.a.key)),
        update: (el, it) => it.sum ? setSum(el, it.sum, it.d) : setCard(el, it.a, it.b),
      });
    }
    // toolbar
    const opts = [{ id: '', name: '채널 전체' }, ...M.channels];
    keyed(sel, opts, { key: c => 'c:' + c.id, create: c => h('option', { value: c.id }), update: (o, c) => { text(o, c.name); o.value = c.id; } });
    if (sel.value !== ch) sel.value = ch;
    scope.hidden = !ch; text(scope.firstChild, R.chName(ch) + '만 보는 중 · ');
    rove();
  }

  R.view('board', {
    mount(wrap) {
      U.boardExp = U.boardExp || {};
      sel = h('select.sel', { 'aria-label': '채널', on: { change: () => { U.boardCh = sel.value; R.save(); render(); } } });
      board = h('div.board', { role: 'listbox', 'aria-label': '에이전트 보드' }); board.addEventListener('keydown', onKey);
      scope = h('span.meta.bscope', { hidden: true }, '', h('button.btn.link', { type: 'button', on: { click: () => { U.boardCh = ''; R.save(); render(); } } }, '전체 보기'));
      for (const [id, label] of LANES) {
        const n = h('span.n'), body = h('div.lbody', { role: 'group', 'aria-label': label }), empty = h('p.none', '없음'), tog = id === 'done' ? h('button.btn.sm.tog', { type: 'button', on: { click: () => { U.boardDone = !U.boardDone; R.save(); render(); } } }) : null;
        const sec = h('section.lane', { data: { lane: id } }, h('h2.lh', h('span.lt', label), n), tog, empty, body);
        lanes[id] = { sec, n, body, empty, tog }; board.append(sec);
      }
      wrap.append(h('div.bwrap', h('div.btool', h('h1.t-title', '보드'), h('span.bsel', sel, scope)), board));
    },
    update() { render(); },
  });
  on('hidden', () => { if (R.params().view === 'board') render(); });
  on('arrow', e => { if (R.params().view !== 'board') return; const c = navCards().find(x => x.tabIndex === 0) || navCards()[0]; if (c) { e.preventDefault(); pick(c); } });
})();
