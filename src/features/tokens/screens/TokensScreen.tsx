// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '@/shared/ui/Banner';
import { EmptyState, LoadState, Screen } from '@/shared/ui/Screen';
import { NewSecret } from '../components/NewSecret';
import { TokenForm } from '../components/TokenForm';
import { TokenRow } from '../components/TokenRow';
import { useCreateToken, useTokenActions, useTokens } from '../useTokens';
import './tokens.css';

/** The person's own tokens, for scripts and CI: they belong to no organization and never say yes. */
export function TokensScreen(): ReactElement {
  const { t } = useTranslation();
  const view = useTokens();
  const create = useCreateToken();
  const actions = useTokenActions();
  // One secret at a time: while one is on its way or on screen, nothing else on the page changes a token, so it is
  // never lost under another nor shown for a token already revoked.
  const locked =
    create.creating || create.created !== undefined || actions.rotating || actions.rotated !== undefined;
  return (
    <Screen
      title={t('tokens.title')}
      lead={view.tokens === undefined ? undefined : t('tokens.lead', { count: view.tokens.length })}
    >
      <TokenForm create={create} locked={locked} />
      {actions.rotated === undefined ? null : (
        <NewSecret created={actions.rotated} onDone={actions.dismiss} />
      )}
      {actions.failure === undefined ? null : (
        <Banner tone="danger" tag={t('tokens.list.errorTag')} live>
          {actions.failure.message}
        </Banner>
      )}
      <LoadState data={view.tokens} failure={view.failure}>
        {(tokens) =>
          tokens.length === 0 ? (
            <EmptyState title={t('tokens.list.emptyTitle')}>{t('tokens.list.empty')}</EmptyState>
          ) : (
            <section aria-labelledby="tk-list" className="o-stack">
              <h2 id="tk-list" className="o-label">
                {t('tokens.list.title')}
              </h2>
              <ul className="o-card o-rows">
                {tokens.map((token) => (
                  <li key={token.id}>
                    <TokenRow
                      token={token}
                      busy={actions.busy === token.id}
                      locked={locked}
                      onRevoke={() => {
                        actions.revoke(token.id);
                      }}
                      onRotate={() => {
                        actions.rotate(token.id);
                      }}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )
        }
      </LoadState>
    </Screen>
  );
}
