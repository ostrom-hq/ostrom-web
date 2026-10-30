// SPDX-License-Identifier: AGPL-3.0-only
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { Section } from '@/shared/ui/Screen';
import { checkServer, isTransport, type Transport, TRANSPORTS } from '../model';
import type { McpChangeViewModel } from '../useTools';

/** A new server is checked as it is typed; the first problem is said before anything is sent. */
export function AddServerForm({ change }: { readonly change: McpChangeViewModel }): ReactElement {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [transport, setTransport] = useState<Transport>('http');
  const [secrets, setSecrets] = useState('');
  const [tried, setTried] = useState(false);
  const ids = { name: useId(), url: useId(), transport: useId(), secrets: useId() };
  const checked = checkServer({ name, url, transport, secrets });
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
          <label htmlFor={ids.transport} className="o-field-label">
            {t('tools.mcp.add.transport')}
          </label>
          <select
            id={ids.transport}
            className="o-input o-select"
            value={transport}
            onChange={(event) => {
              if (isTransport(event.target.value)) setTransport(event.target.value);
            }}
          >
            {TRANSPORTS.map((option) => (
              <option key={option} value={option}>
                {t(`tools.mcp.transport.${option}`)}
              </option>
            ))}
          </select>
          <Button type="submit" disabled={change.pending === true}>
            {change.pending === true ? t('tools.mcp.add.adding') : t('tools.mcp.add.submit')}
          </Button>
        </div>
      </form>
    </Section>
  );
}
