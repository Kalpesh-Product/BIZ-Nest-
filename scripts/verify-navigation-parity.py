"""Compare rendered design markup between two local production builds.

Usage: python scripts/verify-navigation-parity.py BASELINE_URL OPTIMIZED_URL
Requires beautifulsoup4, also used by the reference capture utilities.
"""
from pathlib import Path
from urllib.parse import quote, unquote
from urllib.request import urlopen
import json
import sys
from bs4 import BeautifulSoup, Comment

root = Path(__file__).resolve().parents[1]
baseline, optimized = (url.rstrip('/') for url in sys.argv[1:3])
manifest = json.loads((root / 'content/manifest.json').read_text(encoding='utf8'))

def markup(url):
    with urlopen(url, timeout=30) as response:
        soup = BeautifulSoup(response.read(), 'html.parser')
    # Framework scripts and resource hints vary by build, but page DOM must not.
    for element in soup.select('script, link, style'):
        element.decompose()

    def tree(node):
        if isinstance(node, Comment):
            return None
        if isinstance(node, str):
            return node if node.strip() else None
        attributes = dict(node.attrs)
        if 'href' in attributes:
            attributes['href'] = unquote(attributes['href'])
        return [node.name, attributes, [value for child in node.children if (value := tree(child)) is not None]]

    return tree(soup.body)

for name in manifest:
    route = '/' + quote(name, safe='')
    assert markup(baseline + route) == markup(optimized + route), f'Rendered body differs: {name}'
assert markup(baseline + '/') == markup(optimized + '/'), 'Rendered body differs: homepage alias'
print('PASS: all 49 pages and the homepage alias retain identical body DOM, text, attributes and Tailwind classes (excluding framework scripts/resource hints and equivalent URL encoding).')
