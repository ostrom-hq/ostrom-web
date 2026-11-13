// SPDX-License-Identifier: AGPL-3.0-only
import type { SharedAccount } from '@gen/api/types.gen';
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatUsd } from '@/shared/lib/money';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { ConfirmButton } from '@/shared/ui/ConfirmButton';
import { ACCOUNT_TONES, accountState, providerOf } from '../model';

export interface AccountCardProps {
  readonly account: SharedAccount;
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
}

/** Whose subscription, who it is lent to, and how much of it a day; the credential itself is never shown. */
export function AccountCard({ account, busy, actions, handover }: AccountCardProps): ReactElement {
  const { t, i18n } = useTranslation();
  const headingId = useId();
  const state = accountState(account);
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
          account.pool === undefined ? undefined : t('sharing.accounts.pool', { pool: account.pool }),
          account.dailyAllocationUsd === undefined
            ? t('sharing.accounts.noDaily')
            : t('sharing.accounts.daily', { amount: formatUsd(account.dailyAllocationUsd, i18n.language) }),
        ]
          .filter((part) => part !== undefined)
          .join(' · ')}
      </p>
      <p className="o-row__meta">
        {account.sharedWith.length === 0
          ? t('sharing.accounts.sharedWithNobody')
          : t('sharing.accounts.sharedWith', { list: account.sharedWith.join(', ') })}
      </p>
      {state === 'pendingHandover' ? (
        <p className="o-row__meta">{t('sharing.accounts.pendingHint')}</p>
      ) : null}
      {state === 'accessOnly' ? <p className="o-row__meta">{t('sharing.accounts.accessOnlyHint')}</p> : null}
      {handover === undefined || state !== 'pendingHandover' ? null : (
        <HandoverForm label={account.label} busy={busy} onHandover={handover} />
      )}
      {actions === undefined ? null : (
        <div className="o-inline">
          {/* An account waiting for a sign-in leaves that state only when shared again: the server ignores a pause. */}
          {state === 'expired' || state === 'wrongAccount' ? null : (
            <Button
              disabled={busy}
              onClick={() => {
                actions.setPaused(!account.paused);
              }}
            >
              {account.paused ? t('sharing.accounts.resume') : t('sharing.accounts.pause')}
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
