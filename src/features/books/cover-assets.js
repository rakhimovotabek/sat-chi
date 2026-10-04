export const COVER_BUCKET = "book-covers";
export const COVER_LIFETIME_SECONDS = 300;
// One signing request per catalog page. Failure affects images, never content.
export async function resolveCovers(rows, client) {
  const paths = [
    ...new Set(
      rows.filter((r) => !r.cover_url && r.cover_path).map((r) => r.cover_path),
    ),
  ];
  if (!paths.length) return rows;
  try {
    const { data, error } = await client.storage
      .from(COVER_BUCKET)
      .createSignedUrls(paths, COVER_LIFETIME_SECONDS);
    if (error) return rows;
    const urls = new Map(
      (data || []).filter((r) => !r.error).map((r) => [r.path, r.signedUrl]),
    );
    return rows.map((r) => ({
      ...r,
      cover_image_url: r.cover_url || urls.get(r.cover_path) || null,
    }));
  } catch {
    return rows;
  }
}
