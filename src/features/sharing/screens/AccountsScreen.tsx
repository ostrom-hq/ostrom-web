// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '@/shared/ui/Banner';
import { LoadState, Screen } from '@/shared/ui/Screen';
import { AccountCard } from '../components/AccountCard';
import { EnrollForm } from '../components/EnrollForm';
import { SharingTabs } from '../components/SharingTabs';
import { useAccountChange, useAccounts } from '../useSharing';
import './sharing.css';

/** Personal AI subscriptions lent to the organization's agents: who uses each one, its daily share, and a pause. */
export function AccountsScreen(): ReactElement {
  const { t } = useTranslation();
  const view = useAccounts();
  const change = useAccountChange();
  return (
    <Screen top={<SharingTabs />} title={t('sharing.accounts.title')} lead={t('sharing.accounts.lead')}>
      {change.failure === undefined ? null : (
        <Banner tone="danger" tag={t('sharing.errorTag')} live>
          {change.failure.message}
        </Banner>
      )}
      {view.secrets === undefined || view.members === undefined ? null : (
        <EnrollForm
          change={change}
          secrets={view.secrets}
          members={view.members.filter((member) => member.login !== view.login)}
        />
      )}
      <LoadState data={view.accounts} failure={view.failure}>
        {(accounts) =>
          accounts.length === 0 ? (
            <p className="o-empty">{t('sharing.accounts.empty')}</p>
          ) : (
            <div className="o-stack">
              {accounts.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  busy={change.pending !== undefined}
                  actions={
                    account.owner === view.login
                      ? {
                          setPaused: (paused) => {
                            change.update(account.id, { paused });
                          },
                          remove: () => {
                            change.remove(account.id);
                          },
                        }
                      : undefined
                  }
                />
              ))}
            </div>
          )
        }
      </LoadState>
    </Screen>
  );
}
