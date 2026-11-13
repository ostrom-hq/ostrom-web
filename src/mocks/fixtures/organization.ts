// SPDX-License-Identifier: AGPL-3.0-only
import type { Member, Organization, OrgMember, Team } from '@gen/api/types.gen';
import type { MockInvitation } from '@/mocks/orgs';

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
  ines: '8cbe4f6d-7091-4cd3-8e5f-60718293a4b5',
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
  { id: MEMBER_IDS.jo, login: 'jo', avatarUrl: '', role: 'invited' },
];

const teams: Team[] = [
  { slug: 'billing', name: 'Billing', members: ['maya', 'samir', 'theo'], repos: ['acme/billing-api'] },
  { slug: 'release', name: 'Release', members: ['samir'] },
];

export function initialOrganization(): Organization {
  return structuredClone(organization);
}

/** A second organization the demo person can belong to: with it, the console must say which one it acts in. */
export function otherOrganization(): Organization {
  return {
    ...structuredClone(organization),
    id: '8c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
    name: 'Globex',
    description: 'Imports and exports',
  };
}

export function initialMembers(): Member[] {
  return structuredClone(members);
}

export function initialTeams(): Team[] {
  return structuredClone(teams);
}

/** Acme's members as `/orgs/{org}/members` serves them: with their id, an empty name or address when there is none. */
export function initialOrgMembers(): OrgMember[] {
  const joined = '2026-09-01T09:00:00.000Z';
  return [
    {
      id: MEMBER_IDS.lena,
      login: 'lena',
      name: 'Lena Ortiz',
      avatarUrl: '',
      email: 'lena@acme.dev',
      role: 'owner',
      joinedAt: joined,
    },
    {
      id: MEMBER_IDS.maya,
      login: 'maya',
      name: 'Maya Lind',
      avatarUrl: '',
      email: 'maya@acme.dev',
      role: 'admin',
      joinedAt: joined,
    },
    {
      id: MEMBER_IDS.samir,
      login: 'samir',
      name: 'Samir Haddad',
      avatarUrl: '',
      email: null,
      role: 'approver',
      joinedAt: joined,
    },
    {
      id: MEMBER_IDS.theo,
      login: 'theo',
      name: '',
      avatarUrl: '',
      email: 'theo@acme.dev',
      role: 'member',
      joinedAt: joined,
    },
    {
      id: MEMBER_IDS.ines,
      login: 'ines',
      name: 'Inès Morel',
      avatarUrl: '',
      email: 'ines@acme.dev',
      role: 'billing',
      joinedAt: joined,
    },
  ];
}

/** An organization the demo person is not in yet: the demo invitation link leads there. */
export function invitedOrganization(): Organization {
  return {
    id: '9d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a',
    name: 'Initech',
    avatarUrl: '',
    connectedVia: 'github-app',
    createdAt: '2026-08-12T09:00:00.000Z',
  };
}

/** The token of the demo invitation link: `/invite#token=inv_demo` joins Initech. */
export const DEMO_INVITATION_TOKEN = 'inv_demo';

/** The token of the demo setup link: `/setup#token=osb_demo` is the first owner's link (used once, then 404). */
export const DEMO_SETUP_TOKEN = 'osb_demo';

/** Acme's waiting invitation to jo, and the link to Initech, valid for a year of demos. */
export function initialInvitations(): MockInvitation[] {
  return [
    {
      id: 'inv-jo',
      orgId: organization.id,
      token: 'inv_jo',
      email: 'jo@acme.dev',
      role: 'member',
      createdAt: '2026-10-28T09:00:00.000Z',
      expiresAt: '2027-10-28T09:00:00.000Z',
      maxUses: 1,
      uses: 0,
    },
    {
      id: 'inv-initech',
      orgId: invitedOrganization().id,
      token: DEMO_INVITATION_TOKEN,
      email: null,
      role: 'approver',
      createdAt: '2026-10-29T09:00:00.000Z',
      expiresAt: '2027-10-29T09:00:00.000Z',
      maxUses: 5,
      uses: 1,
    },
  ];
}
