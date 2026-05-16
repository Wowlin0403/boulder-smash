const { calcSmashScore } = require('./ranking');

function getRounds(n) {
  return n === 2 ? ['smash', 'final'] : ['smash'];
}

function getAdvancedIds(db, eventId) {
  const categories = db.prepare('SELECT * FROM categories WHERE event_id = ?').all(eventId);

  const athletes = db.prepare('SELECT id, category_id FROM athletes WHERE event_id = ?').all(eventId);

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
      return { id: a.id, score: calcSmashScore(routeScores) };
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
  });

  return advancedIds;
}

module.exports = { getAdvancedIds, getRounds };
