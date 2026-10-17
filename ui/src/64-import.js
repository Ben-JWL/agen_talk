/* ===== 64-import.js — 서버 목록 가져오기 (APP-UX §2): a .json file the company shares -> POST api/presets/import. Result copy is exact per APP-UX §2.
   Importer.make({primary, block}) -> {btn, line}: the button that opens the file picker and the result line directly under it. ===== */
window.Importer = (() => {
  const { h, svgUse, text, cls } = R;
  const MAX = 64 * 1024;
  function make({ primary = false, block = false } = {}) {
    const input = h('input', { type: 'file', accept: '.json,application/json', tabindex: '-1', 'aria-hidden': 'true', style: 'display:none' });
    const btn = h('button.btn' + (primary ? '.primary' : '') + (block ? '.block' : ''), { type: 'button', on: { click: () => input.click() } }, '서버 목록 가져오기', input);
    const line = h('p.meta.implin', { role: 'status', hidden: true });
    const show = (msg, bad, retry) => {
      line.replaceChildren(...[bad ? svgUse('g-dead', 'gl') : null, h('span', msg), retry ? h('button.btn.sm', { type: 'button', on: { click: () => input.click() } }, '다시 시도') : null].filter(Boolean));
      line.hidden = false; cls(line, 'bad', !!bad);
    };
    input.addEventListener('change', async () => {
      const f = input.files && input.files[0]; input.value = ''; if (!f) return;
      if (f.size > MAX) return show('파일이 너무 큽니다 (64 KB 까지)', true);
      let raw, parsed; try { raw = await f.text(); } catch { return show('파일을 읽을 수 없습니다 — JSON 형식이 아닙니다', true); }
      try { parsed = JSON.parse(raw); } catch { return show('파일을 읽을 수 없습니다 — JSON 형식이 아닙니다', true); }
      const list = Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' && Array.isArray(parsed.presets) ? parsed.presets : null;
      if (!list || !list.length) return show('서버 목록 파일이 아닙니다 — 회사에서 받은 .json 파일을 고르세요', true);
      const before = R.M.presets.length; let r; try { r = await R.apiPost('api/presets/import', raw); } catch { r = { status: 0 }; }
      if (r.status === 413) return show('파일이 너무 큽니다 (64 KB 까지)', true);
      if (r.status === 400) return show('서버 목록 파일이 아닙니다 — 회사에서 받은 .json 파일을 고르세요', true);
      if (!r.ok || !r.body) return show('가져오지 못했습니다 — 허브에 연결할 수 없습니다', true, true);
      // the hub answers {presets, added, dup, invalid}; if the counts are missing (older hub) derive what we can from the list length
      const counted = Number.isFinite(+r.body.added), after = Array.isArray(r.body.presets) ? r.body.presets.length : before;
      const a = counted ? R.num(r.body.added) : Math.max(0, after - before), inv = counted ? R.num(r.body.invalid) : 0, d = counted ? R.num(r.body.dup) : Math.max(0, list.length - a), capped = counted ? Math.max(0, list.length - a - d - inv) : 0;
      R.loadPresets();
      if (a === 0 && inv > 0 && d === 0) return show('서버 목록 파일이 아닙니다 — 회사에서 받은 .json 파일을 고르세요', true);
      if (a === 0 && d > 0 && !inv) return show('새로 가져온 서버가 없습니다 — ' + d + '개 모두 이미 목록에 있습니다', false);
      if (capped > 0) return show('서버 ' + a + '개를 가져왔습니다 · ' + capped + '개는 50개 제한으로 넣지 못했습니다', false);
      if (inv > 0) return show('서버 ' + a + '개를 가져왔습니다 · ' + inv + '개는 형식이 맞지 않아 건너뜀 (host·port 확인)', false);
      show('서버 ' + a + '개를 가져왔습니다' + (d > 0 ? ' · 이미 있는 ' + d + '개는 건너뜀' : ''), false);
    });
    return { btn, line };
  }
  return { make };
})();
