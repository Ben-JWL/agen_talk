/* ===== 67-palette.js — command palette (Ctrl+K only; / now focuses the list search), shortcut sheet (?), window.Keymap.
   Agent text reaches the DOM only through textContent (R.text / h()). ===== */
(() => {
  const { h, svgUse, text, attr, cls, $, keyed, M, S, go, ST } = R;
  const layer = $('#layer');
  let scrim = null, input, list, prev = null, mode = null, sel = '', rows = [];   // mode: 'pal' | 'sheet'
  let uid = 0;

  // ---------- keymap (P7 renders the same table) ----------
  const SHOW = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓' };
  const FIXED = [
    [['↑', '↓'], '목록에서 방 고르기'], [['Enter'], '방 열기'], [['Esc'], '닫기 (팔레트 → 검색 → 세션 정보 → 방)'],
    [['←', '→'], '하위 트리 접기 / 펼치기'], [['Shift+→'], '하위 트리 모두 펼치기'], [['Ctrl+K'], '명령 팔레트'],
  ];
  function table() {
    const out = []; let digits = false;
    for (const [k, v] of Object.entries(R.keys)) {
      if (k.startsWith('Arrow')) continue;     // covered by the fixed rows
      if (k === '1') { out.push({ keys: ['1'], label: '전체' }); continue; }
      if (/^[2-9]$/.test(k)) { if (!digits) out.push({ keys: ['2–9'], label: '채널 (순서대로)' }); digits = true; continue; }
      if (k === 'j') { out.push({ keys: ['j', 'k'], label: '다음 / 이전 방' }); continue; }
      if (k === 'k') continue;
      out.push({ keys: [SHOW[k] || k], label: v.label || k });
    }
    return out.concat(FIXED.map(([keys, label]) => ({ keys, label })));
  }
  const TALK_KEYS = [['Enter', '보내기 (한 번 더 눌러 확인)'], ['Shift+Enter', '줄바꿈'], ['Esc', '취소 (글은 남음)']];   // TALK-UX §5.4
  window.Keymap = { table };

  // ---------- fuzzy: subsequence, rewards consecutive runs and word starts; -1 = no match ----------
  function fuzzy(q, s) {
    s = s.toLowerCase(); let i = 0, score = 0, run = 0, last = -2;
    for (let j = 0; j < s.length && i < q.length; j++) if (s[j] === q[i]) {
      run = last === j - 1 ? run + 1 : 0; score += 1 + run * 2 + (j === 0 || /[\s\-_/.:]/.test(s[j - 1]) ? 3 : 0); last = j; i++;
    }
    return i < q.length ? -1 : score - s.length * 0.01;
  }
  const best = (q, fields) => { let b = -1; fields.forEach(([s, w]) => { if (!s) return; const f = fuzzy(q, s); if (f >= 0) b = Math.max(b, f * w); }); return b; };

  // ---------- items ----------
  const THEMES = ['system', 'light', 'dark'], THEME_KO = { system: '시스템', light: '라이트', dark: '다크' };
  function navItems() {
    const out = [{ key: 'go:chat', t: '채팅', ic: 'i-chat', cap: 'Esc', run: () => R.openChannel('all') }, { key: 'go:ch:all', t: '전체 채널', ic: 'i-all', cap: '1', run: () => R.openChannel('all') }];
    M.channels.forEach((c, i) => out.push({ key: 'go:ch:' + c.id, t: c.name, ic: C.chIcon(c), cap: i < 8 ? String(i + 2) : '', run: () => R.openChannel(c.id) }));
    return out.concat([['board', '보드', 'i-board', 'b'], ['settings', '설정', 'i-gear', ',']].map(([id, t, ic, cap]) => ({ key: 'go:' + id, t, ic, cap, run: () => go(id) })));
  }
  const actItems = () => [
    { key: 'act:refresh', t: '새로고침', ic: 'i-down', cap: 'r', run: () => { R.refresh(); R.emit('resort'); } },
    { key: 'act:pause', t: R.isPaused() ? '재개' : '일시정지', ic: R.isPaused() ? 'i-play' : 'i-pause', cap: 'p', run: () => R.setPaused(!R.isPaused()) },
    { key: 'act:theme', t: '테마 전환', s: '현재 ' + THEME_KO[S.theme], ic: 'i-gear', run: () => { S.theme = THEMES[(THEMES.indexOf(S.theme) + 1) % 3]; R.applySettings(); } },
    { key: 'act:kids', t: '하위 에이전트 보기', s: R.U.showKids ? '현재 켜짐' : '현재 꺼짐', ic: 'i-chev', run: () => { R.U.showKids = !R.U.showKids; R.save(); R.emit('resort'); } },
    { key: 'act:addsrv', t: '서버 추가', ic: 'i-server', run: () => AddServer.open({}) },
    ...(Room.canFlow() ? [{ key: 'act:flow', t: Room.flowOn ? '대화 보기' : '흐름 보기', s: '지시가 퍼지는 모양', ic: 'i-chev', cap: 'f', run: () => Room.toggleFlow() }] : []),
  ];
  function agentItems(q) {
    const out = [];
    for (const a of M.agents.values()) {
      const md = C.meta(a), chn = R.chName(a.ch);
      const sc = best(q, [[a.name, 3], [a.tool, 2], [md.model, 1.5], [chn, 2], [a.why, 1], [a.now, 1]]);
      if (sc >= 0) out.push({ key: 'a:' + a.key, sc, a, t: a.name, s: [chn, a.tool].filter(Boolean).join(' · '), kind: a.parent ? '하위' : '방' });
    }
    return out.sort((x, y) => y.sc - x.sc).slice(0, 8);
  }
  function build(raw) {
    const q = raw.toLowerCase().replace(/\s+/g, '');
    let g = [['이동', navItems()], ['동작', actItems()]];
    if (q) {
      g = g.map(([n, it]) => [n, it.map(x => { const sc = best(q, [[x.t, 1], [x.cap, 0.5]]); return { ...x, sc: sc >= 0 && x.t.toLowerCase().replace(/\s+/g, '').startsWith(q) ? sc + 100 : sc }; }).filter(x => x.sc >= 0).sort((a, b) => b.sc - a.sc)]);
      g.push(['방', agentItems(q)]);
      g = g.filter(x => x[1].length).sort((a, b) => b[1][0].sc - a[1][0].sc);     // best-matching group first
    }
    const flat = [];
    for (const [n, it] of g) { flat.push({ key: 'h:' + n, head: n }); for (const x of it) flat.push(x); }
    return flat;
  }

  // ---------- rendering ----------
  function mkRow(it) {
    const kind = it.key.split(':')[0];
    if (kind === 'h') return h('div.pal-h', { role: 'presentation' });
    const r = h('div.pal-r', { class: kind, role: 'option', id: 'pal-o' + (++uid), on: { click: () => run(it.key), mousemove: () => setSel(it.key, false) } },
      kind === 'a' ? C.glyph(it.a.st) : svgUse(it.ic, 'ic'), h('span.m', h('span.t'), h('span.s')), h('span.e'));
    return r;
  }
  function setRow(el, it) {
    if (it.head) return text(el, it.head);
    text(el.querySelector('.t'), it.t); if (it.ic && !it.a) attr(el.querySelector('use'), 'href', '#' + it.ic); attr(el.querySelector('.t'), 'title', it.t);
    text(el.querySelector('.s'), it.s || '');
    const e = el.querySelector('.e');
    if (it.a) { C.setGlyph(el.firstElementChild, it.a.st); text(e, it.kind); }
    else if (it.cap && !e.firstChild) e.append(C.kbd(it.cap));
    else if (it.cap) text(e.firstChild, it.cap);
    else text(e, '');
  }
  function render(scroll) {
    rows = build(input.value);
    const opts = rows.filter(r => !r.head);
    if (!opts.length) rows = [{ key: 'none', none: true }];
    keyed(list, rows, {
      key: r => r.key,
      create: r => r.none ? h('div.pal-none', '일치하는 항목이 없습니다') : mkRow(r),
      update: (el, r) => { if (!r.none) setRow(el, r); },
    });
    if (!opts.some(r => r.key === sel)) sel = opts[0] ? opts[0].key : '';
    paint(scroll);
  }
  function paint(scroll) {
    let act = null;
    for (const el of list.children) { const on = el.dataset.key === sel; if (el.getAttribute('role') === 'option') attr(el, 'aria-selected', on ? 'true' : 'false'); if (on) act = el; }
    attr(input, 'aria-activedescendant', act && act.id);
    if (scroll && act) { act.scrollIntoView({ block: 'nearest' }); if (act.previousElementSibling && !act.previousElementSibling.previousElementSibling) list.scrollTop = 0; }
  }
  function setSel(k, scroll) { if (sel === k) return; sel = k; paint(scroll); }
  function move(d) {
    const opts = rows.filter(r => !r.head && !r.none); if (!opts.length) return;
    const i = opts.findIndex(r => r.key === sel);
    setSel(opts[(i + d + opts.length) % opts.length].key, true);
  }
  function run(k, shift) {
    const it = rows.find(r => r.key === k); if (!it) return;
    close();
    if (it.a) R.openRoom(it.a.ch, it.a.id); else it.run();
  }

  // ---------- open / close ----------
  function open(m, q) {
    if (scrim) close();
    prev = document.activeElement; mode = m;
    scrim = h('div.pal-scrim', { class: m === 'sheet' ? 'sheet' : '', on: { mousedown: e => { if (e.target === scrim) close(); } } });
    scrim.addEventListener('wheel', e => { if (e.target === scrim) e.preventDefault(); }, { passive: false });
    if (m === 'pal') {
      input = h('input', { type: 'text', role: 'combobox', 'aria-label': '검색 또는 명령', placeholder: '검색 또는 명령…', autocomplete: 'off', spellcheck: 'false', 'aria-expanded': 'true', 'aria-controls': 'pal-list', 'aria-autocomplete': 'list' });
      list = h('div.pal-list#pal-list', { role: 'listbox', 'aria-label': '결과' });
      input.addEventListener('input', () => { sel = ''; render(true); });
      input.addEventListener('keydown', onKey);
      scrim.append(h('div.pal', { role: 'dialog', 'aria-modal': 'true', 'aria-label': '검색 또는 명령', on: { mousedown: e => { if (e.target !== input) e.preventDefault(); } } },   // focus never leaves the input
        h('div.pal-in', svgUse('i-search'), input), list,
        h('div.pal-foot', h('span', C.kbd('Esc'), '닫기'), h('span', '열기', C.kbd('↵')))));
      layer.append(scrim); input.value = q || ''; render(true); input.focus({ preventScroll: true });
    } else {
      const dlg = h('div.pal', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sheet-t' },
        h('div.sheet-h', h('span#sheet-t', '단축키'), h('button.ibtn', { type: 'button', 'aria-label': '닫기', on: { click: close } }, C.kbd('Esc'))),
        h('div.sheet-b', { tabindex: '-1' }, table().map(r => h('div.sheet-r', h('span', r.label), h('span.k', r.keys.map(k => C.kbd(k))))),
          h('div.sheet-g', '톡'), TALK_KEYS.map(([k, l]) => h('div.sheet-r', h('span', l), h('span.k', C.kbd(k)))),
          h('div.sheet-leg', '■ 터미널에서 입력한 것 · □ 에겐 톡에서 보낸 메시지')));
      scrim.append(dlg); layer.append(scrim); dlg.querySelector('.sheet-b').focus({ preventScroll: true });   // the scroller holds focus so arrows/PageDown scroll
    }
    addEventListener('keydown', trap, true);
  }
  function close() {
    if (!scrim) return;
    removeEventListener('keydown', trap, true);
    scrim.remove(); scrim = null; mode = null;
    if (prev && prev.isConnected) prev.focus({ preventScroll: true }); prev = null;
  }
  // while a dialog is open: keep Tab inside, and let nothing but Esc / ? / Ctrl+K reach the page's global keys
  function trap(e) {
    if (e.key === 'Tab') {
      e.preventDefault();
      if (mode === 'sheet') { const b = scrim.querySelector('button'); (document.activeElement === b ? scrim.querySelector('.sheet-b') : b).focus({ preventScroll: true }); }
      return;
    }
    if (e.key === 'Escape') return;
    if (mode === 'sheet' && (e.key === '?' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k'))) { e.preventDefault(); e.stopPropagation(); close(); if (e.key !== '?') open('pal'); return; }
    if (mode === 'sheet') { e.stopPropagation(); if (e.key.startsWith('Arrow') || e.key === ' ') return; }
  }
  function onKey(e) {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); if (sel) run(sel, e.shiftKey); }
  }

  R.onEsc(() => { if (!scrim) return false; close(); return true; });   // registered after P2 → runs first
  R.on('model', () => { if (mode === 'pal') render(false); });
  R.on('palette', () => (mode === 'pal' ? close() : open('pal')));
  R.key('?', () => (mode === 'sheet' ? close() : open('sheet')), '단축키');
  // screenshot / test overrides, like ?theme=: ?pal=data opens the palette with a query, ?sheet=1 the shortcut sheet
  let qs = new URLSearchParams(location.search);
  if (!qs.has('pal') && !qs.has('sheet')) qs = null;
  if (qs) R.on('model', () => { if (qs) { const q = qs; qs = null; open(q.has('sheet') ? 'sheet' : 'pal', q.get('pal')); } });
})();
