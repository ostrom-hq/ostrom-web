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
  // Whether the copy worked, for the value it copied: a new value starts with nothing said.
  const [copy, setCopy] = useState<{ readonly of: string; readonly worked: boolean } | undefined>(undefined);
  const copied = copy?.of === value ? copy.worked : undefined;
  return (
    <span className="o-copy">
      <input
        className="o-cmd o-copy__value"
        aria-label={label}
        readOnly
        value={value}
        onFocus={(event) => {
          event.currentTarget.select();
        }}
      />
      <Button
        variant="secondary"
        aria-label={t('app.copy.named', { label })}
        onClick={() => {
          const failed = (): void => {
            setCopy({ of: value, worked: false });
          };
          // Without a secure context the Clipboard API is missing and throws at once, not in the promise.
          try {
            navigator.clipboard.writeText(value).then(() => {
              setCopy({ of: value, worked: true });
            }, failed);
          } catch {
            failed();
          }
        }}
      >
        {t('app.copy.action')}
      </Button>
      <span className="o-row__meta" role="status">
        {copied === undefined ? '' : copied ? t('app.copy.done') : t('app.copy.failed')}
      </span>
    </span>
  );
}
