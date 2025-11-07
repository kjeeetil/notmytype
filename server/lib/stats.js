// Shared helpers for computing player stats; extracted for testability.
export function b64url(input) {
  return Buffer.from(input).toString("base64url").slice(0, 16);
}

export function computeWPM(correctChars, startedAt, now = Date.now()) {
  if (!startedAt || correctChars <= 0) return 0;
  const minutes = (now - startedAt) / 60000;
  if (minutes <= 0) return 0;
  const words = correctChars / 5;
  return Math.round(words / minutes);
}

export function computeAcc(correct, total) {
  if (total <= 0) return 100;
  if (correct <= 0) return 0;
  return Math.round((correct / total) * 100);
}
