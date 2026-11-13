// SPDX-License-Identifier: Apache-2.0
import { type ReactElement, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNow } from '@/shared/lib/useNow';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { LoadState, Screen } from '@/shared/ui/Screen';
import { ownsAutomation } from '../automationDraft';
import { AutomationCard } from '../components/AutomationCard';
import { AutomationForm } from '../components/AutomationForm';
import { isDryRun } from '../model';
import { useAutomationChange, useAutomationEdit, useAutomations } from '../useCloud';
import './cloud.css';

/** Agents started by a schedule or a signed webhook: what starts each one, what it does, and its runs. */
export function AutomationsScreen(): ReactElement {
  const { t } = useTranslation();
  const view = useAutomations();
  const change = useAutomationChange();
  const edit = useAutomationEdit();
  const [writing, setWriting] = useState(false);
  const now = useNow();
  const viewer = { login: view.viewer, memberId: view.memberId };
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
      {writing ? (
        <section className="o-card o-stack" aria-label={t('automations.form.newTitle')}>
          <h2 className="o-label">{t('automations.form.newTitle')}</h2>
          {edit.createFailure === undefined ? null : (
            <Banner tone="danger" tag={t('automations.errorTag')} live>
              {edit.createFailure.message}
            </Banner>
          )}
          <AutomationForm
            saving={edit.creating}
            submit={t('automations.form.create')}
            onCancel={() => {
              setWriting(false);
            }}
            onSave={(write) => {
              edit.create(write, () => {
                setWriting(false);
              });
            }}
          />
        </section>
      ) : (
        <span className="cl-new">
          <Button
            onClick={() => {
              edit.dismiss();
              setWriting(true);
            }}
          >
            {t('automations.form.new')}
          </Button>
        </span>
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
                  busy={change.pending === automation.id || edit.saving === automation.id}
                  secret={
                    change.secret?.id === automation.id
                      ? { value: change.secret.value, created: false }
                      : edit.secret?.id === automation.id
                        ? { value: edit.secret.value, created: true }
                        : undefined
                  }
                  actions={
                    view.canManage || ownsAutomation(automation, viewer)
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
                  edit={
                    ownsAutomation(automation, viewer)
                      ? {
                          saving: edit.saving === automation.id,
                          failure: edit.saveFailure(automation.id),
                          save: (write, onSaved) => {
                            edit.save(automation.id, write, onSaved);
                          },
                          onOpen: edit.dismiss,
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
