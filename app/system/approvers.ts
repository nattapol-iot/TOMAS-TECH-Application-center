import type { BootstrapData } from "./api-client";

/*
 * Approvers are named people, not a role (2026-11-25): the PR route's final approver and heads (migrations 097, 116) and the
 * estimate approvers (migration 101) decide without the approve permission. The bootstrap says who they are (approverOf),
 * and these read it together with the permission, so the menu, the counts and the guides offer them what they decide.
 */
type ApproverView = Pick<BootstrapData, "permissions" | "approverOf">;

/** Decides purchase requisitions: procurement.approve, or named on the PR approval route. */
export const approvesPurchases = (bootstrap: ApproverView): boolean => bootstrap.permissions.includes("procurement.approve") || bootstrap.approverOf?.purchases === true;

/** Decides estimates in review: estimate.approve, or one of the listed estimate approvers. */
export const approvesEstimates = (bootstrap: ApproverView): boolean => bootstrap.permissions.includes("estimate.approve") || bootstrap.approverOf?.estimates === true;
