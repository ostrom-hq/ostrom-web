// SPDX-License-Identifier: AGPL-3.0-only
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/Button';
import { Section } from '@/shared/ui/Screen';
import { CLOUD_AGENTS, type CloudAgent, isCloudAgent } from '../model';
import type { SessionChangeViewModel } from '../useCloud';

/** An agent on one of the organization's runners: what to do, where, and a name to find it again. */
export function StartSessionForm({ change }: { readonly change: SessionChangeViewModel }): ReactElement {
  const { t } = useTranslation();
  const [agent, setAgent] = useState<CloudAgent>('claude-code');
  const [prompt, setPrompt] = useState('');
  const [repo, setRepo] = useState('');
  const [name, setName] = useState('');
  const ids = { agent: useId(), prompt: useId(), repo: useId(), name: useId() };
  return (
    <Section label={t('cloud.start.title')}>
      <form
        className="o-stack"
        onSubmit={(event) => {
          event.preventDefault();
          change.start({ agent, prompt, name, repo }, () => {
            setPrompt('');
            setRepo('');
            setName('');
          });
        }}
      >
        <label htmlFor={ids.prompt} className="o-field-label">
          {t('cloud.start.prompt')}
        </label>
        <textarea
          id={ids.prompt}
          className="o-input"
          rows={3}
          placeholder={t('cloud.start.promptHint')}
          value={prompt}
          onChange={(event) => {
            setPrompt(event.target.value);
          }}
        />
        <div className="o-inline">
          <label htmlFor={ids.repo} className="o-field-label">
            {t('cloud.start.repo')}
          </label>
          <input
            id={ids.repo}
            className="o-input o-mono"
            autoComplete="off"
            spellCheck={false}
            placeholder="acme/web"
            value={repo}
            onChange={(event) => {
              setRepo(event.target.value);
            }}
          />
          <label htmlFor={ids.name} className="o-field-label">
            {t('cloud.start.name')}
          </label>
          <input
            id={ids.name}
            className="o-input"
            autoComplete="off"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </div>
        <div className="o-inline">
          <label htmlFor={ids.agent} className="o-field-label">
            {t('cloud.start.agent')}
          </label>
          <select
            id={ids.agent}
            className="o-input o-select"
            value={agent}
            onChange={(event) => {
              if (isCloudAgent(event.target.value)) setAgent(event.target.value);
            }}
          >
            {CLOUD_AGENTS.map((option) => (
              <option key={option} value={option}>
                {t(`cloud.agent.${option}`)}
              </option>
            ))}
          </select>
          <Button type="submit" disabled={change.starting || prompt.trim() === ''}>
            {change.starting ? t('cloud.start.starting') : t('cloud.start.submit')}
          </Button>
        </div>
      </form>
    </Section>
  );
}
