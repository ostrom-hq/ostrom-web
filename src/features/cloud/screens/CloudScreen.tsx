// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { formatRelative } from '@/shared/lib/time';
import { useNow } from '@/shared/lib/useNow';
import { Feature } from '@/shared/capabilities';
import { Badge } from '@/shared/ui/Badge';
import { Banner } from '@/shared/ui/Banner';
import { LoadState, Screen, Section } from '@/shared/ui/Screen';
import { GithubAccessControl } from '../components/GithubAccessControl';
import { SessionRow } from '../components/SessionRow';
import { TransferControl } from '../components/TransferControl';
import { TransfersSection } from '../components/TransfersSection';
import { StartSessionForm } from '../components/StartSessionForm';
import { isLive, mayChange, startRefusalOf } from '../model';
import { mayTransfer, transferRefusalOf } from '../transfer';
import { useCloud, useGithubAccess, useSessionChange, useStartProfiles } from '../useCloud';
import { useTransferChange, useTransfers } from '../useTransfers';
import './cloud.css';

/** Agents that run on the organization's runners, not on a laptop: start one, follow it, stop it. */
export function CloudScreen(): ReactElement {
  const { t, i18n } = useTranslation();
  const view = useCloud();
  const change = useSessionChange();
  const github = useGithubAccess();
  const { profiles } = useStartProfiles();
  const transfers = useTransfers();
  const transferChange = useTransferChange();
  const transferRefusal =
    transferChange.failure === undefined ? undefined : transferRefusalOf(transferChange.failure);
  const refusal = change.startFailure === undefined ? undefined : startRefusalOf(change.startFailure);
  const now = useNow();
  return (
    <Screen title={t('cloud.title')} lead={t('cloud.lead')}>
      {change.failure === undefined ? null : (
        <Banner tone="danger" tag={t('cloud.errorTag')} live>
          {refusal === undefined ? change.failure.message : t(`cloud.start.refusal.${refusal}`)}
        </Banner>
      )}
      {transferChange.failure === undefined ? null : (
        <Banner tone="danger" tag={t('cloud.errorTag')} live>
          {transferRefusal === undefined
            ? transferChange.failure.message
            : t(`cloud.transfer.refusal.${transferRefusal}`)}
        </Banner>
      )}
      <StartSessionForm change={change} />
      <Section label={t('cloud.sessions')}>
        <LoadState data={view.sessions} failure={view.failure}>
          {(sessions) =>
            sessions.length === 0 ? (
              <p className="o-empty">{t('cloud.empty')}</p>
            ) : (
              <ul className="o-card o-rows">
                {sessions.map((session) => (
                  <li key={session.id}>
                    <SessionRow
                      session={session}
                      now={now}
                      busy={change.stopping === session.id}
                      profileName={profiles?.find((item) => item.id === session.profile?.id)?.name}
                      onStop={
                        isLive(session) && mayChange(session.owner, view.viewer, view.canManage)
                          ? () => {
                              change.stop(session.id);
                            }
                          : undefined
                      }
                    />
                    {mayTransfer(session, view.viewer, view.canManage) ? (
                      <Feature name="runners.cloud.transfer.v1">
                        <TransferControl
                          session={session}
                          recipients={transfers.recipients}
                          recipientsFailure={transfers.recipientsFailure}
                          canManage={view.canManage}
                          busy={transferChange.busy === session.id}
                          onOffer={(to, resume, onDone) => {
                            transferChange.offer(session.id, to, resume, onDone);
                          }}
                        />
                      </Feature>
                    ) : null}
                    {typeof session.endedAt !== 'string' ? (
                      <Feature name="runners.cloud.github.v1">
                        <GithubAccessControl
                          session={session}
                          mine={session.owner === view.viewer}
                          busy={github.changing === session.id}
                          failure={github.failure(session.id)}
                          onChange={(access) => {
                            github.change(session.id, access);
                          }}
                        />
                      </Feature>
                    ) : null}
                  </li>
                ))}
              </ul>
            )
          }
        </LoadState>
      </Section>
      <Feature name="runners.cloud.transfer.v1">
        {transfers.transfers === undefined || transfers.transfers.length === 0 ? null : (
          <Section label={t('cloud.transfer.title')}>
            <TransfersSection
              transfers={transfers.transfers}
              sessions={view.sessions ?? []}
              logins={transfers.logins}
              now={now}
              memberId={transfers.memberId}
              canManage={transfers.canManage}
              busy={transferChange.busy}
              onAccept={transferChange.accept}
              onDecline={transferChange.decline}
              onCancel={transferChange.cancel}
            />
          </Section>
        )}
      </Feature>
      {view.runners === undefined ? null : (
        <Section label={t('cloud.runners.title')}>
          {view.runners.length === 0 ? (
            <p className="o-empty">{t('cloud.runners.empty')}</p>
          ) : (
            <ul className="o-card o-rows">
              {view.runners.map((runner) => {
                const version = runner.version ?? undefined;
                const lastSeenAt = runner.lastSeenAt ?? undefined;
                return (
                  <li key={runner.id} className="o-row">
                    <span className="o-row__main">
                      <span className="o-row__title o-mono">{runner.name}</span>
                      <span className="o-row__meta">
                        {[
                          runner.labels.join(', '),
                          version === undefined ? undefined : t('cloud.runners.version', { version }),
                          lastSeenAt === undefined
                            ? t('cloud.runners.never')
                            : t('cloud.runners.seen', {
                                when: formatRelative(lastSeenAt, now, i18n.language),
                              }),
                        ]
                          .filter((part) => part !== undefined && part !== '')
                          .join(' · ')}
                      </span>
                    </span>
                    <Badge tone={runner.status === 'online' ? 'success' : 'neutral'}>
                      {runner.status === 'online' ? t('cloud.runners.online') : t('cloud.runners.offline')}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      )}
    </Screen>
  );
}
