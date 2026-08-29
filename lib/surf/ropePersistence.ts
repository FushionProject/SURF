import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { RopeReport } from "@/lib/surf/ropeAudit";
import type { SurfSportKey } from "@/lib/surf/sports";

declare global {
  var __surfRopeAuditClient: SupabaseClient | undefined;
  var __surfRopePersistenceAttempts: Set<string> | undefined;
  var __surfRopePersistenceHealth: RopePersistenceHealth | undefined;
}

const persistenceAttempts = globalThis.__surfRopePersistenceAttempts ?? new Set<string>();
globalThis.__surfRopePersistenceAttempts = persistenceAttempts;

export type RopePersistenceStatus = {
  configured: boolean;
  backend: "supabase" | "memory";
  verified: boolean;
  lastError?: string;
};

type RopePersistenceHealth = {
  verified: boolean;
  lastError?: string;
};

const persistenceHealth = globalThis.__surfRopePersistenceHealth ?? { verified: false };
globalThis.__surfRopePersistenceHealth = persistenceHealth;

function configuration(): { url: string; key: string } | undefined {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return undefined;
  return { url, key };
}

function client(): SupabaseClient | undefined {
  if (globalThis.__surfRopeAuditClient) return globalThis.__surfRopeAuditClient;
  const config = configuration();
  if (!config) return undefined;
  globalThis.__surfRopeAuditClient = createClient(config.url, config.key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return globalThis.__surfRopeAuditClient;
}

export function ropePersistenceStatus(): RopePersistenceStatus {
  return configuration()
    ? {
        configured: true,
        backend: "supabase",
        verified: persistenceHealth.verified,
        lastError: persistenceHealth.lastError,
      }
    : { configured: false, backend: "memory", verified: false };
}

function fingerprint(report: RopeReport): string {
  const stable = JSON.stringify({
    sportKey: report.sportKey,
    status: report.status,
    score: report.score,
    checks: report.checks.map((entry) => ({ id: entry.id, status: entry.status, summary: entry.summary, details: entry.details })),
    signals: report.signalEvidence,
    books: report.summary.uniqueBooks,
  });
  let hash = 0x811c9dc5;
  for (let index = 0; index < stable.length; index += 1) {
    hash ^= stable.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function auditWindow(auditedAt: number): string {
  const windowMs = 15 * 60 * 1000;
  return new Date(Math.floor(auditedAt / windowMs) * windowMs).toISOString();
}

function persistenceKey(report: RopeReport): string {
  return `${report.sportKey}:${auditWindow(report.auditedAt)}:${fingerprint(report)}`;
}

async function writeReport(report: RopeReport): Promise<void> {
  const supabase = client();
  if (!supabase) return;
  const { error } = await supabase
    .from("surf_rope_audit_runs")
    .upsert(
      {
        sport_key: report.sportKey,
        audit_window: auditWindow(report.auditedAt),
        audited_at: new Date(report.auditedAt).toISOString(),
        fingerprint: fingerprint(report),
        status: report.status,
        score: report.score,
        game_count: report.summary.games,
        signal_count: report.summary.signals,
        report,
      },
      {
        onConflict: "sport_key,audit_window,fingerprint",
        ignoreDuplicates: true,
      },
    );
  if (error) throw new Error(`ROPE persistence failed (${error.code ?? "unknown"})`);
}

export async function persistRopeReport(report: RopeReport, timeoutMs = 1_000): Promise<boolean> {
  if (!configuration()) return false;
  const key = persistenceKey(report);
  if (persistenceAttempts.has(key)) return persistenceHealth.verified;
  persistenceAttempts.add(key);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const persisted = await Promise.race([
      writeReport(report)
        .then(() => {
          persistenceHealth.verified = true;
          delete persistenceHealth.lastError;
          return true;
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "Unknown ROPE persistence failure";
          persistenceHealth.verified = false;
          persistenceHealth.lastError = message;
          console.warn(`[surf] ${message}; retaining ROPE report in memory.`);
          return false;
        }),
      new Promise<boolean>((resolve) => {
        timeout = setTimeout(() => {
          persistenceHealth.verified = false;
          persistenceHealth.lastError = "ROPE persistence timed out.";
          console.warn("[surf] ROPE persistence timed out; retaining report in memory.");
          resolve(false);
        }, timeoutMs);
      }),
    ]);
    if (!persisted) persistenceAttempts.delete(key);
    return persisted;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function isRopeReport(value: unknown): value is RopeReport {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RopeReport>;
  return candidate.acronym === "ROPE"
    && (candidate.status === "PASS" || candidate.status === "HOLD")
    && typeof candidate.auditedAt === "number"
    && Array.isArray(candidate.checks);
}

export async function loadPersistedRopeReports(
  sportKey: SurfSportKey,
  limit = 96,
): Promise<RopeReport[]> {
  const supabase = client();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("surf_rope_audit_runs")
    .select("report")
    .eq("sport_key", sportKey)
    .order("audited_at", { ascending: false })
    .limit(Math.max(1, Math.min(720, limit)));
  if (error) {
    console.warn(`[surf] ROPE history load failed (${error.code ?? "unknown"}).`);
    return [];
  }
  return (data ?? [])
    .flatMap((row) => isRopeReport(row.report) ? [row.report] : [])
    .sort((a, b) => a.auditedAt - b.auditedAt);
}
