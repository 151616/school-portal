import React from 'react';

export default function ConfirmModal({ open, title = 'Confirm', description = '', onCancel, onConfirm }) {
  if (!open) return null;
  return (
    <div className="modal-overlay">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h4 id="modal-title">{title}</h4>
        <div className="small">{description}</div>
        <div style={{ height: 12 }} />
        <div className="actions" style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onCancel} style={{ marginRight: 8 }}>Cancel</button>
          <button className="btn btn-primary" onClick={onConfirm}>Confirm</button>
        </div>
      </div>
    </div>
  );
}
