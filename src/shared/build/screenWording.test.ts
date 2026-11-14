// SPDX-License-Identifier: Apache-2.0
import { screenWording, sectionsIn } from '@/shared/build/screenWording';

describe('sectionsIn', () => {
  const wording = {
    app: { loading: 'Loading' },
    yes: { signin: { offer: 'Sign in' } },
    billing: { monthly: 'Monthly', items_one: 'One item', items_other: 'Items' },
    spend: { total: 'Total' },
    rules: { title: 'Rules', kind_open: 'Open' },
    plans: { 'plan-pro': 'Pro' },
    webhooks: { title: 'Webhooks' },
    github: { title: 'GitHub' },
    waits: { filter: { 'waiting-you': 'Waiting for you' } },
    audit: { events: { 'session.started': 'Session started' } },
  };

  it('finds the sections a key literal starts with, in any quotes', () => {
    const code = `t("app.loading");t('yes.signin.offer');t(\`billing.\${period}\`);t("spend."+key)`;
    expect([...sectionsIn(code, wording)]).toEqual(['app', 'yes', 'billing', 'spend']);
  });

  it('finds a key by the stem of its plural forms, and a key built from a part of its path', () => {
    expect([...sectionsIn(`t("billing.items",{count})`, wording)]).toEqual(['billing']);
    expect([...sectionsIn(`t("yes.signin."+part)`, wording)]).toEqual(['yes']);
  });

  it('finds a key built from the start of a segment', () => {
    expect([...sectionsIn(`t(\`rules.kind_\${kind}\`);t("plans.plan-"+tier)`, wording)]).toEqual([
      'rules',
      'plans',
    ]);
  });

  it('finds a key with a hyphen, and a key whose own name has a dot', () => {
    const code = `t("waits.filter.waiting-you");t("audit.events.session.started")`;
    expect([...sectionsIn(code, wording)]).toEqual(['waits', 'audit']);
  });

  it('takes no inherited name for a key', () => {
    expect([...sectionsIn(`"rules.constructor";"spend.toString"`, wording)]).toEqual([]);
  });

  it('does not take a word, a longer section or a bare section name for a key', () => {
    const code = `"rules";"rulesets.a";"spend. "; spend.total`;
    expect([...sectionsIn(code, wording)]).toEqual([]);
  });

  it('does not take a literal that leads nowhere in its section for a key: a feature, a host', () => {
    const code = `has("webhooks.v1");open("https://github.com/x");t("yes.signin.offer.more");t("rules.title.x");"rules.ti"`;
    expect([...sectionsIn(code, wording)]).toEqual([]);
  });

  it('fails on a section that is not a name', () => {
    expect(() => sectionsIn('', { 'a.b': {} })).toThrow('a.b');
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
