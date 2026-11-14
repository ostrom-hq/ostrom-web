// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/Button';
import type { MemberEnvironment } from '../model';

export interface MemberRowProps {
  readonly member: MemberEnvironment;
  readonly busy: boolean;
  readonly unassign: (variable: string) => void;
  readonly include: (variable: string) => void;
}

/** What one member receives, variable by variable, and what they are excluded from. */
export function MemberRow({ member, busy, unassign, include }: MemberRowProps): ReactElement {
  const { t } = useTranslation();
  return (
    <li className="o-row env-member" aria-label={member.label}>
      <span className="o-row__main">
        <span className="o-row__title">{member.label}</span>
        {member.assignments.length === 0 ? (
          <span className="o-row__meta">{t('environment.members.nothing')}</span>
        ) : (
          <ul className="env-list">
            {member.assignments.map((assignment) => (
              <li key={assignment.variable} className="o-inline">
                <span>
                  <span className="o-mono">{assignment.variable}</span>
                  {' → '}
                  {assignment.variantName}{' '}
                  <span className="o-row__meta">
                    {[
                      t('environment.variant.version', { version: assignment.version }),
                      t(
                        assignment.source === 'bulk'
                          ? 'environment.members.bulk'
                          : 'environment.members.direct',
                      ),
                      ...(assignment.personal ? [t('environment.members.personal')] : []),
                      ...(assignment.hasMemberValue ? [t('environment.members.memberValue')] : []),
                    ].join(' · ')}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  disabled={busy}
                  aria-label={t('environment.members.unassignLabel', {
                    variable: assignment.variable,
                    who: member.label,
                  })}
                  onClick={() => {
                    unassign(assignment.variable);
                  }}
                >
                  {t('environment.members.unassign')}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {member.exclusions.length === 0 ? null : (
          <ul className="env-list">
            {member.exclusions.map((exclusion) => (
              <li key={exclusion.variable} className="o-inline">
                <span>{t('environment.members.excluded', { variable: exclusion.variable })}</span>
                <Button
                  variant="ghost"
                  disabled={busy}
                  aria-label={t('environment.members.includeLabel', {
                    variable: exclusion.variable,
                    who: member.label,
                  })}
                  onClick={() => {
                    include(exclusion.variable);
                  }}
                >
                  {t('environment.members.include')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </span>
    </li>
  );
}
