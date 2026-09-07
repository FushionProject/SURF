import "server-only";

import Stripe from "stripe";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSurfSupabaseClient } from "@/lib/surf/supabasePersistence";
import { BILLING_UNAVAILABLE, isBillingSameOrigin, readBillingConfig } from "./config";
import { BillingError, createBillingService, type BillingCustomer, type BillingStore } from "./service";

const jsonHeaders = { "Cache-Control": "private, no-store", "Vary": "Cookie, Origin", "X-Content-Type-Options": "nosniff" };

export function billingJson(data: unknown, status = 200) {
  return Response.json(data, { status, headers: jsonHeaders });
}

export function billingError(error: unknown) {
  // Never return Stripe/provider errors, identifiers, or secret configuration.
  return billingJson({ message: error instanceof BillingError ? error.message : "Billing is temporarily unavailable. Please try again later." }, error instanceof BillingError ? error.status : 503);
}

export async function readBillingBody(request: Request, maximumBytes: number) {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximumBytes) {
        await reader.cancel();
        throw new BillingError("Billing request is too large.", 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally { reader.releaseLock(); }
}

export async function billingUser() {
  const client = await createSupabaseServerClient();
  if (!client) throw new BillingError("Please sign in to use billing.", 401);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user || data.user.is_anonymous || !data.user.email_confirmed_at) {
    throw new BillingError("Please sign in with a confirmed account to use billing.", 401);
  }
  return data.user;
}

export function billingRuntime() {
  const config = readBillingConfig();
  const database = getSurfSupabaseClient();
  if (!config || !database) return undefined;
  const query = () => database.from("surf_billing_customers");
  const selection = "user_id,livemode,stripe_customer_id,checkout_nonce,checkout_session_id";
  const timeout = () => AbortSignal.timeout(8_000);
  const store: BillingStore = {
    async getCustomer(userId, livemode) {
      const { data, error } = await query().select(selection).eq("user_id", userId).eq("livemode", livemode).abortSignal(timeout()).maybeSingle();
      if (error) throw new BillingError(BILLING_UNAVAILABLE);
      return data as BillingCustomer | null;
    },
    async bindCustomer(userId, livemode, customerId) {
      const { error } = await query().upsert({ user_id: userId, livemode, stripe_customer_id: customerId }, { onConflict: "user_id,livemode", ignoreDuplicates: true }).abortSignal(timeout());
      if (error) throw new BillingError(BILLING_UNAVAILABLE);
      const customer = await this.getCustomer(userId, livemode);
      if (!customer) throw new BillingError(BILLING_UNAVAILABLE);
      return customer;
    },
    async prepareCheckout(userId, livemode, rotateNonce) {
      const { data, error } = await database.rpc("surf_prepare_billing_checkout", { p_user_id: userId, p_livemode: livemode, p_rotate_nonce: rotateNonce ?? null }).abortSignal(timeout()).single();
      if (error || !data) throw new BillingError(BILLING_UNAVAILABLE);
      return data as BillingCustomer;
    },
    async saveCheckout(userId, livemode, nonce, sessionId) {
      const { data, error } = await query().update({ checkout_session_id: sessionId }).eq("user_id", userId).eq("livemode", livemode).eq("checkout_nonce", nonce).select("user_id").abortSignal(timeout()).single();
      if (error || !data) throw new BillingError("Checkout is being prepared. Please retry shortly.");
    },
    async hasCustomer(customerId, livemode) {
      const { data, error } = await query().select("user_id").eq("stripe_customer_id", customerId).eq("livemode", livemode).abortSignal(timeout()).maybeSingle();
      if (error) throw new BillingError(BILLING_UNAVAILABLE);
      return !!data;
    },
    async recordEvent(eventId, livemode, eventType, created, subscription, observedAt) {
      if (!subscription) return;
      const iso = (seconds: number | null) => seconds === null ? null : new Date(seconds * 1000).toISOString();
      const { error } = await database.rpc("surf_record_billing_event", {
        p_event_id: eventId, p_livemode: livemode, p_event_type: eventType, p_created_at: iso(created),
        p_subscription_id: subscription.id, p_customer_id: subscription.customerId, p_price_id: subscription.priceId,
        p_status: subscription.status, p_period_end: iso(subscription.periodEnd), p_cancel_at: iso(subscription.cancelAt),
        p_observed_at: new Date(observedAt).toISOString(),
      }).abortSignal(timeout());
      if (error) throw new BillingError("Billing update could not be saved.");
    },
  };
  const stripe = new Stripe(config.key, { apiVersion: "2026-08-26.dahlia", maxNetworkRetries: 2, timeout: 10_000 });
  return { config, service: createBillingService(stripe, store, config) };
}

export async function billingMutation(request: Request, action: "checkout" | "portal") {
  try {
    const runtime = billingRuntime();
    if (!runtime) throw new BillingError(BILLING_UNAVAILABLE);
    if (!isBillingSameOrigin(request, runtime.config.origin)) throw new BillingError("Please open billing from the Surf account page.", 403);
    if (request.headers.get("content-type")?.split(";")[0] !== "application/json") throw new BillingError("Invalid billing request.", 400);
    const text = await readBillingBody(request, 256);
    if (text.trim() !== "{}") throw new BillingError("Invalid billing request.", 400);
    const user = await billingUser();
    const url = await runtime.service[action](user.id);
    return billingJson({ url });
  } catch (error) { return billingError(error); }
}
