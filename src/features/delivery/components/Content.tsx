// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

/** "3 files · 1 204 bytes": what a version holds. */
export function Content({
  fileCount,
  sizeBytes,
}: {
  readonly fileCount: number;
  readonly sizeBytes: number;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <>{`${t('delivery.content.files', { count: fileCount })} · ${t('delivery.content.size', { count: sizeBytes })}`}</>
  );
}
