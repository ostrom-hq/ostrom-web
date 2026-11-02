// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test';
import { anotherPerson, callFromPage, closeOthers, ownerOfNewOrganization } from './real';

test.afterEach(closeOthers);

interface DecisionLine {
  readonly by: string;
  readonly action: string;
  readonly subject: { readonly kind: string; readonly id: string; readonly label?: string };
  readonly receiptId: string;
}

test('an owner’s decision on a rule is in the journal, signed, newest first, and another organization sees none', async ({
  page,
  browser,
}) => {
  const org = await ownerOfNewOrganization(page, 'quill');
  await page.goto('/decisions');
  await expect(page.getByRole('heading', { level: 1, name: 'Decisions' })).toBeVisible();
  await expect(page.getByText('No decision yet.')).toBeVisible();

  // A rule written, then deleted: two decisions of the person.
  const statement = `Run the migrations in a transaction (${Date.now().toString(36)}).`;
  const rule = await callFromPage(page, 'POST', '/api/v1/rules', { statement, group: 'Data' });
  expect(rule.status, JSON.stringify(rule.body)).toBe(201);
  const { id } = rule.body as { id: string };
  expect((await callFromPage(page, 'DELETE', `/api/v1/rules/${id}`)).status).toBeLessThan(300);

  const read = await callFromPage(page, 'GET', '/api/v1/decisions');
  expect(read.status).toBe(200);
  const decisions = (read.body as { items: DecisionLine[] }).items;
  const onRule = decisions.filter(
    (decision) => decision.subject.kind === 'rule' && decision.subject.id === id,
  );
  expect(onRule.length).toBeGreaterThan(0);

  // The screen lists them as the server does: who, what, and a link to each signed receipt.
  await page.reload();
  const list = page.getByRole('list').filter({ has: page.getByRole('link', { name: /Receipt/ }) });
  for (const decision of onRule) {
    const line = list
      .getByRole('link')
      .filter({ hasText: `${decision.by} ` })
      .filter({
        hasText: decision.subject.label ?? decision.subject.id,
      });
    await expect(line.first()).toBeVisible();
    await expect(list.locator(`a[href="/receipts/${decision.receiptId}"]`)).toHaveCount(1);
  }
  const first = onRule[0];
  if (first !== undefined) {
    await list.locator(`a[href="/receipts/${first.receiptId}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/receipts/${first.receiptId}$`));
  }

  // Another organization: an empty journal, and naming the first one opens nothing.
  const stranger = await anotherPerson(browser);
  await ownerOfNewOrganization(stranger, 'rune');
  await stranger.goto('/decisions');
  await expect(stranger.getByText('No decision yet.')).toBeVisible();
  expect((await callFromPage(stranger, 'GET', '/api/v1/decisions', undefined, org.id)).status).toBe(404);
});
