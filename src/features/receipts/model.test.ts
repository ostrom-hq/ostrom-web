// SPDX-License-Identifier: AGPL-3.0-only
import type { ReceiptNode } from '@gen/api/types.gen';
import { attestationOf, attestationTone } from './model';

const node = (extra: Partial<ReceiptNode>): ReceiptNode => ({
  id: 'n',
  workflowId: 'wf',
  kind: 'check',
  label: 'Tests pass',
  outcome: 'passed',
  ...extra,
});

describe('attestationOf', () => {
  it('says where a check ran, and reads an older check as declared', () => {
    expect(attestationOf(node({ attestation: 'ci' }))).toBe('ci');
    expect(attestationOf(node({ attestation: 'isolated_runner' }))).toBe('isolated_runner');
    expect(attestationOf(node({}))).toBe('workstation_declared');
  });

  it('says nothing for a step that is not a check', () => {
    expect(attestationOf(node({ kind: 'gate' }))).toBeUndefined();
  });
});

describe('attestationTone', () => {
  it('warns on a declaration, confirms a run Ostrom or the CI did', () => {
    expect(attestationTone('workstation_declared')).toBe('warning');
    expect(attestationTone('isolated_runner')).toBe('success');
    expect(attestationTone('ci')).toBe('success');
  });
});
