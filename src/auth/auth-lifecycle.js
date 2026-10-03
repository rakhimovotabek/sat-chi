const emptyState = {
  session: null,
  profile: null,
  loading: false,
  error: null,
};

function profileError(data, error) {
  if (error)
    return "Could not load your account. Check your connection and try again.";
  if (!data)
    return "Your account profile is missing. Contact your administrator.";
  if (!["admin", "student"].includes(data.role))
    return "Your account role is not supported. Contact your administrator.";
  if (!data.active)
    return "Your account is inactive. Contact your administrator.";
  return null;
}

// Own one subscription per provider mount. Auth callbacks stay synchronous to
// avoid making Supabase requests while the SDK's auth lock is held.
export function createAuthLifecycle(client, publish) {
  let live = true;
  let state = { ...emptyState, loading: true };
  let revision = 0;
  let events = 0;
  let timer;
  const update = (next) => {
    state = next;
    if (live) publish(state);
  };
  const invalidate = () => {
    revision++;
    clearTimeout(timer);
  };
  async function loadProfile(userId, request) {
    let result;
    try {
      result = await client
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
    } catch (error) {
      if (!live || request !== revision) return;
      const message = "Could not load your account. Try again.";
      update({ ...state, profile: null, loading: false, error: message });
      throw new Error(message, { cause: error });
    }
    if (!live || request !== revision) return;
    const message = profileError(result.data, result.error);
    // Use the latest session: its token may have refreshed during this query.
    update({
      ...state,
      profile: message ? null : result.data,
      loading: false,
      error: message,
    });
    if (message) throw new Error(message);
  }
  function acceptSession(session) {
    if (!live) return;
    if (!session?.user?.id) {
      invalidate();
      update({ ...emptyState });
      return;
    }
    if (state.session?.user.id === session.user.id) {
      // SIGNED_IN also means "session confirmed" on tab return. Neither it nor
      // TOKEN_REFRESHED is a new login. Preserve the profile and mounted routes.
      update({ ...state, session });
      return;
    }
    invalidate();
    const request = revision;
    update({ session, profile: null, loading: true, error: null });
    timer = setTimeout(() => {
      if (live && request === revision)
        loadProfile(session.user.id, request).catch(() => {});
    }, 0);
  }
  const initialEvents = events;
  const {
    data: { subscription },
  } = client.auth.onAuthStateChange((event, session) => {
    events++;
    acceptSession(event === "SIGNED_OUT" ? null : session);
  });
  client.auth
    .getSession()
    .then(({ data, error }) => {
      if (!live || events !== initialEvents) return;
      if (error)
        update({
          ...emptyState,
          error: "Could not restore your session. Please sign in again.",
        });
      else acceptSession(data.session);
    })
    .catch(() => {
      if (live && events === initialEvents)
        update({
          ...emptyState,
          error: "Could not restore your session. Please sign in again.",
        });
    });

  return {
    async refreshProfile() {
      if (!live || !state.session) throw new Error("Please sign in again.");
      invalidate();
      await loadProfile(state.session.user.id, revision);
    },
    dispose() {
      live = false;
      invalidate();
      subscription.unsubscribe();
    },
  };
}
