/* ===== 65-notify.js — toasts + Windows notifications (CHAT-UX §7). Triggers and one-per-transition rules unchanged from DIRECTION §10.
   A toast is a list-row look-alike (avatar + title + preview) bottom-right; shown only when the room is not the open room. ===== */
(() => {
  const { h, text, attr, M, S, U, on, ST, LIVE } = R;
  // ---------- classification ----------
  const toWait = e => (e.type === 'chan' && e.to === 'error') || e.type === 'start' && (e.to === 'user' || e.to === 'stall') || e.type === 'status' && (e.to === 'user' || e.to === 'stall' || ((e.to === 'stopped' || e.to === 'dead') && (LIVE.has(e.from) || e.from === 'user')));
  const longProc = e => e.type === 'proc-done' && e.dur >= S.longMin * 60;
  const notable = e => toWait(e) || longProc(e);                               // toast + Windows notification set
  const reason = e => { const a = e.agent || {}; if (e.type === 'talk') return ''; if (e.type === 'chan') { const c = R.chan(e.ch); return e.to === 'error' ? String(c && c.error || '').split('\n')[0] : ''; } return e.type === 'proc-done' ? String(e.cmd || '') : e.to === 'user' ? (a.now || a.why || '') : (a.why || ''); };
  const toastSentence = e => e.type === 'talk' ? (e.kind === 'held' ? '보낸 톡이 터미널에서 승인을 기다립니다 (5분)' : e.kind === 'unreach' ? '보낸 톡이 연결 안 됨으로 닿지 못했습니다' : '보낸 톡이 거절되었습니다') : e.type === 'chan' ? '연결이 끊겼습니다 — 이 채널의 에이전트 상태를 확인할 수 없습니다' : e.type === 'proc-done' ? '오래 걸린 작업이 끝났습니다 (' + R.fmtDur(e.dur) + (e.cmd ? ', ' + R.str(e.cmd, 40) : '') + ')'
    : { user: '입력을 기다립니다', stall: '응답이 없습니다', stopped: '중단되었습니다', dead: '연결이 끊겼습니다' }[e.to];
  const title = e => e.type === 'chan' ? R.chName(e.ch) : e.type === 'talk' && e.kind === 'held' ? '터미널 승인 필요 — ' + ((e.agent && e.agent.name) || '?') : (e.agent && e.agent.name) || '?';
  const openIt = e => { if (e.type === 'chan') R.openChannel(e.ch); else if (e.agent) R.openRoom(e.agent.ch, e.agent.id); };

  // ---------- toasts ----------
  const stack = h('div#toasts', { role: 'status', 'aria-live': 'polite' });
  document.getElementById('layer').append(stack);
  const reduced = () => document.documentElement.dataset.motion === 'reduce' || (document.documentElement.dataset.motion !== 'full' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  function dismiss(t) {
    if (t._gone) return; t._gone = true; clearTimeout(t._tm);
    if (reduced()) return t.remove();
    t.classList.add('out'); setTimeout(() => t.remove(), 160);
  }
  function toast(e) {
    const a = e.agent || {}, keep = e.to === 'user' || e.to === 'dead' || e.type === 'chan';
    if (e.type !== 'chan' && e.type !== 'talk' && U.room === e.key) return;                            // the open room already shows it
    for (const t of [...stack.children]) if (t._key === e.key) t.remove();       // one toast per agent
    const av = e.type === 'chan' ? h('span.av', C.glyph('dead')) : C.avatar({ tool: a.tool || 'claude', st: e.to || 'idle', parent: null });
    const t = h('div.toast', av, h('div.tx', h('b', title(e)), h('div.meta', toastSentence(e) + (reason(e) && e.type !== 'proc-done' ? ' · ' + R.str(reason(e), 80) : ''))),
      h('div.ta', h('button.btn.sm', { type: 'button', on: { click: () => { openIt(e); dismiss(t); const n = notes.get(e.key); if (n) { n.close(); notes.delete(e.key); } } } }, '열기'),
        h('button.x', { type: 'button', 'aria-label': '닫기', title: '닫기', on: { click: () => dismiss(t) } }, '×')));
    t._key = e.key; t._left = 8000;
    const arm = () => { t._at = Date.now(); t._tm = setTimeout(() => dismiss(t), t._left); };
    const hold = () => { if (t._gone || !t._tm) return; clearTimeout(t._tm); t._tm = 0; t._left -= Date.now() - t._at; };
    const release = () => { if (!t._tm && !t._gone && !t.matches(':hover, :focus-within')) arm(); };
    if (!keep) { arm(); t.addEventListener('mouseenter', hold); t.addEventListener('focusin', hold); t.addEventListener('mouseleave', release); t.addEventListener('focusout', release); }
    t._keep = keep; stack.append(t);
    for (let o; (o = [...stack.children].filter(x => !x._gone)).length > 3;) { o.pop(); (o.find(x => !x._keep) || o[0]).remove(); }   // never drops the newest (last)
  }

  // ---------- Windows notifications ----------
  const notes = new Map();                                                          // agent key -> Notification
  const canNotify = () => S.notify && typeof Notification !== 'undefined' && Notification.permission === 'granted';
  function notify(e) {
    try {
      const n = new Notification(title(e), { body: reason(e) || toastSentence(e), tag: e.key });  // same tag = one per agent, replaced on a new transition
      n.onclick = () => { window.focus(); openIt(e); n.close(); for (const t of [...stack.children]) if (t._key === e.key) dismiss(t); };
      notes.set(e.key, n);
    } catch { }
  }
  // a talk I sent needs attention (TALK-UX §5.5): held always (the answer is at another window), refused/unreachable only when its room is not open
  const clearKey = k => { const n = notes.get(k); if (n) { n.close(); notes.delete(k); } for (const t of [...stack.children]) if (t._key === k) dismiss(t); };
  on('talk', e => { if (e.kind === 'clear') return clearKey(e.key); toast(e); if (canNotify()) notify(e); });   // 'clear': the held talk was approved / expired, its toast is stale
  on('events', evs => {
    if (!evs || !evs.length) return;
    const clear = e => clearKey(e.key);
    for (const e of evs) if (!notable(e) && (e.type === 'gone' || e.type === 'status' || e.type === 'chan')) clear(e);   // any non-notable change clears what was shown; first, so freed slots are reused
    for (const e of [...evs].reverse()) { if (!notable(e)) continue; toast(e); if (canNotify()) notify(e); }
  });
})();
