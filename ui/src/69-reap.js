/* ===== 69-reap.js — 유휴 세션 정리: rest sessions (쉬는 중 / 완료 / 중단됨) quiet for S.idleHours whose process still runs.
   The user ticks rows and confirms twice; each one goes through R.endSession (POST api/end), one at a time. Nothing is preselected. ===== */
const Reap = (() => {
  const { h, text, attr, cls, M, S, ST } = R;
  const HOURS = [[1, '1시간'], [6, '6시간'], [24, '1일'], [72, '3일'], [168, '7일']];
  let dlg = null, E = {}, opener = null, picked = new Set(), result = new Map(), busy = false, armed = false, note = '';   // note: the summary of the last run (a poll re-renders the dialog and must not wipe it)
  const cands = () => [...M.agents.values()].filter(a => R.isLongIdle(a) || result.has(a.key)).sort((x, y) => R.idleFor(y) - R.idleFor(x));
  function build() {
    E.sel = h('select.sel', { 'aria-label': '유휴 기준' }, HOURS.map(([v, l]) => h('option', { value: v }, l + ' 넘게')));
    E.sel.addEventListener('change', () => { S.idleHours = +E.sel.value; picked.clear(); armed = false; note = ''; R.applySettings(); render(); });
    E.all = h('button.btn.link', { type: 'button', on: { click: () => { const c = cands().filter(a => !result.has(a.key)); const on_ = c.some(a => !picked.has(a.key)); picked = new Set(on_ ? c.map(a => a.key) : []); armed = false; note = ''; render(); } } });
    E.list = h('ul.reap-list');
    E.empty = h('p.meta', { hidden: true }, '기준을 넘긴 유휴 세션이 없습니다');
    E.msg = h('p.meta.reap-msg', { 'aria-live': 'polite', tabindex: '-1' });
    E.go = h('button.btn.danger', { type: 'button', on: { click: go } });
    E.close = h('button.btn', { type: 'button', on: { click: () => dlg.close() } }, '닫기');
    dlg = h('dialog.dlg.reap', { 'aria-labelledby': 'reap-t' }, h('div.hd', h('h2.t-title', { id: 'reap-t' }, '유휴 세션 정리')),
      h('p.meta', '마지막 활동 뒤 오래 쉬고 있지만 프로세스가 남아 있는 세션입니다. 고른 세션의 프로세스를 그 서버에서 종료합니다 — 대화 기록은 지워지지 않습니다.'),
      h('div.reap-bar', h('label', '기준 ', E.sel), E.all), E.list, E.empty, E.msg, h('div.acts', E.close, E.go));
    dlg.addEventListener('cancel', e => { if (busy) e.preventDefault(); });
    dlg.addEventListener('close', () => { result.clear(); picked.clear(); armed = false; const to = opener && opener.isConnected && !opener.hidden ? opener : document.querySelector('.ov-seg [aria-checked=true]'); if (to) to.focus(); });   // the 유휴 세션 button hides once nothing is left
    dlg.addEventListener('keydown', e => e.stopPropagation());   // the app's single-key shortcuts stay out of the dialog
    document.getElementById('layer').append(dlg);
  }
  function mkRow(a) {
    const cb = h('input', { type: 'checkbox' });
    cb.addEventListener('change', () => { cb.checked ? picked.add(a.key) : picked.delete(a.key); armed = false; note = ''; render(); });
    const el = h('li.reap-row', h('label', cb, h('span.rmain', h('b.rn'), h('span.meta.rd'))), h('span.rago'), h('span.rres'));
    el._cb = cb; return el;
  }
  function setRow(el, a) {
    const res = result.get(a.key), p = a.project;
    text(el.querySelector('.rn'), a.name);
    text(el.querySelector('.rd'), [a.tool, R.shortModel(a.model), R.chName(a.ch), p && p.name, a.end && a.end.pid ? 'pid ' + a.end.pid : ''].filter(Boolean).join(' · '));
    text(el.querySelector('.rago'), ST[a.st] + ' · ' + R.fmtAgo(R.idleFor(a)));
    const rr = el.querySelector('.rres'); text(rr, res ? res.text : ''); cls(rr, 'bad', !!res && !res.ok); rr.hidden = !res;
    el._cb.checked = picked.has(a.key); el._cb.disabled = busy || !!res;
  }
  function render() {
    if (!dlg || !dlg.open) return;
    for (const k of [...picked]) { const a = M.agents.get(k); if (!a || !R.isLongIdle(a)) picked.delete(k); }
    const c = cands(), open = c.filter(a => !result.has(a.key));
    if (E.sel.value !== String(S.idleHours)) E.sel.value = String(S.idleHours);
    R.keyed(E.list, c, { key: a => a.key, create: mkRow, update: setRow });
    E.empty.hidden = c.length > 0; E.all.hidden = !open.length; text(E.all, open.length && open.every(a => picked.has(a.key)) ? '모두 해제' : '모두 선택');
    E.go.disabled = busy || !picked.size; E.sel.disabled = busy; E.close.disabled = busy;
    text(E.go, busy ? '종료 중…' : armed ? '정말 종료 (' + picked.size + '개)' : '선택한 ' + picked.size + '개 종료');
    if (!busy) text(E.msg, armed ? '되돌릴 수 없습니다. 한 번 더 누르면 ' + picked.size + '개 세션의 프로세스를 종료합니다' : note);
  }
  async function go() {
    if (busy || !picked.size) return;
    if (!armed) { armed = true; return render(); }
    busy = true; armed = false; note = ''; render(); E.msg.focus();   // the button is disabled while it runs: keep the focus in the dialog
    let ok = 0, bad = 0;
    for (const k of [...picked]) {
      const a = M.agents.get(k); if (!a) continue;
      text(E.msg, a.name + ' 종료 중…');
      const r = R.isLongIdle(a) ? await R.endSession(a, true) : { ok: false, text: '그사이 상태가 바뀌어 건너뜀' };   // it may have started working since the list was drawn
      result.set(k, r); r.ok ? ok++ : bad++; picked.delete(k); render();
    }
    busy = false; note = ok + '개 종료' + (bad ? ' · ' + bad + '개 실패' : ''); render(); E.close.focus();
  }
  function open(from) {
    if (!dlg) build();
    opener = from || null; result.clear(); picked.clear(); armed = false; busy = false; note = '';
    if (!dlg.open) dlg.showModal();
    render();
  }
  R.on('model', render);
  return { open };
})();
