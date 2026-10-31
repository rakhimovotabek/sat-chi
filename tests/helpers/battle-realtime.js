import assert from "node:assert/strict";
export async function verifyBattleRealtime({ app, learner, outsider, rpc }) {
  const action = (client, action, data = {}) =>
    rpc(client, "battle_action", { p_action: action, p_data: data });
  const room = await action(learner, "create", {
    category: "Math",
    capacity: 2,
    questionCount: 1,
    seconds: 30,
    public: false,
    filters: { book: app.book },
  });
  const events = [],
    deniedEvents = [];
  const channels = [],
    statuses = [];
  const subscribe = async (client, received, suffix) => {
    const channel = client.channel(`actual-revisions-${room.id}-${suffix}`).on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "battle_signals",
        filter: `battle_id=eq.${room.id}`,
      },
      (event) => received.push(event),
    );
    channels.push([client, channel]);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Actual Realtime subscription timed out")),
        20000,
      );
      channel.subscribe((status, error) => {
        statuses.push({ suffix, status, error: error?.message });
        if (status === "SUBSCRIBED") {
          clearTimeout(timeout);
          resolve();
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          clearTimeout(timeout);
          reject(error || new Error(status));
        }
      });
    });
  };
  try {
    await subscribe(learner, events, "member");
    await subscribe(outsider, deniedEvents, "outsider");
    const userId = (await learner.auth.getUser()).data.user.id;
    for (let i = 0; i < 100; i++) {
      if (
        (await app.json(
          `select count(*)from realtime.subscription where claims->>'sub'='${userId}'`,
        )) > 0
      )
        break;
      await new Promise((r) => setTimeout(r, 100));
    }
    await action(learner, "ready", { id: room.id });
    for (let i = 0; i < 100 && !events.length; i++)
      await new Promise((r) => setTimeout(r, 100));
    if (!events.length) {
      console.error(await app.serviceDiagnostics());
      console.error(statuses);
      console.error(
        await app.sql(
          "select pubname,schemaname,tablename from pg_publication_tables;select slot_name,plugin,active from pg_replication_slots;select entity::regclass,claims->>'role'from realtime.subscription",
        ),
      );
    }
    assert.ok(
      events.length,
      "received actual WAL-backed WebSocket event without polling",
    );
    assert.deepEqual(Object.keys(events[0].new).sort(), [
      "battle_id",
      "changed_at",
      "revision",
    ]);
    assert.equal(events[0].new.battle_id, room.id);
    assert.ok(events[0].new.revision > 1);
    // A second allowed mutation gives the outsider the same delivery window.
    await action(learner, "ready", { id: room.id });
    await new Promise((r) => setTimeout(r, 1000));
    assert.deepEqual(deniedEvents, []);
    await action(learner, "cancel", { id: room.id });
  } finally {
    for (const [client, channel] of channels)
      await client.removeChannel(channel);
  }
}
