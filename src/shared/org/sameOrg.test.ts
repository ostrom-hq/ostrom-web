// SPDX-License-Identifier: AGPL-3.0-only
import { useOrgStore } from '@/shared/org/orgStore';
import { sentInOrg, whenSameOrg } from '@/shared/org/sameOrg';

describe('whenSameOrg', () => {
  afterEach(() => {
    useOrgStore.setState({ generation: 0 });
  });

  it('writes an answer while its organization is still on screen', () => {
    const sent = sentInOrg();
    const write = vi.fn();
    whenSameOrg(sent, write);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('leaves out an answer from an organization switched away from, or of no known one', () => {
    const sent = sentInOrg();
    useOrgStore.setState({ generation: sent + 1 });
    const write = vi.fn();
    whenSameOrg(sent, write);
    whenSameOrg(undefined, write);
    expect(write).not.toHaveBeenCalled();
  });
});
