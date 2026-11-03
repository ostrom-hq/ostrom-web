// SPDX-License-Identifier: AGPL-3.0-only
// Line 3.2 of the journey (demo/PARCOURS.md), console side, against the real server: an owner writes a rule by hand on
// /rules and puts a gate on it, an action of their own (its label and commands) that waits for their yes. Once the rule
// is accepted, the action is in the organization's gate catalogue, and asking for it opens a gate that waits in the
// approver's queue (server#79). The ask is made with a personal token, as the hook asks.
import { expect, test } from '@playwright/test';
import { z } from 'zod';
import { zAskGateResponse, zGateAction } from '../gen/api/zod.gen';
import { askingToken, loginOf, requestOf, uniqueRun, withToken } from './gate';
import { callFromPage, ownerOfNewOrganization } from './real';

/**
 * The catalogue's actions, read for their class and label only: the server sends no `repos` on an action, which the
 * contract's `GateAction` requires (signalled to CONTRAT-SYNC in the JOURNAL), and keywords and the gate it does not
 * list.
 */
const zCatalogActions = z.object({ actions: z.array(zGateAction.pick({ class: true, label: true })) });

test('3.2 an owner writes a rule with a gate on the console; once accepted, its action waits for a yes', async ({
  page,
}) => {
  const { id: org } = await ownerOfNewOrganization(page, 'ada');
  const owner = await loginOf(page);
  const run = uniqueRun();
  const statement = `Ask before a migration (${run}).`;
  const label = `Run a migration ${run}`;
  const command = `flyway-${run} migrate`;

  await page.goto('/rules');
  await page.getByRole('button', { name: 'New rule' }).click();
  const form = page.getByRole('region', { name: 'A new rule' });
  await form.getByRole('textbox', { name: 'Rule' }).fill(statement);
  await form.getByRole('combobox', { name: 'Group' }).fill('Releases');
  await form.getByRole('combobox', { name: 'What it does' }).selectOption('gate');
  await form.getByLabel('Another action').fill(label);
  await form.getByLabel('Its commands').fill(command);
  await form.getByRole('button', { name: 'Add the action' }).click();
  await expect(form.getByRole('checkbox', { name: label })).toBeChecked();
  await form.getByLabel('Who may say yes').fill(owner);
  await form.getByRole('button', { name: 'Add the rule' }).click();

  const written = page.locator('article').filter({ hasText: statement });
  // Its status badge, not "Accepted by …" nor "Accepted with a fix".
  await expect(written.getByText('Accepted', { exact: true })).toBeVisible();
  await expect(written).toContainText(`Gate: ${label}, waits for a yes from ${owner}`);

  // The accepted rule's gate is in the catalogue the hook and the gates read.
  let action: string | undefined;
  await expect
    .poll(async () => {
      const catalog = await callFromPage(page, 'GET', '/api/v1/gates/catalog', undefined, org);
      action =
        catalog.status === 200
          ? zCatalogActions.parse(catalog.body).actions.find((item) => item.label === label)?.class
          : undefined;
      return action;
    })
    .toBeDefined();

  // Asking for that action, as the hook does, opens a gate that waits for the owner's yes.
  const token = await askingToken(page, org);
  const asked = await withToken(token, org, 'POST', '/api/v1/gates', {
    repo: `acme/db-${run}`,
    class: action ?? '',
    tool: 'Bash',
    command,
  });
  expect(asked.status, JSON.stringify(asked.body)).toBe(200);
  const { gate } = zAskGateResponse.parse(asked.body);
  expect(gate.status).toBe('pending');
  const request = await requestOf(page, org, gate.id);
  await page.goto('/yes');
  await expect(page.locator(`a[href$="/yes/${request.id}"]`).first()).toBeVisible();
});
