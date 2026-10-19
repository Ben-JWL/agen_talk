/* ===== 60-chatlist.js — the 채팅 view's room list (CHAT-UX §4): header block, chips, sections, keyed rows, held moves, keyboard.
   Rows are keyed by agent key and patched in place (PLAN §2). Agent strings only through textContent. ===== */
const ChatList = (() => {
  const { h, svgUse, text, attr, cls, keyed, M, U, S, on, emit, $ } = R;
  const rooms = $('#rooms'), lscroll = $('#lscroll'), chips = $('#chips'), search = $('#search'), sumtxt = $('#sumtxt'), sortw = $('#sortw'), warnln = $('#warnln'), lnote = $('#lnote'), lempty = $('#lempty'), newpill = $('#newpill'), chat = $('#chat');
  const SORTS = [['recent', '최근 순'], ['long', '오래 도는 순'], ['name', '이름 순']];
  const QUIET_N = 5, GHOST_MS = 600000, BASE_MS = 600000;
  let waitKeys = [], moreN = 0, q = '', fkey = null, firstFocus = true, lastScroll = 0, applyT = 0, pending = 0, visKeys = [], seenAgents = new Map(); const ghosts = new Map(), ordT = new Map(), waitAt = new Map(); let forceApply = false;
  const lt = a => C.lastT(a) || 0;
  const enc = R.openRoom;

  // ---------- unread / badges (CHAT-UX §2): red = waits for me and not yet viewed since its last signal; grey = new activity ----------
  function badgeOf(a, w) {
    const seen = R.U.seen[a.key], items = R.acts(a.key), t = lt(a), base = seen != null ? seen : Date.now() - BASE_MS;
    let n = 0; if (items.length) { for (let i = items.length - 1; i >= 0 && items[i].t > base; i--) n++; } else if (seen != null && t > seen) n = 1;   // ring is sorted: count from the end
    if (a.key === R.U.room && document.hasFocus()) n = 0;
    const open = a.key === R.U.room;
    // red: waits for me and is not yet seen since it started waiting / since anything new arrived (still pinned + glyph afterwards)
    return { red: w && !open && (seen == null || n > 0 || (waitAt.get(a.key) || 0) > seen), n };
  }

  // ---------- which rooms, in which order ----------
  const match = a => { if (!q) return true; const s = [a.name, a.why, a.now, a.last, a.meta, R.chName(a.ch)].join('\n').toLowerCase(); return s.includes(q); };
  const inFilter = a => U.chFilter === 'all' || a.ch === U.chFilter;
  const listed = a => !R.isHidden(a) && (!a.parent || R.needsMe(a) || U.showKids);
  const holding = () => !forceApply && (rooms.contains(document.activeElement) || Date.now() - lastScroll < 1200 || !document.hasFocus());
  const cmpBy = sort => sort === 'name' ? (x, y) => x.name.localeCompare(y.name, 'ko') || (x.key < y.key ? -1 : 1)
    : sort === 'long' ? (x, y) => (y.since == null ? -1 : y.since) - (x.since == null ? -1 : x.since) || lt(y) - lt(x) || (x.key < y.key ? -1 : 1)
    : (x, y) => (ordT.get(y.key) || 0) - (ordT.get(x.key) || 0) || (x.key < y.key ? -1 : 1);
  function plan() {
    const now = Date.now();
    for (const [k, a] of seenAgents) if (!M.agents.has(k) && !ghosts.has(k)) ghosts.set(k, { a, at: now });
    for (const [k, g] of ghosts) if (M.agents.has(k) || now - g.at > GHOST_MS) ghosts.delete(k);
    seenAgents = new Map(M.agents);
    const all = [...M.agents.values(), ...[...ghosts.values()].map(g => g.a)], gk = new Set(ghosts.keys());
    const counts = { all: 0 }; for (const a of all) if (listed(a)) { counts.all++; counts[a.ch] = (counts[a.ch] || 0) + 1; }
    const keys = new Set(all.map(a => a.key)); for (const k of ordT.keys()) if (!keys.has(k)) ordT.delete(k);
    for (const k of waitAt.keys()) if (!keys.has(k)) waitAt.delete(k);
    for (const a of all) { if (!gk.has(a.key) && R.needsMe(a)) { if (!waitAt.has(a.key)) waitAt.set(a.key, ordT.has(a.key) ? now : Math.min(R.waitT(a) || now, now)); } else waitAt.delete(a.key); }
    const hold = holding(); let moved = 0;
    for (const a of all) {   // 2.5 s tolerance: collector ages are whole seconds, so a quiet room's last-signal time jitters by up to 1 s
      const t = lt(a), o = ordT.get(a.key);
      if (o == null || (!hold && Math.abs(o - t) > 0)) ordT.set(a.key, t); else if (Math.abs(o - t) > 2500) { if (hold) moved++; else ordT.set(a.key, t); }
    }
    pending = hold ? moved : 0;
    const pool = all.filter(a => inFilter(a) && listed(a) && match(a));
    // 나를 기다림 = waits for me and not read yet (R.needsMe); a read wait sits with the quiet rooms, newest first, marked 읽음
    const wait = pool.filter(a => !gk.has(a.key) && R.needsMe(a)).sort(R.waitCmp), rest = pool.filter(a => gk.has(a.key) || !R.needsMe(a)), inRest = new Set(rest.map(a => a.key));
    const cmp = cmpBy(U.sort), roots = rest.filter(a => !(a.parent && inRest.has(a.parent) && !R.needsMe(M.agents.get(a.parent)))).sort(cmp), seq = [];
    const sectionOf = a => gk.has(a.key) || !R.LIVE.has(a.st) ? 'quiet' : 'work';
    const dfs = (a, sec) => { seq.push({ a, sec }); if (U.showKids) for (const k of a.kids.map(x => M.agents.get(x)).filter(x => x && inRest.has(x.key)).sort(cmp)) dfs(k, sec); };
    for (const a of roots) dfs(a, sectionOf(a));
    return { counts, wait, seq, gk, total: all.length, pool };
  }

  // ---------- keyed items ----------
  function mkItem(it) {
    if (it.room) { const el = C.roomRow(it.room); el.id = 'rm-' + (++uid); el.addEventListener('click', () => { fkey = el.dataset.key; R.openRoom(el._a.ch, el._a.id); }); return el; }
    if (it.sec) return h('div.sec', { role: 'presentation', class: 's-' + it.sec }, h('span.stt'), h('span.sn'),
      it.sec === 'wait' ? h('button.btn.link.ackall', { type: 'button', title: '지금 기다리는 방을 모두 읽음으로 표시합니다 — 새로 기다리기 시작하면 다시 알립니다', on: { click: e => { e.stopPropagation(); R.ack(waitKeys); } } }, '모두 읽음') : null);
    if (it.none) return h('div.secnone', { role: 'presentation' }, C.glyph('done'), h('span', '기다리는 것 없음'));
    return h('div');
  }
  let uid = 0;
  // server presets (first run / no ssh channel ok): one row per not-yet-added preset with [연결하기]
  const presetBox = h('div.presets', { hidden: true }, h('div.sec', { role: 'presentation' }, h('span.stt', '연결할 서버')), h('div.plist')); lscroll.append(presetBox);
  function renderPresets() {
    const ps = M.presets.filter(p => !p.added), noSsh = !M.channels.some(c => c.kind === 'ssh' && c.state === 'ok'), show = M.loaded && ps.length && noSsh;
    renderFirstRun(M.loaded && noSsh && !M.presets.length && lempty.dataset.k === 'none'); renderApp();
    presetBox.hidden = !show; if (!show) return;
    R.keyed(presetBox.lastChild, ps, { key: p => p.host + ':' + p.port, create: p => h('div.addrow.prerow', h('svg.ic', { 'aria-hidden': 'true' }, h('use', { href: '#i-server' })), h('b'), h('span.meta'), h('button.btn.sm.primary', { type: 'button', on: { click: e => { const q = e.currentTarget.closest('.prerow')._p; AddServer.open({ host: q.host, port: q.port, name: q.name }); } } }, '연결하기')), update: (el, p) => { el._p = p; text(el.querySelector('b'), p.name); text(el.querySelector('.meta'), p.host + (p.port !== 22 ? ':' + p.port : '')); } });
  }
  // 서버 추가 card: after the preset rows (connecting a listed server is the first action), only in the "no rooms yet" state
  const addRow = h('div.addrow', { role: 'button', tabindex: '0', hidden: true, on: { click: () => AddServer.open({}), keydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); AddServer.open({}); } } } },
    svgUse('i-server', 'ic'), h('b.addlbl', '＋ 서버 추가'), h('span.meta', '비밀번호를 한 번 입력하면 이 PC의 키로 등록됩니다')); lscroll.append(addRow);
  // first run without presets (APP-UX §3): import the company list (primary) or add by hand
  let frun = null;
  function renderFirstRun(show) {
    if (show && !frun) {
      const imp = Importer.make({ primary: true, block: true });
      frun = h('div.frun', h('div.sec', { role: 'presentation' }, h('span.stt', '연결할 서버')), imp.btn, imp.line, h('p.meta', '회사에서 받은 서버 목록 파일(.json)을 고르면 연결할 서버가 여기에 나타납니다'),
        h('button.btn.block.addman', { type: 'button', on: { click: () => AddServer.open({}) } }, '서버 추가'), h('p.meta', '주소와 계정을 직접 넣습니다 · 비밀번호는 한 번만'));
      lscroll.append(frun);
    }
    if (frun) frun.hidden = !show;
  }
  // WebView2 missing -> the page was opened in a browser app window (APP-UX §4)
  const appBn = h('div.appbn', { hidden: true }, h('b', '브라우저 창으로 열렸습니다 — WebView2 가 설치되지 않았습니다'), h('p.meta', 'Microsoft Edge WebView2 런타임을 설치하면 다음부터 전용 창으로 열립니다 · 이 창을 닫으면 2분 뒤 에겐 톡이 종료됩니다'),
    h('div.acts', h('a.btn.sm', { href: 'https://developer.microsoft.com/microsoft-edge/webview2/', target: '_blank', rel: 'noopener' }, '설치 페이지 열기'), h('button.btn.link', { type: 'button', on: { click: () => { U.wv2Dismissed = true; R.save(); renderApp(); } } }, '닫기')));
  lscroll.insertBefore(appBn, lnote);
  function renderApp() { appBn.hidden = !(M.app && M.app.mode === 'browser' && !U.wv2Dismissed); }
  on('app', renderApp);
  on('presets', () => { if (R.isPaused()) return; if (M.loaded) render(); });
  const moreBtn = h('button.more.btn.link', { type: 'button', hidden: true, on: { click: () => { U.quietOpen = !U.quietOpen; R.save(); render(); } } }); lscroll.insertBefore(moreBtn, lempty);
  // 정리: hide every finished room in one go (they come back by themselves when the session works or waits again)
  let tidyKeys = [], hiddenN = 0;
  const tidyBtn = h('button.more.tidy.btn.link', { type: 'button', hidden: true, title: '끝났거나 중단·끊긴 방을 목록과 오버뷰에서 숨깁니다', on: { click: () => R.hideRooms(tidyKeys) } });
  const unhideBtn = h('button.more.unhide.btn.link', { type: 'button', hidden: true, on: { click: () => R.unhideAll() } });
  lscroll.insertBefore(h('div.tidyrow', tidyBtn, unhideBtn), lempty);
  on('hidden', () => render());
  on('marks', () => { if (!R.isPaused() && M.loaded) { forceApply = true; render(); forceApply = false; } });   // 읽음 / 작업 완료 move the row at once
  function patchItem(el, it) {
    if (it.room) {
      const a = it.room, g = it.ghost, w = !g && R.needsMe(a), k = U.room === a.key;
      el._a = a; cls(el, 'ghost', !!g);
      C.setRoomRow(el, a, { scoped: U.chFilter !== 'all', badge: g ? null : badgeOf(a, w), long: U.sort === 'long', ghost: g ? it.gat : 0 });
      attr(el, 'aria-selected', k ? 'true' : 'false'); cls(el, 'active', a.key === fkey);
      attr(el, 'aria-label', a.name + ', ' + R.ST[a.st] + (!g && R.isAcked(a) ? ', 읽음' : '') + (el.querySelector('.bdg.on') ? ', ' + el.querySelector('.bdg').getAttribute('aria-label') : ''));
    } else if (it.sec) {
      text(el.querySelector('.stt'), it.title); const n = el.querySelector('.sn'); text(n, it.n); cls(n, 'red', it.sec === 'wait'); attr(el, 'aria-label', it.title + ' ' + it.n);
    }
  }

  // ---------- render ----------
  function render() {
    const P = plan(), items = []; moreN = 0;
    const wk = P.seq.filter(x => x.sec === 'work'), qt = P.seq.filter(x => x.sec === 'quiet');
    waitKeys = P.wait.map(a => a.key);   // 모두 읽음: what the 나를 기다림 section shows (current filter + search)
    if (P.wait.length) { items.push({ k: 'sec:wait', sec: 'wait', title: '나를 기다림', n: P.wait.length }); for (const a of P.wait) items.push({ k: a.key, room: a }); }
    else if (P.total) items.push({ k: 'none:wait', none: true });
    if (U.sort === 'long') { for (const x of P.seq) items.push({ k: x.a.key, room: x.a, ghost: P.gk.has(x.a.key), gat: (ghosts.get(x.a.key) || {}).at }); }
    else {
      if (wk.length) { items.push({ k: 'sec:work', sec: 'work', title: '진행 중', n: wk.length }); for (const x of wk) items.push({ k: x.a.key, room: x.a }); }
      if (qt.length) {
        items.push({ k: 'sec:quiet', sec: 'quiet', title: '조용함', n: qt.length });
        const shown = U.quietOpen ? qt : qt.slice(0, QUIET_N);
        for (const x of shown) items.push({ k: x.a.key, room: x.a, ghost: P.gk.has(x.a.key), gat: (ghosts.get(x.a.key) || {}).at });
        moreN = qt.length > QUIET_N ? qt.length - QUIET_N : 0;
      }
    }
    visKeys = items.filter(i => i.room).map(i => i.k);
    if (!visKeys.includes(fkey)) fkey = visKeys.includes(U.room) ? U.room : firstFocus && P.wait[0] ? P.wait[0].key : visKeys[0] || null;
    if (M.loaded) firstFocus = false;
    const anchor = (document.activeElement === rooms || rooms.contains(document.activeElement)) && fkey ? rooms.querySelector('[data-key="' + CSS.escape(fkey) + '"]') : null;
    R.keepScroll(lscroll, anchor, () => keyed(rooms, items, { key: i => i.k, create: mkItem, update: patchItem }));
    const ae = fkey && rooms.querySelector('[data-key="' + CSS.escape(fkey) + '"]'); attr(rooms, 'aria-activedescendant', ae ? ae.id : null);
    renderChrome(P); renderPresets(); moreBtn.hidden = !moreN; text(moreBtn, U.quietOpen ? '접기' : moreN + '개 더 보기');
    const scope = [...M.agents.values()].filter(a => inFilter(a));
    tidyKeys = scope.filter(a => R.canHide(a) && !R.isHidden(a)).map(a => a.key); hiddenN = scope.filter(a => R.isHidden(a)).length;
    tidyBtn.hidden = !tidyKeys.length; text(tidyBtn, '완료된 방 ' + tidyKeys.length + '개 정리');
    unhideBtn.hidden = !hiddenN; text(unhideBtn, '숨긴 방 ' + hiddenN + '개 다시 보기');
    attr(rooms, 'aria-busy', M.loaded ? null : 'true');
    cls(rooms, 'dimmed', !!M.hubDown);
    const np = pending > 0 && !M.hubDown; newpill.hidden = !np; if (np) text(newpill, '새 활동 ' + pending + ' ↑');
    if (np && !applyT) applyT = setTimeout(fireApply, 10000); else if (!np) { clearTimeout(applyT); applyT = 0; }   // armed once; user input re-arms it, a render does not
  }
  function fireApply() { applyT = 0; forceApply = true; render(); forceApply = false; }
  const touch = () => { if (applyT) { clearTimeout(applyT); applyT = setTimeout(fireApply, 10000); } };
  const mkChip = c => h('button.chip', { type: 'button', on: { click: () => setFilter(c.id) } }, h('span.cn', h('span.cnf')), h('span.cc'), h('span.indet', { 'aria-hidden': 'true' }));
  function setFilter(id) { U.chFilter = id; R.save(); render(); }
  function renderChrome(P) {
    const items = [{ id: 'all', name: '전체' }, ...M.channels];
    if (U.chFilter !== 'all' && !R.chan(U.chFilter)) U.chFilter = 'all';
    keyed(chips, items, { key: c => c.id, create: mkChip, update: (el, c) => {
      const on = U.chFilter === c.id, off = c.id !== 'all' && c.state === 'error', cn = c.id !== 'all' && c.state === 'connecting';
      text(el.querySelector('.cnf'), c.name); attr(el, 'title', c.name + (off ? ' — ' + (c.error || '연결 끊김').split('\n').pop() : ''));
      const cc = el.querySelector('.cc'); cc.replaceChildren(); if (off) cc.append(svgUse('i-off', 'gl off')); else text(cc, cn ? '연결 중…' : String(P.counts[c.id] || 0));
      attr(el, 'aria-pressed', on ? 'true' : 'false'); cls(el, 'off', off); cls(el, 'conn', cn); el.querySelector('.indet').hidden = !cn;
      attr(el, 'aria-label', c.name + (off ? ', 연결 끊김' : cn ? ', 연결 중' : ', 방 ' + (P.counts[c.id] || 0) + '개'));
    } });
    // summary / hub down / paused
    const ok = M.channels.filter(c => c.state === 'ok').length, bad = M.channels.filter(c => c.state === 'error').map(c => c.name);
    const mode = M.hubDown ? 'down' : R.isPaused() ? 'pause' : 'ok';
    if (!sumtxt.firstChild) sumtxt.append(svgUse('g-dead', 'gl hubic'), h('span.sm'), h('button.btn.link.retry', { type: 'button', on: { click: () => R.refresh() } }, '다시 시도'));
    const [ic, sm, rb] = sumtxt.children; ic.style.display = mode === 'down' ? '' : 'none'; rb.hidden = mode !== 'down';
    text(sm, mode === 'down' ? '허브에 연결할 수 없습니다 — 에겐 톡 창이 열려 있는지 확인하세요' : mode === 'pause' ? '일시정지 — p로 재개' : M.loaded ? '채널 ' + ok + '/' + M.channels.length + ' 연결' + (bad.length ? ' · ' + bad.join(', ') + ' 끊김' : '') : '불러오는 중…');
    cls(sumtxt, 'strong', mode !== 'ok'); cls(sumtxt, 'down', mode === 'down'); attr(sumtxt, 'title', sm.textContent);
    sortw.hidden = mode === 'down'; text(sortBtn.firstChild, SORTS.find(s => s[0] === U.sort)[1] + ' ▾'); sortWrap.hidden = false;
    // collector warnings (never hidden) for the channels in view
    const ws = M.channels.filter(c => U.chFilter === 'all' || c.id === U.chFilter).flatMap(c => (M.states[c.id] ? M.states[c.id].warnings : []).map(w => (U.chFilter === 'all' ? c.name + ': ' : '') + w));
    text(warnln, ws.join(' · ')); warnln.hidden = !ws.length; attr(warnln, 'title', ws.join('\n') || null);
    // banner for a broken / connecting channel
    const badCh = U.chFilter !== 'all' ? R.chan(U.chFilter) : M.channels.filter(c => c.state !== 'ok').length === 1 ? M.channels.find(c => c.state !== 'ok') : null;
    const bn = badCh && badCh.state !== 'ok' ? States.banner(badCh.id) : null;
    if (bn && bn.parentNode !== lnote) lnote.replaceChildren(bn); else if (!bn && lnote.firstChild) lnote.replaceChildren();
    // empty states (§6)
    const none = !M.loaded ? 'skel' : !P.total ? 'none' : !P.pool.length ? (q ? 'q' : 'ch') : '';
    if (none !== lempty.dataset.k) { lempty.dataset.k = none; lempty.replaceChildren(...emptyNodes(none)); }
    if (none === 'q') text(lempty.querySelector('p'), "'" + q + "'와 맞는 방이 없습니다 — 검색을 지우려면 Esc");
    if (none === 'ch') text(lempty.querySelector('p'), R.chName(U.chFilter) + '에는 실행 중인 에이전트가 없습니다');
    addRow.hidden = none !== 'none' || !M.presets.length || M.channels.some(c => c.kind === 'ssh' && c.state === 'ok'); text(addRow.querySelector('.addlbl'), M.presets.some(p => !p.added) ? '＋ 다른 서버 추가' : '＋ 서버 추가');
  }
  function emptyNodes(k) {
    if (k === 'skel') return [States.skeleton(6)];
    if (k === 'none') return [h('div.empty', h('b.t-section', '아직 대화가 없습니다'), h('p.meta', '에이전트가 시작되면 ' + S.interval + '초 안에 방이 생깁니다'))];
    return k ? [h('div.empty', h('p.meta'))] : [];
  }

  // ---------- sort menu (sort + 하위 에이전트 보기) ----------
  const sortWrap = sortw, sortBtn = h('button.sortbtn', { type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, h('span'));
  const menu = h('div.smenu', { role: 'menu', hidden: true });
  sortw.append(sortBtn, menu);
  for (const [v, l] of SORTS) menu.append(h('button', { type: 'button', role: 'menuitemradio', data: { v }, on: { click: () => { U.sort = v; R.save(); closeMenu(); render(); } } }, h('span.ck'), l));
  menu.append(h('hr'), h('button', { type: 'button', role: 'menuitemcheckbox', data: { v: 'kids' }, on: { click: () => { U.showKids = !U.showKids; R.save(); closeMenu(); render(); } } }, h('span.ck'), '하위 에이전트 보기'));
  function openMenu() { for (const b of menu.querySelectorAll('button')) { const k = b.dataset.v === 'kids' ? U.showKids : b.dataset.v === U.sort; attr(b, 'aria-checked', k ? 'true' : 'false'); text(b.firstChild, k ? '✓' : ''); } menu.hidden = false; attr(sortBtn, 'aria-expanded', 'true'); menu.querySelector('button').focus(); }
  function closeMenu(refocus = true) { if (menu.hidden) return false; menu.hidden = true; attr(sortBtn, 'aria-expanded', 'false'); if (refocus) sortBtn.focus(); return true; }
  sortBtn.addEventListener('click', () => (menu.hidden ? openMenu() : closeMenu()));
  menu.addEventListener('keydown', e => { const bs = [...menu.querySelectorAll('button')], i = bs.indexOf(document.activeElement); if (e.key === 'ArrowDown') bs[(i + 1) % bs.length].focus(); else if (e.key === 'ArrowUp') bs[(i - 1 + bs.length) % bs.length].focus(); else return; e.preventDefault(); });
  document.addEventListener('mousedown', e => { if (!menu.hidden && !sortw.contains(e.target)) closeMenu(false); });

  // ---------- interaction ----------
  newpill.addEventListener('click', () => { forceApply = true; render(); forceApply = false; lscroll.scrollTop = 0; });
  lscroll.addEventListener('scroll', () => { lastScroll = Date.now(); touch(); }, { passive: true });
  search.addEventListener('input', () => { q = search.value.trim().toLowerCase(); render(); });
  function move(to) {
    const i = visKeys.indexOf(fkey), n = to === 'home' ? 0 : to === 'end' ? visKeys.length - 1 : Math.max(0, Math.min(visKeys.length - 1, (i < 0 ? 0 : i) + to));
    if (visKeys[n] == null) return; fkey = visKeys[n]; render(); const el = rooms.querySelector('[data-key="' + CSS.escape(fkey) + '"]'); el && el.scrollIntoView({ block: 'nearest' });
  }
  rooms.addEventListener('keydown', e => {
    if (e.isComposing || e.keyCode === 229) return; touch();
    if (e.key === 'ArrowDown') move(1); else if (e.key === 'ArrowUp') move(-1); else if (e.key === 'Home') move('home'); else if (e.key === 'End') move('end');
    else if (e.key === 'Enter' && fkey) { const a = M.agents.get(fkey) || (ghosts.get(fkey) || {}).a; if (a) { R.openRoom(a.ch, a.id); } }
    else if (e.key === 'PageDown') lscroll.scrollBy(0, lscroll.clientHeight * .8); else if (e.key === 'PageUp') lscroll.scrollBy(0, -lscroll.clientHeight * .8); else return;
    e.preventDefault();
  });
  rooms.addEventListener('focus', () => { if (fkey) render(); });
  on('arrow', e => { if (R.params().view !== 'chat') return; e.preventDefault(); rooms.focus(); });
  on('resort', () => { forceApply = true; render(); forceApply = false; });
  function focusFirstWaiting() { const w = [...M.agents.values()].filter(a => R.needsMe(a) && inFilter(a)).sort(R.waitCmp)[0]; if (w) { fkey = w.key; render(); } rooms.focus(); }
  function step(d) {   // j / k: next / previous room inside the current filter + sort
    if (!U.room) return; const i = visKeys.indexOf(U.room), t = visKeys[i + d]; if (i < 0 || !t) return;
    const a = M.agents.get(t) || (ghosts.get(t) || {}).a; if (a) { fkey = t; R.openRoom(a.ch, a.id); }
  }
  for (let i = 1; i <= 9; i++) R.key(String(i), () => { const c = i === 1 ? { id: 'all' } : M.channels[i - 2]; if (c) { if (R.params().view === 'chat') setFilter(c.id); else R.openChannel(c.id); } }, i === 1 ? '전체' : '채널 ' + (i - 1));
  R.key('/', () => { if (R.params().view !== 'chat') R.go('chat'); search.focus(); search.select(); }, '검색');
  R.key('j', () => step(1), '다음 방'); R.key('k', () => step(-1), '이전 방'); R.key('.', focusFirstWaiting, '나를 기다림으로');
  // Esc, list part (CHAT-UX §7 order: palette → sort menu → search text → drawer → pane). The room handler calls this first.
  function esc() {
    if (closeMenu()) return true;
    if (search.value) { search.value = ''; q = ''; render(); return true; }
    if (document.activeElement === search) search.blur();
    return false;
  }
  on('route', () => { if (R.params().view === 'chat') { if (U.room) fkey = U.room; if (M.loaded) render(); } });
  on('hubview', () => { if (R.isPaused()) return; if (M.loaded || M.hubDown) render(); });
  on('pause', () => render());
  document.addEventListener('visibilitychange', () => { if (R.isPaused()) return; render(); }); addEventListener('focus', () => { if (R.isPaused()) return; forceApply = true; render(); forceApply = false; });
  const focusRow = () => { if (U.room) fkey = U.room; rooms.focus(); render(); };
  R.view('chat', { root: chat, show() { }, update() { render(); Room.update(); } });
  return { esc, render, focusRow, setFilter, badgeOf, visible: () => visKeys.slice() };
})();
