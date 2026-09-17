import "server-only";
import { paidAccessRequired } from "./access-policy";
import { hasCompAccess } from "./comp-access";
import { billingRuntime, billingUser } from "./server";
import { resolveViewerHasPro } from "./viewer-access-policy";

/** The deliberate switch. Read here rather than via `readBillingConfig`, which
 *  also returns undefined for a switched-on but invalid configuration. */
export const billingEnabled = (env: Record<string, string | undefined> = process.env) => env.SURF_BILLING_ENABLED === "true";

/** Whether the current viewer sees the full paid product: a local preview, a
 *  comp-access reviewer, or a verified Surf Pro subscriber — or anyone at all
 *  while billing is switched off, since nothing is for sale. Free viewers get
 *  the featured matchup only. Never throws; use `paidFeatureDenial` where a
 *  hard denial response is needed instead. */
export function viewerHasPro(): Promise<boolean> {
  return resolveViewerHasPro({ paidAccessRequired, billingEnabled, billingUser, hasCompAccess, billingRuntime });
}
