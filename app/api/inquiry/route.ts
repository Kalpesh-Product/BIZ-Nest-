import { createHash } from 'node:crypto';
import { Binary, MongoServerError, ObjectId } from 'mongodb';
import { database } from '@/lib/mongodb';
import { InvalidInquiry, validateInquiry } from '@/lib/inquiry-validation';
import { collectionForSource, ensureFormIndexes } from '@/lib/form-collections.mjs';
import { businessFieldsFor } from '@/lib/submission-document.mjs';
import { getInquiryConfig } from '@/lib/server-config.mjs';

const settings = getInquiryConfig();
const reply = (message: string, status = 200, id?: string) => Response.json({ message, ...(id ? { id } : {}) }, { status, headers: { 'Cache-Control': 'no-store' } });
const accepted = (id: string) => reply('Thank you! Your inquiry has been received.', 200, id);

async function readForm(request: Request) {
  if (Number(request.headers.get('content-length') || 0) > settings.requestMaxBytes) throw new RangeError();
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data')) throw new InvalidInquiry('Invalid form data.');
  const reader = request.body?.getReader();
  if (!reader) throw new InvalidInquiry('Invalid form data.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > settings.requestMaxBytes) { await reader.cancel(); throw new RangeError(); }
      chunks.push(next.value);
    }
    return await new Response(Buffer.concat(chunks), { headers: { 'Content-Type': request.headers.get('content-type')! } }).formData();
  } finally { reader.releaseLock(); }
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return reply('Invalid request origin.', 403);
  const key = request.headers.get('idempotency-key');
  if (key && !/^[a-zA-Z0-9-]{16,100}$/.test(key)) return reply('Invalid submission identifier.', 400);
  let data: FormData;
  let inquiry: Awaited<ReturnType<typeof validateInquiry>>;
  try { data = await readForm(request); inquiry = await validateInquiry(data); }
  catch (error) {
    if (error instanceof RangeError) return reply(`Please keep attachments under ${settings.resumeMaxBytes / 1_000_000} MB.`, 413);
    return reply(error instanceof InvalidInquiry ? error.message : 'Invalid form data.', 400);
  }
  try {
    const db = await database();
    const collectionName = collectionForSource(inquiry.source);
    if (!collectionName) return reply('Invalid source page.', 400);
    await ensureFormIndexes(db, collectionName);
    const inquiries = db.collection(collectionName);
    const fingerprint = createHash('sha256').update(JSON.stringify([inquiry.source, inquiry.fields])).update(inquiry.resume?.bytes || '').digest('hex');
    const replay = async () => {
      const previous = await inquiries.findOne({ source: inquiry.source, idempotencyKey: key }, { projection: { fingerprint: 1 } });
      return previous ? previous.fingerprint === fingerprint ? accepted(previous._id.toHexString()) : reply('This submission identifier was already used.', 409) : null;
    };
    if (key) { const previous = await replay(); if (previous) return previous; }
    const now = new Date();
    // Atomic shared limit; temporary records contain an email hash, not its value.
    const bucket = Math.floor(now.getTime() / settings.rateLimitWindowMs);
    const limitKey = createHash('sha256').update(`${inquiry.fields.email.toLowerCase()}:${bucket}`).digest('hex');
    const limit = await db.collection<{ _id: string; count: number; expiresAt: Date }>('submission_limits').findOneAndUpdate({ _id: limitKey }, {
      $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((bucket + 2) * settings.rateLimitWindowMs) },
    }, { upsert: true, returnDocument: 'after' });
    if (limit && limit.count > settings.rateLimitMax) return reply(`Too many submissions. Please try again in ${Math.ceil(settings.rateLimitWindowMs / 60000)} minutes.`, 429);
    const webhook = settings.webhookUrl;
    let id: string;
    try {
      const { resume, source, kind, fields } = inquiry;
      const result = await inquiries.insertOne({ ...businessFieldsFor(collectionName, fields), source, kind,
        ...(resume ? { resume: { ...resume, bytes: new Binary(resume.bytes) } } : {}),
        ...(key ? { idempotencyKey: key } : {}), fingerprint, status: 'new', createdAt: now, updatedAt: now,
        notification: { status: webhook ? 'pending' : 'disabled' },
      });
      id = result.insertedId.toHexString();
    } catch (error) {
      if (key && error instanceof MongoServerError && error.code === 11000) { const previous = await replay(); if (previous) return previous; }
      throw error;
    }
    // Database persistence is authoritative; optional notification failure must
    // never report an already saved submission as lost.
    if (webhook) {
      let status = 'failed';
      try {
        for (const [name, value] of Object.entries(inquiry.fields)) data.set(name, value);
        const response = await fetch(webhook, { method: 'POST', body: data, signal: AbortSignal.timeout(settings.webhookTimeoutMs),
          headers: { 'Idempotency-Key': id, ...(settings.webhookToken ? { Authorization: `Bearer ${settings.webhookToken}` } : {}) } });
        if (response.ok) status = 'delivered';
        await response.body?.cancel();
      } catch { /* Stored separately for operator review. */ }
      try { await inquiries.updateOne({ _id: new ObjectId(id) }, { $set: { notification: { status, attemptedAt: new Date() }, updatedAt: new Date() } }); }
      catch { console.error('Inquiry notification status update failed.'); }
    }
    return accepted(id);
  } catch {
    console.error('Inquiry database operation failed. Check MongoDB availability and configuration.');
    return reply('We could not save your inquiry. Please try again or email response@biznest.co.in.', 503);
  }
}
