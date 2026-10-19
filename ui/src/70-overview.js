/* ===== 70-overview.js — the overview in the empty right pane (OVERVIEW-CONTRACT §3).
   배선 지도 (OvWire, 71) is the default; 재미 모드 = 픽셀 오피스 (OvOffice, 73; characters from window.AT_SPRITES, 72).
   Maps the live model (M.channels / M.roots / M.agents) into server → project → agent → subagent groups (project.key),
   owns mode/theme, the render loop (only while visible, not paused, document visible and recently focused), spatial arrow keys
   and the tooltip. All agent text goes through textContent. ===== */
const Overview = (() => {
  const { h, text, attr, cls, M, S, ST, on, $ } = R;
  const pempty = $('#pempty');
  const THEMES = [['claude', 'Claude 풍'], ['chatgpt', 'ChatGPT 풍'], ['gemini', 'Gemini 풍'], ['grok', 'Grok 풍'], ['muse', 'Muse 풍']];
  const TOOL = { claude: 'Claude Code', codex: 'Codex', agy: 'Antigravity CLI' };
  const ETC = '기타';
  if (!THEMES.some(t => t[0] === S.ovTheme)) S.ovTheme = 'claude';
  S.fun = S.fun === true;

  // ---------- pane skeleton ----------
  const turn = h('button.ov-turn', { type: 'button', title: '다음 안읽은 에이전트로', on: { click: () => focusNext() } });
  const sum = h('div.ov-sum');
  const segBtns = [['wire', '배선 지도'], ['office', '픽셀 오피스']].map(([v, l]) => h('button', { type: 'button', role: 'radio', data: { v }, on: { click: () => setFun(v === 'office') } }, l));
  const seg = h('div.seg.ov-seg', { role: 'radiogroup', 'aria-label': '오버뷰 보기' }, ...segBtns);
  seg.addEventListener('keydown', e => { const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 1, ArrowUp: -1 }[e.key]; if (!d) return; e.preventDefault(); const b = segBtns[(segBtns.indexOf(document.activeElement) + d + 2) % 2]; b.focus(); b.click(); });
  // 픽셀 오피스 크기 (S.ofcSize): − / + in the header while the office is shown; the same setting sits in 설정 › 화면
  const ZS = [['s', '작게'], ['m', '보통'], ['l', '크게']], zi = () => Math.max(0, ZS.findIndex(z => z[0] === S.ofcSize));
  // a step that would draw at the same scale as the current one is skipped (on a high-DPI pane 작게 can equal 보통): − / + always change the picture
  const zNext = d => { const st = typeof OvOffice !== 'undefined' && OvOffice.steps && OvOffice.steps(), cur = zi(); for (let i = cur + d; i >= 0 && i < ZS.length; i += d) if (!st || st[ZS[i][0]] !== st[ZS[cur][0]]) return i; return -1; };
  const zSync = () => { zDn.disabled = zNext(-1) < 0; zUp.disabled = zNext(1) < 0; };
  const zoom = d => { const i = zNext(d); if (i >= 0) { S.ofcSize = ZS[i][0]; R.applySettings(); } };
  const zDn = h('button.ov-zb', { type: 'button', 'aria-label': '픽셀 오피스 작게', title: '픽셀 오피스 크기 — 작게', on: { click: () => zoom(-1) } }, '−');
  const zUp = h('button.ov-zb', { type: 'button', 'aria-label': '픽셀 오피스 크게', title: '픽셀 오피스 크기 — 크게', on: { click: () => zoom(1) } }, '+');
  const zLbl = h('span.ov-zl', { 'aria-live': 'polite' });
  const zoomG = h('div.ov-zoom', { role: 'group', 'aria-label': '픽셀 오피스 크기', title: '픽셀 오피스 크기', hidden: true }, zDn, zLbl, zUp);
  const note = h('p.ov-note', { hidden: true });
  const body = h('div.ov-body', { role: 'group', 'aria-label': '에이전트 지도' });
  const root = h('section.ov', { 'aria-label': '오버뷰' }, h('header.ov-head', h('h2.t-title', '오버뷰'), turn, sum, zoomG, seg), note, body);
  const tip = h('div.ov-tip', { role: 'tooltip', hidden: true });

  // ---------- helpers ----------
  const reduced = () => document.documentElement.dataset.motion === 'reduce' || (S.motion !== 'full' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const dark = () => document.documentElement.classList.contains('dark');
  const active = st => st === 'work' || st === 'tool' || st === 'child';
  const projOf = a => a && a.project ? a.project : null;
  function label(n) {
    const p = n.p, sv = R.chan(n.ch);
    return n.name + ', ' + (TOOL[n.tool] || n.tool) + ', ' + ST[n.st] + (n.why ? ' (' + n.why + ')' : '') + (n.ack ? ', 읽음' : '') + ', 프로젝트 ' + (p ? p.name : ETC) + ', 서버 ' + (sv ? sv.name : n.ch) + (n.nKids ? ', 하위 ' + n.nKids + '개' : '');
  }
  function showTip(n, el) {
    const p = n.p, sv = R.chan(n.ch), g = h('div.tr');
    const row = (k, v) => g.append(h('span', k), h('b', v));
    row('상태', ST[n.st] + (n.why ? ' — ' + n.why : '') + (n.ack ? ' · 읽음' : ''));
    row('프로젝트', p ? p.name + (p.branch ? ' · ' + p.branch : '') : ETC);
    row('서버', sv ? sv.name + (sv.kind === 'local' ? ' (내 PC)' : '') : n.ch);
    if (n.parentName) row('부모', n.parentName);
    if (n.nKids) row('하위', n.nKids + '개');
    if (n.st === 'tool' && n.a.now) row('실행 중', n.a.now);
    tip.replaceChildren(h('div.tn', n.name), g);
    if (!tip.isConnected) $('#layer').append(tip);
    tip.hidden = false;
    const r = el.getBoundingClientRect(), t = tip.getBoundingClientRect();
    let x = r.right + 10, y = r.top;
    if (x + t.width > innerWidth - 8) x = Math.max(8, r.left - t.width - 10);
    if (y + t.height > innerHeight - 8) y = innerHeight - t.height - 8;
    tip.style.left = x + 'px'; tip.style.top = Math.max(8, y) + 'px';
  }
  const hideTip = () => { tip.hidden = true; };
  /* every agent control (wire card or office desk) is a real <button data-agent>: click/Enter opens the room */
  function bindAgent(el, getNode) {
    el.addEventListener('click', () => { const n = getNode(); if (n) { hideTip(); R.openRoom(n.ch, n.aid); } });
    el.addEventListener('mouseenter', () => { const n = getNode(); if (n) showTip(n, el); });
    el.addEventListener('mouseleave', () => { if (document.activeElement !== el) hideTip(); });
    el.addEventListener('focus', () => { const n = getNode(); if (n) showTip(n, el); });
    el.addEventListener('blur', hideTip);
  }
  // spatial arrow keys between agents (both views); Home/End
  body.addEventListener('keydown', e => {
    const d = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];
    if (!d && e.key !== 'Home' && e.key !== 'End') return;
    const els = [...body.querySelectorAll('[data-agent]')], cur = document.activeElement;
    if (!els.length || !els.includes(cur)) return;
    e.preventDefault(); e.stopPropagation();
    if (!d) return (e.key === 'Home' ? els[0] : els[els.length - 1]).focus();
    const r0 = cur.getBoundingClientRect(), cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
    let best = null, bs = Infinity;
    for (const el of els) {
      if (el === cur) continue;
      const r = el.getBoundingClientRect(), x = r.left + r.width / 2 - cx, y = r.top + r.height / 2 - cy, along = x * d[0] + y * d[1];
      if (along <= 2) continue;
      const sc = along + (Math.abs(x * d[1]) + Math.abs(y * d[0])) * 2.2;
      if (sc < bs) { bs = sc; best = el; }
    }
    if (best) { best.focus(); best.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  });
  function focusNext() {
    const els = [...body.querySelectorAll('[data-agent][data-w="1"]')];
    if (!els.length) return;
    const el = els[(els.indexOf(document.activeElement) + 1) % els.length];
    el.focus(); el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  // ---------- model → view (server → project → agent → subagent) ----------
  const seen = new Map();      // key -> {st, t}: when the state last changed (intros play from here)
  const talkSeen = new Map();  // key -> Set of talk msg ids (a new one flies a paper plane)
  let first = true;
  function node(a, pid, depth, parentName) {
    const now = performance.now();
    let s = seen.get(a.key);
    if (!s) seen.set(a.key, s = { st: a.st, t: -1e9 });
    else if (s.st !== a.st) { s.st = a.st; s.t = now; }
    const kids = a.kids.map(k => M.agents.get(k)).filter(k => k && !R.isHidden(k));   // tidied subagents go too
    // waiting = unread (red '!'); ack = a read wait (calm marker)
    return { key: a.key, id: a.key, ch: a.ch, aid: a.id, tool: a.tool, name: a.name, st: a.st, why: a.why, a, p: projOf(a), project: pid, server: a.ch, enteredPerf: s.t,
      waiting: R.needsMe(a), ack: R.isAcked(a), parentName, nKids: kids.length, kids: depth < 1 ? kids.map(k => node(k, pid, depth + 1, a.name)) : [],
      talk: a.msgs.some(m => m.kind === 'talk' && Date.now() - m.t < 1800e3) };
  }
  function build() {
    const servers = [], projects = [], roots = [], planes = [];
    for (const c of M.channels) {
      servers.push({ id: c.id, name: c.name, kind: c.kind, state: c.state === 'error' || c.stale || M.hubDown ? 'error' : c.state === 'connecting' ? 'connecting' : 'ok' });
      const byKey = new Map();
      for (const a of M.roots[c.id] || []) {
        if (R.isHidden(a)) continue;   // tidied away (정리): the whole tree goes with its root
        const p = projOf(a), k = p ? p.key || 'name:' + p.name : '';
        let pr = byKey.get(k);
        if (!pr) byKey.set(k, pr = { id: c.id + '|' + (k || '~'), server: c.id, name: p ? p.name : ETC, branch: p ? p.branch : '', key: k, root: p ? p.root : '', other: !p, agents: [] });
        pr.agents.push(a);
      }
      const list = [...byKey.values()].sort((x, y) => (x.other - y.other) || (x.name < y.name ? -1 : x.name > y.name ? 1 : 0));
      for (const pr of list) { projects.push(pr); for (const a of pr.agents) roots.push(node(a, pr.id, 0, '')); }
    }
    // a talk record that just arrived flies a paper plane to that desk (TALK: the transcript is the delivery proof)
    const walk = n => { const ids = talkSeen.get(n.key) || new Set(), fresh = n.a.msgs.filter(m => m.kind === 'talk' && !ids.has(m.id)); for (const m of fresh) { ids.add(m.id); if (!first && Date.now() - m.t < 120e3) planes.push(n); } talkSeen.set(n.key, ids); n.kids.forEach(walk); };
    roots.forEach(walk);
    for (const k of [...seen.keys()]) if (!M.agents.has(k)) { seen.delete(k); talkSeen.delete(k); }
    first = false;
    return { servers, projects, roots, planes };
  }

  // ---------- render ----------
  let D = null, mode = null;
  const officeOk = () => typeof OvOffice !== 'undefined' && OvOffice.available();
  function setFun(v) { S.fun = !!v; R.applySettings(); }
  // fan theme on the pane: the 픽셀 오피스 always wears it; the 배선 지도 wears it only under the 기본 palette, otherwise it is app chrome (palette tokens)
  const ovt = () => S.fun || R.palette() === 'default' ? S.ovTheme : '';
  const setOvt = () => { const t = ovt(); if (t) root.dataset.ovt = t; else delete root.dataset.ovt; };
  function header() {
    const n = M.waiting.length;
    text(turn, '안읽음 ' + n); turn.dataset.n = String(n); attr(turn, 'aria-disabled', n ? null : 'true');
    const c = {}; for (const a of M.agents.values()) if (!R.isHidden(a)) c[a.st] = (c[a.st] || 0) + 1;
    sum.replaceChildren(...['work', 'tool', 'child', 'idle', 'done'].filter(k => c[k]).map(k => h('span', C.glyph(k), ST[k] + ' ', h('b', String(c[k])))),
      h('span', '서버 ' + M.channels.filter(x => x.state === 'ok').length + '/' + M.channels.length + ' 연결'));
    segBtns.forEach(b => { const on_ = (b.dataset.v === 'office') === S.fun; attr(b, 'aria-checked', on_ ? 'true' : 'false'); b.tabIndex = on_ ? 0 : -1; });
    setOvt();
    text(zLbl, ZS[zi()][1]); zSync();
  }
  /* called by Room.renderEmpty (62) whenever no room is open; returns false while the model is not loaded (the loading card stays) */
  function render() {
    if (!M.loaded) return false;
    if (!root.isConnected) { pempty.append(root); }
    for (const el of pempty.children) if (el !== root) el.hidden = true;
    pempty.classList.add('has-ov');
    D = build(); header();
    const want = S.fun && officeOk() ? 'office' : 'wire';
    note.hidden = !(S.fun && want === 'wire');
    if (!note.hidden) text(note, '픽셀 오피스 캐릭터 스프라이트를 불러오지 못해 배선 지도로 보여 줍니다');
    zoomG.hidden = want !== 'office';
    if (mode !== want) { (mode === 'office' ? OvOffice : OvWire).unmount && (mode === 'office' ? OvOffice : OvWire).unmount(); body.replaceChildren(); mode = want; }
    if (!M.agents.size && !M.channels.length) { body.replaceChildren(h('p.ov-empty', '아직 서버가 없습니다 — 설정에서 서버를 추가하세요')); mode = null; return true; }
    (mode === 'office' ? OvOffice : OvWire).update(body, D, api);
    if (mode === 'office') { zSync(); for (const n of D.planes) OvOffice.plane(n); }
    else for (const n of D.planes) OvWire.flight(n);
    kick();
    return true;
  }
  function relayout() { if (mode && root.isConnected && D) { (mode === 'office' ? OvOffice : OvWire).update(body, D, api, true); if (mode === 'office') zSync(); kick(); } }

  // ---------- render loop: only while it can be seen ----------
  let raf = 0, last = -1e9, blurAt = 0;
  const visible = () => root.isConnected && !pempty.hidden && pempty.offsetParent !== null && R.params().view === 'chat' && !R.params().id;
  const running = () => mode && visible() && !R.isPaused() && document.visibilityState === 'visible' && !(blurAt && Date.now() - blurAt > 60000);
  function loop(t) {
    raf = 0;
    if (!running()) return;
    const rm = reduced();
    if (t - last >= (rm ? 1000 : mode === 'office' ? 33 : 40)) { last = t; (mode === 'office' ? OvOffice : OvWire).frame(t); }
    raf = requestAnimationFrame(loop);
  }
  function kick() { if (!raf && running()) { last = -1e9; raf = requestAnimationFrame(loop); } }
  document.addEventListener('visibilitychange', kick);
  addEventListener('focus', () => { blurAt = 0; kick(); });
  addEventListener('blur', () => { blurAt = Date.now(); setTimeout(kick, 61000); });
  on('pause', kick); on('route', () => { hideTip(); setTimeout(kick, 0); });
  on('hidden', () => { if (root.isConnected && M.loaded && visible()) render(); });   // 정리 / 다시 보기 takes effect at once, not at the next poll
  let prevSig = '';
  on('settings', () => { const sig = S.fun + S.ovTheme + S.ofcSize + R.palette() + dark() + reduced(); if (sig === prevSig) return; prevSig = sig; setOvt(); if (typeof OvOffice !== 'undefined') OvOffice.invalidate(); if (root.isConnected && M.loaded && visible()) render(); });
  new ResizeObserver(() => { if (visible()) relayout(); }).observe(pempty);

  const api = { label, bindAgent, reduced, dark, active, theme: () => S.ovTheme, kick };
  return { render, root, api, themes: THEMES, setFun, get mode() { return mode; } };
})();
