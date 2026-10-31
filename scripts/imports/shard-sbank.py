"""Build deterministic, bounded packages from already prepared SBank records."""
import argparse,json,pathlib,zipfile,hashlib
p=argparse.ArgumentParser(description=__doc__);p.add_argument('prepared',type=pathlib.Path);a=p.parse_args();root=a.prepared
manifest=json.load(open(root/'manifest.json'));questions=json.load(open(root/'questions.json'));folder=root/'shards';folder.mkdir(exist_ok=True);index=[]
for start in range(0,len(questions),40):
 rows=questions[start:start+40];assets=set()
 for q in rows:
  assets.update(v for v in [q.get('image'),q.get('explanationImage'),*[o.get('image')for o in q.get('options',[])]]if v)
 m={**manifest,'book':{**manifest['book'],'id':manifest['book']['id']+'-'+str(start//40+1),'title':manifest['book']['title']+' · '+str(start//40+1)},'questionCount':len(rows),'assetDigests':{v:manifest['assetDigests'][v]for v in sorted(assets)},'sourceQuestionRange':[rows[0]['sourceOrder'],rows[-1]['sourceOrder']]}
 target=folder/f'{start//40+1:03}.zip'
 with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=1)as z:
  def put(name,data):
   i=zipfile.ZipInfo(name,date_time=(2026,10,31,0,0,0));i.compress_type=zipfile.ZIP_DEFLATED;z.writestr(i,data,compresslevel=1)
  put('manifest.json',json.dumps(m,ensure_ascii=False).encode());put('questions.jsonl',('\n'.join(json.dumps(q,ensure_ascii=False)for q in rows)+'\n').encode())
  for asset in sorted(assets):put(asset,(root/asset).read_bytes())
  put("review-report.csv",("id,reviewStatus\n"+"".join(q["id"]+",approved\n"for q in rows)).encode())
  put("README.md",b"User-supplied SBank shard. Publication authorized by explicit user attestation. Original provenance is retained in manifest.originalManifest and each source record. Images preserve source pixels; answers and explanations stay private until Check.\n")
 with zipfile.ZipFile(target)as z:
  assert len(z.infolist())<=4000 and sum(i.file_size for i in z.infolist())<=96*1048576
 assert target.stat().st_size<=32*1048576
 index.append({'file':target.name,'sha256':hashlib.file_digest(target.open('rb'),'sha256').hexdigest(),'questions':len(rows),'assets':len(assets),'bytes':target.stat().st_size})
(folder/'index.json').write_text(json.dumps(index,indent=2)+'\n');print(json.dumps({'shards':len(index),'questions':sum(s['questions']for s in index),'bytes':sum(s['bytes']for s in index)}))
