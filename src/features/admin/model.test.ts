// SPDX-License-Identifier: Apache-2.0
import type { InstanceSettings } from '@gen/api/types.gen';
import { ApiFailure } from '@/shared/api/ApiFailure';
import {
  adminName,
  draftOf,
  isChanged,
  isConfigured,
  isLastAdmin,
  intentOf,
  isSettingsConflict,
  plainFields,
  requestOf,
  secretFields,
  valueOf,
} from './model';

function mail(): InstanceSettings {
  return {
    section: 'mail',
    version: 2,
    values: { host: 'smtp.acme.test', from: 'ostrom@acme.test' },
    secrets: { password: { configured: true } },
    fields: [
      { name: 'host', secret: false, required: true },
      { name: 'from', secret: false, required: true },
      { name: 'password', secret: true, required: false },
    ],
    importedFromEnvironment: false,
  };
}

describe('a settings section', () => {
  it('splits its fields into plain ones and secrets, and says which secrets are set', () => {
    expect(plainFields(mail())).toEqual(['host', 'from']);
    expect(secretFields(mail())).toEqual(['password']);
    expect(isConfigured(mail(), 'password')).toBe(true);
    expect(isConfigured(mail(), 'missing')).toBe(false);
  });

  it('fills its form from what is stored, every secret kept', () => {
    expect(draftOf(mail())).toEqual({
      values: { host: 'smtp.acme.test', from: 'ostrom@acme.test' },
      secrets: { password: { kind: 'keep' } },
    });
    // A plain field never set starts empty.
    expect(draftOf({ ...mail(), values: {} }).values).toEqual({ host: '', from: '' });
  });

  it('saves the version read, the plain fields with a value, and only the secrets that change', () => {
    const settings = mail();
    const draft = draftOf(settings);
    expect(requestOf(settings, draft)).toEqual({
      version: 2,
      values: { host: 'smtp.acme.test', from: 'ostrom@acme.test' },
      secrets: {},
    });
    expect(
      requestOf(settings, {
        values: { host: ' ', from: 'a@b.test' },
        secrets: { password: { kind: 'replace', value: 'hunter2' } },
      }),
    ).toEqual({ version: 2, values: { from: 'a@b.test' }, secrets: { password: 'hunter2' } });
    expect(requestOf(settings, { ...draft, secrets: { password: { kind: 'remove' } } }).secrets).toEqual({
      password: null,
    });
    // A replacement with nothing typed keeps the secret.
    expect(
      requestOf(settings, { ...draft, secrets: { password: { kind: 'replace', value: '' } } }).secrets,
    ).toEqual({});
  });

  it('is changed by a plain value or a secret, and by nothing else', () => {
    const settings = mail();
    const draft = draftOf(settings);
    expect(isChanged(settings, draft)).toBe(false);
    expect(isChanged(settings, { ...draft, values: { ...draft.values, host: 'mx.acme.test' } })).toBe(true);
    expect(isChanged(settings, { ...draft, values: { ...draft.values, host: 'smtp.acme.test ' } })).toBe(
      false,
    );
    expect(isChanged(settings, { ...draft, secrets: { password: { kind: 'remove' } } })).toBe(true);
    expect(isChanged(settings, { ...draft, secrets: { password: { kind: 'replace', value: '' } } })).toBe(
      false,
    );
    // A field the section never had a value for.
    expect(isChanged({ ...settings, values: {} }, { ...draft, values: { host: '', from: '' } })).toBe(false);
  });
});

describe('the form’s fallbacks', () => {
  it('keeps a secret nothing was chosen for, and leaves an untyped field empty', () => {
    const draft = draftOf(mail());
    expect(intentOf(draft, 'password')).toEqual({ kind: 'keep' });
    expect(intentOf(draft, 'other')).toEqual({ kind: 'keep' });
    expect(valueOf(draft, 'host')).toBe('smtp.acme.test');
    expect(valueOf(draft, 'other')).toBe('');
  });
});

describe('what a refused write says', () => {
  const conflict = new ApiFailure('conflict', 'x', 409, undefined, 'settings_conflict');

  it('tells a settings conflict from any other failure', () => {
    expect(isSettingsConflict(conflict)).toBe(true);
    expect(isSettingsConflict(new ApiFailure('conflict', 'x', 409, undefined, 'other'))).toBe(false);
    expect(isSettingsConflict(new Error('x'))).toBe(false);
    expect(isSettingsConflict(undefined)).toBe(false);
  });

  it('tells the last administrator from any other failure', () => {
    expect(isLastAdmin(new ApiFailure('conflict', 'x', 409, undefined, 'last_instance_admin'))).toBe(true);
    expect(isLastAdmin(conflict)).toBe(false);
    expect(isLastAdmin(undefined)).toBe(false);
  });
});

describe('an administrator', () => {
  const base = { userId: 'u1', source: 'setup', addedAt: '2026-10-01T09:00:00Z' };

  it('is named by login, else by address, else by id', () => {
    expect(adminName({ ...base, login: 'maya', email: 'm@a.test' })).toBe('maya');
    expect(adminName({ ...base, login: '', email: 'm@a.test' })).toBe('m@a.test');
    expect(adminName({ ...base, email: 'm@a.test' })).toBe('m@a.test');
    expect(adminName(base)).toBe('u1');
  });
});
