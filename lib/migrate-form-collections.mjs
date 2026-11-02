import { isDeepStrictEqual } from 'node:util';
import { mkdir, open } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { BSON } from 'mongodb';
import { legacyCollectionNames, ensureFormIndexes } from './form-collections.mjs';
import { nestedSubmission } from './submission-document.mjs';

export async function migrateFormCollections(db) {
  const present = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map(item => item.name));
  const obsolete = [...legacyCollectionNames, 'inquiries_legacy_backup'].filter(name => present.has(name));
  const sources = [...(present.has('inquiries') ? ['inquiries'] : []), ...obsolete];
  let needsNesting = false;
  // Validate every source and detect conflicting values before any mutations.
  for (const name of sources) {
    for await (const record of db.collection(name).find()) {
      if (!isDeepStrictEqual(record, nestedSubmission(record))) needsNesting = true;
    }
  }
  if (!obsolete.length && !needsNesting) return { migrated: 0, nested: 0, removed: 0, backup: null };
  const directory = path.join(process.cwd(), '.reference', 'mongodb-backups');
  await mkdir(directory, { recursive: true });
  const backup = path.join(directory, `unified-inquiries-${randomUUID()}.ndjson`);
  const file = await open(backup, 'wx', 0o600);
  const counts = new Map();
  let migrated = 0;
  let nested = 0;
  try {
    await file.writeFile(BSON.EJSON.stringify({ format: 1, database: db.databaseName, collections: sources, createdAt: new Date() }) + '\n');
    for (const name of sources) {
      let count = 0;
      for await (const record of db.collection(name).find()) {
        await file.writeFile(BSON.EJSON.stringify({ collection: name, document: record }, { relaxed: false }) + '\n');
        count++;
      }
      counts.set(name, count);
    }
    await file.sync();
    await ensureFormIndexes(db, 'inquiries');
    const target = db.collection('inquiries');
    for (const name of sources) {
      for await (const record of db.collection(name).find()) {
        const expected = nestedSubmission(record);
        const existing = name === 'inquiries' ? record : await target.findOne({ _id: record._id });
        if (existing && !isDeepStrictEqual(nestedSubmission(existing), expected)) throw new Error('Conflicting copies; original records retained.');
        if (!existing) await target.insertOne(expected);
        else if (!isDeepStrictEqual(existing, expected)) {
          // Match the complete snapshot so concurrent changes are never overwritten.
          const result = await target.replaceOne(existing, expected);
          if (result.matchedCount !== 1) throw new Error('Submission changed during migration; backup retained.');
        }
        if (!isDeepStrictEqual(record, expected)) nested++;
        if (name !== 'inquiries') migrated++;
        if (!isDeepStrictEqual(expected, await target.findOne({ _id: record._id }))) throw new Error('Copy verification failed; original records retained.');
      }
    }
    for (const name of obsolete) {
      if (await db.collection(name).countDocuments() !== counts.get(name)) throw new Error('Legacy records changed; stop old writers and retry.');
      for await (const record of db.collection(name).find()) {
        if (!isDeepStrictEqual(nestedSubmission(record), await target.findOne({ _id: record._id }))) throw new Error('Final verification failed; original records retained.');
      }
    }
    for (const name of obsolete) await db.collection(name).drop();
    return { migrated, nested, removed: obsolete.length, backup };
  } finally { await file.close(); }
}
