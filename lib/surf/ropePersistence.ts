import "server-only";

import { createHash } from "node:crypto";

import { SingleFlight } from "@/lib/surf/persistenceReliability";
import type { RopeReport } from "@/lib/surf/ropeAudit";
import { runSupabaseOperation, surfPersistenceStatus } from "@/lib/surf/supabasePersistence";
import type { SurfSportKey } from "@/lib/surf/sports";

declare global {
  var __surfRopePersistenceSingleFlight: SingleFlight<string, boolean> | undefined;
  var __surfRopePersistenceSuccesses: Map<string, number> | undefined;
}

const persistenceSingleFlight = globalThis.__surfRopePersistenceSingleFlight
  ?? new SingleFlight<string, boolean>();
globalThis.__surfRopePersistenceSingleFlight = persistenceSingleFlight;
const persistenceSuccesses = globalThis.__surfRopePersistenceSuccesses ?? new Map<string, number>();
globalThis.__surfRopePersistenceSuccesses = persistenceSuccesses;

const SUCCESS_TTL_MS = 20 * 60 * 1000;
const MAX_SUCCESS_KEYS = 1_000;

export type RopePersistenceStatus = {
  configured: boolean;
  backend: "supabase" | "memory";
  verified: boolean;
  state: "unconfigured" | "unverified" | "healthy" | "degraded" | "circuit_open";
  lastError?: string;
};

export function ropePersistenceStatus(): RopePersistenceStatus {
  const status = surfPersistenceStatus("rope-audit");
  return {
    configured: status.configured,
    backend: status.backend,
    verified: status.verified,
    state: status.state,
    lastError: status.lastError,
  };
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
  return createHash("sha256").update(stable).digest("hex");
}

function auditWindow(auditedAt: number): string {
  const windowMs = 15 * 60 * 1000;
  return new Date(Math.floor(auditedAt / windowMs) * windowMs).toISOString();
}

function persistenceKey(report: RopeReport): string {
  return `${report.sportKey}:${auditWindow(report.auditedAt)}:${fingerprint(report)}`;
}

function pruneSuccesses(now: number): void {
  for (const [key, expiresAt] of persistenceSuccesses) {
    if (expiresAt <= now) persistenceSuccesses.delete(key);
  }
  if (persistenceSuccesses.size <= MAX_SUCCESS_KEYS) return;
  const overflow = persistenceSuccesses.size - MAX_SUCCESS_KEYS;
  for (const key of [...persistenceSuccesses.keys()].slice(0, overflow)) persistenceSuccesses.delete(key);
}

export async function persistRopeReport(report: RopeReport, timeoutMs = 1_200): Promise<boolean> {
  const status = ropePersistenceStatus();
  if (!status.configured || !Number.isFinite(report.auditedAt) || report.auditedAt <= 0) return false;
  const key = persistenceKey(report);
  const now = Date.now();
  pruneSuccesses(now);
  if ((persistenceSuccesses.get(key) ?? 0) > now) return true;

  return persistenceSingleFlight.run(key, async () => {
    const result = await runSupabaseOperation(
      "rope-audit",
      async (client, signal) => {
        const { error } = await client
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
          )
          .abortSignal(signal);
        if (error) throw error;
        return true;
      },
      { timeoutMs: Math.max(250, timeoutMs), maxAttempts: 2, retryBaseDelayMs: 75 },
    );
    if (!result.ok) {
      console.warn(`[surf] ${result.failure.message} Retaining ROPE report in memory.`);
      return false;
    }
    persistenceSuccesses.set(key, Date.now() + SUCCESS_TTL_MS);
    return true;
  });
}

function isRopeReport(value: unknown): value is RopeReport {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RopeReport>;
  return candidate.acronym === "ROPE"
    && (candidate.status === "PASS" || candidate.status === "HOLD")
    && typeof candidate.auditedAt === "number"
    && Array.isArray(candidate.checks)
    && Array.isArray(candidate.signalEvidence);
}

export async function loadPersistedRopeReports(
  sportKey: SurfSportKey,
  limit = 96,
  timeoutMs = 1_500,
): Promise<RopeReport[]> {
  if (!ropePersistenceStatus().configured) return [];
  const safeLimit = Number.isFinite(limit)
    ? Math.max(1, Math.min(720, Math.floor(limit)))
    : 96;
  const result = await runSupabaseOperation(
    "rope-audit",
    async (client, signal) => {
      const { data, error } = await client
        .from("surf_rope_audit_runs")
        .select("report")
        .eq("sport_key", sportKey)
        .order("audited_at", { ascending: false })
        .limit(safeLimit)
        .abortSignal(signal);
      if (error) throw error;
      return (data ?? [])
        .flatMap((row) => isRopeReport(row.report) ? [row.report] : [])
        .sort((a, b) => a.auditedAt - b.auditedAt);
    },
    { timeoutMs: Math.max(250, timeoutMs), maxAttempts: 2, retryBaseDelayMs: 75 },
  );
  if (result.ok) return result.value;
  console.warn(`[surf] ${result.failure.message} Reading ROPE history from memory only.`);
  return [];
}
