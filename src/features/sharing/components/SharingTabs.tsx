// SPDX-License-Identifier: Apache-2.0
import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';

/** The two sides of the shared accounts: the subscriptions, and the groups they are lent to. */
export function SharingTabs(): ReactElement {
  const { t } = useTranslation();
  return (
    <nav aria-label={t('sharing.tabs.label')} className="sh-tabs">
      <Link to="/accounts" activeOptions={{ exact: true }}>
        {t('sharing.tabs.subscriptions')}
      </Link>
      <Link to="/accounts/groups">{t('sharing.tabs.groups')}</Link>
    </nav>
  );
}
