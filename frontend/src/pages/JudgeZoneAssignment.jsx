import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { eventsAPI, usersAPI } from '../api';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import ConfirmModal from '../components/ConfirmModal';

export default function JudgeZoneAssignment() {
  const { id } = useParams();
  const { isSuperadmin } = useAuth();
  const toast = useToast();
  const [event, setEvent] = useState(null);
  const [zones, setZones] = useState([]);
  const [judges, setJudges] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [modal, setModal] = useState(null);
  const [newCredentials, setNewCredentials] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);

  const load = async () => {
    const [ev, zl, jl, al] = await Promise.all([
      eventsAPI.get(id),
      eventsAPI.getZones(id),
      usersAPI.listJudges(),
      eventsAPI.getJudgeZones(id),
    ]);
    setEvent(ev.data);
    setZones(zl.data);
    setJudges(jl.data);
    setAssignments(al.data);
  };

  useEffect(() => { load(); }, [id]);

  // Returns assigned zone ids for a judge in this event
  const getJudgeZoneIds = (judgeId) =>
    assignments.filter(a => a.user_id === judgeId).map(a => a.zone_id);

  const handleToggleAssignment = async (judgeId, zoneId) => {
    const current = getJudgeZoneIds(judgeId);
    const newZoneIds = current.includes(zoneId)
      ? current.filter(z => z !== zoneId)
      : [...current, zoneId];

    try {
      await eventsAPI.saveJudgeZones(id, { user_id: judgeId, zone_ids: newZoneIds });
      const res = await eventsAPI.getJudgeZones(id);
      setAssignments(res.data);
    } catch {
      toast('儲存失敗', 'error');
    }
  };

  // Judge CRUD
  const handleCreateJudge = async () => {
    try {
      const res = await usersAPI.createJudge({ event_id: id });
      setModal(null);
      setNewCredentials({ username: res.data.username, password: res.data.password_plain });
      const jl = await usersAPI.listJudges();
      setJudges(jl.data);
    } catch (err) {
      toast(err.response?.data?.error || '建立失敗', 'error');
    }
  };

  const handleSetPassword = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await usersAPI.setJudgePassword(modal.data.id, fd.get('password'));
      toast('密碼已更新');
      setModal(null);
    } catch {
      toast('更新失敗', 'error');
    }
  };

  const handleToggleActive = async (judge) => {
    try {
      await usersAPI.toggleJudgeActive(judge.id, !judge.active);
      const res = await usersAPI.listJudges();
      setJudges(res.data);
      toast(judge.active ? '帳號已停用' : '帳號已啟用');
    } catch {
      toast('操作失敗', 'error');
    }
  };

  const handleDeleteJudge = (judge) => {
    setConfirmModal({
      message: `刪除裁判「${judge.username}」？`,
      confirmLabel: '刪除',
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          await usersAPI.deleteJudge(judge.id);
          const res = await usersAPI.listJudges();
          setJudges(res.data);
          const al = await eventsAPI.getJudgeZones(id);
          setAssignments(al.data);
          toast('已刪除');
        } catch {
          toast('刪除失敗', 'error');
        }
      },
    });
  };

  if (!event) return <Layout><div className="text-txt3 font-mono py-16 text-center">載入中...</div></Layout>;

  return (
    <Layout>
      <div className="flex items-center gap-2 mb-6 text-txt3 font-mono text-xs">
        <Link to="/events" className="hover:text-txt transition-colors">比賽列表</Link>
        <span>/</span>
        <Link to={`/events/${id}`} className="hover:text-txt transition-colors">{event.name}</Link>
        <span>/</span>
        <span className="text-txt">裁判帳號 / 區域指派</span>
      </div>

      <div className="font-condensed font-black text-2xl tracking-widest uppercase text-cyan mb-6">{event.name}</div>

      {/* Judge list + zone assignment */}
      <div className="space-y-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="font-condensed font-bold text-sm tracking-widest uppercase text-txt3">裁判帳號</div>
          <button
            onClick={handleCreateJudge}
            className="border border-cyan/30 text-cyan font-condensed font-bold text-xs tracking-widest uppercase px-4 py-2 rounded hover:bg-cyan hover:text-bg transition-colors"
          >
            ＋ 新增裁判
          </button>
        </div>

        {judges.length === 0 && (
          <div className="bg-s1 border border-border rounded-lg p-8 text-center text-txt3 font-mono text-xs">
            尚無裁判帳號
          </div>
        )}

        {judges.map(judge => {
          const judgeZoneIds = getJudgeZoneIds(judge.id);
          return (
            <div key={judge.id} className="bg-s1 border border-border rounded-lg p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-txt">{judge.username}</span>
                    <span className={`font-mono text-[10px] px-2 py-0.5 rounded border ${judge.active ? 'border-cyan/30 text-cyan' : 'border-border text-txt3'}`}>
                      {judge.active ? '啟用' : '停用'}
                    </span>
                  </div>
                  {judge.organizer_username && (
                    <div className="font-mono text-[10px] text-txt3 mt-0.5">隸屬：{judge.organizer_username}</div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setModal({ type: 'resetPw', data: judge })}
                    className="font-mono text-[10px] text-txt3 border border-border rounded px-2.5 py-1 hover:border-txt3 hover:text-txt transition-colors">
                    重設密碼
                  </button>
                  <button
                    onClick={() => handleToggleActive(judge)}
                    className={`font-mono text-[10px] border rounded px-2.5 py-1 transition-colors ${
                      judge.active
                        ? 'border-red/30 text-red hover:bg-red hover:text-white'
                        : 'border-cyan/30 text-cyan hover:bg-cyan hover:text-bg'
                    }`}>
                    {judge.active ? '停用' : '啟用'}
                  </button>
                  <button onClick={() => handleDeleteJudge(judge)}
                    className="font-mono text-[10px] text-red border border-red/30 rounded px-2.5 py-1 hover:bg-red hover:text-white transition-colors">
                    刪除
                  </button>
                </div>
              </div>

              {/* Zone assignment for this event */}
              {zones.length > 0 ? (
                <div>
                  <div className="font-mono text-[10px] tracking-widest uppercase text-txt3 mb-2">指派區域（此比賽）</div>
                  <div className="flex gap-2 flex-wrap">
                    {zones.map(zone => {
                      const assigned = judgeZoneIds.includes(zone.id);
                      return (
                        <button
                          key={zone.id}
                          onClick={() => handleToggleAssignment(judge.id, zone.id)}
                          className={`font-mono text-xs px-3 py-1.5 rounded border transition-colors ${
                            assigned
                              ? 'bg-cyan/20 border-cyan text-cyan'
                              : 'border-border text-txt3 hover:border-border2 hover:text-txt'
                          }`}
                        >
                          {zone.name}
                          {assigned && ' ✓'}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="font-mono text-[10px] text-txt3">尚未建立區域，請先至「區域 / 路線管理」新增。</div>
              )}
            </div>
          );
        })}
      </div>

      {/* New credentials modal */}
      {newCredentials && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-s1 border border-border rounded-xl p-7 w-[400px]">
            <div className="font-condensed font-bold text-sm tracking-widest uppercase text-lime mb-5">裁判帳號已建立</div>
            <div className="space-y-3 mb-6">
              <div>
                <div className="font-mono text-[10px] tracking-widest uppercase text-txt3 mb-1">帳號</div>
                <div className="bg-bg border border-border rounded-lg px-4 py-2.5 font-mono text-sm text-lime tracking-wider">{newCredentials.username}</div>
              </div>
              <div>
                <div className="font-mono text-[10px] tracking-widest uppercase text-txt3 mb-1">預設密碼</div>
                <div className="bg-bg border border-border rounded-lg px-4 py-2.5 font-mono text-sm text-cyan tracking-widest">{newCredentials.password}</div>
              </div>
            </div>
            <div className="text-txt3 font-mono text-[11px] mb-5">請將帳號密碼交給裁判，密碼可於之後重設。</div>
            <div className="flex justify-end">
              <button onClick={() => setNewCredentials(null)}
                className="font-condensed font-bold text-[11px] tracking-widest uppercase border border-lime/30 text-lime px-5 py-2 rounded hover:bg-lime hover:text-bg transition-colors">
                確認
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset password modal */}
      {modal?.type === 'resetPw' && (
        <Modal title={`重設密碼 — ${modal.data.username}`} onClose={() => setModal(null)}>
          <form onSubmit={handleSetPassword} className="space-y-4">
            <Field label="新密碼">
              <input name="password" type="password" required placeholder="輸入新密碼" className={inputCls} autoFocus />
            </Field>
            <ModalFooter onClose={() => setModal(null)} submitLabel="確認更新" />
          </form>
        </Modal>
      )}

      {confirmModal && (
        <ConfirmModal
          message={confirmModal.message}
          note={confirmModal.note}
          confirmLabel={confirmModal.confirmLabel}
          onConfirm={confirmModal.onConfirm}
          onClose={() => setConfirmModal(null)}
        />
      )}
    </Layout>
  );
}

const inputCls = 'w-full bg-s2 border border-border2 rounded px-3 py-2 font-mono text-sm text-txt placeholder-txt3 focus:outline-none focus:border-cyan transition-colors';

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-s1 border border-border rounded-xl p-7 w-[440px] max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="font-condensed font-bold text-sm tracking-widest uppercase text-cyan mb-5">{title}</div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block font-mono text-[10px] tracking-widest uppercase text-txt3 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function ModalFooter({ onClose, submitLabel }) {
  return (
    <div className="flex justify-end gap-2 pt-4 border-t border-border">
      <button type="button" onClick={onClose}
        className="font-condensed font-bold text-[11px] tracking-widest uppercase border border-border text-txt3 px-5 py-2 rounded hover:border-txt3 hover:text-txt transition-colors">
        取消
      </button>
      <button type="submit"
        className="font-condensed font-bold text-[11px] tracking-widest uppercase border border-cyan/30 text-cyan px-5 py-2 rounded hover:bg-cyan hover:text-bg transition-colors">
        {submitLabel}
      </button>
    </div>
  );
}
