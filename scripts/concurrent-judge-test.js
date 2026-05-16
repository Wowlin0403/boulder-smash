/**
 * 並發裁判計分壓力測試
 * 自動從 API 抓取選手與路線，模擬多位裁判同時送出計分
 *
 * 用法：node scripts/concurrent-judge-test.js
 */

// ─── 設定區 ────────────────────────────────────────────────────────────────────

const CONFIG = {
  baseUrl: 'https://boulder-scoring-system-production.up.railway.app',
  judgeUsername: 'testjudge',
  judgePassword: 'test1234',
  eventId: 3,
  round: 'final',
  concurrentJudges: 6,   // 模擬幾台裝置同時送分
};

// ─── 工具函式 ──────────────────────────────────────────────────────────────────

const BASE = CONFIG.baseUrl + '/api';

async function api(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, ok: res.ok, data: json };
}

function randomScore(boulderId) {
  const top = Math.random() > 0.45;
  const zone = top || Math.random() > 0.35;
  const top_attempts = top ? Math.floor(Math.random() * 4) + 1 : 0;
  // zone_attempts 必須 <= top_attempts（因為 Top 一定經過 Zone）
  const zone_attempts = zone
    ? top
      ? Math.floor(Math.random() * top_attempts) + 1
      : Math.floor(Math.random() * 5) + 1
    : 0;
  return { boulder_id: boulderId, top, top_attempts, zone, zone_attempts };
}

// ─── 主程式 ────────────────────────────────────────────────────────────────────

async function main() {
  const { eventId, round, judgeUsername, judgePassword, concurrentJudges } = CONFIG;

  console.log(`\n🏔  抱石計分並發測試`);
  console.log(`目標：${CONFIG.baseUrl}`);
  console.log(`比賽 ID：${eventId}，輪次：${round}，模擬裁判數：${concurrentJudges}\n`);

  // 1. 登入取得 token
  process.stdout.write('登入中...');
  const loginRes = await api('/auth/login', {
    method: 'POST',
    body: { username: judgeUsername, password: judgePassword },
  });
  if (!loginRes.ok) {
    console.error(`\n登入失敗：${JSON.stringify(loginRes.data)}`);
    process.exit(1);
  }
  const token = loginRes.data.token;
  console.log(` 成功（role: ${loginRes.data.user.role}）`);

  // 2. 抓組別
  const catsRes = await api(`/events/${eventId}/categories`, { token });
  if (!catsRes.ok) { console.error('無法取得組別'); process.exit(1); }
  const categories = catsRes.data;
  console.log(`組別數：${categories.length}（${categories.map(c => c.name).join('、')}）`);

  // 3. 抓各組別的選手與路線，建立任務清單
  const tasks = []; // { category, athlete, boulders }

  for (const cat of categories) {
    const [athRes, bldrRes] = await Promise.all([
      api(`/events/${eventId}/athletes?round=${round}`, { token }),
      api(`/events/${eventId}/boulders/${round}?category_id=${cat.id}`, { token }),
    ]);
    if (!athRes.ok || !bldrRes.ok) {
      console.error(`無法取得組別「${cat.name}」的資料`);
      continue;
    }
    const athletes = athRes.data.filter(a => a.category_id === cat.id);
    const boulders = bldrRes.data;

    if (athletes.length === 0) { console.log(`組別「${cat.name}」無選手，跳過`); continue; }
    if (boulders.length === 0) { console.log(`組別「${cat.name}」無路線，跳過`); continue; }

    // 資格賽出場順序 = 號碼牌升序
    const sorted = [...athletes].sort((a, b) =>
      String(a.bib).localeCompare(String(b.bib), undefined, { numeric: true })
    );

    sorted.forEach((athlete, idx) => {
      tasks.push({ category: cat.name, athlete, boulders, startOrder: idx + 1 });
    });

    console.log(`組別「${cat.name}」：${athletes.length} 位選手，${boulders.length} 條路線`);
  }

  if (tasks.length === 0) {
    console.error('\n沒有可計分的任務，請確認選手和路線已建立');
    process.exit(1);
  }

  // 4. 分批並發送出（每批 concurrentJudges 筆）
  console.log(`\n共 ${tasks.length} 筆計分任務，每批 ${concurrentJudges} 筆並發...\n`);

  let pass = 0, fail = 0;
  const allLatencies = [];

  for (let i = 0; i < tasks.length; i += concurrentJudges) {
    const batch = tasks.slice(i, i + concurrentJudges);
    const batchNum = Math.floor(i / concurrentJudges) + 1;
    const totalBatches = Math.ceil(tasks.length / concurrentJudges);
    process.stdout.write(`批次 ${batchNum}/${totalBatches}：`);

    const promises = batch.map(async ({ category, athlete, boulders, startOrder }) => {
      const scores = boulders.map(b => randomScore(b.id));
      const t0 = Date.now();
      const res = await api(`/events/${eventId}/scores`, {
        method: 'POST',
        token,
        body: { athlete_id: athlete.id, round, scores },
      });
      const ms = Date.now() - t0;
      return { category, athlete, startOrder, scores, status: res.status, ok: res.ok, ms, data: res.data };
    });

    const results = await Promise.all(promises);

    for (const r of results) {
      if (r.ok) {
        pass++;
        allLatencies.push(r.ms);
        const scoresSummary = r.scores.map(s =>
          s.top ? `T${s.top_attempts}` : s.zone ? `Z${s.zone_attempts}` : '-'
        ).join(' ');
        console.log(`  ✅ [${r.category}] #${r.athlete.bib} ${r.athlete.name}（出場序 ${r.startOrder}）  ${scoresSummary}  ${r.ms}ms`);
      } else {
        fail++;
        console.log(`  ❌ [${r.category}] #${r.athlete.bib} ${r.athlete.name}  HTTP ${r.status}  ${JSON.stringify(r.data)}`);
      }
    }
  }

  // 5. 統計
  const avg = allLatencies.length ? Math.round(allLatencies.reduce((a, b) => a + b) / allLatencies.length) : 0;
  const max = allLatencies.length ? Math.max(...allLatencies) : 0;
  const min = allLatencies.length ? Math.min(...allLatencies) : 0;

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`結果：${pass} 成功 / ${fail} 失敗`);
  if (allLatencies.length) {
    console.log(`延遲：平均 ${avg}ms  最快 ${min}ms  最慢 ${max}ms`);
  }
}

main().catch(console.error);
