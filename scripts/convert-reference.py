"""Generate safe, server-renderable content from the captured public pages."""
from pathlib import Path
from bs4 import BeautifulSoup, Comment, NavigableString
from urllib.parse import urlsplit, unquote
import json
import re

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'content/pages'
OUT.mkdir(parents=True, exist_ok=True)

def local_url(value):
    value = value.strip()
    if value.startswith(('javascript:', 'data:text/html')):
        return '#'
    value = re.sub(r'^(https?://(?:www\.)?biznest\.co\.in/|\./)', '/', value)
    if value.startswith(('assets/', 'forms/')) or re.match(r'^[^/:#?]+\.html', value):
        value = '/' + value
    if value.startswith('tel:'):
        value = 'tel:' + re.sub(r'[^+\d]', '', value[4:])
    return value

def css_urls(css):
    return re.sub(r'url\(([\s\'\"]*)(?:\./)?assets/', r'url(\1/assets/', css)

def convert(node):
    if isinstance(node, Comment):
        return None
    if isinstance(node, NavigableString):
        text = str(node)
        return text if text.strip() else None
    if node.name in ['script', 'noscript', 'style', 'link', 'meta', 'title'] or node.get('id') == 'preloader':
        return None
    attrs = {}
    for name, value in node.attrs.items():
        if name.startswith('on') or name in ['language']:
            continue
        if isinstance(value, list):
            value = ' '.join(value)
        if name in ['href', 'src', 'poster', 'action']:
            value = local_url(value)
        if name == 'style':
            value = css_urls(value)
        attrs[name] = value
    tag = node.name
    if tag == 'img':
        attrs.setdefault('alt', '')
        if 'logo' not in attrs.get('class', '') and 'goa12' not in attrs.get('src', '') and 'hero' not in attrs.get('src', ''):
            attrs['loading'] = 'lazy'
        attrs['decoding'] = 'async'
    if tag == 'iframe':
        attrs['title'] = 'BIZ Nest location in Goa' if 'maps.google' in attrs.get('src', '') else 'BIZ Nest video'
        attrs['loading'] = 'lazy'
        attrs['referrerpolicy'] = 'strict-origin-when-cross-origin'
    if tag == 'a' and attrs.get('target') == '_blank':
        attrs['rel'] = 'noopener noreferrer'
    if tag == 'a' and 'social-links' in ' '.join(node.parent.get('class', [])):
        host = urlsplit(attrs.get('href', '')).netloc.replace('www.', '')
        attrs['aria-label'] = 'BIZ Nest on ' + host.split('.')[0].title()
    if tag == 'a' and 'glightbox' in attrs.get('class', ''):
        attrs.setdefault('aria-label', 'View BIZ Nest gallery image')
    if tag == 'a' and attrs.get('href') == '#' and node.find_parent('footer'):
        attrs['href'] = '/'
    if tag in ['input', 'select', 'textarea']:
        label = attrs.get('placeholder') or attrs.get('name', '').replace('_', ' ').title()
        if label:
            attrs['aria-label'] = label
        if attrs.get('name') in ['name', 'email', 'mobile']:
            attrs['autocomplete'] = {'name':'name', 'email':'email', 'mobile':'tel'}[attrs['name']]
        if attrs.get('name') == 'mobile':
            attrs['type'] = 'tel'
            attrs['inputmode'] = 'tel'
        if tag == 'input' and attrs.get('type') not in ['checkbox', 'radio', 'file', 'hidden']:
            attrs['maxlength'] = '500'
    if tag == 'form':
        attrs['action'] = '/api/inquiry'
        attrs['method'] = 'post'
    if tag == 'i' and 'mobile-nav-toggle' in attrs.get('class', ''):
        tag = 'button'
        attrs['type'] = 'button'
        attrs['aria-label'] = 'Close navigation' if 'hide' in attrs.get('class', '') else 'Open navigation'
        attrs['aria-controls'] = 'navbar'
        attrs['aria-expanded'] = 'false'
    if tag == 'a' and 'scroll-top' in attrs.get('class', ''):
        attrs['aria-label'] = 'Back to top'
    children = [value for child in node.children if (value := convert(child)) is not None]
    if 'data-purecounter-end' in attrs:
        children = [attrs['data-purecounter-end']]
    # Repair invalid nested interactive controls without changing presentation.
    if tag == 'a' and len(children) == 1 and isinstance(children[0], dict) and children[0]['tag'] == 'button':
        button = children[0]
        attrs.update({k:v for k,v in button['attrs'].items() if k not in ['type', 'name']})
        children = button['children']
    if tag in ['input', 'img', 'br', 'hr', 'source', 'wbr', 'area', 'col', 'embed', 'param', 'track']:
        children = []
    return {'tag': tag, 'attrs': attrs, 'children': children}

manifest = {}
inventory = json.loads((ROOT / '.reference/inventory.json').read_text(encoding='utf-8'))
for name in sorted(inventory['pages']):
    path = ROOT / '.reference' / name
    soup = BeautifulSoup(path.read_text(encoding='utf-8'), 'html5lib')
    if not soup.body.find('main') and soup.body.find('header', recursive=False):
        header = soup.body.find('header', recursive=False)
        main = soup.new_tag('main', id='main')
        header.insert_after(main)
        for sibling in list(main.next_siblings):
            if getattr(sibling, 'name', None) == 'footer':
                break
            main.append(sibling.extract())
    desc = soup.find('meta', attrs={'name': 'description'})
    title = soup.title.get_text(strip=True) if soup.title else 'BIZ Nest'
    styles = '\n'.join(css_urls(x.string or x.decode_contents()) for x in soup.find_all('style'))
    nodes = [value for child in soup.body.children if (value := convert(child)) is not None]
    data = {'title': title, 'description': desc.get('content', '') if desc else '', 'styles': styles, 'nodes': nodes}
    (OUT / (path.stem + '.json')).write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    manifest[path.name] = {'title': title, 'description': data['description']}
(ROOT / 'content/manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'Converted {len(manifest)} pages into React content.')
