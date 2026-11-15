// SPDX-License-Identifier: Apache-2.0
import type { Artifact } from '@gen/api/types.gen';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { formatAbsolute } from '@/shared/lib/time';
import { safeHref } from '@/shared/lib/safeHref';
import { Badge } from '@/shared/ui/Badge';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { LoadState, Screen } from '@/shared/ui/Screen';
import { ArtifactDetail } from '../components/ArtifactDetail';
import { appLinkOf, ARTIFACT_ACCESSES, type ArtifactAccess, isArtifactAccess, ownsArtifact } from '../model';
import { useArtifactAccess, useArtifactViewer } from '../useArtifactViewer';
import { useArtifactChange, useArtifacts } from '../useSharing';
import './sharing.css';

/**
 * An artifact's reading page (TeamCode's viewer `/artifact/<id>[?v=n]`): its title, owner, access, version and date,
 * a notice when a newer version is published while it follows the latest, panels for its versions, its files, who
 * reads it and its deletion as the reader's rights allow, and the page itself in a sandboxed frame. The frame loads
 * the sealed ticket's address on the content origin, whose content policy keeps the page in an opaque origin with
 * no cookie, no storage and no reach into the console.
 */
export function ArtifactScreen(): ReactElement {
  const { t, i18n } = useTranslation();
  const { artifactId } = useParams({ from: '/artifacts/$artifactId' });
  const { v } = useSearch({ from: '/artifacts/$artifactId' });
  const view = useArtifactViewer(artifactId, v);
  const owner = useArtifacts().login;
  const change = useArtifactChange();
  const navigate = useNavigate();
  const appLink = appLinkOf(window.location.href, navigator.userAgent);
  return (
    <LoadState data={view.artifact} failure={view.failure} rows={2}>
      {(artifact) => {
        const owns = ownsArtifact(artifact, owner);
        const shown = view.shown;
        const src = safeHref(view.ticket?.url);
        return (
          <Screen
            top={
              <Link to="/artifacts" className="o-back">
                {t('sharing.artifacts.back')}
              </Link>
            }
            title={artifact.title}
          >
            <p className="o-row__meta">
              {t('sharing.owner', { owner: artifact.owner })} ·{' '}
              <Badge>
                {isArtifactAccess(artifact.access) ? t(`sharing.access.${artifact.access}`) : artifact.access}
              </Badge>
              {shown === undefined
                ? null
                : ` · ${t('sharing.artifacts.version', { version: shown.number })} · ${formatAbsolute(shown.createdAt, i18n.language)}`}
              {shown === undefined || v === undefined || shown.number === artifact.latestVersion ? null : (
                <>
                  {' · '}
                  <Link to="/artifacts/$artifactId" params={{ artifactId }}>
                    {t('sharing.artifacts.latestIs', { version: artifact.latestVersion })}
                  </Link>
                </>
              )}
              {appLink === undefined ? null : (
                <>
                  {' · '}
                  <a href={appLink}>{t('sharing.artifacts.openInApp')}</a>
                </>
              )}
            </p>
            {view.newer ? (
              <Banner tone="info" tag={t('sharing.artifacts.newerTag')} live>
                {t('sharing.artifacts.newer')}{' '}
                <Button variant="ghost" onClick={view.showLatest}>
                  {t('sharing.artifacts.showNewer')}
                </Button>
              </Banner>
            ) : null}
            {change.failure === undefined ? null : (
              <Banner tone="danger" tag={t('sharing.errorTag')} live>
                {change.failure.message}
              </Banner>
            )}
            {view.versions !== undefined && view.versions.length > 1 ? (
              <details>
                <summary>{t('sharing.artifacts.versions')}</summary>
                <ol className="o-rows">
                  {view.versions.map((version) => (
                    <li key={version.number} className="o-row">
                      <Link
                        to="/artifacts/$artifactId"
                        params={{ artifactId }}
                        search={{ v: version.number }}
                        aria-current={version.number === shown?.number ? 'page' : undefined}
                      >
                        {t('sharing.artifacts.versionLine', {
                          number: version.number,
                          who: version.createdBy,
                          when: formatAbsolute(version.createdAt, i18n.language),
                        })}
                      </Link>
                    </li>
                  ))}
                </ol>
              </details>
            ) : null}
            {shown === undefined ? null : (
              <details>
                <summary>{t('sharing.artifacts.files')}</summary>
                <ul className="o-rows">
                  {shown.files.map((path) => (
                    <li key={path} className="o-row o-mono">
                      {path}
                      {path === shown.entry ? <Badge>{t('sharing.artifacts.entry')}</Badge> : null}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <details>
              <summary>{t('sharing.artifacts.readers')}</summary>
              {owns ? (
                // Changed elsewhere meanwhile: the field starts again from what the server says.
                <AccessForm key={artifact.access} artifact={artifact} />
              ) : null}
              <ArtifactDetail artifact={artifact} change={owns ? change : undefined} withVersions={false} />
            </details>
            {owns ? (
              <DeletePanel
                artifact={artifact}
                busy={change.pending === artifact.id}
                onDelete={() => {
                  change.remove(artifact.id, () => {
                    void navigate({ to: '/artifacts' });
                  });
                }}
              />
            ) : null}
            {view.ticketFailure === undefined ? null : (
              <Banner tone="warning" tag={t('app.failure.tag')}>
                {t('sharing.artifacts.cannotShow', { reason: view.ticketFailure.message })}
              </Banner>
            )}
            {src === undefined ? null : (
              <iframe
                className="sh-frame"
                src={src}
                sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
                referrerPolicy="no-referrer"
                title={artifact.title}
              />
            )}
          </Screen>
        );
      }}
    </LoadState>
  );
}

/** Who reads it: only me and the people I add, the organization, or anyone with its link (a person's choice). */
function AccessForm({ artifact }: { readonly artifact: Artifact }): ReactElement {
  const { t } = useTranslation();
  const access = useArtifactAccess(artifact.id);
  const [choice, setChoice] = useState<ArtifactAccess | undefined>(undefined);
  const fieldId = useId();
  const current = isArtifactAccess(artifact.access) ? artifact.access : undefined;
  const picked = choice ?? current;
  return (
    <form
      className="o-inline"
      onSubmit={(event) => {
        event.preventDefault();
        if (picked !== undefined) access.save(picked, () => undefined);
      }}
    >
      <label htmlFor={fieldId} className="o-field-label">
        {t('sharing.artifacts.whoReads')}
      </label>
      <select
        id={fieldId}
        className="o-input"
        value={picked ?? ''}
        onChange={(event) => {
          const value = event.target.value;
          if (isArtifactAccess(value)) setChoice(value);
        }}
      >
        {current === undefined ? <option value="">{artifact.access}</option> : null}
        {ARTIFACT_ACCESSES.map((value) => (
          <option key={value} value={value}>
            {t(`sharing.access.${value}`)}
          </option>
        ))}
      </select>
      <Button type="submit" disabled={access.pending || picked === undefined || picked === current}>
        {t('sharing.artifacts.saveAccess')}
      </Button>
      {access.failure === undefined ? null : <p className="o-row__meta">{access.failure.message}</p>}
    </form>
  );
}

/** Deleting removes every version for everyone, for good: the owner types its title first (TeamCode's panel). */
function DeletePanel({
  artifact,
  busy,
  onDelete,
}: {
  readonly artifact: Artifact;
  readonly busy: boolean;
  readonly onDelete: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const [typed, setTyped] = useState('');
  const fieldId = useId();
  return (
    <details>
      <summary>{t('sharing.artifacts.delete')}</summary>
      <form
        className="o-stack"
        onSubmit={(event) => {
          event.preventDefault();
          if (typed.trim() === artifact.title) onDelete();
        }}
      >
        <p className="o-row__meta">{t('sharing.artifacts.deleteWarning', { title: artifact.title })}</p>
        <label htmlFor={fieldId} className="o-field-label">
          {t('sharing.artifacts.deleteTitle')}
        </label>
        <input
          id={fieldId}
          className="o-input"
          autoComplete="off"
          value={typed}
          onChange={(event) => {
            setTyped(event.target.value);
          }}
        />
        <Button type="submit" variant="danger" disabled={busy || typed.trim() !== artifact.title}>
          {t('sharing.artifacts.deleteForGood')}
        </Button>
      </form>
    </details>
  );
}
