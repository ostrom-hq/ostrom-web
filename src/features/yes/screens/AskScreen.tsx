import type { Ask } from '@gen/api/types.gen';
import { Link, useParams } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import './yes.css';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/shared/ui/Avatar';
import { Badge, type BadgeTone } from '@/shared/ui/Badge';
import { Banner } from '@/shared/ui/Banner';
import { DecisionBar } from '../components/DecisionBar';
import { DiffView } from '../components/DiffView';
import { ReceiptCard } from '../components/ReceiptCard';
import { type AskTone, agentLabel, approversOf, askTone, shortSha } from '../model';
import { useAsk, useDecideAsk, useYesQueue, viewerLabel } from '../useYes';

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
          <p className="ys-meta" role="status">
            {t('yes.queue.loading')}
          </p>
        ) : null
      ) : (
        <AskDetail ask={ask} viewer={viewer} decision={decision} />
      )}
    </div>
  );
}

interface AskDetailProps {
  readonly ask: Ask;
  readonly viewer: string | undefined;
  readonly decision: ReturnType<typeof useDecideAsk>;
}

function AskDetail({ ask, viewer, decision }: AskDetailProps): ReactElement {
  const { t } = useTranslation();
  const tone = askTone(ask);
  const { eligible, askers } = approversOf(ask);
  const otherRepo =
    ask.what.sessionRepo !== undefined &&
    ask.what.repo !== undefined &&
    ask.what.sessionRepo !== ask.what.repo;
  return (
    <>
      <header className="ys-head">
        <Badge tone={TONES[tone]}>{t(`yes.tone.${tone}`)}</Badge>
        <h1 className="ys-h1">{ask.what.action ?? ask.title}</h1>
        {ask.what.repo === undefined ? null : (
          <p className="ys-meta">{t('yes.detail.inRepo', { repo: ask.what.repo })}</p>
        )}
      </header>
      {otherRepo ? (
        <Banner tone="warning" tag={t('yes.detail.otherRepoTag')}>
          {t('yes.detail.otherRepo', { session: ask.what.sessionRepo, repo: ask.what.repo })}
        </Banner>
      ) : null}

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
        {askers.length === 0 ? null : (
          <p className="ys-small ys-meta">{t('yes.detail.askedBy', { logins: askers.join(', ') })}</p>
        )}
      </section>

      <section className="o-card ys-section" aria-labelledby="ys-what">
        <h2 id="ys-what" className="ys-label">
          {t('yes.detail.what')}
        </h2>
        {ask.what.command === undefined ? null : (
          <pre className="ys-cmd" tabIndex={0}>
            {ask.what.command}
          </pre>
        )}
        {ask.what.harness === undefined ? null : (
          <p className="ys-small ys-meta">{t('yes.detail.underPackage', { harness: ask.what.harness })}</p>
        )}
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
          <>
            <h3 className="ys-label">{t('yes.detail.commits')}</h3>
            <ul className="ys-commits">
              {ask.commits.map((commit) => (
                <li key={commit.sha}>
                  <code>{shortSha(commit.sha)}</code> <span>{commit.title}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {ask.gate === undefined ? null : (
        <section className="o-card ys-section" aria-labelledby="ys-why">
          <h2 id="ys-why" className="ys-label">
            {t('yes.detail.why')}
          </h2>
          <p>
            {ask.gate.workflow === undefined
              ? t('yes.detail.gate', { gate: ask.gate.label, approvers: eligible.join(', ') })
              : t('yes.detail.gateOfWorkflow', {
                  gate: ask.gate.label,
                  workflow: ask.gate.workflow,
                  approvers: eligible.join(', '),
                })}{' '}
            {askers.length === 0 ? null : (
              <span className="ys-meta">{t('yes.detail.notAskers', { logins: askers.join(', ') })}</span>
            )}
          </p>
          {ask.rules.length === 0 ? null : (
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
          )}
          {ask.rules.length > MAX_RULES ? (
            <p className="ys-small ys-meta">
              {t('yes.detail.moreRules', { count: ask.rules.length - MAX_RULES })}
            </p>
          ) : null}
        </section>
      )}

      {ask.diff === undefined ? null : (
        <section className="o-card ys-section" aria-labelledby="ys-diff">
          <h2 id="ys-diff" className="ys-label">
            {t('yes.detail.diff')}
          </h2>
          <DiffView diff={ask.diff} />
        </section>
      )}

      {ask.evidence.length === 0 ? null : (
        <section className="o-card ys-section" aria-labelledby="ys-evidence">
          <h2 id="ys-evidence" className="ys-label">
            {t('yes.detail.evidence')}
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

      {ask.status === 'pending' ? (
        <DecisionBar ask={ask} viewer={viewer} decision={decision} />
      ) : (
        <ReceiptCard ask={ask} />
      )}
    </>
  );
}
