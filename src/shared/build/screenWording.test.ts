// SPDX-License-Identifier: AGPL-3.0-only
import { screenWording, sectionsIn } from '@/shared/build/screenWording';

describe('sectionsIn', () => {
  it('finds the sections a key literal starts with, in any quotes', () => {
    const code = `t("app.loading");t('yes.signin.offer');t(\`billing.\${period}\`);t("spend."+key)`;
    expect([...sectionsIn(code, ['app', 'yes', 'billing', 'spend', 'rules'])]).toEqual([
      'app',
      'yes',
      'billing',
      'spend',
    ]);
  });

  it('does not take a word, a longer section or a bare section name for a key', () => {
    const code = `"rules";"rulesets.a";"spend. "; spend.total`;
    expect([...sectionsIn(code, ['rules', 'spend'])]).toEqual([]);
  });

  it('fails on a section that is not a name', () => {
    expect(() => sectionsIn('', ['a.b'])).toThrow('a.b');
  });
});

describe('screenWording', () => {
  it('keeps only the sections named, in the wording order', () => {
    const wording = { app: { name: 'Ostrom' }, yes: { title: 'Yes' }, rules: { title: 'Rules' } };
    expect(screenWording(wording, new Set(['rules', 'app']))).toEqual({
      app: { name: 'Ostrom' },
      rules: { title: 'Rules' },
    });
  });
});
