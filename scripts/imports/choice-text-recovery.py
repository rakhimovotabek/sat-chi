"""Recover only unambiguous scalar choices from the original PDF text layer.

No OCR guesses, imports, answer-key changes, or image deletion. Formula/graph
choices remain images. Run with package directory and pdftotext -bbox-layout XML.
"""
import json
import pathlib
import re
import sys
import xml.etree.ElementTree as ET


def scalar_choice(words, label):
    """Require a source label and a single baseline with one numeric value."""
    if not words:
        return None
    words = sorted(words, key=lambda w: (w['yMin'], w['xMin']))
    labels = [w for w in words if w['text'] in (label + '.', label + ')')]
    if len(labels) != 1:
        return None
    marker = labels[0]
    values = [w for w in words if w is not marker]
    if not values or len(values) > 2:
        return None
    # A stacked fraction, exponent, graph label, or second line is not a flat
    # number. Keep its original rendering rather than flattening its meaning.
    if any(abs(w['yMin'] - marker['yMin']) > 1.5 or
           w['xMin'] < marker['xMax'] for w in values):
        return None
    values.sort(key=lambda w: w['xMin'])
    value = ''.join(w['text'] for w in values).replace('\u2212', '-')
    if not re.fullmatch(r'[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?%?', value):
        return None
    # Multiple separate numbers on the same line are not a single scalar.
    if len(values) == 2 and values[0]['text'] not in ('-', '+', '\u2212'):
        return None
    return value


def recover(package, bbox):
    package = pathlib.Path(package)
    book = json.loads((package / 'book.json').read_text())
    provenance = json.loads((package / 'asset-provenance.json').read_text())
    regions = {r['asset']: r for r in provenance}
    pages = [p for p in ET.parse(bbox).getroot().iter() if p.tag.endswith('page')]
    by_page = []
    for page in pages:
        by_page.append([
            dict(text=w.text or '', **{k: float(v) for k, v in w.attrib.items()})
            for w in page.iter() if w.tag.endswith('word')
        ])
    recovered = []
    for chapter in book['chapters']:
        for topic in chapter['topics']:
            for q in topic['questions']:
                for index, option in enumerate(q.get('options', [])):
                    region = regions.get(option.get('image'))
                    if option.get('text') or not region or not region.get('regionPoints'):
                        continue
                    x0, y0, x1, y1 = region['regionPoints']
                    words = [w for w in by_page[region['page'] - 1]
                             if x0 <= w['xMin'] and w['xMax'] <= x1 and
                             y0 <= (w['yMin'] + w['yMax']) / 2 < y1]
                    value = scalar_choice(words, 'ABCD'[index])
                    if value is None:
                        continue
                    # Large crops containing plots must not become axis numbers.
                    # These packages use 2.5x source crops, trimmed with padding.
                    width, height = region['pixels']
                    text_width = max(w['xMax'] for w in words) - min(w['xMin'] for w in words)
                    text_height = max(w['yMax'] for w in words) - min(w['yMin'] for w in words)
                    if width > text_width * 2.5 + 45 or height > text_height * 2.5 + 45:
                        continue
                    recovered.append(dict(sourceId=q['id'], fingerprint=package.name,
                                          index=index, text=value, sourcePath=option['image'],
                                          page=region['page'], method='pdf-labelled-scalar-v1'))
    return recovered


if __name__ == '__main__':
    print(json.dumps(recover(*sys.argv[1:])))
