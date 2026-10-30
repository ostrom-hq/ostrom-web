/**
 * localStorage that never throws: blocked storage (strict privacy settings, sandboxed frames) or a full quota
 * degrades to "nothing stored" instead of a blank page or a dead button.
 */
export interface SafeStorage {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => boolean;
  readonly removeItem: (key: string) => boolean;
}

export function createSafeStorage(resolve: () => Storage): SafeStorage {
  return {
    getItem: (key) => {
      try {
        return resolve().getItem(key);
      } catch {
        return null;
      }
    },
    setItem: (key, value) => {
      try {
        resolve().setItem(key, value);
        return true;
      } catch {
        return false;
      }
    },
    removeItem: (key) => {
      try {
        resolve().removeItem(key);
        return true;
      } catch {
        return false;
      }
    },
  };
}

export const safeLocalStorage: SafeStorage = createSafeStorage(() => window.localStorage);
