// Signed URLs are capabilities: keep them bounded, in memory, and scoped to
// their authenticated owner. Never persist them or share them across accounts.
export function createQuestionImageCache(
  resolve,
  { now = Date.now, ttl = 3300000, limit = 128 } = {},
) {
  const entries = new Map();
  const keyFor = (owner, src) => JSON.stringify([owner, src]);
  return {
    clear() {
      entries.clear();
    },
    invalidate(owner, src) {
      entries.delete(keyFor(owner, src));
    },
    get(owner, src) {
      const key = keyFor(owner, src);
      const entry = entries.get(key);
      if (entry && entry.expires > now()) return entry.promise;
      entries.delete(key);
      while (entries.size >= limit) entries.delete(entries.keys().next().value);
      const next = { expires: now() + ttl };
      next.promise = Promise.resolve()
        .then(() => resolve(src, owner))
        .catch((error) => {
          if (entries.get(key) === next) entries.delete(key);
          throw error;
        });
      entries.set(key, next);
      return next.promise;
    },
  };
}
