// SPDX-License-Identifier: AGPL-3.0-only
import { expect, type Page, test } from '@playwright/test';
import { anotherPerson, callFromPage, closeOthers, freshEmail, ownerOfNewOrganization, signIn } from './real';

test.afterEach(closeOthers);

/** No sideways scrolling: the screen fits a phone's width as it fits a desktop's. */
async function fitsTheWidth(page: Page): Promise<void> {
  // A string: e2e-real is typed for Node, without the DOM's globals.
  const fits: unknown = await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth');
  expect(fits).toBe(true);
}

/** The login the server gives the person signed in in `page`. */
async function loginOf(page: Page): Promise<string> {
  const me = await callFromPage(page, 'GET', '/api/v1/auth/me');
  expect(me.status).toBe(200);
  return (me.body as { dev: { login: string } }).dev.login;
}

test('a new person signs up, creates their organization on the console and lands on its setup guide', async ({
  page,
}) => {
  // The first sign-in creates the account: it is in no organization yet, so the console offers to create one.
  await signIn(page, freshEmail('olga'));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Create your organization');
  const name = `Olga Labs ${Date.now().toString(36)}`;
  await page.getByRole('textbox', { name: 'Organization name' }).fill(name);
  const slug = name.toLowerCase().replace(/ /g, '-');
  await expect(page.getByText(`Short name: ${slug}`)).toBeVisible();
  await fitsTheWidth(page);
  await page.getByRole('button', { name: 'Create the organization' }).click();

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
  const guide = page.getByRole('region', { name: 'Set up' });
  // A new organization has done its first step only: the next one, GitHub, is the current one.
  await expect(guide.getByText('1 of 6 done')).toBeVisible();
  await expect(guide.getByRole('listitem').filter({ hasText: 'Connect GitHub' })).toHaveAttribute(
    'aria-current',
    'step',
  );
  await fitsTheWidth(page);

  // The server holds it, with the person as its owner.
  const listed = await callFromPage(page, 'GET', '/api/v1/orgs');
  expect(listed.status).toBe(200);
  const created = (listed.body as { items: { name: string; slug: string; role: string }[] }).items;
  expect(created).toEqual([expect.objectContaining({ name, slug, role: 'owner' })]);
});

test('an owner invites by e-mail and by link, the invited person joins with the role given, and the owner changes it', async ({
  page,
  browser,
}) => {
  const org = await ownerOfNewOrganization(page, 'pia');
  const orgName = (await callFromPage(page, 'GET', `/api/v1/orgs/${org.id}`)).body as { name: string };
  await page.goto('/members');
  // The members screen is titled with the organization's name.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(orgName.name);
  await expect(page.getByText('1 person · you are Owner')).toBeVisible();

  // By e-mail: the server takes the address and lists it as waiting.
  const invited = freshEmail('quin');
  const invite = page.getByRole('region', { name: 'Invite people' });
  await invite.getByRole('textbox', { name: 'E-mail addresses' }).fill(invited);
  await invite.getByRole('button', { name: 'Send 1 invitation' }).click();
  await expect(invite.getByRole('alert')).toContainText(`Invitation sent to ${invited}.`);
  await expect(page.getByRole('region', { name: 'Waiting invitations' })).toContainText(invited);
  const waiting = await callFromPage(page, 'GET', `/api/v1/orgs/${org.id}/invitations`);
  expect(waiting.status).toBe(200);
  expect(JSON.stringify(waiting.body)).toContain(invited);

  // By link, as an approver: shown once, then opened by someone else.
  const linkForm = page.getByRole('region', { name: 'Invitation link' });
  await linkForm.getByRole('combobox', { name: 'Joins as' }).selectOption('approver');
  await linkForm.getByRole('spinbutton', { name: 'Uses' }).fill('1');
  await linkForm.getByRole('button', { name: 'Create a link' }).click();
  const link = linkForm.getByRole('textbox', { name: 'Invitation link', exact: true });
  await expect(link).toHaveValue(/\/invite#token=/);
  const url = new URL(await link.inputValue());
  await fitsTheWidth(page);

  const joiner = await anotherPerson(browser);
  await signIn(joiner, freshEmail('remy'));
  await joiner.goto(`${url.pathname}${url.hash}`);
  await expect(joiner.getByRole('heading', { level: 1 })).toHaveText(`Join ${orgName.name}`);
  // The secret leaves the address bar once read.
  expect(new URL(joiner.url()).hash).toBe('');
  await expect(joiner.getByText('You are invited as Approver.')).toBeVisible();
  await joiner.getByRole('button', { name: `Join ${orgName.name}` }).click();
  await expect(joiner.getByRole('heading', { level: 1 })).toHaveText(orgName.name);

  // The owner sees them with that role, and makes them a member.
  const login = await loginOf(joiner);
  const before = await callFromPage(page, 'GET', `/api/v1/orgs/${org.id}/members`);
  const joined = (before.body as { items: { login: string; name: string; role: string }[] }).items.find(
    (member) => member.login === login,
  );
  expect(joined?.role).toBe('approver');
  // The screen names a person by their name, or their login without one.
  const shown = joined?.name === undefined || joined.name === '' ? login : joined.name;
  await page.reload();
  await expect(page.getByText('2 people · you are Owner')).toBeVisible();
  const role = page.getByRole('combobox', { name: `Role of ${shown}` });
  await expect(role).toHaveValue('approver');
  await role.selectOption('member');
  await expect(role).toHaveValue('member');
  const members = await callFromPage(page, 'GET', `/api/v1/orgs/${org.id}/members`);
  expect(members.status).toBe(200);
  expect((members.body as { items: { login: string; role: string }[] }).items).toContainEqual(
    expect.objectContaining({ login, role: 'member' }),
  );

  // The link was for one person: it no longer works.
  const late = await anotherPerson(browser);
  await signIn(late, freshEmail('sven'));
  await late.goto(`${url.pathname}${url.hash}`);
  // One use, spent: the link no longer works, and nobody else got in.
  await expect(late.getByText('This invitation no longer works')).toBeVisible();
  const after = await callFromPage(page, 'GET', `/api/v1/orgs/${org.id}/members`);
  expect((after.body as { items: unknown[] }).items).toHaveLength(2);

  // Another organization's person reads none of it.
  const stranger = await anotherPerson(browser);
  await ownerOfNewOrganization(stranger, 'tove');
  expect((await callFromPage(stranger, 'GET', `/api/v1/orgs/${org.id}/members`)).status).toBe(404);
});
