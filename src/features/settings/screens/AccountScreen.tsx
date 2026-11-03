// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Screen } from '@/shared/ui/Screen';
import { DevicesSection } from '../components/DevicesSection';
import { GithubLinkSection } from '../components/GithubLinkSection';
import { SecuritySection } from '../components/SecuritySection';
import { useGithubLink } from '../useAccount';
import { useDevices } from '../useKeysAndDevices';
import { useAuthSessions, useSessionActions } from '../useSettings';

/**
 * The person's own account, in no organization: where they are signed in (browsers and `ostrom login`) and whether
 * their GitHub is linked. A person who has no organization yet reads it too.
 */
export function AccountScreen(): ReactElement {
  const { t } = useTranslation();
  const github = useGithubLink();
  const sessions = useAuthSessions();
  const sessionActions = useSessionActions();
  const devices = useDevices(true);
  const login = github.account?.login;
  return (
    <Screen
      title={t('account.title')}
      lead={login === undefined ? t('account.lead') : t('account.leadAs', { login })}
    >
      <GithubLinkSection view={github} />
      <SecuritySection view={sessions} actions={sessionActions} back="/account" />
      <DevicesSection view={devices} />
    </Screen>
  );
}
