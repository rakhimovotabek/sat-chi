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
