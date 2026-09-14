import "server-only";
import { paidAccessRequired } from "./access-policy";
import { billingError, billingJson, billingRuntime, billingUser } from "./server";

/** Run before collecting or serializing paid data, including debug/demo paths. */
export async function paidFeatureDenial(feature: "signals" | "spotStats"): Promise<Response | null> {
  if (!paidAccessRequired()) return null;
  try {
    const user = await billingUser();
    const runtime = billingRuntime();
    if (!runtime) return billingJson({ message: "Paid access is temporarily unavailable. No payment is required while billing is unavailable." }, 503);
    const access = await runtime.service.entitlements(user.id);
    if (!access[feature]) return billingJson({ message: feature === "signals" ? "A Signals subscription is required. View plans in Your account." : "A Spot Stats subscription is required. View plans in Your account." }, 403);
    return null;
  } catch (error) { return billingError(error); }
}
