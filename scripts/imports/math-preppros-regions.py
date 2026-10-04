"""PrepPros Complete Guide: three-column scoped keys, verified printed-page offsets.

Accept only an explicit letter key and a complete two-column practice region.
Examples and instructional numbered lists outside the keyed page ranges are
excluded. Every page offset is checked against its own printed footer.
"""
import json,re,sys,xml.etree.ElementTree as ET

def parse_regions(xml,text):
    root=ET.fromstring(re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]','',xml));pages=[p for p in root.iter() if p.tag.endswith('}page')];texts=text.split('\f')
    layouts=[];footers={}
    for i,page in enumerate(pages):
        lines=[]
        for node in page.iter():
            if not node.tag.endswith('}line'):continue
            content=' '.join(w.text or '' for w in node if w.tag.endswith('}word'))
            line=dict(x=float(node.attrib['xMin']),y=float(node.attrib['yMin']),text=content)
            lines.append(line)
            if line['y']>735 and (m:=re.fullmatch(r'-\s*(\d+)\s*-',content)):footers[i+1]=int(m[1])
        layouts.append(sorted(lines,key=lambda l:(l['y'],l['x'])))
    key_pages=[i for i,t in enumerate(texts) if 326 <= footers.get(i+1,0) <= 335]
    scopes=[];current=None
    for i in key_pages:
        columns=[[],[],[]]
        for line in layouts[i]:
            if 55<line['y']<725:columns[0 if line['x']<216 else 1 if line['x']<378 else 2].append(line)
        for column in columns:
            for j,line in enumerate(column):
                if re.match(r'^Chapter\s+\d+',line['text']):
                    heading=line['text']
                    for more in column[j+1:j+4]:
                        if re.match(r'^\d+\.',more['text']):break
                        heading+=' '+more['text']
                    chapter=re.search(r'^Chapter\s+(\d+)',heading)
                    span=re.search(r'pp?\.\s*(\d+)(?:\s*[-–]\s*(\d+))?',heading)
                    if not span:current=None;continue
                    first=int(span[1]);last=int(span[2] or span[1]);
                    title=re.sub(r'\s*\(.*','',heading).strip()
                    current=dict(title=title,chapter=int(chapter[1]),first=first,last=last,keys={},key_pages={},problems=[]);scopes.append(current)
                elif current and (m:=re.match(r'^(\d+)\.\s*(.*)$',line['text'])):
                    number=int(m[1]);answer=m[2].strip();
                    if number in current['keys']:current['problems'].append('Repeated key number in scope')
                    current['keys'][number]=answer if re.fullmatch('[A-D]',answer) else 'numeric_or_ambiguous'
                    current['key_pages'][number]=i+1
    accepted=[];unresolved=[]
    for scope in scopes:
        seen=set()
        for printed in range(scope['first'],scope['last']+1):
            physical=printed+40
            if footers.get(physical)!=printed:
                unresolved.append(dict(section=scope['title'],number=None,page=physical,reason='Printed-to-physical page offset failed verification'));continue
            page=pages[physical-1];width=float(page.attrib['width']);height=float(page.attrib['height'])
            columns=[[],[]]
            for line in layouts[physical-1]:
                if 75<line['y']<725:columns[int(line['x']>=width/2)].append(line)
            for side,column in enumerate(columns):
                starts=[(j,int(m[1])) for j,l in enumerate(column) if (m:=re.match(r'^(\d+)\.(?:\s|$)',l['text'])) and (60<l['x']<85 if side==0 else 308<l['x']<332)]
                for k,(start,n) in enumerate(starts):
                    header=column[start];bottom=column[starts[k+1][0]]['y']-4 if k+1<len(starts) else 725
                    block=[l for l in column[start:] if l['y']<bottom]
                    opts=[m[1] for l in block for m in re.finditer(r'(?:^|\s)([A-D])\)',l['text'])]
                    reason=None
                    if scope['problems']:reason='Repeated chapter key number'
                    elif n in seen:reason='Repeated practice question number'
                    elif n not in scope['keys']:reason='No matching explicit chapter/subsection key'
                    elif scope['keys'][n]=='numeric_or_ambiguous':reason='Numeric response or uncertain printed key'
                    elif opts!=list('ABCD'):reason='Incomplete choice boundaries / region continuation'
                    seen.add(n)
                    chapter_name=re.search(r'Chapter\s+'+str(scope['chapter'])+r':\s*([^\n]+)',texts[physical-1])
                    title=chapter_name[1].strip() if chapter_name else scope['title']
                    # Subsection page range stays part of identity where numbers restart.
                    section=f"{title} (pp. {scope['first']}-{scope['last']})"
                    item=dict(section=section,number=n,page=physical,key_page=scope['key_pages'].get(n))
                    if reason:unresolved.append(dict(**item,reason=reason));continue
                    accepted.append(dict(**item,answer=scope['keys'][n],bounds=[max(0,side*width/2+12),header['y']-5,width/2-24,bottom-header['y']+5],page_width=width,page_height=height,printed_page=printed,chapter=scope['chapter']))
    repeated={(x['section'],x['number']) for x in unresolved if x['reason']=='Repeated practice question number'}
    for item in accepted[:]:
        if (item['section'],item['number']) in repeated:accepted.remove(item);unresolved.append(dict(**item,reason='Repeated practice question number'))
    return dict(page_count=len(pages),sections=[dict(title=s['title'],key_page=min(s['key_pages'].values()) if s['key_pages'] else None,questions=len(s['keys']),problems=s['problems']) for s in scopes],accepted=accepted,unresolved=unresolved)
if __name__=='__main__':print(json.dumps(parse_regions(open(sys.argv[1]).read(),open(sys.argv[2]).read())))
