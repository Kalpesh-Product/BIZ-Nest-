import { createHash, timingSafeEqual } from 'node:crypto';
import { database } from '@/lib/mongodb';
import { getSubmissionsApiConfig } from '@/lib/server-config.mjs';
import { InvalidTableQuery, tableColumns, tableProjection, tableQuery, tableRow } from '@/lib/submissions-table';

function access(request: Request) {
  const config = getSubmissionsApiConfig();
  const origin = request.headers.get('origin');
  const sameOrigin = origin === new URL(request.url).origin;
  const allowed = !origin || sameOrigin || config.origins.includes(origin);
  const headers = new Headers({ 'Cache-Control': 'private, no-store', Vary: 'Origin, Authorization', 'X-Content-Type-Options': 'nosniff' });
  if (origin && allowed) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  }
  return { ...config, allowed, headers };
}

export async function OPTIONS(request: Request) {
  const { allowed, headers } = access(request);
  return new Response(null, { status: allowed ? 204 : 403, headers });
}

export async function GET(request: Request) {
  const { allowed, headers, key } = access(request);
  const reply = (message: string, status: number) => Response.json({ message }, { status, headers });
  if (!allowed) return reply('Origin not allowed.', 403);
  if (!key) return reply('Submissions read API is not configured.', 503);
  const supplied = request.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1] || '';
  const hash = (value: string) => createHash('sha256').update(value).digest();
  if (!timingSafeEqual(hash(supplied), hash(key))) {
    headers.set('WWW-Authenticate', 'Bearer');
    return reply('Invalid or missing API key.', 401);
  }
  try {
    const query = tableQuery(new URL(request.url).searchParams);
    const collection = (await database()).collection('inquiries');
    const [total, filteredTotal, documents] = await Promise.all([
      collection.countDocuments({}, { maxTimeMS: 5000 }),
      collection.countDocuments(query.filter, { maxTimeMS: 5000 }),
      collection.find(query.filter, { projection: tableProjection, maxTimeMS: 5000 }).sort(query.sort).skip(query.offset).limit(query.pageSize).toArray(),
    ]);
    const data = documents.map(tableRow);
    return Response.json(query.dataTables
      ? { draw: query.draw, recordsTotal: total, recordsFiltered: filteredTotal, data }
      : { data, pagination: { page: query.page, pageSize: query.pageSize, total, filteredTotal, totalPages: Math.ceil(filteredTotal / query.pageSize), hasNextPage: query.offset + data.length < filteredTotal }, columns: tableColumns },
    { headers });
  } catch (error) {
    if (error instanceof InvalidTableQuery) return reply(error.message, 400);
    console.error('Submissions read operation failed.');
    return reply('Unable to fetch submissions. Please try again later.', 503);
  }
}
