// SPDX-License-Identifier: AGPL-3.0-only
const UNITS: readonly (readonly [Intl.RelativeTimeFormatUnit, number])[] = [
  ['second', 60],
  ['minute', 60],
  ['hour', 24],
  ['day', 7],
  ['week', 4.35],
  ['month', 12],
];

/** "3 min ago", "il y a 3 min": the largest unit under its limit (years past that), in the viewer's language. */
export function formatRelative(iso: string, now: Date, locale: string): string {
  const at = Date.parse(iso);
  // A date the server sent unreadable is shown as it came, never thrown: one bad row must not blank the queue.
  if (!Number.isFinite(at)) return iso;
  let value = (at - now.getTime()) / 1000;
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
  for (const [unit, limit] of UNITS) {
    const rounded = Math.round(value);
    if (Math.abs(rounded) < limit) return format.format(rounded, unit);
    value /= limit;
  }
  return format.format(Math.round(value), 'year');
}

/** "Oct 30, 2026, 2:02 PM CET": an absolute time always carries its time zone. */
export function formatAbsolute(iso: string, locale: string): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return iso;
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(at));
}
