import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/shared/i18n/i18n';
import type { Analytics } from '@/shared/analytics/analytics';
import { ConsentBanner, PrivacyChoices } from '@/shared/analytics/ConsentBanner';
import { useConsentStore } from '@/shared/analytics/consent';

function fakeAnalytics(): Analytics & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    capture: (event) => calls.push(`capture:${event}`),
    pageview: (path) => calls.push(`pageview:${path}`),
    identify: (user) => calls.push(`identify:${user}`),
    forget: () => calls.push('forget'),
    reset: () => calls.push('reset'),
    flush: () => calls.push('flush'),
  };
}

describe('ConsentBanner', () => {
  beforeEach(() => {
    useConsentStore.setState({ status: 'unknown', reopened: false });
  });

  it('offers Accept and Refuse as equal buttons, with the privacy policy', () => {
    render(<ConsentBanner analytics={fakeAnalytics()} configured privacyUrl="https://ostrom.run/privacy" />);

    const region = screen.getByRole('region', { name: 'Usage statistics' });
    expect(region).toBeInTheDocument();
    const accept = screen.getByRole('button', { name: 'Accept' });
    const refuse = screen.getByRole('button', { name: 'Refuse' });
    expect(accept.className).toBe(refuse.className);
    const link = screen.getByRole('link', { name: 'Privacy policy' });
    expect(link).toHaveAttribute('href', 'https://ostrom.run/privacy');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(region).not.toHaveFocus();
  });

  it('takes the focus when reopened from the footer', () => {
    useConsentStore.setState({ status: 'unknown', reopened: true });
    render(<ConsentBanner analytics={fakeAnalytics()} configured privacyUrl="/privacy" />);

    expect(screen.getByRole('region', { name: 'Usage statistics' })).toHaveFocus();
  });

  it('a yes is recorded and announced, then the banner leaves', async () => {
    const analytics = fakeAnalytics();
    render(<ConsentBanner analytics={analytics} configured privacyUrl="/privacy" />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Accept' }));

    expect(useConsentStore.getState().status).toBe('granted');
    expect(analytics.calls).toEqual(['capture:consent_updated']);
    expect(screen.queryByRole('region', { name: 'Usage statistics' })).not.toBeInTheDocument();
  });

  it('a no forgets everything and sends nothing', async () => {
    const analytics = fakeAnalytics();
    render(<ConsentBanner analytics={analytics} configured privacyUrl="/privacy" />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Refuse' }));

    expect(useConsentStore.getState().status).toBe('denied');
    expect(analytics.calls).toEqual(['forget']);
  });

  it('asks nothing when analytics are not configured or already decided', () => {
    const { rerender } = render(
      <ConsentBanner analytics={fakeAnalytics()} configured={false} privacyUrl="/p" />,
    );
    expect(screen.queryByRole('region')).not.toBeInTheDocument();

    useConsentStore.setState({ status: 'denied' });
    rerender(<ConsentBanner analytics={fakeAnalytics()} configured privacyUrl="/p" />);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });
});

describe('PrivacyChoices', () => {
  it('withdraws the choice, forgets the browser and reopens the banner', async () => {
    useConsentStore.setState({ status: 'granted' });
    const analytics = fakeAnalytics();
    render(<PrivacyChoices analytics={analytics} configured />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Privacy choices' }));

    expect(useConsentStore.getState()).toMatchObject({ status: 'unknown', reopened: true });
    expect(analytics.calls).toEqual(['forget']);
  });

  it('is hidden when analytics are not configured', () => {
    render(<PrivacyChoices analytics={fakeAnalytics()} configured={false} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
