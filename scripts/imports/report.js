import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { atomicJson } from './source-files.js';
if ((await readFile('supabase/.temp/project-ref','utf8')).trim() !== 'ileffhbbaomfimwulvpw') throw new Error('Unexpected project');
const sql=`select j.source_file,j.fingerprint,j.status,j.imported_count,j.skipped_count,j.category,j.source_type,b.published,
(select count(*) from public.questions q join public.book_topics t on t.id=q.topic_id where t.book_id=j.book_id) actual_questions,
(select count(*) from public.vocabulary_sets s where s.book_id=j.vocabulary_book_id) actual_sets,
(select count(*) from public.vocabulary_words w join public.vocabulary_sets s on s.id=w.set_id where s.book_id=j.vocabulary_book_id) actual_words,
(select count(*) from public.vocabulary_passages p join public.vocabulary_sets s on s.id=p.set_id where s.book_id=j.vocabulary_book_id) actual_passages,
(select count(*) from public.vocabulary_questions q join public.vocabulary_sets s on s.id=q.set_id where s.book_id=j.vocabulary_book_id) actual_exercises
from public.import_jobs j left join public.books b on b.id=j.book_id order by j.source_file`;
const {stdout}=await promisify(execFile)('npx',['--offline','supabase@2.119.0','db','query','--linked',sql,'--output','json'],{maxBuffer:4*1024*1024});
const rows=JSON.parse(stdout.slice(stdout.indexOf('{'))).rows;
await atomicJson('local-imports/remote-audit.json',{checked_at:new Date().toISOString(),rows});
const manifest=JSON.parse(await readFile('local-imports/manifest.json','utf8'));
const cell=v=>String(v??'').replaceAll('|',' / ').replace(/\s+/g,' ').trim();
let report=`# Local book import report\n\nAudited ${new Date().toISOString()}. Source scope: \`~/Desktop/Books\` only. Project: \`ileffhbbaomfimwulvpw\`.\n\nCompleted checkpoints were resumed, not restarted. Counts below are actual remote counts; candidate counts in parentheses are extraction heuristics, not verified inventories. Extracted material is private in ignored \`local-imports/\`. Newly imported content stays draft. Existing admin publication decisions are preserved.\n\n| Source | Classification | Status | Topics | Questions (candidates) | Sets / words / passages / exercises | Duplicates | Review / warnings / errors |\n| --- | --- | --- | ---: | ---: | --- | --- | --- |\n`;
for(const r of manifest){const db=rows.find(x=>x.fingerprint===r.fingerprint);if(!db)throw new Error(`Missing remote checkpoint: ${r.source_file}`);
if(r.source_type==='book'&&db.status==='imported'&&db.actual_questions!==db.imported_count)throw new Error(`Question count mismatch: ${r.source_file}`);
const classification=/vocab/i.test(r.source_file)?'Vocabulary':/math/i.test(r.source_file)?'SAT Math':/reading|central ideas|dual texts/i.test(r.source_file)?'SAT Reading & Writing':/grammar|apostrophe|verbs|modifiers|pronoun|punctuation|agreement|tense/i.test(r.source_file)?'Grammar':/writing|transition/i.test(r.source_file)?'SAT Reading & Writing':'Mixed SAT / review';
for(const filename of [r.source_path,...(r.aliases||[])]) report+=`| ${cell(filename)} | ${classification} | ${db.status}${db.published?' (admin published)':''} | ${r.detected_topics} | ${db.actual_questions} (${r.detected_questions}) | ${db.actual_sets} / ${db.actual_words} / ${db.actual_passages} / ${db.actual_exercises} | ${filename===r.source_path?'No duplicate source import':'Identical source alias; skipped'} | ${cell([`${r.needs_review_count} questions excluded/review`,...r.warnings,...r.errors].join('; '))} |\n`;
}
report+='\n## Review requirements\n\nAll source-derived vocabulary and newly imported questions require admin review before publication. Unknown answer mapping, essential images and unresolved source structures remain NEEDS_REVIEW. No answer keys are inferred. Zero candidates means the heuristic found none, not that the book contains no questions. Source evidence and exclusions are visible to admins in Import status.\n';
await writeFile('docs/book-import-report.md',report);
console.log(`Audited ${rows.length} remote jobs; ${rows.reduce((n,r)=>n+r.actual_questions,0)} questions, ${rows.reduce((n,r)=>n+r.actual_words,0)} words.`);
