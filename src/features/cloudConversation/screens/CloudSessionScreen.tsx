// SPDX-License-Identifier: Apache-2.0
import type { CloudSession } from '@gen/api/types.gen';
import { Link, useParams } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { Badge, type BadgeTone } from '@/shared/ui/Badge';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { Markdown } from '@/shared/ui/Markdown';
import { LoadState, Screen, Section } from '@/shared/ui/Screen';
import { Composer, PendingBubble } from '../components/Composer';
import { TranscriptItemView } from '../components/TranscriptItemView';
import { keyOf } from '../items';
import {
  type CloudConversationViewModel,
  type LiveState,
  useCloudConversation,
} from '../useCloudConversation';
import './conversation.css';

/** The statuses the console has words for (`cloud.status.*`); another one shows as the server wrote it. */
const STATUSES = ['queued', 'starting', 'running', 'ended', 'stopped', 'failed'] as const;
type Status = (typeof STATUSES)[number];

function knownStatus(status: string): Status | undefined {
  return STATUSES.find((known) => known === status);
}

const LIVE_TONES: Readonly<Record<LiveState, BadgeTone>> = {
  connecting: 'neutral',
  live: 'success',
  reconnecting: 'warning',
  ended: 'neutral',
  stopped: 'neutral',
};

/** A cloud session in conversation mode: its transcript, followed live, and the box to message its agent. */
export function CloudSessionScreen(): ReactElement {
  const { sessionId } = useParams({ from: '/cloud/sessions/$sessionId' });
  // One session's state per screen: another session's address starts afresh, its transcript and messages with it.
  return <SessionScreen key={sessionId} sessionId={sessionId} />;
}

function SessionScreen({ sessionId }: { readonly sessionId: string }): ReactElement {
  const { t } = useTranslation();
  const view = useCloudConversation(sessionId);
  const back = (
    <Link to="/cloud" className="o-back">
      {t('cloudConversation.back')}
    </Link>
  );
  if (view.gone)
    return (
      <Screen top={back} title={sessionId}>
        <Banner tone="warning" tag={t('app.failure.tag')}>
          {t('cloudConversation.gone')}
        </Banner>
      </Screen>
    );
  return (
    <LoadState data={view.session} failure={view.sessionFailure} rows={2}>
      {(session) => <SessionBody session={session} view={view} back={back} />}
    </LoadState>
  );
}

function SessionBody({
  session,
  view,
  back,
}: {
  readonly session: CloudSession;
  readonly view: CloudConversationViewModel;
  readonly back: ReactElement;
}): ReactElement {
  const { t } = useTranslation();
  const status = knownStatus(session.status);
  const title = session.name ?? `${session.agent} · ${session.id}`;
  return (
    <Screen
      top={
        <>
          {back}
          <Badge tone={session.status === 'running' ? 'success' : 'neutral'}>
            {status === undefined ? session.status : t(`cloud.status.${status}`)}
          </Badge>
          {view.conversation ? (
            <Badge tone={LIVE_TONES[view.live]}>{t(`cloudConversation.live.${view.live}`)}</Badge>
          ) : null}
        </>
      }
      title={title}
      lead={[session.owner, session.agent, session.model].filter((part) => part !== undefined).join(' · ')}
    >
      {view.conversation ? (
        <Conversation view={view} />
      ) : (
        <p className="o-empty">
          {session.mode === 'conversation'
            ? t('cloudConversation.unsupported')
            : t('cloudConversation.notConversation')}
        </p>
      )}
    </Screen>
  );
}

function Conversation({ view }: { readonly view: CloudConversationViewModel }): ReactElement {
  const { t } = useTranslation();
  const reason = view.waiting?.reason;
  return (
    <>
      {view.error === undefined ? null : (
        <Banner tone="warning" tag={t('app.failure.tag')} live>
          {view.error.message === 'access_denied' ? t('cloudConversation.denied') : view.error.message}{' '}
          <Button variant="ghost" onClick={view.retry}>
            {t('cloudConversation.retry')}
          </Button>
        </Banner>
      )}
      {view.waiting === undefined ? null : (
        // Garnet: a person is awaited. Answering it from here comes with the permission cards.
        <p className="cc-waiting" role="status">
          <Badge tone="signal" approval="waiting">
            {reason === 'permission' || reason === 'question'
              ? t(`cloudConversation.waiting.${reason}`)
              : t('cloudConversation.waiting.other')}
          </Badge>
        </p>
      )}
      <Section label={t('cloudConversation.transcript')}>
        <LoadState data={view.loaded ? view.items : undefined} failure={undefined}>
          {(items) => (
            <div className="cc-transcript" aria-live="polite">
              {items.length === 0 && view.pending.length === 0 && view.liveText === undefined ? (
                <p className="o-empty">{t('cloudConversation.empty')}</p>
              ) : null}
              {items.map((item) => (
                <TranscriptItemView key={keyOf(item)} item={item} memberId={view.memberId} />
              ))}
              {view.liveText === undefined ? null : (
                <div className="cc-item cc-live" aria-label={t('cloudConversation.writing')}>
                  <Markdown source={view.liveText} />
                </div>
              )}
              {view.pending.map((message) => (
                <PendingBubble
                  key={message.clientMessageId}
                  message={message}
                  onRetry={() => {
                    view.retryMessage(message);
                  }}
                  onDiscard={() => {
                    view.discard(message.clientMessageId);
                  }}
                />
              ))}
              {view.running && view.liveText === undefined ? (
                <p className="cc-meta" role="status">
                  {t('cloudConversation.running')}
                </p>
              ) : null}
            </div>
          )}
        </LoadState>
        <Composer view={view} />
      </Section>
    </>
  );
}
