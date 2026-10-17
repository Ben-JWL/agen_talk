/* ===== 71-wire.js — 배선 지도 (default overview): servers → projects (git, by project.key) → agents → subagents.
   Absolutely placed cards over one SVG edge layer. Edges to live agents carry a moving pulse (static under reduced motion);
   dashed lanes from '나' mark agents I sent a 톡 to in the last 30 minutes. Rebuilt only when the structure changes;
   a poll that only changes states patches the cards in place (focus survives). ===== */
const OvWire = (() => {
  const { h, text, attr, cls, ST } = R;
  const NS = 'http://www.w3.org/2000/svg';
  const s = (tag, a) => { const e = document.createElementNS(NS, tag); for (const k in a) if (a[k] != null) e.setAttribute(k, a[k]); return e; };
  const SHORT = { work: '작업 중', tool: '도구 실행', child: '하위 대기', user: '입력 대기', stall: '응답 없음', idle: '쉬는 중', done: '완료', stopped: '중단됨', dead: '끊김' };
  let host = null, map = null, svg = null, A = null, sig = '', cards = new Map(), links = [], pulses = [], meAt = null, D = null;
  const flights = new Map();
  const hsh = str => { let x = 2166136261; for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; };

  function signature(D, w) { return w + '#' + D.projects.map(p => p.id + ':' + p.agents.map(a => a.key + '(' + a.kids.join(',') + ')').join(',')).join('|') + '#' + D.servers.map(x => x.id).join(','); }
  function build(D) {
    const W0 = Math.max(760, host.clientWidth - 32), f = [.16, .2, .3, .24], gap = Math.round(W0 * .1 / 3);
    const w = f.map(x => Math.round(W0 * x)), x = [16]; for (let i = 1; i < 4; i++) x[i] = x[i - 1] + w[i - 1] + gap;
    const AH = 48, KH = 42, KG = 6, GA = 10, GP = 20, GS = 30;
    map = h('div.ovw'); svg = null; cards = new Map(); links = [];
    ['서버', '프로젝트', '에이전트', '하위 에이전트'].forEach((t, i) => map.append(h('div.colh', { style: 'left:' + x[i] + 'px' }, t)));
    map.append(h('div.me', { style: 'left:' + x[0] + 'px;top:38px' }, h('i', '나'), h('span', '에겐 톡에서 보낸 톡')));
    meAt = { x: x[0] + 160, y: 51 };
    const boxes = [];
    let y = 86;
    for (const sv of D.servers) {
      const sTop = y, projs = D.projects.filter(p => p.server === sv.id), pBoxes = [];
      for (const p of projs) {
        const pTop = y, aBoxes = [], roots = D.roots.filter(n => n.project === p.id);
        for (const n of roots) {
          const kh = n.kids.length ? n.kids.length * (KH + KG) - KG : 0, bh = Math.max(AH, kh);
          aBoxes.push({ kind: 'agent', n, x: x[2], y: y + (bh - AH) / 2, w: w[2], h: AH });
          let ky = y + (bh - kh) / 2;
          for (const k of n.kids) { boxes.push({ kind: 'kid', n: k, x: x[3], y: ky, w: w[3], h: KH }); links.push({ from: n.key, to: k.key, n: k }); ky += KH + KG; }
          y += bh + GA;
        }
        if (!roots.length) y += AH + GA;
        y -= GA;
        pBoxes.push({ kind: 'proj', p, x: x[1], y: (pTop + y) / 2 - 25, w: w[1], h: 50 });
        for (const b of aBoxes) { boxes.push(b); links.push({ from: p.id, to: b.n.key, n: b.n }); }
        y += GP;
      }
      if (!projs.length) y += 50 + GP;
      y -= GP;
      boxes.push({ kind: 'server', sv, x: x[0], y: (sTop + y) / 2 - 28, w: w[0], h: 56 });
      for (const b of pBoxes) { boxes.push(b); links.push({ from: sv.id, to: b.p.id, p: b.p }); }
      y += GS;
    }
    const H = y + 16, W = x[3] + w[3] + 16;
    map.style.width = W + 'px'; map.style.height = H + 'px';
    svg = s('svg', { class: 'edges', width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, 'aria-hidden': 'true' });
    map.prepend(svg);
    boxes.sort((a, b) => a.y - b.y || a.x - b.x);   // DOM order = reading order
    for (const b of boxes) {
      let el;
      if (b.kind === 'server') {
        el = h('div.ovn.srv', { role: 'group' }, h('div.t', h('span.nm')), h('div.s', h('i.dot'), h('span')));
      } else if (b.kind === 'proj') {
        el = h('div.ovn.prj', { role: 'group' }, h('div.t', h('span.nm'), h('span.br')), h('div.s', h('span.cnt')));
      } else {
        const key = b.n.key;
        el = h('button.ovn' + (b.kind === 'kid' ? '.kid' : ''), { type: 'button', data: { agent: key } },
          h('div.t', R.svgUse('t-' + b.n.tool, 'amk'), h('span.nm')), h('div.s', C.glyph(b.n.st), h('span.stl'), h('span.why')));
        A.bindAgent(el, () => { const c = cards.get(key); return c && c.b.n; });
      }
      el.style.cssText = 'left:' + b.x + 'px;top:' + b.y + 'px;width:' + b.w + 'px;height:' + b.h + 'px';
      map.append(el);
      cards.set(b.kind === 'server' ? 'sv:' + b.sv.id : b.kind === 'proj' ? b.p.id : b.n.key, { el, b });
    }
    host.replaceChildren(map);
  }
  // patch texts/classes in place: a poll that only changes states keeps every element (and the focus)
  function refresh(D) {
    const byKey = new Map(); const walk = n => { byKey.set(n.key, n); n.kids.forEach(walk); }; D.roots.forEach(walk);
    for (const { el, b } of cards.values()) {
      if (b.kind === 'server') {
        const sv = D.servers.find(z => z.id === b.sv.id) || b.sv, n = D.roots.filter(r => r.server === sv.id).length;
        text(el.querySelector('.nm'), sv.name); attr(el, 'aria-label', '서버 ' + sv.name);
        cls(el.querySelector('.dot'), 'err', sv.state !== 'ok');
        text(el.querySelector('.s span'), (sv.kind === 'local' ? '내 PC' : 'SSH') + ' · ' + (sv.state === 'ok' ? '연결됨' : sv.state === 'connecting' ? '연결 중' : '끊김') + ' · ' + n);
      } else if (b.kind === 'proj') {
        const p = D.projects.find(z => z.id === b.p.id) || b.p, ags = D.roots.filter(r => r.project === p.id), kids = ags.reduce((m, r) => m + r.nKids, 0);
        const wait = ags.reduce((m, r) => m + (r.waiting ? 1 : 0) + r.kids.filter(k => k.waiting).length, 0);
        text(el.querySelector('.nm'), p.name); const br = el.querySelector('.br'); text(br, p.branch || ''); br.hidden = !p.branch;
        attr(el, 'aria-label', '프로젝트 ' + p.name + (p.branch ? ', 브랜치 ' + p.branch : ''));
        attr(el, 'title', p.other ? '프로젝트를 찾지 못한 에이전트' : p.name + (p.branch ? ' · ' + p.branch : '') + (p.root ? '\n' + p.root : ''));
        const c = el.querySelector('.cnt'); text(c, '에이전트 ' + ags.length + (kids ? ' · 하위 ' + kids : ''));
        let pn = el.querySelector('.pn'); if (wait) { if (!pn) el.querySelector('.s').append(pn = h('span.pn')); text(pn, '기다림 ' + wait); } else if (pn) pn.remove();
      } else {
        const n = byKey.get(b.n.key) || b.n; b.n = n;
        el.className = 'ovn' + (b.kind === 'kid' ? ' kid' : '');
        R.stClass(el, n.st); el.dataset.st = n.st; el.dataset.w = n.waiting ? '1' : '';
        attr(el, 'aria-label', A.label(n));
        text(el.querySelector('.nm'), n.name);
        C.setGlyph(el.querySelector('.s .gl'), n.st);
        text(el.querySelector('.stl'), SHORT[n.st] || ST[n.st]);
        const sub = n.st === 'tool' && n.a.now ? n.a.now : n.why;
        text(el.querySelector('.why'), (sub ? '· ' + sub : '') + (n.kids.length < n.nKids ? ' · 하위 ' + n.nKids : ''));
      }
    }
    edges(D);
  }
  const live = n => A.active(n.st) || n.kids.some(k => A.active(k.st));
  function path(a, b) { const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2, dx = Math.max(18, (x2 - x1) * .5); return 'M' + x1 + ' ' + y1 + 'C' + (x1 + dx) + ' ' + y1 + ' ' + (x2 - dx) + ' ' + y2 + ' ' + x2 + ' ' + y2; }
  function edges(D) {
    svg.replaceChildren(); pulses = [];
    const box = k => cards.get(k) && cards.get(k).b;
    for (const L of links) {
      const a = box(L.from.startsWith ? (cards.has(L.from) ? L.from : 'sv:' + L.from) : L.from), b = box(L.to); if (!a || !b) continue;
      const cur = L.n ? (cards.get(L.n.key) || {}).b : null, n = cur ? cur.n : L.n;
      const act = n ? live(n) : D.roots.some(r => r.project === L.to && live(r));
      const p = s('path', { d: path(a, b), class: (act ? 'act' : '') + (n && (n.st === 'dead' || n.st === 'stopped') ? ' dead' : '') });
      svg.append(p);
      if (act) { const c = s('circle', { r: 3, cx: -10, cy: -10 }); svg.append(c); pulses.push({ p, c, len: p.getTotalLength(), ph: (hsh(L.to) % 1000) / 1000, sp: n && n.st === 'tool' ? 1.1 : .7 }); }
    }
    let lane = 0;
    for (const { b } of cards.values()) {
      if (!b.n || !b.n.talk) continue;
      const x1 = meAt.x, y1 = meAt.y, x2 = b.x, y2 = b.y + 10, lx = x2 - 14 - (lane++ % 3) * 4;
      const p = s('path', { class: 'talk', d: 'M' + x1 + ' ' + y1 + 'H' + (lx - 6) + 'Q' + lx + ' ' + y1 + ' ' + lx + ' ' + (y1 + 6) + 'V' + (y2 - 6) + 'Q' + lx + ' ' + y2 + ' ' + (lx + 6) + ' ' + y2 + 'H' + x2 });
      svg.append(p, s('path', { class: 'talkhead', d: 'M' + (x2 - 7) + ' ' + (y2 - 4) + 'L' + (x2 - 1) + ' ' + y2 + 'L' + (x2 - 7) + ' ' + (y2 + 4) }));
      const fl = flights.get(b.n.key);
      if (fl) { const c = s('circle', { r: 4, cx: -10, cy: -10 }); svg.append(c); pulses.push({ p, c, len: p.getTotalLength(), once: fl, sp: 1 }); }
    }
  }
  function frame(t) {
    const rm = A && A.reduced();
    for (const q of pulses) {
      let f;
      if (rm) f = q.once ? 1 : .5;
      else if (q.once) { f = (t - q.once) / 1400; if (f > 1) { q.c.setAttribute('cx', -10); continue; } }
      else f = ((t / 1000) * q.sp / Math.max(1, q.len / 160) + q.ph) % 1;
      const e = f < .5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2, pt = q.p.getPointAtLength(q.len * e);
      q.c.setAttribute('cx', pt.x); q.c.setAttribute('cy', pt.y);
    }
  }
  function update(el, d, api, force) {
    A = api; D = d;
    const sg = signature(d, el.clientWidth);
    if (el !== host || !map || !map.isConnected || sg !== sig || force) { host = el; sig = sg; build(d); }
    refresh(d); frame(performance.now());
  }
  function flight(n) { flights.set(n.key, performance.now()); setTimeout(() => flights.delete(n.key), 1600); if (D && svg) edges(D); }
  function unmount() { map = null; host = null; sig = ''; }
  return { update, frame, flight, unmount };
})();
