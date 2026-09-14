import Link from "next/link";

import { AccountAccessForm } from "@/app/account/AccountAccessForm";
import { AccountBilling } from "@/components/surf/AccountBilling";
import { signOut } from "@/app/account/actions";
import { SurfAppHeader } from "@/components/surf/SurfAppHeader";
import { SurfBottomNav } from "@/components/surf/SurfBottomNav";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AccountPage({ searchParams }: {
  searchParams: Promise<{ confirmation?: string | string[] }>;
}) {
  const supabase = await createSupabaseServerClient();
  const confirmationFailed = (await searchParams).confirmation === "failed";
  let member: { id: string; email?: string } | null = null;
  let accountUnavailable = false;
  if (supabase) {
    try {
      const { data, error } = await supabase.auth.getUser();
      member = error ? null : data.user;
      accountUnavailable = Boolean(error && error.name !== "AuthSessionMissingError");
    } catch {
      accountUnavailable = true;
    }
  }
  const email = member?.email ?? "Surf member";

  return (
    <div className="bn-app bn-secondary-page surf-bg min-h-full flex-1 bg-[color:var(--surf-base)]">
      <main className="surf-content mx-auto w-full max-w-md px-5 pb-28">
        <SurfAppHeader
          title="Your account"
          subtitle="Sign in to your Surf account and manage your plan."
        />

        {confirmationFailed && <p role="alert" className="mb-5 border border-[color:var(--surf-line)] p-4 text-sm leading-6">
          That confirmation link could not be verified. It may have expired or already been used. Try signing in, or request a new confirmation by starting signup again.
        </p>}
        {accountUnavailable && <p role="status" className="mb-5 border border-[color:var(--surf-line)] p-4 text-sm leading-6">
          We could not verify your session right now. Try signing in again. Games and Signals are still available.
        </p>}

        {!supabase ? (
          <section className="rounded-[22px] border border-[color:var(--surf-line-08)] bg-[color:var(--surf-surface)] p-5">
            <p className="text-sm font-semibold text-[color:var(--surf-ink-solid)]">Accounts are being connected.</p>
            <p className="mt-2 text-sm leading-6 text-[color:var(--surf-ink-55)]">
              Games and Signals remain available while account configuration finishes.
            </p>
          </section>
        ) : member ? (
          <section className="overflow-hidden rounded-[22px] border border-[color:var(--surf-line-08)] bg-[color:var(--surf-surface)] shadow-[var(--surf-card-shadow)]">
            <div className="border-b border-[color:var(--surf-line-06)] p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[color:var(--surf-primary)]/25 bg-[color:var(--surf-primary)]/10 text-sm font-semibold text-[color:var(--surf-primary)]">
                  {email.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--surf-positive)]" />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--surf-ink-40)]">
                      Signed in
                    </span>
                  </div>
                  <p className="mt-1 truncate text-sm font-semibold text-[color:var(--surf-ink-solid)]">{email}</p>
                </div>
              </div>
            </div>
            <div className="p-5">
              <p className="text-sm leading-6 text-[color:var(--surf-ink-55)]">
                You’re signed in. Your watchlist is currently saved on this device; cross-device syncing and alerts are not enabled yet.
              </p>
              <form action={signOut} className="mt-5">
                <button
                  type="submit"
                  className="w-full rounded-xl border border-[color:var(--surf-line-08)] bg-[color:var(--surf-inner)] px-4 py-3 text-sm font-semibold text-[color:var(--surf-ink-70)] transition-colors hover:text-[color:var(--surf-ink-solid)]"
                >
                  Sign out
                </button>
              </form>
            </div>
          </section>
        ) : (
          <AccountAccessForm />
        )}

        {member && <AccountBilling />}

        <Link
          href="/games"
          className="mt-5 block text-center text-xs font-semibold text-[color:var(--surf-ink-40)] transition-colors hover:text-[color:var(--surf-ink-70)]"
        >
          Continue without an account
        </Link>
      </main>
      <SurfBottomNav />
    </div>
  );
}
