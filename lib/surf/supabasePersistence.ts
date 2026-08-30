import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  PersistenceRuntime,
  type PersistenceHealth,
  type PersistenceOperationOptions,
  type PersistenceResult,
} from "@/lib/surf/persistenceReliability";

export const SURF_PERSISTENCE_SCHEMA_VERSION = 2;

export type PersistenceSubsystem = "schema-health" | "market-history" | "rope-audit";

export type SurfPersistenceStatus = {
  configured: boolean;
  backend: "supabase" | "memory";
  keyKind: "secret" | "legacy-service-role" | "missing";
  schemaVersion?: number;
  schemaVerified: boolean;
  verified: boolean;
  state: "unconfigured" | PersistenceHealth["state"];
  lastSuccessAt?: number;
  lastFailureAt?: number;
  circuitOpenUntil?: number;
  lastError?: string;
  metrics: Pick<PersistenceHealth, "attempts" | "successes" | "failures" | "retries" | "timeouts" | "shortCircuits">;
};

type PersistenceConfiguration = {
  url: string;
  key: string;
  keyKind: "secret" | "legacy-service-role";
};

type SchemaHealthPayload = {
  schema_version: number;
  market_history_ready: boolean;
  rope_audit_ready: boolean;
  checked_at: string;
};

type SchemaHealthState = {
  verified: boolean;
  schemaVersion?: number;
  expiresAt: number;
  lastError?: string;
  inFlight?: Promise<SurfPersistenceStatus>;
};

declare global {
  var __surfPersistenceClient: SupabaseClient | undefined;
  var __surfPersistenceRuntimes: Map<PersistenceSubsystem, PersistenceRuntime> | undefined;
  var __surfPersistenceSchemaHealth: SchemaHealthState | undefined;
}

const runtimes = globalThis.__surfPersistenceRuntimes ?? new Map<PersistenceSubsystem, PersistenceRuntime>();
globalThis.__surfPersistenceRuntimes = runtimes;
const schemaHealth = globalThis.__surfPersistenceSchemaHealth ?? { verified: false, expiresAt: 0 };
globalThis.__surfPersistenceSchemaHealth = schemaHealth;

function configuration(): PersistenceConfiguration | undefined {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || (!secretKey && !serviceRoleKey)) return undefined;
  return {
    url,
    key: secretKey ?? serviceRoleKey!,
    keyKind: secretKey ? "secret" : "legacy-service-role",
  };
}

function runtime(subsystem: PersistenceSubsystem): PersistenceRuntime {
  const existing = runtimes.get(subsystem);
  if (existing) return existing;
  const created = new PersistenceRuntime({
    failureThreshold: 3,
    circuitCooldownMs: 30_000,
  });
  runtimes.set(subsystem, created);
  return created;
}

export function getSurfSupabaseClient(): SupabaseClient | undefined {
  if (globalThis.__surfPersistenceClient) return globalThis.__surfPersistenceClient;
  const config = configuration();
  if (!config) return undefined;
  globalThis.__surfPersistenceClient = createClient(config.url, config.key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        "X-Client-Info": "surf-server-persistence/2",
      },
    },
  });
  return globalThis.__surfPersistenceClient;
}

function emptyMetrics(): SurfPersistenceStatus["metrics"] {
  return { attempts: 0, successes: 0, failures: 0, retries: 0, timeouts: 0, shortCircuits: 0 };
}

export function surfPersistenceStatus(subsystem: PersistenceSubsystem): SurfPersistenceStatus {
  const config = configuration();
  if (!config) {
    return {
      configured: false,
      backend: "memory",
      keyKind: "missing",
      schemaVerified: false,
      verified: false,
      state: "unconfigured",
      lastError: "A server-only Supabase secret key is not configured.",
      metrics: emptyMetrics(),
    };
  }

  const health = runtime(subsystem).snapshot();
  const schemaVerified = schemaHealth.verified
    && schemaHealth.schemaVersion === SURF_PERSISTENCE_SCHEMA_VERSION
    && schemaHealth.expiresAt > Date.now();
  return {
    configured: true,
    backend: "supabase",
    keyKind: config.keyKind,
    schemaVersion: schemaHealth.schemaVersion,
    schemaVerified,
    verified: schemaVerified && (subsystem === "schema-health" || health.verified || health.state === "unverified"),
    state: health.state,
    lastSuccessAt: health.lastSuccessAt,
    lastFailureAt: health.lastFailureAt,
    circuitOpenUntil: health.circuitOpenUntil,
    lastError: schemaHealth.lastError ?? health.lastError,
    metrics: {
      attempts: health.attempts,
      successes: health.successes,
      failures: health.failures,
      retries: health.retries,
      timeouts: health.timeouts,
      shortCircuits: health.shortCircuits,
    },
  };
}

export async function runSupabaseOperation<T>(
  subsystem: PersistenceSubsystem,
  operation: (client: SupabaseClient, signal: AbortSignal, attempt: number) => Promise<T>,
  options?: PersistenceOperationOptions,
): Promise<PersistenceResult<T>> {
  const client = getSurfSupabaseClient();
  if (!client) {
    return {
      ok: false,
      attempts: 0,
      failure: {
        kind: "permanent",
        code: "SURF_SUPABASE_UNCONFIGURED",
        message: "A server-only Supabase secret key is not configured.",
      },
    };
  }
  return runtime(subsystem).execute(
    (signal, attempt) => operation(client, signal, attempt),
    options,
  );
}

function isSchemaHealthPayload(value: unknown): value is SchemaHealthPayload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SchemaHealthPayload>;
  return Number.isInteger(candidate.schema_version)
    && typeof candidate.market_history_ready === "boolean"
    && typeof candidate.rope_audit_ready === "boolean"
    && typeof candidate.checked_at === "string";
}

export async function verifySurfPersistence(options: { force?: boolean; timeoutMs?: number } = {}): Promise<SurfPersistenceStatus> {
  const current = surfPersistenceStatus("schema-health");
  if (!current.configured) return current;
  const now = Date.now();
  if (!options.force && schemaHealth.expiresAt > now && (schemaHealth.verified || schemaHealth.lastError)) return current;
  if (schemaHealth.inFlight) return schemaHealth.inFlight;

  const verification = (async () => {
    const result = await runSupabaseOperation(
      "schema-health",
      async (client, signal) => {
        const { data, error } = await client.rpc("surf_persistence_health").abortSignal(signal);
        if (error) throw error;
        if (!isSchemaHealthPayload(data)) throw { code: "SURF_SCHEMA_HEALTH_SHAPE" };
        if (
          data.schema_version !== SURF_PERSISTENCE_SCHEMA_VERSION
          || !data.market_history_ready
          || !data.rope_audit_ready
        ) {
          throw { code: "SURF_SCHEMA_VERSION_MISMATCH" };
        }
        return data;
      },
      { timeoutMs: options.timeoutMs ?? 1_200, maxAttempts: 2, retryBaseDelayMs: 75 },
    );

    if (result.ok) {
      schemaHealth.verified = true;
      schemaHealth.schemaVersion = result.value.schema_version;
      schemaHealth.expiresAt = Date.now() + 5 * 60 * 1000;
      delete schemaHealth.lastError;
    } else {
      schemaHealth.verified = false;
      schemaHealth.expiresAt = Date.now() + 30_000;
      schemaHealth.lastError = result.failure.message;
    }
    return surfPersistenceStatus("schema-health");
  })().finally(() => {
    delete schemaHealth.inFlight;
  });

  schemaHealth.inFlight = verification;
  return verification;
}
