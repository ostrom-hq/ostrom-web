// SPDX-License-Identifier: AGPL-3.0-only
import type { SpendingLine } from '@gen/api/types.gen';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { formatUsd } from '@/shared/lib/money';
import { Section } from '@/shared/ui/Screen';
import { shares } from '../model';

/** One spending dimension, largest first as the server sends it, each bar to the scale of the largest. */
export function Breakdown({
  label,
  lines,
}: {
  readonly label: string;
  readonly lines: readonly SpendingLine[];
}): ReactElement {
  const { t, i18n } = useTranslation();
  return (
    <Section label={label}>
      {lines.length === 0 ? (
        <p className="o-empty">{t('spend.nothing')}</p>
      ) : (
        <ul className="o-card o-rows">
          {shares(lines).map(({ line, share }) => (
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
    </Section>
  );
}
