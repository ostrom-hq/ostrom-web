// SPDX-License-Identifier: Apache-2.0
import type { CloudSession, CloudTransferRecipient } from '@gen/api/types.gen';
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { Button } from '@/shared/ui/Button';
import { transferRefusalOf } from '../transfer';

export interface TransferControlProps {
  readonly session: CloudSession;
  /** The members the session can be given to; the server refuses the list when transfers are not offered. */
  readonly recipients: readonly CloudTransferRecipient[];
  /** Why the list could not be read, as the server wrote it: said in place of "no other member". */
  readonly recipientsFailure?: Error | undefined;
  /** Whether an administrator gives the session (the transfer is then accepted at once), or a member offers it. */
  readonly canManage: boolean;
  readonly busy: boolean;
  readonly onOffer: (toMemberId: string, resume: boolean, onDone: () => void) => void;
}

/** Gives a session to another member: pick who, say whether it resumes for them, then send. */
export function TransferControl({
  session,
  recipients,
  recipientsFailure,
  canManage,
  busy,
  onOffer,
}: TransferControlProps): ReactElement {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [member, setMember] = useState('');
  const [resume, setResume] = useState(false);
  const pickId = useId();
  const resumeId = useId();
  const recipientRefusal = recipientsFailure === undefined ? undefined : transferRefusalOf(recipientsFailure);
  const candidates = recipients.filter((recipient) => recipient.login !== session.owner);
  if (!open) {
    return (
      <div className="cl-transfer">
        <Button
          variant="secondary"
          onClick={() => {
            setOpen(true);
          }}
        >
          {t('cloud.transfer.action')}
        </Button>
      </div>
    );
  }
  return (
    <div className="o-stack cl-transfer">
      <label htmlFor={pickId} className="o-field-label">
        {t('cloud.transfer.to')}
      </label>
      <select
        id={pickId}
        className="o-input o-select"
        value={member}
        disabled={busy}
        onChange={(event) => {
          setMember(event.target.value);
        }}
      >
        <option value="">{t('cloud.transfer.pick')}</option>
        {candidates.map((recipient) => (
          <option key={recipient.id} value={recipient.id}>
            {recipient.administrator
              ? t('cloud.transfer.admin', { login: recipient.login })
              : recipient.login}
          </option>
        ))}
      </select>
      {candidates.length === 0 ? (
        <span className="o-row__meta">
          {recipientsFailure === undefined
            ? t('cloud.transfer.noRecipient')
            : recipientRefusal === undefined
              ? recipientsFailure.message
              : t(`cloud.transfer.refusal.${recipientRefusal}`)}
        </span>
      ) : null}
      <label htmlFor={resumeId} className="o-inline">
        <input
          id={resumeId}
          type="checkbox"
          checked={resume}
          disabled={busy}
          onChange={(event) => {
            setResume(event.target.checked);
          }}
        />
        {t('cloud.transfer.resume')}
      </label>
      <span className="o-row__meta">
        {canManage ? t('cloud.transfer.hintNow') : t('cloud.transfer.hintOffer')}
      </span>
      <span className="o-inline">
        <Button
          disabled={busy || !candidates.some((recipient) => recipient.id === member)}
          onClick={() => {
            onOffer(member, resume, () => {
              setOpen(false);
              setMember('');
              setResume(false);
            });
          }}
        >
          {busy
            ? t('cloud.transfer.sending')
            : canManage
              ? t('cloud.transfer.give')
              : t('cloud.transfer.offer')}
        </Button>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => {
            setOpen(false);
          }}
        >
          {t('cloud.transfer.keep')}
        </Button>
      </span>
    </div>
  );
}
