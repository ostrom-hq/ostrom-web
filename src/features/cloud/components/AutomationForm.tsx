// SPDX-License-Identifier: AGPL-3.0-only
import type { Automation, AutomationWrite } from '@gen/api/types.gen';
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/Button';
import {
  addVariable,
  AUTOMATION_AGENTS,
  type AutomationDraft,
  automationDraftOf,
  automationProblem,
  automationWriteOf,
  isAutomationAgent,
  isOverlap,
  isTriggerKind,
  localTimezone,
  OVERLAPS,
  TRIGGER_KINDS,
  VARIABLE_TYPES,
  type VariableDraft,
} from '../automationDraft';

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
  };
  const change = (next: Partial<AutomationDraft>): void => {
    setDraft((current) => ({ ...current, ...next }));
  };
  // Rows change from the latest draft, never from the one this render saw: two quick edits both land.
  const setVariables = (next: (variables: readonly VariableDraft[]) => VariableDraft[]): void => {
    setDraft((current) => ({ ...current, variables: next(current.variables) }));
  };
  const problem = automationProblem(draft);
  // An agent this console has no word for is kept, shown as the server wrote it.
  const agents: readonly string[] = isAutomationAgent(draft.agent)
    ? AUTOMATION_AGENTS
    : [...AUTOMATION_AGENTS, draft.agent];
  const workflow = automation?.action.workflowId;
  return (
    <form
      className="o-stack cl-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(automationWriteOf(draft, automation));
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
      {workflow === undefined ? null : (
        <p className="o-row__meta">{t('automations.form.workflowNote', { workflow })}</p>
      )}
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
                {isAutomationAgent(agent) ? t(`automations.form.agents.${agent}`) : agent}
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
