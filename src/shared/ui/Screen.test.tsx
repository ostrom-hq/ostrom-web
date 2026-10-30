// SPDX-License-Identifier: AGPL-3.0-only
import { render, screen } from '@testing-library/react';
import '@/shared/i18n/i18n';
import { EmptyState, Facts, LoadState, Screen, Section } from '@/shared/ui/Screen';

describe('Screen', () => {
  it('puts the title in a level-one heading, with what goes above and below it', () => {
    render(
      <Screen title="Receipts" lead="12 signed" top={<a href="/">Back</a>}>
        <p>body</p>
      </Screen>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Receipts' })).toBeInTheDocument();
    expect(screen.getByText('12 signed')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back' })).toBeInTheDocument();
  });

  it('leaves out an absent lead', () => {
    const { container } = render(<Screen title="Receipts">body</Screen>);
    expect(container.querySelector('.o-screen__lead')).toBeNull();
  });
});

describe('Section and Facts', () => {
  it('names the section by its heading and skips a missing fact', () => {
    render(
      <Section label="Signature">
        <Facts facts={[{ label: 'Key', value: '4f2a', mono: true }, undefined, { label: 'Who', value: 'maya' }]} />
      </Section>,
    );
    const section = screen.getByRole('region', { name: 'Signature' });
    expect(section).toHaveTextContent('Key4f2aWhomaya');
    expect(screen.getByText('4f2a')).toHaveClass('o-mono');
    expect(screen.getByText('maya')).not.toHaveClass('o-mono');
  });
});

describe('EmptyState', () => {
  it('says what is empty and why', () => {
    render(<EmptyState title="No receipts yet">They appear after a decision.</EmptyState>);
    expect(screen.getByText('No receipts yet')).toBeInTheDocument();
  });
});

describe('LoadState', () => {
  const show = (value: string): string => `got ${value}`;

  it('shows the shape while loading, the data once there, and why it failed', () => {
    const { rerender } = render(<LoadState data={undefined} failure={undefined} rows={1}>{show}</LoadState>);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();

    rerender(<LoadState data="x" failure={undefined}>{show}</LoadState>);
    expect(screen.getByText('got x')).toBeInTheDocument();

    rerender(<LoadState data={undefined} failure={new Error('down')}>{show}</LoadState>);
    expect(screen.getByText('down')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
