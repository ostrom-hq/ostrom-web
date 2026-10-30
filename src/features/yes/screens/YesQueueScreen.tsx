import type { ReactElement } from 'react';
import './yes.css';
import { useTranslation } from 'react-i18next';
import { useNow } from '@/shared/lib/useNow';
import { Banner } from '@/shared/ui/Banner';
import { AskCard } from '../components/AskCard';
import { DecidedLine } from '../components/DecidedLine';
import { useYesQueue, viewerLabel } from '../useYes';

export function YesQueueScreen(): ReactElement {
  const { t } = useTranslation();
  const { queue, failure, fresh } = useYesQueue();
  const now = useNow();
  const signedAs = viewerLabel(queue, (via, login) => t(`yes.viewerVia.${via}`, { login }));
  return (
    <div className="ys-page">
      <header className="ys-head">
        <h1 className="ys-h1">{t('yes.queue.title')}</h1>
        {signedAs === undefined ? null : <p className="ys-meta">{t('yes.signedAs', { login: signedAs })}</p>}
      </header>
      {failure === undefined ? null : (
        <Banner tone="warning" tag={t('yes.queue.offlineTag')}>
          {t('yes.queue.offline', { reason: failure.message })}
        </Banner>
      )}
      {queue === undefined ? (
        failure === undefined ? (
          <p className="ys-meta" role="status">
            {t('yes.queue.loading')}
          </p>
        ) : null
      ) : (
        <>
          <section aria-labelledby="ys-pending">
            <h2 id="ys-pending" className="ys-h2">
              {t('yes.queue.waiting', { count: queue.pending.length })}
            </h2>
            {queue.pending.length === 0 ? (
              <div className="o-card ys-empty">
                <p className="ys-empty__title">{t('yes.queue.emptyTitle')}</p>
                <p className="ys-meta">{t('yes.queue.emptyBody')}</p>
              </div>
            ) : (
              <ul className="ys-list" aria-live="polite">
                {queue.pending.map((ask) => (
                  <li key={ask.id}>
                    <AskCard ask={ask} fresh={fresh.has(ask.id)} now={now} />
                  </li>
                ))}
              </ul>
            )}
          </section>
          {queue.recent.length === 0 ? null : (
            <section aria-labelledby="ys-decided">
              <h2 id="ys-decided" className="ys-h2">
                {t('yes.queue.decided')}
              </h2>
              <ul className="ys-list ys-list--tight">
                {queue.recent.map((ask) => (
                  <li key={ask.id}>
                    <DecidedLine ask={ask} now={now} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
