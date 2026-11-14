// SPDX-License-Identifier: Apache-2.0
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { Section } from '@/shared/ui/Screen';
import { checkServer } from '../model';
import type { McpChangeViewModel } from '../useTools';

/** A new server is checked as it is typed; the first problem is said before anything is sent. */
export function AddServerForm({ change }: { readonly change: McpChangeViewModel }): ReactElement {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [secrets, setSecrets] = useState('');
  const [tried, setTried] = useState(false);
  const ids = { name: useId(), url: useId(), secrets: useId() };
  const checked = checkServer({ name, url, secrets });
  return (
    <Section label={t('tools.mcp.add.title')}>
      <form
        className="o-stack"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setTried(true);
          if ('server' in checked)
            change.add(checked.server, () => {
              setName('');
              setUrl('');
              setSecrets('');
              setTried(false);
            });
        }}
      >
        <label htmlFor={ids.name} className="o-field-label">
          {t('tools.mcp.add.name')}
        </label>
        <input
          id={ids.name}
          className="o-input o-mono"
          autoComplete="off"
          spellCheck={false}
          placeholder="linear"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
        <label htmlFor={ids.url} className="o-field-label">
          {t('tools.mcp.add.url')}
        </label>
        <input
          id={ids.url}
          className="o-input o-mono"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://mcp.linear.app/sse"
          value={url}
          onChange={(event) => {
            setUrl(event.target.value);
          }}
        />
        <label htmlFor={ids.secrets} className="o-field-label">
          {t('tools.mcp.add.secrets')}
        </label>
        <input
          id={ids.secrets}
          className="o-input o-mono"
          autoComplete="off"
          spellCheck={false}
          placeholder="LINEAR_TOKEN"
          value={secrets}
          onChange={(event) => {
            setSecrets(event.target.value);
          }}
        />
        {tried && 'problem' in checked ? (
          <Banner tone="warning" tag={t('tools.mcp.add.problemTag')} live>
            {t(`tools.mcp.add.problem.${checked.problem}`, { detail: checked.detail ?? '' })}
          </Banner>
        ) : null}
        <div className="o-inline">
          <Button type="submit" disabled={change.pending === true}>
            {change.pending === true ? t('tools.mcp.add.adding') : t('tools.mcp.add.submit')}
          </Button>
        </div>
      </form>
    </Section>
  );
}
