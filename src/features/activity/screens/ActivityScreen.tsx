// SPDX-License-Identifier: AGPL-3.0-only
import type { ActivityItem } from '@gen/api/types.gen';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatUsd } from '@/shared/lib/money';
import { formatAbsolute } from '@/shared/lib/time';
import { Badge } from '@/shared/ui/Badge';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { LoadState, Screen } from '@/shared/ui/Screen';
import { knownKind, linkOf, toneOf } from '../model';
import { useActivity } from '../useActivity';

function ActivityRow({ item }: { readonly item: ActivityItem }): ReactElement {
  const { t, i18n } = useTranslation();
  const kind = knownKind(item.kind);
  const meta = [
    // The summary already names an agent or a person; another kind of actor is said, never taken for a person.
    item.actor.kind === 'agent' || item.actor.kind === 'person'
      ? undefined
      : t('activity.actor.other', { name: item.actor.name, kind: item.actor.kind }),
    item.repo,
    item.costUsd === undefined ? undefined : formatUsd(item.costUsd, i18n.language),
    formatAbsolute(item.at, i18n.language),
  ].filter((part) => part !== undefined);
  const body = (
    <>
      <span className="o-row__main">
        {/* The server words the line, in English: the contract gives no subject to word it here. */}
        <span className="o-row__title">{item.summary}</span>
        <span className="o-row__meta">{meta.join(' · ')}</span>
      </span>
      {/* A kind the console does not know yet is shown as the server wrote it. */}
      <Badge tone={toneOf(kind)}>{kind === undefined ? item.kind : t(`activity.kind.${kind}`)}</Badge>
    </>
  );
  const link = linkOf(item);
  if (link === undefined) return <div className="o-row">{body}</div>;
  // Two branches with the same markup: the router types `to` and `params` together, one route at a time.
  return link.to === '/yes/$approvalId' ? (
    <Link className="o-row" to={link.to} params={link.params}>
      {body}
    </Link>
  ) : (
    <Link className="o-row" to={link.to} params={link.params}>
      {body}
    </Link>
  );
}

/** What happened in the organization, newest first: sessions, requests and their answers, workflow changes. */
export function ActivityScreen(): ReactElement {
  const { t } = useTranslation();
  const inputId = useId();
  const { repo = '' } = useSearch({ from: '/activity' });
  const navigate = useNavigate({ from: '/activity' });
  // What is typed belongs to the filter on screen: Back to another filter shows that one's name again.
  const [edit, setEdit] = useState<{ readonly for: string; readonly value: string }>();
  const typed = edit?.for === repo ? edit.value : repo;
  const view = useActivity(repo);
  const show = (next: string): void => {
    setEdit(undefined);
    // The same filter again adds no step to Back.
    if (next !== repo) void navigate({ search: next === '' ? {} : { repo: next } });
  };
  return (
    <Screen title={t('activity.title')} lead={t('activity.lead')}>
      {view.unavailable ? (
        <Banner tone="info" tag={t('activity.unavailableTag')}>
          {t('activity.unavailable')}
        </Banner>
      ) : null}
      {/* Without the route there is nothing to filter, but a filter opened from a link can still be cleared. */}
      {view.unavailable && repo === '' ? null : (
        <form
          className="o-inline"
          onSubmit={(event) => {
            event.preventDefault();
            show(typed.trim());
          }}
          role="search"
          aria-label={t('activity.filter.label')}
        >
          <label htmlFor={inputId} className="o-field-label">
            {t('activity.filter.repo')}
          </label>
          <input
            id={inputId}
            className="o-input o-mono"
            autoComplete="off"
            spellCheck={false}
            placeholder="acme/web"
            value={typed}
            onChange={(event) => {
              setEdit({ for: repo, value: event.target.value });
            }}
          />
          <Button type="submit">{t('activity.filter.apply')}</Button>
          {repo === '' ? null : (
            <Button
              variant="ghost"
              onClick={() => {
                show('');
              }}
            >
              {t('activity.filter.clear')}
            </Button>
          )}
        </form>
      )}
      {view.unavailable ? null : (
        <>
          {repo === '' ? null : <p className="o-row__meta">{t('activity.filter.note', { repo })}</p>}
          <LoadState data={view.items} failure={view.failure}>
            {(items) =>
              items.length === 0 ? (
                <p className="o-empty">
                  {repo === '' ? t('activity.empty') : t('activity.emptyRepo', { repo })}
                </p>
              ) : (
                <ul className="o-card o-rows" aria-busy={view.switching}>
                  {items.map((item) => (
                    <li key={item.id}>
                      <ActivityRow item={item} />
                    </li>
                  ))}
                </ul>
              )
            }
          </LoadState>
          {view.staleFailure === undefined ? null : (
            <Banner tone="warning" tag={t('activity.staleTag')} live>
              {view.staleFailure.message}
            </Banner>
          )}
          {view.moreFailure === undefined ? null : (
            <Banner tone="warning" tag={t('app.failure.tag')} live>
              {view.moreFailure.message}
            </Banner>
          )}
          {view.more ? (
            <Button disabled={view.loadingMore} onClick={view.loadMore}>
              {view.loadingMore ? t('activity.loadingMore') : t('activity.more')}
            </Button>
          ) : null}
        </>
      )}
    </Screen>
  );
}
