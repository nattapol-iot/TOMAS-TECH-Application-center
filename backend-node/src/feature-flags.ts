/**
 * API feature switches. Keep in sync with lib/feature-flags.ts on the front end.
 *
 * ESTIMATE_OVERHEAD_ENABLED — when false the ERP export no longer requires an
 * applied overhead policy and the `overhead_policy_missing` validation warning is
 * not emitted. Overhead snapshots and totals stay in the database untouched.
 */
export const ESTIMATE_OVERHEAD_ENABLED = false;
