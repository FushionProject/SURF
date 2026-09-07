"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { friendlyAuthError, readCredentials, resolveAuthOrigin } from "@/lib/supabase/authSupport";

export type AuthActionState = {
  status: "idle" | "error" | "success";
  message: string;
};

async function appOrigin(): Promise<string | undefined> {
  const requestHeaders = await headers();
  return resolveAuthOrigin({
    configured: process.env.NEXT_PUBLIC_SITE_URL,
    requestOrigin: requestHeaders.get("origin"),
    requestHost: requestHeaders.get("host"),
    development: process.env.NODE_ENV === "development",
  });
}

export async function signIn(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const credentials = readCredentials(formData, "sign-in");
  if (credentials.error || !credentials.email || !credentials.password) {
    return { status: "error", message: credentials.error ?? "Enter your account details." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", message: "Accounts are not connected in this environment yet." };

  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: credentials.email,
      password: credentials.password,
    });
    if (error) return { status: "error", message: friendlyAuthError(error.message) };
  } catch {
    return { status: "error", message: "Account service is temporarily unavailable. Please try again." };
  }

  redirect("/account");
}

export async function signUp(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const credentials = readCredentials(formData, "create");
  if (credentials.error || !credentials.email || !credentials.password) {
    return { status: "error", message: credentials.error ?? "Enter your account details." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", message: "Accounts are not connected in this environment yet." };

  const origin = await appOrigin();
  if (!origin) return { status: "error", message: "Account confirmation is not configured for this site yet." };
  let signedIn = false;
  try {
    const { data, error } = await supabase.auth.signUp({
      email: credentials.email,
      password: credentials.password,
      options: { emailRedirectTo: `${origin}/auth/callback?next=/account` },
    });
    if (error) return { status: "error", message: friendlyAuthError(error.message) };
    signedIn = Boolean(data.session);
  } catch {
    return { status: "error", message: "Account service is temporarily unavailable. Please try again." };
  }
  if (signedIn) redirect("/account");

  return {
    status: "success",
    message: "Account started. Check your email to confirm it, then sign in.",
  };
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  if (supabase) await supabase.auth.signOut();
  redirect("/account");
}
