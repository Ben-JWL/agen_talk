/* ===== 89-selftest.dev.js — dev build only (".dev." files are skipped by build.py without --dev) (build.py --dev). Runs with ?selftest=1; dev/check.sh greps the console. ===== */
(() => {
  if (!new URLSearchParams(location.search).has('selftest')) return;
  const A = (c, m) => { if (!c) throw new Error('selftest: ' + m); };
  try {
    const hasRule = (sel, prop, value) => [...document.styleSheets].some(s => { try { return [...s.cssRules].some(r => r.selectorText === sel && r.style.getPropertyValue(prop).trim() === value); } catch { return false; } });
    A(R.esc('<b a="1">&\'') === '&lt;b a=&quot;1&quot;&gt;&amp;&#39;', 'esc');
    A(R.fmtDur(5) === '5초' && R.fmtDur(300) === '5분' && R.fmtDur(4320) === '1시간 12분' && R.fmtDur(90000) === '1일 1시간', 'fmtDur ' + R.fmtDur(4320));
    A(R.fmtLive(3) === '방금' && R.fmtLive(720) === '12분째' && R.fmtAgo(130) === '2분 전', 'fmtLive/ago');
    A(R.koDur('25m 동안 신호 없음 · Bash 실행 중') === '25분 동안 신호 없음 · Bash 실행 중' && R.koDur('Bash 실행 중 3m') === 'Bash 실행 중 3분' && R.koDur('exec 실행 중 1h12m') === 'exec 실행 중 1시간 12분' && R.koDur('gpt-5.1 2h 30s') === 'gpt-5.1 2시간 30초', 'koDur');
    const cyc = new Map(); R.normalize('c', { id: 'A', kids: [{ id: 'B', kids: [{ id: 'A' }] }] }, null, 0, cyc, 0);
    A(cyc.size === 2 && cyc.get('c:B').kids.length === 0, 'duplicate id dropped (no parent cycle)');
    // keyed: reuse, reorder without re-creation, focus kept
    const box = R.h('div'); document.body.append(box);
    const mk = items => R.keyed(box, items, { key: x => x.k, create: x => R.h('button', { tabindex: '0' }, x.k), update: (el, x) => R.text(el, x.k + x.v) });
    mk([{ k: 'a', v: 1 }, { k: 'b', v: 1 }, { k: 'c', v: 1 }]);
    const a = box.children[0], b = box.children[1]; b.focus();
    mk([{ k: 'c', v: 2 }, { k: 'a', v: 2 }]);
    A(box.children[0].textContent === 'c2' && box.children[1] === a && a.textContent === 'a2', 'keyed reorder reuses nodes');
    A(b.isConnected && b.classList.contains('gone'), 'focused row kept as .gone');
    b.blur(); mk([{ k: 'a', v: 3 }]); A(!b.isConnected && box.children.length === 1, 'gone row removed once unfocused');
    // focus survives a poll that moves another row across the focused one
    const bx = R.h('div'); document.body.append(bx);
    const mk2 = items => R.keyed(bx, items, { key: x => x, create: x => R.h('button', { tabindex: '0' }, x), update: () => 0 });
    mk2(['a', 'b', 'c']); bx.children[1].focus(); const fb = bx.children[1];
    mk2(['b', 'c', 'a']); A(document.activeElement === fb, 'keyed keeps focus when a row moves past the focused one');
    mk2(['a', 'b', 'c']); A(document.activeElement === fb, 'keyed keeps focus (2)'); bx.remove();
    A(R.fmtDur(720) === '12분', 'dur'); 
    box.remove();
    // nowDoing parsing
    const nd = C.nowDoing({ st: 'tool', now: 'Bash: pytest -q', why: '', kids: [] });
    A(nd.verb === 'Bash 실행 중' && nd.obj === 'pytest -q', 'nowDoing bash');
    A(C.nowDoing({ st: 'user', why: '명령 승인 대기', kids: [] }).reason === true, 'nowDoing reason');
    A(C.meta({ meta: 'pid 48213 · ~/work/data · gpt-5.1 · worker' }).model === 'gpt-5.1', 'meta parse');
    // chat: acts normalisation, ring dedupe + merged-tool growth, parseAct, badge, ask component
    const out = new Map(), ag = R.normalize('t', { id: 'Z', acts: [{ t: 1.7e9, k: 'tool', x: 'Bash: ls ×2' }, { t: 1.7e9 + 1, k: 'nope', x: 'x' }, { t: 'x', k: 'say', x: 'y' }, { t: 1.7e9 + 2, k: 'say', x: 'a\nb' }] }, null, 0, out, 0);
    A(ag.acts.length === 2 && ag.acts[0].t === 1.7e12 && ag.acts[1].x === 'a', 'acts normalised (unknown kind / bad t dropped, first line only)');
    R.accumulate(ag, 1); R.accumulate(ag, 2);
    A(R.acts('t:Z').length === 2, 'ring dedupes identical acts across polls');
    ag.acts = [{ t: 1.7e12, k: 'tool', x: 'Bash: ls ×3' }]; R.accumulate(ag, 3);
    A(R.acts('t:Z').length === 2 && R.acts('t:Z')[0].x === 'Bash: ls ×3', 'merged tool x grows in place');
    const ag2 = R.normalize('t', { id: 'Y', acts: [{ t: 1.7e9, k: 'tool', x: 'Bash: ls ×2' }] }, null, 0, new Map(), 0); R.accumulate(ag2, 1);
    ag2.acts = [{ t: 1.7e12, k: 'tool', x: 'Bash: ls ×3' }]; R.accumulate(ag2, 2);
    A(R.acts('t:Y').length === 1 && R.acts('t:Y')[0].x.endsWith('×3'), 'a folded ×N run keeps its first t; x updates in place');
    const ag3 = R.normalize('t', { id: 'X', acts: [{ t: 1.7e9, k: 'say', x: 'a' }, { t: 1.7e9, k: 'say', x: 'a' }] }, null, 0, new Map(), 0); R.accumulate(ag3, 1); R.accumulate(ag3, 2);
    A(R.acts('t:X').length === 2, 'two identical server acts stay two entries (one-to-one match), and do not multiply');
    const pa = C.parseAct('Read: a.py'); A(pa.name === 'Read' && pa.obj === 'a.py' && C.parseAct('$ make').name === 'Bash' && C.parseAct('hello').prose, 'parseAct');
    const bd = R.h('span'); C.badge(bd, { red: true, n: 0 }); A(bd.textContent === '1' && bd.classList.contains('red'), 'red badge min 1'); C.badge(bd, null); A(bd.textContent === '' && !bd.classList.contains('on'), 'badge off');
    const ab = C.askBubble(true); C.setAsk(ab, { head: '승인 요청', body: '$ x', mono: true, cmd: 'x' }); A(ab.querySelector('.ah').textContent === '승인 요청' && !ab.querySelector('.af').hidden, 'ask bubble');
    const wi = C.waitInfo({ st: 'stall', age: 1500, procs: [{ cpu: 0 }], why: '' }); A(wi.head === '응답 없음' && wi.warn === 'CPU 0 %' && wi.zero, 'stall evidence');
    // model: HTML in agent text never becomes markup
    A(!document.querySelector('#views script, #views img'), 'no injected elements');
    // model (collector model / model_prev / model_fb) and end: short names, normalize, the meta fallback
    A(R.shortModel('claude-opus-5-5') === 'opus-5.5' && R.shortModel('claude-sonnet-5') === 'sonnet-5' && R.shortModel('gpt-6.1-codex') === 'gpt-6.1-codex' && R.shortModel('') === '', 'shortModel');
    const mn = R.normalize('mm', { id: 'A', model: 'claude-opus-5-5', model_prev: 'claude-fable-5-2', model_fb: true, end: { ok: true, pid: 77 }, meta: 'pid 1 · ~/x · claude-sonnet-4' }, null, 0, new Map(), 0);
    A(mn.model === 'claude-opus-5-5' && mn.modelPrev === 'claude-fable-5-2' && mn.modelFb === true && mn.end.ok === true && mn.end.pid === 77, 'normalize keeps model / modelPrev / modelFb / end');
    const mp2 = new Map(); R.normalize('mm', { id: 'A', meta: 'pid 1 · ~/x · claude-sonnet-4', kids: [{ id: 'B', end: { ok: false, reason: 'self' } }, { id: 'C', model: '<b>x</b>' }] }, null, 0, mp2, 0);
    A(mp2.get('mm:A').model === 'claude-sonnet-4' && mp2.get('mm:A').modelPrev === '' && mp2.get('mm:A').modelFb === false && mp2.get('mm:A').end === null, 'model falls back to the one inside meta; no end / prev / fb when absent');
    A(mp2.get('mm:B').end.ok === false && mp2.get('mm:B').end.reason === 'self' && !/[<>]/.test(mp2.get('mm:C').model), 'end reason kept; a model id never carries markup');
    A(R.isWaiting({ st: 'dead', age: 10 }) && !R.isWaiting({ st: 'dead', age: 9999 }) && R.isWaiting({ st: 'stall', age: 9999 }), 'isWaiting');
    // talk (TALK-UX §10): previews, msgs normalisation, spawn/down merge, done/up dedupe, fan-out, my talk matched by msg_id, 5-minute hold expiry
    A(C.actText({ k: 'mdown', x: 'DATA' }) === '부모 지시: DATA' && C.actText({ k: 'mdown', x: '', enc: true }) === '부모 지시: 🔒 암호화됨' && C.actText({ k: 'mup', x: '끝' }) === '보고: 끝' && C.actText({ k: 'mtalk', x: '안녕' }) === '나 (에겐 톡): 안녕' && C.actText({ k: 'mpeer', x: 'hi' }) === '다른 세션: hi', 'actText talk cases');
    const mg = (id, dir, kind, from, to, ts, text, o) => Object.assign({ id: id.padStart(12, '0'), dir, kind, from, to, who: 'w', ts, text }, o || {});
    const tr = { id: 'P', name: 'parent', talk: { ok: true }, msgs: [mg('b1', 'down', 'talk', 'agen-talk:alice@PC', 'P', 1.7e9 + 20, 'hello', { msg_id: 'at-1a2b3c4d' }), mg('zz', 'down', 'agent', 'x', 'P', 1.7e9, 'bad id is dropped')],
      kids: [{ id: 'K1', name: 'kid', msgs: [mg('a1', 'down', 'agent', 'P', 'K1', 1.7e9 + 5, 'do it'), mg('a2', 'up', 'agent', 'K1', 'P', 1.7e9 + 9, 'done it'), mg('a3', 'follow', 'codex', 'P', 'K1', 1.7e9 + 7, '', { encrypted: true })] }, { id: 'K2', name: 'kid2', msgs: [mg('a4', 'down', 'agent', 'P', 'K2', 1.7e9 + 6, 'x'.repeat(4001))] }] };
    const tm = new Map(), tp = R.normalize('tt', tr, null, 0, tm, 0, 0), ks = [...tm.values()];
    A(tp.msgs.length === 1 && tp.msgs[0].kind === 'talk', 'normMsgs drops an entry with a bad id'); A(tm.get('tt:K2').msgs[0].truncated && tm.get('tt:K2').msgs[0].text.length === 4000, 'normMsgs re-caps at 4000');
    for (const k of ks) { R.M.agents.set(k.key, k); R.mergeMsgs(k); }
    R.A.talks['tt:P'] = [{ cid: 'c1', text: 'hello', t: 1.7e12, st: 'held', hat: Date.now(), mid: 'at-1a2b3c4d', why: '' }];
    A(!Talk.lines({ st: 'user', why: '답변 끝남 · 완료', talk: {} }, 'x').some(x => x[1].includes('승인을 기다리는 중')), 'calm user session has no approval confirm line');
    const savedMsg = (id, text) => ({ id, dir: 'down', kind: 'agent', from: 'p', to: 'n', who: 'w', t: Date.now(), text, truncated: false, encrypted: false, msg_id: '' });
    R.A.mg['tt:save'] = new Map([['000000000001', savedMsg('000000000001', 'persist me')]]); R.saveMsgs(true);
    A(R.store.get('room.msgs', {})['tt:save'][0].text === 'persist me', 'message ring persists with room.msgs'); delete R.A.mg['tt:save']; R.saveMsgs(true);
    A(R.validMsg(savedMsg('000000000002', 'valid')) && !R.validMsg({ ...savedMsg('000000000002', 'bad'), dir: 'sideways' }) && !R.validMsg({ ...savedMsg('000000000002', 'bad'), encrypted: 1 }) && !R.validMsg({ ...savedMsg('000000000002', 'bad'), msg_id: 'forged' }), 'persisted message shape rejects bad enums, ids and flags');
    const oldRoomMsgs = localStorage.getItem('room.msgs'), oldMgBeforeLoad = R.A.mg; R.A.mg = {};
    R.store.set('room.msgs', { 'selftest:reload': [savedMsg('000000000003', 'seeded')] }); R.loadMsgs();
    const loaded = R.msgs('selftest:reload').some(m => m.text === 'seeded'); R.A.mg = oldMgBeforeLoad;
    if (oldRoomMsgs == null) localStorage.removeItem('room.msgs'); else localStorage.setItem('room.msgs', oldRoomMsgs);
    A(loaded && document.querySelector('#app'), 'persisted messages load after boot with app shell');
    A(hasRule('.tn.fn .tg', 'align-self', 'start') && hasRule('.tn.fn .tg', 'margin-top', '14px'), 'flow tree chevron aligns to multiline row start');
    A(hasRule('.msg.me', 'align-self', 'stretch') && hasRule('.msg.me .col', 'width', 'fit-content') && hasRule('.msg.me .col', 'max-width', 'min(72%, 640px)'), 'all right-side bubbles fit content and cap at 72%');
    const row = R.h('div.msg.me', { style: 'position:fixed;left:-10000px;top:0;width:600px' }), col = R.h('div.col'), bub = R.h('div.bub.talk.talkme'), short = R.h('div.tb', '짧은 톡'), stamp = R.h('span.tm'); bub.append(short); col.append(bub); row.append(col, stamp); document.body.append(row);
    const shortH = short.getBoundingClientRect().height, shortW = bub.getBoundingClientRect().width; short.textContent = '긴 톡'.repeat(1000); const colBox = col.getBoundingClientRect(), tmBox = stamp.getBoundingClientRect();
    A(shortH <= 22 && shortW < colBox.width * 0.5 && colBox.width <= 432 && tmBox.left < colBox.left, 'short talk fits content, long talk caps at 72%, timestamp stays left'); row.remove();
    A(Detail.sumKids([{ st: 'done' }]).includes('완료\u00a01'), 'flow status label and count stay together');
    A(hasRule('body.room-composer #toasts', 'bottom', 'calc(var(--foot-h, 108px) + 16px)'), 'toast offset tracks the footer height');
    A(Room.heldCopy === ' · 톡 승인 대기 — 터미널에서 승인하세요', 'held status copy does not name the agent');
    A(Room.noHistory([], []) && !Room.noHistory([], [{}]) && !Room.noHistory([{}], []) && !Room.noHistory([], [], [{ kind: 'tmsg' }]), 'activity note is suppressed by talk and agy message cards');
    A(Talk.sendGuard(Date.now() - 1000) && !Talk.sendGuard(Date.now() - 2100) && Talk.guardMessage === '잠시 뒤에 보낼 수 있습니다', 'same-room send guard announces its wait');
    A(Talk.guardWait(10000, 0, 10000) === 2000 && Talk.guardWait(10000, 15000, 10000) === 5000, 'button wait uses the send guard and server 429 deadline');
    const L = [{ id: 's1', t: 1.7e12 + 5100, kind: 'spawn', x: 'kid' }, { id: 'd1', t: 1.7e12 + 9500, kind: 'done', x: 'kid: done it' }, { id: 'u1', t: 1.7e12 + 20000, kind: 'user', x: '[Agen Talk · alice@PC · at-1a2b3c4d]' }, { id: 'u2', t: 1.7e12 + 21000, kind: 'user', x: 'my terminal prompt' }];
    Talk.collect('tt:P', tp, L);
    A(L.find(x => x.id === 's1').msg.text === 'do it', 'a spawn act absorbs the child down message');
    A(!L.some(x => x.kind === 'done') && L.some(x => x.kind === 'tmsg' && x.label === '보고' && x.chip === '하위' && x.spk === 'tt:K1'), 'the report card replaces the done act');
    A(!L.some(x => x.id === 'u1') && L.some(x => x.id === 'u2'), 'a 에겐 톡 envelope never becomes my terminal prompt');
    A(L.some(x => x.label === '후속 지시 → kid'), 'follow-up seen from the parent');
    A(L.filter(x => x.kind === 'talkme').length === 1 && R.A.talks['tt:P'][0].st === 'delivered', 'my talk matched by msg_id: one bubble, delivered');
    tp.msgs[0] = { ...tp.msgs[0], text: 'h', truncated: true, n: 9000 }; R.mergeMsgs(tp);
    A(R.msgs('tt:P').find(x => x.id === tp.msgs[0].id).text === 'hello', 'short truncated poll keeps the stored message text');
    tp.msgs.push({ ...tp.msgs[0], id: '000000000099', msg_id: 'at-ffffffff', text: 'unverified' }); R.mergeMsgs(tp);
    const L4 = []; Talk.collect('tt:P', tp, L4);
    A(L4.some(x => x.kind === 'tmsg' && x.label === '톡' && x.nm === '에겐 톡' && x.chip === '확인 안 됨' && x.sr === '확인되지 않은 에겐 톡: ' && x.spk.startsWith('x:talk:')), 'unmatched talk is a labeled unverified peer card');
    const L2 = []; Talk.collect('tt:K1', tm.get('tt:K1'), L2);
    A(L2.some(x => x.label === '지시' && x.chip === '부모' && x.spk === 'tt:P') && L2.some(x => x.label === '보고 → w') && L2.some(x => x.m && x.m.encrypted), 'child room: parent instruction + follow-up + report');
    const fan = { id: 'F', name: 'fan', kids: [1, 2, 3, 4, 5].map(i => ({ id: 'f' + i, name: 'w' + i, msgs: [mg('c' + i, 'down', 'agent', 'F', 'f' + i, 1.7e9 + i, '같은 지시')] })) }, fm = new Map(), fp = R.normalize('tt', fan, null, 0, fm, 0, 0);
    for (const k of fm.values()) { R.M.agents.set(k.key, k); R.mergeMsgs(k); }
    const L3 = [1, 2, 3, 4, 5].map(i => ({ id: 'sp' + i, t: 1.7e12 + i * 1000 + 100, kind: 'spawn', x: 'w' + i })); Talk.collect('tt:F', fp, L3);
    A(L3.filter(x => x.kind === 'spawn').length === 1 && L3.filter(x => x.kind === 'fan').length === 1 && /같은 지시 4개/.test(L3.find(x => x.kind === 'fan').x), 'fan-out: first spawn card + one line');
    const oldMg = R.A.mg; R.A.mg = {};
    for (let i = 0; i < 34; i++) R.A.mg['budget:' + i] = new Map(Array.from({ length: 8 }, (_, j) => { const m = savedMsg((i * 8 + j).toString(16).padStart(12, '0'), 'x'.repeat(4000)); return [m.id, m]; }));
    R.saveMsgs(true); const saved = R.store.get('room.msgs', {}), chars = Object.values(saved).flat().reduce((n, m) => n + m.text.length, 0);
    A(chars > 1e6 && chars <= 1032000 && Object.keys(saved).length < 34, 'saved message text stops around one million characters');
    R.A.mg = oldMg; R.saveMsgs(true);
    for (const k of [...tm.values(), ...fm.values()]) { R.M.agents.delete(k.key); delete R.A.mg[k.key]; } delete R.A.talks['tt:P']; R.saveTalks();
    A(Talk.stateOf({ st: 'held', hat: Date.now() - 301000 }).k === 'exp' && Talk.stateOf({ st: 'held', hat: Date.now() - 1000 }).k === 'held' && Talk.stateOf({ st: 'refused', why: 'duplicate' }).t.includes('같은 내용'), 'held expires after 5 min (UI timer)');
    // project (OVERVIEW-CONTRACT §1): sanitised in normalize, inherited by a subagent without its own repo, absent stays null
    const pm = new Map(); R.normalize('pj', { id: 'A', project: { name: 'repo', branch: 'main', key: 'k1', root: '/r' }, kids: [{ id: 'B' }, { id: 'C', project: { name: 'other', key: 'k2' } }] }, null, 0, pm, 0);
    R.normalize('pj', { id: 'D', project: { name: 7 } }, null, 0, pm, 0);
    A(pm.get('pj:A').project.key === 'k1' && pm.get('pj:B').project.name === 'repo' && pm.get('pj:C').project.key === 'k2' && pm.get('pj:C').project.branch === '' && pm.get('pj:D').project === null, 'project normalised, inherited, rejected');
    // the overview needs the polled model: finish asynchronously (talkfx serves it), then report
    const wait = (cond, ms = 6000) => new Promise((ok, no) => { const t0 = Date.now(); (function poll() { if (cond()) ok(); else if (Date.now() - t0 > ms) no(new Error('selftest: timeout waiting for ' + String(cond).slice(0, 90))); else setTimeout(poll, 50); })(); });
    const tick = () => new Promise(r => setTimeout(r, 30));
    (async () => {
      try {
        const S = R.S, fun0 = S.fun;
        S.fun = false; R.applySettings();
        if (location.hash !== '#/chat') { R.closeRoom(); await tick(); }
        await wait(() => R.M.loaded && document.querySelector('#pempty .ov [data-agent]'));
        const ov = document.querySelector('#pempty .ov');
        A(ov && !document.querySelector('#pempty').hidden && Overview.mode === 'wire', 'overview (배선 지도) fills the empty pane by default');
        A(ov.querySelectorAll('.ovw [data-agent]').length >= [...R.M.roots.s01 || []].length && ov.querySelector('[data-agent="s01:cl-data"]'), 'wiring map has a card per agent');
        A([...ov.querySelectorAll('.ovn.prj .nm')].some(x => x.textContent === 'data-pipeline') && [...ov.querySelectorAll('.ovn.prj .nm')].some(x => x.textContent === '기타'), 'grouped by project (기타 for agents without one)');
        const lab = [...ov.querySelectorAll('.ovn.prj .nm')].find(x => x.textContent === '<b>lab</b>');
        A(lab && !lab.querySelector('b'), 'project names on the map are text, not markup');
        const card = ov.querySelector('[data-agent="s01:cl-data"]');
        A(/데이터셋 정리/.test(card.getAttribute('aria-label')) && /프로젝트 data-pipeline/.test(card.getAttribute('aria-label')), 'agent card has an aria label with project');
        // model chip on the wiring-map cards: short name; '⇄' + chg when it changed, fb while a safeguard reroute holds
        {
          const md = ov.querySelector('[data-agent="s01:cl-data"] .mdl'), mb = ov.querySelector('[data-agent="s01:cl-bypass"] .mdl');
          A(md && !md.hidden && md.textContent === 'opus-5.5' && !md.classList.contains('chg') && !md.classList.contains('fb'), 'wiring-map card shows the short model chip (' + (md && md.textContent) + ')');
          A(mb && !mb.hidden && mb.classList.contains('chg') && mb.classList.contains('fb') && mb.textContent.startsWith('⇄') && /opus-5\.5/.test(mb.textContent), 'a rerouted agent chip is marked ⇄ and fb (' + (mb && mb.textContent) + ')');
        }
        // list-pane splitter: clamp, keyboard, reset, persisted in room.ui; the channel error card fits the narrowest list
        {
          const sp = R.listSplit, list = document.querySelector('#list'), lw = () => Math.round(list.getBoundingClientRect().width), w0 = lw();
          A(sp && sp.el.getAttribute('role') === 'separator' && !sp.el.hidden && +sp.el.getAttribute('aria-valuenow') === w0, 'list splitter is a separator showing the current width');
          sp.set(5000); await tick(); A(R.U.listW === sp.max() && lw() === sp.max() && sp.max() <= 560, 'splitter clamps to the max (' + lw() + ')');
          sp.set(10); await tick(); A(R.U.listW === 260 && lw() === 260 && +sp.el.getAttribute('aria-valuenow') === 260, 'splitter clamps to 260');
          sp.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); await tick(); A(lw() === 276 && R.U.listW === 276, '→ widens the list by 16 px');
          await new Promise(r => setTimeout(r, 250)); A((JSON.parse(localStorage.getItem('room.ui') || '{}').listW) === 276, 'the list width persists in room.ui');
          sp.set(260); await tick();
          const card = document.querySelector('#lnote .bn-err:not([hidden])');
          A(card && card.querySelector('.t').textContent === 'SSH 연결이 끊겼습니다', 'the password-session channel shows its error card');
          const btns = [...card.querySelectorAll('.acts .btn')].filter(b => b.offsetParent !== null), cr = card.getBoundingClientRect();
          A(card.scrollWidth <= card.clientWidth && btns.every(b => { const r = b.getBoundingClientRect(); return r.left >= cr.left - 0.5 && r.right <= cr.right + 0.5; }), 'the error card fits a 260 px list (' + card.scrollWidth + '/' + card.clientWidth + ')');
          A(btns.map(b => b.textContent).join('|') === '비밀번호로 연결|키 로그인 설정|로그 보기' && card.querySelector('.hint .ht').textContent.length <= 60 && card.querySelector('.hint .raw').hidden && !card.querySelector('.hint .more').hidden, 'short copy; raw ssh line behind 자세히; no 지금 확인 while it waits for a password (' + btns.map(b => b.textContent).join('|') + ')');
          A(/비밀번호를 기다리는 중$/.test(card.querySelector('.sub').textContent), 'a password-session channel says it waits for the password (' + card.querySelector('.sub').textContent + ')');
          card.querySelector('.hint .more').click(); A(!card.querySelector('.hint .raw').hidden && /Permission denied/.test(card.querySelector('.hint .raw').textContent) && card.scrollWidth <= card.clientWidth, '자세히 shows the raw line, still wrapped');
          card.querySelector('.hint .more').click();
          sp.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })); await tick(); A(R.U.listW == null && lw() === w0, 'Home resets the list width');
        }
        // mode toggle: header radio -> 재미 모드 (픽셀 던전 if the atlas exists, else the map with a note); back
        ov.querySelector('.ov-seg [data-v=dungeon]').click(); await tick();
        const dgOk = typeof OvDungeon !== 'undefined' && OvDungeon.available();
        A(S.fun === true && (dgOk ? Overview.mode === 'dungeon' && ov.querySelector('.ovd canvas') : Overview.mode === 'wire' && !ov.querySelector('.ov-note').hidden), 'mode toggle switches to 픽셀 던전 (or explains the fallback)');
        if (Overview.mode === 'dungeon') {
          const vis = Object.values(R.M.roots).flat().filter(a => !R.isHidden(a)), sc = OvDungeon.scene(), hero = k => sc.heroes.find(x => x.id === k);
          A(vis.length > 3 && vis.every(a => ov.querySelector('.ovd button[data-agent="' + CSS.escape(a.key) + '"]')), 'one button[data-agent] per visible root agent');
          A(sc.heroes.length === vis.length && sc.rooms.length >= 2 && sc.rooms.every(r => r.id && r.name != null), 'the dungeon scene has a hero per root agent and its chambers (' + sc.heroes.length + '/' + vis.length + ', ' + sc.rooms.length + ' rooms)');
          // activity per fixture agent (the hero's k is what act() answers)
          const want = { 's01:cl-parse': 'fight', 's01:cx-daemon': 'train', 's01:cl-wait': 'gate', 's01:cx-nodaemon': 'camp', 's01:cl-big': 'summon', 's01:cl-bypass': 'loot', 'pc:cl-grep': 'explore', 'pc:cl-win': 'forge', 'pc:cl-web': 'scout', 'pc:cl-stall': 'stuck', 'pc:cl-stopped': 'down', 'pc:cl-dead': 'grave' };
          const got = Object.keys(want).filter(k => !hero(k) || hero(k).k !== want[k]).map(k => k + '=' + (hero(k) ? hero(k).k : '-') + ' (want ' + want[k] + ')');
          A(!got.length, 'hero activities follow the agents: ' + got.join(', '));
          A(['train', 'explore', 'forge', 'fight', 'scout', 'summon', 'gate', 'stuck', 'camp', 'loot', 'down', 'grave'].every(k => sc.heroes.some(x => x.k === k)), 'the fixtures show every activity');
          // 던전 크기: − / + change the scale when the steps differ; the choice persists
          const z0 = S.ofcSize, st = OvDungeon.steps(), zb = ov.querySelectorAll('.ov-zoom .ov-zb');
          A(!ov.querySelector('.ov-zoom').hidden && zb.length === 2 && st.l >= st.m && st.m >= st.s, 'size control shown with the dungeon; 크게 >= 보통 >= 작게');
          S.ofcSize = 'm'; R.applySettings(); await tick(); const sm = OvDungeon.scale(); A(sm === st.m, 'dungeon 보통 draws at its step (' + sm + ')');
          if (st.l !== st.m) {
            zb[1].click(); await tick(); A(S.ofcSize === 'l' && OvDungeon.scale() === st.l && OvDungeon.scale() > sm && zb[1].disabled, '+ grows the dungeon (' + sm + ' -> ' + OvDungeon.scale() + ')');
            await new Promise(r => setTimeout(r, 250)); A(JSON.parse(localStorage.getItem('room.settings') || '{}').ofcSize === 'l', 'dungeon size persists');
            zb[0].click(); await tick(); A(OvDungeon.scale() < st.l, '− shrinks it again');
          }
          S.ofcSize = z0; R.applySettings(); await tick();
        }
        ov.querySelector('.ov-seg [data-v=wire]').click(); await tick();
        A(S.fun === false && Overview.mode === 'wire', 'mode toggle back to 배선 지도');
        // 색 팔레트 (21-palettes.css): 기본 = no data-palette and the pre-palette values; every palette moves --canvas/--accent but never the red
        // alert family; contrast holds; 맞추기 follows S.ovTheme; the 배선 지도 wears the palette (fan theme only under 기본); persisted; picker works
        {
          const html = document.documentElement, tk = n => getComputedStyle(html).getPropertyValue(n).trim(), p0 = S.palette, t0 = S.theme, o0 = S.ovTheme;
          const OLD = { light: { '--canvas': '#F2F2F5', '--surface': '#FFFFFF', '--line': '#E3E3E8', '--ink': '#1D1D1F', '--ink-2': '#6E6E73', '--signal': '#E5342B', '--signal-text': '#C4261E', '--warn': '#9E4F00' },
                        dark: { '--canvas': '#1C1C1E', '--surface': '#2C2C2E', '--line': '#3A3A3C', '--ink': '#F5F5F7', '--ink-2': '#98989D', '--signal': '#FF5A4F', '--signal-text': '#FF7A70', '--warn': '#F0A24A' } };
          const RED = ['--signal', '--signal-text', '--on-signal'];
          const rgb = c => { const e = R.h('i'); e.style.color = c; document.body.append(e); const m = getComputedStyle(e).color.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number); e.remove(); return m; };
          const L = c => { const [r, g, b] = rgb(c).map(x => { x /= 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
          const cr = (a, b) => { const x = L(tk(a)), y = L(tk(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
          const pb = R.h('button.btn.primary', { style: 'transition: none' }, 'x'); document.body.append(pb);   // no 120 ms background fade mid-check
          for (const th of ['light', 'dark']) {
            S.theme = th; S.palette = 'default'; R.applySettings();
            A(!html.hasAttribute('data-palette') && Object.entries(OLD[th]).every(([k, v]) => tk(k) === v), '기본 keeps the pre-palette tokens (' + th + ')');
            A(rgb(getComputedStyle(pb).backgroundColor).join() === rgb(tk('--ink')).join() && ov.dataset.ovt === S.ovTheme, '기본: primary = ink, 배선 지도 keeps the fan theme (' + th + ')');
            const red = RED.map(tk).join(), seen = new Set();
            for (const [p] of R.PALETTES) {
              if (p === 'default' || p === 'match') continue;
              S.palette = p; R.applySettings(); await tick();
              A(html.dataset.palette === p && R.palette() === p, 'palette attribute ' + p);
              A(RED.map(tk).join() === red, 'alert red is the same in ' + p + '/' + th);
              A(tk('--canvas') !== OLD[th]['--canvas'] && tk('--accent') !== tk('--ink') && rgb(tk('--accent')).join() === rgb(getComputedStyle(pb).backgroundColor).join(), p + ' moves --canvas / --accent; the primary button follows');
              A(cr('--ink', '--surface') >= 4.5 && cr('--ink', '--canvas') >= 4.5 && cr('--on-accent', '--accent') >= 4.5 && cr('--ink-2', '--surface') >= 3 && cr('--ink-2', '--canvas') >= 3 && cr('--focus', '--surface') >= 3 && cr('--signal-text', '--surface') >= 4.5, 'contrast in ' + p + '/' + th);
              A(!ov.dataset.ovt && rgb(getComputedStyle(ov).backgroundColor).join() === rgb(tk('--canvas')).join(), '배선 지도 wears the ' + p + ' palette');
              seen.add(tk('--canvas') + tk('--accent'));
            }
            A(seen.size === 5, 'five distinct palettes (' + th + ')');
          }
          S.palette = 'match'; S.ovTheme = 'gemini'; R.applySettings(); A(html.dataset.palette === 'gemini', '맞추기 follows the overview theme');
          S.ovTheme = 'muse'; R.applySettings(); A(html.dataset.palette === 'muse' && R.palette() === 'muse', '맞추기 follows an overview theme change');
          S.palette = 'nope'; R.applySettings(); A(S.palette === 'default' && !html.hasAttribute('data-palette'), 'unknown palette falls back to 기본');
          S.palette = 'grok'; R.applySettings(); await new Promise(r => setTimeout(r, 250));
          A(JSON.parse(localStorage.getItem('room.settings') || '{}').palette === 'grok', 'palette persists');
          // the picker in 설정 › 화면: radio cards with swatches drawn in their own palette; click + arrow keys
          location.hash = '#/settings'; await wait(() => document.querySelector('.palg') && document.querySelector('.palg').offsetParent);
          const pg = document.querySelector('.palg'), rb = [...pg.querySelectorAll('[role=radio]')];
          A(pg.getAttribute('role') === 'radiogroup' && rb.length === R.PALETTES.length && rb.every(b => b.querySelector('.pal-sw[data-palette]')) && rb.filter(b => b.tabIndex === 0).length === 1 && rb.find(b => b.dataset.v === 'grok').getAttribute('aria-checked') === 'true', 'palette picker: one radio per palette, roving tabindex, current checked');
          const sc = n => getComputedStyle(rb.find(b => b.dataset.v === n).querySelector('.pal-sw')).backgroundColor;
          A(sc('claude') !== sc('chatgpt') && sc('default') !== sc('grok'), 'swatches draw in their own palette');
          rb.find(b => b.dataset.v === 'chatgpt').click(); A(S.palette === 'chatgpt' && html.dataset.palette === 'chatgpt', 'clicking a card applies it');
          rb.find(b => b.dataset.v === 'chatgpt').focus(); rb[0].parentNode.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
          A(S.palette === 'gemini' && document.activeElement === rb.find(b => b.dataset.v === 'gemini'), 'arrow keys move the palette');
          A(rb.find(b => b.dataset.v === 'match').querySelector('.pal-sw').dataset.palette === S.ovTheme, '맞추기 card previews the overview theme');
          location.hash = '#/chat'; await wait(() => !document.querySelector('#pempty').hidden);
          pb.remove(); S.palette = p0; S.theme = t0; S.ovTheme = o0; R.applySettings(); await tick();
        }
        // clicking an agent routes to its room
        ov.querySelector('[data-agent="s01:cl-data"]').click();
        await wait(() => location.hash === '#/chat/s01/cl-data' && !document.querySelector('#proom').hidden);
        const hc = document.querySelector('#proom .pmrow .pj');
        A(hc && hc.textContent === 'data-pipeline' && /main/.test(hc.title), 'room header shows the project chip');
        R.closeRoom(); await wait(() => !document.querySelector('#pempty').hidden);
        // project chip in room rows uses textContent
        const rowOf = k => { const ag = R.M.agents.get(k), el = C.roomRow(ag); C.setRoomRow(el, ag); return el.querySelector('.pj'); };
        const c1 = rowOf('cloud:cl-cloud'), c2 = rowOf('s01:cl-data'), c3 = rowOf('s01:cl-nosock');
        A(c1.textContent === '<b>lab</b>' && !c1.querySelector('b') && c2.textContent === 'data-pipeline' && /data-pipeline · 브랜치 main/.test(c2.title) && c3.hidden, 'room rows: project chip text uses textContent (hidden without a project)');
        // the way back: a visible '‹ 오버뷰' button on wide windows, and Esc
        ov.querySelector('[data-agent="s01:cl-data"]').click();
        await wait(() => !document.querySelector('#proom').hidden);
        const bk = document.querySelector('#proom .back');
        A(bk && getComputedStyle(bk).display !== 'none' && bk.textContent === '‹ 오버뷰', 'room header shows the way back to the overview');
        bk.click(); await wait(() => !document.querySelector('#pempty').hidden && location.hash === '#/chat');
        // 정리: hide all finished rooms, they leave list + overview; a hidden room that works again comes back; 다시 보기 restores
        const fin = [...R.M.agents.values()].filter(R.canHide);
        A(fin.length > 0 && fin.every(x => ['done', 'stopped', 'dead'].includes(x.st) && !R.isWaiting(x)), 'canHide: finished, not waiting');
        A(![...R.M.agents.values()].some(x => (x.st === 'user' || x.st === 'work') && R.canHide(x)), 'canHide: never a working or waiting room');
        const cards0 = ov.querySelectorAll('[data-agent]').length;
        document.querySelector('.tidy').click();
        await wait(() => ov.querySelectorAll('[data-agent]').length < cards0);
        A(fin.every(x => R.isHidden(x)) && !fin.some(x => document.querySelector('#rooms [data-key="' + CSS.escape(x.key) + '"]')), 'tidy hides finished rooms from the list');
        A(/숨긴 방 \d+개 다시 보기/.test(document.querySelector('.unhide').textContent) && document.querySelector('.tidy').hidden, 'restore button replaces the tidy button');
        const back0 = { ...fin[0] }; fin[0].st = 'work'; A(!R.isHidden(fin[0]), 'a hidden room that works again is shown'); Object.assign(fin[0], back0);
        document.querySelector('.unhide').click();
        await wait(() => ov.querySelectorAll('[data-agent]').length === cards0);
        A(!fin.some(R.isHidden), '다시 보기 restores every hidden room');
        // 답변 완료 is not 입력 대기: a plain answer is done (never counted); a question waits; an older collector's '답변 끝남' reads as done
        const U = R.U, ag = k => R.M.agents.get(k), rowEl = k => document.querySelector('#rooms [data-key="' + CSS.escape(k) + '"]'), qo0 = U.quietOpen; U.quietOpen = true;
        for (const k of Object.keys(U.ack)) delete U.ack[k]; for (const k of Object.keys(U.doneMark)) delete U.doneMark[k]; R.unmarkDone([]);   // the rooms opened above were acked: start clean
        const byA = ag('s01:cl-bypass'), qA = ag('s01:cl-data'), WK = 's01:cl-wait';
        A(byA.st === 'done' && !R.isWaiting(byA) && !R.M.waiting.includes(byA) && R.needsMe(qA) && R.M.waiting.includes(qA), 'an answered session is not counted; a question is');
        A(R.normalize('old', { id: 'o', st: 'user', why: '답변 끝남 · 입력 기다림' }, null, 0, new Map(), 0).st === 'done', "an older collector's 답변 끝남 is read as done");
        const n0 = R.M.counts.waiting;
        A(n0 >= 3 && R.needsMe(ag(WK)) && rowEl(WK).closest('#rooms') && document.querySelector('#rooms .sec.s-wait .ackall'), '안읽음 lists the approval; 모두 읽음 is offered');
        // 안읽음 is red while N > 0 (section title, overview chip, row badges), calm at 0
        const probe = (host, v) => { const x = document.createElement('i'); x.style.color = 'var(' + v + ')'; host.append(x); const c = getComputedStyle(x).color; x.remove(); return c; };
        const turn = ov.querySelector('.ov-turn'), secT = document.querySelector('#rooms .sec.s-wait .stt');
        A(turn.textContent === '안읽음 ' + n0 && getComputedStyle(turn).backgroundColor === probe(ov, '--ov-signal'), 'overview chip "안읽음 N" uses the alert red');
        A(secT && /^안읽음/.test(secT.textContent) && getComputedStyle(secT).color === probe(secT.parentNode, '--signal-text'), 'list section 안읽음 is red');
        A(rowEl(WK).querySelector('.bdg.red, .badge.red'), 'an unread row carries a red count bubble');
        S.fun = true; R.applySettings(); await tick();
        const dungeon = Overview.mode === 'dungeon';
        if (dungeon) A(OvDungeon.cue(WK) === 'bang', "pixel dungeon shows the red '!' for an unread wait");
        S.fun = false; R.applySettings(); await tick();
        A(ov.querySelector('[data-agent="' + WK + '"]').dataset.w === '1', 'wiring map: unread wait is an alert');
        // 읽음: opening the room acknowledges this waiting episode
        R.openRoom('s01', 'cl-wait'); await wait(() => R.isAcked(ag(WK)));
        A(R.M.counts.waiting === n0 - 1 && !R.M.waiting.some(x => x.key === WK) && R.isWaiting(ag(WK)), 'opening a waiting room acks it: out of the count (still waiting underneath)');
        A(!S.titleBadge || document.title.startsWith('(' + (n0 - 1) + ')'), 'title badge follows the read count');
        A(!rowEl(WK).classList.contains('waiting') && rowEl(WK).querySelector('.ackm').textContent === '승인 대기 · 읽음' && !rowEl(WK).querySelector('.ackm').hidden, 'a read approval leaves 안읽음 and keeps a 승인 대기 · 읽음 hint');
        A(!R.canHide(ag(WK)), 'a read approval is still not hideable');
        R.closeRoom(); await wait(() => !document.querySelector('#pempty').hidden);
        A(ov.querySelector('[data-agent="' + WK + '"]').dataset.w === '' && ov.querySelector('[data-agent="' + WK + '"]').dataset.ack === '1', 'wiring map: a read wait is calm');
        if (dungeon) { S.fun = true; R.applySettings(); await tick(); A(OvDungeon.cue(WK) === 'read', "pixel dungeon: a read wait shows the calm '…', not '!'"); S.fun = false; R.applySettings(); await tick(); }
        // a new episode (another reason / a newer signal) alerts again
        const fxW = window.__fx.find('cl-wait'), why0 = fxW.why; fxW.why = '권한 승인 대기: Bash';
        R.refresh(); await wait(() => ag(WK).why === fxW.why);
        A(R.needsMe(ag(WK)) && !U.ack[WK], 'a new waiting episode alerts again');
        // 모두 읽음: acks every room in 안읽음 (current filter)
        document.querySelector('#rooms .sec.s-wait .ackall').click(); await tick();
        A(R.M.counts.waiting === 0 && !document.querySelector('#rooms .sec.s-wait') && document.querySelector('#rooms .secnone'), '모두 읽음 clears 안읽음');
        A(document.querySelector('#rooms .secnone').textContent === '안읽은 방 없음' && turn.textContent === '안읽음 0' && getComputedStyle(turn).backgroundColor !== probe(ov, '--ov-signal'), 'at 0 the chip is calm and the section says 안읽은 방 없음');
        // 작업 완료: the episode is done in the view (hideable, no alert); 되돌리기 puts it back; the room stays
        R.openRoom('s01', 'cl-data'); await wait(() => Room.key === 's01:cl-data' && !document.querySelector('#proom').hidden && !document.querySelector('#proom .donebtn').hidden);
        const dBtn = document.querySelector('#proom .donebtn'), lBtn = document.querySelector('#proom .leavebtn');
        A(/에이전트는 종료하지 않습니다/.test(lBtn.title) && /에이전트는 종료하지 않습니다/.test(dBtn.title), 'done buttons say the agent keeps running');
        dBtn.click(); await tick();
        A(ag('s01:cl-data').st === 'done' && ag('s01:cl-data').why === R.DONE_WHY && R.canHide(ag('s01:cl-data')) && !R.isWaiting(ag('s01:cl-data')) && location.hash === '#/chat/s01/cl-data' && rowEl('s01:cl-data'), '작업 완료: shown as done, hideable, the room stays');
        const undo = () => [...document.querySelectorAll('#toasts .toast.undo .undob')].pop();
        A(undo(), '작업 완료 offers 되돌리기'); undo().click(); await tick();
        A(ag('s01:cl-data').st === 'user' && !U.doneMark['s01:cl-data'] && R.isAcked(ag('s01:cl-data')), '되돌리기 restores the wait (as read)');
        document.querySelector('#proom .leavebtn').click(); await wait(() => location.hash === '#/chat');
        A(R.isHidden(ag('s01:cl-data')) && !rowEl('s01:cl-data'), '작업 완료 · 방 나가기: done, hidden, closed');
        undo().click(); await tick();
        A(!R.isHidden(ag('s01:cl-data')) && ag('s01:cl-data').st === 'user' && rowEl('s01:cl-data'), '되돌리기 after leaving brings the room back');
        // an approval asks once more before it is marked done
        R.openRoom('s01', 'cl-wait'); await wait(() => Room.key === WK && !document.querySelector('#proom .donebtn').hidden);
        document.querySelector('#proom .donebtn').click(); await tick();
        const cf = document.querySelector('#proom .donecf');
        A(!cf.hidden && /에이전트는 계속 승인을 기다립니다/.test(cf.textContent) && ag(WK).st === 'user', 'approval: 작업 완료 asks for confirmation first');
        cf.querySelector('.btn.primary').click(); await tick();
        A(ag(WK).st === 'done' && cf.hidden, 'approval: confirmed 작업 완료');
        R.closeRoom(); await wait(() => !document.querySelector('#pempty').hidden);
        // a new episode clears the mark by itself
        fxW.why = why0; R.refresh(); await wait(() => ag(WK).st === 'user');
        A(!U.doneMark[WK] && R.needsMe(ag(WK)), 'a new episode clears 작업 완료 and alerts again');
        U.quietOpen = qo0; for (const k of Object.keys(U.ack)) delete U.ack[k]; R.unmarkDone([]);
        S.fun = fun0; R.applySettings();
        // 세션 종료: the room header offers it only for a session the collector marked end.ok; two steps (button, then 종료)
        const fxs0 = window.__fx;
        R.openRoom('s01', 'cl-data'); await wait(() => Room.key === 's01:cl-data' && !document.querySelector('#proom').hidden);
        const eb = document.querySelector('#proom .endbtn'), ecf = document.querySelector('#proom .endcf'), ecNo = [...ecf.querySelectorAll('button')].find(b => b.textContent === '취소');
        A(eb && !eb.hidden && ecf.hidden, 'an end.ok session shows 세션 종료, confirm strip closed');
        eb.click(); await tick(); A(!ecf.hidden && /pid 51044/.test(ecf.textContent) && fxs0.ends.length === 0, 'the button opens the confirm strip; nothing is sent yet');
        ecNo.click(); await tick(); A(ecf.hidden && fxs0.ends.length === 0, '취소 closes the confirm strip');
        R.openRoom('s01', 'cl-self'); await wait(() => Room.key === 's01:cl-self');
        await tick(); A(document.querySelector('#proom .endbtn').hidden && document.querySelector('#proom .endcf').hidden, "a session with end.reason 'self' has no 세션 종료");
        // 유휴 세션 정리: the long-idle fixture (3 days) is offered, unchecked; two presses to confirm; one api/end for that id
        R.closeRoom(); await wait(() => !document.querySelector('#pempty').hidden && document.querySelector('#pempty .ov'));
        S.fun = false; R.applySettings(); await tick();
        const rp = ov.querySelector('.ov-reap'), longIdle = [...R.M.agents.values()].filter(R.isLongIdle);
        A(rp && !rp.hidden && longIdle.length === 1 && longIdle[0].key === 'pc:cl-old' && rp.textContent === '유휴 세션 1', '유휴 세션 button counts the long-idle fixture (' + (rp && rp.textContent) + ')');
        rp.click(); await tick();
        const rd = document.querySelector('dialog.reap'), rows = rd.querySelectorAll('.reap-row'), rgo = rd.querySelector('.acts .btn.danger');
        A(rd.open && rows.length === 1 && rows[0].querySelector('input[type=checkbox]') && !rows[0].querySelector('input[type=checkbox]').checked && rgo.disabled, 'the dialog lists it, unchecked; 종료 stays disabled');
        rows[0].querySelector('input[type=checkbox]').click(); await tick();
        A(!rgo.disabled && fxs0.ends.length === 0, 'ticking a row only enables 종료');
        rgo.click(); await tick(); A(fxs0.ends.length === 0 && /정말 종료/.test(rgo.textContent), 'the first press only asks again; nothing is sent');
        rgo.click(); await wait(() => fxs0.ends.length === 1 && /1개 종료/.test(rd.textContent));
        A(fxs0.ends.length === 1 && fxs0.ends[0].id === 'cl-old' && fxs0.ends[0].ch === 'pc', 'the second press sends one api/end for that id');
        await wait(() => !R.M.agents.has('pc:cl-old')); rd.querySelector('.acts .btn:not(.danger)').click(); await tick();
        A(!rd.open && ov.querySelector('.ov-reap').hidden, 'the ended session leaves the model; the header button hides');
        // 키 로그인 다시 설정 on a password-session channel: key_rejected -> confirm_fix card (findings + exact command) -> fix -> done
        const fxs = window.__fx, pch = { id: 'pwsess', name: 'lab-b', kind: 'ssh', state: 'error', error: 'Permission denied: x', t: null, stale: false, port: 22, auth: 'password-session', session_pw: true, ssh: 'alice@example.org', args: [] };
        R.M.channels.push(pch);
        try {
          AddServer.open({ ch: 'pwsess', rekey: true });
          const dl = document.querySelector('dialog.addsrv'), fb = dl.querySelector('.fixc');
          A(dl.open && /^키 로그인 다시 설정 — lab-b$/.test(dl.querySelector('#as-title').textContent) && !dl.querySelector('.sess').hidden && !dl.querySelector('.sess input').checked && /이번 실행에서 입력한 비밀번호/.test(dl.querySelector('#as-pw').placeholder), 'rekey dialog: title, session box offered but off, password reuse');
          dl.querySelector('#as-form button[type=submit]').click();
          await wait(() => !fb.hidden, 8000);
          const sp = fxs.srvPosts[fxs.srvPosts.length - 1];
          A(sp.id === 'pwsess' && sp.reuse_password === true && !sp.session_password && sp.password === '', 'rekey posts the channel id, reuses this run\'s password, no session mode');
          A(fb.querySelector('.fixcmd').textContent === 'chmod go-w ~' && fb.querySelectorAll('.finds li').length === 2 && fb.querySelector('.finds li[data-lv=fix] .lv').textContent === '고칠 수 있음' && !fb.querySelector('.finds b') && /<b>sshd<\/b>/.test(fb.textContent), 'confirm_fix card lists the findings (as text) and the exact fix command');
          A(document.activeElement === fb.querySelector('.btn.primary') && fb.querySelector('.btn.primary').textContent === '권한 고치고 다시 시도' && !fb.querySelectorAll('.btn')[1].hidden, 'fix is the default; session password stays an option');
          fb.querySelector('.btn.primary').click();
          await wait(() => dl.querySelector('h3.t-section') && dl.querySelector('h3.t-section').textContent === '연결 완료' && !dl.querySelector('h3.t-section').closest('div').hidden, 8000);
          A(fxs.srvJob.choice === 'fix' && /고친 내용: chmod go-w ~/.test(dl.textContent) && /키로 접속합니다/.test(dl.textContent), 'the fix answer goes to job/confirm; done says what was fixed');
          dl.close();
        } finally { const pi = R.M.channels.indexOf(pch); if (pi >= 0) R.M.channels.splice(pi, 1); }
        // ===== SSH convenience: host parsing, ~/.ssh/config chips, key-only servers, 지금 확인 -> api/channels/retry, countdown, rename / move / remove =====
        {
          const fxs = window.__fx, P_ = AddServer.parseHost;
          const T = [['alice@example.lab', 'example.lab', 'alice', ''], ['alice@example.lab:2222', 'example.lab', 'alice', '2222'], ['example.lab:2222', 'example.lab', '', '2222'],
            ['ssh alice@example.lab', 'example.lab', 'alice', ''], ['ssh -p 2222 alice@example.lab', 'example.lab', 'alice', '2222'], ['ssh -l bob example.lab -p 2222', 'example.lab', 'bob', '2222'],
            ['ssh://alice@example.lab:2222', 'example.lab', 'alice', '2222'], ['[2001:db8::1]:2222', '2001:db8::1', '', '2222'], ['2001:db8::1', '2001:db8::1', '', ''],
            ['alice@[::1]:22', '::1', 'alice', '22'], ['ssh -v -oPort=2200 -o User=carol my_box', 'my_box', 'carol', '2200'], ['  "bob@h_1"  ', 'h_1', 'bob', '']];
          for (const [s, host, user, port] of T) { const r = P_(s); A(r && !r.bad && r.host === host && r.user === user && r.port === port, 'parseHost ' + s + ' -> ' + JSON.stringify(r)); }
          for (const [s, part] of [['ssh -J bastion alice@h', '-J bastion'], ['ssh -i ~/.ssh/k alice@h', '-i ~/.ssh/k'], ['ssh -o ProxyCommand=x h', '-o ProxyCommand=x'], ['ssh h uptime', 'uptime'], ['ssh -p x h', '-p x']])
            A(P_(s) && P_(s).bad === part, 'parseHost names the part it did not understand: ' + s + ' (' + JSON.stringify(P_(s)) + ')');
          A(P_('gpu-1').host === 'gpu-1' && P_('') === null && P_('a b') === null, 'plain names pass through');
          A(R.hostOk('2001:db8::1') && R.hostOk('my_host') && R.hostOk('::1') && !R.hostOk('[::1]') && !R.hostOk('-x') && !R.hostOk('1:2') && !R.hostOk('a b'), 'hostOk mirrors the hub (IPv6, underscores)');
          A(R.sshKind('EOF') === 'net' && R.sshKind('연결이 끊겼습니다') === 'net' && R.sshKind('[WinError 10054] 현재 연결은 원격 호스트에 의해 강제로 끊겼습니다') === 'net' && R.sshKind('Connection reset by peer') === 'net' && R.sshKind('Connection aborted') === 'net' && R.sshKind('timed out waiting for the collector') === 'net' && R.sshKind('[WinError 10060] x') === 'net' && R.sshKind('weird') === 'other' && /VPN/.test(R.sshHint('EOF')), 'dropped connections get the network hint');
          // the host field: paste, blur and Enter split; a field the text says nothing about is left alone; an unknown option is named
          AddServer.open({});
          const dl = document.querySelector('dialog.addsrv'), $f = q => dl.querySelector(q), host = $f('#as-host'), user = $f('#as-user'), port = $f('#as-port'), pw = $f('#as-pw'), name = $f('#as-name');
          const paste = v => { host.value = v; host.dispatchEvent(new InputEvent('input', { inputType: 'insertFromPaste', bubbles: true })); };
          user.value = ''; paste('ssh -p 2222 alice@example.lab');
          A(host.value === 'example.lab' && user.value === 'alice' && port.value === '2222', 'paste splits an ssh command line');
          user.value = 'bob'; port.value = '22'; host.value = 'h2.lab:2200'; host.dispatchEvent(new FocusEvent('blur'));
          A(host.value === 'h2.lab' && user.value === 'bob' && port.value === '2200', 'blur splits; the account typed by the user stays when the text names none');
          host.value = 'carol@[2001:db8::5]'; host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          A(host.value === '2001:db8::5' && user.value === 'carol' && port.value === '2200', 'Enter splits; the port stays');
          paste('ssh -J bastion alice@h');
          A(/'-J bastion' 부분을 이해하지 못했습니다/.test($f('#as-host-err').textContent) && host.value === 'ssh -J bastion alice@h' && user.value === 'carol', 'an unknown ssh option: rejected, naming the part');
          // 내 SSH 설정에서 고르기: loaded only on click; jump hosts disabled with the reason; registered ones marked; a pick fills the form
          const sb = $f('.scrow .btn'), nPosts = fxs.srvPosts.length;
          A(sb && sb.textContent === '내 SSH 설정에서 고르기' && fxs.confGets === 0 && $f('.sshc').hidden, 'the ~/.ssh/config list loads only when asked');
          sb.click(); await wait(() => dl.querySelectorAll('.sshc .scb').length === 5);
          const scb = al => $f('.sshc .scb[data-alias="' + al + '"]');
          A(fxs.confGets === 1 && sb.getAttribute('aria-expanded') === 'true' && scb('behind').disabled && /경유 서버\(ProxyJump\)는 아직 지원하지 않습니다/.test(scb('behind').textContent) && scb('gpu-01').disabled && scb('gpu-01').dataset.st === 'added' && scb('tok').disabled && !scb('gpu1').disabled && !scb('v6box').disabled, 'chips: jump hosts disabled with the reason, a registered one marked');
          A(/alice@gpu1\.lab\.example:2222/.test(scb('gpu1').textContent) && /carol@\[2001:db8::7\]/.test(scb('v6box').textContent), 'a chip reads alias — user@host:port');
          A(dl.scrollWidth <= dl.clientWidth && [...dl.querySelectorAll('.sshc .scb')].every(x => x.scrollWidth <= x.clientWidth + 1), 'the chip list fits the 480 px dialog');
          scb('gpu1').click(); await tick();
          A(host.value === 'gpu1.lab.example' && user.value === 'alice' && port.value === '2222' && name.value === 'gpu1' && document.activeElement === pw && $f('.sshc').hidden && fxs.srvPosts.length === nPosts, 'a pick fills host / 계정 / 포트 / 이름 and focuses the password; nothing is sent');
          // the 내 키 직접 등록 disclosure in the form
          const ml = $f('.manw .btn');
          A(ml && ml.getAttribute('aria-expanded') === 'false' && $f('#as-man').hidden && fxs.keyGets === 0, 'the manual key route is a closed link; the key is not fetched yet');
          ml.click(); await wait(() => /^ssh-ed25519 /.test($f('#as-man .kpub').textContent));
          A(ml.getAttribute('aria-expanded') === 'true' && /authorized_keys/.test($f('#as-man .kcmd').textContent) && dl.scrollWidth <= dl.clientWidth, 'it shows the key line and the command, inside 480 px');
          // a key-only server: password_disabled card with the key line, the command and 키를 등록했습니다 — 다시 연결 (no password the second time)
          host.value = 'keyonly.example'; user.value = 'u'; pw.value = 'secret'; name.value = '';
          $f('#as-form button[type=submit]').click();
          const band = $f('.bn-err');
          await wait(() => !band.hidden && band.dataset.kind === 'password_disabled' && /^ssh-ed25519 /.test(band.querySelector('.kpub').textContent), 8000);
          A(band.querySelector('.t').textContent === '이 서버는 비밀번호 로그인이 꺼져 있습니다' && !band.querySelector('.manual').hidden && /no-port-forwarding/.test(band.querySelector('.kcmd').textContent) && /agen-talk@FX/.test(band.querySelector('.kpub').textContent), 'key-only server: its own card with the key line and the command');
          const again = [...band.querySelectorAll('.acts .btn')].find(x => /키를 등록했습니다/.test(x.textContent));
          A(again && again.classList.contains('primary') && document.activeElement === again && band.scrollWidth <= band.clientWidth && dl.scrollWidth <= dl.clientWidth, 'the rerun button is the default; the card fits 480 px');
          fxs.keyReg = true; again.click();
          await wait(() => $f('h3.t-section').textContent === '연결 완료' && !$f('h3.t-section').closest('div').hidden, 8000);
          const lp = fxs.srvPosts[fxs.srvPosts.length - 1];
          A(lp.host === 'keyonly.example' && lp.password === '' && !lp.reuse_password && fxs.srvPosts[fxs.srvPosts.length - 2].password === '***', 'the rerun posts the same address without a password');
          dl.close();
          // 지금 확인 -> api/channels/retry, and the countdown (banner + settings row)
          const s01 = fxs.CH.find(c => c.id === 's01');
          Object.assign(s01, { state: 'error', error: 'EOFError: 연결이 끊겼습니다', t: Date.now() / 1000 - 60, retry_at: Date.now() / 1000 + 12.5 });
          R.refresh(); await wait(() => R.chan('s01') && R.chan('s01').state === 'error');
          const bn = States.banner('s01'), nx = bn.querySelector('.sub .nx');
          A(/^1[23]초 뒤 다시 연결$/.test(nx.textContent) && nx.dataset.retry && /VPN/.test(bn.querySelector('.hint .ht').textContent), 'the banner counts down to the next attempt (' + nx.textContent + ') with the network hint');
          A(R.retryText(R.chan('cloud')) === '비밀번호를 기다리는 중' && R.retryText({ state: 'error', kind: 'ssh' }) === '연결 중…' && R.retryText({ state: 'ok' }) === '', 'retryText: waits for the password / 연결 중… / nothing');
          fxs.retries.length = 0; [...bn.querySelectorAll('.acts .btn')].find(x => x.textContent === '지금 확인').click();
          await wait(() => fxs.retries.length === 1);
          A(fxs.retries.join() === 's01', 'banner 지금 확인 calls api/channels/retry for that channel');
          location.hash = '#/settings';
          const row = k => document.querySelector('#set-chan .clist .crow[data-key="' + k + '"]:not(.gone)');
          await wait(() => row('s01') && row('s01').offsetParent);
          s01.retry_at = Date.now() / 1000 + 30; R.refresh();
          await wait(() => /^\d+초 뒤 다시 연결$/.test(row('s01').querySelector('.cnext').textContent) && parseInt(row('s01').querySelector('.cnext').textContent, 10) > 20);
          fxs.retries.length = 0; row('s01').querySelector('.retry').click(); await wait(() => fxs.retries.length === 1);
          A(fxs.retries[0] === 's01' && row('cloud').querySelector('.retry').hidden && row('cloud').querySelector('.cnext').textContent === '비밀번호를 기다리는 중', 'settings 지금 확인 retries that channel; the password-session one waits for its password');
          fxs.retries.length = 0; dispatchEvent(new Event('online')); await wait(() => fxs.retries.length >= 1); await tick();
          A(fxs.retries.join() === 's01', 'online retries every errored channel except the one waiting for a password (' + fxs.retries.join() + ')');
          Object.assign(s01, { state: 'ok', error: null }); delete s01.retry_at; delete s01.t; R.refresh(); await wait(() => R.chan('s01').state === 'ok' && row('s01').querySelector('.cnext').hidden);
          // the ⋯ menu: keyboard, 이름 바꾸기 (inline; duplicates refused before sending), 위로, 주소·계정·포트 수정 (dialog in edit mode), 내 PC has no 수정 / 삭제
          const r1 = row('s01'), mb = r1.querySelector('.cmore'), menu = r1.querySelector('.cmenu');
          mb.click();
          A(!menu.hidden && mb.getAttribute('aria-expanded') === 'true' && menu.getAttribute('role') === 'menu' && document.activeElement === menu.querySelector('.cmi'), '⋯ opens a menu, focus on its first item');
          menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); A(document.activeElement.dataset.k === 'edit', 'arrow keys move in the menu');
          menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); A(menu.hidden && document.activeElement === mb, 'Esc closes it and returns focus');
          mb.click(); menu.querySelector('[data-k=rename]').click();
          const inp = r1.querySelector('.cren input');
          A(inp && document.activeElement === inp && inp.value === 'gpu-01' && r1.querySelector('.cname').hidden, '이름 바꾸기 edits inline');
          fxs.manage.length = 0; inp.value = '내 PC'; inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await tick();
          A(/같은 이름/.test(r1.querySelector('.cerr').textContent) && !fxs.manage.length, 'a duplicate name is refused before anything is sent');
          inp.value = 'gpu-01b'; inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          await wait(() => r1.querySelector('.cname b a').textContent === 'gpu-01b' && !r1.querySelector('.cname').hidden);
          A(fxs.manage.length === 1 && fxs.manage[0].p === 'api/servers/rename' && fxs.manage[0].name === 'gpu-01b' && R.chan('s01').name === 'gpu-01b' && r1.querySelector('.cerr').hidden, 'rename posts api/servers/rename; the row follows');
          await R.apiPost('api/servers/rename', { id: 's01', name: 'gpu-01' }); R.refresh(); await wait(() => R.chan('s01').name === 'gpu-01');
          const rp = row('pc'); rp.querySelector('.cmore').click(); const pmn = rp.querySelector('.cmenu');
          A(pmn.querySelector('[data-k=remove]').hidden && pmn.querySelector('[data-k=edit]').hidden && !pmn.querySelector('[data-k=rename]').hidden && !pmn.querySelector('[data-k=up]').disabled && !pmn.querySelector('[data-k=down]').disabled, '내 PC: rename and move only');
          fxs.manage.length = 0; pmn.querySelector('[data-k=up]').click();
          await wait(() => fxs.manage.length === 1 && R.M.channels[0].id === 'pc');
          await wait(() => [...document.querySelectorAll('#set-chan .clist .crow:not(.gone)')][0].dataset.key === 'pc');
          A(fxs.manage[0].p === 'api/servers/move' && fxs.manage[0].dir === 'up', '위로 posts api/servers/move; the rows follow the new order');
          await R.apiPost('api/servers/move', { id: 'pc', dir: 'down' }); R.refresh(); await wait(() => R.M.channels[1].id === 'pc');
          r1.querySelector('.cmore').click(); r1.querySelector('[data-k=edit]').click();
          A(dl.open && $f('#as-title').textContent === '서버 정보 수정 — gpu-01' && host.value === 'gpu.example.com' && name.disabled && name.value === 'gpu-01' && $f('.scrow').hidden, '주소·계정·포트 수정 opens the dialog prefilled, in edit mode');
          dl.close();
          // 삭제: two steps; the confirm names the key line left on the server; the channel, its filter chip and its room go
          fxs.CH.push({ id: 'tmp', name: 'tmp-srv', kind: 'ssh', state: 'ok', error: null, ssh: 'bob@example.tmp', ssh_args: [] });
          fxs.nodes.tmp = [{ ...fxs.find('cl-ended'), id: 'tmp-a', name: '임시 서버의 세션', kids: [], msgs: [] }];
          R.refresh(); await wait(() => row('tmp') && R.M.agents.has('tmp:tmp-a'));
          R.U.chFilter = 'tmp';
          const rt = row('tmp'); rt.querySelector('.cmore').click(); rt.querySelector('[data-k=remove]').click();
          const cd = rt.querySelector('.cdel');
          fxs.manage.length = 0;
          A(!cd.hidden && /agen-talk@FX/.test(cd.textContent) && /authorized_keys/.test(cd.textContent) && document.activeElement === cd.querySelector('.btn.danger') && cd.scrollWidth <= cd.clientWidth, '삭제 asks first and names the key line left on the server');
          cd.querySelector('.sess input').click(); cd.querySelector('.btn.danger').click();
          await wait(() => !row('tmp') && !R.chan('tmp') && !R.M.agents.has('tmp:tmp-a'));
          A(fxs.manage.length === 1 && fxs.manage[0].p === 'api/servers/remove' && fxs.manage[0].id === 'tmp' && fxs.manage[0].forget_hostkey === true && document.activeElement.classList.contains('cmore'), 'the second step posts api/servers/remove {forget_hostkey}; focus stays in the list');
          location.hash = '#/chat'; await wait(() => !document.querySelector('#pempty').hidden || !document.querySelector('#proom').hidden);
          await tick(); A(R.U.chFilter === 'all', 'a filter on a removed channel falls back to 전체');
          R.openRoom('tmp', 'tmp-a'); await tick(); await tick();
          console.log('SSHUX note: open room of a removed channel -> proom hidden=' + document.querySelector('#proom').hidden + ' missing=' + !!document.querySelector('#proom .missing'));
          R.closeRoom(); await wait(() => !document.querySelector('#pempty').hidden);
        }
        console.log('SELFTEST ok'); document.title = 'SELFTEST ok';
      } catch (e) { console.log('SELFTEST FAIL ' + e.message); document.title = 'SELFTEST FAIL'; }
    })();
  } catch (e) { console.log('SELFTEST FAIL ' + e.message); document.title = 'SELFTEST FAIL'; }
})();
