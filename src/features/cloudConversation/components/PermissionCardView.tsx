// SPDX-License-Identifier: Apache-2.0
import { type ReactElement, useId } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import type { AgentQuestion } from '../events';
import { NO_CHOICE, type PermissionCard } from '../permissions';
import type { PermissionNotice, PermissionsViewModel } from '../usePermissions';

type Translate = ReturnType<typeof useTranslation>['t'];

function noticeText(notice: PermissionNotice, t: Translate): string {
  switch (notice.kind) {
    case 'closed':
      return notice.code === 'permission_request_answered'
        ? t('cloudConversation.permission.answered')
        : notice.code === 'permission_request_expired'
          ? t('cloudConversation.permission.expired')
          : t('cloudConversation.permission.ended');
    case 'invalid':
      return notice.code === 'permission_input_unseen'
        ? t('cloudConversation.permission.inputUnseen')
        : t('cloudConversation.permission.invalid', {
            code: notice.code ?? t('cloudConversation.permission.unknown'),
          });
    case 'denied':
      return t('cloudConversation.permission.denied');
    case 'rejected':
      return t('cloudConversation.permission.rejected', { reason: notice.reason });
    case 'failure':
      return notice.reason ?? t('cloudConversation.permission.unknown');
  }
}

/**
 * The open permission request the agent waits on (TeamCode's companion `PermissionCardView`): a question shown one at a
 * time (options, "Other" with its text, Back, Next and Send on the last one, Decline), or a tool use with its input
 * (Allow, Deny, and Bypass for the owner). Every text here is the agent's and is shown as plain text.
 */
export function PermissionCardView({
  view,
  bypassOffered,
}: {
  readonly view: PermissionsViewModel;
  readonly bypassOffered: boolean;
}): ReactElement | null {
  const { t } = useTranslation();
  const { card, notice } = view;
  if (card === undefined)
    return notice === undefined ? null : (
      <p className="cc-meta" role="status">
        {noticeText(notice, t)}
      </p>
    );
  const { request } = card;
  const title = request.question
    ? t('cloudConversation.permission.questionTitle')
    : t('cloudConversation.permission.toolTitle', {
        tool: request.toolName ?? t('cloudConversation.permission.aTool'),
      });
  return (
    <section className="cc-permission" aria-label={title}>
      <p className="cc-permission__head">
        <Badge tone="signal" approval="waiting">
          {title}
        </Badge>
        {request.question && card.answerable && request.questions.length > 1 ? (
          <span className="cc-meta">
            {t('cloudConversation.permission.progress', {
              step: card.step + 1,
              count: request.questions.length,
            })}
          </span>
        ) : null}
      </p>
      {card.waiting > 0 ? (
        <p className="cc-meta">{t('cloudConversation.permission.moreWaiting', { count: card.waiting })}</p>
      ) : null}
      {!card.answerable ? (
        <>
          <p>{t('cloudConversation.permission.leftOut')}</p>
          <pre className="cc-code o-mono">{request.inputPreview ?? ''}</pre>
          <div className="o-inline">
            <Button variant="danger" disabled={!card.editable} onClick={view.deny}>
              {request.question
                ? t('cloudConversation.permission.decline')
                : t('cloudConversation.permission.deny')}
            </Button>
          </div>
        </>
      ) : card.current !== undefined ? (
        // An answerable question: one of its questions shows; a tool use has none.
        <Question card={card} question={card.current} view={view} />
      ) : (
        <>
          {request.description === undefined ? null : <p>{request.description}</p>}
          {/* Answerable: its input was read. */}
          <pre className="cc-code o-mono">{request.input}</pre>
          <div className="o-inline">
            <Button variant="danger" disabled={!card.editable} onClick={view.deny}>
              {t('cloudConversation.permission.deny')}
            </Button>
            {bypassOffered ? (
              <Button variant="ghost" disabled={!card.editable} onClick={view.bypass}>
                {t('cloudConversation.permission.bypass')}
              </Button>
            ) : null}
            {/* Garnet: the approve gesture, the only one here. */}
            <Button variant="primary" disabled={!card.editable} onClick={view.allow}>
              {t('cloudConversation.permission.allow')}
            </Button>
          </div>
        </>
      )}
      <AnswerStatus card={card} view={view} />
      {notice === undefined ? null : (
        <p className="cc-danger" role="alert">
          {noticeText(notice, t)}
        </p>
      )}
    </section>
  );
}

function Question({
  card,
  question,
  view,
}: {
  readonly card: PermissionCard;
  readonly question: AgentQuestion;
  readonly view: PermissionsViewModel;
}): ReactElement {
  const { t } = useTranslation();
  const name = useId();
  const choice = card.draft.choices.get(question.index) ?? NO_CHOICE;
  const type = question.multiSelect ? 'checkbox' : 'radio';
  return (
    <fieldset className="cc-question" disabled={!card.editable}>
      <legend>
        {question.header === undefined ? null : <Badge>{question.header}</Badge>} {question.text}
      </legend>
      <p className="cc-meta">
        {question.multiSelect
          ? t('cloudConversation.permission.chooseSeveral')
          : t('cloudConversation.permission.chooseOne')}
      </p>
      {question.options.map((option, index) => (
        <label key={`${String(index)}-${option.label}`} className="cc-choice">
          <input
            type={type}
            name={name}
            checked={choice.options.includes(index)}
            onChange={() => {
              view.selectOption(question.index, index);
            }}
          />
          <span>
            {option.label}
            {option.description === undefined ? null : <span className="cc-meta"> {option.description}</span>}
          </span>
        </label>
      ))}
      <label className="cc-choice">
        <input
          type={type}
          name={name}
          checked={choice.other}
          onChange={() => {
            view.selectOther(question.index);
          }}
        />
        <span>{t('cloudConversation.permission.other')}</span>
      </label>
      {choice.other ? (
        <textarea
          className="o-input"
          rows={2}
          aria-label={t('cloudConversation.permission.otherHint')}
          placeholder={t('cloudConversation.permission.otherHint')}
          value={choice.otherText}
          onChange={(event) => {
            view.otherText(question.index, event.target.value);
          }}
        />
      ) : null}
      <div className="o-inline">
        {card.step > 0 ? (
          <Button variant="ghost" onClick={view.previous}>
            {t('cloudConversation.permission.back')}
          </Button>
        ) : null}
        <Button variant="danger" onClick={view.deny}>
          {t('cloudConversation.permission.decline')}
        </Button>
        {card.last ? (
          <Button disabled={!card.currentAnswered} onClick={view.sendAnswers}>
            {t('cloudConversation.permission.send')}
          </Button>
        ) : (
          <Button disabled={!card.currentAnswered} onClick={view.next}>
            {t('cloudConversation.permission.next')}
          </Button>
        )}
      </div>
    </fieldset>
  );
}

function AnswerStatus({
  card,
  view,
}: {
  readonly card: PermissionCard;
  readonly view: PermissionsViewModel;
}): ReactElement | null {
  const { t } = useTranslation();
  switch (card.draft.state) {
    case 'editing':
      return null;
    case 'sending':
      return (
        <p className="cc-meta" role="status">
          {t('cloudConversation.permission.sending')}
        </p>
      );
    case 'sent':
      return (
        <p className="cc-meta" role="status">
          {t('cloudConversation.permission.sent')}
        </p>
      );
    case 'failed':
      return (
        <p className="cc-danger" role="status">
          {t('cloudConversation.permission.failed', {
            // Failed: the reason of the failure is there.
            reason: card.draft.reason,
          })}{' '}
          <Button variant="ghost" onClick={view.retry}>
            {t('cloudConversation.permission.retry')}
          </Button>
        </p>
      );
  }
}
