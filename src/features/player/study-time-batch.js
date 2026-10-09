// Acknowledged entries are removed; the failed and unattempted remainder is
// merged with any time accumulated while the request was in flight.
export async function sendStudyTimeBatch(entries, pending, send) {
  for (let index = 0; index < entries.length; index++) {
    const [position, seconds] = entries[index];
    try {
      await send(position, seconds);
    } catch (error) {
      for (const [position, seconds] of entries.slice(index))
        pending.set(position, (pending.get(position) || 0) + seconds);
      throw error;
    }
  }
}

// Take the batch only when its turn starts. A preceding failed request may
// have restored entries after this flush was queued.
export function createStudyTimeQueue(pending) {
  let queue = Promise.resolve();
  return (position, send) => {
    const request = queue
      .catch(() => {})
      .then(async () => {
        const entries = [...pending.entries()];
        pending.clear();
        entries.push([position, 0]);
        await sendStudyTimeBatch(entries, pending, send);
      });
    queue = request;
    return request;
  };
}
