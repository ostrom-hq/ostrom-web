// SPDX-License-Identifier: Apache-2.0
import type { CreatedToken } from '@gen/api/types.gen';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { CopyField } from '@/shared/ui/CopyField';

export interface NewSecretProps {
  readonly created: CreatedToken;
  readonly onDone: () => void;
}

/** A secret the server sent once: copy it now, it is never shown again. */
export function NewSecret({ created, onDone }: NewSecretProps): ReactElement {
  const { t } = useTranslation();
  return (
    <Banner tone="warning" tag={t('tokens.secret.tag')} live>
      <span className="o-stack">
        <span>{t('tokens.secret.once', { name: created.token.name })}</span>
        <CopyField label={t('tokens.secret.label', { name: created.token.name })} value={created.secret} />
        <span className="o-row__meta">{t('tokens.secret.use')}</span>
        <span className="o-row__meta">{t('tokens.secret.held')}</span>
        <Button variant="ghost" onClick={onDone}>
          {t('tokens.secret.done')}
        </Button>
      </span>
    </Banner>
  );
}
