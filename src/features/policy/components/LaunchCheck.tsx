// SPDX-License-Identifier: AGPL-3.0-only
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { Section } from '@/shared/ui/Screen';
import { KNOWN_AGENTS } from '../model';
import type { LaunchCheckViewModel } from '../usePolicy';

/** What `ostrom <agent>` asks first, asked from here: may I launch this agent with this model? */
export function LaunchCheck({ check }: { readonly check: LaunchCheckViewModel }): ReactElement {
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
          check.ask({ agent: agent.trim(), model: model.trim() });
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
          <Button type="submit" disabled={agent.trim() === '' || check.checking}>
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
          {answer.allowed
            ? t('policy.check.allowed', {
                agent: asked.agent,
                model: asked.model === '' ? t('policy.check.anyModel') : asked.model,
              })
            : (answer.reason ?? t('policy.check.refused'))}
          {answer.note === undefined ? null : <> {answer.note}</>}
        </Banner>
      )}
    </Section>
  );
}
