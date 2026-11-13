// SPDX-License-Identifier: Apache-2.0
import { isFound } from './people';

describe('isFound', () => {
  it('finds a person by login, name or address, whatever the case and the spaces around', () => {
    const lena = { login: 'lena', name: 'Lena Ortiz', email: 'lena@acme.test' };
    expect(isFound(lena, ' ORTIZ ')).toBe(true);
    expect(isFound(lena, 'acme.test')).toBe(true);
    expect(isFound(lena, '')).toBe(true);
    expect(isFound({ ...lena, email: null }, 'acme')).toBe(false);
  });
});
