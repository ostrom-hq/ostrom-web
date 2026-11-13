// SPDX-License-Identifier: Apache-2.0
import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from './Banner';
import { Skeleton } from './Skeleton';

export interface ScreenProps {
  readonly title: ReactNode;
  /** One line under the title: who, where, when. */
  readonly lead?: ReactNode;
  /** Above the title: a way back, a status badge. */
  readonly top?: ReactNode;
  readonly children: ReactNode;
}

/** Every console screen: a title the screen reader lands on, then the content in one column. */
export function Screen({ title, lead, top, children }: ScreenProps): ReactElement {
  return (
    <div className="o-screen">
      <header className="o-screen__head">
        {top}
        <h1 className="o-screen__title">{title}</h1>
        {lead === undefined ? null : <p className="o-screen__lead">{lead}</p>}
      </header>
      {children}
    </div>
  );
}

export interface SectionProps {
  readonly label: string;
  /** The anchor a link points at (`/account#github`). */
  readonly id?: string;
  readonly children: ReactNode;
}

/** A card with a small uppercase heading, named for screen readers by that heading. */
export function Section({ label, id, children }: SectionProps): ReactElement {
  return (
    <section id={id} className="o-card o-section" aria-label={label}>
      <h2 className="o-label">{label}</h2>
      {children}
    </section>
  );
}

export interface Fact {
  readonly label: string;
  readonly value: ReactNode;
  /** Identifiers, digests and commands read better in the monospace face. */
  readonly mono?: boolean;
}

/** Label and value pairs; a fact without a value is left out rather than shown empty. */
export function Facts({ facts }: { readonly facts: readonly (Fact | undefined)[] }): ReactElement {
  return (
    <dl className="o-facts">
      {facts
        .filter((fact) => fact !== undefined)
        .map((fact) => (
          <div key={fact.label} className="o-facts__row">
            <dt>{fact.label}</dt>
            <dd className={fact.mono === true ? 'o-mono' : undefined}>{fact.value}</dd>
          </div>
        ))}
    </dl>
  );
}

export interface EmptyStateProps {
  readonly title: string;
  readonly children: ReactNode;
}

export function EmptyState({ title, children }: EmptyStateProps): ReactElement {
  return (
    <div className="o-card o-empty">
      <p className="o-empty__title">{title}</p>
      <p className="o-screen__lead">{children}</p>
    </div>
  );
}

export interface LoadStateProps<T> {
  readonly data: T | undefined;
  readonly failure: Error | undefined;
  readonly rows?: number;
  readonly children: (data: T) => ReactNode;
}

/** The data once it is there; until then its shape, or why it is not coming. */
export function LoadState<T>({ data, failure, rows = 3, children }: LoadStateProps<T>): ReactElement {
  const { t } = useTranslation();
  let body: ReactNode = null;
  if (data !== undefined) body = children(data);
  else if (failure === undefined) body = <Skeleton rows={rows} />;
  return (
    <>
      {failure === undefined ? null : (
        <Banner tone="warning" tag={t('app.failure.tag')}>
          {failure.message}
        </Banner>
      )}
      {body}
    </>
  );
}
