// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';

/** What a variant is, who receives it and where it reaches a session, as TeamCode's page opens with. */
export function EnvironmentHelp(): ReactElement {
  const { t } = useTranslation();
  return (
    <details className="o-card env-help" open>
      <summary>{t('environment.help.title')}</summary>
      <div className="o-stack">
        <p>{t('environment.help.what')}</p>
        <p>{t('environment.help.who')}</p>
        <p>{t('environment.help.where')}</p>
      </div>
    </details>
  );
}
