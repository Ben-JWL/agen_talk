/* ===== 50-core.js (lead) — escape/DOM helpers, keyed renderer, settings, data layer, router, keys.
   Packages use ONLY this surface: R.*, and the C.* components in 52-components.js.
   Rules: agent-derived strings reach the DOM through textContent / h() / esc() only. No innerHTML with data.
   Updates are keyed and in place: R.keyed() reuses nodes, R.text()/R.attr() write only on change. ===== */
const R = (() => {
  // ---------- strings ----------
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v, d = 0) => (Number.isFinite(+v) && v !== null && v !== '' ? +v : d);
  const str = (v, max = 4000) => { const s = v == null ? '' : String(v); return s.length > max ? s.slice(0, max) + '…' : s; };

  // ---------- DOM ----------
  // h('div.cls#id', {class, title, data: {...}, on: {click}, aria: {...}, attr...}, ...kids). Strings become text nodes.
  function h(spec, attrs, ...kids) {
    if (attrs instanceof Node || typeof attrs === 'string' || Array.isArray(attrs)) { kids.unshift(attrs); attrs = null; }
    const [tag, ...rest] = spec.split(/(?=[.#])/);
    const svg = tag === 'svg' || tag === 'use' || tag === 'path' || tag === 'circle' || tag === 'rect';
    const el = svg ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag || 'div');
    for (const r of rest) r[0] === '.' ? el.classList.add(r.slice(1)) : (el.id = r.slice(1));
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.setAttribute('class', (el.getAttribute('class') || '') + ' ' + v);
      else if (k === 'data') for (const [dk, dv] of Object.entries(v)) el.dataset[dk] = dv;
      else if (k === 'on') for (const [ek, fn] of Object.entries(v)) el.addEventListener(ek, fn);
      else if (k === 'aria') for (const [ak, av] of Object.entries(v)) el.setAttribute('aria-' + ak, av);
      else if (k === 'href' && svg) el.setAttribute('href', v);
      else if (k === 'style') el.style.cssText = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    add(el, kids);
    return el;
  }
  function add(el, kids) { for (const k of kids) { if (k == null || k === false) continue; Array.isArray(k) ? add(el, k) : el.append(k instanceof Node ? k : document.createTextNode(String(k))); } }
  const svgUse = (id, cls) => h('svg', { class: cls, 'aria-hidden': 'true' }, h('use', { href: '#' + id }));
  function text(el, s) { s = s == null ? '' : String(s); if (el.textContent !== s) el.textContent = s; return el; }
  function attr(el, k, v) { if (v == null || v === false) { if (el.hasAttribute(k)) el.removeAttribute(k); } else { v = v === true ? '' : String(v); if (el.getAttribute(k) !== v) el.setAttribute(k, v); } return el; }
  function cls(el, name, on) { el.classList.toggle(name, !!on); return el; }
  // swap one st-* class without touching the others
  function stClass(el, st) { for (const c of [...el.classList]) if (c.startsWith('st-') && c !== 'st-' + st) el.classList.remove(c); el.classList.add('st-' + st); }
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  // Keyed in-place list renderer. items: array; key(item) -> string; create(item) -> element; update(el, item, i).
  // Reuses elements by data-key, writes only through update(), moves nodes only when order changed,
  // never removes an element that holds focus (marks it .gone instead; removed on the next pass when unfocused).
  function keyed(parent, items, { key, create, update, keepGone = true }) {
    const want = new Set(items.map(it => String(key(it)))), have = new Map();
    for (const el of [...parent.children]) if (el.dataset.key != null) {   // drop stale nodes first: otherwise every node after the first stale one is re-inserted (selection lost)
      if (want.has(el.dataset.key)) have.set(el.dataset.key, el); else if (keepGone && el.contains(document.activeElement)) el.classList.add('gone'); else el.remove();
    }
    const seen = new Set(), act = document.activeElement;   // re-inserting the focused row blurs it in Chrome: restore below
    let cursor = parent.firstElementChild;
    for (let i = 0; i < items.length; i++) {
      const it = items[i], k = String(key(it));
      if (seen.has(k)) continue;   // duplicate key in one pass: first wins
      seen.add(k);
      let el = have.get(k);
      if (!el) { el = create(it, i); el.dataset.key = k; }
      else el.classList.remove('gone');
      update && update(el, it, i);
      if (el === cursor) cursor = cursor.nextElementSibling;   // already in place
      else parent.insertBefore(el, cursor);                      // new or moved: goes right before the cursor
    }
    for (const [k, el] of have) if (!seen.has(k)) {
      if (keepGone && el.contains(document.activeElement)) el.classList.add('gone');
      else el.remove();
    }
    if (document.activeElement === document.body && act && act !== document.body && parent.contains(act)) act.focus({ preventScroll: true });
  }
  // Run fn (which may reorder rows) while keeping `anchor` at the same viewport offset inside `scroller`.
  function keepScroll(scroller, anchor, fn) {
    if (!anchor || !scroller) return fn();
    const before = anchor.getBoundingClientRect().top;
    fn();
    if (anchor.isConnected) scroller.scrollTop += anchor.getBoundingClientRect().top - before;
  }

  // ---------- time ----------
  const pad = n => String(n).padStart(2, '0');
  function fmtDur(sec) {                    // 12초 / 5분 / 1시간 12분 / 2일 3시간 (DIRECTION §12)
    sec = Math.max(0, Math.round(num(sec)));
    if (sec < 60) return sec + '초';
    const m = Math.floor(sec / 60) % 60, hh = Math.floor(sec / 3600), d = Math.floor(hh / 24);
    if (hh < 1) return m + '분';
    if (d < 1) return m ? hh + '시간 ' + m + '분' : hh + '시간';
    return (hh % 24) ? d + '일 ' + (hh % 24) + '시간' : d + '일';
  }
  // collector durations ('25m', '1h12m', '40s') -> Korean; applied to why/now/last only (never commands), word-bounded so 'gpt-5.1' stays
  const koText = s => /^\$ /.test(s) ? s : koDur(s);   // '$ sleep 30s' is a command: shown and copied verbatim
  const koDur = s => s.replace(/\b(\d+)h(\d+)m\b/g, '$1시간 $2분').replace(/\b(\d+)h\b/g, '$1시간').replace(/\b(\d+)m\b/g, '$1분').replace(/\b(\d+)s\b/g, '$1초');
  const fmtLive = sec => sec < 10 ? '방금' : fmtDur(sec) + '째';
  // errored ssh channel: Korean next step chosen from the real error text (the text itself is shown separately, via textContent)
  // order matters: a changed key prints the WARNING block *and* "Host key verification failed"
  // "Bad owner or permissions on <path>": the constant fix below only touches %USERPROFILE%\.ssh\config, so it is offered only
  // when that is the file named (or no file is named). Any other file (e.g. C:\ProgramData\ssh\ssh_config) -> kind 'badpermx'.
  const badpermPath = e => { const m = /Bad owner or permissions on (.+)$/m.exec(String(e || '')); return m ? m[1].trim().replace(/^["']+|["':]+$/g, '') : ''; };
  const profileOf = p => { const m = /^([A-Za-z]:[\\/]+Users[\\/]+[^\\/]+)[\\/]/i.exec(String(p || '')); return m ? m[1].replace(/[\\/]+/g, '\\').toLowerCase() : ''; };
  function ownSshConfig(p) {
    if (!p) return true;
    if (/^(?:%USERPROFILE%|\$env:USERPROFILE|~)[\\/]+\.ssh[\\/]+config$/i.test(p)) return true;
    if (!/^[A-Za-z]:[\\/]+Users[\\/]+[^\\/]+[\\/]+\.ssh[\\/]+config$/i.test(p)) return false;
    const mine = M.app && profileOf(M.app.logdir + '\\');   // the hub's log dir lives in the user's profile: when known, the names must match
    return !mine || profileOf(p) === mine;
  }
  const sshKind = e => { e = String(e || ''); return /REMOTE HOST IDENTIFICATION HAS CHANGED/i.test(e) ? 'hostchanged' : /Host key verification failed/i.test(e) ? 'hostkey' : /Bad owner or permissions on/i.test(e) ? (ownSshConfig(badpermPath(e)) ? 'badperm' : 'badpermx') : /Permission denied/i.test(e) ? 'perm' : /Could not resolve|Connection refused|timed out|No route/i.test(e) ? 'net' : /python3?: (not found|No such file)|command not found/i.test(e) ? 'nopy' : /No such file or directory|WinError 2|지정된 파일/i.test(e) ? 'nossh' : 'other'; };
  const HINT = {
    hostkey: '처음 연결하는 서버입니다 — 키 등록하기 버튼으로 호스트 키를 확인하고 접속을 등록하세요.',
    perm: '키 로그인이 되지 않습니다 — 키 등록하기 버튼으로 비밀번호를 한 번만 입력해 등록하세요.',
    hostchanged: '서버의 신원이 바뀌었습니다 — 서버 관리자에게 확인하기 전에는 접속하지 마세요. 확인 후 키 등록하기로 다시 등록합니다.',
    net: '서버에 닿지 않습니다. 주소·포트·네트워크(VPN)를 확인하세요.',
    nopy: '서버에 python3 가 없습니다. channels.json 의 python 값을 확인하세요.',
    nossh: 'ssh 프로그램을 찾지 못했습니다. Windows 설정에서 OpenSSH 클라이언트를 설치하세요.',
    badperm: 'Windows가 이 PC의 ssh 설정 파일 권한을 거부했습니다 — 서버 문제가 아니라 이 PC의 권한 문제입니다. 아래 명령을 PowerShell에 붙여 넣으세요.',
  };
  // kind badperm (ADD-SERVER-ENG §10): generic fix, no user names; the command is a constant
  const BADPERM = { title: '이 PC의 SSH 설정 파일 권한 문제입니다', cmd: '$f = "$env:USERPROFILE\\.ssh\\config"; $me = whoami; icacls $f /setowner $me; icacls $f /inheritance:r /grant:r "${me}:F"', extra: '그래도 같으면 ssh -V 가 8.x 인지 확인하고 OpenSSH 를 새 버전으로 올리세요' };
  const sshHint = e => { const k = sshKind(e); return k === 'badpermx' ? 'Windows가 이 PC의 ssh 설정 파일 ' + badpermPath(e) + ' 의 권한을 거부했습니다 — 내 사용자 폴더의 .ssh\\config 가 아니므로 관리자 권한 PowerShell에서 이 파일의 소유자·권한을 고쳐야 합니다 (자동 명령 없음).' : HINT[k] || '허브 창의 로그를 확인하세요.'; };
  const sshFix = c => c.kind === 'ssh' && c.state === 'error' && ['perm', 'hostkey', 'hostchanged'].includes(sshKind(c.error));   // these three get the 키 등록하기 button
  const sshErr = e => (String(e || '').split('\n').map(x => x.trim()).filter(Boolean).pop() || '').slice(0, 200);
  const fmtAgo = sec => sec < 10 ? '방금' : fmtDur(sec) + ' 전';
  const fmtAbs = ms => { const d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); };
  const fmtHM = ms => { const d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  // Live elapsed element: ticks every second from an absolute epoch ms. mode: live (12분째) | ago (2분 전) | dur (12분)
  function timeEl(t0, mode = 'live', cls = 'rel') {
    const el = h('span', { class: cls, data: { t0: Math.round(t0), tf: mode } });
    tickOne(el, Date.now());
    return el;
  }
  function setTime(el, t0, mode) { if (t0 == null) { delete el.dataset.t0; text(el, ''); attr(el, 'title', null); return; } el.dataset.t0 = Math.round(t0); if (mode) el.dataset.tf = mode; tickOne(el, Date.now()); }
  function tickOne(el, now) {
    const t0 = +el.dataset.t0; if (!t0) return;
    text(el, fmtBy(el.dataset.tf, (now - t0) / 1000));
    const abs = fmtAbs(t0); if (el.title !== abs) el.title = abs;
  }
  // quiet / wait name the clock: time since the last signal ('12분째 조용함') vs since the turn began (plain 'live')
  const fmtBy = (f, s) => f === 'ago' ? fmtAgo(s) : f === 'dur' ? fmtDur(s) : f === 'quiet' || f === 'wait' ? (s < 10 ? '방금' : fmtDur(s) + '째 ' + (f === 'quiet' ? '조용함' : '대기')) : fmtLive(s);
  // a dead channel's last snapshot must not look alive: the age freezes at the moment of the last collection (no data-t0, so the ticker skips it)
  function setTimeFor(el, t0, mode, ch) {
    if (t0 == null || !isDead(ch)) return setTime(el, t0, mode);
    const ref = (M.states[ch] && M.states[ch].recvMs) || M.t || Date.now();
    delete el.dataset.t0; el.dataset.tf = mode;
    text(el, fmtBy(mode, Math.max(0, (ref - t0) / 1000))); attr(el, 'title', '마지막 수집 기준 · ' + fmtAbs(ref));
  }
  setInterval(() => { const now = Date.now(); for (const el of document.querySelectorAll('[data-t0]')) tickOne(el, now); }, 1000);

  // ---------- storage ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } },
  };
  // settings (room.settings) — DIRECTION §6
  const S = Object.assign({ theme: 'system', motion: 'system', notify: false, titleBadge: true, interval: 3, stallMin: 5, longMin: 30, talkOn: true }, store.get('room.settings', {}));
  delete S.showKids;   // moved to U.showKids (CHAT-UX §3)
  // per-user UI state (room.ui) — CHAT-UX §3: chip filter, sort, open room, drawer, last-viewed marks, 하위 rows, 조용함 expand
  const U = Object.assign({ expanded: {}, chFilter: 'all', sort: 'recent', room: null, drawer: false, seen: {}, showKids: false, quietOpen: false, flowText: false }, store.get('room.ui', {}));
  delete U.lastFocus;   // retired field (nothing read it)
  if (!U.seen || typeof U.seen !== 'object') U.seen = {};
  { const old = store.get('room.settings', {}); if (old && old.showKids === true && !U.showKids) U.showKids = true; }   // moved from room.settings (CHAT-UX §3)
  if (!['recent', 'long', 'name'].includes(U.sort)) U.sort = 'recent';
  if (typeof U.chFilter !== 'string') U.chFilter = 'all';
  if (!U.expanded || typeof U.expanded !== 'object') U.expanded = {};
  let saveT = 0;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { store.set('room.settings', S); store.set('room.ui', U); }, 150); };
  // 알림 feed survives reloads: last 500 events / 7 days, agent snapshot trimmed to what the feed shows
  const AG = ['ch', 'id', 'tool', 'name', 'last', 'now', 'why'];
  let evT = 0;
  const saveEvents = () => { clearTimeout(evT); evT = setTimeout(() => store.set('room.events', M.events.slice(0, 500).map(e => ({ id: e.id, t: e.t, type: e.type, key: e.key, from: e.from, to: e.to, pid: e.pid, cmd: e.cmd, dur: e.dur, ch: e.ch, read: !!e.read, agent: e.agent && Object.fromEntries(AG.map(k => [k, e.agent[k]])) }))), 300); };
  function loadEvents() {
    const raw = store.get('room.events', []), min = Date.now() - 7 * 864e5;
    return (Array.isArray(raw) ? raw : []).filter(e => e && typeof e === 'object' && Number.isFinite(+e.t) && +e.t > min && ['start', 'status', 'proc-done', 'gone', 'chan'].includes(e.type)).slice(0, 500).map(e => {
      const a = e.agent && typeof e.agent === 'object' ? e.agent : null;
      return { id: str(e.id, 300), t: +e.t, type: e.type, key: str(e.key, 300), from: ST[e.from] ? e.from : undefined, to: ST[e.to] || e.to === 'error' || e.to === 'ok' ? e.to : undefined, pid: e.pid == null ? undefined : num(e.pid), cmd: e.cmd == null ? undefined : str(e.cmd, 400), dur: num(e.dur), ch: str(e.ch, 64), read: !!e.read, saved: true,
        agent: a ? { ch: str(a.ch, 64), id: str(a.id, 200), tool: ['codex', 'claude', 'agy'].includes(a.tool) ? a.tool : 'claude', name: str(a.name, 300), last: a.last == null ? null : str(a.last, 400), now: a.now == null ? null : str(a.now, 400), why: str(a.why, 300) } : null };
    });
  }
  // ---------- room timelines (CHAT-UX §5): acts ring per agent key, survives restarts (last 30 per room, <= 2000 total, 24 h) ----------
  const KINDS = ['user', 'say', 'tool', 'spawn', 'ask', 'done', 'err'];
  const toolBase = x => String(x).replace(/ ×\d+$/, '');
  const A = { rooms: {}, scroll: {}, talks: {}, mg: {}, open: new Set(), draft: {} };   // talks[key] = my sent talks (persisted) ; mg[key] = Map id -> msg (memory) ; open = expanded card ids ; draft[key] = composer text (memory)   // rooms[key] = [{t ms, k, x}] sorted by t, <= 200 ; at[key] = ms the agent was last present
  A.at = {};
  (function loadRooms() {
    const raw = store.get('room.acts', {}), min = Date.now() - 864e5;
    if (!raw || typeof raw !== 'object') return;
    for (const [k, v] of Object.entries(raw)) {
      if (!v || typeof v !== 'object' || !Array.isArray(v.a) || !(+v.at > min)) continue;
      const items = v.a.filter(x => Array.isArray(x) && Number.isFinite(+x[0]) && KINDS.includes(x[1])).map(x => ({ t: +x[0], k: x[1], x: str(x[2], 400) }));
      if (items.length) { A.rooms[str(k, 300)] = items; A.at[k] = +v.at; }
    }
  })();
  let actT = 0;
  const saveActs = () => { clearTimeout(actT); actT = setTimeout(() => {
    let left = 2000; const out = {};
    for (const k of Object.keys(A.rooms).sort((a, b) => (A.at[b] || 0) - (A.at[a] || 0))) { const it = A.rooms[k].slice(-Math.min(30, left)); if (!it.length) continue; left -= it.length; out[k] = { at: A.at[k] || 0, a: it.map(x => [x.t, x.k, x.x]) }; if (left <= 0) break; }
    store.set('room.acts', out); }, 400); };
  // my 에겐 톡 talks per room (TALK-UX §5.5): ring <= 50, 24 h. A talk still 'sending' after a restart can only be 'unknown'.
  const TSTATE = ['sending', 'delivered', 'held', 'refused', 'unreach', 'unknown'];
  const DIRS = ['down', 'follow', 'up'], MKINDS = ['agent', 'workflow', 'codex', 'agy', 'peer', 'talk'];
  const validMsg = m => m && typeof m === 'object' && DIRS.includes(m.dir) && MKINDS.includes(m.kind) && /^[0-9a-f]{12}$/.test(m.id) && (m.msg_id === '' || /^at-[0-9a-f]{8}$/.test(m.msg_id)) && typeof m.truncated === 'boolean' && typeof m.encrypted === 'boolean' && Number.isFinite(+m.t) && +m.t > Date.now() - 864e5 && typeof m.text === 'string';
  (function loadTalks() {
    const raw = store.get('room.talks', {}), min = Date.now() - 864e5;
    if (!raw || typeof raw !== 'object') return;
    for (const [k, v] of Object.entries(raw)) {
      if (!Array.isArray(v)) continue;
      const it = v.filter(e => e && typeof e === 'object' && /^[A-Za-z0-9_-]{1,64}$/.test(e.cid) && typeof e.text === 'string' && +e.t > min).slice(-50)
        .map(e => ({ cid: e.cid, text: str(e.text, 4000), t: +e.t, st: e.st === 'sending' ? 'unknown' : TSTATE.includes(e.st) ? e.st : 'unknown', hat: num(e.hat) || null, mid: /^at-[0-9a-f]{8}$/.test(e.mid) ? e.mid : '', why: str(e.why, 200) }));
      if (it.length) A.talks[str(k, 300)] = it;
    }
  })();
  function loadMsgs() {
    const raw = store.get('room.msgs', {}), min = Date.now() - 864e5;
    if (!raw || typeof raw !== 'object') return;
    let left = 2000, chars = 0;
    const newest = v => Math.max(0, ...(Array.isArray(v) ? v.filter(m => m && typeof m === 'object').map(m => +m.t || 0) : []));
    for (const [k, v] of Object.entries(raw).sort((a, b) => newest(b[1]) - newest(a[1]))) {
      if (!Array.isArray(v) || left <= 0) continue;
      const it = v.filter(m => validMsg(m) && +m.t > min).slice(-Math.min(8, left));
      if (it.length) { A.mg[str(k, 300)] = new Map(it.map(m => [m.id, m])); left -= it.length; chars += it.reduce((n, m) => n + m.text.length, 0); if (chars > 1e6) break; }
    }
  }
  loadMsgs();
  let msgT = 0;
  const saveMsgs = (now = false) => { clearTimeout(msgT); const write = () => {
    let left = 2000, chars = 0; const min = Date.now() - 864e5, out = {};
    for (const [k, mp] of Object.entries(A.mg).sort((a, b) => Math.max(...[...b[1].values()].map(m => m.t)) - Math.max(...[...a[1].values()].map(m => m.t)))) {
      const it = [...mp.values()].filter(m => m.t > min).sort((a, b) => a.t - b.t).slice(-Math.min(8, left));
      if (it.length) { out[k] = it; left -= it.length; chars += it.reduce((n, m) => n + m.text.length, 0); }
      if (!left) break;
      if (chars > 1e6) break;
    }
    store.set('room.msgs', out);
  }; if (now) write(); else msgT = setTimeout(write, 300); };
  let talkT = 0;
  const saveTalks = () => { clearTimeout(talkT); talkT = setTimeout(() => { const out = {}; for (const [k, v] of Object.entries(A.talks)) if (v.length) out[k] = v.slice(-50).map(e => ({ cid: e.cid, text: e.text, t: e.t, st: e.st, hat: e.hat, mid: e.mid, why: e.why })); store.set('room.talks', out); }, 200); };
  const TOL = 3000;   // ms: the same act seen again may differ by clock-skew jitter (a reload recomputes the skew), so ids match by kind + text + time within 3 s
  function accumulate(a, now) {
    const ring = A.rooms[a.key] || (A.rooms[a.key] = []); A.at[a.key] = now; let add = false;
    if (!a.acts.length) return;
    const base = e => e.k === 'tool' ? toolBase(e.x) : e.x, old = ring.slice(), used = new Set();   // each server act matches one ring entry that existed before this call
    for (const n of a.acts) {
      let same = null; const nb = base(n);
      for (const tol of [0, TOL]) {   // an exact t wins over the ±3 s window when pairing identical entries
        for (let i = old.length - 1; i >= 0 && old[i].t >= n.t - tol; i--) { const e = old[i]; if (!used.has(e) && e.k === n.k && Math.abs(e.t - n.t) <= tol && (e.x === n.x || (n.k === 'tool' && base(e) === nb))) { same = e; break; } }
        if (same) break;
      }
      if (same) { used.add(same); if (same.x !== n.x) { same.x = n.x; add = true; } continue; }   // a folded ×N run keeps its first t, so x just updates in place
      let j = ring.length; while (j > 0 && ring[j - 1].t > n.t) j--; ring.splice(j, 0, { t: n.t, k: n.k, x: n.x }); add = true;   // keep the ring sorted: the scan above relies on it
    }
    if (add) { if (ring.length > 200) ring.splice(0, ring.length - 200); saveActs(); }
  }
  const acts = key => A.rooms[key] || [];
  const mq = matchMedia('(prefers-color-scheme: dark)');
  function applySettings() {
    const html = document.documentElement;
    html.dataset.theme = S.theme === 'system' ? '' : S.theme;
    if (!html.dataset.theme) html.removeAttribute('data-theme');
    html.classList.toggle('dark', S.theme === 'dark' || (S.theme === 'system' && mq.matches));
    html.dataset.motion = S.motion === 'reduce' ? 'reduce' : S.motion === 'full' ? 'full' : '';
    if (!html.dataset.motion) html.removeAttribute('data-motion');
    text($('#pollsec'), S.interval + '초');
    save(); emit('settings', S);
  }
  mq.addEventListener('change', applySettings);

  // ---------- event bus ----------
  const subs = {};
  const on = (ev, fn) => ((subs[ev] = subs[ev] || []).push(fn), fn);
  const emit = (ev, ...a) => (subs[ev] || []).forEach(fn => { try { fn(...a); } catch (e) { console.error(ev, e); } });

  // ---------- model ----------
  const ST = { work: '작업 중', tool: '도구 실행 중', child: '하위 대기', user: '입력 대기', stall: '응답 없음', idle: '쉬는 중', done: '완료', stopped: '중단됨', dead: '끊김' };
  const LIVE = new Set(['work', 'tool', 'child']), REST = new Set(['idle', 'done', 'stopped', 'dead']);
  const LIVE_BUSY = new Set(['work', 'tool']);   // work<->tool flaps carry no information (same blue)
  const OLD = 600;                               // s; stopped/dead younger than this still count as "waiting for me"
  // waiting for me = user + stall + unexpected (recent) stopped/dead
  const isWaiting = a => a.st === 'user' || a.st === 'stall' || ((a.st === 'stopped' || a.st === 'dead') && a.age < OLD);
  // 나를 기다림 order: blockers first (oldest-waiting first inside a rank); '답변 끝남' rows last, newest first
  const calm = a => a.st === 'user' && /^답변 끝남/.test(a.why);
  const waitT = a => a.lastAt != null ? a.lastAt : a.t0 != null ? a.t0 : 0;
  const wrank = a => calm(a) ? 2 : a.st === 'user' ? 0 : 1;   // 0 asks me something, 1 stalled/stopped/dead, 2 turn just ended
  const waitCmp = (a, b) => (wrank(a) - wrank(b)) || (wrank(a) === 2 ? waitT(b) - waitT(a) : waitT(a) - waitT(b)) || (a.key < b.key ? -1 : 1);
  const M = {
    channels: [],          // [{id,name,kind,state,error,t,ms(latency ms|null),stale}]
    states: {},            // chId -> raw collector state (time, host, user, os, warnings)
    agents: new Map(),     // key "ch:id" -> agent
    roots: {},             // chId -> [agent]
    events: loadEvents(),  // transition events, newest first, cap 500 (restored from room.events)
    app: null, presets: [], skew: {}, tsPrev: {}, waiting: [], counts: {}, t: 0, first: true, loaded: false, hubDown: null,
  };
  // agent = {key, ch, id, tool, name, st, why, age, since, now, last, meta, procs, hidden, t0 (turn start ms|null),
  //          lastAt (ms of last signal), parent (key|null), depth, root (key), kids [key], path [names], node (raw)}
  // acts: server clock -> client clock (skew), junk dropped, sorted by t BEFORE the 12-item cut (ACTIVITY-ENG "Clock skew")
  function normActs(list, skew) {
    if (!Array.isArray(list)) return [];
    const ok = []; let sorted = true, prevT = 0;
    for (const x of list) {
      if (!x || typeof x !== 'object') continue;
      const t = +x.t;
      if (!(t > 1e9 && t < 1e10) || !KINDS.includes(x.k) || typeof x.x !== 'string' || !/\S/.test(x.x)) continue;
      if (t < prevT) sorted = false; prevT = t; ok.push(x);
    }
    if (!sorted) ok.sort((p, q) => p.t - q.t);
    return (ok.length > 12 ? ok.slice(-12) : ok).map(x => { const l = x.x.length > 400 ? str(x.x, 400) : x.x, nl = l.indexOf('\n'); return { t: Math.round(+x.t * 1000 + skew), k: x.k, x: nl < 0 ? l : l.slice(0, nl) }; });
  }
  // msgs (TALK-ENG §1.1): who said what to whom. from/to are node ids or labels; the UI resolves them to keys at render time.
  function normMsgs(list, skew, ch) {
    if (!Array.isArray(list)) return [];
    const out = [];
    for (const m of list.slice(0, 16)) {
      if (!m || typeof m !== 'object' || !DIRS.includes(m.dir) || !MKINDS.includes(m.kind) || !/^[0-9a-f]{12}$/.test(String(m.id)) || !(+m.ts > 1e9 && +m.ts < 1e10) || (m.text != null && typeof m.text !== 'string')) continue;
      const tx = m.text || '';
      out.push({ id: m.id, dir: m.dir, kind: m.kind, ch, from: str(m.from, 300), to: str(m.to, 300), who: str(m.who, 80), t: Math.round(+m.ts * 1000 + skew), text: tx.length > 4000 ? tx.slice(0, 4000) : tx,
        truncated: m.truncated === true || tx.length > 4000, n: num(m.n), encrypted: m.encrypted === true, role: str(m.role, 60), msg_id: /^at-[0-9a-f]{8}$/.test(String(m.msg_id)) ? m.msg_id : '', by: str(m.by, 80) });
    }
    return out;
  }
  const normTalk = t => !t || typeof t !== 'object' ? null : { ok: t.ok === true, reason: str(t.reason, 40), hold: t.hold === true, max: Number.isInteger(t.max) && t.max > 0 && t.max <= 4000 ? t.max : 4000 };
  function mergeMsgs(a) {
    if (!a.msgs.length) return;
    const mp = A.mg[a.key] || (A.mg[a.key] = new Map());
    for (const m of a.msgs) { const old = mp.get(m.id); mp.set(m.id, { ...m, text: m.truncated && old && m.text.length < old.text.length ? old.text : m.text, kid: a.name }); }
    if (mp.size > 30) for (const k of [...mp.keys()].sort((x, y) => mp.get(x).t - mp.get(y).t).slice(0, mp.size - 30)) mp.delete(k);
    saveMsgs();
  }
  const msgs = key => A.mg[key] ? [...A.mg[key].values()].sort((x, y) => x.t - y.t) : [];
  function normalize(ch, n, parent, depth, out, recvMs, skew = 0) {
    if (!n || typeof n !== 'object') return null;
    const id = str(n.id, 200) || Math.random().toString(36).slice(2);
    if (out.has(ch + ':' + id)) return null;   // duplicate id (would make a parent cycle / double keyed node)
    const a = {
      key: ch + ':' + id, ch, id, tool: ['codex', 'claude', 'agy'].includes(n.tool) ? n.tool : 'claude',
      name: str(n.name, 300) || '?', st: ST[n.st] ? n.st : 'idle', why: koDur(str(n.why, 300)),
      age: n.age == null ? null : num(n.age), since: n.since == null ? null : num(n.since),
      now: n.now == null ? null : koText(str(n.now, 400)), last: n.last == null ? null : koText(str(n.last, 400)), meta: str(n.meta, 300),
      procs: Array.isArray(n.procs) ? n.procs.map(p => ({ pid: num(p && p.pid), cmd: str(p && p.cmd, 400), age: num(p && p.age), cpu: num(p && p.cpu), state: /^[RDSZT]$/.test(p && p.state) ? p.state : 'S', kid: str(p && p.kid, 200), bg: !!(p && p.bg) })) : [],
      hidden: num(n.hidden), parent, depth, kids: [], node: n, recvMs,
      // acts: server clock -> client clock (skew), junk dropped, sorted by t BEFORE the 12-item cut (ACTIVITY-ENG "Clock skew")
      acts: normActs(n.acts, skew), msgs: normMsgs(n.msgs, skew, ch), talk: normTalk(n.talk),
    };
    a.t0 = a.since == null ? null : recvMs - a.since * 1000;
    a.lastAt = a.age == null ? null : recvMs - a.age * 1000;
    a.root = parent ? out.get(parent).root : a.key;
    out.set(a.key, a);
    for (const k of Array.isArray(n.kids) ? n.kids : []) { const c = normalize(ch, k, a.key, depth + 1, out, recvMs, skew); if (c) a.kids.push(c.key); }
    return a;
  }
  function merge(chans, states) {
    const prevCh = new Map(M.channels.map(c => [c.id, c.state])), recvMs = Date.now(), seen0 = new Set(Object.keys(M.states)), prev = M.agents, next = new Map(), roots = {}, events = [];
    M.channels = chans.map(c => ({ id: str(c.id, 64), name: str(c.name, 80) || str(c.id, 64), kind: ['ssh', 'local', 'argv'].includes(c.kind) ? c.kind : 'ssh', state: ['ok', 'connecting', 'error'].includes(c.state) ? c.state : 'error', error: c.error == null ? null : str(c.error, 300), t: c.t == null ? null : num(c.t) * 1000, stale: false,
      port: Number.isInteger(c.port) && c.port >= 1 && c.port <= 65535 ? c.port : null, auth: str(c.auth, 20), ssh: str(c.ssh, 200), args: Array.isArray(c.ssh_args) ? c.ssh_args.map(x => str(x, 300)) : [] }));
    for (const c of M.channels) {
      const s = states[c.id];
      if (!s || typeof s !== 'object' || !Array.isArray(s.agents) || (c.state === 'error' && M.states[c.id])) { if (M.states[c.id]) c.stale = true; roots[c.id] = M.roots[c.id] || []; continue; }
      M.states[c.id] = { time: str(s.time, 20), host: str(s.host, 100), user: str(s.user, 100), os: s.os === 'windows' ? 'windows' : 'linux', warnings: Array.isArray(s.warnings) ? s.warnings.map(w => str(w, 300)) : [], recvMs };
      const ref = c.t && Math.abs(recvMs - c.t) < 60000 ? c.t : recvMs;   // anchor on the hub's receive time: no per-poll jitter
      const sk = Number.isFinite(+s.ts) && +s.ts > 1e9 ? ref - s.ts * 1000 : 0;   // server clock offset, anchored on the hub's receive time (c.t): the snapshot's age must not leak into it
      if (M.skew[c.id] == null) M.skew[c.id] = sk;
      else if (+s.ts !== M.tsPrev[c.id] && Math.abs(M.skew[c.id] - sk) > 3000) {   // the server clock really stepped: move what is already in the rings so nothing duplicates
        const d = sk - M.skew[c.id]; M.skew[c.id] = sk;
        for (const k of Object.keys(A.rooms)) if (k.startsWith(c.id + ':')) for (const e of A.rooms[k]) e.t += d;
        saveActs();
      }   // an unchanged ts is a cached state: no new information about the clock
      M.tsPrev[c.id] = +s.ts;
      roots[c.id] = s.agents.map(n => normalize(c.id, n, null, 0, next, ref, M.skew[c.id])).filter(Boolean);
      if (c.state === 'error') c.stale = true;
    }
    // keep agents of stale channels (last snapshot) so the list never blanks out
    for (const c of M.channels) if (c.stale) for (const [k, a] of prev) if (a.ch === c.id) next.set(k, a);
    // channel transitions: losing a server is exactly what has to be pushed to the owner
    for (const c of M.channels) { const was = prevCh.get(c.id); if (was === 'ok' && c.state === 'error') events.push({ type: 'chan', key: 'chan:' + c.id, to: 'error', ch: c.id }); else if (was === 'error' && c.state === 'ok') events.push({ type: 'chan', key: 'chan:' + c.id, to: 'ok', ch: c.id }); }
    // transitions
    for (const [k, a] of next) {
      const p = prev.get(k);
      if (!p) { if (!M.first && seen0.has(a.ch)) events.push({ type: 'start', key: k, to: a.st }); continue; }
      if (p.st !== a.st && !(LIVE_BUSY.has(p.st) && LIVE_BUSY.has(a.st))) events.push({ type: 'status', key: k, from: p.st, to: a.st });
      for (const pp of p.procs) if (pp.age >= 300 && !a.procs.some(q => q.pid === pp.pid)) events.push({ type: 'proc-done', key: k, pid: pp.pid, cmd: pp.cmd, dur: pp.age });
    }
    for (const [k, p] of prev) if (!next.has(k) && !M.first) events.push({ type: 'gone', key: k, from: p.st });
    for (const e of events) { e.t = recvMs; e.id = recvMs + ':' + e.key + ':' + e.type + (e.pid != null ? ':' + e.pid : ''); const a = next.get(e.key) || prev.get(e.key); e.agent = a; e.ch = a ? a.ch : e.ch; e.read = false; }
    M.events = events.concat(M.events).slice(0, 500); if (events.length) saveEvents();
    M.agents = next; M.roots = roots; M.t = recvMs;
    const sameActs = (p, q) => p.length === q.length && p.every((x, i) => x.t === q[i].t && x.k === q[i].k && x.x === q[i].x);
    for (const a of next.values()) { const p = prev.get(a.key); if (p === a) continue; mergeMsgs(a); if (p && sameActs(p.acts, a.acts)) A.at[a.key] = recvMs; else accumulate(a, recvMs); }   // a stale channel reuses its old object; an unchanged act list costs one compare   // every object built this poll (stale channels reuse the old object: skipped)
    let pruned = false;
    for (const k of Object.keys(A.at)) if (recvMs - A.at[k] > 864e5) { delete A.rooms[k]; delete A.at[k]; delete A.scroll[k]; delete A.mg[k]; pruned = true; }
    let uPruned = false;   // per-room UI marks die with the room's data, or room.ui grows forever
    for (const m of [U.seen, U.expanded, U.boardExp]) if (m && typeof m === 'object') for (const k of Object.keys(m)) if (!next.has(k) && !(k in A.at)) { delete m[k]; uPruned = true; }
    if (uPruned) save();
    for (const [k, mp] of Object.entries(A.mg)) { for (const [id, m] of mp) if (recvMs - m.t > 864e5) { mp.delete(id); pruned = true; } if (!mp.size) delete A.mg[k]; }
    if (pruned) saveMsgs();
    // derived
    M.waiting = [...next.values()].filter(isWaiting);
    M.counts = {}; for (const a of next.values()) { M.counts[a.st] = (M.counts[a.st] || 0) + 1; M.counts.all = (M.counts.all || 0) + 1; }
    M.counts.waiting = M.waiting.length;
    M.first = false; M.loaded = true;
    emit('model', M);
    if (events.length) emit('events', events);
  }
  // counts helpers for views
  const agentsOf = ch => [...M.agents.values()].filter(a => !ch || ch === 'all' || a.ch === ch);
  const chan = id => M.channels.find(c => c.id === id);
  const chName = id => { const c = chan(id); return c ? c.name : (id || ''); };
  const isDead = id => { const c = chan(id); return !!c && (!!M.hubDown || c.state === 'error' || c.stale); };

  // ---------- polling ----------
  let timer = 0, paused = false, inflight = false;
  async function getJSON(url) {
    const r = await fetch(url, { cache: 'no-store' });
    let body = null; try { body = await r.json(); } catch { }
    return { ok: r.ok, status: r.status, body };
  }
  const TOKEN = (document.querySelector('meta[name=at-token]') || {}).content || '';
  // token-protected POST (relative path: the page lives under /<secret>/). body: object or an already-serialised JSON string
  async function apiPost(path, body) {
    const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-AT-Token': TOKEN }, body: typeof body === 'string' ? body : JSON.stringify(body || {}) });
    let b = null; try { b = await r.json(); } catch { }
    return { ok: r.ok, status: r.status, body: b };
  }
  async function poll() {
    if (inflight) return; inflight = true;
    try {
      const ch = await getJSON('api/channels');
      const chans = Array.isArray(ch.body) ? ch.body : [];
      const res = await Promise.all(chans.map(c => getJSON('api/state?ch=' + encodeURIComponent(c.id)).catch(() => ({ ok: false }))));
      const states = {}; chans.forEach((c, i) => { if (res[i].ok && res[i].body) states[c.id] = res[i].body; });
      if (!ch.ok && !chans.length) hubDown(ch.status || 'down');
      else { M.hubDown = null; document.documentElement.classList.remove('hubdown'); merge(chans, states); }
    } catch (e) { hubDown('down'); }
    finally { inflight = false; schedule(); }
  }
  // hub unreachable: everything on screen is the last snapshot. Mark it so (views read M.hubDown), do not leave it looking live.
  function hubDown(why) {
    M.hubDown = why; document.documentElement.classList.add('hubdown');
    emit('hub', why); emit('hubview');
  }
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(poll, S.interval * 1000);
    const arc = $('#ring .arc'); if (arc) { arc.style.transition = 'none'; arc.style.strokeDashoffset = '37.7'; void arc.getBoundingClientRect(); arc.style.transition = 'stroke-dashoffset ' + S.interval + 's linear'; arc.style.strokeDashoffset = '0'; }
  }
  const refresh = () => { clearTimeout(timer); poll(); };
  function setPaused(v) {
    paused = v; document.documentElement.classList.toggle('paused', v);
    attr($('#pause'), 'aria-pressed', v ? 'true' : 'false'); attr($('#pause'), 'aria-label', v ? '재개' : '일시정지'); attr($('#pause'), 'title', v ? '재개 (p)' : '일시정지 (p)');
    if (!v) refresh();   // paused keeps polling (badges, title, toasts); the view just stays frozen
    emit('pause', v); updateTitle();
  }

  // ---------- router / views ----------
  // routes (CHAT-UX §3): chat | chat/<ch>/<id> | board | settings. Old routes redirect (s/<ch>/<id> → room, ch/<id> → chat + chip, all/long/feed → chat).
  const views = {};             // name -> def {root?, mount(root), show(params), update(M, params), hide()}
  let active = null, params = {};
  function view(name, def) { views[name] = def; def.name = name; }
  const enc = encodeURIComponent;
  function parse() {
    const p = location.hash.replace(/^#\/?/, '').split('/').map(x => { try { return decodeURIComponent(x); } catch { return x; } });
    const head = p[0] || 'chat';
    if (head === 'board' || head === 'settings') return { view: head, hash: '#/' + head };
    if (head === 'chat' || head === 's') {
      const ch = p[1] || '', q = p.slice(2), flow = q.length > 1 && q[q.length - 1] === 'flow' && head === 'chat'; if (flow) q.pop();   // #/chat/<ch>/<id>/flow = 흐름 mode of that room
      const id = q.join('/'), ok = !!(ch && id);
      return { view: 'chat', ch: ok ? ch : '', id: ok ? id : '', flow: ok && flow, hash: ok ? '#/chat/' + enc(ch) + '/' + enc(id) + (flow ? '/flow' : '') : '#/chat', fix: head === 's' };
    }
    if (head === 'ch' && p[1]) { U.chFilter = p[1]; return { view: 'chat', ch: '', id: '', hash: '#/chat', fix: true }; }
    return { view: 'chat', ch: '', id: '', hash: '#/chat', fix: true };
  }
  const go = hash => { location.hash = '#/' + hash; };
  const openRoom = (ch, id) => go('chat/' + enc(ch) + '/' + enc(id));
  const closeRoom = () => go('chat');
  const setFlow = on => { const p = params; if (p.ch && p.id) go('chat/' + enc(p.ch) + '/' + enc(p.id) + (on ? '/flow' : '')); };
  function openChannel(id) { U.chFilter = id || 'all'; save(); location.hash === '#/chat' ? route() : go('chat'); }
  function route() {
    const nu = parse();
    if (location.hash !== nu.hash) history.replaceState(null, '', nu.hash);
    params = nu; U.room = nu.view === 'chat' && nu.id ? nu.ch + ':' + nu.id : null;
    const def = views[params.view];
    if (active && active !== def) { active.hide && active.hide(); active.root.hidden = true; }
    for (const v of Object.values(views)) if (v !== def && v.root && !v.root.hidden) v.root.hidden = true;   // the chat root starts visible in the markup: hide it when another view is the first route
    if (!def.root) { def.root = h('section.view', { data: { view: def.name }, hidden: true }, h('div.wrap')); $('#views').append(def.root); def.mount && def.mount(def.root.firstElementChild, def.root); }
    def.root.hidden = false; active = def;
    $('#views').hidden = params.view === 'chat';
    def.show && def.show(params);
    if (M.loaded) def.update && def.update(M, params);
    emit('route', params);
    U.route = nu.hash.replace(/\/flow$/, ''); save();
  }
  addEventListener('hashchange', route);
  on('hubview', () => { if (!paused && active && active.update && M.loaded) active.update(M, params); });
  on('model', () => { if (!paused) active && active.update && active.update(M, params); });

  // ---------- keys ----------
  const keys = {};               // key -> fn ; single keys ignored while typing in inputs
  const key = (k, fn, label) => { keys[k] = { fn, label }; };
  const escStack = [];           // Esc order: palette → peek → filter (handlers return true when consumed)
  const onEsc = fn => escStack.unshift(fn);
  addEventListener('keydown', e => {
    if (e.isComposing || e.keyCode === 229) return;   // Korean IME composition: never a shortcut
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    if (e.key === 'Escape') { for (const fn of escStack) if (fn(e)) { e.preventDefault(); return; } return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); emit('palette'); return; }
    if (typing || e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.target === document.body && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { emit('arrow', e); return; }   // focus lost after navigation: the active view picks a row
    const k = keys[e.key]; if (k) { e.preventDefault(); k.fn(e); }
  });

  // ---------- title / badges ----------
  function updateTitle() {
    const n = M.counts.waiting || 0;
    const off = M.channels.filter(c => c.state === 'error').length;
    document.title = (S.titleBadge && n ? '(' + n + ') ' : '') + '에겐 톡' + (M.hubDown ? ' (허브 없음)' : off ? ' (채널 ' + off + '개 끊김)' : '') + (paused ? ' (일시정지)' : '');
    try { window.pywebview && window.pywebview.api && window.pywebview.api.title && window.pywebview.api.title(document.title); } catch { }   // native window title (no-op in a browser)
  }
  on('model', updateTitle); on('settings', updateTitle); on('hubview', updateTitle);

  // ---------- first-load query overrides (screenshot checks only): ?theme=dark&motion=reduce ----------
  const qs = new URLSearchParams(location.search);
  if (qs.get('theme')) S.theme = qs.get('theme');
  if (qs.get('motion')) S.motion = qs.get('motion');

  // server presets (ADD-SERVER-ENG §10): GET /api/presets -> [{name, host, port, added}]; refreshed when the channel list changes
  let presetSig = '';
  async function loadPresets() {
    try {
      const r = await getJSON('api/presets');
      M.presets = r.ok && Array.isArray(r.body) ? r.body.filter(p => p && typeof p === 'object' && /^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(String(p.host || ''))).slice(0, 50).map(p => ({ name: str(p.name, 40) || str(p.host, 253), host: str(p.host, 253), port: num(p.port, 22) >= 1 && num(p.port, 22) <= 65535 ? num(p.port, 22) : 22, added: !!p.added })) : [];
    } catch { M.presets = []; }
    emit('presets');
  }
  // app facts (PACKAGING-ENG / APP-UX §4): {version, mode: webview|browser|cli, logdir}; the endpoint may be missing -> app-only rows stay hidden
  async function loadApp() {
    try { const r = await getJSON('api/app'); M.app = r.ok && r.body && typeof r.body === 'object' ? { version: str(r.body.version, 40), mode: ['webview', 'browser', 'cli'].includes(r.body.mode) ? r.body.mode : 'cli', logdir: str(r.body.logdir, 300), talkMax: Number.isInteger(r.body.talk_max) && r.body.talk_max > 0 ? Math.min(r.body.talk_max, 4000) : 4000 } : null; if (M.app && typeof r.body.talk_on === 'boolean' && S.talkOn !== r.body.talk_on) { S.talkOn = r.body.talk_on; applySettings(); } } catch { M.app = null; }
    emit('app');
  }
  on('model', () => { const sg = M.channels.map(c => c.id + c.ssh).join('|'); if (sg !== presetSig) { presetSig = sg; loadPresets(); } });
  function boot() {
    applySettings();
    if (!location.hash) history.replaceState(null, '', U.route || '#/chat');   // parse() canonicalises old routes
    route();
    loadApp();
    // window focus: a cheap 'focus' event; only an open room needs a re-run (it marks itself seen once the window has focus)
    addEventListener('focus', () => { emit('focus'); if (U.room && !paused && M.loaded && active && active.update) active.update(M, params); });
    poll();
  }
  return { BADPERM, esc, num, str, koDur, normalize, h, svgUse, text, attr, cls, stClass, $, $$, keyed, keepScroll, isDead, setTimeFor, saveEvents, fmtDur, fmtLive, fmtAgo, sshHint, sshKind, sshFix, sshErr, fmtAbs, fmtHM, timeEl, setTime,
           store, S, U, A, acts, msgs, mergeMsgs, saveTalks, saveMsgs, loadMsgs, validMsg, setFlow, accumulate, toolBase, save, applySettings, on, emit, ST, LIVE, REST, OLD, isWaiting, waitCmp, waitT, M, agentsOf, chan, chName,
           refresh, loadPresets, apiPost, setPaused, isPaused: () => paused, view, go, openRoom, closeRoom, openChannel, route, params: () => params, key, keys, onEsc, updateTitle, boot };
})();
