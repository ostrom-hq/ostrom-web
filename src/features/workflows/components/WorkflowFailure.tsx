// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { isApiFailure } from '@/shared/api/ApiFailure';
import { Banner } from '@/shared/ui/Banner';

/**
 * A change the server did not take, in its words. A conflict says what to do: a new workflow whose id was taken in
 * between gets another on the next try; a save from an older version starts again from the saved one.
 */
export function WorkflowFailure({
  failure,
  creating,
}: {
  readonly failure: Error;
  readonly creating: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const conflict = isApiFailure(failure) && failure.kind === 'conflict';
  const hint = creating ? t('workflows.edit.createConflict') : t('workflows.edit.conflict');
  return (
    <Banner tone="danger" tag={t('workflows.actions.errorTag')} live>
      {conflict ? `${failure.message} ${hint}` : failure.message}
    </Banner>
  );
}
