"""Deterministic MathBook/HardBook chapter-key + two-column region adapter.

The image is authoritative: exponents, fractions, tables and vector figures are
never reconstructed from lossy text. Only complete, explicitly letter-keyed MCQs
contained in one column on one page are accepted. Numeric/cross-page items stay
in the exact-page recovery inventory.
"""
import json, re, sys, xml.etree.ElementTree as ET

def parse_regions(xml, text):
    xml = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', xml)
    pages = [p for p in ET.fromstring(xml).iter() if p.tag.endswith('}page')]
    texts = text.split('\f')
    sections, start = [], 0
    for index, page_text in enumerate(texts):
        heading = re.search(r'^\s*(?:Answers:\s*(.+)|(.+?)\s+Answers)\s*$', page_text, re.M)
        if not heading:
            continue
        title = (heading[1] or heading[2]).strip()
        keys, key_pages, problems = {}, {}, []
        key_end = index
        while key_end+1 < len(texts) and re.search(r'Number\s+Answer',texts[key_end+1]) and not re.search(r'Answers:',texts[key_end+1]):
            key_end += 1
        for key_index in range(index,key_end+1):
            for line in texts[key_index].splitlines():
                row = re.match(r'^\s*(\d+)\s{2,}(.+?)\s{2,}(\d+)\s{2,}(.+?)\s*$',line)
                if row: pairs = [(row[1],row[2]),(row[3],row[4])]
                else:
                    row = re.match(r'^\s*(\d+)\s{2,}(\S.*?)\s*$',line)
                    pairs = [(row[1],row[2])] if row else []
                for number, answer in pairs:
                    number = int(number)
                    if number in keys: problems.append('Repeated question number in chapter key')
                    keys[number] = answer.strip().upper()
                    key_pages[number] = key_index+1
        if not keys or sorted(keys) != list(range(1, max(keys)+1)):
            problems.append('Chapter key numbering is incomplete')
        sections.append(dict(title=title, start=start, end=index, key_page=index+1, keys=keys, key_pages=key_pages, problems=problems))
        start = key_end+1
    accepted, unresolved = [], []
    for section in sections:
        seen = set()
        for page_index in range(section['start'], section['end']):
            page = pages[page_index]; width, height = float(page.attrib['width']), float(page.attrib['height'])
            columns = [[], []]
            for node in page.iter():
                if not node.tag.endswith('}line'): continue
                words = [w for w in node if w.tag.endswith('}word')]
                if not words: continue
                for side in range(2):
                    subset = [w for w in words if (float(w.attrib['xMin']) >= width/2) == bool(side)]
                    if subset:
                        columns[side].append(dict(x=float(subset[0].attrib['xMin']),y=float(node.attrib['yMin']),bottom=float(node.attrib['yMax']),text=' '.join(w.text or '' for w in subset)))
            for side, lines in enumerate(columns):
                lines.sort(key=lambda l:(l['y'],l['x']))
                headers = []
                for line in lines:
                    match = re.match(r'^(\d+)\.(?:\s|$)', line['text'])
                    # Chapter question numbers live at the outer column margin.
                    margin = 0 if side == 0 else width/2
                    if match and line['x']-margin < width*.12 and line['y'] < height-45:
                        headers.append((int(match[1]),line))
                for position, (number, header) in enumerate(headers):
                    bottom = headers[position+1][1]['y']-5 if position+1<len(headers) else height-45
                    body = [line for line in lines if header['y'] <= line['y'] < bottom]
                    options = []
                    for line in body:
                        match = re.match(r'^([A-D])(?:\)|\.)', line['text'])
                        if not match and 18 <= line['x']-header['x'] <= 30:
                            match = re.match(r'^([A-D])(?:\s|$)',line['text'])
                        if match: options.append(match[1])
                    reason = None
                    if section['problems']: reason = '; '.join(section['problems'])
                    elif number in seen: reason = 'Repeated question number in chapter'
                    elif number not in section['keys']: reason = 'No chapter-scoped answer key'
                    elif section['keys'][number] not in list('ABCD'): reason = 'Numeric response requires numeric grading support'
                    elif options != list('ABCD'): reason = 'Incomplete or uncertain choice boundaries / page continuation'
                    seen.add(number)
                    record = dict(section=section['title'],number=number,page=page_index+1,key_page=section['key_pages'].get(number,section['key_page']))
                    if reason:
                        unresolved.append(dict(**record,reason=reason));continue
                    accepted.append(dict(**record,answer=section['keys'][number],bounds=[max(0,side*width/2+12),max(0,header['y']-5),width/2-24,bottom-header['y']+5],page_width=width,page_height=height))
        for number in sorted(set(section['keys'])-seen):
            unresolved.append(dict(section=section['title'],number=number,page=None,key_page=section['key_page'],reason='Question header not recovered; inspect chapter range',chapter_pages=[section['start']+1,section['end']]))
    # A repeated number invalidates BOTH instances, never pick one arbitrarily.
    repeated = {(x['section'],x['number']) for x in unresolved if x['reason']=='Repeated question number in chapter'}
    for item in accepted[:]:
        if (item['section'],item['number']) in repeated:
            accepted.remove(item);unresolved.append(dict(**item,reason='Repeated question number in chapter'))
    return dict(page_count=len(pages),sections=[dict(title=s['title'],key_page=s['key_page'],questions=len(s['keys']),problems=s['problems']) for s in sections],accepted=accepted,unresolved=unresolved)

if __name__ == '__main__':
    with open(sys.argv[1]) as file: xml=file.read()
    with open(sys.argv[2]) as file: text=file.read()
    print(json.dumps(parse_regions(xml,text)))
