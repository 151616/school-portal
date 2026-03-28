import { useState, useEffect } from 'react';
import { CheckIcon, AlertIcon } from './icons';
import type { ToastType } from './toastService';

interface Toast {
  id: number;
  type?: ToastType;
  message: string;
  timeout?: number;
}

export default function Toasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const handler = (e: Event) => {
      const id = Date.now() + Math.random();
      const t: Toast = { id, ...(e as CustomEvent).detail };
      setToasts((s) => [...s, t]);
      setTimeout(() => setToasts((s) => s.filter((x) => x.id !== id)), t.timeout || 4000);
    };

    window.addEventListener('toast', handler);
    return () => window.removeEventListener('toast', handler);
  }, []);

  return (
    <div className="toasts-container" aria-live="polite" aria-atomic="true">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type || 'info'}`}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {t.type === 'success' && <CheckIcon className="icon" aria-hidden style={{ marginRight: 8 }} />}
              {t.type === 'error' && <AlertIcon className="icon" aria-hidden style={{ marginRight: 8 }} />}
              <div>{t.message}</div>
            </div>
            <button className="btn btn-ghost toast-close" onClick={(e) => { const b = e.currentTarget; b.classList.add('pulse'); setTimeout(() => b.classList.remove('pulse'), 260); setToasts((s) => s.filter((x) => x.id !== t.id)); }} aria-label="Dismiss">×</button>
          </div>
        </div>
      ))}
    </div>
  );
}
