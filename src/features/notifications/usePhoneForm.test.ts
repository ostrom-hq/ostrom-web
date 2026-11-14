// SPDX-License-Identifier: Apache-2.0
import type { NotificationPreferences } from '@gen/api/types.gen';
import { act, renderHook } from '@testing-library/react';
import { usePhoneForm } from './usePhoneForm';

const first: NotificationPreferences = { requests: true, decisions: true, spending: false };
const elsewhere: NotificationPreferences = { requests: false, decisions: true, spending: true };

function render() {
  return renderHook(({ preferences }) => usePhoneForm(preferences, () => 'Europe/Paris'), {
    initialProps: { preferences: first },
  });
}

describe('the phone form', () => {
  it('starts from the preferences, in the browser’s zone by default', () => {
    const { result } = renderHook(() => usePhoneForm(first));
    expect(result.current.form.requests).toBe(true);
    expect(result.current.form.timeZone).not.toBe('');
    expect(result.current.dirty).toBe(false);
  });

  it('follows preferences read again while it holds no edit', () => {
    const view = render();
    view.rerender({ preferences: elsewhere });
    expect(view.result.current.form).toMatchObject({ requests: false, spending: true });
    expect(view.result.current.dirty).toBe(false);
  });

  it('keeps the person’s edits when preferences are read again, until they are saved', () => {
    const view = render();
    act(() => {
      view.result.current.change({ decisions: false });
    });
    expect(view.result.current.dirty).toBe(true);
    view.rerender({ preferences: elsewhere });
    expect(view.result.current.form).toMatchObject({ requests: true, decisions: false, spending: false });
    const saved: NotificationPreferences = { requests: true, decisions: false, spending: false };
    act(() => {
      view.result.current.adopt(saved);
    });
    view.rerender({ preferences: saved });
    expect(view.result.current.dirty).toBe(false);
    expect(view.result.current.form.decisions).toBe(false);
  });
});
