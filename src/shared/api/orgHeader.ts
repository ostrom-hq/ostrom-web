// SPDX-License-Identifier: AGPL-3.0-only

/** The header that names the organization a call acts in (decision B, 30/10 10:23). */
export const ORG_HEADER = 'Ostrom-Org';

/** The server's answer when a person with several organizations names none. */
export const ORG_REQUIRED = 'org_required';

/** Every call names the organization the console acts in, once there is one. */
export function withOrg(request: Request, orgId: string | undefined): Request {
  if (orgId !== undefined) request.headers.set(ORG_HEADER, orgId);
  return request;
}
