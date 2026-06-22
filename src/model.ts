/**
 * Modes determine the *shape* of how a gate transitions between open/closed.
 *
 *   release  — monotonic time-window. Opens automatically when `effectiveDate`
 *              is reached; can never close. Use for "feature is launching on
 *              DATE" — predictability for users + data integrity.
 *
 *   flag     — operator-toggled, bidirectional. Force-open/closed any time,
 *              kill-switch, percentage rollouts, beta cohorts.
 */
export type GateMode = "release" | "flag";

/**
 * Severity of operator response to a detected gate inconsistency.
 *
 *   false — soft. Suspect is queued for operator review; no urgent push.
 *           Typical: a beta flag that was accidentally exposed to a non-beta
 *           user. Investigate when convenient.
 *
 *   true  — strict. Every registered StrictHandler fires for the suspect.
 *           Typical: legal policy gates (compliance-sensitive), payment
 *           kill-switches, security-relevant releases. The handler returns
 *           routing metadata; the *workflow* (not this library) decides how
 *           to actually push (Slack, PagerDuty, email, ...).
 */
export type GateStrict = boolean;

export interface ReleaseGateConfig {
  key: string;
  mode: "release";
  strict: GateStrict;
  /** YYYY-MM-DD — gate opens on/after this calendar day. */
  effectiveDate: string;
  /**
   * Optional kind tag for domain-specific extensions. Core ignores it; a
   * consumer may set `kind: "policy"` (or any string) to mark gates that
   * carry additional domain semantics. The library stays kind-blind.
   */
  kind?: string;
}

export interface FlagGateConfig {
  key: string;
  mode: "flag";
  strict: GateStrict;
  /**
   * Default state when no operator override is present. Operator UI may
   * set a runtime override (force-open / force-closed); that override is
   * looked up via the GateOverrideStore extension point (not in core).
   */
  defaultOpen: boolean;
  kind?: string;
}

export type GateConfig = ReleaseGateConfig | FlagGateConfig;

export interface GateContext {
  /** Override "today" for testing or deploy-time consistency checks. */
  now?: string;
  /** Optional override store for flag-mode runtime toggle. */
  overrides?: GateOverrideStore;
}

export interface GateOverrideStore {
  /** Resolve "open" | "closed" | null (no override) for a flag-mode gate. */
  read(key: string): Promise<"open" | "closed" | null>;
}

/**
 * A detected inconsistency between gate config and reality. Produced by
 * registered GateValidator functions; consumed by registered StrictHandler
 * functions (for strict gates) and the operator suspect store (for both
 * strict + soft).
 */
export interface GateSuspect {
  gateKey: string;
  gateMode: GateMode;
  /** Domain extension set by a consumer (e.g. "policy"). */
  gateKind?: string;
  strict: boolean;
  /** ISO-8601 timestamp of detection. */
  detectedAt: string;
  /** Stable machine-readable reason code. */
  reason: string;
  /** Free-form context for operator triage. */
  detail?: Record<string, unknown>;
}

/**
 * Handler output is *routing metadata only* — never a side-effect.
 *
 * Library is transport-agnostic: no Slack/Discord/PagerDuty/webhook
 * literals here or in any HandlerResponse field. Channel resolution +
 * actual push happens downstream (Argo workflow, ops runbook, etc.).
 */
export interface HandlerResponse {
  /** Owning app key — used by workflow to look up routing config. */
  appKey: string;
  severity: "info" | "warn" | "critical";
  /** Routing hints. Workflow maps these to channels/destinations. */
  tags?: string[];
  /** HTTP endpoint that should receive a structured ingest (suspect store). */
  ingestUrl?: string;
  /** One-line human-readable label. */
  summary: string;
  /** Structured fields for ingest body / alert template. */
  detail?: Record<string, unknown>;
}

export type StrictHandler = (
  suspect: GateSuspect,
) => Promise<HandlerResponse | null>;

export type GateValidator = () => Promise<GateSuspect[]>;
