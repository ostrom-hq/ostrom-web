// SPDX-License-Identifier: AGPL-3.0-only
import type { Receipt, Session, SessionGateAnswer } from '@gen/api/types.gen';
import { Link, useParams } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { formatAbsolute } from '@/shared/lib/time';
import { Badge, type BadgeTone } from '@/shared/ui/Badge';
import { useNow } from '@/shared/lib/useNow';
import { type Fact, Facts, LoadState, Screen, Section } from '@/shared/ui/Screen';
import { StateBadge } from '../components/StateBadge';
import { formatDuration, sessionState } from '../model';
import { useSession } from '../useSessions';

export function SessionScreen(): ReactElement {
  const { t } = useTranslation();
  const { sessionId } = useParams({ from: '/sessions/$sessionId' });
  const { session, receipt, failure } = useSession(sessionId);
  const now = useNow();
  return (
    <LoadState data={session} failure={failure} rows={2}>
      {(found) => (
        <Screen
          top={
            <>
              <Link to="/sessions" className="o-back">
                {t('sessions.detail.back')}
              </Link>
              <StateBadge state={sessionState(found, now)} />
            </>
          }
          title={[found.agent, found.repo].filter((part) => part !== undefined).join(' · ')}
          lead={t('sessions.detail.by', { dev: found.dev })}
        >
          <SessionDetail session={found} receipt={receipt} />
        </Screen>
      )}
    </LoadState>
  );
}

interface SessionDetailProps {
  readonly session: Session;
  readonly receipt: Receipt | undefined;
}

function optional(label: string, value: string | number | undefined, mono = false): Fact | undefined {
  return value === undefined ? undefined : { label, value, mono };
}

function SessionDetail({ session, receipt }: SessionDetailProps): ReactElement {
  const { t, i18n } = useTranslation();
  const at = (iso: string | undefined): string | undefined =>
    iso === undefined ? undefined : formatAbsolute(iso, i18n.language);
  const money = new Intl.NumberFormat(i18n.language, { style: 'currency', currency: 'USD' });
  const gates = session.gates ?? [];
  return (
    <>
      <Section label={t('sessions.detail.who')}>
        <Facts
          facts={[
            {
              label: t('sessions.detail.dev'),
              value:
                session.devVerified === true
                  ? t('sessions.detail.verified', { dev: session.dev })
                  : session.dev,
            },
            optional(t('sessions.detail.via'), session.devVia),
            optional(t('sessions.detail.agent'), session.agent),
            optional(t('sessions.detail.model'), session.model),
            optional(t('sessions.detail.repo'), session.repo),
            optional(t('sessions.detail.cwd'), session.cwd, true),
          ]}
        />
      </Section>

      <Section label={t('sessions.detail.when')}>
        <Facts
          facts={[
            { label: t('sessions.detail.started'), value: formatAbsolute(session.startedAt, i18n.language) },
            optional(t('sessions.detail.lastSeen'), at(session.lastSeenAt)),
            session.endedAt === undefined
              ? undefined
              : {
                  label: t('sessions.detail.ended'),
                  value: t('sessions.detail.endedValue', {
                    when: formatAbsolute(session.endedAt, i18n.language),
                    duration: formatDuration(session.startedAt, session.endedAt, i18n.language),
                  }),
                },
            optional(t('sessions.detail.endedBy'), session.endedBy),
            optional(t('sessions.detail.segment'), session.segment),
            session.resumedFrom === undefined
              ? undefined
              : {
                  label: t('sessions.detail.resumedFrom'),
                  value: (
                    <Link to="/sessions/$sessionId" params={{ sessionId: session.resumedFrom }}>
                      {session.resumedFrom}
                    </Link>
                  ),
                  mono: true,
                },
          ]}
        />
      </Section>

      <Section label={t('sessions.detail.what')}>
        <Facts
          facts={[
            optional(t('sessions.detail.tools'), session.tools),
            session.costUsd === undefined
              ? undefined
              : { label: t('sessions.detail.cost'), value: money.format(session.costUsd) },
            optional(t('sessions.detail.exitCode'), session.exitCode, true),
            optional(t('sessions.detail.harness'), session.harnessVersion, true),
            optional(t('sessions.detail.package'), session.packageDigest, true),
          ]}
        />
        {gates.length === 0 ? null : (
          <>
            <h3 className="o-label">{t('sessions.detail.requests', { count: gates.length })}</h3>
            <ul className="o-rows">
              {gates.map((gate) => (
                <li key={gate}>
                  <GateLine
                    gate={gate}
                    answer={session.gateAnswers?.find((item) => item.gateId === gate)}
                    ended={session.endedAt !== undefined}
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      <Section label={t('sessions.detail.receipt')}>
        {receipt === undefined ? (
          <p className="o-screen__lead">{t('sessions.detail.noReceipt')}</p>
        ) : (
          <Link to="/receipts/$receiptId" params={{ receiptId: receipt.id }} className="o-btn o-self-start">
            {t('sessions.detail.openReceipt', { id: receipt.id })}
          </Link>
        )}
      </Section>
    </>
  );
}

interface GateLineProps {
  readonly gate: string;
  /** The server's answer to the gate, once someone said yes or no; nothing while it waits. */
  readonly answer: SessionGateAnswer | undefined;
  /** The session ended: a gate nobody answered by then is said not answered, not waiting (it may still be, at /yes). */
  readonly ended: boolean;
}

function toneOf(answer: SessionGateAnswer | undefined): BadgeTone {
  if (answer === undefined) return 'neutral';
  return answer.outcome === 'approved' ? 'success' : 'danger';
}

function labelOf(answer: SessionGateAnswer | undefined, ended: boolean, t: TFunction): string {
  if (answer === undefined) return ended ? t('sessions.detail.notAnswered') : t('sessions.detail.unanswered');
  return answer.outcome === 'approved' ? t('sessions.detail.approved') : t('sessions.detail.refused');
}

/** A request the session made, and who answered it: the thread of the session, read on its own page. */
function GateLine({ gate, answer, ended }: GateLineProps): ReactElement {
  const { t, i18n } = useTranslation();
  return (
    <span className="o-row">
      <Badge tone={toneOf(answer)}>{labelOf(answer, ended, t)}</Badge>
      <span className="o-row__main">
        <Link to="/yes/$approvalId" params={{ approvalId: gate }} className="o-row__title o-mono">
          {answer?.actionClass ?? gate}
        </Link>
        {answer === undefined ? null : (
          <span className="o-row__meta">
            {t('sessions.detail.answeredBy', {
              by: answer.by,
              when: formatAbsolute(answer.at, i18n.language),
            })}
          </span>
        )}
      </span>
      {answer?.receiptId === undefined ? null : (
        <Link to="/receipts/$receiptId" params={{ receiptId: answer.receiptId }} className="o-row__end">
          {t('sessions.detail.answerReceipt')}
        </Link>
      )}
    </span>
  );
}
