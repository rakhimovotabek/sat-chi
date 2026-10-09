// Real local PostgreSQL + PostgREST + Vite. Only Auth and Storage transport are
// fixture services; no application REST/RPC request is intercepted or canned.
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { createServer, request as httpRequest } from "node:http";
import { createServer as tcpServer } from "node:net";
import { createHmac, randomBytes } from "node:crypto";
import { mkdtemp, readFile, readdir, writeFile, rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
const exec = promisify(execFile);
export const admin = "f1000000-0000-0000-0000-000000000001",
  student = "f1000000-0000-0000-0000-000000000002",
  studentB = "f1000000-0000-0000-0000-000000000003",
  studentC = "f1000000-0000-0000-0000-000000000004";
const fixtureUsers = { admin, student, studentB, studentC };
const quote = (v) => "'" + String(v).replaceAll("'", "''") + "'";
async function port() {
  const server = tcpServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const value = server.address().port;
  await new Promise((r) => server.close(r));
  return value;
}
export async function nativeAppEnvironment() {
  const folder = await mkdtemp(join(tmpdir(), "satchi-native-app-"));
  const bin = process.env.SATCHI_TEST_POSTGRES_BIN;
  const dbPort = await port(),
    restPort = await port(),
    apiPort = await port(),
    vitePort = await port();
  const apiUrl = `http://127.0.0.1:${apiPort}`,
    appUrl = `http://127.0.0.1:${vitePort}`;
  const secret = randomBytes(48).toString("hex"),
    processes = [],
    streams = [];
  let running = false,
    gateway;
  const sql = async (text) =>
    (
      await exec(
        join(bin, "psql"),
        [
          "-X",
          "-h",
          "127.0.0.1",
          "-p",
          String(dbPort),
          "-d",
          "postgres",
          "-v",
          "ON_ERROR_STOP=1",
          "-At",
          "-c",
          text,
        ],
        { maxBuffer: 16 * 1024 * 1024 },
      )
    ).stdout.trim();
  const as = (uid, text) =>
    `set role authenticated;select set_config('request.jwt.claim.sub',${quote(uid)},false);${text}`;
  const json = async (text) => {
    const last = (await sql(text)).split("\n").at(-1);
    if (/^[a-f0-9-]{36}$/.test(last)) return last;
    return JSON.parse(last);
  };
  const token = (claims) => {
    const head = Buffer.from(
      JSON.stringify({ alg: "HS256", typ: "JWT" }),
    ).toString("base64url");
    const body = Buffer.from(
      JSON.stringify({
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
        ...claims,
      }),
    ).toString("base64url");
    const data = head + "." + body;
    return (
      data + "." + createHmac("sha256", secret).update(data).digest("base64url")
    );
  };
  const claims = (raw) => {
    const [h, b, s] = (raw || "").split(".");
    if (
      createHmac("sha256", secret)
        .update(h + "." + b)
        .digest("base64url") !== s
    )
      throw new Error("Unauthorized");
    const value = JSON.parse(Buffer.from(b, "base64url"));
    if (value.exp <= Date.now() / 1000) throw new Error("Expired token");
    return value;
  };
  const launch = (name, command, args, env = {}) => {
    const stream = createWriteStream(join(folder, name + ".log"));
    streams.push(stream);
    const child = spawn(command, args, {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.pipe(stream);
    child.stderr.pipe(stream);
    processes.push(child);
    return child;
  };
  const waitFor = async (url) => {
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(url)).ok) return;
      } catch {
        /* server starting */
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("Local test server did not start: " + url);
  };
  const close = async () => {
    for (const child of processes.reverse()) child.kill("SIGTERM");
    if (gateway) {
      gateway.closeAllConnections();
      await new Promise((r) => gateway.close(r));
    }
    if (running)
      await exec(join(bin, "pg_ctl"), [
        "-D",
        join(folder, "data"),
        "-m",
        "fast",
        "-w",
        "stop",
      ]);
    for (const stream of streams) stream.end();
    await rm(folder, { recursive: true, force: true });
  };
  try {
    await exec(join(bin, "initdb"), [
      "-D",
      join(folder, "data"),
      "--no-locale",
      "--encoding=UTF8",
      "--auth=trust",
    ]);
    await exec(join(bin, "pg_ctl"), [
      "-D",
      join(folder, "data"),
      "-l",
      join(folder, "postgres.log"),
      "-o",
      `-h 127.0.0.1 -p ${dbPort} -k ${folder}`,
      "-w",
      "start",
    ]);
    running = true;
    await sql(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
    create role authenticator login;grant anon,authenticated,service_role to authenticator;
    create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
    grant usage on schema auth to anon,authenticated,service_role;
    create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated,anon;grant select,insert,update,delete on storage.objects to authenticated,anon;`);
    const migrations = (await readdir("supabase/migrations")).sort();
    for (const file of migrations.filter((f) => f < "20261008000000"))
      await sql(await readFile(join("supabase/migrations", file), "utf8"));
    await sql(
      `insert into auth.users(id,email) values('${admin}','admin@fixture.invalid'),('${student}','student@fixture.invalid');update public.profiles set role='admin' where id='${admin}';update public.profiles set display_name=case when role='admin' then 'Disposable Admin' else 'Disposable Student' end,onboarding_completed=true,target_sat_score=1400,grade='11',main_goal='Improve Both';`,
    );
    const payload = {
      schemaVersion: 1,
      kind: "book",
      book: {
        title: "SATakror disposable fixture",
        category: "Math",
        published: true,
      },
      topics: [
        {
          title: "SATakror fixture topic",
          questions: Array.from({ length: 32 }, (_, i) => ({
            type: "mcq",
            question: `Fixture question ${i + 1}`,
            options: ["1", "2", "3", "4"],
            correctAnswer: 1,
            explanation: "Divide by two.",
            domain: "Algebra",
            difficulty: "easy",
          })),
        },
      ],
    };
    const book = (
      await json(
        as(
          admin,
          `select public.import_book_content(${quote(JSON.stringify(payload))}::jsonb);`,
        ),
      )
    ).book_id;
    const questions = await json(
      `select jsonb_agg(q order by q.position) from public.questions q join public.book_topics t on t.id=q.topic_id where t.book_id=${quote(book)};`,
    );
    const ids = questions.map((q) => q.id),
      topic = questions[0].topic_id;
    const path = "a".repeat(64) + "/" + "b".repeat(64) + ".png",
      otherPath = "a".repeat(64) + "/" + "c".repeat(64) + ".png";
    for (const [id, asset] of [
      [ids[0], path],
      [ids[1], otherPath],
    ])
      await sql(`update public.questions set image_url=${quote("https://fixture.invalid/storage/v1/object/authenticated/book-package-assets/" + asset)} where id=${quote(id)};
    insert into public.book_package_assets(path,book_id,question_id,kind,source_path,sha256)values(${quote(asset)},${quote(book)},${quote(id)},'question','fixture.png',${quote("b".repeat(64))});insert into storage.objects(bucket_id,name)values('book-package-assets',${quote(asset)});`);
    const homework = await json(
      as(
        admin,
        `select public.create_homework(${quote(JSON.stringify({ title: "SATakror frozen homework", dueAt: "2026-12-01T12:00:00Z", students: [student], sections: [{ title: "Fixture", count: 8, questionIds: ids.slice(0, 8) }] }))}::jsonb);`,
      ),
    );
    const assignment = await json(
      `select to_jsonb(a.id) from public.homework_assignments a where homework_id=${quote(homework)};`,
    );
    const session = await json(
      as(student, `select public.start_homework(${quote(assignment)});`),
    );
    await sql(
      `update public.book_practice_sessions set current_position=(select position from public.book_practice_items where session_id=${quote(session)} and question->>'id'=${quote(ids[0])}) where id=${quote(session)};`,
    );
    await sql(`insert into public.book_import_packages values(${quote(book)},'fixture-package','fixture-fingerprint','{}','{}','{}','{}');
    update public.questions set import_metadata='{"package_question_id":"fixture-unapproved"}' where id=${quote(ids[0])};delete from public.content_review_items where item_type='question' and entity_id=${quote(ids[0])};`);
    await sql(`insert into public.import_jobs(fingerprint,source_file,title,status,book_id)values('${"d".repeat(64)}','fixture.pdf','Fixture source','imported',${quote(book)});
    update public.questions set import_metadata='{"package_question_id":"fixture-approved"}' where id=${quote(ids[1])};
    update public.content_review_items set status='approved' where item_type='question' and entity_id=${quote(ids[1])};`);
    await sql(
      `delete from public.content_review_items where item_type='question' and entity_id=${quote(ids[0])};`,
    );
    // Synthetic package questions exercise the same image/open contracts as SATakror.
    await sql(`update public.questions set question_type='open',options='[]',import_metadata='{"package_question_id":"fixture-open"}' where id=${quote(ids[15])};
    update public.question_answers set correct_answer=null where question_id=${quote(ids[15])};
    insert into public.book_open_answers(question_id,accepted_answers)values(${quote(ids[15])},'["8.6"]');`);
    const optionPaths = ["8", "9", "a", "b"].map(
      (c) => "e".repeat(64) + "/" + c.repeat(64) + ".png",
    );
    for (const asset of optionPaths)
      await sql(
        `insert into public.book_package_assets(path,book_id,question_id,kind,source_path,sha256)values(${quote(asset)},${quote(book)},${quote(ids[14])},'option','fixture.png',${quote("e".repeat(64))});insert into storage.objects(bucket_id,name)values('book-package-assets',${quote(asset)});`,
      );
    await sql(`update public.questions set options='["","","",""]',option_image_urls=${quote(JSON.stringify(optionPaths.map((p) => "https://fixture.invalid/storage/v1/object/authenticated/book-package-assets/" + p)))}::jsonb,import_metadata='{"package_question_id":"fixture-images"}' where id=${quote(ids[14])};
    update public.content_review_items set status='approved' where item_type='question' and entity_id in(${quote(ids[14])},${quote(ids[15])});`);
    const daily = await json(
      as(
        admin,
        `select public.save_daily_homework(${quote(JSON.stringify({ title: "Daily fixture", timezone: "Asia/Tashkent", startDate: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tashkent" }), count: 7, selection: "fixed", questionIds: ids.slice(1, 8), filters: {}, students: [student], allowLate: true, allowRepeat: false }))}::jsonb);`,
      ),
    );
    const anon = token({ role: "anon" });
    const user = (uid) => ({
      id: uid,
      aud: "authenticated",
      role: "authenticated",
      email: `${Object.keys(fixtureUsers).find((key) => fixtureUsers[key] === uid)}@fixture.invalid`,
      app_metadata: { provider: "email" },
      user_metadata: {},
      created_at: new Date().toISOString(),
    });
    gateway = createServer(async (req, res) => {
      res.setHeader("Access-Control-Allow-Origin", appUrl);
      res.setHeader(
        "Access-Control-Allow-Headers",
        "authorization,apikey,content-type,x-client-info,x-supabase-api-version,x-satchi-client-version,prefer,range,range-unit,accept-profile,content-profile",
      );
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET,POST,PATCH,DELETE,OPTIONS",
      );
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }
      const send = (value, status = 200) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(value));
      };
      try {
        const url = new URL(req.url, apiUrl);
        if (url.pathname.startsWith("/rest/v1/")) {
          const proxy = httpRequest(
            {
              hostname: "127.0.0.1",
              port: restPort,
              path: req.url.slice("/rest/v1".length),
              method: req.method,
              headers: req.headers,
            },
            (reply) => {
              res.writeHead(reply.statusCode, reply.headers);
              reply.pipe(res);
            },
          );
          proxy.on("error", () =>
            send({ message: "Local PostgREST unavailable" }, 503),
          );
          req.pipe(proxy);
          return;
        }
        if (url.pathname === "/auth/v1/settings") {
          send({ external: { google: false }, disable_signup: true });
          return;
        }
        if (url.pathname === "/auth/v1/token") {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const body = JSON.parse(Buffer.concat(chunks));
          const refreshing =
            url.searchParams.get("grant_type") === "refresh_token";
          const uid = refreshing
            ? claims(body.refresh_token).sub
            : fixtureUsers[body.email?.split("@")[0]];
          if (
            !uid ||
            (!refreshing &&
              (body.email !== user(uid).email ||
                body.password !== "disposable-test-only"))
          ) {
            send({ msg: "Invalid local fixture credentials" }, 400);
            return;
          }
          send({
            access_token: token({
              sub: uid,
              role: "authenticated",
              aud: "authenticated",
            }),
            token_type: "bearer",
            expires_in: 3600,
            refresh_token: token({ sub: uid }),
            user: user(uid),
          });
          return;
        }
        if (url.pathname === "/auth/v1/logout") {
          send({});
          return;
        }
        if (url.pathname.startsWith("/storage/v1/object/local-fixture/")) {
          const signed = claims(url.searchParams.get("token"));
          if (
            url.pathname !==
            "/storage/v1/object/local-fixture/" + signed.path
          )
            throw new Error("Invalid signed path");
          res.writeHead(200, { "Content-Type": "image/png" });
          res.end(
            Buffer.from(
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6P2cAAAAASUVORK5CYII=",
              "base64",
            ),
          );
          return;
        }
        const auth = claims(
          req.headers.authorization?.replace(/^Bearer /i, ""),
        );
        if (url.pathname === "/auth/v1/user") {
          send(user(auth.sub));
          return;
        }
        if (url.pathname.startsWith("/storage/v1/object/sign/")) {
          const asset = url.pathname.slice(
            "/storage/v1/object/sign/book-package-assets/".length,
          );
          const allowed = await json(
            as(
              auth.sub,
              `select coalesce(jsonb_agg(o.name),'[]') from storage.objects o where bucket_id='book-package-assets' and name=${quote(asset)};`,
            ),
          );
          if (!allowed.length) {
            send({ message: "Object unavailable under Storage policy" }, 403);
            return;
          }
          send({
            signedURL:
              "/object/local-fixture/" +
              asset +
              "?token=" +
              token({ sub: auth.sub, path: asset }),
          });
          return;
        }
        send({ message: "Unsupported fixture endpoint" }, 404);
      } catch (e) {
        send({ message: e.message }, 401);
      }
    });
    await new Promise((r) => gateway.listen(apiPort, "127.0.0.1", r));
    const config = join(folder, "postgrest.conf");
    await writeFile(
      config,
      `db-uri = "postgresql://authenticator@127.0.0.1:${dbPort}/postgres"\ndb-schemas = "public"\ndb-anon-role = "anon"\ndb-max-rows = 1000\njwt-secret = "${secret}"\nserver-host = "127.0.0.1"\nserver-port = ${restPort}\n`,
      { mode: 0o600 },
    );
    launch("postgrest", process.env.SATCHI_TEST_POSTGREST, [config]);
    await waitFor(`http://127.0.0.1:${restPort}/`);
    launch(
      "vite",
      process.execPath,
      [
        "node_modules/vite/bin/vite.js",
        "--host",
        "127.0.0.1",
        "--port",
        String(vitePort),
        "--strictPort",
      ],
      { VITE_SUPABASE_URL: apiUrl, VITE_SUPABASE_ANON_KEY: anon },
    );
    await waitFor(appUrl);
    const upgrade = async () => {
      for (const file of migrations.filter((f) => f >= "20261008000000"))
        await sql(await readFile(join("supabase/migrations", file), "utf8"));
      await sql("notify pgrst,'reload schema'");
      const bearer = token({
        sub: student,
        role: "authenticated",
        aud: "authenticated",
      });
      for (let i = 0; i < 50; i++) {
        const response = await fetch(
          apiUrl + "/rest/v1/rpc/save_practice_changes",
          {
            method: "POST",
            headers: {
              apikey: anon,
              authorization: "Bearer " + bearer,
              "Content-Type": "application/json",
              "x-satchi-client-version": "20261008",
            },
            body: JSON.stringify({ p_session: session, p_changes: [] }),
          },
        );
        if (response.ok) return;
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error("Local PostgREST schema did not refresh");
    };
    return {
      appUrl,
      apiUrl,
      databasePort: dbPort,
      serviceToken: token({ role: "service_role" }),
      tokenFor: (uid, overrides = {}) =>
        token({
          sub: uid,
          role: "authenticated",
          aud: "authenticated",
          ...overrides,
        }),
      sql,
      json,
      as,
      upgrade,
      close,
      ids,
      book,
      topic,
      homework,
      session,
      assignment,
      daily,
      path,
    };
  } catch (e) {
    await close();
    throw e;
  }
}
