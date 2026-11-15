// SPDX-License-Identifier: Apache-2.0
import type { BudgetOverride } from '@gen/api/types.gen';
import { type ReactElement, useId, useState } from 'react';
import { useAnnounced } from '@/shared/capabilities';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { formatUsd } from '@/shared/lib/money';
import { formatAbsolute } from '@/shared/lib/time';
import type { OrgMembers } from '@/shared/org/members';
import { Badge } from '@/shared/ui/Badge';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { FailureText } from '@/shared/ui/FailureText';
import { MorePeople } from '@/shared/ui/MorePeople';
import { LoadState, Section } from '@/shared/ui/Screen';
import {
  DEFAULT_OVERRIDE_MINUTES,
  draftOverride,
  MAX_OVERRIDE_MINUTES,
  MAX_REASON_LENGTH,
  overrideDraftOf,
  type OverrideState,
  overrideStateOf,
  reasonOf,
  usdOfMicros,
} from '../overrides';
import { type BudgetOverridesViewModel, useBudgetOverrides } from '../useBudgetOverrides';

/**
 * TeamCode's temporary quota overrides, on the Budgets page: a member is chosen by login, then their grants are listed
 * newest first, with a form that grants one (or replaces the one in force) and a revocation for the one in force.
 * Owners and admins only, and only where the server serves them (`capacity.budgetoverrides.v1`). Every write needs a
 * sign-in less than five minutes old: the refusal says so, with a link that signs in again and comes back.
 */
export function BudgetOverridesSection({
  manages,
  people,
}: {
  readonly manages: boolean;
  readonly people: Pick<OrgMembers, 'members' | 'more' | 'loadingMore'>;
}): ReactElement | null {
  const { t } = useTranslation();
  const served = useAnnounced('capacity.budgetoverrides.v1');
  const [login, setLogin] = useState('');
  const id = useId();
  if (!served || !manages) return null;
  return (
    <Section label={t('spend.overrides.title')}>
      <p className="o-row__meta">{t('spend.overrides.lead')}</p>
      <div className="o-inline">
        <label htmlFor={id} className="o-field-label">
          {t('spend.overrides.member')}
        </label>
        <select
          id={id}
          className="o-input o-select"
          value={login}
          onChange={(event) => {
            setLogin(event.target.value);
          }}
        >
          <option value="">{t('spend.overrides.choose')}</option>
          {(people.members ?? []).map((member) => (
            <option key={member.id} value={member.login}>
              {member.login}
            </option>
          ))}
        </select>
        <MorePeople people={people} />
      </div>
      {/* Another member starts afresh: no form, failure or page of the previous one stays. */}
      {login === '' ? null : <MemberOverrides key={login} login={login} />}
    </Section>
  );
}

function MemberOverrides({ login }: { readonly login: string }): ReactElement {
  const { t } = useTranslation();
  const view = useBudgetOverrides(login);
  return (
    <LoadState data={view.overrides} failure={view.failure} rows={2}>
      {(overrides) => {
        const now = new Date();
        const active = overrides.find((item) => overrideStateOf(item, view.activeId, now) === 'active');
        return (
          <div className="o-stack">
            <GrantForm key={active?.id ?? ''} view={view} active={active} />
            {view.revokeFailure === undefined ? null : (
              <Banner tone="danger" tag={t('spend.overrides.errorTag')} live>
                <FailureText failure={view.revokeFailure} />
              </Banner>
            )}
            <h3 className="o-label">{t('spend.overrides.history')}</h3>
            {overrides.length === 0 ? (
              <p className="o-empty">{t('spend.overrides.empty', { login })}</p>
            ) : (
              <ul className="o-card o-rows" aria-label={t('spend.overrides.history')}>
                {overrides.map((item) => (
                  <OverrideRow
                    key={item.id}
                    item={item}
                    state={overrideStateOf(item, view.activeId, now)}
                    view={view}
                  />
                ))}
              </ul>
            )}
            {view.more ? (
              <div className="o-inline">
                <Button variant="ghost" disabled={view.loadingMore} onClick={view.loadMore}>
                  {t('spend.overrides.older')}
                </Button>
              </div>
            ) : null}
          </div>
        );
      }}
    </LoadState>
  );
}

function GrantForm({
  view,
  active,
}: {
  readonly view: BudgetOverridesViewModel;
  readonly active: BudgetOverride | undefined;
}): ReactElement {
  const { t } = useTranslation();
  const [amount, setAmount] = useState(active === undefined ? '' : overrideDraftOf(active.micros));
  const [minutes, setMinutes] = useState(DEFAULT_OVERRIDE_MINUTES);
  const [reason, setReason] = useState('');
  const ids = { amount: useId(), minutes: useId(), reason: useId() };
  const grant = draftOverride({ amount, minutes, reason, replacesId: active?.id });
  return (
    <form
      className="o-stack"
      aria-label={active === undefined ? t('spend.overrides.grant') : t('spend.overrides.replace')}
      onSubmit={(event) => {
        event.preventDefault();
        if (grant !== undefined)
          view.grant(grant, () => {
            setReason('');
          });
      }}
    >
      <p className="o-row__meta">{t('spend.overrides.help')}</p>
      <div className="o-inline">
        <label htmlFor={ids.amount} className="o-field-label">
          {t('spend.overrides.amount')}
        </label>
        <input
          id={ids.amount}
          className="o-input sp-amount"
          inputMode="decimal"
          autoComplete="off"
          value={amount}
          onChange={(event) => {
            setAmount(event.target.value);
          }}
        />
        <label htmlFor={ids.minutes} className="o-field-label">
          {t('spend.overrides.minutes')}
        </label>
        <input
          id={ids.minutes}
          className="o-input sp-amount"
          type="number"
          min={1}
          max={MAX_OVERRIDE_MINUTES}
          value={minutes}
          onChange={(event) => {
            setMinutes(event.target.value);
          }}
        />
      </div>
      <div className="o-inline">
        <label htmlFor={ids.reason} className="o-field-label">
          {t('spend.overrides.reason')}
        </label>
        <input
          id={ids.reason}
          className="o-input"
          maxLength={MAX_REASON_LENGTH}
          autoComplete="off"
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
          }}
        />
      </div>
      {view.grantFailure === undefined ? null : (
        <Banner tone="danger" tag={t('spend.overrides.errorTag')} live>
          <FailureText failure={view.grantFailure} />
        </Banner>
      )}
      <div className="o-inline">
        <Button type="submit" disabled={view.granting || grant === undefined}>
          {view.granting
            ? t('spend.overrides.saving')
            : active === undefined
              ? t('spend.overrides.grant')
              : t('spend.overrides.replace')}
        </Button>
      </div>
    </form>
  );
}

function OverrideRow({
  item,
  state,
  view,
}: {
  readonly item: BudgetOverride;
  readonly state: OverrideState;
  readonly view: BudgetOverridesViewModel;
}): ReactElement {
  const { t, i18n } = useTranslation();
  const when = (iso: string): string => formatAbsolute(iso, i18n.language);
  return (
    <li className="o-row">
      <span className="o-row__main">
        <span className="o-row__title">
          {t('spend.overrides.allowance', { usd: formatUsd(usdOfMicros(item.micros), i18n.language) })}
        </span>
        <span className="o-row__meta">
          {t('spend.overrides.granted', { when: when(item.createdAt), by: item.createdBy })} ·{' '}
          {t('spend.overrides.until', { when: when(item.expiresAt) })}
        </span>
        <span className="o-row__meta">{item.reason}</span>
        {item.replacesId === undefined ? null : (
          <span className="o-row__meta">{t('spend.overrides.replaces', { id: item.replacesId })}</span>
        )}
        {item.revokedAt === undefined ? null : (
          <span className="o-row__meta">
            {t('spend.overrides.revoked', { when: when(item.revokedAt), by: item.revokedBy ?? '' })}
            {item.revocationReason === undefined ? null : ` · ${item.revocationReason}`}
          </span>
        )}
        {state === 'active' ? <RevokeForm id={item.id} view={view} /> : null}
      </span>
      <Badge tone={state === 'active' ? 'success' : state === 'revoked' ? 'danger' : 'neutral'}>
        {t(`spend.overrides.state.${state}`)}
      </Badge>
    </li>
  );
}

function RevokeForm({
  id,
  view,
}: {
  readonly id: string;
  readonly view: BudgetOverridesViewModel;
}): ReactElement {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const field = useId();
  const typed = reasonOf(reason);
  return (
    <form
      className="o-inline"
      aria-label={t('spend.overrides.revoke')}
      onSubmit={(event) => {
        event.preventDefault();
        if (typed !== undefined)
          view.revoke(id, typed, () => {
            setReason('');
          });
      }}
    >
      <label htmlFor={field} className="o-field-label">
        {t('spend.overrides.revocationReason')}
      </label>
      <input
        id={field}
        className="o-input"
        maxLength={MAX_REASON_LENGTH}
        autoComplete="off"
        value={reason}
        onChange={(event) => {
          setReason(event.target.value);
        }}
      />
      <Button type="submit" variant="secondary" disabled={view.revoking || typed === undefined}>
        {t('spend.overrides.revoke')}
      </Button>
    </form>
  );
}
