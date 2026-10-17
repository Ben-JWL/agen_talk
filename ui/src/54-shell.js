/* ===== 54-shell.js — icon rail (채팅 / 보드 / 설정), poll ring + pause, global keys (b , p r). CHAT-UX §3, §7. ===== */
(() => {
  const { $, attr, M, on, go, key } = R;
  function renderRail() {
    const v = R.params().view;
    for (const [id, name] of [['rt-chat', 'chat'], ['rt-board', 'board'], ['rt-settings', 'settings']]) { const el = $('#' + id); attr(el, 'aria-selected', v === name ? 'true' : 'false'); attr(el, 'aria-current', v === name ? 'page' : null); }
    const n = M.counts.waiting || 0, tab = $('#rt-chat'); let b = tab.querySelector('.badge');
    C.badge(b, { red: n > 0, n }); attr(tab, 'aria-label', n ? '채팅, 나를 기다림 ' + n : '채팅'); b.setAttribute('aria-label', n ? '나를 기다림 ' + n + '개' : '');
  }
  on('model', renderRail); on('route', renderRail); on('hubview', renderRail);
  $('#pause').addEventListener('click', () => R.setPaused(!R.isPaused()));
  key('b', () => go('board'), '보드'); key(',', () => go('settings'), '설정');
  key('p', () => R.setPaused(!R.isPaused()), '일시정지 / 재개');
  key('r', () => { R.refresh(); R.emit('resort'); }, '새로고침');
})();
