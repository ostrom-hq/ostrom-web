// SPDX-License-Identifier: Apache-2.0
import { type ReactElement, useId } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { Button } from '@/shared/ui/Button';
import type { PendingMessage } from '../pending';
import type { CloudConversationViewModel } from '../useCloudConversation';

/** A message sent from here, until the transcript shows it: its state, and Retry or Discard once it failed. */
export function PendingBubble({
  message,
  onRetry,
  onDiscard,
}: {
  readonly message: PendingMessage;
  readonly onRetry: () => void;
  readonly onDiscard: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const reason = message.reason ?? t('cloudConversation.pending.unknown');
  const status =
    message.state === 'sending'
      ? t('cloudConversation.pending.sending')
      : message.state === 'sent'
        ? message.woke
          ? t('cloudConversation.pending.woke')
          : t('cloudConversation.pending.sent')
        : message.state === 'failed'
          ? t('cloudConversation.pending.failed', { reason })
          : t('cloudConversation.pending.refused', { reason });
  const over = message.state === 'failed' || message.state === 'refused';
  return (
    <div className="cc-item cc-user cc-pending">
      <p className="cc-bubble">{message.text}</p>
      <span className={over ? 'cc-meta cc-danger' : 'cc-meta'} role="status">
        {status}
      </span>
      {over ? (
        <span className="o-inline">
          {message.state === 'failed' ? (
            <Button onClick={onRetry}>{t('cloudConversation.pending.retry')}</Button>
          ) : null}
          <Button variant="ghost" onClick={onDiscard}>
            {t('cloudConversation.pending.discard')}
          </Button>
        </span>
      ) : null}
    </div>
  );
}

/** The message box, Send, and Interrupt while a turn runs. */
export function Composer({ view }: { readonly view: CloudConversationViewModel }): ReactElement {
  const { t } = useTranslation();
  const id = useId();
  if (view.ended) return <p className="o-row__meta">{t('cloudConversation.composer.ended')}</p>;
  return (
    <form
      className="o-stack"
      onSubmit={(event) => {
        event.preventDefault();
        view.send();
      }}
    >
      <label htmlFor={id} className="o-field-label">
        {t('cloudConversation.composer.label')}
      </label>
      <textarea
        id={id}
        className="o-input"
        rows={3}
        value={view.draft}
        onChange={(event) => {
          view.setDraft(event.target.value);
        }}
        onKeyDown={(event) => {
          // Enter sends, Shift+Enter breaks the line.
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            if (view.canSend) view.send();
          }
        }}
      />
      {view.notice === undefined ? null : (
        <p className="cc-danger" role="alert">
          {view.notice.kind === 'nothingRunning'
            ? t('cloudConversation.nothingRunning')
            : view.notice.kind === 'invalidMessage'
              ? t('cloudConversation.composer.invalid')
              : view.notice.error.message}
        </p>
      )}
      <div className="o-inline">
        <Button type="submit" disabled={!view.canSend}>
          {t('cloudConversation.composer.send')}
        </Button>
        {view.running ? (
          <Button variant="danger" disabled={view.interrupting} onClick={view.interrupt}>
            {view.interrupting ? t('cloudConversation.interrupting') : t('cloudConversation.interrupt')}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
