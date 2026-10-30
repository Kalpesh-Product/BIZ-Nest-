import { isDeepStrictEqual } from 'node:util';
import { mkdir, open } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { BSON } from 'mongodb';
import { collectionForSource, collectionNames, legacyCollectionNames, ensureFormIndexes } from './form-collections.mjs';

export async function migrateFormCollections(db) {
  const present = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map(item => item.name));
  const obsolete = [...legacyCollectionNames, 'inquiries_legacy_backup'].filter(name => present.has(name));
  const sources = [...obsolete, ...collectionNames.filter(name => present.has(name))];
  let misplaced = false;
  // Unknown sources stop consolidation before any records or collections change.
  for (const name of sources) {
    for (const source of await db.collection(name).distinct('source')) {
      const destination = collectionForSource(source);
      if (!destination) throw new Error('An existing submission has an unknown source; consolidation stopped.');
      if (destination !== name) misplaced = true;
    }
  }
  if (!obsolete.length && !misplaced) return { migrated: 0, removed: 0, backup: null };
  const directory = path.join(process.cwd(), '.reference', 'mongodb-backups');
  await mkdir(directory, { recursive: true });
  const backup = path.join(directory, `form-consolidation-${randomUUID()}.ndjson`);
  const file = await open(backup, 'wx', 0o600);
  let migrated = 0;
  const counts = new Map();
  try {
    await file.writeFile(BSON.EJSON.stringify({ format: 1, database: db.databaseName, collections: sources, createdAt: new Date() }) + '\n');
    // Export BSON-aware JSON before making any destructive changes.
    for (const name of sources) {
      let count = 0;
      for await (const record of db.collection(name).find()) {
        await file.writeFile(BSON.EJSON.stringify({ collection: name, document: record }, { relaxed: false }) + '\n');
        count++;
      }
      counts.set(name, count);
    }
    await file.sync();
    await Promise.all(collectionNames.map(name => ensureFormIndexes(db, name)));
    for (const name of sources) {
      for await (const record of db.collection(name).find()) {
        const destinationName = collectionForSource(record.source);
        if (destinationName === name) continue;
        const destination = db.collection(destinationName);
        const existing = await destination.findOne({ _id: record._id });
        if (!existing) await destination.insertOne(record);
        if (!isDeepStrictEqual(record, await destination.findOne({ _id: record._id }))) throw new Error('Copy verification failed; original records retained.');
        migrated++;
      }
    }
    // Recheck originals and destination contents before removing obsolete data.
    for (const name of sources) {
      if (obsolete.includes(name) && await db.collection(name).countDocuments() !== counts.get(name)) throw new Error('Legacy records changed during consolidation; stop old writers and retry.');
      for await (const record of db.collection(name).find()) {
        const destinationName = collectionForSource(record.source);
        if (destinationName !== name && !isDeepStrictEqual(record, await db.collection(destinationName).findOne({ _id: record._id }))) throw new Error('Final verification failed; original records retained.');
      }
    }
    for (const name of sources.filter(name => collectionNames.includes(name))) {
      for await (const record of db.collection(name).find()) {
        if (collectionForSource(record.source) !== name) await db.collection(name).deleteOne({ _id: record._id });
      }
    }
    for (const name of obsolete) await db.collection(name).drop();
    return { migrated, removed: obsolete.length, backup };
  } finally { await file.close(); }
}
