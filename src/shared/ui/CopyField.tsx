// SPDX-License-Identifier: AGPL-3.0-only
import { type ReactElement, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';

export interface CopyFieldProps {
  /** Names the value for screen readers: "Invitation link", "Install command". */
  readonly label: string;
  readonly value: string;
}

/** A value to copy, shown in the monospace face, with a button that says whether the copy worked. */
export function CopyField({ label, value }: CopyFieldProps): ReactElement {
  const { t } = useTranslation();
  const [copied, setCopied] = useState<'yes' | 'no' | undefined>(undefined);
  return (
    <span className="o-copy">
      <code className="o-cmd o-copy__value" aria-label={label}>
        {value}
      </code>
      <Button
        variant="secondary"
        aria-label={t('app.copy.named', { label })}
        onClick={() => {
          const failed = (): void => {
            setCopied('no');
          };
          // Without a secure context the Clipboard API is missing and throws at once, not in the promise.
          try {
            navigator.clipboard.writeText(value).then(() => {
              setCopied('yes');
            }, failed);
          } catch {
            failed();
          }
        }}
      >
        {t('app.copy.action')}
      </Button>
      <span className="o-row__meta" role="status">
        {copied === undefined ? '' : copied === 'yes' ? t('app.copy.done') : t('app.copy.failed')}
      </span>
    </span>
  );
}
