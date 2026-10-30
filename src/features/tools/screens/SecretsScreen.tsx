// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '@/shared/ui/Banner';
import { LoadState, Screen } from '@/shared/ui/Screen';
import { AddSecretForm } from '../components/AddSecretForm';
import { SecretRow } from '../components/SecretRow';
import { useSecretChange, useSecrets } from '../useTools';
import './tools.css';

/** The organization's secrets: written here, given to the agents' sandboxes and MCP servers, never read back. */
export function SecretsScreen(): ReactElement {
  const { t } = useTranslation();
  const view = useSecrets();
  const change = useSecretChange();
  return (
    <Screen title={t('tools.secrets.title')} lead={t('tools.secrets.lead')}>
      {change.failure === undefined ? null : (
        <Banner tone="danger" tag={t('tools.errorTag')} live>
          {change.failure.message}
        </Banner>
      )}
      {view.canManage ? <AddSecretForm change={change} /> : null}
      <LoadState data={view.secrets} failure={view.failure}>
        {(secrets) =>
          secrets.length === 0 ? (
            <p className="o-empty">{t('tools.secrets.empty')}</p>
          ) : (
            <ul className="o-card o-rows">
              {secrets.map((secret) => (
                <li key={secret.name}>
                  <SecretRow
                    secret={secret}
                    busy={change.pending !== undefined}
                    actions={
                      view.canManage
                        ? {
                            rotate: (value, onDone) => {
                              change.rotate(secret.name, value, onDone);
                            },
                            remove: () => {
                              change.remove(secret.name);
                            },
                          }
                        : undefined
                    }
                  />
                </li>
              ))}
            </ul>
          )
        }
      </LoadState>
    </Screen>
  );
}
