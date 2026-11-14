// SPDX-License-Identifier: Apache-2.0
import type { Workflow } from '@gen/api/types.gen';
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { Section } from '@/shared/ui/Screen';
import { needsRepository, repositoryOk, startProblem } from '../runs';
import { useStartRun, useWorkflowRuns } from '../useRuns';
import { RunList } from './RunList';

/** A workflow's runs, and for an owner or an admin the form that starts one: its inputs, and the repository. */
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
 * The inputs the workflow asks for, and the repository its agent steps work in, then the button. A workflow that asks
 * for nothing is one button, as before. What is missing is said before the server is asked.
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
  const repositoryId = useId();
  const inputIds = useId();
  // What is typed for each input, in the order the workflow lists them.
  const [drafts, setDrafts] = useState(() => inputs.map((input) => ({ input, value: input.default ?? '' })));
  const values = Object.fromEntries(drafts.map((draft) => [draft.input.id, draft.value]));
  const [repository, setRepository] = useState('');
  const asksRepository = run.withRepository && workflow.nodes.some((node) => node.kind === 'agent');
  const missingRepository = asksRepository && needsRepository(workflow) && repository.trim() === '';
  const badRepository = asksRepository && !repositoryOk(repository.trim());
  const problem = startProblem(inputs, values);
  const blocked = problem !== undefined || missingRepository || badRepository;
  return (
    <form
      className="o-stack"
      aria-label={t('workflows.runs.startForm')}
      onSubmit={(event) => {
        event.preventDefault();
        if (!blocked) run.start({ inputs: values, repository });
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
      {asksRepository ? (
        <span className="o-stack">
          <label htmlFor={repositoryId} className="o-field-label">
            {t('workflows.runs.repository')}
            {needsRepository(workflow) ? ` ${t('workflows.runs.required')}` : ''}
          </label>
          <input
            id={repositoryId}
            className="o-input o-mono"
            placeholder={t('workflows.edit.placeholder.repository')}
            value={repository}
            onChange={(event) => {
              setRepository(event.target.value);
            }}
          />
        </span>
      ) : null}
      {problem === undefined ? null : (
        <p className="o-screen__lead">
          {t(`workflows.runs.problem.${problem.kind}`, { input: problem.label })}
        </p>
      )}
      {badRepository ? <p className="o-screen__lead">{t('workflows.edit.problem.repository')}</p> : null}
      <div className="o-inline">
        <Button type="submit" disabled={run.starting || blocked}>
          {run.starting ? t('workflows.runs.starting') : t('workflows.runs.start')}
        </Button>
      </div>
    </form>
  );
}
