// SPDX-License-Identifier: Apache-2.0
import type { WebhookDelivery } from '@gen/api/types.gen';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useEnumLabel } from '@/shared/i18n/enumLabel';
import { lastAnswer, utcTime } from '../model';

export interface DeliveriesTableProps {
  readonly deliveries: readonly WebhookDelivery[];
}

/** The latest deliveries: when, which event, where it stands, how many attempts, and what the receiver answered. */
export function DeliveriesTable({ deliveries }: DeliveriesTableProps): ReactElement {
  const { t } = useTranslation();
  const label = useEnumLabel();
  return (
    <div className="wh-scroll">
      <table className="wh-table">
        <caption className="o-row__meta">{t('webhooks.deliveries.caption')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('webhooks.deliveries.created')}</th>
            <th scope="col">{t('webhooks.deliveries.event')}</th>
            <th scope="col">{t('webhooks.deliveries.state')}</th>
            <th scope="col">{t('webhooks.deliveries.attempts')}</th>
            <th scope="col">{t('webhooks.deliveries.answer')}</th>
          </tr>
        </thead>
        <tbody>
          {deliveries.map((delivery) => (
            <tr key={delivery.id}>
              <td>{utcTime(delivery.createdAt)}</td>
              <td className="o-mono">
                {delivery.eventType}
                {delivery.eventSeq === undefined ? '' : ` #${String(delivery.eventSeq)}`}
              </td>
              <td>{label('webhooks.deliveries.states', delivery.state)}</td>
              <td>
                {String(delivery.attempts)}
                {delivery.state === 'pending' && delivery.nextAttemptAt !== undefined
                  ? ` · ${t('webhooks.deliveries.next', { at: utcTime(delivery.nextAttemptAt) })}`
                  : ''}
              </td>
              <td className="o-mono">{lastAnswer(delivery)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
