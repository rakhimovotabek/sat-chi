// Actual, digest-pinned official images run in rootless Bubblewrap namespaces.
// PostgreSQL/Auth/PostgREST remain the existing native disposable processes.
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { homedir, userInfo } from "node:os";
import { join, resolve } from "node:path";

export async function supabaseServices({
  folder,
  port,
  launch,
  sql,
  waitFor,
  apiUrl,
  secret,
  token,
}) {
  const root = join(homedir(), ".cache/satchi-test-tools/services");
  const writable = join(folder, "services");
  await mkdir(writable);
  const run = async (name, command, config, mounts = []) => {
    const image = join(root, name);
    await readFile(join(image, "verified-image.json"));
    const args = [
      "--die-with-parent",
      "--unshare-user",
      "--unshare-pid",
      "--unshare-uts",
      "--unshare-ipc",
      "--uid",
      "0",
      "--gid",
      "0",
      "--ro-bind",
      image,
      "/",
      "--dev",
      "/dev",
      "--proc",
      "/proc",
      "--tmpfs",
      "/tmp",
      "--ro-bind",
      "/etc/resolv.conf",
      "/etc/resolv.conf",
      "--bind",
      writable,
      "/work",
      "--clearenv",
      "--setenv",
      "PATH",
      "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      "--setenv",
      "HOME",
      "/tmp",
    ];
    for (const [key, value] of Object.entries(config))
      args.push("--setenv", key, String(value));
    for (const [source, target] of mounts)
      args.push("--ro-bind", source, target);
    args.push("--chdir", name === "edge" ? "/work" : "/app", "--", ...command);
    return launch("official-" + name, "bwrap", args);
  };
  const dbUser = userInfo().username;
  const storagePort = await port(),
    edgePort = await port(),
    realtimePort = await port();
  return {
    ports: { storage: storagePort, edge: edgePort, realtime: realtimePort },
    async storage(dbPort) {
      // Storage owns its real schema/migrations; no fixture storage tables.
      const child = await run("storage", ["node", "dist/start/server.js"], {
        NODE_ENV: "production",
        SERVER_HOST: "127.0.0.1",
        SERVER_PORT: storagePort,
        PORT: storagePort,
        ANON_KEY: token({ role: "anon" }),
        SERVICE_KEY: token({ role: "service_role" }),
        AUTH_JWT_SECRET: secret,
        DATABASE_URL: `postgresql://${dbUser}@127.0.0.1:${dbPort}/postgres`,
        DB_SUPER_USER: dbUser,
        DB_INSTALL_ROLES: "false",
        DATABASE_MAX_CONNECTIONS: "3",
        DB_MIGRATIONS_STRATEGY: "on_request",
        STORAGE_BACKEND: "file",
        FILE_STORAGE_BACKEND_PATH: "/work/storage",
        TENANT_ID: "satchi-disposable",
        REGION: "local",
        GLOBAL_S3_BUCKET: "satchi-disposable",
        FILE_SIZE_LIMIT: "33554432",
        ENABLE_IMAGE_TRANSFORMATION: "false",
        STORAGE_PUBLIC_URL: apiUrl,
      });
      await waitFor(`http://127.0.0.1:${storagePort}/status`);
      await sql(
        "grant usage on schema storage to anon,authenticated,service_role;grant all on all tables in schema storage to service_role;grant select,insert,update,delete on storage.objects to authenticated,anon;",
      );
      const response = await fetch(`http://127.0.0.1:${storagePort}/bucket`, {
        headers: { Authorization: "Bearer " + token({ role: "service_role" }) },
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(
          "Official Storage migration/startup failed: HTTP " +
            response.status +
            " " +
            JSON.stringify(body),
        );
      }
      if (child.exitCode !== null)
        throw new Error("Official Storage exited during startup");
    },
    async edge() {
      const main = join(writable, "main");
      await mkdir(main);
      await writeFile(
        join(main, "index.ts"),
        `Deno.serve(async (request) => {
        const worker = await EdgeRuntime.userWorkers.create({
          servicePath: "/functions/import-book", memoryLimitMb: 150,
          workerTimeoutMs: 150000,
          envVars: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].map((key) => [key, Deno.env.get(key)]),
        });
        return worker.fetch(request);
      });\n`,
      );
      await run(
        "edge",
        [
          "edge-runtime",
          "start",
          "--ip",
          "127.0.0.1",
          "--port",
          String(edgePort),
          "--main-service",
          "/work/main",
        ],
        {
          SUPABASE_URL: apiUrl,
          SUPABASE_SERVICE_ROLE_KEY: token({ role: "service_role" }),
          DENO_DIR: "/work/deno",
          NODE_EXTRA_CA_CERTS: "/etc/ssl/certs/ca-certificates.crt",
        },
        [[resolve("supabase/functions"), "/functions"]],
      );
      // Any HTTP status proves the actual Deno worker booted; GET is 405.
      for (let i = 0; i < 300; i++) {
        try {
          if ((await fetch(`http://127.0.0.1:${edgePort}/`)).status === 405)
            return;
        } catch {
          /* booting */
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error("Official Edge Runtime did not boot");
    },
    async realtime(dbPort) {
      await sql(
        "create role dashboard_user nologin;create role supabase_admin nologin;create schema if not exists _realtime;create schema if not exists realtime;grant usage on schema public to anon,authenticated,service_role;",
      );
      const releases = join(root, "realtime/app/releases");
      const version = (await readdir(releases)).find((name) =>
        /^\d/.test(name),
      );
      const runtime = await readFile(
        join(releases, version, "runtime.exs"),
        "utf8",
      );
      // Official release has no bind-address env. Override only the listener,
      // retaining the shipped application and database/CDC code unchanged.
      const runtimePath = join(writable, "realtime-runtime.exs");
      await writeFile(
        runtimePath,
        runtime +
          "\nconfig :realtime, RealtimeWeb.Endpoint, http: [ip: {127, 0, 0, 1}]\n",
      );
      const child = await run(
        "realtime",
        [
          "/bin/sh",
          "-c",
          "/app/bin/migrate && /app/bin/realtime eval 'Realtime.Release.seeds(Realtime.Repo)' && exec /app/bin/server",
        ],
        {
          MIX_ENV: "prod",
          LANG: "C.UTF-8",
          PORT: realtimePort,
          DB_HOST: "127.0.0.1",
          DB_PORT: dbPort,
          DB_USER: dbUser,
          DB_PASSWORD: "disposable",
          DB_NAME: "postgres",
          DB_AFTER_CONNECT_QUERY: "SET search_path TO _realtime",
          DB_ENC_KEY: "supabaserealtime",
          DB_POOL_SIZE: "2",
          DB_REPLICA_POOL_SIZE: "1",
          DB_SSL: "false",
          DB_IP_VERSION: "ipv4",
          API_JWT_SECRET: secret,
          METRICS_JWT_SECRET: secret,
          SECRET_KEY_BASE: secret,
          APP_NAME: "realtime",
          SELF_HOST_TENANT_NAME: "realtime-dev",
          SEED_SELF_HOST: "true",
          ERL_AFLAGS:
            "+S 2:2 +SDcpu 1 +SDio 1 -proto_dist inet_tcp -kernel inet_dist_use_interface '{127,0,0,1}'",
          ERL_EPMD_ADDRESS: "127.0.0.1",
          RELEASE_TMP: "/tmp",
          RUN_JANITOR: "false",
          GEN_RPC_TCP_SERVER_PORT: String(await port()),
          GEN_RPC_SOCKET_IP: "127.0.0.1",
          REALTIME_IP_VERSION: "ipv4",
        },
        [[runtimePath, `/app/releases/${version}/runtime.exs`]],
      );
      for (let i = 0; i < 600; i++) {
        if (child.exitCode !== null)
          throw new Error("Official Realtime exited during startup");
        try {
          const result = await fetch(
            `http://127.0.0.1:${realtimePort}/api/tenants/realtime-dev/health`,
            {
              headers: { Authorization: "Bearer " + token({ role: "anon" }) },
            },
          );
          if (result.ok) return;
        } catch {
          /* booting */
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error("Official Realtime health check failed");
    },
  };
}
