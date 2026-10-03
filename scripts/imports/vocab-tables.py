"""Recover source cells using actual PDF table borders, never whitespace guesses."""
import json, re, subprocess, sys, unicodedata, xml.etree.ElementTree as ET
from pathlib import Path
bbox, source, layout = sys.argv[1:]
root = ET.parse(bbox).getroot()
pages = [e for e in root.iter() if e.tag.endswith('}page')]
texts = Path(layout).read_text().split('\f')
def clean(s):
    return unicodedata.normalize('NFKC', s).replace('\u200b','').replace('\u200c','').replace('\u200d','').strip()
sets=[]; current=None; table=False
for i,page in enumerate(pages):
    text=clean(texts[i]); heading=re.search(r'Set\s+(\d+)',text)
    if 'Learning Time' in text and heading and 'Definition' in text:
        number=int(heading[1]); section='College Panda 400 Words' if len(sets)<16 else 'SATashkent Words'
        current={'title':f'{section} · Set {number}','source_set':number,'collection':section,'source_page':i+1,'words':[],'pages':[]}
        sets.append(current);table=True
    if current is None: continue
    if 'Acknowledgement' in text and i>350: break
    current['pages'].append({'page':i+1,'text':text})
    if 'Reading Time' in text: stop=text.index('Reading Time') # table may end midway through this page
    else: stop=None
    if not table: continue
    if stop is not None and len(current['words'])==25 and not re.search(r'^\s*25\s',text[:stop],re.M):
        table=False;continue
    svg=Path(bbox).parent/f'vocab-table-{i+1}.svg'
    if not svg.exists(): subprocess.run(['pdftocairo','-svg','-f',str(i+1),'-l',str(i+1),source,str(svg)],check=True,stdout=subprocess.DEVNULL)
    doc=ET.parse(svg).getroot(); horizontal=[];vertical=[]
    for e in doc.iter():
        if not e.tag.endswith('}path') or not e.get('stroke-width'): continue
        matrix=re.findall(r'-?\d+(?:\.\d+)?',e.get('transform',''))
        if len(matrix)!=6: continue
        a,b,c,d,tx,ty=map(float,matrix)
        for segment in re.finditer(r'M\s+(-?[\d.]+)\s+(-?[\d.]+)\s+L\s+(-?[\d.]+)\s+(-?[\d.]+)',e.get('d','')):
            x1,y1,x2,y2=map(float,segment.groups())
            xa,ya=a*x1+c*y1+tx,b*x1+d*y1+ty; xb,yb=a*x2+c*y2+tx,b*x2+d*y2+ty
            if abs(ya-yb)<0.1 and abs(xb-xa)>400: horizontal.append(round(ya,2))
            if abs(xa-xb)<0.1 and abs(yb-ya)>5: vertical.append(round(xa,2))
    xs=sorted(set(vertical));ys=sorted(set(horizontal))
    if len(xs)!=6 or len(ys)<2: raise ValueError(f'Page {i+1}: unrecognized table borders')
    tokens=[]
    for w in page.iter():
        if w.tag.endswith('}word'):
            tokens.append((float(w.get('xMin')),float(w.get('yMin')),float(w.get('xMax')),float(w.get('yMax')),clean(w.text or '')))
    for top,bottom in zip(ys,ys[1:]):
        cells=[]
        for left,right in zip(xs,xs[1:]):
            words=sorted([w for w in tokens if left<(w[0]+w[2])/2<right and top<(w[1]+w[3])/2<bottom],key=lambda w:(round(w[1],1),w[0]))
            cells.append(' '.join(w[4] for w in words))
        num,word,definition,example,related=cells
        if num=='#':
            current['related_field']='antonym' if 'Antonym' in related else 'synonym' if 'Synonym' in related else None
            if not current['related_field']: raise ValueError(f'Page {i+1}: missing relation header')
            continue
        if not any(cells): continue
        if not num:
            if not current['words']: raise ValueError('Orphaned continuation cell')
            prior=current['words'][-1]
            for field,value in zip(['word','definition','example',current['related_field']],cells[1:]):
                if value: prior[field]=(prior.get(field,'')+' '+value).strip()
            continue
        if not re.fullmatch(r'\d+',num): raise ValueError(f'Page {i+1}: invalid word ordinal')
        if int(num)!=len(current['words'])+1: raise ValueError(f'Page {i+1}: broken set boundary at word {num}')
        if not word or not definition: raise ValueError(f'Page {i+1}: incomplete word {num}')
        current['words'].append({'word':word,'definition':definition,'example':example,current['related_field']:related,'source_page':i+1,'extraction_confidence':'verified_cells'})
    if stop is not None: table=False
print(json.dumps({'sets':sets,'answer_pages':[clean(t) for t in texts[371:]]},ensure_ascii=False))
