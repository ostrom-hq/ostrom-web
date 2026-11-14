// SPDX-License-Identifier: Apache-2.0
import type { Member, SkillEntry } from '@gen/api/types.gen';
import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useViewer } from '@/shared/auth/useViewer';
import { formatAbsolute } from '@/shared/lib/time';
import { WithOrg } from '@/shared/org/WithOrg';
import { Badge } from '@/shared/ui/Badge';
import { LoadState, Screen } from '@/shared/ui/Screen';
import { Administrators } from '../components/Administrators';
import { Help } from '../components/Help';
import { whoIs } from '../model';
import { useSkillCatalog } from '../useSkills';
import './delivery.css';

/** The skill catalog, for owners and admins; anyone else is sent to the skills delivered to them. */
export function SkillsScreen(): ReactElement {
  const { t } = useTranslation();
  return (
    <WithOrg title={t('delivery.skills.title')}>
      {() => (
        <Administrators delivered="skills">
          <SkillCatalog />
        </Administrators>
      )}
    </WithOrg>
  );
}

function SkillCatalog(): ReactElement {
  const { t } = useTranslation();
  const { memberId } = useViewer();
  const view = useSkillCatalog();
  return (
    <Screen title={t('delivery.skills.title')} lead={t('delivery.skills.lead')}>
      <Help>{t('delivery.skills.help')}</Help>
      <LoadState data={view.skills} failure={view.failure}>
        {(skills) =>
          skills.length === 0 ? (
            <p className="o-empty">{t('delivery.skills.empty')}</p>
          ) : (
            <ul className="o-card o-rows" aria-label={t('delivery.skills.list')}>
              {skills.map((skill) => (
                <SkillRow key={skill.id} skill={skill} members={view.members} />
              ))}
            </ul>
          )
        }
      </LoadState>
      <p className="o-inline">
        {memberId === undefined ? null : (
          <Link to="/members/$memberId/skills" params={{ memberId }}>
            {t('delivery.skills.mine')}
          </Link>
        )}
        <Link to="/me/skills">{t('delivery.skills.personalLink')}</Link>
      </p>
    </Screen>
  );
}

function SkillRow({
  skill,
  members,
}: {
  readonly skill: SkillEntry;
  readonly members: readonly Member[] | undefined;
}): ReactElement {
  const { t, i18n } = useTranslation();
  const owner = skill.ownerId ?? undefined;
  const personal = owner !== undefined;
  const audience = personal
    ? t('delivery.skills.ownerOnly', { who: whoIs(owner, members) })
    : skill.allMembers
      ? t('delivery.audience.all')
      : t('delivery.audience.assigned');
  return (
    <li className="o-row">
      <span className="o-row__main">
        <Link to="/skills/$name" params={{ name: skill.name }} className="o-row__title o-mono">
          {skill.name}
        </Link>
        <span className="o-row__meta">
          {skill.pinnedVersion === undefined || skill.pinnedVersion === null ? (
            t('delivery.notPinned')
          ) : (
            <>
              {t('delivery.pinnedVersion')} <span className="o-mono">{skill.pinnedVersion}</span>
            </>
          )}
        </span>
        <span className="o-row__meta">{audience}</span>
        <span className="o-row__meta">
          {t('delivery.updated', { at: formatAbsolute(skill.updatedAt, i18n.language) })}
        </span>
      </span>
      <span className="o-row__end o-inline">
        {personal ? <Badge>{t('delivery.skills.personal')}</Badge> : null}
        <Badge tone={skill.retired ? 'warning' : 'success'}>
          {skill.retired ? t('delivery.skills.retired') : t('delivery.skills.active')}
        </Badge>
      </span>
    </li>
  );
}
