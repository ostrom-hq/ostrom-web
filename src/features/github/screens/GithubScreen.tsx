// SPDX-License-Identifier: Apache-2.0
import type { OrgView, Repo } from '@gen/api/types.gen';
import { Link } from '@tanstack/react-router';
import { type ReactElement, useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { OrgRole } from '@/shared/org/roles';
import { Feature } from '@/shared/capabilities';
import { WithOrg } from '@/shared/org/WithOrg';
import { Badge } from '@/shared/ui/Badge';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { EmptyState, Facts, LoadState, Screen } from '@/shared/ui/Screen';
import { GithubLinks } from '../components/GithubLinks';
import { readableDate } from '../model';
import { type Analysis, type GithubViewModel, useGithub, useInstallOutcome } from '../useGithub';
import './github.css';

/**
 * `/github`: the organization's GitHub App, the repositories it was given (the ones Ostrom governs, chosen on
 * GitHub's install page), and the analysis that proposes their rules.
 */
export function GithubScreen(): ReactElement {
  const { t } = useTranslation();
  return (
    <WithOrg title={t('github.title')}>
      {(org, role) => <GithubPage key={org.id} org={org} role={role} />}
    </WithOrg>
  );
}

function GithubPage({
  org,
  role,
}: {
  readonly org: OrgView;
  readonly role: OrgRole | undefined;
}): ReactElement {
  const { t } = useTranslation();
  // Read once the organization is known: a person in several chooses first, and the screen mounts again after.
  const outcome = useInstallOutcome();
  const view = useGithub(org.id, role);
  return (
    <Screen title={t('github.title')} lead={t('github.lead')}>
      {/* Said only once the server agrees: a link alone never claims an installation. */}
      {outcome.installed && view.app?.installed === true ? (
        <Banner tone="info" tag={t('github.back.installedTag')} live>
          {t('github.back.installed')}
        </Banner>
      ) : null}
      {outcome.linked ? (
        <Banner tone="info" tag={t('github.back.linkedTag')} live>
          {t('github.back.linked')}
        </Banner>
      ) : null}
      {outcome.error === undefined ? null : (
        <Banner tone="warning" tag={t('github.back.errorTag')} live>
          {t(`github.back.error.${outcome.error}`)}
        </Banner>
      )}
      <Feature name="github.link.v1">
        <GithubLinks org={org.id} role={role} />
      </Feature>
      <LoadState data={view.app} failure={view.appFailure} rows={2}>
        {(app) => (
          <>
            <section aria-labelledby="gh-app" className="o-card o-section o-stack">
              <div className="o-gh__head">
                <h2 id="gh-app" className="o-label">
                  {t('github.app.title')}
                </h2>
                <Badge tone={app.installed ? 'success' : 'neutral'}>
                  {app.installed ? t('github.app.installed') : t('github.app.notInstalled')}
                </Badge>
              </div>
              <p className="o-gh__wrap">
                {app.installed ? t('github.app.installedBody') : t('github.app.notInstalledBody')}
              </p>
              {app.slug === undefined ? null : (
                <Facts
                  facts={[
                    {
                      label: t('github.app.name'),
                      value:
                        app.page === undefined ? (
                          app.slug
                        ) : (
                          <a href={app.page} rel="noreferrer" target="_blank">
                            {app.slug}
                          </a>
                        ),
                      mono: true,
                    },
                  ]}
                />
              )}
              <div>
                {view.install === undefined ? (
                  <span className="o-row__meta">{t('github.app.onlyAdmins')}</span>
                ) : (
                  <a className="o-btn o-btn--secondary o-btn--md" href={view.install}>
                    {app.installed ? t('github.app.choose') : t('github.app.install')}
                  </a>
                )}
              </div>
            </section>
            {app.installed ? <Repositories view={view} /> : null}
            {app.installed ? <AnalysisSection view={view} /> : null}
          </>
        )}
      </LoadState>
    </Screen>
  );
}

/** A filter shows from this many repositories on. */
const SEARCH_FROM = 6;

function Repositories({ view }: { readonly view: GithubViewModel }): ReactElement {
  const { t } = useTranslation();
  const searchId = useId();
  const hintId = useId();
  return (
    <section aria-labelledby="gh-repos" className="o-stack">
      <h2 id="gh-repos" className="o-label">
        {t('github.repos.title')}
      </h2>
      <LoadState data={view.repos} failure={view.reposFailure}>
        {(repos) =>
          repos.length === 0 ? (
            <EmptyState title={t('github.repos.noneTitle')}>{t('github.repos.none')}</EmptyState>
          ) : (
            <>
              <p className="o-row__meta o-gh__wrap">
                {view.more
                  ? t('github.repos.leadMore', { count: repos.length })
                  : t('github.repos.lead', { count: repos.length })}
              </p>
              {repos.length >= SEARCH_FROM || view.more ? (
                <div className="o-stack o-gh__search">
                  <label htmlFor={searchId} className="o-field-label">
                    {t('github.repos.search')}
                  </label>
                  <input
                    id={searchId}
                    className="o-input"
                    type="search"
                    value={view.query}
                    aria-describedby={view.more ? hintId : undefined}
                    onChange={(event) => {
                      view.setQuery(event.target.value);
                    }}
                  />
                  {view.more ? (
                    <span id={hintId} className="o-row__meta">
                      {t('github.repos.searchFirst')}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {view.shown.length === 0 ? (
                <p className="o-row__meta">{t('github.repos.noMatch')}</p>
              ) : (
                <ul className="o-card o-rows" aria-label={t('github.repos.title')}>
                  {view.shown.map((repo) => (
                    <li key={repo.name}>
                      <RepoRow repo={repo} />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )
        }
      </LoadState>
    </section>
  );
}

function RepoRow({ repo }: { readonly repo: Repo }): ReactElement {
  const { t, i18n } = useTranslation();
  const facts: string[] = [];
  if (repo.language !== undefined) facts.push(repo.language);
  facts.push(t('github.repos.branch', { branch: repo.defaultBranch }));
  const pushed = repo.pushedAt === undefined ? undefined : readableDate(repo.pushedAt, i18n.language);
  if (pushed !== undefined) facts.push(t('github.repos.pushed', { date: pushed }));
  if (repo.owners !== undefined && repo.owners.length > 0)
    facts.push(t('github.repos.owners', { teams: repo.owners.join(', ') }));
  return (
    <div className="o-row">
      <span className="o-row__main">
        <span className="o-row__title o-mono">{repo.name}</span>
        {repo.description === undefined || repo.description === '' ? null : (
          <span className="o-row__meta">{repo.description}</span>
        )}
        <span className="o-row__meta">{facts.join(' · ')}</span>
      </span>
      {repo.archived ? (
        <span className="o-row__end">
          <Badge>{t('github.repos.archived')}</Badge>
        </span>
      ) : null}
    </div>
  );
}

function AnalysisSection({ view }: { readonly view: GithubViewModel }): ReactElement | null {
  const { t } = useTranslation();
  // A server that does not serve the analysis yet: nothing to start, and nothing went wrong.
  if (!view.analysisServed) return null;
  return (
    <section aria-labelledby="gh-analysis" className="o-card o-section o-stack">
      <h2 id="gh-analysis" className="o-label">
        {t('github.analysis.title')}
      </h2>
      <LoadState data={view.analysis} failure={view.analysisFailure} rows={2}>
        {(analysis) => <AnalysisBody analysis={analysis} />}
      </LoadState>
    </section>
  );
}

function AnalysisBody({ analysis }: { readonly analysis: Analysis }): ReactElement {
  const { t } = useTranslation();
  const { state, stage } = analysis;
  const percent = Math.round((state.progress ?? 0) * 100);
  return (
    <>
      <p className="o-gh__wrap">{t(`github.analysis.${stage}`)}</p>
      {stage === 'running' ? (
        <progress
          className="o-gh__bar"
          max={100}
          value={percent}
          aria-label={t('github.analysis.progress', { percent })}
        >
          {percent}
        </progress>
      ) : null}
      {stage === 'ready' ? (
        <p className="o-row__meta o-gh__wrap">
          {t('github.analysis.found', {
            rules: t('github.analysis.rules', { count: state.rules.length }),
            workflows: t('github.analysis.workflows', { count: state.workflows.length }),
          })}
        </p>
      ) : null}
      {stage === 'failed' ? (
        <Banner tone="danger" tag={t('github.analysis.failedTag')}>
          {state.failure?.['reason'] ?? t('github.analysis.failedUnknown')}
        </Banner>
      ) : null}
      {analysis.failure === undefined ? null : (
        <Banner tone="danger" tag={t('github.analysis.notStartedTag')} live>
          {analysis.failure.message}
        </Banner>
      )}
      <div className="o-gh__actions">
        {stage === 'ready' ? (
          <Link to="/rules" className="o-btn o-btn--secondary o-btn--md">
            {t('github.analysis.review')}
          </Link>
        ) : null}
        {analysis.run === undefined ? null : (
          <Button onClick={analysis.run.go} disabled={analysis.starting}>
            {analysis.starting
              ? t('github.analysis.starting')
              : t(`github.analysis.run.${analysis.run.from}`)}
          </Button>
        )}
      </div>
    </>
  );
}
