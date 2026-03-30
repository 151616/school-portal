import { useEffect, useState } from "react";
import { AlertIcon, CheckIcon } from "@/shared/icons";
import type { ToastType } from "@/shared/toastService";

interface Toast {
  id: number;
  type?: ToastType;
  message: string;
  timeout?: number;
}

export default function Toasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const handler = (event: Event) => {
      const id = Date.now() + Math.random();
      const toast: Toast = { id, ...(event as CustomEvent).detail };
      setToasts((state) => [...state, toast]);
      setTimeout(() => {
        setToasts((state) => state.filter((item) => item.id !== id));
      }, toast.timeout || 4000);
    };

    window.addEventListener("toast", handler);
    return () => window.removeEventListener("toast", handler);
  }, []);

  return (
    <div className="toasts-container" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.type || "info"}`}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              {toast.type === "success" && (
                <CheckIcon className="icon" aria-hidden style={{ marginRight: 8 }} />
              )}
              {toast.type === "error" && (
                <AlertIcon className="icon" aria-hidden style={{ marginRight: 8 }} />
              )}
              <div>{toast.message}</div>
            </div>
            <button
              className="btn btn-ghost toast-close"
              onClick={(event) => {
                const button = event.currentTarget;
                button.classList.add("pulse");
                setTimeout(() => button.classList.remove("pulse"), 260);
                setToasts((state) => state.filter((item) => item.id !== toast.id));
              }}
              aria-label="Dismiss"
            >
              x
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
