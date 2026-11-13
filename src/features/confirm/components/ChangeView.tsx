// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { changedKeys, jsonLines } from '../model';

export interface ChangeViewProps {
  readonly before: unknown;
  readonly after: unknown;
}

/** Before and after side by side on a desk, stacked on a phone, the keys that change marked on both sides. */
export function ChangeView({ before, after }: ChangeViewProps): ReactElement {
  const { t } = useTranslation();
  const keys = changedKeys(before, after);
  return (
    <section className="o-card ys-section" aria-labelledby="cf-change">
      <h2 id="cf-change" className="ys-label">
        {t('confirm.change.title')}
      </h2>
      {keys.length === 0 ? null : (
        <p className="ys-small ys-meta">
          {t('confirm.change.keys', { count: keys.length, keys: keys.join(', ') })}
        </p>
      )}
      <div className="cf-diff">
        <Side
          side="before"
          label={t('confirm.change.before')}
          nothing={t('confirm.change.nothingBefore')}
          value={before}
          other={after}
        />
        <Side
          side="after"
          label={t('confirm.change.after')}
          nothing={t('confirm.change.nothingAfter')}
          value={after}
          other={before}
        />
      </div>
    </section>
  );
}

interface SideProps {
  readonly side: 'before' | 'after';
  readonly label: string;
  /** What `null` means on this side: nothing yet (a creation), nothing left (a deletion). */
  readonly nothing: string;
  readonly value: unknown;
  readonly other: unknown;
}

/** One side as indented JSON; a changed line is a deletion before and an insertion after, not only a colour. */
function Side({ side, label, nothing, value, other }: SideProps): ReactElement {
  const Changed = side === 'before' ? 'del' : 'ins';
  return (
    <figure className={`cf-side cf-side--${side}`} aria-label={label}>
      <figcaption className="cf-side__label">{label}</figcaption>
      {value === null || value === undefined ? (
        <p className="cf-nothing">{nothing}</p>
      ) : (
        <pre className="cf-json">
          <code>
            {jsonLines(value, other).map((line, index) =>
              line.changed ? (
                <Changed key={index} className="cf-line cf-line--changed">
                  {line.text}
                </Changed>
              ) : (
                <span key={index} className="cf-line">
                  {line.text}
                </span>
              ),
            )}
          </code>
        </pre>
      )}
    </figure>
  );
}
