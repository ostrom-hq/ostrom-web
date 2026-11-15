// SPDX-License-Identifier: Apache-2.0
import { readWorkflow } from '@/shared/api/workflowDocument';

describe('readWorkflow', () => {
  const document = {
    id: 'wf-1',
    name: 'Ship',
    domain: 'release',
    nodes: [{ id: 'start', kind: 'trigger', label: 'Start' }],
    edges: [{ from: 'start', to: null }],
    status: 'accepted',
    foundAt: '2026-09-01T09:00:00.000Z',
  };

  it('reads a workflow document the server serves', () => {
    expect(readWorkflow(document)?.nodes[0]?.label).toBe('Start');
  });

  it('keeps a node kind or a status a newer server adds (CS-04)', () => {
    const read = readWorkflow({
      ...document,
      status: 'archived',
      nodes: [{ id: 'n', kind: 'robot', label: 'N' }],
    });
    expect(read?.status).toBe('archived');
    expect(read?.nodes[0]?.kind).toBe('robot');
  });

  it('refuses what is not a workflow', () => {
    expect(readWorkflow({ id: 'wf-1' })).toBeUndefined();
    expect(readWorkflow(null)).toBeUndefined();
    expect(readWorkflow('text')).toBeUndefined();
  });
});
