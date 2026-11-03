// SPDX-License-Identifier: AGPL-3.0-only
// Node's AsyncLocalStorage, the one Node API of the test helpers (handlerFetch.ts): the console is typed without Node.
declare module 'node:async_hooks' {
  export class AsyncLocalStorage<T> {
    getStore(): T | undefined;
    run<R>(store: T, callback: () => R): R;
  }
}
