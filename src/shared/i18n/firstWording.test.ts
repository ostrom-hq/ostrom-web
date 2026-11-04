// SPDX-License-Identifier: AGPL-3.0-only
import { BOOTED, wordingKey } from '@/shared/build/bootScript';
import { takeFirstWording } from '@/shared/i18n/firstWording';

afterEach(() => {
  Reflect.deleteProperty(globalThis, BOOTED);
});

describe('takeFirstWording', () => {
  it('takes the wording /boot.js fetched for the language, once', async () => {
    const store = { [wordingKey('fr')]: Promise.resolve(Response.json({ app: { name: 'Ostrom' } })) };
    expect(takeFirstWording('en', store)).toBeUndefined();
    await expect(takeFirstWording('fr', store)).resolves.toEqual({ app: { name: 'Ostrom' } });
    expect(takeFirstWording('fr', store)).toBeUndefined();
  });

  it('reads the store /boot.js leaves on the page by default', async () => {
    Reflect.set(globalThis, BOOTED, { [wordingKey('en')]: Promise.resolve(Response.json({ app: {} })) });
    await expect(takeFirstWording('en')).resolves.toEqual({ app: {} });
  });

  it('gives nothing without a store, or without a fetch in it', () => {
    expect(takeFirstWording('en', undefined)).toBeUndefined();
    expect(takeFirstWording('en', null)).toBeUndefined();
    expect(takeFirstWording('en', { [wordingKey('en')]: 'not a fetch' })).toBeUndefined();
  });

  it('resolves to nothing for a failure, an error, a page or anything but a wording', async () => {
    const answers = [
      Promise.reject(new Error('offline')),
      Promise.resolve('not a response'),
      Promise.resolve(new Response('{}', { status: 500 })),
      Promise.resolve(Response.json(['not', 'a', 'wording'])),
    ];
    for (const answer of answers) {
      await expect(takeFirstWording('en', { [wordingKey('en')]: answer })).resolves.toBeUndefined();
    }
  });
});
