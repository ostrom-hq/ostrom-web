// SPDX-License-Identifier: Apache-2.0
import type { Deliverable, WorkflowRun } from '@gen/api/types.gen';
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { Section } from '@/shared/ui/Screen';
import type { DeliveryProblem } from '../runs';
import type { RunActionsViewModel } from '../useRuns';

/**
 * What the agent step the run is at asked to be handed in: the starter writes it here when the agent could not (it is
 * the same delivery the agent makes with its `deliver` tool). It is checked here as the server checks it.
 */
export function DeliverForm({
  run,
  deliverable,
  title,
  actions,
}: {
  readonly run: WorkflowRun;
  readonly deliverable: Deliverable;
  /** The step's title, as the run saw it. */
  readonly title: string;
  readonly actions: RunActionsViewModel;
}): ReactElement {
  const { t } = useTranslation();
  const id = useId();
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<{ readonly kind: DeliveryProblem; readonly detail?: string }>();
  const multiline = deliverable.type === 'json' || deliverable.type === 'text';
  const type =
    deliverable.type === 'json' || deliverable.type === 'url' || deliverable.type === 'artifact'
      ? deliverable.type
      : 'text';
  return (
    <Section label={t('workflows.deliver.title')}>
      <p className="o-screen__lead">
        {t('workflows.deliver.lead', { step: title })}{' '}
        {deliverable.label === undefined ? null : t('workflows.deliver.label', { label: deliverable.label })}
      </p>
      <form
        className="o-stack"
        aria-label={t('workflows.deliver.form')}
        data-run={run.id}
        onSubmit={(event) => {
          event.preventDefault();
          const sent = actions.deliver(text);
          setProblem(
            sent.ok
              ? undefined
              : { kind: sent.problem, ...(sent.detail === undefined ? {} : { detail: sent.detail }) },
          );
        }}
      >
        <label htmlFor={id} className="o-field-label">
          {t(`workflows.deliver.field.${type}`)}
        </label>
        {multiline ? (
          <textarea
            id={id}
            className={type === 'json' ? 'o-input o-mono' : 'o-input'}
            rows={type === 'json' ? 6 : 3}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
            }}
          />
        ) : (
          <input
            id={id}
            className="o-input o-mono"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
            }}
          />
        )}
        {type === 'url' && deliverable.domain !== undefined ? (
          <p className="o-screen__lead">{t('workflows.deliver.onDomain', { domain: deliverable.domain })}</p>
        ) : null}
        {problem === undefined ? null : (
          <p className="o-screen__lead" role="alert">
            {t(`workflows.deliver.problem.${problem.kind}`, { detail: problem.detail })}
          </p>
        )}
        {actions.deliverFailure === undefined ? null : (
          <Banner tone="danger" tag={t('workflows.deliver.failedTag')} live>
            {actions.deliverFailure.message}
          </Banner>
        )}
        <div className="o-inline">
          <Button type="submit" disabled={actions.delivering}>
            {actions.delivering ? t('workflows.deliver.sending') : t('workflows.deliver.send')}
          </Button>
        </div>
      </form>
    </Section>
  );
}
