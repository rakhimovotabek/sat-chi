"""Prepare Desktop SBank records and lossless assets locally; never contacts production."""
import argparse, hashlib, json, os, pathlib, subprocess, tempfile, zipfile
p=argparse.ArgumentParser(description=__doc__);p.add_argument('package',type=pathlib.Path);p.add_argument('--output',required=True,type=pathlib.Path);p.add_argument('--audit',default='docs/verification/sbank-desktop-audit.json');a=p.parse_args()
report=next(r for r in json.load(open(a.audit))['packages']if r['file']==a.package.name)
fingerprint=hashlib.file_digest(a.package.open('rb'),'sha256').hexdigest();assert fingerprint==report['sha256']
assert not any(report[k]for k in ['missing_assets','png_errors','asset_role_mapping_issues','duplicate_question_ids','unsafe_paths','duplicate_zip_entries'])
a.output.mkdir(parents=True,exist_ok=True);assets=a.output/'assets';assets.mkdir(exist_ok=True)
env={**os.environ,'MAGICK_MEMORY_LIMIT':'64MiB','MAGICK_MAP_LIMIT':'128MiB','MAGICK_DISK_LIMIT':'512MiB','MAGICK_THREAD_LIMIT':'1'}
duplicates={rid:group[0]for group in report['duplicate_content_groups']for rid in group[1:]}
with zipfile.ZipFile(a.package)as z:
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
  key=(r['domain'],r['skill'])
  if key not in topicids:
   tid='t'+str(len(topics));topicids[key]=tid;topics.append({'id':tid,'title':r['skill']})
  q={'id':r['id'],'topic':topicids[key],'type':'mcq'if r['type']=='multiple_choice'else'open','text':r['stem'].get('text')or'','image':image(r['stem']),'domain':r['domain'],'skill':r['skill'],'difficulty':r['difficulty'],'reviewStatus':'approved','passage':r.get('passage')or'','explanation':'','explanationImage':image(r.get('explanation')or{}),'source':{'reference':a.package.name+'; source ID '+r['source_question_number'],'original':r},'sourceOrder':r['order']}
  if q['type']=='mcq':
   q['options']=[{'label':o['key'],'text':o.get('text')or'','image':image(o)}for o in r['options']];q['answer']='ABCD'.index(r['correct_answer'])if r['correct_answer']in['A','B','C','D']else None
  else:q['acceptedAnswers']=r['correct_answer']
  if r.get('exception')or r['id']in duplicates:
   q['reviewStatus']='pending';q['reason']='duplicate_of:'+duplicates[r['id']]if r['id']in duplicates else '; '.join(r.get('review_notes',[]));review.append(q)
  else:records.append(q)
 # Preserve the exception's unseparated choice image, even though ordinary records omit it.
 for path in report['unreferenced_assets']:paths[path]=save(z.read(path))
 out={'format':'satchi-book-v1','book':{'id':manifest['book_id'],'title':'SBank — '+manifest['subject'],'section':manifest['subject']},'rights':{'authorized':True,'owner':'Creator identity not independently established; supplied by user via Telegram seller','license':'User explicitly attests the packages are copyright-free and authorizes SAT’chi publication','provenance':manifest['rights'],'attestation':'User: This is completely copyright free, just do what i say'},'topics':topics,'questionCount':len(records),'assetDigests':digests,'originalManifest':manifest,'archiveSha256':fingerprint,'bankSource':'sbank'}
 for name,value in [('manifest.json',out),('questions.json',records),('review.json',review),('asset-lineage.json',{'original_to_canonical':paths,'composites':composites})]:
  target=a.output/name;temp=target.with_suffix('.tmp');temp.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n');temp.replace(target)
 print(json.dumps({'package':a.package.name,'eligible_records':len(records),'review':len(review),'canonical_assets':len(digests),'composites':len(composites),'all_composite_pixels_verified':True}))
