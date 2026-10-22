// Only verified production aliases. Query parameters never choose a destination.
export const PRODUCTION_ORIGINS = Object.freeze([
  "https://sat-chi.netlify.app",
  "https://satchi.vercel.app",
  "https://sat-chi-rahimov-production.vercel.app",
]);

const CALLBACKS = Object.freeze({
  google: "/auth/callback",
  recovery: "/reset-password",
  confirmation: "/login",
});

export function trustedAuthRedirect(
  flow,
  origin,
  { development = false } = {},
) {
  if (!Object.hasOwn(CALLBACKS, flow)) throw new Error("Unsupported auth flow");
  const url = new URL(origin);
  const local =
    development &&
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1"].includes(url.hostname);
  if (
    url.origin !== origin ||
    url.username ||
    url.password ||
    (!PRODUCTION_ORIGINS.includes(origin) && !local)
  )
    throw new Error("Sign-in is unavailable on this website origin");
  return new URL(CALLBACKS[flow], origin).href;
}

export function currentAuthRedirect(flow) {
  return trustedAuthRedirect(flow, window.location.origin, {
    development: import.meta.env.DEV,
  });
}
