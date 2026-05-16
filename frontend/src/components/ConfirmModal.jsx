export default function ConfirmModal({ title, message, note, confirmLabel = '確認', danger = true, onConfirm, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-s1 border border-border2 rounded-lg p-7 max-w-xs w-full text-center" onClick={e => e.stopPropagation()}>
        {title && (
          <p className="font-condensed font-bold text-base tracking-widest uppercase text-txt mb-3">{title}</p>
        )}
        <p className="text-txt text-sm leading-relaxed mb-1">{message}</p>
        {note && <p className="text-txt3 font-mono text-xs mb-6">{note}</p>}
        <div className={`grid gap-3 mt-6 ${note || title ? '' : 'mt-6'} grid-cols-2`}>
          <button
            onClick={onConfirm}
            className={`py-2.5 font-condensed font-bold text-xs tracking-widest uppercase rounded transition-colors ${
              danger
                ? 'bg-red/80 text-white hover:bg-red'
                : 'bg-lime text-bg hover:bg-[#b5de25]'
            }`}
          >
            {confirmLabel}
          </button>
          <button
            onClick={onClose}
            className="py-2.5 border border-border2 text-txt2 font-condensed font-bold text-xs tracking-widest uppercase rounded hover:border-txt2 transition-colors"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
