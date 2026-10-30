"""Metadata-only local Math inventory. Never extracts, opens or crops image/PDF assets.

No network, credentials or database clients. Rights evidence is a separate
source-slug mapping; filenames/public availability never imply permission.
"""
import argparse
import collections
import csv
import hashlib
import json
import pathlib
import zipfile

STATUSES = ('ALREADY_STRUCTURED_TEXT', 'ALREADY_STRUCTURED_LATEX',
            'ALREADY_STRUCTURED_IMAGES', 'IMAGE_CONTAINS_OPTIONS', 'MISSING_OPTIONS',
            'STUDENT_PRODUCED', 'MISSING_SOURCE_ASSET', 'AMBIGUOUS_LAYOUT',
            'RIGHTS_NOT_VERIFIED', 'OTHER_ERROR')


def stable_id(value):
    h = hashlib.sha256(value.encode()).hexdigest()
    return f'{h[:8]}-{h[8:12]}-5{h[13:16]}-a{h[17:20]}-{h[20:32]}'


def representation(q, members):
    options = q.get('options', [])
    if q.get('type') == 'open':
        return 'STUDENT_PRODUCED'
    if q.get('type') != 'mcq' or not isinstance(options, list):
        return 'OTHER_ERROR'
    images = [q.get('questionImage')] + [o.get('image') for o in options if isinstance(o, dict)]
    if any(image and image not in members for image in images):
        return 'MISSING_SOURCE_ASSET'
    if q.get('questionImageIncludesOptions'):
        return 'IMAGE_CONTAINS_OPTIONS'
    if len(options) != 4 or any(not isinstance(o, dict) or o.get('label') != 'ABCD'[i] for i, o in enumerate(options)):
        return 'OTHER_ERROR'
    if all(o.get('image') for o in options):
        return 'ALREADY_STRUCTURED_IMAGES'
    if all(str(o.get('text', '')).strip() for o in options):
        return 'ALREADY_STRUCTURED_LATEX' if any('\\' in o['text'] or '$' in o['text'] for o in options) else 'ALREADY_STRUCTURED_TEXT'
    return 'MISSING_OPTIONS'


def inspect_archive(path, rights):
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)):
            raise ValueError(f'{path.name}: duplicate ZIP members')
        books = [n for n in names if pathlib.PurePosixPath(n).name == 'book.json']
        if len(books) != 1:
            raise ValueError(f'{path.name}: requires one legacy book.json')
        info = archive.getinfo(books[0])
        if info.file_size > 32 * 1024 * 1024:
            raise ValueError(f'{path.name}: metadata exceeds 32 MiB')
        # The sole archive read: structured metadata. No assets or answer exports.
        book = json.loads(archive.read(info))
        prefix = books[0][:-len('book.json')]
        members = {n[len(prefix):] for n in names if n.startswith(prefix)}
        meta = book['book']
        slug = meta['slug']
        if meta.get('section', meta.get('category', 'Math')) != 'Math':
            return [], None
        evidence = rights.get(slug, {})
        authorized = evidence.get('authorized') is True and bool(evidence.get('evidence'))
        rows = []
        for chapter in book['chapters']:
            for topic in chapter['topics']:
                for q in topic['questions']:
                    source_id = q['id']
                    observed = representation(q, members)
                    status = observed if authorized else 'RIGHTS_NOT_VERIFIED'
                    reason = '' if authorized else 'Supply processing/publication rights evidence before conversion'
                    if authorized and observed in ('IMAGE_CONTAINS_OPTIONS', 'MISSING_OPTIONS'):
                        reason = 'Human-verified stem/choice boundaries required; no automatic crop approved'
                    rows.append(dict(canonical_id=stable_id(source_id), source_id=source_id,
                                     book_id=stable_id('book/' + slug), book_slug=slug, archive=path.name,
                                     source_page=q.get('page'), type=q.get('type'), chapter_id=chapter['id'], topic_id=topic['id'],
                                     representation=observed, status=status,
                                     image_count=int(bool(q.get('questionImage'))) + sum(bool(o.get('image')) for o in q.get('options', []) if isinstance(o, dict)),
                                     provenance=meta.get('sourceFile', ''),
                                     rights_evidence=evidence.get('evidence', ''),
                                     confidence='metadata-only', reason=reason,
                                     conversion_path='blocked' if not authorized else ('none' if observed.startswith('ALREADY_') or observed == 'STUDENT_PRODUCED' else 'human_review'),
                                     converted=False))
        return rows, dict(slug=slug, title=meta.get('title'), declared=meta.get('totalQuestions'), discovered=len(rows))


def audit(paths, rights):
    records, books, seen = [], [], {}
    for path in sorted(paths):
        rows, book = inspect_archive(path, rights)
        if book is None:
            continue
        duplicates = 0
        for row in rows:
            key = row['canonical_id']
            if key in seen:
                duplicates += 1
            seen.setdefault(key, []).append(row)
            records.append(row)
        book['duplicateCanonicalRecords'] = duplicates
        book['uniqueCandidateIds'] = len({r['canonical_id'] for r in rows})
        book['countReconciles'] = book['declared'] is None or book['declared'] == book['discovered']
        if not book['countReconciles']:
            raise ValueError(f"{book['slug']}: declared count does not reconcile")
        book['statuses'] = dict(collections.Counter(r['status'] for r in rows))
        book['representations'] = dict(collections.Counter(r['representation'] for r in rows))
        books.append(book)
    collisions = {key: rows for key, rows in seen.items() if len(rows) > 1}
    for row in records:
        row['identity_status'] = 'collision_requires_reconciliation' if row['canonical_id'] in collisions else 'candidate_not_database_verified'
    summary = dict(scope='Local structured ZIP metadata only; current database total unavailable',
                   discoveredRecords=len(records), uniqueCandidateIds=len(seen), identityCollisionGroups=len(collisions),
                   identityCollisionOccurrences=sum(len(rows) for rows in collisions.values()), books=books,
                   statuses={s: sum(r['status'] == s for r in records) for s in STATUSES},
                   representations=dict(collections.Counter(r['representation'] for r in records)),
                   performedTextConversions=0, performedImageConversions=0,
                   databaseReconciled=False, assetsRead=0)
    assert sum(summary['statuses'].values()) == len(records)
    return records, summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--packages', type=pathlib.Path, required=True)
    parser.add_argument('--output', type=pathlib.Path, default=pathlib.Path('local-imports/math-corpus'))
    parser.add_argument('--rights', type=pathlib.Path, help='JSON source-slug -> {authorized:true,evidence:"..."}')
    args = parser.parse_args()
    paths = list(args.packages.glob('*satchi-import.zip'))
    if not paths:
        parser.error('No structured package ZIPs found; no previous report overwritten')
    rows, summary = audit(paths, json.loads(args.rights.read_text()) if args.rights else {})
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
    with (args.output / 'inventory.csv').open('w', newline='') as output:
        writer = csv.DictWriter(output, fieldnames=list(rows[0]) if rows else ['canonical_id'])
        writer.writeheader()
        writer.writerows(rows)
    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    main()
