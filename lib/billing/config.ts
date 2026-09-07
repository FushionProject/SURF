export type BillingConfig = {
  key: string;
  webhookSecret: string;
  priceId: string;
  origin: string;
  livemode: boolean;
};

/** Billing is deliberately opt-in. A key alone never turns on paid access. */
export function readBillingConfig(env: Record<string, string | undefined> = process.env): BillingConfig | undefined {
  if (env.SURF_BILLING_ENABLED !== "true") return undefined;
  const key = env.STRIPE_RESTRICTED_KEY || env.STRIPE_SECRET_KEY;
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
  const priceId = env.STRIPE_PRICE_ID;
  if (!key || !/^[rs]k_(test|live)_\S+$/.test(key) || !webhookSecret?.startsWith("whsec_") || !/^price_[A-Za-z0-9]+$/.test(priceId ?? "")) return undefined;
  const livemode = /^[rs]k_live_/.test(key);
  if (livemode && env.SURF_BILLING_LIVE_ENABLED !== "true") return undefined;
  try {
    const site = new URL(env.NEXT_PUBLIC_SITE_URL ?? "");
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(site.hostname);
    if (site.username || site.password || site.search || site.hash || site.pathname !== "/") return undefined;
    if (site.protocol !== "https:" && !(site.protocol === "http:" && local && !livemode && env.NODE_ENV !== "production")) return undefined;
    return { key, webhookSecret, priceId: priceId!, origin: site.origin, livemode };
  } catch {
    return undefined;
  }
}

export function isBillingSameOrigin(request: Request, origin: string): boolean {
  return request.headers.get("origin") === origin
    && request.headers.get("sec-fetch-site") !== "cross-site";
}

export function isStripeRedirect(value: unknown, kind: "checkout" | "portal"): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && url.port === ""
      && url.hostname === (kind === "checkout" ? "checkout.stripe.com" : "billing.stripe.com");
  } catch {
    return false;
  }
}

export const BILLING_UNAVAILABLE = "Billing is not available yet. Games and Signals remain available.";

export function displayPrice(amount: number, currency: string): string {
  const formatter = new Intl.NumberFormat(undefined, { style: "currency", currency });
  // Stripe still represents ISK and UGX with two decimal places even though
  // those currencies are displayed without fractional digits.
  const exponent = ["isk", "ugx"].includes(currency.toLowerCase()) ? 2 : (formatter.resolvedOptions().maximumFractionDigits ?? 2);
  return formatter.format(amount / (10 ** exponent));
}
