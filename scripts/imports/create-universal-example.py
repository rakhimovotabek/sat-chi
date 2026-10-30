"""Generate only original, CC0 examples. No third-party source material."""
import json, zipfile, pathlib, struct, zlib
out = pathlib.Path('assets/examples/satchi-book-v1')
out.mkdir(parents=True, exist_ok=True)
manifest = {'format':'satchi-book-v1','book':{'id':'satchi-original-example','title':'SAT’chi Original Practice','author':'SAT’chi','description':'Original import acceptance fixture','section':'Math','cover':'assets/cover.png'},'rights':{'authorized':True,'owner':'SAT’chi','license':'CC0-1.0','provenance':'Created specifically for software testing'},'topics':[{'id':'chapter-one','title':'Foundations'},{'id':'algebra','title':'Linear equations','parent':'chapter-one'},{'id':'chapter-two','title':'Data and geometry'},{'id':'data','title':'Working with data','parent':'chapter-two'}],'questionCount':6}
def question(i, text, **kw):
 q = {'id':f'q{i:04}','topic':'algebra','type':'mcq','text':text,'options':[{'label':x,'text':str(n)}for x,n in zip('ABCD',[2,4,6,8])],'answer':1,'domain':'Algebra','skill':'Linear equations','difficulty':'easy','reviewStatus':'approved','source':{'reference':'SAT’chi original test content'},'explanation':'Two pairs contain four items.'}
 q.update(kw)
 return q
qs = [question(1,'What is 2 + 2?'),question(2,'Choose the tile labeled 4.', options=[{'label':x,'text':str(n),'image':f'assets/option-{x.lower()}.png'}for x,n in zip('ABCD',[2,4,6,8])]),question(3,r'Solve $2x=8$. What is $x$?'),question(4,'What is one half?',type='open',acceptedAnswers=['0.5','1/2']),question(5,'How many seedlings were added?',passage='A class had two seedlings. They added four seedlings. They now have six.',topic='data',domain='Problem-Solving and Data Analysis',skill='Interpreting data'),question(6,'What is 2 + 2?',explanationImage='assets/explanation.png')]
qs[3].pop('options');qs[3].pop('answer')
# Valid tiny PNG tiles; labels remain text in each real option, preserving accessibility.
def png(rgb):
 def chunk(t,d):return struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
 return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',32,32,8,2,0,0,0))+chunk(b'IDAT',zlib.compress((b'\0'+bytes(rgb)*32)*32))+chunk(b'IEND',b'')
files={'manifest.json':json.dumps(manifest,ensure_ascii=False,indent=2).encode(),'questions.jsonl':('\n'.join(json.dumps(q,ensure_ascii=False)for q in qs)+'\n').encode(),'review-report.csv':b'question_id,status,note\n'+b''.join(f"{q['id']},approved,Original verified fixture\n".encode() for q in qs),'README.md':b'Original CC0 SATchi software fixture. Colored tiles are intentionally synthetic.\n'}
for i,name in enumerate(['cover','option-a','option-b','option-c','option-d','explanation']):files[f'assets/{name}.png']=png((40+i*20,100,160))
with zipfile.ZipFile(out/'original-practice.zip','w',zipfile.ZIP_DEFLATED)as z:
 z.writestr('assets/',b'')
 for name,data in files.items():z.writestr(name,data)
for name in ['manifest.json','questions.jsonl']: (out/name).write_bytes(files[name])
