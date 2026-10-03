import { readFile, writeFile, mkdir, realpath, open, unlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { basename, extname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { deduplicateQuestions } from './deduplicate-questions.js';
import { parseVocabook } from './vocabook.js';
import { parseGrammar, parseRulesToResults, inspectText } from './parsers.js';
import { validateImport } from '../../src/features/books/import-validation.js';
import { validateVocabulary } from '../../src/features/learning/vocabulary-validation.js';
import { PARSER_VERSION, classifySource, findSources, fingerprintFile, sourcePath, atomicJson, loadJson } from './source-files.js';
const run=promisify(execFile), output=resolve('local-imports');
const root=await realpath(join(homedir(),'Desktop','Books'));
const requested=process.argv.find(a=>a.startsWith('--source='))?.slice(9);
await mkdir(output,{recursive:true});
const lock=join(output,'inspection.lock');
try { await open(lock,'wx',0o600).then(async f=>{ await f.writeFile(String(process.pid)); await f.close(); }); }
catch(error) {
  if(error.code!=='EEXIST') throw error;
  const pid=Number(await readFile(lock,'utf8'));
  try { process.kill(pid,0); throw new Error('An inspection is already running.'); }
  catch(e) { if(e.code!=='ESRCH') throw e; await unlink(lock); }
  await writeFile(lock,String(process.pid),{flag:'wx',mode:0o600});
}
try {
 const previous=await loadJson(join(output,'manifest.json'),[]), reports=[];
 const {files,skipped}=await findSources(root);
 if(requested&&!files.some(f=>f===requested||basename(f)===requested))throw new Error('Requested source is not in Desktop/Books.');
 if(!files.length) throw new Error('No supported files in Desktop/Books; existing reports preserved.');
 await atomicJson(join(output,'scan.json'),{root,files,skipped_symlinks:skipped,parser_version:PARSER_VERSION});
 const seen=new Map();
 for(const relative of files) {
  const file=await sourcePath(root,relative), fingerprint=await fingerprintFile(file);
  if(seen.has(fingerprint)) { const report=seen.get(fingerprint); report.aliases.push(relative); await atomicJson(join(output,`${fingerprint}.report.json`),report); await atomicJson(join(output,'manifest.json'),reports); continue; }
  const cached=previous.find(r=>r.fingerprint===fingerprint) || await loadJson(join(output,`${fingerprint}.report.json`),null);
  const version=/vocab/i.test(relative)?'2026-10-04.vocab1':PARSER_VERSION;
  const prior=cached?.parser_version===version?cached:null;
  if(prior && ['validated','imported','review'].includes(prior.status) && !(process.argv.includes('--reprocess')&&(!requested||relative===requested||basename(relative)===requested))) {
    let reusable=true;
    if(prior.intermediate_file) {
      try { reusable=(await fingerprintFile(join(output,prior.intermediate_file)))===prior.intermediate_hash; } catch { reusable=false; }
    }
    if(reusable) {
      const report={...prior,category:prior.category==='Other'?classifySource(relative):prior.category,source_path:relative,aliases:[]}; reports.push(report); seen.set(fingerprint,report);
      await atomicJson(join(output,'manifest.json'),reports); console.log(`Resume: ${relative} (${report.status})`); continue;
    }
  }
  const report={source_root:root,source_path:relative,source_file:basename(file),fingerprint,parser_version:version,
    title:basename(file,extname(file)),source_type:'book',category:classifySource(basename(file)),status:'review',detected_topics:0,detected_questions:0,
    detected_vocabulary_sets:0,imported_count:0,skipped_count:0,needs_review_count:0,warnings:[],errors:[],aliases:[],evidence:[],review_items:[]};
  try {
    let text,payload,columns,imagePages=new Set();
    const extension=extname(file).toLowerCase();
    if(extension==='.pdf') {
      try {text=await readFile(join(output,`${fingerprint}.extracted.txt`),'utf8');} catch(error) {if(error.code!=='ENOENT')throw error;text=(await run('pdftotext',['-layout',file,'-'],{maxBuffer:60*1024*1024})).stdout;}
      const images=(await run('pdfimages',['-list',file],{maxBuffer:4*1024*1024})).stdout;
      imagePages=new Set([...images.matchAll(/^\s*(\d+)\s+\d+\s+(?:image|mask|smask)\b/gm)].map(m=>Number(m[1])));
      report.asset_pages=[...imagePages];
      if(/Rules-To-Results/i.test(text)) {
        const bbox=join(output,`${fingerprint}.bbox.html`);
        await run('pdftotext',['-bbox-layout',file,bbox],{maxBuffer:1024*1024});
        columns=JSON.parse((await run('python3',['scripts/imports/pdf-columns.py',bbox],{maxBuffer:60*1024*1024})).stdout);
      }
    } else if(extension==='.txt') text=await readFile(file,'utf8');
    else if(extension==='.json') payload=JSON.parse(await readFile(file,'utf8'));
    else {
      const archive=JSON.parse((await run('python3',['scripts/imports/extract-archive.py',file],{maxBuffer:60*1024*1024})).stdout);
      text=archive.text; report.title=archive.title||report.title; report.asset_references=archive.assets; report.has_tables=archive.tables;
    }
    if(text) {
      await writeFile(join(output,`${fingerprint}.extracted.txt`),text,{mode:0o600});
      const inspection=inspectText(text);
      report.detected_topics=inspection.topics.length; report.detected_questions=inspection.detectedQuestions;
      report.detected_vocabulary_sets=[...text.matchAll(/^\s*Set\s+\d+\s*$/gm)].length;
      if(/vocab/i.test(report.title)||/Word\s+Definition\s+Example/i.test(text)) {report.source_type='vocabulary';report.category='Vocabulary';}
      if(inspection.sparse) report.warnings.push('Sparse or image-based pages require OCR and visual review.');
      if(report.source_type==='vocabulary' && /Vocabook/i.test(report.title) && /FOURTH EDITION/i.test(text)) {
        const bbox=join(output,`${fingerprint}.vocab-bbox.html`);
        await run('pdftotext',['-bbox-layout',file,bbox],{maxBuffer:1024*1024});
        const extracted=JSON.parse((await run('python3',['scripts/imports/vocab-tables.py',bbox,file,join(output,`${fingerprint}.extracted.txt`)],{maxBuffer:60*1024*1024})).stdout);
        const parsed=parseVocabook(extracted,report.source_file);payload=parsed.payload;report.errors.push(...parsed.errors);report.review_items=parsed.review;
        report.evidence=payload.sets.map(s=>({set:s.title,page:s.source_page,words:s.words.length,questions:s.questions.length}));
      } else if(/^Ultimate Grammar Book\.pdf$/i.test(basename(file))) {
        const parsed=parseGrammar(text,report.source_file); payload=parsed.payload; report.errors.push(...parsed.errors);
        const practice=text.indexOf('\nPractice Section');
        for(const m of text.slice(practice).matchAll(/^\s*(\d+)\s+([A-Z][A-Z &—,.-]+)\s*$/gm)) {
          const page=text.slice(0,practice+m.index+m[0].indexOf(m[1])).split('\f').length;
          report.evidence.push({number:Number(m[1]),page,skill:m[2].trim()});
          if(imagePages.has(page)) report.errors.push(`Question ${m[1]} page ${page}: image must be preserved before import.`);
        }
      } else if(columns) {
        const parsed=parseRulesToResults(text,columns,report.source_file,imagePages);
        if(parsed) {payload=parsed.payload;report.errors.push(...parsed.errors);report.review_items=parsed.review;report.evidence=parsed.evidence;report.detected_questions=parsed.detected_questions||report.detected_questions;}
      }
      if(!payload) report.warnings.push('NEEDS_REVIEW: no reliable adapter matched the complete question/key or vocabulary cell structure. No raw text imported.');
    }
    if(payload) {
      report.source_type=Array.isArray(payload.sets)?'vocabulary':'book';
      if(report.source_type==='vocabulary') {
        payload.published=false; report.title=payload.title; report.category='Vocabulary';
        report.detected_vocabulary_sets=payload.sets.length;report.detected_topics=payload.sets.length;
        report.detected_words=payload.sets.reduce((n,s)=>n+(s.words?.length||0),0);
        report.detected_questions=payload.sets.reduce((n,s)=>n+(s.questions?.length||0),0)+report.review_items.length;
        report.errors.push(...validateVocabulary(payload));
      } else {
        payload.book.published=false; report.title=payload.book.title; report.category=payload.book.category||'Other';
        const validation=validateImport(payload);report.errors.push(...validation.errors);report.detected_topics=validation.topics;
        report.detected_questions=report.review_items.length?validation.questions+report.review_items.length:validation.questions;
        const dedup=deduplicateQuestions(payload.topics,report.evidence);
        report.evidence=dedup.evidence;report.review_items.push(...dedup.review);
        if(dedup.duplicates.length)report.warnings.push(`${dedup.duplicates.length} exact source repeats skipped with matching printed keys.`);
      }
      if(!report.errors.length) {
        report.status='validated';report.intermediate_file=`${fingerprint}.json`;
        await atomicJson(join(output,report.intermediate_file),payload);
        report.intermediate_hash=await fingerprintFile(join(output,report.intermediate_file));
      }
    }
    report.needs_review_count=report.status==='review'?report.detected_questions:report.review_items.length;
    report.skipped_count=report.status==='review'?report.detected_questions:report.needs_review_count;
    if(report.review_items.length) report.warnings.push(`${report.review_items.length} source questions marked NEEDS_REVIEW; excluded from import.`);
  } catch(error) {report.errors.push(error.message); report.status='review'; report.needs_review_count=Math.max(report.detected_questions,1);}
  reports.push(report);seen.set(fingerprint,report);
  await atomicJson(join(output,`${fingerprint}.report.json`),report);
  await atomicJson(join(output,'manifest.json'),reports);
  console.log(`${relative}: ${report.status}; ${report.detected_questions} candidate questions; ${report.needs_review_count} need review`);
 }
 console.log(`Checkpointed ${reports.length} unique sources under ${root}.`);
} finally {await unlink(lock);}
