import { BILLING_UNAVAILABLE } from "@/lib/billing/config";
import { billingError, billingJson, billingRuntime, billingUser } from "@/lib/billing/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await billingUser();
    const runtime = billingRuntime();
    if (!runtime) return billingJson({ available: false, message: BILLING_UNAVAILABLE });
    return billingJson(await runtime.service.status(user.id));
  } catch (error) { return billingError(error); }
}
