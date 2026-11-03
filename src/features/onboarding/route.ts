// SPDX-License-Identifier: AGPL-3.0-only
// What app/ reads before this feature's screens load (the router loads them lazily, a chunk per feature):
// nothing here may import a screen or a component, or the screens ship in the first download again.
export { inviteToken } from './inviteLink';
