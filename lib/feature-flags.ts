/**
 * Front-end feature switches. Keep in sync with backend-node/src/feature-flags.ts.
 *
 * ESTIMATE_OVERHEAD_ENABLED — Overhead policy panel, overhead columns and the
 * "approve overhead before ERP export" gate. Switched off on 2026-09-12 by request;
 * flip back to true to restore the feature (no data is removed while it is off).
 */
export const ESTIMATE_OVERHEAD_ENABLED = false;
