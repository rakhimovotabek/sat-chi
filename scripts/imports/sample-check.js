import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { atomicJson, sourcePath, fingerprintFile } from './source-files.js';
const run=promisify(execFile),manifest=JSON.parse(await readFile('local-imports/manifest.json','utf8')),checks=[];
const remote=process.argv.includes('--remote');
if(remote && (await readFile('supabase/.temp/project-ref','utf8')).trim()!=='ileffhbbaomfimwulvpw')throw new Error('Unexpected Supabase project.');
let stored;
if(remote){
 const sql="select b.published,b.id book_id,q.question_text,q.passage,q.stimulus,q.options,q.image_url,q.stimulus_table,a.correct_answer,a.explanation from public.questions q join public.book_topics t on t.id=q.topic_id join public.books b on b.id=t.book_id join public.question_answers a on a.question_id=q.id where exists(select 1 from public.import_jobs j where j.book_id=b.id and j.status='imported');";
 const result=await run('npx',['--offline','supabase@2.119.0','db','query','--linked',sql,'--output','json'],{maxBuffer:10*1024*1024});
 stored=JSON.parse(result.stdout.slice(result.stdout.indexOf('{'))).rows;
}
const normalize=s=>s.normalize('NFKC').replace(/\s+/g,' ').trim();
const flatten=topics=>topics.flatMap(t=>[...(t.questions||[]),...flatten(t.children||[])]);
for(const report of manifest.filter(r=>['validated','imported'].includes(r.status))) {
 if(report.source_type!=='book')continue;
 const payload=JSON.parse(await readFile(`local-imports/${report.fingerprint}.json`,'utf8'));
 const sourceFile=await sourcePath(report.source_root,report.source_path);
 if(await fingerprintFile(sourceFile)!==report.fingerprint)throw new Error('Source changed before sample review.');
 const questions=flatten(payload.topics),text=(await run('pdftotext',['-layout',sourceFile,'-'],{maxBuffer:60*1024*1024})).stdout;
 const pages=text.split('\f');
 let columns;
 if(report.evidence.some(e=>e.question_index!==undefined)){
  const bbox=`local-imports/${report.fingerprint}.sample-bbox.html`;
  await run('pdftotext',['-bbox-layout',sourceFile,bbox]);
  columns=JSON.parse((await run('python3',['scripts/imports/pdf-columns.py',bbox],{maxBuffer:60*1024*1024})).stdout);
 }
 const samples=[...new Set([0,Math.floor(questions.length/2),questions.length-1])].map(index=>{
  const q=questions[index],evidence=report.evidence.find(e=>e.question_index===index);
  const source=evidence?columns[evidence.page-1].columns.map(normalize).join(' '):normalize(text);
  const found=[q.question,q.passage,...q.options].filter(Boolean).every(value=>source.includes(normalize(value)));
  // Grammar independently requires key/solution agreement in its adapter; the
  // column family checks the numbered source key again here.
  const matchedKey=!evidence || new RegExp(`\\b${evidence.number}\\.\\s*${String.fromCharCode(65+q.correctAnswer)}\\b`).test(text.slice(text.lastIndexOf('Answer Key')));
  const row=remote?stored.find(row=>row.question_text===q.question && row.passage===(q.passage||'') && JSON.stringify(row.options)===JSON.stringify(q.options) && row.stimulus===(q.stimulus||'') && (row.image_url||null)===(q.imageUrl||null) && JSON.stringify(row.stimulus_table||null)===JSON.stringify(q.table||null)):null;
  if(remote && (!row || row.correct_answer!==q.correctAnswer || normalize(row.explanation)!==normalize(q.explanation||'')))throw new Error(`Stored source sample mismatch: ${report.source_file}, index ${index} (found=${Boolean(row)}, key=${row?.correct_answer===q.correctAnswer}, explanation=${row?normalize(row.explanation)===normalize(q.explanation||''):false}, published=${row?.published}).`);
  if(!found||!matchedKey)throw new Error(`Source sample failed: ${report.source_file}, question index ${index}.`);
  return {index,number:evidence?.number??null,page:evidence?.page??pages.findIndex(p=>normalize(p).includes(normalize(q.passage.slice(0,90))))+1,text_and_choices_match:true,key_matches:true,database_verified:remote};
 });
 checks.push({source_file:report.source_file,fingerprint:report.fingerprint,samples,checked_at:new Date().toISOString()});
 console.log(`${report.source_file}: ${samples.length} source samples passed.`);
}
await atomicJson('local-imports/sample-checks.json',checks);
