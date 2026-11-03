// SPDX-License-Identifier: AGPL-3.0-only
import type { GovernanceConfirmation } from '@gen/api/types.gen';
import { Link, useParams } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useViewer } from '@/shared/auth/useViewer';
import { formatAbsolute } from '@/shared/lib/time';
import { Avatar } from '@/shared/ui/Avatar';
import { Badge, type BadgeTone } from '@/shared/ui/Badge';
import { Banner } from '@/shared/ui/Banner';
import { Facts } from '@/shared/ui/Screen';
import { Skeleton } from '@/shared/ui/Skeleton';
// The approval page's layout (`ys-` classes): the same proof-then-buttons column, the same bar under the thumb.
import '@/shared/ui/decision.css';
import './confirm.css';
import { AnswerBar } from '../components/AnswerBar';
import { AnswerNotice } from '../components/AnswerNotice';
import { ChangeView } from '../components/ChangeView';
import { MemberChangeView } from '../components/MemberChangeView';
import { Outcome } from '../components/Outcome';
import { Countdown } from '../components/Countdown';
import { memberChangeOf, personName } from '../model';
import { type AnswerViewModel, useAnswerConfirmation, useConfirmation } from '../useConfirmation';

const TONES: Readonly<Record<GovernanceConfirmation['status'], BadgeTone>> = {
  pending: 'signal',
  confirmed: 'success',
  refused: 'danger',
  expired: 'neutral',
  failed: 'danger',
};

/** The command each kind of CLI token comes from, as the person typed it. */
const COMMANDS: Readonly<Record<GovernanceConfirmation['credential'], string>> = {
  admin: 'ostrom login --admin',
  device: 'ostrom login',
};

export function ConfirmScreen(): ReactElement {
  const { confirmationId } = useParams({ from: '/confirm/$confirmationId' });
  // Another confirmation is another page: an answer or its refusal never carries over.
  return <ConfirmPage key={confirmationId} id={confirmationId} />;
}

function ConfirmPage({ id }: { readonly id: string }): ReactElement {
  const { t } = useTranslation();
  const { confirmation, failure, notFound, signedOut, refresh } = useConfirmation(id);
  const answer = useAnswerConfirmation(id);
  const here = `/confirm/${id}`;
  let body: ReactElement | null = null;
  if (confirmation !== undefined)
    body = <ConfirmationDetail confirmation={confirmation} answer={answer} refresh={refresh} />;
  else if (notFound)
    body = (
      <header className="ys-head">
        <h1 className="ys-h1">{t('confirm.notFound.title')}</h1>
        <p className="ys-meta">{t('confirm.notFound.body')}</p>
      </header>
    );
  else if (failure === undefined) body = <Skeleton rows={3} />;
  return (
    <div className="ys-page ys-page--detail">
      {signedOut ? (
        <Banner tone="warning" tag={t('confirm.signedOut.tag')} live>
          {t('confirm.signedOut.text')}{' '}
          <Link to="/signin" search={{ redirect: here }}>
            {t('confirm.signedOut.signIn')}
          </Link>
        </Banner>
      ) : null}
      {failure === undefined || notFound || signedOut ? null : (
        <Banner tone="danger" tag={t('confirm.failure.tag')} live>
          {failure.message}
        </Banner>
      )}
      <AnswerNotice refusal={answer.refusal} here={here} />
      {body}
    </div>
  );
}

interface DetailProps {
  readonly confirmation: GovernanceConfirmation;
  readonly answer: AnswerViewModel;
  /** Reads it again: its time ran out on this device, and only the server says whether it expired. */
  readonly refresh: () => void;
}

/** What is asked, by whom, the exact change, then the answer: nothing to press before the proof. */
function ConfirmationDetail({ confirmation, answer, refresh }: DetailProps): ReactElement {
  const { t, i18n } = useTranslation();
  const viewer = useViewer();
  const { requestedBy, credential, status } = confirmation;
  // A change of the organization's people reads in words; any other change as its JSON before and after.
  const member = memberChangeOf(confirmation);
  return (
    <>
      <header className="ys-head">
        <Badge tone={TONES[status]} approval={status === 'pending' ? 'waiting' : undefined}>
          {t(`confirm.status.${status}`)}
        </Badge>
        <h1 className="ys-h1">{confirmation.summary}</h1>
        <p className="ys-meta">
          {t(`confirm.kind.${confirmation.kind}`)}
          {status === 'pending' ? (
            <>
              {' · '}
              <Countdown expiresAt={confirmation.expiresAt} onElapsed={refresh} />
            </>
          ) : null}
        </p>
      </header>

      {status === 'pending' ? (
        <Banner tone="warning" tag={t('confirm.warning.tag')}>
          {t('confirm.warning.text')}
        </Banner>
      ) : null}

      <section className="o-card ys-section" aria-labelledby="cf-what">
        <h2 id="cf-what" className="ys-label">
          {t('confirm.what.title')}
        </h2>
        <Facts
          facts={[
            { label: t('confirm.what.kind'), value: t(`confirm.kind.${confirmation.kind}`) },
            {
              label: t('confirm.what.request'),
              value: `${confirmation.method} ${confirmation.path}`,
              mono: true,
            },
            { label: t('confirm.what.scope'), value: confirmation.scope, mono: true },
          ]}
        />
      </section>

      {member === undefined ? (
        <ChangeView before={confirmation.before} after={confirmation.after} />
      ) : (
        <MemberChangeView change={member} />
      )}

      <section className="o-card ys-section" aria-labelledby="cf-who">
        <h2 id="cf-who" className="ys-label">
          {t('confirm.who.title')}
        </h2>
        <div className="ys-row">
          <Avatar login={requestedBy.login ?? requestedBy.name} size={36} />
          <div className="ys-col">
            <b>{personName(requestedBy)}</b>
            <span className="ys-meta">
              {t('confirm.who.with')} <code className="o-mono cf-command">{COMMANDS[credential]}</code>
            </span>
          </div>
        </div>
        <p className="ys-small ys-meta">
          {t('confirm.who.when', { when: formatAbsolute(confirmation.createdAt, i18n.language) })}
        </p>
      </section>

      <details className="o-card ys-section ys-details">
        <summary>{t('confirm.technical.title')}</summary>
        <dl className="ys-kv">
          <div className="ys-kv__row">
            <dt>{t('confirm.technical.id')}</dt>
            <dd>{confirmation.id}</dd>
          </div>
          <div className="ys-kv__row">
            <dt>{t('confirm.technical.member')}</dt>
            <dd>{requestedBy.memberId}</dd>
          </div>
          <div className="ys-kv__row">
            <dt>{t('confirm.technical.expires')}</dt>
            <dd>{formatAbsolute(confirmation.expiresAt, i18n.language)}</dd>
          </div>
        </dl>
      </details>

      {status === 'pending' ? (
        <AnswerBar
          answer={answer}
          viewerName={viewer.name}
          mayAnswer={viewer.role === undefined || viewer.canManage}
        />
      ) : (
        <Outcome confirmation={confirmation} status={status} />
      )}
    </>
  );
}
