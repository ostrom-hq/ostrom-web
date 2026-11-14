// SPDX-License-Identifier: Apache-2.0
import type { SkillEntry } from '@gen/api/types.gen';
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { formatAbsolute } from '@/shared/lib/time';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { ConfirmButton } from '@/shared/ui/ConfirmButton';
import { LoadState } from '@/shared/ui/Screen';
import { type PersonalChangeViewModel, usePersonalVersions } from '../usePersonalSkills';
import { Content } from './Content';

export interface PersonalSkillProps {
  readonly skill: SkillEntry;
  readonly change: PersonalChangeViewModel;
}

/** One of the person's own skills: what is pinned, retire or restore, and its versions behind a button. */
export function PersonalSkill({ skill, change }: PersonalSkillProps): ReactElement {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const pinned = skill.pinnedVersion ?? undefined;
  return (
    <li className="o-row dl-personal">
      <span className="o-row__main">
        <span className="o-inline">
          <span className="o-row__title o-mono">{skill.name}</span>
          <Badge tone={skill.retired ? 'warning' : 'success'}>
            {skill.retired ? t('delivery.skills.retired') : t('delivery.skills.active')}
          </Badge>
        </span>
        <span className="o-row__meta">
          {pinned === undefined ? (
            t('delivery.notPinned')
          ) : (
            <>
              {t('delivery.pinnedVersion')} <span className="o-mono">{pinned}</span>
            </>
          )}
        </span>
        <span className="o-row__meta">
          {t('delivery.updated', { at: formatAbsolute(skill.updatedAt, i18n.language) })}
        </span>
        {open ? (
          <div id={panelId} className="o-stack">
            <Versions skill={skill} change={change} />
          </div>
        ) : null}
      </span>
      <span className="o-row__end o-inline">
        <Button
          variant="ghost"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => {
            setOpen(!open);
          }}
        >
          {open
            ? t('delivery.personal.hideVersions', { name: skill.name })
            : t('delivery.personal.showVersions', { name: skill.name })}
        </Button>
        {skill.retired ? (
          <Button
            disabled={change.pending}
            onClick={() => {
              change.restore(skill.name);
            }}
          >
            {t('delivery.skills.restore')}
          </Button>
        ) : (
          <>
            {pinned === undefined ? null : (
              <Button
                disabled={change.pending}
                onClick={() => {
                  change.unpin(skill.name);
                }}
              >
                {t('delivery.unpin')}
              </Button>
            )}
            <ConfirmButton
              label={t('delivery.personal.retire')}
              confirm={t('delivery.personal.retireConfirm', { name: skill.name })}
              keep={t('delivery.keep')}
              disabled={change.pending}
              onConfirm={() => {
                change.retire(skill.name);
              }}
            />
          </>
        )}
      </span>
    </li>
  );
}

function Versions({ skill, change }: PersonalSkillProps): ReactElement {
  const { t, i18n } = useTranslation();
  const view = usePersonalVersions(skill.name);
  return (
    <LoadState data={view.versions} failure={view.failure} rows={1}>
      {(versions) =>
        versions.length === 0 ? (
          <p className="o-row__meta">{t('delivery.skills.noVersion')}</p>
        ) : (
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
                    {` · ${formatAbsolute(version.publishedAt, i18n.language)}`}
                  </span>
                </span>
                <span className="o-row__end">
                  {version.pinned || version.retired || skill.retired ? null : (
                    <Button
                      disabled={change.pending}
                      onClick={() => {
                        change.pin(skill.name, version.version);
                      }}
                    >
                      {t('delivery.versions.pin')}
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )
      }
    </LoadState>
  );
}
