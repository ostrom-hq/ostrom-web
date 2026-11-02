// SPDX-License-Identifier: AGPL-3.0-only
import type { TFunction } from 'i18next';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { isApiFailure } from '@/shared/api/ApiFailure';
import { Banner } from '@/shared/ui/Banner';
import type { WorkflowChange } from '../useWorkflows';

function conflictHint(change: WorkflowChange['kind'] | undefined, t: TFunction): string {
  switch (change) {
    case 'create':
      return t('workflows.edit.createConflict');
    case 'delete':
      return t('workflows.actions.inUse');
    case 'accept':
      return t('workflows.actions.acceptConflict');
    case 'save':
    case undefined:
      return t('workflows.edit.conflict');
  }
}

/**
 * A change the server did not take, in its words. A conflict says what to do, by the change it refused: a new
 * workflow whose id was taken in between gets another on the next try; a save from an older version starts again from
 * the saved one; an acceptance is decided again on the version now shown; a deletion waits for what still uses it.
 */
export function WorkflowFailure({
  failure,
  change,
}: {
  readonly failure: Error;
  readonly change: WorkflowChange['kind'] | undefined;
}): ReactElement {
  const { t } = useTranslation();
  const conflict = isApiFailure(failure) && failure.kind === 'conflict';
  const hint = conflict ? conflictHint(change, t) : undefined;
  return (
    <Banner tone="danger" tag={t('workflows.actions.errorTag')} live>
      {hint === undefined ? failure.message : `${failure.message} ${hint}`}
    </Banner>
  );
}
