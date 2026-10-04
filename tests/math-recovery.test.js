import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
const python = `import importlib.util,json
s=importlib.util.spec_from_file_location('math','scripts/imports/math-regions.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
def page(lines):
 return '<page width="600" height="800">'+''.join('<line yMin="'+str(y)+'" yMax="'+str(y+12)+'"><word xMin="'+str(x)+'" xMax="'+str(x+40)+'">'+t+'</word></line>' for x,y,t in lines)+'</page>'
questions=[(40,60,'1.'),(46,80,'A prose prompt'),(70,110,'A) one'),(70,130,'B) two'),(70,150,'C) three'),(70,170,'D) four'),(310,60,'2.'),(335,110,'A) one'),(335,130,'B) two'),(335,150,'C) three'),(335,170,'D) four')]
xml='<root xmlns="urn:test">'+page(questions)+page([])+page([])+'</root>'
text='practice\\fAnswers: Algebra\\nNumber   Answer\\n  1        B\\fNumber   Answer\\n  2        C\\f'
r=m.parse_regions(xml,text)
assert len(r['accepted'])==2
assert r['accepted'][0]['answer']=='B'
assert r['accepted'][1]['answer']=='C'
assert r['accepted'][1]['key_page']==3
assert r['accepted'][0]['page']==1
r=m.parse_regions(xml,text.replace('  2        C','  2        12'))
assert len(r['accepted'])==1 and 'Numeric' in r['unresolved'][0]['reason']
r=m.parse_regions(xml,text.replace('  2        C','  1        C'))
assert len(r['accepted'])==0
r=m.parse_regions(xml.replace('D) four','E) five'),text)
assert len(r['accepted'])==0
print('verified')`;
test("Math region adapter scopes keys, preserves physical/key pages, includes continuation tables and excludes numeric/conflicting/malformed items", () => {
  assert.equal(
    execFileSync("python3", ["-c", python], { encoding: "utf8" }).trim(),
    "verified",
  );
});

test("Math domains use explicit source sections and keep unknown strategy headings unclassified", async () => {
  const { mathDomain } = await import("../scripts/imports/math-domain.js");
  assert.equal(mathDomain("Advanced Math"), "Advanced Math");
  assert.equal(
    mathDomain("Problem Solving"),
    "Problem-Solving and Data Analysis",
  );
  assert.equal(mathDomain("Functions&Function Notation"), "Advanced Math");
  assert.equal(mathDomain("Chapter 17 (pp. 149-154)"), "");
});

test("choice recovery preserves verified keys and crops before real options while excluding fractions and missing choices", () => {
  const script = `import importlib.util,json
s=importlib.util.spec_from_file_location('choices','scripts/imports/math-options.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
def line(y,label,value):
 return f'<line yMin="{y}" yMax="{y+10}"><word xMin="40" yMin="{y}" xMax="55">{label}</word><word xMin="65" yMin="{y}" xMax="95">{value}</word></line>'
xml='<root xmlns="urn:test"><page>'+line(20,'1.','Question')+''.join(line(100+i*20,c+')',str(i+1)) for i,c in enumerate('ABCD'))+'</page></root>'
r={'page':1,'key_page':3,'answer':'C','asset':'private/question.webp','bounds':[30,10,250,170],'render_bounds':[20,10,280,170]}
a=m.recover(xml,[r])[0]
assert a['options_verified'] and a['options']==['1','2','3','4']
assert a['stem_bounds']==[20,10,280,87]
assert a['answer']=='C' and a['key_page']==3 and a['asset']==r['asset']
caption=xml.replace(line(20,'1.','Question'),line(20,'ADVANCED MATH —','ALGEBRA')+line(45,'1.','Question'))
assert m.recover(caption,[r])[0]['stem_bounds']==[20,32.0,280,65.0]
assert not m.recover(xml.replace('D)','E)'),[r])[0]['options_verified']
assert not m.recover(xml.replace('yMin="100" xMax="95"','yMin="90" xMax="95"'),[r])[0]['options_verified']
assert not m.recover(xml.replace('>4</word>','>3</word>'),[r])[0]['options_verified']
print('verified')`;
  assert.equal(
    execFileSync("python3", ["-c", script], { encoding: "utf8" }).trim(),
    "verified",
  );
});
