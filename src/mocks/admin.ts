// SPDX-License-Identifier: Apache-2.0
import {
  handleAddInstanceAdmin,
  handleGetInstanceSettings,
  handleListInstanceAdmins,
  handleListInstanceSettings,
  handleRemoveInstanceAdmin,
  handleSaveInstanceSettings,
} from '@gen/api/msw.gen';
import type { InstanceAdmin, InstanceSettings } from '@gen/api/types.gen';
import { zAddInstanceAdminRequest, zSaveInstanceSettingsRequest } from '@gen/api/zod.gen';
import { type HttpHandler, HttpResponse } from 'msw';
import { readJson, refusal } from './http';

/** The instance's administrators and settings, as `admin` of ostrom-server keeps them. */
export interface AdminState {
  /** The demo person administers the instance: what `Me.instanceAdmin` says. */
  instanceAdmin: boolean;
  /** Oldest first, as the server lists them. */
  instanceAdmins: InstanceAdmin[];
  /** By section name, in name order. */
  instanceSettings: InstanceSettings[];
}

/** The verified addresses of the instance's accounts, by address: who an administrator can add. */
export const INSTANCE_ACCOUNTS: Readonly<
  Record<string, { readonly userId: string; readonly login: string }>
> = {
  'sam@acme.test': { userId: '6a4f1c2e-0b7d-4e55-9d31-2f8a0c5b7e11', login: 'sam' },
};

/** The demo person, first administrator of the instance through its setup link. */
export const DEMO_ADMIN_ID = '2b9c7d1e-4a3f-4c60-8e15-7d0a9b3c5f22';

export function initialInstanceAdmins(): InstanceAdmin[] {
  return [
    {
      userId: DEMO_ADMIN_ID,
      login: 'maya',
      email: 'maya@acme.test',
      source: 'setup',
      addedAt: '2026-10-01T09:00:00Z',
    },
  ];
}

/** Two sections: mail (one secret, set) and push (one secret, not set, never saved). */
export function initialInstanceSettings(): InstanceSettings[] {
  return [
    {
      section: 'mail',
      version: 2,
      values: { host: 'smtp.acme.test', from: 'ostrom@acme.test' },
      secrets: { password: { configured: true } },
      fields: [
        { name: 'host', secret: false, required: true },
        { name: 'from', secret: false, required: false },
        { name: 'password', secret: true, required: false },
      ],
      updatedAt: '2026-10-02T10:00:00Z',
      updatedBy: DEMO_ADMIN_ID,
      importedFromEnvironment: false,
    },
    {
      section: 'push',
      version: 0,
      values: {},
      secrets: { privateKey: { configured: false } },
      fields: [
        { name: 'keyId', secret: false, required: true },
        { name: 'privateKey', secret: true, required: true },
      ],
      importedFromEnvironment: true,
    },
  ];
}

const NOT_ADMIN = (): ReturnType<typeof refusal> =>
  refusal(403, 'instance_admin_required', 'Only a person who administers the instance does this.');

export function createAdminHandlers(state: () => AdminState, now: () => Date): HttpHandler[] {
  const sectionNamed = (name: string): InstanceSettings | undefined =>
    state().instanceSettings.find((section) => section.section === name);
  return [
    handleListInstanceAdmins(() =>
      state().instanceAdmin ? HttpResponse.json({ admins: state().instanceAdmins }) : NOT_ADMIN(),
    ),
    handleAddInstanceAdmin(async ({ request }) => {
      if (!state().instanceAdmin) return NOT_ADMIN();
      const body = zAddInstanceAdminRequest.safeParse(await readJson(request));
      if (!body.success) return refusal(400, 'invalid_request', 'An e-mail address is needed.');
      const account = INSTANCE_ACCOUNTS[body.data.email.toLowerCase()];
      // The same answer for an unknown and an unverified address.
      if (account === undefined)
        return refusal(404, 'account_not_found', 'No account of this instance has this verified address.');
      const admins = state().instanceAdmins;
      if (!admins.some((admin) => admin.userId === account.userId))
        state().instanceAdmins = [
          ...admins,
          {
            userId: account.userId,
            login: account.login,
            email: body.data.email.toLowerCase(),
            source: 'dashboard',
            addedAt: now().toISOString(),
            addedBy: DEMO_ADMIN_ID,
          },
        ];
      return HttpResponse.json({ admins: state().instanceAdmins });
    }),
    handleRemoveInstanceAdmin(({ params }) => {
      if (!state().instanceAdmin) return NOT_ADMIN();
      const admins = state().instanceAdmins;
      if (!admins.some((admin) => admin.userId === params.userId))
        return refusal(404, 'instance_admin_not_found', 'This person does not administer the instance.');
      if (admins.length === 1)
        return refusal(
          409,
          'last_instance_admin',
          'The last administrator of the instance is never removed.',
        );
      state().instanceAdmins = admins.filter((admin) => admin.userId !== params.userId);
      return new HttpResponse(null, { status: 204 });
    }),
    handleListInstanceSettings(() =>
      state().instanceAdmin ? HttpResponse.json({ sections: state().instanceSettings }) : NOT_ADMIN(),
    ),
    handleGetInstanceSettings(({ params }) => {
      if (!state().instanceAdmin) return NOT_ADMIN();
      const section = sectionNamed(params.section);
      return section === undefined
        ? refusal(404, 'settings_section_not_found', 'No such settings section.')
        : HttpResponse.json(section);
    }),
    handleSaveInstanceSettings(async ({ params, request }) => {
      if (!state().instanceAdmin) return NOT_ADMIN();
      const section = sectionNamed(params.section);
      if (section === undefined)
        return refusal(404, 'settings_section_not_found', 'No such settings section.');
      const body = zSaveInstanceSettingsRequest.safeParse(await readJson(request));
      if (!body.success) return refusal(400, 'invalid_settings', 'The settings are not valid.');
      if (body.data.version !== section.version)
        return refusal(409, 'settings_conflict', 'The settings were saved by someone else: reload them.');
      const plain = section.fields.filter((field) => !field.secret).map((field) => field.name);
      const secret = section.fields.filter((field) => field.secret).map((field) => field.name);
      const values = body.data.values ?? {};
      const secrets = body.data.secrets ?? {};
      // A field the section does not have is refused by name, never echoing a secret.
      const unknown = [...Object.keys(values), ...Object.keys(secrets)].find(
        (name) => !plain.includes(name) && !secret.includes(name),
      );
      if (unknown !== undefined)
        return refusal(400, 'invalid_settings', `${unknown}: this section has no such field.`);
      const saved: InstanceSettings = {
        ...section,
        version: section.version + 1,
        values: Object.fromEntries(Object.entries(values).filter(([, value]) => value !== '')),
        secrets: Object.fromEntries(
          secret.map((name) => {
            const sent = secrets[name];
            const was = section.secrets[name]?.configured === true;
            // Absent or empty keeps it, a value replaces it, null removes it.
            const configured = sent === null ? false : sent === undefined || sent === '' ? was : true;
            return [name, { configured }];
          }),
        ),
        updatedAt: now().toISOString(),
        updatedBy: DEMO_ADMIN_ID,
        importedFromEnvironment: false,
      };
      state().instanceSettings = state().instanceSettings.map((item) =>
        item.section === saved.section ? saved : item,
      );
      return HttpResponse.json(saved);
    }),
  ];
}
