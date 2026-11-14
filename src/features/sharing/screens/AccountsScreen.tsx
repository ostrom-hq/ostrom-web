// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { useFeature } from '@/shared/capabilities';
import { managesMembers } from '@/shared/org/roles';
import { useCurrentOrg } from '@/shared/org/useCurrentOrg';
import { Banner } from '@/shared/ui/Banner';
import { LoadState, Screen } from '@/shared/ui/Screen';
import { AccountCard } from '../components/AccountCard';
import { EnrollForm } from '../components/EnrollForm';
import { SharingTabs } from '../components/SharingTabs';
import { waitsForHandover } from '../model';
import { useAccountChange, useAccounts } from '../useSharing';
import './sharing.css';

/** Personal AI subscriptions lent to the organization's agents: who uses each one, its daily share, and a pause. */
export function AccountsScreen(): ReactElement {
  const { t } = useTranslation();
  const view = useAccounts();
  const change = useAccountChange();
  // TeamCode's « Refresh ownership »: only an administrator hands an imported account over, where the server can.
  const handoverServed = useFeature('sharing.handover.v1');
  const { role } = useCurrentOrg();
  const handsOver = handoverServed && managesMembers(role);
  const waiting = view.accounts?.filter(waitsForHandover).length ?? 0;
  return (
    <Screen top={<SharingTabs />} title={t('sharing.accounts.title')} lead={t('sharing.accounts.lead')}>
      {change.failure === undefined ? null : (
        <Banner tone="danger" tag={t('sharing.errorTag')} live>
          {change.failure.message}
        </Banner>
      )}
      {waiting === 0 ? null : (
        <Banner tone="warning" tag={t('sharing.accounts.pendingTag')}>
          {t('sharing.accounts.pendingBanner', { count: waiting })}
        </Banner>
      )}
      {view.secrets === undefined || view.members === undefined ? null : (
        <EnrollForm
          change={change}
          secrets={view.secrets}
          members={view.members.filter((member) => member.login !== view.login)}
          people={view.people}
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
                  handover={
                    handsOver
                      ? () => {
                          change.handover(account.id);
                        }
                      : undefined
                  }
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
