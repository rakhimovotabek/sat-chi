"""Offline extraction only. Never follows URLs or writes archive members to disk."""
import json, sys, zipfile, posixpath
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
class Text(HTMLParser):
    def __init__(self): super().__init__(); self.lines=[]; self.hidden=0
    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'): self.hidden += 1
        if tag in ('p','div','h1','h2','h3','li','br'): self.lines.append('\n')
    def handle_endtag(self, tag):
        if tag in ('script', 'style'): self.hidden = max(0, self.hidden-1)
    def handle_data(self, value):
        if not self.hidden: self.lines.append(value)
with zipfile.ZipFile(sys.argv[1]) as archive:
    if sum(i.file_size for i in archive.infolist()) > 100_000_000: raise ValueError('Archive expands beyond the safe extraction limit')
    names=archive.namelist()
    assets=[n for n in names if n.lower().endswith(('.png','.jpeg','.jpg','.svg','.gif','.webp'))]
    title=None; tables=False
    if sys.argv[1].lower().endswith('.docx'):
        xml=ET.fromstring(archive.read('word/document.xml'))
        ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
        text='\n'.join(''.join(t.text or '' for t in p.findall('.//w:t',ns)) for p in xml.findall('.//w:p',ns))
        tables=bool(xml.findall('.//w:tbl',ns))
    else:
        container=ET.fromstring(archive.read('META-INF/container.xml'))
        opf=next(e.attrib['full-path'] for e in container.iter() if e.tag.endswith('rootfile'))
        package=ET.fromstring(archive.read(opf)); directory=posixpath.dirname(opf)
        title=next((e.text for e in package.iter() if e.tag.endswith('}title')),None)
        manifest={e.attrib['id']:e.attrib.get('href','') for e in package.iter() if e.tag.endswith('}item')}
        text=[]
        for item in (e for e in package.iter() if e.tag.endswith('}itemref')):
            name=posixpath.normpath(posixpath.join(directory,manifest[item.attrib['idref']]))
            if name.startswith('../') or name.startswith('/') or ':' in name: raise ValueError('Unsafe EPUB resource')
            document=archive.read(name).decode('utf8'); parser=Text(); parser.feed(document); text.append(''.join(parser.lines))
            tables=tables or '<table' in document.lower()
        text='\n\f\n'.join(text)
    print(json.dumps({'text':text,'title':title,'assets':assets,'tables':tables}))
