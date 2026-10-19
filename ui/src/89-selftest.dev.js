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
    // pixel office: motion variants rotate per agent, switching only at loop boundaries onto the shared frame-0 raster
    const CH = typeof OvOffice !== 'undefined' && OvOffice.chars();
    if (CH) {
      const VS = CH.vars('claude', 'lead', 'work'), wb = CH.anim('claude', 'lead', 'work');
      A(VS && VS.length >= 3 && VS[0] === 'work' && VS.every(k => CH.anim('claude', 'lead', k).n === wb.n) && CH.vars('agy', 'intern', 'idle').length >= 3, 'sprite motion variants exist (same length as the base loop)');
      const ms = 1000 / wb.fps, seen = new Set(), seen2 = new Set(); let prev = null, seams = true;
      for (let f = 0; f < wb.n * 40; f++) {
        const p = CH.pick('claude', 'lead', 'work', 0, f * ms + 1, .37, false); seen.add(p.state); seen2.add(CH.pick('claude', 'lead', 'work', 0, f * ms + 1, .81, false).state);
        if (prev && p.seg !== prev.seg && (p.i !== 0 || (prev.state !== 'work' && prev.a.frames[prev.i] !== p.a.frames[0]))) seams = false;
        if (prev && p.seg === prev.seg && p.state !== prev.state) seams = false;
        prev = p;
      }
      A(seen.size > 1 && seen2.size > 1 && seams, 'pick rotates work variants only at loop boundaries (' + [...seen].join(',') + ')');
      A(CH.pick('claude', 'lead', 'work', 0, 12345, .37, true).state === 'work' && CH.pick('claude', 'lead', 'user', 1e6, 1e6, .37, false).state.startsWith('user_loop'), 'reduced motion = base key; intros hand over to the loop rotation');
      // per-agent looks (v2.1): palette swaps + accessory overlays with per-raster head anchors; deterministic per id
      const LK = CH.src.looks, ids = Array.from({ length: 24 }, (_, i) => 'agent-' + i), lks = ids.map(id => CH.lookOf(id, 'claude', 'lead'));
      A(LK && LK.n >= 4 && LK.skin.length >= 3 && LK.pal.claude.claude.length === LK.n && LK.acc.lead.glasses && LK.acc.intern.round && LK.acc.walker.cap && LK.acc.allow.codex.lead.length, 'looks + accessory data exist');
      A(new Set(lks.map(l => l.k)).size > 4 && new Set(lks.map(l => l.look)).size > 2 && lks.some(l => l.acc) && lks.some(l => !l.acc) && CH.lookOf('agent-3', 'claude', 'lead').k === lks[3].k, 'two same-family agents with different ids get different looks (deterministic)');
      A(ids.every(id => CH.lookOf(id + 'k', 'claude', 'intern', 'agent-0').look !== lks[0].look), 'an intern never wears its lead look');
      A(lks.every(l => !l.acc || LK.acc.allow.claude.lead.includes(l.acc)) && !LK.acc.allow.codex.lead.includes('buds') && !LK.acc.allow.agy.lead.includes('cap'), 'accessories respect each family own headwear');
      const fr0 = CH.anim('codex', 'lead', 'work').frames[0];
      A(fr0._hd && fr0._hd.length === 5 && /^[A-E]$/.test(fr0._hd[0]) && CH.famWalker('agy', 'intern') && CH.famWalker('agy', 'intern').anims.walk.frames[0]._hd[0] === 'S' && CH.colleagues().length >= 7, 'head anchors per raster, family walkers and 7 colleagues decode');
      const p1 = CH.pal('claude', 'claude', lks.find(l => l.look)), p0 = CH.pal('claude', 'claude', null);
      A(p1.length === p0.length && p1.some((c, i) => c !== p0[i]) && p1[parseInt('p', 36)] === p0[parseInt('p', 36)], 'a look recolours hair/outfit but keeps the family accent');
    }
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
    const wait = (cond, ms = 6000) => new Promise((ok, no) => { const t0 = Date.now(); (function poll() { if (cond()) ok(); else if (Date.now() - t0 > ms) no(new Error('selftest: timeout')); else setTimeout(poll, 50); })(); });
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
        // mode toggle: header radio -> 재미 모드 (office if sprites exist, else the map with a note); back
        ov.querySelector('.ov-seg [data-v=office]').click(); await tick();
        A(S.fun === true && (typeof OvOffice !== 'undefined' && OvOffice.available() ? Overview.mode === 'office' && ov.querySelector('.ovo canvas') : Overview.mode === 'wire' && !ov.querySelector('.ov-note').hidden), 'mode toggle switches to 픽셀 오피스 (or explains the fallback)');
        if (Overview.mode === 'office') {   // idle walks: scheduled for idle agents, never under reduced motion
          A(OvOffice.walkTest(true) === 0, 'idle walks never start under reduced motion');
          A(OvOffice.walkTest(false) === 1, 'an idle agent gets up for a walk (one per scheduling step)');
          // spatial variety: archetypes per project room, filler kinds, desk variants; all deterministic
          const sc = OvOffice.scene(), ar = sc.rooms.filter(r => r.arch), fl = sc.rooms.filter(r => r.filler);
          A(ar.length >= 3 && new Set(ar.map(r => r.arch)).size >= 3 && ar.every(r => OvOffice.archs().includes(r.arch)), 'at least 3 distinct room archetypes in the scene (' + ar.map(r => r.arch).join(',') + ')');
          A(ar.every((r, i) => !ar.some((q, j) => j !== i && q.si === r.si && q.arch === r.arch)), 'rooms on one storey never share an archetype');
          A(fl.every(r => r.spots > 0) && new Set(Array.from({ length: 24 }, (_, i) => OvOffice.fillKind('s' + i, 200))).size >= 5, 'filler rooms vary (' + (fl.map(r => r.filler).join(',') || 'none at this width') + ') and each has an idle-walk spot');
          A(sc.desks.length && sc.desks.every(d => d.v === OvOffice.deskOf(d.id, d.kind)) && new Set(sc.desks.map(d => d.v)).size >= 4 && new Set(sc.desks.map(d => d.scr)).size >= 3, 'desk variants are a pure function of the agent id and vary (screen rect per variant)');
          const ids = Array.from({ length: 40 }, (_, i) => 'proj-' + i);
          A(ids.every(id => OvOffice.archOf(id) === OvOffice.archOf(id)) && new Set(ids.map(OvOffice.archOf)).size >= 6 && new Set(ids.map(id => OvOffice.deskOf(id, 'lead'))).size >= 8, 'archetype / desk pickers are deterministic and spread');
          const key = x => JSON.stringify([x.rooms.filter(r => r.arch).map(r => r.id + '=' + r.arch), x.desks.map(d => d.id + '=' + d.v)]);
          OvOffice.relayout(); A(key(OvOffice.scene()) === key(sc), 'a relayout assigns the same archetypes and desks');   // fillers follow the width, which a relayout may change (scrollbar)
        }
        ov.querySelector('.ov-seg [data-v=wire]').click(); await tick();
        A(S.fun === false && Overview.mode === 'wire', 'mode toggle back to 배선 지도');
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
        S.fun = fun0; R.applySettings();
        console.log('SELFTEST ok'); document.title = 'SELFTEST ok';
      } catch (e) { console.log('SELFTEST FAIL ' + e.message); document.title = 'SELFTEST FAIL'; }
    })();
  } catch (e) { console.log('SELFTEST FAIL ' + e.message); document.title = 'SELFTEST FAIL'; }
})();
