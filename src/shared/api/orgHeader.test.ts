// SPDX-License-Identifier: AGPL-3.0-only
import { ORG_HEADER, withOrg } from '@/shared/api/orgHeader';

describe('withOrg', () => {
  it('names the organization when there is one', () => {
    const request = withOrg(new Request('http://ostrom.test/api/v1/artifacts'), 'org-acme');
    expect(request.headers.get(ORG_HEADER)).toBe('org-acme');
  });

  it('sends no header before there is one: a person with one organization needs none', () => {
    const request = withOrg(new Request('http://ostrom.test/api/v1/artifacts'), undefined);
    expect(request.headers.has(ORG_HEADER)).toBe(false);
  });
});
