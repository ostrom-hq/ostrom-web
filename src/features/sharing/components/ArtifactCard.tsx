// SPDX-License-Identifier: Apache-2.0
import type { Artifact } from '@gen/api/types.gen';
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { safeHref } from '@/shared/lib/safeHref';
import { formatRelative } from '@/shared/lib/time';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { ConfirmButton } from '@/shared/ui/ConfirmButton';
import { isArtifactAccess } from '../model';
import type { ArtifactChangeViewModel } from '../useSharing';
import { ArtifactDetail } from './ArtifactDetail';

export interface ArtifactCardProps {
  readonly artifact: Artifact;
  readonly now: Date;
  /** Present when the viewer owns the artifact. */
  readonly change: ArtifactChangeViewModel | undefined;
}

/** The title opens the page (only an http(s) link); versions and readers load on demand. */
export function ArtifactCard({ artifact, now, change }: ArtifactCardProps): ReactElement {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const headingId = useId();
  const detailId = useId();
  const href = safeHref(artifact.url);
  return (
    <article className="o-card o-stack" aria-labelledby={headingId}>
      <div className="o-inline sh-head">
        <h3 id={headingId} className="sh-name">
          {href === undefined ? (
            artifact.title
          ) : (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {artifact.title}
            </a>
          )}
        </h3>
        <Badge>
          {isArtifactAccess(artifact.access) ? t(`sharing.access.${artifact.access}`) : artifact.access}
        </Badge>
      </div>
      <p className="o-row__meta">
        {[
          t('sharing.owner', { owner: artifact.owner }),
          t('sharing.artifacts.version', { version: artifact.latestVersion }),
          t('sharing.artifacts.updated', { when: formatRelative(artifact.updatedAt, now, i18n.language) }),
        ].join(' · ')}
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
