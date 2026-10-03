"""Read local pdftotext bbox XML; reconstruct two columns without merging them."""
import json, sys, xml.etree.ElementTree as ET
root=ET.parse(sys.argv[1]).getroot(); pages=[]
for page in (e for e in root.iter() if e.tag.endswith('}page')):
    middle=float(page.attrib['width'])/2
    columns=[[],[]]; crossing=[]
    for line in (e for e in page.iter() if e.tag.endswith('}line')):
        words=[e for e in line if e.tag.endswith('}word')]
        for side in range(2):
            selected=[w for w in words if (float(w.attrib['xMin']) >= middle)==bool(side)]
            if selected:
                columns[side].append((float(line.attrib['yMin']),float(selected[0].attrib['xMin']), ' '.join(w.text or '' for w in selected)))
        for w in words:
            if float(w.attrib['xMin']) < middle < float(w.attrib['xMax']): crossing.append(w.text or '')
    pages.append({'columns':['\n'.join(t[2] for t in sorted(c)) for c in columns], 'crossing':crossing})
print(json.dumps(pages))
