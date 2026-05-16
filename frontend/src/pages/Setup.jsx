import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { eventsAPI } from '../api';
import { useToast } from '../components/Toast';

export default function Setup() {
  const { id, catId } = useParams();
  const toast = useToast();
  const [event, setEvent] = useState(null);
  const [cat, setCat] = useState(null);
  const [boulders, setBoulders] = useState([]);
  const [finalQuota, setFinalQuota] = useState(0);
  const [resizing, setResizing] = useState(false);

  useEffect(() => {
    Promise.all([eventsAPI.get(id), eventsAPI.getCategories(id)]).then(([ev, cl]) => {
      setEvent(ev.data);
      const found = cl.data.find(c => String(c.id) === String(catId));
      if (!found) return;
      setCat(found);
      setFinalQuota(found.final_quota || 0);
    });
  }, [id, catId]);

  useEffect(() => {
    if (!catId) return;
    eventsAPI.getBoulders(id, catId).then(res => setBoulders(res.data)).catch(() => {});
  }, [id, catId]);

  const handleResize = async (count) => {
    if (boulders.length === count) return;
    setResizing(true);
    try {
      const res = await eventsAPI.resizeBoulders(id, count, catId);
      setBoulders(res.data);
      toast(`決賽路線數更新為 ${count} 題`);
    } catch (err) {
      toast(err.response?.data?.error || '更新失敗', 'error');
    } finally {
      setResizing(false);
    }
  };

  const handleLabelChange = (bId, label) => {
    setBoulders(prev => prev.map(b => b.id === bId ? { ...b, label } : b));
  };

  const handleSaveLabel = async (b) => {
    try {
      await eventsAPI.updateBoulder(id, b.id, { label: b.label });
      toast('已儲存');
    } catch {
      toast('儲存失敗', 'error');
    }
  };

  const handleSaveQuota = async () => {
    try {
      await eventsAPI.updateCategory(id, catId, { final_quota: finalQuota });
      toast('晉級人數已儲存');
    } catch {
      toast('儲存失敗', 'error');
    }
  };

  if (!event || !cat) return <Layout><div className="text-txt3 font-mono py-16 text-center">載入中...</div></Layout>;

  return (
    <Layout>
      <div className="flex items-center gap-2 mb-6 text-txt3 font-mono text-xs">
        <Link to="/events" className="hover:text-txt transition-colors">比賽列表</Link>
        <span>/</span>
        <Link to={`/events/${id}`} className="hover:text-txt transition-colors">{event.name}</Link>
        <span>/</span>
        <Link to={`/events/${id}/categories/${catId}`} className="hover:text-txt transition-colors">{cat.name}</Link>
        <span>/</span>
        <span className="text-txt">決賽設定</span>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: cat.color }} />
        <div className="font-condensed font-black text-2xl tracking-widest uppercase" style={{ color: cat.color }}>
          {cat.name}
        </div>
        <span className="font-mono text-xs text-txt3 border border-border rounded px-2 py-0.5">決賽</span>
      </div>

      <div className="space-y-4">
        {/* Final boulders */}
        <div className="bg-s1 border border-border rounded-lg p-6">
          <div className="font-mono text-[10px] tracking-widest uppercase text-txt3 mb-4">決賽路線設定</div>

          <div className="flex items-center gap-2 mb-4 pb-4 border-b border-border">
            <span className="font-mono text-[10px] tracking-widest uppercase text-txt3 whitespace-nowrap">路線數</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                <button
                  key={n}
                  disabled={resizing}
                  onClick={() => handleResize(n)}
                  className={`w-7 h-7 rounded font-mono font-bold text-xs transition-colors disabled:opacity-50 ${
                    boulders.length === n
                      ? 'bg-lime text-bg'
                      : 'bg-s3 text-txt3 hover:bg-border2 hover:text-txt'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5">
            {boulders.length === 0 && (
              <div className="font-mono text-xs text-txt3 text-center py-6">尚無路線，請先選擇路線數</div>
            )}
            {boulders.map((b, i) => (
              <div key={b.id} className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-s3 flex items-center justify-center font-mono font-bold text-xs text-txt3 flex-shrink-0">
                  {i + 1}
                </div>
                <input
                  type="text"
                  value={b.label}
                  onChange={e => handleLabelChange(b.id, e.target.value)}
                  onBlur={() => handleSaveLabel(b)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveLabel(b)}
                  className="flex-1"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Final quota */}
        <div className="bg-s1 border border-border rounded-lg p-6">
          <div className="font-mono text-[10px] tracking-widest uppercase text-txt3 mb-4">晉級人數</div>
          <div className="flex gap-3 items-end flex-wrap">
            <div>
              <label className="block font-mono text-[9px] tracking-widest uppercase text-txt3 mb-1">晉決賽人數</label>
              <input
                type="number" min={0} className="w-24 text-sm py-1.5"
                value={finalQuota}
                onChange={e => setFinalQuota(Math.max(0, +e.target.value || 0))}
              />
            </div>
            <button
              onClick={handleSaveQuota}
              className="border border-border2 text-txt2 font-condensed font-bold text-xs tracking-widest uppercase px-3 py-1.5 rounded hover:border-lime hover:text-lime transition-colors"
            >
              儲存
            </button>
            <div className="font-mono text-[9px] text-txt3">0 = 不限制</div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
