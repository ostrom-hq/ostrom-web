// SPDX-License-Identifier: Apache-2.0
import { Link, useParams } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useEnumLabel } from '@/shared/i18n/enumLabel';
import { formatAbsolute } from '@/shared/lib/time';
import { WithOrg } from '@/shared/org/WithOrg';
import { Badge } from '@/shared/ui/Badge';
import { LoadState, Screen, Section } from '@/shared/ui/Screen';
import { BackToCatalog, DeliveredLead } from '../components/DeliveredHead';
import { Content } from '../components/Content';
import { statusTone } from '../model';
import { useSkillDelivery } from '../useMemberDelivery';
import { Skeleton } from '@/shared/ui/Skeleton';
import './delivery.css';

/** What a member receives (the pinned versions they may install) and where each workstation says it installed it. */
export function MemberSkillsScreen(): ReactElement {
  const { t } = useTranslation();
  const { memberId } = useParams({ from: '/members/$memberId/skills' });
  return (
    <WithOrg title={t('delivery.member.skillsTitle')}>
      {() => <DeliveredSkills memberId={memberId} />}
    </WithOrg>
  );
}

function DeliveredSkills({ memberId }: { readonly memberId: string }): ReactElement {
  const { t, i18n } = useTranslation();
  const enumText = useEnumLabel();
  const view = useSkillDelivery(memberId);
  const { who } = view;
  if (who === undefined)
    return (
      <Screen title={t('delivery.member.skillsTitle')}>
        <Skeleton rows={3} />
      </Screen>
    );
  return (
    <Screen
      top={<BackToCatalog who={who} to="skills" />}
      title={t('delivery.member.skillsTitle')}
      lead={<DeliveredLead who={who} memberId={memberId} />}
    >
      <p className="o-screen__lead">{t('delivery.member.skillsHelp')}</p>
      <LoadState data={view.skills} failure={view.failure}>
        {(skills) =>
          skills.length === 0 ? (
            <p className="o-empty">{t('delivery.member.noSkill')}</p>
          ) : (
            <ul className="o-card o-rows" aria-label={t('delivery.member.skillsList')}>
              {skills.map((skill) => (
                <li key={skill.name} className="o-row">
                  <span className="o-row__main">
                    <span className="o-row__title o-mono">{skill.name}</span>
                    <span className="o-row__meta">
                      <span className="o-mono">{skill.version}</span>
                    </span>
                    <span className="o-row__meta o-mono dl-digest">{skill.digest}</span>
                    <span className="o-row__meta">
                      <Content fileCount={skill.fileCount} sizeBytes={skill.sizeBytes} />
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )
        }
      </LoadState>
      <Section label={t('delivery.member.installations')}>
        {view.installations === undefined ? null : view.installations.length === 0 ? (
          <p className="o-empty">{t('delivery.member.noInstallation')}</p>
        ) : (
          <ul className="o-rows" aria-label={t('delivery.member.installationsList')}>
            {view.installations.map((item) => (
              <li key={`${item.deviceId}:${item.name}`} className="o-row">
                <span className="o-row__main">
                  <span className="o-row__title">{item.deviceName}</span>
                  <span className="o-row__meta">
                    <span className="o-mono">{item.name}</span>
                    {item.version === undefined || item.version === null ? null : (
                      <>
                        {' '}
                        <span className="o-mono">{item.version}</span>
                      </>
                    )}
                  </span>
                  <span className="o-row__meta">
                    {t('delivery.member.reported', { at: formatAbsolute(item.reportedAt, i18n.language) })}
                  </span>
                </span>
                <span className="o-row__end">
                  <Badge tone={statusTone(item.status)}>
                    {enumText('delivery.member.status', item.status)}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      {who.mine ? (
        <p>
          <Link to="/me/skills">{t('delivery.skills.personalLink')}</Link>
        </p>
      ) : null}
    </Screen>
  );
}
