"""Original CC0 30-question Math fixture. Python standard library only."""
import hashlib
import json
import pathlib
import struct
import zipfile
import zlib

OUT = pathlib.Path('assets/examples/satchi-book-v1')
# A small raster font makes image-only options actual legible numbers.
DIGITS = {
    '2': ['111', '001', '111', '100', '111'],
    '4': ['101', '101', '111', '001', '001'],
    '6': ['111', '100', '111', '101', '111'],
    '8': ['111', '101', '111', '101', '111'],
}

def raster(kind):
    width, height = (120, 72) if kind in DIGITS else (360, 220)
    pixels = bytearray([255] * width * height * 3)
    def dot(x, y, color=(20, 45, 75)):
        if 0 <= x < width and 0 <= y < height:
            at = (y * width + x) * 3
            pixels[at:at + 3] = bytes(color)
    def line(x1, y1, x2, y2):
        steps = max(abs(x2-x1), abs(y2-y1), 1)
        for n in range(steps + 1):
            x, y = round(x1 + (x2-x1)*n/steps), round(y1 + (y2-y1)*n/steps)
            for dx in range(2):
                for dy in range(2): dot(x+dx, y+dy)
    if kind in DIGITS:
        for y, row in enumerate(DIGITS[kind]):
            for x, on in enumerate(row):
                if on == '1':
                    for dx in range(8):
                        for dy in range(8): dot(48+x*8+dx, 16+y*8+dy)
    elif kind == 'graph':
        line(35, 190, 330, 190); line(35, 190, 35, 20)
        for x, y in [(35, 190), (95, 160), (155, 130), (215, 100), (275, 70)]:
            line(x-4, 190, x-4, 195); line(30, y, 35, y)
        line(35, 190, 275, 70)
    else:
        line(50, 180, 300, 180); line(50, 180, 50, 40); line(50, 40, 300, 180)
        line(50, 160, 70, 160); line(70, 160, 70, 180)
    def chunk(name, data):
        return struct.pack('>I', len(data)) + name + data + struct.pack('>I', zlib.crc32(name + data) & 0xffffffff)
    scan = b''.join(b'\0' + pixels[y*width*3:(y+1)*width*3] for y in range(height))
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(scan)) + chunk(b'IEND', b'')

manifest = {
    'format': 'satchi-book-v1',
    'book': {'id': 'satchi-original-acceptance-30', 'title': 'SAT’chi Original Acceptance — Math', 'author': 'SAT’chi', 'section': 'Math', 'description': 'Original synthetic acceptance content. Not an official SAT test.'},
    'rights': {'authorized': True, 'owner': 'SAT’chi', 'license': 'CC0-1.0', 'provenance': 'Created for this repository; no third-party questions'},
    'topics': [{'id': 'foundations', 'title': 'Foundations'}, {'id': 'equations', 'title': 'Equations', 'parent': 'foundations'}, {'id': 'applications', 'title': 'Applications'}, {'id': 'diagrams', 'title': 'Graphs and geometry', 'parent': 'applications'}],
    'questionCount': 30,
}
questions = []
for i in range(1, 31):
    q = {'id': f'q{i:04}', 'topic': 'equations', 'type': 'mcq', 'text': f'Solve $x + {i} = {i+4}$. What is $x$?', 'options': [{'label': letter, 'text': str(n)} for letter, n in zip('ABCD', [2, 4, 6, 8])], 'answer': 1, 'explanation': f'Subtract {i} from both sides to obtain $x=4$.', 'domain': 'Algebra', 'skill': 'Linear equations in one variable', 'difficulty': 'easy', 'reviewStatus': 'approved', 'source': {'reference': f'Original SATchi acceptance question {i}'}}
    questions.append(q)
questions[1]['text'] = 'Choose the image displaying the number of sides of a square.'
questions[1]['options'] = [{'label': letter, 'text': '', 'image': f'assets/choice-{letter.lower()}.png'} for letter in 'ABCD']
questions[1]['explanation'] = 'A square has four sides.'
questions[2]['text'] = r'If $\frac{\sqrt{16}+\sqrt[3]{8}}{3}=x$, what is $x$?'
questions[2]['answer'] = 0
questions[2]['explanation'] = r'$\frac{4+2}{3}=2$.'
for at, prompt, accepted, explanation in [(3, 'What is one half?', ['0.5', '1/2', '.5'], 'One half equals 0.5.'), (4, 'Solve $2x=-3$.', ['-1.5', '-3/2'], 'Divide both sides by two.')]:
    questions[at].update(type='open', text=prompt, acceptedAnswers=accepted, explanation=explanation)
    questions[at].pop('options'); questions[at].pop('answer')
questions[5].update(passage='A class recorded 2 seedlings on Monday and 6 on Friday. No seedlings were removed.', text='How many seedlings were added?', explanation='Six minus two equals four.', topic='diagrams', domain='Problem-Solving and Data Analysis', skill='Interpreting data')
questions[6].update(text='Each horizontal tick represents 1 unit; each vertical tick represents 1 unit. What is the slope of the plotted line?', image='assets/graph.png', type='open', acceptedAnswers=['1', '1/1'], explanation='The line rises one vertical tick for each horizontal tick.', topic='diagrams')
questions[6].pop('options'); questions[6].pop('answer')
questions[7].update(text='The right triangle has legs of length 3 and 4. What is its area?', image='assets/triangle.png', answer=2, explanation='The area is half of 3 times 4, or 6.', topic='diagrams', domain='Geometry and Trigonometry', skill='Area and volume')
questions[7]['explanationImage'] = 'assets/triangle.png'
assets = {f'assets/choice-{letter.lower()}.png': raster(str(n)) for letter, n in zip('ABCD', [2, 4, 6, 8])}
assets.update({'assets/graph.png': raster('graph'), 'assets/triangle.png': raster('triangle')})
manifest['assetDigests'] = {name: hashlib.sha256(data).hexdigest() for name, data in sorted(assets.items())}
files = {'manifest.json': json.dumps(manifest, ensure_ascii=False, indent=2).encode(), 'questions.jsonl': ('\n'.join(json.dumps(q, ensure_ascii=False) for q in questions)+'\n').encode(), 'review-report.csv': ('question_id,status,note\n'+''.join(f"{q['id']},approved,Original verified key\n" for q in questions)).encode(), 'README.md': b'Original CC0 synthetic Math acceptance fixture. 30 questions; graph, triangle, image-only choices, complex LaTeX, positive/negative SPR, passage and explanation image. Not an official test. Book sections currently require separate packages for Math and Reading & Writing.\n', **assets}
OUT.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(OUT/'acceptance-math-30.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for name, data in sorted(files.items()):
        info = zipfile.ZipInfo(name, date_time=(2026, 10, 31, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, data)
