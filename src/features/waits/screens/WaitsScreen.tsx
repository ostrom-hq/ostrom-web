// SPDX-License-Identifier: AGPL-3.0-only
import type { Wait } from '@gen/api/types.gen';
import { Link } from '@tanstack/react-router';
import { type ReactElement, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatAbsolute, formatRelative } from '@/shared/lib/time';
import { useNow } from '@/shared/lib/useNow';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { EmptyState, LoadState, Screen } from '@/shared/ui/Screen';
import { StatusBadge } from '../components/StatusBadge';
import { FILTERS, type WaitFilter, type WaitScope } from '../model';
import { type PeopleViewModel, usePeople, useWaitList } from '../useWaits';
import '../waits.css';

export function WaitsScreen(): ReactElement {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<WaitFilter>('open');
  const [scope, setScope] = useState<WaitScope>('involved');
  const list = useWaitList(filter, scope);
  const people = usePeople();
  return (
    <Screen title={t('waits.list.title')} lead={t('waits.list.lead')}>
      <div className="wt-filters">
        <div className="wt-filters__group" role="group" aria-label={t('waits.list.filter')}>
          {FILTERS.map((item) => (
            <Button
              key={item}
              variant="secondary"
              aria-pressed={item === filter}
              onClick={() => {
                setFilter(item);
              }}
            >
              {t(`waits.filter.${item}`)}
            </Button>
          ))}
        </div>
        <label className="wt-check">
          <input
            type="checkbox"
            checked={scope === 'mine'}
            onChange={(event) => {
              setScope(event.target.checked ? 'mine' : 'involved');
            }}
          />
          {t('waits.list.mine')}
        </label>
      </div>
      <LoadState data={list.waits} failure={list.failure}>
        {(waits) => (
          <section aria-label={t('waits.list.title')} className="o-stack">
            {waits.length === 0 ? (
              <EmptyState title={t(`waits.list.empty.${filter}`)}>{t('waits.list.emptyBody')}</EmptyState>
            ) : (
              <WaitRows waits={waits} people={people} />
            )}
            {list.moreFailure === undefined ? null : (
              <Banner tone="warning" tag={t('app.failure.tag')} live>
                {list.moreFailure.message}
              </Banner>
            )}
            {list.more ? (
              <Button disabled={list.loadingMore} onClick={list.loadMore}>
                {list.loadingMore ? t('waits.list.loadingMore') : t('waits.list.more')}
              </Button>
            ) : null}
          </section>
        )}
      </LoadState>
    </Screen>
  );
}

function WaitRows({
  waits,
  people,
}: {
  readonly waits: readonly Wait[];
  readonly people: PeopleViewModel;
}): ReactElement {
  const { t, i18n } = useTranslation();
  const now = useNow();
  return (
    <ul className="o-card o-rows">
      {waits.map((wait) => (
        <li key={wait.id}>
          <Link to="/waits/$waitId" params={{ waitId: wait.id }} className="o-row">
            <StatusBadge wait={wait} people={people} />
            <span className="o-row__main">
              <span className="o-row__title">{wait.question.title}</span>
              <span className="o-row__meta">
                {[
                  wait.createdBy === undefined
                    ? undefined
                    : t('waits.list.askedBy', { who: people.nameOf(wait.createdBy) }),
                  wait.sessionId === undefined ? undefined : t('waits.list.session', { id: wait.sessionId }),
                ]
                  .filter((part) => part !== undefined)
                  .join(' · ')}
              </span>
            </span>
            <time
              className="o-row__end"
              dateTime={wait.createdAt}
              title={formatAbsolute(wait.createdAt, i18n.language)}
            >
              {formatRelative(wait.createdAt, now, i18n.language)}
            </time>
          </Link>
        </li>
      ))}
    </ul>
  );
}
