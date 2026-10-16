// Disposable PostgreSQL17/PostgREST/real Auth; never loads hosted credentials.
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import {
  nativeAppEnvironment,
  student,
} from "../../tests/helpers/native-app-environment.js";
import {
  catalogFixture,
  seedCatalogBook,
} from "../../tests/helpers/platform-catalog.js";
const cache = join(homedir(), ".cache/satchi-test-tools");
process.env.SATCHI_TEST_POSTGRES_BIN ||= join(cache, "pg17/opt/pgsql-17/bin");
process.env.SATCHI_TEST_POSTGREST ||= join(cache, "postgrest14/postgrest");
process.env.LD_LIBRARY_PATH =
  join(process.env.SATCHI_TEST_POSTGRES_BIN, "../lib") +
  (process.env.LD_LIBRARY_PATH ? ":" + process.env.LD_LIBRARY_PATH : "");
const app = await nativeAppEnvironment({
  realAuth: process.env.SATCHI_TEST_AUTH_BIN || join(cache, "auth2197/auth"),
});
let inbox;
try {
  await app.upgrade();
  const catalog = await catalogFixture();
  for (const book of catalog.books) await seedCatalogBook(app, book);
  let previews = [];
  try {
    previews = JSON.parse(
      await readFile(
        "local-imports/platform-book-previews/manifest.json",
        "utf8",
      ),
    ).results.filter((r) => r.status === "generated");
  } catch {
    /* title placeholders remain usable */
  }
  const quote = (v) => "'" + String(v).replaceAll("'", "''") + "'";
  for (const preview of previews) {
    await app.sql(
      `update books set cover_path=${quote(preview.storage_path)},cover_metadata=${quote(JSON.stringify(preview.metadata))}::jsonb where id=${quote(preview.id)};insert into storage.objects(bucket_id,name)values('book-covers',${quote(preview.storage_path)});`,
    );
    app.localAssetFiles.set(
      "book-covers/" + preview.storage_path,
      resolve(preview.path),
    );
  }
  const sid = await app.json(
    app.as(student, `select public.start_book_practice('${app.topic}')`),
  );
  const items = await app.json(
    `select jsonb_agg(to_jsonb(i)order by position)from(select id,position from book_practice_items where session_id='${sid}'order by position limit 10)i`,
  );
  for (let n = 0; n < items.length; n++) {
    const check = (choice) =>
      app.sql(
        app.as(
          student,
          `select public.save_practice_changes('${sid}',jsonb_build_array((select jsonb_build_object('id',id,'expected_revision',answer_revision,'selected_answer',${choice})from book_practice_items where id='${items[n].id}')));select public.check_book_practice_answer('${sid}','${items[n].id}',${choice},gen_random_uuid());`,
        ),
      );
    await check(n < 7 ? 1 : 0);
    if (n >= 7) await check(1);
  }
  // Local SMTP inbox renders links in the browser; email bodies/tokens are not logged.
  inbox = createServer((req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'",
    });
    const links = app.authEmails
      .map(
        (message) =>
          message
            .replace(/=\r?\n/g, "")
            .replace(/=([0-9a-f]{2})/gi, (_, hex) =>
              String.fromCharCode(parseInt(hex, 16)),
            )
            .replaceAll("&amp;", "&")
            .match(/href="(http[^"\s]+\/verify\?[^"\s]+)"/)?.[1],
      )
      .filter(Boolean);
    res.end(
      "<!doctype html><title>Disposable recovery inbox</title><h1>Disposable recovery inbox</h1><p>Local test mail only. Refresh after requesting a recovery email.</p>" +
        links
          .map(
            (link, n) =>
              `<p><a href="${link.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}">Open recovery email ${n + 1}</a></p>`,
          )
          .join(""),
    );
  });
  await new Promise((r) => inbox.listen(0, "127.0.0.1", r));
  console.log(
    JSON.stringify(
      {
        app: app.appUrl,
        inbox: `http://127.0.0.1:${inbox.address().port}`,
        catalog_books: catalog.books.length,
        previews: previews.length,
        credentials:
          "See docs/platform-improvements-report.md. Disposable accounts only.",
        persistence:
          "Reload and fresh login survive; restarting this command recreates disposable fixtures.",
      },
      null,
      2,
    ),
  );
} catch (error) {
  await app.close();
  throw error;
}
let closing = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    if (closing) return;
    closing = true;
    if (inbox) {
      inbox.closeAllConnections();
      await new Promise((r) => inbox.close(r));
    }
    await app.close();
    process.exit(0);
  });
