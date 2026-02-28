"""Run from repo root: python fix_card.py"""
import re, json

def clean_meaning(m):
    if not m: return m
    m = re.sub(r';\s*CL:[^;]+', '', m)
    m = re.sub(r'\[[a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü\s]+\]', '', m)
    m = re.sub(r'[\u4e00-\u9fff\u3400-\u4dbf]+\|[\u4e00-\u9fff\u3400-\u4dbf]+', '', m)
    m = re.sub(r'[\u4e00-\u9fff\u3400-\u4dbf]+', '', m)
    m = re.sub(r'variant of\s*;?\s*', '', m)
    m = re.sub(r'abbr\. of\s*;?', '', m)
    m = re.sub(r'also pr\.\s*;?', '', m)
    m = re.sub(r';\s*;', ';', m)
    m = re.sub(r'\(\s*\)', '', m)
    m = re.sub(r'\s{2,}', ' ', m)
    return m.strip(' ;,')

with open('docs/flashcards.html', encoding='utf-8') as f:
    content = f.read()

# Fix 1: Only show alt-script label when in Traditional mode
old = '        ${showAlt?`<div class="card-alt-label">${isTrad?\'Simplified\':\'Traditional\'}: <span>${alt}</span></div>`:\'\'}'
new = '        ${showAlt&&isTrad?`<div class="card-alt-label">Simplified: <span>${alt}</span></div>`:\'\'}'
if old in content:
    content = content.replace(old, new, 1)
    print("Fix 1 applied: Traditional label hidden in Simplified mode")
else:
    print("Fix 1 already applied or not found")

# Fix 2: Clean HSK1 inline meanings
start = content.index('const h1=') + len('const h1=')
depth = 0; i = start
while i < len(content):
    if content[i] == '[': depth += 1
    elif content[i] == ']':
        depth -= 1
        if depth == 0: end = i + 1; break
    i += 1

data = json.loads(content[start:end])
patches = {'个': '(general measure word)', '怎么': 'how; why; what'}
changed = 0
for w in data:
    orig = w.get('m', '')
    cleaned = clean_meaning(orig)
    if w['s'] in patches and (not cleaned or cleaned == orig):
        cleaned = patches[w['s']]
    if cleaned != orig:
        w['m'] = cleaned
        changed += 1
        print(f"  {w['s']}: {orig!r} → {cleaned!r}")

content = content[:start] + json.dumps(data, ensure_ascii=False, separators=(',',':')) + content[end:]
print(f"Fix 2 applied: {changed} HSK1 meanings cleaned")

with open('docs/flashcards.html', 'w', encoding='utf-8') as f:
    f.write(content)
print("\nDone! Now run:")
print("  git add docs/flashcards.html")
print("  git commit -m \"Fix Traditional label + clean HSK1 meanings\"")
print("  git push origin master")
