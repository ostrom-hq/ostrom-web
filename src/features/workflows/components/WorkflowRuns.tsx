// SPDX-License-Identifier: Apache-2.0
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { Section } from '@/shared/ui/Screen';
import { startProblem } from '../runs';
import { useStartRun, useWorkflowRuns } from '../useRuns';
import { RunList } from './RunList';
import type { Workflow } from '@/shared/api/workflowDocument';

/** A workflow's runs, and for an owner or an admin the form that starts one with its inputs. */
export function WorkflowRuns({ workflow }: { readonly workflow: Workflow }): ReactElement {
  const { t } = useTranslation();
  const list = useWorkflowRuns(workflow.id);
  const run = useStartRun(workflow);
  return (
    <Section label={t('workflows.runs.title')}>
      {run.canStart ? <StartForm workflow={workflow} run={run} /> : null}
      {run.acceptFirst ? <p className="o-screen__lead">{t('workflows.runs.acceptFirst')}</p> : null}
      {run.rejected ? <p className="o-screen__lead">{t('workflows.runs.rejected')}</p> : null}
      {run.failure === undefined ? null : (
        <Banner tone="danger" tag={t('workflows.runs.startFailedTag')} live>
          {run.failure.message}
        </Banner>
      )}
      <RunList list={list} withWorkflow={false} />
    </Section>
  );
}

/**
 * The inputs the workflow asks for, then the button. A workflow that asks for nothing is one button. What is missing
 * is said before the server is asked.
 */
function StartForm({
  workflow,
  run,
}: {
  readonly workflow: Workflow;
  readonly run: ReturnType<typeof useStartRun>;
}): ReactElement {
  const { t } = useTranslation();
  const inputs = workflow.inputs ?? [];
  const inputIds = useId();
  // What is typed for each input, in the order the workflow lists them.
  const [drafts, setDrafts] = useState(() => inputs.map((input) => ({ input, value: input.default ?? '' })));
  const values = Object.fromEntries(drafts.map((draft) => [draft.input.id, draft.value]));
  const problem = startProblem(inputs, values);
  const blocked = problem !== undefined;
  return (
    <form
      className="o-stack"
      aria-label={t('workflows.runs.startForm')}
      onSubmit={(event) => {
        event.preventDefault();
        if (!blocked) run.start({ inputs: values });
      }}
    >
      {drafts.map(({ input, value }, at) => (
        <span key={input.id} className="o-stack">
          <label htmlFor={`${inputIds}-${input.id}`} className="o-field-label">
            {input.label}
            {input.required === true ? ` ${t('workflows.runs.required')}` : ''}
          </label>
          <input
            id={`${inputIds}-${input.id}`}
            className="o-input"
            {...(input.maxLength === undefined ? {} : { maxLength: input.maxLength })}
            value={value}
            onChange={(event) => {
              setDrafts(
                drafts.map((draft, index) =>
                  index === at ? { ...draft, value: event.target.value } : draft,
                ),
              );
            }}
          />
        </span>
      ))}
      {problem === undefined ? null : (
        <p className="o-screen__lead">
          {t(`workflows.runs.problem.${problem.kind}`, { input: problem.label })}
        </p>
      )}
      <div className="o-inline">
        <Button type="submit" disabled={run.starting || blocked}>
          {run.starting ? t('workflows.runs.starting') : t('workflows.runs.start')}
        </Button>
      </div>
    </form>
  );
}
