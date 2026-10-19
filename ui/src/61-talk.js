/* ===== 61-talk.js — 톡 (TALK-UX, TALK-ENG): talk cards in rooms, the composer + confirm card, delivery states.
   Rule 1: the right side is only ever text a human typed (terminal prompt, or a talk sent from here). Agent text reaches the DOM through textContent / h() only.
   The confirm preview and the request body come from the composer state (`pending`), never from anything an agent wrote. ===== */
const Talk = (() => {
  const { h, svgUse, text, attr, cls, M, U, A, S } = R;
  const HELD_MS = 300000, GUARD_MS = 2000;
  const guardWait = (sent, retryUntil, now = Date.now()) => Math.max(retryUntil || 0, (sent || 0) + GUARD_MS) - now;
  const guardMessage = '잠시 뒤에 보낼 수 있습니다', sendGuard = sent => Date.now() - sent < GUARD_MS;
  const REASON = {
    subagent: '하위 에이전트에게는 직접 보낼 수 없습니다 — 부모 방에서 보내세요',
    'no-daemon': 'codex가 --no-daemon으로 실행 중이라 받을 수 없습니다 · 다음부터 --no-daemon 없이 실행하면 여기서 보낼 수 있습니다',
    'no-socket': '이 claude 세션에는 메시지 소켓이 없습니다 — claude 2.1.300 이상에서 받을 수 있습니다',
    'not-interactive': '대화형 세션이 아니라 받을 수 없습니다 (claude -p)',
    self: '에겐 톡을 띄운 세션에는 보내지 않습니다',
    ended: '세션이 끝나서 보낼 수 없습니다',
    windows: '이 PC의 세션에는 아직 보낼 수 없습니다 — 서버 세션만 지원합니다',
  };
  const REFUSED = { 'inbound-off': '세션 설정이 외부 메시지를 받지 않습니다', duplicate: '바로 전 톡과 같은 내용이라 걸러졌습니다', busy: '다른 톡을 보내는 중입니다', 'busy-race': '그 사이 상태가 바뀌어 보내지 못했습니다 — 다시 시도하세요', off: '설정에서 톡 보내기가 꺼져 있습니다', empty: '비어 있습니다', rate: '너무 자주 보내고 있습니다', 'bad-text': '보낼 수 없는 문자가 들어 있습니다', 'bad-request': '요청 형식이 올바르지 않습니다' };   // + REASON (subagent, no-socket, …); anything else: the hub's string as is
  const ALWAYS = '다른 세션이 보낸 메시지로 전달됩니다 — 터미널 입력이 아니며, 에이전트가 자기 권한 안에서만 따릅니다';
  const fmtN = n => Number(n).toLocaleString('en-US');
  const get = k => M.agents.get(k);
  let shown = null, pending = null, cur = { a: null };   // shown = room key the composer text belongs to ; pending = {key, text, at} while the confirm card is open
  const inflight = {}, until = {}, lastSend = {};

  // ---------- who can be talked to (TALK-UX §5.2) ----------
  // -> {k: 'none' | 'ok' | 'off', t, hold, max, parent}
  function mode(a) {
    const off = t => ({ k: 'off', t });
    if (M.hubDown) return off('지금은 보낼 수 없습니다 — 허브가 돌아오면 다시 열립니다');
    if (!a) return off(REASON.ended);
    if (R.isDead(a.ch)) return off('서버와 연결이 끊겨 보낼 수 없습니다');
    if (!S.talkOn) return off('설정에서 톡 보내기가 꺼져 있습니다');
    const t = a.talk; if (!t) return { k: 'none' };
    if (t.ok) return { k: 'ok', hold: t.hold, max: t.max };
    const r = t.reason === 'unsupported' ? a.tool + '는 톡 받기를 지원하지 않습니다' : REASON[t.reason] || '보낼 수 없습니다' + (t.reason ? ' (' + t.reason + ')' : '');
    return { k: 'off', t: r, parent: t.reason === 'subagent' ? get(a.parent) : null };
  }

  // ---------- delivery state of one sent talk (TALK-UX §5.5). The 5-minute held -> 만료됨 timer is the UI's (TALK-ENG §0) ----------
  const expired = e => e.st === 'held' && Date.now() - e.hat > HELD_MS;
  function stateOf(e) {
    if (expired(e)) return { k: 'exp', ic: 'g-stopped', t: '만료됨 — 터미널에서 승인되지 않았습니다', retry: true };
    switch (e.st) {
      case 'sending': return { k: 'sending', t: '보내는 중…' };
      case 'delivered': return { k: 'ok', ic: 'i-check', t: '전달됨' };
      case 'held': return { k: 'held', ic: 'g-user', t: '터미널에서 승인 대기 · 5분 안에' };
      case 'refused': return { k: 'bad', ic: 'g-stopped', t: '거절됨 — ' + (e.why === 'too-long' ? '너무 깁니다 (' + fmtN(M.app ? M.app.talkMax : 4000) + '자까지)' : REFUSED[e.why] || (REASON[e.why] || e.why || '이유를 알 수 없습니다')) };
      case 'unreach': return { k: 'bad', ic: 'g-dead', t: '연결 안 됨 — 세션 소켓에 닿지 않습니다', retry: true };
      default: return { k: 'unk', t: '확인 안 됨 — 전달 여부를 알 수 없습니다' };
    }
  }
  const held = key => (A.talks[key] || []).some(e => e.st === 'held' && !expired(e));
  const note = key => held(key) ? 'held' : (until[key] || 0) > Date.now() ? 'wait' : '';   // what the status bar says about my talks in this room

  // ---------- timeline items (called from Room.items) ----------
  // Adds the talk cards, absorbs `down` into spawn cards, drops what a card replaces (TALK-UX §2.4, §3.3).
  function kidsOf(key, a) {   // children that have messages: alive, or remembered from earlier polls
    const seen = new Set(), out = [];
    const add = ck => { if (seen.has(ck)) return; seen.add(ck); const ms = R.msgs(ck); if (ms.length) { const c = get(ck); out.push({ ck, c, name: c ? c.name : ms[0].kid, ms }); } };
    if (a) a.kids.forEach(add);
    for (const ck of Object.keys(A.mg)) if (!get(ck) && R.msgs(ck).some(m => m.dir === 'down' && m.ch + ':' + m.from === key)) add(ck);
    return out;
  }
  const peerName = (m, sa) => sa ? sa.name : (/(\d+)\.sock$/.exec(m.from) ? 'pid ' + /(\d+)\.sock$/.exec(m.from)[1] : '') || (m.who !== '다른 세션' ? m.who : '');
  function reconcile(key) {   // a transcript record carrying my msg_id proves delivery
    const es = A.talks[key]; if (!es) return;
    for (const m of R.msgs(key)) if (m.kind === 'talk' && m.msg_id) { const e = es.find(x => x.mid === m.msg_id); if (e && e.st !== 'delivered') { if (e.st === 'held') R.emit('talk', { type: 'talk', kind: 'clear', key }); e.st = 'delivered'; R.saveTalks(); if (key === shown) say('톡 전달됨'); } }
  }
  function collect(key, a, L) {
    reconcile(key);
    const talks = A.talks[key] || [], mids = new Set(talks.map(e => e.mid).filter(Boolean)), drop = new Set();
    for (const e of talks) L.push({ id: 't|' + e.cid, t: e.t, kind: 'talkme', e });
    for (const m of R.msgs(key)) {
      const id = 'm|' + m.id, at = get(m.ch + ':' + m.from);
      if (m.kind === 'talk') {
        if (!mids.has(m.msg_id)) L.push({ id, t: m.t, kind: 'tmsg', m, spk: 'x:talk:' + m.id, nm: '에겐 톡', chip: '확인 안 됨', label: '톡', sr: '확인되지 않은 에겐 톡: ' });
      }
      else if (m.kind === 'peer') L.push({ id, t: m.t, kind: 'tmsg', m, spk: at ? at.key : 'x:' + m.from, nm: peerName(m, at), chip: '다른 세션', label: '톡', sp: at, sr: '다른 세션의 톡: ' });
      else if (m.dir === 'up') { const par = a && get(a.parent), to = m.who || (par ? par.name : '부모'); L.push({ id, t: m.t, kind: 'tmsg', m, spk: key, label: '보고 → ' + to, sr: (a ? a.name : '') + '의 보고: ' }); }
      else { const nm = at ? at.name : m.who || '부모'; L.push({ id, t: m.t, kind: 'tmsg', m, spk: at ? at.key : 'x:' + m.from, nm, chip: '부모', label: m.dir === 'follow' ? '후속 지시' : '지시', sp: at, sr: '부모 ' + nm + '의 ' + (m.dir === 'follow' ? '후속 지시: ' : '지시: ') }); }
    }
    const spawns = L.filter(x => x.kind === 'spawn').sort((p, q) => p.t - q.t), used = new Set(), grp = new Map(), upKids = [];
    for (const k of kidsOf(key, a)) for (const m of k.ms) {
      if (m.dir === 'down' && m.kind !== 'peer' && m.kind !== 'talk') {
        let sp = spawns.find(x => !used.has(x) && x.x === k.name) || spawns.find(x => !used.has(x) && x.x && (k.name.includes(x.x) || x.x.includes(k.name)));
        if (!sp) { sp = { id: 'sp|' + m.id, t: m.t, kind: 'spawn', x: k.name }; L.push(sp); spawns.push(sp); }
        used.add(sp); sp.msg = m; sp.kk = k.ck;
        const tx = m.encrypted ? '' : m.text.trim(); if (tx) (grp.get(tx) || grp.set(tx, []).get(tx)).push(sp);
      } else if (m.dir === 'follow') L.push({ id: 'm|' + m.id, t: m.t, kind: 'tmsg', m, spk: key, label: '후속 지시 → ' + k.name, kid: k.c, sr: '후속 지시 → ' + k.name + ': ' });
      else if (m.dir === 'up') { upKids.push(k.name + ':'); L.push({ id: 'm|' + m.id, t: m.t, kind: 'tmsg', m, spk: k.ck, nm: k.name, chip: '하위', label: '보고', kid: k.c, sp: k.c, sr: k.name + '의 보고: ' }); }
    }
    for (const g of grp.values()) if (g.length >= 5) {   // fan-out: the first card shows the shared instruction, one line says the rest
      g.sort((p, q) => p.t - q.t); g.slice(1).forEach(x => drop.add(x));
      L.push({ id: 'fan|' + g[0].id, t: g[0].t + 1, kind: 'fan', x: '하위 ' + g.length + '개 시작 · 같은 지시 ' + (g.length - 1) + '개' });
    }
    for (const x of L) if ((x.kind === 'done' && upKids.some(p => x.x.startsWith(p))) || (x.kind === 'user' && /^\[Agen Talk · /.test(x.x))) drop.add(x);   // the report card replaces the done line; an envelope must never paint as my terminal prompt
    for (let i = L.length - 1; i >= 0; i--) if (drop.has(L[i])) L.splice(i, 1);
  }

  // ---------- card DOM ----------
  function mkWho() { return h('div.who', { hidden: true }, h('button.wn', { type: 'button', on: { click: e => { const c = get(e.currentTarget._k); c && R.openRoom(c.ch, c.id); } } }), h('span.chip')); }
  function mkBody(it) {
    const me = it.kind === 'talkme', tb = C.clampBody(me ? 12 : 3);
    const ic = svgUse('i-check', 'gl'), btn = (c, t, fn) => h('button.btn.sm.fc.' + c, { type: 'button', hidden: true, on: { click: fn } }, t);
    return h('div.bub.talk', { class: me ? 'talkme' : '' }, h('span.sr'),
      h('div.th', h('span.lk', { role: 'img', 'aria-label': '암호화됨', hidden: true }, svgUse('i-lock')), h('span.thl'), h('span.chip.thr', { hidden: true })), tb,
      h('div.tf', h('span.tfl.fc.ds', ic, h('span.dst')),
        h('span.tfr', C.clampBtn(tb), btn('opn', '방 열기 ›', e => { const c = e.currentTarget._k; c && R.openRoom(c.ch, c.id); }), btn('rty', '다시 보내기', e => refill(e.currentTarget._k, e.currentTarget._t)))));
  }
  function patch(el, it, key, a) {
    const k = it.kind, who = el.querySelector('.who');
    let label, body, enc = false, role = '', sr, foot = '', stt = null, kid = null, n = 12;
    if (k === 'talkme') {
      const e = it.e; label = '에겐 톡에서 보냄'; body = e.text; sr = '나 (에겐 톡): ';
      stt = stateOf(e);
    } else {
      const m = it.m; enc = m.encrypted; label = it.label; role = enc ? m.role : ''; n = 3; kid = it.kid; sr = it.sr;
      body = enc ? '암호화된 ' + (m.dir === 'up' ? '보고' : '지시') + ' — 내용은 codex만 읽을 수 있습니다' : m.text;
      if (m.truncated) foot = '잘림' + (m.n ? ' · 전체 ' + fmtN(m.n) + '자' : '');
      who.hidden = !(it.first && it.spk !== key && it.nm); if (!who.hidden) { const wn = who.firstChild; text(wn, it.nm); wn._k = it.spk; wn.disabled = !get(it.spk); text(who.lastChild, it.chip || ''); who.lastChild.hidden = !it.chip; }
    }
    text(el.querySelector('.sr'), sr); text(el.querySelector('.thl'), label);
    el.querySelector('.lk').hidden = !enc; const rc = el.querySelector('.thr'); text(rc, role); rc.hidden = !role;
    const tb = el.querySelector('.tb'); cls(tb, 'enc', enc); C.setClamp(tb, it.e ? it.e.cid : it.m.id, body, n);
    const ds = el.querySelector('.ds'), ic = ds.firstChild, dt = ds.lastChild;
    if (stt) { ds.className = 'tfl fc ds ' + stt.k; ic.style.display = stt.ic ? '' : 'none'; if (stt.ic) { attr(ic.firstChild, 'href', '#' + stt.ic); attr(ic, 'class', 'gl' + (stt.k === 'held' ? ' st-user' : '')); } text(dt, stt.t); }
    else { ds.className = 'tfl fc ds'; ic.style.display = 'none'; text(dt, foot); }
    const opn = el.querySelector('.opn'); opn.hidden = !(kid && get(kid.key)); opn._k = kid;
    const rty = el.querySelector('.rty'); rty.hidden = !(stt && stt.retry && mode(a).k === 'ok'); rty._k = key; rty._t = body;
  }

  // ---------- composer ----------
  const ta = h('textarea.cta', { rows: '1', 'aria-describedby': 'cta-d', autocomplete: 'off' });
  const cnt = h('div.ccnt', { hidden: true }), sendBtn = h('button.btn.primary.csend', { type: 'button', on: { click: () => openConfirm() } }, '보내기');
  const cmp = h('div.cmp', h('div.cmw', ta, cnt, h('span.sr#cta-d', '다른 세션이 보낸 메시지로 전달됩니다. Enter를 누르면 확인 카드, 한 번 더 누르면 보내기, Shift+Enter 줄바꿈')), sendBtn);
  const offT = h('span.cot'), offB = h('button.btn.sm.cop', { type: 'button', hidden: true, on: { click: () => { const p = get(cur.a && cur.a.parent); p && R.openRoom(p.ch, p.id); } } }, '부모 방 열기');
  const off = h('div.coff', { role: 'note', hidden: true }, svgUse('i-off', 'gl off'), offT, offB);
  const cfT = h('div.cft'), cfP = h('div.cfp'), cfL = h('div.cfls'), goBtn = h('button.btn.primary', { type: 'button', on: { click: () => send() } }, '보내기'), backBtn = h('button.btn', { type: 'button', on: { click: () => closeConfirm(true) } }, '돌아가기');
  const confirm = h('div.confirm', { role: 'group', 'aria-labelledby': 'cf-t', hidden: true, on: { keydown: onConfirmKey } }, h('div#cf-t.cfh', '보내기 전 확인'), cfT, cfP, cfL, h('div.cfn', ALWAYS), h('div.cfb', backBtn, goBtn));
  const sayEl = h('div.sr', { role: 'status', 'aria-live': 'polite' });
  const trow = h('div.trow', { hidden: true }, cmp, off, confirm, sayEl);
  let sayT = 0; function say(s) { sayEl.textContent = s; clearTimeout(sayT); sayT = setTimeout(() => { sayEl.textContent = ''; }, 4000); }

  const maxLen = () => (cur.a && cur.a.talk && cur.a.talk.max) || 4000;
  function grow() { ta.style.height = '40px'; if (ta.value) { const hh = ta.scrollHeight; if (hh > 40) ta.style.height = Math.min(hh, 124) + 'px'; } }
  function paint() {
    const wait = guardWait(lastSend[shown], until[shown]), busy = !!inflight[shown];
    text(sendBtn, busy ? '보내는 중…' : wait > 0 ? Math.ceil(wait / 1000) + '초 뒤' : '보내기');
    sendBtn.disabled = busy || wait > 0 || Date.now() - (lastSend[shown] || 0) < GUARD_MS || !ta.value.trim();
    const n = ta.value.length, lim = maxLen(); cnt.hidden = n <= lim - 500; text(cnt, fmtN(n) + ' / ' + fmtN(lim)); cls(cnt, 'over', n >= lim);
  }
  ta.addEventListener('input', () => { A.draft[shown] = ta.value; grow(); paint(); });
  ta.addEventListener('keydown', e => {
    if (e.isComposing || e.keyCode === 229) return;   // Korean IME: Enter / Esc belong to the composition
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); ta.blur(); const f = R.$('#flow'), t = R.$('#tl'); (f && !f.hidden ? f : t).focus({ preventScroll: true }); return; }   // first Esc: back to the timeline, text kept; the next one runs the normal chain
    if (e.key === 'Enter' && !e.shiftKey && !e.altKey) { e.preventDefault(); if (!e.repeat) openConfirm(); }   // Enter and Ctrl+Enter open the confirm card; sending takes a second, separate press
  });

  function lines(a, text_) {   // situational lines of the confirm card, in the TALK-UX §5.3 order
    const o = [], es = A.talks[shown] || [], last = es[es.length - 1];
    if (a.st === 'user' && !/^(답변 끝남|질문함)/.test(a.why || '')) o.push(['g-user', '이 세션은 승인을 기다리는 중입니다 — 톡은 승인 뒤에 읽히고, 톡으로 승인할 수는 없습니다']);
    if (a.talk && a.talk.hold) o.push(['g-user', '--dangerously-skip-permissions 세션입니다 — 터미널에 승인 창이 뜨고, 5분 안에 승인해야 전달됩니다']);
    if (last && last.text === text_) o.push(['g-stall', '바로 전에 보낸 톡과 같은 내용입니다 — 에이전트가 중복으로 거를 수 있습니다']);
    if (a.tool === 'codex' && R.LIVE.has(a.st)) o.push(['g-work', '진행 중인 턴에 끼워 넣습니다 (turn/steer)']);
    return o;
  }
  function paintConfirm() {
    const a = cur.a; if (!pending || !a) return;
    const md = C.meta(a), id = [a.name, a.tool, /^\d+$/.test(md.pid) ? 'pid ' + md.pid : '', R.chName(a.ch)].filter(Boolean).join(' · ') + ' 에게';
    text(cfT, id); text(cfP, pending.text);   // the preview is the composer's own text, nothing else
    const ls = lines(a, pending.text), sig = JSON.stringify(ls);
    if (cfL._sig !== sig) { cfL._sig = sig; cfL.replaceChildren(...ls.map(([g, t]) => h('div.cfl', svgUse(g, 'gl' + (g === 'g-user' ? ' st-user' : '')), h('span', t)))); }
  }
  function openConfirm() {
    if (pending || !shown) return;
    const t = ta.value.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '').replace(/\s+$/, '');   // what the hub accepts: no control characters, no trailing space — and the preview shows exactly this
    if (!t.trim()) return;
    if (sendGuard(lastSend[shown] || 0)) { say(guardMessage); return; }
    if (sendBtn.disabled) return;
    ta.value = t; A.draft[shown] = t; pending = { key: shown, text: t, at: Date.now() };
    cmp.hidden = true; confirm.hidden = false; paintConfirm(); goBtn.focus();
  }
  function closeConfirm(focus) {
    if (!pending) return; pending = null; confirm.hidden = true; cmp.hidden = !(cur.mode === 'ok');
    if (focus) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  }
  function onConfirmKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeConfirm(true); }
    else if (e.key === 'Tab') { e.preventDefault(); (document.activeElement === goBtn ? backBtn : goBtn).focus(); }
    else if ((e.key === 'Enter' || e.key === ' ') && e.repeat) e.preventDefault();   // a held-down Enter must not fall through onto 보내기
  }
  function refill(key, t) { if (key !== shown || cur.mode !== 'ok') return; closeConfirm(false); ta.value = t; A.draft[key] = t; grow(); paint(); openConfirm(); }

  async function send() {
    const p = pending; if (!p || Date.now() - p.at < 350) return;   // a double-click on 보내기 must not land on the confirm card's 보내기
    const key = p.key, a = get(key); closeConfirm(false); if (!a) return;
    ta.value = ''; A.draft[key] = ''; grow();
    const e = { cid: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8), text: p.text, t: Date.now(), st: 'sending', hat: null, mid: '', why: '' };
    (A.talks[key] || (A.talks[key] = [])).push(e); if (A.talks[key].length > 50) A.talks[key].shift(); R.saveTalks();
    inflight[key] = true; lastSend[key] = Date.now(); paint(); R.emit('talkui'); ta.focus();
    let r = null; try { r = await R.apiPost('api/talk', { ch: a.ch, id: a.id, text: p.text, client_id: e.cid }); } catch { }
    inflight[key] = false; settle(key, e, r, a);
  }
  function settle(key, e, r, a) {
    const b = r && r.body && typeof r.body === 'object' ? r.body : {}, o = b.outcome;
    if (r && r.status === 429) {   // rate limit: no bubble, text kept, the button counts down
      const i = A.talks[key].indexOf(e); if (i >= 0) A.talks[key].splice(i, 1);
      A.draft[key] = A.draft[key] || e.text; if (key === shown && !ta.value) { ta.value = e.text; grow(); }
      until[key] = Date.now() + Math.min(600, Math.max(1, Math.ceil(+b.retry_after) || 5)) * 1000; say('잠시 뒤에 보낼 수 있습니다');
    } else {
      if (/^at-[0-9a-f]{8}$/.test(String(b.msg_id))) e.mid = b.msg_id;
      if (o === 'accepted') e.st = 'delivered';
      else if (o === 'held') { e.st = 'held'; e.hat = Date.now(); }
      else if (o === 'refused' || (r && !o && r.status >= 400)) { e.st = 'refused'; e.why = String((b.reason === 'codex-error' && b.detail ? 'codex-error: ' + b.detail : b.reason) || b.error || 'HTTP ' + r.status).slice(0, 200); }   // codex-error carries the message in detail
      else if (o === 'unreachable') e.st = 'unreach';
      else e.st = 'unknown';
      say({ delivered: '톡 전달됨', held: '톡이 터미널 승인을 기다립니다', refused: '톡 거절됨' }[e.st] || '톡을 보내지 못했습니다');
      if (e.st === 'held') R.emit('talk', { type: 'talk', kind: 'held', key, to: 'user', agent: a });
      else if ((e.st === 'refused' || e.st === 'unreach') && U.room !== key) R.emit('talk', { type: 'talk', kind: e.st, key, to: 'stopped', agent: a });
    }
    R.saveTalks(); paint(); R.emit('talkui');
  }
  setInterval(() => {   // 1 s: the 429 countdown, the 5-minute held -> 만료됨 flip
    if (shown) paint();
    let flip = false, ex = false; for (const [k, es] of Object.entries(A.talks)) for (const e of es) if (expired(e) && !e._x) { e._x = true; ex = flip = true; R.emit('talk', { type: 'talk', kind: 'clear', key: k }); }
    for (const k of Object.keys(until)) if (until[k] <= Date.now()) { delete until[k]; flip = true; }   // the 429 countdown ran out: the status bar line goes
    if (ex) say('톡 만료됨 — 터미널에서 승인되지 않았습니다'); if (flip) R.emit('talkui');
  }, 1000);

  // Room.update calls this each poll with the open room (a may be null for a vanished session)
  function render(a, key) {
    cur.a = a;
    if (key !== shown) { if (shown) A.draft[shown] = ta.value; shown = key; if (pending) { pending = null; confirm.hidden = true; } ta.value = A.draft[key] || ''; grow(); }
    const m = mode(a); cur.mode = m.k;
    trow.hidden = m.k === 'none';
    if (pending && m.k !== 'ok') { pending = null; confirm.hidden = true; }
    cmp.hidden = m.k !== 'ok' || !!pending; off.hidden = m.k !== 'off'; confirm.hidden = !pending;
    if (m.k === 'off') { text(offT, m.t); offB.hidden = !m.parent; }
    if (m.k === 'ok') {
      attr(ta, 'aria-label', a.name + '에게 톡 보내기'); attr(ta, 'placeholder', a.name + '에게 톡 보내기' + (m.hold ? ' — 터미널 승인 뒤 전달됩니다' : '')); ta.maxLength = m.max; paint();
    }
    if (pending) paintConfirm();
  }
  R.on('settings', () => { if (shown && cur.a) render(cur.a, shown); });
  const ghosts = key => kidsOf(key, null);   // finished children that left M.agents but whose messages we still remember
  return { collect, ghosts, note, patch, mkBody, mkWho, render, held, say, lines, sendGuard, guardMessage, guardWait, el: trow, ta, focus: () => { if (cur.mode === 'ok' && !cmp.hidden) { ta.focus(); return true; } return false; }, stateOf };
})();
