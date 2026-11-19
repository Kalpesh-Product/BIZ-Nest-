import contracts from '../content/form-contracts.json' with { type: 'json' };

export const formCollections = Object.fromEntries(Object.keys(contracts).map(source => [source,
  source === '/partner.html' ? 'partner' : source.startsWith('/career_') ? 'career' : 'product']));
export const collectionNames = ['partner', 'product', 'career'];
export const companyTypes = {
  '/Co-Working_Goa.html': 'Co-Working',
  '/Co-Working_Space.html': 'Co-Working',
  '/Private_Workspace.html': 'Co-Working',
  '/Managed_Workspace.html': 'Co-Working',
  '/Co-Living_Space.html': 'Workation',
  '/Exclusive_Campus.html': 'Workation',
  '/Exclusive_Workations.html': 'Workation',
  '/Private_Apartments_Villas.html': 'Workation',
  '/Workation_Goa.html': 'Workation',
  '/Cafe.html': 'Meetings',
  '/Meetingrooms_Goa.html': 'Meetings',
  '/Meetings&Conferences.html': 'Meetings',
  '/Trainings&Events.html': 'Meetings',
  '/Virtual_Office.html': 'Alternate Channels',
  '/Virtualoffice_Goa.html': 'Alternate Channels',
  '/Car_Renting.html': 'Alternate Channels',
  '/Yatch_Renting.html': 'Alternate Channels',
};
const fixedCompanySubtypes = {
  '/Co-Working_Goa.html': 'Co-Working Space',
  '/Co-Working_Space.html': 'Co-Working Space',
  '/Private_Workspace.html': 'Private Workspace',
  '/Managed_Workspace.html': 'Managed Office',
  '/Co-Living_Space.html': 'Co-Living Space',
  '/Exclusive_Campus.html': 'Company Campus',
  '/Exclusive_Workations.html': 'Exclusive Workations',
  '/Private_Apartments_Villas.html': 'Private Apartments & Villas',
  '/Workation_Goa.html': 'Regular Workations',
  '/Cafe.html': 'Work from Cafe',
  '/Meetingrooms_Goa.html': 'Meeting Room',
  '/Meetings&Conferences.html': 'Meeting / Conference Rooms',
  '/Trainings&Events.html': 'Training / Event Rooms',
  '/Virtual_Office.html': 'Virtual Office',
  '/Car_Renting.html': 'Car & Bike Renting',
  '/Yatch_Renting.html': 'Yatch Renting',
};
const virtualOfficeSubtypes = ['Simple Virtual Office', 'Compliance Virtual Office', 'Managed Virtual Office'];
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

export function companySubtypeForSource(source, category) {
  try { source = decodeURIComponent(source); } catch { return null; }
  if (source === '/Virtualoffice_Goa.html') return virtualOfficeSubtypes.find(subtype => subtype === category?.trim()) ?? null;
  return Object.hasOwn(fixedCompanySubtypes, source) ? fixedCompanySubtypes[source] : null;
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
