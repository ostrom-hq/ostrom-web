// SPDX-License-Identifier: AGPL-3.0-only
import { render, screen } from '@testing-library/react';
import '@/shared/i18n/i18n';
import { OrgPicker } from './OrgPicker';

const nothing = (): void => undefined;

describe('OrgPicker', () => {
  it('closes without trouble when nothing had the focus before it opened', () => {
    Object.defineProperty(document, 'activeElement', { configurable: true, get: () => null });
    try {
      const { unmount } = render(
        <OrgPicker
          options={[]}
          loading={false}
          failure={undefined}
          onRetry={nothing}
          unknown={false}
          onClose={nothing}
        />,
      );
      expect(screen.getByRole('dialog', { name: 'Which organization?' })).toBeInTheDocument();
      unmount();
      expect(screen.queryByRole('dialog')).toBeNull();
    } finally {
      // Back to the document's own `activeElement`, from its prototype.
      Reflect.deleteProperty(document, 'activeElement');
    }
  });
});
