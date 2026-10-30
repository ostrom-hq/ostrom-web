// SPDX-License-Identifier: AGPL-3.0-only
import type { Ask } from '@gen/api/types.gen';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { formatAbsolute } from '@/shared/lib/time';
import { Badge } from '@/shared/ui/Badge';
import { keyIdOf } from '../model';

export interface ReceiptCardProps {
  readonly ask: Ask;
}

/** One sentence a person can repeat; the cryptography stays one click away. */
export function ReceiptCard({ ask }: ReceiptCardProps): ReactElement {
  const { t, i18n } = useTranslation();
  const receipt = ask.receipt;
  if (receipt === undefined) {
    return (
      <section className="o-card ys-receipt" aria-label={t('yes.receipt.label')}>
        <span className="ys-meta">{t('yes.receipt.pending')}</span>
      </section>
    );
  }
  const who = receipt.by ?? ask.decidedBy ?? t('yes.someone');
  const sentence = {
    who,
    action: ask.what.action ?? ask.title,
    when: formatAbsolute(ask.decidedAt ?? receipt.createdAt, i18n.language),
  };
  return (
    <section className="o-card ys-receipt" aria-label={t('yes.receipt.label')}>
      <div className="ys-row">
        <span className="ys-label ys-grow">{t('yes.receipt.label')}</span>
        <Badge tone={receipt.valid ? 'success' : 'danger'}>
          {receipt.valid ? t('yes.receipt.valid') : t('yes.receipt.invalid')}
        </Badge>
      </div>
      <h2 className="ys-receipt__h">
        {receipt.result === 'approved'
          ? t('yes.receipt.approved', sentence)
          : t('yes.receipt.declined', sentence)}
      </h2>
      {ask.note === undefined ? null : (
        <p className="ys-small">{t('yes.receipt.note', { note: ask.note })}</p>
      )}
      {receipt.selfApproved === true ? (
        <p className="ys-small">
          <Badge tone="warning">{t('yes.badge.selfApproved')}</Badge> {t('yes.receipt.selfApproved', { who })}
        </p>
      ) : null}
      <details className="ys-details">
        <summary>{t('yes.receipt.verify')}</summary>
        <dl className="ys-kv">
          <div className="ys-kv__row">
            <dt>{t('yes.receipt.id')}</dt>
            <dd>{receipt.id}</dd>
          </div>
          <div className="ys-kv__row">
            <dt>{t('yes.receipt.digest')}</dt>
            <dd>{receipt.digest}</dd>
          </div>
          <div className="ys-kv__row">
            <dt>{t('yes.receipt.key')}</dt>
            <dd>{`ed25519 · ${keyIdOf(receipt.signature) ?? '?'}`}</dd>
          </div>
          <div className="ys-kv__row">
            <dt>{t('yes.receipt.shown')}</dt>
            <dd>{ask.shownDigest}</dd>
          </div>
        </dl>
        <p className="ys-small ys-meta">{t('yes.receipt.verifyHint')}</p>
        <pre className="ys-cmd">{`ostrom verify ${receipt.id}.json`}</pre>
        <a
          className="o-btn o-btn--secondary o-btn--md ys-self-start"
          href={`/api/receipts/${encodeURIComponent(receipt.id)}/bundle`}
          download={`${receipt.id}.json`}
        >
          {t('yes.receipt.download')}
        </a>
      </details>
    </section>
  );
}
