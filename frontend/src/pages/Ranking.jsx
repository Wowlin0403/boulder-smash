import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { eventsAPI } from '../api';
import { useAuth } from '../context/AuthContext';

export default function Ranking() {
  const { id, catId } = useParams();
  const { isAdmin } = useAuth();
  const [event, setEvent] = useState(null);
  const [category, setCategory] = useState(null);
  const [round, setRound] = useState('smash');
  const [smashData, setSmashData] = useState(null);
  const [finalData, setFinalData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([eventsAPI.get(id), eventsAPI.getCategories(id)]).then(([ev, cl]) => {
      setEvent(ev.data);
      const cat = cl.data.find(c => String(c.id) === String(catId)) || null;
      setCategory(cat);
    });
  }, [id, catId]);

  const fetchRanking = useCallback(async () => {
    setLoading(true);
    try {
      const [sr, fr] = await Promise.all([
        eventsAPI.getSmashRanking(id),
        eventsAPI.getFinalRanking(id),
      ]);
      const smashRows = (sr.data?.athletes || []).filter(r => String(r.category_id) === String(catId)).sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999));
      const finalRows = (fr.data?.athletes || []).filter(r => String(r.category_id) === String(catId)).sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999));
      setSmashData(smashRows);
      setFinalData(finalRows);
    } finally {
      setLoading(false);
    }
  }, [id, catId]);

  useEffect(() => { fetchRanking(); }, [fetchRanking]);

  useEffect(() => {
    const t = setInterval(fetchRanking, 15000);
    return () => clearInterval(t);
  }, [fetchRanking]);

  if (!event || !category) return <Layout><div className="text-txt3 font-mono py-16 text-center">載入中...</div></Layout>;

  const hasFinal = category.rounds === 2;

  return (
    <Layout>
      <div className="flex items-center gap-2 mb-6 text-txt3 font-mono text-xs">
        <Link to="/events" className="hover:text-txt transition-colors">比賽列表</Link>
        <span>/</span>
        <Link to={`/events/${id}`} className="hover:text-txt transition-colors">{event.name}</Link>
        <span>/</span>
        <Link to={`/events/${id}/categories/${catId}`} className="hover:text-txt transition-colors">{category.name}</Link>
        <span>/</span>
        <span className="text-txt">即時排名</span>
      </div>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: category.color }} />
          <div className="font-condensed font-black text-2xl tracking-widest uppercase" style={{ color: category.color }}>
            {category.name}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasFinal && (
            <div className="flex bg-s1 border border-border rounded overflow-hidden">
              <button
                onClick={() => setRound('smash')}
                className={`font-mono text-xs px-4 py-2 transition-colors ${round === 'smash' ? 'bg-lime text-bg font-bold' : 'text-txt3 hover:text-txt'}`}
              >
                大亂鬥
              </button>
              <button
                onClick={() => setRound('final')}
                className={`font-mono text-xs px-4 py-2 transition-colors ${round === 'final' ? 'bg-lime text-bg font-bold' : 'text-txt3 hover:text-txt'}`}
              >
                決賽
              </button>
            </div>
          )}
          <button onClick={fetchRanking} className="font-mono text-xs px-3 py-2 border border-border2 rounded text-txt3 hover:text-txt hover:border-txt3 transition-colors">
            重整
          </button>
        </div>
      </div>

      {loading && !smashData && (
        <div className="text-txt3 font-mono py-16 text-center">載入中...</div>
      )}

      {round === 'smash' && smashData && (
        <SmashRanking rows={smashData} />
      )}

      {round === 'final' && finalData && (
        <FinalRanking rows={finalData} />
      )}
    </Layout>
  );
}

function SmashRanking({ rows }) {
  if (rows.length === 0) {
    return <div className="text-txt3 font-mono py-16 text-center bg-s1 border border-border rounded-lg">尚無成績資料</div>;
  }

  return (
    <div className="bg-s1 border border-border rounded-lg overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            <th className="font-mono text-[10px] tracking-widest uppercase text-txt3 px-4 py-3 text-left w-12">名次</th>
            <th className="font-mono text-[10px] tracking-widest uppercase text-txt3 px-4 py-3 text-left w-16">背號</th>
            <th className="font-mono text-[10px] tracking-widest uppercase text-txt3 px-4 py-3 text-left">選手</th>
            <th className="font-mono text-[10px] tracking-widest uppercase text-txt3 px-4 py-3 text-right">總分</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isDns = !!r.is_dns;
            const isFirst = !isDns && r.rank === 1;
            return (
              <tr key={r.id} className={`border-b border-border last:border-0 ${isFirst ? 'bg-lime/5' : ''} ${isDns ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3">
                  <span className={`font-condensed font-black text-lg ${isFirst ? 'text-lime' : 'text-txt3'}`}>
                    #{r.rank}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-sm text-txt2">{r.bib}</td>
                <td className="px-4 py-3 font-condensed font-bold text-base">{r.name}</td>
                <td className="px-4 py-3 text-right">
                  {isDns
                    ? <span className="font-mono text-sm text-red font-bold">DNS</span>
                    : <span className={`font-mono text-sm font-bold ${isFirst ? 'text-lime' : 'text-txt'}`}>
                        {Number(r.score ?? 0).toFixed(1)}
                      </span>
                  }
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function calcFinalScore(boulderScores) {
  if (!boulderScores) return 0;
  return boulderScores.reduce((sum, b) => {
    if (b.top) return sum + (25 - 0.1 * (b.top_attempts - 1));
    if (b.zone) return sum + (10 - 0.1 * (b.zone_attempts - 1));
    return sum;
  }, 0);
}

function BoulderCard({ b }) {
  const topped = b.top > 0;
  const zoned = b.zone > 0;
  const attempted = (b.attempts || 0) > 0;
  const w = 36, h = 54;

  if (!topped && !zoned && attempted) {
    return (
      <div style={{ width: w, height: h, borderRadius: 6, border: '1px solid rgb(var(--border))', position: 'relative', overflow: 'hidden', background: 'rgb(var(--txt3) / 0.2)' }}>
        <svg width={w} height={h} style={{ position: 'absolute', top: 0, left: 0 }}>
          <line x1="1" y1="1" x2={w - 1} y2={h - 1} stroke="rgb(var(--txt3))" strokeWidth="1" />
        </svg>
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ width: w, height: h, borderRadius: 6, overflow: 'hidden', border: '1px solid rgb(var(--border))' }}>
      <div className="flex-1 flex items-center justify-center font-mono font-bold border-b border-border text-[11px]"
        style={{ background: topped ? '#c8f135' : 'transparent', color: topped ? '#0a0c10' : 'transparent' }}>
        {topped ? b.top_attempts : ''}
      </div>
      <div className="flex-1 flex items-center justify-center font-mono font-bold text-[11px]"
        style={{ background: zoned ? 'rgb(56 232 213 / 0.25)' : 'transparent', color: zoned ? '#38e8d5' : 'transparent' }}>
        {zoned ? b.zone_attempts : ''}
      </div>
    </div>
  );
}

function FinalRanking({ rows }) {
  if (rows.length === 0) {
    return <div className="text-txt3 font-mono py-16 text-center bg-s1 border border-border rounded-lg">尚無決賽成績資料</div>;
  }

  const numBoulders = rows[0]?.boulderScores?.length || 0;

  return (
    <div className="bg-s1 border border-border rounded-lg overflow-hidden">
      {rows.map(r => {
        const isDns = !!r.is_dns;
        const isFirst = !isDns && r.rank === 1;
        const score = calcFinalScore(r.boulderScores);
        return (
          <div key={r.id} className={`flex items-center gap-5 px-5 py-3.5 border-b border-border last:border-0 ${isFirst ? 'bg-lime/5' : ''}`}>
            <div className={`font-condensed font-black text-lg w-8 text-center flex-shrink-0 ${isFirst ? 'text-lime' : 'text-txt3'}`}>
              #{r.rank}
            </div>
            <div className="flex-1 min-w-0">
              <div className={`font-condensed font-bold text-base whitespace-nowrap overflow-hidden text-ellipsis ${isDns ? 'text-txt3' : 'text-txt'}`}>{r.name}</div>
              <div className="font-mono text-[11px] text-txt3 mt-0.5">{r.bib}</div>
            </div>
            <div className="flex gap-1 items-end flex-shrink-0">
              {Array.from({ length: numBoulders }, (_, i) => {
                const bs = isDns
                  ? { top: 0, top_attempts: 0, zone: 0, zone_attempts: 0, attempts: 0 }
                  : (r.boulderScores?.[i] || { top: 0, top_attempts: 0, zone: 0, zone_attempts: 0, attempts: 0 });
                return (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <BoulderCard b={bs} />
                    <span className="font-mono text-[8px] text-txt3">{i + 1}</span>
                  </div>
                );
              })}
            </div>
            <div className="font-condensed font-black text-right flex-shrink-0 leading-none w-16"
              style={{ color: isDns ? '#f03a5f' : (isFirst ? '#c8f135' : 'rgb(var(--txt))'), fontSize: isDns ? 22 : 26 }}>
              {isDns ? 'DNS' : score.toFixed(1)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
