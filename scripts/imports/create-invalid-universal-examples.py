"""Small hostile-structure fixtures; no executable content or large expansions."""
import pathlib, zipfile, zlib, struct, warnings
out=pathlib.Path('tests/fixtures/universal-book')
out.mkdir(parents=True,exist_ok=True)
for name,entries in {
 'unsafe-path.zip':[('../outside.txt',b'blocked')],
 'unsafe-type.zip':[('assets/runner.js',b'not executable fixture content')],
 'excessive-ratio.zip':[('README.md',b'A'*1000000)],
 'duplicate-entry.zip':[('manifest.json',b'{}'),('manifest.json',b'{}')]
}.items():
 with warnings.catch_warnings():
  warnings.simplefilter('ignore')
  with zipfile.ZipFile(out/name,'w',zipfile.ZIP_DEFLATED)as z:
   for path,data in entries:z.writestr(path,data)
def chunk(t,d):return struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',32,32,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b'\0'))+chunk(b'IEND',b'')
with zipfile.ZipFile('assets/examples/satchi-book-v1/original-practice.zip')as source:
 with zipfile.ZipFile(out/'invalid-pixels.zip','w',zipfile.ZIP_DEFLATED)as z:
  for name in source.namelist():z.writestr(name,png if name=='assets/cover.png'else source.read(name))
