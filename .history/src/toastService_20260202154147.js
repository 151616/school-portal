export const addToast = (type, message, timeout = 4000) => {
  window.dispatchEvent(new CustomEvent('toast', { detail: { type, message, timeout } }));
};
