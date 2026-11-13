// SPDX-License-Identifier: Apache-2.0
import { render, screen } from '@testing-library/react';
import { Avatar } from '@/shared/ui/Avatar';
import { Badge } from '@/shared/ui/Badge';
import { Banner } from '@/shared/ui/Banner';

describe('Avatar', () => {
  it.each([
    ['maya-lind', 'ML'],
    ['theo', 'T'],
    ['--', '?'],
  ])('shows %s as %s', (login, text) => {
    const { container } = render(<Avatar login={login} />);
    expect(container).toHaveTextContent(text);
  });

  it('shows a question mark for nobody, sized from its prop', () => {
    const { container } = render(<Avatar login={undefined} size={40} />);
    expect(container.firstElementChild).toHaveStyle({ width: '40px', fontSize: '15px' });
    expect(container).toHaveTextContent('?');
  });
});

describe('Badge', () => {
  it('carries its tone, neutral by default', () => {
    render(
      <>
        <Badge>plain</Badge>
        <Badge tone="danger">refused</Badge>
      </>,
    );
    expect(screen.getByText('plain')).toHaveClass('o-badge--neutral');
    expect(screen.getByText('refused')).toHaveClass('o-badge--danger');
    expect(screen.getByText('plain')).not.toHaveAttribute('data-approval');
  });

  it('marks the waiting-for-your-decision state', () => {
    render(
      <Badge tone="signal" approval="waiting">
        Waiting for you
      </Badge>,
    );
    expect(screen.getByText('Waiting for you')).toHaveAttribute('data-approval', 'waiting');
  });
});

describe('Banner', () => {
  it('is quiet by default and an alert when live', () => {
    const { rerender } = render(<Banner tag="offline">Retrying</Banner>);
    expect(screen.queryByRole('alert')).toBeNull();
    rerender(
      <Banner tag="refused" tone="danger" live>
        No
      </Banner>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('refusedNo');
  });
});
