// SPDX-License-Identifier: Apache-2.0
import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { WithOrg } from '@/shared/org/WithOrg';
import { Banner } from '@/shared/ui/Banner';
import { FailureText } from '@/shared/ui/FailureText';
import { LoadState, Screen } from '@/shared/ui/Screen';
import { PersonalSkill } from '../components/PersonalSkill';
import { usePersonalChange, usePersonalSkills } from '../usePersonalSkills';
import { useViewer } from '@/shared/auth/useViewer';
import './delivery.css';

/** The person's own skills: delivered to them only, until an administrator promotes one to the team. */
export function PersonalSkillsScreen(): ReactElement {
  const { t } = useTranslation();
  return <WithOrg title={t('delivery.personal.title')}>{() => <PersonalSkills />}</WithOrg>;
}

function PersonalSkills(): ReactElement {
  const { t } = useTranslation();
  const { memberId } = useViewer();
  const view = usePersonalSkills();
  const change = usePersonalChange((view.skills ?? []).map((skill) => skill.name));
  return (
    <Screen
      top={
        memberId === undefined ? undefined : (
          <Link to="/members/$memberId/skills" params={{ memberId }} className="o-back">
            {t('delivery.personal.back')}
          </Link>
        )
      }
      title={t('delivery.personal.title')}
      lead={t('delivery.personal.lead')}
    >
      {change.failure === undefined ? null : (
        <Banner tone="danger" tag={t('delivery.errorTag')} live>
          <FailureText failure={change.failure} />
        </Banner>
      )}
      <LoadState data={view.skills} failure={view.failure}>
        {(skills) =>
          skills.length === 0 ? (
            <p className="o-empty">{t('delivery.personal.empty')}</p>
          ) : (
            <ul className="o-card o-rows" aria-label={t('delivery.personal.list')}>
              {skills.map((skill) => (
                <PersonalSkill key={skill.id} skill={skill} change={change} />
              ))}
            </ul>
          )
        }
      </LoadState>
    </Screen>
  );
}
