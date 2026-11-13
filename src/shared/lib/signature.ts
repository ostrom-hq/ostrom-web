// SPDX-License-Identifier: Apache-2.0

/** The key id written in a receipt signature (`ed25519;kid=…;sha256=…;sig=…`). */
export function keyIdOf(signature: string): string | undefined {
  return /(?:^|;)kid=([0-9a-f]+)(?:;|$)/.exec(signature)?.[1];
}
