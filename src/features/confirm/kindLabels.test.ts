// SPDX-License-Identifier: Apache-2.0
import { zGovernanceChangeKind } from '@gen/api/zod.gen';
import { en } from '@/shared/i18n/locales/en';
import { fr } from '@/shared/i18n/locales/fr';

/** The value at `path` in a wording tree, or undefined where a step is missing. */
function at(tree: unknown, path: readonly string[]): unknown {
  let node = tree;
  for (const key of path) {
    node = typeof node === 'object' && node !== null && key in node ? Reflect.get(node, key) : undefined;
  }
  return node;
}

// The confirmation page names its change with `confirm.kind.<kind>`: a kind the contract adds needs its words first.
describe('the name of every kind of governance change', () => {
  it.each(zGovernanceChangeKind.options)('%s is said in English and in French', (kind) => {
    const path = ['confirm', 'kind', ...kind.split('.')];
    for (const wording of [en, fr]) {
      const label = at(wording, path);
      expect(typeof label === 'string' && label.trim() !== '').toBe(true);
    }
  });

  it('finds nothing where a step is missing', () => {
    expect(at(en, ['confirm', 'kind', 'nothing', 'here'])).toBeUndefined();
  });
});
