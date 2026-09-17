/** Pure decision behind `viewerHasPro`, kept free of server-only imports so it
 *  can be exercised in node tests with injected dependencies, the same way
 *  `access-policy.ts` and `comp-access.ts` are. */
export type ViewerAccessDeps = {
  paidAccessRequired(): boolean;
  /** Resolves the confirmed signed-in user, or throws. */
  billingUser(): Promise<{ id: string; email?: string | null }>;
  hasCompAccess(email: string | null | undefined): boolean;
  /** The deliberate `SURF_BILLING_ENABLED=true` switch, not whether the runtime came up. */
  billingEnabled(): boolean;
  billingRuntime(): { service: { entitlements(userId: string): Promise<{ signals: boolean }> } } | undefined;
};

/** Fail closed: anything short of a verified Surf Pro entitlement is a free
 *  viewer. Signed out, billing runtime missing, a provider error, or a thrown
 *  dependency all resolve to `false`; this never throws and never logs. Local
 *  design previews stay open, mirroring `paidFeatureDenial`.
 *
 *  One deliberate exception: while billing is switched off there is nothing
 *  for sale, so nothing is locked and every viewer sees the whole slate. The
 *  gate turns on the moment `SURF_BILLING_ENABLED=true` is set. A switched-on
 *  but broken billing runtime still fails closed, because an operator meant
 *  to charge and a misconfiguration must not hand out the paid product. */
export async function resolveViewerHasPro(deps: ViewerAccessDeps): Promise<boolean> {
  try {
    if (!deps.paidAccessRequired()) return true;
    if (!deps.billingEnabled()) return true;
    const user = await deps.billingUser();
    if (deps.hasCompAccess(user.email)) return true;
    const runtime = deps.billingRuntime();
    if (!runtime) return false;
    const access = await runtime.service.entitlements(user.id);
    return access.signals === true;
  } catch {
    return false;
  }
}
