// SPDX-License-Identifier: Apache-2.0
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import {
  checkPolicy,
  CONDITION_OPERATORS,
  type ConditionDraft,
  isConditionOperator,
  isPolicyEffect,
  POLICY_EFFECTS,
  type PolicyEffect,
  takesValue,
} from '../model';
import type { ServerAccessChangeViewModel } from '../useMcpAccess';

const NEW_CONDITION: ConditionDraft = { path: '', operator: 'EQUALS', value: '' };

export interface PolicyFormProps {
  readonly server: string;
  readonly change: ServerAccessChangeViewModel;
}

/** A call refused or held for a human, by its tool and what its arguments hold; every condition must hold. */
export function PolicyForm({ server, change }: PolicyFormProps): ReactElement {
  const { t } = useTranslation();
  const [tool, setTool] = useState('');
  const [effect, setEffect] = useState<PolicyEffect>('DENY');
  const [message, setMessage] = useState('');
  const [conditions, setConditions] = useState<readonly ConditionDraft[]>([]);
  const [tried, setTried] = useState(false);
  const ids = { tool: useId(), effect: useId(), message: useId(), condition: useId() };
  const checked = checkPolicy({ tool, effect, message, conditions });
  const update = (index: number, next: Partial<ConditionDraft>): void => {
    setConditions(conditions.map((condition, at) => (at === index ? { ...condition, ...next } : condition)));
  };
  return (
    <form
      className="o-stack"
      aria-label={t('tools.mcp.access.policy.title', { server })}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setTried(true);
        if ('request' in checked)
          change.addPolicy(checked.request, () => {
            setTool('');
            setEffect('DENY');
            setMessage('');
            setConditions([]);
            setTried(false);
          });
      }}
    >
      <label htmlFor={ids.tool} className="o-field-label">
        {t('tools.mcp.access.policy.tool')}
      </label>
      <input
        id={ids.tool}
        className="o-input o-mono"
        autoComplete="off"
        spellCheck={false}
        placeholder="create_issue"
        value={tool}
        onChange={(event) => {
          setTool(event.target.value);
        }}
      />
      <div className="o-inline">
        <label htmlFor={ids.effect} className="o-field-label">
          {t('tools.mcp.access.policy.effect')}
        </label>
        <select
          id={ids.effect}
          className="o-input o-select"
          value={effect}
          onChange={(event) => {
            if (isPolicyEffect(event.target.value)) setEffect(event.target.value);
          }}
        >
          {POLICY_EFFECTS.map((option) => (
            <option key={option} value={option}>
              {t(`tools.mcp.access.effect.${option}`)}
            </option>
          ))}
        </select>
      </div>
      <label htmlFor={ids.message} className="o-field-label">
        {t('tools.mcp.access.policy.message')}
      </label>
      <input
        id={ids.message}
        className="o-input"
        autoComplete="off"
        maxLength={500}
        value={message}
        onChange={(event) => {
          setMessage(event.target.value);
        }}
      />
      {conditions.map((condition, index) => {
        const number = index + 1;
        return (
          // A condition has no id of its own: its place in the list is its name.
          <fieldset key={`${ids.condition}-${String(index)}`} className="o-inline tl-condition">
            <legend className="o-visually-hidden">
              {t('tools.mcp.access.policy.condition', { number })}
            </legend>
            <input
              className="o-input o-mono"
              aria-label={t('tools.mcp.access.policy.path', { number })}
              autoComplete="off"
              spellCheck={false}
              placeholder="options.database"
              value={condition.path}
              onChange={(event) => {
                update(index, { path: event.target.value });
              }}
            />
            <select
              className="o-input o-select"
              aria-label={t('tools.mcp.access.policy.operator', { number })}
              value={condition.operator}
              onChange={(event) => {
                if (isConditionOperator(event.target.value)) update(index, { operator: event.target.value });
              }}
            >
              {CONDITION_OPERATORS.map((operator) => (
                <option key={operator} value={operator}>
                  {t(`tools.mcp.access.operator.${operator}`)}
                </option>
              ))}
            </select>
            {takesValue(condition.operator) ? (
              <input
                className="o-input o-mono"
                aria-label={t('tools.mcp.access.policy.value', { number })}
                autoComplete="off"
                spellCheck={false}
                value={condition.value}
                onChange={(event) => {
                  update(index, { value: event.target.value });
                }}
              />
            ) : null}
            <Button
              variant="ghost"
              aria-label={t('tools.mcp.access.policy.removeConditionLabel', { number })}
              onClick={() => {
                setConditions(conditions.filter((_, at) => at !== index));
              }}
            >
              {t('tools.mcp.access.policy.removeCondition')}
            </Button>
          </fieldset>
        );
      })}
      {tried && 'problem' in checked ? (
        <Banner tone="warning" tag={t('tools.mcp.add.problemTag')} live>
          {t(`tools.mcp.access.policy.problem.${checked.problem}`)}
        </Banner>
      ) : null}
      <div className="o-inline">
        <Button
          variant="ghost"
          onClick={() => {
            setConditions([...conditions, NEW_CONDITION]);
          }}
        >
          {t('tools.mcp.access.policy.addCondition')}
        </Button>
        <Button type="submit" disabled={change.pending}>
          {t('tools.mcp.access.policy.submit')}
        </Button>
      </div>
    </form>
  );
}
