// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { WithOrg } from '@/shared/org/WithOrg';
import { Banner } from '@/shared/ui/Banner';
import { FailureText } from '@/shared/ui/FailureText';
import { LoadState, Screen } from '@/shared/ui/Screen';
import { AddServerForm } from '../components/AddServerForm';
import { ServerCard } from '../components/ServerCard';
import { usePersonalMcp, usePersonalMcpChange } from '../usePersonalMcp';
import './tools.css';

/** The person's own MCP servers: relayed to them alone, until an administrator promotes one to the team. */
export function PersonalMcpScreen(): ReactElement {
  const { t } = useTranslation();
  return <WithOrg title={t('tools.mine.title')}>{() => <PersonalMcp />}</WithOrg>;
}

function PersonalMcp(): ReactElement {
  const { t } = useTranslation();
  const view = usePersonalMcp();
  const change = usePersonalMcpChange();
  return (
    <Screen title={t('tools.mine.title')} lead={t('tools.mine.lead')}>
      {change.failure === undefined ? null : (
        <Banner tone="danger" tag={t('tools.errorTag')} live>
          <FailureText failure={change.failure} />
        </Banner>
      )}
      <AddServerForm change={change} />
      <LoadState data={view.servers} failure={view.failure}>
        {(servers) =>
          servers.length === 0 ? (
            <p className="o-empty">{t('tools.mine.empty')}</p>
          ) : (
            <div className="o-stack">
              {servers.map((server) => (
                <ServerCard
                  key={server.name}
                  server={server}
                  calls={view.callsByServer?.[server.name] ?? 0}
                  missing={[]}
                  busy={change.pending !== undefined}
                  actions={{
                    toggle: () => {
                      change.toggle(server);
                    },
                    remove: () => {
                      change.remove(server.name);
                    },
                  }}
                />
              ))}
            </div>
          )
        }
      </LoadState>
    </Screen>
  );
}
