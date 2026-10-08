import test from "node:test";
import assert from "node:assert/strict";
import {
  nativeAppEnvironment,
  student,
} from "./helpers/native-app-environment.js";

test(
  "migration transition protects persisted progress from deployed legacy RPC payloads",
  {
    skip: !(
      process.env.SATCHI_TEST_POSTGRES_BIN && process.env.SATCHI_TEST_POSTGREST
    ),
    timeout: 120000,
  },
  async (t) => {
    const app = await nativeAppEnvironment();
    t.after(() => app.close());
    const login = await fetch(app.apiUrl + "/auth/v1/token", {
      method: "POST",
      body: JSON.stringify({
        email: "student@fixture.invalid",
        password: "disposable-test-only",
      }),
    });
    assert.equal(login.status, 200);
    const { access_token: bearer } = await login.json();
    const rpc = async (name, body) => {
      const response = await fetch(app.apiUrl + "/rest/v1/rpc/" + name, {
        method: "POST",
        headers: {
          authorization: "Bearer " + bearer,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const raw = await response.text();
      return { status: response.status, data: raw ? JSON.parse(raw) : null };
    };
    const rows = () =>
      app.json(
        app.as(
          student,
          `select jsonb_agg(to_jsonb(i) order by position) from public.book_practice_items i where session_id='${app.session}'`,
        ),
      );
    const initial = await rows();
    // Exact deployed payload shape. No helper may inject expected_revision.
    const snapshot = initial.map((item) => ({
      id: item.id,
      selected_answer: item.selected_answer,
      marked: item.marked,
      eliminated: item.eliminated,
    }));
    const legacy = (answers) =>
      rpc("save_book_practice", {
        p_session_id: app.session,
        p_answers: answers,
      });
    const save = (changes) =>
      rpc("save_practice_changes", {
        p_session: app.session,
        p_changes: changes,
      });

    await t.test("deployed contract works before upgrade", async () => {
      assert.equal(
        (await legacy([{ ...snapshot[0], selected_answer: 1 }])).status,
        204,
      );
      assert.equal((await rows())[0].selected_answer, 1);
    });
    await app.upgrade();
    await t.test(
      "upgrade preserves existing answers at revision zero",
      async () => {
        const after = await rows();
        assert.equal(after[0].selected_answer, 1);
        assert.equal(after[0].answer_revision, 0);
        assert.equal(after.length, initial.length);
      },
    );
    await t.test(
      "versionless snapshots fail atomically, including unchanged and revision-zero items",
      async () => {
        const before = await rows();
        for (const payload of [
          snapshot,
          [{ ...snapshot[0], selected_answer: 1 }],
          [snapshot[1]],
          [{ ...snapshot[1], expected_revision: null }],
          [{ ...snapshot[1], expected_revision: "0" }],
          [
            { ...snapshot[1], selected_answer: 2, expected_revision: 0 },
            snapshot[0],
          ],
        ]) {
          const result = await legacy(payload);
          assert.equal(result.status, 400);
          assert.match(result.data.message, /Answer version required/);
          assert.deepEqual(await rows(), before);
        }
      },
    );
    await t.test(
      "revision-aware requests work through both guarded public contracts",
      async () => {
        assert.equal(
          (
            await legacy([
              { ...snapshot[0], selected_answer: 2, expected_revision: 0 },
            ])
          ).status,
          204,
        );
        const changes = [
          { id: initial[1].id, selected_answer: 3, expected_revision: 0 },
        ];
        const result = await save(changes);
        assert.equal(result.status, 200);
        assert.deepEqual(result.data, [
          { id: initial[1].id, answer_revision: 1 },
        ]);
        // Treat first acknowledgement as lost, then resend the identical request.
        assert.deepEqual(await save(changes), result);
        assert.equal((await rows())[1].answer_revision, 1);
      },
    );
    await t.test(
      "stale full snapshots and mixed batches cannot overwrite or partially commit",
      async () => {
        const before = await rows();
        const stale = await legacy(snapshot);
        assert.equal(stale.status, 400);
        const conflict = await save([
          { id: initial[2].id, selected_answer: 1, expected_revision: 0 },
          { id: initial[0].id, selected_answer: 0, expected_revision: 0 },
        ]);
        // PostgREST maps PostgreSQL serialization_failure (40001) to HTTP 500.
        assert.equal(conflict.status, 500);
        assert.equal(conflict.data.code, "40001");
        assert.deepEqual(await rows(), before);
      },
    );
    await t.test(
      "concurrent legacy and revision-aware requests preserve the new answer",
      async () => {
        const [old, current] = await Promise.all([
          legacy([{ ...snapshot[2], selected_answer: 0 }]),
          save([
            { id: initial[2].id, selected_answer: 2, expected_revision: 0 },
          ]),
        ]);
        assert.equal(old.status, 400);
        assert.equal(current.status, 200);
        const after = await rows();
        assert.deepEqual(
          after.slice(0, 3).map((item) => item.selected_answer),
          [2, 3, 2],
        );
        assert.deepEqual(
          after.slice(0, 3).map((item) => item.answer_revision),
          [1, 1, 1],
        );
      },
    );
  },
);
