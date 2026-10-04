import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { resolveCovers } from "../src/features/books/cover-assets.js";
import { renderFirstPage } from "../scripts/imports/cover-render.js";
function syntheticPdf(text = "") {
  const stream = text ? `BT /F1 18 Tf 20 260 Td (${text}) Tj ET` : "";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(out);
  out += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => String(n).padStart(10, "0") + " 00000 n ")
    .join(
      "\n",
    )}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return out;
}
test("first-page cover rendering preserves aspect ratio, rejects blank/malformed pages and stays small", async () => {
  const directory = await mkdtemp(join(tmpdir(), "satchi-cover-test-"));
  const pdf = join(directory, "synthetic.pdf"),
    blank = join(directory, "blank.pdf"),
    malformed = join(directory, "bad.pdf");
  await writeFile(pdf, syntheticPdf("Synthetic Cover"));
  await writeFile(blank, syntheticPdf());
  await writeFile(malformed, "not a PDF");
  const result = await renderFirstPage(pdf, join(directory, "cover"));
  assert.equal(result.status, "generated");
  assert.equal(result.source_page, 1);
  assert.ok(result.bytes < 262144);
  assert.ok(Math.abs(result.width / result.height - 2 / 3) < 0.01);
  assert.equal(
    (await renderFirstPage(blank, join(directory, "blank"))).status,
    "blank_first_page",
  );
  await assert.rejects(renderFirstPage(malformed, join(directory, "bad")));
});
test("catalog cover signing is batched, preserves records, respects replacement and falls back on storage failures", async () => {
  const rows = [
      { id: "1", cover_path: "same" },
      { id: "2", cover_path: "same" },
      {
        id: "3",
        cover_path: "other",
        cover_url: "https://example.test/custom.webp",
      },
    ],
    calls = [];
  const client = {
    storage: {
      from(bucket) {
        assert.equal(bucket, "book-covers");
        return {
          async createSignedUrls(paths, seconds) {
            calls.push(paths);
            assert.equal(seconds, 300);
            return {
              data: [
                { path: "same", signedUrl: "https://example.test/signed.webp" },
              ],
            };
          },
        };
      },
    },
  };
  const result = await resolveCovers(rows, client);
  assert.deepEqual(calls, [["same"]]);
  assert.equal(result.length, 3);
  assert.equal(result[0].cover_image_url, "https://example.test/signed.webp");
  assert.equal(result[2].cover_image_url, rows[2].cover_url);
  const failure = {
    storage: {
      from() {
        return {
          async createSignedUrls() {
            throw new Error("offline");
          },
        };
      },
    },
  };
  assert.deepEqual(await resolveCovers(rows, failure), rows);
});
test("cover Storage RLS follows publication, rejects student writes and vocabulary catalog uses real paged counts", async () => {
  const db = new PGlite(),
    admin = "a2000000-0000-0000-0000-000000000001",
    student = "a2000000-0000-0000-0000-000000000002";
  const role = (id) =>
    db.exec(
      `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false)`,
    );
  try {
    await db.exec(
      "create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated,service_role;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated,anon;grant select,insert,update,delete on storage.objects to authenticated,anon;",
    );
    for (const f of (await readdir("supabase/migrations")).sort())
      await db.exec(await readFile(`supabase/migrations/${f}`, "utf8"));
    await db.exec(
      `insert into auth.users(id)values('${admin}'),('${student}');update public.profiles set role='admin' where id='${admin}'`,
    );
    const config = (
      await db.query("select * from storage.buckets where id='book-covers'")
    ).rows[0];
    assert.equal(config.public, false);
    assert.deepEqual(config.allowed_mime_types, ["image/webp"]);
    await role(admin);
    const book = (
        await db.query(
          "insert into public.books(title)values('Synthetic covered book') returning id",
        )
      ).rows[0].id,
      path = `books/${book}/${"a".repeat(64)}.webp`;
    await db.query("update public.books set cover_path=$1 where id=$2", [
      path,
      book,
    ]);
    await db.query(
      "insert into storage.objects(bucket_id,name)values('book-covers',$1)",
      [path],
    );
    const vb = (
      await db.query(
        "insert into public.vocabulary_books(title)values('Vocabulary') returning id",
      )
    ).rows[0].id;
    const vs = (
      await db.query(
        "insert into public.vocabulary_sets(book_id,title)values($1,'Set 1') returning id",
        [vb],
      )
    ).rows[0].id;
    await db.query(
      "insert into public.vocabulary_words(set_id,word,definition)values($1,'abate','become less intense')",
      [vs],
    );
    const vocabPath = "vocabulary/" + vb + "/" + "b".repeat(64) + ".webp";
    await db.query(
      "update public.vocabulary_books set cover_path=$1 where id=$2",
      [vocabPath, vb],
    );
    await db.query(
      "insert into storage.objects(bucket_id,name)values('book-covers',$1)",
      [vocabPath],
    );
    await role(student);
    assert.equal(
      (await db.query("select * from storage.objects")).rows.length,
      0,
    );
    await assert.rejects(
      db.query(
        "insert into storage.objects(bucket_id,name)values('book-covers','forbidden.webp')",
      ),
    );
    assert.deepEqual(
      (await db.query("select public.vocabulary_catalog() v")).rows[0].v,
      [],
    );
    await role(admin);
    await db.query("update public.books set published=true where id=$1", [
      book,
    ]);
    await db.query("select public.set_vocabulary_publication($1,'published')", [
      vb,
    ]);
    await role(student);
    assert.equal(
      (await db.query("select * from storage.objects")).rows.length,
      2,
    );
    const catalog = (await db.query("select public.vocabulary_catalog() v"))
      .rows[0].v;
    assert.equal(catalog[0].word_count, 1);
    assert.equal(catalog[0].set_count, 1);
    assert.equal(catalog[0].mastered_count, 0);
    await role(admin);
    await db.query("update public.books set published=false where id=$1", [
      book,
    ]);
    await db.query("select public.set_vocabulary_publication($1,'draft')", [
      vb,
    ]);
    await role(student);
    assert.equal(
      (await db.query("select * from storage.objects")).rows.length,
      0,
    );
    await db.exec("reset role;set role anon;");
    assert.equal(
      (await db.query("select * from storage.objects")).rows.length,
      0,
    );
    await assert.rejects(
      db.query("select public.can_read_book_cover($1)", [path]),
    );
  } finally {
    await db.close();
  }
});
