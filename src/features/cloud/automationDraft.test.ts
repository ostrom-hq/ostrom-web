// SPDX-License-Identifier: AGPL-3.0-only
import type { Automation } from '@gen/api/types.gen';
import { zCloudAgentKind } from '@gen/api/zod.gen';
import {
  AUTOMATION_AGENTS,
  addVariable,
  type AutomationDraft,
  automationDraftOf,
  automationProblem,
  automationWriteOf,
  isAutomationAgent,
  isOverlap,
  isTriggerKind,
  localTimezone,
  looksLikeCron,
  ownsAutomation,
  sampleOf,
  type VariableDraft,
  wholeNumber,
} from './automationDraft';

const automation = (parts: Partial<Automation>): Automation => ({
  id: 'au-1',
  name: 'Nightly',
  owner: 'theo',
  enabled: true,
  trigger: {
    kind: 'cron',
    cron: '0 3 * * *',
    timezone: 'Europe/Paris',
    catchup: 'skip',
    catchupGraceMinutes: 30,
  },
  action: { prompt: 'Upgrade.', agent: 'codex', model: 'gpt-6', effort: 'high', maxRuntimeMinutes: 45 },
  overlap: 'allow',
  maxRunsPerDay: 2,
  version: 4,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...parts,
});

const fresh = (parts: Partial<AutomationDraft>): AutomationDraft => ({
  ...automationDraftOf(undefined, 'Europe/Paris'),
  name: 'Nightly',
  prompt: 'Upgrade.',
  ...parts,
});

const variable = (parts: Partial<VariableDraft>): VariableDraft => ({
  key: 0,
  name: 'issue.id',
  path: '$.issue.id',
  type: 'string',
  values: '',
  required: true,
  sensitive: false,
  ...parts,
});

describe('the automation form', () => {
  it('knows the agents, triggers and overlaps the server takes', () => {
    // The contract's agents but the plain shell.
    expect(AUTOMATION_AGENTS).toEqual(zCloudAgentKind.options.filter((agent) => agent !== 'shell'));
    expect([
      isAutomationAgent('claude'),
      isAutomationAgent('gemini'),
      isAutomationAgent('claude-code'),
      isAutomationAgent('shell'),
    ]).toEqual([true, true, false, false]);
    expect([isTriggerKind('cron'), isTriggerKind('webhook'), isTriggerKind('email')]).toEqual([
      true,
      true,
      false,
    ]);
    expect([isOverlap('skip'), isOverlap('allow'), isOverlap('queue')]).toEqual([true, true, false]);
  });

  it('starts a new automation on a weekday schedule in the browser’s zone', () => {
    expect(localTimezone()).not.toBe('');
    expect(automationDraftOf(undefined, 'Asia/Tokyo')).toMatchObject({
      kind: 'cron',
      cron: '0 9 * * 1-5',
      timezone: 'Asia/Tokyo',
      agent: 'claude',
      runtime: '60',
      runsPerDay: '24',
      overlap: 'skip',
      variables: [],
      sample: '',
    });
  });

  it('reads an automation as it stands, and fills what it leaves out with the server’s defaults', () => {
    expect(automationDraftOf(automation({}), 'UTC')).toMatchObject({
      name: 'Nightly',
      cron: '0 3 * * *',
      timezone: 'Europe/Paris',
      agent: 'codex',
      model: 'gpt-6',
      runtime: '45',
      runsPerDay: '2',
      overlap: 'allow',
    });
    const bare = automationDraftOf(
      automation({
        trigger: { kind: 'webhook' },
        action: {},
        variables: [
          { name: 'level', path: '$.level', type: 'enum', values: ['low', 'high'] },
          { name: 'token', path: '$.token', type: 'string', required: false, sensitive: true },
        ],
        samplePayload: { level: 'low' },
      }),
      'UTC',
    );
    const unbounded = automation({});
    delete unbounded.maxRunsPerDay;
    delete unbounded.overlap;
    expect(bare).toMatchObject({
      kind: 'webhook',
      cron: '0 9 * * 1-5',
      timezone: 'UTC',
      agent: 'claude',
      prompt: '',
      model: '',
    });
    expect(bare.runtime).toBe('60');
    expect(bare.sample).toBe('{\n  "level": "low"\n}');
    expect(bare.variables).toEqual([
      {
        key: 0,
        name: 'level',
        path: '$.level',
        type: 'enum',
        values: 'low, high',
        required: true,
        sensitive: false,
      },
      {
        key: 1,
        name: 'token',
        path: '$.token',
        type: 'string',
        values: '',
        required: false,
        sensitive: true,
      },
    ]);
    expect(automationDraftOf(unbounded, 'UTC')).toMatchObject({ runsPerDay: '24', overlap: 'skip' });
  });

  it('reads whole numbers within bounds only', () => {
    expect([
      wholeNumber(' 12 ', 1, 20),
      wholeNumber('0', 1, 20),
      wholeNumber('21', 1, 20),
      wholeNumber('1.5', 1, 20),
      wholeNumber('', 1, 20),
    ]).toEqual([12, undefined, undefined, undefined, undefined]);
  });

  it('takes a cron of five fields or a macro', () => {
    expect([
      looksLikeCron('0 9 * * 1-5'),
      looksLikeCron(' @hourly '),
      looksLikeCron('0 9 * *'),
      looksLikeCron(''),
    ]).toEqual([true, true, false, false]);
  });

  it('reads the sample payload as a JSON object, or says it is not one', () => {
    expect(sampleOf('  ')).toBeUndefined();
    expect(sampleOf('{"a": 1}')).toEqual({ a: 1 });
    expect([sampleOf('[1]'), sampleOf('null'), sampleOf('"a"'), sampleOf('{')]).toEqual([
      'invalid',
      'invalid',
      'invalid',
      'invalid',
    ]);
  });

  it('says the first thing the server would refuse', () => {
    expect(automationProblem(fresh({}))).toBeUndefined();
    expect(automationProblem(fresh({ name: '  ' }))).toBe('name');
    expect(automationProblem(fresh({ name: 'x'.repeat(121) }))).toBe('name');
    expect(automationProblem(fresh({ cron: '0 9' }))).toBe('cron');
    expect(automationProblem(fresh({ timezone: ' ' }))).toBe('timezone');
    expect(automationProblem(fresh({ prompt: ' ' }))).toBe('prompt');
    expect(automationProblem(fresh({ prompt: 'x'.repeat(32_001) }))).toBe('prompt');
    expect(automationProblem(fresh({ runtime: '0' }))).toBe('runtime');
    expect(automationProblem(fresh({ runsPerDay: '1001' }))).toBe('runsPerDay');
    // A webhook has no schedule to check.
    expect(automationProblem(fresh({ kind: 'webhook', cron: '', timezone: '' }))).toBeUndefined();
    const webhook = (parts: Partial<AutomationDraft>): AutomationDraft =>
      fresh({ kind: 'webhook', ...parts });
    expect(
      automationProblem(webhook({ variables: Array.from({ length: 33 }, (_, key) => variable({ key })) })),
    ).toBe('variables');
    expect(automationProblem(webhook({ variables: [variable({ name: ' ' })] }))).toBe('variable');
    expect(automationProblem(webhook({ variables: [variable({ path: '' })] }))).toBe('variable');
    expect(automationProblem(webhook({ variables: [variable({ type: 'enum', values: ' , ' })] }))).toBe(
      'enum',
    );
    expect(
      automationProblem(webhook({ variables: [variable({ type: 'enum', values: 'a' })] })),
    ).toBeUndefined();
    expect(automationProblem(webhook({ sample: '[' }))).toBe('sample');
  });

  it('writes a new schedule with what the person typed, and nothing of a webhook', () => {
    expect(
      automationWriteOf(
        fresh({
          name: ' Nightly ',
          cron: ' 0 3 * * * ',
          timezone: ' UTC ',
          model: ' ',
          runtime: ' 30 ',
          runsPerDay: '3',
          variables: [variable({})],
          sample: '{"a":1}',
        }),
      ),
    ).toEqual({
      name: 'Nightly',
      trigger: { kind: 'cron', cron: '0 3 * * *', timezone: 'UTC' },
      action: { prompt: 'Upgrade.', agent: 'claude', maxRuntimeMinutes: 30 },
      variables: [],
      overlap: 'skip',
      maxRunsPerDay: 3,
    });
  });

  it('keeps on an edit what the form does not show, and sends the version it read', () => {
    const before = automation({});
    expect(automationWriteOf(automationDraftOf(before, 'UTC'), before)).toEqual({
      name: 'Nightly',
      trigger: {
        kind: 'cron',
        cron: '0 3 * * *',
        timezone: 'Europe/Paris',
        catchup: 'skip',
        catchupGraceMinutes: 30,
      },
      action: { prompt: 'Upgrade.', agent: 'codex', model: 'gpt-6', effort: 'high', maxRuntimeMinutes: 45 },
      variables: [],
      overlap: 'allow',
      maxRunsPerDay: 2,
      version: 4,
    });
  });

  it('writes a webhook with its variables and sample, and keeps a length set elsewhere', () => {
    const before = automation({
      trigger: { kind: 'webhook' },
      action: { prompt: 'Triage {{issue.id}}.' },
      variables: [{ name: 'issue.id', path: '$.issue.id', type: 'string', maxLength: 40 }],
    });
    const draft: AutomationDraft = {
      ...automationDraftOf(before, 'UTC'),
      variables: [
        variable({ name: ' issue.id ', path: ' $.issue.id ' }),
        variable({
          key: 1,
          name: 'level',
          path: '$.level',
          type: 'enum',
          values: 'low, , high',
          required: false,
        }),
        variable({ key: 2, name: 'token', path: '$.token', values: 'ignored', sensitive: true }),
      ],
      sample: '{"issue": {"id": "S-1"}}',
    };
    expect(automationWriteOf(draft, before)).toEqual({
      name: 'Nightly',
      trigger: { kind: 'webhook' },
      action: { prompt: 'Triage {{issue.id}}.', agent: 'claude', maxRuntimeMinutes: 60 },
      variables: [
        {
          name: 'issue.id',
          path: '$.issue.id',
          type: 'string',
          maxLength: 40,
          required: true,
          sensitive: false,
        },
        {
          name: 'level',
          path: '$.level',
          type: 'enum',
          values: ['low', 'high'],
          required: false,
          sensitive: false,
        },
        { name: 'token', path: '$.token', type: 'string', required: true, sensitive: true },
      ],
      samplePayload: { issue: { id: 'S-1' } },
      overlap: 'allow',
      maxRunsPerDay: 2,
      version: 4,
    });
    // A webhook without a sample sends none.
    expect(automationWriteOf({ ...draft, variables: [], sample: '' })).not.toHaveProperty('samplePayload');
  });

  it('adds a variable row keyed after the others', () => {
    expect(addVariable([])).toEqual([
      { key: 0, name: '', path: '$.', type: 'string', values: '', required: true, sensitive: false },
    ]);
    expect(addVariable([variable({ key: 4 }), variable({ key: 1 })]).map((row) => row.key)).toEqual([
      4, 1, 5,
    ]);
  });

  it('knows its owner by login or by member id', () => {
    const viewer = { login: 'maya', memberId: 'm-1' };
    expect([
      ownsAutomation(automation({ owner: 'maya' }), viewer),
      ownsAutomation(automation({ owner: 'm-1' }), viewer),
      ownsAutomation(automation({ owner: 'theo' }), viewer),
      ownsAutomation(automation({ owner: 'theo' }), { login: undefined, memberId: undefined }),
    ]).toEqual([true, true, false, false]);
  });
});
