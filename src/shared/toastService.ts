export type ToastType = "success" | "error" | "info";

export const addToast = (type: ToastType, message: string, timeout: number = 4000): void => {
  window.dispatchEvent(new CustomEvent('toast', { detail: { type, message, timeout } }));
};
