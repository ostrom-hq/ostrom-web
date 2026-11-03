// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';

/**
 * `/device?code=ABCD-EFGH`, the page `ostrom login` opens (the server's `verificationUriComplete`), or `/device` alone
 * (`verificationUri`), where the person types the code their terminal shows. Anything but one string reads as no code.
 */
export const deviceSearchSchema = z.object({
  code: z.string().optional().catch(undefined),
});

/** A code as typed, the way the terminal shows it: no spaces around, capitals. The server reads the rest. */
export function normalizeCode(typed: string): string {
  return typed.trim().toUpperCase();
}
