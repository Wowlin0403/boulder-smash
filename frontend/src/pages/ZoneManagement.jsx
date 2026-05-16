import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { eventsAPI } from '../api';
import { useToast } from '../components/Toast';
import ConfirmModal from '../components/ConfirmModal';

export default function ZoneManagement() {
  const { id } = useParams();
  const toast = useToast();
  const [event, setEvent] = useState(null);
  const [categories, setCategories] = useState([]);
  const [zones, setZones] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [newZoneName, setNewZoneName] = useState('');
  const [activeCatId, setActiveCatId] = useState(null);
  const [savingRoutes, setSavingRoutes] = useState(false);
  const [catRouteIds, setCatRouteIds] = useState([]);
  const [editingRoute, setEditingRoute] = useState(null);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [confirmModal, setConfirmModal] = useState(null);
  const [addRouteModal, setAddRouteModal] = useState(null);

  const load = async () => {
    const [ev, cl, zl, rl] = await Promise.all([
      eventsAPI.get(id),
      eventsAPI.getCategories(id),
      eventsAPI.getZones(id),
      eventsAPI.getRoutes(id),
    ]);
    setEvent(ev.data);
    setCategories(cl.data);
    setZones(zl.data);
    setRoutes(rl.data);
  };

  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    if (!activeCatId) return;
    eventsAPI.getCategoryRoutes(id, activeCatId).then(res => {
      setCatRouteIds(res.data.map(r => r.id));
    });
  }, [activeCatId, id]);

  // Zone CRUD
  const handleAddZone = async (e) => {
    e.preventDefault();
    if (!newZoneName.trim()) return;
    if (zones.length >= 8) return toast('最多 8 個區域', 'error');
    try {
      await eventsAPI.createZone(id, { name: newZoneName.trim() });
      setNewZoneName('');
      const res = await eventsAPI.getZones(id);
      setZones(res.data);
      toast('區域已新增');
    } catch (err) {
      toast(err.response?.data?.error || '新增失敗', 'error');
    }
  };

  const handleRenameZone = async (zone, name) => {
    try {
      await eventsAPI.updateZone(id, zone.id, { name });
      setZones(prev => prev.map(z => z.id === zone.id ? { ...z, name } : z));
    } catch {
      toast('更新失敗', 'error');
    }
  };

  const handleDeleteZone = (zone) => {
    setConfirmModal({
      message: `刪除區域「${zone.name}」？`,
      note: '該區域所有路線將一併刪除。',
      confirmLabel: '刪除',
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          await eventsAPI.deleteZone(id, zone.id);
          const [zl, rl] = await Promise.all([eventsAPI.getZones(id), eventsAPI.getRoutes(id)]);
          setZones(zl.data);
          setRoutes(rl.data);
          toast('已刪除');
        } catch {
          toast('刪除失敗', 'error');
        }
      },
    });
  };

  // Route CRUD
  const handleAddRoute = (zoneId) => {
    setAddRouteModal({ zoneId, name: '' });
  };

  const submitAddRoute = async () => {
    const { zoneId, name } = addRouteModal;
    try {
      await eventsAPI.createRoute(id, { zone_id: zoneId, name: name.trim() || undefined });
      const res = await eventsAPI.getRoutes(id);
      setRoutes(res.data);
      setAddRouteModal(null);
      toast('路線已新增');
    } catch (err) {
      toast(err.response?.data?.error || '新增失敗', 'error');
    }
  };

  const handleSaveRoute = async (route) => {
    try {
      await eventsAPI.updateRoute(id, route.id, {
        name: route.name,
        top_score: route.top_score,
        zone_score: route.zone_score,
      });
      setRoutes(prev => prev.map(r => r.id === route.id ? route : r));
      setEditingRoute(null);
      toast('已儲存');
    } catch {
      toast('儲存失敗', 'error');
    }
  };

  const handleDeleteRoute = (route) => {
    setConfirmModal({
      message: `刪除路線「${route.name}」？`,
      note: '成績將一併刪除。',
      confirmLabel: '刪除',
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          await eventsAPI.deleteRoute(id, route.id);
          setRoutes(prev => prev.filter(r => r.id !== route.id));
          toast('已刪除');
        } catch {
          toast('刪除失敗', 'error');
        }
      },
    });
  };

  // Category route assignment
  const handleToggleCatRoute = (routeId) => {
    setCatRouteIds(prev =>
      prev.includes(routeId) ? prev.filter(id => id !== routeId) : [...prev, routeId]
    );
  };

  const handleSelectZoneRoutes = (zoneId) => {
    const zoneRouteIds = routes.filter(r => r.zone_id === zoneId).map(r => r.id);
    const allSelected = zoneRouteIds.every(rid => catRouteIds.includes(rid));
    if (allSelected) {
      setCatRouteIds(prev => prev.filter(id => !zoneRouteIds.includes(id)));
    } else {
      setCatRouteIds(prev => [...new Set([...prev, ...zoneRouteIds])]);
    }
  };

  const handleSaveCatRoutes = async () => {
    setSavingRoutes(true);
    try {
      await eventsAPI.saveCategoryRoutes(id, activeCatId, catRouteIds);
      toast('組別路線已儲存');
    } catch {
      toast('儲存失敗', 'error');
    } finally {
      setSavingRoutes(false);
    }
  };

  const handleClearAll = () => {
    setConfirmModal({
      message: '清除全部區域與路線？',
      note: '將同時刪除所有路線、組別配置及選手大亂鬥成績，此操作無法復原。',
      confirmLabel: '確認清除',
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          await eventsAPI.clearAllZones(id);
          setZones([]);
          setRoutes([]);
          setCatRouteIds([]);
          toast('已清除全部區域與路線');
        } catch {
          toast('清除失敗', 'error');
        }
      },
    });
  };

  const handleBulkImport = async (rows) => {
    try {
      const res = await eventsAPI.bulkImportRoutes(id, rows);
      toast(`匯入完成：新增 ${res.data.inserted} 條，略過 ${res.data.skipped} 條`);
      const rl = await eventsAPI.getRoutes(id);
      setRoutes(rl.data);
      setShowBulkModal(false);
    } catch {
      toast('匯入失敗', 'error');
    }
  };

  if (!event) return <Layout><div className="text-txt3 font-mono py-16 text-center">載入中...</div></Layout>;

  return (
    <Layout>
      <div className="flex items-center gap-2 mb-6 text-txt3 font-mono text-xs">
        <Link to="/events" className="hover:text-txt transition-colors">比賽列表</Link>
        <span>/</span>
        <Link to={`/events/${id}`} className="hover:text-txt transition-colors">{event.name}</Link>
        <span>/</span>
        <span className="text-txt">區域 / 路線管理</span>
      </div>

      <div className="font-condensed font-black text-2xl tracking-widest uppercase text-lime mb-6">{event.name}</div>

      {confirmModal && (
        <ConfirmModal
          message={confirmModal.message}
          note={confirmModal.note}
          confirmLabel={confirmModal.confirmLabel}
          onConfirm={confirmModal.onConfirm}
          onClose={() => setConfirmModal(null)}
        />
      )}

      {addRouteModal && (() => {
        const zone = zones.find(z => z.id === addRouteModal.zoneId);
        const zoneRoutes = routes.filter(r => r.zone_id === addRouteModal.zoneId);
        const trimmed = addRouteModal.name.trim();
        const isDup = trimmed && zoneRoutes.some(r => r.name === trimmed);
        return (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setAddRouteModal(null)}>
            <div className="bg-s1 border border-border2 rounded-lg p-7 max-w-xs w-full" onClick={e => e.stopPropagation()}>
              <p className="font-condensed font-bold text-base tracking-widest uppercase text-txt mb-4">
                新增路線 — {zone?.name}
              </p>
              <input
                autoFocus
                type="text"
                placeholder="路線名稱"
                value={addRouteModal.name}
                onChange={e => setAddRouteModal(m => ({ ...m, name: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter' && !isDup) submitAddRoute(); if (e.key === 'Escape') setAddRouteModal(null); }}
                className="w-full bg-s2 border border-border2 rounded px-3 py-2 font-mono text-sm text-txt placeholder-txt3 focus:outline-none focus:border-cyan transition-colors"
              />
              {isDup && (
                <p className="font-mono text-xs text-red mt-2">已有同名稱路線存在此區域</p>
              )}
              <div className="grid grid-cols-2 gap-3 mt-5">
                <button
                  onClick={submitAddRoute}
                  disabled={isDup}
                  className="py-2.5 font-condensed font-bold text-xs tracking-widest uppercase rounded transition-colors bg-cyan text-bg hover:bg-[#2fd6c4] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  新增
                </button>
                <button
                  onClick={() => setAddRouteModal(null)}
                  className="py-2.5 border border-border2 text-txt2 font-condensed font-bold text-xs tracking-widest uppercase rounded hover:border-txt2 transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {showBulkModal && (
        <BulkImportModal
          zones={zones}
          existingRoutes={routes}
          onConfirm={handleBulkImport}
          onClose={() => setShowBulkModal(false)}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: zones + routes */}
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-2">
            <div className="font-condensed font-bold text-sm tracking-widest uppercase text-txt3">區域與路線</div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowBulkModal(true)}
                className="font-mono text-[10px] tracking-widest uppercase text-cyan border border-cyan/30 rounded px-3 py-1 hover:bg-cyan/10 transition-colors"
              >
                批次匯入
              </button>
              <button
                onClick={handleClearAll}
                className="font-mono text-[10px] tracking-widest uppercase text-red border border-red/30 rounded px-3 py-1 hover:bg-red/10 transition-colors"
              >
                清除全部
              </button>
            </div>
          </div>

          {/* Add zone */}
          {zones.length < 8 && (
            <form onSubmit={handleAddZone} className="flex gap-2">
              <input
                type="text"
                placeholder="新區域名稱"
                value={newZoneName}
                onChange={e => setNewZoneName(e.target.value)}
                className="flex-1"
              />
              <button type="submit" className="bg-lime text-bg font-condensed font-bold text-xs tracking-widest uppercase px-4 py-2 rounded hover:bg-[#b5de25] transition-colors whitespace-nowrap">
                + 新增區域
              </button>
            </form>
          )}
          {zones.length >= 8 && (
            <div className="font-mono text-xs text-txt3">已達區域上限（最多 8 個）</div>
          )}

          {zones.length === 0 && (
            <div className="bg-s1 border border-border rounded-lg p-8 text-center text-txt3 font-mono text-xs">
              尚無區域，請先新增區域
            </div>
          )}

          {zones.map(zone => {
            const zoneRoutes = routes.filter(r => r.zone_id === zone.id);
            return (
              <div key={zone.id} className="bg-s1 border border-border rounded-lg overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-s2/30">
                  <ZoneNameEditor zone={zone} onSave={name => handleRenameZone(zone, name)} />
                  <div className="flex-1" />
                  <span className="font-mono text-[10px] text-txt3">{zoneRoutes.length} 條路線</span>
                  <button
                    onClick={() => handleAddRoute(zone.id)}
                    className="font-mono text-[10px] text-cyan hover:text-txt transition-colors px-2 py-1 border border-cyan/30 rounded"
                  >
                    + 路線
                  </button>
                  <button
                    onClick={() => handleDeleteZone(zone)}
                    className="font-mono text-[10px] text-red hover:text-red/80 transition-colors px-2 py-1 border border-red/30 rounded"
                  >
                    刪除
                  </button>
                </div>

                {zoneRoutes.length === 0 && (
                  <div className="px-4 py-4 text-txt3 font-mono text-xs text-center">尚無路線</div>
                )}

                <div className="divide-y divide-border">
                  {zoneRoutes.map(route => (
                    <RouteRow
                      key={route.id}
                      route={editingRoute?.id === route.id ? editingRoute : route}
                      editing={editingRoute?.id === route.id}
                      onEdit={() => setEditingRoute({ ...route })}
                      onChange={r => setEditingRoute(r)}
                      onSave={() => handleSaveRoute(editingRoute)}
                      onCancel={() => setEditingRoute(null)}
                      onDelete={() => handleDeleteRoute(route)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: category route assignment */}
        <div>
          <div className="font-condensed font-bold text-sm tracking-widest uppercase text-txt3 mb-4">組別路線配置</div>

          <div className="flex gap-2 flex-wrap mb-4">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCatId(String(cat.id))}
                className={`flex items-center gap-2 px-3 py-1.5 rounded font-condensed font-bold text-xs tracking-widest uppercase transition-colors border ${
                  String(activeCatId) === String(cat.id)
                    ? 'border-transparent text-bg'
                    : 'border-border text-txt3 hover:text-txt hover:border-border2'
                }`}
                style={String(activeCatId) === String(cat.id) ? { background: cat.color, borderColor: cat.color } : {}}
              >
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: cat.color }} />
                {cat.name}
              </button>
            ))}
          </div>

          {!activeCatId && (
            <div className="bg-s1 border border-border rounded-lg p-8 text-center text-txt3 font-mono text-xs">
              選擇組別以編輯路線配置
            </div>
          )}

          {activeCatId && (
            <div className="bg-s1 border border-border rounded-lg overflow-hidden">
              {zones.map(zone => {
                const zoneRoutes = routes.filter(r => r.zone_id === zone.id);
                const allSelected = zoneRoutes.length > 0 && zoneRoutes.every(r => catRouteIds.includes(r.id));
                const someSelected = zoneRoutes.some(r => catRouteIds.includes(r.id));
                return (
                  <div key={zone.id} className="border-b border-border last:border-0">
                    <div className="flex items-center gap-3 px-4 py-2.5 bg-s2/30">
                      <button
                        onClick={() => handleSelectZoneRoutes(zone.id)}
                        className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                          allSelected ? 'bg-lime border-lime' : someSelected ? 'bg-lime/30 border-lime/50' : 'border-border2'
                        }`}
                      >
                        {(allSelected || someSelected) && <span className="text-bg text-[10px] font-bold">✓</span>}
                      </button>
                      <span className="font-condensed font-bold text-sm tracking-widest uppercase text-txt2">{zone.name}</span>
                      <span className="font-mono text-[10px] text-txt3 ml-auto">
                        {zoneRoutes.filter(r => catRouteIds.includes(r.id)).length}/{zoneRoutes.length}
                      </span>
                    </div>
                    <div className="divide-y divide-border/50">
                      {zoneRoutes.map(route => (
                        <label key={route.id} className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-s2/20 transition-colors">
                          <input
                            type="checkbox"
                            checked={catRouteIds.includes(route.id)}
                            onChange={() => handleToggleCatRoute(route.id)}
                            className="accent-lime"
                          />
                          <span className="font-mono text-xs text-txt flex-1">{route.name}</span>
                          <span className="font-mono text-[10px] text-lime">T: {route.top_score}</span>
                          <span className="font-mono text-[10px] text-cyan">Z: {route.zone_score}</span>
                        </label>
                      ))}
                      {zoneRoutes.length === 0 && (
                        <div className="px-4 py-2 font-mono text-[10px] text-txt3">尚無路線</div>
                      )}
                    </div>
                  </div>
                );
              })}

              <div className="px-4 py-3 border-t border-border flex items-center justify-between">
                <span className="font-mono text-xs text-txt3">已選 {catRouteIds.length} 條路線</span>
                <button
                  onClick={handleSaveCatRoutes}
                  disabled={savingRoutes}
                  className={`font-condensed font-bold text-xs tracking-widest uppercase px-5 py-2 rounded transition-all ${
                    savingRoutes
                      ? 'bg-lime/50 text-bg/70 cursor-not-allowed'
                      : 'bg-lime text-bg hover:bg-[#b5de25] active:scale-95'
                  }`}
                >
                  {savingRoutes ? '儲存中...' : '儲存配置'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

function ZoneNameEditor({ zone, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(zone.name);

  const commit = () => {
    if (val.trim() && val.trim() !== zone.name) onSave(val.trim());
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
        className="font-condensed font-bold text-sm tracking-widest uppercase bg-transparent border-b border-lime outline-none text-txt w-32"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="font-condensed font-bold text-sm tracking-widest uppercase text-txt hover:text-lime transition-colors"
    >
      {zone.name}
    </button>
  );
}

function parseCsvRows(text, defaultTop, defaultZone, zones, existingRoutes) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  return lines.map(line => {
    const parts = line.split(',').map(p => p.trim());
    const zone_name = parts[0] || '';
    const name = parts[1] || '';
    const top_score = parts[2] !== undefined && parts[2] !== '' ? +parts[2] : defaultTop;
    const zone_score = parts[3] !== undefined && parts[3] !== '' ? +parts[3] : defaultZone;

    if (!zone_name || !name) return null;

    const zone = zones.find(z => z.name === zone_name);
    if (!zone) return { zone_name, name, top_score, zone_score, status: 'no_zone' };

    const sameZoneDup = existingRoutes.find(r => r.zone_id === zone.id && r.name === name);
    if (sameZoneDup) return { zone_name, name, top_score, zone_score, status: 'dup_zone' };

    const otherZoneDup = existingRoutes.find(r => r.zone_id !== zone.id && r.name === name);
    return { zone_name, name, top_score, zone_score, status: otherZoneDup ? 'dup_other' : 'ok' };
  }).filter(Boolean);
}

function BulkImportModal({ zones, existingRoutes, onConfirm, onClose }) {
  const [text, setText] = useState('');
  const [defaultTop, setDefaultTop] = useState(100);
  const [defaultZone, setDefaultZone] = useState(50);
  const [importing, setImporting] = useState(false);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setText(ev.target.result || '');
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  };

  const parsed = text.trim()
    ? parseCsvRows(text, defaultTop, defaultZone, zones, existingRoutes)
    : [];

  // 同批次內同區同名重複
  const seen = new Set();
  const rows = parsed.map(r => {
    if (r.status !== 'ok') return r;
    const key = `${r.zone_name}::${r.name}`;
    if (seen.has(key)) return { ...r, status: 'dup_zone' };
    seen.add(key);
    return r;
  });

  const toImport = rows.filter(r => r.status === 'ok' || r.status === 'dup_other');
  const skipped = rows.filter(r => r.status === 'no_zone' || r.status === 'dup_zone');

  const handleConfirm = async () => {
    setImporting(true);
    await onConfirm(toImport.map(r => ({ zone_name: r.zone_name, name: r.name, top_score: r.top_score, zone_score: r.zone_score })));
    setImporting(false);
  };

  const STATUS_LABEL = {
    ok: null,
    dup_other: { text: '路線名稱存在其他區域', color: 'text-yellow-400' },
    no_zone: { text: '無此區域', color: 'text-red' },
    dup_zone: { text: '路線已在此區域', color: 'text-red' },
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-s1 border border-border rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
          <div className="font-condensed font-bold text-sm tracking-widest uppercase text-cyan">批次匯入路線</div>
          <button onClick={onClose} className="text-txt3 hover:text-txt text-lg leading-none">×</button>
        </div>

        <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
          {/* Format hint */}
          <div className="bg-s2 border border-border rounded px-4 py-2.5">
            <div className="font-mono text-[10px] tracking-widest uppercase text-txt3 mb-1">格式（每行一條）</div>
            <div className="font-mono text-xs text-txt2">區域, 路線名稱, Top分, Zone分</div>
            <div className="font-mono text-[10px] text-txt3 mt-1">Top分 / Zone分 可省略，省略時套用下方預設值</div>
          </div>

          {/* Default scores */}
          <div className="flex gap-4">
            <div>
              <label className="block font-mono text-[9px] tracking-widest uppercase text-txt3 mb-1">預設 Top 分</label>
              <input type="number" min={0} value={defaultTop} onChange={e => setDefaultTop(+e.target.value || 0)} className="w-24 text-sm py-1.5 text-center" />
            </div>
            <div>
              <label className="block font-mono text-[9px] tracking-widest uppercase text-txt3 mb-1">預設 Zone 分</label>
              <input type="number" min={0} value={defaultZone} onChange={e => setDefaultZone(+e.target.value || 0)} className="w-24 text-sm py-1.5 text-center" />
            </div>
          </div>

          {/* Textarea */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="font-mono text-[9px] tracking-widest uppercase text-txt3">貼入 CSV 或上傳檔案</label>
              <label className="font-mono text-[10px] text-cyan border border-cyan/30 rounded px-2.5 py-0.5 cursor-pointer hover:bg-cyan/10 transition-colors">
                選擇檔案
                <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              rows={8}
              placeholder={'A區, A01, 100, 50\nA區, A02\nB區, B01, 80, 40'}
              className="w-full bg-bg border border-border2 rounded px-3 py-2 font-mono text-xs text-txt resize-y focus:outline-none focus:border-cyan"
            />
          </div>

          {/* Preview */}
          {rows.length > 0 && (
            <div>
              <div className="font-mono text-[9px] tracking-widest uppercase text-txt3 mb-1.5">
                解析預覽 — 共 {rows.length} 行，匯入 {toImport.length} 條，略過 {skipped.length} 條
              </div>
              <div className="border border-border rounded overflow-hidden max-h-56 overflow-y-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-s2 border-b border-border">
                      <th className="font-mono text-[9px] tracking-widest uppercase text-txt3 px-3 py-1.5 text-left">區域</th>
                      <th className="font-mono text-[9px] tracking-widest uppercase text-txt3 px-3 py-1.5 text-left">路線</th>
                      <th className="font-mono text-[9px] tracking-widest uppercase text-txt3 px-3 py-1.5 text-center">Top</th>
                      <th className="font-mono text-[9px] tracking-widest uppercase text-txt3 px-3 py-1.5 text-center">Zone</th>
                      <th className="font-mono text-[9px] tracking-widest uppercase text-txt3 px-3 py-1.5 text-left">狀態</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const s = STATUS_LABEL[r.status];
                      return (
                        <tr key={i} className={`border-b border-border/50 last:border-0 ${r.status === 'no_zone' || r.status === 'dup_zone' ? 'opacity-50' : ''}`}>
                          <td className="px-3 py-1.5 font-mono text-xs text-txt2">{r.zone_name}</td>
                          <td className="px-3 py-1.5 font-mono text-xs text-txt">{r.name}</td>
                          <td className="px-3 py-1.5 font-mono text-xs text-lime text-center">{r.top_score}</td>
                          <td className="px-3 py-1.5 font-mono text-xs text-cyan text-center">{r.zone_score}</td>
                          <td className="px-3 py-1.5 font-mono text-[10px]">
                            {s ? <span className={s.color}>{s.text}</span> : <span className="text-txt3">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end gap-2 flex-shrink-0">
          <button onClick={onClose} className="font-condensed font-bold text-xs tracking-widest uppercase border border-border text-txt3 px-5 py-2 rounded hover:border-txt3 hover:text-txt transition-colors">
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={toImport.length === 0 || importing}
            className="font-condensed font-bold text-xs tracking-widest uppercase border border-cyan/30 text-cyan px-5 py-2 rounded hover:bg-cyan hover:text-bg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {importing ? '匯入中...' : `匯入 ${toImport.length} 條路線`}
          </button>
        </div>
      </div>
    </div>
  );
}

function RouteRow({ route, editing, onEdit, onChange, onSave, onCancel, onDelete }) {
  if (editing) {
    return (
      <div className="px-4 py-3 grid gap-2 items-center bg-s2/20" style={{ gridTemplateColumns: '1fr 72px 72px auto auto' }}>
        <input
          type="text"
          value={route.name}
          onChange={e => onChange({ ...route, name: e.target.value })}
          onKeyDown={e => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel(); }}
          className="w-full bg-s2 border border-border2 rounded px-2.5 py-1.5 font-mono text-xs text-txt placeholder-txt3 focus:outline-none focus:border-cyan transition-colors"
          placeholder="路線名稱"
          autoFocus
        />
        <input
          type="number"
          value={route.top_score}
          onChange={e => onChange({ ...route, top_score: +e.target.value })}
          className="w-full bg-s2 border border-border2 rounded px-2 py-1.5 font-mono text-xs text-lime text-center focus:outline-none focus:border-lime transition-colors"
          placeholder="Top"
        />
        <input
          type="number"
          value={route.zone_score}
          onChange={e => onChange({ ...route, zone_score: +e.target.value })}
          className="w-full bg-s2 border border-border2 rounded px-2 py-1.5 font-mono text-xs text-cyan text-center focus:outline-none focus:border-cyan transition-colors"
          placeholder="Zone"
        />
        <button onClick={onSave} className="font-condensed font-bold text-[10px] tracking-widest uppercase text-lime border border-lime/40 rounded px-3 py-1.5 hover:bg-lime hover:text-bg transition-colors whitespace-nowrap">存</button>
        <button onClick={onCancel} className="font-condensed font-bold text-[10px] tracking-widest uppercase text-txt3 border border-border rounded px-3 py-1.5 hover:border-txt3 transition-colors whitespace-nowrap">取消</button>
      </div>
    );
  }

  return (
    <div className="px-4 py-2.5 flex items-center gap-3 hover:bg-s2/10 group">
      <span className="font-mono text-xs text-txt flex-1">{route.name}</span>
      <span className="font-mono text-[10px] text-lime">T: {route.top_score}</span>
      <span className="font-mono text-[10px] text-cyan">Z: {route.zone_score}</span>
      <button onClick={onEdit} className="opacity-0 group-hover:opacity-100 font-mono text-[10px] text-txt3 border border-border rounded px-2 py-0.5 transition-opacity">編輯</button>
      <button onClick={onDelete} className="opacity-0 group-hover:opacity-100 font-mono text-[10px] text-red border border-red/30 rounded px-2 py-0.5 transition-opacity">刪除</button>
    </div>
  );
}
