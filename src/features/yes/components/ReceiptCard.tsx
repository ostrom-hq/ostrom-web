import type { Ask } from '@gen/api/types.gen';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { formatClock } from '@/shared/lib/time';
import { Badge } from '@/shared/ui/Badge';
import { keyIdOf } from '../model';

export interface ReceiptCardProps {
  readonly ask: Ask;
}

const SHORT = 24;

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
  const by = receipt.by ?? ask.decidedBy ?? t('yes.someone');
  const time = formatClock(ask.decidedAt ?? receipt.createdAt, i18n.language);
  const bundle = `/api/receipts/${encodeURIComponent(receipt.id)}/bundle`;
  return (
    <section className="o-card ys-receipt" aria-label={t('yes.receipt.label')}>
      <div className="ys-row">
        <Badge tone={receipt.valid ? 'success' : 'danger'}>
          {receipt.valid ? t('yes.receipt.valid') : t('yes.receipt.invalid')}
        </Badge>
        <span className="ys-grow" />
        <span className="ys-meta">{t('yes.receipt.kind', { kind: receipt.kind })}</span>
      </div>
      <h2 className="ys-receipt__h">
        {receipt.result === 'approved'
          ? t('yes.receipt.headingYes', { login: by, time })
          : t('yes.receipt.headingNo', { login: by, time })}
      </h2>
      {receipt.selfApproved === true ? (
        <p className="ys-small">
          <Badge tone="warning">{t('yes.badge.selfApproved')}</Badge> {t('yes.receipt.selfApproved', { login: by })}
        </p>
      ) : null}
      <dl className="ys-kv">
        <dt>{t('yes.receipt.id')}</dt>
        <dd>{receipt.id}</dd>
        <dt>{t('yes.receipt.digest')}</dt>
        <dd>{`${receipt.digest.slice(0, SHORT)}…`}</dd>
        <dt>{t('yes.receipt.key')}</dt>
        <dd>{`ed25519 · ${keyIdOf(receipt.signature) ?? '?'}`}</dd>
        <dt>{t('yes.receipt.shown')}</dt>
        <dd>{`${ask.shownDigest.slice(0, SHORT)}…`}</dd>
      </dl>
      <p className="ys-small ys-meta">{t('yes.receipt.verifyHint')}</p>
      <pre className="ys-cmd" tabIndex={0}>{`ostrom verify ${receipt.id}.json`}</pre>
      <a className="o-btn o-btn--secondary o-btn--md ys-self-start" href={bundle} download={`${receipt.id}.json`}>
        {t('yes.receipt.download')}
      </a>
    </section>
  );
}
