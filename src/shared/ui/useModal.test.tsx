// SPDX-License-Identifier: Apache-2.0
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement, type RefObject, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useModal } from './useModal';

function Modal({
  onClose,
  buttons,
  returnTo,
}: {
  readonly onClose: () => void;
  readonly buttons: readonly string[];
  readonly returnTo?: RefObject<HTMLElement | null>;
}): ReactElement {
  const overlay = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useModal(overlay, panel, onClose, returnTo);
  return createPortal(
    <div ref={overlay}>
      <div ref={panel} role="dialog" aria-label="Test" tabIndex={-1}>
        {buttons.map((name) => (
          <button key={name} type="button">
            {name}
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}

/** A panel whose ref is never set: the hook has nothing to focus or go round. */
function Detached({ onClose }: { readonly onClose: () => void }): ReactElement {
  const overlay = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useModal(overlay, panel, onClose);
  return <p>detached</p>;
}

const nothing = (): void => undefined;

describe('useModal', () => {
  it('takes the focus, keeps Tab inside, and gives the focus back', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<button type="button">Opener</button>);
    const opener = screen.getByRole('button', { name: 'Opener' });
    opener.focus();
    render(<Modal onClose={nothing} buttons={['First', 'Middle', 'Last']} />);
    expect(screen.getByRole('dialog', { name: 'Test' })).toHaveFocus();
    expect(opener.closest('[inert]')).not.toBeNull();

    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Middle' })).toHaveFocus();
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus();
    await user.keyboard('a');
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus();
    unmount();
  });

  it('gives the focus to what it is told, or to what had it when that is not there', () => {
    const target: RefObject<HTMLElement | null> = { current: null };
    const { unmount: unmountOpener } = render(<button type="button">Opener</button>);
    const opener = screen.getByRole('button', { name: 'Opener' });
    opener.focus();
    const { unmount } = render(<Modal onClose={nothing} buttons={['Only']} returnTo={target} />);
    unmount();
    expect(opener).toHaveFocus();

    const { unmount: unmountTarget } = render(<button type="button">Target</button>);
    target.current = screen.getByRole('button', { name: 'Target' });
    opener.focus();
    const again = render(<Modal onClose={nothing} buttons={['Only']} returnTo={target} />);
    again.unmount();
    expect(screen.getByRole('button', { name: 'Target' })).toHaveFocus();
    unmountTarget();
    unmountOpener();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Modal onClose={onClose} buttons={['Only']} />);
    await user.tab();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Only' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('lets Tab be when the panel has nothing to reach, or is not there', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Modal onClose={nothing} buttons={[]} />);
    await user.tab();
    unmount();
    render(<Detached onClose={nothing} />);
    await user.tab();
    expect(screen.getByText('detached')).toBeInTheDocument();
  });
});
