// SPDX-License-Identifier: Apache-2.0
import { QueryClient } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { resetMockDb } from '@/mocks/handlers';
import { createMockServer } from '@/mocks/node';
import { allWorkflowsOptions, MAX_WORKFLOW_PAGES, WORKFLOWS_PAGE } from '@/shared/api/allWorkflows';
import { configureApiClient } from '@/shared/api/apiClient';

const { server, db } = createMockServer();

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
  configureApiClient({ baseUrl: 'http://ostrom.test' });
});
afterEach(() => {
  server.resetHandlers();
  resetMockDb(db);
});
afterAll(() => {
  server.close();
});

function copies(count: number): void {
  const [first] = db.workflows;
  if (first === undefined) throw new Error('the demo has workflows');
  db.workflows = Array.from({ length: count }, (_, i) => ({ ...first, id: `wf-${String(i)}` }));
}

async function readAll(): Promise<readonly string[]> {
  const page = await new QueryClient().query(allWorkflowsOptions());
  return page.items.map((workflow) => workflow.id);
}

describe('every workflow of the organization', () => {
  it('is read page after page until a page has no next', async () => {
    copies(2 * WORKFLOWS_PAGE + 30);
    const ids = await readAll();
    expect(ids).toHaveLength(2 * WORKFLOWS_PAGE + 30);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('reads one more, empty, page after a full last one', async () => {
    copies(2 * WORKFLOWS_PAGE);
    expect(await readAll()).toHaveLength(2 * WORKFLOWS_PAGE);
  });

  it('stops after the pages an organization can hold, whatever the server answers', async () => {
    let reads = 0;
    server.use(
      http.get('http://ostrom.test/api/v1/workflows', () => {
        reads += 1;
        return HttpResponse.json({ items: [], next: 'wf-again' });
      }),
    );
    expect(await readAll()).toEqual([]);
    expect(reads).toBe(MAX_WORKFLOW_PAGES);
  });
});
