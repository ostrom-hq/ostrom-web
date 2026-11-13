// SPDX-License-Identifier: Apache-2.0
import { expect, test } from '@playwright/test';
import { openScreen } from './navigation';

test('an approver opens a request from the queue, reads the proof, approves and gets the signed receipt', async ({
  page,
}) => {
  await page.goto('/');
  await openScreen(page, 'Requests');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Requests');
  await expect(page.getByText('Approving as Maya Lind (maya)')).toBeVisible();

  await page.getByRole('link', { name: /Merge PR #412 into main/ }).click();
  await expect(page).toHaveURL(/\/yes\/apr-merge-412$/);
  await expect(page.getByText('fix(invoices): round VAT per line')).toBeVisible();
  await page.getByRole('button', { name: /^Approve/ }).click();

  const decision = page.getByRole('region', { name: 'Decision' });
  await expect(decision).toContainText('maya approved: Merge PR #412 into main');
  await decision.getByText('Verify the receipt').click();
  await expect(decision).toContainText('ostrom verify rcpt-apr-merge-412');

  await page.getByRole('link', { name: 'All requests' }).click();
  await expect(page.getByRole('heading', { name: '1 waiting for you' })).toBeVisible();
});

test('the asker cannot approve their own request, but can decline with what to do instead', async ({
  page,
}) => {
  await page.goto('/yes/apr-deploy-88');
  await expect(page.getByText('You asked for this yourself.')).toBeVisible();

  await page.getByRole('button', { name: /^Approve/ }).click();
  // The organization never lets the asker approve, the default (S2-15).
  await expect(page.getByRole('alert')).toContainText('never lets the asker approve');

  await page.getByRole('button', { name: 'Decline & tell the agent…' }).click();
  await page.getByRole('textbox', { name: 'What should the agent do instead?' }).fill('Wait for samir.');
  await page.getByRole('button', { name: 'Decline and send' }).click();
  const decision = page.getByRole('region', { name: 'Decision' });
  await expect(decision).toContainText('maya declined: Deploy');
  await expect(decision).toContainText('Wait for samir.');
});

test('a sign-in link is wiped from the address at once, asked about, then exchanged for the session cookie', async ({
  page,
}) => {
  await page.goto('/yes#signin=opk_e2e_token_123');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Requests');
  await expect(page).toHaveURL(/\/yes$/);
  // The demo opens signed in: a link may be another account, so it waits for a yes.
  const notice = page.getByRole('alert').filter({ hasText: 'Someone is already signed in' });
  await notice.getByRole('button', { name: 'Sign in with the link' }).click();
  await expect(notice).toBeHidden();
  const { cookies, origins } = await page.context().storageState();
  const stored = [
    ...origins.flatMap((origin) => origin.localStorage).map((entry) => entry.value),
    ...cookies.map((cookie) => cookie.value),
  ];
  expect(stored.some((value) => value.includes('opk_e2e_token_123'))).toBe(false);
});

test('a yes from a sign-in more than five minutes old asks to sign in again, then goes through after the link', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/yes/apr-merge-412');
  await expect(page.getByText('fix(invoices): round VAT per line')).toBeVisible();
  // The demo signed in when it opened: six minutes later, a yes needs a fresh sign-in (S2-54).
  await page.clock.fastForward('06:00');
  await page.getByRole('button', { name: /^Approve/ }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('your sign-in is more than five minutes old');
  await alert.getByRole('link', { name: 'Sign in again' }).click();
  await expect(page).toHaveURL(/\/signin\?redirect=%2Fyes%2Fapr-merge-412$/);

  await page.getByRole('textbox', { name: 'Your e-mail address' }).fill('maya@acme.dev');
  await page.getByRole('button', { name: 'E-mail me a link' }).click();
  // The link opened in this page, without a reload: the demo keeps its data and only its sign-in is new.
  await page.evaluate(
    "history.pushState({}, '', '/auth/email#token=ml_demo'); dispatchEvent(new PopStateEvent('popstate'))",
  );
  // Someone is signed in (the old session): the link replaces it after a yes.
  await page.getByRole('button', { name: 'Sign in with the link' }).click();
  await expect(page.getByRole('heading', { name: 'Requests' })).toBeVisible();
  await page.getByRole('link', { name: /Merge PR #412 into main/ }).click();
  await page.getByRole('button', { name: /^Approve/ }).click();
  await expect(page.getByRole('region', { name: 'Decision' })).toContainText(
    'maya approved: Merge PR #412 into main',
  );
});

test('an approver who linked no GitHub account reads why a yes waits, links it, comes back and approves', async ({
  page,
  baseURL,
}) => {
  // The demo person signed up by e-mail: no GitHub account linked, and PR #412's author is linked to nobody.
  await page.goto('/yes');
  await page.evaluate("localStorage.setItem('ostrom.mock.github', 'unlinked')");
  await page.goto('/yes/apr-merge-412');
  await expect(page.getByText('To approve this request, link your GitHub account.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve merge' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Decline & tell the agent…' })).toBeEnabled();

  // The notice's link, not the menu's: it opens the GitHub section of the account.
  await page.locator('a[href="/account#github"]').click();
  await expect(page).toHaveURL(/\/account#github$/);
  const github = page.getByRole('region', { name: 'GitHub' });
  await expect(github).toBeInViewport();
  // GitHub's consent, played here: it sends the browser back to the account, which the demo then reads as linked.
  await page.route('https://github.com/login/oauth/authorize**', async (route) => {
    await route.fulfill({ status: 302, headers: { location: `${baseURL ?? ''}/account` } });
  });
  await page.evaluate("localStorage.removeItem('ostrom.mock.github')");
  await github.getByRole('button', { name: 'Link GitHub' }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(github.getByText('Linked', { exact: true })).toBeVisible();

  await page.goto('/yes/apr-merge-412');
  await expect(page.getByText('To approve this request, link your GitHub account.')).toBeHidden();
  await page.getByRole('button', { name: 'Approve merge' }).click();
  await expect(page.getByRole('region', { name: 'Decision' })).toContainText(
    'maya approved: Merge PR #412 into main',
  );
});
