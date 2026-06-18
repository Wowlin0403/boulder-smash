const { calcSmashScore } = require('./ranking');

function getRounds(n) {
  return n === 2 ? ['smash', 'final'] : ['smash'];
}

function getAdvancedIds(db, eventId) {
  const categories = db.prepare('SELECT * FROM categories WHERE event_id = ?').all(eventId);

  const athletes = db.prepare('SELECT id, category_id, is_guaranteed FROM athletes WHERE event_id = ?').all(eventId);

  const smashScores = {};
  db.prepare('SELECT * FROM smash_scores WHERE event_id = ?').all(eventId).forEach(s => {
    if (!smashScores[s.athlete_id]) smashScores[s.athlete_id] = {};
    smashScores[s.athlete_id][s.route_id] = s;
  });

  const byCategory = {};
  athletes.forEach(a => {
    const key = a.category_id || 'none';
    if (!byCategory[key]) byCategory[key] = [];
    byCategory[key].push(a);
  });

  const advancedIds = new Set();

  Object.entries(byCategory).forEach(([catKey, group]) => {
    if (catKey === 'none') return;
    const catId = parseInt(catKey);
    const cat = categories.find(c => c.id === catId);
    if (!cat || cat.rounds < 2) return;

    const quota = cat.final_quota || 0;

    const categoryRoutes = db.prepare(`
      SELECT r.id, r.top_score, r.zone_score FROM routes r
      JOIN category_routes cr ON cr.route_id = r.id
      WHERE cr.category_id = ? AND r.event_id = ?
    `).all(catId, eventId);

    const dnsIds = new Set(
      db.prepare("SELECT athlete_id FROM dns_records WHERE event_id = ? AND round = 'smash'")
        .all(eventId).map(r => r.athlete_id)
    );

    const ranked = group.map(a => {
      const routeScores = categoryRoutes.map(r => {
        const s = smashScores[a.id]?.[r.id];
        return {
          top: s?.top ? 1 : 0,
          zone: s?.zone ? 1 : 0,
          top_score: r.top_score,
          zone_score: r.zone_score,
        };
      });
      return { id: a.id, score: calcSmashScore(routeScores), is_guaranteed: a.is_guaranteed };
    });

    ranked.sort((a, b) => b.score - a.score);

    if (!quota || ranked.length <= quota) {
      ranked.forEach(a => advancedIds.add(a.id));
      return;
    }

    const cutoffScore = ranked[quota - 1].score;
    for (const a of ranked) {
      if (a.score >= cutoffScore) advancedIds.add(a.id);
      else break;
    }

    // 保障名額：非 DNS 的保障選手中最高分者（含同分並列）
    const nonDnsGuaranteed = ranked.filter(a => a.is_guaranteed && !dnsIds.has(a.id));
    if (nonDnsGuaranteed.length > 0) {
      const maxScore = Math.max(...nonDnsGuaranteed.map(a => a.score));
      const topGuaranteed = nonDnsGuaranteed.filter(a => a.score === maxScore && !advancedIds.has(a.id));

      if (topGuaranteed.length > 0) {
        const advancedInCat = ranked.filter(a => advancedIds.has(a.id) && !dnsIds.has(a.id));
        const minScore = Math.min(...advancedInCat.map(a => a.score));
        const atMinScore = advancedInCat.filter(a => a.score === minScore);

        if (atMinScore.length === 1) {
          // 末位唯一：踢掉末位（無論幾位保障選手，只踢一位）
          advancedIds.delete(atMinScore[0].id);
        }
        // 末位同分 / tie 擴充：不踢人，保障選手全部額外加入
        topGuaranteed.forEach(a => advancedIds.add(a.id));
      }
    }
  });

  return advancedIds;
}

module.exports = { getAdvancedIds, getRounds };
