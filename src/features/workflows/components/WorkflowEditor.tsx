// SPDX-License-Identifier: AGPL-3.0-only
import type { Workflow } from '@gen/api/types.gen';
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/Button';
import {
  EDITABLE_KINDS,
  isEditableKind,
  moveStep,
  newStep,
  nobodyApproves,
  repoChoices,
  repoLabel,
  type StepDraft,
  toggleRepo,
  workflowDraftOf,
  type WorkflowDraft,
  workflowProblem,
} from '../model';
import { useOrgRepos } from '../useWorkflows';

/** The fields of one step, by what it does: who approves a gate, what a check runs, where a notification goes. */
function StepFields({
  step,
  number,
  onChange,
}: {
  readonly step: StepDraft;
  readonly number: number;
  readonly onChange: (next: Partial<StepDraft>) => void;
}): ReactElement {
  const { t } = useTranslation();
  const ids = {
    label: useId(),
    detail: useId(),
    approvers: useId(),
    command: useId(),
    channel: useId(),
    message: useId(),
    instructions: useId(),
  };
  const field = (
    key: 'label' | 'detail' | 'approvers' | 'command' | 'channel' | 'message' | 'instructions',
    mono = false,
  ): ReactElement => (
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
    </>
  );
}

function StepCard({
  step,
  number,
  count,
  linear,
  onChange,
  onMove,
  onRemove,
}: {
  readonly step: StepDraft;
  readonly number: number;
  readonly count: number;
  readonly linear: boolean;
  readonly onChange: (next: Partial<StepDraft>) => void;
  readonly onMove: (by: -1 | 1) => void;
  readonly onRemove: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const kindId = useId();
  const { kind } = step;
  return (
    <li className="o-card o-stack wf-step" aria-label={t('workflows.edit.step', { number })}>
      <div className="o-inline wf-step__top">
        <span className="o-row__title">{t('workflows.edit.step', { number })}</span>
        {isEditableKind(kind) ? (
          <>
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
                  {t(`workflows.kind.${editable}`)}
                </option>
              ))}
            </select>
          </>
        ) : (
          // A wait or a called workflow keeps its kind and its settings: only its words change here.
          <span className="o-row__meta">{t(`workflows.kind.${kind}`)}</span>
        )}
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
      <StepFields step={step} number={number} onChange={onChange} />
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
  const problem = workflowProblem(draft);
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
