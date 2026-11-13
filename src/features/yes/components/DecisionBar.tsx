// SPDX-License-Identifier: AGPL-3.0-only
import type { Approval } from '@gen/api/types.gen';
import { Link, useRouterState } from '@tanstack/react-router';
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useEnumLabel } from '@/shared/i18n/enumLabel';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { askedByViewer } from '../model';
import type { AnswerViewModel } from '../useYes';
import { GithubLinkAction, GithubLinkNotice } from './GithubLinkNotice';

export interface DecisionBarProps {
  readonly approval: Approval;
  readonly viewer: string | undefined;
  readonly viewerName: string | undefined;
  readonly answer: AnswerViewModel;
  /** A yes waits for the person's GitHub link: Approve is off, Decline stays open. */
  readonly linkRequired: boolean;
}

/** Under the thumb on a phone. Approving is one click on the proof above; declining always says why. */
export function DecisionBar({
  approval,
  viewer,
  viewerName,
  answer,
  linkRequired,
}: DecisionBarProps): ReactElement {
  const { t } = useTranslation();
  const enumText = useEnumLabel();
  const { sending, refusal, stepUp, githubLink, changed, failure } = answer;
  // Back to this very page after signing in: the router's own path for the request, never one rebuilt by hand.
  const here = useRouterState({ select: (state) => `${state.location.pathname}${state.location.searchStr}` });
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
          {stepUp ? (
            <>
              {' '}
              {/* A fresh sign-in, GitHub or an e-mailed link, then back to this request. */}
              <Link to="/signin" search={{ redirect: here }}>
                {t('yes.act.signInAgain')}
              </Link>
            </>
          ) : null}
          {githubLink ? (
            <>
              {' '}
              <GithubLinkAction />
            </>
          ) : null}
        </Banner>
      )}
      {/* The refusal already says it when the server refused a yes. */}
      {refusal === undefined && linkRequired ? <GithubLinkNotice count={1} /> : null}
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
              disabled={busy || linkRequired}
              onClick={() => {
                answer.answer(approval, 'approve');
              }}
            >
              {sending === 'approve'
                ? t('yes.act.approving')
                : approval.action === undefined
                  ? t('yes.act.approve')
                  : enumText('yes.act.approveKind', approval.action.kind)}
            </Button>
          </div>
        </>
      )}
    </footer>
  );
}
