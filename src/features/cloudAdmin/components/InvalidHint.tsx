// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';

/**
 * What a form cannot send yet, by the label of its field. Said only once the person edited the form or tried to
 * submit it: an untouched form is not an error, and a screen reader is not told of one.
 */
export function InvalidHint({
  label,
  shown,
}: {
  readonly label: string | undefined;
  readonly shown: boolean;
}): ReactElement | null {
  const { t } = useTranslation();
  if (!shown || label === undefined) return null;
  return (
    <p className="o-row__meta" role="status">
      {t('cloudAdmin.invalidField', { field: label })}
    </p>
  );
}
