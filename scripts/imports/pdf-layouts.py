"""Deterministic source-specific bounding-box layout readers, no OCR or inferred text."""
import json,re,sys,xml.etree.ElementTree as ET
MODE=sys.argv[2] if len(sys.argv)>2 else "satakror"
root=ET.parse(sys.argv[1]).getroot();out=[]
for number,page in enumerate((e for e in root.iter() if e.tag.endswith('}page')),1):
    lines=[]
    for line in (e for e in page.iter() if e.tag.endswith('}line')):
        words=[w for w in line if w.tag.endswith('}word')]
        if words:lines.append((float(line.attrib['yMin']),float(words[0].attrib['xMin']),words))
    if MODE=='satoplam':
        width=float(page.attrib['width'])
        headers=[r for r in lines if len(r[2])==1 and re.fullmatch(r'\d+',r[2][0].text or '') and width*.52<r[1]<width*.56]
        headers.sort()
        regions=[]
        for i,(top,header_x,words) in enumerate(headers):
            cut=width/2
            end=headers[i+1][0]-8 if i+1<len(headers) else float(page.attrib['height'])-45
            columns=[[],[]];cross=[];gaps=[]
            for y,x,ws in sorted(lines):
                if not top-8<=y<end:continue
                if len(ws)==1 and re.fullmatch(r'\d+',ws[0].text or '') and abs(x-header_x)<2:continue
                if any('@satashkent' in (w.text or '') for w in ws):continue
                if re.fullmatch(r'[.\s]+',' '.join(w.text or '' for w in ws)):continue
                for side in [0,1]:
                    selected=[w for w in ws if (float(w.attrib['xMin'])>=cut-1)==bool(side)]
                    if selected:
                        columns[side].append(' '.join(w.text or '' for w in selected))
                        for a,b in zip(selected,selected[1:]):
                            if float(b.attrib['xMin'])-float(a.attrib['xMax'])>25:gaps.append({'side':side,'y':y,'gap':round(float(b.attrib['xMin'])-float(a.attrib['xMax']),2)})
                cross.extend(w.text or '' for w in ws if float(w.attrib['xMin'])<cut-1<float(w.attrib['xMax']))
            regions.append({'page':number,'number':int(words[0].text),'columns':['\n'.join(c) for c in columns],'crossing':cross,'gaps':gaps})
        out.append({'page':number,'regions':regions});continue
    headers=[r for r in lines if re.match(r'^\d+\)',r[2][0].text or '') and r[1]>float(page.attrib['width'])/2]
    if len(headers)!=1:out.append({'page':number,'warnings':['Expected one numbered question in the right column'],'columns':[]});continue
    top,cut,_=headers[0];columns=[[],[]];cross=[]
    for y,x,words in sorted(lines):
        if y<top-2:continue
        for side in [0,1]:
            selected=[w for w in words if (float(w.attrib['xMin'])>=cut-1)==bool(side)]
            if selected:
                text=' '.join(w.text or '' for w in selected)
                # Left gutter page/question number is separate from paragraph text.
                if side==0 and re.fullmatch(r'\d+',text) and text==headers[0][2][0].text.rstrip(')') and float(selected[0].attrib['xMin'])<50:continue
                columns[side].append(text)
        cross.extend(w.text or '' for w in words if float(w.attrib['xMin'])<cut-1<float(w.attrib['xMax']))
    out.append({'page':number,'columns':['\n'.join(c) for c in columns],'crossing':cross,'question_number':int(headers[0][2][0].text.rstrip(')')),'region':{'x':cut,'y':top},'warnings':[]})
print(json.dumps(out))
