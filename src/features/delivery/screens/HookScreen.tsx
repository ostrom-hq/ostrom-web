// SPDX-License-Identifier: Apache-2.0
import { Link, useParams } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { WithOrg } from '@/shared/org/WithOrg';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { FailureText } from '@/shared/ui/FailureText';
import { LoadState, Screen, Section } from '@/shared/ui/Screen';
import { Administrators } from '../components/Administrators';
import { AudienceForm } from '../components/AudienceForm';
import { DecisionRows } from '../components/DecisionRows';
import { Help } from '../components/Help';
import { HookVersions } from '../components/HookVersions';
import { useHook, useHookChange } from '../useHooks';
import './delivery.css';

/** One hook: its versions (read their code before pinning), what is pinned, who receives it. */
export function HookScreen(): ReactElement {
  const { t } = useTranslation();
  const { name } = useParams({ from: '/hooks/$name' });
  return (
    <WithOrg title={name}>
      {() => (
        <Administrators delivered="hooks">
          <HookPage name={name} title={t('delivery.hooks.pageTitle', { name })} />
        </Administrators>
      )}
    </WithOrg>
  );
}

function HookPage({ name, title }: { readonly name: string; readonly title: string }): ReactElement {
  const { t } = useTranslation();
  const view = useHook(name);
  const change = useHookChange(name);
  const loaded =
    view.hook === undefined || view.versions === undefined || view.decisions === undefined
      ? undefined
      : { hook: view.hook, versions: view.versions, decisions: view.decisions };
  return (
    <LoadState data={loaded} failure={view.failure}>
      {({ hook, versions, decisions }) => {
        const pinned = hook.pinnedVersion ?? undefined;
        return (
          <Screen
            top={
              <Link to="/hooks" className="o-back">
                {t('delivery.hooks.back')}
              </Link>
            }
            title={title}
          >
            <Help>
              {pinned === undefined
                ? t('delivery.hooks.helpNotPinned')
                : t('delivery.hooks.helpPinned', { version: pinned })}{' '}
              {hook.allMembers ? t('delivery.hooks.runsForAll') : t('delivery.hooks.runsForYes')}{' '}
              {t('delivery.hooks.readFirst')}
            </Help>
            {change.failure === undefined ? null : (
              <Banner tone="danger" tag={t('delivery.errorTag')} live>
                <FailureText failure={change.failure} />
              </Banner>
            )}
            {pinned === undefined ? null : (
              <div className="o-inline">
                <Button disabled={change.pending} onClick={change.unpin}>
                  {t('delivery.unpin')}
                </Button>
              </div>
            )}
            <Section label={t('delivery.versions.title')}>
              <HookVersions name={hook.name} versions={versions} members={view.members} change={change} />
            </Section>
            <Section label={t('delivery.access.title')}>
              <AudienceForm
                // The audience the server holds: the choice starts again from it once it is saved.
                key={String(hook.allMembers)}
                allMembers={hook.allMembers}
                busy={change.pending}
                onSave={change.setAudience}
              />
              <p className="o-screen__lead">
                {hook.allMembers ? t('delivery.access.allExplain') : t('delivery.access.assignedExplainHook')}{' '}
                {t('delivery.access.precedence')}
              </p>
              <DecisionRows
                delivered="hooks"
                allMembers={hook.allMembers}
                members={view.members}
                people={view.people}
                decisions={decisions}
                busy={change.pending}
                onDecide={change.decide}
              />
            </Section>
          </Screen>
        );
      }}
    </LoadState>
  );
}
