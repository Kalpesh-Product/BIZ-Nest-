import nextEnv from '@next/env';
import { MongoClient, ObjectId } from 'mongodb';
import { writeFile } from 'node:fs/promises';
import { formCollections, collectionNames, ensureFormIndexes } from '../lib/form-collections.mjs';
import { migrateFormCollections } from '../lib/migrate-form-collections.mjs';
import { flattenFormDocuments } from '../lib/flatten-form-documents.mjs';
import { getDatabaseConfig } from '../lib/server-config.mjs';

nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production');
const config = getDatabaseConfig();
const client = new MongoClient(config.uri, config.options);
try {
  await client.connect();
  const db = client.db(config.name);
  const command = process.argv[2] || 'check';
  if (command === 'setup') {
    await Promise.all(collectionNames.map(name => ensureFormIndexes(db, name)));
    console.log(`Database ${db.databaseName}: ${collectionNames.length} form collections and indexes ready.`);
  } else if (command === 'migrate') {
    const result = await migrateFormCollections(db);
    console.log(`Consolidated ${result.migrated} records; removed ${result.removed} obsolete collections.`);
    if (result.backup) console.log(`Verified migration backup: ${result.backup}`);
    const flat = await flattenFormDocuments(db);
    console.log(`Flattened ${flat.flattened} existing submissions.`);
    if (flat.backup) console.log(`Original document backup: ${flat.backup}`);
  } else if (command === 'collections') {
    console.log(JSON.stringify(formCollections, null, 2));
  } else if (command === 'check') {
    await db.command({ ping: 1 });
    console.log(`Database ${db.databaseName}: connected successfully.`);
  } else if (command === 'inquiries') {
    // Server-side operator command only. Never expose personal data via a public API.
    const argument = process.argv[3];
    const selected = collectionNames.includes(argument) ? argument : process.argv[4];
    const id = selected === argument ? undefined : argument;
    if (selected && !collectionNames.includes(selected)) throw new Error('Unknown form collection.');
    const records = (await Promise.all((selected ? [selected] : collectionNames).map(async name => {
      const rows = await db.collection(name).find(id ? { _id: new ObjectId(id) } : {}, { projection: { 'resume.bytes': 0, fingerprint: 0, idempotencyKey: 0 } }).sort({ createdAt: -1 }).limit(20).toArray();
      return rows.map(record => ({ ...record, collection: name }));
    }))).flat().sort((a, b) => b.createdAt - a.createdAt).slice(0, 20);
    console.log(JSON.stringify(records, null, 2));
  } else if (command === 'resume') {
    const [id, output] = process.argv.slice(3);
    if (!ObjectId.isValid(id || '') || !output) throw new Error('Usage: npm run db:resume -- INQUIRY_ID OUTPUT_PATH');
    let record;
    for (const name of collectionNames) {
      record = await db.collection(name).findOne({ _id: new ObjectId(id) }, { projection: { resume: 1 } });
      if (record) break;
    }
    if (!record?.resume?.bytes) throw new Error('No resume found.');
    await writeFile(output, record.resume.bytes.buffer, { flag: 'wx', mode: 0o600 });
    console.log('Resume exported to the requested path.');
  } else throw new Error('Unknown database command.');
} catch {
  console.error('Database command failed. Check MongoDB environment settings, command arguments, and output permissions.');
  process.exitCode = 1;
} finally { await client.close(); }
