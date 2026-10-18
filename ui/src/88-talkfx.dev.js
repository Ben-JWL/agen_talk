/* ===== 88-talkfx.dev.js — dev build only. ?talkfx=1 replaces fetch() with a synthetic hub (no network, no real agents):
   rooms for every talk situation (TALK-UX §10), api/talk answers scripted by tags in the text: #held #refused #dup #unreach #unknown #429 #slow.
   window.__fx.deliver(key) plays "the transcript record arrived"; __fx.down = true plays a dead hub. ===== */
(() => {
  if (!new URLSearchParams(location.search).has('talkfx')) return;
  const NOW = Date.now(), T0 = NOW;
  let seq = 0; const hex = () => (++seq).toString(16).padStart(12, '0');
  const sec = ago => (NOW - ago * 1000) / 1000;
  const M_ = (dir, kind, from, to, who, ago, text, o = {}) => ({ id: hex(), dir, kind, from, to, who, ts: sec(ago), text, ...o });
  const acts = (...a) => a.map(([ago, k, x]) => ({ t: sec(ago), k, x }));
  const nd = (id, tool, name, st, why, age, since, o = {}) => ({ id, tool, name, st, why, age, since: st === 'done' || st === 'idle' ? null : since, now: null, last: null, meta: '', procs: [], kids: [], hidden: 0, acts: [], msgs: [], talk: { ok: false, reason: 'subagent' }, ...o });
  const TOK = { ok: true, max: 4000 };
  const long = '이 저장소의 src/ 아래 파일 가운데 담당 샤드에 해당하는 것만 골라 린트를 돌리고, 수정이 필요한 곳을 파일별 목록으로 정리해 줘.\n파일은 직접 고치지 말고, 규칙 이름과 줄 번호만 보고해 줘.\n생성된 코드(gen/)와 vendor/ 는 건너뛰어도 돼.\n끝나면 build/ 폴더는 그대로 두고, 마지막에 한 줄 요약을 붙여 줘.';
  const DUP = '담당 샤드의 파일을 린트하고, 수정이 필요한 곳만 목록으로 보고해 줘. 파일은 고치지 마.';
  const kid = (parent, id, tool, name, st, why, age, since, down, o = {}) => nd(id, tool, name, st, why, age, since, { ...o, msgs: [down ? (down.enc ? M_('down', tool === 'codex' ? 'codex' : 'agent', parent.id, id, parent.name, down.ago, '', { encrypted: true, role: down.role || 'worker' }) : M_('down', 'agent', parent.id, id, parent.name, down.ago, down.t)) : null, ...(o.msgs || [])].filter(Boolean) });

  // 1. Claude root with sub-agents: parent room, child rooms, report, follow-up, locked (codex) instruction, cross-process child
  const P = nd('cl-data', 'claude', '데이터셋 정리', 'user', '답변 끝남 · 입력 기다림', 240, 3100, { meta: 'pid 51044 · ~/work/data · claude-opus-4', talk: TOK, hidden: 0 });
  P.kids = [
    kid(P, 'data-dedupe', 'claude', 'data_dedupe', 'done', '완료 보고됨', 900, null, { ago: 3000, t: '데이터셋 v2에서 중복 행을 찾아 제거해 줘.\n같은 키는 하나만 남기고, 제거 목록은 results/dups.txt 에 남겨 줘.\n통계는 건드리지 마.' }, { meta: 'general-purpose', msgs: [M_('up', 'agent', 'data-dedupe', 'cl-data', '데이터셋 정리', 1800, '중복 12건 제거함. 제거 목록은 results/dups.txt.')] }),
    kid(P, 'data-stats', 'codex', 'data_stats', 'work', '모델 응답 중', 8, 1500, { enc: true, ago: 1520, role: 'worker' }, { meta: 'gpt-5.1 · worker', now: '통계 요약을 작성하는 중입니다', acts: acts([1500, 'say', '통계 요약을 작성하는 중입니다'], [1490, 'tool', '$ python stats.py --lib v2']),
      msgs: [M_('follow', 'codex', 'cl-data', 'data-stats', '데이터셋 정리', 900, '분포 표는 CSV로도 저장해 줘.'), M_('follow', 'codex', 'cl-data', 'data-stats', '데이터셋 정리', 300, '', { encrypted: true, role: 'worker' })] }),
    kid(P, 'data-lint', 'claude', 'data_lint', 'user', '명령 승인 대기', 120, 900, { ago: 880, t: '린트 규칙으로 레코드 형식을 검사해 줘.' }, { now: '$ ruff check .', meta: 'general-purpose' }),
  ];
  P.kids[1].kids = [kid(P.kids[1], 'stats-plot', 'claude', 'stats_plot', 'work', '응답 생성 중', 3, 70, { ago: 80, t: '분포 표를 그림으로 만들어 results/plot.png 로 저장해 줘. 축 이름은 한국어로.' }, { meta: 'general-purpose' }),
    kid(P.kids[1], 'stats-csv', 'claude', 'stats_csv (claude -p)', 'done', '완료', 200, null, { ago: 300, t: 'stats.md 의 표를 CSV 로 변환해 줘.' }, { meta: 'pid 60200 · ~/work/data · claude-sonnet-4' })];
  P.acts = acts([3100, 'user', '데이터셋 v2로 정리해 줘. 중복 제거하고 통계도 뽑아 줘.'], [3060, 'say', '중복 제거와 통계를 나눠서 하위 에이전트에게 맡기겠습니다.'], [3000, 'spawn', 'data_dedupe'], [1520, 'spawn', 'data_stats'], [880, 'spawn', 'data_lint'], [1800, 'done', 'data_dedupe: 중복 12건 제거함'], [200, 'say', 'data_lint 가 승인을 기다리고 있습니다.']);
  P.msgs = [M_('down', 'peer', 'uds:/run/user/1000/cc-socks/61183.sock', 'cl-data', '다른 세션', 2000, '혹시 명명 규칙 문서 위치 알아? docs/naming.md 맞나?', { })];
  P.kids[1].kids[1].talk = { ok: false, reason: 'subagent' };

  // 2. Claude root, prompting; foreign talk + peer from a known room
  const MM = nd('cl-parse', 'claude', '검색 결과 파싱', 'tool', 'Bash 실행 중 3m', 2, 190, { now: 'Bash: python parse.py --all results/', meta: 'pid 51022 · ~/work/msa · claude-opus-4', talk: TOK,
    acts: acts([900, 'user', 'results/ 의 검색 결과를 전부 파싱해서 TSV 로 합쳐 줘.'], [880, 'say', '결과 파일 240개를 읽는 중입니다.'], [800, 'tool', 'Read: results/batch_01.m8'], [190, 'tool', 'Bash: python parse.py --all results/']),
    msgs: [M_('down', 'talk', 'agen-talk:alice@OTHER-PC', 'cl-parse', '에겐 톡', 500, '파싱 끝나면 요약 표도 같이 만들어 주세요.', { msg_id: 'at-0badf00d', by: 'alice@OTHER-PC' }), M_('down', 'peer', 'cl-data', 'cl-parse', '데이터셋 정리', 300, '결과 위치는 ~/work/data/results 야.')] });
  // 3. bypass room with every delivery state seeded
  const BY = nd('cl-bypass', 'claude', '테스트 결과 점검', 'user', '답변 끝남 · 입력 기다림', 60, null, { meta: 'pid 51100 · ~/work/tests · claude-opus-4 · --dangerously-skip-permissions', talk: { ok: true, hold: true, max: 4000 }, acts: acts([4000, 'user', '정렬 결과를 점검해 줘.'], [3900, 'say', '정렬 결과 12개를 점검했고 이상은 없습니다.']) });
  // 4. waiting for approval (confirm card adds the line)
  const WA = nd('cl-wait', 'claude', '로그 정리 스크립트', 'user', '명령 승인 대기', 130, 400, { now: '$ rm -rf build/ && make all', meta: 'pid 51200 · ~/work/logs · claude-opus-4', talk: TOK, acts: acts([420, 'user', 'build 폴더 정리하고 다시 빌드해 줘.'], [400, 'say', 'build/ 를 지우고 다시 빌드하겠습니다.'], [130, 'ask', '$ rm -rf build/ && make all']) });
  // 5. codex: daemon-hosted (steer line), --no-daemon
  const CD = nd('cx-daemon', 'codex', '성능 리포트', 'work', '모델 응답 중', 4, 600, { now: '리포트 초안을 작성하는 중입니다', meta: 'pid 48001 · ~/work/aff · gpt-5.1', talk: TOK, acts: acts([700, 'user', '성능 측정 결과를 리포트로 정리해 줘.'], [600, 'say', '리포트 초안을 작성하는 중입니다']) });
  const CN = nd('cx-nodaemon', 'codex', '스키마 마이그레이션', 'idle', '답변 끝남', 500, null, { meta: 'pid 48310 · ~/work/db · gpt-5.1', talk: { ok: false, reason: 'no-daemon' }, acts: acts([900, 'user', '마이그레이션 스크립트를 검토해 줘.'], [800, 'say', '검토했고 두 곳을 고치면 됩니다.']) });
  // 6. the other disabled reasons
  const dis = (id, tool, name, reason, st = 'idle', extra = {}) => nd(id, tool, name, st, '답변 끝남', 300, null, { meta: 'pid 40000 · ~/work/x · ' + (tool === 'agy' ? '14 steps' : 'claude-opus-4'), talk: { ok: false, reason }, acts: acts([600, 'user', '확인해 줘.'], [500, 'say', '확인했습니다.']), ...extra });
  const D = [dis('cl-nosock', 'claude', '구버전 세션', 'no-socket'), dis('cl-print', 'claude', 'claude -p 배치', 'not-interactive'), dis('cl-self', 'claude', '에겐 톡을 띄운 세션', 'self'), dis('cl-ended', 'claude', '끝난 세션', 'ended', 'done')];
  const AG = dis('agy-main', 'agy', '문서 요약 (agy)', 'unsupported', 'idle', { acts: [], last: '초록 12편 중 9편을 요약했습니다.' });
  AG.kids = [nd('agy-sub', 'agy', 'literature_scan', 'done', '완료', 200, null, { meta: '6 steps', msgs: [M_('down', 'agy', 'agy-main', 'agy-sub', '문서 요약 (agy)', 900, '최근 2년 관련 논문 12편의 초록을 읽고 핵심 주장을 한 줄씩 정리해 줘.'), M_('up', 'agy', 'agy-sub', 'agy-main', '문서 요약 (agy)', 400, '12편 중 9편을 정리했습니다. 3편은 초록이 없어 건너뛰었습니다.')] })];
  // 7. 20+ node tree
  const B = nd('cl-big', 'claude', '릴리스 전 일괄 점검', 'child', '하위 에이전트 12개 대기', 20, 3400, { meta: 'pid 52000 · ~/work/release · claude-opus-4', talk: TOK, hidden: 0 });
  const ws = [['done', 5], ['done', 4], ['done', 3], ['done', 5], ['done', 6], ['work', 2], ['work', 1], ['user', 3]];
  B.kids = ws.map(([st, age], i) => kid(B, 'big-w' + (i + 1), 'claude', 'lint_shard_' + (i + 1), st, st === 'user' ? '명령 승인 대기' : st === 'done' ? '완료 보고됨' : '응답 생성 중', age, st === 'done' ? null : 120 + i * 20, { ago: 3300 - i, t: DUP }, { meta: 'general-purpose', msgs: st === 'done' ? [M_('up', 'agent', 'big-w' + (i + 1), 'cl-big', B.name, 2000 - i * 30, 'shard ' + (i + 1) + ': 이슈 ' + (i + 2) + '건, 목록은 reports/lint_' + (i + 1) + '.txt')] : [] }));
  const TA = kid(B, 'big-ta', 'claude', 'type_audit', 'work', '하위 대기', 3, 1800, { ago: 3200, t: '타입 오류를 모듈별로 점검하고, 가장 많은 모듈부터 고쳐 줘.\n고친 뒤에는 mypy 를 다시 돌려 결과를 알려 줘.' }, { meta: 'general-purpose' });
  TA.kids = [kid(TA, 'big-ta1', 'claude', 'audit_core', 'done', '완료', 600, null, { ago: 3000, t: 'core/ 모듈의 타입 오류를 고쳐 줘.' }, { msgs: [M_('up', 'agent', 'big-ta1', 'big-ta', 'type_audit', 1500, 'core/ 오류 7건 모두 수정, mypy 통과.')] }),
    kid(TA, 'big-ta2', 'claude', 'audit_io', 'work', '하위 대기', 5, 900, { ago: 2900, t: 'io/ 모듈의 타입 오류를 고쳐 줘.' }), kid(TA, 'big-ta3', 'claude', 'audit_cli', 'done', '완료', 700, null, { ago: 2800, t: 'cli/ 모듈의 타입 오류를 고쳐 줘.' })];
  TA.kids[1].kids = [kid(TA.kids[1], 'big-ta2a', 'claude', 'io_stubs', 'work', '응답 생성 중', 2, 300, { ago: 400, t: 'io/ 의 .pyi 스텁을 먼저 만들어 줘.' })];
  const DC = kid(B, 'big-dc', 'claude', 'docs_check', 'done', '완료 보고됨', 500, null, { ago: 3100, t: 'README 와 docs/ 의 링크가 살아 있는지 확인해 줘.' }, { msgs: [M_('up', 'agent', 'big-dc', 'cl-big', B.name, 1200, '죽은 링크 2건: docs/setup.md 12행, README 40행.')] });
  DC.kids = [kid(DC, 'big-dc1', 'claude', 'link_probe', 'done', '완료', 800, null, { ago: 2500, t: '외부 링크만 HEAD 요청으로 확인해 줘.' })];
  const PF = kid(B, 'big-pf', 'claude', 'perf_probe', 'user', '명령 승인 대기', 90, 1200, { ago: 3000, t: '벤치마크 3종을 돌려 이전 릴리스와 비교해 줘.\n' + Array.from({ length: 40 }, (_, i) => (i + 1) + '. 항목 ' + (i + 1) + ' 은 세 번 돌려 중앙값을 기록하고, 편차가 5 % 를 넘으면 이유를 한 줄로 적어 줘.').join('\n') }, { now: '$ python bench.py --all', meta: 'general-purpose' });
  PF.kids = [kid(PF, 'big-pf1', 'claude', 'bench_a', 'done', '완료', 300, null, { ago: 2000, t: 'bench A 만 돌려 줘.' }), kid(PF, 'big-pf2', 'claude', 'bench_b (claude -p)', 'work', '응답 생성 중', 4, 500, { ago: 900, t: 'bench B 를 따로 돌려 줘.' }, { meta: 'pid 60600 · ~/work/release · claude-sonnet-4' })];
  const SC = kid(B, 'big-sc', 'codex', 'sec_scan', 'work', '모델 응답 중', 6, 1500, { enc: true, ago: 2700, role: 'reviewer' }, { meta: 'gpt-5.1 · reviewer' });
  SC.kids = [1, 2, 3].map(i => kid(SC, 'big-sc' + i, 'codex', 'scan_part_' + i, i === 3 ? 'work' : 'done', i === 3 ? '모델 응답 중' : '답변 끝남', 20 * i, i === 3 ? 200 : null, { enc: true, ago: 2000 + i, role: 'worker' }, { meta: 'gpt-5.1 · worker', msgs: i < 3 ? [M_('up', 'codex', 'big-sc' + i, 'big-sc', 'sec_scan', 600 + i, '', { encrypted: true })] : [] }));
  B.kids.push(TA, DC, PF, SC);
  B.acts = acts([3500, 'user', '릴리스 전에 린트, 타입, 문서, 성능, 보안을 한꺼번에 점검해 줘.'],
    ...B.kids.slice(0, 8).map((k, i) => [3300 - i, 'spawn', k.name]), [3200, 'spawn', 'type_audit'], [2000, 'done', 'lint_shard_1: 이슈 2건, 목록은 reports/lint_1.txt'], [1200, 'done', 'docs_check: 죽은 링크 2건']);
  const CL = nd('cl-cloud', 'claude', '클라우드 배치 점검', 'work', '응답 생성 중', 30, 600, { meta: 'pid 900 · ~/bench · claude-opus-4', talk: TOK, acts: acts([700, 'user', '배치 상태를 점검해 줘.'], [600, 'say', '점검 중입니다.']) });
  const WN = nd('cl-win', 'claude', '윈도 빌드 스크립트', 'work', '응답 생성 중', 6, 400, { meta: 'pid 11234 · C:\\Users\\me\\proj · claude-opus-4', talk: { ok: false, reason: 'windows' }, acts: acts([500, 'user', '빌드 스크립트를 손봐 줘.'], [400, 'say', '수정 중입니다.']) });

  // project (OVERVIEW-CONTRACT §1): generic repos; one subagent in another repo, two roots without a project (기타), one name that looks like markup
  const PJ = (name, branch, key, root) => ({ name, branch, key, root });
  const PAG = PJ('agen_talk', 'feat/overview', 'github.com/example/agen_talk', '~/work/agen_talk'), PDATA = PJ('data-pipeline', 'main', 'github.com/example/data-pipeline', '~/work/data');
  P.project = PDATA; MM.project = PDATA; P.kids[1].project = PJ('stats-lib', '@1a2b3c4', 'github.com/example/stats-lib', '~/work/stats-lib');
  BY.project = PAG; B.project = { ...PAG, branch: 'release/0.2' }; WN.project = { ...PAG, branch: 'main', root: 'C:\Users\me\agen_talk' };
  WA.project = PJ('ops-scripts', null, 'local:~/work/logs', '~/work/logs'); CD.project = PJ('report-tools', 'main', 'github.com/example/report-tools', '~/work/aff'); CN.project = CD.project;
  AG.project = PJ('문서-사이트', 'main', 'local:~/work/문서-사이트', '~/work/문서-사이트'); CL.project = PJ('<b>lab</b>', 'x', 'local:~/work/x', '~/work/x');   // the markup-looking name lives on the last server so screenshots stay clean
  D[1].project = PJ('infra-scripts', 'ops/cron', 'github.com/example/infra-scripts', '~/infra');
  const ROOTS = { s01: [P, MM, BY, WA, CD, CN, ...D, AG, B], pc: [WN], cloud: [CL] };
  const chans = () => [{ id: 's01', name: 'gpu-01', kind: 'ssh', state: 'ok', error: null, t: Date.now() / 1000, ssh: 'gpu.example.com', ssh_args: [] }, { id: 'pc', name: '내 PC', kind: 'local', state: 'ok', error: null, t: Date.now() / 1000 },
    { id: 'cloud', name: 'cloud-a', kind: 'ssh', state: 'error', error: 'ssh: connect to host cloud.example.com port 22: Connection timed out', t: Date.now() / 1000 - 120, ssh: 'cloud.example.com', ssh_args: [] }];
  const aged = (list, dt) => list.map(n => ({ ...n, age: n.age == null ? null : n.age + dt, since: n.since == null ? null : n.since + dt, kids: aged(n.kids, dt) }));
  const find = (id, list = Object.values(ROOTS).flat()) => { for (const n of list) { if (n.id === id) return n; const r = find(id, n.kids); if (r) return r; } return null; };
  const fx = window.__fx = { down: false, nodes: ROOTS, talkOn: true, posts: [], find,
    deliver(key) { const [ch, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)], n = find(id), e = (R.A.talks[key] || []).slice().reverse().find(x => x.mid); if (!n || !e) return false; n.msgs = [...n.msgs, M_('down', 'talk', 'agen-talk:alice@PC', id, '에겐 톡', 1, e.text, { msg_id: e.mid, by: 'alice@PC' })]; return true; } };
  const j = (code, body, wait = 0) => new Promise(r => setTimeout(() => r(new Response(JSON.stringify(body), { status: code, headers: { 'Content-Type': 'application/json' } })), wait));
  window.fetch = (url, opts) => {
    const u = new URL(String(url), location.href), p = u.pathname.replace(/^.*\/(api\/.*)$/, '$1');
    if (fx.down && p.startsWith('api/')) return Promise.reject(new TypeError('hub down'));
    if (p === 'api/channels') return j(200, chans());
    if (p === 'api/state') { const ch = u.searchParams.get('ch'), dt = (Date.now() - T0) / 1000; return j(200, { time: new Date().toTimeString().slice(0, 8), ts: Date.now() / 1000, host: ch, user: 'me', os: ch === 'pc' ? 'windows' : 'linux', warnings: [], agents: aged(ROOTS[ch] || [], dt) }); }
    if (p === 'api/app') return j(200, { version: 'dev-talkfx', mode: 'cli', logdir: '', talk_on: fx.talkOn, talk_max: 4000 });
    if (p === 'api/presets') return j(200, []);
    if (p === 'api/talk/setting') { const b = JSON.parse(opts.body); fx.talkOn = !!b.on; return j(200, { on: fx.talkOn }); }
    if (p === 'api/talk') {
      const b = JSON.parse(opts.body); fx.posts.push(b); const t = b.text, mid = 'at-' + Math.random().toString(16).slice(2, 10).padEnd(8, '0'), wait = /#slow/.test(t) ? 4000 : 150;
      if (/#429/.test(t)) return j(429, { retry_after: 12 }, wait);
      if (/#refused/.test(t)) return j(200, { outcome: 'refused', reason: 'inbound-off', client_id: b.client_id }, wait);
      if (/#dup/.test(t)) return j(200, { outcome: 'refused', reason: 'duplicate', client_id: b.client_id }, wait);
      if (/#unreach/.test(t)) return j(200, { outcome: 'unreachable', reason: 'no-listener', client_id: b.client_id }, wait);
      if (/#unknown/.test(t)) return j(200, { outcome: 'unknown', client_id: b.client_id }, wait);
      if (/#held/.test(t)) return j(200, { outcome: 'held', msg_id: mid, ts: Date.now() / 1000, client_id: b.client_id }, wait);
      return j(200, { outcome: 'accepted', msg_id: mid, ts: Date.now() / 1000, client_id: b.client_id }, wait);
    }
    return j(404, { error: 'nf' });
  };
  // every delivery state, seeded in the bypass room (memory only until something is sent)
  const T = (ago, text, o) => ({ cid: 'seed' + (++seq), text, t: Date.now() - ago * 1000, st: 'delivered', hat: null, mid: '', why: '', ...o });
  R.A.talks['s01:cl-bypass'] = [T(900, '통계 요약이 끝나면 build/ 는 지우지 말고 두세요.', { mid: 'at-00000001' }),
    T(840, '정렬 결과 12개 중 오래된 3개는 archive/ 로 옮겨 주세요.', { st: 'held', hat: Date.now() - 400000, mid: 'at-00000003' }),   // held 6+ min ago -> 만료됨
    T(700, '다음 점검은 내일 아침에 이어서 해 주세요.', { st: 'refused', why: 'inbound-off' }), T(600, '결과 파일 이름 규칙을 README 에 적어 주세요.', { st: 'unreach' }), T(500, '점검이 끝나면 한 줄로 알려 주세요.', { st: 'unknown' }),
    T(120, 'results/ 의 표를 CSV 로도 저장해 주세요.', { st: 'held', hat: Date.now() - 120000, mid: 'at-00000002' }), T(10, '이 톡은 방금 보내는 중입니다.', { st: 'sending' })];
  R.A.talks['s01:cl-parse'] = [T(300, '파싱 끝나면 결과 TSV 경로를 알려 주세요.', { mid: 'at-00000004' })];
  MM.msgs.push(M_('down', 'talk', 'agen-talk:alice@PC', 'cl-parse', '에겐 톡', 290, '파싱 끝나면 결과 TSV 경로를 알려 주세요.', { msg_id: 'at-00000004', by: 'alice@PC' }));   // the transcript record that matches the local bubble: no second bubble
})();
