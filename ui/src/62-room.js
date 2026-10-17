/* ===== 62-room.js — the conversation pane (CHAT-UX §5): header, timeline (acts + events), live tail, status bar, 세션 정보 drawer.
   One keyed list (#tl): date pills, bubbles, system lines, tail, processes card — patched in place, never rebuilt per poll. ===== */
const Room = (() => {
  const { h, svgUse, text, attr, cls, keyed, M, U, ST, on, timeEl, setTime, fmtHM, fmtAbs, fmtDur, $ } = R;
  const proom = $('#proom'), pempty = $('#pempty'), drawer = $('#drawer'), chat = $('#chat');
  const MAX = 200, GAP = 180000, EV = ['status', 'start', 'gone', 'proc-done'];
  const heldCopy = ' · 톡 승인 대기 — 터미널에서 승인하세요', noHistory = (ring, msgs, items = []) => !ring.length && !msgs.length && !items.some(x => x.kind === 'tmsg' || x.kind === 'spawn');
  const josa = w => { const c = w.charCodeAt(w.length - 1) - 0xAC00; return c >= 0 && c % 28 && c % 28 !== 8 ? '으로' : '로'; };
  const dayKey = ms => { const d = new Date(ms); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); };
  const dayLabel = ms => { const k = dayKey(ms), t = dayKey(Date.now()), y = dayKey(Date.now() - 864e5), d = new Date(ms); return k === t ? '오늘' : k === y ? '어제' : (d.getMonth() + 1) + '월 ' + d.getDate() + '일'; };
  const small = () => matchMedia('(max-width: 760px)').matches;
  const cache = new Map();                       // key -> last known agent (a session that disappeared keeps its room)
  let key = null, a = null, prevIds = new Set(), lastId = null, opening = true, tailOk = false, wantFocus = false, sawAgent = false;

  // ---------- skeleton of the pane ----------
  const ptitle = h('h2.t-title.ptitle'), pmeta = h('div.pmeta.meta'), crumb = h('a.crumb.lnk', { href: '#/chat' }), back = h('button.back.btn.link', { type: 'button', on: { click: () => R.closeRoom() } }, '‹ 목록');
  const lkKids = h('button.lnk.hk', { type: 'button', on: { click: () => { setDrawer(true); const s = $('.dsec.kids', drawer); s && s.scrollIntoView({ block: 'start' }); } } }), lkPar = h('button.lnk.hp', { type: 'button' });
  const info = h('button.ibtn.info', { type: 'button', 'aria-pressed': 'false', 'aria-label': '세션 정보', title: '세션 정보 (i)', on: { click: () => setDrawer(!U.drawer) } }, svgUse('i-info'));
  const av = C.avatar(null);
  const segB = ['대화', '흐름'].map((l, i) => h('button', { type: 'button', 'aria-pressed': i ? 'false' : 'true', 'aria-keyshortcuts': i ? 'f' : null, title: i ? '흐름 보기 (f)' : null, on: { click: () => R.setFlow(!!i) } }, l));
  const seg = h('div.seg.fseg', { role: 'group', 'aria-label': '보기', hidden: true }, ...segB);   // 대화 | 흐름 (TALK-UX §4): only when the room's tree has children
  const phead = h('header.phead', back, crumb, h('div.hrow', av, h('div.htxt', ptitle, pmeta), h('div.hlinks', seg, lkKids, lkPar, info)));
  const tl = h('div#tl', { role: 'log', 'aria-live': 'polite', 'aria-relevant': 'additions', tabindex: '-1', 'aria-label': '대화' }), tlin = h('div.tlin');
  tl.append(tlin);
  const newmsg = h('button.newmsg', { type: 'button', hidden: true, on: { click: () => { tl.scrollTop = tl.scrollHeight; newmsg.hidden = true; } } }, '새 메시지 ↓');
  // status bar (replaces the composer)
  const sGl = C.glyph('idle'), sLbl = h('b.slbl'), sTime = timeEl(Date.now(), 'live', 'rel'), sWhy = h('span.swhy'), sMsg = h('span.smsg'), sTalk = h('span.stalk');
  const bInfo = h('button.btn.binfo', { type: 'button', on: { click: () => setDrawer(!U.drawer) } }, '세션 정보');
  const bTerm = h('button.btn.primary.bterm', { type: 'button', 'aria-keyshortcuts': 'c', on: { click: () => copyTerm() } }, '터미널 명령 복사');
  const bAgain = h('button.btn.bagain', { type: 'button', on: { click: () => R.refresh() } }, '다시 시도');
  sTime.setAttribute('aria-hidden', 'true');
  const sbar = h('footer#sbar', { role: 'status', 'aria-live': 'polite' }, h('div.sleft', sGl, ' ', sLbl, h('span.sdot', ' · '), sTime, sWhy, sTalk, sMsg), h('div.sright', bAgain, bInfo, bTerm));
  proom.append(phead, h('div.tlwrap', tl, newmsg, Flow.el), h('div#foot', sbar, Talk.el));   // footer = status row + composer row (one block)
  const foot = $('#foot'); new ResizeObserver(() => document.body.style.setProperty('--foot-h', foot.offsetHeight + 'px')).observe(foot);
  let flowOn = false;

  // ---------- timeline items ----------
  const toolN = x => { const m = / ×(\d+)$/.exec(x); return m ? +m[1] : 1; };
  function items() {
    const L = [], ring = R.acts(key), evs = M.events.filter(e => e.key === key && EV.includes(e.type));
    for (const x of ring) L.push({ id: 'a|' + x.k + '|' + x.t + '|' + (x.k === 'tool' ? R.toolBase(x.x) : x.x), t: x.t, kind: x.k, x: x.x });
    for (const e of evs.slice().reverse()) L.push({ id: 'e|' + e.id, t: e.t, kind: e.type, e });
    const lastK = ring.length ? ring[ring.length - 1].k : '';   // a room that waits always ends in its question, even when the collector sent no ask act
    if (a && a.st === 'user' && lastK !== 'ask' && !/^답변 끝남/.test(a.why || '') && (a.now || a.why)) L.push({ id: 'syn|ask', t: Math.max(R.waitT(a) || Date.now(), ring.length ? ring[ring.length - 1].t : 0) + 1, kind: 'ask', x: a.now || a.why });
    if (a && R.isDead(a.ch)) { const c = R.chan(a.ch), st = M.states[a.ch]; L.push({ id: 'stale', t: Infinity, kind: 'stale', x: (c && c.t ? fmtHM(c.t) : st && st.time ? st.time.slice(0, 5) : '') + ' 이후 수집 안 됨 — ' + (M.hubDown ? '허브에 연결할 수 없습니다' : c && c.kind === 'ssh' ? 'SSH 연결이 끊겼습니다' : '수집 오류') }); }
    if (!a && sawAgent) L.push({ id: 'miss', t: Infinity, kind: 'miss', x: '세션 정보를 가져오지 못했습니다 — 터널 끊김 / 세션 종료 / 권한' });
    Talk.collect(key, a, L);   // talk cards, spawn bodies, fan-out line; drops what a card replaces
    if (a && noHistory(ring, R.msgs(key), L)) {
      L.push({ id: 'note', t: -Infinity, kind: 'note', x: '이 세션은 활동 기록을 제공하지 않습니다 (' + a.tool + ') — 현재 상태만 보입니다' });
      if (a.last) L.push({ id: 'syn|done', t: a.lastAt != null ? a.lastAt : 0, kind: 'done', x: a.last, notime: true });
    }
    L.sort((p, q) => p.t - q.t);
    let cut = null; if (L.length > MAX) { cut = L.length - MAX; L.splice(0, cut); }
    const out = [], lastAsk = L.map(x => x.kind).lastIndexOf('ask');
    if (cut) out.push({ id: 'trunc', kind: 'trunc', x: '이전 활동 ' + cut + '개는 표시하지 않습니다' });
    let day = 0, prev = null;
    L.forEach((it, i) => {
      if (Number.isFinite(it.t) && it.t > 0 && dayKey(it.t) !== day) { day = dayKey(it.t); out.push({ id: 'd|' + day, kind: 'date', t: it.t }); prev = null; }
      if (it.kind === 'ask') it.resolved = L.slice(i + 1).some(y => y.kind === 'user' || y.kind === 'done' || y.kind === 'tool');
      const sys = ['err', 'status', 'start', 'gone', 'proc-done', 'note', 'stale', 'miss', 'fan'].includes(it.kind);
      it.sys = sys; it.who = sys ? '' : it.kind === 'user' || it.kind === 'talkme' ? 'me' : 'ag';
      if (!it.spk) it.spk = it.who === 'me' ? 'me' : key;   // speaker: a group = same side + same speaker within GAP
      it.first = !sys && !(prev && prev.who === it.who && prev.spk === it.spk && it.t - prev.t < GAP);
      if (prev && !sys && prev.who === it.who && prev.spk === it.spk && !it.first) prev.last = false;
      it.last = !sys; prev = sys ? null : it; out.push(it);
    });
    // live tail: typing bubble + processes card
    if (a && R.LIVE.has(a.st) && !R.isDead(a.ch)) {
      const lp = prev && prev.who === 'ag' && prev.spk === key, gap = lp && Date.now() - prev.t < GAP;
      out.push({ id: 'tail', kind: 'tail', who: 'ag', spk: key, first: !gap, last: false, sys: false });
      if (a.procs.length) out.push({ id: 'procs', kind: 'procs', who: 'ag', spk: key, first: false, last: false, sys: false });
    }
    return out;
  }
  const bub = (cls_, ...k) => h('div.bub', { class: cls_ }, ...k);
  function mkItem(it) {
    const k = it.kind;
    if (k === 'date') return h('div.dpill', h('span'));
    if (it.sys) return h('div.sysl', { role: 'note' }, h('span.sg'), h('span.stx'), k === 'fan' ? h('button.btn.link', { type: 'button', on: { click: () => R.setFlow(true) } }, '(흐름에서 보기)') : null);
    if (k === 'trunc') return h('div.sysl', h('span.stx'));
    let body;
    if (k === 'user') body = bub('user', h('span.sr', '나: '), h('span.tx'));
    else if (k === 'say') body = bub('say', h('span.tx'));
    else if (k === 'tool') body = bub('tool', C.glyph('tool', 'tg'), h('span.tnm'), h('span.to.mono'), h('span.tcnt.chip'));
    else if (k === 'done') body = bub('done', C.glyph('done'), h('span.tx'));
    else if (k === 'ask') body = h('div.bub.askw', C.askBubble(false));
    else if (k === 'tmsg' || k === 'talkme') body = Talk.mkBody(it);
    else if (k === 'spawn') body = bub('spawn', h('div.sp1', h('span.meta', '↳ 하위 에이전트 시작'), h('b.spn'), h('span.chip.spx', '⇢ 다른 프로세스')), spawnBody(), h('div.sp2', h('span.sps'), h('button.btn.sm.spo', { type: 'button', on: { click: e => { const c = e.currentTarget._kid; c && R.openRoom(c.ch, c.id); } } }, '방 열기 ›')), h('div.mono.spc'));
    else if (k === 'tail') body = h('div.bub.typing', { 'aria-hidden': 'true' }, h('span.dots', h('i'), h('i'), h('i')), h('span.dots-st', '…'), h('span.tx'), h('span.tsep', ' · '), timeEl(Date.now(), 'live', 'rel'));
    else if (k === 'procs') body = h('div.pcard', h('div.ph.meta'), h('div.prs'), h('div.pm.meta'));
    const msg = h('div.msg', { class: it.who }, it.who === 'ag' ? C.avatar(null) : null, h('div.col', k === 'tmsg' ? Talk.mkWho() : null, body), h('span.tm'));
    if (k === 'tail') msg.append(h('span.sr', { 'aria-live': 'off' }));
    return msg;
  }
  function spawnBody() { const tb = C.clampBody(2); return [h('div.spe', { hidden: true }, h('span.flk', { role: 'img', 'aria-label': '암호화됨' }, svgUse('i-lock')), tb), h('div.tf', h('span.tfr', C.clampBtn(tb)))]; }   // the parent's instruction, absorbed into the spawn card
  function findKid(x) { if (!a) return null; const ks = a.kids.map(k => M.agents.get(k)).filter(Boolean); return ks.find(c => c.name === x) || ks.find(c => x && (c.name.includes(x) || x.includes(c.name))) || null; }
  function patch(el, it) {
    const k = it.kind;
    if (k === 'date') return text(el.firstChild, dayLabel(it.t));
    if (it.sys || k === 'trunc') {
      const g = el.querySelector('.sg'), tx = el.querySelector('.stx'); let t = '', st = null;
      if (k === 'status') { st = it.e.to; t = fmtHM(it.e.t) + ' · ' + ST[it.e.to] + josa(ST[it.e.to]) + ' 바뀜'; }
      else if (k === 'err') { st = a && a.st === 'dead' ? 'dead' : 'stopped'; t = (a && a.st === 'dead' ? '끊김' : '⊗ 중단됨') + ' — ' + it.x; }
      else if (k === 'start') t = fmtHM(it.e.t) + ' · 세션 시작'; else if (k === 'gone') t = fmtHM(it.e.t) + ' · 세션 사라짐 (호스트 프로세스 없음)';
      else if (k === 'proc-done') t = '프로세스 끝남 · ' + R.str(it.e.cmd, 48) + ' · ' + fmtDur(it.e.dur);
      else t = it.x;
      if (g) { if (st) { g.replaceChildren(g._st === st ? g.firstChild : C.glyph(st)); g._st = st; } else { g.replaceChildren(); g._st = ''; } }
      text(tx, t); attr(el, 'title', it.e ? fmtAbs(it.e.t) : null); return;
    }
    cls(el, 'first', it.first); cls(el, 'last', it.last); cls(el, 'dimmed', !a);
    const tm = el.querySelector('.tm'); if (tm) { text(tm, it.last && it.t && !it.notime && Number.isFinite(it.t) ? fmtHM(it.t) : ''); attr(tm, 'title', it.last && Number.isFinite(it.t) && !it.notime ? fmtAbs(it.t) : null); }
    const av_ = el.querySelector('.av');
    if (av_) {
      cls(av_, 'ghostav', !it.first);
      if (it.first) {   // the speaker's own avatar: the room agent, or the parent / child / other session that said it
        const sp = it.spk !== key ? it.sp || M.agents.get(it.spk) : a;
        if (sp) { C.setAvatar(av_, sp); cls(av_, 'gen', false); } else if (it.spk !== key) { C.setAvatar(av_, { tool: 'claude', st: 'idle', parent: null }); cls(av_, 'gen', true); attr(av_, 'title', it.m && it.m.kind === 'talk' ? '확인되지 않은 보낸이' : '다른 claude 세션'); }
      }
    }
    if (k === 'user' || k === 'say' || k === 'done') text(el.querySelector('.tx'), it.x);
    else if (k === 'tool') { const n = toolN(it.x), p = C.parseAct(it.x.replace(/ ×\d+$/, '')); text(el.querySelector('.tnm'), p.name || '도구'); text(el.querySelector('.to'), p.obj); attr(el.querySelector('.to'), 'title', p.obj); const c = el.querySelector('.tcnt'); text(c, n > 1 ? '×' + n : ''); c.hidden = n < 2; }
    else if (k === 'ask') { const cmd = C.isCmd(it.x), head = cmd || /승인/.test(it.x) ? '승인 요청' : '질문'; C.setAsk(el.querySelector('.ask'), { head, body: it.x, mono: cmd, cmd: cmd ? it.x.slice(2) : head === '승인 요청' ? it.x : '', meta: '터미널 창에서 답하세요 · 에겐 톡은 읽기 전용입니다', resolved: it.resolved }); }
    else if (k === 'spawn') patchSpawn(el, it);
    else if (k === 'tmsg' || k === 'talkme') Talk.patch(el, it, key, a);
    else if (k === 'tail') patchTail(el);
    else if (k === 'procs') patchProcs(el);
  }
  function patchSpawn(el, it) {
    const c = findKid(it.x), cross = !!c && Detail.isCross(c), cmd = c && cross ? Detail.spawnCmd(c, a) : '';
    text(el.querySelector('.spn'), it.x); el.querySelector('.spx').hidden = !cross;
    const s = el.querySelector('.sps'), o = el.querySelector('.spo'); o._kid = c; o.hidden = !c;
    if (!c) { s.replaceChildren('(끝남)'); s._k = ''; }
    else { if (s._k !== 'k') { s.replaceChildren(C.glyph(c.st), h('span.sl'), ' · ', timeEl(Date.now(), 'live', 'rel')); s._k = 'k'; } C.setGlyph(s.firstChild, c.st); text(s.querySelector('.sl'), ST[c.st]); R.setTimeFor(s.querySelector('.rel'), R.LIVE.has(c.st) || c.st === 'user' || c.st === 'stall' ? (c.t0 != null ? c.t0 : c.lastAt) : c.lastAt, R.LIVE.has(c.st) ? 'live' : 'ago', c.ch); }
    const tb = el.querySelector('.tb'), m = it.msg, sw = el.querySelector('.spe'); sw.hidden = !m;
    if (m) { cls(tb, 'enc', m.encrypted); sw.firstChild.hidden = !m.encrypted; C.setClamp(tb, m.id, m.encrypted ? '암호화된 지시 — 내용은 codex만 읽을 수 있습니다' : m.text, 2); }
    const sc = el.querySelector('.spc'); sc.hidden = !cmd; text(sc, cmd); attr(sc, 'title', cmd || null);
  }
  function patchTail(el) {
    const nd = C.nowDoing(a), t = [nd.verb, nd.obj].filter(Boolean).join(' ');
    text(el.querySelector('.typing .tx'), t); attr(el.querySelector('.typing .tx'), 'title', t);
    setTime(el.querySelector('.rel'), a.t0 != null ? a.t0 : a.lastAt, 'live'); text(el.lastChild, '작업 중: ' + t);
  }
  function patchProcs(el) {
    text(el.querySelector('.ph'), '실행 중 프로세스 ' + a.procs.length);
    const shown = a.procs.slice(0, 3), box = el.querySelector('.prs');
    keyed(box, shown, { key: p => p.pid, create: p => C.procRow(p, a), update: (e, p) => C.setProcRow(e, p, a) });
    const pm = el.querySelector('.pm'); text(pm, a.procs.length > 3 ? (a.procs.length - 3) + '개 더 — 세션 정보에서' : ''); pm.hidden = a.procs.length <= 3;
  }

  // ---------- render ----------
  const near = () => tl.scrollHeight - tl.scrollTop - tl.clientHeight < 80;
  function renderTimeline() {
    const L = items(), first = opening, fresh = L.filter(i => !prevIds.has(i.id) && i.kind !== 'date');
    const lay = first || fresh.length > 0, was = lay ? near() : false;   // layout is read only when something was added: a quiet poll forces no reflow
    keyed(tlin, L, { key: i => i.id, create: mkItem, update: patch });
    C.measure(tlin);
    prevIds = new Set(L.map(i => i.id)); lastId = L.length ? L[L.length - 1].id : null;
    if (first) {   // a reader who scrolled up comes back to the same place; the pill only when something arrived since (ids, not counts: the list is capped)
      const sv = R.A.scroll[key], up = !!sv && !sv.bottom;
      tl.scrollTop = up ? sv.top : tl.scrollHeight; opening = false; newmsg.hidden = !(up && sv.last !== lastId && !near());
    } else if (fresh.length) { if (was) tl.scrollTop = tl.scrollHeight; else if (fresh.some(i => !i.sys || i.kind === 'status')) newmsg.hidden = false; }
    if (lay) R.A.scroll[key] = { top: tl.scrollTop, bottom: near(), last: lastId };
  }
  tl.addEventListener('scroll', () => { if (!key) return; const b = near(); if (b) newmsg.hidden = true; R.A.scroll[key] = { top: tl.scrollTop, bottom: b, last: lastId }; }, { passive: true });

  // terminal command: nothing agent-derived is pasted unless it is plain path characters (a hostile cwd must not become shell syntax)
  const termCmd = x => {
    const md = C.meta(x), c = R.chan(x.ch); if (!c) return '';
    const cwd = md.cwd && C.safeCwd.test(md.cwd) ? md.cwd : '';
    if (c.kind === 'local') return cwd ? 'cd ' + cwd : '';
    const pi = (c.args || []).indexOf('-p'), pn = Number.isInteger(c.port) ? c.port : pi >= 0 && /^\d{1,5}$/.test(String(c.args[pi + 1])) ? +c.args[pi + 1] : 22;   // in-app servers carry `port`, not '-p' in args
    const port = pn !== 22 ? '-p ' + pn + ' ' : '', host = String(c.ssh || '');
    return /^[\w.@%+-]+$/.test(host) ? 'ssh ' + port + host + " -t 'cd " + (cwd || '~') + "; exec $SHELL'" : '';
  };
  function copyTerm() { const c = a && termCmd(a); if (c) C.copy(c, bTerm, '터미널 명령 복사'); }
  function renderHead(a) {
    const md = C.meta(a), par = a.parent && M.agents.get(a.parent), subs = Detail.subtree(a);
    C.setAvatar(av, a); text(ptitle, a.name); attr(ptitle, 'title', a.name);
    const mtxt = [a.tool, md.model, R.chName(a.ch), md.pid && (/^\d+$/.test(md.pid) ? 'pid ' + md.pid : md.pid), md.cwd].filter(Boolean).join(' · '); text(pmeta, mtxt); attr(pmeta, 'title', a.meta || null);
    crumb.hidden = !par; if (par) { text(crumb, '‹ ' + par.name); attr(crumb, 'href', '#/chat/' + encodeURIComponent(par.ch) + '/' + encodeURIComponent(par.id)); }
    lkKids.hidden = !subs.length; text(lkKids, '하위 ' + subs.length + ' ›');
    lkPar.hidden = !par; text(lkPar, '부모 ›'); lkPar.onclick = () => par && R.openRoom(par.ch, par.id);
    cls(phead, 'child', !!par);
  }
  function renderBar() {
    const c = R.chan(key.split(':')[0]), dead = !!a && R.isDead(a.ch), down = !!M.hubDown, alt = down || dead || !a, w = !!a && R.isWaiting(a);
    sbar.classList.toggle('alt', alt); cls(sbar, 'is-wait', w && !alt);
    for (const el of [sGl, sLbl, sTime, sWhy, sbar.querySelector('.sdot')]) el.hidden = alt; if (alt) text(sTalk, ''); sGl.style.display = alt ? 'none' : '';
    bAgain.hidden = !alt; text(bAgain, down || !a ? '다시 시도' : '지금 확인'); bTerm.hidden = !a || down || !termCmd(a); bInfo.hidden = !a;
    text(sMsg, down ? '허브에 연결할 수 없습니다' : !a ? '세션 정보를 가져오지 못했습니다' : dead ? '마지막 수집 ' + (c && c.t ? fmtHM(c.t) : '—') + ' 기준 · ' + (c && c.kind === 'ssh' ? 'SSH 연결이 끊겼습니다' : '수집 오류') : '');
    if (alt) return;
    C.setGlyph(sGl, a.st); text(sLbl, ST[a.st]);
    const mode = a.st === 'stall' ? 'quiet' : R.LIVE.has(a.st) || a.st === 'user' ? 'live' : 'ago', t = a.st === 'stall' || a.st === 'user' ? R.waitT(a) : R.LIVE.has(a.st) ? (a.t0 != null ? a.t0 : a.lastAt) : a.lastAt;
    R.setTimeFor(sTime, t || null, mode, a.ch); cls(sTime, 'warn', a.st === 'stall');
    const why = a.st === 'child' ? C.nowDoing(a).verb : a.why; text(sWhy, why ? ' — ' + why : ''); attr(sWhy, 'title', why || null);
    const tn = Talk.note(key); text(sTalk, tn === 'held' ? heldCopy : tn ? ' · 잠시 뒤에 보낼 수 있습니다' : ''); cls(sTalk, 'calm', tn === 'wait'); sWhy.hidden = !!tn;   // a talk of mine waits at that terminal / the hub asked me to slow down
  }

  // ---------- drawer ----------
  const D = {};
  function buildDrawer() {
    const row = (l, n, ...k) => h('div.dr', h('dt', l), (D[n] = h('dd', ...k)));
    D.close = h('button.ibtn.dx', { type: 'button', 'aria-label': '닫기', on: { click: () => setDrawer(false) } }, svgUse('i-x'));
    D.stGl = C.glyph('idle'); D.stTx = h('span');
    D.start = h('span'); D.startRel = timeEl(Date.now(), 'ago', 'rel'); D.turn = timeEl(Date.now(), 'dur', 'rel'); D.last = timeEl(Date.now(), 'ago', 'rel');
    D.tree = h('div.dtree'); D.procs = h('div.dprocs'); D.miss = h('div.dmiss', { hidden: true });
    D.sheet = h('dl.sheet', row('상태', 'st', D.stGl, ' ', D.stTx), row('시작', 'rs', D.start, D.startRel, h('span.pr', ')')), row('이번 턴', 'rt', D.turn), row('마지막 활동', 'rl', D.last), row('모델', 'rm'), row('폴더', 'rf'), row('pid', 'rp'), row('부모', 'rpa'));
    D.hk = h('h3.t-section', '하위 ', h('span.n')); D.hsum = h('p.meta.hsum'); D.hp = h('h3.t-section', '프로세스 ', h('span.n'));
    drawer.append(h('div.dhead', h('h2.t-title', '세션 정보'), D.close), D.miss, D.sheet, h('section.dsec.kids', D.hk, D.hsum, D.tree), h('section.dsec.procs', D.hp, D.procs));
    D.rm.classList.add('mono'); D.rf.classList.add('mono'); D.rp.classList.add('mono'); D.rpa.append(h('button.lnk', { type: 'button' }));
  }
  function renderDrawer() {
    if (!D.sheet) buildDrawer();
    D.miss.hidden = !!a; D.sheet.hidden = !a; if (!a) { D.miss.replaceChildren(States.missing(key.split(':')[0], key.slice(key.indexOf(':') + 1))); return; }
    const md = C.meta(a), par = a.parent && M.agents.get(a.parent), w = R.isWaiting(a);
    C.setGlyph(D.stGl, a.st); text(D.stTx, ST[a.st] + (a.why ? ' — ' + a.why : ''));
    text(D.start, a.t0 != null ? fmtHM(a.t0) + ' (' : ''); D.start.parentNode.parentNode.hidden = a.t0 == null; R.setTime(D.startRel, a.t0, 'ago');
    const live = R.LIVE.has(a.st) || a.st === 'stall' || a.st === 'user'; D.turn.parentNode.parentNode.hidden = !(live && a.t0 != null); R.setTime(D.turn, a.t0, 'dur');
    D.last.parentNode.parentNode.hidden = a.lastAt == null; R.setTime(D.last, a.lastAt, 'ago');
    for (const [n, v] of [['rm', md.model], ['rf', md.cwd], ['rp', md.pid]]) { text(D[n], v || ''); D[n].parentNode.hidden = !v; }
    D.rpa.parentNode.hidden = !par; if (par) { const b = D.rpa.firstChild; text(b, par.name); b.onclick = () => R.openRoom(par.ch, par.id); }
    const subs = Detail.subtree(a), np = [a, ...subs].reduce((n, x) => n + x.procs.length, 0);
    text(D.hk.lastChild, subs.length); text(D.hsum, Detail.sumKids(subs)); text(D.hp.lastChild, np); D.tree.parentNode.hidden = !subs.length && !a.hidden;
    Detail.tree(D.tree, a); Detail.procs(D.procs, a);
  }
  function setDrawer(v) { U.drawer = !!v; R.save(); applyDrawer(); if (v) renderDrawer(); }
  function applyDrawer() { const on_ = !!U.drawer && !!key; drawer.hidden = !on_; chat.dataset.drawer = on_ ? 'open' : ''; attr(info, 'aria-pressed', on_ ? 'true' : 'false'); }

  // ---------- empty state (no room selected) ----------
  const eGl = C.glyph('done'), eT = h('h2.t-title'), eS = h('p.meta'), eH = h('p.meta.hint', '↑↓로 방을 고르고 Enter로 엽니다');
  pempty.append(h('div.pe', eGl, eT, eS, eH));
  function renderEmpty() {
    const w = M.waiting.length;
    if (!M.loaded) { text(eT, '불러오는 중…'); text(eS, ''); eGl.style.display = 'none'; eH.hidden = true; return; }
    eGl.style.display = ''; eH.hidden = false;
    const cnt = k => [...M.agents.values()].filter(x => x.st === k).length;
    const live = [...M.agents.values()].filter(x => R.LIVE.has(x.st)).length, ok = M.channels.filter(c => c.state === 'ok').length;
    if (w) { const cw = k => M.waiting.filter(x => x.st === k).length; C.setGlyph(eGl, 'user'); text(eT, [['입력 대기', cw('user')], ['응답 없음', cw('stall')], ['중단됨', cw('stopped')], ['끊김', cw('dead')]].filter(x => x[1]).map(x => x[0] + ' ' + x[1]).join(' · ')); }   // same set (R.isWaiting) as the rail badge
    else { C.setGlyph(eGl, 'done'); text(eT, '기다리는 것 없음'); }
    text(eS, '에이전트 ' + live + '개 작업 중 · 채널 ' + ok + '/' + M.channels.length + ' 연결');
  }

  // ---------- public ----------
  function show() {
    const p = R.params(), k = p.id ? p.ch + ':' + p.id : null;
    if (k !== key) {
      key = k; opening = true; prevIds = new Set(); sawAgent = false; newmsg.hidden = true; tlin.replaceChildren();
      if (k) { R.U.seen[k] = Date.now(); R.save(); }
      chat.dataset.room = k ? 'open' : 'none';
    }
    applyDrawer();
  }
  function update() {
    if (R.params().view !== 'chat') { document.body.classList.remove('room-composer'); return; }
    if (!key) { proom.hidden = true; pempty.hidden = false; document.body.classList.remove('room-composer'); renderEmpty(); applyDrawer(); return; }
    a = M.agents.get(key) || null; if (a) { cache.set(key, a); sawAgent = true; }
    const ghost = !a && cache.get(key);
    if (!M.loaded) { proom.hidden = true; pempty.hidden = false; document.body.classList.remove('room-composer'); renderEmpty(); return; }
    pempty.hidden = true; proom.hidden = false;
    if (a || ghost) renderHead(a || ghost); else { text(ptitle, key.slice(key.indexOf(':') + 1)); text(pmeta, R.chName(key.split(':')[0])); lkKids.hidden = lkPar.hidden = crumb.hidden = true; }
    const rt = a && M.agents.get(a.root), tree = !!rt && Detail.subtree(rt).length > 0, was = flowOn;
    flowOn = tree && !!R.params().flow; seg.hidden = !tree; segB.forEach((b, i) => attr(b, 'aria-pressed', (i ? flowOn : !flowOn) ? 'true' : 'false'));
    Flow.el.hidden = !flowOn; attr(tl, 'inert', flowOn ? '' : null); if (flowOn) newmsg.hidden = true;
    renderTimeline(); renderBar(); Talk.render(a, key); document.body.classList.toggle('room-composer', !Talk.el.hidden); applyDrawer(); if (U.drawer) renderDrawer();
    if (flowOn) Flow.render(rt, a);
    if (was !== flowOn) { const ae = document.activeElement; if (!ae || ae === document.body || tl.contains(ae) || Flow.el.contains(ae)) setTimeout(() => flowOn ? Flow.focus() : tl.focus({ preventScroll: true }), 0); }   // the view you left held the focus
    cls(tl, 'dimmed', !a);
    if (document.hasFocus() && a) { const t = Date.now(); if (!R.U.seen[key] || t - R.U.seen[key] > 2000) { R.U.seen[key] = t; R.save(); } }
    if (wantFocus) { wantFocus = false; flowOn ? Flow.focus() : tl.focus({ preventScroll: true }); }
  }
  on('route', () => { const was = key; show(); if (key && key !== was) wantFocus = true; if (R.params().view === 'chat' && M.loaded) update(); });
  on('talkui', () => { if (key && M.loaded && R.params().view === 'chat') update(); });
  tl.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target === tl && !e.isComposing && Talk.focus()) e.preventDefault(); });   // Enter from the list opens the room, Enter again starts typing
  const toggleFlow = () => { if (key && a && !seg.hidden) R.setFlow(!flowOn); };
  R.key('i', () => { if (key) setDrawer(!U.drawer); }, '세션 정보');
  R.key('c', () => { if (key && a) copyTerm(); }, '터미널 명령 복사');
  R.key('f', toggleFlow, '흐름 보기');
  R.key('Backspace', () => { if (key && small()) R.closeRoom(); }, '목록으로 (좁은 창)');
  R.onEsc(() => {
    if (R.params().view !== 'chat') return false;
    if (ChatList.esc()) return true;
    if (!key) return false;
    if (flowOn) { R.setFlow(false); return true; }
    if (U.drawer) { setDrawer(false); return true; }
    R.closeRoom(); setTimeout(() => ChatList.focusRow(), 0); return true;
  });
  return { update, show, copyTerm, termCmd, items, toggleFlow, noHistory, heldCopy, canFlow: () => !!key && !!a && !seg.hidden, get flowOn() { return flowOn; }, get key() { return key; }, set wantFocus(v) { wantFocus = v; } };
})();
