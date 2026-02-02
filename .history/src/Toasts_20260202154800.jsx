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
    <div className="toasts-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type || 'info'}`}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>{t.message}</div>
            <button onClick={() => setToasts((s) => s.filter((x) => x.id !== t.id))}>×</button>
          </div>
        </div>
      ))}
    </div>
  );
}
