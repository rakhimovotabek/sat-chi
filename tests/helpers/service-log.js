import { Transform } from "node:stream";

// Services can log signed download URLs. Redact before writing even temporary
// logs; line buffering also covers secrets split across stdout/stderr chunks.
export function redactedServiceLog(secret) {
  let pending = "";
  const redact = (value) =>
    value
      .replaceAll(secret, "[redacted]")
      .replaceAll("disposable-test-only", "[redacted]")
      .replace(
        /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
        "[redacted JWT]",
      );
  return new Transform({
    transform(chunk, encoding, callback) {
      pending += chunk.toString();
      const end = pending.lastIndexOf("\n");
      if (end >= 0) {
        this.push(redact(pending.slice(0, end + 1)));
        pending = pending.slice(end + 1);
      }
      callback();
    },
    flush(callback) {
      if (pending) this.push(redact(pending));
      callback();
    },
  });
}
