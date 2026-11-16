// SPDX-License-Identifier: Apache-2.0
import type { PoolBudgetDto } from '@gen/api/types.gen';
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { formatUsd, parseUsd } from '@/shared/lib/money';
import { Badge } from '@/shared/ui/Badge';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { microsOfUsd, usdDraftOf, usdOfMicros } from '../model';
import { usePoolBudgetSave } from '../useCapacity';
import { SaveFailure } from './SaveFailure';

/** The budget a new pool's form starts from, TeamCode's: a dollar a day. */
const NEW_POOL: PoolBudgetDto = { poolId: '', dailyMicros: 1_000_000, sharedOverflow: false };

export interface PoolBudgetFormProps {
  /** A saved pool, or none for TeamCode's « Add or update a pool » form. */
  readonly budget?: PoolBudgetDto | undefined;
  /** The members who call the pool home, once their policies are read. */
  readonly members: number | undefined;
}

/**
 * TeamCode's pool budget form (`POST /dashboard/capacity/pool`): the pool's name, its total daily budget, here in
 * dollars, and whether it is a shared overflow reserve (`PUT /pools/budgets`).
 */
export function PoolBudgetForm({ budget, members }: PoolBudgetFormProps): ReactElement {
  const { t, i18n } = useTranslation();
  const saved = budget !== undefined;
  const start = budget ?? NEW_POOL;
  const view = usePoolBudgetSave();
  const [pool, setPool] = useState(start.poolId);
  const [daily, setDaily] = useState(usdDraftOf(start.dailyMicros));
  const [overflow, setOverflow] = useState(start.sharedOverflow === true);
  const headingId = useId();
  const poolId = useId();
  const dailyId = useId();
  const amount = parseUsd(daily);
  const effect = !saved
    ? t('capacity.pools.effect.new')
    : members === undefined
      ? undefined
      : members === 0
        ? t('capacity.pools.effect.none')
        : t('capacity.pools.effect.members', { count: members });
  const perDay = formatUsd(usdOfMicros(start.dailyMicros), i18n.language);
  return (
    <form
      className="o-card o-stack"
      aria-labelledby={headingId}
      onSubmit={(event) => {
        event.preventDefault();
        if (amount === undefined) return;
        view.save(
          { poolId: pool.trim(), dailyMicros: microsOfUsd(amount), sharedOverflow: overflow },
          saved
            ? undefined
            : () => {
                setPool(NEW_POOL.poolId);
                setDaily(usdDraftOf(NEW_POOL.dailyMicros));
                setOverflow(false);
              },
        );
      }}
    >
      <div className="o-inline cp-head">
        <h3 id={headingId} className="cp-title">
          {saved ? t('capacity.pools.named', { pool: start.poolId }) : t('capacity.pools.newTitle')}
        </h3>
        {start.sharedOverflow === true ? <Badge tone="signal">{t('capacity.pools.reserve')}</Badge> : null}
      </div>
      <label htmlFor={poolId} className="o-field-label">
        {t('capacity.pools.pool')}
      </label>
      <input
        id={poolId}
        className="o-input"
        autoComplete="off"
        maxLength={36}
        required
        value={pool}
        aria-describedby={`${poolId}-hint`}
        onChange={(event) => {
          setPool(event.target.value);
        }}
      />
      <p id={`${poolId}-hint`} className="o-row__meta">
        {t('capacity.pools.poolHint')}
      </p>
      <label htmlFor={dailyId} className="o-field-label">
        {t('capacity.pools.daily')}
      </label>
      <input
        id={dailyId}
        className="o-input cp-amount"
        inputMode="decimal"
        autoComplete="off"
        required
        value={daily}
        aria-describedby={`${dailyId}-hint`}
        onChange={(event) => {
          setDaily(event.target.value);
        }}
      />
      <p id={`${dailyId}-hint`} className="o-row__meta">
        {effect === undefined ? perDay : t('capacity.pools.dailyHint', { amount: perDay, effect })}
      </p>
      {amount === undefined ? (
        <Banner tone="warning" tag={t('capacity.errorTag')} live>
          {t('capacity.pools.badDaily')}
        </Banner>
      ) : null}
      <label className="o-inline cp-check">
        <input
          type="checkbox"
          checked={overflow}
          onChange={(event) => {
            setOverflow(event.target.checked);
          }}
        />
        {t('capacity.pools.overflow')}
      </label>
      <SaveFailure failure={view.failure} />
      <span className="o-self-start">
        <Button type="submit" disabled={view.saving || amount === undefined}>
          {view.saving ? t('capacity.pools.saving') : t('capacity.pools.save')}
        </Button>
      </span>
    </form>
  );
}
