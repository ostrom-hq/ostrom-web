// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '@/shared/ui/Banner';
import { ConfirmButton } from '@/shared/ui/ConfirmButton';
import { FailureText } from '@/shared/ui/FailureText';
import { LoadState, Section } from '@/shared/ui/Screen';
import { usePersonalMcpPromote, usePersonalMcpReview } from '../usePersonalMcpReview';

/**
 * The members' own MCP servers, for an administrator's review: their definition (address or command, the secret names
 * they use), never a credential. An administrator promotes one to the team; a member edits or removes their own.
 */
export function PersonalMcpReview(): ReactElement {
  const { t } = useTranslation();
  const view = usePersonalMcpReview();
  const change = usePersonalMcpPromote();
  return (
    <Section label={t('tools.review.title')}>
      <p className="o-row__meta">{t('tools.review.lead')}</p>
      {change.failure === undefined ? null : (
        <Banner tone="danger" tag={t('tools.errorTag')} live>
          <FailureText failure={change.failure} />
        </Banner>
      )}
      <LoadState data={view.servers} failure={view.failure}>
        {(servers) =>
          servers.length === 0 ? (
            <p className="o-empty">{t('tools.review.empty')}</p>
          ) : (
            <ul className="o-card o-rows" aria-label={t('tools.review.title')}>
              {servers.map((server) => (
                <li key={server.name} className="o-row">
                  <span className="o-row__main">
                    <span className="o-row__title o-mono">{server.name}</span>
                    <span className="o-row__meta">
                      {[
                        t('tools.review.owner', { who: view.ownerOf(server.owner ?? '') }),
                        server.url,
                        ...(server.secretNames ?? []).map((name) => t('tools.review.secret', { name })),
                      ]
                        .filter((part) => part !== undefined)
                        .join(' · ')}
                    </span>
                  </span>
                  <span className="o-row__end">
                    <ConfirmButton
                      tone="secondary"
                      label={t('tools.review.promote')}
                      confirm={t('tools.review.promoteConfirm', { what: server.name })}
                      keep={t('tools.remove.keep')}
                      disabled={change.pending !== undefined}
                      onConfirm={() => {
                        change.promote(server.name);
                      }}
                    />
                  </span>
                </li>
              ))}
            </ul>
          )
        }
      </LoadState>
    </Section>
  );
}
