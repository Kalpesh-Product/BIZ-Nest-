import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';

const base = process.argv[2] || 'http://localhost:3011';
const manifest = JSON.parse(await readFile('content/manifest.json', 'utf8'));
const routes = ['/', ...Object.keys(manifest).map(name => `/${encodeURIComponent(name)}`), '/robots.txt', '/sitemap.xml'];
const localAssets = new Set();
const brokenLinks = new Set();
const animationCounts = new Map();
function inspect(node) {
  if (typeof node === 'string') return;
  for (const attribute of ['href', 'src', 'poster']) {
    const url = node.attrs[attribute];
    if (url?.startsWith('/assets/')) localAssets.add(decodeURIComponent(url.split(/[?#]/)[0]));
    if (attribute === 'href' && url?.startsWith('/') && url.includes('.html')) {
      const name = decodeURIComponent(url.slice(1).split(/[?#]/)[0]);
      if (!Object.hasOwn(manifest, name)) brokenLinks.add(name);
    }
  }
  assert(!Object.keys(node.attrs).some(name => /^on/i.test(name)), 'Inline event handler found');
  assert.notEqual(node.tag, 'script', 'Unexpected source script');
  node.children.forEach(inspect);
}
for (const name of Object.keys(manifest)) {
  const content = JSON.parse(await readFile(`content/pages/${name.replace(/\.html$/, '.json')}`, 'utf8'));
  content.nodes.forEach(inspect);
  function countAnimations(node) {
    if (typeof node === 'string') return 0;
    return Number(Boolean(node.attrs['data-aos'])) + node.children.reduce((sum, child) => sum + countAnimations(child), 0);
  }
  animationCounts.set(name, content.nodes.reduce((sum, node) => sum + countAnimations(node), 0));
}
assert.equal(brokenLinks.size, 0, `Broken links: ${[...brokenLinks]}`);
await Promise.all([...localAssets].map(asset => access(path.join('public', asset))));
for (let offset = 0; offset < routes.length; offset += 6) {
  await Promise.all(routes.slice(offset, offset + 6).map(async route => {
    const response = await fetch(base + route);
    assert.equal(response.status, 200, `${route} returned ${response.status}`);
    const body = await response.text();
    assert(!body.includes('Internal Server Error'), `${route} has an error`);
    assert(!body.includes('id="__next_error__"'), `${route} returned an error document`);
    const name = route === '/' ? 'index.html' : decodeURIComponent(route.slice(1));
    if (animationCounts.has(name)) {
      assert.equal((body.match(/\bdata-aos="/g) || []).length, animationCounts.get(name), `${route} lost animation markers in server rendering`);
      assert.equal((body.match(/\bdata-reveal-state="pending"/g) || []).length, animationCounts.get(name), `${route} exposes animated content before hydration`);
    }
  }));
}
assert.equal((await fetch(`${base}/does-not-exist.html`)).status, 404);
const invalid = new FormData();
invalid.set('email', 'invalid');
assert.equal((await fetch(`${base}/api/inquiry`, { method: 'POST', body: invalid })).status, 400);
const crossOrigin = await fetch(`${base}/api/inquiry`, { method: 'POST', body: invalid, headers: { Origin: 'https://invalid.example' } });
assert.equal(crossOrigin.status, 403);
console.log(`Verified ${routes.length} routes, animation markers on all pages, 404 handling, ${localAssets.size} local assets, internal links, source sanitization and form validation.`);
