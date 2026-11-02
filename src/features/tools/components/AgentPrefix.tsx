// SPDX-License-Identifier: AGPL-3.0-only
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { LoadState, Section } from '@/shared/ui/Screen';
import { AGENT_PREFIX, agentToolName } from '../model';
import type { McpSettingsViewModel } from '../useMcpAccess';

export interface AgentPrefixProps {
  readonly settings: McpSettingsViewModel;
  /** A server to show the name on, when there is one. */
  readonly example: string;
  readonly canManage: boolean;
}

/** How agents see the relayed servers: everyone reads the prefix, owners and admins change it. */
export function AgentPrefix({ settings, example, canManage }: AgentPrefixProps): ReactElement {
  const { t } = useTranslation();
  const id = useId();
  // Untouched, the field shows the server's prefix; once typed in, what was typed until it is saved.
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const [tried, setTried] = useState(false);
  return (
    <Section label={t('tools.mcp.prefix.title')}>
      <LoadState data={settings.prefix} failure={settings.failure} rows={1}>
        {(prefix) => {
          const value = draft ?? prefix;
          const valid = AGENT_PREFIX.test(value);
          return (
            <div className="o-stack">
              <p className="o-row__meta">
                {t('tools.mcp.prefix.lead')}{' '}
                <span className="o-mono">{agentToolName(valid ? value : prefix, example)}</span>
              </p>
              {canManage ? (
                <form
                  className="o-inline"
                  noValidate
                  onSubmit={(event) => {
                    event.preventDefault();
                    setTried(true);
                    if (valid)
                      settings.save(value, () => {
                        setDraft(undefined);
                        setTried(false);
                      });
                  }}
                >
                  <label htmlFor={id} className="o-field-label">
                    {t('tools.mcp.prefix.label')}
                  </label>
                  <input
                    id={id}
                    className="o-input o-input--narrow o-mono"
                    autoComplete="off"
                    spellCheck={false}
                    value={value}
                    onChange={(event) => {
                      setDraft(event.target.value);
                    }}
                  />
                  <Button type="submit" disabled={settings.saving || value === prefix}>
                    {settings.saving ? t('tools.mcp.prefix.saving') : t('tools.mcp.prefix.save')}
                  </Button>
                </form>
              ) : (
                <p className="o-row__meta">{t('tools.mcp.prefix.readOnly', { prefix })}</p>
              )}
              {tried && !valid ? (
                <Banner tone="warning" tag={t('tools.mcp.add.problemTag')} live>
                  {t('tools.mcp.prefix.problem')}
                </Banner>
              ) : null}
              {settings.saveFailure === undefined ? null : (
                <Banner tone="danger" tag={t('tools.errorTag')} live>
                  {settings.saveFailure.message}
                </Banner>
              )}
            </div>
          );
        }}
      </LoadState>
    </Section>
  );
}
