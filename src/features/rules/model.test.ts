// SPDX-License-Identifier: AGPL-3.0-only
import type { Rule } from '@gen/api/types.gen';
import {
  actionClass,
  addCheck,
  customAction,
  editOf,
  offeredActions,
  changeOf,
  countRules,
  draftOf,
  draftProblem,
  gateActions,
  gateOf,
  groupRules,
  isAccepted,
  isOutput,
  isStrength,
  listOf,
  matches,
  newRuleOf,
  percent,
  sureProposals,
} from './model';

const rule = (id: string, status: Rule['status'], group: string, confidence: number): Rule => ({
  id,
  statement: id,
  output: 'note',
  group,
  strength: 'recommended',
  confidence,
  status,
  foundBy: 'deep-pass',
  foundAt: '2026-10-30T00:00:00.000Z',
});

const rules = [
  rule('a', 'proposed', 'Tests', 0.95),
  rule('b', 'proposed', 'Tests', 0.5),
  rule('c', 'accepted', 'Reviews', 0.9),
  rule('d', 'edited', 'Reviews', 0.99),
  rule('e', 'rejected', 'Style', 0.2),
];

describe('filters and counts', () => {
  it('reads an edited rule as accepted', () => {
    expect(rules.map(isAccepted)).toEqual([false, false, true, true, false]);
  });

  it('counts what is left to decide and what was decided', () => {
    expect(countRules(rules)).toEqual({ todo: 2, accepted: 2, rejected: 1, all: 5 });
    expect(rules.filter((item) => matches(item, 'all'))).toHaveLength(5);
  });
});

describe('groupRules', () => {
  it('orders groups by name and rules by confidence', () => {
    expect(groupRules(rules).map((group) => [group.name, group.rules.map((item) => item.id)])).toEqual([
      ['Reviews', ['d', 'c']],
      ['Style', ['e']],
      ['Tests', ['a', 'b']],
    ]);
  });
});

describe('sure proposals and percent', () => {
  it('keeps proposed rules at 90 % or more', () => {
    expect(sureProposals(rules).map((item) => item.id)).toEqual(['a']);
    expect(percent(0.956)).toBe('96 %');
  });
});

describe('a rule draft', () => {
  const deploy = { class: 'deploy', label: 'Deploy', patterns: ['helm upgrade'], repos: [] };
  const merge = { class: 'merge-main', label: 'Merge into main', patterns: [], repos: [] };
  const rule: Rule = {
    id: 'R-1',
    statement: 'Deploys wait for a yes.',
    output: 'gate',
    group: 'Releases',
    scope: ['acme/api'],
    why: 'Two outages.',
    strength: 'required',
    confidence: 1,
    status: 'accepted',
    foundBy: 'maya',
    foundAt: '2026-11-02T10:00:00.000Z',
    gate: { actions: [deploy], approvers: ['samir'], reason: 'Owners', checks: [{ check: 'n-tests' }] },
  };

  it('starts empty for a new rule, and from the rule for an edit', () => {
    expect(draftOf()).toEqual({
      statement: '',
      group: '',
      why: '',
      scope: '',
      strength: 'required',
      output: 'note',
      actions: [],
      approvers: '',
      reason: '',
      checks: [],
      extra: [],
    });
    expect(draftOf(rule)).toMatchObject({
      scope: 'acme/api',
      actions: ['deploy'],
      approvers: 'samir',
      reason: 'Owners',
      checks: [{ key: 0, check: 'n-tests', attested: false }],
    });
  });

  it('reads a list typed with commas, spaces or lines, each value once', () => {
    expect(listOf(' acme/api, acme/web\nacme/api  ')).toEqual(['acme/api', 'acme/web']);
    expect(listOf('  ')).toEqual([]);
  });

  it('offers the catalogue, then the actions the rule gates that the catalogue lost', () => {
    expect(gateActions([merge], rule).map((action) => action.class)).toEqual(['merge-main', 'deploy']);
    expect(gateActions([deploy], rule)).toEqual([deploy]);
    expect(gateActions([merge])).toEqual([merge]);
  });

  it('says the first thing that keeps a draft from being sent', () => {
    const base = { ...draftOf(), statement: 'x', group: 'g' };
    expect(draftProblem(draftOf(), [])).toBe('statement');
    expect(draftProblem({ ...draftOf(), statement: 'x' }, [])).toBe('group');
    expect(draftProblem(base, [])).toBeUndefined();
    const gate = { ...base, output: 'gate' };
    expect(draftProblem(gate, [deploy])).toBe('actions');
    // A picked action that left the offer counts for nothing.
    expect(draftProblem({ ...gate, actions: ['deploy'] }, [merge])).toBe('actions');
    expect(draftProblem({ ...gate, actions: ['deploy'] }, [deploy])).toBe('approvers');
    const named = { ...gate, actions: ['deploy'], approvers: 'samir' };
    expect(draftProblem({ ...named, checks: [{ key: 0, check: ' ', attested: false }] }, [deploy])).toBe(
      'check',
    );
    expect(draftProblem(named, [deploy])).toBeUndefined();
  });

  it('writes an action by hand, held on the rule repositories, its commands kept whole', () => {
    expect(actionClass('  Run a Migration! ')).toBe('run-a-migration');
    expect(
      customAction('Run a migration', 'flyway migrate,\n rails db:migrate, flyway migrate', 'acme/api'),
    ).toEqual({
      class: 'run-a-migration',
      label: 'Run a migration',
      patterns: ['flyway migrate', 'rails db:migrate'],
      repos: ['acme/api'],
    });
    expect(customAction(' !? ', 'x', '')).toBeUndefined();
    const extra = customAction('Push', '', '');
    const draft = { ...draftOf(rule), extra: extra === undefined ? [] : [extra, deploy] };
    expect(offeredActions([merge], rule, draft).map((action) => action.class)).toEqual([
      'merge-main',
      'deploy',
      'push',
    ]);
  });

  it('accepts a proposed rule as it saves, fixed or not, and sends nothing for an unchanged decided one', () => {
    const proposed: Rule = { ...rule, status: 'proposed' };
    const actions = gateActions([], rule);
    expect(editOf(proposed, draftOf(proposed), actions)).toEqual({ status: 'accepted' });
    expect(editOf(proposed, { ...draftOf(proposed), group: 'Ops' }, actions)).toEqual({
      group: 'Ops',
      status: 'edited',
    });
    expect(editOf(rule, draftOf(rule), actions)).toBeUndefined();
    expect(editOf(rule, { ...draftOf(rule), group: 'Ops' }, actions)).toEqual({ group: 'Ops' });
  });

  it('adds check rows that keep their place', () => {
    expect(addCheck([])).toEqual([{ key: 0, check: '', attested: false }]);
    expect(addCheck([{ key: 4, check: 'a', attested: true }])[1]?.key).toBe(5);
  });

  it('writes a new rule with only what was given, and its gate when it is one', () => {
    expect(newRuleOf({ ...draftOf(), statement: ' Read it. ', group: ' Docs ' }, [])).toEqual({
      statement: 'Read it.',
      group: 'Docs',
      output: 'note',
      strength: 'required',
    });
    const gated = newRuleOf(
      {
        ...draftOf(),
        statement: 's',
        group: 'g',
        why: 'w',
        scope: 'acme/api',
        output: 'gate',
        actions: ['deploy'],
        approvers: 'samir, maya',
        reason: ' Owners ',
        checks: [{ key: 0, check: ' n-tests ', attested: true }],
      },
      [deploy, merge],
    );
    expect(gated).toMatchObject({
      why: 'w',
      scope: ['acme/api'],
      gate: {
        actions: [deploy],
        approvers: ['samir', 'maya'],
        reason: 'Owners',
        checks: [{ check: 'n-tests', attested: true }],
      },
    });
    expect(gateOf({ ...draftOf(), output: 'gate' }, [])).toEqual({ actions: [], approvers: [] });
  });

  it('sends only what changed, and takes a gate off with null', () => {
    const actions = gateActions([], rule);
    expect(changeOf(rule, draftOf(rule), actions)).toEqual({});
    expect(
      changeOf(
        rule,
        { ...draftOf(rule), statement: 'New.', group: 'Ops', why: '', scope: '', strength: 'recommended' },
        actions,
      ),
    ).toEqual({ statement: 'New.', group: 'Ops', why: '', scope: [], strength: 'recommended' });
    expect(changeOf(rule, { ...draftOf(rule), output: 'note' }, actions)).toEqual({
      output: 'note',
      gate: null,
    });
    expect(changeOf(rule, { ...draftOf(rule), approvers: 'lena' }, actions)).toEqual({
      gate: {
        actions: [deploy],
        approvers: ['lena'],
        reason: 'Owners',
        checks: [{ check: 'n-tests', attested: false }],
      },
    });
    const plain: Rule = { ...rule, output: 'note' };
    delete plain.gate;
    delete plain.why;
    delete plain.scope;
    expect(changeOf(plain, draftOf(plain), [])).toEqual({});
    expect(
      changeOf(plain, { ...draftOf(plain), output: 'gate', actions: ['deploy'], approvers: 'samir' }, [
        deploy,
      ]),
    ).toEqual({
      output: 'gate',
      gate: { actions: [deploy], approvers: ['samir'] },
    });
  });

  it('knows its outputs and strengths', () => {
    expect(isOutput('gate')).toBe(true);
    expect(isOutput('banner')).toBe(false);
    expect(isStrength('required')).toBe(true);
    expect(isStrength('mandatory')).toBe(false);
  });
});
