import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { publicAPI } from '../api';

function RouteCard({ route }) {
  const top = !!route.top;
  const zone = !!route.zone;
  const dotColor = top ? 'bg-lime' : zone ? 'bg-cyan' : 'bg-txt3/30';

  return (
    <div className="bg-s2 border border-border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotColor}`} />
        <span className="font-condensed font-bold text-base tracking-widest uppercase text-txt">{route.name}</span>
      </div>
      <div className="flex gap-3 text-[10px] font-mono mb-3">
        <span className="text-lime/70">TOP {route.top_score}pt</span>
        <span className="text-cyan/70">ZONE {route.zone_score}pt</span>
      </div>
      <div className="border border-border rounded overflow-hidden mb-3">
        <div className={`flex justify-between px-3 py-2 border-b border-border ${top ? 'bg-lime/10' : ''}`}>
          <span className={`font-condensed font-bold text-xs tracking-widest ${top ? 'text-lime' : 'text-txt3'}`}>TOP</span>
          <span className={`font-mono text-sm font-bold ${top ? 'text-lime' : 'text-txt3'}`}>
            {top ? `${route.top_attempts} 次` : '—'}
          </span>
        </div>
        <div className={`flex justify-between px-3 py-2 ${zone ? 'bg-cyan/10' : ''}`}>
          <span className={`font-condensed font-bold text-xs tracking-widest ${zone ? 'text-cyan' : 'text-txt3'}`}>ZONE</span>
          <span className={`font-mono text-sm font-bold ${zone ? 'text-cyan' : 'text-txt3'}`}>
            {zone ? `${route.zone_attempts} 次` : '—'}
          </span>
        </div>
      </div>
      <div className="font-mono text-[10px] text-txt3">
        嘗試次數 <span className="text-txt font-bold">{route.attempts}</span>
      </div>
    </div>
  );
}

export default function PublicAthleteScores() {
  const { id } = useParams();
  const [event, setEvent] = useState(null);
  const [athletes, setAthletes] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    publicAPI.getEvent(id).then(r => setEvent(r.data)).catch(() => {});
    publicAPI.getAthletes(id).then(r => setAthletes(r.data)).catch(() => {});
  }, [id]);

  useEffect(() => {
    if (!selectedId) { setData(null); return; }
    setLoading(true);
    publicAPI.getAthleteScores(id, selectedId)
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [selectedId, id]);

  return (
    <div className="min-h-screen bg-bg text-txt">
      <div className="max-w-3xl mx-auto px-4 py-8">

        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="font-mono text-[10px] tracking-widest uppercase text-txt3 mb-1">
              {event?.name || '載入中...'}
            </div>
            <div className="font-condensed font-black text-3xl tracking-widest uppercase text-lime">
              選手成績查詢
            </div>
          </div>
          <Link to={`/public/${id}/ranking`}
            className="font-condensed font-bold text-[11px] tracking-widest uppercase border border-cyan/30 text-cyan px-4 py-2 rounded hover:bg-cyan/10 transition-colors whitespace-nowrap mt-1">
            公開排名 →
          </Link>
        </div>

        <div className="mb-8">
          <label className="block font-mono text-[10px] tracking-widest uppercase text-txt3 mb-1.5">選擇選手</label>
          <select value={selectedId} onChange={e => setSelectedId(e.target.value)} className="w-full">
            <option value="">-- 請選擇選手 --</option>
            {athletes.map(a => (
              <option key={a.id} value={a.id}>
                [{a.category_name || '未分組'}] {a.bib} {a.name}
              </option>
            ))}
          </select>
        </div>

        {loading && (
          <div className="text-txt3 font-mono text-center py-20">載入中...</div>
        )}

        {data && !loading && (
          <>
            <div className="bg-s1 border border-border rounded-lg px-6 py-5 mb-8">
              <div className="font-mono text-[10px] tracking-widest uppercase text-txt3 mb-3">
                {data.athlete.category_name} — {data.athlete.bib} {data.athlete.name}
              </div>
              <div className="flex flex-wrap gap-8 items-end">
                <div>
                  <div className="font-mono text-[10px] tracking-widest uppercase text-txt3 mb-1">總得分</div>
                  <div className="font-condensed font-black text-4xl text-lime tracking-wider">
                    {data.total_score % 1 === 0 ? data.total_score : data.total_score.toFixed(1)}
                    <span className="text-sm font-mono text-txt3 ml-1">pt</span>
                  </div>
                </div>
                <div className="flex gap-6 pb-1">
                  <div>
                    <div className="font-mono text-[10px] tracking-widest uppercase text-txt3 mb-1">TOP</div>
                    <div className="font-condensed font-black text-2xl text-lime">{data.top_count}</div>
                  </div>
                  <div>
                    <div className="font-mono text-[10px] tracking-widest uppercase text-txt3 mb-1">ZONE</div>
                    <div className="font-condensed font-black text-2xl text-cyan">{data.zone_count}</div>
                  </div>
                </div>
              </div>
            </div>

            {data.zones.length === 0 && (
              <div className="text-txt3 font-mono text-center py-12">尚無路線資料</div>
            )}

            {data.zones.map(zone => (
              <div key={zone.zone_id ?? 'unassigned'} className="mb-8">
                <div className="flex items-center gap-3 mb-3">
                  <div className="font-condensed font-bold text-sm tracking-widest uppercase text-cyan">
                    {zone.zone_name}
                  </div>
                  <div className="flex-1 h-px bg-border" />
                  <div className="font-mono text-[10px] text-txt3">{zone.routes.length} 條路線</div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {zone.routes.map(r => (
                    <RouteCard key={r.id} route={r} />
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

        {!data && !loading && !selectedId && (
          <div className="text-txt3 font-mono text-center py-20 text-sm">
            請從上方選擇選手以查看成績
          </div>
        )}
      </div>
    </div>
  );
}
