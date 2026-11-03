// SPDX-License-Identifier: AGPL-3.0-only
import type { Session } from '@gen/api/types.gen';
import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { formatAbsolute, formatRelative } from '@/shared/lib/time';
import { useNow } from '@/shared/lib/useNow';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { EmptyState, LoadState, Screen } from '@/shared/ui/Screen';
import { StateBadge } from '../components/StateBadge';
import { formatDuration, sessionState } from '../model';
import { useSessionList } from '../useSessions';

export function SessionsScreen(): ReactElement {
  const { t } = useTranslation();
  const { open, ended, failure, more, loadingMore, moreFailure, loadMore } = useSessionList();
  return (
    <Screen title={t('sessions.list.title')} lead={t('sessions.list.lead')}>
      <LoadState data={open} failure={failure}>
        {(items) => (
          <section aria-labelledby="ss-open" className="o-stack">
            <h2 id="ss-open" className="o-label">
              {t('sessions.list.open', { count: items.length })}
            </h2>
            {items.length === 0 ? (
              <EmptyState title={t('sessions.list.emptyTitle')}>{t('sessions.list.emptyBody')}</EmptyState>
            ) : (
              <SessionRows sessions={items} />
            )}
          </section>
        )}
      </LoadState>
      {ended === undefined || ended.length === 0 ? null : (
        <section aria-labelledby="ss-ended" className="o-stack">
          <h2 id="ss-ended" className="o-label">
            {t('sessions.list.ended')}
          </h2>
          <SessionRows sessions={ended} />
          {moreFailure === undefined ? null : (
            <Banner tone="warning" tag={t('app.failure.tag')} live>
              {moreFailure.message}
            </Banner>
          )}
          {more ? (
            <Button disabled={loadingMore} onClick={loadMore}>
              {loadingMore ? t('sessions.list.loadingMore') : t('sessions.list.more')}
            </Button>
          ) : null}
        </section>
      )}
    </Screen>
  );
}

function SessionRows({ sessions }: { readonly sessions: readonly Session[] }): ReactElement {
  const { t, i18n } = useTranslation();
  const now = useNow();
  return (
    <ul className="o-card o-rows">
      {sessions.map((session) => (
        <li key={session.id}>
          <Link to="/sessions/$sessionId" params={{ sessionId: session.id }} className="o-row">
            <StateBadge state={sessionState(session, now)} />
            <span className="o-row__main">
              <span className="o-row__title">
                {[session.agent, session.repo].filter((part) => part !== undefined).join(' · ')}
              </span>
              <span className="o-row__meta">
                {[session.dev, session.model].filter((part) => part !== undefined).join(' · ')}
              </span>
            </span>
            <time
              className="o-row__end"
              dateTime={session.endedAt ?? session.startedAt}
              title={formatAbsolute(session.startedAt, i18n.language)}
            >
              {session.endedAt === undefined
                ? t('sessions.list.since', { when: formatRelative(session.startedAt, now, i18n.language) })
                : formatDuration(session.startedAt, session.endedAt, i18n.language)}
            </time>
          </Link>
        </li>
      ))}
    </ul>
  );
}
