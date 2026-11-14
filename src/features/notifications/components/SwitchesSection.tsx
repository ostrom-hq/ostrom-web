// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useAnnounced } from '@/shared/capabilities';
import { useEnumLabel } from '@/shared/i18n/enumLabel';
import { Banner } from '@/shared/ui/Banner';
import { FailureText } from '@/shared/ui/FailureText';
import { LoadState, Section } from '@/shared/ui/Screen';
import { isKnownKind, switchRows } from '../model';
import { useNotificationSwitches } from '../useNotifications';

/**
 * What the member is told about in this organization (`notifications.v1`): one switch per kind and channel the server
 * offers, each saved as soon as it is changed, as TeamCode's app does. Every kind is on until the member turns it off.
 */
export function SwitchesSection(): ReactElement | null {
  const { t } = useTranslation();
  const label = useEnumLabel();
  // Nothing is asked of a server that has not said it serves this.
  const served = useAnnounced('notifications.v1');
  const view = useNotificationSwitches(served);
  if (!served) return null;
  return (
    <Section label={t('notifications.switches.title')}>
      <p className="o-screen__lead">{t('notifications.switches.lead')}</p>
      <LoadState data={view.settings} failure={view.failure} rows={4}>
        {(settings) =>
          settings.channels.length === 0 ? (
            <p className="o-empty">{t('notifications.switches.noChannel')}</p>
          ) : (
            <div className="o-stack">
              {switchRows(settings).map((row) => (
                <fieldset key={row.kind} className="o-stack">
                  <legend className="o-field-label">{label('notifications.kind', row.kind)}</legend>
                  {isKnownKind(row.kind) ? (
                    <p className="o-screen__lead">{t(`notifications.kindHint.${row.kind}`)}</p>
                  ) : null}
                  <div className="o-inline">
                    {row.cells.map((cell) => {
                      const { pending } = view;
                      // The switch on its way shows what it is becoming; the server's answer then holds.
                      const enabled =
                        pending?.kind === row.kind && pending.channel === cell.channel
                          ? pending.enabled
                          : cell.enabled;
                      return (
                        <label key={cell.channel} className="o-inline">
                          <input
                            type="checkbox"
                            checked={enabled}
                            disabled={pending !== undefined}
                            onChange={() => {
                              view.toggle({ channel: cell.channel, kind: row.kind, enabled: !enabled });
                            }}
                          />
                          <span>{label('notifications.channel', cell.channel)}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
              <p className="o-screen__lead">{t('notifications.switches.note')}</p>
            </div>
          )
        }
      </LoadState>
      {view.toggleFailure === undefined ? null : (
        <Banner tone="danger" tag={t('notifications.errorTag')} live>
          <FailureText failure={view.toggleFailure} />
        </Banner>
      )}
    </Section>
  );
}
