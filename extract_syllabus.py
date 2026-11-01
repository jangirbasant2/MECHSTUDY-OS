import fitz
doc = fitz.open('syllabus.pdf')
for i, page in enumerate(doc):
    text = page.get_text()
    print(f'--- Page {i+1} ---')
    print(text[:3000] if text else 'NO TEXT')
    print()