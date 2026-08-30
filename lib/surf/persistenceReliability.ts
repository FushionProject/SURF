export type PersistenceFailureKind = "timeout" | "transient" | "permanent" | "circuit_open";

export type PersistenceFailure = {
  kind: PersistenceFailureKind;
  code?: string;
  message: string;
};

export type PersistenceResult<T> =
  | { ok: true; value: T; attempts: number }
  | { ok: false; failure: PersistenceFailure; attempts: number };

export type PersistenceHealth = {
  state: "unverified" | "healthy" | "degraded" | "circuit_open";
  verified: boolean;
  consecutiveFailures: number;
  circuitOpenUntil?: number;
  lastAttemptAt?: number;
  lastSuccessAt?: number;
  lastFailureAt?: number;
  lastError?: string;
  attempts: number;
  successes: number;
  failures: number;
  retries: number;
  timeouts: number;
  shortCircuits: number;
};

export type PersistenceOperationOptions = {
  timeoutMs?: number;
  maxAttempts?: number;
  retryBaseDelayMs?: number;
};

export type PersistenceRuntimeOptions = {
  failureThreshold?: number;
  circuitCooldownMs?: number;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
};

function boundedNumber(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(value)));
}

type ErrorShape = {
  code?: unknown;
  status?: unknown;
};

const TRANSIENT_CODES = new Set([
  "40001",
  "40P01",
  "55P03",
  "57014",
  "PGRST000",
  "PGRST001",
  "PGRST002",
  "PGRST003",
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ETIMEDOUT",
]);

const PERMANENT_MESSAGES: Record<string, string> = {
  "42501": "Database permission denied.",
  "42P01": "Required database table is missing.",
  "42883": "Required database function is missing.",
  "23502": "Database rejected incomplete data.",
  "23503": "Database rejected an invalid relationship.",
  "23505": "Database rejected a duplicate value.",
  "23514": "Database rejected data outside its safety constraints.",
  "22P02": "Database rejected malformed data.",
};

function errorShape(error: unknown): ErrorShape {
  return error && typeof error === "object" ? error as ErrorShape : {};
}

function errorCode(error: unknown): string | undefined {
  const code = errorShape(error).code;
  return typeof code === "string" && code.length <= 32 ? code.toUpperCase() : undefined;
}

function errorStatus(error: unknown): number | undefined {
  const status = errorShape(error).status;
  return typeof status === "number" && Number.isFinite(status) ? status : undefined;
}

export class PersistenceTimeoutError extends Error {
  readonly code = "SURF_PERSISTENCE_TIMEOUT";

  constructor() {
    super("Persistence operation timed out.");
    this.name = "PersistenceTimeoutError";
  }
}

export function classifyPersistenceFailure(error: unknown): PersistenceFailure {
  if (error instanceof PersistenceTimeoutError) {
    return { kind: "timeout", code: error.code, message: "Database request timed out." };
  }

  const code = errorCode(error);
  const status = errorStatus(error);
  const isTransientCode = code != null && (TRANSIENT_CODES.has(code) || code.startsWith("08"));
  const isTransientStatus = status === 408 || status === 425 || status === 429 || (status != null && status >= 500);
  if (isTransientCode || isTransientStatus) {
    return {
      kind: "transient",
      code,
      message: code ? `Database temporarily unavailable (${code}).` : "Database temporarily unavailable.",
    };
  }

  return {
    kind: "permanent",
    code,
    message: code && PERMANENT_MESSAGES[code]
      ? PERMANENT_MESSAGES[code]
      : code
        ? `Database request rejected (${code}).`
        : "Database request failed.",
  };
}

export class PersistenceCircuitBreaker {
  private consecutiveFailures = 0;
  private openUntil = 0;
  private probeInFlight = false;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly now: () => number;

  constructor(
    failureThreshold: number,
    cooldownMs: number,
    now: () => number,
  ) {
    this.failureThreshold = failureThreshold;
    this.cooldownMs = cooldownMs;
    this.now = now;
  }

  acquire(): "normal" | "probe" | "blocked" {
    const now = this.now();
    if (this.openUntil > now) return "blocked";
    if (this.openUntil > 0) {
      if (this.probeInFlight) return "blocked";
      this.probeInFlight = true;
      return "probe";
    }
    return "normal";
  }

  recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.openUntil = 0;
    this.probeInFlight = false;
  }

  recordFailure(): void {
    this.consecutiveFailures += 1;
    this.probeInFlight = false;
    if (this.openUntil > 0 || this.consecutiveFailures >= this.failureThreshold) {
      this.openUntil = this.now() + this.cooldownMs;
    }
  }

  snapshot(): { consecutiveFailures: number; openUntil?: number } {
    return {
      consecutiveFailures: this.consecutiveFailures,
      openUntil: this.openUntil > 0 ? this.openUntil : undefined,
    };
  }
}

async function operationWithTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const task = Promise.resolve().then(() => operation(controller.signal));
  const timeoutTask = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new PersistenceTimeoutError());
    }, timeoutMs);
  });

  try {
    return await Promise.race([task, timeoutTask]);
  } finally {
    if (timeout) clearTimeout(timeout);
    void task.catch(() => undefined);
  }
}

export class PersistenceRuntime {
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly random: () => number;
  private readonly circuit: PersistenceCircuitBreaker;
  private health: PersistenceHealth = {
    state: "unverified",
    verified: false,
    consecutiveFailures: 0,
    attempts: 0,
    successes: 0,
    failures: 0,
    retries: 0,
    timeouts: 0,
    shortCircuits: 0,
  };

  constructor(options: PersistenceRuntimeOptions = {}) {
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.random = options.random ?? Math.random;
    this.circuit = new PersistenceCircuitBreaker(
      boundedNumber(options.failureThreshold, 3, 1, 100),
      boundedNumber(options.circuitCooldownMs, 30_000, 1, 10 * 60 * 1000),
      this.now,
    );
  }

  snapshot(): PersistenceHealth {
    const circuit = this.circuit.snapshot();
    const circuitOpen = circuit.openUntil != null && circuit.openUntil > this.now();
    return {
      ...this.health,
      state: circuitOpen ? "circuit_open" : this.health.state,
      consecutiveFailures: circuit.consecutiveFailures,
      circuitOpenUntil: circuit.openUntil,
    };
  }

  async execute<T>(
    operation: (signal: AbortSignal, attempt: number) => Promise<T>,
    options: PersistenceOperationOptions = {},
  ): Promise<PersistenceResult<T>> {
    const admission = this.circuit.acquire();
    if (admission === "blocked") {
      this.health.shortCircuits += 1;
      return {
        ok: false,
        attempts: 0,
        failure: {
          kind: "circuit_open",
          message: "Database circuit is temporarily open.",
          code: "SURF_PERSISTENCE_CIRCUIT_OPEN",
        },
      };
    }

    const maxAttempts = boundedNumber(options.maxAttempts, 2, 1, 4);
    const timeoutMs = boundedNumber(options.timeoutMs, 2_000, 1, 30_000);
    const retryBaseDelayMs = boundedNumber(options.retryBaseDelayMs, 50, 0, 5_000);
    let latestFailure: PersistenceFailure = { kind: "permanent", message: "Database request failed." };
    let attemptsMade = 0;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      attemptsMade = attempt;
      this.health.attempts += 1;
      this.health.lastAttemptAt = this.now();
      try {
        const value = await operationWithTimeout((signal) => operation(signal, attempt), timeoutMs);
        this.circuit.recordSuccess();
        this.health.state = "healthy";
        this.health.verified = true;
        this.health.successes += 1;
        this.health.lastSuccessAt = this.now();
        delete this.health.lastError;
        return { ok: true, value, attempts: attempt };
      } catch (error) {
        latestFailure = classifyPersistenceFailure(error);
        if (latestFailure.kind === "timeout") this.health.timeouts += 1;
        const canRetry = (latestFailure.kind === "timeout" || latestFailure.kind === "transient") && attempt < maxAttempts;
        if (!canRetry) break;
        this.health.retries += 1;
        const exponential = retryBaseDelayMs * (2 ** (attempt - 1));
        const jitter = retryBaseDelayMs > 0 ? Math.floor(this.random() * retryBaseDelayMs) : 0;
        await this.sleep(exponential + jitter);
      }
    }

    this.circuit.recordFailure();
    this.health.state = "degraded";
    this.health.verified = false;
    this.health.failures += 1;
    this.health.lastFailureAt = this.now();
    this.health.lastError = latestFailure.message;
    return { ok: false, failure: latestFailure, attempts: attemptsMade };
  }
}

export class SingleFlight<Key, Value> {
  private readonly pending = new Map<Key, Promise<Value>>();

  run(key: Key, operation: () => Promise<Value>): Promise<Value> {
    const existing = this.pending.get(key);
    if (existing) return existing;
    const created = Promise.resolve()
      .then(operation)
      .finally(() => {
        if (this.pending.get(key) === created) this.pending.delete(key);
      });
    this.pending.set(key, created);
    return created;
  }

  size(): number {
    return this.pending.size;
  }
}

export function chunkValues<T>(values: T[], size: number): T[][] {
  const safeSize = boundedNumber(size, 1, 1, Math.max(1, values.length));
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += safeSize) {
    chunks.push(values.slice(index, index + safeSize));
  }
  return chunks;
}
