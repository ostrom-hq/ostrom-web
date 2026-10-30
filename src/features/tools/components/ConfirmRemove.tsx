// SPDX-License-Identifier: AGPL-3.0-only
import { type ReactElement, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/Button';

export interface ConfirmRemoveProps {
  /** What is removed, read in the question ("Remove linear?"). */
  readonly what: string;
  readonly disabled: boolean;
  readonly onConfirm: () => void;
}

/** Removing takes two clicks: the second button says exactly what goes away. */
export function ConfirmRemove({ what, disabled, onConfirm }: ConfirmRemoveProps): ReactElement {
  const { t } = useTranslation();
  const [asking, setAsking] = useState(false);
  return asking ? (
    <span className="o-inline">
      <Button
        variant="danger"
        disabled={disabled}
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        {t('tools.remove.confirm', { what })}
      </Button>
      <Button
        variant="ghost"
        onClick={() => {
          setAsking(false);
        }}
      >
        {t('tools.remove.keep')}
      </Button>
    </span>
  ) : (
    <Button
      variant="ghost"
      disabled={disabled}
      onClick={() => {
        setAsking(true);
      }}
    >
      {t('tools.remove.ask')}
    </Button>
  );
}
