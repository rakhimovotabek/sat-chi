const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USERNAME = /^[a-z0-9_]{3,32}$/;
const MAX_BODY_BYTES = 8192;
const PROFILE_FIELDS = 'id,role,display_name,username,active,created_at';

// Dependencies are injected so authorization and compensation can be tested
// without sending privileged requests to a real project.
export function createManageStudentHandler({ createClient, getEnv, logError = console.error }) {
  return async function handleRequest(request) {
    const origin = request.headers.get('Origin');
    const allowedOrigins = (getEnv('ALLOWED_ORIGINS') || '').split(',').map((value) => value.trim()).filter(Boolean);
    const cors = {
      'Vary': 'Origin',
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-satchi-client-version',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };
    if (origin && allowedOrigins.includes(origin)) cors['Access-Control-Allow-Origin'] = origin;
    const respond = (status, body) => Response.json(body, { status, headers: { ...cors, 'Cache-Control': 'no-store' } });

    if (origin && !allowedOrigins.includes(origin)) return respond(403, { error: 'Origin is not allowed.' });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return respond(405, { error: 'Use POST.' });

    const token = request.headers.get('Authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) return respond(401, { error: 'Authentication required.' });
    const url = getEnv('SUPABASE_URL');
    const anonKey = getEnv('SUPABASE_ANON_KEY');
    const serviceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !anonKey || !serviceKey) return respond(503, { error: 'Account management is not configured.' });

    try {
      const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
      const callerClient = createClient(url, anonKey, { ...options, global: { headers: {
        Authorization: `Bearer ${token}`,
        'x-satchi-client-version': request.headers.get('x-satchi-client-version') || '',
      } } });
      // The JWT is validated by Supabase Auth; decoding JWT claims is insufficient.
      const { data: authData, error: authError } = await callerClient.auth.getUser(token);
      if (authError || !authData?.user) return respond(401, { error: 'Invalid or expired session.' });

      const server = createClient(url, serviceKey, options);
      const { data: caller, error: callerError } = await server.from('profiles')
        .select('id,role,active').eq('id', authData.user.id).single();
      if (callerError || caller?.role !== 'admin' || caller.active !== true) {
        return respond(403, { error: 'An active admin account is required.' });
      }
      if (getEnv('SATCHI_RELEASE_GATE_REQUIRED') === 'true') {
        const { error: gateError } = await callerClient.rpc('satchi_assert_release_write_access');
        if (gateError) return respond(gateError.code === 'PT426' ? 426 : 503, {
          error: gateError.code === 'PT503' || gateError.code === 'PT426'
            ? gateError.message : 'Account management is paused until release safeguards are available.',
        });
      }
      if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
        return respond(415, { error: 'Use application/json.' });
      }
      const text = await request.text();
      if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return respond(413, { error: 'Request is too large.' });
      let body;
      try { body = JSON.parse(text); } catch { return respond(400, { error: 'Invalid JSON.' }); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return respond(400, { error: 'Invalid request.' });

      if (body.action === 'create') {
        const allowedFields = ['action', 'email', 'password', 'display_name', 'username'];
        if (Object.keys(body).some((key) => !allowedFields.includes(key))) return respond(400, { error: 'Unsupported account fields.' });
        const email = typeof body.email === 'string' ? body.email.trim() : '';
        const password = typeof body.password === 'string' ? body.password : '';
        const displayName = typeof body.display_name === 'string' ? body.display_name.trim() : '';
        const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return respond(400, { error: 'A valid email is required.' });
        if (password.length < 12 || password.length > 128) return respond(400, { error: 'Password must contain 12–128 characters.' });
        if (!displayName || displayName.length > 120) return respond(400, { error: 'Display name must contain 1–120 characters.' });
        if (username && !USERNAME.test(username)) return respond(400, { error: 'Username must contain 3–32 lowercase letters, digits, or underscores.' });

        const { data: created, error: createError } = await server.auth.admin.createUser({
          email, password, email_confirm: true, user_metadata: { display_name: displayName },
        });
        if (createError || !created?.user) return respond(400, { error: 'Could not create this account. Check the email and project password policy.' });
        // The Auth insert trigger creates a student profile in the same DB transaction.
        let profile;
        let profileError;
        try {
          const result = await server.from('profiles')
            .update({ display_name: displayName, username: username || null })
            .eq('id', created.user.id).eq('role', 'student').select(PROFILE_FIELDS).single();
          profile = result.data;
          profileError = result.error;
        } catch {
          profileError = { code: 'PROFILE_REQUEST_FAILED' };
        }
        if (profileError || !profile) {
          // Auth and REST updates are separate transactions: compensate on failure.
          let cleanupError;
          try {
            ({ error: cleanupError } = await server.auth.admin.deleteUser(created.user.id, false));
          } catch { cleanupError = true; }
          if (cleanupError) {
            logError('Student creation cleanup failed; inspect Auth users and profiles.');
            return respond(500, { error: 'Account setup failed and needs an administrator to check Auth users before retrying.' });
          }
          return respond(profileError?.code === '23505' ? 409 : 500, {
            error: profileError?.code === '23505' ? 'Username is already in use.' : 'Profile setup failed. The new account was removed.',
          });
        }
        return respond(201, { student: profile });
      }

      if (body.action === 'delete') {
        if (Object.keys(body).some((key) => !['action', 'student_id'].includes(key))) return respond(400, { error: 'Unsupported account fields.' });
        if (typeof body.student_id !== 'string' || !UUID.test(body.student_id)) return respond(400, { error: 'A valid student ID is required.' });
        if (body.student_id === caller.id) return respond(403, { error: 'You cannot delete your own account.' });
        const { data: target, error: targetError } = await server.from('profiles')
          .select('id,role').eq('id', body.student_id).maybeSingle();
        if (targetError) return respond(500, { error: 'Could not check the student account.' });
        if (!target) return respond(404, { error: 'Student account not found.' });
        if (target.role !== 'student') return respond(403, { error: 'Only student accounts can be deleted here.' });
        // Daily homework retains profile references. Deactivate without destroying history.
        const { data: deactivated, error: deleteError } = await server.from('profiles')
          .update({ active: false }).eq('id', target.id).eq('role', 'student')
          .select('id,active').single();
        if (deleteError || !deactivated || deactivated.active !== false) return respond(500, { error: 'Could not deactivate the student account.' });
        return respond(200, { deleted_id: target.id, deactivated: true });
      }
      return respond(400, { error: 'Action must be create or delete.' });
    } catch {
      logError('Student management request failed.');
      return respond(500, { error: 'Account management is temporarily unavailable.' });
    }
  };
}
