"""Check animation markers against the ignored capture; --write restores only them.

Requires BeautifulSoup and html5lib, like the reference capture converter.
Never run the full content converter to restore animation attributes: doing so
would overwrite Tailwind classes and subsequent manual content edits.
"""
from collections import defaultdict
from pathlib import Path
import argparse
import json
from bs4 import BeautifulSoup

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--write', action='store_true')
args = parser.parse_args()
manifest = json.loads((root / 'content/manifest.json').read_text(encoding='utf8'))
updates = []
total = 0
animated_pages = 0

for name in manifest:
    soup = BeautifulSoup((root / '.reference' / name).read_text(encoding='utf8'), 'html5lib')
    original = defaultdict(list)
    current = defaultdict(list)
    for element in soup.body.find_all('div'):
        original[' '.join(element.get('class', []))].append(element)
    file = root / 'content/pages' / name.replace('.html', '.json')
    page = json.loads(file.read_text(encoding='utf8'))

    def visit(node):
        if isinstance(node, str):
            return
        if node['tag'] == 'div':
            hooks = ' '.join(c for c in node['attrs'].get('class', '').split() if not c.startswith('tw:'))
            current[hooks].append(node)
        for child in node['children']:
            visit(child)

    for node in page['nodes']:
        visit(node)
    count = 0
    for classes, elements in original.items():
        if not any(element.has_attr('data-aos') for element in elements):
            continue
        targets = current[classes]
        assert len(elements) == len(targets), f'Ambiguous animation mapping: {name}, {classes}'
        for element, node in zip(elements, targets):
            expected = {k: v for k, v in element.attrs.items() if k.startswith('data-aos')}
            actual = {k: v for k, v in node['attrs'].items() if k.startswith('data-aos')}
            if args.write:
                for key in actual:
                    del node['attrs'][key]
                node['attrs'].update(expected)
            else:
                assert actual == expected, f'Animation attributes differ: {name}, {classes}'
            count += bool(expected)
    # Detect extra markers on nodes that have no captured animation.
    actual_total = sum('data-aos' in node['attrs'] for nodes in current.values() for node in nodes)
    assert actual_total == count, f'Unexpected animation markers: {name}'
    if args.write:
        updates.append((file, page))
    total += count
    animated_pages += bool(count)

# Validate every mapping before writing any page.
for file, page in updates:
    file.write_text(json.dumps(page, ensure_ascii=False, separators=(',', ':')), encoding='utf8')
print(f'{"Restored" if args.write else "Verified"} {total} animation markers across {animated_pages} animated pages; checked all {len(manifest)} pages.')
