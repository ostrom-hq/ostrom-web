// SPDX-License-Identifier: Apache-2.0
import type { WorkflowRun } from '@gen/api/types.gen';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { failureWords } from '../runs';

/**
 * Why a run ended as it did: the words for its stable code, then the server's own sentence when that adds to them
 * (or alone for a code the console has no words for). Nothing for a run that did not fail.
 */
export function RunFailure({ run }: { readonly run: WorkflowRun }): ReactElement | null {
  const { t } = useTranslation();
  const words = failureWords(run.failureCode);
  const said = words === undefined ? undefined : t(words.key, { node: words.node ?? '' });
  if (said === undefined && run.failure === undefined) return null;
  return (
    <>
      {said === undefined ? null : <span className="o-row__meta">{said}</span>}
      {run.failure === undefined || run.failure === said ? null : (
        <span className="o-row__meta">{run.failure}</span>
      )}
    </>
  );
}
