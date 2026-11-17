import { createHash, timingSafeEqual } from 'node:crypto';
import { database } from '@/lib/mongodb';
import { getSubmissionsApiConfig } from '@/lib/server-config.mjs';
import { InvalidTableQuery, tableColumns, tableProjection, tableQuery, tableRow } from '@/lib/submissions-table';
import { collectionNames } from '@/lib/form-collections.mjs';

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
    const db = await database();
    const kinds = query.filter.kind === 'application' ? ['career'] : query.filter.kind === 'partnership' ? ['partner'] : query.filter.kind === 'product' ? ['product'] : collectionNames;
    const collections = kinds.map(name => db.collection(name));
    const [counts, filteredCounts, pages] = await Promise.all([
      Promise.all(collections.map(collection => collection.countDocuments({}, { maxTimeMS: 5000 }))),
      Promise.all(collections.map(collection => collection.countDocuments(query.filter, { maxTimeMS: 5000 }))),
      Promise.all(collections.map(collection => collection.find(query.filter, { projection: tableProjection, maxTimeMS: 5000 })
        .sort(query.sort).limit(query.offset + query.pageSize).toArray())),
    ]);
    const total = kinds.length === collectionNames.length ? counts.reduce((sum, count) => sum + count, 0)
      : (await Promise.all(collectionNames.map(name => db.collection(name).countDocuments({}, { maxTimeMS: 5000 }))))
        .reduce((sum, count) => sum + count, 0);
    const filteredTotal = filteredCounts.reduce((sum, count) => sum + count, 0);
    const [[sortField, direction], [tieField]] = Object.entries(query.sort);
    const documents = pages.flat().sort((a, b) => {
      const left = sortField.split('.').reduce((value, key) => value?.[key], a);
      const right = sortField.split('.').reduce((value, key) => value?.[key], b);
      if (left !== right) return (left == null ? -1 : right == null ? 1 : left > right ? 1 : -1) * direction;
      if (!tieField) return 0;
      return String(a._id).localeCompare(String(b._id)) * direction;
    }).slice(query.offset, query.offset + query.pageSize);
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
