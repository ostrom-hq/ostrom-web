// SPDX-License-Identifier: Apache-2.0
import type { Workflow } from '@gen/api/types.gen';
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { useEnumLabel } from '@/shared/i18n/enumLabel';
import { useFeature } from '@/shared/capabilities';
import { Button } from '@/shared/ui/Button';
import {
  conditionOf,
  DELIVERABLE_TYPES,
  EDITABLE_KINDS,
  LIMIT_BOUNDS,
  LIMIT_KEYS,
  moveStep,
  newStep,
  nobodyApproves,
  repoChoices,
  repoLabel,
  SESSION_MODES,
  type StepDraft,
  toggleRepo,
  workflowDraftOf,
  type WorkflowDraft,
  workflowProblem,
} from '../model';
import { CONDITION_OPS, callChoices } from '../nodes';
import { useOrgRepos, useWorkflows } from '../useWorkflows';

type TextKey =
  | 'label'
  | 'detail'
  | 'approvers'
  | 'command'
  | 'channel'
  | 'message'
  | 'instructions'
  | 'question'
  | 'questionBody'
  | 'conditionPath'
  | 'conditionValue'
  | 'deliverableLabel'
  | 'deliverableDomain'
  | 'repository'
  | 'assignee';

/**
 * A check's condition, typed (core#127): the step it reads among the workflow's others, what it reads of that step's
 * visit, how it compares and with what. No expression is written here; what the server would refuse is said before
 * sending. In a line, the editor draws its way on: read true, the next step; read false, the run fails there.
 */
function ConditionFields({
  step,
  number,
  steps,
  linear,
  field,
  onChange,
}: {
  readonly step: StepDraft;
  readonly number: number;
  /** The workflow's steps, any of which but this one a check may read. */
  readonly steps: readonly StepDraft[];
  readonly linear: boolean;
  readonly field: (key: TextKey, mono?: boolean) => ReactElement;
  readonly onChange: (next: Partial<StepDraft>) => void;
}): ReactElement {
  const { t } = useTranslation();
  const ids = { step: useId(), op: useId() };
  return (
    <fieldset className="o-stack">
      <span className="o-stack">
        <label htmlFor={ids.step} className="o-field-label">
          <span className="o-visually-hidden">{t('workflows.edit.stepPrefix', { number })}</span>
          {t('workflows.edit.field.conditionStep')}
        </label>
        <select
          id={ids.step}
          className="o-input o-select"
          value={step.conditionStep}
          onChange={(event) => {
            onChange({ conditionStep: event.target.value });
          }}
        >
          <option value="">{t('workflows.edit.conditionStepNone')}</option>
          {steps.map((other, at) =>
            other.key === step.key ? null : (
              <option key={other.key} value={other.id}>
                {t('workflows.edit.conditionStepOption', { number: at + 1, label: other.label })}
              </option>
            ),
          )}
        </select>
      </span>
      {field('conditionPath', true)}
      <span className="o-stack">
        <label htmlFor={ids.op} className="o-field-label">
          <span className="o-visually-hidden">{t('workflows.edit.stepPrefix', { number })}</span>
          {t('workflows.edit.field.conditionOp')}
        </label>
        <select
          id={ids.op}
          className="o-input o-select"
          value={step.conditionOp}
          onChange={(event) => {
            const op = CONDITION_OPS.find((known) => known === event.target.value);
            if (op !== undefined) onChange({ conditionOp: op });
          }}
        >
          {CONDITION_OPS.map((op) => (
            <option key={op} value={op}>
              {t(`workflows.edit.op.${op}`)}
            </option>
          ))}
        </select>
      </span>
      {step.conditionOp === 'exists' ? null : field('conditionValue', step.conditionOp === 'matches')}
      {linear && conditionOf(step) !== undefined ? (
        <p className="o-screen__lead">{t('workflows.edit.conditionOutcome')}</p>
      ) : null}
    </fieldset>
  );
}

/** The workflow a `workflow` step runs: one of the organization's, never one that would run this one again. */
function CallPicker({
  step,
  number,
  self,
  onChange,
}: {
  readonly step: StepDraft;
  readonly number: number;
  readonly self: string | undefined;
  readonly onChange: (next: Partial<StepDraft>) => void;
}): ReactElement {
  const { t } = useTranslation();
  const id = useId();
  const { workflows } = useWorkflows();
  const choices = callChoices(workflows ?? [], self);
  // a workflow already called that is no longer offered stays visible, so that a person sees it and changes it
  const gone = step.calls !== '' && !choices.some((choice) => choice.id === step.calls);
  return (
    <span className="o-stack">
      <label htmlFor={id} className="o-field-label">
        <span className="o-visually-hidden">{t('workflows.edit.stepPrefix', { number })}</span>
        {t('workflows.edit.field.calls')}
      </label>
      <select
        id={id}
        className="o-input o-select"
        value={step.calls}
        onChange={(event) => {
          onChange({ calls: event.target.value });
        }}
      >
        <option value="">
          {workflows === undefined ? t('workflows.edit.callsLoading') : t('workflows.edit.callsNone')}
        </option>
        {choices.map((choice) => (
          <option key={choice.id} value={choice.id}>
            {choice.name}
          </option>
        ))}
        {gone ? (
          <option value={step.calls}>{t('workflows.edit.callsGone', { id: step.calls })}</option>
        ) : null}
      </select>
    </span>
  );
}

/**
 * The fields of one step, by what it does: who approves a gate, what a check runs and reads, where a notification
 * goes, what a wait asks, which workflow a step runs.
 */
function StepFields({
  step,
  number,
  steps,
  linear,
  self,
  onChange,
}: {
  readonly step: StepDraft;
  readonly number: number;
  /** The workflow's steps, which a check may read. */
  readonly steps: readonly StepDraft[];
  readonly linear: boolean;
  /** The workflow edited, which a `workflow` step never runs. */
  readonly self: string | undefined;
  readonly onChange: (next: Partial<StepDraft>) => void;
}): ReactElement {
  const { t } = useTranslation();
  const ids: Readonly<Record<TextKey, string>> = {
    label: useId(),
    detail: useId(),
    approvers: useId(),
    command: useId(),
    channel: useId(),
    message: useId(),
    instructions: useId(),
    question: useId(),
    questionBody: useId(),
    conditionPath: useId(),
    conditionValue: useId(),
    deliverableLabel: useId(),
    deliverableDomain: useId(),
    repository: useId(),
    assignee: useId(),
  };
  const deliverId = useId();
  const schemaId = useId();
  // What a delivery asks of an agent, and who answers a wait, come with the workflow delivery.
  const delivery = useFeature('workflows.deliver.v1');
  const field = (key: TextKey, mono = false): ReactElement => (
    <span className="o-stack">
      <label htmlFor={ids[key]} className="o-field-label">
        {/* Each card says its step once; the label still names it for whoever does not see the card. */}
        <span className="o-visually-hidden">{t('workflows.edit.stepPrefix', { number })}</span>
        {t(`workflows.edit.field.${key}`)}
      </label>
      <input
        id={ids[key]}
        className={mono ? 'o-input o-mono' : 'o-input'}
        placeholder={t(`workflows.edit.placeholder.${key}`)}
        value={step[key]}
        onChange={(event) => {
          onChange({ [key]: event.target.value });
        }}
      />
    </span>
  );
  return (
    <>
      {field('label')}
      {field('detail')}
      {step.kind === 'gate' ? field('approvers') : null}
      {step.kind === 'gate' && nobodyApproves(step) ? (
        <p className="o-screen__lead">{t('workflows.step.nobody')}</p>
      ) : null}
      {step.kind === 'step' || step.kind === 'check' ? field('command', true) : null}
      {step.kind === 'notify' ? (
        <>
          {field('channel', true)}
          {field('message')}
        </>
      ) : null}
      {step.kind === 'agent' ? field('instructions') : null}
      {step.kind === 'agent' && delivery ? (
        <>
          {field('repository', true)}
          <span className="o-stack">
            <label htmlFor={deliverId} className="o-field-label">
              <span className="o-visually-hidden">{t('workflows.edit.stepPrefix', { number })}</span>
              {t('workflows.edit.field.deliverableType')}
            </label>
            <select
              id={deliverId}
              className="o-input o-select"
              value={step.deliverableType}
              onChange={(event) => {
                const type = DELIVERABLE_TYPES.find((known) => known === event.target.value);
                if (type !== undefined) onChange({ deliverableType: type });
              }}
            >
              {DELIVERABLE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`workflows.deliverable.${type}`)}
                </option>
              ))}
            </select>
          </span>
          {step.deliverableType === 'none' ? null : field('deliverableLabel')}
          {step.deliverableType === 'url' ? field('deliverableDomain', true) : null}
          {step.deliverableType === 'json' ? (
            <span className="o-stack">
              <label htmlFor={schemaId} className="o-field-label">
                <span className="o-visually-hidden">{t('workflows.edit.stepPrefix', { number })}</span>
                {t('workflows.edit.field.deliverableSchema')}
              </label>
              <textarea
                id={schemaId}
                className="o-input o-mono"
                rows={4}
                placeholder={t('workflows.edit.placeholder.deliverableSchema')}
                value={step.deliverableSchema}
                onChange={(event) => {
                  onChange({ deliverableSchema: event.target.value });
                }}
              />
            </span>
          ) : null}
        </>
      ) : null}
      {step.kind === 'check' ? (
        <ConditionFields
          step={step}
          number={number}
          steps={steps}
          linear={linear}
          field={field}
          onChange={onChange}
        />
      ) : null}
      {step.kind === 'wait' ? (
        <>
          {field('question')}
          {field('questionBody')}
          {delivery ? field('assignee') : null}
        </>
      ) : null}
      {step.kind === 'workflow' ? (
        <CallPicker step={step} number={number} self={self} onChange={onChange} />
      ) : null}
    </>
  );
}

function StepCard({
  step,
  number,
  count,
  linear,
  steps,
  self,
  onChange,
  onMove,
  onRemove,
}: {
  readonly step: StepDraft;
  readonly number: number;
  readonly count: number;
  readonly linear: boolean;
  readonly steps: readonly StepDraft[];
  readonly self: string | undefined;
  readonly onChange: (next: Partial<StepDraft>) => void;
  readonly onMove: (by: -1 | 1) => void;
  readonly onRemove: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const enumText = useEnumLabel();
  const kindId = useId();
  const { kind } = step;
  return (
    <li className="o-card o-stack wf-step" aria-label={t('workflows.edit.step', { number })}>
      <div className="o-inline wf-step__top">
        <span className="o-row__title">{t('workflows.edit.step', { number })}</span>
        <label htmlFor={kindId} className="o-visually-hidden">
          {t('workflows.edit.kind', { number })}
        </label>
        <select
          id={kindId}
          className="o-input o-select"
          value={kind}
          onChange={(event) => {
            const next = EDITABLE_KINDS.find((editable) => editable === event.target.value);
            if (next !== undefined) onChange({ kind: next });
          }}
        >
          {EDITABLE_KINDS.map((editable) => (
            <option key={editable} value={editable}>
              {enumText('workflows.kind', editable)}
            </option>
          ))}
        </select>
        {linear ? (
          <span className="o-inline wf-step__moves">
            <Button
              variant="ghost"
              aria-label={t('workflows.edit.up', { number })}
              disabled={number === 1}
              onClick={() => {
                onMove(-1);
              }}
            >
              ↑
            </Button>
            <Button
              variant="ghost"
              aria-label={t('workflows.edit.down', { number })}
              disabled={number === count}
              onClick={() => {
                onMove(1);
              }}
            >
              ↓
            </Button>
            <Button variant="ghost" aria-label={t('workflows.edit.remove', { number })} onClick={onRemove}>
              {t('workflows.edit.removeShort')}
            </Button>
          </span>
        ) : null}
      </div>
      <StepFields step={step} number={number} steps={steps} linear={linear} self={self} onChange={onChange} />
    </li>
  );
}

/**
 * The repositories the workflow is limited to, picked among the organization's. None picked: it applies to every
 * repository its gates or its words point to, which the editor says, since a name in its words is enough (R6).
 */
function RepoPicker({
  chosen,
  onChange,
}: {
  readonly chosen: readonly string[];
  readonly onChange: (next: string[]) => void;
}): ReactElement {
  const { t } = useTranslation();
  const repos = useOrgRepos();
  const choices = repoChoices(repos.names ?? [], chosen);
  return (
    <fieldset className="o-stack wf-repos">
      <legend className="o-field-label">{t('workflows.edit.repos')}</legend>
      {choices.length === 0 ? (
        <p className="o-screen__lead">
          {repos.names === undefined && repos.failure === undefined
            ? t('workflows.edit.reposLoading')
            : t('workflows.edit.reposNone')}
        </p>
      ) : (
        <ul className="wf-repos__list">
          {choices.map((pattern) => (
            <li key={pattern}>
              <label className="o-inline wf-repos__choice">
                <input
                  type="checkbox"
                  checked={chosen.includes(pattern)}
                  onChange={() => {
                    onChange(toggleRepo(chosen, pattern));
                  }}
                />
                <span className="o-mono">{repoLabel(pattern)}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {repos.more ? (
        <span className="o-self-start">
          <Button variant="ghost" disabled={repos.loadingMore} onClick={repos.loadMore}>
            {t('workflows.edit.reposMore')}
          </Button>
        </span>
      ) : null}
      {repos.failure === undefined ? null : (
        <p className="o-screen__lead">{t('workflows.edit.reposFailure')}</p>
      )}
      {chosen.length === 0 ? (
        <p className="o-screen__lead wf-repos__warning" role="note">
          {t('workflows.edit.reposEmpty')}
        </p>
      ) : null}
    </fieldset>
  );
}

/** How the agent steps share sessions, and the limits a run keeps to (`sessionMode`, `limits`). */
function RunSettings({
  draft,
  onChange,
}: {
  readonly draft: WorkflowDraft;
  readonly onChange: (next: Partial<WorkflowDraft>) => void;
}): ReactElement {
  const { t } = useTranslation();
  const modeId = useId();
  const limitIds = { maxNodes: useId(), maxVisits: useId(), maxDepth: useId() };
  return (
    <fieldset className="o-stack">
      <legend className="o-field-label">{t('workflows.edit.limits')}</legend>
      <span className="o-stack">
        <label htmlFor={modeId} className="o-field-label">
          {t('workflows.edit.sessionMode')}
        </label>
        <select
          id={modeId}
          className="o-input o-select"
          value={draft.sessionMode}
          onChange={(event) => {
            const mode = SESSION_MODES.find((known) => known === event.target.value);
            if (mode !== undefined) onChange({ sessionMode: mode });
          }}
        >
          {SESSION_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {t(`workflows.sessionMode.${mode}`)}
            </option>
          ))}
        </select>
      </span>
      {draft.sessionMode === 'same' ? (
        <p className="o-screen__lead">{t('workflows.edit.sessionModeSame')}</p>
      ) : null}
      <p className="o-screen__lead">
        {t('workflows.edit.limitsLead', {
          maxNodes: LIMIT_BOUNDS.maxNodes.default,
          maxVisits: LIMIT_BOUNDS.maxVisits.default,
          maxDepth: LIMIT_BOUNDS.maxDepth.default,
        })}
      </p>
      {LIMIT_KEYS.map((key) => (
        <span key={key} className="o-stack">
          <label htmlFor={limitIds[key]} className="o-field-label">
            {t(`workflows.edit.limit.${key}`, { max: LIMIT_BOUNDS[key].max })}
          </label>
          <input
            id={limitIds[key]}
            className="o-input"
            inputMode="numeric"
            placeholder={String(LIMIT_BOUNDS[key].default)}
            value={draft.limits[key]}
            onChange={(event) => {
              onChange({ limits: { ...draft.limits, [key]: event.target.value } });
            }}
          />
        </span>
      ))}
    </fieldset>
  );
}

export interface WorkflowEditorProps {
  /** The workflow edited, or undefined for a new one. */
  readonly workflow: Workflow | undefined;
  readonly saving: boolean;
  readonly onSave: (draft: WorkflowDraft) => void;
  readonly onCancel: () => void;
}

/** Writes a workflow: its name, its domain, the repositories it is limited to, and its steps in order. */
export function WorkflowEditor({ workflow, saving, onSave, onCancel }: WorkflowEditorProps): ReactElement {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<WorkflowDraft>(() => workflowDraftOf(workflow));
  const ids = { name: useId(), domain: useId(), description: useId() };
  const delivery = useFeature('workflows.deliver.v1');
  const problem = workflowProblem(draft, workflow);
  const setStep = (key: number, next: Partial<StepDraft>): void => {
    setDraft((current) => ({
      ...current,
      steps: current.steps.map((step) => (step.key === key ? { ...step, ...next } : step)),
    }));
  };
  const save =
    workflow === undefined
      ? t('workflows.edit.create')
      : workflow.status === 'proposed'
        ? t('workflows.edit.saveAccept')
        : t('workflows.edit.save');
  return (
    <form
      className="o-stack wf-editor"
      aria-label={workflow === undefined ? t('workflows.edit.newTitle') : t('workflows.edit.title')}
      onSubmit={(event) => {
        event.preventDefault();
        onSave(draft);
      }}
    >
      <label htmlFor={ids.name} className="o-field-label">
        {t('workflows.edit.name')}
      </label>
      <input
        id={ids.name}
        className="o-input"
        placeholder={t('workflows.edit.namePlaceholder')}
        value={draft.name}
        onChange={(event) => {
          setDraft({ ...draft, name: event.target.value });
        }}
      />
      <label htmlFor={ids.domain} className="o-field-label">
        {t('workflows.edit.domain')}
      </label>
      <input
        id={ids.domain}
        className="o-input o-mono"
        placeholder={t('workflows.edit.domainPlaceholder')}
        value={draft.domain}
        onChange={(event) => {
          setDraft({ ...draft, domain: event.target.value });
        }}
      />
      <label htmlFor={ids.description} className="o-field-label">
        {t('workflows.edit.description')}
      </label>
      <textarea
        id={ids.description}
        className="o-input"
        rows={2}
        value={draft.description}
        onChange={(event) => {
          setDraft({ ...draft, description: event.target.value });
        }}
      />
      <RepoPicker
        chosen={draft.repos}
        onChange={(repos) => {
          setDraft({ ...draft, repos });
        }}
      />
      {delivery ? (
        <RunSettings
          draft={draft}
          onChange={(next) => {
            setDraft({ ...draft, ...next });
          }}
        />
      ) : null}
      <h2 className="o-label">{t('workflows.detail.steps')}</h2>
      {draft.linear ? (
        <p className="o-screen__lead">{t('workflows.edit.linearLead')}</p>
      ) : (
        <p className="o-screen__lead">{t('workflows.edit.branchesLead')}</p>
      )}
      <ol className="o-stack wf-steps">
        {draft.steps.map((step, at) => (
          <StepCard
            key={step.key}
            step={step}
            number={at + 1}
            count={draft.steps.length}
            linear={draft.linear}
            steps={draft.steps}
            self={workflow?.id}
            onChange={(next) => {
              setStep(step.key, next);
            }}
            onMove={(by) => {
              setDraft({ ...draft, steps: moveStep(draft.steps, step.key, by) });
            }}
            onRemove={() => {
              setDraft({ ...draft, steps: draft.steps.filter((other) => other.key !== step.key) });
            }}
          />
        ))}
      </ol>
      {draft.linear ? (
        <span className="o-self-start">
          <Button
            variant="ghost"
            onClick={() => {
              setDraft({ ...draft, steps: [...draft.steps, newStep(draft.steps)] });
            }}
          >
            {t('workflows.edit.addStep')}
          </Button>
        </span>
      ) : null}
      {problem === undefined ? null : (
        <p className="o-screen__lead">{t(`workflows.edit.problem.${problem}`)}</p>
      )}
      <div className="o-inline">
        <Button type="submit" disabled={saving || problem !== undefined}>
          {saving ? t('workflows.edit.saving') : save}
        </Button>
        <Button variant="ghost" disabled={saving} onClick={onCancel}>
          {t('workflows.edit.cancel')}
        </Button>
      </div>
    </form>
  );
}
