// SPDX-License-Identifier: AGPL-3.0-only
import type { Approval, Receipt } from '@gen/api/types.gen';
import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { keyIdOf } from '@/shared/lib/signature';
import { formatAbsolute } from '@/shared/lib/time';
import { Badge } from '@/shared/ui/Badge';

export interface DecisionCardProps {
  readonly approval: Approval;
  /** The receipt signed for the answer given on this page, when there is one. */
  readonly receipt: Receipt | undefined;
  /** What the agent was told with a refusal given on this page. */
  readonly comment: string | undefined;
}

/** One sentence a person can repeat; the cryptography stays one click away. */
export function DecisionCard({ approval, receipt, comment }: DecisionCardProps): ReactElement {
  const { t, i18n } = useTranslation();
  const who = approval.decidedBy ?? t('yes.someone');
  const stamp = (iso: string | undefined): string => (iso === undefined ? '' : ` · ${formatAbsolute(iso, i18n.language)}`);
  const sentence = { who, action: approval.title, when: stamp(approval.decidedAt ?? receipt?.createdAt) };
  return (
    <section className="o-card ys-receipt" aria-label={t('yes.receipt.label')}>
      <span className="ys-label">{t('yes.receipt.label')}</span>
      <h2 className="ys-receipt__h">
        {approval.status === 'approved'
          ? t('yes.receipt.approved', sentence)
          : approval.status === 'rejected'
            ? t('yes.receipt.declined', sentence)
            : t('yes.receipt.expired', { when: stamp(approval.expiresAt) })}
      </h2>
      {comment === undefined ? null : <p className="ys-small">{t('yes.receipt.note', { note: comment })}</p>}
      {approval.selfApproved === true ? (
        <p className="ys-small">
          <Badge tone="warning">{t('yes.badge.selfApproved')}</Badge> {t('yes.receipt.selfApproved', { who })}
        </p>
      ) : null}
      {receipt === undefined ? null : (
        <details className="ys-details">
          <summary>{t('yes.receipt.verify')}</summary>
          <dl className="ys-kv">
            <div className="ys-kv__row">
              <dt>{t('yes.receipt.id')}</dt>
              <dd>{receipt.id}</dd>
            </div>
            <div className="ys-kv__row">
              <dt>{t('yes.receipt.digest')}</dt>
              <dd>{receipt.subject.digest}</dd>
            </div>
            <div className="ys-kv__row">
              <dt>{t('yes.receipt.key')}</dt>
              <dd>{`ed25519 · ${keyIdOf(receipt.signature) ?? '?'}`}</dd>
            </div>
          </dl>
          <p className="ys-small ys-meta">{t('yes.receipt.verifyHint')}</p>
          <pre className="ys-cmd">{`ostrom verify ${receipt.id}`}</pre>
          <Link to="/receipts/$receiptId" params={{ receiptId: receipt.id }}>
            {t('yes.receipt.open')}
          </Link>
        </details>
      )}
    </section>
  );
}
