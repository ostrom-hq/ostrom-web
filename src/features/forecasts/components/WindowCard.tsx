// SPDX-License-Identifier: Apache-2.0
import type { ForecastWindow } from '@gen/api/types.gen';
import type { ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { formatAbsolute } from '@/shared/lib/time';
import { Facts } from '@/shared/ui/Screen';
import { etaOf, stateOf } from '../model';
import { ForecastChart } from './ForecastChart';

export interface WindowCardProps {
  readonly window: ForecastWindow;
  readonly now: string;
  readonly threshold: number;
}

/** TeamCode's forecast card: one provider window, its state in words, its chart and what was learned of it. */
export function WindowCard({ window, now, threshold }: WindowCardProps): ReactElement {
  const { t, i18n } = useTranslation();
  const state = stateOf(window);
  const percent = new Intl.NumberFormat(i18n.language, { style: 'percent', maximumFractionDigits: 1 });
  const decimal = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 });
  const unknown = t('forecasts.card.unknown');
  const eta = etaOf(window);
  let etaText: string;
  switch (eta.kind) {
    case 'reset-first':
      etaText = t('forecasts.card.eta.resetFirst');
      break;
    case 'already':
      etaText = t('forecasts.card.eta.already');
      break;
    case 'at':
      etaText = t('forecasts.card.eta.at', { when: formatAbsolute(eta.at, i18n.language) });
      break;
    case 'unknown':
      etaText = unknown;
      break;
  }
  const rate = window.pointsPerHour;
  return (
    <section className="o-card fc-card" aria-label={window.window} data-state={state}>
      <h2 className="fc-card__title o-mono">{window.window}</h2>
      <p className="fc-card__state">
        <strong>{t(`forecasts.state.${state}`)}</strong>
        {' · '}
        {t('forecasts.card.observed', { value: percent.format(window.utilization) })}
      </p>
      <ForecastChart window={window} now={now} threshold={threshold} />
      <Facts
        facts={[
          {
            label: t('forecasts.card.latest'),
            value: formatAbsolute(window.observedAt, i18n.language),
          },
          {
            label: t('forecasts.card.reset'),
            value: window.resetsAt === undefined ? unknown : formatAbsolute(window.resetsAt, i18n.language),
          },
          {
            label: t('forecasts.card.speed'),
            value:
              rate === undefined
                ? unknown
                : rate === 0
                  ? t('forecasts.card.idle')
                  : t('forecasts.card.rate', { value: decimal.format(rate) }),
          },
          { label: t('forecasts.card.eta.label'), value: etaText },
          {
            label: t('forecasts.card.learning'),
            value: t('forecasts.card.samples', {
              count: window.learningSamples,
              seconds: decimal.format(Math.floor(window.learningSpanMillis / 1000)),
            }),
          },
        ]}
      />
    </section>
  );
}
