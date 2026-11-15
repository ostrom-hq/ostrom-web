// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { WithOrg } from '@/shared/org/WithOrg';
import { Screen } from '@/shared/ui/Screen';
import { PhonesSection } from '../components/PhonesSection';
import { PhoneSection } from '../components/PhoneSection';
import { SlackSection } from '../components/SlackSection';
import { SwitchesSection } from '../components/SwitchesSection';
import { TestSection } from '../components/TestSection';

/**
 * The person's own notifications: what they are told about in this organization, per kind and channel; what their
 * phone tells them about approvals; their Slack account; and a test notification to their phones.
 */
export function NotificationsScreen(): ReactElement {
  const { t } = useTranslation();
  return (
    <WithOrg title={t('notifications.title')}>
      {(org) => (
        <Screen title={t('notifications.title')} lead={t('notifications.lead', { name: org.name })}>
          <SwitchesSection />
          <SlackSection />
          <PhoneSection />
          <PhonesSection />
          <TestSection />
        </Screen>
      )}
    </WithOrg>
  );
}
