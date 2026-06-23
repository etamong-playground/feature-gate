import { todayISO } from "./helpers";
import type {
  GateConfig,
  GateContext,
  GateSuspect,
  GateValidator,
  HandlerResponse,
  StrictHandler,
} from "./model";

/**
 * Module-level registries. Consumers register their gates and extension
 * points at boot. Single-process scope; each Worker/Function/cron has its
 * own registry instance after cold start.
 */
const gates = new Map<string, GateConfig>();
const strictHandlers: StrictHandler[] = [];
const validators: GateValidator[] = [];

export function declareGate(config: GateConfig): void {
  if (gates.has(config.key)) {
    throw new Error(`feature-gate: duplicate gate key "${config.key}"`);
  }
  gates.set(config.key, config);
}

export function getGate(key: string): GateConfig | undefined {
  return gates.get(key);
}

export function listGates(): GateConfig[] {
  return Array.from(gates.values());
}

export function registerStrictHandler(fn: StrictHandler): void {
  strictHandlers.push(fn);
}

export function registerGateValidator(fn: GateValidator): void {
  validators.push(fn);
}

/**
 * Reset all registries. Test-only.
 */
export function __resetForTest(): void {
  gates.clear();
  strictHandlers.length = 0;
  validators.length = 0;
}

/**
 * Resolve whether a gate is currently open.
 *
 *   release mode: open iff `now >= effectiveDate` (monotonic; no force-close)
 *   flag mode:    open iff override = "open", else `defaultOpen` when no override
 *
 * Returns false when the gate key is not declared — fails closed so an
 * accidentally-deleted gate disables the path rather than leaving it on.
 */
export async function isGateOpen(
  key: string,
  ctx: GateContext = {},
): Promise<boolean> {
  const config = gates.get(key);
  if (!config) return false;

  if (config.mode === "release") {
    const now = ctx.now ?? todayISO();
    return now >= config.effectiveDate;
  }

  // flag mode
  if (ctx.overrides) {
    const override = await ctx.overrides.read(key);
    if (override === "open") return true;
    if (override === "closed") return false;
  }
  return config.defaultOpen;
}

/**
 * Synchronous open-check for **release** gates only.
 *
 * Release gates are pure calendar-date math (`now >= effectiveDate`), so they
 * can be resolved in a synchronous context — a React render, a template, any
 * place an `await` is awkward — without the Promise that `isGateOpen` returns.
 *
 * Fails closed (returns false) when the key is undeclared, same as `isGateOpen`.
 * Throws for a flag-mode gate: flag resolution may consult an async override
 * store, so it has no correct synchronous answer — use `isGateOpen` there.
 */
export function releaseGateOpen(key: string, ctx: { now?: string } = {}): boolean {
  const config = gates.get(key);
  if (!config) return false;
  if (config.mode !== "release") {
    throw new Error(
      `releaseGateOpen: gate "${key}" is mode "${config.mode}", not "release" — use the async isGateOpen`,
    );
  }
  const now = ctx.now ?? todayISO();
  return now >= config.effectiveDate;
}

/**
 * Run every registered validator and concatenate the suspects.
 *
 * Validators are pure detection — they return suspects without side
 * effects. The workflow that calls this is responsible for downstream
 * routing (classify → fan-out).
 */
export async function runAllValidators(): Promise<GateSuspect[]> {
  const results = await Promise.all(validators.map((fn) => fn()));
  return results.flat();
}

/**
 * Classify each suspect via every registered StrictHandler. Each handler
 * gets every suspect; handlers filter to their own gateKind / appKey
 * internally and return null to opt out.
 *
 * Output: list of HandlerResponse with the originating suspect attached
 * for traceability. The caller (Argo workflow, ad-hoc CLI) consumes this
 * list and decides routing (channel, ingest endpoint, dedupe).
 */
export interface ClassifiedSuspect {
  suspect: GateSuspect;
  response: HandlerResponse;
}

export async function classify(
  suspects: GateSuspect[],
): Promise<ClassifiedSuspect[]> {
  const out: ClassifiedSuspect[] = [];
  for (const suspect of suspects) {
    const responses = await Promise.all(
      strictHandlers.map((fn) => fn(suspect)),
    );
    for (const response of responses) {
      if (response) out.push({ suspect, response });
    }
  }
  return out;
}
