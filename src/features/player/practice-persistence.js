// Only pending answer changes are stored. Keys are scoped to the authenticated
// owner and session; source questions and frozen grading keys are never copied.
export const answerValues = (item) => ({
  id: item.id,
  selected_answer: item.selected_answer ?? null,
  ...((
    item.question
      ? item.question.question_type === "open"
      : "selected_response" in item
  )
    ? { selected_response: item.selected_response ?? null }
    : {}),
  marked: Boolean(item.marked),
  eliminated: item.eliminated || [],
});
const same = (a, b) =>
  JSON.stringify(answerValues(a)) === JSON.stringify(answerValues(b));

export function createPracticePersistence({
  userId,
  sessionId,
  items,
  submitted = false,
  save,
  storage,
  uuid = () => crypto.randomUUID(),
}) {
  const prefix = `satchi.practice-pending.v1:${userId}:${sessionId}:`;
  const key = prefix + uuid();
  const base = new Map(items.map((i) => [i.id, { ...i }]));
  const dirty = new Map(),
    sources = new Map(),
    listeners = new Set();
  let queue = Promise.resolve(),
    pending = 0,
    error = "",
    durable = true,
    needsReload = false;
  const conflicts = new Set();
  const readable = () =>
    items.map((i) => ({
      ...base.get(i.id),
      ...(!conflicts.has(i.id) ? dirty.get(i.id)?.values : {}),
    }));
  const state = () => ({
    items: readable(),
    pending,
    unsaved: dirty.size > 0,
    error,
    durable,
    conflicts: [...conflicts],
    recovered: [...conflicts].map((id) => ({
      id,
      position: base.get(id)?.position ?? dirty.get(id)?.position,
      saved: base.has(id) ? answerValues(base.get(id)) : null,
      pending: dirty.get(id)?.values,
    })),
    canUseDrafts:
      !needsReload && !submitted && [...conflicts].every((id) => base.has(id)),
  });
  const notify = () => listeners.forEach((fn) => fn(state()));
  function cleanSources(ids) {
    for (const [source, localIds] of sources) {
      try {
        const record = JSON.parse(storage.getItem(source) || "null");
        if (!record?.entries) continue;
        const keep = record.entries.filter(
          (e) => !ids.has(e.localId) || !localIds.has(e.localId),
        );
        if (keep.length)
          storage.setItem(source, JSON.stringify({ entries: keep }));
        else storage.removeItem(source);
      } catch {
        /* Keep the original recovery record if cleanup fails. */
      }
    }
  }
  function persist() {
    try {
      if (!storage) throw new Error("Unavailable storage");
      if (dirty.size)
        storage.setItem(key, JSON.stringify({ entries: [...dirty.values()] }));
      else storage.removeItem(key);
      // Remove only the exact records adopted, after the new copy is durable.
      cleanSources(
        new Set([...dirty.values()].flatMap((e) => e.adopted || [])),
      );
      durable = true;
    } catch {
      durable = false;
    }
  }
  try {
    if (!storage) throw new Error("Unavailable storage");
    for (const source of Array.from({ length: storage.length }, (_, n) =>
      storage.key(n),
    )) {
      if (!source?.startsWith(prefix)) continue;
      const record = JSON.parse(storage.getItem(source));
      if (record === null) continue; // Another tab may have acknowledged it.
      if (!Array.isArray(record?.entries))
        throw new Error("Invalid recovery record");
      sources.set(source, new Set(record.entries.map((e) => e.localId)));
      for (const entry of record.entries) {
        if (
          !entry.id ||
          !entry.values ||
          !Number.isSafeInteger(entry.expected_revision)
        )
          throw new Error("Invalid recovery record");
        const server = base.get(entry.id);
        if (server && same(server, entry.values)) {
          cleanSources(new Set([entry.localId]));
          continue; // Save succeeded, but its acknowledgement was lost.
        }
        const previous = dirty.get(entry.id);
        if (previous && !same(previous.values, entry.values))
          conflicts.add(entry.id);
        if (
          !server ||
          submitted ||
          (server.answer_revision || 0) !== entry.expected_revision
        )
          conflicts.add(entry.id);
        dirty.set(entry.id, {
          ...entry,
          adopted: [...(previous?.adopted || []), entry.localId],
        });
      }
    }
  } catch {
    durable = false;
    error =
      "Answer recovery storage is unavailable. Keep this page open until saving succeeds.";
  }
  if (dirty.size) persist();
  if (conflicts.size)
    error =
      "Saved answers or homework questions changed. Review recovered answers before saving.";

  async function send() {
    if (conflicts.size) throw new Error(error);
    const batch = [...dirty.values()];
    if (!batch.length) return;
    pending++;
    notify();
    try {
      const result = await save(
        batch.map((e) => ({
          ...e.values,
          expected_revision: e.expected_revision,
        })),
      );
      if (
        !Array.isArray(result) ||
        batch.some(
          (e) =>
            !result.some(
              (r) => r.id === e.id && Number.isSafeInteger(r.answer_revision),
            ),
        )
      )
        throw new Error(
          "The server did not confirm your answers. Retry saving.",
        );
      const acknowledged = new Set();
      for (const sent of batch) {
        const ack = result.find((r) => r.id === sent.id);
        base.set(sent.id, {
          ...base.get(sent.id),
          ...sent.values,
          answer_revision: ack.answer_revision,
        });
        const current = dirty.get(sent.id);
        if (current?.localId === sent.localId) {
          dirty.delete(sent.id);
          acknowledged.add(sent.localId);
        } else if (current) current.expected_revision = ack.answer_revision;
      }
      cleanSources(acknowledged);
      persist();
      error = "";
    } catch (e) {
      error = e.message;
      if (e.code === "40001") {
        needsReload = true;
        for (const entry of batch) conflicts.add(entry.id);
      }
      throw e;
    } finally {
      pending--;
      notify();
    }
  }
  return {
    state,
    subscribe(fn) {
      listeners.add(fn);
      fn(state());
      return () => listeners.delete(fn);
    },
    change(id, patch) {
      const row = readable().find((i) => i.id === id);
      if (!row || submitted || conflicts.has(id)) return;
      const entry = dirty.get(id);
      if (patch.selected_answer != null || patch.selected_response?.trim())
        base.get(id).has_answered = true;
      dirty.set(id, {
        id,
        position: row.position,
        localId: uuid(),
        expected_revision:
          entry?.expected_revision ?? (row.answer_revision || 0),
        values: answerValues({ ...row, ...patch }),
        adopted: entry?.adopted || [],
      });
      persist();
      notify();
    },
    flush() {
      const next = queue.catch(() => {}).then(send);
      queue = next;
      return next;
    },
    resolve(useDrafts) {
      if (useDrafts && needsReload) return;
      for (const id of conflicts) {
        const entry = dirty.get(id),
          server = base.get(id);
        if (useDrafts && server && !submitted)
          entry.expected_revision = server.answer_revision || 0;
        else {
          cleanSources(new Set([entry.localId, ...(entry.adopted || [])]));
          dirty.delete(id);
        }
      }
      conflicts.clear();
      error = "";
      persist();
      notify();
    },
  };
}
