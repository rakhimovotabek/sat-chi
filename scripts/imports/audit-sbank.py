"""Read-only, streaming inventory for supplied SBank archives; never uploads content."""
import argparse, collections, hashlib, json, pathlib, struct, zipfile, zlib


def png_check(data):
    if data[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError('Invalid PNG signature')
    offset, ended, dimensions = 8, False, None
    decoder = zlib.decompressobj()
    decoded = 0
    while offset < len(data):
        size = struct.unpack('>I', data[offset:offset + 4])[0]
        kind = data[offset + 4:offset + 8]
        payload = data[offset + 8:offset + 8 + size]
        crc = data[offset + 8 + size:offset + 12 + size]
        if len(payload) != size or len(crc) != 4:
            raise ValueError('Truncated PNG chunk')
        if zlib.crc32(kind + payload) & 0xffffffff != struct.unpack('>I', crc)[0]:
            raise ValueError('PNG CRC mismatch')
        if kind == b'IHDR':
            dimensions = struct.unpack('>II', payload[:8])
            if not all(0 < v <= 30000 for v in dimensions):
                raise ValueError('Invalid PNG dimensions')
        if kind == b'IDAT':
            chunk = payload
            while chunk:
                decoded += len(decoder.decompress(chunk, 1048576))
                chunk = decoder.unconsumed_tail
                if decoded > 256 * 1048576:
                    raise ValueError('PNG decoded size exceeds audit bound')
        offset += size + 12
        if kind == b'IEND':
            ended = True
            break
    if not ended or not dimensions or not decoder.eof:
        raise ValueError('Incomplete PNG image stream')
    return dimensions


def audit(path):
    hashes, issues, png_errors = {}, [], []
    with zipfile.ZipFile(path) as archive:
        entries = archive.infolist()
        names = [i.filename for i in entries]
        unsafe = [n for n in names if n.startswith('/') or '..' in pathlib.PurePosixPath(n).parts or '\\' in n]
        duplicate_entries = [n for n, c in collections.Counter(names).items() if c > 1]
        manifest = json.loads(archive.read('manifest.json'))
        rows = [json.loads(line) for line in archive.read('questions.jsonl').splitlines() if line.strip()]
        provenance = [json.loads(line) for line in archive.read('asset-provenance.jsonl').splitlines() if line.strip()]
        prov = collections.defaultdict(list)
        for item in provenance:
            prov[item['asset']].append(item)
        for entry in entries:
            data = archive.read(entry)  # zipfile verifies the ZIP CRC for every entry.
            if entry.filename.startswith('assets/') and not entry.is_dir():
                hashes[entry.filename] = hashlib.sha256(data).hexdigest()
                try:
                    png_check(data)
                except Exception as error:
                    png_errors.append({'asset': entry.filename, 'error': str(error)})
        ids = collections.Counter(r.get('id') for r in rows)
        source_ids = collections.Counter(r.get('source_question_number') for r in rows)
        refs, mapping_issues, content_hashes = set(), [], collections.defaultdict(list)
        counts = collections.Counter()
        domain_skills = collections.defaultdict(collections.Counter)
        difficulties = collections.Counter()
        exceptions, missing = [], []
        for row in rows:
            rid = row.get('id')
            counts[row.get('type', 'missing_type')] += 1
            domain_skills[row.get('domain')][row.get('skill')] += 1
            difficulties[row.get('difficulty')] += 1
            blocks = [('stem', row.get('stem') or {}), ('explanation', row.get('explanation') or {})]
            blocks += [('option_' + str(o.get('key')), o) for o in row.get('options', [])]
            signature = []
            if (row.get('explanation') or {}).get('assets') or (row.get('explanation') or {}).get('text'):
                counts['with_explanation'] += 1
            if any(o.get('assets') or o.get('asset') for o in row.get('options', [])):
                counts['with_image_options'] += 1
            if row.get('passage'):
                counts['separate_passage'] += 1
            if not (row.get('stem') or {}).get('text'):
                counts['image_only_stem'] += 1
            if any(len(b.get('assets', [])) > 1 for _, b in blocks):
                counts['multi_segment_record'] += 1
            for role, block in blocks:
                assets = block.get('assets') or ([block['asset']] if block.get('asset') else [])
                signature.append((role, block.get('text'), [hashes.get(a) for a in assets]))
                for asset in assets:
                    refs.add(asset)
                    if asset not in hashes:
                        missing.append({'question': rid, 'asset': asset})
                    records = prov.get(asset, [])
                    if not any(p.get('question_id') == rid and p.get('role') == role for p in records):
                        mapping_issues.append({'question': rid, 'asset': asset, 'expected_role': role})
            answer = row.get('correct_answer')
            if row.get('type') == 'multiple_choice':
                if [o.get('key') for o in row.get('options', [])] != ['A', 'B', 'C', 'D'] or answer not in ['A', 'B', 'C', 'D']:
                    issues.append({'id': rid, 'issue': 'Unverified MCQ labels or answer mapping'})
            elif row.get('type') == 'student_produced':
                if not isinstance(answer, list) or not answer or not all(isinstance(a, str) and a.strip() for a in answer):
                    issues.append({'id': rid, 'issue': 'Missing numerical answer strings'})
            else:
                issues.append({'id': rid, 'issue': 'Unknown question type'})
            if row.get('exception') or row.get('review_status') != 'verified':
                exceptions.append({'id': rid, 'notes': row.get('review_notes'), 'source_pages': row.get('source_pages')})
            signature_hash = hashlib.sha256(json.dumps(signature, sort_keys=True).encode()).hexdigest()
            content_hashes[signature_hash].append(rid)
        duplicate_content = [v for v in content_hashes.values() if len(v) > 1]
        return {
            'file': path.name, 'sha256': hashlib.file_digest(path.open('rb'), 'sha256').hexdigest(),
            'compressed_bytes': path.stat().st_size, 'expanded_bytes': sum(e.file_size for e in entries),
            'zip_crc_all_entries_checked': True, 'entries': len(entries), 'unsafe_paths': unsafe,
            'duplicate_zip_entries': duplicate_entries, 'questions': len(rows), 'counts': dict(counts),
            'domains_and_skills': {k: dict(v) for k, v in domain_skills.items()}, 'difficulties': dict(difficulties),
            'duplicate_question_ids': {k: v for k, v in ids.items() if v > 1},
            'duplicate_source_ids': {k: v for k, v in source_ids.items() if v > 1},
            'duplicate_content_groups': duplicate_content,
            'asset_files': len(hashes), 'referenced_assets': len(refs), 'missing_assets': missing,
            'unreferenced_assets': sorted(set(hashes) - refs), 'png_errors': png_errors,
            'asset_role_mapping_issues': mapping_issues, 'record_issues': issues, 'review_exceptions': exceptions,
            'source_identifiers': sorted(source_ids), 'asset_provenance_rows': len(provenance),
            'manifest_rights': manifest.get('rights'), 'manifest_author': manifest.get('author'),
            'source_pdf_included': manifest.get('source_pdf_included'),
            'imported': 0, 'published': 0,
            'limits': ['Asset decoding/CRC and declared role checks do not independently verify visual crop boundaries or source answers.',
                       'Passages are embedded in stem images; separate text is absent.',
                       'Duplicate comparison covers these archives, not the existing production database.'],
        }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('packages', nargs='+', type=pathlib.Path)
    parser.add_argument('--output', required=True, type=pathlib.Path)
    args = parser.parse_args()
    reports = []
    for package in args.packages:
        reports.append(audit(package))
        print(json.dumps({k: v for k, v in reports[-1].items() if k in ['file', 'questions', 'counts', 'asset_files', 'png_errors', 'missing_assets', 'record_issues', 'asset_role_mapping_issues']}), flush=True)
    output = {'packages': reports, 'cross_package_source_id_overlap': sorted(set.intersection(*(set(r['source_identifiers']) for r in reports))) if len(reports) > 1 else []}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2) + '\n')
