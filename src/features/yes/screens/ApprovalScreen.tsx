// SPDX-License-Identifier: AGPL-3.0-only
import type { Approval, ApprovalCommit, CheckState } from '@gen/api/types.gen';
import { Link, useParams } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import './yes.css';
import { safeHref } from '@/shared/lib/safeHref';
import { formatAbsolute } from '@/shared/lib/time';
import { Avatar } from '@/shared/ui/Avatar';
import { Badge, type BadgeTone } from '@/shared/ui/Badge';
import { Skeleton } from '@/shared/ui/Skeleton';
import { DecisionBar } from '../components/DecisionBar';
import { DecisionCard } from '../components/DecisionCard';
import { FailureBanner } from '../components/FailureBanner';
import { type ApprovalTone, approvalTone, askedByViewer, shortSha } from '../model';
import {
  type AnswerViewModel,
  type ViewerViewModel,
  useAnswerApproval,
  useApproval,
  useViewer,
} from '../useYes';

const TONES: Readonly<Record<ApprovalTone, BadgeTone>> = {
  'waiting-you': 'signal',
  'asked-by-you': 'warning',
  approved: 'success',
  refused: 'danger',
  expired: 'neutral',
};

const CHECK_TONES: Readonly<Record<CheckState, BadgeTone>> = {
  success: 'success',
  failure: 'danger',
  pending: 'warning',
  skipped: 'neutral',
};

export function ApprovalScreen(): ReactElement {
  const { approvalId } = useParams({ from: '/yes/$approvalId' });
  // A new request is a new page: the answer, the receipt and the decline note of the previous one never carry over.
  return <ApprovalPage key={approvalId} approvalId={approvalId} />;
}

function ApprovalPage({ approvalId }: { readonly approvalId: string }): ReactElement {
  const { t } = useTranslation();
  const { approval, failure } = useApproval(approvalId);
  const viewer = useViewer();
  const answer = useAnswerApproval(approvalId);
  return (
    <div className="ys-page ys-page--detail">
      <Link to="/yes" className="ys-back">
        {t('yes.detail.back')}
      </Link>
      <FailureBanner failure={failure} />
      {approval === undefined ? (
        failure === undefined ? (
          <Skeleton rows={2} />
        ) : null
      ) : (
        <ApprovalDetail approval={approval} viewer={viewer} answer={answer} />
      )}
    </div>
  );
}

interface ApprovalDetailProps {
  readonly approval: Approval;
  readonly viewer: ViewerViewModel;
  readonly answer: AnswerViewModel;
}

/** The proof in a fixed order, before any button: action, changes, checks, who, why, technical details. */
function ApprovalDetail({ approval, viewer, answer }: ApprovalDetailProps): ReactElement {
  const { t, i18n } = useTranslation();
  const tone = approvalTone(approval, viewer.login);
  const commits: readonly ApprovalCommit[] =
    approval.commitDetails ?? (approval.commits ?? []).map((sha) => ({ sha, title: '' }));
  const checks = approval.checks ?? [];
  const evidence = approval.evidence ?? [];
  const askers = approval.askedBy ?? [];
  return (
    <>
      <header className="ys-head">
        <Badge tone={TONES[tone]} approval={tone === 'waiting-you' ? 'waiting' : undefined}>
          {t(`yes.tone.${tone}`)}
        </Badge>
        <h1 className="ys-h1">{approval.title}</h1>
        <p className="ys-meta">
          {approval.repo}
          {approval.repo !== undefined && approval.expiresAt !== undefined ? ' · ' : null}
          {approval.expiresAt === undefined ? null : (
            <time dateTime={approval.expiresAt}>
              {t('yes.detail.expires', { when: formatAbsolute(approval.expiresAt, i18n.language) })}
            </time>
          )}
        </p>
      </header>

      {approval.sha === undefined && commits.length === 0 ? null : (
        <section className="o-card ys-section" aria-labelledby="ys-changes">
          <h2 id="ys-changes" className="ys-label">
            {t('yes.detail.changes')}
          </h2>
          {approval.sha === undefined ? null : (
            <p className="ys-small ys-meta">{t('yes.detail.commit', { sha: shortSha(approval.sha) })}</p>
          )}
          {commits.length === 0 ? null : (
            <ul className="ys-commits">
              {commits.map((commit) => (
                <li key={commit.sha}>
                  {safeHref(commit.url) === undefined ? (
                    <code>{shortSha(commit.sha)}</code>
                  ) : (
                    <a href={safeHref(commit.url)} target="_blank" rel="noreferrer noopener">
                      <code>{shortSha(commit.sha)}</code>
                    </a>
                  )}{' '}
                  <span>{commit.title}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {checks.length === 0 && evidence.length === 0 ? null : (
        <section className="o-card ys-section" aria-labelledby="ys-checks">
          <h2 id="ys-checks" className="ys-label">
            {t('yes.detail.checks')}
          </h2>
          {checks.length === 0 ? null : (
            <ul className="ys-checks">
              {checks.map((check) => (
                <li key={check.name} className="ys-row">
                  <Badge tone={CHECK_TONES[check.state]}>{t(`yes.check.${check.state}`)}</Badge>
                  {safeHref(check.url) === undefined ? (
                    <span>{check.name}</span>
                  ) : (
                    <a href={safeHref(check.url)} target="_blank" rel="noreferrer noopener">
                      {check.name}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
          {evidence.length === 0 ? null : (
            <dl className="ys-kv">
              {evidence.map((item) => (
                <div key={item.label} className="ys-kv__row">
                  <dt>{item.label}</dt>
                  <dd>
                    {safeHref(item.url) === undefined ? (
                      item.value
                    ) : (
                      <a href={safeHref(item.url)} target="_blank" rel="noreferrer noopener">
                        {item.value}
                      </a>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      )}

      <section className="o-card ys-section" aria-labelledby="ys-who">
        <h2 id="ys-who" className="ys-label">
          {t('yes.detail.who')}
        </h2>
        <div className="ys-row">
          <Avatar login={askers[0]} size={36} />
          <div className="ys-col">
            <b>{askers.length === 0 ? t('yes.someone') : askers.join(', ')}</b>
            <span className="ys-meta">{t('yes.detail.via', { channel: approval.channel })}</span>
          </div>
        </div>
        {askedByViewer(approval, viewer.login) ? (
          <p className="ys-small">{t('yes.detail.youAsked')}</p>
        ) : null}
      </section>

      <section className="o-card ys-section" aria-labelledby="ys-why">
        <h2 id="ys-why" className="ys-label">
          {t('yes.detail.why')}
        </h2>
        <p>{t('yes.detail.requestedFrom', { who: approval.requestedFrom })}</p>
        {approval.workflowId === undefined ? null : (
          <p className="ys-small ys-meta">{t('yes.detail.workflow', { workflow: approval.workflowId })}</p>
        )}
      </section>

      <details className="o-card ys-section ys-details">
        <summary>{t('yes.detail.technical')}</summary>
        <dl className="ys-kv">
          <div className="ys-kv__row">
            <dt>{t('yes.detail.requestId')}</dt>
            <dd>{approval.id}</dd>
          </div>
          {approval.sha === undefined ? null : (
            <div className="ys-kv__row">
              <dt>{t('yes.detail.fullSha')}</dt>
              <dd>{approval.sha}</dd>
            </div>
          )}
          <div className="ys-kv__row">
            <dt>{t('yes.detail.fingerprint')}</dt>
            <dd>{approval.shownDigest}</dd>
          </div>
          {approval.taskId === undefined ? null : (
            <div className="ys-kv__row">
              <dt>{t('yes.detail.task')}</dt>
              <dd>{approval.taskId}</dd>
            </div>
          )}
        </dl>
      </details>

      {approval.status === 'pending' ? (
        <DecisionBar approval={approval} viewer={viewer.login} viewerName={viewer.name} answer={answer} />
      ) : (
        <DecisionCard approval={approval} receipt={answer.receipt} comment={answer.comment} />
      )}
    </>
  );
}
