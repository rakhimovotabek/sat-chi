const schemaCodes = new Set([
  "PGRST200",
  "PGRST201",
  "PGRST202",
  "PGRST203",
  "PGRST204",
  "PGRST205",
  "42883",
  "42703",
  "42P01",
]);

export function backendError(error, context = "Learning data") {
  const code = error.code || "";
  const kind = schemaCodes.has(code)
    ? "schema"
    : code === "57014"
      ? "timeout"
      : code === "42501" || /^PGRST30[123]$/.test(code)
        ? "permission"
        : /^PGRST00[0-3]$/.test(code) || /^08/.test(code)
          ? "availability"
          : !code &&
              /fetch|network|offline|connection|load failed/i.test(
                error.message || "",
              )
            ? "network"
            : "request";
  const message =
    kind === "schema"
      ? `${context} requires a database update (${code}). The app and server schema do not match. Ask an administrator to check pending migrations and the API schema cache.`
      : kind === "timeout"
        ? `${context} exceeded the server query limit (${code}). Try a smaller date range or report this query to an administrator.`
        : kind === "network"
          ? `Could not reach the server for ${context.toLowerCase()}. Check your connection and retry.`
          : kind === "availability"
            ? `The database is temporarily unavailable for ${context.toLowerCase()} (${code}). Retry when the service is available.`
            : error.message ||
              `Could not load ${context.toLowerCase()}. Try again.`;
  return Object.assign(new Error(message), { code, kind, context });
}

export const isConnectionError = (error) =>
  ["network", "availability"].includes(error.kind);
