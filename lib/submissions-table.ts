import type { Document, Filter } from 'mongodb';
import { businessFieldNames } from './submission-document.mjs';

const answerNames = [...new Set(Object.values(businessFieldNames).flat())];
const labels: Record<string, string> = {
  name: 'Name', email: 'Email', mobile: 'Mobile', count: 'People Count', sdate: 'Preferred Start Date',
  pagename: 'Product / Form', category: 'Category', dob: 'Date of Birth', location: 'Location',
  experience: 'Experience (Years)', linkedin: 'LinkedIn', currentmonthlysalary: 'Current Monthly Salary',
  expectedsalary: 'Expected Salary', canjoin: 'Joining Availability', relocategoa: 'Relocate to Goa',
  personality: 'Personality', skills: 'Skills', specialexperience: 'Relevant Experience',
  willing: 'Startup Willingness', message: 'Message', job_position: 'Job Position',
};
export const tableColumns = [
  { field: 'id', headerName: 'ID' }, { field: 'kind', headerName: 'Type' },
  { field: 'source', headerName: 'Source Page' }, { field: 'status', headerName: 'Status' },
  { field: 'createdAt', headerName: 'Submitted At' }, { field: 'updatedAt', headerName: 'Updated At' },
  ...answerNames.map(field => ({ field, headerName: labels[field] || field })),
  { field: 'notificationStatus', headerName: 'Notification Status' },
  { field: 'hasResume', headerName: 'Has Resume' }, { field: 'resumeFilename', headerName: 'Resume Filename' },
].map(column => ({ ...column, sortable: column.field !== 'hasResume' }));
const sortable: Record<string, string> = Object.fromEntries([
  ['id', '_id'], ...['kind', 'source', 'status', 'createdAt', 'updatedAt'].map(key => [key, key]),
  ...answerNames.map(key => [key, `fields.${key}`]), ['notificationStatus', 'notification.status'], ['resumeFilename', 'resume.filename'],
]);
export class InvalidTableQuery extends Error {}
function number(value: string | null, fallback: number, min: number, max: number) {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value) || Number(value) < min || Number(value) > max) throw new InvalidTableQuery('Invalid pagination or draw value.');
  return Number(value);
}
function date(value: string, end: boolean) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new InvalidTableQuery('Use YYYY-MM-DD for from/to dates.');
  return new Date(`${value}T${end ? '23:59:59.999' : '00:00:00.000'}Z`);
}
export function tableQuery(params: URLSearchParams) {
  const format = params.get('format') || 'table';
  if (!['table', 'datatables'].includes(format)) throw new InvalidTableQuery('Invalid response format.');
  const dataTables = format === 'datatables';
  const pageSize = number(params.get(dataTables ? 'length' : 'pageSize'), 25, 1, 100);
  const offset = dataTables ? number(params.get('start'), 0, 0, 1000000) : (number(params.get('page'), 1, 1, 1000001) - 1) * pageSize;
  if (offset > 1000000) throw new InvalidTableQuery('Pagination offset is too large.');
  const page = Math.floor(offset / pageSize) + 1;
  const draw = dataTables ? number(params.get('draw'), 0, 0, 2147483647) : undefined;
  const filter: Filter<Document> = {};
  const kind = params.get('kind');
  if (kind) {
    if (!['product', 'application', 'partnership'].includes(kind)) throw new InvalidTableQuery('Invalid kind.');
    filter.kind = kind;
  }
  for (const key of ['source', 'status']) {
    const value = params.get(key);
    if (value) {
      if (value.length > 300) throw new InvalidTableQuery('Filter is too long.');
      filter[key] = value;
    }
  }
  const from = params.get('from'); const to = params.get('to');
  if (from || to) {
    const range: { $gte?: Date; $lte?: Date } = {};
    if (from) range.$gte = date(from, false);
    if (to) range.$lte = date(to, true);
    if (range.$gte && range.$lte && range.$gte > range.$lte) throw new InvalidTableQuery('from must be before to.');
    filter.createdAt = range;
  }
  const search = params.get(dataTables ? 'search[value]' : 'search') || '';
  if (search.length > 200) throw new InvalidTableQuery('Search is too long.');
  if (dataTables && params.get('search[regex]') === 'true') throw new InvalidTableQuery('Regex search is not supported.');
  if (search.trim()) {
    const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = ['name', 'email', 'mobile', 'pagename', 'category', 'job_position', 'location', 'message'].map(key => ({ [`fields.${key}`]: { $regex: escaped, $options: 'i' } }));
  }
  let sortBy = params.get('sortBy') || 'createdAt';
  let sortOrder = params.get('sortOrder') || 'desc';
  if (dataTables && params.has('order[0][column]')) {
    const column = number(params.get('order[0][column]'), 0, 0, 100);
    sortBy = params.get(`columns[${column}][data]`) || '';
    sortOrder = params.get('order[0][dir]') || 'asc';
  }
  if (!Object.hasOwn(sortable, sortBy) || !['asc', 'desc'].includes(sortOrder)) throw new InvalidTableQuery('Invalid sort column or direction.');
  const direction = sortOrder === 'asc' ? 1 : -1;
  const sort: Record<string, 1 | -1> = { [sortable[sortBy]]: direction };
  if (sortBy !== 'id') sort._id = direction;
  return { dataTables, pageSize, offset, page, draw, filter, sort };
}

// Inclusion projection prevents attachments, retry keys and future private
// metadata from accidentally leaking through the read API.
export const tableProjection = Object.fromEntries([
  ...['_id', 'kind', 'source', 'status', 'createdAt', 'updatedAt', 'notification.status', 'resume.filename'].map(key => [key, 1]),
  ...answerNames.map(key => [`fields.${key}`, 1]),
]);
export function tableRow(doc: Document) {
  const scalar = (value: unknown) => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : null;
  const iso = (value: unknown) => value instanceof Date ? value.toISOString() : null;
  return {
    id: String(doc._id), kind: scalar(doc.kind), source: scalar(doc.source), status: scalar(doc.status),
    createdAt: iso(doc.createdAt), updatedAt: iso(doc.updatedAt),
    ...Object.fromEntries(answerNames.map(key => [key, scalar(doc.fields?.[key])])),
    notificationStatus: scalar(doc.notification?.status), hasResume: !!doc.resume,
    resumeFilename: scalar(doc.resume?.filename),
  };
}
