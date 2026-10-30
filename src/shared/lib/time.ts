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

export function formatClock(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(
    new Date(iso),
  );
}
