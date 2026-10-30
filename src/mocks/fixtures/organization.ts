// SPDX-License-Identifier: AGPL-3.0-only
import type { Member, Organization, Team } from '@gen/api/types.gen';

const organization: Organization = {
  id: 'org-acme',
  name: 'Acme',
  avatarUrl: '',
  description: 'Billing and payments',
  connectedVia: 'github-app',
  createdAt: '2026-09-01T09:00:00.000Z',
};

const members: Member[] = [
  { login: 'maya', name: 'Maya Lind', avatarUrl: '', role: 'admin', teams: ['billing'] },
  { login: 'lena', name: 'Lena Ortiz', avatarUrl: '', role: 'owner' },
  { login: 'samir', name: 'Samir Haddad', avatarUrl: '', role: 'approver', teams: ['billing', 'release'] },
  { login: 'theo', avatarUrl: '', role: 'member', email: 'theo@acme.dev', teams: ['billing'] },
  { login: 'jo@acme.dev', avatarUrl: '', role: 'invited', email: 'jo@acme.dev' },
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
