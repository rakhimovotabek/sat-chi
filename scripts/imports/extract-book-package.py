"""Validate and extract a structured ZIP; no PDF extraction or content rewriting."""
import hashlib, json, pathlib, struct, sys, zipfile, zlib

archive, destination = sys.argv[1:]
root = pathlib.Path(destination)
root.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(archive) as source:
    names = [n for n in source.namelist() if not n.endswith('/')]
    books = [n for n in names if pathlib.PurePosixPath(n).name == 'book.json']
    if len(books) != 1:
        raise ValueError('ZIP must contain exactly one book.json')
    prefix = books[0][:-len('book.json')]
    provenance_name = prefix + 'asset-provenance.json'
    if provenance_name not in names:
        raise ValueError('ZIP is missing asset provenance')
    provenance = json.loads(source.read(provenance_name))
    referenced_assets = {item['asset'] for item in provenance}
    index = []
    for name in names:
        if not name.startswith(prefix):
            raise ValueError('Unexpected package root')
        relative = pathlib.PurePosixPath(name[len(prefix):])
        if relative.is_absolute() or '..' in relative.parts or '\\' in str(relative):
            raise ValueError('Unsafe ZIP path')
        raw = source.read(name)  # ZIP CRC is verified too.
        if relative.parts[0] == 'assets':
            if str(relative) not in referenced_assets:
                # Ignore package leftovers such as .tmp files and unused crops.
                continue
            if relative.suffix != '.png' or raw[:8] != b'\x89PNG\r\n\x1a\n':
                raise ValueError('Unsupported package asset: ' + name)
            pos, compressed, dimensions = 8, bytearray(), None
            while pos < len(raw):
                length = struct.unpack('>I', raw[pos:pos+4])[0]
                kind = raw[pos+4:pos+8]
                chunk = raw[pos+8:pos+8+length]
                crc = struct.unpack('>I', raw[pos+8+length:pos+12+length])[0]
                if zlib.crc32(kind + chunk) & 0xffffffff != crc:
                    raise ValueError('Invalid PNG CRC: ' + name)
                if kind == b'IHDR':
                    dimensions = list(struct.unpack('>II', chunk[:8]))
                elif kind == b'IDAT':
                    compressed.extend(chunk)
                pos += length + 12
            if not dimensions or not zlib.decompress(compressed):
                raise ValueError('Invalid PNG pixels: ' + name)
            index.append({'source': str(relative), 'sha256': hashlib.sha256(raw).hexdigest(),
                          'storageHash': hashlib.sha256(str(relative).encode() + raw).hexdigest(),
                          'bytes': len(raw), 'pixels': dimensions})
        path = root.joinpath(*relative.parts)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(raw)
    (root / 'asset-index.json').write_text(json.dumps(index, indent=2) + '\n')
print(json.dumps({'files': len(names), 'assets': len(index), 'pngPixelsValidated': True}))
