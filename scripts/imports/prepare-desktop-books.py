"""Prepare authorized Desktop book records and lossless assets locally; never contacts production."""
import argparse, hashlib, json, os, pathlib, subprocess, tempfile, zipfile, importlib.util
spec=importlib.util.spec_from_file_location("book_asset_audit",pathlib.Path(__file__).with_name("audit-sbank.py"));audit_module=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit_module)
p=argparse.ArgumentParser(description=__doc__);p.add_argument('package',type=pathlib.Path);p.add_argument('--output',required=True,type=pathlib.Path);a=p.parse_args()
fingerprint=hashlib.file_digest(a.package.open('rb'),'sha256').hexdigest()
report={'unreferenced_assets':[]}
a.output.mkdir(parents=True,exist_ok=True);assets=a.output/'assets';assets.mkdir(exist_ok=True)
env={**os.environ,'MAGICK_MEMORY_LIMIT':'64MiB','MAGICK_MAP_LIMIT':'128MiB','MAGICK_DISK_LIMIT':'512MiB','MAGICK_THREAD_LIMIT':'1'}
duplicates={}
with zipfile.ZipFile(a.package)as z:
 assert z.testzip() is None,'ZIP CRC failure'
 manifest=json.loads(z.read('manifest.json'));raw=[json.loads(l)for l in z.read('questions.jsonl').splitlines()if l.strip()]
 paths={};digests={};topics=[];topicids={};records=[];review=[];composites=[]
 def save(data):
  h=hashlib.sha256(data).hexdigest();name='assets/'+h+'.png';target=a.output/name
  if not target.exists():target.write_bytes(data)
  digests[name]=h;return name
 def image(block):
  parts=block.get('assets')or([block['asset']]if block.get('asset')else[])
  if not parts:return None
  for part in parts:
   if part not in paths:paths[part]=save(z.read(part))
  if len(parts)==1:return paths[parts[0]]
  files=[a.output/paths[part]for part in parts]
  with tempfile.TemporaryDirectory()as temp:
   target=pathlib.Path(temp)/'joined.png'
   subprocess.run(['magick',*[str(f)for f in files],'-background','white','-gravity','northwest','-append','-strip',str(target)],check=True,env=env,capture_output=True)
   result=save(target.read_bytes())
   # Preserve exact segment pixels: no OCR, resize or guessed crop boundaries.
   y=0
   for f in files:
    dims=subprocess.check_output(['magick','identify','-format','%w %h',str(f)],env=env,text=True).split();w,h=map(int,dims)
    original=subprocess.check_output(['magick',str(f),'-alpha','on','-depth','8','rgba:-'],env=env)
    segment=subprocess.check_output(['magick',str(target),'-crop',f'{w}x{h}+0+{y}','+repage','-alpha','on','-depth','8','rgba:-'],env=env)
    assert original==segment,'Composite changed source pixels';y+=h
   composites.append({'asset':result,'original_segments':parts,'pixels_verified':True})
   return result
 for r in raw:
  key=tuple(r['topic_path'])
  if key not in topicids:
   tid='t'+str(len(topics));topicids[key]=tid;topics.append({'id':tid,'title':' / '.join(r['topic_path'])})
  q={'id':r['id'],'topic':topicids[key],'type':'mcq'if r['type']=='multiple_choice'else'open','text':r['stem'].get('text')or'','image':image(r['stem']),'domain':r['domain'],'skill':r['skill'],'difficulty':r['difficulty'],'reviewStatus':'approved','passage':r.get('passage')or'','explanation':'','explanationImage':image(r.get('explanation')or{}),'source':{'reference':a.package.name+'; source ID '+r['source_question_number'],'original':r},'sourceOrder':r['order']}
  if q['type']=='mcq':
   q['options']=[{'label':o['key'],'text':o.get('text')or'','image':image(o)}for o in r['options']];q['answer']='ABCD'.index(r['correct_answer'])if isinstance(r['correct_answer'],str)and r['correct_answer']in['A','B','C','D']else None
  else:q['acceptedAnswers']=r['correct_answer']
  if r.get('exception')or r.get('review_status')!='verified'or r['id']in duplicates:
   q['reviewStatus']='pending';q['reason']='duplicate_of:'+duplicates[r['id']]if r['id']in duplicates else '; '.join(r.get('review_notes',[]));review.append(q)
  else:records.append(q)
 # Preserve the exception's unseparated choice image, even though ordinary records omit it.
 for entry in z.infolist():
  if entry.filename.endswith('.png'):
   data=z.read(entry);w,h=audit_module.png_check(data)
   assert w<=12000 and h<=12000 and w*h<=8000000 and len(data)<=8*1048576,'Image outside existing limits'
   paths[entry.filename]=save(data)
 out={'format':'satchi-book-v1','book':{'id':manifest['book_id'],'title':manifest['title'],'description':manifest['description'],'section':manifest['subject'],'cover':paths.get(manifest.get('cover_asset'))},'rights':{'authorized':True,'owner':manifest.get('author','User-supplied author'),'license':'User-supplied books; user explicitly authorizes hosting on SAT’chi; independent republication license not asserted','provenance':manifest['rights'],'attestation':'User instructs import all seven named Desktop packages into the website, commit, push and deploy autonomously'},'topics':topics,'questionCount':len(records),'assetDigests':digests,'originalManifest':manifest,'archiveSha256':fingerprint,'bankSource':'satchi'}
 for name,value in [('manifest.json',out),('questions.json',records),('review.json',review),('asset-lineage.json',{'original_to_canonical':paths,'composites':composites})]:
  target=a.output/name;temp=target.with_suffix('.tmp');temp.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n');temp.replace(target)
 for extra in ['lessons.json','validation.json','review-report.csv']:
  if extra in z.namelist():(a.output/extra).write_bytes(z.read(extra))
 print(json.dumps({'package':a.package.name,'eligible_records':len(records),'review':len(review),'canonical_assets':len(digests),'composites':len(composites),'all_composite_pixels_verified':True}))
