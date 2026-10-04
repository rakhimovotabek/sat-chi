# Private first-page book covers

The cover importer uses **only ~/Desktop/Books**, including its subdirectories. Source symlinks escaping that directory are rejected. Imported source fingerprints must match the original file before rendering.

Run:

- Preview: npm run import:covers
- Attach missing covers: npm run import:covers -- --apply
- One source: npm run import:covers -- --apply --source "Vocabook 4.0 by SATashkent.pdf"

The verified linked project must be ileffhbbaomfimwulvpw. Poppler's pdftoppm and ImageMagick's magick must be installed locally. The cached Supabase CLI is used offline. Preview renders local derivatives without obtaining privileged credentials or uploading. Applying retrieves a privileged project key only into process memory; keys are never logged, saved or shipped to the browser.

Each source is processed sequentially. The first physical PDF page is rendered at a bounded resolution, measured for blank content, stripped of metadata and optimized as WebP up to 480×720 and 256 KiB. Its aspect ratio is preserved. Failure retains the existing fallback and does not affect imported content. Portrait, landscape and shared first-page cover art are preserved as supplied.

The importer updates existing source-linked book IDs only. It never inserts books or uploads original PDFs. Existing covers and concurrent admin replacements are preserved. Rendered pages, resumable checks and detailed JSON reports remain ignored in local-imports. The committed metadata-only report is docs/book-cover-report.md.

Content import application attempts a source-scoped cover checkpoint after successful insertion. A cover failure is independent of the content import and can be retried with import:covers. Existing completed sources do not need re-importing.

## Access and administration

Storage bucket book-covers is private and permits WebP derivatives only. Students can read assets belonging to published books when their accounts are active. Admins manage covers; students cannot upload or edit paths/provenance. Catalog pages sign paths in one batch, with a five-minute lifetime. New access follows publication immediately; previously issued links can remain usable until expiry.

Books and vocabulary libraries use lazy images with preserved aspect ratio and a fallback on errors. Details and Content Review source inspection expose the same cover. Cover provenance records source job/file/hash, physical page 1, renderer, generation time, dimensions and bytes on the book.

Admin → Books → Edit book or Vocabulary → book → Edit vocabulary book supports an HTTPS replacement URL and “Remove current cover and use fallback.” Replacement URLs take priority over the derived cover. Removal clears the pointer/provenance; the source import job remains intact and old private objects are no longer readable by students through the publication policy. A later deliberate backfill can regenerate an absent derived cover.

No source, content approval or publication state is changed by cover backfill. Initial backfill attached 13 covers to existing records; idempotent reconciliation reported those same 13 as already covered.
