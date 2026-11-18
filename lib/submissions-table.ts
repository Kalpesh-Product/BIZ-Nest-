import type { Document, Filter } from 'mongodb';
import { businessFieldNames } from './submission-document.mjs';

const subscriptionSources = {
  'work-from-cafe': '/Cafe.html',
  'car-renting': '/Car_Renting.html',
  'co-living-space': '/Co-Living_Space.html',
  'co-working-space': '/Co-Working_Space.html',
  'exclusive-campus': '/Exclusive_Campus.html',
  'exclusive-workations': '/Exclusive_Workations.html',
  'managed-workspace': '/Managed_Workspace.html',
  'meetings-and-conferences': '/Meetings&Conferences.html',
  'private-apartments-villas': '/Private_Apartments_Villas.html',
  'private-workspace': '/Private_Workspace.html',
  'training-and-events': '/Trainings&Events.html',
  'virtual-office': '/Virtual_Office.html',
  'yacht-renting': '/Yatch_Renting.html',
};
const productSources = {
  'co-working-goa': '/Co-Working_Goa.html',
  'meeting-rooms-goa': '/Meetingrooms_Goa.html',
  'virtual-office-goa': '/Virtualoffice_Goa.html',
  'workation-goa': '/Workation_Goa.html',
};
const applicationSources = {
  'open-job-application': '/career_ApplyNow.html',
  'assistant-manager-civil-maintenance': '/career_Asst_Manager_Civil_Maintanance.html',
  'executive-assistant-to-ceo': '/career_Executive_Assistant_to_CEO.html',
  'finance-intern': '/career_Finance_Intern.html',
  'full-stack-react-developer': '/career_FullStack_React _Developer.html',
  'hr-generalist': '/career_HR_Generalist.html',
  'interiors-civil-engineer': '/career_Interiors_Civil_Engineer.html',
  'junior-executive-receptionist': '/career_Jr_Executive_Receptionist.html',
  'junior-network-engineer': '/career_Jr_Network_Engineer.html',
  'junior-ui-ux-developer': '/career_Jr_UI_UX_Developer.html',
  'legal-associate': '/career_Legal_Associate.html',
  'maintenance-executive': '/career_Maintenance_Executive.html',
  'marketing-analytics': '/career_Marketing_Analytics.html',
  'php-developer': '/career_PHP_Developer.html',
  'receptionist-admin-associate': '/career_Receptionist_Admin_Associate.html',
  'social-media-marketing': '/career_Social_Media_Marketing.html',
  'senior-manager-sales-business-development': '/career_Sr._Manager_Sales_&_Business_Development.html',
  'senior-it-manager': '/career_Sr_IT_Manager.html',
  'web-developer-intern': '/career_Web_Developer_Intern.html',
};
const formSources = new Map<string, { kind: 'product' | 'application'; source: string }>([
  ...Object.entries({ ...subscriptionSources, ...productSources }).map(([key, source]) =>
    [key, { kind: 'product', source }] as const),
  ...Object.entries(applicationSources).map(([key, source]) =>
    [key, { kind: 'application', source }] as const),
]);

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
  { field: 'companyType', headerName: 'Company Type' },
  { field: 'createdAt', headerName: 'Submitted At' }, { field: 'updatedAt', headerName: 'Updated At' },
  ...answerNames.map(field => ({ field, headerName: labels[field] || field })),
  { field: 'notificationStatus', headerName: 'Notification Status' },
  { field: 'hasResume', headerName: 'Has Resume' }, { field: 'resumeLink', headerName: 'Resume Link' },
].map(column => ({ ...column, sortable: column.field !== 'hasResume' })).concat(
  { field: 'sourceCompany', headerName: 'Source Company', sortable: false },
);
const sortable: Record<string, string> = Object.fromEntries([
  ['id', '_id'], ...['kind', 'source', 'status', 'companyType', 'createdAt', 'updatedAt'].map(key => [key, key]),
  ...answerNames.map(key => [key, key]), ['notificationStatus', 'notification.status'], ['resumeLink', 'resumeLink'], ['resumeFilename', 'resume.filename'],
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
    const form = formSources.get(kind);
    if (form) {
      filter.kind = form.kind;
      filter.$and = [{ source: form.source }];
    } else if (kind === 'book-your-subscription') {
      filter.kind = 'product';
      filter.$and = [{ source: { $in: Object.values(subscriptionSources) } }];
    } else if (['product', 'application', 'partnership'].includes(kind)) {
      filter.kind = kind;
    } else {
      throw new InvalidTableQuery('Invalid kind.');
    }
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
    filter.$or = ['name', 'email', 'mobile', 'pagename', 'category', 'companyType', 'job_position', 'location', 'message'].map(key => ({ [key]: { $regex: escaped, $options: 'i' } }));
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
  ...['_id', 'kind', 'source', 'status', 'companyType', 'createdAt', 'updatedAt', 'sourceCompany', 'notification.status', 'resume.filename', 'resumeLink'].map(key => [key, 1]),
  ...answerNames.map(key => [key, 1]),
]);
export function tableRow(doc: Document) {
  const scalar = (value: unknown) => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : null;
  const iso = (value: unknown) => value instanceof Date ? value.toISOString() : null;
  return {
    id: String(doc._id), kind: scalar(doc.kind), source: scalar(doc.source), status: scalar(doc.status),
    companyType: scalar(doc.companyType),
    createdAt: iso(doc.createdAt), updatedAt: iso(doc.updatedAt),
    ...Object.fromEntries(answerNames.map(key => [key, scalar(doc[key])])),
    notificationStatus: scalar(doc.notification?.status), hasResume: !!doc.resume,
    resumeLink: scalar(doc.resumeLink),
    sourceCompany: scalar(doc.sourceCompany),
  };
}
