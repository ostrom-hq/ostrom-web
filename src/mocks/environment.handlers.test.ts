// SPDX-License-Identifier: Apache-2.0
import { MEMBER_IDS, otherOrganization } from '@/mocks/fixtures/organization';
import { reservedVariable } from '@/mocks/environment';
import { resetMockDb } from '@/mocks/handlers';
import { createMockServer } from '@/mocks/node';
import { setDemoRole } from '@/mocks/orgs';

const { server, db } = createMockServer();

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

interface Answer {
  readonly status: number;
  readonly type: string | undefined;
  readonly body: unknown;
}

async function call(method: string, path: string, body?: unknown, org?: string): Promise<Answer> {
  const response = await fetch(`http://ostrom.test/api/v1/environment${path}`, {
    method,
    headers: org === undefined ? {} : { 'Ostrom-Org': org },
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
  const text = await response.text();
  const parsed: unknown = text === '' ? undefined : JSON.parse(text);
  const error = typeof parsed === 'object' && parsed !== null && 'error' in parsed ? parsed.error : undefined;
  const type =
    typeof error === 'object' && error !== null && 'type' in error && typeof error.type === 'string'
      ? error.type
      : undefined;
  return { status: response.status, type, body: parsed };
}

const theo = MEMBER_IDS.theo;

describe('the mock environment variants, as the server refuses', () => {
  it('lets only owners and admins in, on every route', async () => {
    setDemoRole(db, 'member');
    const answers = await Promise.all([
      call('GET', '/variants'),
      call('GET', '/variants/personal'),
      call('POST', '/variants', { variable: 'A', name: 'a', value: 'v' }),
      call('PATCH', '/variants/env-1', { expectedVersion: 2 }),
      call('DELETE', '/variants/env-1'),
      call('POST', '/variants/env-1/bulk-assign'),
      call('POST', '/variants/env-4/promote'),
      call('GET', '/assignments'),
      call('PUT', `/assignments/${theo}/NPM_TOKEN`, { variantId: 'env-3' }),
      call('DELETE', `/assignments/${theo}/GITHUB_TOKEN`),
      call('PUT', `/exclusions/${theo}/NPM_TOKEN`),
      call('DELETE', `/exclusions/${MEMBER_IDS.samir}/SENTRY_DSN`),
    ]);
    expect(answers.map((answer) => answer.status)).toEqual(Array.from({ length: 12 }, () => 403));
  });

  it('asks for a fresh sign-in on a write, not on a read', async () => {
    db.signedInAt = 0;
    expect((await call('GET', '/variants')).status).toBe(200);
    expect((await call('DELETE', '/variants/env-1')).type).toBe('step_up_required');
  });

  it('keeps everything out of another organization', async () => {
    const globex = otherOrganization();
    db.otherOrganizations = [globex];
    db.orgMembers[globex.id] = [
      {
        id: MEMBER_IDS.maya,
        login: 'maya',
        name: '',
        avatarUrl: '',
        email: null,
        role: 'owner',
        joinedAt: '2026-09-01T09:00:00.000Z',
      },
    ];
    expect((await call('GET', '/variants', undefined, globex.id)).body).toEqual({ items: [] });
    expect((await call('GET', '/variants/personal', undefined, globex.id)).body).toEqual({ items: [] });
    expect((await call('GET', '/assignments', undefined, globex.id)).body).toEqual({
      items: [],
      exclusions: [],
    });
    expect(
      (await call('POST', '/variants', { variable: 'A', name: 'a', value: 'v' }, globex.id)).status,
    ).toBe(403);
    expect((await call('PATCH', '/variants/env-1', { expectedVersion: 2 }, globex.id)).status).toBe(404);
    expect(
      (await call('PUT', `/assignments/${theo}/NPM_TOKEN`, { variantId: 'env-3' }, globex.id)).status,
    ).toBe(404);
  });

  it('checks what a variant is made of', async () => {
    expect((await call('POST', '/variants', 'not json')).type).toBe('invalid_environment_variant');
    expect((await call('POST', '/variants', { variable: 'lower', name: 'a', value: 'v' })).status).toBe(400);
    expect((await call('POST', '/variants', { variable: 'A', name: ' ', value: 'v' })).status).toBe(400);
    expect((await call('POST', '/variants', { variable: 'LD_PRELOAD', name: 'a', value: 'v' })).status).toBe(
      400,
    );
    expect((await call('POST', '/variants', { variable: 'A', name: 'a' })).status).toBe(400);
    expect((await call('POST', '/variants', { variable: 'A', name: 'a', value: '' })).status).toBe(400);
    expect(
      (await call('POST', '/variants', { variable: 'A', name: 'a', binding: 'perMember', value: 'v' }))
        .status,
    ).toBe(400);
    expect(
      (await call('POST', '/variants', { variable: 'GITHUB_TOKEN', name: 'ACME', value: 'v' })).type,
    ).toBe('variant_exists');
    // A personal variant of the same name does not count.
    expect(
      (await call('POST', '/variants', { variable: 'OPENROUTER_API_KEY', name: 'mine', value: 'v' })).status,
    ).toBe(201);
    const created = await call('POST', '/variants', { variable: 'B', name: 'b', binding: 'perMember' });
    expect(created.body).toMatchObject({ id: 'env-7', binding: 'perMember', hasValue: false, version: 1 });
    expect(reservedVariable('PATH')).toBe(true);
    expect(reservedVariable('GITHUB_TOKEN')).toBe(false);
  });

  it('updates a team variant against the version read, and refuses a personal one', async () => {
    expect((await call('PATCH', '/variants/nope', { expectedVersion: 1 })).status).toBe(404);
    expect((await call('PATCH', '/variants/env-4', { expectedVersion: 1 })).type).toBe('variant_personal');
    expect((await call('PATCH', '/variants/env-1', {})).status).toBe(400);
    expect((await call('PATCH', '/variants/env-1', { expectedVersion: 1 })).type).toBe(
      'variant_version_conflict',
    );
    expect((await call('PATCH', '/variants/env-2', { expectedVersion: 1, value: 'x' })).status).toBe(400);
    expect((await call('PATCH', '/variants/env-2', { expectedVersion: 1, name: 'own' })).body).toMatchObject({
      name: 'own',
      version: 2,
    });
    expect((await call('PATCH', '/variants/env-1', { expectedVersion: 2, value: 'x' })).body).toMatchObject({
      name: 'acme',
      version: 3,
    });
  });

  it('deletes a variant with its assignments', async () => {
    expect((await call('DELETE', '/variants/nope')).status).toBe(404);
    expect((await call('DELETE', '/variants/env-1')).status).toBe(204);
    expect(db.environmentAssignments.some((item) => item.variantId === 'env-1')).toBe(false);
  });

  it('assigns in bulk a shared team variant only, keeping direct selections and skipping exclusions', async () => {
    expect((await call('POST', '/variants/nope/bulk-assign')).status).toBe(404);
    expect((await call('POST', '/variants/env-4/bulk-assign')).type).toBe('variant_personal');
    expect((await call('POST', '/variants/env-2/bulk-assign')).type).toBe('variant_not_shared');
    db.environmentExclusions.push({ member: MEMBER_IDS.samir, variable: 'GITHUB_TOKEN' });
    expect((await call('POST', '/variants/env-1/bulk-assign')).body).toEqual({
      assigned: 1,
      keptDirect: 2,
      excluded: 1,
    });
  });

  it('promotes a personal variant, unless a team one has its name', async () => {
    expect((await call('POST', '/variants/nope/promote')).status).toBe(404);
    expect((await call('POST', '/variants/env-1/promote')).body).toMatchObject({ id: 'env-1', name: 'acme' });
    const [first] = db.environmentVariants;
    if (first === undefined) throw new Error('no variant');
    db.environmentVariants.push({
      ...first,
      id: 'env-9',
      variable: 'SENTRY_DSN',
      name: 'Samir',
    });
    expect((await call('POST', '/variants/env-5/promote')).type).toBe('variant_exists');
    const promoted = await call('POST', '/variants/env-4/promote');
    expect(promoted.body).not.toHaveProperty('owner');
    expect(db.environmentAssignments.find((item) => item.variantId === 'env-4')?.personal).toBe(false);
  });

  it('lists the assignments of one member', async () => {
    const answer = await call('GET', `/assignments?member=${MEMBER_IDS.samir}`);
    expect(answer.body).toEqual({
      items: [],
      exclusions: [{ member: MEMBER_IDS.samir, variable: 'SENTRY_DSN' }],
    });
  });

  it('assigns a team variant to a member, with a value for a per-member one only', async () => {
    expect((await call('PUT', `/assignments/nobody/NPM_TOKEN`, { variantId: 'env-3' })).status).toBe(404);
    expect(
      (await call('PUT', `/assignments/${MEMBER_IDS.jo}/NPM_TOKEN`, { variantId: 'env-3' })).status,
    ).toBe(404);
    expect((await call('PUT', `/assignments/${theo}/NPM_TOKEN`, {})).status).toBe(400);
    expect((await call('PUT', `/assignments/${theo}/NPM_TOKEN`, { variantId: 'nope' })).status).toBe(404);
    expect((await call('PUT', `/assignments/${theo}/OPENROUTER_API_KEY`, { variantId: 'env-4' })).type).toBe(
      'variant_personal',
    );
    expect((await call('PUT', `/assignments/${theo}/GITHUB_TOKEN`, { variantId: 'env-3' })).status).toBe(400);
    expect(
      (await call('PUT', `/assignments/${theo}/NPM_TOKEN`, { variantId: 'env-3', value: 'x' })).status,
    ).toBe(400);
    expect((await call('PUT', `/assignments/${theo}/GITHUB_TOKEN`, { variantId: 'env-2' })).status).toBe(400);
    db.environmentExclusions.push({ member: theo, variable: 'NPM_TOKEN' });
    expect((await call('PUT', `/assignments/${theo}/NPM_TOKEN`, { variantId: 'env-3' })).type).toBe(
      'variant_excluded',
    );
    const own = await call('PUT', `/assignments/${theo}/GITHUB_TOKEN`, { variantId: 'env-2', value: 'mine' });
    expect(own.body).toMatchObject({ source: 'direct', hasMemberValue: true, variantId: 'env-2' });
    expect(
      db.environmentAssignments.filter((item) => item.member === theo && item.variable === 'GITHUB_TOKEN'),
    ).toHaveLength(1);
  });

  it('unassigns, excludes and includes a member', async () => {
    expect((await call('DELETE', `/assignments/nobody/GITHUB_TOKEN`)).status).toBe(404);
    expect((await call('DELETE', `/assignments/${theo}/GITHUB_TOKEN`)).status).toBe(204);
    expect((await call('PUT', `/exclusions/nobody/GITHUB_TOKEN`)).status).toBe(404);
    expect((await call('PUT', `/exclusions/${theo}/lower`)).status).toBe(400);
    expect((await call('PUT', `/exclusions/${theo}/OPENROUTER_API_KEY`)).status).toBe(204);
    expect((await call('PUT', `/exclusions/${theo}/OPENROUTER_API_KEY`)).status).toBe(204);
    expect(db.environmentExclusions.filter((item) => item.member === theo)).toHaveLength(1);
    expect(
      db.environmentAssignments.some(
        (item) => item.member === theo && item.variable === 'OPENROUTER_API_KEY',
      ),
    ).toBe(false);
    expect((await call('DELETE', `/exclusions/nobody/OPENROUTER_API_KEY`)).status).toBe(404);
    expect((await call('DELETE', `/exclusions/${theo}/OPENROUTER_API_KEY`)).status).toBe(204);
    // Removing an exclusion grants nothing back.
    expect(
      db.environmentAssignments.some(
        (item) => item.member === theo && item.variable === 'OPENROUTER_API_KEY',
      ),
    ).toBe(false);
  });
});
