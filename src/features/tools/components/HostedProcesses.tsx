// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { isApiFailure } from '@/shared/api/ApiFailure';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { FailureText } from '@/shared/ui/FailureText';
import { LoadState, Section } from '@/shared/ui/Screen';
import { formatMemory } from '../model';
import { useMcpHosted, useMcpRestart } from '../useTools';
import { HostedState } from './HostedState';

/**
 * The stdio commands Ostrom hosts, one line per process (a shared server once, a per-member server once per member),
 * with its state, its last failure and the end of its stderr, and a Restart. For owners and admins, as the server's
 * `mcp:admin`; members see the state on their own servers instead.
 */
export function HostedProcesses(): ReactElement | null {
  const { t } = useTranslation();
  const view = useMcpHosted();
  const restart = useMcpRestart();
  // No MCP host on this instance (409): the section has nothing to say, and a hosted command cannot be declared.
  if (view.failure !== undefined && view.processes === undefined && isConflict(view.failure)) return null;
  return (
    <Section label={t('tools.hosted.title')}>
      {view.hostReachable === false ? (
        <Banner tone="warning" tag={t('tools.hosted.unreachableTag')} live>
          {t('tools.hosted.unreachable')}
        </Banner>
      ) : null}
      {restart.failure === undefined ? null : (
        <Banner tone="danger" tag={t('tools.errorTag')} live>
          <FailureText failure={restart.failure} />
        </Banner>
      )}
      <LoadState data={view.processes} failure={view.failure}>
        {(processes) =>
          processes.length === 0 ? (
            <p className="o-empty">{t('tools.hosted.empty')}</p>
          ) : (
            <ul className="o-card o-rows">
              {processes.map((process) => {
                const who = process.memberName ?? process.member;
                const label = who === undefined ? process.server : `${process.server} · ${who}`;
                const key = `${process.server}/${process.member ?? ''}`;
                const busy =
                  restart.pending?.server === process.server && restart.pending.member === process.member;
                return (
                  <li key={key} className="o-row tl-hosted">
                    <span className="o-row__main">
                      <span className="o-row__title o-mono">
                        {[process.server, process.memberName ?? process.member]
                          .filter((part) => part !== undefined)
                          .join(' · ')}
                      </span>
                      <span className="o-row__meta o-mono">{`${process.launcher}:${process.package}`}</span>
                      <span className="o-row__meta">
                        {[
                          t('tools.hosted.starts', { count: process.starts }),
                          t('tools.hosted.failures', { count: process.failures }),
                          process.coldStartMs === undefined
                            ? undefined
                            : t('tools.hosted.coldStart', { ms: process.coldStartMs }),
                          process.memoryBytes === undefined ? undefined : formatMemory(process.memoryBytes),
                          process.lastExitCode === undefined
                            ? undefined
                            : t('tools.hosted.exit', { code: process.lastExitCode }),
                        ]
                          .filter((part) => part !== undefined)
                          .join(' · ')}
                      </span>
                      {process.stderr === undefined || process.stderr === '' ? null : (
                        <pre
                          className="tl-stderr o-mono"
                          aria-label={t('tools.hosted.stderr', { server: label })}
                        >
                          {process.stderr}
                        </pre>
                      )}
                    </span>
                    <span className="o-inline">
                      <HostedState state={process.state} failure={process.failure} />
                      <Button
                        disabled={restart.pending !== undefined || view.hostReachable === false}
                        onClick={() => {
                          restart.restart(process);
                        }}
                        aria-label={t('tools.hosted.restartOf', { server: label })}
                      >
                        {busy ? t('tools.hosted.restarting') : t('tools.hosted.restart')}
                      </Button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )
        }
      </LoadState>
    </Section>
  );
}

function isConflict(failure: Error): boolean {
  return isApiFailure(failure) && failure.status === 409 && failure.code === 'conflict';
}
