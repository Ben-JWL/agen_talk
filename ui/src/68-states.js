/* ===== 68-states.js — window.States: skeleton / banner / missing (CHAT-UX §6). The hub-down line lives in the list's summary row.
   All elements are cached (banner per channel, empty per kind, missing per session) and patched in place; text via textContent only. ===== */
window.States = (() => {
  const { h, svgUse, text, attr, cls, M, on, $ } = R;
  const nodes = (n, f) => Array.from({ length: n }, f);

  // ---------- skeleton (views call this until M.loaded; the header ring is the only spinner) ----------
  function skeleton(n = 5) {
    return h('div.sk-list', { 'aria-hidden': 'true', class: M.loaded ? 'done' : '' },
      nodes(n, () => h('div.sk-row', h('i.g'), h('i.b1'), h('i.e'), h('i.b2'))));
  }
  on('model', () => R.$$('.sk-list:not(.done)').forEach(el => el.classList.add('done')));   // never shimmer after load

  // ---------- badperm: the PC-side Windows permission fix (constant command, copy button, one more line) ----------
  function badperm() {
    const b = R.BADPERM, btn = h('button.btn.sm', { type: 'button', on: { click: e => C.copy(b.cmd, e.currentTarget, '명령 복사') } }, '명령 복사');
    return h('div.bperm', h('code.mono.bcmd', b.cmd), h('div.bact', btn), h('p.meta', b.extra));
  }

  // ---------- banner(ch): one element per channel; null when ok and no warnings ----------
  const banners = {};
  function mkBanner(ch) {
    const log = h('pre.inset', { hidden: true, id: 'bnlog-' + ch });
    const logBtn = h('button.btn.link', { type: 'button', 'aria-expanded': 'false', 'aria-controls': 'bnlog-' + ch, on: { click: () => { log.hidden = !log.hidden; attr(logBtn, 'aria-expanded', log.hidden ? 'false' : 'true'); } } }, '로그 보기');
    const retry = () => { R.refresh(); again2.disabled = true; text(again2, '확인하는 중…'); setTimeout(() => { again2.disabled = false; text(again2, '지금 확인'); }, 2500); };
    const again2 = h('button.btn.primary', { type: 'button', on: { click: retry } }, '지금 확인');
    const fixBtn = h('button.btn.primary', { type: 'button', hidden: true, on: { click: () => AddServer.open({ ch }) } }, '이 서버에 키 등록하기');
    const tunnel = h('span.hint'), sep1 = h('span.sep', '·'), bp = badperm();
    const err = h('div.bn-err', { role: 'alert', hidden: true },
      h('div.ttl', svgUse('g-dead', 'gl'), h('span.t')), h('div.sub'),
      h('div.acts', tunnel, bp, sep1, logBtn, fixBtn, again2), log);
    const longer = h('span.meta', { hidden: true }, '오래 걸리면 허브 창의 로그와 channels.json의 주소를 확인하세요');
    const conn = h('div.bn-conn', { role: 'status', hidden: true }, h('span', '서버에 연결하는 중입니다…'), longer, h('div.indet', { 'aria-hidden': 'true' }));
    const el = h('div.st-banner', { data: { ch } }, conn, err);
    el._p = { err, conn, log, tunnel, bp, sep1, longer, fixBtn, again2 };
    return el;
  }
  function banner(ch) {
    const c = R.chan(ch);
    if (!c) return null;
    if (c.state === 'ok' && !c.stale) { if (banners[ch]) banners[ch].remove(); return null; }
    const el = banners[ch] || (banners[ch] = mkBanner(ch)), p = el._p;
    p.conn.hidden = c.state !== 'connecting';
    el._since = c.state === 'connecting' ? el._since || Date.now() : 0;
    p.longer.hidden = !el._since || Date.now() - el._since < 30000;
    const bad = c.state === 'error' || (c.state === 'ok' && c.stale);
    p.err.hidden = !bad;
    if (bad) {
      const ssh = c.kind === 'ssh' && c.state === 'error';
      const bpm = ssh && R.sshKind(c.error) === 'badperm'; p.bp.hidden = !bpm;
      text(p.err.querySelector('.t'), bpm ? R.BADPERM.title : c.state === 'ok' ? '수집이 중단되었습니다' : ssh ? 'SSH 연결이 끊겼습니다' : '연결 오류');
      text(p.err.querySelector('.sub'), (c.t ? '마지막 수집 ' + R.fmtHM(c.t) : '아직 받은 데이터가 없습니다') + ' · 허브가 자동으로 다시 연결합니다 (최대 1분 간격)');
      const fx = R.sshFix(c); p.fixBtn.hidden = !fx; cls(p.again2, 'primary', !fx); cls(p.again2, 'link', fx);
      text(p.fixBtn, c.auth === 'password-session' ? '비밀번호로 다시 연결 (또는 키 로그인 다시 설정)' : '이 서버에 키 등록하기');   // the dialog offers both
      p.tunnel.hidden = !ssh; p.sep1.hidden = true;   // the hint is long: it wraps, a leading dot would dangle
      if (ssh) text(p.tunnel, R.sshHint(c.error) + ' (' + R.sshErr(c.error) + ')');
      text(p.log, c.error || '허브가 오류 내용을 보내지 않았습니다');
      if (!ssh && c.state === 'error' && p.log.hidden && !p.log.dataset.seen) { p.log.hidden = false; p.log.dataset.seen = '1'; attr(p.err.querySelector('[aria-controls]'), 'aria-expanded', 'true'); }   // non-ssh: the error text is the content, show it once
    }
    return el;
  }

  // ---------- missing(ch, id): session info unavailable; P3 places the dimmed last tree under it ----------
  const missings = {};
  function missing(ch, id) {
    const k = ch + '\n' + id;
    if (!missings[k]) {
      missings[k] = h('div.missing', { role: 'alert' },
        h('h3', svgUse('i-flag'), '세션 정보를 가져오지 못했습니다'),
        h('ul', h('li', '채널 연결이 끊겼을 수 있습니다 — 채널 연결 상태를 확인하세요'), h('li', '세션이 이미 종료되어 목록에서 사라졌을 수 있습니다'), h('li', '이 세션을 읽을 권한이 없을 수 있습니다')),
        h('div.acts', h('button.btn.primary', { type: 'button', on: { click: () => R.refresh() } }, '다시 시도')));
    }
    return missings[k];
  }

  return { skeleton, banner, missing, badperm };
})();
