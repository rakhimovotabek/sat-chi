import test from 'node:test';
import assert from 'node:assert/strict';
import { createManageStudentHandler } from '../supabase/functions/manage-student/handler.js';

const adminId = 'a0000000-0000-0000-0000-000000000001';
const studentId = 'a0000000-0000-0000-0000-000000000002';
const otherAdminId = 'a0000000-0000-0000-0000-000000000003';
const validCreate = { action: 'create', email: 'student@example.test', password: 'unique-test-password', display_name: 'Test Student', username: 'test_student' };

function fixture(overrides = {}) {
  const calls = [];
  const caller = { id: adminId, role: 'admin', active: true, ...overrides.caller };
  let failProfile = false;
  const server = {
    from(table) {
      assert.equal(table, 'profiles');
      let target;
      let update;
      return {
        select() { return this; },
        eq(field, value) { if (field === 'id') target = value; return this; },
        update(value) { update = value; calls.push(['update', value]); return this; },
        async single() {
          if (update) {
            if (overrides.profileThrows) { failProfile = true; throw new Error('test transport failure'); }
            failProfile = Boolean(overrides.profileError);
            return failProfile ? { data: null, error: overrides.profileError } : { data: { id: studentId, role: 'student', ...update }, error: null };
          }
          return { data: caller, error: overrides.callerError || null };
        },
        async maybeSingle() { return { data: overrides.target === null ? null : { id: target, role: target === otherAdminId ? 'admin' : 'student' }, error: null }; },
      };
    },
    auth: { admin: {
      async createUser(value) { calls.push(['create', value]); return { data: { user: { id: studentId } }, error: overrides.createError || null }; },
      async deleteUser(id, softDelete) { calls.push(['delete', id, softDelete]); if (overrides.cleanupThrows) throw new Error('test cleanup transport failure'); return { error: failProfile ? overrides.cleanupError || null : overrides.deleteError || null }; },
    } },
  };
  const callerClient = { async rpc(name) { assert.equal(name, 'satchi_assert_release_write_access'); calls.push(['gate']); return { error: overrides.gateError || null }; }, auth: { async getUser(token) {
    calls.push(['verify', token]);
    return overrides.authError ? { data: { user: null }, error: { message: 'invalid' } } : { data: { user: { id: adminId } }, error: null };
  } } };
  const environment = { SUPABASE_URL: 'https://example.test', SUPABASE_ANON_KEY: 'test-public-key', SUPABASE_SERVICE_ROLE_KEY: 'test-server-key', ALLOWED_ORIGINS: 'http://localhost:5173', ...overrides.env };
  const handle = createManageStudentHandler({
    createClient(_url, key) { return key === environment.SUPABASE_ANON_KEY ? callerClient : server; },
    getEnv(name) { return environment[name]; },
    logError() {},
  });
  const request = (body, options = {}) => new Request('https://example.test/functions/v1/manage-student', {
    method: options.method || 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-user-jwt', ...options.headers },
    body: options.method && options.method !== 'POST' ? undefined : JSON.stringify(body),
  });
  return { calls, handle, request };
}

for (const [label, overrides, status] of [
  ['invalid session', { authError: true }, 401],
  ['student caller', { caller: { role: 'student' } }, 403],
  ['inactive admin', { caller: { active: false } }, 403],
  ['profile query failure', { callerError: { message: 'unavailable' } }, 403],
]) {
  test(`rejects ${label} before privileged mutations`, async () => {
    const f = fixture(overrides);
    assert.equal((await f.handle(f.request(validCreate))).status, status);
    assert.equal(f.calls.some(([kind]) => ['create', 'update', 'delete'].includes(kind)), false);
  });
}

test('requires Bearer authentication', async () => {
  const f = fixture();
  assert.equal((await f.handle(f.request(validCreate, { headers: { Authorization: '' } }))).status, 401);
  assert.equal(f.calls.length, 0);
});

test('fails closed when server secrets are missing', async () => {
  const f = fixture({ env: { SUPABASE_SERVICE_ROLE_KEY: '' } });
  assert.equal((await f.handle(f.request(validCreate))).status, 503);
  assert.equal(f.calls.length, 0);
});

test('rejects unapproved browser origins and permits configured preflight', async () => {
  const f = fixture();
  assert.equal((await f.handle(f.request(validCreate, { headers: { Origin: 'https://evil.example' } }))).status, 403);
  const response = await f.handle(f.request(null, { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } }));
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'http://localhost:5173');
  assert.equal(f.calls.length, 0);
});

test('creates only a student account with safe metadata', async () => {
  const f = fixture();
  const response = await f.handle(f.request(validCreate));
  assert.equal(response.status, 201);
  assert.deepEqual(f.calls[0], ['verify', 'test-user-jwt']);
  assert.deepEqual(f.calls.find(([kind]) => kind === 'create')[1].user_metadata, { display_name: 'Test Student' });
  assert.equal((await response.json()).student.role, 'student');
});

for (const [label, body] of [
  ['role injection', { ...validCreate, role: 'admin' }],
  ['metadata injection', { ...validCreate, user_metadata: { role: 'admin' } }],
  ['weak password', { ...validCreate, password: 'short' }],
  ['invalid username', { ...validCreate, username: 'bad username' }],
  ['invalid email', { ...validCreate, email: 'invalid' }],
  ['missing display name', { ...validCreate, display_name: '' }],
  ['unsupported action', { action: 'promote' }],
]) {
  test(`rejects ${label}`, async () => {
    const f = fixture();
    assert.equal((await f.handle(f.request(body))).status, 400);
    assert.equal(f.calls.some(([kind]) => kind === 'create'), false);
  });
}

test('removes a new Auth user when profile setup fails', async () => {
  const f = fixture({ profileError: { code: '23505' } });
  assert.equal((await f.handle(f.request(validCreate))).status, 409);
  assert.deepEqual(f.calls.find(([kind]) => kind === 'delete'), ['delete', studentId, false]);
});

test('reports failed compensation without claiming success', async () => {
  const f = fixture({ profileError: { code: '23505' }, cleanupError: { message: 'unavailable' } });
  const response = await f.handle(f.request(validCreate));
  assert.equal(response.status, 500);
  assert.match((await response.json()).error, /check Auth users/);
});

for (const [label, id, status] of [['self', adminId, 403], ['admin target', otherAdminId, 403], ['invalid ID', 'bad-id', 400]]) {
  test(`blocks deletion of ${label}`, async () => {
    const f = fixture();
    assert.equal((await f.handle(f.request({ action: 'delete', student_id: id }))).status, status);
    assert.equal(f.calls.some(([kind]) => kind === 'delete'), false);
  });
}

test('returns 404 for missing student', async () => {
  const f = fixture({ target: null });
  assert.equal((await f.handle(f.request({ action: 'delete', student_id: studentId }))).status, 404);
  assert.equal(f.calls.some(([kind]) => kind === 'delete'), false);
});

test('deactivates only a verified student without deleting Auth or history', async () => {
  const f = fixture();
  assert.equal((await f.handle(f.request({ action: 'delete', student_id: studentId }))).status, 200);
  assert.deepEqual(f.calls.find(([kind]) => kind === 'update'), ['update', { active: false }]);
  assert.equal(f.calls.some(([kind]) => kind === 'delete'), false);
});

test('does not claim deletion when profile deactivation fails', async () => {
  const f = fixture({ profileError: { message: 'unavailable' } });
  assert.equal((await f.handle(f.request({ action: 'delete', student_id: studentId }))).status, 500);
});

test('rejects oversized bodies and wrong methods', async () => {
  const f = fixture();
  assert.equal((await f.handle(f.request({ ...validCreate, display_name: 'x'.repeat(9000) }))).status, 413);
  assert.equal((await f.handle(f.request(null, { method: 'GET' }))).status, 405);
});


test('compensates even when profile transport throws', async () => {
  const f = fixture({ profileThrows: true });
  assert.equal((await f.handle(f.request(validCreate))).status, 500);
  assert.deepEqual(f.calls.find(([kind]) => kind === 'delete'), ['delete', studentId, false]);
});

test('reports thrown cleanup failures for manual inspection', async () => {
  const f = fixture({ profileThrows: true, cleanupThrows: true });
  const response = await f.handle(f.request(validCreate));
  assert.equal(response.status, 500);
  assert.match((await response.json()).error, /check Auth users/);
});

for (const code of ['PT503', 'PT426', 'PGRST202']) {
  test(`release guard rejects ${code} before Auth or profile mutations`, async () => {
    const f = fixture({ env: { SATCHI_RELEASE_GATE_REQUIRED: 'true' }, gateError: { code, message: 'Release gate rejected request' } });
    const response = await f.handle(f.request(validCreate));
    assert.equal(response.status, code === 'PT426' ? 426 : 503);
    assert.ok(f.calls.some(([kind]) => kind === 'gate'));
    assert.equal(f.calls.some(([kind]) => ['create', 'update', 'delete'].includes(kind)), false);
  });
}
