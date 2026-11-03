import assert from 'node:assert/strict';
import { readFile, unlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { randomUUID, createHash } from 'node:crypto';
import nextEnv from '@next/env';
import { MongoClient, ObjectId, Binary, BSON } from 'mongodb';
import { collectionForSource, collectionNames, ensureFormIndexes } from '../lib/form-collections.mjs';
import { migrateFormCollections } from '../lib/migrate-form-collections.mjs';
import { nestedSubmission } from '../lib/submission-document.mjs';
import { getDatabaseConfig } from '../lib/server-config.mjs';

nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production');
const dbName = `biznest_test_${randomUUID().replaceAll('-', '')}`;
const port = Number(process.env.BACKEND_TEST_PORT || 3013);
const base = `http://127.0.0.1:${port}`;
const databaseConfig = getDatabaseConfig();
const client = new MongoClient(databaseConfig.uri, databaseConfig.options);
const db = client.db(dbName);
const contracts = JSON.parse(await readFile('content/form-contracts.json', 'utf8'));
const readKey = randomUUID()+randomUUID();
let notifications = 0;
const receiver = createServer(async (req, res) => {
  for await (const chunk of req) void chunk;
  notifications++;
  res.writeHead(503).end(); // Persistence must succeed even when notifications fail.
});
let server;
let output = '';
let migrationBackup;
function payload(source, email = `fixture-${randomUUID()}@example.test`) {
  const data = new FormData();
  data.set('source', encodeURI(source));
  for (const field of contracts[source][0]) {
    let value = field.value || `Test ${field.name}`;
    if (field.options) value = field.options.find(Boolean) || '';
    if (field.type === 'number') value = '2';
    if (field.type === 'date') value = field.name === 'dob' ? '2000-01-01' : '2030-01-01';
    if (field.name === 'email') value = email;
    if (field.name === 'mobile') value = '9876543210';
    if (field.type === 'file') { data.set(field.name, new File(['%PDF-1.4\nTest resume\n%%EOF'], 'resume.pdf', { type: 'application/pdf' })); continue; }
    data.set(field.name, value);
  }
  return data;
}
async function totalRecords() { return (await Promise.all(collectionNames.map(name => db.collection(name).countDocuments()))).reduce((a, b) => a + b, 0); }
async function post(data, headers = {}) {
  const response = await fetch(`${base}/api/inquiry`, { method: 'POST', body: data, headers, signal: AbortSignal.timeout(25_000) });
  // Drain every response, including negative tests, before reusing its socket.
  return new Response(await response.arrayBuffer(), { status: response.status, headers: response.headers });
}
async function startServer(uri = databaseConfig.uri) {
  output = '';
  server = spawn(process.execPath, ['scripts/serve.mjs', 'start'], {
    env: { ...process.env, PORT: String(port), MONGODB_URI: uri, MONGODB_DB: dbName, SUBMISSIONS_API_KEY: readKey, SUBMISSIONS_ALLOWED_ORIGINS: 'http://localhost:4200',
      MAX_REQUEST_BYTES: '6000000', MAX_RESUME_BYTES: '5000000', INQUIRY_RATE_LIMIT_MAX: '10', INQUIRY_RATE_LIMIT_WINDOW_MS: '900000',
      INQUIRY_WEBHOOK_URL: `http://127.0.0.1:${receiver.address().port}`, INQUIRY_WEBHOOK_TOKEN: '', INQUIRY_WEBHOOK_TIMEOUT_MS: '15000' },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  server.stdout.on('data', chunk => { output += chunk; });
  server.stderr.on('data', chunk => { output += chunk; });
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(`Test server exited: ${output}`);
    try { if (output.includes('Ready in') && (await fetch(base)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('Isolated production server did not start.');
}
try {
  await client.connect();
  await new Promise(resolve => receiver.listen(0, '127.0.0.1', resolve));
  // Seed all prior storage layouts; verify one collection and nested answers.
  await ensureFormIndexes(db, 'inquiries');
  const legacyRecord = { _id: new ObjectId(), source: '/partner.html', kind: 'partnership', name: 'Migration fixture', idempotencyKey: randomUUID(), resume: { bytes: new Binary(Buffer.from('fixture')) }, createdAt: new Date() };
  const legacyJob = { ...legacyRecord, _id: new ObjectId(), source: '/career_ApplyNow.html', kind: 'application' };
  await db.collection('partnerships').insertOne(legacyRecord);
  await db.collection('jobApplications').insertOne(legacyJob);
  const olderRecord = { _id: new ObjectId(), source: '/partner.html', kind: 'partnership', fields: { name: 'Already nested fixture' }, createdAt: new Date() };
  await db.collection('forms_partner').insertOne(olderRecord);
  await db.createCollection('forms_career_applynow');
  await db.createCollection('inquiries_legacy_backup');
  const retrySource = '/Co-Working_Goa.html';
  const retryData = payload(retrySource);
  const retryFields = Object.fromEntries([...retryData].filter(([key]) => key !== 'source'));
  const retryKey = randomUUID();
  const retryRecord = { ...retryFields, _id: new ObjectId(), source: retrySource, kind: 'product', idempotencyKey: retryKey,
    fingerprint: createHash('sha256').update(JSON.stringify([retrySource, retryFields])).update('').digest('hex'),
    status: 'new', createdAt: new Date(), updatedAt: new Date(), notification: { status: 'disabled' } };
  await db.collection('inquiries').insertOne(retryRecord);
  const migration = await migrateFormCollections(db);
  migrationBackup = migration.backup;
  assert.equal(migration.migrated, 3);
  assert.equal(migration.nested, 3);
  assert.equal(migration.removed, 5);
  for (const original of [legacyRecord, legacyJob, olderRecord, retryRecord]) {
    assert.deepEqual(await db.collection('inquiries').findOne({ _id: original._id }), nestedSubmission(original));
  }
  const backupRows = (await readFile(migrationBackup, 'utf8')).trim().split('\n').map(line => BSON.EJSON.parse(line));
  assert.ok(backupRows.some(row => row.document?._id.equals(legacyJob._id) && row.document.name === 'Migration fixture' && row.document.resume.bytes.buffer.toString() === 'fixture'));
  assert.deepEqual(await migrateFormCollections(db), { migrated: 0, nested: 0, removed: 0, backup: null });
  assert.throws(() => nestedSubmission({ source: '/partner.html', fields: { status: 'forged' } }));
  assert.throws(() => nestedSubmission({ source: '/partner.html', email: 'different@example.test', fields: { email: 'original@example.test' } }));
  await startServer();
  const replayAfterMigration = await post(retryData, { 'Idempotency-Key': retryKey });
  assert.equal(replayAfterMigration.status, 200);
  assert.equal((await replayAfterMigration.json()).id, retryRecord._id.toHexString(), 'Existing retry keys survive consolidation and nesting');
  // Every schema is exercised against HTTP and checked in MongoDB, not mocked.
  for (const source of Object.keys(contracts)) {
    const response = await post(payload(source));
    assert.equal(response.status, 200, `${source}: ${await response.clone().text()}`);
    const { id } = await response.json();
    const stored = await db.collection(collectionForSource(source)).findOne({ _id: new ObjectId(id) });
    assert.equal(stored.source, source);
    assert.equal(Object.hasOwn(stored, 'name'), false);
    assert.ok(stored.fields);
    assert.equal(stored.fields.name, 'Test name');
    assert.ok(stored.fields.email.endsWith('@example.test'));
    assert.equal(stored.status, 'new');
    assert.equal(stored.notification.status, 'failed');
    if (source.startsWith('/career_')) {
      assert.equal(stored.kind, 'application');
      assert.equal(stored.resume.bytes.buffer.toString(), '%PDF-1.4\nTest resume\n%%EOF');
    }
  }
  assert.deepEqual(collectionNames, ['inquiries']);
  assert.deepEqual((await db.listCollections({}, { nameOnly: true }).toArray()).map(row => row.name).sort(), [...collectionNames, 'submission_limits'].sort());
  for (const name of collectionNames) {
    for await (const record of db.collection(name).find({}, { projection: { source: 1 } })) assert.equal(collectionForSource(record.source), name, 'Collections must group submissions by purpose');
  }
  console.log('PASS: unified inquiries collection with nested fields, verified migration/backups, retry compatibility, and resume bytes.');
  const source = '/partner.html';
  const key = randomUUID();
  const data = payload(source);
  data.set('pagename', 'forged identifier');
  const responses = await Promise.all([post(data, { 'Idempotency-Key': key }), post(data, { 'Idempotency-Key': key })]);
  const ids = await Promise.all(responses.map(async response => { assert.equal(response.status, 200); return (await response.json()).id; }));
  assert.equal(ids[0], ids[1]);
  assert.equal(await db.collection(collectionForSource(source)).countDocuments({ idempotencyKey: key }), 1);
  assert.equal((await db.collection(collectionForSource(source)).findOne({ _id: new ObjectId(ids[0]) })).fields.pagename, 'Partner');
  const sent = notifications;
  assert.equal((await post(data, { 'Idempotency-Key': key })).status, 200);
  assert.equal(notifications, sent, 'A replay must not resend notifications');
  assert.equal((await post(payload('/Co-Working_Goa.html'), { 'Idempotency-Key': key })).status, 200, 'Retry keys are independent between forms');
  assert.equal((await post(payload('/Workation_Goa.html'), { 'Idempotency-Key': key })).status, 200, 'Different product forms can reuse keys inside inquiries');
  data.set('name', 'Changed');
  assert.equal((await post(data, { 'Idempotency-Key': key })).status, 409);
  const invalid = [
    form => form.delete('message'), form => form.set('email', 'invalid'),
    form => form.set('source', '/unknown.html'), form => form.append('name', 'Duplicate'),
    form => form.set('$where', 'invalid'), form => form.set('mobile', '0123456789'),
  ];
  const before = await totalRecords();
  for (const mutate of invalid) { const form = payload(source); mutate(form); assert.equal((await post(form)).status, 400); }
  assert.equal((await post(payload(source), { Origin: 'https://other.example' })).status, 403);
  assert.equal((await fetch(`${base}/api/inquiry`)).status, 405, 'No public listing of personal data');
  const job = '/career_ApplyNow.html';
  for (const file of [new File(['not pdf'], 'fake.pdf'), new File(['%PDF-'], 'bad.exe'), new File(['%PDF-' + 'x'.repeat(5_000_000)], 'big.pdf')]) {
    const form = payload(job); form.set('resume', file); assert.equal((await post(form)).status, 400);
  }
  const form = payload(job); form.set('resume', new File(['%PDF-' + 'x'.repeat(6_000_000)], 'huge.pdf'));
  assert.equal((await post(form)).status, 413);
  const chunked = new ReadableStream({ start(controller) { for (let i = 0; i < 7; i++) controller.enqueue(new Uint8Array(1_000_000)); controller.close(); } });
  const oversized = await fetch(`${base}/api/inquiry`, { method: 'POST', body: chunked, duplex: 'half', signal: AbortSignal.timeout(25_000), headers: { 'Content-Type': 'multipart/form-data; boundary=test', Connection: 'close' } });
  assert.equal(oversized.status, 413);
  await oversized.arrayBuffer();
  assert.equal(await totalRecords(), before, 'Invalid submissions must not persist');
  console.log('PASS: retries, canonical metadata, validation, privacy, and oversized bodies.');

  // The external read API is authenticated, bounded and safe for table rows.
  const api = '/api/submissions';
  const auth = { Authorization: `Bearer ${readKey}` };
  assert.equal((await fetch(base+api)).status, 401);
  assert.equal((await fetch(base+api, {headers:{Authorization:'Bearer incorrect'}})).status, 401);
  assert.equal((await fetch(base+api, {headers:{...auth,Origin:'https://blocked.example'}})).status, 403);
  const preflight=await fetch(base+api, {method:'OPTIONS',headers:{Origin:'http://localhost:4200','Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'authorization'}});
  assert.equal(preflight.status,204);
  assert.equal(preflight.headers.get('access-control-allow-origin'),'http://localhost:4200');
  const response=await fetch(base+api+'?pageSize=100&sortBy=createdAt&sortOrder=asc', {headers:{...auth,Origin:'http://localhost:4200'}});
  assert.equal(response.status,200);
  assert.ok(response.headers.get('cache-control').includes('no-store'));
  const table=await response.json();
  assert.equal(table.pagination.total,await totalRecords());
  assert.equal(table.data.length,table.pagination.total);
  assert.equal(table.pagination.hasNextPage,false);
  assert.ok(table.columns.some(column=>column.field==='email' && column.headerName==='Email'));
  const shape=Object.keys(table.data[0]).sort();
  for(const row of table.data){
    assert.deepEqual(Object.keys(row).sort(),shape);
    for(const key of ['fields','resume','fingerprint','idempotencyKey'])assert.equal(Object.hasOwn(row,key),false);
    assert.equal(typeof row.id,'string');
  }
  const career=table.data.find(row=>row.kind==='application' && row.resumeFilename==='resume.pdf');
  assert.equal(career.resumeFilename,'resume.pdf');
  assert.equal(career.pagename,null);
  const filtered=await (await fetch(base+api+'?kind=partnership&search=fixture&pageSize=1', {headers:auth})).json();
  assert.equal(filtered.data.length,1);
  assert.ok(filtered.pagination.filteredTotal<filtered.pagination.total);
  assert.equal(filtered.data[0].kind,'partnership');
  const literal=await (await fetch(base+api+'?search='+encodeURIComponent('[.*'), {headers:auth})).json();
  assert.equal(literal.data.length,0,'Search input must not act as a regex');
  for(const query of ['pageSize=101','page=0','sortBy=fingerprint','from=invalid','from=2030-01-02&to=2020-01-01','kind=unknown'])assert.equal((await fetch(base+api+'?'+query,{headers:auth})).status,400);
  const dtQuery=new URLSearchParams({format:'datatables',draw:'7',start:'0',length:'2','search[value]':'fixture','order[0][column]':'0','columns[0][data]':'name','order[0][dir]':'asc'});
  const dt=await (await fetch(base+api+'?'+dtQuery,{headers:auth})).json();
  assert.equal(dt.draw,7);assert.equal(dt.recordsTotal,table.pagination.total);assert.equal(dt.data.length,2);assert.ok(dt.recordsFiltered>=2);
  console.log('PASS: protected table API, consistent rows, pagination/filtering/sorting, escaped search, DataTables responses, CORS and private-field exclusion.');

  for (let i = 0; i < 10; i++) assert.equal((await post(payload(i % 2 ? '/Co-Working_Goa.html' : source, 'rate-limit@example.test'))).status, 200);
  assert.equal((await post(payload(source, 'rate-limit@example.test'))).status, 429);
  const stopped = once(server, 'exit'); server.kill(); await stopped;
  await startServer('mongodb://127.0.0.1:1');
  assert.equal((await post(payload(source))).status, 503, 'Database failure must never return success');
  assert.equal((await fetch(base+'/api/submissions',{headers:{Authorization:`Bearer ${readKey}`}})).status,503);
  console.log(`PASS: ${Object.keys(contracts).length} form pages persisted; resumes, canonical metadata, concurrent retries, notification/database failure, origin/field/file/body validation, privacy and rate limiting verified.`);
} finally {
  if (server && server.exitCode === null) { const stopped = once(server, 'exit'); server.kill(); await stopped; }
  receiver.closeAllConnections();
  await new Promise(resolve => receiver.close(resolve));
  // This randomly named database is owned exclusively by this test run.
  assert.match(dbName, /^biznest_test_[a-f0-9]{32}$/);
  await db.dropDatabase();
  await client.close();
  if (migrationBackup) await unlink(migrationBackup);
}
