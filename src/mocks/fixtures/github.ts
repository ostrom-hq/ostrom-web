// SPDX-License-Identifier: AGPL-3.0-only
import type { Repo } from '@gen/api/types.gen';

/** The repositories Acme gave the GitHub App. */
export function initialRepos(): Repo[] {
  return [
    {
      name: 'api',
      description: 'The billing and accounts API',
      language: 'Kotlin',
      defaultBranch: 'main',
      archived: false,
      pushedAt: '2026-10-29T17:42:00Z',
      owners: ['backend'],
    },
    {
      name: 'web',
      description: 'The customer dashboard',
      language: 'TypeScript',
      defaultBranch: 'main',
      archived: false,
      pushedAt: '2026-10-30T08:15:00Z',
      owners: ['frontend'],
    },
    {
      name: 'infra',
      description: 'Terraform and the Kubernetes charts',
      language: 'HCL',
      defaultBranch: 'main',
      archived: false,
      pushedAt: '2026-10-27T10:03:00Z',
      owners: ['platform'],
    },
    {
      name: 'mobile',
      language: 'TypeScript',
      defaultBranch: 'develop',
      archived: false,
      pushedAt: '2026-10-24T14:20:00Z',
      owners: [],
    },
    {
      name: 'docs',
      description: 'The public documentation',
      language: 'MDX',
      defaultBranch: 'main',
      archived: false,
    },
    {
      name: 'legacy-billing',
      description: 'The billing service before the API',
      language: 'Java',
      defaultBranch: 'master',
      archived: true,
      pushedAt: '2025-03-02T09:00:00Z',
    },
  ];
}
