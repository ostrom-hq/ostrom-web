// SPDX-License-Identifier: AGPL-3.0-only
import { formatAbsolute, formatRelative } from '@/shared/lib/time';

const now = new Date('2026-10-30T08:00:00.000Z');

describe('formatRelative', () => {
  it.each([
    ['2026-10-30T07:59:30.000Z', '30 sec. ago'],
    ['2026-10-30T07:55:00.000Z', '5 min. ago'],
    ['2026-10-30T05:00:00.000Z', '3 hr. ago'],
    ['2026-10-28T08:00:00.000Z', '2 days ago'],
    ['2026-10-09T08:00:00.000Z', '3 wk. ago'],
    ['2026-07-30T08:00:00.000Z', '3 mo. ago'],
    ['2024-10-30T08:00:00.000Z', '2 yr. ago'],
  ])('says %s as %s', (iso, expected) => {
    expect(formatRelative(iso, now, 'en')).toBe(expected);
  });

  it('speaks the viewer language', () => {
    expect(formatRelative('2026-10-30T07:55:00.000Z', now, 'fr')).toMatch(/^il y a\s5\smin$/);
  });
});

describe('formatAbsolute', () => {
  it('shows the date, the time and the time zone', () => {
    expect(formatAbsolute('2026-10-30T08:04:31.000Z', 'en')).toMatch(
      /^Oct 30, 2026, \d{1,2}:04\s[AP]M\s\S+$/,
    );
  });

  it('shows an unreadable date as it came instead of throwing', () => {
    expect(formatRelative('soon', now, 'en')).toBe('soon');
    expect(formatAbsolute('', 'en')).toBe('');
  });

  it('rolls 59.6 s over to the next unit', () => {
    expect(formatRelative('2026-10-30T08:00:59.600Z', now, 'en')).toBe('in 1 min.');
  });
});
