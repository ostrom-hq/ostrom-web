// SPDX-License-Identifier: Apache-2.0
import type { Webhook } from '@gen/api/types.gen';
import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { StateLabel } from './StateLabel';

/** One webhook of the list: its URL (a link to its page), its label, the events it receives and its state. */
export function WebhookRow({ webhook }: { readonly webhook: Webhook }): ReactElement {
  return (
    <div className="o-row">
      <span className="o-row__main">
        <Link to="/webhooks/$webhookId" params={{ webhookId: webhook.id }} className="o-row__title">
          {webhook.url}
        </Link>
        {webhook.description === '' ? null : <span className="o-row__meta">{webhook.description}</span>}
        <span className="o-row__meta o-mono">{webhook.types.join(', ')}</span>
      </span>
      <span className="o-row__end">
        <StateLabel webhook={webhook} />
      </span>
    </div>
  );
}
