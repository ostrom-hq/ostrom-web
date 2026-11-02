// SPDX-License-Identifier: AGPL-3.0-only
import { type ReactElement, useId, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { Section } from '@/shared/ui/Screen';
import { KNOWN_AGENTS } from '../model';
import type { LaunchCheckViewModel, LaunchQuestion } from '../usePolicy';

/** What an allowed launch says: the model asked, the default it stood for, or no model at all. */
function allowedText(t: TFunction, asked: LaunchQuestion): string {
  if (asked.model === '') return t('policy.check.allowedAgent', { agent: asked.agent });
  if (!asked.named) return t('policy.check.allowedDefault', { agent: asked.agent, model: asked.model });
  return t('policy.check.allowed', { agent: asked.agent, model: asked.model });
}

/** What `ostrom <agent>` asks first, asked from here: may I launch this agent with this model? */
export function LaunchCheck({
  check,
  defaultModel,
}: {
  readonly check: LaunchCheckViewModel;
  /**
   * The organization's default model, asked when none is typed: the one a launch without a model gets. Undefined while
   * the policy loads (asking waits for it), null when it cannot be read, `""` when none is set.
   */
  readonly defaultModel: string | null | undefined;
}): ReactElement {
  const { t } = useTranslation();
  const [agent, setAgent] = useState('claude');
  const [model, setModel] = useState('');
  const agentId = useId();
  const agentsId = useId();
  const modelId = useId();
  const { answer, asked } = check;
  return (
    <Section label={t('policy.check.title')}>
      <p className="o-screen__lead">{t('policy.check.lead')}</p>
      <form
        className="pl-check"
        onSubmit={(event) => {
          event.preventDefault();
          const named = model.trim();
          check.ask({
            agent: agent.trim(),
            model: named === '' ? (defaultModel ?? '') : named,
            named: named !== '',
          });
        }}
      >
        <span className="o-stack">
          <label htmlFor={agentId} className="o-field-label">
            {t('policy.check.agent')}
          </label>
          <input
            id={agentId}
            className="o-input o-mono"
            list={agentsId}
            value={agent}
            onChange={(event) => {
              setAgent(event.target.value);
            }}
          />
          <datalist id={agentsId}>
            {KNOWN_AGENTS.map((known) => (
              <option key={known} value={known} />
            ))}
          </datalist>
        </span>
        <span className="o-stack">
          <label htmlFor={modelId} className="o-field-label">
            {t('policy.check.model')}
          </label>
          <input
            id={modelId}
            className="o-input o-mono"
            placeholder={t('policy.check.modelPlaceholder')}
            value={model}
            onChange={(event) => {
              setModel(event.target.value);
            }}
          />
        </span>
        <span className="pl-check__go">
          <Button
            type="submit"
            disabled={agent.trim() === '' || check.checking || defaultModel === undefined}
          >
            {check.checking ? t('policy.check.checking') : t('policy.check.ask')}
          </Button>
        </span>
      </form>
      {check.failure === undefined ? null : (
        <Banner tone="danger" tag={t('policy.errorTag')} live>
          {check.failure.message}
        </Banner>
      )}
      {answer === undefined || asked === undefined || check.checking ? null : (
        <Banner
          tone={answer.allowed ? 'info' : 'warning'}
          tag={answer.allowed ? t('policy.check.allowedTag') : t('policy.check.refusedTag')}
          live
        >
          {answer.allowed ? allowedText(t, asked) : (answer.reason ?? t('policy.check.refused'))}
          {answer.note === undefined ? null : <> {answer.note}</>}
        </Banner>
      )}
    </Section>
  );
}
