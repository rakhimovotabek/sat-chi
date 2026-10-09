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
