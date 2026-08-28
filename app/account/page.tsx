import Link from "next/link";

import { AccountAccessForm } from "@/app/account/AccountAccessForm";
import { signOut } from "@/app/account/actions";
import { SurfAppHeader } from "@/components/surf/SurfAppHeader";
import { SurfBottomNav } from "@/components/surf/SurfBottomNav";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = supabase ? await supabase.auth.getClaims() : { data: null };
  const claims = data?.claims;
  const email = typeof claims?.email === "string" ? claims.email : "Surf member";

  return (
    <div className="surf-bg min-h-full flex-1 bg-[color:var(--surf-base)]">
      <main className="surf-content mx-auto w-full max-w-md px-5 pb-28">
        <SurfAppHeader
          title="Your account"
          subtitle="One identity for saved context, alerts, and your Surf plan."
        />

        {!supabase ? (
          <section className="rounded-[22px] border border-[color:var(--surf-line-08)] bg-[color:var(--surf-surface)] p-5">
            <p className="text-sm font-semibold text-[color:var(--surf-ink-solid)]">Accounts are being connected.</p>
            <p className="mt-2 text-sm leading-6 text-[color:var(--surf-ink-55)]">
              Games and Signals remain available while account configuration finishes.
            </p>
          </section>
        ) : claims ? (
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
              <p className="text-xs leading-5 text-[color:var(--surf-ink-55)]">
                Your account is ready. Saved teams, signal alerts, and subscription access can now attach to this identity.
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
