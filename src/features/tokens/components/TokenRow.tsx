// SPDX-License-Identifier: Apache-2.0
import type { Token } from '@gen/api/types.gen';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/shared/ui/Badge';
import { ConfirmButton } from '@/shared/ui/ConfirmButton';

export interface TokenRowProps {
  readonly token: Token;
  readonly busy: boolean;
  /** A secret is on its way or on screen: nothing is replaced or revoked until it is copied. */
  readonly locked: boolean;
  readonly onRevoke: () => void;
  readonly onRotate: () => void;
}

/** One token: its name, what it may do, the start of its secret, when it expires and when it was last used. */
export function TokenRow({ token, busy, locked, onRevoke, onRotate }: TokenRowProps): ReactElement {
  const { t, i18n } = useTranslation();
  const day = (at: string): string =>
    new Date(at).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' });
  const kind =
    token.kind === 'cli' || token.kind === 'personal' ? t(`tokens.kind.${token.kind}`) : token.kind;
  return (
    <div className="o-row tk-row">
      <span className="o-row__main">
        <span className="o-row__title">{token.name}</span>
        <span className="o-row__meta o-mono">{token.scopes.join(' ')}</span>
        <span className="o-row__meta">
          {[
            t('tokens.list.hint', { hint: token.hint }),
            t('tokens.list.created', { date: day(token.createdAt) }),
            token.expiresAt === null
              ? t('tokens.list.noExpiry')
              : t('tokens.list.expires', { date: day(token.expiresAt) }),
            token.lastUsedAt === null
              ? t('tokens.list.neverUsed')
              : t('tokens.list.used', { date: day(token.lastUsedAt) }),
          ].join(' · ')}
        </span>
      </span>
      <span className="o-row__end o-inline">
        <Badge>{kind}</Badge>
        <ConfirmButton
          label={t('tokens.list.rotate')}
          confirm={t('tokens.list.rotateConfirm', { name: token.name })}
          keep={t('tokens.list.keep')}
          disabled={busy || locked}
          onConfirm={onRotate}
        />
        <ConfirmButton
          label={t('tokens.list.revoke')}
          confirm={t('tokens.list.revokeConfirm', { name: token.name })}
          keep={t('tokens.list.keep')}
          disabled={busy || locked}
          onConfirm={onRevoke}
        />
      </span>
    </div>
  );
}
