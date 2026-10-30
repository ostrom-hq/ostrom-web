// SPDX-License-Identifier: AGPL-3.0-only
import type { McpServer } from '@gen/api/types.gen';
import { type ReactElement, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { ConfirmButton } from '@/shared/ui/ConfirmButton';
import { isTransport } from '../model';

export interface ServerCardProps {
  readonly server: McpServer;
  readonly calls: number;
  /** Secrets the server needs and the organization does not have. */
  readonly missing: readonly string[];
  readonly busy: boolean;
  /** Present when the viewer manages the servers. */
  readonly actions: { readonly toggle: () => void; readonly remove: () => void } | undefined;
}

export function ServerCard({ server, calls, missing, busy, actions }: ServerCardProps): ReactElement {
  const { t } = useTranslation();
  const headingId = useId();
  return (
    <article className="o-card o-stack tl-card" aria-labelledby={headingId}>
      <div className="o-inline">
        <h3 id={headingId} className="tl-name o-mono">
          {server.name}
        </h3>
        <Badge tone={server.enabled ? 'success' : 'neutral'}>
          {server.enabled ? t('tools.mcp.on') : t('tools.mcp.off')}
        </Badge>
        <Badge>
          {isTransport(server.transport) ? t(`tools.mcp.transport.${server.transport}`) : server.transport}
        </Badge>
      </div>
      <p className="o-row__meta o-mono tl-url">{server.url}</p>
      <p className="o-row__meta">
        {[
          t('tools.scope', { scope: server.scope }),
          t('tools.mcp.calls', { count: calls }),
          server.tools === undefined || server.tools.length === 0
            ? undefined
            : t('tools.mcp.tools', { list: server.tools.join(', ') }),
          server.secretNames === undefined || server.secretNames.length === 0
            ? t('tools.mcp.noSecret')
            : t('tools.mcp.uses', { list: server.secretNames.join(', ') }),
        ]
          .filter((part) => part !== undefined)
          .join(' · ')}
      </p>
      {missing.length === 0 ? null : (
        <p className="tl-missing">
          {t('tools.mcp.missing', { list: missing.join(', '), count: missing.length })}
        </p>
      )}
      {actions === undefined ? null : (
        <div className="o-inline">
          <Button disabled={busy} onClick={actions.toggle}>
            {server.enabled ? t('tools.mcp.turnOff') : t('tools.mcp.turnOn')}
          </Button>
          <ConfirmButton
            label={t('tools.remove.ask')}
            confirm={t('tools.remove.confirm', { what: server.name })}
            keep={t('tools.remove.keep')}
            disabled={busy}
            onConfirm={actions.remove}
          />
        </div>
      )}
    </article>
  );
}
