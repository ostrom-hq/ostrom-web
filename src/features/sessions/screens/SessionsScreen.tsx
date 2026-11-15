// SPDX-License-Identifier: Apache-2.0
import type { SessionDto } from '@gen/api/types.gen';
import { Link } from '@tanstack/react-router';
import { type ReactElement, useId, useMemo, useState } from 'react';
import { Feature } from '@/shared/capabilities/Feature';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { formatAbsolute, formatDuration, formatRelative } from '@/shared/lib/time';
import { useNow } from '@/shared/lib/useNow';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { EmptyState, LoadState, Screen } from '@/shared/ui/Screen';
import { ActivityBadge } from '../components/ActivityBadge';
import { StateBadge } from '../components/StateBadge';
import { parseLabelFilter, sessionLabels, sessionState } from '../model';
import { useSessionList } from '../useSessions';

export function SessionsScreen(): ReactElement {
  const { t } = useTranslation();
  const [typed, setTyped] = useState('');
  const filterId = useId();
  const filter = useMemo(() => parseLabelFilter(typed), [typed]);
  const { open, ended, failure, more, loadingMore, moreFailure, loadMore } = useSessionList(filter.labels);
  return (
    <Screen title={t('sessions.list.title')} lead={t('sessions.list.lead')}>
      <Feature name="sessions.labels.v1">
        <div className="o-stack">
          <label htmlFor={filterId} className="o-field-label">
            {t('sessions.list.filter')}
          </label>
          <input
            id={filterId}
            className="o-input"
            placeholder={t('sessions.list.filterPlaceholder')}
            value={typed}
            onChange={(event) => {
              setTyped(event.target.value);
            }}
          />
          {filter.invalid.length === 0 ? null : (
            <Banner tone="warning" tag={t('sessions.list.filterInvalidTag')}>
              {t('sessions.list.filterInvalid', { list: filter.invalid.join(', ') })}
            </Banner>
          )}
        </div>
      </Feature>
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

function SessionRows({ sessions }: { readonly sessions: readonly SessionDto[] }): ReactElement {
  const { t, i18n } = useTranslation();
  const now = useNow();
  return (
    <ul className="o-card o-rows">
      {sessions.map((session) => (
        <li key={session.id}>
          <Link to="/sessions/$sessionId" params={{ sessionId: session.id }} className="o-row">
            <StateBadge state={sessionState(session, now)} />
            <ActivityBadge session={session} now={now} />
            <span className="o-row__main">
              <span className="o-row__title">
                {[session.agent, session.repo].filter((part) => part !== undefined).join(' · ')}
              </span>
              <span className="o-row__meta">
                {[session.dev, session.model].filter((part) => part !== undefined).join(' · ')}
              </span>
              {sessionLabels(session).length === 0 ? null : (
                <span className="o-row__meta o-mono">{sessionLabels(session).join('  ')}</span>
              )}
            </span>
            <time
              className="o-row__end"
              dateTime={session.endedAt ?? session.startedAt}
              title={formatAbsolute(session.startedAt, i18n.language)}
            >
              {typeof session.endedAt === 'string'
                ? formatDuration(session.startedAt, session.endedAt, i18n.language)
                : t('sessions.list.since', { when: formatRelative(session.startedAt, now, i18n.language) })}
            </time>
          </Link>
        </li>
      ))}
    </ul>
  );
}
