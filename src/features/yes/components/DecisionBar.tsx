// SPDX-License-Identifier: AGPL-3.0-only
import type { Ask } from '@gen/api/types.gen';
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { actionKind } from '../model';
import type { DecideViewModel } from '../useYes';

export interface DecisionBarProps {
  readonly ask: Ask;
  readonly viewer: string | undefined;
  readonly decision: DecideViewModel;
  /** Why approving is not possible yet (a folded diff), shown instead of letting the click through. */
  readonly blocked: string | undefined;
}

/** Under the thumb on a phone. Approving is one click on the proof above; declining always says why. */
export function DecisionBar({ ask, viewer, decision, blocked }: DecisionBarProps): ReactElement {
  const { t } = useTranslation();
  const { decide, signing, refusal, failure } = decision;
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState('');
  const noteId = useId();
  const busy = signing !== undefined;
  const reason = note.trim();
  return (
    <footer className="ys-act">
      {refusal === undefined ? null : (
        <Banner tone="danger" tag={t('yes.act.refusedTag')} live>
          {refusal.error}
        </Banner>
      )}
      {failure === undefined ? null : (
        <Banner tone="danger" tag={t('yes.act.errorTag')} live>
          {failure.message}
        </Banner>
      )}
      {refusal === undefined && ask.you?.self === true && !ask.you.canApprove ? (
        <Banner tone="warning" tag={t('yes.act.youAskedTag')}>
          {ask.you.reason}
        </Banner>
      ) : null}
      {ask.you?.selfApproval === true ? (
        <Banner tone="warning" tag={t('yes.act.onlyApproverTag')}>
          {t('yes.act.onlyApprover')}
        </Banner>
      ) : null}
      {declining ? (
        <form
          className="ys-decline"
          onSubmit={(event) => {
            event.preventDefault();
            decide('rejected', reason);
          }}
        >
          <label htmlFor={noteId} className="ys-label">
            {t('yes.act.declineLabel')}
          </label>
          <textarea
            id={noteId}
            className="ys-textarea"
            rows={3}
            maxLength={2000}
            placeholder={t('yes.act.declinePlaceholder')}
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
            }}
          />
          <div className="ys-act__buttons">
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setDeclining(false);
              }}
            >
              {t('yes.act.cancel')}
            </Button>
            <Button type="submit" variant="danger" disabled={busy || reason.length === 0}>
              {signing === 'rejected' ? t('yes.act.declining') : t('yes.act.sendDecline')}
            </Button>
          </div>
        </form>
      ) : (
        <>
          {blocked === undefined ? null : <p className="ys-small ys-meta">{blocked}</p>}
          {viewer === undefined ? null : (
            <p className="ys-small ys-meta">{t('yes.act.signedAs', { login: viewer })}</p>
          )}
          <div className="ys-act__buttons">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setDeclining(true);
              }}
            >
              {t('yes.act.decline')}
            </Button>
            <Button
              variant="primary"
              disabled={busy || blocked !== undefined}
              onClick={() => {
                decide('approved');
              }}
            >
              {signing === 'approved' ? t('yes.act.approving') : t(`yes.act.approve.${actionKind(ask)}`)}
            </Button>
          </div>
        </>
      )}
    </footer>
  );
}
