// SPDX-License-Identifier: Apache-2.0
import type { HookVersion, OrgMember } from '@gen/api/types.gen';
import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { formatAbsolute } from '@/shared/lib/time';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { whoIs } from '../model';
import type { HookChangeViewModel } from '../useHooks';
import { Content } from './Content';
import { Definition } from './Definition';

export interface HookVersionsProps {
  readonly name: string;
  /** Newest first. */
  readonly versions: readonly HookVersion[];
  readonly members: readonly OrgMember[] | undefined;
  readonly change: HookChangeViewModel;
}

/** A hook's immutable versions: definition, digest, content, publisher; its code is read before a version is pinned. */
export function HookVersions({ name, versions, members, change }: HookVersionsProps): ReactElement {
  const { t, i18n } = useTranslation();
  if (versions.length === 0) return <p className="o-empty">{t('delivery.hooks.noVersion')}</p>;
  return (
    <ul className="o-rows" aria-label={t('delivery.versions.list', { name })}>
      {versions.map((version) => (
        <li key={version.version} className="o-row">
          <span className="o-row__main">
            <span className="o-inline">
              <span className="o-row__title o-mono">{version.version}</span>
              {version.pinned ? <Badge tone="success">{t('delivery.versions.pinned')}</Badge> : null}
            </span>
            <span className="o-row__meta o-mono dl-digest">{version.digest}</span>
            <Definition definition={version.definition} />
            <span className="o-row__meta">
              <Content fileCount={version.fileCount} sizeBytes={version.sizeBytes} />
            </span>
            <span className="o-row__meta">
              {t('delivery.versions.publishedBy', {
                who: whoIs(version.publishedBy, members),
                at: formatAbsolute(version.publishedAt, i18n.language),
              })}
            </span>
          </span>
          <span className="o-row__end o-inline">
            <Link
              to="/hooks/$name/versions/$version"
              params={{ name, version: version.version }}
              aria-label={t('delivery.hooks.readLabel', { version: version.version })}
            >
              {t('delivery.hooks.read')}
            </Link>
            {version.pinned ? (
              <span className="o-row__meta">{t('delivery.versions.approved')}</span>
            ) : (
              <Button
                disabled={change.pending}
                onClick={() => {
                  change.pin(version.version);
                }}
              >
                {t('delivery.versions.pin')}
              </Button>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
