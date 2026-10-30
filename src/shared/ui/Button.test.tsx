import { render, screen } from '@testing-library/react';
import { Button } from '@/shared/ui/Button';

describe('Button', () => {
  it('is a secondary, non-submitting button by default', () => {
    render(<Button>Later</Button>);
    const button = screen.getByRole('button', { name: 'Later' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveClass('o-btn', 'o-btn--secondary', 'o-btn--md');
  });

  it('carries its variant', () => {
    render(
      <Button variant="primary" size="icon" aria-label="Approve">
        ✓
      </Button>,
    );
    expect(screen.getByRole('button', { name: 'Approve' })).toHaveClass('o-btn--primary', 'o-btn--icon');
  });
});
