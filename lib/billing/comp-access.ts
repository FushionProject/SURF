/** Explicit comp access for the owner and invited reviewers.
 *  Deny by default: an unset or empty allowlist grants nothing, and callers
 *  must already have a signed-in, email-confirmed account. This never reads
 *  Stripe, never contacts a payment provider, and never turns on billing. */
export function compAccessEmails(env: Record<string, string | undefined> = process.env): Set<string> {
  return new Set(
    (env.SURF_COMP_ACCESS_EMAILS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.includes("@")),
  );
}

export function hasCompAccess(
  email: string | null | undefined,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const normalized = email?.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) return false;
  return compAccessEmails(env).has(normalized);
}
