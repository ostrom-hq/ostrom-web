// SPDX-License-Identifier: AGPL-3.0-only
import type { BillingOverview } from '@gen/api/types.gen';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { formatAbsolute } from '@/shared/lib/time';
import { Facts, Section } from '@/shared/ui/Screen';
import { hoursLevel } from '../model';

/** The period's cloud agent hours against the plan, then who counts: active people are what Team and Business bill. */
export function Usage({ billing }: { readonly billing: BillingOverview }): ReactElement {
  const { t, i18n } = useTranslation();
  const { usage, limits } = billing;
  const max = limits.agentHoursPerPeriod;
  // The server gives the share with an hour limit, and null without one.
  const percent = usage.percentOfHours ?? 0;
  return (
    <Section label={t('billing.usage.label')}>
      <p className="o-row__meta">
        {t('billing.usage.range', {
          from: formatAbsolute(billing.periodStart, i18n.language),
          to: formatAbsolute(billing.periodEnd, i18n.language),
        })}
      </p>
      {max === null ? (
        <p className="bl-figure">{t('billing.usage.hoursUnlimited', { count: usage.agentHours })}</p>
      ) : (
        <>
          <p className="bl-figure">{t('billing.usage.hours', { count: usage.agentHours, max })}</p>
          <div
            className={`bl-meter bl-meter--${hoursLevel(percent)}`}
            role="meter"
            aria-label={t('billing.usage.meter')}
            aria-valuemin={0}
            aria-valuemax={max}
            aria-valuenow={Math.min(usage.agentHours, max)}
            aria-valuetext={t('billing.usage.hours', { count: usage.agentHours, max })}
          >
            <span style={{ inlineSize: `${String(Math.min(100, Math.round(percent)))}%` }} />
          </div>
        </>
      )}
      <Facts
        facts={[
          { label: t('billing.usage.sessions'), value: usage.sessions },
          {
            label: t('billing.usage.people'),
            value:
              limits.maxPeople === null
                ? billing.activePeople
                : t('billing.usage.peopleOf', { count: billing.activePeople, max: limits.maxPeople }),
          },
          billing.committedPeople > 0
            ? { label: t('billing.usage.committed'), value: billing.committedPeople }
            : undefined,
        ]}
      />
    </Section>
  );
}
