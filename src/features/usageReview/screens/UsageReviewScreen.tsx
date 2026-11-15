// SPDX-License-Identifier: Apache-2.0
import type { PendingUsageDto, UsageReconciliationDto } from '@gen/api/types.gen';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { type ReactElement, type ReactNode, useId } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { formatAbsolute } from '@/shared/lib/time';
import { useOrgMembers } from '@/shared/org/members';
import { managesMembers } from '@/shared/org/roles';
import { WithOrg } from '@/shared/org/WithOrg';
import { Button } from '@/shared/ui/Button';
import { MorePeople } from '@/shared/ui/MorePeople';
import { EmptyState, LoadState, Screen, Section } from '@/shared/ui/Screen';
import { formatMicros } from '../model';
import { type UsagePageViewModel, useUsageLists } from '../useUsageReview';

/**
 * TeamCode's Usage review: the model calls whose final usage never reached the ledger keep the charge they were
 * admitted for until an administrator corrects it from the provider's evidence. The pending holds, or the corrections
 * made (`?view=history`), newest first, optionally one member's (`?member=`). Owners and admins only.
 */
export function UsageReviewScreen(): ReactElement {
  const { t } = useTranslation();
  return (
    <WithOrg title={t('usageReview.title')}>
      {(org, role) => (managesMembers(role) ? <UsageReview org={org.id} /> : <AdminsOnly />)}
    </WithOrg>
  );
}

export function AdminsOnly(): ReactElement {
  const { t } = useTranslation();
  return (
    <Screen title={t('usageReview.title')}>
      <EmptyState title={t('usageReview.adminsOnlyTitle')}>{t('usageReview.adminsOnly')}</EmptyState>
    </Screen>
  );
}

function UsageReview({ org }: { readonly org: string }): ReactElement {
  const { t } = useTranslation();
  const { member, view } = useSearch({ from: '/usage' });
  const history = view === 'history';
  const lists = useUsageLists(history, member);
  if (lists.pending.forbidden || lists.reconciliations.forbidden) return <AdminsOnly />;
  return (
    <Screen title={t('usageReview.title')} lead={t('usageReview.lead')}>
      <nav className="o-inline" aria-label={t('usageReview.views')}>
        <Link
          to="/usage"
          search={member === undefined ? {} : { member }}
          aria-current={history ? undefined : 'page'}
        >
          {t('usageReview.pending')}
        </Link>
        <Link
          to="/usage"
          search={member === undefined ? { view: 'history' } : { member, view: 'history' }}
          aria-current={history ? 'page' : undefined}
        >
          {t('usageReview.history')}
        </Link>
      </nav>
      <MemberFilter org={org} member={member} history={history} />
      {history ? (
        <Page
          label={t('usageReview.history')}
          view={lists.reconciliations}
          empty={t('usageReview.noHistory')}
        >
          {(item) => <ReconciliationRow key={item.id} item={item} />}
        </Page>
      ) : (
        <Page label={t('usageReview.pending')} view={lists.pending} empty={t('usageReview.noPending')}>
          {(item) => <PendingRow key={item.id} item={item} />}
        </Page>
      )}
    </Screen>
  );
}

function MemberFilter({
  org,
  member,
  history,
}: {
  readonly org: string;
  readonly member: string | undefined;
  readonly history: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const id = useId();
  const people = useOrgMembers(org);
  const navigate = useNavigate({ from: '/usage' });
  return (
    <div className="o-inline">
      <label htmlFor={id} className="o-field-label">
        {t('usageReview.member')}
      </label>
      <select
        id={id}
        className="o-input o-select"
        value={member ?? ''}
        onChange={(event) => {
          const chosen = event.target.value;
          void navigate({
            search: {
              ...(chosen === '' ? {} : { member: chosen }),
              ...(history ? { view: 'history' as const } : {}),
            },
          });
        }}
      >
        <option value="">{t('usageReview.everyMember')}</option>
        {/* A member asked for by the address that is not among the people read yet stays chosen, by id. */}
        {member === undefined || (people.members ?? []).some((person) => person.id === member) ? null : (
          <option value={member}>{member}</option>
        )}
        {(people.members ?? []).map((person) => (
          <option key={person.id} value={person.id}>
            {person.login}
          </option>
        ))}
      </select>
      <MorePeople people={people} />
    </div>
  );
}

function Page<T>({
  label,
  view,
  empty,
  children,
}: {
  readonly label: string;
  readonly view: UsagePageViewModel<T>;
  readonly empty: string;
  readonly children: (item: T) => ReactNode;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Section label={label}>
      <LoadState data={view.items} failure={view.failure}>
        {(items) =>
          items.length === 0 ? (
            <p className="o-empty">{empty}</p>
          ) : (
            <ul className="o-card o-rows">{items.map(children)}</ul>
          )
        }
      </LoadState>
      {view.more ? (
        <div className="o-inline">
          <Button variant="ghost" disabled={view.loadingMore} onClick={view.loadMore}>
            {t('usageReview.older')}
          </Button>
        </div>
      ) : null}
    </Section>
  );
}

function PendingRow({ item }: { readonly item: PendingUsageDto }): ReactElement {
  const { t, i18n } = useTranslation();
  return (
    <li className="o-row">
      <span className="o-row__main">
        <Link className="o-row__title o-mono" to="/usage/$reservationId" params={{ reservationId: item.id }}>
          {item.id}
        </Link>
        <span className="o-row__meta">
          {t('usageReview.heldBy', { login: item.member, when: formatAbsolute(item.heldAt, i18n.language) })}{' '}
          · {t('usageReview.leaseExpired', { when: formatAbsolute(item.leaseExpiredAt, i18n.language) })}
        </span>
        <span className="o-row__meta">
          {t('usageReview.providerRequest', { id: item.providerRequestId ?? t('usageReview.notCaptured') })}
        </span>
      </span>
      <span className="o-row__title">{formatMicros(item.micros, i18n.language)}</span>
    </li>
  );
}

function ReconciliationRow({ item }: { readonly item: UsageReconciliationDto }): ReactElement {
  const { t, i18n } = useTranslation();
  return (
    <li className="o-row">
      <span className="o-row__main">
        <Link className="o-row__title o-mono" to="/usage/$reservationId" params={{ reservationId: item.id }}>
          {item.id}
        </Link>
        <span className="o-row__meta">
          {t('usageReview.reconciledBy', {
            login: item.reconciledBy,
            when: formatAbsolute(item.reconciledAt, i18n.language),
          })}{' '}
          · {item.member}
        </span>
        <span className="o-row__meta">
          {item.reference} · {item.reason}
        </span>
      </span>
      <span className="o-row__title">
        {t('usageReview.corrected', {
          from: formatMicros(item.previousMicros, i18n.language),
          to: formatMicros(item.micros, i18n.language),
        })}
      </span>
    </li>
  );
}
