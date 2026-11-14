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
import { StartSessionForm } from '../components/StartSessionForm';
import { isLive, mayChange } from '../model';
import { useCloud, useGithubAccess, useSessionChange } from '../useCloud';
import './cloud.css';

/** Agents that run on the organization's runners, not on a laptop: start one, follow it, stop it. */
export function CloudScreen(): ReactElement {
  const { t, i18n } = useTranslation();
  const view = useCloud();
  const change = useSessionChange();
  const github = useGithubAccess();
  const now = useNow();
  return (
    <Screen title={t('cloud.title')} lead={t('cloud.lead')}>
      {change.failure === undefined ? null : (
        <Banner tone="danger" tag={t('cloud.errorTag')} live>
          {change.failure.message}
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
                      onStop={
                        isLive(session) && mayChange(session.owner, view.viewer, view.canManage)
                          ? () => {
                              change.stop(session.id);
                            }
                          : undefined
                      }
                    />
                    {session.endedAt === undefined ? (
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
      {view.runners === undefined ? null : (
        <Section label={t('cloud.runners.title')}>
          {view.runners.length === 0 ? (
            <p className="o-empty">{t('cloud.runners.empty')}</p>
          ) : (
            <ul className="o-card o-rows">
              {view.runners.map((runner) => (
                <li key={runner.id} className="o-row">
                  <span className="o-row__main">
                    <span className="o-row__title o-mono">{runner.name}</span>
                    <span className="o-row__meta">
                      {[
                        runner.labels.join(', '),
                        runner.version === undefined
                          ? undefined
                          : t('cloud.runners.version', { version: runner.version }),
                        runner.lastSeenAt === undefined
                          ? t('cloud.runners.never')
                          : t('cloud.runners.seen', {
                              when: formatRelative(runner.lastSeenAt, now, i18n.language),
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
              ))}
            </ul>
          )}
        </Section>
      )}
    </Screen>
  );
}
