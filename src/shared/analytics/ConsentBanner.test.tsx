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
    flush: () => calls.push('flush'),
  };
}

describe('ConsentBanner', () => {
  beforeEach(() => {
    useConsentStore.setState({ status: 'unknown' });
  });

  it('offers Accept and Refuse as equal buttons, with the privacy policy', () => {
    render(<ConsentBanner analytics={fakeAnalytics()} configured privacyUrl="https://ostrom.run/privacy" />);

    const region = screen.getByRole('region', { name: 'Usage statistics' });
    expect(region).toBeInTheDocument();
    const accept = screen.getByRole('button', { name: 'Accept' });
    const refuse = screen.getByRole('button', { name: 'Refuse' });
    expect(accept.className).toBe(refuse.className);
    expect(screen.getByRole('link', { name: 'Privacy policy' })).toHaveAttribute(
      'href',
      'https://ostrom.run/privacy',
    );
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
  it('reopens the banner', async () => {
    useConsentStore.setState({ status: 'granted' });
    render(<PrivacyChoices configured />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Privacy choices' }));

    expect(useConsentStore.getState().status).toBe('unknown');
  });

  it('is hidden when analytics are not configured', () => {
    render(<PrivacyChoices configured={false} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
