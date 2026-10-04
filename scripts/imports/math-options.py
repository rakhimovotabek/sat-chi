"""Conservative embedded-choice recovery; complex geometry stays quarantined.

Each option must have an explicit A-D label, one baseline and unambiguous text.
Fractions/superscripts, diagram options, missing labels and wrapped unknown content
are rejected. Stem visuals remain authoritative; options are never guessed.
"""
import json,re,sys,xml.etree.ElementTree as ET

def recover(xml,regions):
    xml=re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]','',xml)
    pages=[p for p in ET.fromstring(xml).iter() if p.tag.endswith('}page')]
    results=[]
    for r in regions:
        record={**r}; record['options_verified']=False
        page=pages[r['page']-1]
        x,y,w,h=r.get('render_bounds',r['bounds'])
        # Original column bounds, not the wider rendered margins.
        bx,by,bw,bh=r['bounds']
        lines=[]
        for node in page.iter():
            if not node.tag.endswith('}line'):continue
            words=[word for word in node if word.tag.endswith('}word') and bx-8<=float(word.attrib['xMin'])<bx+bw+8 and by-1<=float(word.attrib['yMin'])<by+bh]
            if words: lines.append({'text':' '.join(word.text or '' for word in words),'y':float(node.attrib['yMin']),'bottom':float(node.attrib['yMax']),'words':words})
        lines.sort(key=lambda l:(l['y'],float(l['words'][0].attrib['xMin'])))
        labels=[]
        for i,line in enumerate(lines):
            m=re.match(r'^([A-D])(?:[).]|\s)\s*(.*)$',line['text'])
            if m: labels.append((i,m[1],m[2]))
        if [a[1] for a in labels]!=list('ABCD'):
            record['reason']='Actual choice labels cannot be reliably mapped';results.append(record);continue
        options=[];reason=None
        for j,(i,label,text) in enumerate(labels):
            end=labels[j+1][0] if j<3 else len(lines)
            body=lines[i:end]
            # Only one unambiguous textual baseline. Never flatten fractions,
            # exponents, graphics or wrap-continued expressions into false text.
            if len(body)!=1 or not text.strip(): reason='Multiline, graphic or empty answer choice requires verification';break
            word_nodes=body[0]['words']
            if len(word_nodes)<2 or max(float(n.attrib['yMin']) for n in word_nodes)-min(float(n.attrib['yMin']) for n in word_nodes)>1.5:
                reason='Answer choice has fraction or exponent geometry';break
            if not re.fullmatch(r'[\w\s,.$%+−–=()/:<>!?\-]+',text,re.UNICODE) or re.search(r'[^\W\d_]\s+\d',text):
                reason='Answer notation cannot be safely reconstructed';break
            options.append(text.strip())
        if reason or len(set(options))!=4:
            record['reason']=reason or 'Answer choices are not distinct';results.append(record);continue
        first=lines[labels[0][0]]['y']
        if first-y<15:
            record['reason']='Stem crop boundary cannot be verified';results.append(record);continue
        # Known chapter captions precede the problem, not its visual content.
        captions=[line for line in lines[:labels[0][0]] if re.match(r'^ADVANCED MATH [—–] ',line['text'])]
        if captions:
            y=max(y,max(line['bottom'] for line in captions)+2)
        if first-y<15:
            record['reason']='Caption and stem boundary require verification';results.append(record);continue
        # Keep diagram space above the stem. Crop exactly at the first option.
        record.update(options=options,options_verified=True,stem_bounds=[x,y,w,max(1,first-y-3)],reason=None)
        results.append(record)
    return results

if __name__=='__main__':
    with open(sys.argv[1]) as f:xml=f.read()
    with open(sys.argv[2]) as f:r=json.load(f)
    print(json.dumps(recover(xml,r['accepted'])))
