// SPDX-License-Identifier: AGPL-3.0-only
import type { FeatureKey } from '@/shared/capabilities/model';

/** The console's screens, in the order the navigation shows them: the bar on a wide screen, the menu on a phone. */
interface NavLink {
  readonly to: string;
  readonly label: string;
  /** The server feature the screen needs: without it, the entry is hidden and the address says so. */
  readonly feature?: FeatureKey;
}

export const NAV_LINKS = [
  { to: '/', label: 'home' },
  { to: '/yes', label: 'yes' },
  { to: '/waits', label: 'waits', feature: 'waits.v1' },
  { to: '/sessions', label: 'sessions' },
  { to: '/receipts', label: 'receipts' },
  { to: '/members', label: 'members' },
  { to: '/github', label: 'github', feature: 'github.v1' },
  { to: '/workflows', label: 'workflows' },
  { to: '/runs', label: 'runs' },
  { to: '/approvers', label: 'approvers' },
  { to: '/rules', label: 'rules' },
  { to: '/activity', label: 'activity' },
  { to: '/decisions', label: 'decisions' },
  { to: '/audit', label: 'audit' },
  { to: '/policy', label: 'policy' },
  { to: '/mcp', label: 'mcp' },
  { to: '/secrets', label: 'secrets' },
  { to: '/import', label: 'import', feature: 'import.teamcode.v1' },
  { to: '/spend', label: 'spend' },
  { to: '/billing', label: 'billing', feature: 'billing.v1' },
  { to: '/settings', label: 'settings' },
  { to: '/account', label: 'account' },
  { to: '/tokens', label: 'tokens' },
  { to: '/cloud', label: 'cloud', feature: 'runners.cloud.v1' },
  { to: '/automations', label: 'automations', feature: 'automations.v1' },
  { to: '/artifacts', label: 'artifacts', feature: 'artifacts.v1' },
  { to: '/accounts', label: 'accounts' },
  { to: '/signin', label: 'signin' },
] as const satisfies readonly NavLink[];

/** The screens that need a server feature, by address. */
const NEEDS = NAV_LINKS.flatMap((link) => ('feature' in link ? [link] : []));

/** The entry of the screen at `pathname` when it needs a server feature (`/billing`, `/automations/…`). */
export function needOf(
  pathname: string,
): { readonly label: (typeof NAV_LINKS)[number]['label']; readonly feature: FeatureKey } | undefined {
  return NEEDS.find((link) => pathname === link.to || pathname.startsWith(`${link.to}/`));
}
