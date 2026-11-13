// SPDX-License-Identifier: Apache-2.0
import { expect, test } from '@playwright/test';
import { anotherPerson, callFromPage, closeOthers, ownerOfNewOrganization } from './real';

test.afterEach(closeOthers);

interface DecisionLine {
  readonly by: string;
  readonly action: string;
  readonly subject: { readonly kind: string; readonly id: string; readonly label?: string };
  readonly receiptId: string;
}

test('an owner’s decision on a rule are in the journal, newest first, each with its receipt, and another organization sees none', async ({
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

  // Signed once the change commits: read until both are there, newest first.
  const onRule = async (): Promise<DecisionLine[]> => {
    const read = await callFromPage(page, 'GET', '/api/v1/decisions');
    expect(read.status).toBe(200);
    return (read.body as { items: DecisionLine[] }).items.filter(
      (decision) => decision.subject.kind === 'rule' && decision.subject.id === id,
    );
  };
  await expect
    .poll(async () => (await onRule()).map((decision) => decision.action))
    .toEqual(['deleted', 'accepted']);
  const [deleted, accepted] = await onRule();
  if (deleted === undefined || accepted === undefined) throw new Error('The two decisions are listed above.');

  // The screen lists them as the server does, in its order: who did what, each linking its signed receipt.
  await page.reload();
  const deletedLine = page.locator(`a[href="/receipts/${deleted.receiptId}"]`);
  const acceptedLine = page.locator(`a[href="/receipts/${accepted.receiptId}"]`);
  await expect(deletedLine).toContainText(`${deleted.by} deleted the rule`);
  await expect(acceptedLine).toContainText(`${accepted.by} accepted the rule`);
  for (const line of [deletedLine, acceptedLine]) await expect(line).toContainText(statement.slice(0, 20));
  const links = await Promise.all(
    (await page.getByRole('link', { name: /Receipt$/ }).all()).map(async (link) => link.getAttribute('href')),
  );
  expect(links.indexOf(`/receipts/${deleted.receiptId}`)).toBeLessThan(
    links.indexOf(`/receipts/${accepted.receiptId}`),
  );
  await acceptedLine.click();
  await expect(page).toHaveURL(new RegExp(`/receipts/${accepted.receiptId}$`));

  // Another organization: an empty journal, and naming the first one opens nothing.
  const stranger = await anotherPerson(browser);
  await ownerOfNewOrganization(stranger, 'rune');
  await stranger.goto('/decisions');
  await expect(stranger.getByText('No decision yet.')).toBeVisible();
  expect((await callFromPage(stranger, 'GET', '/api/v1/decisions', undefined, org.id)).status).toBe(404);
});
