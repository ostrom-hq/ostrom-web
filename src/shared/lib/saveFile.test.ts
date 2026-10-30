// SPDX-License-Identifier: AGPL-3.0-only
import { saveFile } from './saveFile';

describe('saveFile', () => {
  it('downloads the file under its name, then lets its address go', () => {
    vi.useFakeTimers();
    const create = vi.fn(() => 'blob:ostrom/1');
    const revoke = vi.fn();
    // jsdom has no object URLs: these two stand in for the browser's for this test only.
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke });
    const clicked: { href: string; download: string }[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push({ href: this.href, download: this.download });
    });
    try {
      saveFile(new Blob(['{}']), 'rcpt-1.json');
      expect(clicked).toEqual([{ href: 'blob:ostrom/1', download: 'rcpt-1.json' }]);
      expect(document.querySelector('a[download]')).toBeNull();
      expect(revoke).not.toHaveBeenCalled();
      vi.runAllTimers();
      expect(revoke).toHaveBeenCalledWith('blob:ostrom/1');
    } finally {
      click.mockRestore();
      Reflect.deleteProperty(URL, 'createObjectURL');
      Reflect.deleteProperty(URL, 'revokeObjectURL');
      vi.useRealTimers();
    }
  });
});
