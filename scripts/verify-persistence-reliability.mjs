import assert from "node:assert/strict";

import {
  PersistenceRuntime,
  PersistenceTimeoutError,
  SingleFlight,
  chunkValues,
  classifyPersistenceFailure,
} from "../lib/surf/persistenceReliability.ts";

assert.deepEqual(classifyPersistenceFailure(new PersistenceTimeoutError()), {
  kind: "timeout",
  code: "SURF_PERSISTENCE_TIMEOUT",
  message: "Database request timed out.",
});
assert.equal(classifyPersistenceFailure({ code: "40P01", message: "deadlock" }).kind, "transient");
assert.equal(classifyPersistenceFailure({ code: "08006", message: "connection failed" }).kind, "transient");
assert.equal(classifyPersistenceFailure({ status: 503 }).kind, "transient");
assert.equal(classifyPersistenceFailure({ code: "42501", message: "secret=do-not-leak" }).message, "Database permission denied.");
assert.equal(classifyPersistenceFailure(new Error("apikey=do-not-leak")).message, "Database request failed.");

const successful = new PersistenceRuntime({ sleep: async () => undefined, random: () => 0 });
const successfulResult = await successful.execute(async () => "stored");
assert.deepEqual(successfulResult, { ok: true, value: "stored", attempts: 1 });
assert.equal(successful.snapshot().state, "healthy");
assert.equal(successful.snapshot().verified, true);

const invalidOptions = new PersistenceRuntime({
  failureThreshold: Number.NaN,
  circuitCooldownMs: Number.POSITIVE_INFINITY,
  sleep: async () => undefined,
});
const invalidOptionsResult = await invalidOptions.execute(async () => "bounded", {
  maxAttempts: Number.NaN,
  timeoutMs: Number.POSITIVE_INFINITY,
  retryBaseDelayMs: Number.NaN,
});
assert.deepEqual(invalidOptionsResult, { ok: true, value: "bounded", attempts: 1 });

let transientAttempts = 0;
const transient = new PersistenceRuntime({ sleep: async () => undefined, random: () => 0 });
const transientResult = await transient.execute(
  async () => {
    transientAttempts += 1;
    if (transientAttempts === 1) throw { code: "40001" };
    return 42;
  },
  { maxAttempts: 2, retryBaseDelayMs: 0 },
);
assert.deepEqual(transientResult, { ok: true, value: 42, attempts: 2 });
assert.equal(transient.snapshot().retries, 1);
assert.equal(transient.snapshot().failures, 0, "a recovered transient failure must not degrade the circuit");

let permanentAttempts = 0;
const permanent = new PersistenceRuntime({ sleep: async () => undefined });
const permanentResult = await permanent.execute(
  async () => {
    permanentAttempts += 1;
    throw { code: "42501", message: "sensitive database detail" };
  },
  { maxAttempts: 4 },
);
assert.equal(permanentResult.ok, false);
assert.equal(permanentResult.attempts, 1);
assert.equal(permanentAttempts, 1, "permanent failures must never be retried");
assert.equal(permanent.snapshot().lastError, "Database permission denied.");
assert.equal(permanent.snapshot().verified, false);

let aborted = 0;
const timingOut = new PersistenceRuntime({ sleep: async () => undefined, random: () => 0 });
const timeoutResult = await timingOut.execute(
  (signal) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => {
      aborted += 1;
      reject(new Error("aborted"));
    }, { once: true });
  }),
  { timeoutMs: 5, maxAttempts: 2, retryBaseDelayMs: 0 },
);
assert.equal(timeoutResult.ok, false);
assert.equal(timeoutResult.failure.kind, "timeout");
assert.equal(timeoutResult.attempts, 2);
assert.equal(aborted, 2);
assert.equal(timingOut.snapshot().timeouts, 2);

let now = 1_000;
const circuit = new PersistenceRuntime({
  failureThreshold: 3,
  circuitCooldownMs: 500,
  now: () => now,
  sleep: async () => undefined,
});
for (let index = 0; index < 3; index += 1) {
  const result = await circuit.execute(async () => { throw { code: "42501" }; });
  assert.equal(result.ok, false);
}
const blocked = await circuit.execute(async () => "must not run");
assert.equal(blocked.ok, false);
assert.equal(blocked.failure.kind, "circuit_open");
assert.equal(blocked.attempts, 0);
assert.equal(circuit.snapshot().state, "circuit_open");

now += 501;
let resolveProbe;
const probe = circuit.execute(() => new Promise((resolve) => { resolveProbe = resolve; }));
await Promise.resolve();
const blockedDuringProbe = await circuit.execute(async () => "must not overlap the half-open probe");
assert.equal(blockedDuringProbe.ok, false);
assert.equal(blockedDuringProbe.failure.kind, "circuit_open");
resolveProbe("recovered");
assert.deepEqual(await probe, { ok: true, value: "recovered", attempts: 1 });
assert.equal(circuit.snapshot().state, "healthy");

const singleFlight = new SingleFlight();
let executions = 0;
let resolveFlight;
const firstFlight = singleFlight.run("same", () => {
  executions += 1;
  return new Promise((resolve) => { resolveFlight = resolve; });
});
const secondFlight = singleFlight.run("same", () => {
  executions += 1;
  return Promise.resolve("wrong");
});
assert.equal(firstFlight, secondFlight);
assert.equal(executions, 0, "single-flight work begins on the next microtask");
await Promise.resolve();
assert.equal(executions, 1);
assert.equal(singleFlight.size(), 1);
resolveFlight("shared");
assert.equal(await firstFlight, "shared");
assert.equal(await secondFlight, "shared");
assert.equal(singleFlight.size(), 0);

await assert.rejects(singleFlight.run("reject", async () => { throw new Error("expected"); }), /expected/);
assert.equal(singleFlight.size(), 0, "failed single-flight work must be cleaned up");

assert.deepEqual(chunkValues([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
assert.deepEqual(chunkValues([1, 2], 0), [[1], [2]], "invalid chunk sizes are safely clamped");
assert.deepEqual(chunkValues([1, 2], Number.NaN), [[1], [2]], "NaN chunk sizes cannot create an empty or stuck batch");
assert.deepEqual(chunkValues([1, 2], Number.POSITIVE_INFINITY), [[1], [2]], "infinite chunk sizes fall back to safe single-item batches");
assert.deepEqual(chunkValues([], 10), []);

console.log("Persistence reliability fixtures passed: classification, redaction, bounded options, retries, timeouts, cancellation, circuit recovery, single-flight, and chunking.");
