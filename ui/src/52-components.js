/* ===== 52-components.js — shared components (CHAT-UX §8): glyph, avatar, badge, ask bubble, room row (list + board card), preview.
   Each component has create(...) -> element and a set*(el, ...) that patches in place. Agent text only via textContent. ===== */
const C = (() => {
  const { h, svgUse, text, attr, cls, stClass, ST, num, str, timeEl, setTime, fmtDur } = R;

  // status glyph <svg class="gl st-x"><use href="#g-x"/></svg>
  function glyph(st, extra) {
    const el = svgUse('g-' + st, 'gl st-' + st + (extra ? ' ' + extra : ''));
    el.setAttribute('role', 'img'); el.setAttribute('aria-label', ST[st] || st);
    return el;
  }
  function setGlyph(el, st) { const u = el.firstElementChild; attr(u, 'href', '#g-' + st); stClass(el, st); attr(el, 'aria-label', ST[st] || st); }

  // channel icon: 내 PC / cloud / server — settings channel rows and the palette's channel entries
  const chIcon = c => c.kind === 'local' ? 'i-desktop' : /cloud|클라우드/i.test(c.id + c.name) ? 'i-cloud' : 'i-server';
  // a cwd is only trusted (shown as cwd, pasted into a terminal command) when it is plain path characters: no spaces, quotes, ; $ ` | & etc.
  const SAFE_CWD = /^(?!-)[\p{L}\p{N}_.~\/\\:@+,=-]+$/u;
  // parse meta "pid 61183 · ~/myproject · claude-opus-5-5 · role" -> {pid, cwd, model, role}
  function meta(a) {
    const o = { pid: '', cwd: '', model: '', role: '' };
    for (const p of String(a.meta || '').split(' · ')) {
      if (/^pid \d+$/.test(p)) o.pid = p.slice(4);
      else if (/[\/\\~…]/.test(p) && !o.cwd) o.cwd = p;
      else if (/^(gpt|claude|gemini|o\d|codex|sonnet|opus|haiku)/i.test(p) && !o.model) o.model = p;
      else if (/^wf_/.test(p)) o.pid = o.pid || p;
      else if (p) o.role = o.role ? o.role + ' · ' + p : p;
    }
    return o;
  }

  // one tool-call line ("Bash: pytest -q", "$ make", "Read: a.py") -> {name, verb, obj, prose}; shared by bubbles, previews and the live tail
  function parseAct(x) {
    const n = String(x || ''); let m;
    if ((m = n.match(/^\$ ([\s\S]*)$/))) return { name: 'Bash', verb: '명령 실행 중', obj: m[1] };
    if ((m = n.match(/^(Bash|Monitor): ([\s\S]*)$/))) return { name: m[1], verb: m[1] + ' 실행 중', obj: m[2] };
    if ((m = n.match(/^(Read|Glob|Grep): ([\s\S]*)$/))) return { name: m[1], verb: '파일 읽는 중', obj: m[2] };
    if ((m = n.match(/^(Write|Edit|MultiEdit|NotebookEdit): ([\s\S]*)$/))) return { name: m[1], verb: '파일 쓰는 중', obj: m[2] };
    if ((m = n.match(/^(exec|run_command) ([\s\S]*)$/))) return { name: 'Bash', verb: '명령 실행 중', obj: m[2] };
    if ((m = n.match(/^(\w{2,30}): ([\s\S]*)$/))) return { name: m[1], verb: m[1] + ' 실행 중', obj: m[2] };
    return { name: '', verb: n ? '응답 생성 중' : '', obj: n, prose: true };
  }
  // now-doing = verb + object. Reason replaces it for user/stall/stopped/dead.
  function nowDoing(a) {
    if (!R.LIVE.has(a.st)) return { verb: a.why || ST[a.st], obj: '', reason: true };
    const live = (a.kids || []).map(k => R.M.agents.get(k)).filter(k => k && R.LIVE.has(k.st)).length;
    if (a.st === 'child') return { verb: live ? '하위 ' + live + '개 응답 대기' : (a.why || '하위 대기'), obj: '' };
    const n = a.now || '', p = parseAct(n);
    if (!p.prose) return { verb: p.verb, obj: p.obj };
    if (a.st === 'tool') return { verb: a.why || '도구 실행 중', obj: n };
    return { verb: n ? '응답 생성 중' : (a.why || '작업 중'), obj: n, prose: true };
  }

  // ---------- timeline helpers ----------
  // the newest thing in a room: an act, a message from/to the parent or another session, or a talk I sent (TALK-UX §3.4)
  const MK = { down: 'mdown', follow: 'mdown', up: 'mup' }, fl1 = s => String(s || '').split('\n')[0];
  function lastAct(a) {
    const r = R.acts(a.key); let x = r.length ? r[r.length - 1] : null;
    const ms = R.msgs(a.key), m = ms[ms.length - 1], tk = (R.A.talks[a.key] || []).slice(-1)[0];
    if (m && (!x || m.t > x.t)) x = { t: m.t, k: m.kind === 'talk' ? 'mtalk' : m.kind === 'peer' ? 'mpeer' : MK[m.dir], x: m.encrypted ? '' : fl1(m.text), enc: m.encrypted };
    if (tk && (!x || tk.t > x.t)) x = { t: tk.t, k: 'mtalk', x: fl1(tk.text) };
    return x;
  }
  const lastT = a => { const x = lastAct(a); return x ? x.t : a.lastAt != null ? a.lastAt : a.t0; };
  const isCmd = s => /^\$ /.test(s || '');
  const WAIT_WORD = { stall: '조용함', stopped: '중단됨', dead: '끊김' };   // the row's '…째 X' must agree with the ask box below it
  // what a waiting room asks of me: {head, body, mono, warn, cmd}
  function waitInfo(a) {
    if (a.st === 'user') {
      const body = a.now || a.last || a.why || '', cmd = isCmd(body);
      return { head: cmd || /승인/.test(a.why || '') ? '승인 요청' : '질문', body, mono: cmd, cmd: cmd ? body.slice(2) : '' };
    }
    if (a.st === 'stall') {
      const cpu = a.procs.length ? Math.max(...a.procs.map(p => p.cpu)) : null, q = a.age != null ? a.age : a.since;
      return { head: '응답 없음', body: (q != null ? fmtDur(q) + ' 동안 출력 없음' : a.why), warn: cpu != null ? 'CPU ' + cpu + ' %' : '', zero: cpu === 0 };
    }
    return { head: a.st === 'dead' ? '끊김' : '중단됨', body: a.why || ST[a.st] };
  }

  // ---------- clipboard ----------
  function copy(s, btn, label) {
    const ok = () => { if (!btn) return; clearTimeout(btn._ct); text(btn, '복사됨 ✓'); btn._ct = setTimeout(() => text(btn, label || '명령 복사'), 1500); };
    const fb = () => { const t = h('textarea', { style: 'position:fixed;opacity:0' }); t.value = s; document.body.append(t); t.select(); try { document.execCommand('copy'); } catch { } t.remove(); ok(); };
    try { navigator.clipboard.writeText(s).then(ok, fb); } catch { fb(); }
  }

  // ---------- badge: red = waits for me, grey = new activity ----------
  function badge(el, o) {
    const n = o && o.n > 0 ? o.n : 0, on = !!o && (o.red || n > 0);
    cls(el, 'red', !!(o && o.red)); cls(el, 'on', on);
    text(el, on ? String(Math.max(n, o.red ? 1 : 0)) : '');
    attr(el, 'aria-label', on ? (o.red ? '나를 기다림, ' : '') + '새 활동 ' + Math.max(n, 1) + '개' : null);
  }

  // ---------- avatar: 36 px tile, tool shape, status glyph on a disc (the real status shape) ----------
  function avatar(a) { const el = h('span.av', svgUse('t-' + (a ? a.tool : 'claude'), 'amk'), h('span.avs', glyph('idle'))); if (a) setAvatar(el, a); return el; }
  function setAvatar(el, a) {
    attr(el.firstElementChild.firstElementChild, 'href', '#t-' + a.tool);
    setGlyph(el.querySelector('.gl'), a.st); cls(el, 'kid', !!a.parent); attr(el, 'title', a.tool + ' · ' + ST[a.st]);
  }

  // ---------- ask bubble (list rows, board cards, room timeline, 비밀번호 입력 step) ----------
  function askBubble(compact) {
    const btn = h('button.btn.sm', { type: 'button', tabindex: compact ? '-1' : null, on: { click: e => { e.stopPropagation(); copy(el._cmd, e.currentTarget); } } }, '명령 복사');
    const el = h('div.ask', { class: compact ? 'compact' : '' }, h('div.abx', h('span.ah'), ' ', h('span.ab', h('span.abt'), ' ', h('span.abw'))), h('div.am', { hidden: true }), h('div.af', { hidden: true }, btn));
    return el;
  }
  function setAsk(el, o) {
    text(el.querySelector('.ah'), o.head); const b = el.querySelector('.abt'); text(b, o.body || ''); cls(b, 'mono', !!o.mono);
    const w = el.querySelector('.abw'); text(w, o.warn || ''); cls(w, 'zero', !!o.zero);
    attr(el, 'title', [o.head, o.body, o.warn].filter(Boolean).join(' — '));
    const m = el.querySelector('.am'); text(m, o.meta || ''); m.hidden = !o.meta;
    el._cmd = o.cmd || ''; el.querySelector('.af').hidden = !o.cmd; cls(el, 'resolved', !!o.resolved); cls(el, 'hascmd', !!o.cmd);
    return el;
  }

  // ---------- room row: shared by the list and the board (CHAT-UX §4, §8) ----------
  const prefix = a => a.depth < 1 ? '' : a.depth === 1 ? '↳ ' : a.depth <= 3 ? '↳↳ ' : '↳×4 ';
  const actText = x => ({ user: '나: ' + x.x, say: x.x, tool: '⌘ ' + (p => (p.name ? p.name + ' ' : '') + p.obj)(parseAct(String(x.x).replace(/ ×\d+$/, ''))), spawn: '하위 시작 ' + x.x,
    ask: (isCmd(x.x) ? '승인 요청 ' : '질문 ') + x.x, done: '완료 · ' + x.x, err: '중단 · ' + x.x,
    mdown: '부모 지시: ' + (x.enc ? '🔒 암호화됨' : x.x), mup: '보고: ' + (x.enc ? '🔒 암호화됨' : x.x), mtalk: '나 (에겐 톡): ' + x.x, mpeer: '다른 세션: ' + x.x }[x.k] || x.x);
  function preview(a) {
    if (R.LIVE.has(a.st)) { const nd = nowDoing(a); return '… ' + [nd.verb, nd.obj].filter(Boolean).join(' '); }
    if (a.kids.length >= 5) { const ks = a.kids.map(k => R.M.agents.get(k)).filter(Boolean), d = ks.filter(k => k.st === 'done').length, w = ks.filter(k => R.LIVE.has(k.st)).length; if (d + w) return '하위 ' + ks.length + '개 중 ' + d + '개 완료' + (w ? ' · ' + w + '개 작업 중' : ''); }
    const x = lastAct(a); if (x) return actText(x);
    return a.last || a.why || ST[a.st];
  }
  // project chip (OVERVIEW-CONTRACT §3): repo name, branch + root in the tooltip; textContent only
  function setProj(el, a) {
    if (!el) return;
    const p = a && a.project; el.hidden = !p; if (!p) return;
    text(el, p.name); attr(el, 'title', '프로젝트 ' + p.name + (p.branch ? ' · 브랜치 ' + p.branch : '') + (p.root ? ' · ' + p.root : ''));
  }
  function roomRow(a, kind) {
    const ask = askBubble(true);
    const el = h('div.room', { role: kind === 'card' ? 'button' : 'option', tabindex: kind === 'card' ? '-1' : null, class: kind === 'card' ? 'card bcard' : '' },
      h('div.rrow', avatar(a), h('div.rmain', h('div.l1', h('span.rt'), h('span.pj', { hidden: true }), h('span.rtm')),
        h('div.l2', h('span.rch'), h('span.pp'), timeEl(Date.now(), 'live', 'pt rel'), h('span.pe'), h('span.ackm', { hidden: true }), h('span.rb', timeEl(Date.now(), 'live', 'rlong rel'), h('span.bdg'))))), ask,
      kind === 'card' ? h('div.cfoot', h('button.btn.sm', { type: 'button', tabindex: '-1', 'aria-hidden': 'true' }, '방 열기')) : null);
    el._ask = ask; return el;
  }
  // o: {scoped (channel chip active → leave the channel out), badge {red,n}, long (오래 도는 순), ghost (사라진 시각 ms)}
  function setRoomRow(el, a, o = {}) {
    const dead = R.isDead(a.ch), w = !o.ghost && R.needsMe(a), ack = !o.ghost && R.isAcked(a);   // 읽음: a waiting room I already opened reads like a quiet one
    stClass(el, a.st); cls(el, 'waiting', w); cls(el, 'acked', ack); cls(el, 'rest', R.REST.has(a.st) && !w); cls(el, 'stale', dead); cls(el, 'kidrow', !!a.parent);
    setAvatar(el.querySelector('.av'), a);
    const t = el.querySelector('.rt'); text(t, prefix(a) + a.name); attr(t, 'title', a.name);
    setProj(el.querySelector('.pj'), a);
    const tm = el.querySelector('.rtm'), lt = lastT(a), c = R.chan(a.ch), st = R.M.states[a.ch];
    text(tm, dead ? '마지막 수집 ' + (c && c.t ? R.fmtHM(c.t) : st && st.time ? st.time.slice(0, 5) : '—') : lt != null ? R.fmtHM(lt) : ''); attr(tm, 'title', !dead && lt != null ? R.fmtAbs(lt) : null);
    // line 2 (CHAT-UX §4, Fable review): [channel · | ↳ parent 하위 ·] [preview | status] [elapsed] — only the preview may ellipsize
    const rc = el.querySelector('.rch'), pp = el.querySelector('.pp'), pt = el.querySelector('.pt'), pe = el.querySelector('.pe');
    const par = a.parent && R.M.agents.get(a.parent), kid = !!a.parent && !o.ghost, xp = window.Detail && a.parent && Detail.isCross(a) ? '⇢ 다른 프로세스 · ' : '';
    rc.replaceChildren(...[dead ? svgUse('i-off', 'gl off') : null, kid ? '↳ ' + (par ? par.name : '') + ' 하위 · ' + xp : (o.scoped ? '' : R.chName(a.ch) + ' · ') + xp].filter(Boolean)); cls(rc, 'kidch', kid);
    cls(pp, 'fixed', kid || w); cls(el, 'islive', R.LIVE.has(a.st));
    if (w) { text(pp, ''); R.setTimeFor(pt, R.waitT(a) || null, 'live', a.ch); pt.hidden = false; text(pe, WAIT_WORD[a.st] || '기다림'); attr(pp, 'title', null); }
    else if (kid && !o.ghost) { text(pp, ST[a.st]); attr(pp, 'title', preview(a)); const tt = R.LIVE.has(a.st) ? (a.t0 != null ? a.t0 : a.lastAt) : a.lastAt; R.setTimeFor(pt, tt, R.LIVE.has(a.st) ? 'live' : 'ago', a.ch); pt.hidden = tt == null; text(pe, ''); }
    else { const pv = o.ghost ? '사라짐 · ' + R.fmtHM(o.ghost) : preview(a); text(pp, pv); attr(pp, 'title', pv); pt.hidden = true; text(pe, ''); }
    pe.hidden = !w;
    const am = el.querySelector('.ackm'); am.hidden = !ack; text(am, ack ? (R.isApproval(a) ? '승인 대기 · 읽음' : '읽음') : ''); attr(am, 'title', ack ? (R.isApproval(a) ? '아직 승인을 기다립니다 — 터미널에서 승인하세요' : '읽은 대기 — 새로 기다리기 시작하면 다시 알립니다') : null);
    const rl = el.querySelector('.rlong'); rl.hidden = !(o.long && !w && a.t0 != null); if (!rl.hidden) R.setTimeFor(rl, a.t0, 'live', a.ch);
    const bd = el.querySelector('.bdg'); badge(bd, o.badge);
    cls(el, 'hasask', w); el._ask.hidden = !w;
    if (w) { const wi = waitInfo(a); setAsk(el._ask, { head: wi.head, body: wi.body, mono: wi.mono, warn: wi.warn, zero: wi.zero, cmd: wi.cmd }); }
    el.dataset.st = a.st;
  }

  // ---------- process row: [glyph] mono cmd  elapsed  CPU ----------
  function procRow(p, a) {
    const el = h('div.prow', { data: { key: p.pid } }, glyph('work'), h('span.cmd', { title: p.cmd }), timeEl(Date.now(), 'dur', 'el rel'), h('span.cpu'));
    setProcRow(el, p, a); return el;
  }
  function setProcRow(el, p, a) {
    const st = p.state === 'Z' ? 'stopped' : p.state === 'T' ? 'stall' : (p.cpu === 0 && !p.bg && a && (a.st === 'stall' || a.st === 'tool')) ? 'stall' : 'work';
    setGlyph(el.firstElementChild, st);
    const c = el.querySelector('.cmd'); text(c, str(p.cmd, 48)); attr(c, 'title', p.cmd + (p.kid ? '\n↳ ' + p.kid : ''));
    let bg = el.querySelector('.bg'); if (p.bg && !bg) c.append(h('span.bg', '백그라운드')); else if (!p.bg && bg) bg.remove();
    setTime(el.querySelector('.el'), Date.now() - p.age * 1000, 'dur');
    const cpu = el.querySelector('.cpu'); text(cpu, 'CPU ' + p.cpu + ' %'); cls(cpu, 'zero', p.cpu === 0 && !p.bg && a && (a.st === 'stall' || a.st === 'tool' || a.st === 'work'));
    attr(cpu, 'title', p.cpu === 0 ? '0 % — 계산 중이어야 하는 프로세스라면 멈춘 증거입니다' : null);
  }

  // ---------- clamp block (TALK-UX §2.1): text clamped to n lines + 더보기 toggle; the expanded ids live in R.A.open (shared by cards and 흐름) ----------
  const clampBody = (n, cls_) => h('div.tb', { class: cls_, data: { n } });
  function clampBtn(body) {
    const b = h('button.btn.link.cmo.fc', { type: 'button', hidden: true, 'aria-expanded': 'false', on: { click: e => { e.stopPropagation(); const id = body._id, A = R.A.open; A.has(id) ? A.delete(id) : A.add(id); R.emit('talkui'); } } }, '더보기 ▾');
    body._btn = b; return b;
  }
  function setClamp(body, id, s, n) {
    body._id = id; const open = R.A.open.has(id); n = n || +body.dataset.n;
    text(body, s); cls(body, 'open', open); cls(body, 'clamp', !open); if (body._o !== open) { body._o = open; body._mt = null; }
    if (body._n !== n) { body._n = n; body.style.setProperty('--n', n); body._mt = null; }
    const b = body._btn; if (b) { text(b, open ? '접기 ▴' : '더보기 ▾'); attr(b, 'aria-expanded', open ? 'true' : 'false'); if (open) b.hidden = false; }
  }
  // clamped? scrollHeight needs layout, so it is read once per (text, width) after the keyed pass; a footer with nothing visible folds away
  function measure(root) {
    for (const body of root.querySelectorAll('.tb.clamp')) {
      const b = body._btn; if (!b) continue;
      const sig = body.textContent.length + '|' + body.clientWidth + '|' + body._n; if (body._mt === sig) continue; body._mt = sig;
      b.hidden = !(body.scrollHeight > body.clientHeight + 1);
    }
    for (const tf of root.querySelectorAll('.tf')) tf.hidden = ![...tf.querySelectorAll('.fc')].some(x => !x.hidden && x.textContent !== '');
  }

  const kbd = k => h('kbd', k);
  return { setProj, safeCwd: SAFE_CWD, glyph, setGlyph, chIcon, meta, parseAct, nowDoing, lastAct, lastT, waitInfo, isCmd, copy, badge, avatar, setAvatar, askBubble, setAsk, roomRow, setRoomRow, preview, actText, prefix, procRow, setProcRow, kbd, clampBody, clampBtn, setClamp, measure };
})();
