// SPDX-License-Identifier: Apache-2.0
import type { InstanceAdmin, InstanceSettings, SaveInstanceSettingsRequest } from '@gen/api/types.gen';
import { isApiFailure } from '@/shared/api/ApiFailure';

/** What a person does with a write-only secret when the section is saved. */
export type SecretIntent =
  /** Leave the stored secret as it is: nothing is sent for it. */
  | { readonly kind: 'keep' }
  /** Replace it with what is typed; typing nothing keeps it. */
  | { readonly kind: 'replace'; readonly value: string }
  /** Take it away (`null` on the wire). */
  | { readonly kind: 'remove' };

/** What a person typed in a section's form: plain values and one intent per secret, by field name. */
export interface SectionDraft {
  readonly values: Readonly<Record<string, string>>;
  readonly secrets: Readonly<Record<string, SecretIntent>>;
}

/** The plain fields of a section, in display order. */
export function plainFields(settings: InstanceSettings): readonly string[] {
  return settings.fields.filter((field) => !field.secret).map((field) => field.name);
}

/** The secret fields of a section, in display order. */
export function secretFields(settings: InstanceSettings): readonly string[] {
  return settings.fields.filter((field) => field.secret).map((field) => field.name);
}

/** Whether the section's secret is set; never its value, which the server never returns. */
export function isConfigured(settings: InstanceSettings, name: string): boolean {
  return settings.secrets[name]?.configured === true;
}

/** The form as the stored section fills it: every plain value as stored, every secret kept. */
export function draftOf(settings: InstanceSettings): SectionDraft {
  return {
    values: Object.fromEntries(plainFields(settings).map((name) => [name, settings.values[name] ?? ''])),
    secrets: Object.fromEntries(secretFields(settings).map((name) => [name, { kind: 'keep' }])),
  };
}

/** The secrets the form changes: a replacement with nothing typed keeps the secret, as the server reads it. */
function secretsOf(draft: SectionDraft): Record<string, string | null> {
  const sent: Record<string, string | null> = {};
  for (const [name, intent] of Object.entries(draft.secrets)) {
    if (intent.kind === 'remove') sent[name] = null;
    else if (intent.kind === 'replace' && intent.value !== '') sent[name] = intent.value;
  }
  return sent;
}

/** The save the form makes: the version the person read, every plain field with a value, and only secrets changed. */
export function requestOf(settings: InstanceSettings, draft: SectionDraft): SaveInstanceSettingsRequest {
  return {
    version: settings.version,
    values: Object.fromEntries(Object.entries(draft.values).filter(([, value]) => value.trim() !== '')),
    secrets: secretsOf(draft),
  };
}

/** Whether the form differs from what is stored: a section nobody changed is not saved. */
export function isChanged(settings: InstanceSettings, draft: SectionDraft): boolean {
  const stored = settings.values;
  const plainChanged = Object.entries(draft.values).some(
    ([name, value]) => value.trim() !== (stored[name] ?? '').trim(),
  );
  return plainChanged || Object.keys(secretsOf(draft)).length > 0;
}

/** Someone saved the section since it was read (409 `settings_conflict`): the page asks to reload it. */
export function isSettingsConflict(failure: Error | undefined): boolean {
  return isApiFailure(failure) && failure.code === 'settings_conflict';
}

/** The last administrator cannot be removed (409 `last_instance_admin`). */
export function isLastAdmin(failure: Error | undefined): boolean {
  return isApiFailure(failure) && failure.code === 'last_instance_admin';
}

/** The administrators, oldest first as the server lists them, and who they are by name. */
export function adminName(admin: InstanceAdmin): string {
  return admin.login === undefined || admin.login === '' ? (admin.email ?? admin.userId) : admin.login;
}

/** A plain-text input value never goes past what the server reads (`values`: 4096 characters). */
export const VALUE_MAX = 4096;
/** A secret never goes past what the server reads (`secrets`: 16384 characters). */
export const SECRET_MAX = 16384;
