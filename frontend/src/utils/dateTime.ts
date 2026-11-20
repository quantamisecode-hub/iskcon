/** Date/time presentation helpers. Storage stays ISO (YYYY-MM-DD) and 24h (HH:MM). */

/** YYYY-MM-DD -> DD/MM/YYYY */
export function isoDateToDisplay(iso: string): string {
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) return '';
  return `${day}/${month}/${year}`;
}

/** DD/MM/YYYY -> YYYY-MM-DD, or null when invalid. */
export function displayDateToIso(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    return null;
  }
  return `${yyyy}-${mm}-${dd}`;
}

export function time24ToParts(time: string): { hour: string; minute: string; period: 'AM' | 'PM' } {
  const [hourRaw, minuteRaw] = time.split(':');
  const hour24 = Number(hourRaw ?? 0);
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { hour: String(hour12), minute: minuteRaw ?? '00', period: hour24 >= 12 ? 'PM' : 'AM' };
}

export function timePartsTo24(hour: string, minute: string, period: 'AM' | 'PM'): string {
  const hour12 = Number(hour) % 12;
  const hour24 = period === 'PM' ? hour12 + 12 : hour12;
  return `${String(hour24).padStart(2, '0')}:${minute}`;
}

/** HH:MM -> h:mm AM/PM */
export function formatTime12h(time: string): string {
  if (!time) return '—';
  const { hour, minute, period } = time24ToParts(time);
  return `${hour}:${minute} ${period}`;
}

/** ISO timestamp -> DD/MM/YYYY, hh:mm AM/PM in the configured time zone. */
export function formatDateTime12h(iso: string | null | undefined, timeZone: string, locale: string): string {
  const date = new Date(iso ?? Date.now());
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
    .format(date)
    .replace(/\b(am|pm)\b/gi, (meridiem) => meridiem.toUpperCase());
}

/** True when the event starts before the moment dispatch details were recorded. */
export function isEventBeforeDispatch(
  eventDateIso: string,
  startTime: string,
  dispatchAtIso: string,
  timeZoneOffsetMinutes: number,
): boolean {
  const [year, month, day] = eventDateIso.split('-').map(Number);
  const [hour, minute] = startTime.split(':').map(Number);
  const eventUtc =
    Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1, hour ?? 0, minute ?? 0) - timeZoneOffsetMinutes * 60 * 1000;
  return eventUtc < new Date(dispatchAtIso).getTime();
}
