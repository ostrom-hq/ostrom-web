// SPDX-License-Identifier: Apache-2.0
import type { Artifact } from '@gen/api/types.gen';
import { Link } from '@tanstack/react-router';
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { formatRelative } from '@/shared/lib/time';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { ConfirmButton } from '@/shared/ui/ConfirmButton';
import { originOf, shortId } from '../gallery';
import type { ArtifactScope } from '../route';
import { isArtifactAccess } from '../model';
import type { ArtifactChangeViewModel } from '../useSharing';
import { ArtifactDetail } from './ArtifactDetail';

export interface ArtifactCardProps {
  readonly artifact: Artifact;
  readonly now: Date;
  /** The tab it is listed in: its origin link keeps it. */
  readonly scope: ArtifactScope;
  /** Present when the viewer owns the artifact. */
  readonly change: ArtifactChangeViewModel | undefined;
}

/** The title opens its reading page; versions and readers load on demand. */
export function ArtifactCard({ artifact, now, scope, change }: ArtifactCardProps): ReactElement {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const headingId = useId();
  const detailId = useId();
  return (
    <article className="o-card o-stack" aria-labelledby={headingId}>
      <div className="o-inline sh-head">
        <h3 id={headingId} className="sh-name">
          <Link to="/artifacts/$artifactId" params={{ artifactId: artifact.id }}>
            {artifact.title}
          </Link>
        </h3>
        <Badge>
          {isArtifactAccess(artifact.access) ? t(`sharing.access.${artifact.access}`) : artifact.access}
        </Badge>
      </div>
      <p className="o-row__meta">
        {t('sharing.owner', { owner: artifact.owner })} ·{' '}
        {t('sharing.artifacts.version', { version: artifact.latestVersion })} ·{' '}
        <Origin artifact={artifact} scope={scope} /> ·{' '}
        {t('sharing.artifacts.updated', { when: formatRelative(artifact.updatedAt, now, i18n.language) })}
      </p>
      <div className="o-inline">
        <Button
          variant="ghost"
          aria-expanded={open}
          aria-controls={detailId}
          onClick={() => {
            setOpen(!open);
          }}
        >
          {open ? t('sharing.artifacts.hide') : t('sharing.artifacts.show')}
        </Button>
        {change === undefined ? null : (
          <ConfirmButton
            label={t('sharing.artifacts.delete')}
            confirm={t('sharing.artifacts.deleteConfirm', { what: artifact.title })}
            keep={t('sharing.keep')}
            disabled={change.pending === artifact.id}
            onConfirm={() => {
              change.remove(artifact.id);
            }}
          />
        )}
      </div>
      <div id={detailId} hidden={!open}>
        {open ? <ArtifactDetail artifact={artifact} change={change} /> : null}
      </div>
    </article>
  );
}

/** Where it came from, linked to everything the same cloud session or launch published (TeamCode's origin link). */
function Origin({
  artifact,
  scope,
}: {
  readonly artifact: Artifact;
  readonly scope: ArtifactScope;
}): ReactElement {
  const { t } = useTranslation();
  const origin = originOf(artifact);
  const tab = scope === 'team' ? {} : { scope };
  if (origin.kind === 'api') return <>{t('sharing.artifacts.originApi')}</>;
  if (origin.kind === 'cloud_session')
    return (
      <Link to="/artifacts" search={{ ...tab, session: origin.session }}>
        {t('sharing.artifacts.cloudSessionId', { id: shortId(origin.session) })}
      </Link>
    );
  return (
    <Link to="/artifacts" search={{ ...tab, launch: origin.launch }}>
      {t('sharing.artifacts.localRunId', { id: shortId(origin.launch) })}
    </Link>
  );
}
