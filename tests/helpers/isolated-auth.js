// Real Supabase Auth + a loopback SMTP sink. Emails and tokens stay in memory.
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { userInfo } from "node:os";
import { admin, student } from "./native-app-environment.js";

export async function isolatedAuth({
  binary,
  dbPort,
  authPort,
  apiUrl,
  appUrl,
  token,
  secret,
  launch,
  sql,
  waitFor,
}) {
  const messages = [],
    sockets = new Set();
  const smtp = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.write("220 localhost ESMTP\r\n");
    let buffer = "",
      data = false,
      message = "";
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      let end;
      while ((end = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (data) {
          if (line === ".") {
            messages.push(message);
            message = "";
            data = false;
            socket.write("250 accepted\r\n");
          } else message += line + "\r\n";
          continue;
        }
        if (/^EHLO|^HELO/i.test(line))
          socket.write("250-localhost\r\n250 PIPELINING\r\n");
        else if (/^DATA/i.test(line)) {
          data = true;
          socket.write("354 send message\r\n");
        } else if (/^QUIT/i.test(line)) {
          socket.end("221 bye\r\n");
        } else socket.write("250 ok\r\n");
      }
    });
  });
  await new Promise((r) => smtp.listen(0, "127.0.0.1", r));
  const close = async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise((r) => smtp.close(r));
  };
  try {
    await sql(
      "do $$begin if not exists(select 1 from pg_roles where rolname='postgres')then create role postgres nologin;end if;end$$",
    );
    await sql("create database recovery_auth");
    await sql("create schema auth", "recovery_auth");
    const config = {
      DATABASE_URL: `postgresql://${encodeURIComponent(userInfo().username)}@127.0.0.1:${dbPort}/recovery_auth?search_path=auth`,
      GOTRUE_DB_DRIVER: "postgres",
      GOTRUE_DB_NAMESPACE: "auth",
      GOTRUE_DB_MIGRATIONS_PATH: join(dirname(binary), "migrations"),
      GOTRUE_API_HOST: "127.0.0.1",
      PORT: String(authPort),
      API_EXTERNAL_URL: apiUrl,
      GOTRUE_SITE_URL: appUrl,
      GOTRUE_URI_ALLOW_LIST: appUrl + "/reset-password",
      GOTRUE_JWT_SECRET: secret,
      GOTRUE_JWT_AUD: "authenticated",
      GOTRUE_JWT_DEFAULT_GROUP_NAME: "authenticated",
      GOTRUE_JWT_ADMIN_ROLES: "service_role",
      GOTRUE_EXTERNAL_EMAIL_ENABLED: "true",
      GOTRUE_DISABLE_SIGNUP: "true",
      GOTRUE_MAILER_AUTOCONFIRM: "true",
      GOTRUE_MAILER_URLPATHS_RECOVERY: "/auth/v1/verify",
      GOTRUE_SMTP_HOST: "127.0.0.1",
      GOTRUE_SMTP_PORT: String(smtp.address().port),
      GOTRUE_SMTP_ADMIN_EMAIL: "auth@fixture.invalid",
      GOTRUE_SMTP_SENDER_NAME: "SATchi disposable Auth",
      GOTRUE_SMTP_MAX_FREQUENCY: "1ns",
      GOTRUE_RATE_LIMIT_EMAIL_SENT: "1000",
      GOTRUE_LOG_LEVEL: "error",
      LOG_LEVEL: "error",
      GOTRUE_SMTP_LOGGING_ENABLED: "false",
    };
    await promisify(execFile)(binary, ["migrate"], {
      cwd: dirname(binary),
      env: { ...process.env, ...config },
    });
    launch("isolated-auth", binary, ["serve"], config, dirname(binary));
    await waitFor(`http://127.0.0.1:${authPort}/health`);
    for (const [id, name] of [
      [admin, "admin"],
      [student, "student"],
    ]) {
      const response = await fetch(`http://127.0.0.1:${authPort}/admin/users`, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token({ role: "service_role" }),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id,
          email: name + "@fixture.invalid",
          password: "disposable-test-only",
          email_confirm: true,
        }),
      });
      if (!response.ok)
        throw new Error(
          "Could not provision isolated Auth fixture: HTTP " + response.status,
        );
      const result = await response.json();
      if (result.id !== id)
        throw new Error("Isolated Auth fixture identity mismatch");
    }
    return { close, messages, port: authPort };
  } catch (error) {
    await close();
    throw error;
  }
}
