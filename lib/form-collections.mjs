import contracts from '../content/form-contracts.json' with { type: 'json' };

export const formCollections = Object.fromEntries(Object.keys(contracts).map(source => [source,
  source === '/partner.html' ? 'partner' : source.startsWith('/career_') ? 'career' : 'product']));
export const collectionNames = ['partner', 'product', 'career'];
export const companyTypes = {
  '/Cafe.html': 'Work From Cafe',
  '/Car_Renting.html': 'Car Renting',
  '/Co-Living_Space.html': 'Co-Living',
  '/Co-Working_Goa.html': 'Co-Working',
  '/Co-Working_Space.html': 'Co-Working',
  '/Exclusive_Campus.html': 'Exclusive Campus',
  '/Exclusive_Workations.html': 'Exclusive Workations',
  '/Managed_Workspace.html': 'Managed Workspace',
  '/Meetingrooms_Goa.html': 'Meeting Room',
  '/Meetings&Conferences.html': 'Meeting Room',
  '/Private_Apartments_Villas.html': 'Private Apartments & Villas',
  '/Private_Workspace.html': 'Private Workspace',
  '/Trainings&Events.html': 'Training & Events',
  '/Virtual_Office.html': 'Virtual Office',
  '/Virtualoffice_Goa.html': 'Virtual Office',
  '/Workation_Goa.html': 'Workation',
  '/Yatch_Renting.html': 'Yacht Renting',
};
export const legacyCollectionNames = ['jobApplications', 'partnerships', ...Object.keys(contracts).map(source =>
  `forms_${source.slice(1).replace(/\.html$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+$/, '')}`)];

export function purposeForSource(source) {
  if (!collectionForSource(source)) return null;
  source = decodeURIComponent(source);
  return source.startsWith('/career_') ? 'jobApplications' : source === '/partner.html' ? 'partnerships' : 'inquiries';
}

export function collectionForSource(source) {
  try { source = decodeURIComponent(source); } catch { return null; }
  return Object.hasOwn(formCollections, source) ? formCollections[source] : null;
}

export function companyTypeForSource(source) {
  try { source = decodeURIComponent(source); } catch { return null; }
  return Object.hasOwn(companyTypes, source) ? companyTypes[source] : null;
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
