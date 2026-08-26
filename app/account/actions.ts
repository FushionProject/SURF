"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthActionState = {
  status: "idle" | "error" | "success";
  message: string;
};

function readCredentials(formData: FormData): { email?: string; password?: string; error?: string } {
  const emailValue = formData.get("email");
  const passwordValue = formData.get("password");
  const email = typeof emailValue === "string" ? emailValue.trim().toLowerCase() : "";
  const password = typeof passwordValue === "string" ? passwordValue : "";

  if (!email || email.length > 254 || !email.includes("@")) {
    return { error: "Enter a valid email address." };
  }
  if (password.length < 8) {
    return { error: "Use at least 8 characters for your password." };
  }
  if (password.length > 128) {
    return { error: "That password is too long." };
  }
  return { email, password };
}

function friendlyAuthError(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials")) return "Email or password is incorrect.";
  if (normalized.includes("rate limit") || normalized.includes("too many")) {
    return "Too many attempts. Wait a moment and try again.";
  }
  if (normalized.includes("password")) return "That password does not meet the account requirements.";
  return "Surf could not complete that account request. Try again.";
}

async function appOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) return configured;
  const requestHeaders = await headers();
  return requestHeaders.get("origin") ?? "http://localhost:3000";
}

export async function signIn(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const credentials = readCredentials(formData);
  if (credentials.error || !credentials.email || !credentials.password) {
    return { status: "error", message: credentials.error ?? "Enter your account details." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", message: "Accounts are not connected in this environment yet." };

  const { error } = await supabase.auth.signInWithPassword({
    email: credentials.email,
    password: credentials.password,
  });
  if (error) return { status: "error", message: friendlyAuthError(error.message) };

  redirect("/account");
}

export async function signUp(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const credentials = readCredentials(formData);
  if (credentials.error || !credentials.email || !credentials.password) {
    return { status: "error", message: credentials.error ?? "Enter your account details." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", message: "Accounts are not connected in this environment yet." };

  const { data, error } = await supabase.auth.signUp({
    email: credentials.email,
    password: credentials.password,
    options: {
      emailRedirectTo: `${await appOrigin()}/auth/callback?next=/account`,
    },
  });
  if (error) return { status: "error", message: friendlyAuthError(error.message) };
  if (data.session) redirect("/account");

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
