// SPDX-License-Identifier: Apache-2.0
import { zGetGovernanceConfirmationResponse } from '@gen/api/zod.gen';

// What ostrom-server sends since server#332 for a write a person's API token asked (`Token.kind` `personal`): the
// console reads it as the contract says, never as an answer outside the contract.
const ASKED_WITH_AN_API_TOKEN: unknown = {
  id: 'gc-api-token',
  kind: 'members.invite',
  status: 'pending',
  method: 'POST',
  path: '/api/v1/orgs/o-1/members/invites',
  scope: 'orgs:write',
  summary: 'Invite newcomer@example.com',
  before: null,
  after: { invites: [{ email: 'newcomer@example.com', role: 'approver' }] },
  requestedBy: { memberId: 'm-1', login: 'ivy', name: 'Ivy' },
  credential: 'api_token',
  token: { id: 't-1', name: 'journey inviter' },
  createdAt: '2026-11-05T02:00:00Z',
  expiresAt: '2026-11-05T02:15:00Z',
};

describe('a confirmation asked with a personal API token', () => {
  it('is read as the contract says, with the token that asked', () => {
    const read = zGetGovernanceConfirmationResponse.safeParse(ASKED_WITH_AN_API_TOKEN);
    expect(read.error?.issues).toBeUndefined();
    expect(read.data?.credential).toBe('api_token');
  });
});
