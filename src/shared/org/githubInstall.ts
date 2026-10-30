// SPDX-License-Identifier: AGPL-3.0-only
import { apiUrl } from '@/shared/api/apiClient';

/**
 * Where the browser goes to install the GitHub App on an organization. A navigation sends no `Ostrom-Org` header,
 * so the organization rides in the query (`?org=`), which the server checks as it would the header; the session
 * cookie stays the proof of who asks.
 */
export function githubInstallUrl(org: string): string {
  return `${apiUrl('/api/v1/github/app/install/start')}?${new URLSearchParams({ org }).toString()}`;
}
