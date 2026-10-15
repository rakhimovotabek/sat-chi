export function countdownParts(target, now = Date.now()) {
  const milliseconds = Date.parse(target) - now;
  if (!Number.isFinite(milliseconds)) return null;
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
    past: milliseconds <= 0,
  };
}
