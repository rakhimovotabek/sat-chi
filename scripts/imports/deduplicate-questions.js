// Preserve order, skip exact repeats, and quarantine conflicting printed keys.
export function deduplicateQuestions(topics, evidence = []) {
  const flat=[];const collect=rows=>{for(const topic of rows){flat.push(...(topic.questions||[]));collect(topic.children||[]);}};collect(topics);
  const seen=new Map(),excluded=new Set(),duplicates=[],review=[];
  flat.forEach((q,index)=>{const signature=JSON.stringify([q.question,q.passage||'',q.stimulus||'',q.options,q.imageUrl||null,q.table||null]);const prior=seen.get(signature);if(prior!==undefined){
    if(q.correctAnswer===flat[prior].correctAnswer){excluded.add(index);duplicates.push({question_index:index,duplicate_of:prior});}
    else {excluded.add(index);excluded.add(prior);for(const n of [prior,index])if(!review.some(r=>r.question_index===n))review.push({question_index:n,status:'NEEDS_REVIEW',reasons:['Identical question/options have conflicting printed answers.']});}
  }else seen.set(signature,index);});
  const indexes=new Map();let next=0;flat.forEach((_,i)=>{if(!excluded.has(i))indexes.set(i,next++);});let current=0;
  const prune=rows=>rows.forEach(t=>{t.questions=(t.questions||[]).filter(()=>!excluded.has(current++));prune(t.children||[]);});prune(topics);
  return {duplicates,review,evidence:evidence.filter(e=>e.question_index===undefined||indexes.has(e.question_index)).map(e=>e.question_index===undefined?e:{...e,question_index:indexes.get(e.question_index)})};
}
