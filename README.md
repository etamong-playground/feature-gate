# @etamong-playground/feature-gate

> **About** — One of several small shared libraries used across a personal "fleet" of small apps (error handling · audit logging · encryption-at-rest · i18n · UI · …). Authored and maintained with [Claude Code](https://www.anthropic.com/claude-code) (Anthropic's agentic CLI). Each README documents the design rationale behind the library.
>
> **This is a public repository** — keep internal infrastructure details (hostnames, secret/Vault paths, private URLs, internal issue/MR references) out of code, comments, and commit messages.

A tiny, dependency-free toolkit for gating a code path behind two **orthogonal** decisions:

- **how it transitions** (`mode`), and
- **what happens when reality drifts from the config** (`strict`).

Most "feature flag" libraries collapse those into one knob. Keeping them separate is the whole point: a launch date and a kill-switch behave differently, and a compliance-sensitive gate needs louder drift detection than a beta cohort — but they all share one declaration model and one resolver.

## Modes

| Mode | Transition | Use for |
|---|---|---|
| **`release`** | Monotonic time-window. Opens on `effectiveDate` and **can never close.** | Announced launches, ramps tied to a fixed date, policy effective dates. |
| **`flag`** | Operator-toggled, **bidirectional.** Resolves from an override store, falling back to `defaultOpen`. | Kill-switches, beta cohorts, percentage rollouts. |

`release` is deliberately one-way: once users have seen a launched feature (or a policy has taken effect), silently retracting it is a data-integrity and trust problem. If you need to take something back, that's a `flag`.

## Strict vs soft

Orthogonal to mode. A detection pipeline periodically validates declared gates against reality and produces `GateSuspect`s:

- **`strict: false`** — soft. Suspects are queued for operator review only. *(a beta flag accidentally exposed to a non-beta user — investigate when convenient.)*
- **`strict: true`** — strict. Every registered handler fires for the suspect and returns **routing metadata** for downstream alerting. *(a policy gate, a payment kill-switch, a security-relevant release.)*

## Transport agnosticity (the hard boundary)

**No Slack/Discord/PagerDuty/webhook URL, channel name, bot token, or secret path appears in this library — or in any `HandlerResponse` field.** Handlers return *routing metadata only* (`appKey`, `tags`, `severity`, `ingestUrl`, `summary`); whatever consumes them (an ops workflow, a cron, a CLI) resolves that metadata to an actual transport. The library never performs I/O for alerting and never learns where alerts go.

This keeps the library reusable (your transport, not mine) and keeps deployment topology out of a shared dependency.

## Install

```sh
npm install @etamong-playground/feature-gate
```

Published to GitHub Packages under the `@etamong-playground` scope — point the scope at the registry in your `.npmrc`:

```
@etamong-playground:registry=https://npm.pkg.github.com
```

## Quick example

```ts
import {
  declareGate,
  isGateOpen,
  registerStrictHandler,
} from "@etamong-playground/feature-gate";

// Boot: declare gates
declareGate({
  key: "checkout.new-flow",
  mode: "release", // opens automatically on the date; never closes
  strict: false,
  effectiveDate: "2026-07-15",
});

declareGate({
  key: "payments.kill-switch",
  mode: "flag", // operator-toggled, bidirectional
  strict: true,
  defaultOpen: true,
});

// Boot: attach a routing classifier — pure, returns metadata, performs no I/O
registerStrictHandler(async (suspect) => {
  if (suspect.gateKind !== "policy") return null; // opt out of suspects you don't own
  return {
    appKey: "billing",
    severity: "warn",
    tags: ["billing", "compliance"], // the workflow maps tags -> a channel
    summary: `gate ${suspect.gateKey} inconsistency: ${suspect.reason}`,
    // ingestUrl, if used, is supplied by the caller — never hardcoded here
  };
});

// Runtime: check a gate
if (await isGateOpen("checkout.new-flow")) {
  // ... show the new flow
}
```

## Public surface

| Export | Purpose |
|---|---|
| `declareGate(config)` | Register a gate at boot (throws on a duplicate key) |
| `isGateOpen(key, ctx?)` | Resolve open/closed, async (release: time-based; flag: override + default) |
| `releaseGateOpen(key, ctx?)` | **Synchronous** open-check for release gates (e.g. a React render); throws for flag mode |
| `registerStrictHandler(fn)` | Attach a routing classifier — pure, no side effects |
| `registerGateValidator(fn)` | Attach a detection validator — returns `GateSuspect[]` |
| `runAllValidators()` | Run every validator, concatenate results |
| `classify(suspects)` | Map suspects through every handler |
| `listGates()` / `getGate(key)` | Introspection (backoffice UIs) |
| `todayISO(tz?)` | Calendar day `YYYY-MM-DD` in an IANA timezone (default `Asia/Seoul`) |

## Design notes

- **Fails closed.** `isGateOpen` returns `false` for an undeclared key, so an accidentally-deleted or misspelled gate disables the path rather than silently leaving it on.
- **Calendar days, not UTC.** Release gates compare against the local calendar day (`todayISO`), because "launches on the 15th" means the 15th where the user is — UTC can be a day off near midnight.
- **Single-process registry.** Gates and extension points live in module-level state, registered once at boot. Each worker / function instance / cron has its own registry after cold start; there is no shared global store. Persistence (flag overrides) is injected via the `GateOverrideStore` extension point.
- **Detection is pure.** Validators return `GateSuspect[]` with no side effects; handlers return `HandlerResponse` with no side effects. All actual alerting happens in the caller.

## Acknowledgements

No runtime dependencies. Built with [tsup](https://github.com/egoist/tsup), type-checked with [TypeScript](https://www.typescriptlang.org/), tested with [Vitest](https://vitest.dev/) (all MIT-licensed dev tooling).

## License

[MIT](./LICENSE)
