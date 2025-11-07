import { describe, expect, it } from "vitest";
import { computeWPM, computeAcc, b64url } from "../lib/stats.js";

describe("computeWPM", () => {
  it("returns 0 when timer has not started", () => {
    expect(computeWPM(10, null)).toBe(0);
  });

  it("computes rounded words per minute", () => {
    const startedAt = 0;
    const now = 60000; // 1 minute later
    expect(computeWPM(25, startedAt, now)).toBe(5);
  });

  it("guards against zero duration", () => {
    expect(computeWPM(25, 1000, 1000)).toBe(0);
  });
});

describe("computeAcc", () => {
  it("returns 100 when no keystrokes recorded", () => {
    expect(computeAcc(0, 0)).toBe(100);
  });

  it("returns 0 when no correct chars", () => {
    expect(computeAcc(0, 10)).toBe(0);
  });

  it("rounds accuracy to nearest percent", () => {
    expect(computeAcc(7, 10)).toBe(70);
  });
});

describe("b64url", () => {
  it("produces fixed-length, url-safe snippets", () => {
    const snippet = b64url("Fast fox");
    expect(snippet).toHaveLength(16);
    expect(/[A-Za-z0-9_-]+/.test(snippet)).toBe(true);
  });
});
