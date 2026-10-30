// SPDX-License-Identifier: AGPL-3.0-only
import type { Ask } from '@gen/api/types.gen';
import { Link, useParams } from '@tanstack/react-router';
import { type ReactElement, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './yes.css';
import { formatAbsolute } from '@/shared/lib/time';
import { Avatar } from '@/shared/ui/Avatar';
import { Badge, type BadgeTone } from '@/shared/ui/Badge';
import { Banner } from '@/shared/ui/Banner';
import { DecisionBar } from '../components/DecisionBar';
import { DiffView } from '../components/DiffView';
import { ReceiptCard } from '../components/ReceiptCard';
import { Skeleton } from '../components/Skeleton';
import {
  type AskTone,
  DIFF_FOLD_LINES,
  agentLabel,
  approversOf,
  askTone,
  diffLines,
  shortSha,
} from '../model';
import { type DecideViewModel, useAsk, useDecideAsk, useYesQueue, viewerLabel } from '../useYes';

const TONES: Readonly<Record<AskTone, BadgeTone>> = {
  'waiting-you': 'signal',
  'waiting-other': 'warning',
  approved: 'success',
  refused: 'danger',
  expired: 'neutral',
};

const MAX_RULES = 6;

export function AskScreen(): ReactElement {
  const { t } = useTranslation();
  const { askId } = useParams({ from: '/yes/$askId' });
  const { ask, failure } = useAsk(askId);
  const { queue } = useYesQueue();
  const decision = useDecideAsk(askId);
  const viewer = viewerLabel(queue, (_via, login) => login);
  return (
    <div className="ys-page ys-page--detail">
      <Link to="/yes" className="ys-back">
        {t('yes.detail.back')}
      </Link>
      {failure === undefined ? null : (
        <Banner tone="danger" tag={t('yes.queue.offlineTag')}>
          {failure.message}
        </Banner>
      )}
      {ask === undefined ? (
        failure === undefined ? (
          <Skeleton rows={2} />
        ) : null
      ) : (
        <AskDetail key={ask.id} ask={ask} viewer={viewer} decision={decision} />
      )}
    </div>
  );
}

interface AskDetailProps {
  readonly ask: Ask;
  readonly viewer: string | undefined;
  readonly decision: DecideViewModel;
}

/** The proof in a fixed order, before any button: action, changes, checks, who, why, technical details. */
function AskDetail({ ask, viewer, decision }: AskDetailProps): ReactElement {
  const { t, i18n } = useTranslation();
  const [diffOpen, setDiffOpen] = useState(false);
  const tone = askTone(ask);
  const { eligible, askers } = approversOf(ask);
  const otherRepo =
    ask.what.sessionRepo !== undefined &&
    ask.what.repo !== undefined &&
    ask.what.sessionRepo !== ask.what.repo;
  const diffFolded = ask.diff !== undefined && !diffOpen && diffLines(ask.diff).length > DIFF_FOLD_LINES;
  const hasChanges = ask.diff !== undefined || ask.pr !== undefined || (ask.commits ?? []).length > 0;
  return (
    <>
      <header className="ys-head">
        <Badge tone={TONES[tone]}>{t(`yes.tone.${tone}`)}</Badge>
        <h1 className="ys-h1">{ask.what.action ?? ask.title}</h1>
        <p className="ys-meta">
          {ask.what.repo === undefined ? null : t('yes.detail.inRepo', { repo: ask.what.repo })}
          {ask.what.repo !== undefined && ask.requestedAt !== undefined ? ' · ' : null}
          {ask.requestedAt === undefined ? null : (
            <time dateTime={ask.requestedAt}>{formatAbsolute(ask.requestedAt, i18n.language)}</time>
          )}
        </p>
        {ask.what.command === undefined ? null : <pre className="ys-cmd">{ask.what.command}</pre>}
      </header>
      {otherRepo ? (
        <Banner tone="warning" tag={t('yes.detail.otherRepoTag')}>
          {t('yes.detail.otherRepo', { session: ask.what.sessionRepo, repo: ask.what.repo })}
        </Banner>
      ) : null}

      {hasChanges ? (
        <section className="o-card ys-section" aria-labelledby="ys-changes">
          <h2 id="ys-changes" className="ys-label">
            {t('yes.detail.changes')}
          </h2>
          {ask.pr === undefined ? null : (
            <p className="ys-small ys-meta">
              {ask.what.repo === undefined
                ? t('yes.detail.prAt', { number: ask.pr.number, sha: shortSha(ask.pr.sha) })
                : t('yes.detail.repoAndPr', {
                    repo: ask.what.repo,
                    number: ask.pr.number,
                    sha: shortSha(ask.pr.sha),
                  })}
            </p>
          )}
          {ask.commits === undefined || ask.commits.length === 0 ? null : (
            <ul className="ys-commits">
              {ask.commits.map((commit) => (
                <li key={commit.sha}>
                  <code>{shortSha(commit.sha)}</code> <span>{commit.title}</span>
                </li>
              ))}
            </ul>
          )}
          {ask.diff === undefined ? null : (
            <DiffView
              diff={ask.diff}
              expanded={diffOpen}
              onExpand={() => {
                setDiffOpen(true);
              }}
            />
          )}
        </section>
      ) : null}

      {ask.evidence.length === 0 ? null : (
        <section className="o-card ys-section" aria-labelledby="ys-checks">
          <h2 id="ys-checks" className="ys-label">
            {t('yes.detail.checks')}
          </h2>
          <dl className="ys-kv">
            {ask.evidence.map((item) => (
              <div key={item.label} className="ys-kv__row">
                <dt>{item.label}</dt>
                <dd>
                  {item.url === undefined ? (
                    item.value
                  ) : (
                    <a href={item.url} target="_blank" rel="noreferrer noopener">
                      {item.value}
                    </a>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section className="o-card ys-section" aria-labelledby="ys-who">
        <h2 id="ys-who" className="ys-label">
          {t('yes.detail.who')}
        </h2>
        <div className="ys-row">
          <Avatar login={ask.who.dev} size={36} />
          <div className="ys-col">
            <b>{ask.who.dev ?? t('yes.someone')}</b>
            <span className="ys-meta">
              {[
                t('yes.detail.through', { agent: agentLabel(ask.who.agent) ?? t('yes.anAgent') }),
                ask.who.model === undefined ? undefined : t('yes.detail.model', { model: ask.who.model }),
                ask.who.session === undefined
                  ? undefined
                  : t('yes.detail.session', { session: ask.who.session }),
              ]
                .filter((part) => part !== undefined)
                .join(' ')}
            </span>
          </div>
        </div>
        {ask.you?.self === true ? <p className="ys-small">{t('yes.detail.youAsked')}</p> : null}
        {askers.length === 0 ? null : (
          <p className="ys-small ys-meta">{t('yes.detail.askedBy', { logins: askers.join(', ') })}</p>
        )}
      </section>

      {ask.gate === undefined ? null : (
        <section className="o-card ys-section" aria-labelledby="ys-why">
          <h2 id="ys-why" className="ys-label">
            {t('yes.detail.why')}
          </h2>
          <p>
            {ask.gate.workflow === undefined
              ? t('yes.detail.rule', { rule: ask.gate.label, approvers: eligible.join(', ') })
              : t('yes.detail.ruleOfWorkflow', {
                  rule: ask.gate.label,
                  workflow: ask.gate.workflow,
                  approvers: eligible.join(', '),
                })}{' '}
            {askers.length === 0 ? null : (
              <span className="ys-meta">{t('yes.detail.notAskers', { logins: askers.join(', ') })}</span>
            )}
          </p>
          {ask.rules.length === 0 ? null : (
            <details className="ys-details">
              <summary>{t('yes.detail.rulesCount', { count: ask.rules.length })}</summary>
              <ul className="ys-rules">
                {ask.rules.slice(0, MAX_RULES).map((rule) => (
                  <li key={rule.id}>
                    {rule.strength === undefined ? null : (
                      <Badge tone={rule.strength === 'required' ? 'signal' : 'neutral'}>
                        {t(`yes.detail.strength.${rule.strength}`)}
                      </Badge>
                    )}{' '}
                    {rule.statement}
                  </li>
                ))}
              </ul>
              {ask.rules.length > MAX_RULES ? (
                <p className="ys-small ys-meta">
                  {t('yes.detail.moreRules', { count: ask.rules.length - MAX_RULES })}
                </p>
              ) : null}
            </details>
          )}
        </section>
      )}

      <details className="o-card ys-section ys-details">
        <summary>{t('yes.detail.technical')}</summary>
        <dl className="ys-kv">
          <div className="ys-kv__row">
            <dt>{t('yes.detail.requestId')}</dt>
            <dd>{ask.id}</dd>
          </div>
          {ask.pr === undefined ? null : (
            <div className="ys-kv__row">
              <dt>{t('yes.detail.commit')}</dt>
              <dd>{ask.pr.sha}</dd>
            </div>
          )}
          <div className="ys-kv__row">
            <dt>{t('yes.detail.fingerprint')}</dt>
            <dd>{ask.shownDigest}</dd>
          </div>
          {ask.what.harness === undefined ? null : (
            <div className="ys-kv__row">
              <dt>{t('yes.detail.agentPackage')}</dt>
              <dd>{ask.what.harness}</dd>
            </div>
          )}
        </dl>
      </details>

      {ask.status === 'pending' ? (
        <DecisionBar
          ask={ask}
          viewer={viewer}
          decision={decision}
          blocked={diffFolded ? t('yes.detail.readFirst') : undefined}
        />
      ) : (
        <ReceiptCard ask={ask} />
      )}
    </>
  );
}
