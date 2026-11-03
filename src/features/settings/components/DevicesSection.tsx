// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/shared/ui/Badge';
import { Banner } from '@/shared/ui/Banner';
import { ConfirmButton } from '@/shared/ui/ConfirmButton';
import { FailureText } from '@/shared/ui/FailureText';
import { LoadState, Section } from '@/shared/ui/Screen';
import type { DevicesViewModel } from '../useKeysAndDevices';

/** Where the CLI is signed in as the person (`ostrom login`): one row per workstation, each signed out on its own. */
export function DevicesSection({ view }: { readonly view: DevicesViewModel }): ReactElement {
  const { t, i18n } = useTranslation();
  const when = (at: string): string =>
    new Date(at).toLocaleString(i18n.language, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  return (
    <Section label={t('settings.devices.title')}>
      <p className="o-row__meta">{t('settings.devices.lead')}</p>
      <LoadState data={view.devices} failure={view.failure} rows={2}>
        {(devices) =>
          devices.length === 0 ? (
            <p className="o-empty">{t('settings.devices.empty')}</p>
          ) : (
            <ul className="o-rows">
              {devices.map((device) => (
                <li key={device.id} className="o-row">
                  <span className="o-row__main">
                    <span className="o-row__title">{device.name}</span>
                    <span className="o-row__meta">
                      {device.lastSeenAt === undefined
                        ? t('settings.devices.neverSeen')
                        : t('settings.devices.seen', { date: when(device.lastSeenAt) })}
                    </span>
                  </span>
                  <span className="o-row__end o-inline">
                    {device.kind === 'admin' ? (
                      <Badge tone="warning">{t('settings.devices.admin')}</Badge>
                    ) : null}
                    <ConfirmButton
                      label={t('settings.devices.signOut')}
                      confirm={t('settings.devices.signOutConfirm', { name: device.name })}
                      keep={t('settings.devices.keep')}
                      disabled={view.signingOut}
                      onConfirm={() => {
                        view.signOut(device);
                      }}
                    />
                  </span>
                </li>
              ))}
            </ul>
          )
        }
      </LoadState>
      {view.signOutFailure === undefined ? null : (
        <Banner tone="danger" tag={t('settings.devices.errorTag')} live>
          <FailureText failure={view.signOutFailure} />
        </Banner>
      )}
    </Section>
  );
}
