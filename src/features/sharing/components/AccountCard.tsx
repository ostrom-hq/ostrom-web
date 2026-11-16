// SPDX-License-Identifier: Apache-2.0
import type { SharedAccountResponse } from '@gen/api/types.gen';
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { formatUsd } from '@/shared/lib/money';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { ConfirmButton } from '@/shared/ui/ConfirmButton';
import { ACCOUNT_TONES, accountState, providerOf } from '../model';

export interface AccountCardProps {
  readonly account: SharedAccountResponse;
  readonly busy: boolean;
  /** Present when the viewer owns the subscription. */
  readonly actions:
    | {
        readonly setPaused: (paused: boolean) => void;
        readonly remove: () => void;
      }
    | undefined;
  /** Present when the viewer may hand this waiting account's refresh over to Ostrom (an administrator). */
  readonly handover?: (() => void) | undefined;
  /** Present when the viewer may move it to another pool (an owner or an admin): `''` takes it out of its pool. */
  readonly movePool?: ((poolId: string) => void) | undefined;
}

/** Whose subscription, who it is lent to, and how much of it a day; the credential itself is never shown. */
export function AccountCard({ account, busy, actions, handover, movePool }: AccountCardProps): ReactElement {
  const { t, i18n } = useTranslation();
  const headingId = useId();
  const state = accountState(account);
  const sharedWith = account.sharedWith ?? [];
  const provider = providerOf(account.provider);
  return (
    <article className="o-card o-stack" aria-labelledby={headingId}>
      <div className="o-inline sh-head">
        <h3 id={headingId} className="sh-name">
          {account.label}
        </h3>
        <Badge tone={ACCOUNT_TONES[state]}>
          {state === 'unknown' ? account.status : t(`sharing.accounts.state.${state}`)}
        </Badge>
      </div>
      <p className="o-row__meta">
        {[
          provider === undefined ? account.provider : t(`sharing.provider.${provider}`),
          t('sharing.owner', { owner: account.owner }),
          typeof account.poolId === 'string' && account.poolId !== ''
            ? t('sharing.accounts.pool', { pool: account.poolId })
            : undefined,
          account.dailyAllocationUsd === undefined || account.dailyAllocationUsd === null
            ? t('sharing.accounts.noDaily')
            : t('sharing.accounts.daily', { amount: formatUsd(account.dailyAllocationUsd, i18n.language) }),
        ]
          .filter((part) => part !== undefined)
          .join(' · ')}
      </p>
      <p className="o-row__meta">
        {sharedWith.length === 0
          ? t('sharing.accounts.sharedWithNobody')
          : t('sharing.accounts.sharedWith', { list: sharedWith.join(', ') })}
      </p>
      {state === 'pendingHandover' ? (
        <p className="o-row__meta">{t('sharing.accounts.pendingHint')}</p>
      ) : null}
      {state === 'accessOnly' ? <p className="o-row__meta">{t('sharing.accounts.accessOnlyHint')}</p> : null}
      {handover === undefined || state !== 'pendingHandover' ? null : (
        <HandoverForm label={account.label} busy={busy} onHandover={handover} />
      )}
      {movePool === undefined ? null : (
        // A saved pool starts the field again from it.
        <PoolForm key={account.poolId ?? ''} pool={account.poolId ?? ''} busy={busy} onSave={movePool} />
      )}
      {actions === undefined ? null : (
        <div className="o-inline">
          {/* An account waiting for a sign-in leaves that state only when shared again: the server ignores a pause. */}
          {state === 'expired' || state === 'wrongAccount' ? null : (
            <Button
              disabled={busy}
              onClick={() => {
                actions.setPaused(account.paused !== true);
              }}
            >
              {account.paused === true ? t('sharing.accounts.resume') : t('sharing.accounts.pause')}
            </Button>
          )}
          <ConfirmButton
            label={t('sharing.accounts.remove')}
            confirm={t('sharing.accounts.removeConfirm', { what: account.label })}
            keep={t('sharing.keep')}
            disabled={busy}
            onConfirm={actions.remove}
          />
        </div>
      )}
    </article>
  );
}

/**
 * TeamCode's Handover button: its in-page checkbox stands for `--confirm`, that the account's source (TeamCode, or any
 * other tool) no longer renews its tokens. Two renewers of one refresh token disconnect the account.
 */
function HandoverForm({
  label,
  busy,
  onHandover,
}: {
  readonly label: string;
  readonly busy: boolean;
  readonly onHandover: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const [confirmed, setConfirmed] = useState(false);
  return (
    <div className="o-inline">
      <label className="o-inline">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => {
            setConfirmed(event.target.checked);
          }}
        />
        {t('sharing.accounts.handoverConfirm')}
      </label>
      <Button
        disabled={busy || !confirmed}
        aria-label={t('sharing.accounts.handoverLabel', { what: label })}
        onClick={onHandover}
      >
        {t('sharing.accounts.handover')}
      </Button>
    </div>
  );
}

/** TeamCode's « Pool (empty = shared) » of an account (`PATCH /accounts/{id}` `poolId`), for an administrator. */
function PoolForm({
  pool,
  busy,
  onSave,
}: {
  readonly pool: string;
  readonly busy: boolean;
  readonly onSave: (poolId: string) => void;
}): ReactElement {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(pool);
  const fieldId = useId();
  return (
    <form
      className="o-inline"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(draft.trim());
      }}
    >
      <label htmlFor={fieldId}>{t('sharing.accounts.poolField')}</label>
      <input
        id={fieldId}
        className="o-input sh-amount"
        autoComplete="off"
        maxLength={36}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
      />
      <Button type="submit" disabled={busy || draft.trim() === pool}>
        {t('sharing.accounts.poolSave')}
      </Button>
    </form>
  );
}
