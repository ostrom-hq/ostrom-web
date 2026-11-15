// SPDX-License-Identifier: Apache-2.0
import type { CloudSessionResponse } from '@gen/api/types.gen';
import { Link, useParams } from '@tanstack/react-router';
import { type ReactElement, useCallback, useMemo } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { Badge, type BadgeTone } from '@/shared/ui/Badge';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { Markdown } from '@/shared/ui/Markdown';
import { LoadState, Screen, Section } from '@/shared/ui/Screen';
import { Composer, PendingBubble } from '../components/Composer';
import { FileDropArea } from '../components/FileComponents';
import { PermissionCardView } from '../components/PermissionCardView';
import { RunningPanel, ThreadBar } from '../components/RunningPanel';
import { SessionControls } from '../components/SessionControls';
import { type ThreadLinks, TranscriptItemView } from '../components/TranscriptItemView';
import { keyOf } from '../items';
import {
  type CloudConversationViewModel,
  type LiveState,
  useCloudConversation,
} from '../useCloudConversation';
import { usePermissions } from '../usePermissions';
import { useRunningWork } from '../useRunningWork';
import { useSessionControls } from '../useSessionControls';
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
  readonly session: CloudSessionResponse;
  readonly view: CloudConversationViewModel;
  readonly back: ReactElement;
}): ReactElement {
  const { t } = useTranslation();
  const status = knownStatus(session.status);
  const title = session.name === '' ? `${session.agent} · ${session.id}` : session.name;
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
        <Conversation session={session} view={view} />
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

function Conversation({
  session,
  view,
}: {
  readonly session: CloudSessionResponse;
  readonly view: CloudConversationViewModel;
}): ReactElement {
  const { t } = useTranslation();
  const controls = useSessionControls(session);
  const { setBypass } = controls;
  const enableBypass = useCallback(async () => setBypass(true), [setBypass]);
  const permissions = usePermissions(session.id, session, view.events, enableBypass);
  const running = useRunningWork(session.id, session, view.events, view.agents);
  const reason = view.waiting?.reason;
  const subagents = running.work.subagents;
  // The subagent whose thread shows: none for the main agent's (no subagent's id is undefined).
  const opened = subagents.find((agent) => agent.id === view.thread);
  const threads = useMemo(
    (): ThreadLinks | undefined =>
      view.feeds
        ? { subagents: new Map(subagents.map((agent) => [agent.id, agent])), open: view.openThread }
        : undefined,
    [view.feeds, subagents, view.openThread],
  );
  return (
    <>
      <SessionControls session={session} view={controls} />
      {view.error === undefined ? null : (
        <Banner tone="warning" tag={t('app.failure.tag')} live>
          {view.error.message === 'access_denied' ? t('cloudConversation.denied') : view.error.message}{' '}
          <Button variant="ghost" onClick={view.retry}>
            {t('cloudConversation.retry')}
          </Button>
        </Banner>
      )}
      {view.waiting === undefined || permissions.card !== undefined ? null : (
        // Garnet: a person is awaited. Answering it from here comes with the permission cards.
        <p className="cc-waiting" role="status">
          <Badge tone="signal" approval="waiting">
            {reason === 'permission' || reason === 'question'
              ? t(`cloudConversation.waiting.${reason}`)
              : t('cloudConversation.waiting.other')}
          </Badge>
        </p>
      )}
      <FileDropArea files={view.files}>
        <div className="cc-layout">
          <Section label={t('cloudConversation.transcript')}>
            {opened === undefined ? null : <ThreadBar subagent={opened} onBack={view.backToMain} />}
            <LoadState data={view.loaded ? view.items : undefined} failure={undefined}>
              {(items) => (
                <div className="cc-transcript" aria-live="polite">
                  {items.length === 0 && view.pending.length === 0 && view.liveText === undefined ? (
                    <p className="o-empty">
                      {view.thread === undefined
                        ? t('cloudConversation.empty')
                        : t('cloudConversation.work.threadEmpty')}
                    </p>
                  ) : null}
                  {items.map((item) => (
                    <TranscriptItemView
                      key={keyOf(item)}
                      item={item}
                      memberId={view.memberId}
                      threads={threads}
                    />
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
            <PermissionCardView view={permissions} bypassOffered={controls.bypassOffered} />
            <Composer view={view} />
          </Section>
          <RunningPanel
            view={running}
            thread={view.thread}
            onOpen={view.openThread}
            onMain={view.backToMain}
          />
        </div>
      </FileDropArea>
    </>
  );
}
