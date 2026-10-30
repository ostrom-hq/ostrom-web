// SPDX-License-Identifier: AGPL-3.0-only
import { type OrgFacts, nextStep } from './model';

const acme = { id: 'org-acme' };
const globex = { id: 'org-globex' };
const maya: OrgFacts = {
  current: undefined,
  owner: undefined,
  chosen: false,
  login: 'maya',
  organizations: [],
};

describe('nextStep', () => {
  it('keeps a choice that is still one of the person’s', () => {
    const chosen = { ...maya, current: 'org-acme', owner: 'maya', chosen: true };
    expect(nextStep({ ...chosen, organizations: [acme, globex] })).toEqual({ kind: 'keep' });
    expect(nextStep({ ...chosen, owner: undefined, organizations: [acme] })).toEqual({ kind: 'keep' });
  });

  it('keeps the only organization, and asks once a second one appears', () => {
    const only = { ...maya, current: 'org-acme', owner: 'maya' };
    expect(nextStep({ ...only, organizations: [acme] })).toEqual({ kind: 'keep' });
    expect(nextStep({ ...only, organizations: [acme, globex] })).toEqual({ kind: 'ask' });
  });

  it('drops a choice another account made in this browser', () => {
    expect(
      nextStep({ ...maya, current: 'org-acme', owner: 'lena', chosen: true, organizations: [acme] }),
    ).toEqual({
      kind: 'forget',
    });
  });

  it('drops a choice that is no longer the person’s, and says so', () => {
    expect(
      nextStep({ ...maya, current: 'org-left', owner: 'maya', chosen: true, organizations: [acme] }),
    ).toEqual({
      kind: 'forget',
      reason: 'unknown',
    });
  });

  it('takes the only organization, asks about several, and changes nothing on an empty list', () => {
    expect(nextStep({ ...maya, organizations: [acme] })).toEqual({ kind: 'only', id: 'org-acme' });
    expect(nextStep({ ...maya, organizations: [acme, globex] })).toEqual({ kind: 'ask' });
    expect(nextStep(maya)).toEqual({ kind: 'keep' });
    expect(nextStep({ ...maya, current: 'org-acme', owner: 'maya', chosen: true })).toEqual({ kind: 'keep' });
  });
});
