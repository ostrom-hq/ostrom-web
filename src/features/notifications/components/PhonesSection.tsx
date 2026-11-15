// SPDX-License-Identifier: Apache-2.0
import type { PushDevice } from '@gen/api/types.gen';
import type { ReactElement } from 'react';
import { useAnnounced } from '@/shared/capabilities';
import { useEnumLabel } from '@/shared/i18n/enumLabel';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { Banner } from '@/shared/ui/Banner';
import { ConfirmButton } from '@/shared/ui/ConfirmButton';
import { FailureText } from '@/shared/ui/FailureText';
import { LoadState, Section } from '@/shared/ui/Screen';
import { usePushDevices } from '../useNotifications';

/**
 * The phones the person is notified on in this organization (`GET /push-devices`), each with a way to stop it
 * (`DELETE /push-devices/{id}`). Shown where the server has the push channel (`notifications.push.v1`).
 */
export function PhonesSection(): ReactElement | null {
  const { t } = useTranslation();
  const served = useAnnounced('notifications.push.v1');
  const view = usePushDevices(served);
  if (!served) return null;
  return (
    <Section label={t('notifications.phones.title')}>
      <p className="o-screen__lead">{t('notifications.phones.lead')}</p>
      <LoadState data={view.phones} failure={view.failure} rows={2}>
        {(phones) =>
          phones.length === 0 ? (
            <p className="o-screen__lead">{t('notifications.phones.none')}</p>
          ) : (
            <ul className="o-rows" aria-label={t('notifications.phones.title')}>
              {phones.map((phone) => (
                <PhoneRow
                  key={phone.id}
                  phone={phone}
                  locked={view.removing !== undefined}
                  onRemove={() => {
                    view.remove(phone);
                  }}
                />
              ))}
            </ul>
          )
        }
      </LoadState>
      {view.removeFailure === undefined ? null : (
        <Banner tone="danger" tag={t('notifications.errorTag')} live>
          <FailureText failure={view.removeFailure} />
        </Banner>
      )}
    </Section>
  );
}

function PhoneRow({
  phone,
  locked,
  onRemove,
}: {
  readonly phone: PushDevice;
  readonly locked: boolean;
  readonly onRemove: () => void;
}): ReactElement {
  const { t, i18n } = useTranslation();
  const label = useEnumLabel();
  const name = label('notifications.phones.platform', phone.platform);
  const since = new Date(phone.createdAt).toLocaleString(i18n.language, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  return (
    <li className="o-row">
      <span className="o-row__main">
        <span className="o-row__title">{name}</span>
        <span className="o-row__meta">
          {[t('notifications.phones.since', { date: since }), phone.locale]
            .filter((part) => part !== undefined)
            .join(' · ')}
        </span>
      </span>
      <span className="o-row__end o-inline">
        <ConfirmButton
          label={t('notifications.phones.remove')}
          confirm={t('notifications.phones.removeConfirm', { phone: name })}
          keep={t('notifications.phones.keep')}
          disabled={locked}
          onConfirm={onRemove}
        />
      </span>
    </li>
  );
}
