import importlib.util, unittest
spec=importlib.util.spec_from_file_location('audit','scripts/imports/audit-reading-format.py');audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)

def geometry(text,blank_at=None,underline=None):
 chars=[];x=10
 for i,c in enumerate(text):
  if i==blank_at:x+=85
  chars.append({'c':c,'bbox':(x,40,x+5,55),'origin':(x,52) });x+=6
 strokes=[]
 if blank_at is not None:strokes.append((chars[blank_at-1]['bbox'][2]+3,chars[blank_at]['bbox'][0]-3,51.75))
 if underline:
  a,b=underline;strokes.append((chars[a]['bbox'][0],chars[b-1]['bbox'][2],55.6))
 return chars,strokes
class Recovery(unittest.TestCase):
 def test_blank_comes_only_from_source_stroke(self):
  text='The researcher found significant results today.'
  chars,lines=geometry(text,21)
  result,reason=audit.recover(text,chars,lines)
  self.assertIsNone(reason);self.assertEqual(result['blanks'],1)
  self.assertEqual(result['text'].replace(' _____ ',''),text)
  self.assertEqual(audit.recover(text,chars,[])[0]['text'],text)
 def test_source_word_and_phrase_underlines(self):
  text='The researcher found significant results today.'
  for a,b in [(4,14),(4,31)]:
   chars,lines=geometry(text,underline=(a,b));result,_=audit.recover(text,chars,lines)
   self.assertIn('<u>'+text[a:b]+'</u>',result['text'])
 def test_different_or_ambiguous_source_is_not_guessed(self):
  text='The researcher found significant results today.'
  chars,lines=geometry(text)
  self.assertIsNone(audit.recover(text,chars+chars,lines)[0])
  self.assertIsNone(audit.recover(text,geometry('An entirely different question appears in this source.')[0],[])[0])
if __name__=='__main__':unittest.main()
