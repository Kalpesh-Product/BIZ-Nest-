import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const classes = new Set();
const collect = value => String(value || '').split(/\s+/).filter(token => token.startsWith('tw:')).forEach(token => classes.add(token));
function visit(node) {
  if (typeof node === 'string') return;
  collect(node.attrs?.class);
  node.children?.forEach(visit);
}
for (const file of await readdir(path.join(root, 'content/pages'))) {
  if (!file.endsWith('.json')) continue;
  const page = JSON.parse(await readFile(path.join(root, 'content/pages', file), 'utf8'));
  page.nodes.forEach(visit);
}
const rootClasses = JSON.parse(await readFile(path.join(root, 'content/tailwind-root.json'), 'utf8'));
Object.values(rootClasses).forEach(collect);
const destination = path.join(root, 'content/tailwind-candidates.txt');
const output = [...classes].sort().join('\n') + '\n';
if (await readFile(destination, 'utf8').catch(() => '') !== output) await writeFile(destination, output);
console.log(`Tailwind sources synchronized: ${classes.size} complete utility candidates.`);
