interface ConfirmModalProps {
  open: boolean;
  title?: string;
  description?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function ConfirmModal({ open, title = 'Confirm', description = '', onCancel, onConfirm }: ConfirmModalProps) {
  if (!open) return null;
  return (
    <div className="modal-overlay">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h4 id="modal-title">{title}</h4>
        <div className="small">{description}</div>
        <div style={{ height: 12 }} />
        <div className="actions" style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={(e) => { const b = e.currentTarget; b.classList.add('pulse'); setTimeout(() => b.classList.remove('pulse'), 260); onCancel(); }} style={{ marginRight: 8 }}>Cancel</button>
          <button className="btn btn-primary" onClick={(e) => { const b = e.currentTarget; b.classList.add('pulse'); setTimeout(() => b.classList.remove('pulse'), 260); onConfirm(); }}>Confirm</button>
        </div>
      </div>
    </div>
  );
}
