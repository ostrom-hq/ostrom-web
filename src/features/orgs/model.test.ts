// SPDX-License-Identifier: Apache-2.0
import { type OrgFacts, nextStep } from './model';

const acme = { id: 'org-acme' };
const globex = { id: 'org-globex' };
const maya: OrgFacts = { current: undefined, owner: undefined, login: 'maya', organizations: [] };

describe('nextStep', () => {
  it('keeps an organization that is still one of the person’s, chosen or taken alone', () => {
    expect(nextStep({ ...maya, current: 'org-acme', owner: 'maya', organizations: [acme, globex] })).toEqual({
      kind: 'keep',
    });
    // A second organization beside the one taken alone does not interrupt: it is in the picker next time.
    expect(nextStep({ ...maya, current: 'org-acme', organizations: [acme, globex] })).toEqual({
      kind: 'keep',
    });
  });

  it('drops a choice another account made in this browser', () => {
    expect(nextStep({ ...maya, current: 'org-acme', owner: 'lena', organizations: [acme] })).toEqual({
      kind: 'forget',
    });
  });

  it('drops a choice that is no longer the person’s and says so, and an organization taken alone quietly', () => {
    expect(nextStep({ ...maya, current: 'org-left', owner: 'maya', organizations: [acme] })).toEqual({
      kind: 'forget',
      reason: 'unknown',
    });
    expect(nextStep({ ...maya, current: 'org-left', organizations: [acme] })).toEqual({ kind: 'forget' });
  });

  it('takes the only organization, asks about several, and changes nothing on an empty list', () => {
    expect(nextStep({ ...maya, organizations: [acme] })).toEqual({ kind: 'only', id: 'org-acme' });
    expect(nextStep({ ...maya, organizations: [acme, globex] })).toEqual({ kind: 'ask' });
    expect(nextStep(maya)).toEqual({ kind: 'keep' });
    expect(nextStep({ ...maya, current: 'org-acme', owner: 'maya' })).toEqual({ kind: 'keep' });
  });
});
