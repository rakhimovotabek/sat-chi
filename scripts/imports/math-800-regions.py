"""800 Challenge adapter: printed key AND scoped written-solution agreement."""
import json,re,sys,xml.etree.ElementTree as ET

def parse_regions(xml,text):
    root=ET.fromstring(re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]','',xml))
    pages=[p for p in root.iter() if p.tag.endswith('}page')];texts=text.split('\f')
    key_index=next((i for i,t in reversed(list(enumerate(texts))) if re.search(r'^Answer Key\s*$',t,re.M)),None)
    if key_index is None:raise ValueError('No explicit summary key')
    summary={}
    for m in re.finditer(r'\b(\d{1,3})\s+([A-D])\b',texts[key_index]):
        n=int(m[1]);summary[n]=m[2] if n not in summary or summary[n]==m[2] else 'conflict'
    layouts=[]
    for page in pages:
        width=float(page.attrib['width']);columns=[[],[]]
        for line in page.iter():
            if not line.tag.endswith('}line'):continue
            words=[w for w in line if w.tag.endswith('}word')]
            for side in range(2):
                subset=[w for w in words if (float(w.attrib['xMin'])>=width/2)==bool(side)]
                if subset:columns[side].append(dict(x=float(subset[0].attrib['xMin']),y=float(line.attrib['yMin']),text=' '.join(w.text or '' for w in subset)))
        layouts.append([sorted(c,key=lambda l:(l['y'],l['x'])) for c in columns])
    solutions={}
    for i in range(key_index+1,len(pages)):
        for column in layouts[i]:
            starts=[(j,int(m[1])) for j,l in enumerate(column) if (m:=re.match(r'^№\s*(\d{1,3})(?:\s|$)',l['text']))]
            for k,(start,n) in enumerate(starts):
                block=column[start:starts[k+1][0] if k+1<len(starts) else len(column)]
                answers=[m[1] for l in block if (m:=re.match(r'^ANSWER:\s*([A-D])\)',l['text']))]
                if len(answers)==1:solutions[n]=(answers[0],i+1)
    accepted=[];unresolved=[];seen=set()
    for i in range(key_index):
        page=pages[i];width=float(page.attrib['width']);height=float(page.attrib['height'])
        if 'Questions' not in texts[i]:continue
        for side,column in enumerate(layouts[i]):
            starts=[(j,int(m[1])) for j,l in enumerate(column) if (m:=re.match(r'^№\s*(\d{1,3})(?:\s|$)',l['text']))]
            for k,(start,n) in enumerate(starts):
                header=column[start];bottom=column[starts[k+1][0]]['y']-5 if k+1<len(starts) else height-35
                block=[l for l in column[start:] if l['y']<bottom]
                opts=[m[1] for l in block if (m:=re.match(r'^([A-D])\)',l['text']))]
                reason=None
                if n in seen:reason='Repeated question number'
                elif n not in summary:reason='Numeric response or no reliable summary letter key'
                elif n not in solutions or solutions[n][0]!=summary[n]:reason='Summary key and scoped written solution do not agree'
                elif opts!=list('ABCD'):reason='Incomplete MCQ region or choice boundaries'
                seen.add(n)
                printed=' '.join(l['text'] for l in block)
                domain=next((d for pattern,d in [('GEOMETRY','Geometry and Trigonometry'),('PROBLEM-SOLVING','Problem-Solving and Data Analysis'),('ADVANCED MATH','Advanced Math'),('ALGEBRA','Algebra')] if pattern in printed),'Unclassified Math')
                item=dict(section=domain,number=n,page=i+1,key_page=key_index+1)
                if reason:unresolved.append(dict(**item,reason=reason));continue
                accepted.append(dict(**item,answer=summary[n],solution_page=solutions[n][1],bounds=[max(0,side*width/2+12),max(0,header['y']-5),width/2-24,bottom-header['y']+5],page_width=width,page_height=height))
    return dict(page_count=len(pages),sections=[dict(title='800 Challenge',key_page=key_index+1,questions=150,problems=[])],accepted=accepted,unresolved=unresolved)
if __name__=='__main__':
    print(json.dumps(parse_regions(open(sys.argv[1]).read(),open(sys.argv[2]).read())))
