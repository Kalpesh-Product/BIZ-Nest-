import { readdir, readFile, writeFile } from 'node:fs/promises';

const contracts = {};
const text = node => typeof node === 'string' ? node : node.children.map(text).join('');
function walk(node, callback) {
  if (typeof node === 'string') return;
  callback(node);
  node.children.forEach(child => walk(child, callback));
}
for (const filename of (await readdir('content/pages')).filter(name => name.endsWith('.json')).sort()) {
  const page = JSON.parse(await readFile(`content/pages/${filename}`, 'utf8'));
  const forms = [];
  page.nodes.forEach(node => walk(node, form => {
    if (form.tag !== 'form') return;
    const fields = [];
    walk(form, field => {
      if (!['input', 'select', 'textarea'].includes(field.tag) || !field.attrs.name) return;
      const attributes = Object.fromEntries(Object.entries(field.attrs).filter(([key]) => ['name', 'type', 'value', 'min', 'max'].includes(key)));
      attributes.required = Object.hasOwn(field.attrs, 'required');
      if (field.tag === 'select') attributes.options = field.children.filter(option => typeof option !== 'string' && option.tag === 'option').map(option => option.attrs.value ?? text(option).trim());
      fields.push(attributes);
    });
    if (!forms.some(existing => JSON.stringify(existing) === JSON.stringify(fields))) forms.push(fields);
  }));
  if (forms.length) contracts[`/${filename.replace(/\.json$/, '.html')}`] = forms;
}
await writeFile('content/form-contracts.json', JSON.stringify(contracts, null, 2) + '\n');
console.log(`Form contracts synchronized: ${Object.keys(contracts).length} pages.`);
