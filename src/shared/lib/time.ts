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
  let value = (Date.parse(iso) - now.getTime()) / 1000;
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
  for (const [unit, limit] of UNITS) {
    if (Math.abs(value) < limit) return format.format(Math.round(value), unit);
    value /= limit;
  }
  return format.format(Math.round(value), 'year');
}

/** "Oct 30, 2026, 2:02 PM CET": an absolute time always carries its time zone. */
export function formatAbsolute(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(iso));
}
