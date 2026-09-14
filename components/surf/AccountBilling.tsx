"use client";

import { useEffect, useState } from "react";
import { BILLING_UNAVAILABLE, displayPrice, isStripeRedirect, isPaidPlanId, type PaidPlanId } from "@/lib/billing/config";
import type { BillingStatus } from "@/lib/billing/service";

export function AccountBilling() {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/billing/status", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message ?? BILLING_UNAVAILABLE);
        setStatus(body);
      })
      .catch((error) => { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : BILLING_UNAVAILABLE); });
    return () => controller.abort();
  }, []);

  async function open(action: "checkout" | "portal", planId?: PaidPlanId) {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(`/api/billing/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action === "checkout" ? { planId } : {}) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "Billing could not be opened.");
      if (!isStripeRedirect(body.url, action === "checkout" ? "checkout" : "portal")) throw new Error("Billing could not be opened safely.");
      window.location.assign(body.url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Billing could not be opened.");
      setPending(false);
    }
  }
  const plan = status?.plan;
  const amount = plan ? displayPrice(plan.amount, plan.currency) : undefined;

  return (
    <section className="mt-5 border border-[color:var(--surf-primary)]/35 bg-[color:var(--surf-surface)] p-5" aria-labelledby="surf-billing-title">
      <h2 id="surf-billing-title" className="text-lg font-semibold text-[color:var(--surf-ink-solid)]">Your plan</h2>
      {status?.available && (plan || status.canManage) ? (
        <>
          {plan ? <><p className="mt-3 text-base font-semibold">{plan.name}</p>
            <p className="mt-1 text-sm text-[color:var(--surf-ink-70)]">{amount} / {plan.intervalCount > 1 ? `${plan.intervalCount} ${plan.interval}s` : plan.interval}</p></> : null}
          {status.message ? <p className="mt-3 text-sm leading-6 text-[color:var(--surf-ink-70)]">{status.message}</p> : null}
          {status.testMode ? <p className="mt-2 text-sm text-[color:var(--surf-primary)]">Test mode · no real payment</p> : null}
          {status.subscription ? <p className="mt-3 text-sm">Subscription: {status.subscription.status.replaceAll("_", " ")}{status.subscription.cancelAt ? " · cancellation scheduled" : ""}</p> : null}
          <div className="mt-4 flex flex-wrap gap-3">
            {status.canSubscribe ? status.catalog?.filter((entry) => isPaidPlanId(entry.id)).map((entry) => {
              const available = isPaidPlanId(entry.id) && status.purchasablePlans?.includes(entry.id);
              return <button key={entry.id} type="button" disabled={pending || !available} onClick={() => { if (isPaidPlanId(entry.id)) void open("checkout", entry.id); }} className="bg-[color:var(--surf-primary)] px-4 py-3 text-sm font-semibold text-black disabled:opacity-50">{!available ? `${entry.name} · coming soon` : pending ? "Opening…" : `Review ${entry.name} · ${displayPrice(entry.amount, entry.currency)}/month`}</button>;
            }) : null}
            {status.canManage ? <button type="button" disabled={pending} onClick={() => void open("portal")} className="border border-[color:var(--surf-line-08)] px-4 py-3 text-sm font-semibold disabled:opacity-50">Manage billing</button> : null}
          </div>
          <p className="mt-3 text-sm leading-6 text-[color:var(--surf-ink-55)]">Stripe shows the full recurring charge before you confirm. Returning from checkout does not by itself confirm payment.</p>
        </>
      ) : <p className="mt-3 text-sm leading-6 text-[color:var(--surf-ink-55)]">{status?.message ?? (message ? BILLING_UNAVAILABLE : "Checking billing availability…")}</p>}
      {message ? <p className="mt-3 text-sm leading-6 text-[color:var(--surf-ink-70)]" role="status">{message}</p> : null}
    </section>
  );
}
