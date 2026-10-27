"""Audit the committed utility migration and, optionally, a compiled CSS build."""
from pathlib import Path
import json
import re
import sys

root = Path(__file__).resolve().parents[1]
pages = root / 'content/pages'
manifest = json.loads((root / 'content/manifest.json').read_text(encoding='utf8'))
nodes = 0
utility_nodes = 0
def inspect(node):
    global nodes, utility_nodes
    if isinstance(node,str): return
    nodes += 1
    assert 'style' not in node['attrs'], 'Inline page styling remains'
    if 'tw:' in node['attrs'].get('class',''): utility_nodes += 1
    for child in node['children']: inspect(child)
for name in manifest:
    page = json.loads((pages / (name.removesuffix('.html')+'.json')).read_text(encoding='utf8'))
    assert not page.get('styles'), f'Custom page CSS remains: {name}'
    for node in page['nodes']: inspect(node)
layout = (root / 'app/layout.tsx').read_text(encoding='utf8')
assert '/assets/css/main.css' not in layout
assert '/bootstrap/css/bootstrap.min.css' not in layout
for file in list((root/'app').rglob('*.tsx')) + list((root/'components').rglob('*.tsx')):
    assert not re.search(r'\bstyle\s*=\s*\{',file.read_text(encoding='utf8')), f'Authored inline style: {file}'
print(f'PASS: {len(manifest)} Tailwind pages, {nodes} elements, {utility_nodes} utility-styled elements; no page CSS or authored inline styles.')

baseline = root / '.reference/tailwind-before/content/pages'
if baseline.exists():
    def content_only(node):
        if isinstance(node,str): return node
        # Scroll-animation markers were restored after the styling snapshot.
        attrs = {k:v for k,v in node['attrs'].items() if k not in ['style','class'] and not k.startswith('data-aos')}
        hooks = [c for c in node['attrs'].get('class','').split() if not c.startswith('tw:')]
        if hooks: attrs['class'] = hooks
        return {'tag':node['tag'],'attrs':attrs,'children':[content_only(c) for c in node['children']]}
    for name in manifest:
        file = name.removesuffix('.html')+'.json'
        before = json.loads((baseline/file).read_text(encoding='utf8'))
        after = json.loads((pages/file).read_text(encoding='utf8'))
        assert [content_only(n) for n in before['nodes']] == [content_only(n) for n in after['nodes']], f'Content or behavior hooks changed: {name}'
    print('PASS: original text, structure, attributes and hooks match the pre-Tailwind snapshot (excluding restored data-aos markers).')

if len(sys.argv)>1:
    import tinycss2
    build = root / sys.argv[1]
    classes = set()
    def tokens(items):
        for item in items:
            if item.type=='ident' and item.value.startswith('tw:'): classes.add(item.value)
            if hasattr(item,'arguments'): tokens(item.arguments)
            if hasattr(item,'content') and item.content: tokens(item.content)
    def rules(items):
        for item in items:
            if item.type=='qualified-rule': tokens(item.prelude)
            elif item.type=='at-rule' and item.content:
                rules(tinycss2.parse_rule_list(item.content,skip_comments=True,skip_whitespace=True))
    for css in build.glob('static/**/*.css'):
        rules(tinycss2.parse_stylesheet(css.read_text(encoding='utf8'),skip_comments=True,skip_whitespace=True))
    expected = set((root/'content/tailwind-candidates.txt').read_text(encoding='utf8').splitlines())
    missing = expected - classes
    assert not missing, f'{len(missing)} utilities missing from compiled CSS: {sorted(missing)[:15]}'
    print(f'PASS: all {len(expected)} migrated utility candidates exist in the production CSS.')
