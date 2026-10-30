// SPDX-License-Identifier: AGPL-3.0-only
import type { Member, Organization, Team } from '@gen/api/types.gen';

const organization: Organization = {
  id: '6f1c2a4e-8b3d-4e7a-9c5f-1d2e3f4a5b6c',
  name: 'Acme',
  avatarUrl: '',
  description: 'Billing and payments',
  connectedVia: 'github-app',
  createdAt: '2026-09-01T09:00:00.000Z',
};

/** Each member's id (`Member.id`): artifacts, relayed servers and imports name a member by it, never by login. */
export const MEMBER_IDS = {
  maya: '3d6f9a1e-2b4c-4d8e-9f0a-1b2c3d4e5f60',
  lena: '4e7a0b2f-3c5d-4e9f-8a1b-2c3d4e5f6071',
  samir: '5f8b1c3a-4d6e-4fa0-9b2c-3d4e5f607182',
  theo: '6a9c2d4b-5e7f-4ab1-8c3d-4e5f60718293',
  jo: '7bad3e5c-6f80-4bc2-9d4e-5f60718293a4',
} as const;

const members: Member[] = [
  { id: MEMBER_IDS.maya, login: 'maya', name: 'Maya Lind', avatarUrl: '', role: 'admin', teams: ['billing'] },
  { id: MEMBER_IDS.lena, login: 'lena', name: 'Lena Ortiz', avatarUrl: '', role: 'owner' },
  {
    id: MEMBER_IDS.samir,
    login: 'samir',
    name: 'Samir Haddad',
    avatarUrl: '',
    role: 'approver',
    teams: ['billing', 'release'],
  },
  {
    id: MEMBER_IDS.theo,
    login: 'theo',
    avatarUrl: '',
    role: 'member',
    email: 'theo@acme.dev',
    teams: ['billing'],
  },
  { id: MEMBER_IDS.jo, login: 'jo@acme.dev', avatarUrl: '', role: 'invited', email: 'jo@acme.dev' },
];

const teams: Team[] = [
  { slug: 'billing', name: 'Billing', members: ['maya', 'samir', 'theo'], repos: ['acme/billing-api'] },
  { slug: 'release', name: 'Release', members: ['samir'] },
];

export function initialOrganization(): Organization {
  return structuredClone(organization);
}

export function initialMembers(): Member[] {
  return structuredClone(members);
}

export function initialTeams(): Team[] {
  return structuredClone(teams);
}
