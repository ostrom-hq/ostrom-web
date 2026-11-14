// SPDX-License-Identifier: Apache-2.0

/** The header that names the organization a call acts in (decision B, 30/10 10:23). */
export const ORG_HEADER = 'Ostrom-Org';

/** The server's answer when a person with several organizations names none. */
export const ORG_REQUIRED = 'org_required';

/**
 * The routes under `/api/v1` that act in no organization: the contract gives them no `Ostrom-Org`
 * (`orgHeader.test.ts` checks this list against the vendored contract).
 */
const ORG_FREE: readonly RegExp[] = [
  /^\/api\/v1\/auth\//,
  /^\/api\/v1\/orgs(?:\/|$)/,
  /^\/api\/v1\/invitations\/(?:preview|accept)$/,
  /^\/api\/v1\/tokens(?:\/|$)/,
  // The instance's own administrators and settings: for a person who administers the instance, in no organization.
  /^\/api\/v1\/admin\//,
  /^\/api\/v1\/me\/(?:organizations|notifications)$/,
  /^\/api\/v1\/(?:health|capabilities|instance(?:\/keys)?|receipts\/keys|billing\/stripe\/webhook)$/,
  // A link a person follows from GitHub or from a wait's message: the secret in it says the organization.
  /^\/api\/v1\/github\/link\/callback$/,
  /^\/api\/v1\/waits\/[^/]+\/event$/,
  /^\/api\/v1\/github\/app\/(?:manifest\/(?:start|callback)|install\/callback)$/,
  /^\/api\/v1\/automations\/[^/]+(?:\/v\/[^/]+)?\/trigger$/,
  // The cloud runtime and its clusters are the instance's, for a person who administers it.
  /^\/api\/v1\/cloud\/(?:runtime|clusters(?:\/[^/]+)?)$/,
  // An event wait's webhook: the secret is the proof (no sign-in); GitHub's link callback names the person's own link.
  /^\/api\/v1\/waits\/[^/]+\/event$/,
  /^\/api\/v1\/github\/link\/callback$/,
  // A launch's own agent token ends it (AUDIT-SECU-RUNNER-2 R2b) and reports that no hook ran: the token says the
  // launch, no organization is named.
  /^\/api\/v1\/launches\/[^/]+(?:\/hooks-missing)?$/,
  /^\/api\/v1\/cloud\/runner\/terminal$/,
  // The instance's own administration, its cloud runtime and clusters, and a pinned version of an automation's webhook
  // (the secret in its address says the organization): the contract gives them no `Ostrom-Org`.
  /^\/api\/v1\/admin\/(?:instance-admins|settings)(?:\/[^/]+)?$/,
  /^\/api\/v1\/cloud\/(?:runtime|clusters(?:\/[^/]+)?)$/,
  /^\/api\/v1\/automations\/[^/]+\/v\/[^/]+\/trigger$/,
  // The GitHub App the instance is wired to, entered by its administrator: the instance's, in no organization.
  /^\/api\/v1\/github\/app\/configuration$/,
];

/** Whether a route acts in the caller's organization, and so takes `Ostrom-Org`. */
export function actsInOrganization(pathname: string): boolean {
  return pathname.startsWith('/api/v1/') && !ORG_FREE.some((route) => route.test(pathname));
}

/**
 * A call that acts in an organization names the one the console acts in, once there is one. The others are never
 * given it here: the person's list must answer whatever was chosen before, so a stale choice can be dropped, and
 * `/auth/me` takes it only as an option, named by its caller (`meInOrgOptions`) for the member there.
 */
export function withOrg(request: Request, orgId: string | undefined): Request {
  if (orgId !== undefined && actsInOrganization(new URL(request.url).pathname)) {
    request.headers.set(ORG_HEADER, orgId);
  }
  return request;
}

/** A route that names its organization in the path: `/api/v1/orgs/{org}` and everything under it. */
const ORG_IN_PATH = /^\/api\/v1\/orgs\/[^/]+(?:\/|$)/;

/**
 * Whether a call named an organization, by `Ostrom-Org` or in its path: a 404 then may mean the person left it, and
 * their list is read again.
 */
export function namesOrganization(request: Request): boolean {
  return request.headers.has(ORG_HEADER) || ORG_IN_PATH.test(new URL(request.url).pathname);
}
