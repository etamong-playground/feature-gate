# @etamong-lab/feature-gate

Transport-agnostic feature gate primitives for the etamong-lab fleet.

## Modes

- **`release`** — monotonic time-window. Opens on `effectiveDate`; can never close. For announced launches, ramps tied to a fixed date, and policy effective dates.
- **`flag`** — operator-toggled, bidirectional. Kill-switches, beta cohorts, percentage rollouts.

## Strict vs soft

Orthogonal to mode. `strict: true` gates emit alerts via registered handlers when the detection cron finds an inconsistency; `strict: false` gates queue suspects for operator review only.

## Transport agnosticity

**No Slack, Discord, PagerDuty, webhook URL, channel name, bot token, or Vault path appears in this library or in any `HandlerResponse` field.** Handlers return routing metadata (`appKey`, `tags`, `severity`, `ingestUrl`, `summary`); the workflow that consumes them resolves to a transport.

This is enforced by `etamong-shared-library-review`.

## Quick example

```ts
import {
  declareGate,
  isGateOpen,
  registerStrictHandler,
  registerGateValidator,
} from "@etamong-lab/feature-gate";

// Boot: declare gates
declareGate({
  key: "festplan.early-access",
  mode: "release",
  strict: false,
  effectiveDate: "2026-07-15",
});

// Boot: domain package registers handlers + validators
registerStrictHandler(async (suspect) => {
  if (suspect.gateKind !== "policy") return null;
  return {
    appKey: "legal",
    severity: "warn",
    tags: ["legal", "compliance"],
    ingestUrl: "https://admin.m.etamong.com/api/legal/suspect/ingest",
    summary: `policy ${suspect.gateKey} inconsistency`,
    detail: { ...suspect.detail },
  };
});

// Runtime: check
if (await isGateOpen("festplan.early-access")) {
  // ...
}
```

## Public surface

| Export | Purpose |
|---|---|
| `declareGate(config)` | Register a gate at boot |
| `isGateOpen(key, ctx?)` | Resolve open/closed (release: time-based; flag: override + default) |
| `registerStrictHandler(fn)` | Attach a routing classifier — pure, no side effects |
| `registerGateValidator(fn)` | Attach a detection validator — returns `GateSuspect[]` |
| `runAllValidators()` | Run every validator, concatenate results |
| `classify(suspects)` | Map suspects through every handler |
| `listGates()` / `getGate(key)` | Introspection (backoffice UIs) |

See `wiki/concepts/feature-gate-pattern.md` on `etamong-playground/planning` for the full pattern.
