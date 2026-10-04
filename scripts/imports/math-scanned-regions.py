"""Selected scanned questions only; verified private printed-key evidence.

Do not OCR the entire book. The shared renderer verifies each selected question
header and complete choice labels; mathematical content stays in the image.
"""
import json,sys,xml.etree.ElementTree as ET
xml=ET.parse(sys.argv[1]);pages=[p for p in xml.iter() if p.tag.endswith('}page')]
evidence=json.load(open('local-imports/math-scans/advanced-verified-key.json'))
if evidence['fingerprint']!='dda68708697cec56bfaba3a8581285cd7414661b1188223a858a524f9f9a6585':raise ValueError('Wrong verified source')
accepted=[]
for n,answer in evidence['keys'].items():
    number=int(n);page=pages[number-1];width=float(page.attrib['width']);height=float(page.attrib['height'])
    accepted.append(dict(section='Verified scanned practice',number=number,page=number,key_page=evidence['key_page'],answer=answer,full_page=True,bounds=[0,0,width,height],page_width=width,page_height=height))
print(json.dumps(dict(page_count=len(pages),sections=[dict(title='Selected verified scanned questions',questions=len(accepted),key_page=evidence['key_page'],problems=[])],accepted=accepted,unresolved=[])))
