import { ObjectId } from 'mongodb';
import { collectionNames, companySubtypeForSource } from '@/lib/form-collections.mjs';
import { InvalidInquiry, validateSubmissionEdits } from '@/lib/inquiry-validation';
import { database } from '@/lib/mongodb';
import { submissionsAccess } from '@/lib/submissions-access';
import { tableProjection, tableRow } from '@/lib/submissions-table';

const maxPatchBytes = 128 * 1024;

async function readPatch(request: Request): Promise<Record<string, unknown>> {
  if (Number(request.headers.get('content-length')) > maxPatchBytes) throw new RangeError();
  const reader = request.body?.getReader();
  if (!reader) throw new InvalidInquiry('Send a non-empty JSON object.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxPatchBytes) { await reader.cancel(); throw new RangeError(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const patch: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!patch || typeof patch !== 'object' || Array.isArray(patch) || !Object.keys(patch).length) {
    throw new InvalidInquiry('Send a non-empty JSON object.');
  }
  return patch as Record<string, unknown>;
}

export async function OPTIONS(request: Request) {
  return submissionsAccess(request, 'PATCH').preflight();
}

export async function PATCH(request: Request, { params }: { params: Promise<{ collection: string; id: string }> }) {
  const { headers, reply, authorize } = submissionsAccess(request, 'PATCH');
  const denied = authorize();
  if (denied) return denied;

  const { collection, id } = await params;
  if (!collectionNames.includes(collection)) return reply('Unknown submission collection.', 404);
  if (!/^[0-9a-f]{24}$/i.test(id)) return reply('Use the submission ID returned by the list API.', 400);
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return reply('Use Content-Type: application/json.', 415);
  }

  let input: Record<string, unknown>;
  try { input = await readPatch(request); }
  catch (error) {
    if (error instanceof RangeError) return reply('The edit exceeds 128 KiB.', 413);
    return reply(error instanceof InvalidInquiry ? error.message : 'Invalid JSON body.', 400);
  }

  try {
    const submissions = (await database()).collection(collection);
    const _id = new ObjectId(id);
    const record = await submissions.findOne({ _id }, { projection: { source: 1 } });
    if (!record) return reply('Submission not found in this collection.', 404);
    const fields = validateSubmissionEdits(record.source, input);
    const updated = await submissions.findOneAndUpdate(
      { _id, source: record.source },
      { $set: {
        ...fields,
        ...(collection === 'product' && record.source === '/Virtualoffice_Goa.html' && Object.hasOwn(fields, 'category')
          ? { companySubtype: companySubtypeForSource(record.source, fields.category) } : {}),
      }, $currentDate: { updatedAt: true } },
      { projection: tableProjection, returnDocument: 'after' },
    );
    if (!updated) return reply('Submission not found in this collection.', 404);
    return Response.json({ data: tableRow(updated) }, { headers });
  } catch (error) {
    if (error instanceof InvalidInquiry) return reply(error.message, 400);
    console.error('Submissions update operation failed.');
    return reply('Unable to update submission. Please try again later.', 503);
  }
}
