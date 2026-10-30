// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import './yes.css';
import { useNow } from '@/shared/lib/useNow';
import { Banner } from '@/shared/ui/Banner';
import { ApprovalCard } from '../components/ApprovalCard';
import { DecidedLine } from '../components/DecidedLine';
import { Skeleton } from '@/shared/ui/Skeleton';
import { useApprovalsQueue, useViewer } from '../useYes';

export function YesQueueScreen(): ReactElement {
  const { t } = useTranslation();
  const { waiting, decided, failure, fresh } = useApprovalsQueue();
  const viewer = useViewer();
  const now = useNow();
  return (
    <div className="ys-page">
      <header className="ys-head">
        <h1 className="ys-h1">{t('yes.queue.title')}</h1>
        {viewer.name === undefined ? null : (
          <p className="ys-meta">{t('yes.signedAs', { name: viewer.name })}</p>
        )}
      </header>
      {failure === undefined ? null : (
        <Banner tone="warning" tag={t('yes.queue.offlineTag')}>
          {t('yes.queue.offline', { reason: failure.message })}
        </Banner>
      )}
      {waiting === undefined ? (
        failure === undefined ? (
          <Skeleton />
        ) : null
      ) : (
        <section aria-labelledby="ys-pending">
          <h2 id="ys-pending" className="ys-h2">
            {t('yes.queue.waiting', { count: waiting.length })}
          </h2>
          {waiting.length === 0 ? (
            <div className="o-card ys-empty">
              <p className="ys-empty__title">{t('yes.queue.emptyTitle')}</p>
              <p className="ys-meta">{t('yes.queue.emptyBody')}</p>
            </div>
          ) : (
            <ul className="ys-list" aria-live="polite">
              {waiting.map((approval) => (
                <li key={approval.id}>
                  <ApprovalCard
                    approval={approval}
                    viewer={viewer.login}
                    fresh={fresh.has(approval.id)}
                    now={now}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {decided === undefined || decided.length === 0 ? null : (
        <section aria-labelledby="ys-decided">
          <h2 id="ys-decided" className="ys-h2">
            {t('yes.queue.decided')}
          </h2>
          <ul className="ys-list ys-list--tight">
            {decided.map((approval) => (
              <li key={approval.id}>
                <DecidedLine approval={approval} now={now} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
