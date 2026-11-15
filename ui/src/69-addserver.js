/* ===== 69-addserver.js — 서버 추가 dialog (IN-APP-SSH-ENG §3/§5). window.AddServer.open({ch?, host?, port?, name?}).
   Host, port, account and password are typed here; the password goes only into the POST body, is cleared from the field right after submit
   and is never kept by the page. Hub strings go through textContent only.
   key_rejected: the hub diagnoses over the still-open password session and waits in state confirm_fix; the card lists what it found and
   the exact fix commands, the answer goes to api/servers/job/confirm {action: 'fix', choice: fix | session | none}.
   open({ch, rekey: true}) on a password-session channel = 키 로그인 다시 설정 (reuses this run's password when the hub still has it). ===== */
window.AddServer = (() => {
  const { h, svgUse, text, attr, cls, M } = R;
  const TOKEN = (document.querySelector('meta[name=at-token]') || {}).content || '';
  const RE = { user: /^[A-Za-z_][A-Za-z0-9._-]{0,31}$/ };   // hosts: R.hostOk (names with . _ -, IPv4, bare IPv6)
  const STEPS = ['연결', '서버 확인', '키 등록', '접속 확인', '채널 등록'], GL = { pending: 'g-idle', active: 'g-work', user: 'g-user', done: 'g-done', error: 'g-dead' };
  const PH = { connecting: 0, confirm_hostkey: 1, installing_key: 2, verifying: 3, diagnosing: 3, confirm_fix: 3, fixing: 3 };
  const LIVE = ['connecting', 'confirm_hostkey', 'installing_key', 'verifying', 'diagnosing', 'confirm_fix', 'fixing'];
  const LV = { fix: '고칠 수 있음', admin: '관리자 필요', info: '참고' };
  const WHY_KR = '서버에서 찾은 원인은 아래와 같습니다. 이 내용을 서버 관리자에게 전달하거나, 이 세션 동안만 비밀번호로 연결할 수 있습니다 (비밀번호는 디스크에 저장되지 않고, 에겐 톡을 닫으면 사라집니다).';
  const SUB = '주소, 계정, 비밀번호를 적으면 이 PC 전용 키를 서버에 등록합니다.';
  const PRIV_S = '비밀번호는 디스크에 저장되지 않고 에겐 톡을 닫으면 사라집니다';
  // kind -> [title, plain-language sub, failed step (index) or fn(job), actions]; actions: [label, 'p'rimary | 'b'utton | 'l'ink, fn name]
  const ERR = {
    wrong_password: ['비밀번호가 맞지 않았습니다', '서버에 아무것도 바뀌지 않았습니다. 비밀번호를 확인하고 다시 입력하세요.', () => 0, [['다시 입력', 'p', 'retry'], ['계정 수정', 'l', 'user'], ['닫기', 'b', 'close']]],
    unreachable: ['서버에 닿지 않습니다', '주소·포트·네트워크(VPN)를 확인하세요. 다른 SSH 프로그램에서 접속되는 주소와 같은지 비교해 보세요.', () => 0, [['주소 수정', 'p', 'host'], ['다시 입력', 'l', 'retry'], ['닫기', 'b', 'close']]],
    host_key_changed: ['서버의 신원이 바뀌었습니다 — 등록을 중단했습니다', '이 서버의 호스트 키가 이 PC에 기록된 것과 다릅니다. 서버를 다시 설치했거나 주소가 다른 장비로 옮겨진 경우라면 정상입니다. 그렇지 않다면 중간에 다른 장비가 끼어들었을 수 있으니, 서버 관리자에게 확인하기 전에는 비밀번호를 입력하지 마세요.', () => 1, [['관리자에게 확인했습니다 — 기록을 지우고 다시 시도', 'b', 'forget'], ['닫기', 'p', 'close']]],
    no_python3: ['서버에 python3 가 없습니다', '키는 등록되어 접속은 되지만, 에겐 톡이 이 서버의 에이전트를 읽으려면 python3 가 필요합니다. 서버 관리자에게 설치를 요청하거나, python 명령 이름이 다르면 그 이름을 적고 다시 시도하세요.', () => 3, [['python 명령 바꾸기', 'p', 'py'], ['닫기', 'b', 'close']]],
    key_rejected: ['서버가 키 로그인을 허용하지 않습니다', '키는 서버에 등록됐지만 키로는 접속되지 않습니다. 서버가 키 로그인을 막고 있거나 ~/.ssh 폴더 권한이 맞지 않을 수 있습니다. 서버 관리자에게 확인하거나, 이 세션 동안만 비밀번호로 연결할 수 있습니다 (비밀번호는 디스크에 저장되지 않고, 에겐 톡을 닫으면 사라집니다).', () => 3, [['이 세션 동안만 비밀번호로 연결', 'p', 'session'], ['닫기', 'b', 'close']]],
    password_disabled: ['이 서버는 비밀번호 로그인이 꺼져 있습니다', '키로만 접속되는 서버라 비밀번호로는 키를 등록할 수 없습니다. 이미 접속할 수 있는 방법(다른 SSH 프로그램, 서버 관리자)으로 아래 명령을 서버에서 한 번 실행해 이 PC의 공개키를 등록한 뒤 다시 연결하세요.', () => 2, [['주소 수정', 'l', 'host'], ['닫기', 'b', 'close'], ['키를 등록했습니다 — 다시 연결', 'p', 'rekeyed']]],
    cancelled: ['취소했습니다', '등록을 취소했습니다. 서버에는 아무것도 바뀌지 않았습니다.', (p, j) => PH[j.phase || p.phase] || 0, [['다시 입력', 'p', 'retry'], ['닫기', 'b', 'close']]],
    hub_lost: ['허브가 응답하지 않습니다', '허브와의 연결이 끊겨 등록이 어디까지 진행됐는지 알 수 없습니다. 에겐 톡을 다시 시작한 뒤 다시 시도하세요. 이미 비밀번호를 보냈다면 서버에 키가 등록됐을 수 있습니다 — 서버의 ~/.ssh/authorized_keys 에서 \'agen-talk@PC이름\' 줄로 확인하세요.', (p, j) => PH[j.phase || p.phase] || 0, [['다시 입력', 'p', 'retry'], ['닫기', 'b', 'close']]],
    other: ['등록하지 못했습니다', '아래 로그를 확인하세요. 같은 내용이 반복되면 에겐 톡 로그 폴더의 로그와 함께 알려 주세요.', (p, j) => PH[j.phase || p.phase] || 0, [['다시 입력', 'p', 'retry'], ['계정 수정', 'l', 'user'], ['닫기', 'b', 'close']]],
  };
  let dlg, E = {}, job = null, timer = 0, flashT = 0, opener = null, fix = null, fixName = '', rekey = false, pwConn = false, reusePw = false, editing = false, sub0 = SUB, keyP = null;

  const api = (path, body) => fetch(path, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-AT-Token': TOKEN }, body: JSON.stringify(body) })
    .then(async r => ({ status: r.status, body: await r.json().catch(() => null) }));   // relative paths: the page lives under /<secret>/
  const parse = c => { const s = String(c.ssh || ''), i = s.lastIndexOf('@'), a = c.args || [], p = a.indexOf('-p'); return { user: i < 0 ? '' : s.slice(0, i), host: s.slice(i + 1), port: Number.isInteger(c.port) ? c.port : p >= 0 && /^\d+$/.test(a[p + 1]) ? +a[p + 1] : 22 }; };   // the channel's own port wins; 22 only when it has none
  const flash = (msg, ms) => { clearTimeout(flashT); text(E.flash, msg); E.flash.hidden = !msg; if (msg && ms) flashT = setTimeout(() => flash(''), ms); };
  const err = (k, msg, link) => { E[k + 'Err'].replaceChildren(...[msg, link].filter(Boolean)); E[k + 'Err'].hidden = !msg; attr(E[k], 'aria-invalid', msg ? 'true' : null); };
  const running = () => !!job && job.running;
  const pane = (n, sub) => { for (const k of ['form', 'prog', 'done']) E[k].hidden = k !== n; if (E.presets) E.presets.hidden = n !== 'form' || E.presets.children.length < 2; text(E.sub, sub || sub0); text(E.title, fix ? (rekey ? '키 로그인 다시 설정' : pwConn ? '비밀번호로 연결' : editing ? '서버 정보 수정' : '이 서버에 키 등록하기') + (fixName ? ' — ' + fixName : '') : '서버 추가'); };

  // ---------- the address field: what a pasted / typed address says ----------
  // user@host, user@host:2222, host:2222, [2001:db8::1]:2222, bare IPv6, ssh://user@host:2222, and ssh command lines
  // (ssh [-p N] [-l user] [-o Port=N|User=x] [harmless flags] [user@]host). -> {host, user, port} ('' = not said) | {bad: the part not understood} | null
  const NOARG = /^-[46CqtTvVxXyYaAkKnNgsfG]+$/, WITHARG = /^-[bBcDeEFiIJLmOQRSwW]$/;
  function parseDest(d) {
    let user = '', m;
    if ((m = /^ssh:\/\/([^/?#]+)(?:[/?#].*)?$/i.exec(d))) d = m[1];
    const at = d.lastIndexOf('@'); if (at >= 0) { user = d.slice(0, at); d = d.slice(at + 1); }
    if ((m = /^\[([^\]]+)\](?::(\d{1,5}))?$/.exec(d))) return { user, host: m[1], port: m[2] || '' };
    if (d.split(':').length === 2) { m = /^([^:]+):(\d{1,5})$/.exec(d); return m ? { user, host: m[1], port: m[2] } : null; }
    return d ? { user, host: d, port: '' } : null;   // a name, IPv4, or a bare IPv6 (several ':')
  }
  function parseHost(raw) {
    const s = String(raw || '').trim().replace(/^(["'])(.*)\1$/, '$2');
    if (!s) return null;
    if (!/^ssh(?:\s|$)/i.test(s)) return /\s/.test(s) ? null : parseDest(s);   // plain text with spaces: validate() says what is wrong
    const t = s.split(/\s+/).slice(1).map(x => x.replace(/^(["'])(.*)\1$/, '$2'));
    let user = '', port = '', dest = '', m;
    const opt = v => { const o = /^(port|user)\s*=?\s*(\S+)$/i.exec(v); if (!o) return false; if (/^p/i.test(o[1])) { if (!/^\d{1,5}$/.test(o[2])) return false; port = o[2]; } else user = o[2]; return true; };
    for (let i = 0; i < t.length; i++) {
      const a = t[i];
      if (a === '-p' || a === '-l' || a === '-o') {
        const v = t[++i]; if (v == null) return { bad: a };
        if (a === '-p') { if (!/^\d{1,5}$/.test(v)) return { bad: a + ' ' + v }; port = v; } else if (a === '-l') user = v; else if (!opt(v)) return { bad: '-o ' + v };
      } else if ((m = /^-p(\d{1,5})$/.exec(a))) port = m[1];
      else if ((m = /^-l(\S+)$/.exec(a))) user = m[1];
      else if ((m = /^-o(\S+)$/.exec(a))) { if (!opt(m[1])) return { bad: a }; }
      else if (NOARG.test(a)) continue;   // -v, -4, -C …: change nothing the app needs
      else if (a[0] === '-') return { bad: a + (WITHARG.test(a) && t[i + 1] ? ' ' + t[i + 1] : '') };
      else if (!dest) dest = a;
      else return { bad: t.slice(i).join(' ') };   // a remote command: the app runs only its own collector
    }
    const d = dest && parseDest(dest);
    if (!d) return { bad: dest || 'ssh' };
    return { host: d.host, user: d.user || user, port: port || d.port };
  }
  const badMsg = part => "'" + part.slice(0, 40) + (part.length > 40 ? '…' : '') + "' 부분을 이해하지 못했습니다 — 에겐 톡은 주소·계정·포트만 씁니다 (경유 서버·키 파일 같은 ssh 옵션은 지원하지 않습니다)";
  function applyHost() {
    const v = E.host.value, p = parseHost(v);
    if (p && p.bad) { err('host', badMsg(p.bad)); return; }
    if (p) {
      const moved = [];
      if (p.host !== v) E.host.value = p.host;   // only when the text changes: no caret jump while typing a plain name
      if (p.user && p.user !== E.user.value.trim()) { if (E.user.value.trim() && E.user.value.trim() !== (R.U.lastUser || '')) moved.push('계정'); E.user.value = p.user; err('user', ''); }
      if (p.port && String(+p.port) !== E.port.value.trim()) { if (E.port.value.trim() && E.port.value.trim() !== '22') moved.push('포트'); E.port.value = String(+p.port); err('port', ''); }
      if (moved.length) flash(moved.join('·') + '을(를) 붙여 넣은 주소에 적힌 값으로 바꿨습니다', 4000);
    }
    E.name.placeholder = E.host.value.trim() || '서버 이름';
  }

  // ---------- key-only servers: the app's public key line and the one command that appends it (the user runs it, the app never does) ----------
  const loadKey = () => keyP || (keyP = api('api/key').then(r => r.status === 200 && r.body && /^ssh-ed25519 [A-Za-z0-9+/=]+ \S+$/.test(String(r.body.pub || '')) ? r.body : Promise.reject(r)).catch(e => { keyP = null; throw e; }));
  function manualBox(id, note) {
    const pub = h('code.mono.fixcmd.kpub'), cmd = h('code.mono.fixcmd.kcmd'), msg = h('p.meta.kmsg', '공개키를 불러오는 중…');
    const cp1 = h('button.btn.sm', { type: 'button', disabled: true, on: { click: e => C.copy(pub.textContent, e.currentTarget, '공개키 복사') } }, '공개키 복사');
    const cp2 = h('button.btn.sm', { type: 'button', disabled: true, on: { click: e => C.copy(cmd.textContent, e.currentTarget, '명령 복사') } }, '명령 복사');
    const el = h('div.manual', { id }, h('p.meta', '이 PC의 공개키 (비밀 정보가 아닙니다):'), pub, h('div.mact', cp1),
      h('p.meta', '서버에서 한 번 실행할 명령 — 이미 접속할 수 있는 터미널에 붙여 넣으세요 (에겐 톡은 이 명령을 실행하지 않습니다):'), cmd, h('div.mact', cp2), note ? h('p.meta', note) : null, msg);
    el.load = () => loadKey().then(k => { text(pub, R.str(k.pub, 400)); text(cmd, R.str(k.cmd, 1200)); cp1.disabled = false; cp2.disabled = !k.cmd; msg.hidden = true; },
      () => { text(msg, '공개키를 불러오지 못했습니다 — 에겐 톡을 다시 시작한 뒤 다시 여세요'); msg.hidden = false; });
    return el;
  }

  // ---------- 내 SSH 설정에서 고르기: GET api/sshconfig only when asked; picking an entry fills the form, nothing is saved ----------
  const SKIP = { host: '주소 형식을 쓸 수 없습니다', user: '계정 형식을 쓸 수 없습니다', port: '포트가 올바르지 않습니다', token: '%h 같은 치환 표기는 지원하지 않습니다' };
  const hostTxt = (host, port) => (host.includes(':') ? '[' + host + ']' : host) + (port !== 22 ? ':' + port : '');
  async function loadSc() {
    if (!E.scBox.hidden) { E.scBox.hidden = true; attr(E.scBtn, 'aria-expanded', 'false'); return; }
    E.scBox.hidden = false; attr(E.scBtn, 'aria-expanded', 'true'); E.scBox.replaceChildren(h('p.meta', '불러오는 중…'));
    let r; try { r = await api('api/sshconfig'); } catch { r = { status: 0 }; }
    const b = r.body || {}, es = r.status === 200 && Array.isArray(b.entries) ? b.entries.filter(e => e && typeof e === 'object' && typeof e.alias === 'string').slice(0, 100) : null;
    const quiet = m => E.scBox.replaceChildren(h('p.meta', m));
    if (!es) return quiet('SSH 설정 파일을 읽지 못했습니다');
    if (b.missing) return quiet('SSH 설정 파일이 없습니다');
    if (b.too_big) return quiet('SSH 설정 파일이 256KB 보다 커서 읽지 않았습니다');
    if (b.unreadable) return quiet('SSH 설정 파일을 읽을 수 없습니다');
    if (!es.length) return quiet('고를 수 있는 Host 항목이 없습니다 (와일드카드 항목은 건너뜁니다)');
    const have = M.channels.filter(c => c.kind === 'ssh').map(parse);
    E.scBox.replaceChildren(...es.map(e => {
      const alias = R.str(e.alias, 64), host = R.str(e.host, 253), user = R.str(e.user, 64), port = Number.isInteger(e.port) && e.port > 0 && e.port < 65536 ? e.port : 22;
      const added = have.some(q => q.host === host && q.port === port && (!user || q.user === user));
      const why = e.jump ? '경유 서버(ProxyJump)는 아직 지원하지 않습니다' : e.skipped ? SKIP[e.skipped] || '이 항목은 쓸 수 없습니다' : added ? '이미 등록된 서버' : '';
      return h('button.scb', { type: 'button', disabled: !!why, title: why || null, data: { alias, st: e.jump || e.skipped ? 'off' : added ? 'added' : '' }, on: { click: () => pickSc({ alias, host, user, port }) } },
        h('b', alias), h('span.meta', (user ? user + '@' : '') + hostTxt(host, port)), why ? h('span.scw', why) : null);
    }));
  }
  function pickSc(e) {
    E.host.value = e.host; if (e.user) E.user.value = e.user; E.port.value = e.port; E.name.value = e.alias.slice(0, 40); E.name.placeholder = e.host;
    for (const k of ['host', 'user', 'port', 'name']) err(k, '');
    E.scBox.hidden = true; attr(E.scBtn, 'aria-expanded', 'false'); flash(e.alias + ' 의 주소·계정·포트를 채웠습니다', 3000);
    (E.user.value ? E.pw : E.user).focus();
  }

  function fld(k, label, attrs, extra) {
    const input = E[k] = h('input', Object.assign({ id: 'as-' + k, autocomplete: 'off', spellcheck: 'false', 'aria-describedby': 'as-' + k + '-err' }, attrs));
    input.addEventListener('input', () => err(k, ''));
    E[k + 'Err'] = h('div.err', { id: 'as-' + k + '-err', role: 'alert', hidden: true });
    return [h('label', { for: 'as-' + k }, label), h('div.fc', h('div.field', input, extra), E[k + 'Err'])];
  }
  function mount() {
    const close = h('button.ibtn.x', { type: 'button', 'aria-label': '닫기', on: { click: () => tryClose() } }, svgUse('i-x'));
    E.title = h('h2.t-section', { id: 'as-title' }); E.sub = h('p.meta', { id: 'as-sub' });
    E.flash = h('p.meta.flash', { role: 'status', hidden: true });
    E.presets = h('div.pchips', { role: 'group', 'aria-label': '연결할 서버', hidden: true });
    const eye = h('button.ibtn.eye', { type: 'button', 'aria-pressed': 'false', 'aria-label': '비밀번호 보기', title: '비밀번호 보기', tabindex: '0', on: { click: () => { const on = E.pw.type === 'password'; E.pw.type = on ? 'text' : 'password'; attr(eye, 'aria-pressed', on ? 'true' : 'false'); attr(eye, 'aria-label', on ? '비밀번호 숨기기' : '비밀번호 보기'); attr(eye, 'title', on ? '비밀번호 숨기기' : '비밀번호 보기'); attr(eye.querySelector('use'), 'href', on ? '#i-eye-off' : '#i-eye'); } } }, svgUse('i-eye'));
    E.py = null;
    E.form = h('form', { id: 'as-form', novalidate: true, autocomplete: 'off', on: { submit: e => { e.preventDefault(); const rq = validate(); if (rq) start(rq); } } },
      E.scrow = h('div.scrow', E.scBtn = h('button.btn.link.sm', { type: 'button', 'aria-expanded': 'false', 'aria-controls': 'as-sc', on: { click: () => loadSc() } }, '내 SSH 설정에서 고르기')),
      E.scBox = h('div.sshc', { id: 'as-sc', role: 'group', 'aria-label': '내 SSH 설정의 서버', hidden: true }),
      h('div.frow', ...fld('host', '서버 주소', { placeholder: '203.0.113.10, gpu-1 또는 user@host:2222' })),
      h('div.frow', ...fld('user', '계정', { placeholder: '서버 로그인 계정' })),
      h('div.frow', ...fld('pw', '비밀번호', { type: 'password', maxlength: 256, autocomplete: 'off', placeholder: '서버 로그인 비밀번호' }, eye)),
      h('div.frow.pair', ...fld('port', '포트', { type: 'text', inputmode: 'numeric', pattern: '\\d*', maxlength: 5 }), ...fld('name', '이름 (선택)', { maxlength: 40 })),
      E.pyrow = h('div.frow', { hidden: true }, ...fld('py', 'python 명령', { maxlength: 64, value: 'python3' })),
      E.sessrow = h('label.sess', { hidden: true }, E.sess = h('input', { type: 'checkbox' }), h('span', '이 세션 동안만 비밀번호로 연결 (키를 쓰지 않고, 에겐 톡을 닫으면 사라집니다)')),
      h('p.meta.priv', svgUse('i-lock'), E.priv = h('span', '비밀번호는 저장하지 않습니다. 이 PC 전용 키가 ', h('code.mono.nw', '%APPDATA%\\AgenTalk'), ' 에 만들어지고 서버의 authorized_keys 에 한 줄 추가됩니다 (agen-talk@PC이름).')),
      h('div.manw', E.manLink = h('button.btn.link.sm', { type: 'button', 'aria-expanded': 'false', 'aria-controls': 'as-man', on: { click: () => { const on = E.manForm.hidden; E.manForm.hidden = !on; attr(E.manLink, 'aria-expanded', on ? 'true' : 'false'); if (on) E.manForm.load(); } } }, '내 키 직접 등록 (비밀번호 로그인이 꺼진 서버)'),
        E.manForm = manualBox('as-man', '등록한 뒤에는 비밀번호 칸을 비워 두고 [연결]을 누르세요 — 이 PC의 키로 접속합니다.')),
      h('div.acts.rev', E.go = h('button.btn.primary', { type: 'submit' }, '연결'), h('button.btn', { type: 'button', on: { click: () => tryClose() } }, '취소')));   // DOM order 등록 시작 → 취소 → × , shown reversed
    E.sess.addEventListener('change', () => { E.priv.hidden = false; if (E.sess.checked) { E.privAlt = E.privAlt || h('span', PRIV_S); E.priv.hidden = true; E.priv.after(E.privAlt); E.privAlt.hidden = false; } else if (E.privAlt) { E.privAlt.hidden = true; E.priv.hidden = false; } });
    // the address field splits what it is given (paste, leaving the field, Enter): user@host[:port], [v6]:port, ssh://…, an ssh command line
    E.host.addEventListener('input', e => { if (!e.inputType || e.inputType === 'insertFromPaste') applyHost(); else E.name.placeholder = E.host.value.trim() || '서버 이름'; });
    E.host.addEventListener('blur', () => applyHost());
    E.host.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) applyHost(); });   // before the form's submit runs validate()
    E.steps = h('ol.steps', { role: 'status', 'aria-live': 'polite' }, STEPS.map(l => h('li', { data: { st: 'pending' } }, svgUse('g-idle', 'gl'), h('b', l), h('span.d'))));
    E.logBtn = h('button.btn.link', { type: 'button', 'aria-expanded': 'false', 'aria-controls': 'as-log', on: { click: () => { E.log.hidden = !E.log.hidden; attr(E.logBtn, 'aria-expanded', E.log.hidden ? 'false' : 'true'); } } }, '로그 보기');
    E.log = h('pre.inset', { id: 'as-log', hidden: true });
    E.band = h('div.bn-err', { role: 'alert', hidden: true }, h('div.ttl', svgUse('g-dead', 'gl'), h('span.t')), h('div.sub', h('span.why'), ' ', h('code.mono.msg')), h('div.meta.kh', { hidden: true }), E.bfinds = h('ul.finds', { hidden: true }), E.bman = manualBox('as-bman'), E.acts = h('div.acts'), E.log);
    // key_rejected with the password session still open: what the diagnosis found, the exact fix commands, the user's choice
    E.fixT = h('b.ah'); E.fixWhy = h('p'); E.finds = h('ul.finds'); E.fixCmdL = h('p.meta', '실행할 명령 (이 계정 권한으로만 실행하고, 다른 것은 바꾸지 않습니다):'); E.fixCmd = h('code.mono.fixcmd');
    E.fixGo = h('button.btn.primary', { type: 'button', on: { click: () => answerFix('fix') } }, '권한 고치고 다시 시도');
    E.fixSess = h('button.btn', { type: 'button', on: { click: () => answerFix('session') } }, '이 세션 동안만 비밀번호로 연결');
    E.fixNo = h('button.btn', { type: 'button', on: { click: () => answerFix('none') } }, '고치지 않기');
    E.fixbox = h('div.confirm.fixc', { role: 'alert', hidden: true, on: { keydown: guardKey, keyup: guardKey } }, E.fixT, E.fixWhy, E.finds, E.fixCmdL, E.fixCmd, h('div.acts', E.fixNo, E.fixSess, E.fixGo));
    // first connection to a server: show its fingerprint, the user decides (never auto-accepted)
    E.fp = h('code.mono.fp');
    E.confirm = h('div.confirm', { role: 'alert', hidden: true, on: { keydown: guardKey, keyup: guardKey } }, h('b.ah', '처음 연결하는 서버입니다'), h('p', '서버 관리자가 알려 준 지문과 같으면 [연결]을 누르세요. 모르는 서버라면 취소하세요.'), E.fp, h('p.meta', '한 번 연결하면 이 PC는 이 서버를 기억합니다 — 다음부터 묻지 않습니다'),
      h('div.acts', E.fpNo = h('button.btn', { type: 'button', on: { click: () => confirmKey(false) } }, '취소'), E.fpYes = h('button.btn.primary', { type: 'button', on: { click: () => confirmKey(true) } }, '연결')));
    E.cancel = h('button.btn', { type: 'button', on: { click: cancel } }, '취소');
    E.prog = h('div', { tabindex: '-1' }, E.band, E.steps, E.confirm, E.fixbox, E.pacts = h('div.acts', E.cancel));
    E.okTitle = h('h3.t-section'); E.okLine = h('p'); E.okNote = h('p.meta');
    E.open = h('button.btn.primary', { type: 'button' }, '채널 열기');
    E.done = h('div', h('div.ttl', svgUse('g-done', 'gl lg'), E.okTitle), E.okLine, E.okNote,
      h('div.acts', h('button.btn.link', { type: 'button', on: { click: () => { fix = null; fixName = ''; rekey = pwConn = reusePw = editing = false; sub0 = SUB; reset(); E.scrow.hidden = false; E.pw.placeholder = '서버 로그인 비밀번호'; pane('form'); paintPresets(); E.host.focus(); } } }, '서버 하나 더 추가'), h('button.btn', { type: 'button', on: { click: () => tryClose(true) } }, '닫기'), E.open));
    dlg = h('dialog.dlg.addsrv', { 'aria-labelledby': 'as-title', 'aria-describedby': 'as-sub' }, h('div.hd', E.title), E.sub, E.presets, E.form, E.prog, E.done, E.flash, close);
    dlg.addEventListener('cancel', e => { if (running()) { e.preventDefault(); flash('진행 중입니다 — 중단하려면 취소를 누르세요', 3000); } });   // Esc
    dlg.addEventListener('close', () => { E.pw.value = ''; if (running()) cancel(); if (opener && opener.isConnected) opener.focus(); });
    dlg.addEventListener('keydown', e => e.stopPropagation());   // the app's single-key shortcuts and Esc stack stay out of the dialog
    document.getElementById('layer').append(dlg);
  }
  // a double Enter (or a held key) must not accept an unknown server: keys are ignored for 500 ms after the fingerprint appears
  function guardKey(e) { if ((e.key === 'Enter' || e.key === ' ') && Date.now() - (E.confirmAt || 0) < 500) { e.preventDefault(); e.stopPropagation(); } }
  function tryClose(force) { if (running() && !force) return flash('진행 중입니다 — 중단하려면 취소를 누르세요', 3000); dlg.close(); }
  function reset(o = {}) {
    E.host.value = o.host || ''; E.user.value = o.user || R.U.lastUser || ''; E.pw.value = ''; E.pw.type = 'password'; E.port.value = o.port || 22; E.name.value = o.name || '';
    E.name.placeholder = o.host || '서버 이름'; for (const k of ['host', 'user', 'pw', 'port', 'name']) err(k, ''); flash(''); job = null; clearTimeout(timer);
    E.pyrow.hidden = true; E.py.value = 'python3'; E.sessrow.hidden = true; E.sess.checked = false;
    E.name.disabled = false; E.scBox.hidden = true; attr(E.scBtn, 'aria-expanded', 'false'); E.manForm.hidden = true; attr(E.manLink, 'aria-expanded', 'false');
  }

  function open(o = {}) {
    if (!dlg) mount();
    opener = document.activeElement;
    if (!running()) {
      const c = o.ch && R.chan(o.ch), edit = !!c && !!o.edit, sessCh = !!c && c.kind === 'ssh' && c.auth === 'password-session' && !edit;
      fix = c ? c.id : null; fixName = c ? c.name : ''; editing = edit;   // edit: 주소·계정·포트 수정 from 설정 › 채널 (any ssh channel)
      rekey = sessCh && !!o.rekey; pwConn = sessCh && !rekey; reusePw = rekey && !!c.session_pw;   // 키 로그인 다시 설정: the hub may still hold this run's password
      sub0 = rekey ? '이 서버는 키 로그인이 거절되어 비밀번호로 연결해 왔습니다. 키를 다시 등록하고, 또 거절되면 원인(폴더 권한 등)을 찾아 고칠 수 있게 안내합니다.' + (reusePw ? ' 이번 실행에서 입력한 비밀번호를 다시 쓰므로 비워 두어도 됩니다.' : '')
        : sessCh ? '이 서버는 키 로그인이 안 돼서, 이번 실행 동안만 비밀번호로 연결합니다. 매번 묻지 않게 하려면 아래 체크를 끄거나 키 로그인 설정을 쓰세요.'
        : edit ? '주소·계정·포트를 고친 뒤 비밀번호를 입력하면 그 주소에 이 PC의 키를 등록하고 채널을 다시 연결합니다. 주소가 바뀌면 서버 지문을 처음부터 확인합니다.' : SUB;
      reset(c ? Object.assign(parse(c), { name: edit ? c.name : '' }) : o);
      E.name.disabled = edit; E.scrow.hidden = !!c;   // the name has its own 이름 바꾸기; 내 SSH 설정 is for adding
      if (sessCh) { E.sessrow.hidden = false; E.sess.checked = !rekey; }
      E.sess.dispatchEvent(new Event('change'));
      E.pw.placeholder = reusePw ? '비워 두면 이번 실행에서 입력한 비밀번호를 씁니다' : '서버 로그인 비밀번호';
      pane('form');
    }
    paintPresets();
    if (!dlg.open) dlg.showModal();
    if (running()) { paint(job.j || { state: 'connecting' }); poll(); } else (!E.host.value ? E.host : !E.user.value ? E.user : E.pw).focus();
  }
  // not-yet-added presets as quick picks: fill host / port / name, then the account is the next thing to type
  function paintPresets() {
    const ps = fix ? [] : R.M.presets.filter(p => !p.added);
    E.presets.replaceChildren(h('span.meta', '연결할 서버'), ...ps.map(p => h('button.btn.sm.pchip', { type: 'button', 'aria-pressed': 'false', title: p.host + (p.port !== 22 ? ':' + p.port : ''), on: { click: e => { for (const b of E.presets.querySelectorAll('.pchip')) attr(b, 'aria-pressed', b === e.currentTarget ? 'true' : 'false'); E.host.value = p.host; E.port.value = p.port; E.name.value = p.name; E.name.placeholder = p.host; for (const k of ['host', 'port', 'name', 'user']) err(k, ''); (E.user.value ? E.pw : E.user).focus(); } } }, p.name)));
    E.presets.hidden = !ps.length || !E.form || E.form.hidden;
  }
  function validate() {
    applyHost();   // a typed (not pasted) user@host:port is split here too
    const v = { host: E.host.value.trim(), user: E.user.value.trim(), port: E.port.value.trim(), name: E.name.value.trim() }, bad = [], no = (k, m, l) => { err(k, m, l); bad.push(k); };
    const port = /^\d+$/.test(v.port) ? +v.port : 0;
    if (!v.host) no('host', '서버 주소를 입력하세요'); else if (parseHost(v.host) && parseHost(v.host).bad) no('host', badMsg(parseHost(v.host).bad)); else if (!R.hostOk(v.host)) no('host', '주소에는 공백이나 특수문자를 쓸 수 없습니다 (IPv6 는 대괄호 없이 2001:db8::1 처럼)');
    if (!v.user) no('user', '계정을 입력하세요'); else if (!RE.user.test(v.user)) no('user', '계정에는 공백이나 특수문자를 쓸 수 없습니다');
    if (!(port >= 1 && port <= 65535)) no('port', '포트는 1~65535 사이의 숫자입니다');
    if (v.name.length > 40) no('name', '이름은 40자까지입니다');
    if (!bad.length) {   // fix / edit mode: another channel with the same address is still a duplicate; the name stays the channel's own
      const dup = M.channels.find(c => { const q = parse(c); return c.kind === 'ssh' && c.id !== fix && q.host === v.host && q.user === v.user && q.port === port; });
      if (dup) no('host', '이미 등록된 서버입니다 (' + dup.name + ')', h('button.btn.link', { type: 'button', on: { click: () => { dlg.close(); R.openChannel(dup.id); } } }, '그 채널 열기'));
      else if (!fix && M.channels.some(c => c.name === (v.name || v.host))) no('name', '같은 이름의 채널이 이미 있습니다 — 다른 이름을 쓰세요');
    }
    if (bad.length) { E[bad[0]].focus(); return null; }
    return { host: v.host, user: v.user, port, name: v.name };
  }

  async function start(rq) {
    const body = { host: rq.host, user: rq.user, port: rq.port, name: rq.name, password: E.pw.value };
    E.pw.value = ''; E.pw.type = 'password'; attr(E.form.querySelector('.eye'), 'aria-pressed', 'false');   // the page does not keep the password: it lives only in this request body
    if (fix) body.id = fix;
    if (!E.pyrow.hidden && E.py.value.trim()) { body.python = E.py.value.trim(); rq.python = body.python; }
    if (!E.sessrow.hidden && E.sess.checked) body.session_password = true;
    if (reusePw && !body.password) body.reuse_password = true;   // the hub uses the password it holds for this channel in this run
    flash(''); E.go.disabled = true;
    E.band.hidden = true; E.confirm.hidden = true; E.pacts.hidden = false; attr(E.cancel, 'disabled', true); text(E.cancel, '취소');
    rq.hadPw = !!body.password || !!body.reuse_password;
    pane('prog', rq.user + '@' + rq.host + ' · 포트 ' + rq.port); steps([['active', '서버에 연결하는 중…'], P, P, P, P]); E.prog.focus({ preventScroll: true });
    let r; try { r = await api('api/servers', body); } catch { r = { status: 0 }; }
    body.password = '';
    E.go.disabled = false;
    if (r.status === 202) { job = { id: r.body.job, rq, running: true, phase: 'connecting', sawConfirm: false, fails: 0 }; poll(); return; }
    if (job && job.j) paint(job.j); else pane('form');
    const fld_ = r.status === 400 && r.body ? String(r.body.field || '') : '';
    if (fld_ && ['host', 'user', 'port', 'name'].includes(fld_)) { pane('form'); err(fld_, '허브가 이 값을 받아들이지 않습니다'); E[fld_].focus(); }
    else if (fld_) { pane('form'); flash(fld_ === 'python' ? '채널 설정의 python 값이 올바르지 않습니다' : fld_ === 'password' ? '비밀번호 형식이 올바르지 않습니다 (256자까지)' : fld_ === 'id' ? '채널 정보가 바뀌었습니다 — 닫고 다시 여세요' : '허브가 요청을 받아들이지 않습니다 (' + fld_.slice(0, 40) + ')'); }
    else flash(r.status === 409 ? '이미 진행 중인 등록이 있습니다 — 잠시 뒤 다시 시도하세요' : r.status === 403 ? '허브가 요청을 거절했습니다 — 이 페이지를 새로 고친 뒤 다시 시도하세요' : r.status === 400 ? '허브가 요청을 받아들이지 않습니다 — 입력한 값을 확인하세요' : r.status === 413 ? '요청이 너무 큽니다 — 입력한 값을 줄여 보세요' : r.status ? '허브가 요청을 처리하지 못했습니다 (' + r.status + ')' : '허브에 연결할 수 없습니다');
  }
  async function cancel() {
    if (!running()) return;
    E.cancel.disabled = true; text(E.cancel, '취소하는 중…');
    try { await api('api/servers/job/cancel', { id: job.id }); } catch { }
    poll();
  }
  async function confirmKey(accept) {
    if (!running() || !job.id) return;
    E.fpYes.disabled = E.fpNo.disabled = true;
    try { await api('api/servers/job/confirm', { id: job.id, action: 'hostkey', accept: !!accept }); } catch { }
    poll();
  }
  async function answerFix(choice) {
    if (!running() || !job.id) return;
    E.fixGo.disabled = E.fixSess.disabled = E.fixNo.disabled = true;
    try { await api('api/servers/job/confirm', { id: job.id, action: 'fix', choice }); } catch { }
    poll();
  }
  function paintFinds(ul, list) {
    const fs = Array.isArray(list) ? list.filter(f => f && typeof f === 'object').slice(0, 12) : [];
    ul.replaceChildren(...fs.map(f => { const lv = LV[f.level] ? f.level : 'info'; return h('li', { data: { lv } }, h('span.lv', LV[lv]), h('span', R.str(f.text, 400))); }));
    ul.hidden = !fs.length; return fs.length;
  }
  function paintFix(j) {
    const p = job, cmds = Array.isArray(j.fix_cmds) ? j.fix_cmds.map(x => R.str(x, 300)) : [], can = cmds.length > 0, sessOk = j.session_ok !== false;
    text(E.fixT, can ? '키 로그인이 거절된 원인을 찾았습니다' : '서버 설정 때문에 키 로그인이 거절됩니다');
    text(E.fixWhy, can ? '아래 문제는 이 계정으로 직접 고칠 수 있습니다. [권한 고치고 다시 시도]를 누르면 아래 명령만 서버에서 실행한 뒤, 비밀번호 없이 접속되는지 새 연결로 다시 확인합니다.'
      : '이 계정으로는 고칠 수 없는 원인입니다. 아래 내용을 서버 관리자에게 전달하세요.' + (sessOk ? ' 그동안은 이 세션 동안만 비밀번호로 연결할 수 있습니다 (비밀번호를 다시 입력하지 않습니다).' : ''));
    paintFinds(E.finds, j.findings);
    E.fixCmdL.hidden = E.fixCmd.hidden = !can; text(E.fixCmd, cmds.join('\n'));
    E.fixGo.hidden = !can; text(E.fixGo, j.fix_pw_again ? '권한 고치고 다시 시도 (비밀번호 한 번 더)' : '권한 고치고 다시 시도');
    E.fixSess.hidden = !sessOk; cls(E.fixSess, 'primary', !can); text(E.fixNo, can ? '고치지 않기' : '연결하지 않고 끝내기');
    if (!p.fixShown) { p.fixShown = true; E.fixGo.disabled = E.fixSess.disabled = E.fixNo.disabled = false; E.confirmAt = Date.now(); (can ? E.fixGo : sessOk ? E.fixSess : E.fixNo).focus(); }
  }
  async function poll() {
    clearTimeout(timer);
    const p = job; if (!p) return;
    try {
      const r = await api('api/servers/job?id=' + encodeURIComponent(p.id));
      if (job !== p) return;
      if (r.status === 404) r.body = { state: 'error', kind: 'other', message: '허브가 다시 시작되어 작업을 찾을 수 없습니다 — 다시 시도하세요' };
      if (!(r.body && r.body.state)) throw new Error('bad poll');
      p.fails = 0;
      {
        p.j = r.body; p.running = !['done', 'error'].includes(r.body.state);
        if (r.body.state === 'confirm_hostkey') p.sawConfirm = true;
        if (r.body.state in PH) p.phase = r.body.state;
        paint(r.body);
      }
    } catch {
      if (job !== p) return;
      if (++p.fails >= 5) { p.running = false; p.j = { state: 'error', kind: 'hub_lost', phase: p.phase, message: '허브 응답 없음' }; paint(p.j); return; }   // stop retrying: the hub is gone; × / Esc work again
    }
    if (job === p && p.running) timer = setTimeout(poll, 1000);   // every second while open, whatever the pause state
  }

  const P = ['pending', ''];
  function steps(list) {
    list.forEach(([s, d], i) => { const li = E.steps.children[i], d_ = li.querySelector('.d'); attr(li, 'data-st', s); text(li.querySelector('b'), STEPS[i]); li.querySelector('use').setAttribute('href', '#' + GL[s]); cls(li.querySelector('svg'), 'pulse', s === 'active'); text(d_, d); li.hidden = i === 1 && !(job && job.sawConfirm); });
  }
  function paint(j) {
    if (!LIVE.includes(j.state)) flash('');   // a finished job leaves no stale 'in progress' line
    const p = job, s = j.state, sub = p.rq.user + '@' + p.rq.host + ' · 포트 ' + p.rq.port;
    if (s === 'done') {
      const key = String(j.key || '').replace(/\.pub$/, ''), sess = j.auth === 'password-session';
      steps([['done', ''], ['done', '서버 지문 확인됨'], ['done', sess ? '건너뜀 (이 세션 동안만 비밀번호 사용)' : key ? '키 등록됨' : '키 등록됨'], ['done', sess ? '' : '키로 접속됨'], ['done', fix ? '채널을 고치고 다시 연결합니다' : '채널 목록에 추가하고 연결했습니다']]);
      const c = j.channel || {}, nm = String(c.name || p.rq.name || p.rq.host);
      R.U.lastUser = p.rq.user; R.save(); R.loadPresets();
      text(E.okTitle, '연결 완료'); text(E.okLine, sess ? nm + '에 이 세션 동안만 비밀번호로 연결합니다.' : nm + '에 키로 접속합니다. 비밀번호는 더 이상 필요 없습니다.');
      text(E.okNote, (Array.isArray(j.fixed) && j.fixed.length ? '고친 내용: ' + j.fixed.map(x => R.str(x, 100)).join(', ') + ' · ' : '') + (sess ? '에겐 톡을 닫으면 비밀번호가 사라지고, 다시 열면 비밀번호를 한 번 더 물어봅니다.' : (key ? '키: ' + key + ' (이 PC만) · ' : '') + "서버의 ~/.ssh/authorized_keys 에서 '" + String(j.comment || 'agen-talk@PC이름') + "' 줄을 지우면 접속이 끊깁니다. " + (fix ? '이 채널은 곧 다시 연결됩니다.' : "채널 칩에 '" + nm + "'가 생겼습니다.")));
      E.open.onclick = () => { dlg.close(); R.openChannel(c.id || ''); };
      pane('done', sub); E.open.focus(); return;
    }
    pane('prog', sub);
    if (!dlg.contains(document.activeElement) || document.activeElement === dlg) E.prog.focus({ preventScroll: true });   // the focused button was hidden with the form
    if (s === 'error') return paintErr(j);
    E.band.hidden = true;
    const ask = s === 'confirm_hostkey', askFix = s === 'confirm_fix';
    E.confirm.hidden = !ask; E.fixbox.hidden = !askFix; E.pacts.hidden = ask || askFix;
    if (askFix) paintFix(j);
    if (ask) { text(E.fp, (j.keytype ? String(j.keytype) + ' · ' : '') + String(j.fingerprint || '')); E.fpYes.disabled = E.fpNo.disabled = false; if (!p.confirmShown) { p.confirmShown = true; E.confirmAt = Date.now(); E.fpYes.focus(); } }
    if (!/취소하는 중/.test(E.cancel.textContent)) { E.cancel.disabled = false; text(E.cancel, '취소'); }
    steps(s === 'confirm_hostkey' ? [['done', ''], ['user', '서버 지문을 확인하세요'], P, P, P]
      : s === 'installing_key' ? [['done', ''], ['done', '서버 지문 확인됨'], ['active', '이 PC 전용 키를 서버에 등록하는 중…'], P, P]
      : s === 'verifying' ? [['done', ''], ['done', '서버 지문 확인됨'], ['done', '키 등록됨'], ['active', '비밀번호 없이 접속되는지 확인하는 중…'], P]
      : s === 'diagnosing' ? [['done', ''], ['done', '서버 지문 확인됨'], ['done', '키 등록됨'], ['active', '키 로그인이 거절되어 원인을 찾는 중…'], P]
      : s === 'confirm_fix' ? [['done', ''], ['done', '서버 지문 확인됨'], ['done', '키 등록됨'], ['user', '키 로그인이 거절됐습니다 — 아래 내용을 확인하세요'], P]
      : s === 'fixing' ? [['done', ''], ['done', '서버 지문 확인됨'], ['done', '키 등록됨'], ['active', j.fix_pw_again ? '권한을 고치는 중… (콘솔 창에 비밀번호를 한 번 더 입력하세요)' : '권한을 고치고 다시 확인하는 중…'], P]
      : [['active', '서버에 연결하는 중…'], P, P, P, P]);
  }
  function paintErr(j) {
    const p = job, k = ERR[j.kind] ? j.kind : 'other', [title, why, at, acts] = ERR[k], bad = Math.min(4, at(p, j) ?? 0), key = String(j.key || '');
    steps(STEPS.map((_, i) => i < bad ? ['done', ''] : i === bad ? ['error', ''] : P));
    const late = k === 'cancelled' && (PH[j.phase || p.phase] || 0) >= PH.installing_key;
    const cm = String(j.comment || 'agen-talk@PC이름');
    text(E.band.querySelector('.t'), k === 'wrong_password' && !p.rq.hadPw ? '비밀번호를 입력하세요' : title);
    const nf = paintFinds(E.bfinds, k === 'key_rejected' ? j.findings : null);
    text(E.band.querySelector('.why'), late ? "취소했지만 공개키는 이미 서버에 등록됐을 수 있습니다. 서버의 ~/.ssh/authorized_keys 에서 '" + cm + "' 줄을 지우면 접속이 끊깁니다." : j.kind === 'cancelled' && j.message ? j.message : nf ? (j.session_ok === false ? '서버에서 찾은 원인은 아래와 같습니다. 이 내용을 서버 관리자에게 전달하세요.' : WHY_KR) : why.replace("'agen-talk@PC이름'", "'" + cm + "'"));
    text(E.band.querySelector('.msg'), k === 'cancelled' || k === 'password_disabled' || !j.message ? '' : R.sshErr(j.message));   // password_disabled: the title already says it
    E.band.dataset.kind = k; E.band.hidden = false; E.confirm.hidden = true; E.fixbox.hidden = true; E.pacts.hidden = true;
    E.bman.hidden = k !== 'password_disabled'; if (!E.bman.hidden) E.bman.load();   // the manual route: the key line and the command to run on the server
    const kh = E.band.querySelector('.kh'); kh.hidden = k !== 'host_key_changed' || !j.known_hosts; text(kh, kh.hidden ? '' : 'known_hosts: ' + String(j.known_hosts).slice(0, 200));
    text(E.log, R.str(j.log || j.message || '허브가 로그를 보내지 않았습니다', 4000)); E.log.hidden = k !== 'other'; attr(E.logBtn, 'aria-expanded', E.log.hidden ? 'false' : 'true');
    const fn = { rekeyed, retry: () => back('pw'), user: () => back('user'), host: () => back('host'), py: () => { E.pyrow.hidden = false; back('py'); }, session: () => { E.sessrow.hidden = false; E.sess.checked = true; back('pw'); }, close: () => tryClose(), forget };
    const mk = ([l, t, f]) => h('button' + (t === 'l' ? '.btn.link' : t === 'p' ? '.btn.primary' : '.btn'), { type: 'button', on: { click: fn[f] } }, l);
    const acts_ = acts.filter(a => !(a[2] === 'session' && j.session_ok === false));   // the OpenSSH fallback has no password-for-this-session mode
    E.acts.replaceChildren(...acts_.filter(a => a[1] === 'l').map(mk), E.logBtn, ...acts_.filter(a => a[1] !== 'l').map(mk));
    const pr = E.acts.querySelector('.primary'); if (pr) pr.focus();
  }
  // back to the form with the same address; the password field is empty again (it was cleared at submit)
  function back(k) { const rq = job.rq; E.host.value = rq.host; E.user.value = rq.user; E.port.value = rq.port; E.name.value = rq.name; E.pw.value = ''; job = null; pane('form'); paintPresets(); E[k].focus(); }
  // 키를 등록했습니다 — 다시 연결: the same address again, without a password (the hub logs in with the app's key, which the user just authorized)
  function rekeyed() { const rq = { host: job.rq.host, user: job.rq.user, port: job.rq.port, name: job.rq.name }; E.host.value = rq.host; E.user.value = rq.user; E.port.value = rq.port; E.name.value = rq.name; E.pw.value = ''; job = null; start(rq); }
  async function forget() {
    const rq = job.rq; flash('');
    let r; try { r = await api('api/servers/forget-hostkey', { host: rq.host, port: rq.port }); } catch { r = { status: 0 }; }
    if (r.status === 200 && r.body && r.body.ok) back('pw'); else flash('기록을 지우지 못했습니다 — 에겐 톡을 다시 시작한 뒤 다시 시도하세요');
  }
  return { open, parseHost };
})();
