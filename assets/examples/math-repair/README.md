# Original Math repair examples

These two images and question/answer mappings were authored for SAT’chi and are
CC0-1.0. Both ask “What is 2 + 2?” and map B to 4. One has vertical options; the
other has two columns. No third-party source content is included.

```bash
python3 scripts/imports/crop-authorized-math.py assets/examples/math-repair/two-column.json --source-root assets/examples/math-repair
python3 scripts/imports/crop-authorized-math.py assets/examples/math-repair/two-column.json --source-root assets/examples/math-repair --write
python3 tests/authorized-math-crops.py
```

Requires ImageMagick 7 (`magick`) and Python 3.12+. Default is validation only.
`--write` saves five lossless PNGs plus `conversion.json` in the ignored local
output. It never changes a database, uploads assets, changes a key or replaces
an original. Repeating an identical plan verifies/reuses the derivatives; changes
require a separate isolated output root. Labels are included in these option
images, so the manifest retains `option_labels_in_images: true`.

For your own authorized content, provide canonical question/book IDs, exact source
SHA-256 and locator, verified A-D mapping, clean stem/option rectangles, reviewer
and processing-rights evidence. Unknown rights/review fail before opening assets.
Bounds, overlapping crops and modified originals/outputs are rejected. Explicit
coordinate review is required; the tool never guesses a crop or approves content.
Admin crop editing, asset upload and audited application to existing records are
separate unfinished steps. Do not feed this manifest to the book importer as a
new book: that would not preserve the existing canonical database identity.
