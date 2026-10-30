import 'server-only';
import contracts from '@/content/form-contracts.json';
import { getInquiryConfig } from './server-config.mjs';

type Field = { name: string; type?: string; value?: string; required: boolean; min?: string; max?: string; options?: string[] };
const pages = contracts as Record<string, Field[][]>;
export class InvalidInquiry extends Error {}

export async function validateInquiry(data: FormData) {
  let source = String(data.get('source') || '');
  try { source = decodeURIComponent(source); } catch { throw new InvalidInquiry('Invalid source page.'); }
  const schema = pages[source]?.[0];
  if (!schema) throw new InvalidInquiry('Please submit this form from its original page.');
  const fields: Record<string, string> = {};
  let resume: { filename: string; contentType: string; size: number; bytes: Buffer } | undefined;
  const allowed = new Set(['source', ...schema.map(field => field.name)]);
  for (const key of data.keys()) {
    if (!allowed.has(key) || data.getAll(key).length !== 1) throw new InvalidInquiry('Invalid or duplicate form fields.');
  }
  for (const field of schema) {
    const raw = data.get(field.name);
    if (field.type === 'hidden') { fields[field.name] = field.value || ''; continue; }
    if (field.type === 'file') {
      if (!(raw instanceof File) || !raw.size) {
        if (field.required) throw new InvalidInquiry('Please upload your resume.');
        continue;
      }
      const { resumeMaxBytes } = getInquiryConfig();
      if (raw.size > resumeMaxBytes || !/\.(pdf|docx?)$/i.test(raw.name)) throw new InvalidInquiry(`Please upload a PDF or Word resume under ${resumeMaxBytes / 1_000_000} MB.`);
      const bytes = Buffer.from(await raw.arrayBuffer());
      const extension = raw.name.split('.').pop()?.toLowerCase();
      const matches = extension === 'pdf' ? bytes.subarray(0, 5).toString() === '%PDF-'
        : extension === 'doc' ? bytes.subarray(0, 8).equals(Buffer.from('d0cf11e0a1b11ae1', 'hex'))
          : bytes.subarray(0, 4).equals(Buffer.from('504b0304', 'hex'));
      if (!matches) throw new InvalidInquiry('The resume contents do not match its file format.');
      resume = { filename: raw.name.split(/[\\/]/).pop()!.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 200), size: raw.size,
        contentType: extension === 'pdf' ? 'application/pdf' : extension === 'doc' ? 'application/msword' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', bytes };
      continue;
    }
    if (raw !== null && typeof raw !== 'string') throw new InvalidInquiry('Invalid field value.');
    const value = (raw || '').trim();
    if (field.required && !value) throw new InvalidInquiry(`Please complete the ${field.name} field.`);
    if (value.length > (field.name === 'name' ? 200 : field.name === 'email' ? 254 : 10_000)) throw new InvalidInquiry('A field is too long.');
    if (value && field.options && !field.options.some(option => option.trim() === value)) throw new InvalidInquiry('Please select an available option.');
    if (value && field.type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) throw new InvalidInquiry('Please enter a valid date.');
    if (value && field.type === 'number' && (!Number.isFinite(Number(value)) || (field.min !== undefined && Number(value) < Number(field.min)) || (field.max !== undefined && Number(value) > Number(field.max)))) throw new InvalidInquiry('Please enter a valid number.');
    fields[field.name] = value;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email) || !/^[1-9]\d{9}$/.test(fields.mobile)) throw new InvalidInquiry('Please enter a valid email and a 10 digit mobile number.');
  return { source, fields, resume, kind: source.startsWith('/career_') ? 'application' : source === '/partner.html' ? 'partnership' : 'product' };
}
