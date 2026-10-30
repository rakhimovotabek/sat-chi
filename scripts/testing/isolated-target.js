// Deliberately never reads dotenv or .env.local. Invoke before creating clients.
export function assertIsolatedTarget(raw, { embedded = false } = {}) {
  if (embedded && raw === "pglite://memory") {
    console.log(
      "[test isolation] pglite://memory — disposable in-process PostgreSQL",
    );
    return raw;
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Explicit disposable local test URL required");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    !url.port
  ) {
    throw new Error(
      "Write tests require an explicit loopback endpoint with port; hosted targets and credentials are forbidden",
    );
  }
  console.log(`[test isolation] ${url.protocol}//${url.host} — loopback only`);
  return url.origin;
}
