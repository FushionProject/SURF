"use client";

import { useActionState, useState } from "react";

import {
  signIn,
  signUp,
  type AuthActionState,
} from "@/app/account/actions";

type Mode = "sign-in" | "create";
const initialAuthActionState: AuthActionState = { status: "idle", message: "" };

export function AccountAccessForm() {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [signInState, signInAction, signInPending] = useActionState(signIn, initialAuthActionState);
  const [signUpState, signUpAction, signUpPending] = useActionState(signUp, initialAuthActionState);
  const state = mode === "sign-in" ? signInState : signUpState;
  const pending = mode === "sign-in" ? signInPending : signUpPending;

  return (
    <section className="overflow-hidden rounded-[22px] border border-[color:var(--surf-line-08)] bg-[color:var(--surf-surface)] shadow-[var(--surf-card-shadow)]">
      <div className="border-b border-[color:var(--surf-line-06)] px-5 pb-5 pt-6">
        <div className="mb-5 inline-flex rounded-xl border border-[color:var(--surf-line-08)] bg-[color:var(--surf-sunken)] p-1">
          {(["sign-in", "create"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setMode(option)}
              className={
                mode === option
                  ? "rounded-lg bg-[color:var(--surf-fill-08)] px-4 py-2 text-xs font-semibold text-[color:var(--surf-ink-solid)]"
                  : "rounded-lg px-4 py-2 text-xs font-semibold text-[color:var(--surf-ink-45)]"
              }
            >
              {option === "sign-in" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>
        <h2 className="text-xl font-semibold tracking-[-0.03em] text-[color:var(--surf-ink-solid)]">
          {mode === "sign-in" ? "Welcome back" : "Make Surf yours"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-[color:var(--surf-ink-55)]">
          {mode === "sign-in"
            ? "Sign in to manage your Surf account and plan."
            : "Create your Surf account. Games and Signals remain available without signing in."}
        </p>
      </div>

      <form action={mode === "sign-in" ? signInAction : signUpAction} className="space-y-4 p-5">
        <label className="block">
          <span className="mb-2 block text-xs font-semibold text-[color:var(--surf-ink-55)]">
            Email
          </span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            className="w-full rounded-xl border border-[color:var(--surf-line-08)] bg-[color:var(--surf-inner)] px-4 py-3 text-sm text-[color:var(--surf-ink-solid)] outline-none transition-colors placeholder:text-[color:var(--surf-ink-25)] focus:border-[color:var(--surf-primary)]/45"
            placeholder="you@example.com"
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-xs font-semibold text-[color:var(--surf-ink-55)]">
            Password
          </span>
          <input
            name="password"
            type="password"
            minLength={mode === "create" ? 8 : undefined}
            maxLength={128}
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            required
            className="w-full rounded-xl border border-[color:var(--surf-line-08)] bg-[color:var(--surf-inner)] px-4 py-3 text-sm text-[color:var(--surf-ink-solid)] outline-none transition-colors placeholder:text-[color:var(--surf-ink-25)] focus:border-[color:var(--surf-primary)]/45"
            placeholder={mode === "sign-in" ? "Your password" : "At least 8 characters"}
          />
        </label>

        {state.message ? (
          <p
            aria-live="polite"
            className={
              state.status === "success"
                ? "rounded-xl border border-[color:var(--surf-positive)]/20 bg-[color:var(--surf-positive)]/5 px-3 py-2.5 text-xs leading-5 text-[color:var(--surf-positive)]"
                : "rounded-xl border border-[color:var(--surf-negative)]/20 bg-[color:var(--surf-negative)]/5 px-3 py-2.5 text-xs leading-5 text-[color:var(--surf-negative)]"
            }
          >
            {state.message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl border border-[color:var(--surf-primary)]/35 bg-[color:var(--surf-primary)] px-4 py-3 text-sm font-semibold text-black transition-opacity disabled:opacity-50"
        >
          {pending ? "Connecting…" : mode === "sign-in" ? "Sign in" : "Create account"}
        </button>
      </form>
    </section>
  );
}
