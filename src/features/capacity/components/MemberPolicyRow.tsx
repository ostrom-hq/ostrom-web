// SPDX-License-Identifier: Apache-2.0
import type { BudgetDto, InferenceSettingsDto, MemberPolicyResponse } from '@gen/api/types.gen';
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { formatUsd } from '@/shared/lib/money';
import {
  concurrencyDraft,
  concurrencyOf,
  MAX_MEMBER_CONCURRENCY,
  withConcurrency,
} from '@/shared/org/memberConcurrency';
import { Avatar } from '@/shared/ui/Avatar';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { Skeleton } from '@/shared/ui/Skeleton';
import {
  budgetWithDailyCap,
  type DailyCap,
  dailyCapDraft,
  dailyCapDraftOf,
  dailyCapOf,
  homePoolOf,
  ownBudgetOf,
} from '../model';
import { type MemberLimitsChange, useMemberLimitsSave } from '../useCapacity';
import { SaveFailure } from './SaveFailure';

/** What an owner or an admin reads besides the pool: TeamCode's daily cap and concurrent requests. */
export interface MemberLimits {
  readonly memberId: string;
  /** The organization's budgets; undefined leaves the daily cap out. */
  readonly budgets: readonly BudgetDto[] | undefined;
  /** The inference settings; undefined leaves the concurrent requests out. */
  readonly settings: InferenceSettingsDto | undefined;
  /** Both answered: the form waits for it, so a late answer never starts it again under the typing. */
  readonly settled: boolean;
}

export interface MemberPolicyRowProps {
  readonly login: string;
  readonly name: string;
  readonly isViewer: boolean;
  /** Undefined while it is read. */
  readonly policy: MemberPolicyResponse | undefined;
  /**
   * For an owner or an admin, who changes the policy: the member's daily cap and concurrent requests besides. Anyone
   * else reads their own pool, without it.
   */
  readonly limits?: MemberLimits | undefined;
}

/** A member's pool, as TeamCode's capacity row: the policy form for an administrator, the policy read for the others. */
export function MemberPolicyRow({
  login,
  name,
  isViewer,
  policy,
  limits,
}: MemberPolicyRowProps): ReactElement {
  const { t } = useTranslation();
  const headingId = useId();
  return (
    <article className="o-card o-stack" aria-labelledby={headingId}>
      <div className="o-inline">
        <Avatar login={login} size={36} />
        <h3 id={headingId} className="cp-title">
          {name}
          {isViewer ? <span className="o-row__meta"> {t('capacity.members.you')}</span> : null}
        </h3>
      </div>
      {policy === undefined ? (
        <Skeleton rows={1} />
      ) : (
        <>
          <p className="o-row__meta">
            {poolNameOf(policy, t)} ·{' '}
            {policy.allowSharedOverflow
              ? t('capacity.members.overflowOn')
              : t('capacity.members.overflowOff')}
          </p>
          {limits === undefined ? null : (
            <>
              <LimitsLine limits={limits} />
              {limits.settled ? (
                <PolicyForm key={formKey(policy, limits)} login={login} policy={policy} limits={limits} />
              ) : (
                <Skeleton rows={2} />
              )}
            </>
          )}
        </>
      )}
    </article>
  );
}

type Translate = ReturnType<typeof useTranslation>['t'];

function poolNameOf(policy: MemberPolicyResponse, t: Translate): string {
  const pool = homePoolOf(policy);
  return pool === '' ? t('capacity.members.shared') : t('capacity.members.named', { pool });
}

/** The cap in a line (`cap`), or in the field's hint (`capNow`). */
function capLabel(cap: DailyCap, t: Translate, locale: string, where: 'cap' | 'capNow'): string {
  switch (cap.kind) {
    case 'own':
      return t(`capacity.members.${where}.own`, { amount: formatUsd(cap.usd, locale) });
    case 'everyMember':
      return t(`capacity.members.${where}.everyMember`, { amount: formatUsd(cap.usd, locale) });
    case 'none':
      return t(`capacity.members.${where}.none`);
  }
}

function concurrencyLabel(limit: number, t: Translate): string {
  return limit === 0 ? t('capacity.members.unlimited') : String(limit);
}

/** TeamCode's « Personal cap · concurrent requests » line, with what is read. */
function LimitsLine({ limits }: { readonly limits: MemberLimits }): ReactElement | null {
  const { t, i18n } = useTranslation();
  const parts = [
    ...(limits.budgets === undefined
      ? []
      : [capLabel(dailyCapOf(limits.budgets, limits.memberId), t, i18n.language, 'cap')]),
    ...(limits.settings === undefined
      ? []
      : [
          t('capacity.members.concurrentLine', {
            limit: concurrencyLabel(concurrencyOf(limits.settings, limits.memberId), t),
          }),
        ]),
  ];
  return parts.length === 0 ? null : <p className="o-row__meta">{parts.join(' · ')}</p>;
}

/** A saved policy, cap or limit starts the form again from it; so does one read after the form was shown. */
function formKey(policy: MemberPolicyResponse, limits: MemberLimits): string {
  const cap = limits.budgets === undefined ? '-' : dailyCapDraftOf(limits.budgets, limits.memberId);
  const concurrency =
    limits.settings === undefined ? '-' : String(concurrencyOf(limits.settings, limits.memberId));
  return `${homePoolOf(policy)}:${String(policy.allowSharedOverflow)}:${cap}:${concurrency}`;
}

/**
 * TeamCode's member form (`POST /dashboard/capacity/{id}`): « Optional daily cap (0 = none) », here in dollars, the
 * member's own daily budget; « Concurrent requests (0 = unlimited) »; « Pool (empty = shared) » and « Allow shared
 * overflow accounts ». TeamCode's weight is not here: ostrom-server keeps none.
 */
function PolicyForm({
  login,
  policy,
  limits,
}: {
  readonly login: string;
  readonly policy: MemberPolicyResponse;
  readonly limits: MemberLimits;
}): ReactElement {
  const { t, i18n } = useTranslation();
  const view = useMemberLimitsSave(login);
  const { budgets, settings, memberId } = limits;
  const startCap = budgets === undefined ? '0' : dailyCapDraftOf(budgets, memberId);
  const startConcurrency = settings === undefined ? 0 : concurrencyOf(settings, memberId);
  const [pool, setPool] = useState(homePoolOf(policy));
  const [overflow, setOverflow] = useState(policy.allowSharedOverflow);
  const [cap, setCap] = useState(startCap);
  const [concurrency, setConcurrency] = useState(String(startConcurrency));
  const poolId = useId();
  const capId = useId();
  const concurrencyId = useId();
  const capUsd = dailyCapDraft(cap);
  const limit = concurrencyDraft(concurrency);
  // A field left out (its value unread) is never a reason not to save, nor sent.
  const valid =
    (budgets === undefined || capUsd !== undefined) && (settings === undefined || limit !== undefined);
  const change: MemberLimitsChange = {
    policy:
      pool.trim() === homePoolOf(policy) && overflow === policy.allowSharedOverflow
        ? undefined
        : { poolId: pool.trim(), allowSharedOverflow: overflow },
    budget:
      budgets === undefined || capUsd === undefined || capUsd === dailyCapDraft(startCap)
        ? undefined
        : budgetWithDailyCap(memberId, ownBudgetOf(budgets, memberId), capUsd),
    settings:
      settings === undefined || limit === undefined || limit === startConcurrency
        ? undefined
        : withConcurrency(settings, memberId, limit),
  };
  const changed = Object.values(change).some((part) => part !== undefined);
  return (
    <form
      className="o-stack"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid && changed) view.save(change);
      }}
    >
      {budgets === undefined ? null : (
        <>
          <label htmlFor={capId} className="o-field-label">
            {t('capacity.members.dailyCap')}
          </label>
          <input
            id={capId}
            className="o-input cp-amount"
            inputMode="decimal"
            autoComplete="off"
            required
            value={cap}
            aria-describedby={`${capId}-hint`}
            onChange={(event) => {
              setCap(event.target.value);
            }}
          />
          <p id={`${capId}-hint`} className="o-row__meta">
            {t('capacity.members.dailyCapHint', {
              cap: capLabel(dailyCapOf(budgets, memberId), t, i18n.language, 'capNow'),
            })}
          </p>
          {capUsd === undefined ? (
            <Banner tone="warning" tag={t('capacity.errorTag')} live>
              {t('capacity.members.badCap')}
            </Banner>
          ) : null}
        </>
      )}
      {settings === undefined ? null : (
        <>
          <label htmlFor={concurrencyId} className="o-field-label">
            {t('capacity.members.concurrency')}
          </label>
          <input
            id={concurrencyId}
            type="number"
            className="o-input cp-amount"
            min={0}
            max={MAX_MEMBER_CONCURRENCY}
            step={1}
            required
            value={concurrency}
            aria-describedby={`${concurrencyId}-hint`}
            onChange={(event) => {
              setConcurrency(event.target.value);
            }}
          />
          <p id={`${concurrencyId}-hint`} className="o-row__meta">
            {t('capacity.members.concurrencyHint', {
              limit: concurrencyLabel(startConcurrency, t),
            })}
          </p>
        </>
      )}
      <label htmlFor={poolId} className="o-field-label">
        {t('capacity.members.pool')}
      </label>
      <input
        id={poolId}
        className="o-input"
        autoComplete="off"
        maxLength={36}
        value={pool}
        aria-describedby={`${poolId}-hint`}
        onChange={(event) => {
          setPool(event.target.value);
        }}
      />
      <p id={`${poolId}-hint`} className="o-row__meta">
        {t('capacity.members.poolHint', { pool: poolNameOf(policy, t) })}
      </p>
      <label className="o-inline cp-check">
        <input
          type="checkbox"
          checked={overflow}
          onChange={(event) => {
            setOverflow(event.target.checked);
          }}
        />
        {t('capacity.members.overflow')}
      </label>
      <SaveFailure failure={view.failure} />
      <span className="o-self-start">
        <Button type="submit" disabled={view.saving || !valid || !changed}>
          {view.saving ? t('capacity.members.saving') : t('capacity.members.save')}
        </Button>
      </span>
    </form>
  );
}
