import React, { useState, useEffect } from 'react';

export default function Toasts() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const handler = (e) => {
      const id = Date.now() + Math.random();
      const t = { id, ...e.detail };
      setToasts((s) => [...s, t]);
      setTimeout(() => setToasts((s) => s.filter((x) => x.id !== id)), t.timeout || 4000);
    };

    window.addEventListener('toast', handler);
    return () => window.removeEventListener('toast', handler);
  }, []);

  return (
    <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999 }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            marginBottom: 8,
            padding: '8px 12px',
            borderRadius: 4,
            backgroundColor: t.type === 'success' ? '#d4edda' : t.type === 'error' ? '#f8d7da' : '#cce5ff',
            color: t.type === 'success' ? '#155724' : t.type === 'error' ? '#721c24' : '#004085',
            boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
            minWidth: 200,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>{t.message}</div>
            <button
              onClick={() => setToasts((s) => s.filter((x) => x.id !== t.id))}
              style={{ marginLeft: 12, background: 'transparent', border: 'none', cursor: 'pointer' }}
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
