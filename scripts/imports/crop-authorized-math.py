"""Apply explicitly reviewed Math crop plans to authorized local raster sources.
No network, PDF extraction, OCR, guessed boundaries, database writes or deletion.
"""
import argparse
import hashlib
import json
import pathlib
import re
import shutil
import subprocess
import tempfile


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def rectangle(value):
    if not isinstance(value, list) or len(value) != 4 or any(type(n) is not int for n in value):
        raise ValueError('Crop rectangles require integer [x,y,width,height]')
    if min(value[:2]) < 0 or min(value[2:]) <= 0:
        raise ValueError('Crop coordinates must be nonnegative with positive dimensions')
    return value


def overlaps(a, b):
    return a[0] < b[0]+b[2] and b[0] < a[0]+a[2] and a[1] < b[1]+b[3] and b[1] < a[1]+a[3]


def convert(plan, root, output, write=False):
    # Fail before opening source assets unless both rights and human review exist.
    rights = plan.get('rights', {})
    review = plan.get('review', {})
    if rights.get('authorized') is not True or not isinstance(rights.get('evidence'), str) or not rights['evidence'].strip():
        raise ValueError('Verified processing rights evidence required; source not read')
    if review.get('status') != 'approved' or not review.get('reviewer') or review.get('mapping_verified') is not True or review.get('clean_stem_verified') is not True:
        raise ValueError('Approve A-D mapping and clean stem boundaries before cropping; source not read')
    for key in ['question_id', 'book_id']:
        if not isinstance(plan.get(key), str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,100}', plan[key]):
            raise ValueError('Stable canonical question_id and book_id required')
    if plan.get('correct_choice') not in list('ABCD'):
        raise ValueError('Verified canonical answer mapping required')
    if not isinstance(plan.get('source_reference'), str) or not plan['source_reference'].strip():
        raise ValueError('Source locator/reference required')
    options = plan.get('options', {})
    if not isinstance(options, dict) or set(options) != set('ABCD'):
        raise ValueError('Exactly four individually mapped options A-D required')
    regions = {'stem': rectangle(plan.get('stem')), **{key: rectangle(options[key]) for key in 'ABCD'}}
    for i, key in enumerate(regions):
        for other in list(regions)[i+1:]:
            if overlaps(regions[key], regions[other]):
                raise ValueError(f'Overlapping {key}/{other} crops require human review')
    relative = pathlib.PurePosixPath(plan['source']['path'])
    if relative.is_absolute() or '..' in relative.parts or '\\' in str(relative):
        raise ValueError('Source path must remain inside the authorized root')
    source = (root / str(relative)).resolve(strict=True)
    source.relative_to(root.resolve())  # Also rejects escaping symlinks.
    if source.stat().st_size > 8*1024*1024:
        raise ValueError('Source exceeds 8 MiB')
    checksum = digest(source)
    if checksum != plan['source'].get('sha256'):
        raise ValueError('Source SHA-256 changed; review plan again')
    with source.open('rb') as stream:
        header = stream.read(12)
    if header.startswith(b'\x89PNG\r\n\x1a\n'):
        coder = 'PNG'
    elif header.startswith(b'\xff\xd8\xff'):
        coder = 'JPEG'
    elif header[:4] == b'RIFF' and header[8:12] == b'WEBP':
        coder = 'WEBP'
    else:
        raise ValueError('Source must be a PNG, JPEG or WebP raster')
    limits = ['-limit', 'memory', '64MiB', '-limit', 'map', '128MiB', '-limit', 'disk', '256MiB', '-limit', 'thread', '1']
    encoded = f'{coder}:{source}'
    probe = subprocess.run(['magick', 'identify', *limits, '-ping', '-format', '%w %h', encoded], check=True, capture_output=True, text=True, timeout=20)
    width, height = map(int, probe.stdout.split())
    if width*height > 8_000_000 or max(width, height) > 12000:
        raise ValueError('Source dimensions exceed safe raster limits')
    for key, (x, y, w, h) in regions.items():
        if x+w > width or y+h > height:
            raise ValueError(f'{key} crop exceeds source bounds')
    fingerprint = hashlib.sha256(json.dumps(plan, sort_keys=True).encode()).hexdigest()
    result = dict(question_id=plan['question_id'], book_id=plan['book_id'], source_reference=plan['source_reference'], source_sha256=checksum,
                  source_path=str(relative), regions=regions, correct_choice=plan['correct_choice'], rights=rights, review=review,
                  plan_sha256=fingerprint, applied_to_database=False, original_modified=False,
                  previous_mapping=plan.get('previous_mapping', {}), option_labels_in_images=plan.get('option_labels_in_images', False), new_mapping={})
    if not write:
        return {**result, 'status': 'validated_plan_only'}
    output = output.resolve()
    if source.is_relative_to(output):
        raise ValueError('Derived output must not contain or overwrite original sources')
    output.mkdir(parents=True, exist_ok=True)
    destination = output / plan['question_id']
    if destination.is_symlink():
        raise ValueError('Derived destination cannot be a symlink')
    if destination.exists():
        stored = json.loads((destination / 'conversion.json').read_text())
        if set(stored.get('new_mapping', {})) != set(regions) or any(item.get('path') not in ['stem.png', 'a.png', 'b.png', 'c.png', 'd.png'] for item in stored['new_mapping'].values()):
            raise ValueError('Unsafe stored derivative paths')
        if stored['plan_sha256'] != fingerprint or any(digest(destination / item['path']) != item['sha256'] for item in stored['new_mapping'].values()):
            raise ValueError('Existing derivative differs; use a new isolated output root')
        return stored
    temporary = pathlib.Path(tempfile.mkdtemp(prefix='.crop-', dir=output))
    try:
        for key, (x, y, w, h) in regions.items():
            name = f'{key.lower()}.png'
            subprocess.run(['magick', *limits, encoded, '-crop', f'{w}x{h}+{x}+{y}', '+repage', '-strip', str(temporary / name)], check=True, capture_output=True, timeout=30)
            result['new_mapping'][key] = dict(path=name, sha256=digest(temporary / name), width=w, height=h)
        if digest(source) != checksum:
            raise ValueError('Original source changed during conversion')
        result['status'] = 'derived_assets_verified_pending_application'
        (temporary / 'conversion.json').write_text(json.dumps(result, indent=2)+'\n')
        temporary.rename(destination)
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('plan', type=pathlib.Path)
    parser.add_argument('--source-root', type=pathlib.Path, required=True)
    parser.add_argument('--output', type=pathlib.Path, default=pathlib.Path('local-imports/math-derived'))
    parser.add_argument('--write', action='store_true', help='Write reviewed lossless derivatives; never changes database records')
    args = parser.parse_args()
    print(json.dumps(convert(json.loads(args.plan.read_text()), args.source_root, args.output, args.write), indent=2))
