/**
 * Display helpers for the dashboard. All "today"/time math uses Asia/Kolkata
 * wall-clock so SSR-less client rendering matches server data.
 */

export function dateLine(): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatShortDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return `${day} ${MONTHS_SHORT[(month ?? 1) - 1]} ${year}`;
}

export function formatWeekdayShort(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(year ?? 2026, (month ?? 1) - 1, day ?? 1, 12);
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric' }).format(date);
}

export function formatClockIST(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** "25 KG" — whole numbers stay clean, decimals get trimmed. */
export function formatQuantity(value: number, unit: string): string {
  const rounded = Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000);
  return `${rounded} ${unit}`;
}
