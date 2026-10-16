"""Restore a private backup on a socket-only PG17 and rehearse this release.
No hosted connections or app HTTP server. Never prints restored student data.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time

p=argparse.ArgumentParser()
p.add_argument('--backup',required=True)
p.add_argument('--pg-bin',required=True)
a=p.parse_args()
repo=Path(__file__).resolve().parents[2]
folder=Path(a.backup).resolve()
bin=Path(a.pg_bin).resolve()
if folder==repo or repo in folder.parents:raise SystemExit('Private backup must be outside checkout')
os.umask(0o077)
manifest=json.loads((folder/'export-manifest.json').read_text())
assert manifest['project']=='ileffhbbaomfimwulvpw'
for name,digest in manifest['sha256'].items():assert hashlib.sha256((folder/name).read_bytes()).hexdigest()==digest,'Backup checksum failed'
work=folder/'rehearsal';work.mkdir(mode=0o700)
data=work/'data'
env={**os.environ,'LD_LIBRARY_PATH':str(bin.parent/'lib'),'PGTZ':'UTC','PGHOST':str(work),'PGPORT':'55469','PGDATABASE':'postgres','PGCONNECT_TIMEOUT':'5'}
for key in ['PGPASSWORD','PGUSER','PGOPTIONS']:env.pop(key,None)
def command(args,timeout=300):
 r=subprocess.run(args,env=env,capture_output=True,text=True,timeout=timeout)
 if r.returncode:
  (work/'failure.private.log').write_text(r.stderr)
  raise RuntimeError('Rehearsal command failed; private diagnostic: '+str(work/'failure.private.log'))
 return r.stdout.strip()
def sql(q):return command([str(bin/'psql'),'-X','-At','-v','ON_ERROR_STOP=1','-c',q])
def js(q):return json.loads(sql(q).split('\n')[-1])
command([str(bin/'initdb'),'-D',str(data),'--no-locale','--encoding=UTF8','--auth=trust'])
command([str(bin/'pg_ctl'),'-D',str(data),'-l',str(work/'postgres.private.log'),'-o',f"-k {work} -h '' -p 55469 -F -c max_connections=12",'start'])
started=True
try:
 assert sql('show server_version').startswith('17.')
 for name in re.findall(r'^CREATE ROLE ([a-zA-Z_][a-zA-Z0-9_]*);$',(folder/'roles.sql').read_text(),re.M):
  sql(f"do $$begin if not exists(select 1 from pg_roles where rolname='{name}')then create role \"{name}\" nologin;end if;end$$")
 sql('drop schema public;create schema extensions;create extension "uuid-ossp" with schema extensions;create extension pgcrypto with schema extensions;create extension ltree with schema extensions;')
 command([str(bin/'pg_restore'),'--no-owner','--exit-on-error','-d','postgres',str(folder/'application.dump')])
 (folder/'storage-inventory.private.json').write_text(sql("select coalesce(jsonb_agg(jsonb_build_object('bucket_id',bucket_id,'name',name,'metadata',metadata)order by bucket_id,name),'[]')from storage.objects"))
 tables=js("select json_agg(tablename order by tablename)from pg_tables where schemaname='public'")
 def digest(schema,table,omit='__unused__'):
  return js(f'''select json_build_object('rows',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to((to_jsonb(r)-'{omit}')::text,'UTF8')),'hex'),'' order by encode(sha256(convert_to((to_jsonb(r)-'{omit}')::text,'UTF8')),'hex')),''),'UTF8')),'hex'))from {schema}."{table}" r''')
 omit={'profiles':'exam_timezone','book_practice_sessions':'whole_book'}
 protected={t:digest('public',t,omit.get(t,'__unused__'))for t in tables if t!='learning_standing_totals'}
 storage=digest('storage','objects')
 auth=digest('auth','users')
 versions=js("select coalesce(json_agg(version),'[]')from supabase_migrations.schema_migrations")
 files=sorted((repo/'supabase/migrations').glob('20261015*.sql'))
 assert len(files)==8 and all(f.name.split('_')[0]not in versions for f in files),'Expected exactly eight pending migrations'
 applied=[]
 for file in files:
  start=time.monotonic();sql(file.read_text());applied.append({'file':file.name,'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'seconds':round(time.monotonic()-start,3)})
  print('Rehearsed',file.name,flush=True)
 # The final historical reconstruction can change canonical facts after the
 # initial cache backfill. Reconcile derived standings after all migrations.
 sql("do $$declare uid uuid;begin for uid in select id from public.profiles where role='student'loop perform public.refresh_learning_standing(uid);end loop;end$$")
 for table,before in protected.items():assert digest('public',table,omit.get(table,'__unused__'))==before,'Protected records changed: '+table
 assert digest('storage','objects')==storage,'Storage metadata changed'
 assert digest('auth','users')==auth,'Auth users changed'
 (folder/'application-integrity-baseline.private.json').write_text(json.dumps(protected,indent=2))
 uid=sql("select p.id from public.profiles p left join public.book_practice_sessions s on s.student_id=p.id where p.role='student'and p.active group by p.id order by count(s.id)desc limit 1")
 admin=sql("select id from public.profiles where role='admin'and active order by id limit 1")
 assert re.fullmatch('[a-f0-9-]{36}',uid)and re.fullmatch('[a-f0-9-]{36}',admin)
 books=js("select json_agg(id)from(select id from public.books where published order by id limit 15)b")
 def probe(label,statement,actor=uid):
  start=time.monotonic()
  result=sql(f"begin;set local statement_timeout='8s';set local role authenticated;select set_config('request.jwt.claim.sub','{actor}',true);{statement};rollback;")
  elapsed=round(time.monotonic()-start,3)
  print('Verified',label,'in',elapsed,'seconds',flush=True)
  return {'name':label,'seconds':elapsed}
 probes=[probe('learning metrics','select public.learning_metrics()'),probe('practice analytics','select public.practice_analytics()'),probe('book catalog progress',"select public.learning_book_progress(array["+','.join("'"+b+"'::uuid"for b in books)+"])"),probe('bank facets',"select public.question_bank_facets('{}')"),probe('admin student books',f"select public.admin_student_books('{uid}')",admin)]
 largest=sql("select t.book_id from public.questions q join public.book_topics t on t.id=q.topic_id join public.books b on b.id=t.book_id where b.published group by t.book_id order by count(*)desc limit 1")
 probes.append(probe('largest entire-book snapshot',f"select public.start_entire_book_practice('{largest}')"))
 permissions=js("select json_build_object('anon_metrics',has_function_privilege('anon','public.learning_metrics(uuid)','EXECUTE'),'student_private_facts',has_function_privilege('authenticated','public.learning_question_facts(uuid,text)','EXECUTE'),'student_grade_write',has_table_privilege('authenticated','public.practice_grade_events','INSERT'))")
 assert not any(permissions.values()),'Private history privilege failure'
 result={'restored':True,'postgres':sql('show server_version'),'migrations':applied,'protected_tables':len(protected),'existing_records_unchanged':True,'auth_users_unchanged':True,'storage_unchanged':True,'standings_reconciled_after_all_migrations':True,'probes':probes,'private_permissions':permissions}
 (folder/'platform-restoration-verification.json').write_text(json.dumps(result,indent=2))
 print('Backup restoration, eight migrations, existing-data integrity and production-size query checks passed.',flush=True)
finally:
 if started:command([str(bin/'pg_ctl'),'-D',str(data),'-m','fast','stop'])
