// SPDX-License-Identifier: Apache-2.0
import type { Capabilities } from '@gen/api/types.gen';
import { FEATURES } from '@/shared/capabilities/model';

/** What the demo server says it serves: the API version the console speaks, and every feature it has a screen for. */
export function demoCapabilities(features: readonly string[] = FEATURES): Capabilities {
  return { apiVersion: 1, serverVersion: '1.4.0', features: [...features] };
}
