import { MAX_RECENT_SCORES } from "./constants.js";

export function createScoreboard({ maxEntries = MAX_RECENT_SCORES } = {}) {
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
