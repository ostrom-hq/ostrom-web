// SPDX-License-Identifier: AGPL-3.0-only
import { type ReactElement, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';

/** A secret the server returns once: shown in full with a copy button, and gone when the screen is left. */
export function SecretOnce({ name, value }: { readonly name: string; readonly value: string }): ReactElement {
  const { t } = useTranslation();
  const [copied, setCopied] = useState<'yes' | 'no' | undefined>(undefined);
  return (
    <Banner tone="warning" tag={t('automations.secret.tag')} live>
      <span className="o-stack">
        <span>{t('automations.secret.once', { name })}</span>
        <code className="o-cmd cl-secret">{value}</code>
        <span className="o-inline">
          <Button
            onClick={() => {
              navigator.clipboard.writeText(value).then(
                () => {
                  setCopied('yes');
                },
                () => {
                  setCopied('no');
                },
              );
            }}
          >
            {t('automations.secret.copy')}
          </Button>
          {copied === undefined ? null : (
            <span className="o-row__meta">
              {copied === 'yes' ? t('automations.secret.copied') : t('automations.secret.copyFailed')}
            </span>
          )}
        </span>
      </span>
    </Banner>
  );
}
