import { afterEach, describe, expect, it } from "vitest";
import {
  __resetForTest,
  classify,
  declareGate,
  getGate,
  isGateOpen,
  listGates,
  registerGateValidator,
  registerStrictHandler,
  releaseGateOpen,
  runAllValidators,
  type GateSuspect,
} from "./index";

afterEach(() => __resetForTest());

describe("declareGate", () => {
  it("rejects a duplicate key", () => {
    declareGate({ key: "a", mode: "flag", strict: false, defaultOpen: true });
    expect(() =>
      declareGate({ key: "a", mode: "flag", strict: false, defaultOpen: false }),
    ).toThrow(/duplicate/);
  });

  it("is introspectable", () => {
    declareGate({ key: "a", mode: "release", strict: true, effectiveDate: "2026-01-01" });
    expect(getGate("a")?.mode).toBe("release");
    expect(listGates()).toHaveLength(1);
  });
});

describe("isGateOpen — release mode", () => {
  it("is closed before the effective date", async () => {
    declareGate({ key: "r", mode: "release", strict: false, effectiveDate: "2026-07-15" });
    expect(await isGateOpen("r", { now: "2026-07-14" })).toBe(false);
  });

  it("opens on and after the effective date", async () => {
    declareGate({ key: "r", mode: "release", strict: false, effectiveDate: "2026-07-15" });
    expect(await isGateOpen("r", { now: "2026-07-15" })).toBe(true);
    expect(await isGateOpen("r", { now: "2027-01-01" })).toBe(true);
  });
});

describe("isGateOpen — flag mode", () => {
  it("returns defaultOpen with no override", async () => {
    declareGate({ key: "f", mode: "flag", strict: false, defaultOpen: true });
    expect(await isGateOpen("f")).toBe(true);
  });

  it("honors an override store", async () => {
    declareGate({ key: "f", mode: "flag", strict: false, defaultOpen: true });
    const overrides = {
      read: async (k: string) => (k === "f" ? ("closed" as const) : null),
    };
    expect(await isGateOpen("f", { overrides })).toBe(false);
  });
});

describe("isGateOpen — fails closed", () => {
  it("returns false for an undeclared gate", async () => {
    expect(await isGateOpen("nope")).toBe(false);
  });
});

describe("releaseGateOpen — synchronous release check", () => {
  it("matches isGateOpen for a release gate (closed before, open on/after)", () => {
    declareGate({ key: "r", mode: "release", strict: false, effectiveDate: "2026-07-15" });
    expect(releaseGateOpen("r", { now: "2026-07-14" })).toBe(false);
    expect(releaseGateOpen("r", { now: "2026-07-15" })).toBe(true);
  });

  it("fails closed for an undeclared gate", () => {
    expect(releaseGateOpen("nope")).toBe(false);
  });

  it("throws for a flag-mode gate (no synchronous answer)", () => {
    declareGate({ key: "f", mode: "flag", strict: false, defaultOpen: true });
    expect(() => releaseGateOpen("f")).toThrow(/not "release"/);
  });
});

describe("validators + classify", () => {
  const suspect: GateSuspect = {
    gateKey: "x",
    gateMode: "release",
    gateKind: "policy",
    strict: true,
    detectedAt: "2026-07-15T00:00:00Z",
    reason: "test",
  };

  it("runAllValidators concatenates every validator's suspects", async () => {
    registerGateValidator(async () => [suspect]);
    registerGateValidator(async () => [suspect, suspect]);
    expect(await runAllValidators()).toHaveLength(3);
  });

  it("classify routes a suspect through matching handlers and drops null opt-outs", async () => {
    registerStrictHandler(async (s) =>
      s.gateKind === "policy"
        ? { appKey: "legal", severity: "warn", summary: s.reason }
        : null,
    );
    registerStrictHandler(async () => null); // opts out
    const out = await classify([suspect]);
    expect(out).toHaveLength(1);
    expect(out[0].response.appKey).toBe("legal");
  });
});
