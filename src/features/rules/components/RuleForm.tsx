// SPDX-License-Identifier: AGPL-3.0-only
import type { GateAction, Rule } from '@gen/api/types.gen';
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/Button';
import {
  addCheck,
  type CheckDraft,
  draftOf,
  draftProblem,
  gateActions,
  isOutput,
  isStrength,
  RULE_OUTPUTS,
  RULE_STRENGTHS,
  type RuleDraft,
} from '../model';
import { useGateCatalog } from '../useRules';

export interface RuleFormProps {
  /** The rule being edited; absent, the form writes a new one. */
  readonly rule?: Rule;
  /** Groups already in use, offered as the group is typed. */
  readonly groups: readonly string[];
  readonly saving: boolean;
  /** The words of the send button: "Save and accept", "Save", "Add the rule". */
  readonly submit: string;
  /** Receives the draft and the actions a gate may pick from. */
  readonly onSave: (draft: RuleDraft, actions: readonly GateAction[]) => void;
  readonly onCancel: () => void;
}

function GateFields({
  rule,
  draft,
  onChange,
}: {
  readonly rule: Rule | undefined;
  readonly draft: RuleDraft;
  readonly onChange: (next: Partial<RuleDraft>) => void;
}): ReactElement {
  const { t } = useTranslation();
  const catalog = useGateCatalog(true);
  const approversId = useId();
  const reasonId = useId();
  const actions = gateActions(catalog.actions ?? [], rule);
  const setCheck = (index: number, next: Partial<CheckDraft>): void => {
    onChange({ checks: draft.checks.map((check, at) => (at === index ? { ...check, ...next } : check)) });
  };
  return (
    <fieldset className="o-stack rl-gate">
      <legend className="o-field-label">{t('rules.form.gate.title')}</legend>
      <p className="o-row__meta">{t('rules.form.gate.lead')}</p>
      <fieldset className="o-stack">
        <legend className="o-field-label">{t('rules.form.gate.actions')}</legend>
        {catalog.failure === undefined ? null : <p className="o-row__meta">{catalog.failure.message}</p>}
        {catalog.actions === undefined && catalog.failure === undefined ? (
          <p className="o-row__meta">{t('rules.form.gate.loading')}</p>
        ) : null}
        {catalog.actions !== undefined && actions.length === 0 ? (
          <p className="o-row__meta">{t('rules.form.gate.noAction')}</p>
        ) : null}
        {actions.map((action) => (
          <label key={action.class} className="rl-gate__action">
            <input
              type="checkbox"
              checked={draft.actions.includes(action.class)}
              onChange={(event) => {
                onChange({
                  actions: event.target.checked
                    ? [...draft.actions, action.class]
                    : draft.actions.filter((picked) => picked !== action.class),
                });
              }}
            />
            <span>
              {action.label}
              {action.patterns.length === 0 ? null : (
                <span className="o-row__meta o-mono"> {action.patterns.join(' · ')}</span>
              )}
            </span>
          </label>
        ))}
      </fieldset>
      <label htmlFor={approversId} className="o-field-label">
        {t('rules.form.gate.approvers')}
      </label>
      <input
        id={approversId}
        className="o-input"
        placeholder={t('rules.form.gate.approversPlaceholder')}
        value={draft.approvers}
        onChange={(event) => {
          onChange({ approvers: event.target.value });
        }}
      />
      <label htmlFor={reasonId} className="o-field-label">
        {t('rules.form.gate.reason')}
      </label>
      <input
        id={reasonId}
        className="o-input"
        placeholder={t('rules.form.gate.reasonPlaceholder')}
        value={draft.reason}
        onChange={(event) => {
          onChange({ reason: event.target.value });
        }}
      />
      <fieldset className="o-stack">
        <legend className="o-field-label">{t('rules.form.gate.checks')}</legend>
        <p className="o-row__meta">{t('rules.form.gate.checksLead')}</p>
        {draft.checks.map((check, index) => (
          <div key={check.key} className="o-inline rl-gate__check">
            <input
              className="o-input"
              aria-label={t('rules.form.gate.checkNamed', { number: index + 1 })}
              placeholder={t('rules.form.gate.checkPlaceholder')}
              value={check.check}
              onChange={(event) => {
                setCheck(index, { check: event.target.value });
              }}
            />
            <label className="o-inline">
              <input
                type="checkbox"
                checked={check.attested}
                onChange={(event) => {
                  setCheck(index, { attested: event.target.checked });
                }}
              />
              <span>{t('rules.form.gate.attested')}</span>
            </label>
            <Button
              variant="ghost"
              aria-label={t('rules.form.gate.removeCheck', { number: index + 1 })}
              onClick={() => {
                onChange({ checks: draft.checks.filter((_, at) => at !== index) });
              }}
            >
              {t('rules.form.gate.remove')}
            </Button>
          </div>
        ))}
        <span className="o-self-start">
          <Button
            variant="ghost"
            onClick={() => {
              onChange({ checks: addCheck(draft.checks) });
            }}
          >
            {t('rules.form.gate.addCheck')}
          </Button>
        </span>
      </fieldset>
    </fieldset>
  );
}

/** A rule written or fixed by a person: its words, where it holds, and what it does, up to the gate it puts. */
export function RuleForm({ rule, groups, saving, submit, onSave, onCancel }: RuleFormProps): ReactElement {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<RuleDraft>(() => draftOf(rule));
  const catalog = useGateCatalog(draft.output === 'gate');
  const ids = { statement: useId(), group: useId(), groups: useId(), why: useId(), scope: useId() };
  const strengthId = useId();
  const outputId = useId();
  const change = (next: Partial<RuleDraft>): void => {
    setDraft((current) => ({ ...current, ...next }));
  };
  const problem = draftProblem(draft);
  // A rule whose output this console has no words for keeps it, shown as the server wrote it.
  const outputs: readonly string[] = isOutput(draft.output) ? RULE_OUTPUTS : [...RULE_OUTPUTS, draft.output];
  return (
    <form
      className="o-stack rl-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(draft, gateActions(catalog.actions ?? [], rule));
      }}
    >
      <label htmlFor={ids.statement} className="o-field-label">
        {t('rules.edit.statement')}
      </label>
      <textarea
        id={ids.statement}
        className="o-input"
        rows={3}
        placeholder={t('rules.form.statementPlaceholder')}
        value={draft.statement}
        onChange={(event) => {
          change({ statement: event.target.value });
        }}
      />
      <div className="rl-form__grid">
        <span className="o-stack">
          <label htmlFor={ids.group} className="o-field-label">
            {t('rules.form.group')}
          </label>
          <input
            id={ids.group}
            className="o-input"
            list={ids.groups}
            placeholder={t('rules.form.groupPlaceholder')}
            value={draft.group}
            onChange={(event) => {
              change({ group: event.target.value });
            }}
          />
          <datalist id={ids.groups}>
            {groups.map((group) => (
              <option key={group} value={group} />
            ))}
          </datalist>
        </span>
        <span className="o-stack">
          <label htmlFor={ids.scope} className="o-field-label">
            {t('rules.form.scope')}
          </label>
          <input
            id={ids.scope}
            className="o-input"
            placeholder={t('rules.form.scopePlaceholder')}
            value={draft.scope}
            onChange={(event) => {
              change({ scope: event.target.value });
            }}
          />
        </span>
      </div>
      <label htmlFor={ids.why} className="o-field-label">
        {t('rules.form.why')}
      </label>
      <textarea
        id={ids.why}
        className="o-input"
        rows={2}
        placeholder={t('rules.form.whyPlaceholder')}
        value={draft.why}
        onChange={(event) => {
          change({ why: event.target.value });
        }}
      />
      <div className="o-inline">
        <label htmlFor={strengthId} className="o-field-label">
          {t('rules.edit.strength')}
        </label>
        <select
          id={strengthId}
          className="o-input o-select"
          value={draft.strength}
          onChange={(event) => {
            if (isStrength(event.target.value)) change({ strength: event.target.value });
          }}
        >
          {RULE_STRENGTHS.map((option) => (
            <option key={option} value={option}>
              {t(`rules.strength.${option}`)}
            </option>
          ))}
        </select>
        <label htmlFor={outputId} className="o-field-label">
          {t('rules.form.output')}
        </label>
        <select
          id={outputId}
          className="o-input o-select"
          value={draft.output}
          onChange={(event) => {
            change({ output: event.target.value });
          }}
        >
          {outputs.map((option) => (
            <option key={option} value={option}>
              {isOutput(option) ? t(`rules.output.${option}`) : option}
            </option>
          ))}
        </select>
      </div>
      {draft.output === 'gate' ? <GateFields rule={rule} draft={draft} onChange={change} /> : null}
      {problem === undefined || problem === 'statement' || problem === 'group' ? null : (
        <p className="o-row__meta">{t(`rules.form.problem.${problem}`)}</p>
      )}
      <div className="o-inline">
        <Button type="submit" disabled={saving || problem !== undefined}>
          {saving ? t('rules.edit.saving') : submit}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {t('rules.edit.cancel')}
        </Button>
      </div>
    </form>
  );
}
