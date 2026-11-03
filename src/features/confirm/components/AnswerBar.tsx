// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import type { AnswerViewModel } from '../useConfirmation';

export interface AnswerBarProps {
  readonly answer: AnswerViewModel;
  /** Who answers, "Maya Lind (maya)", once known. */
  readonly viewerName: string | undefined;
  /** False only once the role is known and is neither owner nor admin: the server would refuse the answer. */
  readonly mayAnswer: boolean;
}

/** Under the thumb on a phone: refuse, or confirm the change exactly as shown above. */
export function AnswerBar({ answer, viewerName, mayAnswer }: AnswerBarProps): ReactElement {
  const { t } = useTranslation();
  const { sending } = answer;
  const busy = sending !== undefined;
  return (
    <footer className="ys-act" aria-label={t('confirm.act.label')}>
      {mayAnswer ? (
        <>
          {viewerName === undefined ? null : (
            <p className="ys-small ys-meta">{t('confirm.act.signedAs', { name: viewerName })}</p>
          )}
          <div className="ys-act__buttons">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                answer.answer('refuse');
              }}
            >
              {sending === 'refuse' ? t('confirm.act.refusing') : t('confirm.act.refuse')}
            </Button>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => {
                answer.answer('confirm');
              }}
            >
              {sending === 'confirm' ? t('confirm.act.confirming') : t('confirm.act.confirm')}
            </Button>
          </div>
        </>
      ) : (
        <Banner tone="info" tag={t('confirm.act.notYoursTag')}>
          {t('confirm.act.notYours')}
        </Banner>
      )}
    </footer>
  );
}
