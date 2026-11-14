// SPDX-License-Identifier: Apache-2.0
import type { HookEntry } from '@gen/api/types.gen';
import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useViewer } from '@/shared/auth/useViewer';
import { formatAbsolute } from '@/shared/lib/time';
import { WithOrg } from '@/shared/org/WithOrg';
import { LoadState, Screen } from '@/shared/ui/Screen';
import { Administrators } from '../components/Administrators';
import { Help } from '../components/Help';
import { useHookCatalog } from '../useHooks';
import './delivery.css';

/** The team hooks, for owners and admins; anyone else is sent to the hooks delivered to them. */
export function HooksScreen(): ReactElement {
  const { t } = useTranslation();
  return (
    <WithOrg title={t('delivery.hooks.title')}>
      {() => (
        <Administrators delivered="hooks">
          <HookCatalog />
        </Administrators>
      )}
    </WithOrg>
  );
}

function HookCatalog(): ReactElement {
  const { t } = useTranslation();
  const { memberId } = useViewer();
  const view = useHookCatalog();
  return (
    <Screen title={t('delivery.hooks.title')} lead={t('delivery.hooks.lead')}>
      <Help>{t('delivery.hooks.help')}</Help>
      <LoadState data={view.hooks} failure={view.failure}>
        {(hooks) =>
          hooks.length === 0 ? (
            <p className="o-empty">{t('delivery.hooks.empty')}</p>
          ) : (
            <ul className="o-card o-rows" aria-label={t('delivery.hooks.list')}>
              {hooks.map((hook) => (
                <HookRow key={hook.id} hook={hook} />
              ))}
            </ul>
          )
        }
      </LoadState>
      {memberId === undefined ? null : (
        <p>
          <Link to="/members/$memberId/hooks" params={{ memberId }}>
            {t('delivery.hooks.mine')}
          </Link>
        </p>
      )}
    </Screen>
  );
}

function HookRow({ hook }: { readonly hook: HookEntry }): ReactElement {
  const { t, i18n } = useTranslation();
  return (
    <li className="o-row">
      <span className="o-row__main">
        <Link to="/hooks/$name" params={{ name: hook.name }} className="o-row__title o-mono">
          {hook.name}
        </Link>
        <span className="o-row__meta">
          {hook.pinnedVersion === undefined || hook.pinnedVersion === null ? (
            t('delivery.notPinned')
          ) : (
            <>
              {t('delivery.pinnedVersion')} <span className="o-mono">{hook.pinnedVersion}</span>
            </>
          )}
        </span>
        <span className="o-row__meta">
          {hook.allMembers ? t('delivery.audience.all') : t('delivery.audience.assigned')}
        </span>
        <span className="o-row__meta">
          {t('delivery.updated', { at: formatAbsolute(hook.updatedAt, i18n.language) })}
        </span>
      </span>
    </li>
  );
}
