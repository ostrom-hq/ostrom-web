// SPDX-License-Identifier: Apache-2.0
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { type ReactElement, type SyntheticEvent, useId, useState } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { useNow } from '@/shared/lib/useNow';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { LoadState, Screen } from '@/shared/ui/Screen';
import { ArtifactCard } from '../components/ArtifactCard';
import { everyOrigin, isFiltered, onTab, scopeOf, searchOf, shortId } from '../gallery';
import { ARTIFACT_ORIGINS, ARTIFACT_SCOPES, type ArtifactOriginKind, type GalleryFilters } from '../route';
import { ARTIFACT_ACCESSES, type ArtifactAccess, isArtifactAccess, ownsArtifact } from '../model';
import { useArtifactChange, useArtifacts } from '../useSharing';
import './sharing.css';

/**
 * Pages and files the agents published, behind the sign-in, as TeamCode's gallery: three tabs (everything the person
 * reads, theirs, shared with them), an origin and an access filter, what one cloud session or launch published, and
 * the older ones on demand. Only the owner changes, shares or deletes one; a role gives nobody those controls on
 * someone else's artifact.
 */
export function ArtifactsScreen(): ReactElement {
  const { t } = useTranslation();
  const filters = useSearch({ from: '/artifacts' });
  const view = useArtifacts(filters);
  const change = useArtifactChange();
  const now = useNow();
  const scope = scopeOf(filters);
  return (
    <Screen title={t('sharing.artifacts.title')} lead={t('sharing.artifacts.lead')}>
      <nav aria-label={t('sharing.artifacts.tabs')} className="sh-tabs">
        {ARTIFACT_SCOPES.map((tab) => (
          <Link
            key={tab}
            to="/artifacts"
            search={searchOf(onTab(filters, tab))}
            aria-current={tab === scope ? 'page' : undefined}
          >
            {t(`sharing.artifacts.tab.${tab}`)}
          </Link>
        ))}
      </nav>
      <Pinned filters={filters} />
      <FilterForm key={JSON.stringify(searchOf(filters))} filters={filters} />
      {change.failure === undefined ? null : (
        <Banner tone="danger" tag={t('sharing.errorTag')} live>
          {change.failure.message}
        </Banner>
      )}
      <LoadState data={view.artifacts} failure={view.failure}>
        {(artifacts) =>
          artifacts.length === 0 ? (
            isFiltered(filters) ? (
              <div className="o-stack">
                <p className="o-empty">{t('sharing.artifacts.noMatch')}</p>
                <p>
                  <Link to="/artifacts" search={searchOf(onTab({}, scope))}>
                    {t('sharing.artifacts.clearFilters')}
                  </Link>
                </p>
              </div>
            ) : (
              <p className="o-empty">{t('sharing.artifacts.empty')}</p>
            )
          ) : (
            <div className="o-stack">
              {artifacts.map((artifact) => (
                <ArtifactCard
                  key={artifact.id}
                  artifact={artifact}
                  now={now}
                  scope={scope}
                  change={ownsArtifact(artifact, view.login) ? change : undefined}
                />
              ))}
            </div>
          )
        }
      </LoadState>
      {view.more ? (
        <div className="o-inline">
          <Button variant="ghost" disabled={view.loadingMore} onClick={view.loadMore}>
            {t('sharing.artifacts.older')}
          </Button>
        </div>
      ) : null}
    </Screen>
  );
}

/** What one cloud session or launch published, with the way back to every origin. */
function Pinned({ filters }: { readonly filters: GalleryFilters }): ReactElement | null {
  const { t } = useTranslation();
  const from = [
    ...(filters.session === undefined
      ? []
      : [t('sharing.artifacts.fromSession', { id: shortId(filters.session) })]),
    ...(filters.launch === undefined
      ? []
      : [t('sharing.artifacts.fromLaunch', { id: shortId(filters.launch) })]),
  ];
  if (from.length === 0) return null;
  return (
    <p>
      {t('sharing.artifacts.publishedFrom', { from: from.join(' · ') })} ·{' '}
      <Link to="/artifacts" search={everyOrigin(filters)}>
        {t('sharing.artifacts.everyOrigin')}
      </Link>
    </p>
  );
}

/** The origin and the access, chosen then applied together (TeamCode's « Filter »); the tab and what is pinned stay. */
function FilterForm({ filters }: { readonly filters: GalleryFilters }): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate({ from: '/artifacts' });
  const originId = useId();
  const accessId = useId();
  const [origin, setOrigin] = useState<ArtifactOriginKind | ''>(filters.origin ?? '');
  const [access, setAccess] = useState<ArtifactAccess | ''>(filters.access ?? '');
  const apply = (event: SyntheticEvent): void => {
    event.preventDefault();
    void navigate({
      search: searchOf({
        ...filters,
        ...(origin === '' ? { origin: undefined } : { origin }),
        ...(access === '' ? { access: undefined } : { access }),
      }),
    });
  };
  return (
    <form className="o-inline" onSubmit={apply}>
      <label htmlFor={originId} className="o-field-label">
        {t('sharing.artifacts.origin')}
      </label>
      <select
        id={originId}
        className="o-input o-select"
        value={origin}
        onChange={(event) => {
          const chosen = ARTIFACT_ORIGINS.find((kind) => kind === event.target.value);
          setOrigin(chosen ?? '');
        }}
      >
        <option value="">{t('sharing.artifacts.anyOrigin')}</option>
        {ARTIFACT_ORIGINS.map((kind) => (
          <option key={kind} value={kind}>
            {t(`sharing.artifacts.originKind.${kind}`)}
          </option>
        ))}
      </select>
      <label htmlFor={accessId} className="o-field-label">
        {t('sharing.artifacts.accessFilter')}
      </label>
      <select
        id={accessId}
        className="o-input o-select"
        value={access}
        onChange={(event) => {
          setAccess(isArtifactAccess(event.target.value) ? event.target.value : '');
        }}
      >
        <option value="">{t('sharing.artifacts.anyAccess')}</option>
        {ARTIFACT_ACCESSES.map((value) => (
          <option key={value} value={value}>
            {t(`sharing.access.${value}`)}
          </option>
        ))}
      </select>
      <Button type="submit" variant="ghost">
        {t('sharing.artifacts.filter')}
      </Button>
    </form>
  );
}
