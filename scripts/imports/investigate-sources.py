"""Inspect only unresolved checkpointed PDFs; preserve samples privately, never infer keys."""
import csv,json,pathlib,re,subprocess,sys
ROOT=(pathlib.Path.home()/'Desktop'/'Books').resolve()
OUT=pathlib.Path('local-imports'); OUT.mkdir(exist_ok=True)
reports=json.loads((OUT/'manifest.json').read_text()); result=[]
for report in reports:
    if report['status']!='review': continue
    file=(ROOT/report['source_path']).resolve()
    if ROOT not in file.parents: raise ValueError('Source outside Desktop/Books')
    fingerprint=report['fingerprint']; text=(OUT/(fingerprint+'.extracted.txt')).read_text(); pages=text.split('\f')
    info=subprocess.check_output(['pdfinfo',str(file)],text=True)
    count=int(re.search(r'Pages:\s+(\d+)',info)[1]); chars=[len(re.sub(r'\s','',p)) for p in pages[:count]]
    row={'source_file':report['source_file'],'fingerprint':fingerprint,'page_count':count,'embedded_chars':sum(chars),'sparse_pages':sum(x<100 for x in chars),'image_pages':report.get('asset_pages',[]),'samples':[],'extraction_method':'embedded_text','status':'Manual review required'}
    indices=sorted(set([0,count//2,count-1]))
    scanned=sum(x<100 for x in chars)>count*.9
    if scanned:
        row['extraction_method']='ocr_samples'; indices=list(range(count)) if count<=4 else [min(9,count-1),count//2,max(0,count-3)]
    for i in indices:
        sample={'page':i+1,'method':'embedded_text','embedded_chars':chars[i] if i<len(chars) else 0}
        if scanned and '--ocr' in sys.argv:
            prefix=OUT/f'{fingerprint}.page-{i+1}'
            subprocess.run(['pdftoppm','-f',str(i+1),'-l',str(i+1),'-r','180','-gray','-singlefile','-png',str(file),str(prefix)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            subprocess.run(['tesseract',str(prefix)+'.png',str(prefix),'-l','eng','--psm','3','txt','tsv'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            words=list(csv.DictReader(open(str(prefix)+'.tsv'),delimiter='\t')); scores=[float(w['conf']) for w in words if w.get('text','').strip() and float(w['conf'])>=0]
            sample.update(method='ocr',word_count=len(scores),mean_confidence=round(sum(scores)/len(scores),2) if scores else 0,low_confidence_words=sum(s<70 for s in scores),low_confidence_ratio=round(sum(s<70 for s in scores)/len(scores),3) if scores else 1,review_required=True,image_file=prefix.name+'.png')
        else:
            (OUT/f'{fingerprint}.page-{i+1}.txt').write_text(pages[i] if i<len(pages) else '')
        row['samples'].append(sample)
    result.append(row)
    (OUT/'source-investigation.json').write_text(json.dumps(result,indent=2))
    print(json.dumps({'source':row['source_file'],'pages':count,'method':row['extraction_method'],'samples':row['samples']}),flush=True)
