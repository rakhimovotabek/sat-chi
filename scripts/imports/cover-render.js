import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
const run = promisify(execFile);
export async function renderFirstPage(source, directory) {
  await mkdir(directory, { recursive: true });
  const stem = resolve(directory, "page-1"),
    path = `${stem}.webp`;
  await run(
    "pdftoppm",
    [
      "-f",
      "1",
      "-l",
      "1",
      "-singlefile",
      "-scale-to",
      "900",
      "-png",
      source,
      stem,
    ],
    { timeout: 60000, maxBuffer: 1024 * 1024 },
  );
  // A nearly empty first page stays on the fallback. Measure dark pixel share,
  // not page text; scanned/illustrated covers work without OCR.
  const { stdout } = await run(
    "magick",
    [
      `${stem}.png`,
      "-colorspace",
      "Gray",
      "-threshold",
      "95%",
      "-format",
      "%[fx:1-mean]",
      "info:",
    ],
    { timeout: 20000 },
  );
  const ink = Number(stdout);
  if (!Number.isFinite(ink) || ink < 0.001)
    return { status: "blank_first_page", ink };
  await run(
    "magick",
    [`${stem}.png`, "-strip", "-resize", "480x720>", "-quality", "78", path],
    { timeout: 20000 },
  );
  const { stdout: dimensions } = await run("magick", [
    "identify",
    "-format",
    "%w %h",
    path,
  ]);
  const [width, height] = dimensions.trim().split(/\s+/).map(Number);
  const bytes = (await stat(path)).size;
  if (bytes > 262144 || !width || !height || width > 480 || height > 720)
    throw new Error("Cover exceeds thumbnail limits");
  return {
    status: "generated",
    path,
    width,
    height,
    bytes,
    ink,
    extraction_method: "poppler_first_page_webp",
    source_page: 1,
  };
}
