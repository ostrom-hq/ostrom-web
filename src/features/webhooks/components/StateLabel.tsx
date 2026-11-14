// SPDX-License-Identifier: Apache-2.0
import type { Webhook } from '@gen/api/types.gen';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useEnumLabel } from '@/shared/i18n/enumLabel';
import { Badge } from '@/shared/ui/Badge';

/** "Enabled", or "Disabled · why" (`disabled` is a person's pause, `too_many_failures` the server's). */
export function StateLabel({ webhook }: { readonly webhook: Webhook }): ReactElement {
  const { t } = useTranslation();
  const label = useEnumLabel();
  if (webhook.enabled) return <Badge tone="success">{t('webhooks.state.enabled')}</Badge>;
  const reason = webhook.disabledReason;
  return (
    <Badge tone="warning">
      {reason === undefined
        ? t('webhooks.state.disabled')
        : `${t('webhooks.state.disabled')} · ${label('webhooks.state.reasons', reason)}`}
    </Badge>
  );
}
