import { readFile, stat } from "node:fs/promises";
import {
  inspectPackage,
  LIMITS,
} from "../../supabase/functions/_shared/universal-package.js";
const file = process.argv[2];
try {
  if (!file || process.argv.length !== 3)
    throw new Error("Usage: npm run book:validate -- /path/to/book.zip");
  if ((await stat(file)).size > LIMITS.zip)
    throw new Error("ZIP exceeds 32 MiB");
  const pkg = await inspectPackage(await readFile(file));
  const review = {};
  for (const q of pkg.questions)
    review[q.reviewStatus] = (review[q.reviewStatus] || 0) + 1;
  console.log(
    JSON.stringify(
      {
        valid: true,
        format: pkg.manifest.format,
        bookId: pkg.manifest.book.id,
        fingerprint: pkg.fingerprint,
        questions: pkg.summary.questions,
        topics: pkg.summary.topics,
        referencedAssets: pkg.summary.assets.length,
        digestInventory: pkg.manifest.assetDigests
          ? "verified"
          : "not provided (legacy v1)",
        review,
        missingExplanations: pkg.questions
          .filter((q) => !q.explanation?.trim() && !q.explanationImage)
          .map((q) => q.id),
        publicationReady: review.approved === pkg.questions.length,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(JSON.stringify({ valid: false, error: error.message }));
  process.exitCode = 1;
}
