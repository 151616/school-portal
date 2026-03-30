// src/utils/dateUtils.ts

/**
 * Format a Date as YYYY-MM-DD string.
 */
export const toISODate = (date: Date): string => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

/**
 * Return an array of YYYY-MM-DD strings for the most recent N days (today first).
 */
export const getRecentDates = (days = 7): string[] => {
  const list: string[] = [];
  const today = new Date();
  for (let i = 0; i < days; i += 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    list.push(toISODate(d));
  }
  return list;
};

/**
 * Format a timestamp as a relative time string ("2m ago", "3d ago", etc.).
 */
export const formatRelativeTime = (ts: number | undefined): string => {
  if (!ts) return "";

  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;

  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;

  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;

  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;

  return new Date(ts).toLocaleDateString();
};

/**
 * Format a timestamp for audit log display.
 */
export const formatAuditTime = (ts: number | undefined): string => {
  if (!ts) return "Unknown time";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
};
