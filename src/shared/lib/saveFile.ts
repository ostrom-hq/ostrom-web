// SPDX-License-Identifier: Apache-2.0

/**
 * Hands the person a file the console fetched itself (with the session cookie), as a download named `name`. A
 * plain link could not carry the cookie to another origin, nor name the file there.
 */
export function saveFile(blob: Blob, name: string, doc: Document = document): void {
  const url = URL.createObjectURL(blob);
  const link = doc.createElement('a');
  link.href = url;
  link.download = name;
  link.rel = 'noopener';
  doc.body.append(link);
  link.click();
  link.remove();
  // Some browsers read the file after `click` returns: its address is let go a minute later, not at once.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60_000);
}
