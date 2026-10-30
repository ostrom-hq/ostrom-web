import { createSafeStorage, safeLocalStorage } from '@/shared/lib/safeStorage';

function blocked(): Storage {
  throw new DOMException('The operation is insecure.', 'SecurityError');
}

describe('createSafeStorage', () => {
  it('reads, writes and removes through the real storage', () => {
    expect(safeLocalStorage.setItem('k', 'v')).toBe(true);
    expect(safeLocalStorage.getItem('k')).toBe('v');
    expect(safeLocalStorage.removeItem('k')).toBe(true);
    expect(safeLocalStorage.getItem('k')).toBeNull();
  });

  it('degrades to nothing stored when the storage is blocked', () => {
    const storage = createSafeStorage(blocked);
    expect(storage.getItem('k')).toBeNull();
    expect(storage.setItem('k', 'v')).toBe(false);
    expect(storage.removeItem('k')).toBe(false);
  });
});
