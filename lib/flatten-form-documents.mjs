import { mkdir, open } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { BSON } from 'mongodb';
import { collectionNames, collectionForSource } from './form-collections.mjs';
import { flatSubmission } from './submission-document.mjs';

export async function flattenFormDocuments(db) {
  const query = { fields: { $exists: true } };
  let count = 0;
  // Validate all records before writing a backup or changing any document.
  for (const name of collectionNames) {
    for await (const record of db.collection(name).find(query)) {
      if (collectionForSource(record.source) !== name) throw new Error('Unexpected submission collection; consolidate first.');
      flatSubmission(name, record);
      count++;
    }
  }
  if (!count) return { flattened: 0, backup: null };
  const directory = path.join(process.cwd(), '.reference', 'mongodb-backups');
  await mkdir(directory, { recursive: true });
  const backup = path.join(directory, `form-flattening-${randomUUID()}.ndjson`);
  const file = await open(backup, 'wx', 0o600);
  try {
    await file.writeFile(BSON.EJSON.stringify({ format: 1, database: db.databaseName, collections: collectionNames, createdAt: new Date() }) + '\n');
    for (const name of collectionNames) {
      for await (const record of db.collection(name).find(query)) {
        await file.writeFile(BSON.EJSON.stringify({ collection: name, document: record }, { relaxed: false }) + '\n');
      }
    }
    await file.sync();
    let flattened = 0;
    for (const name of collectionNames) {
      const collection = db.collection(name);
      for await (const record of collection.find(query)) {
        const flat = flatSubmission(name, record);
        // Change only business fields. Concurrent notification/status updates
        // are preserved, as are IDs, timestamps, resumes and retry fingerprints.
        const answers = Object.fromEntries(Object.keys(record.fields).map(key => [key, flat[key]]));
        const result = await collection.updateOne({ _id: record._id, fields: record.fields }, { $set: answers, $unset: { fields: '' } });
        if (result.modifiedCount !== 1) throw new Error('A submission changed during migration; original backup retained.');
        const current = await collection.findOne({ _id: record._id });
        for (const [key, value] of Object.entries(answers)) {
          if (!isDeepStrictEqual(current?.[key], value)) throw new Error('Flat field verification failed; backup retained.');
        }
        if (Object.hasOwn(current, 'fields')) throw new Error('Nested fields were not removed.');
        flattened++;
      }
    }
    return { flattened, backup };
  } finally { await file.close(); }
}
