// SPDX-License-Identifier: AGPL-3.0-only
import type { Receipt } from '@gen/api/types.gen';
import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useEnumLabel } from '@/shared/i18n/enumLabel';
import { formatAbsolute, formatRelative } from '@/shared/lib/time';
import { useNow } from '@/shared/lib/useNow';
import { Badge } from '@/shared/ui/Badge';
import { EmptyState, LoadState, Screen } from '@/shared/ui/Screen';
import { useReceiptList } from '../useReceipts';

export function ReceiptsScreen(): ReactElement {
  const { t } = useTranslation();
  const { receipts, failure } = useReceiptList();
  return (
    <Screen title={t('receipts.list.title')} lead={t('receipts.list.lead')}>
      <LoadState data={receipts} failure={failure}>
        {(items) =>
          items.length === 0 ? (
            <EmptyState title={t('receipts.list.emptyTitle')}>{t('receipts.list.emptyBody')}</EmptyState>
          ) : (
            <ul className="o-card o-rows">
              {items.map((receipt) => (
                <li key={receipt.id}>
                  <ReceiptRow receipt={receipt} />
                </li>
              ))}
            </ul>
          )
        }
      </LoadState>
    </Screen>
  );
}

function ReceiptRow({ receipt }: { readonly receipt: Receipt }): ReactElement {
  const { t, i18n } = useTranslation();
  const enumText = useEnumLabel();
  const now = useNow();
  return (
    <Link to="/receipts/$receiptId" params={{ receiptId: receipt.id }} className="o-row">
      <Badge>{enumText('receipts.kind', receipt.subject.kind)}</Badge>
      <span className="o-row__main">
        <span className="o-row__title">{receipt.subject.id}</span>
        <span className="o-row__meta">
          {t('receipts.list.meta', { initiator: receipt.initiator, count: receipt.decisions.length })}
        </span>
      </span>
      <time
        className="o-row__end"
        dateTime={receipt.createdAt}
        title={formatAbsolute(receipt.createdAt, i18n.language)}
      >
        {formatRelative(receipt.createdAt, now, i18n.language)}
      </time>
    </Link>
  );
}
