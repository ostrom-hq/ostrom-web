// SPDX-License-Identifier: Apache-2.0
import type { CloudSessionResponse, CloudTransferResponse } from '@gen/api/types.gen';
import type { ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { formatRelative } from '@/shared/lib/time';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { ConfirmButton } from '@/shared/ui/ConfirmButton';
import { isTransferState, isOpenTransfer, memberLabel, transferTone } from '../transfer';

export interface TransfersSectionProps {
  readonly transfers: readonly CloudTransferResponse[];
  readonly sessions: readonly CloudSessionResponse[];
  readonly logins: ReadonlyMap<string, string>;
  readonly now: Date;
  /** The caller's member id: a transfer made to them is theirs to accept or decline. */
  readonly memberId: string | undefined;
  /** An owner or an admin may cancel an accepted transfer too; a member only the offer. */
  readonly canManage: boolean;
  readonly busy: string | undefined;
  readonly onAccept: (id: string) => void;
  readonly onDecline: (id: string) => void;
  readonly onCancel: (id: string) => void;
}

/** The caller's transfers, newest first: the recipient answers an offer, the owner withdraws it. */
export function TransfersSection({
  transfers,
  sessions,
  logins,
  now,
  memberId,
  canManage,
  busy,
  onAccept,
  onDecline,
  onCancel,
}: TransfersSectionProps): ReactElement {
  const { t, i18n } = useTranslation();
  return (
    <ul className="o-card o-rows">
      {transfers.map((transfer) => {
        const session = sessions.find((item) => item.id === transfer.sessionId);
        const title = session?.name ?? session?.id ?? transfer.sessionId;
        const incoming = transfer.toMemberId === memberId;
        const open = isOpenTransfer(transfer);
        // The owner withdraws their offer; a manager withdraws any open transfer.
        const mayCancel = open && !incoming && (canManage || transfer.fromMemberId === memberId);
        return (
          <li key={transfer.id} className="o-row cl-transfer-row">
            <span className="o-row__main">
              <span className="o-row__title">{title}</span>
              <span className="o-row__meta">
                {[
                  t('cloud.transfer.fromTo', {
                    from: memberLabel(transfer.fromMemberId, logins),
                    to: memberLabel(transfer.toMemberId, logins),
                  }),
                  transfer.resume ? t('cloud.transfer.resumes') : undefined,
                  t('cloud.transfer.asked', { when: formatRelative(transfer.createdAt, now, i18n.language) }),
                  transfer.state === 'offered' && typeof transfer.expiresAt === 'string'
                    ? t('cloud.transfer.expires', {
                        when: formatRelative(transfer.expiresAt, now, i18n.language),
                      })
                    : undefined,
                ]
                  .filter((part) => part !== undefined)
                  .join(' · ')}
              </span>
              {transfer.failure ? (
                <span className="cl-session__failure">{transfer.failure.message}</span>
              ) : null}
            </span>
            <span className="o-inline">
              <Badge tone={transferTone(transfer.state)}>
                {isTransferState(transfer.state)
                  ? t(`cloud.transfer.state.${transfer.state}`)
                  : transfer.state}
              </Badge>
              {open && incoming && transfer.state === 'offered' ? (
                <>
                  <Button
                    disabled={busy === transfer.id}
                    onClick={() => {
                      onAccept(transfer.id);
                    }}
                  >
                    {t('cloud.transfer.accept')}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busy === transfer.id}
                    onClick={() => {
                      onDecline(transfer.id);
                    }}
                  >
                    {t('cloud.transfer.decline')}
                  </Button>
                </>
              ) : null}
              {mayCancel ? (
                <ConfirmButton
                  label={t('cloud.transfer.cancel')}
                  confirm={t('cloud.transfer.confirmCancel', { what: title })}
                  keep={t('cloud.transfer.keepIt')}
                  disabled={busy === transfer.id}
                  onConfirm={() => {
                    onCancel(transfer.id);
                  }}
                />
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
