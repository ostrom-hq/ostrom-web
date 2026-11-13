// SPDX-License-Identifier: Apache-2.0
// The vendored contract, from the project root (Vite resolves a path that starts with a slash there).
import contract from '/contract/openapi.yaml?raw';
import { actsInOrganization, namesOrganization, ORG_HEADER, withOrg } from '@/shared/api/orgHeader';

/** Each path of the vendored contract, and whether it takes `Ostrom-Org`. */
function contractPaths(): { readonly path: string; readonly takesOrg: boolean }[] {
  const paths = contract.split('\npaths:\n')[1]?.split('\ncomponents:\n')[0] ?? '';
  return paths.split(/\n(?= {2}\/)/).flatMap((block) => {
    const path = /^ {2}(\/[^:]*):/.exec(block)?.[1];
    return path === undefined
      ? []
      : [{ path, takesOrg: block.includes('#/components/parameters/OstromOrg') }];
  });
}

describe('withOrg', () => {
  it('names the organization on a route that acts in one', () => {
    const request = withOrg(new Request('http://ostrom.test/api/v1/artifacts'), 'org-acme');
    expect(request.headers.get(ORG_HEADER)).toBe('org-acme');
  });

  it('sends no header before there is an organization, nor to a route that acts in none', () => {
    expect(
      withOrg(new Request('http://ostrom.test/api/v1/artifacts'), undefined).headers.has(ORG_HEADER),
    ).toBe(false);
    expect(
      withOrg(new Request('http://ostrom.test/api/v1/auth/me'), 'org-acme').headers.has(ORG_HEADER),
    ).toBe(false);
    expect(
      withOrg(new Request('http://ostrom.test/api/v1/me/organizations'), 'org-acme').headers.has(ORG_HEADER),
    ).toBe(false);
  });

  it('agrees with the contract on every route', () => {
    const paths = contractPaths();
    expect(paths.length).toBeGreaterThan(100);
    const disagreements = paths.filter(
      ({ path, takesOrg }) => actsInOrganization(path.replaceAll(/\{[^}]+\}/g, 'x')) !== takesOrg,
    );
    expect(disagreements).toEqual([]);
  });
});

describe('namesOrganization', () => {
  it('sees an organization named by the header or in the path, and none elsewhere', () => {
    const named = new Request('http://ostrom.test/api/v1/artifacts', {
      headers: { [ORG_HEADER]: 'org-acme' },
    });
    expect(namesOrganization(named)).toBe(true);
    expect(namesOrganization(new Request('http://ostrom.test/api/v1/orgs/acme'))).toBe(true);
    expect(namesOrganization(new Request('http://ostrom.test/api/v1/orgs/acme/members'))).toBe(true);
    expect(namesOrganization(new Request('http://ostrom.test/api/v1/orgs'))).toBe(false);
    expect(namesOrganization(new Request('http://ostrom.test/api/v1/artifacts'))).toBe(false);
  });
});
