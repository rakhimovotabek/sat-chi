// This adapter deliberately recognizes the inspected fourth-edition structure only.
const clean = text => text.normalize('NFKC').replace(/[\u200b-\u200d]/g,'').trim();
export function parseVocabook(extracted, sourceFile) {
  const errors=[],review=[],keys=new Map(); let collection='College Panda 400 Words', columns=[];
  for(const page of extracted.answer_pages) for(const line of page.split('\n')) {
    if(/SATashkent Words/.test(line)) collection='SATashkent Words';
    if(/SET\s+\d+/.test(line)) columns=[...line.matchAll(/SET\s+(\d+)/g)].map(m=>Number(m[1]));
    const row=line.trim().match(/^(\d+)\s+([ABCD](?:\s+[ABCD])*)$/);
    if(!row)continue;
    const answers=row[2].trim().split(/\s+/);
    if(answers.length!==columns.length){errors.push('Answer-table column mismatch');continue;}
    answers.forEach((answer,i)=>{const key=`${collection}:${columns[i]}:${row[1]}`; if(keys.has(key))errors.push('Duplicate answer-table cell');keys.set(key,answer.charCodeAt(0)-65);});
  }
  const sets=extracted.sets.map(set=>{
    if(set.words.length!==25)errors.push(`${set.title}: expected the supplied 25-word boundary, got ${set.words.length}`);
    const text=set.pages.map(p=>clean(p.text).replace(/^\s*@satashkent[^\n]*$/gm,'')).join('\n');
    const reading=text.indexOf('Reading Time'),fighting=text.search(/Fight(?:ing)? Time/);
    if(reading<0||fighting<reading)errors.push(`${set.title}: reading/quiz boundary missing`);
    // Remove standalone superscript references and layout indentation; preserve source sentences.
    const passage=text.slice(reading+12,fighting).split('\n').filter(l=>!/^\s*[\d\s]+\s*$/.test(l)).map(l=>l.trim()).join('\n').trim();
    const quiz=text.slice(fighting).replace(/^Fight(?:ing)? Time/,''),matches=[...quiz.matchAll(/^\s*(\d+)\.\s*/gm)], questions=[];
    if(matches.length!==10)errors.push(`${set.title}: expected 10 source exercises, got ${matches.length}`);
    matches.forEach((m,i)=>{
      const block=quiz.slice(m.index+m[0].length,matches[i+1]?.index??quiz.length).trim();
      const opts=[...block.matchAll(/^\s*([ABCD])\.\s*/gm)];
      const answer=keys.get(`${set.collection}:${set.source_set}:${m[1]}`);
      if(opts.length!==4||opts.some((o,j)=>!block.slice(o.index+o[0].length,opts[j+1]?.index??block.length).trim())||opts.map(o=>o[1]).join('')!=='ABCD'||answer===undefined){review.push({set:set.title,number:Number(m[1]),status:'NEEDS_REVIEW',reason:'Incomplete options or explicit answer-table mapping'});return;}
      const page=set.pages.find(p=>clean(p.text).includes(clean(block.slice(0,60))));
      questions.push({question:block.slice(0,opts[0].index).replace(/\s+/g,' ').trim(),options:opts.map((o,j)=>block.slice(o.index+o[0].length,opts[j+1]?.index??block.length).replace(/\s+/g,' ').trim()),correctAnswer:answer,questionType:'sentence_completion',sourcePage:page?.page,source:sourceFile,explanation:''});
    });
    return {title:set.title,source_page:set.source_page,source_set:set.source_set,collection:set.collection,words:set.words,passage,questions};
  });
  if(sets.length!==56)errors.push(`Expected 16 + 40 sets in inspected fourth edition, got ${sets.length}`);
  return {payload:{title:'Vocabook 4.0 by SATashkent',source:sourceFile,published:false,sets},errors,review};
}
