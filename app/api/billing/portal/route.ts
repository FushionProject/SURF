import { billingMutation } from "@/lib/billing/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return billingMutation(request, "portal");
}
