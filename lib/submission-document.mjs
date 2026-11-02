import { isDeepStrictEqual } from 'node:util';
import { purposeForSource } from './form-collections.mjs';

// Explicit storage schemas: submitted answers cannot overwrite system metadata.
export const businessFieldNames = {
  inquiries: ['name', 'email', 'mobile', 'count', 'sdate', 'pagename', 'category'],
  jobApplications: ['name', 'email', 'dob', 'mobile', 'location', 'experience', 'linkedin', 'currentmonthlysalary', 'expectedsalary', 'canjoin', 'relocategoa', 'personality', 'skills', 'specialexperience', 'willing', 'message', 'job_position'],
  partnerships: ['name', 'email', 'mobile', 'message', 'pagename'],
};

export function businessFieldsFor(collectionName, fields) {
  const allowed = businessFieldNames[collectionName];
  if (!allowed || !fields || typeof fields !== 'object' || Array.isArray(fields)) throw new Error('Invalid submission fields.');
  for (const [key, value] of Object.entries(fields)) {
    if (!allowed.includes(key) || typeof value !== 'string') throw new Error('Unexpected business field; storage or migration stopped.');
  }
  return Object.fromEntries(allowed.filter(key => Object.hasOwn(fields, key)).map(key => [key, fields[key]]));
}

export function nestedSubmission(record) {
  const purpose = purposeForSource(record.source);
  if (!purpose) throw new Error('Unknown submission source; original record retained.');
  const answers = Object.hasOwn(record, 'fields') ? businessFieldsFor(purpose, record.fields) : {};
  const metadata = { ...record };
  for (const key of businessFieldNames[purpose]) {
    if (!Object.hasOwn(record, key)) continue;
    if (typeof record[key] !== 'string') throw new Error('Unexpected business field type; original record retained.');
    if (Object.hasOwn(answers, key) && !isDeepStrictEqual(answers[key], record[key])) throw new Error('Conflicting nested and top-level values; original record retained.');
    answers[key] = record[key];
    delete metadata[key];
  }
  return { ...metadata, fields: answers };
}
