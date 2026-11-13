// SPDX-License-Identifier: Apache-2.0
import type { SpendingLine } from '@gen/api/types.gen';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { formatUsd } from '@/shared/lib/money';
import { useStep } from '@/shared/lib/useStep';
import { Section } from '@/shared/ui/Screen';
import { ShowMore } from '@/shared/ui/ShowMore';
import { shares } from '../model';

/** How many lines a dimension shows at first: the largest; the others on demand (PERF-CONSOLE). */
export const BREAKDOWN_STEP = 20;

/** One spending dimension, largest first as the server sends it, each bar to the scale of the largest. */
export function Breakdown({
  label,
  lines,
}: {
  readonly label: string;
  readonly lines: readonly SpendingLine[];
}): ReactElement {
  const { t, i18n } = useTranslation();
  const step = useStep(lines.length, '', BREAKDOWN_STEP);
  return (
    <Section label={label}>
      {lines.length === 0 ? (
        <p className="o-empty">{t('spend.nothing')}</p>
      ) : (
        <ul className="o-card o-rows">
          {shares(lines.slice(0, step.count)).map(({ line, share }) => (
            <li key={line.key} className="o-row sp-line">
              <span className="o-row__main">
                <span className="o-row__title">{line.label}</span>
                <span className="o-row__meta">{t('spend.sessions', { count: line.sessions })}</span>
                <span className="sp-bar" aria-hidden="true">
                  <span style={{ inlineSize: `${String(Math.round(share * 100))}%` }} />
                </span>
              </span>
              <span className="sp-usd">{formatUsd(line.usd, i18n.language)}</span>
            </li>
          ))}
        </ul>
      )}
      <ShowMore step={step} />
    </Section>
  );
}
