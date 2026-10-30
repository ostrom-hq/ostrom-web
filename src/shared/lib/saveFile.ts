// SPDX-License-Identifier: AGPL-3.0-only

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
  // The browser has started the download by now; the address of the file is let go on the next turn.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}
