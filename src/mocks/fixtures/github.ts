// SPDX-License-Identifier: AGPL-3.0-only
import type { GitHubLink, Repo } from '@gen/api/types.gen';
import { MEMBER_IDS } from './organization';

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

/** The GitHub links of Acme's members: Theo's works, Lena's needs reconnecting, nobody else linked. */
export function initialGithubLinks(): GitHubLink[] {
  return [
    {
      memberId: MEMBER_IDS.theo,
      state: 'linked',
      appConfigured: true,
      login: 'theo-dev',
      userId: 4242,
      linkedAt: '2026-10-20T09:00:00Z',
      refreshedAt: '2026-10-30T07:00:00Z',
      accessExpiresAt: '2026-10-30T15:00:00Z',
    },
    { memberId: MEMBER_IDS.lena, state: 'reconnect_required', appConfigured: true, login: 'lena-o' },
  ];
}
