// SPDX-License-Identifier: AGPL-3.0-only
import type { ErrorDetail, GovernanceConfirmation, GovernanceConfirmationPerson } from '@gen/api/types.gen';
import { MEMBER_IDS } from '@/mocks/fixtures/organization';

/** A confirmation waits 15 minutes for its answer (core#57). */
export const CONFIRMATION_MS = 15 * 60_000;

export const MAYA: GovernanceConfirmationPerson = {
  memberId: MEMBER_IDS.maya,
  login: 'maya',
  name: 'Maya Lind',
};
const LENA: GovernanceConfirmationPerson = { memberId: MEMBER_IDS.lena, login: 'lena' };

const at = (ms: number): string => new Date(ms).toISOString();

// A member as the server shows them in a confirmation (`OrgsGovernanceChange`): the membership, the login and the
// role, never the name nor the address.
const THEO = { id: MEMBER_IDS.theo, login: 'theo', role: 'member' };

/**
 * The demo's governance confirmations, opened `now` (ms) by `ostrom` with a CLI token: three waiting (a policy, a new
 * rule, a deleted workflow), two that fail once confirmed (stale, refused by the write), and one of each end.
 */
export function initialConfirmations(now: number): GovernanceConfirmation[] {
  const open = { createdAt: at(now - 60_000), expiresAt: at(now - 60_000 + CONFIRMATION_MS) };
  const answered = { createdAt: at(now - 3_600_000), expiresAt: at(now - 3_600_000 + CONFIRMATION_MS) };
  return [
    {
      id: 'gc-self-approval',
      kind: 'gates.policy',
      status: 'pending',
      method: 'PUT',
      path: '/api/v1/gates/policy',
      scope: 'gates:policy',
      summary: 'Never let the person who asks approve their own request',
      before: { selfApproval: 'sole-approver' },
      after: { selfApproval: 'never' },
      requestedBy: MAYA,
      credential: 'admin',
      ...open,
    },
    {
      id: 'gc-rule-new',
      kind: 'rules.create',
      status: 'pending',
      method: 'POST',
      path: '/api/v1/rules',
      scope: 'policy:write',
      summary: 'Add the rule “Ask before a force push”',
      before: null,
      after: {
        statement: 'Ask before a force push.',
        output: 'gate',
        strength: 'required',
        scope: ['acme/web'],
      },
      requestedBy: LENA,
      credential: 'device',
      ...open,
    },
    {
      id: 'gc-workflow-drop',
      kind: 'workflows.delete',
      status: 'pending',
      method: 'DELETE',
      path: '/api/v1/workflows/wf-release',
      scope: 'harness:write',
      summary: 'Delete the workflow “Release”',
      before: { id: 'wf-release', name: 'Release', steps: 4 },
      after: null,
      requestedBy: { memberId: MEMBER_IDS.jo },
      credential: 'admin',
      ...open,
    },
    {
      id: 'gc-models-stale',
      kind: 'models.policy',
      status: 'pending',
      method: 'PUT',
      path: '/api/v1/policy/models',
      scope: 'policy:write',
      summary: 'Allow only Claude models',
      before: { allowed: ['claude-', 'gpt-5'], default: 'claude-sonnet-4-5' },
      after: { allowed: ['claude-'], default: 'claude-sonnet-4-5' },
      requestedBy: MAYA,
      credential: 'admin',
      ...open,
    },
    {
      id: 'gc-rules-bulk',
      kind: 'rules.bulk',
      status: 'pending',
      method: 'POST',
      path: '/api/v1/rules/bulk',
      scope: 'policy:write',
      summary: 'Accept 3 rules',
      before: [{ id: 'R-3', status: 'proposed' }],
      after: [{ id: 'R-3', status: 'accepted' }],
      requestedBy: MAYA,
      credential: 'device',
      ...open,
    },
    {
      id: 'gc-rule-edit',
      kind: 'rules.update',
      status: 'confirmed',
      method: 'PATCH',
      path: '/api/v1/rules/R-7',
      scope: 'policy:write',
      summary: 'Make “Migrations run only from the release pipeline” recommended',
      before: { strength: 'required', status: 'accepted' },
      after: { strength: 'recommended', status: 'accepted' },
      requestedBy: MAYA,
      credential: 'admin',
      answeredBy: MAYA,
      answeredAt: at(now - 3_500_000),
      result: { id: 'R-7', strength: 'recommended', status: 'accepted' },
      ...answered,
    },
    {
      id: 'gc-workflow-new',
      kind: 'workflows.create',
      status: 'refused',
      method: 'POST',
      path: '/api/v1/workflows',
      scope: 'harness:write',
      summary: 'Add the workflow “Skip review”',
      before: null,
      after: { name: 'Skip review', steps: 1 },
      requestedBy: LENA,
      credential: 'device',
      answeredBy: MAYA,
      answeredAt: at(now - 3_400_000),
      ...answered,
    },
    {
      id: 'gc-rule-gone',
      kind: 'rules.delete',
      status: 'pending',
      method: 'DELETE',
      path: '/api/v1/rules/R-9',
      scope: 'policy:write',
      summary: 'Delete the rule “Commit messages are in English”',
      before: { id: 'R-9' },
      after: null,
      requestedBy: MAYA,
      credential: 'device',
      ...answered,
    },
    {
      id: 'gc-workflow-save',
      kind: 'workflows.save',
      status: 'failed',
      method: 'PUT',
      path: '/api/v1/workflows/wf-migrations',
      scope: 'harness:write',
      summary: 'Change the workflow “Migrations”',
      before: { version: 3 },
      after: { version: 4 },
      requestedBy: MAYA,
      credential: 'admin',
      answeredBy: MAYA,
      answeredAt: at(now - 3_300_000),
      error: { type: 'version_conflict', message: 'The workflow changed since version 3.' },
      ...answered,
    },
    // The organization's people, written with a person's API token (`ostrom invite`, `ostrom members`): F1 of the
    // second core audit holds them for a confirmation too.
    {
      id: 'gc-member-role',
      kind: 'members.role',
      status: 'pending',
      method: 'PATCH',
      path: '/api/v1/orgs/acme/members/theo',
      scope: 'orgs:write',
      summary: 'Make theo an admin of Acme',
      before: THEO,
      after: { ...THEO, role: 'admin' },
      requestedBy: LENA,
      credential: 'device',
      ...open,
    },
    {
      id: 'gc-member-remove',
      kind: 'members.remove',
      status: 'pending',
      method: 'DELETE',
      path: '/api/v1/orgs/acme/members/theo',
      scope: 'orgs:write',
      summary: 'Remove theo from Acme',
      before: THEO,
      after: null,
      requestedBy: LENA,
      credential: 'device',
      ...open,
    },
    {
      id: 'gc-member-invite',
      kind: 'members.invite',
      status: 'pending',
      method: 'POST',
      path: '/api/v1/orgs/acme/members/invites',
      scope: 'orgs:write',
      summary: 'Invite 2 people to Acme',
      before: null,
      // The invitations as the write sent them, as the server shows them: a list, not the body around it.
      after: [
        { email: 'ana@acme.dev', role: 'approver' },
        { email: 'bartholomew.oyelaran-whitfield+ostrom-invitations@platform-engineering.acme.dev' },
      ],
      requestedBy: LENA,
      credential: 'device',
      ...open,
    },
    {
      id: 'gc-member-link',
      kind: 'members.link',
      status: 'pending',
      method: 'POST',
      path: '/api/v1/orgs/acme/invitations/links',
      scope: 'orgs:write',
      summary: 'Create an invitation link to Acme',
      before: null,
      after: { role: 'member', maxUses: 5 },
      requestedBy: LENA,
      credential: 'device',
      ...open,
    },
  ];
}

/** Confirmed, `gc-rules-bulk`'s write is refused: a rule it names changed meanwhile. */
export function initialRefusedWrites(): Record<string, ErrorDetail> {
  return {
    'gc-rules-bulk': { type: 'version_conflict', message: 'Rule R-3 changed since it was read.' },
  };
}
