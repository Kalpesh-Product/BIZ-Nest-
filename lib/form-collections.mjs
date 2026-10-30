import contracts from '../content/form-contracts.json' with { type: 'json' };

// Group by purpose; the original page remains recorded in each submission.
export const formCollections = Object.fromEntries(Object.keys(contracts).map(source => [source,
  source.startsWith('/career_') ? 'jobApplications' : source === '/partner.html' ? 'partnerships' : 'inquiries',
]));
export const collectionNames = ['inquiries', 'jobApplications', 'partnerships'];
export const legacyCollectionNames = Object.keys(contracts).map(source =>
  `forms_${source.slice(1).replace(/\.html$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+$/, '')}`);

export function collectionForSource(source) {
  try { source = decodeURIComponent(source); } catch { return null; }
  return Object.hasOwn(formCollections, source) ? formCollections[source] : null;
}

const indexes = new WeakMap();
export async function ensureFormIndexes(db, name) {
  if (!collectionNames.includes(name)) throw new Error('Unknown form collection.');
  let pending = indexes.get(db);
  if (!pending) { pending = new Map(); indexes.set(db, pending); }
  if (!pending.has(name)) {
    pending.set(name, Promise.all([
      db.collection(name).createIndex({ source: 1, idempotencyKey: 1 }, { name: 'source_idempotency_unique', unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }),
      db.collection(name).createIndex({ createdAt: -1 }),
      db.collection('submission_limits').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    ]).catch(error => { pending.delete(name); throw error; }));
  }
  await pending.get(name);
  // Upgrade the first backend's single-key index without weakening retry checks.
  if ((await db.collection(name).listIndexes().toArray()).some(index => index.name === 'idempotencyKey_1')) {
    try { await db.collection(name).dropIndex('idempotencyKey_1'); }
    catch (error) { if (error.code !== 27) throw error; }
  }
}
