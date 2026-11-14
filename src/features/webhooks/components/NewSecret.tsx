// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { CopyField } from '@/shared/ui/CopyField';

export interface NewSecretProps {
  readonly secret: string;
  readonly onDone: () => void;
}

/** A signing secret the server sent once: copy it now, it is never shown again. */
export function NewSecret({ secret, onDone }: NewSecretProps): ReactElement {
  const { t } = useTranslation();
  return (
    <Banner tone="warning" tag={t('webhooks.secret.tag')} live>
      <span className="o-stack">
        <span>{t('webhooks.secret.once')}</span>
        <CopyField label={t('webhooks.secret.label')} value={secret} />
        <Button variant="ghost" onClick={onDone}>
          {t('webhooks.secret.done')}
        </Button>
      </span>
    </Banner>
  );
}
