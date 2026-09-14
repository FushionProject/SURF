import { BILLING_UNAVAILABLE } from "@/lib/billing/config";
import { billingError, billingJson, billingRuntime, readBillingBody } from "@/lib/billing/server";
import { BillingError } from "@/lib/billing/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const runtime = billingRuntime();
    if (!runtime) throw new BillingError(BILLING_UNAVAILABLE);
    const signature = request.headers.get("stripe-signature");
    if (!signature) throw new BillingError("Missing webhook signature.", 400);
    if (Number(request.headers.get("content-length") ?? "0") > 1_000_000) throw new BillingError("Webhook is too large.", 413);
    const raw = await readBillingBody(request, 1_000_000);
    await runtime.service.webhook(raw, signature);
    return billingJson({ received: true });
  } catch (error) { return billingError(error); }
}
