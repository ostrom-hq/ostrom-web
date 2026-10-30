// SPDX-License-Identifier: AGPL-3.0-only
import { nextStep } from './model';

const acme = { id: 'org-acme' };
const globex = { id: 'org-globex' };

describe('nextStep', () => {
  it('keeps a choice that is still one of the person’s', () => {
    expect(
      nextStep({ current: 'org-acme', owner: 'maya', login: 'maya', organizations: [acme, globex] }),
    ).toEqual({
      kind: 'keep',
    });
    expect(nextStep({ current: 'org-acme', owner: undefined, login: 'maya', organizations: [acme] })).toEqual(
      {
        kind: 'keep',
      },
    );
  });

  it('drops a choice another account made in this browser', () => {
    expect(nextStep({ current: 'org-acme', owner: 'lena', login: 'maya', organizations: [acme] })).toEqual({
      kind: 'forget',
    });
  });

  it('drops a choice that is no longer one of the person’s, and says so', () => {
    expect(nextStep({ current: 'org-left', owner: 'maya', login: 'maya', organizations: [acme] })).toEqual({
      kind: 'forget',
      reason: 'unknown',
    });
  });

  it('takes the only organization, asks about several, and changes nothing on an empty list', () => {
    expect(nextStep({ current: undefined, owner: undefined, login: 'maya', organizations: [acme] })).toEqual({
      kind: 'only',
      id: 'org-acme',
    });
    expect(
      nextStep({ current: undefined, owner: undefined, login: 'maya', organizations: [acme, globex] }),
    ).toEqual({
      kind: 'ask',
    });
    expect(nextStep({ current: undefined, owner: undefined, login: 'maya', organizations: [] })).toEqual({
      kind: 'keep',
    });
    expect(nextStep({ current: 'org-acme', owner: 'maya', login: 'maya', organizations: [] })).toEqual({
      kind: 'keep',
    });
  });
});
