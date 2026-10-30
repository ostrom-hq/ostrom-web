// SPDX-License-Identifier: AGPL-3.0-only
import type { Approval } from '@gen/api/types.gen';
import { Link } from '@tanstack/react-router';
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiUrl } from '@/shared/api/apiClient';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { askedByViewer, reauthProvider } from '../model';
import type { AnswerViewModel } from '../useYes';

export interface DecisionBarProps {
  readonly approval: Approval;
  readonly viewer: string | undefined;
  readonly viewerName: string | undefined;
  /** How the viewer signed in: signing in again for a yes goes the same way. */
  readonly via: string | undefined;
  readonly answer: AnswerViewModel;
}

/** Under the thumb on a phone. Approving is one click on the proof above; declining always says why. */
export function DecisionBar({ approval, viewer, viewerName, via, answer }: DecisionBarProps): ReactElement {
  const { t } = useTranslation();
  const { sending, refusal, stepUp, changed, failure } = answer;
  const back = `/yes/${approval.id}`;
  const provider = reauthProvider(via);
  const [declining, setDeclining] = useState(false);
  const [comment, setComment] = useState('');
  const commentId = useId();
  const busy = sending !== undefined;
  const reason = comment.trim();
  return (
    <footer className="ys-act">
      {changed ? (
        <Banner tone="warning" tag={t('yes.act.changedTag')} live>
          {t('yes.act.changed')}
        </Banner>
      ) : null}
      {refusal === undefined ? null : (
        <Banner tone="danger" tag={t('yes.act.refusedTag')} live>
          {refusal}
        </Banner>
      )}
      {refusal !== undefined && stepUp ? (
        <div>
          {provider === undefined ? (
            <Link to="/signin" search={{ redirect: back }} className="o-btn o-btn--secondary o-btn--md">
              {t('yes.act.signInAgain')}
            </Link>
          ) : (
            <a
              className="o-btn o-btn--secondary o-btn--md"
              href={apiUrl(`/api/v1/auth/${provider}/start`, { reauth: 'true', redirect: back })}
            >
              {t('yes.act.signInAgain')}
            </a>
          )}
        </div>
      ) : null}
      {failure === undefined ? null : (
        <Banner tone="danger" tag={t('yes.act.errorTag')} live>
          {failure.message}
        </Banner>
      )}
      {refusal === undefined && askedByViewer(approval, viewer) ? (
        <Banner tone="warning" tag={t('yes.act.youAskedTag')}>
          {t('yes.act.youAsked')}
        </Banner>
      ) : null}
      {declining ? (
        <form
          className="ys-decline"
          onSubmit={(event) => {
            event.preventDefault();
            answer.answer(approval, 'reject', reason);
          }}
        >
          <label htmlFor={commentId} className="ys-label">
            {t('yes.act.declineLabel')}
          </label>
          <textarea
            id={commentId}
            className="ys-textarea"
            rows={3}
            maxLength={2000}
            placeholder={t('yes.act.declinePlaceholder')}
            value={comment}
            onChange={(event) => {
              setComment(event.target.value);
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
              {sending === 'reject' ? t('yes.act.declining') : t('yes.act.sendDecline')}
            </Button>
          </div>
        </form>
      ) : (
        <>
          {viewerName === undefined ? null : (
            <p className="ys-small ys-meta">{t('yes.act.signedAs', { name: viewerName })}</p>
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
              data-approval="approve"
              disabled={busy}
              onClick={() => {
                answer.answer(approval, 'approve');
              }}
            >
              {sending === 'approve'
                ? t('yes.act.approving')
                : approval.action === undefined
                  ? t('yes.act.approve')
                  : t(`yes.act.approveKind.${approval.action.kind}`)}
            </Button>
          </div>
        </>
      )}
    </footer>
  );
}
