// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { FailureText } from '@/shared/ui/FailureText';
import { isConflict } from '../model';
import type { Saving } from '../useCloudAdmin';

export interface SaveOutcomeProps {
  readonly write: Saving;
  /** What is said once a save was taken. */
  readonly saved: string;
  /** Reads what was saved first again: what a person does after a conflict. */
  readonly onReload: () => void;
}

/** What a save came to: taken, refused in the server's words, or a conflict that asks to reload. */
export function SaveOutcome({ write, saved, onReload }: SaveOutcomeProps): ReactElement {
  const { t } = useTranslation();
  return (
    <>
      {write.saved && write.failure === undefined ? (
        <Banner tone="info" tag={t('cloudAdmin.savedTag')} live>
          {saved}
        </Banner>
      ) : null}
      {write.failure === undefined ? null : (
        <Banner tone="danger" tag={t('cloudAdmin.errorTag')} live>
          {isConflict(write.failure) ? (
            <>
              {t('cloudAdmin.conflict')}{' '}
              <Button
                onClick={() => {
                  write.clear();
                  onReload();
                }}
              >
                {t('cloudAdmin.reload')}
              </Button>
            </>
          ) : (
            <FailureText failure={write.failure} />
          )}
        </Banner>
      )}
    </>
  );
}
