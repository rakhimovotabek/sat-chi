import {
  validatePackage,
  inspectPackage,
  sha256,
  LIMITS,
} from "../_shared/universal-package.js";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization,apikey,content-type,x-client-info",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};
export function createImportHandler({ createClient, env }) {
  return async (request) => {
    if (request.method === "OPTIONS")
      return new Response(null, { headers: cors });
    const reply = (data, status = 200) =>
      Response.json(data, { status, headers: cors });
    try {
      if (request.method !== "POST")
        return reply({ error: "POST required" }, 405);
      const url = env("SUPABASE_URL");
      const admin = createClient(url, env("SUPABASE_SERVICE_ROLE_KEY"));
      const token = request.headers
        .get("Authorization")
        ?.match(/^Bearer (.+)$/)?.[1];
      if (!token) return reply({ error: "Sign in required" }, 401);
      const { data: auth, error: authError } = await admin.auth.getUser(token);
      if (authError || !auth.user)
        return reply({ error: "Sign in required" }, 401);
      const { data: profile } = await admin
        .from("profiles")
        .select("role,active")
        .eq("id", auth.user.id)
        .single();
      if (profile?.role !== "admin" || profile.active !== true)
        return reply({ error: "Active admin required" }, 403);
      const checked = async (result) => {
        const { data, error } = await result;
        if (error) throw new Error(error.message);
        return data;
      };
      let job;
      if (request.headers.get("Content-Type")?.startsWith("application/zip")) {
        // Read incrementally; Content-Length is not trusted.
        const reader = request.body.getReader(),
          chunks = [];
        let size = 0;
        for (;;) {
          const next = await reader.read();
          if (next.done) break;
          size += next.value.length;
          if (size > LIMITS.zip) {
            await reader.cancel();
            throw new Error("ZIP exceeds 32 MB");
          }
          chunks.push(next.value);
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.length;
        }
        const pkg = await inspectPackage(bytes);
        const id = await checked(
          admin.rpc("universal_begin", {
            p_fingerprint: pkg.fingerprint,
            p_manifest: pkg.manifest,
            p_actor: auth.user.id,
          }),
        );
        job = await checked(
          admin.from("universal_book_jobs").select("*").eq("id", id).single(),
        );
        await checked(
          admin.storage
            .from("universal-book-staging")
            .upload(`${job.id}.zip`, bytes, {
              upsert: true,
              contentType: "application/zip",
            }),
        );
        return reply(job);
      }
      const { jobId, correction } = await request.json();
      job = await checked(
        admin.from("universal_book_jobs").select("*").eq("id", jobId).single(),
      );
      if (job.created_by !== auth.user.id)
        return reply(
          { error: "Import job belongs to another administrator" },
          403,
        );
      if (correction) {
        validatePackage({ ...job.manifest, questionCount: 1 }, [correction]);
        const assets = await checked(
          admin
            .from("book_package_assets")
            .select("path,source_path")
            .eq("book_id", job.book_id),
        );
        const assetUrl = (path) => {
          if (!path) return null;
          const found = assets.find((a) => a.source_path === path);
          if (!found) throw new Error(`Missing uploaded asset: ${path}`);
          return `https://satchi.invalid/storage/v1/object/authenticated/book-package-assets/${found.path}`;
        };
        const fixed = {
          ...correction,
          imageUrl: assetUrl(correction.image),
          options: correction.options?.map((o) => ({
            ...o,
            imageUrl: assetUrl(o.image),
          })),
        };
        // Existing explanation image Markdown is preserved. New image references must already belong to this package.
        if (
          correction.explanationImage &&
          !fixed.explanation?.includes("/storage/v1/object/authenticated/")
        )
          fixed.explanation =
            (fixed.explanation || "") +
            `\n![Explanation](${assetUrl(correction.explanationImage)})`;
        await checked(
          admin.rpc("universal_correct", {
            p_job: job.id,
            p_record: fixed,
            p_actor: auth.user.id,
          }),
        );
        return reply({ saved: true });
      }
      if (job.status !== "importing") return reply(job);
      const blob = await checked(
        admin.storage.from("universal-book-staging").download(`${job.id}.zip`),
      );
      const pkg = await inspectPackage(await blob.arrayBuffer());
      if (pkg.fingerprint !== job.fingerprint)
        throw new Error("Staged package hash mismatch");
      const assets = [...pkg.files].filter(([path]) =>
        path.startsWith("assets/"),
      );
      const paths = new Map();
      for (const [path, bytes] of assets)
        paths.set(
          path,
          `${job.fingerprint}/${await sha256(bytes)}.${path.split(".").pop()}`,
        );
      for (const [path, bytes] of assets.slice(
        job.asset_cursor,
        job.asset_cursor + 20,
      )) {
        const storagePath = paths.get(path);
        const mime = path.endsWith(".png")
          ? "image/png"
          : path.endsWith(".webp")
            ? "image/webp"
            : "image/jpeg";
        await checked(
          admin.storage
            .from("book-package-assets")
            .upload(storagePath, bytes, { upsert: true, contentType: mime }),
        );
        const verify = await checked(
          admin.storage.from("book-package-assets").download(storagePath),
        );
        if (
          (await sha256(await verify.arrayBuffer())) !== (await sha256(bytes))
        )
          throw new Error(`Asset verification failed: ${path}`);
        await checked(
          admin.from("book_package_assets").upsert({
            path: storagePath,
            book_id: job.book_id,
            question_id: null,
            kind: "archive",
            source_path: path,
            sha256: await sha256(bytes),
          }),
        );
      }
      job.asset_cursor = Math.min(assets.length, job.asset_cursor + 20);
      await checked(
        admin
          .from("universal_book_jobs")
          .update({ asset_cursor: job.asset_cursor })
          .eq("id", job.id),
      );
      const assetUrl = (path) =>
        path
          ? `https://satchi.invalid/storage/v1/object/authenticated/book-package-assets/${paths.get(path)}`
          : null;
      if (job.asset_cursor === assets.length) {
        const batch = pkg.questions
          .slice(job.question_cursor, job.question_cursor + 25)
          .map((q) => ({
            ...q,
            imageUrl: assetUrl(q.image),
            options: q.options?.map((o) => ({
              ...o,
              imageUrl: assetUrl(o.image),
            })),
            explanation:
              (q.explanation || "") +
              (q.explanationImage
                ? `\n![Explanation](${assetUrl(q.explanationImage)})`
                : ""),
          }));
        job.question_cursor = await checked(
          admin.rpc("universal_append", {
            p_job: job.id,
            p_expected: job.question_cursor,
            p_questions: batch,
          }),
        );
        if (job.question_cursor === pkg.questions.length) {
          if (pkg.manifest.book.cover)
            await checked(
              admin
                .from("books")
                .update({ cover_url: assetUrl(pkg.manifest.book.cover) })
                .eq("id", job.book_id),
            );
          await checked(
            admin
              .from("universal_book_jobs")
              .update({ status: "draft" })
              .eq("id", job.id),
          );
          job.status = "draft";
        }
      }
      return reply(job);
    } catch (error) {
      return reply(
        {
          error:
            error instanceof Error
              ? error.message
              : "Import failed; retry the same package.",
        },
        400,
      );
    }
  };
}
