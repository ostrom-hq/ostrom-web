// SPDX-License-Identifier: Apache-2.0
import type { EnvironmentAssignment, EnvironmentExclusion, EnvironmentVariant } from '@gen/api/types.gen';
import { MEMBER_IDS } from '@/mocks/fixtures/organization';

const at = '2026-10-02T09:00:00.000Z';
const later = '2026-10-20T14:30:00.000Z';

/** Acme's variants: two for GITHUB_TOKEN (one shared, one per member), one for NPM_TOKEN, and two personal ones. */
const variants: EnvironmentVariant[] = [
  {
    id: 'env-1',
    variable: 'GITHUB_TOKEN',
    name: 'acme',
    binding: 'shared',
    hasValue: true,
    version: 2,
    createdAt: at,
    updatedAt: later,
  },
  {
    id: 'env-2',
    variable: 'GITHUB_TOKEN',
    name: 'own account',
    binding: 'perMember',
    hasValue: false,
    version: 1,
    createdAt: at,
    updatedAt: at,
  },
  {
    id: 'env-3',
    variable: 'NPM_TOKEN',
    name: 'registry',
    binding: 'shared',
    hasValue: true,
    version: 1,
    createdAt: at,
    updatedAt: at,
  },
  {
    id: 'env-4',
    variable: 'OPENROUTER_API_KEY',
    name: 'mine',
    binding: 'shared',
    owner: MEMBER_IDS.theo,
    hasValue: true,
    version: 1,
    createdAt: later,
    updatedAt: later,
  },
  // Samir declared it, then an administrator excluded him from the variable: it stays, unassigned.
  {
    id: 'env-5',
    variable: 'SENTRY_DSN',
    name: 'samir',
    binding: 'shared',
    owner: MEMBER_IDS.samir,
    hasValue: true,
    version: 1,
    createdAt: later,
    updatedAt: later,
  },
];

const assignments: EnvironmentAssignment[] = [
  {
    member: MEMBER_IDS.maya,
    variable: 'GITHUB_TOKEN',
    variantId: 'env-1',
    variantName: 'acme',
    version: 2,
    source: 'direct',
    personal: false,
    hasMemberValue: false,
    assignedAt: later,
  },
  {
    member: MEMBER_IDS.lena,
    variable: 'GITHUB_TOKEN',
    variantId: 'env-2',
    variantName: 'own account',
    version: 1,
    source: 'direct',
    personal: false,
    hasMemberValue: true,
    assignedAt: later,
  },
  {
    member: MEMBER_IDS.theo,
    variable: 'GITHUB_TOKEN',
    variantId: 'env-1',
    variantName: 'acme',
    version: 2,
    source: 'bulk',
    personal: false,
    hasMemberValue: false,
    assignedAt: later,
  },
  {
    member: MEMBER_IDS.theo,
    variable: 'OPENROUTER_API_KEY',
    variantId: 'env-4',
    variantName: 'mine',
    version: 1,
    source: 'direct',
    personal: true,
    hasMemberValue: false,
    assignedAt: later,
  },
];

const exclusions: EnvironmentExclusion[] = [{ member: MEMBER_IDS.samir, variable: 'SENTRY_DSN' }];

export function initialEnvironmentVariants(): EnvironmentVariant[] {
  return structuredClone(variants);
}

export function initialEnvironmentAssignments(): EnvironmentAssignment[] {
  return structuredClone(assignments);
}

export function initialEnvironmentExclusions(): EnvironmentExclusion[] {
  return structuredClone(exclusions);
}
