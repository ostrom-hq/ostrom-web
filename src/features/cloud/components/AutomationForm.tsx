// SPDX-License-Identifier: Apache-2.0
import type { Automation, AutomationWrite, Workflow } from '@gen/api/types.gen';
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFeature } from '@/shared/capabilities';
import { Button } from '@/shared/ui/Button';
import {
  ACTION_KINDS,
  addVariable,
  type AutomationDraft,
  automationDraftOf,
  automationProblem,
  automationWriteOf,
  isActionKind,
  isOverlap,
  isTriggerKind,
  localTimezone,
  OVERLAPS,
  TRIGGER_KINDS,
  VARIABLE_TYPES,
  type VariableDraft,
} from '../automationDraft';
import { isCloudAgent, isPromptAgent, PROMPT_AGENTS } from '../model';
import { useRunnableWorkflows } from '../useCloud';

export interface AutomationFormProps {
  /** The automation being edited; absent, the form writes a new one. */
  readonly automation?: Automation;
  readonly saving: boolean;
  /** The words of the send button: "Create the automation", "Save". */
  readonly submit: string;
  readonly onSave: (write: AutomationWrite) => void;
  readonly onCancel: () => void;
}

function VariableRow({
  variable,
  number,
  onChange,
  onRemove,
}: {
  readonly variable: VariableDraft;
  readonly number: number;
  readonly onChange: (next: Partial<VariableDraft>) => void;
  readonly onRemove: () => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div className="o-stack cl-variable">
      <div className="cl-form__grid">
        <input
          className="o-input"
          aria-label={t('automations.form.variable.name', { number })}
          placeholder={t('automations.form.variable.namePlaceholder')}
          value={variable.name}
          onChange={(event) => {
            onChange({ name: event.target.value });
          }}
        />
        <input
          className="o-input o-mono"
          aria-label={t('automations.form.variable.path', { number })}
          placeholder="$.issue.id"
          value={variable.path}
          onChange={(event) => {
            onChange({ path: event.target.value });
          }}
        />
        <select
          className="o-input o-select"
          aria-label={t('automations.form.variable.type', { number })}
          value={variable.type}
          onChange={(event) => {
            onChange({ type: event.target.value });
          }}
        >
          {/* A type this console has no word for is kept, shown as the server wrote it. */}
          {(VARIABLE_TYPES.some((type) => type === variable.type)
            ? VARIABLE_TYPES
            : [...VARIABLE_TYPES, variable.type]
          ).map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        {variable.type === 'enum' ? (
          <input
            className="o-input"
            aria-label={t('automations.form.variable.values', { number })}
            placeholder={t('automations.form.variable.valuesPlaceholder')}
            value={variable.values}
            onChange={(event) => {
              onChange({ values: event.target.value });
            }}
          />
        ) : null}
      </div>
      <div className="o-inline">
        <label className="o-inline">
          <input
            type="checkbox"
            checked={variable.required}
            onChange={(event) => {
              onChange({ required: event.target.checked });
            }}
          />
          <span>{t('automations.form.variable.required')}</span>
        </label>
        <label className="o-inline">
          <input
            type="checkbox"
            checked={variable.sensitive}
            onChange={(event) => {
              onChange({ sensitive: event.target.checked });
            }}
          />
          <span>{t('automations.form.variable.sensitive')}</span>
        </label>
        <Button
          variant="ghost"
          aria-label={t('automations.form.variable.remove', { number })}
          onClick={onRemove}
        >
          {t('automations.form.variable.removeShort')}
        </Button>
      </div>
    </div>
  );
}

/**
 * The workflow an automation runs, the templates of its inputs (rendered like the prompt, from the webhook's variables:
 * one that renders empty is left out and the workflow's default applies) and the repository of its agent steps.
 */
function WorkflowFields({
  draft,
  workflows,
  onChange,
}: {
  readonly draft: AutomationDraft;
  readonly workflows: readonly Workflow[] | undefined;
  readonly onChange: (next: Partial<AutomationDraft>) => void;
}): ReactElement {
  const { t } = useTranslation();
  const ids = { workflow: useId(), repository: useId(), inputs: useId() };
  const chosen = workflows?.find((workflow) => workflow.id === draft.workflowId);
  const inputs = chosen?.inputs ?? [];
  return (
    <>
      <span className="o-stack">
        <label htmlFor={ids.workflow} className="o-field-label">
          {t('automations.form.workflow')}
        </label>
        <select
          id={ids.workflow}
          className="o-input o-select"
          value={draft.workflowId}
          onChange={(event) => {
            onChange({ workflowId: event.target.value, inputs: {} });
          }}
        >
          <option value="">
            {workflows === undefined
              ? t('automations.form.workflowLoading')
              : t('automations.form.workflowNone')}
          </option>
          {(workflows ?? []).map((workflow) => (
            <option key={workflow.id} value={workflow.id}>
              {workflow.name}
            </option>
          ))}
          {/* A workflow already chosen that is no longer accepted stays visible, so that a person sees it. */}
          {draft.workflowId !== '' && chosen === undefined && workflows !== undefined ? (
            <option value={draft.workflowId}>
              {t('automations.form.workflowGone', { id: draft.workflowId })}
            </option>
          ) : null}
        </select>
      </span>
      {inputs.length === 0 ? null : (
        <fieldset className="o-stack">
          <legend className="o-field-label">{t('automations.form.inputs')}</legend>
          <p className="o-row__meta">
            {t(
              draft.kind === 'webhook' ? 'automations.form.inputsHintWebhook' : 'automations.form.inputsHint',
              {
                example: '{{issue.title}}',
              },
            )}
          </p>
          {inputs.map((input) => (
            <span key={input.id} className="o-stack">
              <label htmlFor={`${ids.inputs}-${input.id}`} className="o-field-label">
                {input.label}
                {input.required === true ? ` ${t('automations.form.required')}` : ''}
              </label>
              <input
                id={`${ids.inputs}-${input.id}`}
                className="o-input"
                value={draft.inputs[input.id] ?? ''}
                onChange={(event) => {
                  onChange({ inputs: { ...draft.inputs, [input.id]: event.target.value } });
                }}
              />
            </span>
          ))}
        </fieldset>
      )}
      <span className="o-stack">
        <label htmlFor={ids.repository} className="o-field-label">
          {t('automations.form.repository')}
        </label>
        <input
          id={ids.repository}
          className="o-input o-mono"
          placeholder="acme/backend"
          value={draft.repository}
          onChange={(event) => {
            onChange({ repository: event.target.value });
          }}
        />
      </span>
    </>
  );
}

/** An automation written or fixed by its owner: what starts it, what it asks of which agent, and its limits. */
export function AutomationForm({
  automation,
  saving,
  submit,
  onSave,
  onCancel,
}: AutomationFormProps): ReactElement {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<AutomationDraft>(() => automationDraftOf(automation, localTimezone()));
  const ids = {
    name: useId(),
    kind: useId(),
    cron: useId(),
    timezone: useId(),
    agent: useId(),
    model: useId(),
    runtime: useId(),
    prompt: useId(),
    promptHint: useId(),
    runsPerDay: useId(),
    overlap: useId(),
    sample: useId(),
    problem: useId(),
    action: useId(),
  };
  // Starting a workflow is offered once the server delivers workflows; an automation that already does keeps it.
  const delivery = useFeature('workflows.deliver.v1');
  const workflows = useRunnableWorkflows();
  const change = (next: Partial<AutomationDraft>): void => {
    setDraft((current) => ({ ...current, ...next }));
  };
  // Rows change from the latest draft, never from the one this render saw: two quick edits both land.
  const setVariables = (next: (variables: readonly VariableDraft[]) => VariableDraft[]): void => {
    setDraft((current) => ({ ...current, variables: next(current.variables) }));
  };
  const chosen = workflows?.find((candidate) => candidate.id === draft.workflowId);
  const problem = automationProblem(
    draft,
    (chosen?.inputs ?? []).filter((input) => input.required === true).map((input) => input.id),
  );
  const workflowAction = draft.actionKind === 'workflow';
  // An agent this console has no word for is kept, shown as the server wrote it.
  const agents: readonly string[] = isPromptAgent(draft.agent)
    ? PROMPT_AGENTS
    : [...PROMPT_AGENTS, draft.agent];
  return (
    <form
      className="o-stack cl-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(
          automationWriteOf(
            draft,
            automation,
            chosen?.inputs?.map((input) => input.id),
          ),
        );
      }}
    >
      <label htmlFor={ids.name} className="o-field-label">
        {t('automations.form.name')}
      </label>
      <input
        id={ids.name}
        className="o-input"
        placeholder={t('automations.form.namePlaceholder')}
        value={draft.name}
        onChange={(event) => {
          change({ name: event.target.value });
        }}
      />
      <div className="cl-form__grid">
        <span className="o-stack">
          <label htmlFor={ids.kind} className="o-field-label">
            {t('automations.form.trigger')}
          </label>
          <select
            id={ids.kind}
            className="o-input o-select"
            value={draft.kind}
            onChange={(event) => {
              if (isTriggerKind(event.target.value)) change({ kind: event.target.value });
            }}
          >
            {TRIGGER_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {t(`automations.form.kind.${kind}`)}
              </option>
            ))}
          </select>
        </span>
        {draft.kind === 'cron' ? (
          <>
            <span className="o-stack">
              <label htmlFor={ids.cron} className="o-field-label">
                {t('automations.form.cron')}
              </label>
              <input
                id={ids.cron}
                className="o-input o-mono"
                placeholder="0 9 * * 1-5"
                value={draft.cron}
                onChange={(event) => {
                  change({ cron: event.target.value });
                }}
              />
            </span>
            <span className="o-stack">
              <label htmlFor={ids.timezone} className="o-field-label">
                {t('automations.form.timezone')}
              </label>
              <input
                id={ids.timezone}
                className="o-input"
                placeholder="Europe/Paris"
                value={draft.timezone}
                onChange={(event) => {
                  change({ timezone: event.target.value });
                }}
              />
            </span>
          </>
        ) : null}
      </div>
      {draft.kind === 'webhook' ? <p className="o-row__meta">{t('automations.form.webhookLead')}</p> : null}
      {delivery || workflowAction ? (
        <span className="o-stack">
          <label htmlFor={ids.action} className="o-field-label">
            {t('automations.form.action')}
          </label>
          <select
            id={ids.action}
            className="o-input o-select"
            value={draft.actionKind}
            onChange={(event) => {
              if (isActionKind(event.target.value)) change({ actionKind: event.target.value });
            }}
          >
            {ACTION_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {t(`automations.form.actionKind.${kind}`)}
              </option>
            ))}
          </select>
        </span>
      ) : null}
      {workflowAction ? <WorkflowFields draft={draft} workflows={workflows} onChange={change} /> : null}
      {workflowAction ? null : (
        <div className="cl-form__grid">
          <span className="o-stack">
            <label htmlFor={ids.agent} className="o-field-label">
              {t('automations.form.agent')}
            </label>
            <select
              id={ids.agent}
              className="o-input o-select"
              value={draft.agent}
              onChange={(event) => {
                change({ agent: event.target.value });
              }}
            >
              {agents.map((agent) => (
                <option key={agent} value={agent}>
                  {isCloudAgent(agent) ? t(`cloud.agent.${agent}`) : agent}
                </option>
              ))}
            </select>
          </span>
          <span className="o-stack">
            <label htmlFor={ids.model} className="o-field-label">
              {t('automations.form.model')}
            </label>
            <input
              id={ids.model}
              className="o-input"
              placeholder={t('automations.form.modelPlaceholder')}
              value={draft.model}
              onChange={(event) => {
                change({ model: event.target.value });
              }}
            />
          </span>
          <span className="o-stack">
            <label htmlFor={ids.runtime} className="o-field-label">
              {t('automations.form.runtime')}
            </label>
            <input
              id={ids.runtime}
              className="o-input"
              inputMode="numeric"
              value={draft.runtime}
              onChange={(event) => {
                change({ runtime: event.target.value });
              }}
            />
          </span>
        </div>
      )}
      {workflowAction ? null : (
        <>
          <label htmlFor={ids.prompt} className="o-field-label">
            {t('automations.form.prompt')}
          </label>
          <textarea
            id={ids.prompt}
            className="o-input"
            rows={5}
            aria-describedby={ids.promptHint}
            placeholder={t('automations.form.promptPlaceholder')}
            value={draft.prompt}
            onChange={(event) => {
              change({ prompt: event.target.value });
            }}
          />
          <p id={ids.promptHint} className="o-row__meta">
            {draft.kind === 'webhook'
              ? t('automations.form.promptHintWebhook', { example: '{{issue.title}}' })
              : t('automations.form.promptHint')}
          </p>
        </>
      )}
      <div className="cl-form__grid">
        <span className="o-stack">
          <label htmlFor={ids.runsPerDay} className="o-field-label">
            {t('automations.form.runsPerDay')}
          </label>
          <input
            id={ids.runsPerDay}
            className="o-input"
            inputMode="numeric"
            value={draft.runsPerDay}
            onChange={(event) => {
              change({ runsPerDay: event.target.value });
            }}
          />
        </span>
        <span className="o-stack">
          <label htmlFor={ids.overlap} className="o-field-label">
            {t('automations.form.overlap')}
          </label>
          <select
            id={ids.overlap}
            className="o-input o-select"
            value={draft.overlap}
            onChange={(event) => {
              if (isOverlap(event.target.value)) change({ overlap: event.target.value });
            }}
          >
            {OVERLAPS.map((mode) => (
              <option key={mode} value={mode}>
                {t(`automations.form.overlaps.${mode}`)}
              </option>
            ))}
          </select>
        </span>
      </div>
      {draft.kind === 'webhook' ? (
        <fieldset className="o-stack cl-variables">
          <legend className="o-field-label">{t('automations.form.variables')}</legend>
          <p className="o-row__meta">{t('automations.form.variablesLead')}</p>
          {draft.variables.map((variable, index) => (
            <VariableRow
              key={variable.key}
              variable={variable}
              number={index + 1}
              onChange={(next) => {
                setVariables((variables) =>
                  variables.map((other) => (other.key === variable.key ? { ...other, ...next } : other)),
                );
              }}
              onRemove={() => {
                setVariables((variables) => variables.filter((other) => other.key !== variable.key));
              }}
            />
          ))}
          <span className="o-self-start">
            <Button
              variant="ghost"
              onClick={() => {
                setVariables(addVariable);
              }}
            >
              {t('automations.form.addVariable')}
            </Button>
          </span>
          <label htmlFor={ids.sample} className="o-field-label">
            {t('automations.form.sample')}
          </label>
          <textarea
            id={ids.sample}
            className="o-input o-mono"
            rows={4}
            placeholder='{"issue": {"id": "SENTRY-1"}}'
            value={draft.sample}
            onChange={(event) => {
              change({ sample: event.target.value });
            }}
          />
        </fieldset>
      ) : null}
      {problem === undefined ? null : (
        <p id={ids.problem} className="o-row__meta">
          {t(`automations.form.problem.${problem}`)}
        </p>
      )}
      <div className="o-inline">
        <Button
          type="submit"
          disabled={saving || problem !== undefined}
          {...(problem === undefined ? {} : { 'aria-describedby': ids.problem })}
        >
          {saving ? t('automations.form.saving') : submit}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {t('automations.form.cancel')}
        </Button>
      </div>
    </form>
  );
}
