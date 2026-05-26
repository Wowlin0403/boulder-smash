import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { eventsAPI } from '../api';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';

const ROUND_NAMES = { smash: '大亂鬥', final: '決賽' };

function isEventLocked(event) {
  if (!event) return false;
  if (event.locked === 1) return true;
  if (event.locked === 0) return false;
  if (!event.date) return false;
  const lockDate = new Date(event.date);
  lockDate.setDate(lockDate.getDate() + 7);
  return new Date() > lockDate;
}

function playClick() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.025, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.025);
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start();
  } catch {}
}

function BoulderCard({ boulder, score, onChange, onReset, attempts, onAttemptsChange, disabled }) {
  const toast = useToast();
  const top = score.top || false;
  const zone = score.zone || false;
  const canAct = !disabled && attempts > 0;

  const handleTop = () => {
    if (!canAct && !top) return;
    const newTopAtt = top ? Math.min(score.top_attempts, attempts) : attempts;
    const newScore = { ...score, top: true, top_attempts: newTopAtt };
    if (!zone) {
      newScore.zone = true;
      newScore.zone_attempts = newTopAtt;
      toast('選手無 ZONE 點嘗試次數，成績將同為 TOP 嘗試次數。');
    }
    onChange(newScore);
  };

  const handleZone = () => {
    if (!canAct && !zone) return;
    const newZoneAtt = zone ? Math.min(score.zone_attempts, attempts) : attempts;
    onChange({ ...score, zone: true, zone_attempts: newZoneAtt });
  };

  const dotColor = top ? 'bg-lime' : zone ? 'bg-cyan' : 'bg-txt3';
  const label = boulder.name || boulder.label || '';

  return (
    <div className="bg-s2 border border-border rounded-lg flex flex-col">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotColor}`} />
          <span className="font-condensed font-bold text-base tracking-widest uppercase text-txt">{label}</span>
        </div>
        <button onClick={onReset} disabled={disabled}
          className="font-condensed font-bold text-[10px] tracking-widest uppercase text-txt3 border border-border rounded px-2 py-0.5 hover:border-txt3 hover:text-txt2 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
          重設
        </button>
      </div>

      {boulder.top_score !== undefined && (
        <div className="mx-4 mb-2 flex gap-3">
          <span className="font-mono text-[10px] text-lime/70">TOP {boulder.top_score}pt</span>
          <span className="font-mono text-[10px] text-cyan/70">ZONE {boulder.zone_score}pt</span>
        </div>
      )}

      <div className="mx-4 mb-3 border border-border rounded overflow-hidden">
        <div className={`flex items-center justify-between px-3 py-2 border-b border-border ${top ? 'bg-lime/10' : ''}`}>
          <span className={`font-condensed font-bold text-xs tracking-widest ${top ? 'text-lime' : 'text-txt3'}`}>TOP</span>
          <span className={`font-mono font-bold text-sm ${top ? 'text-lime' : 'text-txt3'}`}>{top ? `${score.top_attempts} 次` : '—'}</span>
        </div>
        <div className={`flex items-center justify-between px-3 py-2 ${zone ? 'bg-cyan/10' : ''}`}>
          <span className={`font-condensed font-bold text-xs tracking-widest ${zone ? 'text-cyan' : 'text-txt3'}`}>ZONE</span>
          <span className={`font-mono font-bold text-sm ${zone ? 'text-cyan' : 'text-txt3'}`}>{zone ? `${score.zone_attempts} 次` : '—'}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 px-4 mb-3">
        <button onClick={handleTop} disabled={!canAct && !top}
          className={`py-3 font-condensed font-black text-sm tracking-widest uppercase rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${top ? 'bg-lime text-bg hover:bg-[#b5de25]' : 'bg-s3 text-txt2 border border-border2 hover:border-lime hover:text-lime'}`}>
          TOP
        </button>
        <button onClick={handleZone} disabled={!canAct && !zone}
          className={`py-3 font-condensed font-black text-sm tracking-widest uppercase rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${zone ? 'bg-cyan text-bg hover:bg-[#2fd4c0]' : 'bg-s3 text-txt2 border border-border2 hover:border-cyan hover:text-cyan'}`}>
          ZONE
        </button>
      </div>

      <div className="px-4 pb-4">
        <div className="font-mono text-[9px] tracking-widest uppercase text-txt3 mb-1.5">嘗試次數</div>
        <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 80px' }}>
          <input type="number" min={0} value={attempts} disabled={disabled}
            onChange={e => onAttemptsChange(Math.max(0, parseInt(e.target.value) || 0))}
            className="text-center font-mono font-bold text-lg py-2.5 w-full disabled:opacity-40" />
          <button disabled={disabled} onClick={() => { onAttemptsChange(attempts + 1); playClick(); navigator.vibrate?.(30); }}
            className="h-[46px] bg-s3 border border-border2 text-txt text-3xl font-bold rounded hover:bg-border2 transition-colors active:scale-95 select-none disabled:opacity-30 disabled:cursor-not-allowed">
            +
          </button>
        </div>
      </div>
    </div>
  );
}

function UnsavedModal({ onSaveAndSwitch, onDiscardAndSwitch, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-s1 border border-border2 rounded-lg p-7 max-w-xs w-full text-center">
        <p className="text-txt text-sm leading-relaxed mb-1">有未儲存的成績</p>
        <p className="text-txt3 font-mono text-xs mb-6">切換前請選擇處理方式</p>
        <div className="flex flex-col gap-2">
          <button onClick={onSaveAndSwitch} className="py-2.5 bg-lime text-bg font-condensed font-bold text-xs tracking-widest uppercase rounded hover:bg-[#b5de25] transition-colors">儲存後切換</button>
          <button onClick={onDiscardAndSwitch} className="py-2.5 border border-red/40 text-red font-condensed font-bold text-xs tracking-widest uppercase rounded hover:bg-red hover:text-white transition-colors">直接切換（放棄成績）</button>
          <button onClick={onCancel} className="py-2.5 border border-border2 text-txt2 font-condensed font-bold text-xs tracking-widest uppercase rounded hover:border-txt2 transition-colors">取消</button>
        </div>
      </div>
    </div>
  );
}

function ResetModal({ label, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-s1 border border-border2 rounded-lg p-7 max-w-xs w-full text-center">
        <p className="text-txt text-sm leading-relaxed mb-6">
          確認要重設選手<br />
          <span className="font-condensed font-bold text-base tracking-widest text-lime">{label}</span><br />
          的成績？
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={onConfirm} className="py-2.5 bg-lime text-bg font-condensed font-bold text-xs tracking-widest uppercase rounded hover:bg-[#b5de25] transition-colors">確認</button>
          <button onClick={onCancel} className="py-2.5 border border-border2 text-txt2 font-condensed font-bold text-xs tracking-widest uppercase rounded hover:border-txt2 transition-colors">取消</button>
        </div>
      </div>
    </div>
  );
}

function DnsModal({ name, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-s1 border border-border2 rounded-lg p-7 max-w-xs w-full text-center">
        <p className="text-txt text-sm leading-relaxed mb-1">
          確認將選手<br />
          <span className="font-condensed font-bold text-base tracking-widest text-lime">{name}</span><br />
          標記為 <span className="font-condensed font-bold text-red">DNS</span>？
        </p>
        <p className="font-mono text-xs text-txt3 mb-6">棄賽選手將排於所有出賽選手之後</p>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={onConfirm} className="py-2.5 bg-red/80 text-white font-condensed font-bold text-xs tracking-widest uppercase rounded hover:bg-red transition-colors">確認 DNS</button>
          <button onClick={onCancel} className="py-2.5 border border-border2 text-txt2 font-condensed font-bold text-xs tracking-widest uppercase rounded hover:border-txt2 transition-colors">取消</button>
        </div>
      </div>
    </div>
  );
}

export default function Scoring() {
  const { id, catId } = useParams();
  const toast = useToast();
  const { isAdmin } = useAuth();
  const [event, setEvent] = useState(null);
  const [category, setCategory] = useState(null);
  const [athletes, setAthletes] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [myZoneIds, setMyZoneIds] = useState([]);
  const [selectedAthlete, setSelectedAthlete] = useState('');
  const [selectedRound, setSelectedRound] = useState('smash');
  const [selectedRoute, setSelectedRoute] = useState('all');
  const [scores, setScores] = useState({});
  const [attemptCounts, setAttemptCounts] = useState({});
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [pendingSwitch, setPendingSwitch] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [isDns, setIsDns] = useState(false);
  const [showDnsModal, setShowDnsModal] = useState(false);
  const [dnsSet, setDnsSet] = useState(new Set());
  const [myZoneOnly, setMyZoneOnly] = useState(true);
  const [finalBoulders, setFinalBoulders] = useState([]);

  const isSmash = selectedRound === 'smash';
  const selectedAthObj = athletes.find(a => String(a.id) === selectedAthlete);
  const availableRounds = category ? (category.rounds === 2 ? ['smash', 'final'] : ['smash']) : ['smash'];

  useEffect(() => {
    setIsDns(selectedAthlete ? dnsSet.has(+selectedAthlete) : false);
  }, [selectedAthlete, dnsSet]);

  useEffect(() => {
    Promise.all([eventsAPI.get(id), eventsAPI.getCategories(id)]).then(([ev, cl]) => {
      setEvent(ev.data);
      const found = cl.data.find(c => String(c.id) === String(catId));
      setCategory(found || null);
    });
    eventsAPI.getMyZones(id).then(res => setMyZoneIds(res.data.map(z => z.id))).catch(() => {});
  }, [id, catId]);

  useEffect(() => {
    if (!catId) return;
    const loadAthletes = selectedRound === 'final'
      ? eventsAPI.getStartOrder(id, catId).then(res => res.data)
      : eventsAPI.getAthletes(id, { round: 'smash' }).then(res => res.data.filter(a => String(a.category_id) === String(catId)));

    Promise.all([
      loadAthletes,
      eventsAPI.getDns(id, selectedRound).catch(() => ({ data: { dns: [] } })),
    ]).then(([list, dnsRes]) => {
      setAthletes(list);
      setSelectedAthlete(prev => list.find(a => String(a.id) === prev) ? prev : '');
      setDnsSet(new Set(dnsRes.data.dns));
    });
  }, [id, catId, selectedRound]);

  useEffect(() => {
    if (!catId || selectedRound !== 'smash') return;
    eventsAPI.getCategoryRoutes(id, catId).then(res => setRoutes(res.data));
  }, [id, catId, selectedRound]);

  useEffect(() => {
    if (!catId || selectedRound !== 'final') return;
    eventsAPI.getBoulders(id, catId).then(res => setFinalBoulders(res.data));
  }, [id, catId, selectedRound]);

  useEffect(() => {
    if (!selectedAthlete) return;
    if (selectedRound === 'smash') {
      eventsAPI.getSmashScores(id, catId).then(res => {
        const map = {}, counts = {};
        res.data.filter(s => s.athlete_id === +selectedAthlete).forEach(s => {
          map[s.route_id] = { top: !!s.top, zone: !!s.zone, top_attempts: s.top_attempts, zone_attempts: s.zone_attempts };
          counts[s.route_id] = s.attempts || 0;
        });
        setScores(map);
        setAttemptCounts(counts);
      });
    } else {
      eventsAPI.getFinalScores(id).then(res => {
        const map = {}, counts = {};
        res.data.filter(s => s.athlete_id === +selectedAthlete).forEach(s => {
          map[s.boulder_id] = { top: !!s.top, zone: !!s.zone, top_attempts: s.top_attempts, zone_attempts: s.zone_attempts };
          counts[s.boulder_id] = s.attempts || 0;
        });
        setScores(map);
        setAttemptCounts(counts);
      });
    }
  }, [selectedAthlete, selectedRound, id, catId]);

  const handleScoreChange = useCallback((itemId, newScore) => {
    setScores(prev => ({ ...prev, [itemId]: newScore }));
    setIsDirty(true);
  }, []);

  const handleAttemptsChange = useCallback((itemId, val) => {
    setAttemptCounts(prev => ({ ...prev, [itemId]: val }));
    setIsDirty(true);
  }, []);

  const handleResetConfirm = () => {
    if (!resetTarget) return;
    setScores(prev => { const next = { ...prev }; delete next[resetTarget.id]; return next; });
    setAttemptCounts(prev => ({ ...prev, [resetTarget.id]: 0 }));
    setResetTarget(null);
    setIsDirty(true);
  };

  const handleSave = async () => {
    if (!selectedAthlete) return toast('請先選擇選手', 'error');
    setSaving(true);
    try {
      if (selectedRound === 'smash') {
        const scoreArray = routes.map(r => ({
          route_id: r.id,
          top: scores[r.id]?.top || false,
          top_attempts: scores[r.id]?.top_attempts || 0,
          zone: scores[r.id]?.zone || false,
          zone_attempts: scores[r.id]?.zone_attempts || 0,
          attempts: attemptCounts[r.id] || 0,
        }));
        await eventsAPI.saveSmashScores(id, { athlete_id: +selectedAthlete, scores: scoreArray });
      } else {
        const scoreArray = finalBoulders.map(b => ({
          boulder_id: b.id,
          top: scores[b.id]?.top || false,
          top_attempts: scores[b.id]?.top_attempts || 0,
          zone: scores[b.id]?.zone || false,
          zone_attempts: scores[b.id]?.zone_attempts || 0,
          attempts: attemptCounts[b.id] || 0,
        }));
        await eventsAPI.saveFinalScores(id, { athlete_id: +selectedAthlete, scores: scoreArray });
      }
      toast('成績已儲存 ✓');
      setIsDirty(false);
    } catch {
      toast('儲存失敗', 'error');
    } finally {
      setSaving(false);
    }
  };

  const applySwitch = (sw) => {
    if (sw.type === 'athlete') setSelectedAthlete(sw.value);
    else if (sw.type === 'round') { setSelectedRound(sw.value); setSelectedRoute('all'); }
    setScores({});
    setAttemptCounts({});
    setIsDirty(false);
    setPendingSwitch(null);
  };

  const handleAthleteChange = (value) => {
    if (isDirty && selectedAthlete) { setPendingSwitch({ type: 'athlete', value }); }
    else { setSelectedAthlete(value); setScores({}); setAttemptCounts({}); setIsDirty(false); }
  };

  const handleRoundChange = (value) => {
    if (isDirty && selectedAthlete) { setPendingSwitch({ type: 'round', value }); }
    else { setSelectedRound(value); setSelectedRoute('all'); setScores({}); setAttemptCounts({}); setIsDirty(false); }
  };

  const handleSaveAndSwitch = async () => { await handleSave(); if (pendingSwitch) applySwitch(pendingSwitch); };

  if (!event || !category) return <Layout><div className="text-txt3 font-mono py-16 text-center">載入中...</div></Layout>;

  const locked = isEventLocked(event);
  const hasMyZone = myZoneIds.length > 0;

  const displayRoutes = isSmash ? routes.filter(r => {
    if (myZoneOnly && hasMyZone && r.zone_id && !myZoneIds.includes(r.zone_id)) return false;
    if (selectedRoute !== 'all' && String(r.id) !== selectedRoute) return false;
    return true;
  }) : [];

  const displayBoulders = !isSmash
    ? (selectedRoute === 'all' ? finalBoulders : finalBoulders.filter(b => String(b.id) === selectedRoute))
    : [];

  return (
    <Layout>
      {pendingSwitch && <UnsavedModal onSaveAndSwitch={handleSaveAndSwitch} onDiscardAndSwitch={() => applySwitch(pendingSwitch)} onCancel={() => setPendingSwitch(null)} />}
      {resetTarget && <ResetModal label={resetTarget.label} onConfirm={handleResetConfirm} onCancel={() => setResetTarget(null)} />}
      {showDnsModal && selectedAthObj && (
        <DnsModal name={selectedAthObj.name}
          onConfirm={async () => {
            try {
              await eventsAPI.markDns(id, { athlete_id: +selectedAthlete, round: selectedRound });
              setDnsSet(prev => new Set([...prev, +selectedAthlete]));
              setShowDnsModal(false);
            } catch { toast('標記失敗', 'error'); setShowDnsModal(false); }
          }}
          onCancel={() => setShowDnsModal(false)} />
      )}

      <div className="flex items-center gap-2 mb-6 text-txt3 font-mono text-xs">
        <Link to="/events" className="hover:text-txt transition-colors">比賽列表</Link>
        <span>/</span>
        <Link to={`/events/${id}`} className="hover:text-txt transition-colors">{event.name}</Link>
        <span>/</span>
        <Link to={`/events/${id}/categories/${catId}`} className="hover:text-txt transition-colors">{category.name}</Link>
        <span>/</span>
        <span className="text-txt">裁判計分</span>
      </div>

      {locked && (
        <div className="mb-6 bg-red/5 border border-red/30 rounded-lg px-5 py-3">
          <div className="font-condensed font-bold text-sm text-red tracking-wide">此比賽已鎖定，無法記錄成績</div>
          <div className="font-mono text-xs text-txt3 mt-0.5">如需解鎖，請聯繫系統管理員</div>
        </div>
      )}

      <div className="flex gap-3 flex-wrap items-end mb-4">
        <div className="flex-1 min-w-48">
          <label className="block font-mono text-[10px] tracking-widest uppercase text-txt3 mb-1.5">選手（按背號）</label>
          <select value={selectedAthlete} onChange={e => handleAthleteChange(e.target.value)}>
            <option value="">-- 選擇選手 --</option>
            {athletes.map(a => (
              <option key={a.id} value={a.id}>
                [{a.bib}] {a.name}{dnsSet.has(a.id) ? ' (DNS)' : ''}
              </option>
            ))}
          </select>
        </div>
        {availableRounds.length > 1 && (
          <div className="min-w-32">
            <label className="block font-mono text-[10px] tracking-widest uppercase text-txt3 mb-1.5">輪次</label>
            <select value={selectedRound} onChange={e => handleRoundChange(e.target.value)}>
              {availableRounds.map(r => <option key={r} value={r}>{ROUND_NAMES[r]}</option>)}
            </select>
          </div>
        )}
        <div className="min-w-36">
          <label className="block font-mono text-[10px] tracking-widest uppercase text-txt3 mb-1.5">路線篩選</label>
          <select value={selectedRoute} onChange={e => setSelectedRoute(e.target.value)}>
            <option value="all">顯示全部</option>
            {isSmash
              ? routes.filter(r => !myZoneOnly || !hasMyZone || !r.zone_id || myZoneIds.includes(r.zone_id))
                  .map(r => <option key={r.id} value={String(r.id)}>{r.name}{r.zone_name ? ` (${r.zone_name})` : ''}</option>)
              : finalBoulders.map(b => <option key={b.id} value={String(b.id)}>{b.label}</option>)
            }
          </select>
        </div>
        <button onClick={handleSave} disabled={saving || !selectedAthlete || locked || isDns}
          className="bg-lime text-bg font-condensed font-bold text-xs tracking-widest uppercase px-5 py-[9px] rounded hover:bg-[#b5de25] transition-colors disabled:opacity-40">
          {saving ? '儲存中...' : '💾 儲存成績'}
        </button>
      </div>

      {isSmash && hasMyZone && (
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setMyZoneOnly(!myZoneOnly)}
            className={`font-condensed font-bold text-xs tracking-widest uppercase px-4 py-1.5 rounded border transition-colors ${myZoneOnly ? 'bg-cyan text-bg border-cyan' : 'border-border2 text-txt3 hover:border-txt3'}`}>
            {myZoneOnly ? '只看我的區域' : '顯示全部路線'}
          </button>
          {myZoneOnly && (
            <span className="font-mono text-[10px] text-txt3">
              {routes.filter(r => r.zone_id && myZoneIds.includes(r.zone_id)).length} 條路線
            </span>
          )}
        </div>
      )}

      {!selectedAthlete ? (
        <div className="text-txt3 font-mono text-center py-20">請先選擇選手</div>
      ) : isDns ? (
        <div className="bg-s1 border border-border rounded-lg p-12 text-center">
          <div className="font-condensed font-black text-6xl tracking-[0.3em] text-txt3/40 mb-3">DNS</div>
          <div className="font-mono text-xs text-txt3 mb-6">{selectedAthObj?.name} 本輪棄賽</div>
          <button onClick={async () => {
            try {
              await eventsAPI.cancelDns(id, { athlete_id: +selectedAthlete, round: selectedRound });
              setDnsSet(prev => { const next = new Set(prev); next.delete(+selectedAthlete); return next; });
            } catch { toast('取消失敗', 'error'); }
          }} className="border border-cyan/50 text-cyan font-condensed font-bold text-xs tracking-widest uppercase px-5 py-2 rounded hover:bg-cyan/10 transition-colors">
            取消 DNS
          </button>
        </div>
      ) : (
        <div className="bg-s1 border border-border rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="font-condensed font-bold text-sm tracking-widest uppercase text-lime">
                {selectedAthObj?.name}
              </div>
              <div className="font-mono text-[10px] text-txt3 mt-0.5">{category.name} — {ROUND_NAMES[selectedRound]}</div>
            </div>
            {isAdmin && (
              <button onClick={() => setShowDnsModal(true)} disabled={locked}
                className="border border-red/40 text-red font-condensed font-bold text-xs tracking-widest uppercase px-4 py-1.5 rounded hover:bg-red/10 transition-colors disabled:opacity-40">
                DNS
              </button>
            )}
          </div>

          {isSmash && displayRoutes.length === 0 && (
            <div className="text-txt3 font-mono text-center py-12">
              {routes.length === 0 ? '此組別尚未配置路線' : '篩選後無路線'}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {isSmash
              ? displayRoutes.map(r => {
                  const displayName = r.zone_name ? `${r.zone_name}-${r.name}` : r.name;
                  return (
                    <BoulderCard key={`${r.id}-${selectedAthlete}`} boulder={{ ...r, name: displayName }}
                      score={scores[r.id] || { top: false, zone: false, top_attempts: 0, zone_attempts: 0 }}
                      onChange={newScore => handleScoreChange(r.id, newScore)}
                      onReset={() => setResetTarget({ id: r.id, label: displayName })}
                      attempts={attemptCounts[r.id] || 0}
                      onAttemptsChange={val => handleAttemptsChange(r.id, val)}
                      disabled={locked} />
                  );
                })
              : displayBoulders.map(b => (
                  <BoulderCard key={`${b.id}-${selectedAthlete}`} boulder={b}
                    score={scores[b.id] || { top: false, zone: false, top_attempts: 0, zone_attempts: 0 }}
                    onChange={newScore => handleScoreChange(b.id, newScore)}
                    onReset={() => setResetTarget({ id: b.id, label: b.label })}
                    attempts={attemptCounts[b.id] || 0}
                    onAttemptsChange={val => handleAttemptsChange(b.id, val)}
                    disabled={locked} />
                ))
            }
          </div>
        </div>
      )}
    </Layout>
  );
}
