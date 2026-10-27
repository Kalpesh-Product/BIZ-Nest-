"""Capture public BIZ Nest pages and their assets for the local React migration."""
from pathlib import Path
from urllib.parse import urljoin, urlsplit, unquote, quote
from urllib.request import urlopen, Request
from concurrent.futures import ThreadPoolExecutor
from bs4 import BeautifulSoup
import json
import re

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://biznest.co.in/'
REFERENCE = ROOT / '.reference'
PUBLIC = ROOT / 'public'
REFERENCE.mkdir(exist_ok=True)
seen = set()
assets = set()
pages = {}
failures = []

def fetch(url):
    url = quote(url, safe=':/?=&%+#@')
    with urlopen(Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=45) as response:
        return response.read()

queue = ['index.html']
while queue:
    name = queue.pop(0)
    if name in seen:
        continue
    seen.add(name)
    try:
        raw = fetch(urljoin(BASE, name)).decode('utf-8', errors='replace')
        (REFERENCE / name).write_text(raw, encoding='utf-8')
        soup = BeautifulSoup(raw, 'html5lib')
        pages[name] = soup
        for tag in soup.find_all(True):
            for attr in ['href', 'src', 'poster']:
                value = tag.get(attr)
                if not value:
                    continue
                u = urlsplit(urljoin(BASE, value))
                path = unquote(u.path).lstrip('/')
                if u.netloc not in ['biznest.co.in', 'www.biznest.co.in']:
                    continue
                if path.endswith('.html') and path not in seen:
                    queue.append(path)
                elif path.startswith('assets/'):
                    assets.add(path)
        for match in re.findall(r'url\([\s\'\"]*([^\)\'\"]+)', raw):
            path = unquote(urlsplit(urljoin(BASE, match)).path).lstrip('/')
            if path.startswith('assets/'):
                assets.add(path)
        print('PAGE', name, flush=True)
    except Exception as error:
        failures.append({'path': name, 'error': str(error)})

def download(path):
    target = PUBLIC / path
    if target.exists():
        return path, target.read_bytes()
    try:
        data = fetch(urljoin(BASE, path))
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        return path, data
    except Exception as error:
        failures.append({'path': path, 'error': str(error)})
        return path, b''

done = set()
while assets - done:
    batch = sorted(assets - done)
    done.update(batch)
    with ThreadPoolExecutor(max_workers=10) as pool:
        for path, data in pool.map(download, batch):
            if path.endswith('.css'):
                css = data.decode('utf-8', errors='replace')
                for value in re.findall(r'url\([\s\'\"]*([^\)\'\"]+)', css):
                    if value.startswith('data:'):
                        continue
                    asset = unquote(urlsplit(urljoin(BASE + path, value)).path).lstrip('/')
                    if asset.startswith('assets/'):
                        assets.add(asset)
    print('ASSETS', len(done), flush=True)

(REFERENCE / 'inventory.json').write_text(json.dumps({'pages': list(pages), 'assets': sorted(assets), 'failures': failures}, indent=2), encoding='utf-8')
print(json.dumps({'pages': list(pages), 'assets': len(assets), 'failures': failures}, indent=2), flush=True)
