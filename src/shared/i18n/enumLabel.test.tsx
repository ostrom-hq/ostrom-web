// SPDX-License-Identifier: Apache-2.0
import { renderHook } from '@testing-library/react';
import '@/shared/i18n/i18n';
import { i18n } from '@/shared/i18n/i18n';
import { enumLabel, useEnumLabel } from '@/shared/i18n/enumLabel';

describe('enumLabel', () => {
  it('says a known value in the language shown', () => {
    expect(enumLabel(i18n, 'waits.status', 'open')).toBe(i18n.t('waits.status.open'));
  });

  it('shows a value this console does not know as the server wrote it (CS-04)', () => {
    expect(enumLabel(i18n, 'waits.status', 'paused_by_policy')).toBe('paused_by_policy');
  });

  it('does not take a branch of the wording for a label', () => {
    expect(enumLabel(i18n, 'waits', 'status')).toBe('status');
  });

  it('fills the placeholders of the wording, and leaves one it has no value for', () => {
    const wording = enumLabel(i18n, 'confirm.outcome.by', 'confirmed', { who: 'maya', when: ' now' });
    expect(wording).toContain('maya');
    expect(wording).not.toContain('{{who}}');
    expect(enumLabel(i18n, 'confirm.outcome.by', 'confirmed')).toContain('{{who}}');
  });

  it('reads the English wording where the language shown has none', async () => {
    i18n.addResourceBundle('de', 'translation', {}, true, true);
    await i18n.changeLanguage('de');
    expect(enumLabel(i18n, 'waits.status', 'open')).toBe(i18n.t('waits.status.open', { lng: 'en' }));
    await i18n.changeLanguage('en');
  });

  it('is bound to the language shown by the hook', () => {
    const { result } = renderHook(() => useEnumLabel());
    expect(result.current('waits.status', 'open')).toBe(i18n.t('waits.status.open'));
    expect(result.current('waits.status', 'novel')).toBe('novel');
  });
});
