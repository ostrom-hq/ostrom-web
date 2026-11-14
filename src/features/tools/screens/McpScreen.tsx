// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { formatRelative } from '@/shared/lib/time';
import { useNow } from '@/shared/lib/useNow';
import { Banner } from '@/shared/ui/Banner';
import { managesMembers } from '@/shared/org/roles';
import { WithOrg } from '@/shared/org/WithOrg';
import { Feature } from '@/shared/capabilities';
import { Badge } from '@/shared/ui/Badge';
import { LoadState, Screen, Section } from '@/shared/ui/Screen';
import { AddServerForm } from '../components/AddServerForm';
import { HostedProcesses } from '../components/HostedProcesses';
import { PersonalMcpReview } from '../components/PersonalMcpReview';
import { AgentPrefix } from '../components/AgentPrefix';
import { ServerAccess } from '../components/ServerAccess';
import { ServerCard } from '../components/ServerCard';
import { missingSecrets } from '../model';
import { useMcpSettings } from '../useMcpAccess';
import { useMcp, useMcpChange } from '../useTools';
import './tools.css';
import { FailureText } from '@/shared/ui/FailureText';

/** The MCP servers Ostrom relays to every agent of the organization, and what the agents called. */
export function McpScreen(): ReactElement {
  const { t } = useTranslation();
  // The role in the organization the calls act in, from the person's own list: `/auth/me` may not carry it.
  return (
    <WithOrg title={t('tools.mcp.title')}>
      {(_org, role) => <McpServers canManage={managesMembers(role)} />}
    </WithOrg>
  );
}

function McpServers({ canManage }: { readonly canManage: boolean }): ReactElement {
  const { t, i18n } = useTranslation();
  const view = useMcp();
  const change = useMcpChange();
  const settings = useMcpSettings();
  const now = useNow();
  return (
    <Screen title={t('tools.mcp.title')} lead={t('tools.mcp.lead')}>
      {change.failure === undefined ? null : (
        <Banner tone="danger" tag={t('tools.errorTag')} live>
          <FailureText failure={change.failure} />
        </Banner>
      )}
      <AgentPrefix
        settings={settings}
        example={view.servers?.[0]?.name ?? '<server>'}
        canManage={canManage}
      />
      {canManage ? (
        <AddServerForm change={change} />
      ) : (
        <p className="o-screen__lead">{t('tools.mcp.access.membersNote')}</p>
      )}
      <LoadState data={view.servers} failure={view.failure}>
        {(servers) =>
          servers.length === 0 ? (
            <p className="o-empty">{t('tools.mcp.empty')}</p>
          ) : (
            <div className="o-stack">
              {servers.map((server) => (
                <ServerCard
                  key={server.name}
                  server={server}
                  calls={view.callsByServer?.[server.name] ?? 0}
                  missing={view.secrets === undefined ? [] : missingSecrets(server, view.secrets)}
                  busy={change.pending !== undefined}
                  actions={
                    canManage
                      ? {
                          toggle: () => {
                            change.toggle(server);
                          },
                          remove: () => {
                            change.remove(server.name);
                          },
                        }
                      : undefined
                  }
                >
                  {canManage ? <ServerAccess server={server.name} /> : null}
                </ServerCard>
              ))}
            </div>
          )
        }
      </LoadState>
      {canManage ? <HostedProcesses /> : null}
      {canManage ? (
        <Feature name="mcp.personal.v1">
          <PersonalMcpReview />
        </Feature>
      ) : null}
      {view.calls === undefined || view.calls.length === 0 ? null : (
        <Section label={t('tools.mcp.recent')}>
          <ul className="o-card o-rows">
            {view.calls.map((call) => (
              <li key={call.id} className="o-row">
                <span className="o-row__main">
                  <span className="o-row__title o-mono">{`${call.server} · ${call.tool}`}</span>
                  <span className="o-row__meta">
                    {[
                      call.dev,
                      formatRelative(call.at, now, i18n.language),
                      call.durationMs === undefined ? undefined : t('tools.mcp.ms', { ms: call.durationMs }),
                    ]
                      .filter((part) => part !== undefined)
                      .join(' · ')}
                  </span>
                </span>
                <Badge tone={call.ok ? 'success' : 'danger'}>
                  {call.ok ? t('tools.mcp.ok') : t('tools.mcp.failed')}
                </Badge>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </Screen>
  );
}
