// SPDX-License-Identifier: Apache-2.0
import { useParams } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { WithOrg } from '@/shared/org/WithOrg';
import { LoadState, Screen } from '@/shared/ui/Screen';
import { Skeleton } from '@/shared/ui/Skeleton';
import { Content } from '../components/Content';
import { BackToCatalog, DeliveredLead } from '../components/DeliveredHead';
import { Definition } from '../components/Definition';
import { useHookDelivery } from '../useMemberDelivery';
import './delivery.css';

/** What a member receives: the pinned hook versions they may install, each one still approved on their computer. */
export function MemberHooksScreen(): ReactElement {
  const { t } = useTranslation();
  const { memberId } = useParams({ from: '/members/$memberId/hooks' });
  return (
    <WithOrg title={t('delivery.member.hooksTitle')}>{() => <DeliveredHooks memberId={memberId} />}</WithOrg>
  );
}

function DeliveredHooks({ memberId }: { readonly memberId: string }): ReactElement {
  const { t } = useTranslation();
  const view = useHookDelivery(memberId);
  const { who } = view;
  if (who === undefined)
    return (
      <Screen title={t('delivery.member.hooksTitle')}>
        <Skeleton rows={3} />
      </Screen>
    );
  return (
    <Screen
      top={<BackToCatalog who={who} to="hooks" />}
      title={t('delivery.member.hooksTitle')}
      lead={<DeliveredLead who={who} memberId={memberId} />}
    >
      <p className="o-screen__lead">{t('delivery.member.hooksHelp')}</p>
      <LoadState data={view.hooks} failure={view.failure}>
        {(hooks) =>
          hooks.length === 0 ? (
            <p className="o-empty">{t('delivery.member.noHook')}</p>
          ) : (
            <ul className="o-card o-rows" aria-label={t('delivery.member.hooksList')}>
              {hooks.map((hook) => (
                <li key={hook.name} className="o-row">
                  <span className="o-row__main">
                    <span className="o-row__title o-mono">{hook.name}</span>
                    <span className="o-row__meta">
                      <span className="o-mono">{hook.version}</span>
                    </span>
                    <span className="o-row__meta o-mono dl-digest">{hook.digest}</span>
                    <Definition definition={hook.definition} />
                    <span className="o-row__meta">
                      <Content fileCount={hook.fileCount} sizeBytes={hook.sizeBytes} />
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )
        }
      </LoadState>
    </Screen>
  );
}
