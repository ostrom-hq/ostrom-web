// SPDX-License-Identifier: AGPL-3.0-only
import { expect, type Page, test } from '@playwright/test';
import { anotherPerson, callFromPage, closeOthers, ownerOfNewOrganization } from './real';

test.afterEach(closeOthers);

/** No sideways scrolling: the form fits a phone's width as it fits a desktop's. */
async function fitsTheWidth(page: Page): Promise<void> {
  // A string: e2e-real is typed for Node, without the DOM's globals.
  const fits: unknown = await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth');
  expect(fits).toBe(true);
}

test('a person writes a scheduled automation, edits it, and another organization never sees it', async ({
  page,
  browser,
}) => {
  await ownerOfNewOrganization(page, 'ines');
  await page.goto('/automations');
  await page.getByRole('button', { name: 'New automation' }).click();
  const form = page.getByRole('region', { name: 'A new automation' });
  const name = `Weekly changelog ${Date.now().toString(36)}`;
  await form.getByRole('textbox', { name: 'Name' }).fill(name);
  await form.getByRole('textbox', { name: 'Schedule (cron)' }).fill('0 8 * * 1');
  await form.getByRole('textbox', { name: 'Time zone' }).fill('Europe/Paris');
  await form
    .getByRole('textbox', { name: 'What the agent does' })
    .fill('Write the changelog of {{run.date}}.');
  await form.getByRole('textbox', { name: 'Runs a day at most' }).fill('2');
  await fitsTheWidth(page);
  await form.getByRole('button', { name: 'Create the automation' }).click();

  const card = page.locator('article').filter({ has: page.getByRole('heading', { level: 3, name }) });
  await expect(card).toBeVisible();
  await expect(page.getByRole('region', { name: 'A new automation' })).toHaveCount(0);
  await expect(card).toContainText('Off');
  await expect(card).toContainText('Starts on a schedule: 0 8 * * 1 · Europe/Paris');
  await expect(card).toContainText('Claude Code: Write the changelog of {{run.date}}.');
  await expect(card).toContainText('version 1 · at most 2 runs a day · stops after 60 min');

  // The server took exactly what the form sent.
  const listed = await callFromPage(page, 'GET', '/api/v1/automations');
  expect(listed.status).toBe(200);
  const created = (listed.body as { items: { id: string; name: string }[] }).items.find(
    (item) => item.name === name,
  );
  expect(created).toBeDefined();
  const id = created?.id ?? '';

  await card.getByRole('button', { name: 'Edit' }).click();
  await card.getByRole('textbox', { name: 'What the agent does' }).fill('Write the changelog, then tag it.');
  await card.getByRole('combobox', { name: 'Agent' }).selectOption({ label: 'Codex' });
  await fitsTheWidth(page);
  await card.getByRole('button', { name: 'Save' }).click();
  await expect(card).toContainText('Codex: Write the changelog, then tag it.');
  await expect(card).toContainText('version 2');
  const read = await callFromPage(page, 'GET', `/api/v1/automations/${id}`);
  expect(read.status).toBe(200);
  expect(read.body).toMatchObject({
    name,
    version: 2,
    enabled: false,
    trigger: { kind: 'cron', cron: '0 8 * * 1', timezone: 'Europe/Paris' },
    action: { agent: 'codex', prompt: 'Write the changelog, then tag it.' },
    maxRunsPerDay: 2,
  });

  // A refusal comes back in the server's own words: a prompt that names a variable nothing gives.
  await card.getByRole('button', { name: 'Edit' }).click();
  await card.getByRole('textbox', { name: 'What the agent does' }).fill('Hello {{nobody}}.');
  await card.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('alert')).toContainText('The prompt names unknown variables: nobody.');
  await card.getByRole('button', { name: 'Cancel' }).click();

  // Another organization's person sees neither the card nor the automation itself.
  const other = await anotherPerson(browser);
  await ownerOfNewOrganization(other, 'omar');
  await other.goto('/automations');
  await expect(other.getByRole('button', { name: 'New automation' })).toBeVisible();
  await expect(other.getByRole('heading', { level: 3, name })).toHaveCount(0);
  expect((await callFromPage(other, 'GET', `/api/v1/automations/${id}`)).status).toBe(404);

  expect((await callFromPage(page, 'DELETE', `/api/v1/automations/${id}`)).status).toBe(204);
});

test('a person writes a webhook automation with a payload variable, and reads its secret once', async ({
  page,
}) => {
  await ownerOfNewOrganization(page, 'yara');
  await page.goto('/automations');
  await page.getByRole('button', { name: 'New automation' }).click();
  const form = page.getByRole('region', { name: 'A new automation' });
  const name = `Triage alerts ${Date.now().toString(36)}`;
  await form.getByRole('textbox', { name: 'Name' }).fill(name);
  await form.getByRole('combobox', { name: 'Starts on' }).selectOption({ label: 'A signed webhook' });
  await form.getByRole('textbox', { name: 'What the agent does' }).fill('Triage the {{level}} alert.');
  await form.getByRole('button', { name: 'Add a variable' }).click();
  await form.getByRole('textbox', { name: 'Name of variable 1' }).fill('level');
  await form.getByRole('textbox', { name: 'Path of variable 1' }).fill('$.level');
  await form.getByRole('combobox', { name: 'Type of variable 1' }).selectOption('enum');
  await form.getByRole('textbox', { name: 'Values of variable 1' }).fill('low, high');
  await form.getByRole('textbox', { name: 'Sample payload (JSON, optional)' }).fill('{"level": "low"}');
  await fitsTheWidth(page);
  await form.getByRole('button', { name: 'Create the automation' }).click();

  const card = page.locator('article').filter({ has: page.getByRole('heading', { level: 3, name }) });
  await expect(card).toContainText('Starts on a signed webhook');
  await expect(card).toContainText(/\/api\/v1\/automations\/[0-9a-f-]+\/trigger/);
  await expect(card.getByText(/^whsec_/)).toBeVisible();
  await expect(card).toContainText('The caller signs each request with it.');

  const listed = await callFromPage(page, 'GET', '/api/v1/automations');
  const created = (
    listed.body as { items: { id: string; name: string; variables?: unknown; samplePayload?: unknown }[] }
  ).items.find((item) => item.name === name);
  expect(created?.variables).toEqual([
    expect.objectContaining({ name: 'level', path: '$.level', type: 'enum', values: ['low', 'high'] }),
  ]);
  expect(created?.samplePayload).toEqual({ level: 'low' });

  // The secret is only in the answer to the creation: a new visit never shows it again.
  await page.reload();
  await expect(card).toBeVisible();
  await expect(card.getByText(/^whsec_/)).toHaveCount(0);

  expect((await callFromPage(page, 'DELETE', `/api/v1/automations/${created?.id ?? ''}`)).status).toBe(204);
});
