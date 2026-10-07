#!/usr/bin/env python3
"""Recover PDF-drawn blanks/underlines only after conservative source alignment.
Usage: python audit-reading-format.py catalog.json output.json --sources PDF_DIR
Requires PyMuPDF; never writes the database or changes wording.
"""
import argparse, difflib, hashlib, json, re, unicodedata
from pathlib import Path
import pymupdf

BOOKS = {
 'f7f296b3-5528-5e80-adaa-4466a6d7ae7f': 'SAToplam Reading Book.pdf',
 '339eaeab-0dee-55a0-ae7b-341d02e70b96': 'SAToplam Writing Book.pdf',
 'ac6a6deb-e790-5e86-ab5a-7813a63c9b8f': 'PrepPro Reading (2).pdf',
 '04f1a355-807c-572a-a265-17eaa4271f4b': 'SATakror.pdf',
}

def normalized(chars):
    text, indexes = '', []
    for i, c in enumerate(chars):
        for n in unicodedata.normalize('NFKD', c).casefold():
            if n.isalnum():
                text += n
                indexes.append(i)
    return text, indexes

def page_data(page):
    chars = []
    for block in page.get_text('rawdict')['blocks']:
        for line in block.get('lines', []):
            for span in line['spans']:
                chars.extend(span['chars'])
            chars.append({'c': '\n', 'bbox': (0,0,0,0), 'origin': (0,0)})
    lines = []
    for drawing in page.get_drawings():
        # Only actual horizontal strokes; exclude dividers, boxes and tables.
        if drawing.get('type') not in ('s', 'fs') or (drawing.get('width') or 0) > 2 or drawing.get('color') != (0.0, 0.0, 0.0):
            continue
        for item in drawing['items']:
            if item[0] == 'l':
                a,b = item[1:3]
                if abs(a.y-b.y)<0.2 and 0.5<abs(a.x-b.x)<450:
                    lines.append((min(a.x,b.x), max(a.x,b.x), a.y))
            elif item[0] == 're':
                rect=item[1]
                if rect.height<=1.5 and 0.5<rect.width<450:
                    lines.append((rect.x0,rect.x1,rect.y0))
    merged=[]
    for x0,x1,y in sorted(lines,key=lambda line:(round(line[2],1),line[0])):
        if merged and abs(merged[-1][2]-y)<0.2 and x0<=merged[-1][1]+1:
            merged[-1]=(merged[-1][0],max(x1,merged[-1][1]),y)
        else: merged.append((x0,x1,y))
    return chars, merged

def recover(text, chars, strokes):
    target, ti = normalized(text)
    source, si = normalized(''.join(c['c'] for c in chars))
    if len(target)<25:
        return None, 'Passage too short for unique alignment'
    prefix,suffix = target[:30],target[-30:]
    starts=[m.start() for m in re.finditer(re.escape(prefix),source)]
    ends=[m.end() for m in re.finditer(re.escape(suffix),source)]
    ranges=[(a,b) for a in starts for b in ends if b>a and abs(b-a-len(target))<max(5,len(target)*0.04)]
    if len(ranges)!=1:
        return None,'Source passage does not align uniquely'
    start,end=ranges[0]
    match=difflib.SequenceMatcher(None,target,source[start:end],autojunk=False)
    if match.ratio()<0.985:
        return None,'Source passage differs from stored wording'
    mapping={si[start+b+j]:ti[a+j] for a,b,n in match.get_matching_blocks() for j in range(n)}
    low,high=si[start],si[end-1]
    for i in range(low,high+1):
        if chars[i]['c'].isspace() or i in mapping: continue
        for delta in (-1,1,-2,2):
            neighbor=i+delta
            if neighbor in mapping:
                j=mapping[neighbor]-delta
                if 0<=j<len(text) and chars[i]['c']==text[j]: mapping[i]=j;break
    ordered=sorted(mapping)
    underlines=[]; blanks=[]; evidence=[]
    for x0,x1,y in strokes:
        # Baseline, not font bbox bottom: PDF underline strokes sit at/below it.
        nearby=[i for i in range(low,high+1) if not chars[i]['c'].isspace() and -0.5<=y-chars[i]['origin'][1]<=5]
        overlap=[i for i in nearby if chars[i]['bbox'][0]+0.5<x1 and chars[i]['bbox'][2]-0.5>x0]
        if overlap and y-chars[overlap[0]]['origin'][1]>0.5:
            if any(i not in mapping for i in overlap):
                continue
            indexes=[mapping[i] for i in overlap]
            a,b=min(indexes),max(indexes)+1
            # Require stroke to cover >=90% of each boundary character.
            first,last=chars[min(overlap)],chars[max(overlap)]
            if x0>first['bbox'][0]+2 or x1<last['bbox'][2]-2:
                continue
            underlines.append((a,b)); evidence.append({'kind':'underline','text':text[a:b],'rect':[x0,y,x1,y]})
        elif not overlap and x1-x0>=20:
            # Verify empty line between adjacent passage glyphs on this baseline.
            left=[i for i in nearby if chars[i]['bbox'][2]<=x0+1 and i in mapping]
            right=[i for i in nearby if chars[i]['bbox'][0]>=x1-1 and i in mapping]
            if left and not right:
                l=max(left,key=lambda i:chars[i]['bbox'][2])
                following=[i for i in ordered if i>l]
                if following:
                    r=following[0];a,b=mapping[l]+1,mapping[r]
                    if 0<=x0-chars[l]['bbox'][2]<25 and abs(y-chars[l]['origin'][1])<1 and 5<chars[r]['origin'][1]-y<25 and chars[r]['bbox'][0]<x0 and a<=b and not re.search(r'\w|_',text[a:b]):
                        blanks.append(a);evidence.append({'kind':'blank','offset':a,'rect':[x0,y,x1,y]})
                if l>=high-2 and 0<=x0-chars[l]['bbox'][2]<25 and abs(y-chars[l]['origin'][1])<1 and '_' not in text[mapping[l]:]:
                    blanks.append(len(text));evidence.append({'kind':'blank','offset':len(text),'rect':[x0,y,x1,y]})
                continue
            if right and not left:
                r=min(right,key=lambda i:chars[i]['bbox'][0])
                preceding=[i for i in ordered if i<r]
                if preceding:
                    l=preceding[-1];a,b=mapping[l]+1,mapping[r]
                    if 0<=chars[r]['bbox'][0]-x1<25 and abs(y-chars[r]['origin'][1])<1 and 5<y-chars[l]['origin'][1]<25 and chars[l]['bbox'][2]>x1 and a<=b and not re.search(r'\w|_',text[a:b]):
                        blanks.append(b);evidence.append({'kind':'blank','offset':b,'rect':[x0,y,x1,y]})
                if r<=low+2 and 0<=chars[r]['bbox'][0]-x1<25 and abs(y-chars[r]['origin'][1])<1 and '_' not in text[:mapping[r]]:
                    blanks.append(0);evidence.append({'kind':'blank','offset':0,'rect':[x0,y,x1,y]})
                continue
            if not left or not right: continue
            l=max(left,key=lambda i:chars[i]['bbox'][2]); r=min(right,key=lambda i:chars[i]['bbox'][0])
            a,b=mapping[l]+1,mapping[r]
            if abs(y-chars[l]['origin'][1])>1 or a>b or re.search(r'\w',text[a:b]) or x0-chars[l]['bbox'][2]>25 or chars[r]['bbox'][0]-x1>25:
                continue
            if '_' not in text[a:b]:
                blanks.append(a); evidence.append({'kind':'blank','offset':a,'rect':[x0,y,x1,y]})
    # Merge adjacent line fragments of the same underlined phrase/sentence.
    merged=[]
    for a,b in sorted(set(underlines)):
        if merged and not re.search(r'\w',text[merged[-1][1]:a]):
            merged[-1]=(merged[-1][0],max(b,merged[-1][1]))
        else:
            merged.append((a,b))
    edits={}
    for a,b in merged:
        # Already formatted text is not rewritten by this source repair.
        if '<' in text[a:b] or '>' in text[a:b]:
            return None,'Existing markup requires manual comparison'
        edits.setdefault(a,[]).append('<u>'); edits.setdefault(b,[]).insert(0,'</u>')
    for a in sorted(set(blanks)):
        edits.setdefault(a,[]).append(' _____ ')
    result=''.join(''.join(edits.get(i,[]))+c for i,c in enumerate(text))+''.join(edits.get(len(text),[]))
    return {'text':result,'evidence':evidence,'underlines':len(merged),'blanks':len(set(blanks))},None

def main():
    ap=argparse.ArgumentParser();ap.add_argument('catalog');ap.add_argument('output');ap.add_argument('--sources',required=True);args=ap.parse_args()
    catalog=json.loads(Path(args.catalog).read_text());topics={t['id']:t['book_id'] for t in catalog['topics']}
    docs={};cache={};repairs=[];uncertain=[];checked=0;already=0
    for q in catalog['questions']:
        book=topics.get(q['topic_id']);name=BOOKS.get(book)
        text=q.get('passage') or ''
        if not name or not text: continue
        if book not in docs: docs[book]=pymupdf.open(Path(args.sources)/name)
        page=q.get('source_page') or q.get('import_metadata',{}).get('page')
        if not isinstance(page,int) or not 1<=page<=len(docs[book]):
            uncertain.append({'id':q['id'],'reason':'Source page unavailable'});continue
        key=(book,page)
        if key not in cache: cache[key]=page_data(docs[book][page-1])
        result,reason=recover(text,*cache[key]);checked+=1
        prompt=q.get('question_text','')
        expects_blank='completes the text' in prompt.lower()
        expects_underline='underlin' in prompt.lower()
        if result and result['text']!=(q.get('passage_markup') or text):
            repairs.append({'id':q['id'],'book_id':book,'source_id':q.get('import_metadata',{}).get('package_question_id'),'page':page,'before':text,'after':result['text'],'evidence':result['evidence'],'blanks':result['blanks'],'underlines':result['underlines']})
        output=result['text'] if result else text
        if (expects_blank and not re.search(r'_{2,}',output)) or (expects_underline and '<u>' not in output):
            uncertain.append({'id':q['id'],'reason':reason or 'Required formatting has no uniquely matched source stroke','has_source_image':bool(q.get('image_url'))})
        elif reason and (expects_blank or expects_underline):
            uncertain.append({'id':q['id'],'reason':reason})
        elif result and not result['evidence']: already+=1
    report={'checked':checked,'repairs':repairs,'uncertain':uncertain,'source_hashes':{b:hashlib.sha256((Path(args.sources)/BOOKS[b]).read_bytes()).hexdigest() for b in docs},'blank_repairs':sum(r['blanks'] for r in repairs),'underline_repairs':sum(r['underlines'] for r in repairs)}
    Path(args.output).write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps({k:v for k,v in report.items() if k not in ('repairs','uncertain','source_hashes')}));print('repairs',len(repairs),'uncertain',len(uncertain))
if __name__=='__main__':main()
