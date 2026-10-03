import {readFile,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {sourcePath,fingerprintFile,atomicJson} from './source-files.js';
if((await readFile('supabase/.temp/project-ref','utf8')).trim()!=='ileffhbbaomfimwulvpw')throw new Error('Unexpected project');
const run=promisify(execFile),manifest=JSON.parse(await readFile('local-imports/manifest.json','utf8'));
for(const r of manifest.filter(r=>r.source_type==='vocabulary'&&r.status==='imported')){
 const payload=JSON.parse(await readFile(`local-imports/${r.intermediate_file}`,'utf8'));
 const source=await sourcePath(r.source_root,r.source_path);if(await fingerprintFile(source)!==r.fingerprint)throw new Error('Changed source');
 const sql=`select jsonb_build_object('published',b.published,'sets',(select jsonb_agg(jsonb_build_object('title',s.title,'words',(select jsonb_agg(jsonb_build_object('word',w.word,'definition',w.definition,'example',w.example,'synonym',w.synonym,'antonym',w.antonym,'source_page',w.source_page) order by w.position) from public.vocabulary_words w where w.set_id=s.id),'passage',(select passage from public.vocabulary_passages p where p.set_id=s.id limit 1),'questions',(select jsonb_agg(q.payload order by q.id) from public.vocabulary_questions q where q.set_id=s.id)) order by s.position) from public.vocabulary_sets s where s.book_id=b.id)) result from public.vocabulary_books b where id='${r.vocabulary_book_id}'`;
 const file=`local-imports/${r.fingerprint}.audit.sql`;await writeFile(file,sql,{mode:0o600});
 const {stdout}=await run('npx',['--offline','supabase@2.119.0','db','query','--linked','--file',file,'--output','json'],{maxBuffer:10*1024*1024});
 const db=JSON.parse(stdout.slice(stdout.indexOf('{'))).rows[0].result;
 if(db.published||db.sets.length!==payload.sets.length)throw new Error('Unexpected publication/set count');
 let count=0;
 for(let i=0;i<payload.sets.length;i++){
  const set=payload.sets[i],stored=db.sets[i];if(stored.title!==set.title||stored.words.length!==set.words.length||stored.passage!==set.passage)throw new Error('Set/passage mismatch');
  for(let j=0;j<set.words.length;j++){for(const field of ['word','definition','example','synonym','antonym','source_page'])if((set.words[j][field]??'')!==(stored.words[j][field]??''))throw new Error(`Cell mismatch ${i}/${j}/${field}`);count++;}
  const questions=stored.questions||[];if(questions.length!==set.questions.length||set.questions.some(q=>!questions.some(s=>JSON.stringify(s.options)===JSON.stringify(q.options)&&s.question===q.question&&s.correctAnswer===q.correctAnswer&&s.sourcePage===q.sourcePage)))throw new Error('Exercise/key mismatch');
 }
 // Independent raw extraction confirms sampled word/definition terms really exist.
 const raw=(await run('pdftotext',['-raw',source,'-'],{maxBuffer:60*1024*1024})).stdout.normalize('NFKC').replace(/\s+/g,' ');
 for(const index of [0,Math.floor(payload.sets.length/2),payload.sets.length-1])for(const word of payload.sets[index].words.filter((_,j)=>[0,12,24].includes(j))){if(!raw.includes(word.word)||!raw.includes(word.definition))throw new Error('Independent source sample mismatch');}
 await atomicJson('local-imports/vocabulary-audit.json',{source_file:r.source_file,sets:db.sets.length,words:count,passages:db.sets.length,exercises:db.sets.reduce((n,s)=>n+(s.questions||[]).length,0),all_remote_cells_verified:true,independent_raw_samples:9,published:false,checked_at:new Date().toISOString()});
 console.log(`Vocabulary audit: ${db.sets.length} sets, ${count} words; all remote cells/passages/keys match, 9 independent source samples passed.`);
}
