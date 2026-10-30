// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useNow } from '@/shared/lib/useNow';
import { Banner } from '@/shared/ui/Banner';
import { LoadState, Screen } from '@/shared/ui/Screen';
import { AutomationCard } from '../components/AutomationCard';
import { isDryRun, mayChange } from '../model';
import { useAutomationChange, useAutomations } from '../useCloud';
import './cloud.css';

/** Agents started by a schedule or a signed webhook: what starts each one, what it does, and its runs. */
export function AutomationsScreen(): ReactElement {
  const { t } = useTranslation();
  const view = useAutomations();
  const change = useAutomationChange();
  const now = useNow();
  return (
    <Screen title={t('automations.title')} lead={t('automations.lead')}>
      {change.failure === undefined ? null : (
        <Banner tone="danger" tag={t('automations.errorTag')} live>
          {change.failure.message}
        </Banner>
      )}
      {change.started === undefined ? null : (
        <Banner tag={t('automations.started.tag')} live>
          {isDryRun(change.started)
            ? change.started.problems.length === 0
              ? t('automations.started.dry')
              : t('automations.started.dryProblems', { count: change.started.problems.length })
            : t('automations.started.real', { id: change.started.id })}
        </Banner>
      )}
      <LoadState data={view.automations} failure={view.failure}>
        {(automations) =>
          automations.length === 0 ? (
            <p className="o-empty">{t('automations.empty')}</p>
          ) : (
            <div className="o-stack">
              {automations.map((automation) => (
                <AutomationCard
                  key={automation.id}
                  automation={automation}
                  now={now}
                  busy={change.pending === automation.id}
                  secret={change.secret?.id === automation.id ? change.secret.value : undefined}
                  actions={
                    mayChange(automation.owner, view.viewer, view.canManage)
                      ? {
                          toggle: () => {
                            change.toggle(automation);
                          },
                          run: (dry) => {
                            change.run(automation.id, dry);
                          },
                          rotate: () => {
                            change.rotate(automation.id);
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
