import { isDeepStrictEqual } from 'node:util';
import { mkdir, open } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { BSON } from 'mongodb';
import { collectionForSource, collectionNames, companyTypeForSource, legacyCollectionNames, ensureFormIndexes } from './form-collections.mjs';
import { nestedSubmission } from './submission-document.mjs';

export function flatSubmission(record) {
  const normalized = nestedSubmission(record);
  const { fields, ...metadata } = normalized;
  return { ...metadata, ...fields, sourceCompany: 'BIZ Nest',
    ...(collectionForSource(record.source) === 'product' ? { companyType: companyTypeForSource(record.source) } : {}),
  };
}

export async function migrateFormCollections(db) {
  const present = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map(item => item.name));
  const oldNames = ['inquiries', ...legacyCollectionNames, 'inquiries_legacy_backup'].filter(name => present.has(name));
  const sources = [...oldNames, ...collectionNames.filter(name => present.has(name))];
  let needsWork = oldNames.length > 0;
  for (const name of sources) {
    for await (const record of db.collection(name).find()) {
      if (collectionForSource(record.source) === null) throw new Error('Unknown submission source.');
      if (name !== collectionForSource(record.source) || !isDeepStrictEqual(record, flatSubmission(record))) needsWork = true;
    }
  }
  if (!needsWork) return { migrated: 0, nested: 0, removed: 0, backup: null };
  const directory = path.join(process.cwd(), '.reference', 'mongodb-backups');
  await mkdir(directory, { recursive: true });
  const backup = path.join(directory, `form-collections-${randomUUID()}.ndjson`);
  const file = await open(backup, 'wx', 0o600);
  let migrated = 0;
  let flattened = 0;
  try {
    await file.writeFile(BSON.EJSON.stringify({ format: 2, database: db.databaseName, collections: sources }) + '\n');
    const counts = new Map();
    for (const name of sources) {
      let count = 0;
      for await (const record of db.collection(name).find()) {
        await file.writeFile(BSON.EJSON.stringify({ collection: name, document: record }, { relaxed: false }) + '\n');
        count++;
      }
      counts.set(name, count);
    }
    await file.sync();
    for (const name of collectionNames) await ensureFormIndexes(db, name);
    for (const name of sources) {
      for await (const record of db.collection(name).find()) {
        const targetName = collectionForSource(record.source);
        const target = db.collection(targetName);
        const expected = flatSubmission(record);
        const existing = await target.findOne({ _id: record._id });
        if (existing && !isDeepStrictEqual(flatSubmission(existing), expected)) throw new Error('Conflicting submission copies.');
        if (!existing) await target.insertOne(expected);
        else if (!isDeepStrictEqual(existing, expected)) {
          const result = await target.replaceOne(existing, expected);
          if (result.matchedCount !== 1) throw new Error('Submission changed during migration.');
        }
        if (!isDeepStrictEqual(expected, await target.findOne({ _id: record._id }))) throw new Error('Submission copy verification failed.');
        if (name !== targetName) migrated++;
        if (record.fields) flattened++;
      }
    }
    for (const name of oldNames) {
      if (await db.collection(name).countDocuments() !== counts.get(name)) throw new Error('Old collection changed during migration.');
      for await (const record of db.collection(name).find()) {
        const copy = await db.collection(collectionForSource(record.source)).findOne({ _id: record._id });
        if (!isDeepStrictEqual(flatSubmission(record), copy)) throw new Error('Final submission verification failed.');
      }
    }
    for (const name of oldNames) await db.collection(name).drop();
    return { migrated, nested: flattened, removed: oldNames.length, backup };
  } finally {
    await file.close();
  }
}
