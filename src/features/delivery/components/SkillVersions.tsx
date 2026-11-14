// SPDX-License-Identifier: Apache-2.0
import type { Member, SkillEntry, SkillVersion } from '@gen/api/types.gen';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { formatAbsolute } from '@/shared/lib/time';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { ConfirmButton } from '@/shared/ui/ConfirmButton';
import { whoIs } from '../model';
import type { SkillChangeViewModel } from '../useSkills';
import { Content } from './Content';

export interface SkillVersionsProps {
  readonly skill: SkillEntry;
  /** Newest first. */
  readonly versions: readonly SkillVersion[];
  readonly members: readonly Member[] | undefined;
  /** Pin and retire are for a team skill: a personal one is promoted first. */
  readonly writable: boolean;
  readonly change: SkillChangeViewModel;
}

/** A skill's immutable versions: digest, content, publisher, and the gestures that pin or retire one. */
export function SkillVersions({
  skill,
  versions,
  members,
  writable,
  change,
}: SkillVersionsProps): ReactElement {
  const { t, i18n } = useTranslation();
  if (versions.length === 0) return <p className="o-empty">{t('delivery.skills.noVersion')}</p>;
  return (
    <ul className="o-rows" aria-label={t('delivery.versions.list', { name: skill.name })}>
      {versions.map((version) => (
        <li key={version.version} className="o-row">
          <span className="o-row__main">
            <span className="o-inline">
              <span className="o-row__title o-mono">{version.version}</span>
              {version.pinned ? <Badge tone="success">{t('delivery.versions.pinned')}</Badge> : null}
              {version.retired ? <Badge tone="warning">{t('delivery.versions.retired')}</Badge> : null}
            </span>
            <span className="o-row__meta o-mono dl-digest">{version.digest}</span>
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
          <span className="o-row__end">
            {version.pinned ? (
              <span className="o-row__meta">{t('delivery.versions.approved')}</span>
            ) : version.retired || skill.retired || !writable ? null : (
              <span className="o-inline">
                <Button
                  disabled={change.pending}
                  onClick={() => {
                    change.pin(version.version);
                  }}
                >
                  {t('delivery.versions.pin')}
                </Button>
                <ConfirmButton
                  label={t('delivery.versions.retire')}
                  confirm={t('delivery.versions.retireConfirm', { version: version.version })}
                  keep={t('delivery.keep')}
                  disabled={change.pending}
                  onConfirm={() => {
                    change.retireVersion(version.version);
                  }}
                />
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
