/* ===== 66-settings.js — 설정. Left mini-nav + inset groups (CHAT-UX §8). All writes: mutate R.S, then R.applySettings(). ===== */
(() => {
  const { h, text, attr, cls, S } = R;
  const SECTIONS = [['screen', '화면'], ['notify', '알림'], ['poll', '갱신'], ['chan', '채널'], ['keys', '단축키'], ['about', '정보']];
  const KIND = { ssh: 'ssh', local: '내 PC', argv: 'argv' };
  const chIcon = c => c.kind === 'local' ? 'i-desktop' : /cloud|클라우드/i.test(c.id + c.name) ? 'i-cloud' : 'i-server';   // same rule as 54-shell.js
  const sync = [];                       // fns that reflect R.S into the controls

  // radiogroup with roving tabindex + arrow keys. opts: [[value,label]]; get(): value ; set(v)
  function radios(label, opts, get, set, cls = 'seg') {
    const g = h('div', { class: cls, role: 'radiogroup', 'aria-label': label });
    const btns = opts.map(([v, l, extra]) => h('button', { type: 'button', role: 'radio', title: extra || null, 'aria-label': extra || null, data: { v }, on: { click: () => pick(v) } }, l));
    g.append(...btns);
    const pick = v => { set(v); R.applySettings(); };
    g.addEventListener('keydown', e => {
      const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]; if (!d) return;
      e.preventDefault(); const i = btns.indexOf(document.activeElement); const n = btns[(i + d + btns.length) % btns.length]; n.focus(); n.click();
    });
    sync.push(() => { const cur = get(); let any = false; btns.forEach(b => { const on = b.dataset.v === cur; any = any || on; attr(b, 'aria-checked', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; }); if (!any) btns[0].tabIndex = 0; });
    return { g, btns };
  }
  const FOR = new Set(['notify', 'badge', 'talk', 'interval', 'stall', 'long']);
  const row = (id, label, control, note) => h('div.srow', h('div.slab', h(FOR.has(id) ? 'label' : 'span', { id: 'l-' + id, for: FOR.has(id) ? id : null }, label), note && h('div.snote', { id: 'n-' + id }, note)), h('div.sctl', control));
  const select = (id, label, vals, unit, key) => {
    const s = h('select.sel', { id, 'aria-label': label, 'aria-describedby': 'n-' + id }, vals.map(v => h('option', { value: v }, v + unit)));
    s.addEventListener('change', () => { S[key] = +s.value; R.applySettings(); if (key === 'interval') R.refresh(); });
    sync.push(() => { if (s.value !== String(S[key])) { if (![...s.options].some(o => o.value === String(S[key]))) s.append(h('option', { value: S[key] }, S[key] + unit)); s.value = String(S[key]); } });
    return s;
  };
  function toggle(id, label, key, onChange) {
    const i = h('input', { type: 'checkbox', role: 'switch', id, 'aria-labelledby': 'l-' + id, 'aria-describedby': 'n-' + id });
    i.addEventListener('change', () => onChange ? onChange(i) : (S[key] = i.checked, R.applySettings()));
    sync.push(() => {
      if (key === 'notify' && S.notify && typeof Notification !== 'undefined' && Notification.permission === 'denied') { S.notify = false; denied.hidden = false; R.applySettings(); }
      i.checked = !!S[key];
    });
    return h('label.sw', i, h('i'));
  }

  // ---------- 알림 permission ----------
  const denied = h('div.snote.warn', { role: 'alert', hidden: true }, '브라우저에서 알림이 차단되어 있습니다 — 주소창 자물쇠에서 허용하세요');
  function setNotify(input) {
    denied.hidden = true;
    if (!input.checked) { S.notify = false; return R.applySettings(); }
    const fail = () => { input.checked = false; S.notify = false; denied.hidden = typeof Notification !== 'undefined' && Notification.permission !== 'denied'; R.applySettings(); };
    if (typeof Notification === 'undefined' || Notification.permission === 'denied') return fail();
    if (Notification.permission === 'granted') { S.notify = true; return R.applySettings(); }
    Promise.resolve(Notification.requestPermission()).then(p => p === 'granted' ? (S.notify = true, R.applySettings()) : fail(), fail);
  }

  // 톡 보내기 허용 (TALK-UX §7): the UI switch takes effect at once; the hub keeps its own switch (TALK-ENG §2.5), told best-effort
  function setTalk(input) {
    S.talkOn = input.checked; R.applySettings();
    R.apiPost('api/talk/setting', { on: S.talkOn }).catch(() => { });
  }

  // ---------- 채널 ----------
  function chanRow(c) {
    const el = h('li.crow', h('svg.cic', { 'aria-hidden': 'true' }, h('use')), h('div.cmain', h('div.cname', h('b', h('a', { href: '#/chat' })), ' ', h('span.meta.tgt')), h('div.verdict', h('span.vs'), R.timeEl(Date.now(), 'live', 'vt'), h('span.ve')), h('div.meta.cwarn', { hidden: true }), h('div.cbp', { hidden: true }, h('b.bpt', R.BADPERM.title), h('p.meta.bpb'), States.badperm())), h('div.cacts', h('button.btn.sm.primary.fix', { type: 'button', hidden: true, on: { click: () => AddServer.open({ ch: el.dataset.key }) } }, '이 서버에 키 등록하기'),
      h('button.btn.sm.retry', { type: 'button', title: '허브가 자동으로 다시 연결합니다 (최대 1분 간격). 이 버튼은 지금 한 번 확인합니다.', on: { click: () => R.refresh() } }, '지금 확인')));
    return el;
  }
  function setChanRow(el, c) {
    const tgt = KIND[c.kind] || KIND.ssh, st = R.M.states[c.id], warns = st ? st.warnings : [];
    const who = st && st.host && c.kind !== 'local' ? tgt + ' · ' + (st.user ? st.user + '@' : '') + st.host : tgt;
    el.firstElementChild.firstElementChild.setAttribute('href', '#' + chIcon(c));
    const a = el.querySelector('b a'); text(a, c.name); a.onclick = e => { e.preventDefault(); R.openChannel(c.id); }; text(el.querySelector('.tgt'), who === c.name ? '' : who);
    const v = el.querySelector('.verdict'), dead = c.state !== 'ok' && c.state !== 'connecting'; v.className = 'verdict ' + c.state;
    text(v.children[0], c.state === 'ok' ? '정상 연결' + (st && st.time ? ' · ' + st.time + ' 수집' : '') : c.state === 'connecting' ? '연결 중…' : '끊김' + (c.t ? ' · 마지막 수집 ' : ''));
    R.setTime(v.children[1], dead ? c.t : null, 'ago');
    text(v.children[2], dead && c.error ? ' — ' + c.error : '');
    const w = el.querySelector('.cwarn'); w.hidden = !warns.length; text(w, warns.join(' · '));
    const bpm = c.kind === 'ssh' && c.state === 'error' && R.sshKind(c.error) === 'badperm', bx = el.querySelector('.cbp'); bx.hidden = !bpm; if (bpm) text(bx.querySelector('.bpb'), R.sshHint(c.error));
    const fx = R.sshFix(c), rb = el.querySelector('.retry');
    el.querySelector('.fix').hidden = !fx; rb.hidden = c.state !== 'error'; cls(rb, 'link', fx); cls(rb, 'sm', !fx);
  }

  // ---------- 단축키 ----------
  // rows: [[keycap, ...], label] from the palette's Keymap (same table as the ? sheet)
  function keyRows() {
    const T = window.Keymap && window.Keymap.table && window.Keymap.table();
    return Array.isArray(T) ? T.map(r => [r.keys, r.label]) : [];
  }
  function setKeys(ul) {
    const rows = keyRows().filter(r => r[0] && r[0].length && r[1]), sig = JSON.stringify(rows);
    if (ul.dataset.sig === sig) return; ul.dataset.sig = sig;
    ul.replaceChildren(...rows.map(([k, l]) => h('li.krow', h('span', l), h('span.kk', k.map(x => h('kbd', String(x)))))));
  }

  R.view('settings', {
    mount(wrap) {
      const imp = Importer.make({ block: false }); this.imp = imp;
      const th = radios('테마', [['system', '시스템'], ['light', '라이트'], ['dark', '다크']], () => S.theme, v => S.theme = v);
      const mo = radios('움직임', [['system', '시스템'], ['reduce', '줄이기']], () => S.motion === 'reduce' ? 'reduce' : 'system', v => S.motion = v);
      const chList = h('ul.clist'), keyList = h('ul.klist'), preList = h('ul.plist'); this.preList = preList;
      chList.append(this.noSsh = h('li.meta', { hidden: true }, '아직 서버가 없습니다 — 서버 추가로 첫 서버를 등록하세요'));   // unkeyed: R.keyed leaves it alone
      this.chList = chList; this.keyList = keyList;
      const sec = (id, title, ...rows) => h('section.ssec', { id: 'set-' + id, 'aria-labelledby': 'h-' + id }, h('h2.t-section', { id: 'h-' + id }, title), ...rows);
      const main = h('div.card.smain',
        sec('screen', '화면',
          row('theme', '테마', th.g, '시스템을 고르면 Windows의 라이트/다크 설정을 따릅니다'),
          row('motion', '움직임', mo.g, '입력 중 점의 움직임과 패널·서랍 전환 애니메이션을 끕니다')),
        sec('notify', '알림',
          row('notify', 'Windows 알림', toggle('notify', 'Windows 알림', 'notify', setNotify), '입력 대기·응답 없음·중단됨·끊김으로 바뀔 때, 긴 프로세스가 끝날 때'),
          denied,
          row('badge', '창 제목 배지', toggle('badge', '창 제목 배지', 'titleBadge'), '탭 제목 앞에 나를 기다리는 에이전트 수를 (3)처럼 붙입니다'),
          row('talk', '톡 보내기 허용', toggle('talk', '톡 보내기 허용', 'talkOn', setTalk), '끄면 모든 방에서 보내기 칸이 사라집니다 — 지시 흐름 보기는 그대로입니다')),
        sec('poll', '갱신',
          row('interval', '갱신 주기', select('interval', '갱신 주기', [2, 3, 5, 10], '초', 'interval'), '바꾸면 바로 한 번 새로 고치고 이 주기로 다시 수집합니다'),
          row('long', '오래 도는 기준', select('long', '오래 도는 기준', [10, 30, 60], '분', 'longMin'), '이보다 오래 도는 에이전트를 강조하고, 긴 프로세스가 끝나면 알립니다')),
        h('section.ssec', { id: 'set-chan', 'aria-labelledby': 'h-chan' }, h('div.shd', h('h2.t-section', { id: 'h-chan' }, '채널'), h('span.shbtns', imp.btn, h('button.btn.primary.sm', { type: 'button', on: { click: () => AddServer.open({}) } }, '서버 추가'))), imp.line,
          this.chDesc = h('p.meta'), chList, preList),
        sec('keys', '단축키', keyList),
        sec('about', '정보',
          h('div.srow', h('div.slab', h('span', '버전')), h('div.sctl', this.ver = h('span.meta.sel-text'))),
          h('div.srow', { hidden: true }, h('div.slab', h('span', '로그'), h('div.snote.mono', { title: '' })), h('div.sctl', this.logBtn = h('button.btn.sm', { type: 'button', on: { click: () => this.openLog() } }, '폴더 열기')))));
      const links = SECTIONS.map(([id, l]) => h('a', { href: '#/settings', data: { id }, on: { click: e => { e.preventDefault(); this.go(id); } } }, l));
      const nav = h('nav.card.snav', { 'aria-label': '설정 구역' }, links);
      wrap.append(h('div.slayout', nav, main));
      this.links = links; this.main = main;
      this.scroller = wrap.parentNode;
      this.scroller.addEventListener('scroll', () => this.spy(), { passive: true });
    },
    go(id) {
      const s = R.$('#set-' + id, this.main); if (!s) return;
      s.scrollIntoView({ behavior: document.documentElement.dataset.motion === 'reduce' || matchMedia('(prefers-reduced-motion: reduce)').matches && S.motion !== 'full' ? 'auto' : 'smooth', block: 'start' });
      this.cur(id);
    },
    cur(id) { for (const a of this.links) attr(a, 'aria-current', a.dataset.id === id ? 'true' : null); },
    spy() {
      const top = this.scroller.getBoundingClientRect().top + 90; let id = SECTIONS[0][0];
      for (const [s] of SECTIONS) { const el = R.$('#set-' + s, this.main); if (el && el.getBoundingClientRect().top <= top) id = s; }
      if (this.scroller.scrollTop > 0 && this.scroller.scrollTop + this.scroller.clientHeight >= this.scroller.scrollHeight - 4) id = SECTIONS[SECTIONS.length - 1][0];
      this.cur(id);
    },
    about() {
      const a = R.M.app, web = !!a && a.mode === 'webview', sec_ = R.$('#set-about', this.main), nav = this.links[this.links.length - 1];
      sec_.hidden = !a; nav.hidden = !a;
      text(this.chDesc, web ? '서버 추가는 이 PC에 전용 키를 만들어 등록합니다. 포트·키 파일 같은 고급 설정은 설정 폴더의 channels.json 에서 고친 뒤 에겐 톡을 다시 시작하세요' : '서버 추가는 이 PC에 전용 키를 만들어 등록합니다. 포트·키 파일 같은 고급 설정은 channels.json(agen_talk.py 옆)에서 고친 뒤 에겐 톡을 다시 시작하세요');
      if (!a) return;
      text(this.ver, a.version ? '에겐 톡 ' + a.version : '—');
      const lr = this.logBtn.closest('.srow'); lr.hidden = !a.logdir; const note = lr.querySelector('.snote'); text(note, a.logdir); attr(note, 'title', a.logdir); this.logBtn.hidden = !web;
    },
    async openLog() {
      const b = this.logBtn; let r; try { r = await R.apiPost('api/open-logdir', {}); } catch { r = { ok: false }; }
      clearTimeout(b._t); text(b, r.ok ? '열었습니다 ✓' : '열지 못했습니다'); b._t = setTimeout(() => text(b, '폴더 열기'), 1500);
    },
    presets() {
      const ps = R.M.presets.filter(p => !p.added);
      R.keyed(this.preList, ps, { key: p => p.host + ':' + p.port, create: p => h('li.crow.prow2', h('svg.cic', { 'aria-hidden': 'true' }, h('use', { href: '#i-server' })), h('div.cmain', h('div.cname', h('b'), ' ', h('span.meta.tgt'))), h('div.cacts', h('button.btn.sm.primary', { type: 'button', on: { click: e => { const q = e.currentTarget.closest('li')._p; AddServer.open({ host: q.host, port: q.port, name: q.name }); } } }, '연결하기'))), update: (el, p) => { el._p = p; text(el.querySelector('b'), p.name); text(el.querySelector('.tgt'), p.host + (p.port !== 22 ? ':' + p.port : '')); } });
      this.preList.hidden = !ps.length;
    },
    show() { sync.forEach(f => f()); setKeys(this.keyList); this.spy(); if (!this.sub) { this.sub = R.on('settings', () => sync.forEach(f => f())); R.on('presets', () => this.presets()); R.on('app', () => this.about()); } },
    update(M) {
      this.presets(); this.about();
      R.keyed(this.chList, M.channels, { key: c => c.id, create: chanRow, update: setChanRow });
      this.noSsh.hidden = M.channels.some(c => c.kind === 'ssh');
      if (!M.channels.length) { if (!R.$('[data-key=_]', this.chList)) this.chList.append(h('li.meta', { data: { key: '_' } }, '채널이 없습니다 — channels.json을 확인하세요')); } else R.$('[data-key=_]', this.chList)?.remove();
    },
  });
})();
