// SPDX-License-Identifier: AGPL-3.0-only
import { otherOrganization } from '@/mocks/fixtures/organization';
import { resetMockDb } from '@/mocks/handlers';
import { createMockServer } from '@/mocks/node';

const { server, db } = createMockServer();
const globex = otherOrganization();

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  server.resetHandlers();
  resetMockDb(db);
});
afterAll(() => {
  server.close();
});

/** A plain fetch, without the console's client: the header is exactly what the test sends. */
async function get(path: string, org?: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`http://ostrom.test/api/v1${path}`, {
    headers: org === undefined ? {} : { 'Ostrom-Org': org },
  });
  return { status: response.status, body: await response.json() };
}

describe('mock organization of a call', () => {
  it('acts in the only organization when none is named, and says which', async () => {
    expect(await get('/auth/me')).toMatchObject({ status: 200, body: { organization: { name: 'Acme' } } });
    expect((await get('/org')).body).toMatchObject({ name: 'Acme' });
    expect((await get('/artifacts')).status).toBe(200);
  });

  it('lists the person’s organizations, without the header', async () => {
    db.otherOrganizations = [globex];
    expect((await get('/me/organizations')).body).toMatchObject({
      items: [{ name: 'Acme' }, { name: 'Globex' }],
    });
  });

  it('asks which organization when the person has several, on every route that acts in one, never on /me', async () => {
    db.otherOrganizations = [globex];
    for (const path of ['/org', '/artifacts', '/automations', '/secrets']) {
      expect(await get(path)).toEqual({
        status: 409,
        body: {
          error: {
            type: 'org_required',
            message: 'You are a member of several organizations: name one with the Ostrom-Org header.',
          },
        },
      });
    }
    const me = await get('/auth/me');
    expect(me.status).toBe(200);
    expect(me.body).not.toHaveProperty('organization');
  });

  it('acts in the organization named, and answers as for anything else of an organization it does not know', async () => {
    db.otherOrganizations = [globex];
    expect((await get('/org', globex.id)).body).toMatchObject({ name: 'Globex' });
    expect((await get('/auth/me', globex.id)).body).toMatchObject({ organization: { name: 'Globex' } });
    expect((await get('/secrets', 'org-nobody')).status).toBe(404);
  });

  it('lets through the routes that act in no organization', async () => {
    db.otherOrganizations = [globex];
    const sent = await fetch('http://ostrom.test/api/v1/auth/email', {
      method: 'POST',
      body: JSON.stringify({ email: 'maya@acme.dev' }),
    });
    expect(sent.status).toBe(202);
  });
});
