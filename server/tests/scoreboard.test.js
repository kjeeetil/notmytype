import { describe, expect, it } from "vitest";
import { createScoreboard } from "../lib/scoreboard.js";

describe("scoreboard", () => {
  it("orders entries by score descending", () => {
    const scoreboard = createScoreboard({ maxEntries: 5 });
    scoreboard.record({ name: "A", score: 50, timestamp: 1 });
    scoreboard.record({ name: "B", score: 100, timestamp: 2 });
    scoreboard.record({ name: "C", score: 75, timestamp: 3 });

    const names = scoreboard.list().map((entry) => entry.name);
    expect(names).toEqual(["B", "C", "A"]);
  });

  it("trims to max entries while keeping highest scores", () => {
    const scoreboard = createScoreboard({ maxEntries: 2 });
    scoreboard.record({ name: "Low", score: 30, timestamp: 1 });
    scoreboard.record({ name: "Mid", score: 50, timestamp: 2 });
    scoreboard.record({ name: "High", score: 100, timestamp: 3 });
    scoreboard.record({ name: "Lower", score: 40, timestamp: 4 });

    const snapshot = scoreboard.list();
    expect(snapshot).toHaveLength(2);
    expect(snapshot.map((entry) => entry.name)).toEqual(["High", "Mid"]);
  });

  it("keeps deterministic order for tied scores", () => {
    const scoreboard = createScoreboard({ maxEntries: 3 });
    scoreboard.record({ name: "Earlier", score: 80, timestamp: 10 });
    scoreboard.record({ name: "Later", score: 80, timestamp: 20 });
    scoreboard.record({ name: "Newest", score: 60, timestamp: 30 });

    expect(scoreboard.list().map((entry) => entry.name)).toEqual([
      "Earlier",
      "Later",
      "Newest",
    ]);
  });
});
