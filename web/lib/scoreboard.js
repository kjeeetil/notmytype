import fs from "fs";
import path from "path";

const MAX_RECENT_SCORES = 10;
const SCORE_FILE_PATH = path.resolve(process.cwd(), "data", "scores.json");

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

function loadSeedScores(filePath, maxEntries) {
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      return [];
    }
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const seeds = [];
    for (const item of parsed) {
      try {
        const entry = sanitizeScoreEntry({
          name: item?.name,
          score: item?.score
        });
        const timestamp = Number(item?.timestamp);
        seeds.push({
          ...entry,
          timestamp: Number.isFinite(timestamp) && timestamp > 0 ? timestamp : entry.timestamp
        });
      } catch {
        continue;
      }
      if (typeof maxEntries === "number" && seeds.length >= maxEntries) {
        break;
      }
    }
    return seeds;
  } catch {
    return [];
  }
}

function createScoreboard({ maxEntries = MAX_RECENT_SCORES } = {}) {
  const entries = [];
  const api = {
    list() {
      return [...entries];
    },
    record(entry) {
      const copy = { ...entry };
      const existingIndex = entries.findIndex(
        (item) => item?.name === copy.name
      );

      if (existingIndex >= 0) {
        if (entries[existingIndex].score >= copy.score) {
          return this.list();
        }
        entries[existingIndex] = copy;
      } else {
        entries.push(copy);
      }
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

  const seeds = loadSeedScores(SCORE_FILE_PATH, maxEntries);
  seeds.forEach((seed) => {
    api.record(seed);
  });

  return api;
}

const globalScoreboardKey = Symbol.for("torfinn.scoreboard");
const globalObj = globalThis;

if (!globalObj[globalScoreboardKey]) {
  globalObj[globalScoreboardKey] = createScoreboard();
}

const scoreboard = globalObj[globalScoreboardKey];

export { scoreboard, sanitizeScoreEntry };
