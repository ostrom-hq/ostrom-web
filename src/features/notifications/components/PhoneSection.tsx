// SPDX-License-Identifier: Apache-2.0
import type { NotificationPreferences } from '@gen/api/types.gen';
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAnnounced } from '@/shared/capabilities';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { FailureText } from '@/shared/ui/FailureText';
import { LoadState, Section } from '@/shared/ui/Screen';
import { clockOf, PHONE_SWITCHES, type PhoneForm, preferencesOf, quietHoursProblem } from '../model';
import { type PhonePreferencesViewModel, usePhonePreferences } from '../useNotifications';
import { usePhoneForm } from '../usePhoneForm';

/**
 * What the person is told on their phone about the approvals (`/me/notifications`): a request for their yes, an
 * answer to their request, a budget about to be reached, and hours without notifications. They are the person's own,
 * across their organizations. Shown where the server has the push channel (`notifications.push.v1`).
 */
export function PhoneSection(): ReactElement | null {
  const { t } = useTranslation();
  const served = useAnnounced('notifications.push.v1');
  const [saved, setSaved] = useState(false);
  const view = usePhonePreferences(served);
  if (!served) return null;
  return (
    <Section label={t('notifications.phone.title')}>
      <p className="o-screen__lead">{t('notifications.phone.lead')}</p>
      <LoadState data={view.preferences} failure={view.failure} rows={3}>
        {(preferences) => (
          <PhoneFormOf preferences={preferences} view={view} saved={saved} onSaved={setSaved} />
        )}
      </LoadState>
    </Section>
  );
}

function PhoneFormOf({
  preferences,
  view,
  saved,
  onSaved,
}: {
  readonly preferences: NotificationPreferences;
  readonly view: PhonePreferencesViewModel;
  readonly saved: boolean;
  readonly onSaved: (saved: boolean) => void;
}): ReactElement {
  const { t } = useTranslation();
  const state = usePhoneForm(preferences);
  const { form } = state;
  const ids = useId();
  const problem = quietHoursProblem(form);
  const change = (next: Partial<PhoneForm>): void => {
    state.change(next);
    onSaved(false);
  };
  return (
    <form
      className="o-stack"
      aria-label={t('notifications.phone.title')}
      onSubmit={(event) => {
        event.preventDefault();
        onSaved(false);
        view.save(preferencesOf(form), (stored) => {
          state.adopt(stored);
          onSaved(true);
        });
      }}
    >
      <fieldset className="o-stack" disabled={view.saving}>
        <legend className="o-field-label">{t('notifications.phone.tell')}</legend>
        {PHONE_SWITCHES.map((name) => (
          <label key={name} className="o-inline">
            <input
              type="checkbox"
              checked={form[name]}
              onChange={() => {
                change({ [name]: !form[name] });
              }}
            />
            <span>{t(`notifications.phone.switch.${name}`)}</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="o-stack" disabled={view.saving}>
        <legend className="o-field-label">{t('notifications.phone.quiet.title')}</legend>
        <label className="o-inline">
          <input
            type="checkbox"
            checked={form.quiet}
            onChange={() => {
              change({ quiet: !form.quiet });
            }}
          />
          <span>{t('notifications.phone.quiet.on')}</span>
        </label>
        {form.quiet ? (
          <div className="o-inline">
            <label className="o-stack" htmlFor={`${ids}-start`}>
              <span className="o-field-label">{t('notifications.phone.quiet.start')}</span>
              <input
                id={`${ids}-start`}
                className="o-input"
                type="time"
                value={form.start}
                onChange={(event) => {
                  change({ start: clockOf(event.target.value) });
                }}
              />
            </label>
            <label className="o-stack" htmlFor={`${ids}-end`}>
              <span className="o-field-label">{t('notifications.phone.quiet.end')}</span>
              <input
                id={`${ids}-end`}
                className="o-input"
                type="time"
                value={form.end}
                onChange={(event) => {
                  change({ end: clockOf(event.target.value) });
                }}
              />
            </label>
            <label className="o-stack" htmlFor={`${ids}-zone`}>
              <span className="o-field-label">{t('notifications.phone.quiet.timeZone')}</span>
              <input
                id={`${ids}-zone`}
                className="o-input"
                value={form.timeZone}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => {
                  change({ timeZone: event.target.value });
                }}
              />
            </label>
          </div>
        ) : null}
        {problem === undefined ? null : (
          <p id={`${ids}-problem`} className="o-screen__lead" role="alert">
            {t(`notifications.phone.quiet.problem.${problem}`)}
          </p>
        )}
      </fieldset>
      {view.saveFailure === undefined ? null : (
        <Banner tone="danger" tag={t('notifications.errorTag')} live>
          <FailureText failure={view.saveFailure} />
        </Banner>
      )}
      {saved ? (
        <Banner tag={t('notifications.phone.savedTag')} live>
          {t('notifications.phone.saved')}
        </Banner>
      ) : null}
      <div className="o-inline">
        <Button
          type="submit"
          disabled={view.saving || problem !== undefined}
          {...(problem === undefined ? {} : { 'aria-describedby': `${ids}-problem` })}
        >
          {view.saving ? t('notifications.phone.saving') : t('notifications.phone.save')}
        </Button>
      </div>
    </form>
  );
}
