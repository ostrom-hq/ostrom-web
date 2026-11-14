// SPDX-License-Identifier: Apache-2.0
import { render, screen } from '@testing-library/react';
import { MorePeople } from '@/shared/ui/MorePeople';

const more = (): void => undefined;

describe('MorePeople', () => {
  it('is nothing once every page is read', () => {
    const { container } = render(<MorePeople people={{ more: undefined, loadingMore: false }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('says the next page failed beside the button that asks for it again', () => {
    render(<MorePeople people={{ more, loadingMore: false, moreFailed: true }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('The next people could not be read.');
    expect(screen.getByRole('button', { name: 'Show more people' })).toBeEnabled();
  });

  it('says nothing of the failure while it is asked again', () => {
    render(<MorePeople people={{ more, loadingMore: true, moreFailed: true }} />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Show more people' })).toBeDisabled();
  });
});
