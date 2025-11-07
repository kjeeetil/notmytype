import { MAX_RECENT_SCORES } from "./constants.js";

export function createScoreboard({ maxEntries = MAX_RECENT_SCORES } = {}) {
  const entries = [];

  return {
    list() {
      return [...entries];
    },
    record(entry) {
      entries.unshift(entry);
      if (entries.length > maxEntries) {
        entries.length = maxEntries;
      }
      return this.list();
    }
  };
}
