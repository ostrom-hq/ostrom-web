// SPDX-License-Identifier: AGPL-3.0-only
import type { SpendingDay } from '@gen/api/types.gen';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { formatUsd } from '@/shared/lib/money';
import { Section } from '@/shared/ui/Screen';

/** The day in full for a screen reader, and its weekday for the column; a date it cannot read is shown as is. */
function dayLabels(date: string, locale: string): { readonly full: string; readonly short: string } {
  const parsed = Date.parse(`${date}T12:00:00Z`);
  if (!Number.isFinite(parsed)) return { full: date, short: date };
  const format = (options: Intl.DateTimeFormatOptions): string =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(parsed);
  return {
    full: format({ weekday: 'short', month: 'short', day: 'numeric' }),
    short: format({ weekday: 'narrow' }),
  };
}

/** The last days as columns to one scale; each column is a list item a screen reader reads as day and amount. */
export function DailySpend({ days }: { readonly days: readonly SpendingDay[] }): ReactElement | null {
  const { t, i18n } = useTranslation();
  if (days.length === 0) return null;
  const largest = Math.max(...days.map((day) => day.usd));
  return (
    <Section label={t('spend.daily')}>
      <ol className="o-card sp-days">
        {days.map((day) => {
          const label = dayLabels(day.date, i18n.language);
          const amount = formatUsd(day.usd, i18n.language);
          return (
            <li key={day.date} aria-label={`${label.full} · ${amount}`}>
              <span className="sp-day__bar" aria-hidden="true">
                <span
                  style={{
                    blockSize: `${String(largest <= 0 ? 0 : Math.round((day.usd / largest) * 100))}%`,
                  }}
                />
              </span>
              <span className="sp-day__label" aria-hidden="true">
                {label.short}
              </span>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}
