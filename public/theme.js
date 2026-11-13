// SPDX-License-Identifier: Apache-2.0
// Applies a pinned theme before the first paint (key and values: src/shared/theme/themeStore.ts). A file, not
// an inline script, so the Content-Security-Policy allows scripts from 'self' only (audit S2-09).
try {
  var pinned = window.localStorage.getItem('ostrom.theme');
  if (pinned === 'light' || pinned === 'dark') document.documentElement.dataset.theme = pinned;
} catch (e) {}
