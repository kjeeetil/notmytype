const MAX_RECENT_SCORES = 10;

function createScoreboard({ maxEntries = MAX_RECENT_SCORES } = {}) {
  const entries = [];

  return {
    list() {
      return [...entries];
    },
    record(entry) {
      entries.push(entry);
      entries.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const aTime = typeof a.timestamp === "number" ? a.timestamp : 0;
        const bTime = typeof b.timestamp === "number" ? b.timestamp : 0;
        return aTime - bTime;
      });
      if (entries.length > maxEntries) {
        entries.length = maxEntries;
      }
      return this.list();
    }
  };
}

function sanitizeScoreEntry(payload = {}) {
  const numericScore = Number(payload.score);
  if (!Number.isFinite(numericScore) || numericScore <= 0) {
    throw new Error("Invalid score value");
  }
  const name = typeof payload.name === "string" && payload.name.trim()
    ? payload.name.trim().slice(0, 32)
    : "Anonymous";
  return {
    name,
    score: Math.round(numericScore),
    timestamp: Date.now()
  };
}

const globalScoreboardKey = Symbol.for("torfinn.scoreboard");
const globalObj = globalThis;

if (!globalObj[globalScoreboardKey]) {
  globalObj[globalScoreboardKey] = createScoreboard();
}

const scoreboard = globalObj[globalScoreboardKey];

export { scoreboard, sanitizeScoreEntry };
