// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';

const HEADERS = ['delivery', 'event', 'timestamp', 'signature'] as const;

/** How a receiver reads a delivery: its body, its four headers, its signature and when it is retried. */
export function WebhookHelp(): ReactElement {
  const { t } = useTranslation();
  return (
    <details className="o-card wh-help">
      <summary>{t('webhooks.help.title')}</summary>
      <div className="o-stack">
        <p>{t('webhooks.help.body')}</p>
        <ul className="wh-help__headers">
          {HEADERS.map((header) => (
            <li key={header}>
              <code>{t(`webhooks.help.headers.${header}.name`)}</code>
              {' · '}
              {t(`webhooks.help.headers.${header}.about`)}
            </li>
          ))}
        </ul>
        <p>{t('webhooks.help.retries')}</p>
        <p>{t('webhooks.help.scope')}</p>
      </div>
    </details>
  );
}
