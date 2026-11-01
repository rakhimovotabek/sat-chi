import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { validatePackage } from "../supabase/functions/_shared/universal-package.js";
test("Desktop converter preserves keys, independent crops, source order, cover and unpublished review records", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "desktop-book-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  execFileSync("python3", [
    "-c",
    `import zipfile,json,struct,zlib,pathlib
r=pathlib.Path(${JSON.stringify(root)})
def png(color):
 def chunk(t,b):return struct.pack('!I',len(b))+t+b+struct.pack('!I',zlib.crc32(t+b)&0xffffffff)
 return b'\\x89PNG\\r\\n\\x1a\\n'+chunk(b'IHDR',struct.pack('!IIBBBBB',1,1,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(bytes([0,color,0,0])))+chunk(b'IEND',b'')
q={'id':'fixture-1','order':7,'source_page':3,'source_question_number':'9','section':'Math','domain':'Algebra','skill':'Equations','difficulty':'unclassified','topic_path':['Algebra','Practice'],'type':'multiple_choice','stem':{'asset':'assets/stem.png'},'options':[{'key':k,'text':k,'asset':'assets/'+k+'.png'}for k in 'ABCD'],'correct_answer':'B','review_status':'verified','explanation':None}
held={**q,'id':'fixture-review','order':8,'review_status':'needs_review','review_notes':['Uncertain supplied crop'],'exception':True}
m={'book_id':'fixture-book','title':'Fixture book','description':'Test-only book','subject':'Math','author':'Fixture author','rights':{'status':'test-only'},'cover_asset':'assets/cover.png'}
with zipfile.ZipFile(r/'fixture.zip','w')as z:
 z.writestr('manifest.json',json.dumps(m));z.writestr('questions.jsonl','\\n'.join(json.dumps(x)for x in [q,held]));z.writestr('lessons.json','[]')
 for i,n in enumerate(['stem','A','B','C','D','cover','admin-review']):z.writestr('assets/'+n+'.png',png(i+1))
`,
  ]);
  execFileSync("python3", [
    "scripts/imports/prepare-desktop-books.py",
    root + "/fixture.zip",
    "--output",
    root + "/prepared",
  ]);
  const m = JSON.parse(await readFile(root + "/prepared/manifest.json")),
    qs = JSON.parse(await readFile(root + "/prepared/questions.json")),
    held = JSON.parse(await readFile(root + "/prepared/review.json"));
  validatePackage(m, qs);
  assert.equal(qs.length, 1);
  assert.equal(held.length, 1);
  assert.equal(qs[0].answer, 1);
  assert.equal(qs[0].sourceOrder, 7);
  assert.equal(qs[0].source.original.source_page, 3);
  assert.equal(m.bankSource, "satchi");
  assert.equal(held[0].reviewStatus, "pending");
  assert.equal(m.assetDigests[m.book.cover].length, 64);
  assert.equal(new Set(qs[0].options.map((o) => o.image)).size, 4);
  assert.equal(Object.keys(m.assetDigests).length, 7);
  assert.equal(qs[0].explanationImage, null);
});
