import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVocabook } from '../scripts/imports/vocabook.js';
import { validateVocabulary } from '../src/features/learning/vocabulary-validation.js';
function fixture() {
 const sets=Array.from({length:56},(_,i)=>({title:`Collection ${i<16?'A':'B'} Set ${(i<16?i:i-16)+1}`,collection:i<16?'College Panda 400 Words':'SATashkent Words',source_set:(i<16?i:i-16)+1,source_page:i+1,words:Array.from({length:25},(_,j)=>({word:`term${j}`,definition:`Meaning ${j}`,example:`Example ${j}`,antonym:`Opposite ${j}`,source_page:i+1})),pages:[{page:i+1,text:'Reading Time\nAn original supplied passage.\nFighting Time\n'+Array.from({length:10},(_,j)=>`${j+1}. A supplied prompt ${j}?\nA. first\nB. second\nC. third\nD. fourth`).join('\n')}]}));
 const answer_pages=['College Panda 400 Words','SATashkent Words'].map((collection,i)=>collection+'\n'+Array.from({length:i?40:16},(_,j)=>`SET ${j+1}\n`+Array.from({length:10},(_,k)=>`${k+1} B`).join('\n')).join('\n'));
 // One-column printed answer tables are valid too.
 return {sets,answer_pages};
}
test('Vocabook preserves both original collections, 25-word boundaries, source passages and explicit keys',()=>{
 const result=parseVocabook(fixture(),'source.pdf');assert.deepEqual(result.errors,[]);assert.deepEqual(result.review,[]);
 assert.equal(result.payload.sets.length,56);assert.equal(result.payload.sets[16].source_set,1);
 assert.equal(result.payload.sets[0].words.length,25);assert.equal(result.payload.sets[0].words[0].definition,'Meaning 0');
 assert.equal(result.payload.sets[0].words[0].antonym,'Opposite 0');assert.equal(result.payload.sets[0].passage,'An original supplied passage.');
 assert.equal(result.payload.sets[0].questions[0].correctAnswer,1);assert.equal(result.payload.sets[0].questions[0].questionType,'sentence_completion');
 assert.deepEqual(validateVocabulary(result.payload),[]);
});
test('missing keys stay in review and damaged set boundaries prevent import',()=>{
 const data=fixture();data.answer_pages=[];data.sets[0].words.pop();const result=parseVocabook(data,'source.pdf');assert.match(result.errors[0],/25-word boundary/);assert.equal(result.review.length,560);assert.equal(result.payload.sets[0].questions.length,0);
});
test('vocabulary duplicates ignore case and outer whitespace',()=>{
 assert.ok(validateVocabulary({title:'Book',sets:[{title:'Set',words:[{word:'Term',definition:'One'},{word:' term ',definition:'Two'}]}]}).some(e=>/duplicate/.test(e)));
});
