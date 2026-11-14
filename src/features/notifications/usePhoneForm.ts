// SPDX-License-Identifier: Apache-2.0
import type { NotificationPreferences } from '@gen/api/types.gen';
import { useState } from 'react';
import { browserTimeZone, type PhoneForm, phoneFormOf, samePhoneForm } from './model';

export interface PhoneFormState {
  readonly form: PhoneForm;
  /** Whether the form holds edits not saved yet. */
  readonly dirty: boolean;
  readonly change: (next: Partial<PhoneForm>) => void;
  /** Starts over from what the server answered to this form's own save. */
  readonly adopt: (saved: NotificationPreferences) => void;
}

/**
 * The phone form, as the person edits it. Preferences read again in the background (another device changed them, the
 * window came back into focus) replace the form only while it holds no unsaved edit: what the person typed is never
 * dropped by a refetch.
 */
export function usePhoneForm(
  preferences: NotificationPreferences,
  timeZone: () => string = browserTimeZone,
): PhoneFormState {
  const [zone] = useState(timeZone);
  const [base, setBase] = useState(preferences);
  const [form, setForm] = useState(() => phoneFormOf(preferences, zone));
  const dirty = !samePhoneForm(form, phoneFormOf(base, zone));
  // Derived during render (React's "adjusting state when a prop changes"): no effect, no flash of the old values.
  if (preferences !== base && !dirty) {
    setBase(preferences);
    setForm(phoneFormOf(preferences, zone));
  }
  return {
    form,
    dirty,
    change: (next) => {
      setForm({ ...form, ...next });
    },
    adopt: (saved) => {
      setBase(saved);
      setForm(phoneFormOf(saved, zone));
    },
  };
}
