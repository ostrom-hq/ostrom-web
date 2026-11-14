// SPDX-License-Identifier: Apache-2.0
import { Link, useParams } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { WithOrg } from '@/shared/org/WithOrg';
import { Banner } from '@/shared/ui/Banner';
import { FailureText } from '@/shared/ui/FailureText';
import { LoadState, Screen, Section } from '@/shared/ui/Screen';
import { Administrators } from '../components/Administrators';
import { AudienceForm } from '../components/AudienceForm';
import { DecisionRows } from '../components/DecisionRows';
import { Help } from '../components/Help';
import { SkillControls } from '../components/SkillControls';
import { SkillVersions } from '../components/SkillVersions';
import { isPersonal, useSkill, useSkillChange } from '../useSkills';
import './delivery.css';

/** One skill: its versions, what is pinned, who receives it. */
export function SkillScreen(): ReactElement {
  const { t } = useTranslation();
  const { name } = useParams({ from: '/skills/$name' });
  return (
    <WithOrg title={name}>
      {() => (
        <Administrators delivered="skills">
          <SkillPage name={name} title={t('delivery.skills.pageTitle', { name })} />
        </Administrators>
      )}
    </WithOrg>
  );
}

function SkillPage({ name, title }: { readonly name: string; readonly title: string }): ReactElement {
  const { t } = useTranslation();
  const view = useSkill(name);
  const change = useSkillChange(name);
  const loaded =
    view.skill === undefined || view.versions === undefined
      ? undefined
      : { skill: view.skill, versions: view.versions };
  return (
    <LoadState data={loaded} failure={view.failure}>
      {({ skill, versions }) => {
        const personal = isPersonal(skill);
        const pinned = skill.pinnedVersion ?? undefined;
        return (
          <Screen
            top={
              <Link to="/skills" className="o-back">
                {t('delivery.skills.back')}
              </Link>
            }
            title={title}
          >
            <Help>
              {personal
                ? t('delivery.skills.helpPersonal')
                : skill.retired
                  ? t('delivery.skills.helpRetired')
                  : pinned === undefined
                    ? t('delivery.skills.helpNotPinned')
                    : t('delivery.skills.helpPinned', { version: pinned })}
            </Help>
            {change.failure === undefined ? null : (
              <Banner tone="danger" tag={t('delivery.errorTag')} live>
                <FailureText failure={change.failure} />
              </Banner>
            )}
            <SkillControls skill={skill} change={change} />
            <Section label={t('delivery.versions.title')}>
              <SkillVersions
                skill={skill}
                versions={versions}
                members={view.members}
                writable={!personal}
                change={change}
              />
            </Section>
            {personal || view.decisions === undefined ? null : (
              <Section label={t('delivery.access.title')}>
                <AudienceForm
                  // The audience the server holds: the choice starts again from it once it is saved.
                  key={String(skill.allMembers)}
                  allMembers={skill.allMembers}
                  busy={change.pending}
                  onSave={change.setAudience}
                />
                <p className="o-screen__lead">
                  {skill.allMembers ? t('delivery.access.allExplain') : t('delivery.access.assignedExplain')}{' '}
                  {t('delivery.access.precedence')}
                </p>
                <DecisionRows
                  delivered="skills"
                  allMembers={skill.allMembers}
                  members={view.members}
                  people={view.people}
                  decisions={view.decisions}
                  busy={change.pending}
                  onDecide={change.decide}
                />
              </Section>
            )}
            {personal ? <p className="o-screen__lead">{t('delivery.skills.personalNote')}</p> : null}
          </Screen>
        );
      }}
    </LoadState>
  );
}
