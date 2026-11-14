// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { managesMembers } from '@/shared/org/roles';
import { WithOrg } from '@/shared/org/WithOrg';
import { Banner } from '@/shared/ui/Banner';
import { FailureText } from '@/shared/ui/FailureText';
import { EmptyState, LoadState, Screen, Section } from '@/shared/ui/Screen';
import { AssignForm } from '../components/AssignForm';
import { CreateVariantForm } from '../components/CreateVariantForm';
import { EnvironmentHelp } from '../components/EnvironmentHelp';
import { ExcludeForm } from '../components/ExcludeForm';
import { MemberRow } from '../components/MemberRow';
import { PersonalReviewRow } from '../components/PersonalReviewRow';
import { VariantRow } from '../components/VariantRow';
import { bindingOf } from '../model';
import { useEnvironmentAdmin, useEnvironmentChange } from '../useEnvironmentAdmin';
import './environment.css';

/** The organization's environment variants, who receives them and who is excluded: an owner's or an admin's page. */
export function EnvironmentScreen(): ReactElement {
  const { t } = useTranslation();
  return (
    <WithOrg title={t('environment.title')}>
      {(_org, role) =>
        managesMembers(role) ? (
          <EnvironmentAdmin />
        ) : (
          <Screen title={t('environment.title')}>
            <EmptyState title={t('environment.adminsOnlyTitle')}>{t('environment.adminsOnly')}</EmptyState>
          </Screen>
        )
      }
    </WithOrg>
  );
}

function EnvironmentAdmin(): ReactElement {
  const { t } = useTranslation();
  const view = useEnvironmentAdmin();
  const change = useEnvironmentChange();
  const busy = change.pending;
  const ownerOf = (id: string): string => view.members?.find((member) => member.id === id)?.label ?? id;
  return (
    <Screen title={t('environment.title')} lead={t('environment.lead')}>
      <EnvironmentHelp />
      {change.failure === undefined ? null : (
        <Banner tone="danger" tag={t('environment.errorTag')} live>
          <FailureText failure={change.failure} />
        </Banner>
      )}
      <LoadState data={view.variants} failure={view.failure}>
        {(variants) => (
          <Section label={t('environment.variants.title')}>
            {variants.length === 0 ? (
              <p className="o-empty">{t('environment.variants.empty')}</p>
            ) : (
              <ul className="o-rows" aria-label={t('environment.variants.title')}>
                {variants.map((variant) => (
                  <VariantRow
                    key={variant.id}
                    variant={variant}
                    busy={busy}
                    bulkResult={
                      change.bulkResult?.variantId === variant.id ? change.bulkResult.result : undefined
                    }
                    update={(next, onDone) => {
                      change.update(variant, next, onDone);
                    }}
                    remove={() => {
                      change.remove(variant);
                    }}
                    bulkAssign={
                      bindingOf(variant.binding) === 'shared'
                        ? () => {
                            change.bulkAssign(variant);
                          }
                        : undefined
                    }
                  />
                ))}
              </ul>
            )}
          </Section>
        )}
      </LoadState>
      <CreateVariantForm create={change.create} pending={busy} />
      <LoadState data={view.members} failure={view.assignmentsFailure}>
        {(members) => {
          const pickable = members.filter((member) => member.listed);
          return (
            <>
              <Section label={t('environment.members.title')}>
                <ul className="o-rows" aria-label={t('environment.members.title')}>
                  {members.map((member) => (
                    <MemberRow
                      key={member.id}
                      member={member}
                      busy={busy}
                      unassign={(variable) => {
                        change.unassign(member.id, variable);
                      }}
                      include={(variable) => {
                        change.include(member.id, variable);
                      }}
                    />
                  ))}
                </ul>
              </Section>
              <AssignForm
                members={pickable}
                variants={view.variants ?? []}
                busy={busy}
                assign={change.assign}
              />
              <ExcludeForm members={pickable} busy={busy} exclude={change.exclude} />
            </>
          );
        }}
      </LoadState>
      <LoadState data={view.personal} failure={view.personalFailure}>
        {(personal) => (
          <Section label={t('environment.review.title')}>
            <p className="o-row__meta">{t('environment.review.lead')}</p>
            {personal.length === 0 ? (
              <p className="o-empty">{t('environment.review.empty')}</p>
            ) : (
              <ul className="o-rows" aria-label={t('environment.review.title')}>
                {personal.map(({ variant, owner }) => (
                  <PersonalReviewRow
                    key={variant.id}
                    variant={variant}
                    owner={ownerOf(owner)}
                    assigned={
                      view.members?.some((member) =>
                        member.assignments.some((assignment) => assignment.variantId === variant.id),
                      ) ?? true
                    }
                    busy={busy}
                    promote={() => {
                      change.promote(variant);
                    }}
                    remove={() => {
                      change.remove(variant);
                    }}
                  />
                ))}
              </ul>
            )}
          </Section>
        )}
      </LoadState>
    </Screen>
  );
}
