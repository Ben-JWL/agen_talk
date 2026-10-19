/* ===== 54-shell.js — icon rail (채팅 / 보드 / 설정), poll ring + pause, global keys (b , p r). CHAT-UX §3, §7. ===== */
(() => {
  const { $, attr, M, U, on, go, key } = R;
  function renderRail() {
    const v = R.params().view;
    for (const [id, name] of [['rt-chat', 'chat'], ['rt-board', 'board'], ['rt-settings', 'settings']]) { const el = $('#' + id); attr(el, 'aria-selected', v === name ? 'true' : 'false'); attr(el, 'aria-current', v === name ? 'page' : null); }
    const n = M.counts.waiting || 0, tab = $('#rt-chat'); let b = tab.querySelector('.badge');
    C.badge(b, { red: n > 0, n }); attr(tab, 'aria-label', n ? '채팅, 안읽음 ' + n : '채팅'); b.setAttribute('aria-label', n ? '안읽음 ' + n + '개' : '');
  }
  on('model', renderRail); on('route', renderRail); on('hubview', renderRail);
  $('#pause').addEventListener('click', () => R.setPaused(!R.isPaused()));
  key('b', () => go('board'), '보드'); key(',', () => go('settings'), '설정');
  key('p', () => R.setPaused(!R.isPaused()), '일시정지 / 재개');
  key('r', () => { R.refresh(); R.emit('resort'); }, '새로고침');

  // ---------- list-pane splitter: drag (pointer capture), ←/→ 16 px, Home or double-click = default; U.listW persists ----------
  // Clamp 260–560 and leave the conversation (plus an open docked drawer) at least 420 px; under 760 px the list is its own view: no handle.
  const chat = $('#chat'), list = $('#list'), MIN = 260, MAX = 560, STEP = 16, MAIN_MIN = 420;
  const split = R.h('div.lsplit', { role: 'separator', tabindex: '0', 'aria-orientation': 'vertical', 'aria-controls': 'list', 'aria-label': '목록 너비', title: '끌어서 목록 너비 조절 · 두 번 클릭하면 기본 너비', 'aria-valuemin': String(MIN) });
  chat.append(split);
  const narrow = () => matchMedia('(max-width: 760px)').matches;
  const dflt = () => matchMedia('(max-width: 1100px)').matches ? 280 : 320;
  const maxW = () => { const dock = chat.dataset.drawer === 'open' && !matchMedia('(max-width: 1100px)').matches ? 300 : 0; return Math.max(MIN, Math.min(MAX, chat.clientWidth - MAIN_MIN - dock)); };
  const clampW = w => Math.round(Math.max(MIN, Math.min(maxW(), w)));
  function applyW() {
    const n = narrow(); split.hidden = n;
    const w = U.listW ? clampW(U.listW) : null;
    if (w) chat.style.setProperty('--list-w', w + 'px'); else chat.style.removeProperty('--list-w');
    const cur = w || dflt();
    attr(split, 'aria-valuemax', String(maxW())); attr(split, 'aria-valuenow', String(cur)); attr(split, 'aria-valuetext', cur + '픽셀');
    split.style.left = (n ? 0 : list.getBoundingClientRect().width || cur) + 'px';
  }
  function setW(w) { U.listW = w == null ? null : clampW(w); if (U.listW === dflt()) U.listW = null; R.save(); applyW(); }
  if (!(U.listW >= MIN && U.listW <= 2000)) U.listW = null;
  let drag = null;
  split.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault(); split.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, w: list.getBoundingClientRect().width, id: e.pointerId }; split.classList.add('drag'); document.body.classList.add('col-resize');
  });
  split.addEventListener('pointermove', e => { if (drag && e.pointerId === drag.id) setW(drag.w + e.clientX - drag.x); });
  const end = e => { if (!drag || e.pointerId !== drag.id) return; drag = null; split.classList.remove('drag'); document.body.classList.remove('col-resize'); };
  split.addEventListener('pointerup', end); split.addEventListener('pointercancel', end); split.addEventListener('lostpointercapture', end);
  split.addEventListener('dblclick', () => setW(null));
  split.addEventListener('keydown', e => {
    const d = { ArrowLeft: -STEP, ArrowRight: STEP }[e.key];
    if (!d && e.key !== 'Home') return;
    e.preventDefault(); e.stopPropagation();
    setW(d ? list.getBoundingClientRect().width + d : null);
  });
  new ResizeObserver(applyW).observe(chat);
  new MutationObserver(applyW).observe(chat, { attributes: true, attributeFilter: ['data-drawer', 'data-room'] });
  applyW();
  R.listSplit = { el: split, set: setW, min: MIN, max: maxW };   // selftest hook
})();
