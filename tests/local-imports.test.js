import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findSources, sourcePath, fingerprintFile, atomicJson, loadJson } from '../scripts/imports/source-files.js';
import { parseRulesToResults } from '../scripts/imports/parsers.js';

test('ingestion recursively stays in its root and rejects escaped symlinks', async()=>{
 const root=await mkdtemp(join(tmpdir(),'satchi-ingest-'));
 try {
  await mkdir(join(root,'nested'));await writeFile(join(root,'nested','source.PDF'),'same');await writeFile(join(root,'ignore.exe'),'not a book');
  await symlink('/tmp',join(root,'external'));
  assert.deepEqual((await findSources(root)).files,['nested/source.PDF']);
  assert.deepEqual((await findSources(root)).skipped,['external']);
  await assert.rejects(sourcePath(root,'../private.pdf'),/escapes/);
  await assert.rejects(sourcePath(root,'external'),/symlink/);
  assert.equal(await fingerprintFile(join(root,'nested/source.PDF')),await fingerprintFile(await sourcePath(root,'nested/source.PDF')));
  await atomicJson(join(root,'checkpoint.json'),{status:'imported'});
  assert.deepEqual(await loadJson(join(root,'checkpoint.json')), {status:'imported'});
 } finally {await rm(root,{recursive:true,force:true});}
});
const body=(n)=>`${n}\nJune 2024 US Form A\nA supplied sentence.\nWhich choice completes the text?\nA. one\nB. two\nC. three\nD. four`;
test('column-aware parser matches explicit keys, preserves numeric order, and quarantines graphics',()=>{
 const text='Rules-To-Results\nWith Answer Key\fPractice Questions\f\nAnswer Key\n1. B 2. C';
 const pages=[{columns:['',''],crossing:[]},{columns:[body(2),body(1)],crossing:[]},{columns:['Answer Key',''],crossing:[]}];
 const good=parseRulesToResults(text,pages,'Subject Verb Agreement.pdf');
 assert.deepEqual(good.errors,[]);assert.deepEqual(good.payload.topics[0].questions.map(q=>q.correctAnswer),[1,2]);
 assert.deepEqual(good.evidence.map(e=>e.number),[1,2]);
 const graphic=parseRulesToResults(text,pages,'Subject Verb Agreement.pdf',new Set([2]));
 assert.equal(graphic.review.length,2);assert.equal(graphic.payload.topics[0].questions.length,0);
 assert.equal(graphic.review[0].status,'NEEDS_REVIEW');
 const missing=parseRulesToResults(text.replace('1. B 2. C','2. C'),pages,'Subject Verb Agreement.pdf');
 assert.ok(missing.errors.some(e=>e.includes('numbering')));
});

test('exact source repeats skip safely, conflicting keys quarantine both, and evidence follows retained order',async()=>{
 const {deduplicateQuestions}=await import('../scripts/imports/deduplicate-questions.js');
 const q=n=>({question:`Question ${n}`,options:['one','two','three','four'],correctAnswer:1});const first=q(1),second=q(2);
 const topics=[{questions:[first,{...first},second,{...second,correctAnswer:2},q(3)]}];const result=deduplicateQuestions(topics,[0,1,2,3,4].map(question_index=>({question_index,page:question_index+1})));
 assert.equal(result.duplicates.length,1);assert.equal(result.review.length,2);assert.deepEqual(topics[0].questions.map(q=>q.question),['Question 1','Question 3']);assert.deepEqual(result.evidence,[{question_index:0,page:1},{question_index:1,page:5}]);
});
