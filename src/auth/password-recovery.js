const exchanges = new Map();
const RECOVERY_KEY = "satchi.password-recovery";
export function passwordError(password, confirmation) {
  if (password.length < 10) return "Use at least 10 characters.";
  if (password.length > 200) return "Use no more than 200 characters.";
  if (password !== confirmation) return "The passwords do not match.";
  return null;
}
export function recoveryCallback(location) {
  const query = new URLSearchParams(location.search);
  const fragment = new URLSearchParams(location.hash.slice(1));
  return {
    code: query.get("code"),
    flowId: query.get("sb_flow_id"),
    invalid:
      query.has("error") ||
      fragment.has("error") ||
      fragment.has("access_token"),
  };
}
export async function restoreRecovery(
  client,
  callback,
  storage,
  now = Date.now(),
) {
  if (!client || callback.invalid) throw new Error("Invalid recovery link");
  if (callback.code) {
    const key = callback.code + ":" + (callback.flowId || "");
    if (!exchanges.has(key))
      exchanges.set(
        key,
        client.auth.exchangeCodeForSession(
          callback.code,
          callback.flowId ? { flowId: callback.flowId } : undefined,
        ),
      );
    const { data, error } = await exchanges.get(key);
    if (error || !data.session || data.redirectType !== "recovery")
      throw new Error("Invalid recovery session");
    storage.setItem(
      RECOVERY_KEY,
      JSON.stringify({
        user: data.session.user.id,
        expires: Math.min(data.session.expires_at * 1000, now + 15 * 60 * 1000),
      }),
    );
  }
  let marker;
  try {
    marker = JSON.parse(storage.getItem(RECOVERY_KEY));
  } catch {
    /* fail closed below */
  }
  if (!marker?.user || !(marker.expires > now))
    throw new Error("Recovery session expired");
  const { data, error } = await client.auth.getUser();
  if (error || data.user?.id !== marker.user)
    throw new Error("Recovery session unavailable");
  return marker.user;
}
export function clearRecovery(storage) {
  storage.removeItem(RECOVERY_KEY);
  exchanges.clear();
}
