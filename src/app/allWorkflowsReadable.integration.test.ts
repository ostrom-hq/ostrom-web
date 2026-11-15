// SPDX-License-Identifier: Apache-2.0
import { QueryClient } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { createMockServer } from '@/mocks/node';
import { allWorkflowsOptions } from '@/shared/api/allWorkflows';
import { configureApiClient } from '@/shared/api/apiClient';

const { server } = createMockServer();

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
  configureApiClient({ baseUrl: 'http://ostrom.test' });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

describe('every workflow of the organization', () => {
  it('keeps the documents the console can read and leaves out the others', async () => {
    const readable = {
      id: 'wf-1',
      name: 'Flow',
      domain: 'engineering',
      nodes: [],
      edges: [],
      status: 'active',
      foundAt: '2026-01-01T00:00:00Z',
    };
    server.use(
      http.get('http://ostrom.test/api/v1/workflows', () =>
        HttpResponse.json({ items: [readable, { id: 'wf-2' }], next: null }),
      ),
    );
    const page = await new QueryClient().query(allWorkflowsOptions());
    expect(page.items.map((workflow) => workflow.id)).toEqual(['wf-1']);
  });
});
