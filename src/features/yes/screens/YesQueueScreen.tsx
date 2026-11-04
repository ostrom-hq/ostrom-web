// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useViewer } from '@/shared/auth/useViewer';
import '@/shared/ui/decision.css';
import { useNow } from '@/shared/lib/useNow';
import { Skeleton } from '@/shared/ui/Skeleton';
import { ApprovalCard } from '../components/ApprovalCard';
import { DecidedLine } from '../components/DecidedLine';
import { FailureBanner } from '../components/FailureBanner';
import { GithubLinkNotice } from '../components/GithubLinkNotice';
import { SignInNotice } from '../components/SignInNotice';
import { SignOutNotice } from '../components/SignOutNotice';
import { useApprovalsQueue } from '../useYes';

export function YesQueueScreen(): ReactElement {
  const { t } = useTranslation();
  const { waiting, more, decided, failure, fresh, linkRequired } = useApprovalsQueue();
  // Counted on the list shown, so the notice never names a request the page does not.
  const held = (waiting ?? []).filter((approval) => linkRequired.has(approval.id)).length;
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
      <SignOutNotice />
      <SignInNotice />
      <FailureBanner failure={failure} />
      {waiting === undefined ? (
        failure === undefined ? (
          <Skeleton />
        ) : null
      ) : (
        <section aria-labelledby="ys-pending">
          <h2 id="ys-pending" className="ys-h2">
            {more
              ? t('yes.queue.waitingMore', { count: waiting.length })
              : t('yes.queue.waiting', { count: waiting.length })}
          </h2>
          {held === 0 ? null : <GithubLinkNotice count={held} />}
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
                    linkRequired={linkRequired.has(approval.id)}
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
